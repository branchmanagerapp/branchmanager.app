/**
 * Branch Manager — Website Analytics Widget (shared)
 *
 * Single source of truth for the BM-beacon visitor stats UI. Used by:
 *   - DashboardPage (compact tile)
 *   - SocialBranch / Marketing dashboard (full widget)
 *
 * NEVER duplicate analytics rendering inside individual page modules.
 * Always call AnalyticsWidget.renderCompact() or .renderFull().
 *
 * Backed by the analytics-summary edge function which reads
 * analytics_events scoped to the current tenant.
 */
var AnalyticsWidget = (function() {
  var SUPA = 'https://ltpivkqahvplapyagljt.supabase.co';
  var _cache = {}; // keyed by `${tenant_id}|${days}`

  function _tenantId() {
    return (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : '';
  }

  function _esc(s) { return (typeof UI !== 'undefined' && UI.esc) ? UI.esc(s || '') : String(s || ''); }

  function _fetch(tenantId, days) {
    var key = tenantId + '|' + days;
    if (_cache[key] && (Date.now() - _cache[key].t) < 60000) {
      return Promise.resolve(_cache[key].data);
    }
    var url = SUPA + '/functions/v1/analytics-summary?tenant_id=' + encodeURIComponent(tenantId) + '&days=' + days;
    return fetch(url).then(function(r){ return r.json(); }).then(function(data) {
      _cache[key] = { t: Date.now(), data: data };
      return data;
    });
  }

  // ── Compact tile (Dashboard, SocialBranch dashboard top) ──────────
  // Renders into containerId with a click target opening the full widget.
  function renderCompact(opts) {
    opts = opts || {};
    var subId = opts.subId || 'aw-compact-sub';
    var miniId = opts.miniId || 'aw-compact-mini';
    var ctaText = opts.ctaText || 'Full chart →';
    var onClickFull = opts.onClickFull || "loadPage('socialbranch')";

    var html = '<div onclick="' + onClickFull + '" style="background:var(--white);border-radius:12px;padding:14px 16px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);cursor:pointer;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">'
      +   '<div><h3 style="font-size:16px;font-weight:700;margin:0;">🌐 Website Visitors</h3>'
      +     '<div id="' + subId + '" style="font-size:12px;color:var(--text-light);margin-top:2px;">Loading…</div>'
      +   '</div>'
      +   '<div id="' + miniId + '" style="display:flex;align-items:center;gap:14px;"></div>'
      +   '<span style="font-size:12px;color:var(--accent);font-weight:600;">' + _esc(ctaText) + '</span>'
      + '</div>'
      + '</div>';

    setTimeout(function() { _fillCompact(subId, miniId); }, 60);
    return html;
  }

  function _fillCompact(subId, miniId) {
    var sub = document.getElementById(subId);
    var mini = document.getElementById(miniId);
    if (!sub || !mini) return;
    var tid = _tenantId();
    if (!tid) { sub.textContent = 'No tenant resolved.'; return; }

    _fetch(tid, 30).then(function(data) {
      if (!data || !data.ok) { sub.textContent = 'Analytics not available'; return; }
      var sessions = data.totals.sessions;
      var pageviews = data.totals.pageviews;
      sub.textContent = sessions + ' visitor' + (sessions === 1 ? '' : 's') + ' · ' + pageviews + ' pageview' + (pageviews === 1 ? '' : 's') + ' · last 30 days';
      var daily = data.daily || [];
      if (daily.length) mini.innerHTML = _sparkline(daily, 120, 32, 1.5);
    }).catch(function() { sub.textContent = 'Analytics unavailable'; });
  }

  // ── Full widget (Marketing dashboard) ─────────────────────────────
  // Render shell + async-fill body. Caller controls range via opts.days
  // (and can persist by listening to AnalyticsWidget.setRange callbacks).
  function renderFull(opts) {
    opts = opts || {};
    var bodyId = opts.bodyId || 'aw-full-body';
    var range = opts.days || parseInt(localStorage.getItem('bm-analytics-days') || '30', 10);
    var rangeBtn = function(d) {
      var active = range === d;
      return '<button onclick="AnalyticsWidget.setRange(' + d + ', \'' + bodyId + '\')" '
        + 'style="padding:6px 10px;border:1px solid ' + (active ? '#2563eb' : 'var(--border)')
        + ';background:' + (active ? '#2563eb' : '#fff')
        + ';color:' + (active ? '#fff' : '#0f172a')
        + ';border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;">' + d + 'd</button>';
    };

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap;">'
      +   '<div>'
      +     '<h3 style="margin:0;font-size:16px;">🌐 Website Visitors</h3>'
      +     '<div style="font-size:12px;color:#64748b;">Tracked via the BM beacon — white-label, no Google Analytics setup needed.</div>'
      +   '</div>'
      +   '<div style="display:flex;gap:4px;">' + [7, 30, 90].map(rangeBtn).join('') + '</div>'
      + '</div>'
      + '<div id="' + bodyId + '" style="min-height:120px;color:var(--text-light);font-size:13px;text-align:center;padding:24px;">⏳ Loading visitor data…</div>'
      + '</div>';

    setTimeout(function() { _fillFull(bodyId, range); }, 60);
    return html;
  }

  function setRange(days, bodyId) {
    try { localStorage.setItem('bm-analytics-days', String(days)); } catch (e) {}
    var body = document.getElementById(bodyId || 'aw-full-body');
    if (body) body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-light);">⏳ Reloading…</div>';
    _fillFull(bodyId || 'aw-full-body', days);
    // Re-render parent page to update active pill state
    if (typeof loadPage === 'function') {
      var hash = (window.location.hash || '').replace(/^#/, '');
      if (hash) loadPage(hash);
    }
  }

  function _fillFull(bodyId, days) {
    var body = document.getElementById(bodyId);
    if (!body) return;
    var tid = _tenantId();
    if (!tid) { body.innerHTML = '<div style="color:#c62828;">No tenant resolved.</div>'; return; }

    _fetch(tid, days).then(function(data) {
      if (!data || !data.ok) {
        body.innerHTML = '<div style="color:#c62828;">Failed to load analytics: ' + _esc((data && data.error) || 'unknown') + '</div>';
        return;
      }
      body.innerHTML = _renderFullBody(data);
    }).catch(function(e) {
      body.innerHTML = '<div style="color:#c62828;">Network error: ' + _esc(e.message || e) + '</div>';
    });
  }

  function _renderFullBody(data) {
    if (data.totals.pageviews === 0) {
      return '<div style="text-align:center;padding:24px;color:var(--text-light);">'
        +   '<div style="font-size:32px;margin-bottom:6px;">📊</div>'
        +   '<div style="font-size:14px;font-weight:600;color:var(--text);">No visitors tracked yet</div>'
        +   '<div style="font-size:12px;margin-top:6px;">Enable the BM analytics beacon (set <code>tenants.config.analytics_enabled = true</code>) and re-publish your marketing site. Traffic data will appear here within minutes.</div>'
        + '</div>';
    }

    var html = '';

    // Totals tiles
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;">'
      + _statTile('Visitors', data.totals.sessions, 'unique sessions')
      + _statTile('Pageviews', data.totals.pageviews, 'total page loads')
      + _statTile('Pages / visitor', data.totals.sessions > 0 ? (data.totals.pageviews / data.totals.sessions).toFixed(1) : '0', 'engagement')
      + '</div>';

    // Daily chart
    html += '<div style="margin-bottom:14px;">'
      +   '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-light);margin-bottom:6px;text-align:center;">Daily visitors — last ' + data.days + ' days</div>'
      +   _bigChart(data.daily)
      + '</div>';

    // Top lists
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">'
      + _topListCard('Top pages', data.top_pages)
      + _topListCard('Top referrers', data.top_referrers)
      + _topListCard('Top countries', data.top_countries)
      + '</div>';

    return html;
  }

  function _statTile(label, value, sub) {
    return '<div style="background:var(--bg);border-radius:8px;padding:12px 14px;">'
      +   '<div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;font-weight:600;">' + _esc(label) + '</div>'
      +   '<div style="font-size:24px;font-weight:800;color:var(--text);line-height:1.1;margin-top:2px;">' + _esc(String(value)) + '</div>'
      +   '<div style="font-size:11px;color:var(--text-light);">' + _esc(sub) + '</div>'
      + '</div>';
  }

  function _sparkline(daily, w, h, stroke) {
    var maxV = Math.max.apply(null, daily.map(function(d){ return d.sessions; }).concat([1]));
    var pad = 2;
    var stepX = (w - pad * 2) / Math.max(1, daily.length - 1);
    var pts = daily.map(function(d, i) {
      var x = pad + i * stepX;
      var y = h - pad - ((d.sessions / maxV) * (h - pad * 2));
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:' + w + 'px;height:' + h + 'px;display:block;">'
      + '<polyline fill="none" stroke="#2563eb" stroke-width="' + stroke + '" points="' + pts + '"></polyline>'
      + '</svg>';
  }

  function _bigChart(daily) {
    if (!daily || !daily.length) return '<div style="color:var(--text-light);font-size:13px;text-align:center;">No data.</div>';
    var maxV = Math.max.apply(null, daily.map(function(d){ return d.sessions; }).concat([1]));
    var W = 560, H = 80, pad = 4;
    var stepX = (W - pad * 2) / Math.max(1, daily.length - 1);
    var pts = daily.map(function(d, i) {
      var x = pad + i * stepX;
      var y = H - pad - ((d.sessions / maxV) * (H - pad * 2));
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var bars = daily.map(function(d, i) {
      var x = pad + i * stepX;
      var bh = (d.sessions / maxV) * (H - pad * 2);
      return '<rect x="' + (x - 2) + '" y="' + (H - pad - bh) + '" width="3" height="' + Math.max(1, bh) + '" fill="#2563eb" opacity="0.6"></rect>';
    }).join('');
    return '<div style="overflow-x:auto;"><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:80px;display:block;">'
      + bars
      + '<polyline fill="none" stroke="#2563eb" stroke-width="1.5" points="' + pts + '"></polyline>'
      + '</svg></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-light);margin-top:4px;">'
      +   '<span>' + (daily[0] && daily[0].date ? daily[0].date.substring(5) : '') + '</span>'
      +   '<span>peak: ' + maxV + '/day</span>'
      +   '<span>' + (daily[daily.length-1] && daily[daily.length-1].date ? daily[daily.length-1].date.substring(5) : '') + '</span>'
      + '</div>';
  }

  function _topListCard(title, list) {
    var max = (list && list.length) ? Math.max.apply(null, list.map(function(x){ return x.count; })) : 1;
    var rows = (list || []).slice(0, 6).map(function(item) {
      var pct = Math.max(3, Math.round((item.count / max) * 100));
      return '<div style="margin-bottom:6px;">'
        +   '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;">'
        +     '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">' + _esc(item.key) + '</span>'
        +     '<span style="color:var(--text-light);font-weight:600;">' + item.count + '</span>'
        +   '</div>'
        +   '<div style="background:#f1f5f9;border-radius:4px;height:6px;overflow:hidden;">'
        +     '<div style="width:' + pct + '%;background:#2563eb;height:100%;border-radius:4px;"></div>'
        +   '</div>'
        + '</div>';
    }).join('') || '<div style="font-size:12px;color:var(--text-light);">No data.</div>';
    return '<div style="background:var(--bg);border-radius:8px;padding:12px;">'
      +   '<div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;font-weight:700;margin-bottom:8px;">' + _esc(title) + '</div>'
      +   rows
      + '</div>';
  }

  // v670: tiny summary helper for stat-card style usage. Fills countEl with
  // the session count and subEl with a one-line caption. Used by the
  // dashboard 2x2 stat grid.
  function fillSummary(countId, subId, days) {
    days = days || 30;
    var countEl = document.getElementById(countId);
    var subEl = document.getElementById(subId);
    if (!countEl && !subEl) return;
    var tid = _tenantId();
    if (!tid) { if (subEl) subEl.textContent = 'No tenant resolved.'; return; }
    _fetch(tid, days).then(function(data) {
      if (!data || !data.ok) {
        if (countEl) countEl.textContent = '—';
        if (subEl) subEl.textContent = 'Analytics not available';
        return;
      }
      var sessions = data.totals.sessions;
      if (countEl) countEl.textContent = sessions;
      if (subEl) subEl.textContent = sessions + ' visitor' + (sessions === 1 ? '' : 's') + ' · last ' + days + ' days';
    }).catch(function() {
      if (countEl) countEl.textContent = '—';
      if (subEl) subEl.textContent = 'Analytics unavailable';
    });
  }

  return {
    renderCompact: renderCompact,
    renderFull: renderFull,
    setRange: setRange,
    fillSummary: fillSummary
  };
})();
