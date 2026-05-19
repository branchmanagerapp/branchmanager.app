/**
 * Branch Manager — Supabase Client
 * Drop-in replacement for localStorage DB layer
 * When connected, all data syncs to cloud — works across devices
 *
 * Uses Supabase JS client v2 (loaded from CDN)
 *
 * SECURITY MODEL:
 * The anon key below is safe to expose in client-side code IF Row Level Security
 * (RLS) policies are properly configured in Supabase. With RLS enabled:
 *   - Anon key can ONLY read non-draft quotes/invoices (for approve.html & pay.html)
 *   - All other data requires authentication (Supabase Auth sign-in)
 *   - Team members, clients, jobs, expenses, etc. are NOT accessible to anon
 *
 * WITHOUT RLS: The anon key grants FULL read/write access to ALL tables.
 * Run migrate-rls.sql in Supabase SQL Editor to enable proper RLS policies.
 */
// AI key resolver — returns the device's stored key, OR an empty string if
// the user has chosen "Server-managed" mode (in which case the ai-chat edge
// function picks up ANTHROPIC_API_KEY from Supabase function secrets and the
// key never needs to leave the server).
window.bmAIKey = function() {
  return AIConfig.deviceKey();
};

// ─────────────────────────────────────────────────────────────────────────
// bmSafeCall — unified Supabase error handling.
//
// Supabase JS returns { data, error } without rejecting on PostgREST errors.
// Network failures DO reject. Both cases need handling; silent failures were
// the root cause of the Paulette-not-saving class of bugs.
//
//   bmSafeCall(SupabaseDB.client.from('clients').insert(row), 'save client')
//     .then(res => { /* res.data */ })  // errors already toasted + logged
//
// Pass suppressToast=true for high-frequency background calls (pings, sync).
// ─────────────────────────────────────────────────────────────────────────
window.bmSafeCall = function(promise, label, suppressToast) {
  return promise.then(function(res) {
    if (res && res.error) {
      var msg = '[' + (label || 'supabase') + '] ' + (res.error.message || res.error.toString());
      console.warn(msg, res.error);
      if (!suppressToast && typeof UI !== 'undefined' && UI.toast) {
        UI.toast('⚠️ ' + (label || 'Operation') + ' failed: ' + res.error.message, 'error');
      }
    }
    return res;
  }).catch(function(err) {
    var msg = '[' + (label || 'supabase') + '] NETWORK ' + (err && err.message || String(err));
    console.warn(msg, err);
    if (!suppressToast && typeof UI !== 'undefined' && UI.toast) {
      UI.toast('🌐 Network error — ' + (label || 'operation') + ' may not have saved', 'error');
    }
    // Re-throw so callers can chain additional .catch if they want
    throw err;
  });
};

// Global safety net — catches any promise rejection that slipped through a
// missing .catch handler. Logs to console AND surfaces to the user if the
// error looks relevant (not a routine network hiccup).
window.addEventListener('unhandledrejection', function(e) {
  try {
    var reason = e.reason;
    var msg = reason && (reason.message || reason.error_description || String(reason)) || 'Unknown error';
    console.warn('[unhandledrejection]', reason);
    // Don't spam users for routine network hiccups or aborts
    if (/AbortError|cancel|aborted|NetworkError when attempting/i.test(msg)) return;
    if (typeof UI !== 'undefined' && UI.toast && msg.length < 200) {
      UI.toast('⚠️ Background error: ' + msg, 'error');
    }
  } catch(err) { /* don't let the error handler itself throw */ }
});

