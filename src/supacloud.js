/**
 * Branch Manager — Supabase Cloud Data Layer
 * Caches Supabase data locally for fast reads, syncs writes to cloud
 * This bridges the gap: app uses synchronous DB calls, cloud is async
 *
 * Strategy: On init, pull all data from Supabase into localStorage cache.
 * Reads come from cache (fast, synchronous). Writes go to both cache + cloud.
 */
var CloudSync = {
  tables: ['clients', 'requests', 'quotes', 'jobs', 'invoices', 'payments', 'services', 'expenses', 'time_entries'],
  syncing: false,
  lastSync: 0,

  init: async function() {
    if (!SupabaseDB || !SupabaseDB.ready) return;
    CloudSync.syncing = true;

    var sb = SupabaseDB.client;
    var totalRows = 0;
    // Multi-tenant: scope pulls to the resolved tenant if available.
    var tenantId = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    // Tables without tenant_id column — don't apply the filter
    // (payments DOES have tenant_id — removed from this list as of v228)
    var NO_TENANT = {};

    for (var i = 0; i < CloudSync.tables.length; i++) {
      var table = CloudSync.tables[i];
      var localKey = 'bm-' + table.replace(/_/g, '-');

      try {
        // Pull all rows from Supabase
        // Paginate: fetch up to 5000 rows in batches of 1000
        var allData = [];
        var page = 0;
        var hasMore = true;
        while (hasMore && page < 5) {
          var _q = sb.from(table).select('*').order('created_at', { ascending: false }).range(page * 1000, (page + 1) * 1000 - 1);
          if (tenantId && !NO_TENANT[table]) _q = _q.eq('tenant_id', tenantId);
          var { data: batch, error } = await _q;
          if (error) break;
          if (batch && batch.length > 0) { allData = allData.concat(batch); page++; }
          if (!batch || batch.length < 1000) hasMore = false;
        }
        var data = allData;
        if (error) {
          // Table doesn't exist in Supabase yet — remove from sync list silently
          if (error.message && error.message.includes('schema cache')) {
            CloudSync.tables = CloudSync.tables.filter(function(t) { return t !== table; });
          } else {
            console.warn('CloudSync: error fetching ' + table + ':', error.message);
          }
          continue;
        }

        if (data && data.length > 0) {
          // Convert snake_case to camelCase for app compatibility
          var converted = data.map(function(row) {
            var newRow = {};
            Object.keys(row).forEach(function(key) {
              var camelKey = key.replace(/_([a-z])/g, function(m, p1) { return p1.toUpperCase(); });
              newRow[camelKey] = row[key];
            });
            return newRow;
          });

          // v761: filter out tombstoned rows BEFORE overwriting local
          // cache. Without this, a freshly-deleted row resurrects on
          // every sync tick because the async DELETE hasn't propagated
          // yet. The tombstone TTL is 24h; success of the cloud delete
          // (in db.js _deleteFromCloud) clears it earlier.
          var tomb = (window._bmTombstones && window._bmTombstones.getForTable)
            ? window._bmTombstones.getForTable(table)
            : {};
          var beforeFilter = converted.length;
          converted = converted.filter(function(r) { return !tomb[r.id]; });
          if (beforeFilter !== converted.length && typeof SupabaseDB !== 'undefined' && SupabaseDB._debug) {
            console.debug('CloudSync: dropped ' + (beforeFilter - converted.length) + ' tombstoned ' + table + ' rows');
          }

          localStorage.setItem(localKey, JSON.stringify(converted));
          totalRows += converted.length;
          if (typeof SupabaseDB !== 'undefined' && SupabaseDB._debug) console.debug('CloudSync: loaded ' + converted.length + ' ' + table);
        }
      } catch (e) {
        console.warn('CloudSync: failed ' + table + ':', e);
      }
    }

    CloudSync.syncing = false;
    CloudSync.lastSync = Date.now();
    if (typeof SupabaseDB !== 'undefined' && SupabaseDB._debug) console.debug('CloudSync: done — ' + totalRows + ' total rows cached');

    // Probe auth state — surface the loud "Cloud signed out" badge if the
    // Supabase session has lapsed. Repeats every 60s so a mid-session expiry
    // is caught before the next silent write rejection.
    CloudSync._checkAuthHealth();
    if (!CloudSync._authHealthInterval) {
      CloudSync._authHealthInterval = setInterval(function() { CloudSync._checkAuthHealth(); }, 60 * 1000);
    }

    // Don't blow away an open form/detail when sync ticks. Only redirect on
    // INITIAL boot (when window._currentPage isn't set yet).
    var hasOpenForm = document.getElementById('inv-form')
      || document.getElementById('quote-form')
      || document.getElementById('client-form')
      || document.getElementById('job-form')
      || document.getElementById('req-form');
    if (totalRows > 0 && typeof loadPage === 'function' && !window._currentPage && !hasOpenForm) {
      loadPage('dashboard');
    }
  },

  // Override DB write methods to also push to Supabase
  wrapWrites: function() {
    if (!SupabaseDB || !SupabaseDB.ready) return;
    var sb = SupabaseDB.client;

    CloudSync.tables.forEach(function(table) {
      var localKey = 'bm-' + table.replace(/_/g, '-');
      var dbSection = table === 'time_entries' ? DB.timeEntries : DB[table];
      if (!dbSection) return;

      var origCreate = dbSection.create;
      var origUpdate = dbSection.update;
      var origRemove = dbSection.remove;

      // Wrap create — pre-assign UUID so local + cloud IDs always match
      dbSection.create = function(record) {
        // Inject UUID before local create so both sides use the same ID
        if (!record.id || record.id.indexOf('-') === -1) {
          record.id = CloudSync._uuid();
        }
        var result = origCreate.call(dbSection, record);
        var cloudRecord = CloudSync._toSnake(result);
        // tenant_id already stamped by db.js create() — no double-check needed
        // ID is already a UUID — no need to overwrite
        // Upsert (not insert): db.js's _pushToCloud also writes via upsert, so a
        // plain insert here races and throws "duplicate key (clients_pkey)" when
        // _pushToCloud's upsert lands first. Same idempotent shape on both paths.
        sb.from(table).upsert(cloudRecord, { onConflict: 'id' }).then(function(res) {
          if (res.error) {
            console.warn('Cloud create error (' + table + '):', res.error.message, res.error.code);
            CloudSync._markUnsynced();
            if (CloudSync._isAuthError(res.error)) {
              CloudSync._markCloudSignedOut('Create rejected on ' + table + ' — Supabase session missing.');
              if (typeof UI !== 'undefined' && UI.toast) UI.toast('⚠ Cloud save blocked — sign in to sync (' + table + ')', 'error');
            } else if (typeof UI !== 'undefined' && UI.toast) {
              UI.toast('⚠ Cloud save failed (' + table + '): ' + res.error.message.slice(0, 80), 'error');
            }
          }
        }).catch(function(e) {
          CloudSync._markUnsynced();
          console.warn('Cloud create network error (' + table + '):', e);
        });
        return result;
      };

      // Wrap update — find record in local cache and update cloud by same ID
      if (origUpdate) {
        dbSection.update = function(id, changes) {
          var result = origUpdate.call(dbSection, id, changes);
          var cloudChanges = CloudSync._toSnake(changes);
          cloudChanges.updated_at = new Date().toISOString();
          var all = JSON.parse(localStorage.getItem(localKey) || '[]');
          var record = all.find(function(r) { return r.id === id; });
          if (record && record.id) {
            sb.from(table).update(cloudChanges).eq('id', record.id).then(function(res) {
              if (res.error) {
                console.warn('Cloud update error (' + table + '):', res.error.message);
                CloudSync._markUnsynced();
                if (CloudSync._isAuthError(res.error)) {
                  CloudSync._markCloudSignedOut('Update rejected on ' + table + ' — Supabase session missing.');
                  if (typeof UI !== 'undefined' && UI.toast) UI.toast('⚠ Cloud update blocked — sign in to sync (' + table + ')', 'error');
                } else if (typeof UI !== 'undefined' && UI.toast) {
                  UI.toast('⚠ Cloud update failed (' + table + '): ' + res.error.message.slice(0, 80), 'error');
                }
              }
            }).catch(function(e) {
              CloudSync._markUnsynced();
              console.warn('Cloud update network error (' + table + '):', e);
              if (typeof UI !== 'undefined' && UI.toast) UI.toast('🌐 ' + table + ' update may not have saved (offline)', 'error');
            });
          }
          return result;
        };
      }

      // Wrap remove — delete from cloud when deleted locally
      if (origRemove) {
        dbSection.remove = function(id) {
          var result = origRemove.call(dbSection, id);
          sb.from(table).delete().eq('id', id).then(function(res) {
            if (res.error) {
              console.warn('Cloud delete error (' + table + '):', res.error.message);
              CloudSync._markUnsynced();
              if (typeof UI !== 'undefined' && UI.toast) UI.toast('⚠ Cloud delete failed (' + table + '): ' + res.error.message.slice(0, 80), 'error');
            }
          }).catch(function(e) {
            CloudSync._markUnsynced();
            console.warn('Cloud delete network error (' + table + '):', e);
          });
          return result;
        };
      }
    });

    if (typeof SupabaseDB !== 'undefined' && SupabaseDB._debug) console.debug('CloudSync: write methods wrapped');
  },

  // v692: orange "unsynced" pulsing dot removed — it was constantly visible
  // (lit on any transient cloud error, never cleared) and added noise without
  // signal. Real cloud-signed-out failures still surface via _markCloudSignedOut
  // (loud red badge below). Functions kept as no-ops so existing callers don't break.
  _markUnsynced: function() {},
  _clearUnsynced: function() {
    var el = document.getElementById('sync-indicator');
    if (el) el.remove();
  },

  // Loud "you're signed out of the cloud" badge. Different from _markUnsynced
  // (which means "queued, will retry"). This means "writes are silently being
  // rejected by RLS — re-auth required." Background of the silent-#496 incident
  // on Apr 30 — quote was created locally but cloud kept returning 401 because
  // the Supabase auth session had lapsed and BM was running in local-auth-only
  // mode where every write hits the anon RLS wall.
  _markCloudSignedOut: function(reason) {
    var el = document.getElementById('cloud-auth-badge');
    if (!el) {
      var topbar = document.querySelector('.topbar-actions');
      if (!topbar) return;
      el = document.createElement('button');
      el.id = 'cloud-auth-badge';
      el.type = 'button';
      el.textContent = '🔴 Cloud signed out — Tap to refresh';
      el.title = reason || 'Writes are not reaching the cloud. Tap to try refreshing the session — only forces a sign-in if refresh fails.';
      el.style.cssText = 'background:#dc2626;color:#fff;border:none;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;margin-right:8px;animation:pulse 2s infinite;';
      el.onclick = function() {
        // Try refresh-token path first — most "signed out" cases recover here
        // without making Doug re-enter creds. Only falls through to full
        // logout/login if the refresh token is also expired.
        if (CloudSync._tryRefreshFromBadge) { CloudSync._tryRefreshFromBadge(); return; }
        if (typeof Auth !== 'undefined' && Auth.logout) {
          if (confirm('Sign out and re-sign in to restore cloud sync? Your local data is preserved.')) Auth.logout();
        } else {
          window.location.href = window.location.pathname + '?logout=1';
        }
      };
      topbar.insertBefore(el, topbar.firstChild);
    } else if (reason) {
      el.title = reason;
    }
  },

  _clearCloudSignedOut: function() {
    var el = document.getElementById('cloud-auth-badge');
    if (el) el.remove();
  },

  // Proactive auth-state probe. Runs on init + every 60s.
  //
  // Subtle but important: BM is designed to run on LOCAL AUTH + anon-key
  // cloud writes. The owner's auth.users entry was originally provisioned
  // by the customer-portal bulk-import (source=bm_client) which set a
  // random password — so signInWithPassword never succeeds with the real
  // BM password. That's expected. As long as RLS lets the anon key write
  // rows where tenant_id matches, cloud sync works fine WITHOUT a Supabase
  // session.
  //
  // Old behavior: any "no session" = loud red badge. False alarm for the
  // 99% of the time Doug is on the local-auth path.
  // New behavior: only refresh existing sessions (no badge if there was
  // never one). The real-rejection path in wrapWrites (which fires
  // _markCloudSignedOut on a 401/RLS error) still catches actual breakage.
  _checkAuthHealth: function() {
    if (!SupabaseDB || !SupabaseDB.client || !SupabaseDB.client.auth) return;
    SupabaseDB.client.auth.getSession().then(function(res) {
      var hasSession = !!(res && res.data && res.data.session);
      if (hasSession) { CloudSync._clearCloudSignedOut(); return; }
      // No active session. If we previously had one (refresh token in
      // localStorage), try to silently refresh. If we never had one (clean
      // local-auth path), do nothing — the badge is a false alarm in that
      // case and only the wrapWrites real-rejection handler should fire it.
      var hasRefreshable = false;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && /^sb-.*-auth-token$/.test(k)) { hasRefreshable = true; break; }
        }
      } catch(e) {}
      if (!hasRefreshable) { CloudSync._clearCloudSignedOut(); return; }
      return SupabaseDB.client.auth.refreshSession().then(function(r2) {
        var refreshed = !!(r2 && r2.data && r2.data.session);
        if (refreshed) {
          CloudSync._clearCloudSignedOut();
          if (typeof UI !== 'undefined' && UI.toast) UI.toast('🔄 Cloud session refreshed', 'success');
        }
        // Refresh failed — DON'T badge. Local-auth + anon RLS is fine.
      }).catch(function() { /* refresh attempt failed silently */ });
    }).catch(function() { /* offline — don't badge */ });
  },

  // One-tap retry from the badge: try refreshSession one more time. If still
  // no session, fall through to the full logout/login flow. Wired up by the
  // badge's onclick (see _markCloudSignedOut below).
  _tryRefreshFromBadge: function() {
    if (!SupabaseDB || !SupabaseDB.client || !SupabaseDB.client.auth) return false;
    if (typeof UI !== 'undefined' && UI.toast) UI.toast('Refreshing session…');
    return SupabaseDB.client.auth.refreshSession().then(function(r) {
      var refreshed = !!(r && r.data && r.data.session);
      if (refreshed) {
        CloudSync._clearCloudSignedOut();
        if (typeof UI !== 'undefined' && UI.toast) UI.toast('✅ Cloud session restored — no sign-in needed', 'success');
        return true;
      }
      // Refresh failed — fall back to logout flow
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('Refresh failed — full sign-in required', 'error');
      if (typeof Auth !== 'undefined' && Auth.logout) {
        if (confirm('Refresh-token also expired. Sign out and re-enter password? Local data is preserved.')) Auth.logout();
      }
      return false;
    }).catch(function(e) {
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('Refresh error: ' + (e && e.message || 'unknown'), 'error');
      return false;
    });
  },

  // Recognize an auth/RLS rejection from a Supabase error object. PostgREST
  // returns 401 for missing/expired JWT and code '42501' (insufficient
  // privilege) when an RLS policy blocks the row. Either way the user needs
  // to re-auth to make writes land.
  _isAuthError: function(err) {
    if (!err) return false;
    var msg = String(err.message || '').toLowerCase();
    var code = String(err.code || '');
    if (code === '42501' || code === 'PGRST301' || code === '401' || code === '403') return true;
    if (/jwt|row-level security|permission denied|not authorized|new row violates row-level/i.test(msg)) return true;
    return false;
  },

  // Convert camelCase object to snake_case
  _toSnake: function(obj) {
    var result = {};
    Object.keys(obj).forEach(function(key) {
      var snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      result[snakeKey] = obj[key];
    });
    return result;
  },

  _uuid: function() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },

  // Manual refresh
  refresh: async function() {
    UI.toast('Syncing with cloud...');
    await CloudSync.init();
    UI.toast('Data refreshed from cloud!');
  },

  // Cloud-Health diagnostic. Returns a structured snapshot covering:
  //  - Supabase auth session (present / expires / email)
  //  - Local Auth.user (BM session, may be Supabase- or local-fallback)
  //  - Per-table cloud read counts (head:true so we don't pull rows)
  //  - Pending cloud-push-queue depth
  // Rendered by SettingsPage._renderCloudHealth() in Settings → Advanced.
  diagnose: async function() {
    var snap = {
      checkedAt: new Date().toISOString(),
      supabaseReady: !!(typeof SupabaseDB !== 'undefined' && SupabaseDB.ready),
      bmUser: null, supabaseSession: null,
      tenantId: (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null,
      tableCounts: {}, queueDepth: 0, queueSample: [], errors: []
    };
    if (typeof Auth !== 'undefined' && Auth.user) {
      snap.bmUser = { email: Auth.user.email, role: Auth.role || Auth.user.role };
    }
    // Supabase session
    if (snap.supabaseReady && SupabaseDB.client && SupabaseDB.client.auth) {
      try {
        var s = await SupabaseDB.client.auth.getSession();
        if (s && s.data && s.data.session) {
          var sess = s.data.session;
          snap.supabaseSession = {
            email: sess.user && sess.user.email,
            userId: sess.user && sess.user.id,
            expiresAt: sess.expires_at ? new Date(sess.expires_at * 1000).toISOString() : null,
            expiresInMin: sess.expires_at ? Math.round((sess.expires_at * 1000 - Date.now()) / 60000) : null
          };
        }
      } catch(e) { snap.errors.push('auth.getSession: ' + e.message); }
    }
    // Per-table cloud read counts (head:true returns count without rows)
    var tables = ['clients','quotes','jobs','invoices','vehicles','communications','tasks','team_messages'];
    if (snap.supabaseReady && SupabaseDB.client) {
      var probes = tables.map(function(t) {
        return SupabaseDB.client.from(t).select('*', { count: 'exact', head: true }).then(function(r) {
          return { table: t, count: r.count, error: r.error && r.error.message };
        }).catch(function(e) { return { table: t, count: null, error: e.message }; });
      });
      var results = await Promise.all(probes);
      results.forEach(function(r) { snap.tableCounts[r.table] = { count: r.count, error: r.error }; });
    }
    // Queue depth (db.js _pushToCloud retry queue)
    try {
      var q = JSON.parse(localStorage.getItem('bm-cloud-push-queue') || '[]');
      snap.queueDepth = q.length;
      snap.queueSample = q.slice(0, 5).map(function(op) {
        return { table: op.table, id: op.id, method: op.method, status: op.lastStatus, queuedAt: op.queuedAt };
      });
    } catch(e) { snap.errors.push('queue read: ' + e.message); }
    return snap;
  }
};

