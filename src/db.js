/**
 * Branch Manager — Data Layer
 * Uses localStorage now, swap to Supabase by replacing these functions.
 * All functions return arrays/objects. No UI logic here.
 */
var DB = (function() {
  var KEYS = {
    clients: 'bm-clients',
    requests: 'bm-requests',
    quotes: 'bm-quotes',
    jobs: 'bm-jobs',
    invoices: 'bm-invoices',
    services: 'bm-services',
    timeEntries: 'bm-time-entries',
    settings: 'bm-settings'
  };

  // In-memory parse cache: avoids repeated JSON.parse for the same data within a render cycle.
  // Cache is invalidated on every _set (write). CloudSync bulk-writes go through _set too after
  // v469 — if another path writes directly to localStorage, bump _cacheVer manually.
  var _parseCache = {};
  var _parseCacheVer = {};
  var _cacheVer = {};

  function _get(key) {
    var ver = _cacheVer[key] || 0;
    if (_parseCacheVer[key] === ver && _parseCache[key] !== undefined) return _parseCache[key];
    try {
      _parseCache[key] = JSON.parse(localStorage.getItem(key)) || [];
    } catch(e) {
      _parseCache[key] = [];
    }
    _parseCacheVer[key] = ver;
    return _parseCache[key];
  }
  function _set(key, data) {
    _cacheVer[key] = (_cacheVer[key] || 0) + 1;
    _parseCache[key] = data;        // update cache immediately so subsequent reads in same tick are free
    _parseCacheVer[key] = _cacheVer[key];
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch(e) {
      // localStorage quota exceeded — warn user
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.error('localStorage full! Data may not be saved for: ' + key);
        if (typeof UI !== 'undefined' && UI.toast) {
          UI.toast('Storage full — some data may not save. Clear old data in Settings.', 'error');
        }
      }
    }
  }
  function _id() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }
  function _now() { return new Date().toISOString(); }

  // ── Multi-tenant context ──
  // Caches the current user's tenant_id in memory + localStorage.
  // Two resolution strategies (tried in order):
  //   1. Supabase Auth session → user_tenants lookup
  //   2. Fallback: match by email (Auth.user.email or BM_CONFIG.email) against tenants.owner_email
  // If neither works, records created without tenant_id (graceful degrade).
  var _tenantIdCache = null;
  var _tenantResolving = null;

  function _tenantSupabaseUrl() {
    return localStorage.getItem('bm-supabase-url') || 'https://ltpivkqahvplapyagljt.supabase.co';
  }
  function _tenantSupabaseKey() {
    return localStorage.getItem('bm-supabase-key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI';
  }

  function getTenantId() {
    if (_tenantIdCache) return _tenantIdCache;
    try {
      var cached = localStorage.getItem('bm-tenant-id');
      if (cached) { _tenantIdCache = cached; return cached; }
    } catch(e) {}
    return null;
  }

  function _setTenantId(tid) {
    if (!tid) return;
    _tenantIdCache = tid;
    try { localStorage.setItem('bm-tenant-id', tid); } catch(e) {}
  }

  function resolveTenantId() {
    if (_tenantIdCache) return Promise.resolve(_tenantIdCache);
    if (_tenantResolving) return _tenantResolving;

    var url = _tenantSupabaseUrl();
    var key = _tenantSupabaseKey();
    if (!url || !key) return Promise.resolve(null);

    _tenantResolving = (async function() {
      // Strategy 1: Supabase Auth session + user_tenants
      try {
        if (typeof SupabaseDB !== 'undefined' && SupabaseDB.client && SupabaseDB.client.auth) {
          var sess = await SupabaseDB.client.auth.getSession();
          var uid = sess && sess.data && sess.data.session && sess.data.session.user && sess.data.session.user.id;
          var token = sess && sess.data && sess.data.session && sess.data.session.access_token;
          if (uid) {
            var headers = { 'apikey': key, 'Authorization': 'Bearer ' + (token || key) };
            var resp = await fetch(url + '/rest/v1/user_tenants?user_id=eq.' + encodeURIComponent(uid) + '&select=tenant_id&limit=1', { headers: headers });
            if (resp.ok) {
              var rows = await resp.json();
              if (rows && rows.length && rows[0].tenant_id) {
                _setTenantId(rows[0].tenant_id);
                return _tenantIdCache;
              }
            }
          }
        }
      } catch(e) { console.warn('[Tenant] Strategy 1 failed:', e); }

      // Strategy 2: match email → tenants.owner_email
      try {
        var email = '';
        if (typeof Auth !== 'undefined' && Auth.user && Auth.user.email) email = Auth.user.email;
        if (!email && typeof BM_CONFIG !== 'undefined' && BM_CONFIG.email) email = BM_CONFIG.email;
        if (!email) email = 'info@peekskilltree.com'; // last-resort seed fallback
        if (email) {
          var h2 = { 'apikey': key, 'Authorization': 'Bearer ' + key };
          var r2 = await fetch(url + '/rest/v1/tenants?owner_email=eq.' + encodeURIComponent(email) + '&select=id&limit=1', { headers: h2 });
          if (r2.ok) {
            var rs = await r2.json();
            if (rs && rs.length && rs[0].id) {
              _setTenantId(rs[0].id);
              return _tenantIdCache;
            }
          }
        }
      } catch(e) { console.warn('[Tenant] Strategy 2 failed:', e); }

      return null;
    })();

    _tenantResolving.then(function() { _tenantResolving = null; }, function() { _tenantResolving = null; });
    return _tenantResolving;
  }

  // ── Audit Log ──
  var AUDIT_KEY = 'bm-audit-log';
  var AUDIT_MAX = 500;
  function _audit(action, table, recordId, details) {
    try {
      var log = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
      log.unshift({
        ts: _now(),
        user: (typeof Auth !== 'undefined' && Auth.user) ? Auth.user.name || Auth.user.email : 'system',
        action: action,
        table: table.replace('bm-', ''),
        recordId: recordId,
        details: details || ''
      });
      if (log.length > AUDIT_MAX) log.length = AUDIT_MAX;
      localStorage.setItem(AUDIT_KEY, JSON.stringify(log));
    } catch(e) {}
  }

  // ── Generic CRUD ──
  function getAll(key) { return _get(key); }
  function getById(key, id) { return _get(key).find(function(r) { return r.id === id; }) || null; }
  // Map localStorage keys to Supabase table names
  var REMOTE_TABLE = {
    'bm-clients': 'clients',
    'bm-requests': 'requests',
    'bm-quotes': 'quotes',
    'bm-jobs': 'jobs',
    'bm-invoices': 'invoices',
    'bm-services': 'services',
    'bm-team': 'team_members',
    // Apr 30: expenses was previously local-only (silent loss across devices)
    'bm-expenses': 'expenses'
  };

  // Cross-device write reliability — was: fetch().catch(console.warn) which
  // never checked response.ok; an RLS rejection / 4xx / wrong tenant_id =
  // silent loss. Local localStorage shows the row; Supabase never gets it;
  // 5 min later the next pull DELETES the local row because it's "older
  // than 5 min and not in cloud." Audit-flagged "phantom write" risk.
  //
  // Fix: actually check response, and on non-2xx queue the row in
  // localStorage for replay. Replay runs on `online` event and every 60s.
  // Sync indicator dot turns yellow when queue is non-empty.
  var QUEUE_KEY = 'bm-write-queue';
  function _queueLoad() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch(e) { return []; }
  }
  function _queueSave(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch(e) {}
  }
  function _queueAdd(op) {
    var q = _queueLoad();
    // Dedupe: if the same op key+id is already queued, replace with newest payload
    var idx = q.findIndex(function(x) { return x.key === op.key && x.id === op.id && x.method === op.method; });
    if (idx >= 0) q[idx] = op; else q.push(op);
    if (q.length > 500) q = q.slice(-500); // hard cap so quota never blows
    _queueSave(q);
    _updateSyncBadge();
  }
  function _updateSyncBadge() {
    try {
      var q = _queueLoad();
      // Reuse the existing sync-indicator element managed by supacloud.js
      // (added/removed in topbar-actions). When queue is non-empty, ensure
      // it exists; when empty, remove it. Title shows pending count.
      var existing = document.getElementById('sync-indicator');
      if (q.length) {
        if (!existing) {
          var topbar = document.querySelector('.topbar-actions');
          if (topbar) {
            existing = document.createElement('span');
            existing.id = 'sync-indicator';
            existing.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#e07c24;display:inline-block;margin-right:4px;animation:pulse 2s infinite;';
            topbar.insertBefore(existing, topbar.firstChild);
          }
        } else {
          existing.style.background = '#e07c24';
        }
        if (existing) existing.title = q.length + ' save' + (q.length !== 1 ? 's' : '') + ' pending — will retry on reconnect';
      } else if (existing) {
        existing.remove();
      }
    } catch(e) {}
  }

  // ── Poison-pill guard — refuse to upload demo/fixture data to cloud ──
  // Last line of defense against the Apr 23 / Apr 30 / May 5 fabricate-data
  // incidents. If a row in clients/jobs/invoices/requests/quotes carries the
  // exact (name, phone) signature of a demo seed, REFUSE to push it. Logs
  // loud and locally so Doug sees the warning. Names from the disabled
  // seedDemo() function — the only thing that has ever generated these.
  var FABRICATED_NAME_PHONES = {
    'brian heermance|6462284455': true,
    'ken phillips|9145550102': true,
    'cynthia ferral|3477761419': true,
    'christina eckhart|4237401778': true,  // matches the real client too — block phantom IDs only (see below)
    'marlene colangelo|9145550199': true,
    'george grant|9145550177': true
  };
  // Real customer client_ids that ARE legit (allow-list — these have never been fabricated;
  // the corresponding seedDemo dupes had deterministic 6d6f70xx-xxxx ids instead).
  var REAL_CLIENT_ID_ALLOWLIST = {
    '3a8282c5-12a9-4a2f-b64d-b6030938dcfb': true   // Christina Eckhart (real, since 2025-10-30)
    // Add other ids here if more real overlaps emerge
  };
  function _looksFabricated(table, record) {
    if (table !== 'clients' && table !== 'jobs' && table !== 'invoices' && table !== 'requests' && table !== 'quotes') return false;
    var name = (record.name || record.clientName || '').trim().toLowerCase();
    var phone = String(record.phone || '').replace(/\D/g, '').slice(-10);
    if (!name || !phone) return false;
    var key = name + '|' + phone;
    if (!FABRICATED_NAME_PHONES[key]) return false;
    // Allow-list: real customers with these names whose ids are known-good
    if (table === 'clients' && REAL_CLIENT_ID_ALLOWLIST[record.id]) return false;
    if (record.clientId && REAL_CLIENT_ID_ALLOWLIST[record.clientId]) return false;
    return true;
  }

  function _pushToCloud(key, record, method) {
    try {
      var table = REMOTE_TABLE[key];
      if (!table) return;
      if (_looksFabricated(table, record)) {
        console.error('[DB push BLOCKED] fabricated-data fingerprint detected — refusing to upload', table, record);
        try {
          var blocked = JSON.parse(localStorage.getItem('bm-blocked-fabricated') || '[]');
          blocked.unshift({ at: new Date().toISOString(), table: table, record: record });
          localStorage.setItem('bm-blocked-fabricated', JSON.stringify(blocked.slice(0, 100)));
        } catch(e) {}
        return;
      }
      // If a full cloud pull is in progress, defer the push so it can't be overwritten
      if (window._bmSyncLock) {
        console.debug('[DB push] sync lock active, deferring', table, record.id);
        setTimeout(function() { _pushToCloud(key, record, method); }, 500);
        return;
      }
      var url = localStorage.getItem('bm-supabase-url') || 'https://ltpivkqahvplapyagljt.supabase.co';
      var apiKey = localStorage.getItem('bm-supabase-key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI';
      if (!url || !apiKey) return;

      // Convert camelCase to snake_case for Supabase
      var snakeRow = {};
      Object.keys(record).forEach(function(k) {
        var sk = k.replace(/([A-Z])/g, '_$1').toLowerCase();
        snakeRow[sk] = record[k];
      });

      // Use upsert to handle both insert and update
      fetch(url + '/rest/v1/' + table + '?on_conflict=id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
          'Authorization': 'Bearer ' + apiKey,
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(snakeRow)
      }).then(function(r) {
        if (!r.ok) {
          // Server rejected — queue for retry. 4xx will probably keep failing
          // (RLS / schema mismatch) but we want a paper trail and a chance
          // for Doug to notice. 5xx + network may resolve on its own.
          r.text().then(function(t) {
            console.warn('[DB cloud push]', table, r.status, t.slice(0, 200));
            // 401/403 = auth/RLS rejection. Surface the loud "cloud signed
            // out" badge so it's not silent (Apr 30 #496 incident).
            if ((r.status === 401 || r.status === 403) && typeof CloudSync !== 'undefined' && CloudSync._markCloudSignedOut) {
              CloudSync._markCloudSignedOut('Cloud rejected ' + table + ' write (' + r.status + ') — re-sign in to sync.');
            }
          }).catch(function(){});
          _queueAdd({ key: key, table: table, id: record.id, method: method, payload: snakeRow, queuedAt: Date.now(), lastStatus: r.status });
        }
      }).catch(function(e) {
        // Network failure — queue for retry on `online` event.
        console.warn('[DB cloud push net]', table, e && e.message);
        _queueAdd({ key: key, table: table, id: record.id, method: method, payload: snakeRow, queuedAt: Date.now(), lastStatus: 0 });
      });
    } catch(e) { console.warn('[DB cloud push] error', e); }
  }

  // Replay queued writes against Supabase. Successful writes are dropped
  // from the queue; persistent failures stay queued (capped at 500 entries).
  function _flushQueue() {
    var q = _queueLoad();
    if (!q.length) { _updateSyncBadge(); return; }
    var url = localStorage.getItem('bm-supabase-url') || 'https://ltpivkqahvplapyagljt.supabase.co';
    var apiKey = localStorage.getItem('bm-supabase-key');
    if (!url || !apiKey) return;
    // Process up to 20 per flush so we don't hammer the network.
    var batch = q.slice(0, 20);
    var rest  = q.slice(20);
    Promise.all(batch.map(function(op) {
      return fetch(url + '/rest/v1/' + op.table + '?on_conflict=id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
          'Authorization': 'Bearer ' + apiKey,
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(op.payload)
      }).then(function(r) { return { op: op, ok: r.ok, status: r.status }; })
        .catch(function() { return { op: op, ok: false, status: 0 }; });
    })).then(function(results) {
      var stillFailing = results.filter(function(x) { return !x.ok; }).map(function(x) { x.op.lastStatus = x.status; return x.op; });
      _queueSave(stillFailing.concat(rest));
      _updateSyncBadge();
      var recovered = results.filter(function(x) { return x.ok; }).length;
      if (recovered && typeof UI !== 'undefined' && UI.toast) {
        UI.toast('Recovered ' + recovered + ' pending save' + (recovered !== 1 ? 's' : ''), 'success');
      }
    });
  }
  // Replay on `online` event + every 60s
  if (typeof window !== 'undefined') {
    window.addEventListener('online', _flushQueue);
    setInterval(_flushQueue, 60 * 1000);
    setTimeout(_flushQueue, 5000);  // initial flush after app boot
  }

  function create(key, record) {
    var all = _get(key);
    record.id = record.id || _id();
    record.createdAt = record.createdAt || _now();
    record.updatedAt = _now();
    // Multi-tenant: stamp tenant_id if not already set (graceful degrade if no tenant)
    if (!record.tenant_id) {
      var tid = getTenantId();
      if (tid) record.tenant_id = tid;
    }
    all.unshift(record);
    _set(key, all);
    _audit('create', key, record.id, record.name || record.clientName || '');
    _pushToCloud(key, record, 'create');
    return record;
  }
  function update(key, id, changes) {
    var all = _get(key);
    var idx = all.findIndex(function(r) { return r.id === id; });
    if (idx < 0) return null;
    Object.assign(all[idx], changes, { updatedAt: _now() });
    // Backfill tenant_id on existing records that predate multi-tenancy
    if (!all[idx].tenant_id && !all[idx].tenantId) {
      var tid = getTenantId();
      if (tid) all[idx].tenant_id = tid;
    }
    _set(key, all);
    _audit('update', key, id, Object.keys(changes).join(','));
    _pushToCloud(key, all[idx], 'update');
    return all[idx];
  }
  function remove(key, id) {
    var item = _get(key).find(function(r) { return r.id === id; });
    _audit('delete', key, id, item ? (item.name || item.clientName || '') : '');
    var all = _get(key).filter(function(r) { return r.id !== id; });
    _set(key, all);
    _deleteFromCloud(key, id);
  }

  function _deleteFromCloud(key, id) {
    try {
      var table = REMOTE_TABLE[key];
      if (!table || !id) return;
      if (window._bmSyncLock) {
        setTimeout(function() { _deleteFromCloud(key, id); }, 500);
        return;
      }
      var url = localStorage.getItem('bm-supabase-url') || 'https://ltpivkqahvplapyagljt.supabase.co';
      var apiKey = localStorage.getItem('bm-supabase-key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI';
      if (!url || !apiKey) return;
      fetch(url + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: { 'apikey': apiKey, 'Authorization': 'Bearer ' + apiKey }
      }).catch(function(e) { console.warn('[DB cloud delete]', table, e); });
    } catch(e) { console.warn('[DB cloud delete] error', e); }
  }
  function count(key, filterFn) {
    var all = _get(key);
    return filterFn ? all.filter(filterFn).length : all.length;
  }
  function search(key, query) {
    var q = (query || '').toLowerCase();
    if (!q) return _get(key);
    return _get(key).filter(function(r) {
      return JSON.stringify(r).toLowerCase().indexOf(q) >= 0;
    });
  }

  // ── Clients ──
  var clients = {
    getAll: function() { return getAll(KEYS.clients); },
    getById: function(id) { return getById(KEYS.clients, id); },
    create: function(data) { data.status = data.status || 'lead'; return create(KEYS.clients, data); },
    update: function(id, data) { return update(KEYS.clients, id, data); },
    remove: function(id) { remove(KEYS.clients, id); },
    search: function(q) { return search(KEYS.clients, q); },
    count: function(filterFn) { return count(KEYS.clients, filterFn); },
    countActive: function() { return count(KEYS.clients, function(c) { return c.status === 'active'; }); },
    countLeads: function() { return count(KEYS.clients, function(c) { return c.status === 'lead'; }); }
  };

  // ── Requests ──
  var requests = {
    getAll: function() { return getAll(KEYS.requests); },
    getById: function(id) { return getById(KEYS.requests, id); },
    create: function(data) { data.status = data.status || 'new'; _resolveClientId(data); return create(KEYS.requests, data); },
    update: function(id, data) { return update(KEYS.requests, id, data); },
    remove: function(id) { remove(KEYS.requests, id); },
    search: function(q) { return search(KEYS.requests, q); },
    count: function(filterFn) { return count(KEYS.requests, filterFn); },
    countNew: function() { return count(KEYS.requests, function(r) { return r.status === 'new'; }); }
  };

  // ── Quotes ──
  var nextQuoteNum = function() {
    var all = getAll(KEYS.quotes);
    var max = all.reduce(function(m, q) { return Math.max(m, q.quoteNumber || 0); }, 0);
    return max + 1;
  };
  // Backfill clientId on a record that has clientName but no clientId —
  // case-insensitive match on the clients table. Prevents orphaned records.
  function _resolveClientId(data) {
    if (!data) return;
    if (data.clientId) return; // already linked
    if (!data.clientName) return; // nothing to match on
    var name = data.clientName.trim().toLowerCase();
    if (!name) return;
    try {
      var allClients = getAll(KEYS.clients);
      var match = allClients.find(function(c) {
        return c && c.name && c.name.trim().toLowerCase() === name;
      });
      if (match) {
        data.clientId = match.id;
        console.debug('[DB] Backfilled clientId', match.id, 'for', data.clientName);
      } else {
        console.warn('[DB] Orphan record — no client match for "' + data.clientName + '". Consider creating the client first.');
      }
    } catch(e) { /* non-fatal */ }
  }

  var quotes = {
    getAll: function() { return getAll(KEYS.quotes); },
    getById: function(id) { return getById(KEYS.quotes, id); },
    create: function(data) {
      data.status = data.status || 'draft';
      data.quoteNumber = data.quoteNumber || nextQuoteNum();
      _resolveClientId(data);
      return create(KEYS.quotes, data);
    },
    update: function(id, data) { return update(KEYS.quotes, id, data); },
    remove: function(id) { remove(KEYS.quotes, id); },
    search: function(q) { return search(KEYS.quotes, q); },
    count: function(filterFn) { return count(KEYS.quotes, filterFn); }
  };

  // ── Jobs ──
  var nextJobNum = function() {
    var all = getAll(KEYS.jobs);
    var max = all.reduce(function(m, j) { return Math.max(m, j.jobNumber || 0); }, 399);
    return max + 1;
  };
  var jobs = {
    getAll: function() { return getAll(KEYS.jobs); },
    getById: function(id) { return getById(KEYS.jobs, id); },
    create: function(data) {
      data.status = data.status || 'scheduled';
      data.jobNumber = data.jobNumber || nextJobNum();
      _resolveClientId(data);
      return create(KEYS.jobs, data);
    },
    update: function(id, data) { return update(KEYS.jobs, id, data); },
    remove: function(id) { remove(KEYS.jobs, id); },
    search: function(q) { return search(KEYS.jobs, q); },
    count: function(filterFn) { return count(KEYS.jobs, filterFn); },
    getUpcoming: function() {
      var today = new Date().toISOString().split('T')[0];
      return getAll(KEYS.jobs).filter(function(j) {
        return j.scheduledDate && j.scheduledDate.substring(0, 10) >= today && j.status !== 'completed';
      }).sort(function(a, b) { return (a.scheduledDate || '').localeCompare(b.scheduledDate || ''); });
    },
    getToday: function() {
      var today = new Date().toISOString().split('T')[0];
      return getAll(KEYS.jobs).filter(function(j) {
        return j.scheduledDate && j.scheduledDate.substring(0, 10) === today;
      });
    },
    fixStatuses: function() {
      var valid = ['scheduled', 'in_progress', 'completed', 'late', 'cancelled'];
      var all = _get(KEYS.jobs);
      var changed = 0;
      all.forEach(function(j) {
        if (valid.indexOf(j.status) === -1) {
          var newStatus;
          if (j.status === 'active') { newStatus = 'in_progress'; }
          else if (j.status === 'unscheduled' || j.status === 'pending') { newStatus = 'scheduled'; }
          else if (j.status === 'done' || j.status === 'invoiced') { newStatus = 'completed'; }
          else { newStatus = 'scheduled'; }
          jobs.update(j.id, { status: newStatus });
          changed++;
        }
      });
      return changed;
    }
  };

  // ── Invoices ──
  var nextInvNum = function() {
    var all = getAll(KEYS.invoices);
    var max = all.reduce(function(m, i) { return Math.max(m, i.invoiceNumber || 0); }, 399);
    return max + 1;
  };
  var invoices = {
    getAll: function() { return getAll(KEYS.invoices); },
    getById: function(id) { return getById(KEYS.invoices, id); },
    create: function(data) {
      data.status = data.status || 'draft';
      data.invoiceNumber = data.invoiceNumber || nextInvNum();
      _resolveClientId(data);
      return create(KEYS.invoices, data);
    },
    update: function(id, data) { return update(KEYS.invoices, id, data); },
    remove: function(id) { remove(KEYS.invoices, id); },
    search: function(q) { return search(KEYS.invoices, q); },
    count: function(filterFn) { return count(KEYS.invoices, filterFn); },
    markOverdue: function() {
      var today = new Date().toISOString().split('T')[0];
      var all = _get(KEYS.invoices);
      var changed = 0;
      all.forEach(function(inv) {
        if (inv.status === 'past_due') {
          invoices.update(inv.id, { status: 'overdue' });
          changed++;
        } else if (inv.status !== 'paid' && inv.status !== 'cancelled' && inv.status !== 'overdue' && inv.status !== 'draft' && inv.dueDate && inv.dueDate.substring(0, 10) < today) {
          invoices.update(inv.id, { status: 'overdue' });
          changed++;
        }
      });
      return changed;
    },
    totalReceivable: function() {
      return getAll(KEYS.invoices).reduce(function(sum, inv) {
        if (inv.status !== 'paid') return sum + (inv.balance || inv.total || 0);
        return sum;
      }, 0);
    },
    totalRevenue: function(year, month) {
      return getAll(KEYS.invoices).reduce(function(sum, inv) {
        if (inv.status !== 'paid') return sum;
        var d = new Date(inv.paidDate || inv.createdAt);
        if (year && d.getFullYear() !== year) return sum;
        if (month !== undefined && d.getMonth() !== month) return sum;
        return sum + (inv.total || 0);
      }, 0);
    }
  };

  // ── Services Catalog ──
  var services = {
    getAll: function() { return getAll(KEYS.services); },
    create: function(data) { return create(KEYS.services, data); },
    update: function(id, data) { return update(KEYS.services, id, data); },
    remove: function(id) { remove(KEYS.services, id); },
    seed: function() {
      if (getAll(KEYS.services).length > 0) return;
      var defaults = [
        { name: 'Tree Removal', description: 'Schedule an estimate for a tree removal', type: 'service' },
        { name: 'Tree Pruning', description: 'General pruning to remove dead, damaged or crossing branches', type: 'service' },
        { name: 'Stump Removal', description: 'Stump grinding service', type: 'service' },
        { name: 'Bucket Truck', description: 'Per hour rate with operator. 2 hour minimum.', type: 'service' },
        { name: 'Cabling', description: '', type: 'service' },
        { name: 'Land Clearing', description: '', type: 'service' },
        { name: 'Snow Removal', description: 'Snow removal services for residential or corporate locations', type: 'service' },
        { name: 'Spring Clean Up', description: 'Clean out leaves, shape ornamentals. Remove material off site.', type: 'service' },
        { name: 'Gutter Clean Out', description: '', type: 'service' },
        { name: 'Haul Debris', description: 'Haul debris from site', type: 'service' },
        { name: 'Ice Dam Removal', description: 'Clearing snow and ice from impacted roof area', type: 'service' },
        { name: 'Labor', description: 'Hourly labor charge', type: 'service' },
        { name: 'Free Estimate', description: 'Please fill out the information form so we have everything ready to go', type: 'service' },
        { name: 'Arborist Letter', description: 'Letter from certified arborist detailing how work was done', type: 'service' },
        { name: 'Cat Rescue', description: 'Cat rescue', type: 'service' },
        { name: 'Firewood Bundle', description: 'Firewood', type: 'product' },
        { name: 'Firewood Cord', description: 'Firewood cord delivered within 10 miles', type: 'product' },
        { name: 'Firewood Splitting', description: 'Split your logs to firewood on site', type: 'service' },
        { name: 'Firewood Stacking', description: 'Stacking of firewood to customers desired location', type: 'service' },
        { name: 'Free Woodchips', description: 'Free Woodchips $50 delivery fee', type: 'product' },
        { name: 'Chipping Brush', description: '', type: 'service' }
      ];
      defaults.forEach(function(s) { create(KEYS.services, s); });
    }
  };

  // ── Expenses ──
  var expenses = {
    getAll: function() { try { return JSON.parse(localStorage.getItem('bm-expenses')) || []; } catch(e) { return []; } },
    count: function() { return expenses.getAll().length; },
    create: function(r) {
      var all = expenses.getAll();
      r.id = r.id || _id();
      r.date = r.date || _now();
      all.unshift(r);
      localStorage.setItem('bm-expenses', JSON.stringify(all));
      return r;
    },
    update: function(id, changes) {
      var all = expenses.getAll();
      var idx = all.findIndex(function(r) { return r.id === id; });
      if (idx < 0) return null;
      Object.assign(all[idx], changes);
      localStorage.setItem('bm-expenses', JSON.stringify(all));
      return all[idx];
    },
    remove: function(id) {
      var all = expenses.getAll().filter(function(r) { return r.id !== id; });
      localStorage.setItem('bm-expenses', JSON.stringify(all));
    },
    getById: function(id) { return expenses.getAll().find(function(r) { return r.id === id; }) || null; }
  };

  // ── Payments (read-only — Stripe webhook + manual entry are sources of truth) ──
  var payments = {
    getAll: function() { try { return JSON.parse(localStorage.getItem('bm-payments')) || []; } catch(e) { return []; } },
    getById: function(id) { return payments.getAll().find(function(p) { return p.id === id; }) || null; },
    getByClient: function(clientId, clientName) {
      var nameKey = (clientName || '').trim().toLowerCase();
      return payments.getAll().filter(function(p) {
        if (clientId && p.clientId === clientId) return true;
        if (nameKey && (p.clientName || '').trim().toLowerCase() === nameKey) return true;
        return false;
      });
    },
    getByInvoice: function(invoiceId, invoiceNumber) {
      return payments.getAll().filter(function(p) {
        if (invoiceId && p.invoiceId === invoiceId) return true;
        if (invoiceNumber && p.invoiceNumber === invoiceNumber) return true;
        return false;
      });
    }
  };

  // ── Time Entries ──
  var timeEntries = {
    getAll: function() { return getAll(KEYS.timeEntries); },
    create: function(data) { return create(KEYS.timeEntries, data); },
    update: function(id, data) { return update(KEYS.timeEntries, id, data); },
    getByJob: function(jobId) { return getAll(KEYS.timeEntries).filter(function(t) { return t.jobId === jobId; }); },
    getByUser: function(userId, date) {
      return getAll(KEYS.timeEntries).filter(function(t) {
        // Support both 'userId' (DB clockIn) and 'user' (crewview clockOut) field names
        var entryUser = t.userId || t.user || '';
        if (entryUser !== userId) return false;
        if (date) {
          var entryDate = (t.date || t.clockIn || '').substring(0, 10);
          if (entryDate !== date) return false;
        }
        return true;
      });
    },
    clockIn: function(userId, jobId) {
      return create(KEYS.timeEntries, { userId: userId, user: userId, jobId: jobId, date: new Date().toISOString().split('T')[0], clockIn: _now(), clockOut: null, hours: 0 });
    },
    clockOut: function(entryId) {
      var entry = getById(KEYS.timeEntries, entryId);
      if (!entry) return null;
      var outTime = _now();
      var hours = (new Date(outTime) - new Date(entry.clockIn)) / 3600000;
      return update(KEYS.timeEntries, entryId, { clockOut: outTime, hours: Math.round(hours * 100) / 100 });
    }
  };

  // ── Dashboard Stats ──
  var dashboard = {
    getStats: function() {
      var today = new Date().toISOString().split('T')[0];
      var now = new Date();
      var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      var weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());

      return {
        todayJobs: jobs.getToday().length,
        receivables: invoices.totalReceivable(),
        weekRevenue: jobs.getUpcoming().reduce(function(s, j) { return s + (j.total || 0); }, 0),
        monthRevenue: invoices.totalRevenue(now.getFullYear(), now.getMonth()),
        totalClients: clients.count(),
        activeClients: clients.countActive(),
        leadClients: clients.countLeads(),
        newRequests: requests.countNew(),
        openQuotes: quotes.count(function(q) { return q.status === 'sent' || q.status === 'awaiting'; }),
        activeJobs: jobs.count(function(j) { return j.status !== 'completed' && j.status !== 'cancelled'; }),
        unpaidInvoices: invoices.count(function(i) { return i.status !== 'paid'; })
      };
    }
  };

  // ── Import from CSV ──
  function importCSV(key, csvText, mapFn) {
    var lines = csvText.split('\n');
    if (lines.length < 2) return 0;
    var headers = lines[0].split(',').map(function(h) { return h.trim().replace(/"/g, ''); });
    var imported = 0;
    for (var i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      // Simple CSV parse (handles quoted fields with commas)
      var vals = [];
      var inQuote = false, field = '';
      for (var c = 0; c < lines[i].length; c++) {
        var ch = lines[i][c];
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === ',' && !inQuote) { vals.push(field.trim()); field = ''; }
        else { field += ch; }
      }
      vals.push(field.trim());

      var row = {};
      headers.forEach(function(h, idx) { row[h] = vals[idx] || ''; });
      var record = mapFn ? mapFn(row) : row;
      if (record) { create(key, record); imported++; }
    }
    return imported;
  }

  // ── Seed demo data — DISABLED v593 (May 5 2026) ──
  //
  // PERMANENTLY OFF. This function used to spawn 6 demo clients (Brian
  // Heermance, Ken Phillips, Cynthia Ferral, Christina Eckhart, Marlene
  // Colangelo, George Grant) plus jobs/invoices/requests if localStorage
  // was empty. Side effect: every time the cache cleared (new browser,
  // signed out, iOS reinstall) it re-seeded LOCAL → CloudSync uploaded →
  // Supabase ended up with daily duplicates of real customers. Caused
  // 12 phantom client rows on 2026-05-03 / 2026-05-04 (Christina Eckhart's
  // page showed two phantom job #312 rows, etc.).
  //
  // Three of the names (Brian, Ken, Christina) are REAL Doug clients, so
  // duplicates polluted real customer data. This violates the
  // NEVER-fabricate-data rule (MEMORY.md). Demo seeding is gone for good.
  // If you want a sandbox, use a separate tenant/project.
  function seedDemo() {
    // HARD KILLED v594. Three fabricate-data incidents traced to this path.
    // Body deleted, no opt-in flag, no callsite. Throws if invoked.
    throw new Error('seedDemo is permanently disabled. See db.js comment + MEMORY.md NEVER-fabricate-data rule.');
  }
  // Run services.seed() ONCE at boot if services table is empty. These are
  // PRICING-TEMPLATE rows (Tree Removal, Pruning, etc.) — not customer data.
  // Safe to seed because they're fixed templates Doug uses in quotes; a cloud
  // wipe should regenerate them. If you ever want them gone, edit services.seed.
  try { services.seed(); } catch(e) {}

  // Team members — uses the generic create/update/remove so bm-team → Supabase team_members syncs automatically
  var team = {
    getAll: function() { return getAll(KEYS.team || 'bm-team'); },
    getById: function(id) { return getAll(KEYS.team || 'bm-team').find(function(m){ return m.id === id; }) || null; },
    create: function(data) { return create(KEYS.team || 'bm-team', data); },
    update: function(id, data) { return update(KEYS.team || 'bm-team', id, data); },
    remove: function(id) { remove(KEYS.team || 'bm-team', id); }
  };

  // One-shot cleanup: find records with clientName but no clientId and try to
  // backfill. Returns a summary so callers (Settings → Reconcile) can show it.
  function reconcileOrphans(persist) {
    var result = { backfilled: 0, stillOrphan: 0, orphans: [] };
    var allClients = getAll(KEYS.clients);
    var byName = {};
    allClients.forEach(function(c) {
      if (c && c.name) byName[c.name.trim().toLowerCase()] = c;
    });
    ['quotes', 'jobs', 'invoices', 'requests'].forEach(function(tbl) {
      var key = KEYS[tbl];
      if (!key) return;
      var rows = getAll(key);
      var dirty = false;
      rows.forEach(function(r) {
        if (r.clientId || !r.clientName) return;
        var match = byName[r.clientName.trim().toLowerCase()];
        if (match) {
          r.clientId = match.id;
          result.backfilled++;
          dirty = true;
        } else {
          result.stillOrphan++;
          result.orphans.push({ table: tbl, id: r.id, name: r.clientName, num: r.quoteNumber || r.jobNumber || r.invoiceNumber });
        }
      });
      if (dirty && persist) {
        try { localStorage.setItem(key, JSON.stringify(rows)); } catch(e) {}
      }
    });
    return result;
  }

  return {
    clients: clients,
    requests: requests,
    quotes: quotes,
    jobs: jobs,
    invoices: invoices,
    payments: payments,
    services: services,
    expenses: expenses,
    timeEntries: timeEntries,
    team: team,
    dashboard: dashboard,
    importCSV: importCSV,
    seedDemo: seedDemo,
    reconcileOrphans: reconcileOrphans,
    KEYS: KEYS,
    auditLog: {
      getRecent: function(n) { try { var log = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); return n ? log.slice(0, n) : log; } catch(e) { return []; } },
      clear: function() { localStorage.removeItem(AUDIT_KEY); },
      getAll: function() { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); }
    },
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    remove: remove,
    getTenantId: getTenantId,
    resolveTenantId: resolveTenantId
  };
})();

// Auto-seed REMOVED v594. seedDemo() now throws — never call it. Pricing-template
// services.seed() runs inside the IIFE above (one-shot, idempotent, not customer data).

// Kick off tenant resolution — idempotent, safe to call every page load.
// Runs async; writes cache to localStorage once resolved. Retries later if
// Supabase client isn't ready yet.
(function initTenant() {
  function attempt(retries) {
    DB.resolveTenantId().then(function(tid) {
      if (!tid && retries > 0) setTimeout(function(){ attempt(retries - 1); }, 1500);
    });
  }
  // Delay a tick so SupabaseDB.init has a chance to attach the client
  setTimeout(function(){ attempt(8); }, 500);
})();
