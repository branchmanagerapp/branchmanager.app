/**
 * Branch Manager — Supabase Health Watchdog (v800)
 *
 * Tiny status dot in the topbar reflecting Supabase connectivity at a glance:
 *
 *   🟢 green   — last ping <60s AND write queue empty
 *   🟡 amber   — write queue has 1+ items pending replay
 *   🔴 red     — no successful Supabase response in >5min OR ping failed twice
 *   ⚫ grey    — Supabase not configured / not ready / no creds
 *
 * Click the dot to see: last sync time, queue depth, last error (if any).
 *
 * Polls a cheap GET against /rest/v1/tenants?select=id&limit=1 every 30s
 * (only while the tab is visible — Page Visibility API gates the timer).
 * Read-only check — never writes anything.
 *
 * Auto-mounts into .topbar-icons next to the version badge on DOMContentLoaded.
 */
var SupaHealth = {
  _state: 'unknown',         // unknown | ok | queued | stale | down | disabled
  _lastOkMs: 0,
  _consecFails: 0,
  _lastError: '',
  _interval: null,
  _dotEl: null,

  _now: function() { return Date.now(); },

  init: function() {
    // Idempotent — bail if already mounted
    if (document.getElementById('bm-supa-health-dot')) return;

    // Find the version badge so we can sit next to it
    var versionBadge = document.getElementById('bmVersionBadge');
    var parent = versionBadge ? versionBadge.parentElement : null;
    if (!parent) return;

    var dot = document.createElement('span');
    dot.id = 'bm-supa-health-dot';
    dot.title = 'Supabase: checking…';
    dot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:#9ca3af;margin-left:8px;cursor:pointer;vertical-align:middle;flex-shrink:0;transition:background .25s;';
    dot.onclick = function() { SupaHealth._showStatus(); };
    parent.insertBefore(dot, versionBadge);
    SupaHealth._dotEl = dot;

    // Start the ping loop. Page Visibility API gates so we don't ping
    // when the tab is hidden (saves battery + quota).
    SupaHealth._tick(); // immediate first tick
    SupaHealth._interval = setInterval(function() {
      if (document.visibilityState === 'visible') SupaHealth._tick();
    }, 30000);

    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') SupaHealth._tick();
    });
  },

  _tick: function() {
    var url = localStorage.getItem('bm-supabase-url') || (window.SB_URL || 'https://ltpivkqahvplapyagljt.supabase.co');
    var key = localStorage.getItem('bm-supabase-key') || window.SB_KEY;
    if (!url || !key) {
      SupaHealth._setState('disabled');
      SupaHealth._lastError = 'No Supabase creds';
      return;
    }
    // Cheap health probe: HEAD /rest/v1/tenants?select=id&limit=1.
    // RLS may reject the body, but the response status will tell us if
    // the project is reachable + the anon key is valid.
    var t0 = SupaHealth._now();
    fetch(url + '/rest/v1/tenants?select=id&limit=1', {
      method: 'GET',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Range': '0-0' }
    })
    .then(function(resp) {
      if (resp.status >= 200 && resp.status < 500) {
        // 2xx, 3xx, 4xx all = "Supabase is reachable" (401/403 = RLS, still alive)
        SupaHealth._lastOkMs = SupaHealth._now();
        SupaHealth._consecFails = 0;
        SupaHealth._lastError = '';
        SupaHealth._evaluate();
      } else {
        throw new Error('HTTP ' + resp.status);
      }
    })
    .catch(function(err) {
      SupaHealth._consecFails++;
      SupaHealth._lastError = (err && err.message) || 'network error';
      SupaHealth._evaluate();
    });
  },

  _evaluate: function() {
    var queueLen = 0;
    try { queueLen = (JSON.parse(localStorage.getItem('bm-write-queue') || '[]')).length; } catch(e) {}
    var sinceOkMs = SupaHealth._lastOkMs ? (SupaHealth._now() - SupaHealth._lastOkMs) : Infinity;

    if (SupaHealth._consecFails >= 2 || sinceOkMs > 5 * 60 * 1000) {
      SupaHealth._setState('down');
    } else if (queueLen > 0) {
      SupaHealth._setState('queued');
    } else if (sinceOkMs < 60 * 1000) {
      SupaHealth._setState('ok');
    } else {
      SupaHealth._setState('stale');
    }
  },

  _setState: function(state) {
    SupaHealth._state = state;
    if (!SupaHealth._dotEl) return;
    var conf = SupaHealth._stateConf[state] || SupaHealth._stateConf.unknown;
    SupaHealth._dotEl.style.background = conf.color;
    SupaHealth._dotEl.title = conf.label;
    // Subtle pulse for queued/down
    if (state === 'queued' || state === 'down') {
      SupaHealth._dotEl.style.boxShadow = '0 0 0 3px ' + conf.color + '33';
    } else {
      SupaHealth._dotEl.style.boxShadow = 'none';
    }
  },

  _stateConf: {
    unknown:  { color: '#9ca3af', label: 'Supabase: checking…' },
    disabled: { color: '#9ca3af', label: 'Supabase: not configured' },
    ok:       { color: '#16a34a', label: 'Supabase: synced' },
    queued:   { color: '#ca8a04', label: 'Supabase: writes pending' },
    stale:    { color: '#d97706', label: 'Supabase: stale — no recent activity' },
    down:     { color: '#dc2626', label: 'Supabase: unreachable' }
  },

  _showStatus: function() {
    var queueLen = 0;
    try { queueLen = (JSON.parse(localStorage.getItem('bm-write-queue') || '[]')).length; } catch(e) {}
    var sinceOkLabel = SupaHealth._lastOkMs
      ? Math.round((SupaHealth._now() - SupaHealth._lastOkMs) / 1000) + 's ago'
      : 'never this session';
    var conf = SupaHealth._stateConf[SupaHealth._state] || SupaHealth._stateConf.unknown;

    var body = '<div style="font-size:13px;line-height:1.7;">'
      + '<div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;margin-bottom:12px;">'
      +   '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + conf.color + ';"></span>'
      +   conf.label
      + '</div>'
      + '<table style="width:100%;font-size:13px;">'
      +   '<tr><td style="color:var(--text-light);padding:4px 0;">Last successful read</td><td style="text-align:right;font-weight:600;">' + sinceOkLabel + '</td></tr>'
      +   '<tr><td style="color:var(--text-light);padding:4px 0;">Write queue depth</td><td style="text-align:right;font-weight:600;color:' + (queueLen > 0 ? '#ca8a04' : 'var(--text-light)') + ';">' + queueLen + (queueLen === 1 ? ' op' : ' ops') + '</td></tr>'
      +   '<tr><td style="color:var(--text-light);padding:4px 0;">Consecutive failures</td><td style="text-align:right;font-weight:600;color:' + (SupaHealth._consecFails > 0 ? '#dc2626' : 'var(--text-light)') + ';">' + SupaHealth._consecFails + '</td></tr>'
      + '</table>'
      + (SupaHealth._lastError ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 12px;margin-top:10px;font-size:12px;color:#991b1b;">⚠ ' + UI.esc(SupaHealth._lastError) + '</div>' : '')
      + '<div style="font-size:11px;color:var(--text-light);margin-top:14px;border-top:1px solid var(--border);padding-top:10px;">'
      +   'Health check runs every 30s while the tab is open. Writes that fail are queued and retried every 60s. If you see persistent red, check your network or the Supabase status page.'
      + '</div>'
      + '</div>';

    UI.showModal('Supabase health', body, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
        + ' <button class="btn btn-primary" onclick="SupaHealth._tick();UI.closeModal();UI.toast(\'Re-checking…\')">Re-check now</button>'
    });
  }
};

// Auto-init when topbar exists. Poll briefly because the bundle may load
// before the topbar HTML is parsed (defer order).
(function() {
  var tries = 0;
  function tryInit() {
    if (tries++ > 30) return;
    if (!document.getElementById('bmVersionBadge')) {
      return setTimeout(tryInit, 200);
    }
    SupaHealth.init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();