// Auto-init after Supabase connects — retry until connected
(function waitForSupabase(attempts) {
  if (SupabaseDB && SupabaseDB.ready) {
    // Check if we need to sync (no local data or stale)
    var localClients = localStorage.getItem('bm-clients');
    var hasLocal = localClients && JSON.parse(localClients).length > 0;
    if (!hasLocal || (Date.now() - CloudSync.lastSync > 3600000)) {
      CloudSync.init().then(function() {
        CloudSync.wrapWrites();
        if (typeof Photos !== 'undefined' && Photos.syncFromCloud) Photos.syncFromCloud();
        if (typeof Photos !== 'undefined' && Photos.flushQueue) Photos.flushQueue();
      });
    } else {
      CloudSync.wrapWrites();
      if (typeof Photos !== 'undefined' && Photos.syncFromCloud) Photos.syncFromCloud();
      if (typeof Photos !== 'undefined' && Photos.flushQueue) Photos.flushQueue();
      if (typeof SupabaseDB !== 'undefined' && SupabaseDB._debug) console.debug('CloudSync: using cached data (' + JSON.parse(localClients).length + ' clients)');
    }
  } else if (attempts > 0) {
    setTimeout(function() { waitForSupabase(attempts - 1); }, 1000);
  }
})(15); // Try for 15 seconds
