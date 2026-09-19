/**
 * Branch Manager — Estimate board (Sept 19 2026)
 * Read-only board of Jobber quotes / jobs / invoices mirrored hourly into jobber_* tables
 * (edge fn jobber-mirror). Truth stays in Jobber while Catherine writes there; this page is
 * where Doug + Catherine LOOK. Lazy: nothing loads until the page is opened.
 */
var EstimatesPage = {
  _data: null, _loading: false, _err: null,
  _sb: function() { return (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null; },
  _esc: function(s) { return (typeof UI !== 'undefined' && UI.esc) ? UI.esc(s == null ? '' : s) : String(s == null ? '' : s); },
  _money: function(n) { n = Number(n) || 0; return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); },
  _days: function(iso) { if (!iso) return null; return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000)); },
  _fmt: function(iso) { if (!iso) return ''; var d = new Date(iso); return (d.getMonth() + 1) + '/' + d.getDate(); },
  _jobberId: function(gid) { try { return atob(gid).split('/').pop(); } catch (e) { return ''; } },
  _qlink: function(q) { var n = EstimatesPage._jobberId(q.id); return n ? 'https://secure.getjobber.com/quotes/' + n : 'https://secure.getjobber.com/quotes'; },

  load: function() {
    var sb = EstimatesPage._sb(); if (!sb || EstimatesPage._loading) return;
    EstimatesPage._loading = true; EstimatesPage._err = null;
    Promise.all([
      sb.from('jobber_quotes').select('*').order('created_at', { ascending: false }).limit(200),
      sb.from('jobber_jobs').select('*').order('start_at', { ascending: false, nullsFirst: false }).limit(60),
      sb.from('jobber_invoices').select('*').gt('balance', 0).order('issued_date', { ascending: false }).limit(50),
      sb.from('jobber_requests').select('*').eq('status', 'new').order('created_at', { ascending: false }).limit(25)
    ]).then(function(r) {
      var bad = r.find(function(x) { return x.error; });
      if (bad) { EstimatesPage._err = bad.error.message; }
      else EstimatesPage._data = { quotes: r[0].data || [], jobs: r[1].data || [], invoices: r[2].data || [], requests: r[3].data || [] };
      EstimatesPage._loading = false; EstimatesPage._repaint();
    }).catch(function(e) { EstimatesPage._err = String(e && e.message || e); EstimatesPage._loading = false; EstimatesPage._repaint(); });
  },
  _repaint: function() { var el = document.getElementById('est-board'); if (el) el.outerHTML = EstimatesPage._board(); },
  refresh: function() { EstimatesPage._data = null; EstimatesPage.load(); EstimatesPage._repaint(); },

  render: function() {
    if (!EstimatesPage._data && !EstimatesPage._loading) setTimeout(EstimatesPage.load, 0);
    return '<div style="max-width:860px;">' + EstimatesPage._board() + '</div>';
  },

  _card: function(title, meta, want, cls, href) {
    var e = EstimatesPage._esc;
    var left = cls === 'hot' ? 'var(--red)' : cls === 'go' ? 'var(--accent)' : cls === 'done' ? 'var(--green-dark)' : 'var(--border)';
    var open = href ? '<a href="' + e(href) + '" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;display:block;">' : '<div>';
    var close = href ? '</a>' : '</div>';
    return open + '<div style="background:var(--white);border:1px solid var(--border);border-left:4px solid ' + left + ';border-radius:0 10px 10px 0;padding:11px 14px;margin:7px 0;' + (cls === 'done' ? 'opacity:.6;' : '') + '">'
      + '<div style="font-weight:600;font-size:14px;line-height:1.3;">' + title + '</div>'
      + (meta ? '<div style="font-size:12.5px;color:var(--text-light);margin-top:2px;">' + meta + '</div>' : '')
      + (want ? '<div style="font-size:13px;margin-top:3px;">' + want + '</div>' : '')
      + '</div>' + close;
  },
  _h2: function(txt, color) { return '<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;margin:22px 0 4px;padding:7px 12px;border-radius:8px;background:' + color + '18;color:' + color + ';">' + txt + '</div>'; },

  _board: function() {
    var e = EstimatesPage._esc, M = EstimatesPage._money, D = EstimatesPage._days;
    var d = EstimatesPage._data;
    var head = '<div id="est-board">'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">'
      + '<a href="https://secure.getjobber.com/quotes" target="_blank" rel="noopener" class="btn btn-outline" style="font-size:12px;padding:6px 12px;border-radius:6px;text-decoration:none;">Open Jobber ↗</a>'
      + '<a href="https://branchmanager.app/estimates-map-3f9c21.html" target="_blank" rel="noopener" class="btn btn-outline" style="font-size:12px;padding:6px 12px;border-radius:6px;text-decoration:none;">🗺️ Map ↗</a>'
      + '<a href="https://branchmanager.app/estimates-snt-4b8e2f.html" target="_blank" rel="noopener" class="btn btn-outline" style="font-size:12px;padding:6px 12px;border-radius:6px;text-decoration:none;">Web page ↗</a>'
      + '<button onclick="EstimatesPage.refresh()" class="btn btn-outline" style="font-size:12px;padding:6px 12px;border-radius:6px;">↻ Refresh</button>'
      + '</div>';
    if (EstimatesPage._err) return head + '<div style="padding:16px;color:var(--red);">Could not load the Jobber mirror: ' + e(EstimatesPage._err) + '</div></div>';
    if (!d) return head + '<div style="padding:24px;color:var(--text-light);">Loading the board from the Jobber mirror…</div></div>';
    var synced = d.quotes.length ? d.quotes.reduce(function(m, q) { return q.synced_at > m ? q.synced_at : m; }, '') : '';
    var html = head + '<div style="font-size:12px;color:var(--text-light);margin-bottom:4px;">Read-only mirror of Jobber, refreshed hourly' + (synced ? ' · last sync ' + new Date(synced).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '') + '. Catherine writes in Jobber; this is where we look.</div>';
    var since = new Date(Date.now() - 140 * 86400000).toISOString();
    var drafts = d.quotes.filter(function(q) { return q.status === 'draft' && q.created_at > since; });
    var open = d.quotes.filter(function(q) { return (q.status === 'awaiting_response' || q.status === 'changes_requested') && q.created_at > since; });
    var older = d.quotes.filter(function(q) { return (q.status === 'awaiting_response' || q.status === 'changes_requested') && q.created_at <= since; });
    var sum = function(a) { return a.reduce(function(s, q) { return s + (Number(q.total) || 0); }, 0); };
    function qtitle(q) { return '<span style="font-family:ui-monospace,Menlo,monospace;font-size:11px;background:var(--bg);border:1px solid var(--border);padding:1px 6px;border-radius:4px;margin-right:6px;">#' + e(q.quote_number) + '</span>' + e(q.client_name || '') + ' — ' + e([q.street, q.city].filter(Boolean).join(', ')); }
    function qmeta(q, extra) { var t = Number(q.total) ? M(q.total) : '<span style="color:var(--red);">$0 — needs a price</span>'; var days = D(q.created_at); return t + ' · ' + days + ' d' + (q.client_phone ? ' · ' + e(q.client_phone) : '') + (extra || ''); }

    html += EstimatesPage._h2('🔴 Finish + send — ' + drafts.length + ' drafts', 'var(--red)');
    if (!drafts.length) html += '<div style="padding:8px 12px;color:var(--text-light);font-size:13px;">No drafts. Nice.</div>';
    drafts.forEach(function(q) { html += EstimatesPage._card(qtitle(q), qmeta(q), 'Draft — finish and send from Jobber.', 'hot', EstimatesPage._qlink(q)); });

    html += EstimatesPage._h2('🟢 Out and waiting — ' + open.length + ' quotes · ' + M(sum(open)), 'var(--accent)');
    html += '<div style="font-size:12px;color:var(--text-light);padding:0 4px 4px;">Newest first. Over 21 days: one follow-up text. Over 60: archive or one last call.</div>';
    open.forEach(function(q) { var days = D(q.created_at); html += EstimatesPage._card(qtitle(q), qmeta(q, q.status === 'changes_requested' ? ' · <b style="color:var(--orange,#e79a5c);">changes requested</b>' : ''), null, days <= 21 ? 'go' : '', EstimatesPage._qlink(q)); });

    html += EstimatesPage._h2('📞 Website leads with no quote — ' + d.requests.length, 'var(--accent)');
    if (!d.requests.length) html += '<div style="padding:8px 12px;color:var(--text-light);font-size:13px;">None open in Jobber. (Branch Manager requests: see Requests.)</div>';
    d.requests.forEach(function(r) { html += EstimatesPage._card(e(r.client_name || '') + ' — ' + e([r.street, r.city].filter(Boolean).join(', ')), 'requested ' + EstimatesPage._fmt(r.created_at) + (r.title ? ' · ' + e(r.title) : ''), null, 'go', 'https://secure.getjobber.com/requests'); });

    var booked = d.jobs.filter(function(j) { return j.status === 'upcoming' || j.status === 'unscheduled' || j.status === 'today' || j.status === 'active' || j.status === 'action_required' || j.status === 'on_hold'; });
    booked.sort(function(a, b) { return (a.start_at || '9') < (b.start_at || '9') ? -1 : 1; });
    html += EstimatesPage._h2('🚗 Booked in Jobber — ' + booked.length, '#1565c0');
    booked.forEach(function(j) { html += EstimatesPage._card('<span style="font-family:ui-monospace,Menlo,monospace;font-size:11px;background:var(--bg);border:1px solid var(--border);padding:1px 6px;border-radius:4px;margin-right:6px;">J#' + e(j.job_number) + '</span>' + e(j.client_name || '') + ' — ' + e([j.street, j.city].filter(Boolean).join(', ')), (j.start_at ? 'Scheduled ' + EstimatesPage._fmt(j.start_at) + (j.end_at && j.end_at.slice(0, 10) !== j.start_at.slice(0, 10) ? '–' + EstimatesPage._fmt(j.end_at) : '') : '<b style="color:var(--red);">UNSCHEDULED</b>') + ' · ' + M(j.total) + (j.title ? ' · ' + e(j.title) : ''), null, 'go', 'https://secure.getjobber.com/work_orders'); });

    html += EstimatesPage._h2('💰 Money waiting in Jobber — ' + M(d.invoices.reduce(function(s, i) { return s + (Number(i.balance) || 0); }, 0)), '#e6a817');
    if (!d.invoices.length) html += '<div style="padding:8px 12px;color:var(--text-light);font-size:13px;">Every Jobber invoice is paid. Branch Manager invoices live under Invoices.</div>';
    d.invoices.forEach(function(i) { html += EstimatesPage._card('#' + e(i.invoice_number) + ' ' + e(i.client_name || '') + (i.subject && i.subject !== 'For Services Rendered' ? ' — ' + e(i.subject) : ''), M(i.balance) + ' left of ' + M(i.total) + ' · ' + e(i.status) + (i.issued_date ? ' · issued ' + EstimatesPage._fmt(i.issued_date) : ' · <b style="color:var(--red);">never issued</b>'), null, 'hot', 'https://secure.getjobber.com/invoices'); });

    if (older.length) {
      html += EstimatesPage._h2('🗄 Older open quotes — ' + older.length + ' · ' + M(sum(older)), 'var(--text-light)');
      html += '<div style="font-size:13px;line-height:1.7;padding:4px 12px;color:var(--text-light);">' + older.map(function(q) { return '<a href="' + e(EstimatesPage._qlink(q)) + '" target="_blank" rel="noopener" style="color:inherit;">#' + e(q.quote_number) + ' ' + e(q.client_name || '') + ' ' + M(q.total) + ' (' + D(q.created_at) + 'd)</a>'; }).join(' · ') + '<div style="margin-top:4px;">One text each, or archive as lost.</div></div>';
    }
    return html + '</div>';
  }
};