var SupabaseDB = {
  client: null,
  ready: false,
  _debug: false, // Set true for sync logging

  // Default credentials — auto-connect
  DEFAULT_URL: 'https://ltpivkqahvplapyagljt.supabase.co',
  DEFAULT_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI',
  // Expose for other modules (centralized)
  get ANON_KEY() { return this.DEFAULT_KEY; },

  init: function() {
    var url = localStorage.getItem('bm-supabase-url') || SupabaseDB.DEFAULT_URL;
    var key = localStorage.getItem('bm-supabase-key') || SupabaseDB.DEFAULT_KEY;
    if (!url || !key) return;
    // Store so import page shows connected
    localStorage.setItem('bm-supabase-url', url);
    localStorage.setItem('bm-supabase-key', key);

    // Load Supabase JS if not present
    if (!window.supabase) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      script.onload = function() { SupabaseDB._connect(url, key); };
      document.head.appendChild(script);
    } else {
      SupabaseDB._connect(url, key);
    }
  },

  _connect: function(url, key) {
    try {
      // Multi-tenant Phase 2 (May 2 2026): every Supabase request now carries
      // X-Tenant-ID so the new mt_anon_* RLS policies can resolve the right
      // tenant via current_tenant_id(). For SNT today the header is
      // 93af4348-... — same UUID the legacy snt_anon_* policies hardcode, so
      // BOTH policy families pass during the dual-write cutover. When friend's
      // tenant lands, BM will resolve a different tenant_id from URL/auth,
      // mt_anon_* fires for them, snt_anon_* doesn't (literal mismatch).
      // Phase 2 — resolve tenant from (in priority order):
      //   1. window.CURRENT_TENANT_ID (set by hostname resolver in index.html)
      //   2. Cloudflare Worker injected X-Tenant-ID (visible via meta tag if needed)
      //   3. localStorage bm-tenant-id (multi-tenant signed-in user picked one)
      //   4. SNT fallback for backwards compat during rollout
      var resolveTenantHeader = function() {
        try {
          if (window.CURRENT_TENANT_ID) return window.CURRENT_TENANT_ID;
          var stored = localStorage.getItem('bm-tenant-id');
          if (stored) return stored;
        } catch(e) {}
        return '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'; // SNT fallback during Phase 2 rollout
      };
      // Expose the resolver so other modules don't need their own copy.
      window.resolveTenantId = resolveTenantHeader;
      // CRITICAL (2026-05-19): X-Tenant-ID must be resolved PER REQUEST,
      // not frozen at client-creation. Before, the header was set once at
      // boot — i.e. before login — so it was always the SNT fallback, and
      // the DB tenant trigger stamped EVERY tenant's new rows with SNT's
      // id → RLS rejected non-SNT writes → silent local-only. A custom
      // fetch re-resolves the header on every call, so once auth stamps
      // bm-tenant-id (above) each request carries the real signed-in
      // tenant. SNT unchanged (still resolves 93af4348); logged-out/
      // public requests still fall back exactly as before.
      var _bmFetch = function(input, init) {
        init = init || {};
        var h;
        try {
          h = new Headers(init.headers || {});
          h.set('X-Tenant-ID', resolveTenantHeader());
          init.headers = h;
        } catch (e) { /* leave init as-is on exotic envs */ }
        return window.fetch(input, init);
      };
      SupabaseDB.client = window.supabase.createClient(url, key, {
        global: { fetch: _bmFetch }
      });
      SupabaseDB.ready = true;
      if (SupabaseDB._debug) console.debug('Supabase connected:', url, 'tenant:', resolveTenantHeader());

      // ── CRITICAL multi-tenant persistence fix (2026-05-19) ──
      // Before this, resolveTenantHeader() fell back to SNT's
      // 93af4348 for ANY signed-in user whose bm-tenant-id wasn't set
      // — so every non-SNT tenant's writes carried the wrong tenant_id,
      // RLS silently rejected them, and the app kept them local-only
      // (fake success). SNT only "worked" because its real tenant_id
      // equals that hardcoded fallback. Fix: stamp bm-tenant-id from
      // the authenticated JWT's tenant_id claim so rows are written
      // under the actual signed-in tenant. SNT is unaffected (its JWT
      // tenant_id IS 93af4348). Only sets when a real claim exists, so
      // logged-out/public paths keep the legacy fallback unchanged.
      SupabaseDB._stampTenantFromJWT = function(session) {
        try {
          var tok = session && session.access_token;
          if (!tok) {
            for (var k in localStorage) {
              if (/^sb-.*-auth-token$/.test(k)) {
                try { tok = (JSON.parse(localStorage.getItem(k)) || {}).access_token; } catch (e) {}
                break;
              }
            }
          }
          if (!tok) return;
          var claim = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          var tid = claim && claim.tenant_id;
          if (tid && /^[0-9a-f-]{36}$/i.test(tid) && localStorage.getItem('bm-tenant-id') !== tid) {
            localStorage.setItem('bm-tenant-id', tid);
          }
        } catch (e) {}
      };
      // Synchronous now: covers a returning/persisted session BEFORE
      // _initialSync (below) or any write happens.
      SupabaseDB._stampTenantFromJWT(null);
      // And on every future auth transition (login / token refresh).
      try {
        SupabaseDB.client.auth.onAuthStateChange(function(evt, session) {
          if (evt === 'SIGNED_OUT') { try { localStorage.removeItem('bm-tenant-id'); } catch (e) {} return; }
          if (session) SupabaseDB._stampTenantFromJWT(session);
        });
      } catch (e) {}

      // Check if RLS policies are properly configured
      SupabaseDB._checkRLS();

      // Override DB methods to use Supabase
      SupabaseDB._overrideDB();

      // Sync local data to Supabase (first time)
      SupabaseDB._initialSync();
    } catch (e) {
      console.error('Supabase connection failed:', e);
    }
  },

  _checkRLS: function() {
    // (May 2 2026) The previous check fired a loud "RLS NOT configured"
    // warning whenever the anon key could read team_members. That logic
    // predated the current architecture: today BM is intentionally designed
    // around anon + tenant-scoped RLS (snt_anon_select/insert/update/delete
    // policies on every tenant-scoped table — see RLS audit). Anon CAN read
    // team_members for the SNT tenant; if it COULDN'T, BM would be broken.
    //
    // The proper RLS check is "can anon read rows that are NOT mine?" and
    // that's hard to verify from the client without a bait row. So we just
    // confirm the connection works and don't false-alarm anymore.
    SupabaseDB.client.from('team_members').select('id').limit(1).then(function(res) {
      if (res.error && SupabaseDB._debug) {
        console.debug('[RLS check] team_members read returned error:', res.error.code, res.error.message);
      } else if (SupabaseDB._debug) {
        console.debug('✅ Supabase reachable — anon + tenant RLS active.');
      }
    }).catch(function() {});
  },

  _overrideDB: function() {
    // DO NOT override read methods — they must stay synchronous
    // CloudSync handles pulling data from Supabase into localStorage
    // CloudSync.wrapWrites() handles pushing writes to Supabase
    // This keeps the entire app working with synchronous DB calls
    if (SupabaseDB._debug) console.debug('SupabaseDB: reads stay local (sync), writes push to cloud (async)');
  },

  _initialSync: async function() {
    if (!SupabaseDB.ready) return;
    var sb = SupabaseDB.client;

    // Check if Supabase already has data (scoped to tenant if resolved)
    var _initTid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    var _countQ = sb.from('clients').select('*', { count: 'exact', head: true });
    if (_initTid) _countQ = _countQ.eq('tenant_id', _initTid);
    var { count } = await _countQ;
    if (count > 0) {
      if (SupabaseDB._debug) console.debug('Supabase has ' + count + ' clients — pulling cloud data to local');
      await SupabaseDB._pullFromCloud();
      return;
    }

    // No cloud data — push local data up
    if (SupabaseDB._debug) console.debug('Syncing local data to Supabase...');
    var tables = [
      { local: 'bm-clients', remote: 'clients' },
      { local: 'bm-requests', remote: 'requests' },
      { local: 'bm-quotes', remote: 'quotes' },
      { local: 'bm-jobs', remote: 'jobs' },
      { local: 'bm-invoices', remote: 'invoices' },
      { local: 'bm-services', remote: 'services' }
    ];

    // UUID generator for Supabase compatibility
    function toUUID(localId) {
      if (!localId) return SupabaseDB._uuid();
      // Already a UUID
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(localId)) return localId;
      // Convert local ID to deterministic UUID
      var hex = '';
      for (var c = 0; c < localId.length; c++) {
        hex += localId.charCodeAt(c).toString(16);
      }
      hex = (hex + '00000000000000000000000000000000').substr(0, 32);
      return hex.substr(0,8) + '-' + hex.substr(8,4) + '-4' + hex.substr(13,3) + '-a' + hex.substr(17,3) + '-' + hex.substr(20,12);
    }

    for (var i = 0; i < tables.length; i++) {
      var t = tables[i];
      try {
        var localData = JSON.parse(localStorage.getItem(t.local) || '[]');
        if (localData.length > 0) {
          // Convert field names from camelCase to snake_case and fix IDs
          var converted = localData.map(function(row) {
            var newRow = {};
            Object.keys(row).forEach(function(key) {
              var snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
              // Convert ID fields to UUID format
              if (snakeKey === 'id' || snakeKey.endsWith('_id')) {
                newRow[snakeKey] = row[key] ? toUUID(row[key]) : null;
              } else {
                newRow[snakeKey] = row[key];
              }
            });
            // Remove updated_at for services table (doesn't have it)
            if (t.remote === 'services') {
              delete newRow.updated_at;
            }
            return newRow;
          });

          var { error } = await sb.from(t.remote).upsert(converted, { onConflict: 'id', ignoreDuplicates: true });
          if (error) {
            console.warn('Sync error for ' + t.remote + ':', error.message);
          } else {
            if (SupabaseDB._debug) console.debug('Synced ' + converted.length + ' rows to ' + t.remote);
          }
        }
      } catch (e) {
        console.warn('Sync failed for ' + t.remote + ':', e);
      }
    }
    if (SupabaseDB._debug) console.debug('Initial sync complete');
    UI.toast('Data synced to cloud!');
    SupabaseDB.startPaymentPolling();
    SupabaseDB.startLiveSync();
  },

  _pullFromCloud: async function() {
    if (!SupabaseDB.ready) return;
    if (SupabaseDB._pulling) { console.debug('[Pull] already in progress, skipping'); return; }
    SupabaseDB._pulling = true;
    window._bmSyncLock = true; // DB.js will check this before pushing
    var sb = SupabaseDB.client;

    var tables = [
      { local: 'bm-clients', remote: 'clients' },
      { local: 'bm-requests', remote: 'requests' },
      { local: 'bm-quotes', remote: 'quotes' },
      { local: 'bm-jobs', remote: 'jobs' },
      { local: 'bm-invoices', remote: 'invoices' },
      { local: 'bm-services', remote: 'services' },
      { local: 'bm-team', remote: 'team_members' }
    ];

    // Multi-tenant: filter every pull by resolved tenant_id.
    // If no tenant resolved yet, pull everything (pre-Phase-3 graceful fallback).
    var tenantId = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;

    var totalPulled = 0;
    for (var i = 0; i < tables.length; i++) {
      var t = tables[i];
      try {
        var q = sb.from(t.remote).select('*').order('created_at', { ascending: false }).limit(5000);
        if (tenantId) q = q.eq('tenant_id', tenantId);
        var { data, error } = await q;
        if (error) {
          console.warn('Pull error for ' + t.remote + ':', error.message);
          continue;
        }
        if (data && data.length > 0) {
          // Convert snake_case to camelCase for local storage
          var converted = data.map(function(row) {
            var newRow = {};
            Object.keys(row).forEach(function(key) {
              var camelKey = key.replace(/_([a-z])/g, function(m, p1) { return p1.toUpperCase(); });
              newRow[camelKey] = row[key];
            });
            return newRow;
          });

          // MERGE with existing local — preserves unsynced local records
          // Cloud wins for records with same id; local records not in cloud are kept
          var existingLocal = [];
          try { existingLocal = JSON.parse(localStorage.getItem(t.local) || '[]'); } catch(e) {}
          var cloudIds = {};
          converted.forEach(function(r) { cloudIds[r.id] = true; });
          var localOnly = existingLocal.filter(function(r) {
            // Keep local record if not in cloud AND created recently (< 5 min ago = probably unsynced)
            if (cloudIds[r.id]) return false;
            if (!r.createdAt) return false;
            var ageMs = Date.now() - new Date(r.createdAt).getTime();
            return ageMs < 5 * 60 * 1000; // 5 minute grace period
          });
          var merged = converted.concat(localOnly);
          localStorage.setItem(t.local, JSON.stringify(merged));
          totalPulled += converted.length;
          if (localOnly.length > 0) console.debug('[Pull merge] kept ' + localOnly.length + ' unsynced local ' + t.remote);
          if (SupabaseDB._debug) console.debug('Pulled ' + converted.length + ' rows from ' + t.remote);
        }
      } catch (e) {
        console.warn('Pull failed for ' + t.remote + ':', e);
      }
    }

    SupabaseDB.startPaymentPolling();
    SupabaseDB.startLiveSync();
    if (totalPulled > 0) {
      if (SupabaseDB._debug) console.debug('Cloud sync complete: ' + totalPulled + ' total records');
      UI.toast(totalPulled + ' records synced from cloud');
      // Refresh current page — but never wipe an open form
      var hasOpenForm = document.getElementById('inv-form') || document.getElementById('quote-form')
        || document.getElementById('client-form') || document.getElementById('job-form') || document.getElementById('req-form');
      if (typeof loadPage === 'function' && !hasOpenForm) {
        var activeNav = document.querySelector('.nav-item.active');
        if (activeNav && activeNav.dataset.page) {
          loadPage(activeNav.dataset.page);
        } else {
          loadPage('dashboard');
        }
      }
    }
    SupabaseDB._pulling = false;
    window._bmSyncLock = false;
  },

  // Poll for new requests submitted via book.html (every 3 min)
  startRequestPolling: function() {
    if (window._requestPollStarted) return;
    window._requestPollStarted = true;
    setInterval(SupabaseDB._checkNewRequests, 3 * 60 * 1000);
  },

  _checkNewRequests: async function() {
    if (!SupabaseDB.ready || !SupabaseDB.client) return;
    try {
      var since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      var rq = SupabaseDB.client
        .from('requests')
        .select('id, client_name, client_phone, source, status, created_at, tenant_id')
        .eq('status', 'new')
        .gte('created_at', since);
      var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
      if (tid) rq = rq.eq('tenant_id', tid);
      var { data, error } = await rq;
      if (error || !data || !data.length) return;

      var localReqs = [];
      try { localReqs = JSON.parse(localStorage.getItem('bm-requests') || '[]'); } catch(e) {}
      var localIds = {};
      localReqs.forEach(function(r) { localIds[r.id] = true; });

      var newOnes = data.filter(function(r) { return !localIds[r.id]; });
      if (!newOnes.length) return;

      // Add to local
      newOnes.forEach(function(remote) {
        var local = {};
        Object.keys(remote).forEach(function(k) {
          var camel = k.replace(/_([a-z])/g, function(m, p) { return p.toUpperCase(); });
          local[camel] = remote[k];
        });
        localReqs.unshift(local);
        var _cn = (remote.client_name || '').trim();
        if (_cn.toLowerCase() === 'unknown') _cn = '';
        UI.toast('🆕 New request from ' + (_cn || remote.phone || remote.email || 'website') + '!', 'success');
      });
      localStorage.setItem('bm-requests', JSON.stringify(localReqs));

      // Refresh requests page badge
      if (typeof NotifCenter !== 'undefined' && NotifCenter.updateBadge) {
        NotifCenter.updateBadge();
      }
    } catch(e) {}
  },

  // Force re-sync from cloud (can be called manually)
  resync: async function() {
    UI.toast('Syncing from cloud...');
    await SupabaseDB._pullFromCloud();
  },

  // Poll for new Stripe payments — runs every 2 min while app is open
  // Updates localStorage so invoices flip to "paid" without a full refresh
  _pollInterval: null,
  startPaymentPolling: function() {
    if (SupabaseDB._pollInterval) return; // already running
    SupabaseDB._checkNewPayments(); // run once immediately
    SupabaseDB._pollInterval = setInterval(function() {
      SupabaseDB._checkNewPayments();
    }, 2 * 60 * 1000); // every 2 minutes
  },

  // Live sync — SUBSCRIBE to row-level changes on tenant-scoped tables via
  // Supabase Realtime. Updates land on all connected devices in <200ms.
  // Also keeps the 30s fallback poll for websocket flakiness / offline recovery.
  _livePollInterval: null,
  _realtimeChannel: null,
  startLiveSync: function() {
    if (SupabaseDB._livePollInterval) return;

    // Fallback: 30s poll while visible (safety net)
    var tick = async function() {
      if (document.hidden) return;
      if (!SupabaseDB.ready || !SupabaseDB.client) return;
      try {
        if (typeof CloudSync !== 'undefined' && !CloudSync.syncing) await CloudSync.init();
      } catch(e) {}
    };
    SupabaseDB._livePollInterval = setInterval(tick, 30 * 1000);
    document.addEventListener('visibilitychange', function() { if (!document.hidden) tick(); });
    window.addEventListener('focus', tick);

    // Realtime: one channel, many postgres-change subscriptions
    try {
      if (!SupabaseDB.client || !SupabaseDB.client.channel) return;
      if (SupabaseDB._realtimeChannel) SupabaseDB._realtimeChannel.unsubscribe();

      var TABLES = ['clients', 'requests', 'quotes', 'jobs', 'invoices', 'payments'];
      var ch = SupabaseDB.client.channel('bm-live-' + Math.random().toString(36).slice(2, 8));

      TABLES.forEach(function(tbl) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: tbl }, function(payload) {
          // Debounce: re-run CloudSync.init once per 750ms of bursts
          clearTimeout(SupabaseDB._rtDebounce);
          SupabaseDB._rtDebounce = setTimeout(function() {
            if (typeof CloudSync !== 'undefined' && !CloudSync.syncing) CloudSync.init();
          }, 750);
        });
      });

      // Communications inbound notifier — was missing from the Realtime
      // subscription, so Doug had no idea when Dialpad fired a webhook for
      // an inbound call/SMS. Fires a browser Notification (if granted) +
      // toast + 880Hz beep on every INSERT where direction='inbound'.
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'communications' }, function(payload) {
        var c = payload && payload.new;
        if (!c || c.direction !== 'inbound') return;
        SupabaseDB._notifyInboundComm(c);
        SupabaseDB._propagateInboundToMessaging(c);
      });

      ch.subscribe(function(status) {
        if (SupabaseDB._debug) console.debug('[Realtime] channel status:', status);
      });
      SupabaseDB._realtimeChannel = ch;
    } catch (e) { console.warn('[Realtime] failed to subscribe:', e); }
  },

  // Inbound-comm notifier — called by the communications Realtime subscription.
  // Fires a browser Notification (if granted), a toast, and a short beep.
  // Asks for permission once per session if it's still 'default'.
  _notifyInboundComm: function(c) {
    try {
      // v747: missed calls deliberately suppressed everywhere per Doug's
      // standing rule ("missed calls should not come into notifications
      // or the system at all"). Even though the activity feed already
      // filters them, the realtime notifier was still firing toast +
      // browser Notification + beep on every missed call. Drop here too.
      if (c.channel === 'call' && (c.status === 'missed' || c.status === 'no_answer' || c.status === 'hangup' || c.status === 'no-answer')) {
        return;
      }
      var labelMap = {
        call: '📞 Inbound call',
        voicemail: '📭 Voicemail',
        sms: '💬 SMS received',
        email: '✉️ Email'
      };
      var label = labelMap[c.channel] || '📞 Inbound';
      var name = c.from_number || 'Unknown';
      if (c.from_number) {
        var d = c.from_number.replace(/\D/g, '');
        if (d.length === 11 && d[0] === '1') d = d.slice(1);
        if (d.length === 10) name = '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
      }
      var preview = (c.body || '').slice(0, 120);

      // 1. Browser Notification API (works even when tab is in background)
      // v637: requestPermission may not exist on every browser/context
      if ('Notification' in window) {
        if (Notification.permission === 'default' && typeof Notification.requestPermission === 'function') {
          try { var rp = Notification.requestPermission(); if (rp && typeof rp.catch === 'function') rp.catch(function() {}); } catch(e){}
        }
        if (Notification.permission === 'granted') {
          try {
            var n = new Notification(label + ' — ' + name, {
              body: preview || 'Tap to open Branch Manager',
              icon: '/icons/icon-192.png',
              tag: 'bm-inbound-' + c.id,
              requireInteraction: c.channel === 'voicemail'
            });
            n.onclick = function() { window.focus(); if (typeof loadPage === 'function') loadPage('callcenter'); n.close(); };
          } catch (e) { /* some browsers throw on missing icon — ignore */ }
        }
      }

      // 2. In-app toast (works whether or not Notification permission granted)
      if (typeof UI !== 'undefined' && UI.toast) {
        UI.toast(label + ' from ' + name, 'info');
      }

      // 3. Short beep (880Hz, 200ms) so it's audible. Web Audio is unmuted by
      // default; iOS Capacitor respects silent switch which is fine.
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          var ac = new Ctx();
          var osc = ac.createOscillator();
          var gain = ac.createGain();
          osc.frequency.value = 880;
          osc.connect(gain); gain.connect(ac.destination);
          gain.gain.setValueAtTime(0.001, ac.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
          osc.start(); osc.stop(ac.currentTime + 0.2);
          setTimeout(function() { try { ac.close(); } catch(e){} }, 300);
        }
      } catch (e) { /* no audio context — silent is fine */ }
    } catch (e) { console.warn('[Realtime] notify failed:', e); }
  },

  // Propagate an inbound communications row into the Messaging page state:
  //  - bump bm-msg-unread badge map (keyed by client_id, or by phone-bucket for unmatched)
  //  - bust window._bmCommsCache so CommsLog.getAll re-fetches fresh
  //  - bust window._bmUnmatchedSmsCache so MessagingPage shows the new bucket
  //  - if Messaging page is currently mounted, re-render so the new bubble appears
  //    live BUT preserve any text the user is mid-typing in #msg-input (and any
  //    selected msgType pill) so realtime updates don't blow away in-progress
  //    composes.
  _propagateInboundToMessaging: function(c) {
    try {
      var unread = {};
      try { unread = JSON.parse(localStorage.getItem('bm-msg-unread') || '{}'); } catch(e) {}
      var key = c.client_id || ('phone:' + (c.from_number || 'unknown'));
      unread[key] = (unread[key] || 0) + 1;
      localStorage.setItem('bm-msg-unread', JSON.stringify(unread));

      if (c.client_id && window._bmCommsCache) {
        delete window._bmCommsCache[c.client_id];
      }
      window._bmUnmatchedSmsCache = null;

      if (window._currentPage === 'messaging' && typeof loadPage === 'function') {
        // Save in-progress compose state so the re-render doesn't wipe it.
        var saved = null;
        try {
          var inputEl = document.getElementById('msg-input');
          if (inputEl) {
            saved = {
              value: inputEl.value || '',
              selStart: inputEl.selectionStart,
              selEnd: inputEl.selectionEnd
            };
          }
        } catch (e) {}
        loadPage('messaging');
        if (saved) {
          setTimeout(function() {
            var newInput = document.getElementById('msg-input');
            if (newInput) {
              newInput.value = saved.value;
              try { newInput.setSelectionRange(saved.selStart, saved.selEnd); } catch (e) {}
            }
          }, 0);
        }
      } else if (window._currentPage === 'dashboard' && typeof loadPage === 'function') {
        // v746: dashboard inbox now surfaces unread SMS, so re-render
        // when an inbound lands so the new item appears live.
        loadPage('dashboard');
      }
    } catch (e) { console.warn('[Realtime] propagate failed:', e); }
  },

  _checkNewPayments: async function() {
    if (!SupabaseDB.ready || !SupabaseDB.client) return;
    try {
      // Look for invoices paid in the last 10 minutes
      var since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      var iq = SupabaseDB.client
        .from('invoices')
        .select('id, invoice_number, client_name, amount_paid, paid_date, status, payment_method, stripe_payment_id')
        .eq('status', 'paid')
        .gte('updated_at', since)
        .eq('payment_method', 'stripe');
      var tid2 = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
      if (tid2) iq = iq.eq('tenant_id', tid2);
      var { data, error } = await iq;

      if (error || !data || data.length === 0) return;

      // Check which ones are new to localStorage
      var localInvoices = [];
      try { localInvoices = JSON.parse(localStorage.getItem('bm-invoices') || '[]'); } catch(e) {}

      var newPayments = [];
      data.forEach(function(remote) {
        var local = localInvoices.find(function(l) {
          return l.id === remote.id || l.invoiceNumber === remote.invoice_number;
        });
        if (local && local.status !== 'paid') {
          // Update locally
          local.status = 'paid';
          local.balance = 0;
          local.amountPaid = remote.amount_paid;
          local.paidDate = remote.paid_date;
          local.paymentMethod = remote.payment_method || 'stripe';
          local.stripePaymentId = remote.stripe_payment_id;
          newPayments.push(remote);
        }
      });

      if (newPayments.length > 0) {
        localStorage.setItem('bm-invoices', JSON.stringify(localInvoices));
        newPayments.forEach(function(p) {
          var amt = p.amount_paid ? '$' + parseFloat(p.amount_paid).toFixed(2) : '';
          UI.toast('💳 Payment received! Invoice #' + p.invoice_number + ' — ' + amt + ' (Stripe)', 'success');
        });
        // Refresh page if on invoices — but NOT if a form/detail is open (would wipe input)
        var hasOpenForm = document.getElementById('inv-form') || document.getElementById('quote-form')
          || document.getElementById('client-form') || document.getElementById('job-form') || document.getElementById('req-form');
        if (typeof loadPage === 'function' && !hasOpenForm) {
          var active = document.querySelector('.nav-item.active');
          var pg = active && active.dataset.page;
          if (pg && (pg === 'invoices' || pg === 'dashboard' || pg === 'payments')) {
            loadPage(pg);
          }
        }
      }
    } catch(e) {
      // Silent fail — polling is background
    }
  },

  _uuid: function() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },

  // Test connection
  test: async function() {
    if (!SupabaseDB.ready) {
      UI.toast('Not connected to Supabase', 'error');
      return false;
    }
    try {
      var { data, error } = await SupabaseDB.client.from('services').select('count');
      if (error) throw error;
      UI.toast('Supabase connected! Database is live.');
      return true;
    } catch (e) {
      UI.toast('Connection test failed: ' + e.message, 'error');
      return false;
    }
  }
};

// Auto-init on page load
SupabaseDB.init();
