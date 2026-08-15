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
  // Audit fix (Jun 2026): track whether the most recent localStorage write
  // actually committed. _set() swallows QuotaExceededError (the in-memory parse
  // cache still updates, so getById() can't detect the loss) — callers that
  // want to confirm a save persisted check DB._lastWriteOk() right after.
  var _lastSetOk = true;

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
      _lastSetOk = true;
    } catch(e) {
      _lastSetOk = false;
      // v979: localStorage quota exceeded. The biggest, most disposable consumers
      // are the base64 photo caches (bm-photos-*) — they re-sync from Supabase, so
      // evict them to free space and retry the save once before giving up.
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        var freed = _freePhotoCache(key);
        if (freed > 0) {
          try { localStorage.setItem(key, JSON.stringify(data)); _lastSetOk = true; return; } catch(e2) {}
        }
        // v1015: the local cache is full but the record still syncs to the cloud
        // (Supabase is the source of truth). This self-heals, so DON'T pop a scary
        // red toast at Doug mid-job — just log it for diagnostics. Real save failures
        // surface through the sync layer / Sentry, not this cosmetic cache pressure.
        console.warn('[BM] localStorage cache full for "' + key + '" — cleared photo cache; record still syncs to cloud.');
      }
    }
  }

  // v979: free space by dropping cached photo blobs (bm-photos-*), which are
  // re-fetchable from Supabase Storage/DB. Returns approx chars freed. Exposed
  // as window.BM_freePhotoStorage so photos.js can reuse it on its own writes.
  function _freePhotoCache(exceptKey) {
    var freed = 0;
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('bm-photos-') === 0 && k !== exceptKey) keys.push(k);
      }
      keys.forEach(function(k) {
        try { freed += (localStorage.getItem(k) || '').length; localStorage.removeItem(k); } catch(_e) {}
      });
    } catch(_e) {}
    return freed;
  }
  try { window.BM_freePhotoStorage = _freePhotoCache; } catch(_e) {}
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

  // CRITICAL (2026-05-19): the authoritative tenant for a signed-in user
  // is the `tenant_id` claim in their Supabase JWT (stamped by the
  // access-token hook). Reading it directly here — synchronously, from
  // the persisted session token — fixes the bug where non-SNT tenants'
  // writes were stamped with the wrong/no tenant_id and silently
  // RLS-rejected (records looked saved but never reached the DB). SNT
  // unaffected: its JWT tenant_id IS the legacy 93af4348.
  function _jwtTenantId() {
    try {
      var tok = null, k;
      for (k in localStorage) {
        if (/^sb-.*-auth-token$/.test(k)) {
          try { tok = (JSON.parse(localStorage.getItem(k)) || {}).access_token; } catch (e) {}
          break;
        }
      }
      if (!tok) return null;
      var p = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      var tid = p && p.tenant_id;
      return (tid && /^[0-9a-f-]{36}$/i.test(tid)) ? tid : null;
    } catch (e) { return null; }
  }

  function getTenantId() {
    // JWT claim wins — always current, authoritative, no stale cache.
    var jt = _jwtTenantId();
    if (jt) {
      if (_tenantIdCache !== jt) _setTenantId(jt);
      return jt;
    }
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
    // Authoritative + synchronous: the signed-in user's JWT tenant claim.
    var jt = _jwtTenantId();
    if (jt) { if (_tenantIdCache !== jt) _setTenantId(jt); return Promise.resolve(jt); }
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
        // White-label: no SNT email fallback — if there's genuinely no
        // email, the guard below skips rather than leaking peekskilltree.
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
  // v1126: keep the activity feed to the last 30 days (Doug, Aug 15 —
  // "anything over thirty days get rid of"). Runs once per boot.
  (function _pruneAudit() {
    try {
      var log = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
      var cutoff = Date.now() - 30 * 24 * 3600 * 1000;
      var kept = log.filter(function(e) { return e && e.ts && new Date(e.ts).getTime() > cutoff; });
      if (kept.length !== log.length) localStorage.setItem(AUDIT_KEY, JSON.stringify(kept));
    } catch (e) {}
  })();

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

  // v976: per-remote-table list of snake_case fields that exist in local records
  // but have NO column in the cloud table. The cloud push strips these so the
  // whole row isn't rejected ("Could not find the 'photo' column of 'quotes'").
  // Keyed by REMOTE table name. These stay in localStorage; just not synced.
  var _CLOUD_LOCAL_ONLY = {
    'quotes': ['photo', 'salesperson', 'lead_source']
  };

  // v1047: SYSTEMIC fix for the recurring "Could not find the 'X' column of
  // '<table>'" whole-row rejection. CloudSync captures each table's real
  // snake_case column set (window._bmCloudCols[table]) from the data it already
  // pulls. Before ANY push we drop keys that have no column, so an unknown field
  // can never reject the save again — on any table, learned automatically. This
  // supersedes the hand-maintained _CLOUD_LOCAL_ONLY list above (kept as a
  // fallback for the window before the first sync populates the column set).
  // Returns the array of stripped keys so the caller can log them (never silent).
  function _stripUnknownCols(table, obj) {
    var stripped = [];
    try {
      var cols = (typeof window !== 'undefined' && window._bmCloudCols && window._bmCloudCols[table]);
      if (!cols || !cols.length) return stripped; // no schema learned yet → don't strip
      var allow = {};
      cols.forEach(function(c) { allow[c] = true; });
      Object.keys(obj).forEach(function(k) {
        if (!allow[k]) { delete obj[k]; stripped.push(k); }
      });
      if (stripped.length) console.debug('[DB push] stripped non-column field(s) from ' + table + ':', stripped.join(', '));
    } catch (e) {}
    return stripped;
  }

  // v1117: a KNOWN column can still 400 the whole row when it's typed
  // uuid/date/timestamp and the value is an empty string —
  // "invalid input syntax for type uuid: ''". _stripUnknownCols can't catch it
  // (the column exists). This coerces '' → null for id/date/timestamp-shaped
  // columns (all such columns are nullable; `id` never holds ''). Runs on every
  // push AND on queue replay, so a payload stuck 400-looping on an empty uuid
  // (e.g. a quote→job with no client_id) self-heals instead of re-firing the
  // "Save did NOT reach the cloud" banner forever.
  function _coerceEmptyTyped(obj) {
    try {
      Object.keys(obj).forEach(function(k) {
        if (obj[k] === '' && /(_id|_at|_date)$/.test(k)) obj[k] = null;
      });
    } catch (e) {}
  }

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
    // v692: orange "pending sync" dot removed alongside supacloud.js sync-indicator.
    // Queue still drains in the background; user no longer sees the perpetual pulse.
    // Stale element from a prior load is cleaned up here so old PWA sessions clear too.
    try {
      var existing = document.getElementById('sync-indicator');
      if (existing) existing.remove();
    } catch(e) {}
  }

  // v984: a 4xx cloud rejection means the save did NOT land and retrying the
  // same payload will keep failing (stale-app schema mismatch, bad payload).
  // That must NEVER be silent — Jul 7 2026 Tanisha #515 incident: Doug priced
  // a quote 3× on a phone running a pre-v976 cached build; every save 400'd
  // ("Could not find the 'lead_source' column") into the write-queue while the
  // UI toasted "saved". Loud toast + persistent red banner, once per session.
  // 401/403 excluded (CloudSync's "cloud signed out" badge already owns those);
  // 5xx/network excluded (transient — the queue retry genuinely fixes them).
  function _loudPushFail(table, status) {
    try {
      if (status === 401 || status === 403) return;
      if (!(status >= 400 && status < 500)) return;
      var msg = '⚠️ Save did NOT reach the cloud (' + table + ', error ' + status + '). Fully close and reopen the app. If this repeats, delete the home-screen icon and re-add it from branchmanager.app.';
      try { window.BMBeacon && window.BMBeacon('save-reject', msg, table, status); } catch (e) {}
      if (typeof UI !== 'undefined' && UI.toast) UI.toast(msg);
      if (!document.getElementById('bm-pushfail-banner')) {
        var b = document.createElement('div');
        b.id = 'bm-pushfail-banner';
        b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#c62828;color:#fff;font:600 13px -apple-system,system-ui,sans-serif;padding:10px 40px 10px 14px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.35);';
        b.textContent = msg;
        var x = document.createElement('span');
        x.textContent = '✕';
        x.style.cssText = 'position:absolute;right:12px;top:9px;cursor:pointer;font-weight:800;font-size:15px;';
        x.onclick = function() { b.remove(); };
        b.appendChild(x);
        (document.body || document.documentElement).appendChild(b);
      }
    } catch (e) {}
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
      // If a full cloud pull is in progress, defer the push so it can't be overwritten.
      // v1125: BOUNDED — after ~10s assume the lock is stuck, force through + beacon.
      window.__bmPushLockTries = window.__bmPushLockTries || {};
      var _plt = window.__bmPushLockTries[record.id] || 0;
      if (window._bmSyncLock && _plt < 20) {
        window.__bmPushLockTries[record.id] = _plt + 1;
        console.debug('[DB push] sync lock active, deferring', table, record.id);
        setTimeout(function() { _pushToCloud(key, record, method); }, 500);
        return;
      }
      if (_plt >= 20) {
        try { window.BMBeacon && window.BMBeacon('sync-lock-stuck', 'create forced through after 10s lock wait: ' + table, table, null); } catch (e) {}
      }
      delete window.__bmPushLockTries[record.id];
      var url = localStorage.getItem('bm-supabase-url') || 'https://ltpivkqahvplapyagljt.supabase.co';
      var apiKey = localStorage.getItem('bm-supabase-key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI';
      if (!url || !apiKey) return;

      // Convert camelCase to snake_case for Supabase
      var snakeRow = {};
      Object.keys(record).forEach(function(k) {
        var sk = k.replace(/([A-Z])/g, '_$1').toLowerCase();
        snakeRow[sk] = record[k];
      });
      // v976: drop top-level fields that exist locally but have NO column in the
      // cloud table — else Supabase rejects the WHOLE row ("Could not find the
      // 'photo' column of 'quotes'"). These persist in localStorage; they're just
      // not synced. (photo = legacy stray; salesperson/lead_source = v975 jobber
      // rail fields with no column. Title is mapped to the existing `subject` col.)
      (_CLOUD_LOCAL_ONLY[table] || []).forEach(function(f) { delete snakeRow[f]; });
      // v1047: dynamic schema-aware strip (supersedes the static list above).
      _stripUnknownCols(table, snakeRow);
      _coerceEmptyTyped(snakeRow);  // v1117: '' → null for uuid/date/timestamp cols

      // v891 (2026-05-31): use upsert ONLY on create. Full-row upsert on update
      // clobbers any field that the local cache is stale on (the Quote #513
      // "status keeps flipping back to sent" bug — agent flipped cloud to
      // draft, BM's stale local cache still had sent, autosave pushed the
      // whole row back including stale status). Updates go through
      // _pushUpdateToCloud which only sends the changed fields.
      // v1123: stale build = do NOT attempt the cloud write. A stale-schema
      // payload would just 400; queue it locally and surface the update banner.
      if (window.__bmWriteBlocked) {
        _queueAdd({ key: key, table: table, id: record.id, method: method, payload: snakeRow, queuedAt: Date.now(), lastStatus: -1 });
        try { window.bmShowStaleBanner(window.__bmWriteBlocked); } catch (e) {}
        return;
      }
      fetch(url + '/rest/v1/' + table + '?on_conflict=id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
          'Authorization': 'Bearer ' + (_writeAuthToken() || apiKey),
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
          _loudPushFail(table, r.status);  // v984: never let a rejected save be silent
          _queueAdd({ key: key, table: table, id: record.id, method: method, payload: snakeRow, queuedAt: Date.now(), lastStatus: r.status });
        }
      }).catch(function(e) {
        // Network failure — queue for retry on `online` event.
        console.warn('[DB cloud push net]', table, e && e.message);
        _queueAdd({ key: key, table: table, id: record.id, method: method, payload: snakeRow, queuedAt: Date.now(), lastStatus: 0 });
      });
    } catch(e) { console.warn('[DB cloud push] error', e); }
  }

  // v891 (2026-05-31): diff PATCH for updates so we never clobber cloud
  // fields the local cache happens to be stale on. Companion to _pushToCloud
  // which stays as full-row upsert for CREATE only. `changes` = the diff
  // the caller asked to apply (camelCase); we convert to snake_case and PATCH
  // just those keys, plus updated_at as a write-wins tiebreaker.
  // Precondition guard: if precheckUpdatedAt is supplied (the local row's
  // updated_at BEFORE this edit), we add ?updated_at=lte.<that> to the PATCH
  // so PostgREST refuses to overwrite a cloud row that has since changed.
  // 0 rows affected → re-pull and retry with the user's diff on top.
  // v1128: cloud writes must ride the AUTHED session token. The Jul 8 RLS
  // lockdown left jobs/invoices/etc. with authenticated-role-only policies, so
  // every anon-key PATCH since then matched ZERO rows: HTTP 200, empty body,
  // nothing saved, no error anywhere — the "drag a job, it reverts" ghost
  // (Doug, Aug 15). Anon stays as fallback for the pre-auth boot window.
  function _writeAuthToken() {
    try {
      var url = localStorage.getItem('bm-supabase-url') || 'https://ltpivkqahvplapyagljt.supabase.co';
      var ref = (url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
      if (!ref) return null;
      var raw = localStorage.getItem('sb-' + ref + '-auth-token');
      if (!raw) return null;
      var s = JSON.parse(raw);
      return s.access_token || (s.currentSession && s.currentSession.access_token) || null;
    } catch (e) { return null; }
  }

  function _pushUpdateToCloud(key, id, changes, precheckUpdatedAt, opts) {
    try {
      var table = REMOTE_TABLE[key];
      if (!table || !id) return;
      // v891.1: same fabricated-data guard as _pushToCloud, applied to updates.
      // _looksFabricated checks (name, phone) signatures — usually unaffected
      // by updates, but covers the edge case where a fabricated row gets
      // renamed/refoned via an update.
      if (_looksFabricated(table, changes || {})) {
        console.error('[DB patch BLOCKED] fabricated-data fingerprint in update changes — refusing to push', table, changes);
        return;
      }
      var _lockTries = (opts && opts._lockTries) || 0;
      if (window._bmSyncLock && _lockTries < 20) {
        // v1125: BOUNDED wait. If the lock is stuck (pull died pre-v1125, or
        // anything else jams it), force the write through after ~10s and say
        // so, instead of deferring in memory forever and losing the edit on
        // refresh.
        setTimeout(function() { _pushUpdateToCloud(key, id, changes, precheckUpdatedAt, Object.assign({}, opts, { _lockTries: _lockTries + 1 })); }, 500);
        return;
      }
      if (_lockTries >= 20) {
        try { window.BMBeacon && window.BMBeacon('sync-lock-stuck', 'write forced through after 10s lock wait: ' + table, table, null); } catch (e) {}
      }
      var url = localStorage.getItem('bm-supabase-url') || 'https://ltpivkqahvplapyagljt.supabase.co';
      var apiKey = localStorage.getItem('bm-supabase-key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI';
      if (!url || !apiKey) return;
      // v891.1: build snake-cased diff FIRST, then stamp our fresh updated_at
      // LAST so it always wins. Previously updated_at was set first and
      // a caller-supplied updatedAt would overwrite it (the "delete
      // snakeChanges.updated_at_" line was a typo no-op).
      var snakeChanges = {};
      Object.keys(changes || {}).forEach(function(k) {
        var sk = k.replace(/([A-Z])/g, '_$1').toLowerCase();
        snakeChanges[sk] = changes[k];
      });
      // v976: same non-column strip as _pushToCloud (see note there).
      (_CLOUD_LOCAL_ONLY[table] || []).forEach(function(f) { delete snakeChanges[f]; });
      // v1047: dynamic schema-aware strip (supersedes the static list above).
      _stripUnknownCols(table, snakeChanges);
      _coerceEmptyTyped(snakeChanges);  // v1117: '' → null for uuid/date/timestamp cols
      snakeChanges.updated_at = _now();  // always wins — fresh mtime guaranteed
      // Build URL with id filter; add updated_at precondition if supplied.
      var qs = 'id=eq.' + encodeURIComponent(id);
      // v1054: ONLY apply the updated_at precondition when the local mtime is a
      // real ISO timestamp. Legacy rows can carry updatedAt as an epoch number
      // or other non-timestamp value; `updated_at=lte.1720000000000` makes
      // PostgREST reject the whole PATCH with a 400 — which then fired the loud
      // "Save did NOT reach the cloud" banner (and re-fired every boot via the
      // markOverdue/fixStatuses sweeps). A malformed mtime = skip the clobber
      // guard for this one write (PATCH by id only) rather than lose the save.
      var _isoPre = precheckUpdatedAt && typeof precheckUpdatedAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(precheckUpdatedAt);
      if (_isoPre) {
        // PostgREST: updated_at must be <= the local row's pre-edit mtime.
        // If cloud has moved on (server-side PATCH between local read & this push),
        // affected rows = 0 and we re-pull.
        qs += '&updated_at=lte.' + encodeURIComponent(precheckUpdatedAt);
      }
      // v1123: stale-build write gate (see push gate above).
      if (window.__bmWriteBlocked) {
        _queueAdd({ key: key, table: table, id: id, method: 'update', payload: snakeChanges, queuedAt: Date.now(), lastStatus: -1 });
        try { window.bmShowStaleBanner(window.__bmWriteBlocked); } catch (e) {}
        return;
      }
      fetch(url + '/rest/v1/' + table + '?' + qs, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
          'Authorization': 'Bearer ' + (_writeAuthToken() || apiKey),
          'Prefer': 'return=representation,count=exact'
        },
        body: JSON.stringify(snakeChanges)
      }).then(function(r) {
        if (!r.ok) {
          r.text().then(function(t) {
            console.warn('[DB cloud patch]', table, r.status, t.slice(0, 200));
            if ((r.status === 401 || r.status === 403) && typeof CloudSync !== 'undefined' && CloudSync._markCloudSignedOut) {
              CloudSync._markCloudSignedOut('Cloud rejected ' + table + ' patch (' + r.status + ') — re-sign in to sync.');
            }
          }).catch(function(){});
          // v1054: background maintenance writes (markOverdue / fixStatuses run
          // on every boot) are NOT user saves. If one is rejected, log it but
          // NEVER show the panic banner or poison the retry queue — otherwise a
          // single stale row screams "your save failed, delete the app" at Doug
          // every time he opens it, when he never saved anything.
          if (opts && opts.silent) return;
          _loudPushFail(table, r.status);  // v984: never let a rejected save be silent
          _queueAdd({ key: key, table: table, id: id, method: 'update', payload: snakeChanges, queuedAt: Date.now(), lastStatus: r.status });
          return;
        }
        return r.json().then(function(rows) {
          // 0 affected = cloud has moved on past precheckUpdatedAt → re-pull
          // the row and re-apply this user's diff on top so we don't drop the
          // user's edit but also don't clobber the concurrent server-side edit.
          if (Array.isArray(rows) && rows.length === 0 && !precheckUpdatedAt) {
            // v1128: 0 rows matched with NO precondition = the write hit nothing
            // (RLS filtered it or the row is missing in cloud). This must never
            // be silent again — loud banner + beacon + queue for replay.
            try { window.BMBeacon && window.BMBeacon('zero-rows', 'PATCH matched 0 rows: ' + table + ' ' + id, table, 200); } catch (e) {}
            if (!(opts && opts.silent)) {
              _loudPushFail(table, 200);
              _queueAdd({ key: key, table: table, id: id, method: 'update', payload: snakeChanges, queuedAt: Date.now(), lastStatus: 200 });
            }
            return;
          }
          if (Array.isArray(rows) && rows.length === 0 && precheckUpdatedAt) {
            console.debug('[DB cloud patch] precondition failed for', table, id, '— re-pulling');
            _resyncRowFromCloud(key, id).then(function() {
              // v893: re-apply user's diff on top of the freshly-pulled cloud row so
              // local matches cloud after retry. Without this, local cache would show
              // pre-edit state for ~60s until the next CloudSync tick even though
              // cloud already reflects the user's edit.
              var all = _get(key);
              var idx2 = all.findIndex(function(r) { return r.id === id; });
              if (idx2 >= 0) {
                Object.assign(all[idx2], changes, { updatedAt: _now() });
                _set(key, all);
              }
              // Replay the diff WITHOUT precondition this time so it definitely lands.
              _pushUpdateToCloud(key, id, changes, null);
            });
          }
        }).catch(function(){});
      }).catch(function(e) {
        console.warn('[DB cloud patch net]', table, e && e.message);
        _queueAdd({ key: key, table: table, id: id, method: 'update', payload: snakeChanges, queuedAt: Date.now(), lastStatus: 0 });
      });
    } catch(e) { console.warn('[DB cloud patch] error', e); }
  }

  // Pull a single row from cloud and overwrite the matching local cache entry.
  // Used by _pushUpdateToCloud when the precondition fails (server-side change won).
  function _resyncRowFromCloud(key, id) {
    return new Promise(function(resolve) {
      try {
        var table = REMOTE_TABLE[key];
        if (!table) return resolve();
        var url = localStorage.getItem('bm-supabase-url') || 'https://ltpivkqahvplapyagljt.supabase.co';
        var apiKey = localStorage.getItem('bm-supabase-key');
        if (!url || !apiKey) return resolve();
        fetch(url + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id) + '&limit=1', {
          headers: { 'apikey': apiKey, 'Authorization': 'Bearer ' + (_writeAuthToken() || apiKey) }
        }).then(function(r) {
          if (!r.ok) return resolve();
          return r.json();
        }).then(function(rows) {
          if (!rows || !rows.length) return resolve();
          // Convert snake_case to camelCase for local storage
          var snake = rows[0];
          var camel = {};
          Object.keys(snake).forEach(function(k) {
            var ck = k.replace(/_([a-z])/g, function(_, c) { return c.toUpperCase(); });
            camel[ck] = snake[k];
          });
          // Preserve tenant_id alias used elsewhere
          if (snake.tenant_id) camel.tenant_id = snake.tenant_id;
          var all = _get(key);
          var idx = all.findIndex(function(r) { return r.id === id; });
          if (idx >= 0) all[idx] = camel; else all.unshift(camel);
          _set(key, all);
          console.debug('[DB] re-pulled fresh', table, id, 'from cloud');
          resolve();
        }).catch(function() { resolve(); });
      } catch(e) { resolve(); }
    });
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
      // v891.1: queued updates replay as PATCH-by-id (diff) so the offline
      // path matches the online path's behavior. Pre-v891.1 the replay did
      // full-row upsert which would re-introduce the stale-clobber bug for
      // anything edited while offline.
      var isUpdate = op.method === 'update';
      // v1049: self-heal stale queued payloads. A queued write minted before a
      // schema was known (or against an older schema) can carry a field with no
      // column and 400 FOREVER on replay (e.g. services.updated_at). Re-run the
      // schema-aware strip against the CURRENT known columns so the replay always
      // matches the live table instead of looping on a stale bad column.
      try { if (op.payload) { _stripUnknownCols(op.table, op.payload); _coerceEmptyTyped(op.payload); } } catch (e) {}  // v1117: also fix stuck empty-uuid payloads
      var url2 = isUpdate
        ? (url + '/rest/v1/' + op.table + '?id=eq.' + encodeURIComponent(op.id))
        : (url + '/rest/v1/' + op.table + '?on_conflict=id');
      return fetch(url2, {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
          'Authorization': 'Bearer ' + (_writeAuthToken() || apiKey),
          'Prefer': isUpdate ? 'return=minimal' : 'resolution=merge-duplicates,return=minimal'
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
  function update(key, id, changes, opts) {
    var all = _get(key);
    var idx = all.findIndex(function(r) { return r.id === id; });
    if (idx < 0) return null;
    // v891 (2026-05-31): capture local row's PRE-edit updatedAt so the diff
    // PATCH can use it as a precondition (?updated_at=lte.<that>) — if cloud
    // has moved on since we last pulled, we re-sync from cloud and retry the
    // diff on the fresh row instead of clobbering.
    var preUpdatedAt = all[idx].updatedAt || all[idx].updated_at || null;
    Object.assign(all[idx], changes, { updatedAt: _now() });
    // Backfill tenant_id on existing records that predate multi-tenancy
    if (!all[idx].tenant_id && !all[idx].tenantId) {
      var tid = getTenantId();
      if (tid) all[idx].tenant_id = tid;
    }
    _set(key, all);
    _audit('update', key, id, Object.keys(changes).join(','));
    // v891: was _pushToCloud(key, all[idx], 'update') — full-row upsert that
    // clobbered any field local was stale on (Quote #513 status bug). Now
    // sends just the diff via PATCH-by-id with updated_at precondition.
    // opts.force = a deliberate user action (e.g. drag-drop reschedule) that
    // must WIN over a concurrent/agent edit — skip the updated_at precondition
    // so the PATCH lands by id instead of 0-rowing when local mtime is stale
    // (the "drag a job, it snaps back" bug: agent-touched rows had newer cloud
    // mtime, so every reschedule failed the precondition and reverted).
    _pushUpdateToCloud(key, id, changes, (opts && opts.force) ? null : preUpdatedAt, opts);
    return all[idx];
  }
  // v761: Global tombstones — when you delete a row locally, we record
  // (table, id, deletedAt) here. Until the cloud delete confirms or 24h
  // elapses, any pull/sync path MUST drop matching rows from cloud
  // responses so the deleted row can't resurrect. Without this, the
  // pattern was:
  //   1. user deletes row → local row removed, async cloud DELETE fires
  //   2. user switches tabs (or focus → visibilitychange → realtime
  //      tick) → CloudSync.sync pulls cloud → cloud still has the row
  //      because our DELETE hasn't propagated → CloudSync overwrites
  //      localStorage with cloud → row is BACK.
  // Tasks had its own version of this fix; this is the table-agnostic
  // one for clients/jobs/quotes/invoices/etc.
  var TOMBSTONE_KEY_DB = 'bm-tombstones';
  var TOMBSTONE_TTL_MS = 24 * 3600 * 1000;
  function _getTombstones() {
    try {
      var raw = JSON.parse(localStorage.getItem(TOMBSTONE_KEY_DB) || '{}');
      var cutoff = Date.now() - TOMBSTONE_TTL_MS;
      var changed = false;
      Object.keys(raw).forEach(function(table) {
        var live = (raw[table] || []).filter(function(t) { return t && t.deletedAt > cutoff; });
        if (live.length !== (raw[table] || []).length) changed = true;
        if (live.length) raw[table] = live; else { delete raw[table]; changed = true; }
      });
      if (changed) localStorage.setItem(TOMBSTONE_KEY_DB, JSON.stringify(raw));
      return raw;
    } catch (e) { return {}; }
  }
  function _addTombstone(table, id) {
    if (!table || !id) return;
    var raw = _getTombstones();
    raw[table] = raw[table] || [];
    if (!raw[table].some(function(t) { return t.id === id; })) {
      raw[table].push({ id: id, deletedAt: Date.now() });
      try { localStorage.setItem(TOMBSTONE_KEY_DB, JSON.stringify(raw)); } catch(e) {}
    }
  }
  function _clearTombstone(table, id) {
    if (!table || !id) return;
    var raw = _getTombstones();
    if (!raw[table]) return;
    raw[table] = raw[table].filter(function(t) { return t.id !== id; });
    if (!raw[table].length) delete raw[table];
    try { localStorage.setItem(TOMBSTONE_KEY_DB, JSON.stringify(raw)); } catch(e) {}
  }
  function _isTombstoned(table, id) {
    var raw = _getTombstones();
    return (raw[table] || []).some(function(t) { return t.id === id; });
  }
  // Expose so CloudSync (different file) can filter pulls.
  window._bmTombstones = {
    isTombstoned: _isTombstoned,
    getForTable: function(table) {
      var raw = _getTombstones();
      var ids = {};
      (raw[table] || []).forEach(function(t) { ids[t.id] = true; });
      return ids;
    },
    add: _addTombstone,
    clear: _clearTombstone
  };

  function remove(key, id) {
    var item = _get(key).find(function(r) { return r.id === id; });
    _audit('delete', key, id, item ? (item.name || item.clientName || '') : '');
    var all = _get(key).filter(function(r) { return r.id !== id; });
    _set(key, all);
    var table = REMOTE_TABLE[key];
    if (table) _addTombstone(table, id); // record before async delete fires
    _deleteFromCloud(key, id);
  }

  function _deleteFromCloud(key, id) {
    try {
      var table = REMOTE_TABLE[key];
      if (!table || !id) return;
      // v1125: BOUNDED lock wait (deletes are tombstoned, so forcing through
      // after ~10s is safe — the tombstone keeps pulls from resurrecting).
      window.__bmDelLockTries = window.__bmDelLockTries || {};
      var _dlt = window.__bmDelLockTries[id] || 0;
      if (window._bmSyncLock && _dlt < 20) {
        window.__bmDelLockTries[id] = _dlt + 1;
        setTimeout(function() { _deleteFromCloud(key, id); }, 500);
        return;
      }
      if (_dlt >= 20) {
        try { window.BMBeacon && window.BMBeacon('sync-lock-stuck', 'delete forced through after 10s lock wait: ' + (REMOTE_TABLE[key] || key), REMOTE_TABLE[key] || key, null); } catch (e) {}
      }
      delete window.__bmDelLockTries[id];
      var url = localStorage.getItem('bm-supabase-url') || 'https://ltpivkqahvplapyagljt.supabase.co';
      var apiKey = localStorage.getItem('bm-supabase-key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI';
      if (!url || !apiKey) return;
      fetch(url + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: { 'apikey': apiKey, 'Authorization': 'Bearer ' + (_writeAuthToken() || apiKey) }
      }).then(function(r) {
        // Cloud confirms gone → tombstone can be dropped immediately.
        // Anything that's not 2xx (or 404 = already gone) keeps the
        // tombstone so future pulls keep filtering.
        if (r.ok || r.status === 404) _clearTombstone(table, id);
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
    update: function(id, data, opts) { return update(KEYS.clients, id, data, opts); },
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
    update: function(id, data, opts) { return update(KEYS.requests, id, data, opts); },
    remove: function(id) { remove(KEYS.requests, id); },
    search: function(q) { return search(KEYS.requests, q); },
    count: function(filterFn) { return count(KEYS.requests, filterFn); },
    countNew: function() { return count(KEYS.requests, function(r) { return r.status === 'new'; }); }
  };

  // ── Quotes ──
  // Audit fix (Jul 2026): quote numbers had the SAME stale-device collision the
  // jobs fix (below) closed — nextQuoteNum used max(LOCAL quoteNumber) only, so a
  // device behind the cloud minted a number already taken → the whole cloud save
  // was rejected (409 duplicate key on quotes_tenant_qnum_unique) and the user saw
  // "Cloud Save failed". Now also factor in the highest quote_number from the last
  // cloud pull (window._bmCloudMax.quotes, set by CloudSync).
  var nextQuoteNum = function() {
    var all = getAll(KEYS.quotes);
    var max = all.reduce(function(m, q) { return Math.max(m, q.quoteNumber || 0); }, 0);
    try {
      var cloudHint = (typeof window !== 'undefined' && window._bmCloudMax && window._bmCloudMax.quotes) || 0;
      if (cloudHint > max) max = cloudHint;
    } catch (e) {}
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
    update: function(id, data, opts) { return update(KEYS.quotes, id, data, opts); },
    remove: function(id) { remove(KEYS.quotes, id); },
    search: function(q) { return search(KEYS.quotes, q); },
    count: function(filterFn) { return count(KEYS.quotes, filterFn); }
  };

  // ── Jobs ──
  // Audit fix (Jun 2026): job numbers used to be max(LOCAL jobNumber)+1 only —
  // never reconciled against the cloud — so two devices/tabs that hadn't synced
  // each other minted the SAME number. UUIDs keep the rows distinct but the
  // job_number is the human ID on invoices/schedule/dispatch. We now also factor
  // in the highest job_number seen on the last cloud pull (window._bmCloudMax.jobs,
  // set by CloudSync). This closes the common online/multi-tab race. The full
  // offline two-device fix (atomic server-side numbering) is staged in
  // migrate-job-number-unique.sql — apply it WITH the two-device live test;
  // it needs the create path to await the next_job_number() RPC (see that file).
  var nextJobNum = function() {
    var all = getAll(KEYS.jobs);
    var max = all.reduce(function(m, j) { return Math.max(m, j.jobNumber || 0); }, 399);
    try {
      var cloudHint = (typeof window !== 'undefined' && window._bmCloudMax && window._bmCloudMax.jobs) || 0;
      if (cloudHint > max) max = cloudHint;
    } catch (e) {}
    return max + 1;
  };
  var jobs = {
    getAll: function() { return getAll(KEYS.jobs); },
    getById: function(id) { return getById(KEYS.jobs, id); },
    create: function(data) {
      data.status = data.status || 'scheduled';
      data.jobNumber = data.jobNumber || nextJobNum();
      _resolveClientId(data);
      var row = create(KEYS.jobs, data);
      // v715: a client with a job is by definition not a lead anymore.
      if (data.clientId) {
        var cl = getById(KEYS.clients, data.clientId);
        if (cl && cl.status === 'lead') update(KEYS.clients, data.clientId, { status: 'active' });
      }
      return row;
    },
    update: function(id, data, opts) { return update(KEYS.jobs, id, data, opts); },
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
          update(KEYS.jobs, j.id, { status: newStatus }, { silent: true }); // v1054: boot sweep = silent, no panic banner
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
    // Same cloud-aware fix as quotes/jobs: don't hand out an invoice_number a
    // synced device already used (409 duplicate → "Cloud Save failed").
    try {
      var cloudHint = (typeof window !== 'undefined' && window._bmCloudMax && window._bmCloudMax.invoices) || 0;
      if (cloudHint > max) max = cloudHint;
    } catch (e) {}
    return max + 1;
  };
  var invoices = {
    getAll: function() { return getAll(KEYS.invoices); },
    getById: function(id) { return getById(KEYS.invoices, id); },
    create: function(data) {
      data.status = data.status || 'draft';
      data.invoiceNumber = data.invoiceNumber || nextInvNum();
      _resolveClientId(data);
      var row = create(KEYS.invoices, data);
      // v715: a client with an invoice is no longer just a lead.
      if (data.clientId) {
        var cl = getById(KEYS.clients, data.clientId);
        if (cl && cl.status === 'lead') update(KEYS.clients, data.clientId, { status: 'active' });
      }
      return row;
    },
    update: function(id, data, opts) { return update(KEYS.invoices, id, data, opts); },
    remove: function(id) { remove(KEYS.invoices, id); },
    search: function(q) { return search(KEYS.invoices, q); },
    count: function(filterFn) { return count(KEYS.invoices, filterFn); },
    markOverdue: function() {
      var today = new Date().toISOString().split('T')[0];
      var all = _get(KEYS.invoices);
      var changed = 0;
      all.forEach(function(inv) {
        if (inv.status === 'past_due') {
          update(KEYS.invoices, inv.id, { status: 'overdue' }, { silent: true }); // v1054: boot sweep = silent, no panic banner
          changed++;
        } else if (inv.status !== 'paid' && inv.status !== 'cancelled' && inv.status !== 'overdue' && inv.status !== 'draft' && inv.dueDate && inv.dueDate.substring(0, 10) < today) {
          update(KEYS.invoices, inv.id, { status: 'overdue' }, { silent: true }); // v1054: boot sweep = silent, no panic banner
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
    update: function(id, data, opts) { return update(KEYS.services, id, data, opts); },
    remove: function(id) { remove(KEYS.services, id); },
    seed: function() {
      // v1056: HARD-GATE seeding. This one-shot starter catalog was re-running
      // on every empty-cache boot (fresh install / localStorage quota eviction)
      // and RACING CloudSync's pull — so it re-seeded the same 21 services into
      // the cloud again and again (that is why services grew to 21×3 = 63 dupes)
      // AND fired the red "Save did NOT reach the cloud (services, 400)" banner
      // whenever it ran logged-out or before a tenant resolved. Gates:
      //  (1) already have a local catalog → nothing to do
      //  (2) already seeded on this device → never re-seed
      //  (3) no resolved tenant (logged out / pre-auth) → the push 400s → banner
      //  (4) CloudSync hasn't pulled yet → an empty cache is NOT a new tenant
      // Only a signed-in tenant whose cloud pull returned ZERO services seeds.
      if (getAll(KEYS.services).length > 0) return;
      try { if (localStorage.getItem('bm-services-seeded') === '1') return; } catch (e) {}
      if (!getTenantId()) return;
      if (!(typeof CloudSync !== 'undefined' && CloudSync.lastSync > 0)) return;
      try { localStorage.setItem('bm-services-seeded', '1'); } catch (e) {}
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
    update: function(id, data, opts) { return update(KEYS.timeEntries, id, data, opts); },
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
    clockIn: function(userId, jobId, role) {
      return create(KEYS.timeEntries, { userId: userId, user: userId, jobId: jobId, role: (role === 'sales' ? 'sales' : 'labor'), date: new Date().toISOString().split('T')[0], clockIn: _now(), clockOut: null, hours: 0 });
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
    update: function(id, data, opts) { return update(KEYS.team || 'bm-team', id, data, opts); },
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
    // v893: expose cache invalidator so the realtime path in supabase.js can
    // bump our in-memory parse cache after writing directly to localStorage
    // (otherwise subsequent _get() reads would return the stale cached parse).
    // Audit fix (Jun 2026): true if the last localStorage write committed
    // (false after a swallowed QuotaExceededError). Callers toast success only
    // when this is true so a quota loss isn't reported as "saved ✓".
    _lastWriteOk: function() { return _lastSetOk; },
    _bumpCacheVer: function(key) {
      _cacheVer[key] = (_cacheVer[key] || 0) + 1;
      delete _parseCache[key];
    },
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

// ── v1088: server-authoritative record numbers ───────────────────────────────
// The atomic allocators (next_job_number / next_invoice_number / next_quote_number,
// see migrate-job-number-unique.sql) hand out per-tenant numbers that two devices
// can never both receive. alloc() resolves the number, or null when offline, not
// signed in, or slow (>2500ms) — callers then fall back to the local cloud-aware
// number and the DB unique index backstops the rare offline collision loudly.
window.BMNum = {
  alloc: function(kind) {
    return new Promise(function(resolve) {
      var done = false;
      var fin = function(v) { if (!done) { done = true; resolve(v); } };
      setTimeout(function() { fin(null); }, 2500);
      try {
        if (!navigator.onLine || typeof SupabaseDB === 'undefined' || !SupabaseDB.client || !SupabaseDB.ready) return fin(null);
        var tid = DB.getTenantId && DB.getTenantId();
        if (!tid) return fin(null);
        SupabaseDB.client.rpc('next_' + kind + '_number', { p_tenant: tid }).then(function(res) {
          fin(res && typeof res.data === 'number' ? res.data : null);
        }, function() { fin(null); });
      } catch (e) { fin(null); }
    });
  }
};
