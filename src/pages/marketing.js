/**
 * Branch Manager — Marketing Dashboard
 * Lead sources, conversion funnel, revenue by source, response time,
 * SocialPilot + GBP snapshot stubs.
 */
var MarketingPage = (function() {
  var _range = 90; // days: 30 / 90 / 365

  var SOURCE_COLORS = [
    '#2563eb', '#16a34a', '#f59e0b', '#ef4444',
    'var(--accent)', '#0ea5e9', '#ec4899', '#14b8a6',
    '#f97316', '#6366f1', '#84cc16', '#64748b'
  ];

  function colorFor(i) { return SOURCE_COLORS[i % SOURCE_COLORS.length]; }

  function getRequests() { try { return DB.requests ? DB.requests.getAll() : DB.getAll('bm-requests'); } catch (e) { return []; } }
  function getQuotes()   { try { return DB.quotes   ? DB.quotes.getAll()   : DB.getAll('bm-quotes');   } catch (e) { return []; } }
  function getJobs()     { try { return DB.jobs     ? DB.jobs.getAll()     : DB.getAll('bm-jobs');     } catch (e) { return []; } }
  function getInvoices() { try { return DB.invoices ? DB.invoices.getAll() : DB.getAll('bm-invoices'); } catch (e) { return []; } }

  function parseTs(d) {
    if (!d) return 0;
    var t = new Date(d).getTime();
    return isNaN(t) ? 0 : t;
  }

  function withinRange(dateStr, days) {
    if (!days) return true;
    var t = parseTs(dateStr);
    if (!t) return false;
    var cutoff = Date.now() - days * 86400000;
    return t >= cutoff;
  }

  function card(inner, extra) {
    return '<div class="quote-card" style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:18px;box-shadow:0 1px 2px rgba(0,0,0,.04);' + (extra || '') + '">' + inner + '</div>';
  }

  function emptyState(emoji, msg, ctaHtml) {
    return '<div style="text-align:center;padding:28px 12px;color:#64748b;">'
      + '<div style="font-size:34px;margin-bottom:6px;">' + emoji + '</div>'
      + '<div style="font-size:14px;margin-bottom:10px;">' + msg + '</div>'
      + (ctaHtml || '')
      + '</div>';
  }

  // ---------- Lead sources ----------
  function renderLeadSources() {
    var reqs = getRequests().filter(function(r) { return withinRange(r.createdAt || r.created_at || r.date, _range); });
    var counts = {};
    reqs.forEach(function(r) {
      var s = (r.source || 'Unknown').toString().trim() || 'Unknown';
      counts[s] = (counts[s] || 0) + 1;
    });
    var entries = Object.keys(counts).map(function(k) { return { source: k, count: counts[k] }; })
      .sort(function(a, b) { return b.count - a.count; });

    var inner = '<h3 style="margin:0 0 4px;font-size:16px;">📣 Lead Sources</h3>'
      + '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">Where your ' + reqs.length + ' requests came from (last ' + _range + ' days)</div>';

    if (!entries.length) {
      inner += emptyState('📊', 'No requests in this window yet.',
        '<button class="btn btn-primary" onclick="loadPage(\'requests\')">Go to Requests</button>');
      return card(inner);
    }

    var max = entries[0].count;
    inner += '<div style="display:flex;flex-direction:column;gap:8px;">';
    entries.forEach(function(e, i) {
      var pct = Math.max(4, Math.round((e.count / max) * 100));
      var color = colorFor(i);
      var label = UI.esc(e.source);
      inner += '<div style="cursor:pointer;" onclick="MarketingPage.filterBySource(\'' + label.replace(/'/g, "\\'") + '\')" title="Click to filter Requests">'
        + '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px;">'
        + '<span style="font-weight:600;">' + label + '</span>'
        + '<span style="color:#475569;">' + e.count + '</span>'
        + '</div>'
        + '<div style="background:#f1f5f9;border-radius:6px;height:12px;overflow:hidden;">'
        + '<div style="width:' + pct + '%;background:' + color + ';height:100%;border-radius:6px;"></div>'
        + '</div>'
        + '</div>';
    });
    inner += '</div>';
    return card(inner);
  }

  // ---------- Tag untagged lead sources (v415) ----------
  // Surfaces clients without a `source` set, sorted by revenue (paid invoices),
  // with an inline dropdown for one-click tagging. Top revenue first so Doug
  // chips away at the highest-attribution-value entries.
  var _tagShowMore = false;
  var SOURCE_OPTIONS = [
    { value: 'Google',       label: 'Google (search / GBP)' },
    { value: 'Referral',     label: 'Referral / Word of mouth' },
    { value: 'Repeat',       label: 'Repeat customer' },
    { value: 'Yard sign',    label: 'Yard sign / Truck' },
    { value: 'Website form', label: 'Website form' },
    { value: 'Facebook',     label: 'Facebook' },
    { value: 'Instagram',    label: 'Instagram' },
    { value: 'NextDoor',     label: 'NextDoor' },
    { value: 'Yelp',         label: 'Yelp' },
    { value: 'Angie',        label: 'Angi / HomeAdvisor' },
    { value: 'Thumbtack',    label: 'Thumbtack' },
    { value: 'Drive-by',     label: 'Drive-by' },
    { value: 'Phone',        label: 'Direct call' },
    { value: 'Other',        label: 'Other' }
  ];

  function renderTagSources() {
    var clients = getClients();
    var untagged = clients.filter(function(c) {
      return !c.source && c.status !== 'archived';
    });

    // Compute lifetime revenue per client from paid invoices
    var invoices = (typeof DB !== 'undefined' && DB.invoices) ? DB.invoices.getAll() : [];
    var revByClient = {};
    invoices.forEach(function(inv) {
      if (inv.clientId && inv.status === 'paid') {
        revByClient[inv.clientId] = (revByClient[inv.clientId] || 0) + (inv.total || 0);
      }
    });

    // Rank: revenue descending so top earners are first
    var ranked = untagged.map(function(c) {
      return { client: c, revenue: revByClient[c.id] || 0 };
    }).sort(function(a, b) { return b.revenue - a.revenue; });

    var totalUntagged = ranked.length;
    var totalClients = clients.filter(function(c) { return c.status !== 'archived'; }).length;
    var pct = totalClients > 0 ? Math.round((totalUntagged / totalClients) * 100) : 0;

    var inner = '<h3 style="margin:0 0 4px;font-size:16px;">🏷️ Tag Untagged Lead Sources</h3>'
      + '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">'
      +   totalUntagged + ' of ' + totalClients + ' active clients (' + pct + '%) have no source tagged. '
      +   'Highest-revenue first — those are the ones you want attributed for ROI math.'
      + '</div>';

    if (totalUntagged === 0) {
      inner += emptyState('🎯', 'All clients have a source tagged. Nice attribution discipline!', '');
      return card(inner);
    }

    var perPage = _tagShowMore ? ranked.length : 10;
    var pageItems = ranked.slice(0, perPage);

    var optionsHtml = SOURCE_OPTIONS.map(function(s) {
      return '<option value="' + s.value + '">' + s.label + '</option>';
    }).join('');

    inner += '<div style="display:flex;flex-direction:column;gap:6px;">';
    pageItems.forEach(function(item) {
      var c = item.client;
      var revStr = item.revenue > 0 ? '$' + Math.round(item.revenue).toLocaleString() : '—';
      inner += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">'
        +   '<div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:13px;cursor:pointer;" onclick="loadPage(\'clients\');setTimeout(function(){ClientsPage.showDetail(\'' + c.id + '\')},100)" title="Open client detail">' + UI.esc(c.name || 'Unnamed') + '</div>'
        +   '<div style="font-size:12px;color:#475569;font-variant-numeric:tabular-nums;font-weight:600;min-width:60px;text-align:right;">' + revStr + '</div>'
        +   '<select onchange="MarketingPage.tagSource(\'' + c.id + '\', this.value)" style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:#fff;">'
        +     '<option value="">— pick —</option>'
        +     optionsHtml
        +   '</select>'
        + '</div>';
    });
    inner += '</div>';

    if (ranked.length > perPage) {
      inner += '<div style="text-align:center;margin-top:10px;">'
        + '<button class="btn" onclick="MarketingPage.toggleTagShowMore()">Show all ' + ranked.length + '</button>'
        + '</div>';
    } else if (_tagShowMore && ranked.length > 10) {
      inner += '<div style="text-align:center;margin-top:10px;">'
        + '<button class="btn" onclick="MarketingPage.toggleTagShowMore()">Show top 10</button>'
        + '</div>';
    }

    return card(inner);
  }

  function tagSource(clientId, source) {
    if (!source || !clientId) return;
    if (typeof DB === 'undefined' || !DB.clients || !DB.clients.update) {
      UI.toast('DB.clients.update unavailable', 'error');
      return;
    }
    DB.clients.update(clientId, { source: source });
    UI.toast('Tagged ✓ ' + source);
    // Re-render so the tagged client drops out of the untagged list
    setTimeout(function() { loadPage('marketing'); }, 250);
  }

  function toggleTagShowMore() {
    _tagShowMore = !_tagShowMore;
    loadPage('marketing');
  }

  // ---------- Conversion funnel ----------
  function renderFunnel() {
    var reqs = getRequests().filter(function(r) { return withinRange(r.createdAt || r.created_at || r.date, _range); });
    var quotes = getQuotes().filter(function(q) { return withinRange(q.createdAt || q.created_at || q.date, _range); });
    var jobs = getJobs().filter(function(j) { return withinRange(j.createdAt || j.created_at || j.scheduledDate, _range); });

    var sentStatuses = { sent: 1, awaiting: 1, approved: 1, converted: 1, declined: 1 };
    var approvedStatuses = { approved: 1, converted: 1 };

    var stages = [
      { label: 'Requests', count: reqs.length, color: '#2563eb' },
      { label: 'Quotes Sent', count: quotes.filter(function(q) { return sentStatuses[q.status]; }).length, color: '#0ea5e9' },
      { label: 'Quotes Approved', count: quotes.filter(function(q) { return approvedStatuses[q.status]; }).length, color: '#16a34a' },
      { label: 'Jobs Completed', count: jobs.filter(function(j) { return j.status === 'completed'; }).length, color: '#f59e0b' }
    ];
    var top = Math.max.apply(null, stages.map(function(s) { return s.count; }).concat([1]));

    var inner = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap;">'
      + '<div>'
      + '<h3 style="margin:0;font-size:16px;">🔻 Conversion Funnel</h3>'
      + '<div style="font-size:12px;color:#64748b;">Drop-off between stages</div>'
      + '</div>'
      + '<div style="display:flex;gap:4px;">'
      + [30, 90, 365].map(function(d) {
        var active = _range === d;
        return '<button onclick="MarketingPage.setRange(' + d + ')" style="padding:6px 10px;border:1px solid ' + (active ? '#2563eb' : 'var(--border)') + ';background:' + (active ? '#2563eb' : '#fff') + ';color:' + (active ? '#fff' : '#0f172a') + ';border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;">' + (d === 365 ? '1y' : d + 'd') + '</button>';
      }).join('')
      + '</div>'
      + '</div>';

    if (stages[0].count === 0) {
      inner += emptyState('📊', 'No funnel data yet — add requests to see conversion.', '');
      return card(inner);
    }

    inner += '<div style="display:flex;flex-direction:column;gap:6px;">';
    stages.forEach(function(s, i) {
      var pct = Math.max(3, Math.round((s.count / top) * 100));
      var dropText = '';
      if (i > 0) {
        var prev = stages[i - 1].count;
        var drop = prev ? Math.round((s.count / prev) * 100) : 0;
        dropText = '<span style="font-size:11px;color:#64748b;margin-left:8px;">' + drop + '% of prev</span>';
      }
      inner += '<div>'
        + '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px;">'
        + '<span style="font-weight:600;">' + s.label + dropText + '</span>'
        + '<span style="color:#475569;font-weight:600;">' + s.count + '</span>'
        + '</div>'
        + '<div style="background:#f1f5f9;border-radius:6px;height:16px;overflow:hidden;">'
        + '<div style="width:' + pct + '%;background:' + s.color + ';height:100%;border-radius:6px;"></div>'
        + '</div>'
        + '</div>';
    });
    inner += '</div>';

    return card(inner);
  }

  // ---------- Revenue by source ----------
  function renderRevenueBySource() {
    var reqs = getRequests();
    var invoices = getInvoices().filter(function(i) { return i.status === 'paid'; });
    var jobs = getJobs();

    // Build clientId -> source map from requests (use most recent)
    var clientSource = {};
    reqs.forEach(function(r) {
      if (!r.clientId) return;
      var s = (r.source || '').toString().trim();
      if (!s) return;
      var t = parseTs(r.createdAt);
      if (!clientSource[r.clientId] || t > clientSource[r.clientId].t) {
        clientSource[r.clientId] = { source: s, t: t };
      }
    });

    // Build jobId -> source map (job may be linked to a request)
    var jobSource = {};
    jobs.forEach(function(j) {
      var src = null;
      if (j.requestId) {
        var req = reqs.filter(function(r) { return r.id === j.requestId; })[0];
        if (req && req.source) src = req.source;
      }
      if (!src && j.clientId && clientSource[j.clientId]) src = clientSource[j.clientId].source;
      if (src) jobSource[j.id] = src;
    });

    var totals = {};
    invoices.forEach(function(inv) {
      var src = null;
      if (inv.jobId && jobSource[inv.jobId]) src = jobSource[inv.jobId];
      else if (inv.clientId && clientSource[inv.clientId]) src = clientSource[inv.clientId].source;
      src = src || 'Unknown';
      totals[src] = (totals[src] || 0) + (+inv.total || 0);
    });

    var rows = Object.keys(totals).map(function(k) { return { source: k, total: totals[k] }; })
      .sort(function(a, b) { return b.total - a.total; });

    var inner = '<h3 style="margin:0 0 4px;font-size:16px;">💰 Revenue by Source</h3>'
      + '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">Paid invoices attributed back to the lead source</div>';

    if (!rows.length) {
      inner += emptyState('📊', 'No paid invoices yet — revenue will attribute automatically.', '');
      return card(inner);
    }

    var grand = rows.reduce(function(s, r) { return s + r.total; }, 0);
    inner += '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
      + '<thead><tr style="text-align:left;border-bottom:1px solid var(--border);color:#64748b;">'
      + '<th style="padding:6px 4px;">Source</th>'
      + '<th style="padding:6px 4px;text-align:right;">Revenue</th>'
      + '<th style="padding:6px 4px;text-align:right;">% of Total</th>'
      + '</tr></thead><tbody>';
    rows.forEach(function(r) {
      var pct = grand ? Math.round((r.total / grand) * 100) : 0;
      inner += '<tr style="border-bottom:1px solid #f1f5f9;">'
        + '<td style="padding:8px 4px;font-weight:600;">' + UI.esc(r.source) + '</td>'
        + '<td style="padding:8px 4px;text-align:right;">' + UI.money(r.total) + '</td>'
        + '<td style="padding:8px 4px;text-align:right;color:#64748b;">' + pct + '%</td>'
        + '</tr>';
    });
    inner += '</tbody></table>';
    return card(inner);
  }

  // ---------- Response time ----------
  function renderResponseTime() {
    var reqs = getRequests();
    var quotes = getQuotes();

    // Map clientId -> earliest quote createdAt
    var firstQuoteByClient = {};
    quotes.forEach(function(q) {
      if (!q.clientId) return;
      var t = parseTs(q.createdAt || q.created_at || q.date);
      if (!t) return;
      if (!firstQuoteByClient[q.clientId] || t < firstQuoteByClient[q.clientId]) {
        firstQuoteByClient[q.clientId] = t;
      }
    });

    var diffs = [];
    reqs.forEach(function(r) {
      if (!r.clientId) return;
      var rt = parseTs(r.createdAt || r.created_at || r.date);
      var qt = firstQuoteByClient[r.clientId];
      if (!rt || !qt || qt < rt) return;
      diffs.push((qt - rt) / 3600000); // hours
    });

    var inner = '<h3 style="margin:0 0 4px;font-size:16px;">⏱ Response Time</h3>'
      + '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">Avg hours: request → first quote</div>';

    if (!diffs.length) {
      inner += emptyState('📊', 'Not enough paired requests + quotes yet.', '');
      return card(inner);
    }

    var avg = diffs.reduce(function(s, d) { return s + d; }, 0) / diffs.length;
    var median = diffs.slice().sort(function(a, b) { return a - b; })[Math.floor(diffs.length / 2)];
    var color = avg < 2 ? '#16a34a' : (avg < 24 ? '#f59e0b' : '#ef4444');
    var label = avg < 2 ? 'Excellent' : (avg < 24 ? 'Acceptable' : 'Too Slow');

    inner += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div style="text-align:center;padding:16px;background:#f8fafc;border-radius:10px;">'
      + '<div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Avg Response</div>'
      + '<div style="font-size:28px;font-weight:700;color:' + color + ';margin:4px 0;">' + avg.toFixed(1) + 'h</div>'
      + '<div style="font-size:12px;color:' + color + ';font-weight:600;">' + label + '</div>'
      + '</div>'
      + '<div style="text-align:center;padding:16px;background:#f8fafc;border-radius:10px;">'
      + '<div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Median</div>'
      + '<div style="font-size:28px;font-weight:700;color:#0f172a;margin:4px 0;">' + median.toFixed(1) + 'h</div>'
      + '<div style="font-size:12px;color:#64748b;">across ' + diffs.length + ' pairs</div>'
      + '</div>'
      + '</div>'
      + '<div style="font-size:11px;color:#64748b;margin-top:10px;text-align:center;">Benchmark: &lt;2h green · &lt;24h amber · &gt;24h red</div>';
    return card(inner);
  }

  // ---------- SocialPilot ----------
  function renderSocial() {
    var key = '';
    try { key = localStorage.getItem('bm-socialpilot-key') || ''; } catch (e) {}
    var inner = '<h3 style="margin:0 0 4px;font-size:16px;">📱 Social Media</h3>';

    if (key) {
      inner += '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">SocialPilot connected</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
        + '<div style="padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;text-align:center;">'
        + '<div style="font-size:11px;color:#166534;text-transform:uppercase;">Status</div>'
        + '<div style="font-size:18px;font-weight:700;color:#166534;">✓ Connected</div></div>'
        + '<div style="padding:12px;background:#f8fafc;border:1px solid var(--border);border-radius:8px;text-align:center;">'
        + '<div style="font-size:11px;color:#64748b;text-transform:uppercase;">Posts</div>'
        + '<div style="font-size:18px;font-weight:700;">—</div>'
        + '<div style="font-size:11px;color:#64748b;">stub — live API not wired</div></div>'
        + '</div>'
        + '<button class="btn" style="margin-top:10px;" onclick="MarketingPage.disconnectSocial()">Disconnect</button>';
    } else {
      inner += emptyState('📊',
        'Connect SocialPilot to see posts scheduled, published, and engagement.',
        '<a href="https://www.socialpilot.co/api" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="margin-right:6px;">Get API key</a>'
        + '<button class="btn" onclick="MarketingPage.connectSocial()">Paste key</button>');
    }
    return card(inner);
  }

  // ---------- GBP ----------
  function renderGBP() {
    var stats = null;
    try { stats = JSON.parse(localStorage.getItem('bm-gbp-stats') || 'null'); } catch (e) {}
    var inner = '<h3 style="margin:0 0 4px;font-size:16px;">🏢 Google Business Profile</h3>';

    if (stats && typeof stats === 'object') {
      inner += '<div style="font-size:12px;color:#64748b;margin-bottom:12px;">Week of ' + UI.esc(stats.weekOf || '—') + '</div>'
        + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;">'
        + statBox('Profile Views', stats.views)
        + statBox('Searches', stats.searches)
        + statBox('Photo Views', stats.photoViews)
        + statBox('Phone Calls', stats.calls)
        + '</div>'
        + '<button class="btn" style="margin-top:10px;" onclick="MarketingPage.updateGBP()">Update numbers</button>';
    } else {
      inner += emptyState('📊',
        'Paste weekly GBP insights to track views, searches, and calls.',
        '<button class="btn btn-primary" onclick="MarketingPage.updateGBP()">Add GBP stats</button>');
    }
    return card(inner);
  }

  function statBox(label, val) {
    return '<div style="padding:10px;background:#f8fafc;border:1px solid var(--border);border-radius:8px;text-align:center;">'
      + '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">' + label + '</div>'
      + '<div style="font-size:22px;font-weight:700;color:#0f172a;">' + (val != null ? val : '—') + '</div>'
      + '</div>';
  }

  // ---------- Render ----------
  function render() {
    var html = '<div style="max-width:1200px;margin:0 auto;padding:8px;">'
      + '<div style="margin-bottom:14px;">'
      + '<h2 style="margin:0 0 4px;font-size:22px;">📣 Marketing Dashboard</h2>'
      + '<div style="font-size:13px;color:#64748b;">Your marketing funnel at a glance — lead sources, conversion, revenue attribution, response time.</div>'
      + '</div>'
      + renderDraftsToReview()
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;">'
      + renderLeadSources()
      + renderTagSources()
      + renderFunnel()
      + renderResponseTime()
      + renderRevenueBySource()
      + renderSocial()
      + renderGBP()
      // v403: Future planning — Ad Performance calculator (was in Tools →
      // Calculators). Marketing is its proper home — forward-looking spend
      // math sits next to the backward-looking lead-source analytics.
      + '<details style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin-top:20px;overflow:hidden;">'
      +   '<summary style="padding:14px 18px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;">'
      +     '<div><strong style="font-size:14px;">Future Planning · Ad Performance</strong>'
      +       '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">Per-channel spend, ROAS, target CAC. Pair with Lead Sources to forecast next quarter.</div></div>'
      +     '<a href="https://peekskilltree.com/ads.html" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="btn btn-outline" style="font-size:12px;padding:5px 10px;">Open &rarr;</a>'
      +   '</summary>'
      +   '<div style="padding:0 18px 14px;font-size:12px;color:var(--text-light);">Public planning tool at <code>peekskilltree.com/ads.html</code>. Links from Tools → Calculators have moved here.</div>'
      + '</details>'
      + '</div>'
      + '</div>';
    return html;
  }

  // ---------- Actions ----------
  function setRange(d) { _range = d; loadPage('marketing'); }

  function filterBySource(source) {
    try {
      if (typeof RequestsPage !== 'undefined') {
        RequestsPage._search = source;
      }
    } catch (e) {}
    loadPage('requests');
  }

  function connectSocial() {
    var key = prompt('Paste your SocialPilot API key:');
    if (!key) return;
    try { localStorage.setItem('bm-socialpilot-key', key.trim()); } catch (e) {}
    if (typeof UI !== 'undefined' && UI.toast) UI.toast('SocialPilot connected');
    loadPage('marketing');
  }

  function disconnectSocial() {
    if (!confirm('Disconnect SocialPilot?')) return;
    try { localStorage.removeItem('bm-socialpilot-key'); } catch (e) {}
    loadPage('marketing');
  }

  function updateGBP() {
    var existing = {};
    try { existing = JSON.parse(localStorage.getItem('bm-gbp-stats') || '{}') || {}; } catch (e) {}
    var weekOf = prompt('Week of (e.g. 2026-04-13):', existing.weekOf || '');
    if (weekOf === null) return;
    var views = prompt('Profile views:', existing.views != null ? existing.views : '');
    if (views === null) return;
    var searches = prompt('Search queries:', existing.searches != null ? existing.searches : '');
    if (searches === null) return;
    var photoViews = prompt('Photo views:', existing.photoViews != null ? existing.photoViews : '');
    if (photoViews === null) return;
    var calls = prompt('Phone calls:', existing.calls != null ? existing.calls : '');
    if (calls === null) return;
    var stats = {
      weekOf: weekOf.trim(),
      views: +views || 0,
      searches: +searches || 0,
      photoViews: +photoViews || 0,
      calls: +calls || 0
    };
    try { localStorage.setItem('bm-gbp-stats', JSON.stringify(stats)); } catch (e) {}
    if (typeof UI !== 'undefined' && UI.toast) UI.toast('GBP stats saved');
    loadPage('marketing');
  }

  // ── Drafts to Review (v603) ─────────────────────────────────────────────────
  // marketing-automation cron stages outbound emails as drafts in
  // marketing_drafts. Doug reviews + approves here. Nothing is autonomous.
  // Per the never-autonomous-send rule (Basquali incident, MEMORY.md).
  var _draftsCache = null;
  function renderDraftsToReview() {
    var html = '<div id="mkt-drafts-section" style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      +   '<div>'
      +     '<h3 style="margin:0;font-size:16px;display:flex;align-items:center;gap:8px;">📋 Drafts to Review <span id="mkt-drafts-count" style="font-size:11px;font-weight:700;background:#fff3e0;color:#7e2d10;padding:2px 8px;border-radius:10px;">…</span></h3>'
      +     '<div style="font-size:12px;color:var(--text-light);margin-top:3px;">Customer emails the automation has staged. Approve = sends now. Reject = won\'t send. Nothing fires without your click.</div>'
      +   '</div>'
      +   '<div style="display:flex;gap:8px;">'
      +     '<button id="mkt-drafts-refresh" onclick="MarketingPage.loadDrafts()" style="background:none;border:1px solid var(--border);padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">↻ Refresh</button>'
      +     '<button id="mkt-drafts-approve-all" onclick="MarketingPage.approveAllDrafts()" style="background:var(--green-dark);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;display:none;">Send All</button>'
      +   '</div>'
      + '</div>'
      + '<div id="mkt-drafts-list">'
      +   '<div style="text-align:center;padding:30px;color:var(--text-light);font-size:13px;">⏳ Loading drafts…</div>'
      + '</div>'
      + '</div>';
    setTimeout(function(){ if (typeof MarketingPage.loadDrafts === 'function') MarketingPage.loadDrafts(); }, 80);
    return html;
  }

  function loadDrafts() {
    var box = document.getElementById('mkt-drafts-list');
    var counter = document.getElementById('mkt-drafts-count');
    var sendAll = document.getElementById('mkt-drafts-approve-all');
    if (!box) return;
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    var tid = (DB && DB.getTenantId) ? DB.getTenantId() : null;
    if (!sb || !tid) {
      box.innerHTML = '<div style="background:#fff3cd;border:1px solid #ffe082;border-radius:8px;padding:12px;color:#7e2d10;font-size:13px;">⚠ Cloud sync required to load drafts.</div>';
      return;
    }
    sb.from('marketing_drafts').select('*').eq('tenant_id', tid).eq('status', 'pending').order('created_at', { ascending: false }).then(function(r) {
      _draftsCache = (r && r.data) || [];
      if (counter) counter.textContent = _draftsCache.length;
      if (sendAll) sendAll.style.display = _draftsCache.length > 0 ? 'inline-block' : 'none';
      if (_draftsCache.length === 0) {
        box.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-light);font-size:13px;">✅ No drafts pending review. The automation is on standby.</div>';
        return;
      }
      var TRIGGER_LABELS = {
        review_request:    { icon: '⭐', label: 'Review request', color: '#fbbf24' },
        quote_followup_7d: { icon: '💬', label: 'Quote follow-up (7d)', color: '#3b82f6' },
        upsell_30d:        { icon: '🌳', label: 'Upsell (30d after paid)', color: '#10b981' },
        appt_reminder:     { icon: '⏰', label: 'Appointment reminder', color: '#f59e0b' }
      };
      var html = '';
      _draftsCache.forEach(function(d) {
        var meta = TRIGGER_LABELS[d.trigger] || { icon: '✉', label: d.trigger, color: '#6b7280' };
        var ageDays = Math.floor((Date.now() - new Date(d.created_at)) / 86400000);
        var ageStr = ageDays === 0 ? 'today' : ageDays === 1 ? '1d ago' : ageDays + 'd ago';
        html += '<div data-draft-id="' + d.id + '" style="border:1px solid var(--border);border-left:4px solid ' + meta.color + ';border-radius:8px;padding:12px 14px;margin-bottom:8px;background:#fafafa;">'
          + '<div style="display:flex;justify-content:space-between;align-items:start;gap:12px;">'
          +   '<div style="flex:1;min-width:0;">'
          +     '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px;">'
          +       '<span style="font-weight:700;font-size:13px;">' + meta.icon + ' ' + meta.label + '</span>'
          +       '<span style="font-size:11px;color:var(--text-light);">' + ageStr + '</span>'
          +     '</div>'
          +     '<div style="font-size:14px;font-weight:600;margin-bottom:2px;">' + UI.esc(d.client_name) + ' <span style="color:var(--text-light);font-weight:400;">→ ' + UI.esc(d.to_email || '') + '</span></div>'
          +     '<div style="font-size:13px;color:var(--text);margin-bottom:6px;"><strong>Subject:</strong> ' + UI.esc(d.subject || '(no subject)') + '</div>'
          +     '<details style="font-size:12px;">'
          +       '<summary style="cursor:pointer;color:var(--accent);font-weight:600;">Preview body</summary>'
          +       '<pre style="white-space:pre-wrap;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#fff;border:1px solid var(--border);border-radius:6px;padding:10px;margin-top:6px;max-height:240px;overflow:auto;">' + UI.esc(d.body_text || '') + '</pre>'
          +     '</details>'
          +   '</div>'
          +   '<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">'
          +     '<button onclick="MarketingPage.approveDraft(\'' + d.id + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:6px 12px;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">✅ Send</button>'
          +     '<button onclick="MarketingPage.rejectDraft(\'' + d.id + '\')" style="background:#fff;color:#c62828;border:1px solid #ef9a9a;padding:6px 12px;border-radius:5px;font-size:12px;cursor:pointer;white-space:nowrap;">✕ Reject</button>'
          +   '</div>'
          + '</div>'
          + '</div>';
      });
      box.innerHTML = html;
    });
  }

  function approveDraft(id) {
    var d = (_draftsCache || []).find(function(x){ return x.id === id; });
    if (!d) { UI.toast('Draft not found', 'error'); return; }
    var sb = SupabaseDB.client;
    var tid = DB.getTenantId();
    var now = new Date().toISOString();
    var approver = (typeof Auth !== 'undefined' && Auth.user && Auth.user.email) ? Auth.user.email : 'unknown';
    UI.toast('Sending…');
    // Mark approved → call send-email → update with sent_at
    sb.from('marketing_drafts').update({ status: 'approved', approved_at: now, approved_by: approver }).eq('id', id).then(function() {
      var SUPABASE_URL = 'https://ltpivkqahvplapyagljt.supabase.co';
      fetch(SUPABASE_URL + '/functions/v1/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': tid },
        body: JSON.stringify({
          to: d.to_email,
          subject: d.subject,
          html: d.body_html,
          text: d.body_text
        })
      }).then(function(r){
        if (r.ok) {
          sb.from('marketing_drafts').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id).then(function(){
            UI.toast('Sent ✅');
            loadDrafts();
          });
        } else {
          r.text().then(function(t){
            sb.from('marketing_drafts').update({ status: 'send_failed', metadata: Object.assign({}, d.metadata || {}, { send_error: t.slice(0, 200) }) }).eq('id', id);
            UI.toast('Send failed: ' + t.slice(0, 80), 'error');
            loadDrafts();
          });
        }
      }).catch(function(e){
        sb.from('marketing_drafts').update({ status: 'send_failed', metadata: Object.assign({}, d.metadata || {}, { send_error: String(e) }) }).eq('id', id);
        UI.toast('Send error: ' + e, 'error');
        loadDrafts();
      });
    });
  }

  function rejectDraft(id) {
    UI.confirm('Reject this draft? It won\'t send and the trigger won\'t re-stage it.', function() {
      var sb = SupabaseDB.client;
      sb.from('marketing_drafts').update({ status: 'rejected', rejected_at: new Date().toISOString() }).eq('id', id).then(function() {
        UI.toast('Draft rejected');
        loadDrafts();
      });
    });
  }

  function approveAllDrafts() {
    if (!_draftsCache || _draftsCache.length === 0) return;
    UI.confirm('Send all ' + _draftsCache.length + ' pending drafts? Each goes through send-email individually.', function() {
      var ids = _draftsCache.map(function(d){ return d.id; });
      ids.forEach(function(id, i) {
        // Stagger by 250ms so we don't burst Resend
        setTimeout(function(){ approveDraft(id); }, i * 250);
      });
    });
  }

  return {
    render: render,
    setRange: setRange,
    filterBySource: filterBySource,
    connectSocial: connectSocial,
    disconnectSocial: disconnectSocial,
    updateGBP: updateGBP,
    tagSource: tagSource,
    toggleTagShowMore: toggleTagShowMore,
    loadDrafts: loadDrafts,
    approveDraft: approveDraft,
    rejectDraft: rejectDraft,
    approveAllDrafts: approveAllDrafts
  };
})();
