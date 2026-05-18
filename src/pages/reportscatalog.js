/**
 * Branch Manager — Reports Catalog
 * Jobber-parity report directory with sales tax counter + due-date alerts.
 *
 * Lives as the default tab in ReportsHub (renamed from "Overview"). Each
 * card opens an inline detail view that lists matching rows and offers
 * a CSV download. Long-running data is computed lazily on click.
 *
 * v760 — initial catalog. Replaces the bare ReportsPage as the entry.
 */
var ReportsCatalog = {
  _activeReport: null,

  render: function() {
    if (ReportsCatalog._activeReport) {
      return ReportsCatalog._renderReport(ReportsCatalog._activeReport);
    }
    var html = '';
    // Sales tax counter banner (always visible at the top of the catalog)
    html += SalesTaxCounter.renderBanner();
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;align-items:start;max-width:1180px;">';
    html +=   ReportsCatalog._section('Financial reports', [
      ['taxation',          'Taxation',             'Sales tax collected + remitted, by quarter and rate'],
      ['projected_income',  'Projected income',     'Sent + approved quotes plus draft invoices'],
      ['aged_receivables',  'Aged receivables',     'Invoices late by 30 / 60 / 90+ days'],
      ['bad_debt',          'Bad debt',             'Invoices written off as uncollectible'],
      ['client_balance',    'Client balance summary','Outstanding balance per client'],
      ['transactions',      'Transactions',         'Every payment / deposit / refund'],
    ]);
    html +=   ReportsCatalog._section('Work reports', [
      ['quotes_report',     'Quotes',               'Status mix, conversion rate, value won/lost'],
      ['visits_report',     'Visits',               'Jobs with scheduled visits in a date range'],
      ['recurring_jobs',    'Recurring jobs',       'Active recurring schedules + projected revenue'],
      ['requests_report',   'Requests & assessments','Inbound requests with status + age'],
      ['products_services', 'Products & Services',  'Line-item usage across quotes, jobs, invoices'],
      ['team_productivity', 'Team productivity',    'Per-crew hours, revenue/hr, rating'],
      ['salesperson',       'Salesperson performance','Per-rep quote → win rate + revenue'],
      ['timesheets',        'Timesheets',           'Tracked hours by employee + week'],
    ]);
    html +=   ReportsCatalog._section('Client reports', [
      ['clients_full',      'Clients',              'Full client list with lead source + status'],
      ['lead_source',       'Lead source revenue',  'Revenue closed by acquisition channel'],
      ['client_comms',      'Client communications','SMS + email + call counts per client'],
      ['property_list',     'Property list',        'Every property address with linked client'],
      ['contact_info',      'Client contact info',  'Name · phone · email · status, CSV-ready'],
      ['re_engagement',     'Client re-engagement', 'Clients with no closed job in 12 months'],
    ]);
    html += '</div>';

    html += '<div style="max-width:1180px;margin-top:24px;">'
      + '<h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-light);margin:0 0 10px;">Custom BM reports</h3>'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 18px;font-size:13px;color:var(--text-light);">'
      +   'These deeper reports live in their own tabs above: '
      +   '<a onclick="window._reportsTab=\'insights\';loadPage(\'reports\')" style="color:var(--accent);cursor:pointer;">Insights</a> · '
      +   '<a onclick="window._reportsTab=\'profitloss\';loadPage(\'reports\')" style="color:var(--accent);cursor:pointer;">Profit &amp; Loss</a> · '
      +   '<a onclick="window._reportsTab=\'expenses\';loadPage(\'reports\')" style="color:var(--accent);cursor:pointer;">Expenses</a> · '
      +   '<a onclick="window._reportsTab=\'jobcosting\';loadPage(\'reports\')" style="color:var(--accent);cursor:pointer;">Job Costing</a> · '
      +   '<a onclick="window._reportsTab=\'budget\';loadPage(\'reports\')" style="color:var(--accent);cursor:pointer;">Budget</a> · '
      +   '<a onclick="window._reportsTab=\'weeklysummary\';loadPage(\'reports\')" style="color:var(--accent);cursor:pointer;">Weekly Summary</a> · '
      +   '<a onclick="window._reportsTab=\'export\';loadPage(\'reports\')" style="color:var(--accent);cursor:pointer;">Aging + P&amp;L Export</a>.'
      + '</div>'
      + '</div>';

    html += '<div style="max-width:1180px;margin-top:18px;font-size:12px;color:var(--text-light);">'
      +   '<details><summary style="cursor:pointer;font-weight:600;">Why a few Jobber reports aren\'t here</summary>'
      +   '<ul style="margin:8px 0 0 18px;line-height:1.7;">'
      +     '<li><b>One-off jobs</b> — BM treats every job as one-off unless it\'s linked to a Recurring schedule, so the Jobs list IS the one-off report.</li>'
      +     '<li><b>Job follow-up emails</b> — every send is already logged in the Automations activity log; a separate list adds zero info.</li>'
      +     '<li><b>Checklists</b> — checklists live on each job. A cross-job aggregated report is low-utility unless you need a compliance attestation; ask if you do.</li>'
      +     '<li><b>Waypoints (GPS)</b> — raw waypoint rows are already aggregated into per-truck-day windows on TimeTrack → Truck Hours. A flat-CSV dump is available there as Export.</li>'
      +   '</ul>'
      +   '</details>'
      + '</div>';

    return html;
  },

  _section: function(title, items) {
    var html = '<div>'
      + '<h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-light);margin:0 0 10px;">' + title + '</h3>'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">';
    items.forEach(function(row, idx) {
      var isLast = idx === items.length - 1;
      html += '<div onclick="ReportsCatalog.open(\'' + row[0] + '\')" '
        + 'style="padding:14px 16px;cursor:pointer;' + (isLast ? '' : 'border-bottom:1px solid var(--border);') + '" '
        + 'onmouseover="this.style.background=\'var(--surface)\'" onmouseout="this.style.background=\'\'">'
        + '<div style="font-size:14px;font-weight:700;color:var(--text);">' + row[1] + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">' + row[2] + '</div>'
        + '</div>';
    });
    html += '</div></div>';
    return html;
  },

  open: function(key) {
    ReportsCatalog._activeReport = key;
    loadPage('reports');
  },

  back: function() {
    ReportsCatalog._activeReport = null;
    loadPage('reports');
  },

  _renderReport: function(key) {
    var title = ReportsCatalog._title(key);
    var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">'
      + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
      +   '<button onclick="ReportsCatalog.back()" class="btn btn-outline" style="font-size:12px;padding:6px 12px;">← Catalog</button>'
      +   '<h2 style="font-size:18px;margin:0;">' + UI.esc(title) + '</h2>'
      + '</div>'
      + '<button onclick="ReportsCatalog.exportCSV(\'' + key + '\')" class="btn btn-outline" style="font-size:12px;">📥 Export CSV</button>'
      + '</div>';
    try {
      html += ReportsCatalog._renderBody(key);
    } catch (e) {
      html += '<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:14px;">Report failed: ' + UI.esc(e.message) + '</div>';
    }
    return html;
  },

  _title: function(key) {
    var TITLES = {
      taxation: 'Taxation', projected_income: 'Projected income', aged_receivables: 'Aged receivables',
      bad_debt: 'Bad debt', client_balance: 'Client balance summary', transactions: 'Transactions',
      quotes_report: 'Quotes', visits_report: 'Visits', recurring_jobs: 'Recurring jobs',
      requests_report: 'Requests & assessments', products_services: 'Products & Services',
      team_productivity: 'Team productivity', salesperson: 'Salesperson performance',
      timesheets: 'Timesheets', clients_full: 'Clients', lead_source: 'Lead source revenue',
      client_comms: 'Client communications', property_list: 'Property list',
      contact_info: 'Client contact info', re_engagement: 'Client re-engagement'
    };
    return TITLES[key] || key;
  },

  // ── Body builders ─────────────────────────────────────────────────────────
  _renderBody: function(key) {
    if (key === 'taxation')          return ReportsCatalog._reportTaxation();
    if (key === 'bad_debt')          return ReportsCatalog._reportBadDebt();
    if (key === 'client_balance')    return ReportsCatalog._reportClientBalance();
    if (key === 'projected_income')  return ReportsCatalog._reportProjectedIncome();
    if (key === 'lead_source')       return ReportsCatalog._reportLeadSource();
    if (key === 'property_list')     return ReportsCatalog._reportPropertyList();
    if (key === 're_engagement')     return ReportsCatalog._reportReEngagement();
    if (key === 'products_services') return ReportsCatalog._reportProductsServices();
    if (key === 'salesperson')       return ReportsCatalog._reportSalesperson();
    if (key === 'client_comms')      return ReportsCatalog._reportClientComms();
    if (key === 'quotes_report')     return ReportsCatalog._reportQuotes();
    if (key === 'visits_report')     return ReportsCatalog._reportVisits();
    if (key === 'requests_report')   return ReportsCatalog._reportRequests();
    // Pass-throughs that just deep-link to existing pages
    if (key === 'aged_receivables')  { window._reportsTab = 'export'; setTimeout(function() { loadPage('reports'); }, 0); return ''; }
    if (key === 'transactions')      { window._reportsTab = 'payments'; setTimeout(function() { loadPage('reports'); }, 0); return ''; }
    if (key === 'recurring_jobs')    { setTimeout(function() { loadPage('recurring'); }, 0); return ''; }
    if (key === 'team_productivity') { setTimeout(function() { loadPage('crewperformance'); }, 0); return ''; }
    if (key === 'timesheets')        { window._payrollTab = 'timesheets'; setTimeout(function() { loadPage('payroll'); }, 0); return ''; }
    if (key === 'clients_full' || key === 'contact_info') { setTimeout(function() { loadPage('clients'); }, 0); return ''; }
    return '<div style="color:var(--text-light);">No body for ' + UI.esc(key) + '.</div>';
  },

  // ── Taxation — quarterly + monthly totals + by-rate breakdown ────────────
  _reportTaxation: function() {
    var rows = SalesTaxCounter._invoiceTaxRows();
    var now = new Date();
    var yr = now.getFullYear();
    var lastYr = yr - 1;
    var byQuarter = { q1: 0, q2: 0, q3: 0, q4: 0 };
    var byRate = {};
    var thisYearTotal = 0, lastYearTotal = 0;
    rows.forEach(function(r) {
      var d = new Date(r.date);
      if (isNaN(d)) return;
      var ry = d.getFullYear();
      var rq = Math.floor(d.getMonth() / 3) + 1;
      if (ry === yr) {
        thisYearTotal += r.tax;
        byQuarter['q' + rq] = (byQuarter['q' + rq] || 0) + r.tax;
        var rateKey = (r.rate ? r.rate.toFixed(3) : '0.000') + '%';
        byRate[rateKey] = (byRate[rateKey] || 0) + r.tax;
      } else if (ry === lastYr) {
        lastYearTotal += r.tax;
      }
    });

    var html = SalesTaxCounter.renderDetail();
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-top:16px;">'
      + '<h4 style="margin:0 0 12px;font-size:14px;">Sales tax collected — ' + yr + '</h4>'
      + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px;">';
    ['q1','q2','q3','q4'].forEach(function(q, idx) {
      var qNames = ['Q1 (Mar–May)', 'Q2 (Jun–Aug)', 'Q3 (Sep–Nov)', 'Q4 (Dec–Feb)'];
      html += '<div style="text-align:center;padding:10px;background:var(--bg);border-radius:8px;">'
        + '<div style="font-size:11px;color:var(--text-light);">' + qNames[idx] + '</div>'
        + '<div style="font-size:18px;font-weight:800;">' + UI.money(byQuarter[q]) + '</div>'
        + '</div>';
    });
    html += '</div>'
      + '<div style="font-size:13px;color:var(--text-light);">' + yr + ' total: <b style="color:var(--text);">' + UI.money(thisYearTotal) + '</b> · ' + lastYr + ' total: <b style="color:var(--text);">' + UI.money(lastYearTotal) + '</b></div>';
    html += '</div>';

    // By rate
    var rateKeys = Object.keys(byRate).sort();
    if (rateKeys.length) {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-top:16px;">'
        + '<h4 style="margin:0 0 8px;font-size:14px;">' + yr + ' — by tax rate</h4>'
        + '<table class="data-table" style="width:auto;"><thead><tr><th>Rate</th><th style="text-align:right;">Collected</th></tr></thead><tbody>';
      rateKeys.forEach(function(k) {
        html += '<tr><td>' + UI.esc(k) + '</td><td style="text-align:right;font-weight:600;">' + UI.money(byRate[k]) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    return html;
  },

  _reportBadDebt: function() {
    var rows = DB.invoices.getAll().filter(function(i) {
      return i.status === 'bad_debt' || i.status === 'written_off' || (i.notes && /bad debt|write[- ]?off/i.test(i.notes));
    });
    if (!rows.length) return '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:30px;text-align:center;color:var(--text-light);">No bad-debt invoices on file. Mark an invoice as <code>bad_debt</code> from its detail page to write it off.</div>';
    var total = rows.reduce(function(s,i){ return s + (Number(i.total)||0); }, 0);
    var html = '<div style="margin-bottom:10px;font-size:14px;"><b>' + rows.length + '</b> invoice' + (rows.length===1?'':'s') + ' · <b>' + UI.money(total) + '</b> written off</div>';
    html += ReportsCatalog._renderTable(['#','Client','Date','Balance','Notes'], rows.map(function(i){
      return ['#'+(i.invoiceNumber||''), i.clientName||'—', UI.dateShort(i.createdAt), UI.money(i.balance||i.total||0), (i.notes||'').slice(0,100)];
    }));
    return html;
  },

  _reportClientBalance: function() {
    var inv = DB.invoices.getAll().filter(function(i){ return i.status !== 'paid' && (Number(i.total)||0) > 0 && i.status !== 'cancelled' && i.status !== 'bad_debt'; });
    var byClient = {};
    inv.forEach(function(i) {
      var key = i.clientId || ('name:' + (i.clientName||''));
      if (!byClient[key]) byClient[key] = { name: i.clientName || '—', clientId: i.clientId || null, count: 0, balance: 0, oldest: null };
      byClient[key].count++;
      byClient[key].balance += Number(i.balance || i.total || 0);
      var d = i.dueDate || i.createdAt;
      if (d && (!byClient[key].oldest || d < byClient[key].oldest)) byClient[key].oldest = d;
    });
    var arr = Object.values(byClient).sort(function(a,b){ return b.balance - a.balance; });
    if (!arr.length) return '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:30px;text-align:center;color:var(--accent);font-weight:600;">No outstanding balances. Every client is paid in full ✓</div>';
    var grand = arr.reduce(function(s,c){ return s + c.balance; }, 0);
    var html = '<div style="margin-bottom:10px;font-size:14px;"><b>' + arr.length + '</b> client' + (arr.length===1?'':'s') + ' owe <b>' + UI.money(grand) + '</b></div>';
    html += ReportsCatalog._renderTable(['Client','Open invoices','Oldest','Balance'], arr.map(function(c){
      return [c.name, c.count, c.oldest ? UI.dateShort(c.oldest) : '—', UI.money(c.balance)];
    }));
    return html;
  },

  _reportProjectedIncome: function() {
    var quotes = DB.quotes.getAll().filter(function(q){ return q.status === 'sent' || q.status === 'awaiting' || q.status === 'approved'; });
    var draftInv = DB.invoices.getAll().filter(function(i){ return i.status === 'draft' || i.status === 'sent' || i.status === 'partial'; });
    var quoteTotal = quotes.reduce(function(s,q){ return s + (Number(q.total)||0); }, 0);
    var invoiceTotal = draftInv.reduce(function(s,i){ return s + (Number(i.balance||i.total)||0); }, 0);
    var grand = quoteTotal + invoiceTotal;
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center;"><div style="font-size:11px;color:var(--text-light);">Open quotes</div><div style="font-size:22px;font-weight:800;">' + UI.money(quoteTotal) + '</div><div style="font-size:11px;color:var(--text-light);">' + quotes.length + ' quote' + (quotes.length===1?'':'s') + '</div></div>'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center;"><div style="font-size:11px;color:var(--text-light);">Unpaid invoices</div><div style="font-size:22px;font-weight:800;">' + UI.money(invoiceTotal) + '</div><div style="font-size:11px;color:var(--text-light);">' + draftInv.length + ' invoice' + (draftInv.length===1?'':'s') + '</div></div>'
      + '<div style="background:var(--green-bg);border:1px solid var(--green-dark);border-radius:10px;padding:14px;text-align:center;"><div style="font-size:11px;color:var(--green-dark);text-transform:uppercase;">Projected total</div><div style="font-size:22px;font-weight:800;color:var(--green-dark);">' + UI.money(grand) + '</div></div>'
      + '</div>';
    if (quotes.length) {
      html += '<h4 style="margin:14px 0 8px;font-size:14px;">Open quotes</h4>'
        + ReportsCatalog._renderTable(['#','Client','Status','Total'], quotes.sort(function(a,b){return (b.total||0)-(a.total||0);}).map(function(q){
          return ['#'+(q.quoteNumber||''), q.clientName||'—', q.status||'', UI.money(q.total||0)];
        }));
    }
    return html;
  },

  _reportLeadSource: function() {
    var clients = DB.clients.getAll();
    var invoices = DB.invoices.getAll().filter(function(i){ return i.status === 'paid'; });
    var bySrc = {};
    clients.forEach(function(c) {
      var src = (c.source || c.leadSource || 'Unknown').trim();
      if (!bySrc[src]) bySrc[src] = { name: src, clients: 0, revenue: 0 };
      bySrc[src].clients++;
    });
    invoices.forEach(function(i) {
      var c = i.clientId && clients.find(function(x){ return x.id === i.clientId; });
      var src = (c && (c.source || c.leadSource)) || 'Unknown';
      if (!bySrc[src]) bySrc[src] = { name: src, clients: 0, revenue: 0 };
      bySrc[src].revenue += Number(i.total) || 0;
    });
    var arr = Object.values(bySrc).sort(function(a,b){ return b.revenue - a.revenue; });
    if (!arr.length) return '<div style="color:var(--text-light);padding:20px;">No client data yet.</div>';
    return ReportsCatalog._renderTable(['Source','Clients','Revenue (closed)'], arr.map(function(s){
      return [s.name, s.clients, UI.money(s.revenue)];
    }));
  },

  _reportPropertyList: function() {
    var clients = DB.clients.getAll();
    var rows = [];
    clients.forEach(function(c) {
      if (c.address) rows.push({ address: c.address, client: c.name, clientId: c.id, status: c.status||'' });
      // Some clients have additional properties array
      (c.properties || []).forEach(function(p) {
        if (p && p.address) rows.push({ address: p.address, client: c.name, clientId: c.id, status: c.status||'' });
      });
    });
    rows.sort(function(a,b){ return (a.address||'').localeCompare(b.address||''); });
    if (!rows.length) return '<div style="color:var(--text-light);padding:20px;">No property addresses on file.</div>';
    return '<div style="margin-bottom:10px;font-size:14px;"><b>' + rows.length + '</b> propert' + (rows.length===1?'y':'ies') + '</div>'
      + ReportsCatalog._renderTable(['Address','Client','Status'], rows.map(function(r){
        return [r.address, r.client, r.status];
      }));
  },

  _reportReEngagement: function() {
    var cutoff = new Date(Date.now() - 365 * 86400000).toISOString();
    var clients = DB.clients.getAll();
    var jobs = DB.jobs.getAll().filter(function(j){ return j.status === 'completed'; });
    var lastJobByClient = {};
    jobs.forEach(function(j) {
      var d = j.completedDate || j.scheduledDate || j.createdAt || '';
      var k = j.clientId;
      if (!k) return;
      if (!lastJobByClient[k] || d > lastJobByClient[k]) lastJobByClient[k] = d;
    });
    var quiet = clients.filter(function(c) {
      if (!c || !c.id) return false;
      if (c.status === 'inactive' || c.status === 'archived') return false;
      var last = lastJobByClient[c.id];
      return !last || last < cutoff;
    });
    quiet.sort(function(a,b){
      var la = lastJobByClient[a.id] || '';
      var lb = lastJobByClient[b.id] || '';
      return la.localeCompare(lb);
    });
    if (!quiet.length) return '<div style="color:var(--accent);padding:20px;font-weight:600;">Every active client has had work within the last 12 months ✓</div>';
    return '<div style="margin-bottom:10px;font-size:14px;"><b>' + quiet.length + '</b> client' + (quiet.length===1?'':'s') + ' haven\'t had a closed job in 12+ months — reach out before the season starts.</div>'
      + ReportsCatalog._renderTable(['Client','Last job','Phone','Email'], quiet.map(function(c){
        return [c.name||'—', lastJobByClient[c.id] ? UI.dateShort(lastJobByClient[c.id]) : 'never', c.phone||'', c.email||''];
      }));
  },

  _reportProductsServices: function() {
    var stats = {};
    var bump = function(name, src, qty, amount) {
      if (!name) return;
      if (!stats[name]) stats[name] = { name: name, quoted: 0, jobbed: 0, invoiced: 0, revenue: 0 };
      stats[name][src] += Number(qty) || 1;
      if (src === 'invoiced') stats[name].revenue += Number(amount) || 0;
    };
    DB.quotes.getAll().forEach(function(q) {
      (q.lineItems || []).forEach(function(li) { bump(li.service || li.description, 'quoted', li.qty || 1, 0); });
    });
    DB.jobs.getAll().forEach(function(j) {
      (j.lineItems || []).forEach(function(li) { bump(li.service || li.description, 'jobbed', li.qty || 1, 0); });
    });
    DB.invoices.getAll().filter(function(i){ return i.status === 'paid'; }).forEach(function(i) {
      (i.lineItems || []).forEach(function(li) { bump(li.service || li.description, 'invoiced', li.qty || 1, (li.qty||1) * (li.rate||0)); });
    });
    var arr = Object.values(stats).sort(function(a,b){ return b.revenue - a.revenue; });
    if (!arr.length) return '<div style="color:var(--text-light);padding:20px;">No line-item data yet.</div>';
    return ReportsCatalog._renderTable(['Service / product','Quoted','In jobs','Invoiced (paid)','Revenue'], arr.map(function(s){
      return [s.name, s.quoted, s.jobbed, s.invoiced, UI.money(s.revenue)];
    }));
  },

  _reportSalesperson: function() {
    var quotes = DB.quotes.getAll();
    var byRep = {};
    quotes.forEach(function(q) {
      var rep = q.salesperson || q.createdBy || q.owner || 'Unassigned';
      if (!byRep[rep]) byRep[rep] = { name: rep, sent: 0, won: 0, lost: 0, value: 0, wonValue: 0 };
      var s = (q.status || '').toLowerCase();
      if (s === 'sent' || s === 'awaiting' || s === 'approved' || s === 'converted' || s === 'declined' || s === 'lost') {
        byRep[rep].sent++;
        byRep[rep].value += Number(q.total) || 0;
        if (s === 'approved' || s === 'converted') {
          byRep[rep].won++;
          byRep[rep].wonValue += Number(q.total) || 0;
        }
        if (s === 'declined' || s === 'lost') byRep[rep].lost++;
      }
    });
    var arr = Object.values(byRep).sort(function(a,b){ return b.wonValue - a.wonValue; });
    if (!arr.length) return '<div style="color:var(--text-light);padding:20px;">No quote activity yet.</div>';
    return ReportsCatalog._renderTable(['Salesperson','Sent','Won','Lost','Win rate','Won value'], arr.map(function(s){
      var rate = s.sent > 0 ? Math.round((s.won / s.sent) * 100) + '%' : '—';
      return [s.name, s.sent, s.won, s.lost, rate, UI.money(s.wonValue)];
    }));
  },

  _reportClientComms: function() {
    var clients = DB.clients.getAll();
    var rows = [];
    clients.forEach(function(c) {
      var comms = (typeof CommsLog !== 'undefined' && CommsLog.getAll) ? CommsLog.getAll(c.id) : [];
      if (!comms.length) return;
      var bySrc = { sms:0, email:0, call:0, note:0 };
      comms.forEach(function(m) { var t = m.type || 'note'; bySrc[t] = (bySrc[t]||0) + 1; });
      var last = comms[0]; // CommsLog returns most-recent first
      rows.push({
        name: c.name || '—', total: comms.length,
        sms: bySrc.sms, email: bySrc.email, call: bySrc.call, note: bySrc.note,
        lastDate: last && last.date, lastType: last && last.type
      });
    });
    rows.sort(function(a,b){ return b.total - a.total; });
    if (!rows.length) return '<div style="color:var(--text-light);padding:20px;">No communications logged yet.</div>';
    return ReportsCatalog._renderTable(['Client','Total','SMS','Email','Call','Note','Last contact'], rows.map(function(r){
      return [r.name, r.total, r.sms, r.email, r.call, r.note, r.lastDate ? UI.dateShort(r.lastDate) + ' · ' + (r.lastType||'') : '—'];
    }));
  },

  _reportQuotes: function() {
    var q = DB.quotes.getAll();
    var counts = {};
    var values = {};
    q.forEach(function(x) {
      var s = (x.status || 'draft').toLowerCase();
      counts[s] = (counts[s]||0) + 1;
      values[s] = (values[s]||0) + (Number(x.total)||0);
    });
    var keys = ['draft','sent','awaiting','approved','converted','declined','lost'];
    var rows = keys.filter(function(k){ return counts[k]; }).map(function(k){
      return [k, counts[k]||0, UI.money(values[k]||0)];
    });
    var total = Object.values(counts).reduce(function(a,b){return a+b;},0);
    var sent = (counts.sent||0)+(counts.awaiting||0)+(counts.approved||0)+(counts.converted||0)+(counts.declined||0)+(counts.lost||0);
    var won = (counts.approved||0)+(counts.converted||0);
    var winRate = sent > 0 ? Math.round((won/sent)*100) + '%' : '—';
    var html = '<div style="margin-bottom:12px;font-size:14px;"><b>' + total + '</b> total · win rate: <b>' + winRate + '</b></div>';
    return html + ReportsCatalog._renderTable(['Status','Count','Total value'], rows);
  },

  _reportVisits: function() {
    var jobs = DB.jobs.getAll().filter(function(j){ return j.scheduledDate; });
    jobs.sort(function(a,b){ return (b.scheduledDate||'').localeCompare(a.scheduledDate||''); });
    if (!jobs.length) return '<div style="color:var(--text-light);padding:20px;">No scheduled jobs yet.</div>';
    return ReportsCatalog._renderTable(['Date','#','Client','Status','Total'], jobs.slice(0, 200).map(function(j){
      return [UI.dateShort(j.scheduledDate), '#'+(j.jobNumber||''), j.clientName||'—', j.status||'', UI.money(j.total||0)];
    }));
  },

  _reportRequests: function() {
    var r = DB.requests.getAll();
    r.sort(function(a,b){ return (b.createdAt||'').localeCompare(a.createdAt||''); });
    if (!r.length) return '<div style="color:var(--text-light);padding:20px;">No requests yet.</div>';
    return ReportsCatalog._renderTable(['Date','Client','Source','Status','Notes'], r.map(function(x){
      return [UI.dateShort(x.createdAt), x.clientName||'—', x.source||'', x.status||'', (x.notes||'').slice(0,80)];
    }));
  },

  _renderTable: function(headers, rows) {
    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:auto;">'
      + '<table class="data-table" style="width:100%;font-size:13px;"><thead><tr>';
    headers.forEach(function(h, idx) { html += '<th style="text-align:' + (idx > 0 && idx === headers.length - 1 ? 'right' : 'left') + ';">' + UI.esc(h) + '</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach(function(r) {
      html += '<tr>';
      r.forEach(function(v, idx) {
        var align = idx > 0 && idx === r.length - 1 ? 'right' : 'left';
        html += '<td style="text-align:' + align + ';">' + UI.esc(String(v == null ? '' : v)) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  },

  exportCSV: function(key) {
    // Naive CSV export — re-runs the report and dumps the table.
    var body = ReportsCatalog._renderBody(key);
    if (!body) { UI.toast('Nothing to export', 'error'); return; }
    var doc = new DOMParser().parseFromString(body, 'text/html');
    var rows = [];
    var headers = Array.from(doc.querySelectorAll('thead th')).map(function(th){ return th.textContent.trim(); });
    if (headers.length) rows.push(headers);
    doc.querySelectorAll('tbody tr').forEach(function(tr) {
      rows.push(Array.from(tr.children).map(function(td){ return td.textContent.trim(); }));
    });
    if (!rows.length) { UI.toast('No table data to export', 'error'); return; }
    var csv = rows.map(function(r) {
      return r.map(function(c) {
        var s = String(c||'');
        if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      }).join(',');
    }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'report-' + key + '-' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    UI.toast('Exported ' + key + '.csv');
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Sales Tax Counter — live tally + due-date alerts.
//
// NY State Sales Tax: quarterly returns due the 20th of the month following
// the quarter end. Quarters: Mar 1–May 31 → due Jun 20; Jun 1–Aug 31 → due
// Sep 20; Sep 1–Nov 30 → due Dec 20; Dec 1–Feb 28 → due Mar 20.
//
// Doug's reminder cadence: 1st, 15th, 19th of the filing month show
// progressively louder banners. Source: NY Dept of Taxation, Publication 75.
// ─────────────────────────────────────────────────────────────────────────────
var SalesTaxCounter = {
  // NY Sales Tax quarter boundaries + filing-due months.
  // Returns: { qStart, qEnd, dueDate, label } for the current open quarter
  // (quarter that hasn't been filed yet — usually the just-ended one).
  _filingPeriod: function(now) {
    now = now || new Date();
    var y = now.getFullYear();
    var m = now.getMonth(); // 0=Jan
    // Define quarters in (startMonth, endMonth, dueMonth, dueYearOffset)
    var quarters = [
      { startM: 2, endM: 4, dueM: 5, name: 'Q1 (Mar–May)' },   // Mar–May, due Jun 20
      { startM: 5, endM: 7, dueM: 8, name: 'Q2 (Jun–Aug)' },   // Jun–Aug, due Sep 20
      { startM: 8, endM: 10, dueM: 11, name: 'Q3 (Sep–Nov)' }, // Sep–Nov, due Dec 20
      { startM: 11, endM: 1, dueM: 2,  name: 'Q4 (Dec–Feb)', dueOffset: 1 } // Dec–Feb, due Mar 20 (next year)
    ];
    // Pick the quarter whose due date is the next upcoming one
    var picks = quarters.map(function(q) {
      var sY = q.startM === 11 ? y - 1 : y; // Q4 starts in prior year if we're in Jan/Feb
      // But if we're past Feb of `y` and m >= startM, the quarter is in `y`
      var startYear = y;
      if (q.startM === 11 && m < 2) startYear = y - 1;
      if (q.startM > m && q.startM !== 11) startYear = y - 1;
      var endYear = startYear;
      if (q.endM < q.startM) endYear = startYear + 1;
      var dueYear = endYear + (q.dueOffset || 0);
      // Adjust: due month is right after end month, so:
      var dueY = endYear;
      if (q.startM === 11) dueY = endYear; // Mar of next year
      var qStart = new Date(startYear, q.startM, 1);
      var qEnd = new Date(endYear, q.endM + 1, 0); // last day of endM
      var dueDate = new Date(dueY, q.dueM, 20);
      return { qStart: qStart, qEnd: qEnd, dueDate: dueDate, label: q.name };
    });
    picks.sort(function(a,b){ return a.dueDate - b.dueDate; });
    // Return the next upcoming due (or today's filing period if we're in the filing month)
    for (var i = 0; i < picks.length; i++) {
      var p = picks[i];
      // If quarter has ended and due date hasn't passed yet, that's the open period
      if (now >= p.qEnd && now <= new Date(p.dueDate.getTime() + 24*3600*1000)) return p;
    }
    // Fallback: next upcoming
    for (var i2 = 0; i2 < picks.length; i2++) {
      if (picks[i2].dueDate >= now) return picks[i2];
    }
    return picks[0];
  },

  // Pull tax dollars from paid invoices in a [start,end] window.
  _collectedBetween: function(start, end) {
    var rows = SalesTaxCounter._invoiceTaxRows();
    return rows.filter(function(r) {
      var d = new Date(r.date);
      return d >= start && d <= end;
    }).reduce(function(s,r){ return s + r.tax; }, 0);
  },

  // Build the canonical tax-rows list: every PAID invoice with its tax dollars.
  // Date used = paidDate if available, else createdAt — matches when the
  // money was actually collected (which is what NY taxes).
  _invoiceTaxRows: function() {
    return DB.invoices.getAll().filter(function(i) {
      return i.status === 'paid' && (Number(i.taxAmount) || 0) > 0;
    }).map(function(i) {
      return {
        id: i.id,
        date: i.paidDate || i.paidAt || i.createdAt,
        tax: Number(i.taxAmount) || 0,
        rate: Number(i.taxRate) || 0
      };
    });
  },

  // Supported sales-tax jurisdictions. Only NY is modeled (quarterly,
  // Pub-75 cadence — the _filingPeriod math above is NY-specific). This
  // map exists so the banner is jurisdiction-driven instead of NY strings
  // baked into the markup; adding a state later = add an entry + its
  // filing-period math.
  _JURISDICTIONS: {
    NY: {
      label: 'NY Sales Tax',
      authority: 'NYS',
      fileUrl: 'https://www.tax.ny.gov/bus/st/stidx.htm',
      fileLabel: 'File at tax.ny.gov →'
    }
  },

  // Which jurisdiction THIS tenant files in — or null (→ no banner).
  // White-label safe: only TENANT-OWNED data is consulted, never the
  // app's build-time BM_CONFIG default (that is SNT's NY address baked
  // into the shared bundle — it is the SAME for every tenant, so it is
  // NOT a per-tenant signal and must not drive this). Detection order:
  //   1. explicit setting bm-sales-tax-state ('NY' on, 'none'/'off' off)
  //   2. infer from the tenant's OWN saved company address
  //      (", NY" / "New York" / NY ZIP)
  //   3. otherwise null (default for new / unconfigured / out-of-NY)
  _jurisdiction: function() {
    var jx = '';
    try { jx = (localStorage.getItem('bm-sales-tax-state') || '').trim().toUpperCase(); } catch (e) {}
    if (jx === 'NONE' || jx === 'OFF') return null;
    if (jx && SalesTaxCounter._JURISDICTIONS[jx]) return jx;
    var addr = '';
    try { addr = String(localStorage.getItem('bm-co-address') || ''); } catch (e) {}
    if (!addr) return null;
    if (/(^|[\s,])NY([\s,.]|$)/i.test(addr) || /new york/i.test(addr) || /\b1[0-4]\d{3}\b/.test(addr)) return 'NY';
    return null;
  },

  // Banner that lives at the top of the Reports catalog AND on the dashboard
  // when filing is approaching.
  renderBanner: function() {
    // White-label gate: only show for a tenant that actually files in a
    // supported jurisdiction. Default (new / out-of-NY tenant) = no banner.
    var jxKey = SalesTaxCounter._jurisdiction();
    if (!jxKey) return '';
    var jx = SalesTaxCounter._JURISDICTIONS[jxKey];
    // First-run / no-revenue: never nag a tenant that has not collected any
    // sales tax yet ("$0.00 owed" before they've done anything).
    try {
      if (SalesTaxCounter._invoiceTaxRows().length === 0) return '';
    } catch (e) { return ''; }
    var now = new Date();
    var period = SalesTaxCounter._filingPeriod(now);
    if (!period) return '';
    var owed = SalesTaxCounter._collectedBetween(period.qStart, period.qEnd);
    var daysUntilDue = Math.ceil((period.dueDate - now) / (24*3600*1000));
    var inFilingMonth = now.getMonth() === period.dueDate.getMonth() && now.getFullYear() === period.dueDate.getFullYear();
    var todayDOM = now.getDate();
    var urgentToday = inFilingMonth && (todayDOM === 1 || todayDOM === 15 || todayDOM === 19 || todayDOM === 20);

    var color, bg, border, icon;
    if (urgentToday || daysUntilDue <= 2) { color = '#991b1b'; bg = '#fee2e2'; border = '#fecaca'; icon = '🚨'; }
    else if (daysUntilDue <= 7) { color = '#9a3412'; bg = '#fed7aa'; border = '#fdba74'; icon = '⚠'; }
    else if (inFilingMonth) { color = '#92400e'; bg = '#fef3c7'; border = '#fde68a'; icon = '📅'; }
    else { color = '#1e40af'; bg = '#dbeafe'; border = '#bfdbfe'; icon = '💵'; }

    var dueStr = period.dueDate.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
    var status;
    if (daysUntilDue < 0) status = '<b>OVERDUE</b> by ' + Math.abs(daysUntilDue) + ' day' + (Math.abs(daysUntilDue)===1?'':'s');
    else if (daysUntilDue === 0) status = '<b>DUE TODAY</b>';
    else status = 'Due in <b>' + daysUntilDue + ' day' + (daysUntilDue===1?'':'s') + '</b> · ' + dueStr;

    var html = '<div style="background:' + bg + ';border:1px solid ' + border + ';color:' + color + ';border-radius:12px;padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">'
      + '<div style="font-size:24px;">' + icon + '</div>'
      + '<div style="flex:1;min-width:240px;">'
      +   '<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;">' + jx.label + ' — ' + period.label + '</div>'
      +   '<div style="font-size:22px;font-weight:800;margin-top:2px;">' + UI.money(owed) + ' <span style="font-size:13px;font-weight:600;opacity:.8;">collected, owed to ' + jx.authority + '</span></div>'
      +   '<div style="font-size:13px;margin-top:2px;">' + status + '</div>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:6px;">'
      +   '<a href="' + jx.fileUrl + '" target="_blank" rel="noopener noreferrer" style="background:' + color + ';color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;">' + jx.fileLabel + '</a>'
      +   '<button onclick="ReportsCatalog.open(\'taxation\')" style="background:rgba(255,255,255,.5);color:' + color + ';border:1px solid ' + border + ';padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">Full taxation report</button>'
      + '</div>'
      + '</div>';
    return html;
  },

  // Smaller detail block for the taxation report page
  renderDetail: function() {
    var now = new Date();
    var period = SalesTaxCounter._filingPeriod(now);
    if (!period) return '';
    var owed = SalesTaxCounter._collectedBetween(period.qStart, period.qEnd);
    var lastPeriodEnd = new Date(period.qStart.getTime() - 24*3600*1000);
    var lastPeriodStart = new Date(lastPeriodEnd.getFullYear(), lastPeriodEnd.getMonth() - 2, 1);
    var lastOwed = SalesTaxCounter._collectedBetween(lastPeriodStart, lastPeriodEnd);
    var dueStr = period.dueDate.toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 18px;">'
      + '<h4 style="margin:0 0 10px;font-size:14px;">Current filing period — ' + period.label + '</h4>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'
      +   '<div><div style="font-size:11px;color:var(--text-light);">Tax owed this quarter</div><div style="font-size:22px;font-weight:800;color:var(--green-dark);">' + UI.money(owed) + '</div></div>'
      +   '<div><div style="font-size:11px;color:var(--text-light);">Last quarter</div><div style="font-size:18px;font-weight:700;">' + UI.money(lastOwed) + '</div></div>'
      +   '<div><div style="font-size:11px;color:var(--text-light);">Due date</div><div style="font-size:14px;font-weight:700;">' + dueStr + '</div></div>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);margin-top:10px;">Source: <a href="https://www.tax.ny.gov/pdf/publications/sales/pub75.pdf" target="_blank" style="color:var(--accent);">NY State Publication 75</a> — sales tax returns due 20th of the month after each quarter end.</div>'
      + '</div>';
    return html;
  }
};
