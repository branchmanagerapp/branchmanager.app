/**
 * Branch Manager — Books (Reports → Books)  v691
 *
 * QuickBooks-lite bookkeeping module. Plaid-powered bank connection,
 * auto-categorization against the Schedule-C-aligned chart of accounts,
 * and reconciliation against BM payments + expenses.
 *
 * Phase 1 (this ship): Connect bank, list accounts, list transactions
 *   with category dropdown. No reconciliation, no P&L roll-up yet.
 *
 * Backed by:
 *   - bank_accounts table
 *   - bank_transactions table
 *   - chart_of_accounts table
 *   - edge fns: plaid-link-token, plaid-exchange-token, plaid-sync-transactions
 */
var BooksPage = (function() {
  // v848: TENANT_ID is now a getter (function call), not a module-load
  // cached constant. The previous version cached at script-load time before
  // the JWT-first resolver was ready, so any non-SNT tenant froze on SNT's
  // UUID. Every read path now goes through DB.getTenantId() at runtime.
  function TENANT_ID() {
    return (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
  }

  var _accounts = null;
  var _txns = null;
  var _chart = null;
  var _taxFilings = null;
  var _allTxns = null;
  var _invoicesQ = null; // v871: invoices by quarter for sales-tax reconciliation
  var _bills = null;   // v933: calendar_events type='bill' — upcoming bills/tax for Week Ahead
  var _upJobs = null;  // v933: upcoming scheduled jobs — expected income for Week Ahead
  var _filter = { account: 'all', category: 'all', search: '', range: '90', forecast: '7', tab: 'overview' };

  function _supabase() {
    return (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
  }

  // [DEBUG v_probe] breadcrumb — localStorage survives a renderer HANG/crash, unlike console.
  function _BC(stage){ try{ localStorage.setItem('bm-books-bc', stage); localStorage.setItem('bm-books-bc-t', String(Date.now())); }catch(e){} }

  function _fetchAll() {
    var sb = _supabase();
    if (!sb) return Promise.resolve();
    var rangeDays = parseInt(_filter.range, 10) || 90;
    var since = new Date(Date.now() - rangeDays * 86400000).toISOString().split('T')[0];

    return Promise.all([
      sb.from('bank_accounts').select('*').eq('tenant_id', TENANT_ID()).eq('active', true).order('created_at'),
      sb.from('bank_transactions').select('*').eq('tenant_id', TENANT_ID()).gte('posted_date', since).order('posted_date', { ascending: false }).limit(500),
      sb.from('chart_of_accounts').select('*').eq('tenant_id', TENANT_ID()).eq('active', true).order('sort_order'),
      // v867: tax filings — for the Tax-Year Reconciliation card
      sb.from('tax_filings').select('*').eq('tenant_id', TENANT_ID()).order('tax_year').order('form_type'),
      // v867: year-level rollup for tax-year reconciliation (all-time, lean projection)
      // v887: was filtered to source like 'pdf%' which excluded Tree CC + Apple Card
      //       sources → checking-only false losses.
      // v888: was .range(0, 49999) — PostgREST hard-caps at 1000 per request
      //       regardless of range. v888 was still missing 70% of data.
      // v889: paginate in 1000-row chunks and merge.
      (async function() {
        var rows = []; var page = 0; var PG = 1000;
        while (true) {
          var r = await sb.from('bank_transactions').select('posted_date,amount,category').eq('tenant_id', TENANT_ID()).range(page * PG, (page + 1) * PG - 1);
          if (r.error) break;
          var chunk = r.data || [];
          rows = rows.concat(chunk);
          if (chunk.length < PG) break;
          page++;
          if (page > 50) break; // safety: max 50k rows
        }
        return { data: rows };
      })(),
      // v871+v880: invoices for sales-tax reconciliation (per-quarter rollup)
      // AND outstanding-AR card (needs id, invoice_number, client_name, balance, due_date)
      sb.from('invoices').select('id,invoice_number,client_name,issued_date,due_date,subtotal,tax_amount,total,balance,status,line_of_business,subject').eq('tenant_id', TENANT_ID()).limit(10000),
      // v933: Week Ahead forecast — upcoming bills (calendar_events) + scheduled jobs
      sb.from('calendar_events').select('type,title,start_date,notes').eq('tenant_id', TENANT_ID()).eq('type', 'bill').order('start_date'),
      sb.from('jobs').select('job_number,client_name,scheduled_date,status,total').eq('tenant_id', TENANT_ID()).gte('scheduled_date', new Date(Date.now() - 86400000).toISOString().split('T')[0]).order('scheduled_date')
    ]).then(function(results) {
      _accounts = (results[0] && results[0].data) || [];
      _txns = (results[1] && results[1].data) || [];
      _chart = (results[2] && results[2].data) || [];
      _taxFilings = (results[3] && results[3].data) || [];
      _allTxns = (results[4] && results[4].data) || [];
      _invoicesQ = (results[5] && results[5].data) || [];
      _bills = (results[6] && results[6].data) || [];
      _upJobs = (results[7] && results[7].data) || [];
    });
  }

  function render() {
    if (_accounts === null) {
      _fetchAll().then(function() {
        // Re-render once data lands — on the dedicated Books page OR the Reports→Books tab.
        if (window._currentPage === 'books' || (window._currentPage === 'reports' && (window._reportsTab || 'insights') === 'books')) {
          loadPage(window._currentPage);
        }
      });
      return _renderShell();
    }
    return _renderShell();
  }

  function _esc(s) { return UI.esc ? UI.esc(s) : String(s||'').replace(/[<>"'&]/g, function(c){return {'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','&':'&amp;'}[c];}); }
  function _money(n) { var v = Number(n)||0; return (v < 0 ? '-' : '') + '$' + Math.abs(v).toFixed(2); }
  function _moneyInt(n) { return UI.moneyInt ? UI.moneyInt(n) : '$' + Math.round(Number(n)||0).toLocaleString(); }
  function _date(s) { return UI.dateShort ? UI.dateShort(s) : (s ? new Date(s).toLocaleDateString('en-US') : ''); }

  // ── Week Ahead cash forecast (v933) ──────────────────────────────────────
  // "What should the account look like at end of week" = current checking
  // balance + expected job income − bills/tax due, over a forward window.
  // Also surfaces the running LOW point so an NSF can be seen before it lands
  // (NSFs on the statements are what blocked the KM100 telehandler financing).
  function _parseAmt(s) {
    var m = String(s || '').replace(/,/g, '').match(/\$\s?(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
  }
  function _ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function setForecast(v) { _filter.forecast = v; loadPage(window._currentPage || 'books'); }
  function setTab(v) { _filter.tab = v; loadPage(window._currentPage || 'books'); }

  // ── P&L by line of business (v936) ───────────────────────────────────────
  // Revenue is split from invoices (line_of_business tag, else keyword guess).
  // Expenses are mostly SHARED overhead — only snow/smartlawn/firewood have
  // keyword-identifiable DIRECT spend; Tree absorbs the shared overhead (it's
  // the core business). So each non-tree line shows its *marginal contribution*
  // above shared overhead, and the columns sum to the real net.
  var _LOB = [
    ['tree', '🌲', 'Tree', 'var(--green-dark)'],
    ['snow', '❄️', 'Snow', '#1565c0'],
    ['smartlawn', '🤖', 'Smart Lawn', '#8e44ad'],
    ['firewood', '🔥', 'Firewood', '#b5651d']
  ];
  function _classifyLineLocal(text) {
    var t = (text || '').toLowerCase();
    if (/\bplow|snow|salt|sander|de-?ic|spreader/.test(t)) return 'snow';
    if (/navimow|yarbo|segway|robotic ?mow|robot ?mow|smart ?lawn/.test(t)) return 'smartlawn';
    if (/fire ?wood|cord ?wood|seasoned wood|wood delivery|split wood/.test(t)) return 'firewood';
    return 'tree';
  }
  function _lineForInv(i) {
    if (i.line_of_business && /^(tree|snow|smartlawn|firewood)$/.test(i.line_of_business)) return i.line_of_business;
    return _classifyLineLocal((i.subject || '') + ' ' + (i.client_name || ''));
  }
  function _renderPLByLine() {
    var rangeDays = parseInt(_filter.range, 10) || 90;
    var since = new Date(Date.now() - rangeDays * 86400000).toISOString().split('T')[0];
    var rangeOpts = [['30', '30 days'], ['90', '90 days'], ['180', '6 months'], ['365', '12 months'], ['730', '24 months']];
    var rangeLabel = (rangeOpts.find(function (r) { return r[0] === _filter.range; }) || [, '90 days'])[1];

    var rev = { tree: 0, snow: 0, smartlawn: 0, firewood: 0 }, revN = { tree: 0, snow: 0, smartlawn: 0, firewood: 0 };
    (_invoicesQ || []).forEach(function (i) {
      var d = (i.issued_date || '').substring(0, 10);
      if (d && d < since) return;
      if ((i.status || '') === 'draft') return;
      var line = _lineForInv(i); if (!(line in rev)) line = 'tree';
      var amt = Number(i.subtotal != null ? i.subtotal : (Number(i.total || 0) - Number(i.tax_amount || 0))) || 0;
      if (amt <= 0) return;
      rev[line] += amt; revN[line]++;
    });
    var direct = { tree: 0, snow: 0, smartlawn: 0, firewood: 0 }, totalExp = 0;
    (_txns || []).forEach(function (t) {
      var c = (t.category || '').toString().charAt(0);
      if (c !== '5' && c !== '6') return;
      var amt = Math.abs(Number(t.amount) || 0); if (!amt) return;
      totalExp += amt;
      var line = _classifyLineLocal((t.description || '') + ' ' + (t.merchant_name || ''));
      if (line !== 'tree') direct[line] += amt;
    });
    var carved = direct.snow + direct.smartlawn + direct.firewood;
    var cost = { tree: Math.max(0, totalExp - carved), snow: direct.snow, smartlawn: direct.smartlawn, firewood: direct.firewood };

    var totalRev = rev.tree + rev.snow + rev.smartlawn + rev.firewood;
    var anyRev = totalRev > 0;

    var rows = _LOB.map(function (L) {
      var k = L[0], r = rev[k], cst = cost[k], contrib = r - cst;
      var share = totalRev > 0 ? Math.round(r / totalRev * 100) : 0;
      var mColor = contrib >= 0 ? 'var(--green-dark)' : '#b91c1c';
      return '<tr style="border-top:1px solid var(--border);">'
        + '<td style="padding:8px 8px;font-weight:700;white-space:nowrap;">' + L[1] + ' ' + L[2] + '</td>'
        + '<td style="padding:8px 8px;text-align:right;font-weight:700;color:' + L[3] + ';">' + _moneyInt(r) + '</td>'
        + '<td style="padding:8px 8px;text-align:right;color:var(--text-light);">' + (totalRev > 0 ? share + '%' : '—') + '</td>'
        + '<td style="padding:8px 8px;text-align:right;color:#b45309;">' + (cst > 0 ? '−' + _moneyInt(cst) : '—') + '</td>'
        + '<td style="padding:8px 8px;text-align:right;font-weight:800;color:' + mColor + ';">' + _moneyInt(contrib) + '</td>'
        + '<td style="padding:8px 8px;color:var(--text-light);font-size:11px;">' + (k === 'tree' ? 'incl. shared overhead' : (revN[k] + ' inv' + (revN[k] === 1 ? '' : 's'))) + '</td>'
        + '</tr>';
    }).join('');

    return '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:18px;">'
      + '<div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:6px;">'
      +   '<div style="font-size:15px;font-weight:800;">📊 Profit &amp; Loss by line of business</div>'
      +   '<div style="font-size:11px;color:var(--text-light);">billed revenue · last ' + _esc(rangeLabel) + '</div>'
      + '</div>'
      + (anyRev
          ? '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:520px;">'
            + '<thead><tr style="color:var(--text-light);font-size:11px;text-transform:uppercase;letter-spacing:.04em;">'
            +   '<th style="padding:4px 8px;text-align:left;">Line</th>'
            +   '<th style="padding:4px 8px;text-align:right;">Revenue</th>'
            +   '<th style="padding:4px 8px;text-align:right;">Share</th>'
            +   '<th style="padding:4px 8px;text-align:right;">Direct cost</th>'
            +   '<th style="padding:4px 8px;text-align:right;">Contribution</th>'
            +   '<th style="padding:4px 8px;text-align:left;"></th>'
            + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
            + '<div style="font-size:11px;color:var(--text-light);margin-top:10px;line-height:1.5;">Revenue split from invoice tags. Most expenses are <b>shared overhead</b> (insurance, truck, software, fuel) which Tree carries as the core business — Snow / Smart Lawn / Firewood show only their <b>direct</b> keyword-identifiable spend, so their <b>Contribution</b> is marginal profit <i>above</i> shared overhead. Tag jobs &amp; invoices by line to sharpen this.</div>'
          : '<div style="font-size:12px;color:var(--text-light);padding:8px 0;">No billed revenue in this range yet. Tag jobs &amp; invoices with a line of business (Tree / Snow / Smart Lawn / Firewood) and they\'ll split out here.</div>')
      + '</div>';
  }
  function _renderWeekAhead() {
    var accounts = _accounts || [], bills = _bills || [], jobs = _upJobs || [];
    var windowDays = parseInt(_filter.forecast || '7', 10) || 7;
    // Starting balance = the active CHECKING account (0606), else first account.
    var chk = accounts.filter(function(a) {
      var n = (a.name || '').toLowerCase(), t = (a.account_type || '').toLowerCase(), l = (a.last_4 || '');
      return l === '0606' || /check/.test(n) || /check|depository/.test(t);
    })[0] || accounts[0];
    if (!chk) return '';
    var startBal = Number(chk.balance_current) || 0;
    var asOf = chk.balance_as_of ? _date(chk.balance_as_of) : null;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var startStr = _ymd(today), endStr = _ymd(new Date(today.getTime() + windowDays * 86400000));

    var events = [];
    jobs.forEach(function(j) {
      var d = (j.scheduled_date || '').substring(0, 10);
      if (d < startStr || d > endStr) return;
      if (['cancelled', 'canceled', 'archived', 'lost'].indexOf((j.status || '').toLowerCase()) >= 0) return;
      var amt = Number(j.total) || 0; if (amt <= 0) return;
      events.push({ date: d, delta: amt, pos: true, label: '#' + j.job_number + ' ' + (j.client_name || 'Job') });
    });
    bills.forEach(function(b) {
      var d = (b.start_date || '').substring(0, 10);
      if (d < startStr || d > endStr) return;
      events.push({ date: d, delta: -_parseAmt(b.title), pos: false, label: b.title });
    });
    events.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

    var income = events.filter(function(e) { return e.pos; }).reduce(function(s, e) { return s + e.delta; }, 0);
    var outgo = events.filter(function(e) { return !e.pos; }).reduce(function(s, e) { return s + e.delta; }, 0); // ≤0
    var projected = startBal + income + outgo;

    var run = startBal, low = startBal, lowDate = startStr;
    events.forEach(function(e) { run += e.delta; if (run < low) { low = run; lowDate = e.date; } });

    var BUFFER = 3100; // month-start auto-debit cluster (Erie + Blue Bridge ≈ $3,027)
    var danger = low < 0, warn = !danger && low < BUFFER;

    var winOpts = [['7', '7 days'], ['14', '14 days'], ['30', '30 days']];
    var toggle = winOpts.map(function(o) {
      var active = (_filter.forecast || '7') === o[0];
      return '<button onclick="BooksPage.setForecast(\'' + o[0] + '\')" style="font-size:11px;padding:3px 9px;border-radius:6px;border:1px solid var(--border);background:' + (active ? 'var(--text)' : 'var(--white)') + ';color:' + (active ? 'var(--white)' : 'var(--text)') + ';cursor:pointer;font-weight:' + (active ? '700' : '500') + ';">' + o[1] + '</button>';
    }).join(' ');

    var banner = '';
    if (danger) banner = '<div style="background:#fdecea;border:1px solid #f5c6cb;color:#b71c1c;border-radius:8px;padding:10px 12px;font-size:13px;font-weight:600;margin:10px 0;">🚨 Balance goes NEGATIVE — low ' + _money(low) + ' on ' + _date(lowDate) + '. NSF risk: move money in or push a payment before then.</div>';
    else if (warn) banner = '<div style="background:#fff8e1;border:1px solid #ffe082;color:#8d6e00;border-radius:8px;padding:10px 12px;font-size:13px;font-weight:600;margin:10px 0;">⚠️ Dips to ' + _money(low) + ' on ' + _date(lowDate) + ' — below your ~' + _moneyInt(BUFFER) + ' safety buffer. Keep it topped up to avoid an NSF.</div>';

    var projColor = projected < 0 ? '#b71c1c' : projected < BUFFER ? '#8d6e00' : 'var(--green-dark)';
    var rows = events.map(function(e) {
      return '<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;">'
        + '<span style="color:var(--text-light);white-space:nowrap;">' + _date(e.date) + '</span>'
        + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (e.pos ? '🟢 ' : '💸 ') + _esc(e.label) + '</span>'
        + '<span style="font-weight:700;color:' + (e.pos ? 'var(--green-dark)' : '#c62828') + ';white-space:nowrap;">' + (e.pos ? '+' : '') + _money(e.delta) + '</span>'
        + '</div>';
    }).join('') || '<div style="font-size:12px;color:var(--text-light);padding:8px 0;">No scheduled jobs or bills in this window. (Jobs you run from Jobber won\'t appear here until pulled into BM.)</div>';

    return '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:18px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:4px;">'
      +   '<div style="font-size:15px;font-weight:800;">💵 Week Ahead — projected balance</div>'
      +   '<div style="display:flex;gap:5px;">' + toggle + '</div>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);margin-bottom:8px;">Checking balance + expected job income − bills/tax due, next ' + windowDays + ' days.</div>'
      + banner
      + '<div style="margin:6px 0 12px;"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;font-weight:700;">Projected end balance</div>'
      +   '<div style="font-size:30px;font-weight:800;color:' + projColor + ';line-height:1.1;">' + _money(projected) + '</div></div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:12px;margin-bottom:12px;">'
      +   '<span style="background:var(--bg);border-radius:8px;padding:6px 10px;">Start ' + _money(startBal) + (asOf ? ' <span style="color:var(--text-light);">(as of ' + asOf + ')</span>' : '') + '</span>'
      +   '<span style="background:#e8f5e9;color:#1b5e20;border-radius:8px;padding:6px 10px;font-weight:700;">+ Jobs ' + _money(income) + '</span>'
      +   '<span style="background:#fdecea;color:#b71c1c;border-radius:8px;padding:6px 10px;font-weight:700;">− Bills ' + _money(Math.abs(outgo)) + '</span>'
      +   '<span style="background:var(--bg);border-radius:8px;padding:6px 10px;">Low point ' + _money(low) + ' · ' + _date(lowDate) + '</span>'
      + '</div>'
      + '<div>' + rows + '</div>'
      + '</div>';
  }

  function _renderShell() {
    var accounts = _accounts || [];
    var txns = _txns || [];
    var chart = _chart || [];

    _BC('shell-start');
    var html = '<div style="max-width:1200px;">';

    // Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px;">'
      + '<div>'
      +   '<h2 style="margin:0;font-size:22px;font-weight:800;">Books</h2>'
      +   '<div style="font-size:13px;color:var(--text-light);margin-top:2px;">Bank transactions, auto-categorized against your chart of accounts.</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      +   (accounts.length > 0 ? '<button onclick="BooksPage.syncNow()" class="btn btn-outline" style="font-size:13px;">Sync now</button>' : '')
      +   (txns.length > 0 ? '<button onclick="BooksPage.reconcileAll()" class="btn btn-outline" style="font-size:13px;">🔗 Reconcile</button>' : '')
      +   (txns.length > 0 ? '<button onclick="BooksPage.exportCpaPackage()" class="btn btn-outline" style="font-size:13px;" title="Year-end ZIP for your accountant: P&amp;L + tax recon + sales-tax recon + invoice aging + 941 wages">📦 CPA Package</button>' : '')
      +   (txns.length > 0 ? '<button onclick="BooksPage.exportCpaCsv()" class="btn btn-outline" style="font-size:13px;">📤 CSV only</button>' : '')
      +   '<button onclick="BooksPage.openCsvImport()" class="btn btn-outline" style="font-size:13px;">📥 Import CSV</button>'
      +   '<button onclick="BooksPage.connectBank()" class="btn btn-primary" style="font-size:13px;">+ Connect bank</button>'
      + '</div>'
      + '</div>';

    // Empty state
    if (accounts.length === 0) {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:48px;text-align:center;">'
        + '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px;">No bank accounts connected yet</div>'
        + '<div style="font-size:13px;color:var(--text-light);max-width:480px;margin:0 auto 18px;line-height:1.55;">Two ways to get transactions into Books:</div>'
        + '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:14px;">'
        +   '<button onclick="BooksPage.openCsvImport()" class="btn btn-primary" style="font-size:14px;padding:12px 22px;">📥 Import CSV (free, manual)</button>'
        +   (localStorage.getItem('bm-plaid-saved') === '1'
              ? '<button onclick="BooksPage.connectBank()" class="btn btn-outline" style="font-size:14px;padding:12px 22px;">🔗 Connect via Plaid (auto)</button>'
              : '<button onclick="loadPage(\'settings\');setTimeout(function(){try{SettingsPage._switchTab(\'advanced\');document.getElementById(\'plaid-client-id\').scrollIntoView({block:\'center\',behavior:\'smooth\'});}catch(e){}},200);" class="btn btn-outline" style="font-size:14px;padding:12px 22px;">⚙️ Set up Plaid in Settings →</button>')
        + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);max-width:480px;margin:0 auto;line-height:1.55;">CSV: download your monthly statement, drop it in BM. Free, works with every bank. Plaid: auto-syncs every 4h, requires Plaid signup + pricing call. Wire keys in Settings → Advanced → Plaid (Bank Sync).</div>'
        + '</div>';
      html += _renderSetupHint();
      html += '</div>';
      return html;
    }

    // QuickBooks-style LEFT sub-nav (v935) — vertical sidebar + content column.
    var TAB = _filter.tab || 'overview';
    var BK_TABS = [['overview', '📊', 'Overview'], ['transactions', '📒', 'Transactions'], ['pl', '📈', 'Profit & Loss'], ['invoices', '💰', 'Invoices (A/R)'], ['taxes', '🧾', 'Taxes']];
    html += '<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;">';
    // Left vertical sub-nav
    html += '<div style="flex:0 0 188px;display:flex;flex-direction:column;gap:3px;position:sticky;top:12px;">';
    BK_TABS.forEach(function(t) {
      var on = TAB === t[0];
      html += '<button onclick="BooksPage.setTab(\'' + t[0] + '\')" style="display:flex;align-items:center;gap:9px;text-align:left;width:100%;background:' + (on ? 'var(--green-bg)' : 'transparent') + ';border:none;border-left:3px solid ' + (on ? 'var(--green-dark)' : 'transparent') + ';color:' + (on ? 'var(--green-dark)' : 'var(--text-light)') + ';font-weight:' + (on ? '800' : '600') + ';font-size:14px;padding:10px 14px;border-radius:0 8px 8px 0;cursor:pointer;">' + '<span style="font-size:16px;line-height:1;">' + t[1] + '</span>' + t[2] + '</button>';
    });
    html += '</div>';
    // Content column (holds all panes)
    html += '<div style="flex:1 1 320px;min-width:0;">';

    // ===== OVERVIEW pane: account balances + Week Ahead forecast =====
    html += '<div class="bk-pane" data-pane="overview" style="display:' + (TAB === 'overview' ? 'block' : 'none') + ';">';

    // Account cards
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-bottom:18px;">';
    accounts.forEach(function(a) {
      var bal = a.balance_current != null ? _moneyInt(a.balance_current) : '—';
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 16px;">'
        + '<div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;font-weight:700;">' + _esc(a.account_type || 'Account') + '</div>'
        + '<div style="font-weight:700;font-size:15px;margin-top:2px;">' + _esc(a.name) + (a.last_4 ? ' <span style="color:var(--text-light);font-weight:500;">··' + _esc(a.last_4) + '</span>' : '') + '</div>'
        + '<div style="font-size:13px;color:var(--text-light);margin-top:4px;">' + _esc(a.bank_name || '') + '</div>'
        + '<div style="font-size:18px;font-weight:800;color:var(--green-dark);margin-top:8px;">' + bal + '</div>'
        + '</div>';
    });
    html += '</div>';

    // Week Ahead forecast (v933) — projected balance + NSF early-warning
    html += _renderWeekAhead();
    html += '</div>'; // end OVERVIEW pane

    // ===== PROFIT & LOSS pane: P&L, top expenses, cash-flow, health, multi-year =====
    _BC('pre-pl'); html += '<div class="bk-pane" data-pane="pl" style="display:' + (TAB === 'pl' ? 'block' : 'none') + ';">';

    // P&L by line of business (v936) — revenue split + contribution per line
    html += _renderPLByLine();

    // ──────────────────────────────────────────────────────────────────
    // P&L Summary (v857) — roll up bank_transactions by COA class.
    // Excludes 7xxx (Owner Draw, Transfers) so the bottom line reflects
    // actual operating P&L, not noise from moving money between own
    // accounts. Inflow positive, outflow negative; we display the inflow
    // side flipped to "Revenue" (always positive) and outflow side as
    // absolute-value "Expenses" so the visual reads as a normal P&L.
    // ──────────────────────────────────────────────────────────────────
    var chartByCodeForPL = {};
    chart.forEach(function(c) { chartByCodeForPL[c.code] = c; });

    var pl = { revenue: 0, cogs: 0, opex: 0, byCode: {}, ownerFunded: 0, ownerFundedN: 0 };
    txns.forEach(function(t) {
      var code = (t.category || '').toString();
      if (!code) return;
      var amt = Number(t.amount) || 0;
      var bucket = code.charAt(0);
      if (bucket === '7') return; // transfers + owner draws excluded
      pl.byCode[code] = (pl.byCode[code] || 0) + amt;
      if (bucket === '4') pl.revenue += amt;
      else if (bucket === '5') pl.cogs += Math.abs(amt);
      else if (bucket === '6') pl.opex += Math.abs(amt);
      // v884: track owner-funded expenses separately for CPA reporting
      if (t.owner_funded && amt < 0) { pl.ownerFunded += Math.abs(amt); pl.ownerFundedN++; }
    });
    var grossProfit = pl.revenue - pl.cogs;
    var netProfit = grossProfit - pl.opex;
    var margin = pl.revenue > 0 ? Math.round((netProfit / pl.revenue) * 100) : 0;

    var rangeOpts = [['30','30 days'],['90','90 days'],['180','6 months'],['365','12 months'],['730','24 months']];
    var rangeLabel = (rangeOpts.find(function(r){return r[0]===_filter.range;})||[,'90 days'])[1];

    function _plCard(label, value, color, hint) {
      return '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 16px;">'
        + '<div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;font-weight:700;">' + _esc(label) + '</div>'
        + '<div style="font-size:22px;font-weight:800;color:' + color + ';margin-top:4px;">' + _moneyInt(value) + '</div>'
        + (hint ? '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">' + _esc(hint) + '</div>' : '')
        + '</div>';
    }

    // v859: reconciliation summary alongside P&L. Counts how many bank
    // transactions are linked to BM payments/expenses vs unmatched.
    var reconciled = txns.filter(function(t) { return t.reconciled && t.matched_to_id; }).length;
    var unmatched = txns.length - reconciled;
    var reconcilePct = txns.length > 0 ? Math.round(reconciled / txns.length * 100) : 0;

    html += '<div style="margin-bottom:18px;">'
      + '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;">'
      +   '<h3 style="margin:0;font-size:15px;">Profit & Loss · last ' + _esc(rangeLabel) + '</h3>'
      +   '<div style="font-size:11px;color:var(--text-light);">excludes 7xxx transfers & owner draws · ' + reconciled + '/' + txns.length + ' reconciled (' + reconcilePct + '%)' + (unmatched > 0 ? ' · <a onclick="BooksPage.reconcileAll()" style="color:var(--green-dark);cursor:pointer;text-decoration:underline;">match now →</a>' : '') + '</div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;">'
      +   _plCard('Revenue (4xxx)', pl.revenue, 'var(--green-dark)')
      +   _plCard('COGS (5xxx)', -pl.cogs, '#b45309', pl.revenue > 0 ? (Math.round(pl.cogs / pl.revenue * 100)) + '% of revenue' : '')
      +   _plCard('Operating exp (6xxx)', -pl.opex, '#b45309', pl.revenue > 0 ? (Math.round(pl.opex / pl.revenue * 100)) + '% of revenue' : '')
      +   _plCard(netProfit >= 0 ? 'Net profit' : 'Net loss', netProfit, netProfit >= 0 ? 'var(--green-dark)' : '#b91c1c', (margin >= 0 ? margin : margin) + '% margin')
      + '</div>'
      // v884: owner-funded business expenses footer — visible if any exist
      + (pl.ownerFunded > 0 ? '<div style="margin-top:12px;padding:10px 14px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;font-size:12px;color:#5b21b6;display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;"><div>👤 <b>' + _moneyInt(pl.ownerFunded) + '</b> of expenses above were <b>owner-funded</b> (paid from personal cards, not business cash). ' + pl.ownerFundedN + ' transaction' + (pl.ownerFundedN === 1 ? '' : 's') + '.</div><div style="font-size:11px;opacity:0.7;">Treat as capital contribution at year-end</div></div>' : '')
      + '</div>';

    // Top categories breakdown — show the 6 largest spending COA codes
    var byCodeArr = Object.keys(pl.byCode).map(function(code) {
      return { code: code, total: pl.byCode[code], name: (chartByCodeForPL[code] && chartByCodeForPL[code].name) || code };
    }).filter(function(r) { return r.code.charAt(0) === '5' || r.code.charAt(0) === '6'; })
      .sort(function(a, b) { return Math.abs(b.total) - Math.abs(a.total); })
      .slice(0, 6);
    if (byCodeArr.length) {
      var maxAbs = Math.max.apply(null, byCodeArr.map(function(r){return Math.abs(r.total);})) || 1;
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:18px;">'
        + '<div style="font-size:13px;font-weight:700;margin-bottom:10px;">Top expense categories</div>';
      byCodeArr.forEach(function(r) {
        var pct = Math.round(Math.abs(r.total) / maxAbs * 100);
        html += '<div style="display:grid;grid-template-columns:60px 1fr 90px;gap:10px;align-items:center;font-size:12px;padding:4px 0;">'
          + '<div style="font-family:monospace;color:var(--text-light);">' + _esc(r.code) + '</div>'
          + '<div><div style="font-weight:600;">' + _esc(r.name) + '</div>'
          +   '<div style="height:4px;border-radius:2px;background:var(--bg);margin-top:3px;"><div style="width:' + pct + '%;height:100%;background:#b45309;border-radius:2px;"></div></div></div>'
          + '<div style="text-align:right;font-weight:700;">' + _moneyInt(Math.abs(r.total)) + '</div>'
          + '</div>';
      });
      html += '</div>';
    }

    // ──────────────────────────────────────────────────────────────────
    // Cash-flow chart (v860, extended v873) — last 6/12/24 months OR
    // all-years annual view, inflow vs outflow bars per period. Lets
    // Doug spot lean seasons (winter dip Jan-Feb) + visualize Stripe
    // payout consistency. Excludes 7xxx transfers.
    // v873: toggle between Months and Years. Years view uses _allTxns
    // (lean projection of all-time PDF history).
    // ──────────────────────────────────────────────────────────────────
    var cfMode = _filter.cashflow || '6m'; // 6m / 12m / 24m / years
    var nowD = new Date();
    var periods = []; // {key, label, inflow, outflow}
    var periodIdx = {};
    var sourceTxns;

    if (cfMode === 'years') {
      // All-time year view, sourced from _allTxns (PDF history, all-time)
      sourceTxns = _allTxns || [];
      var years = {};
      sourceTxns.forEach(function(t) {
        var y = (t.posted_date || '').slice(0, 4);
        if (!y) return;
        years[y] = true;
      });
      Object.keys(years).sort().forEach(function(y) {
        periods.push({ key: y, label: y, inflow: 0, outflow: 0 });
      });
      periods.forEach(function(p, i) { periodIdx[p.key] = i; });
      sourceTxns.forEach(function(t) {
        var code = (t.category || '').toString();
        if (code.charAt(0) === '7') return;
        if (t.owner_funded) return; // v884: owner-paid didn't move business cash
        var y = (t.posted_date || '').slice(0, 4);
        var idx = periodIdx[y];
        if (idx == null) return;
        var amt = Number(t.amount) || 0;
        if (amt > 0) periods[idx].inflow += amt;
        else periods[idx].outflow += Math.abs(amt);
      });
    } else {
      // N-month view, sourced from txns (range-filtered) for ≤6 months,
      // else from _allTxns for 12/24 months (range filter caps at 6 mo).
      var nMonths = cfMode === '24m' ? 24 : (cfMode === '12m' ? 12 : 6);
      sourceTxns = nMonths > 6 ? (_allTxns || []) : txns;
      for (var mi = nMonths - 1; mi >= 0; mi--) {
        var d = new Date(nowD.getFullYear(), nowD.getMonth() - mi, 1);
        periods.push({
          key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
          label: d.toLocaleDateString('en-US', { month: 'short' }) + (mi === 0 || d.getMonth() === 0 ? ' ' + String(d.getFullYear()).slice(2) : ''),
          inflow: 0,
          outflow: 0
        });
      }
      periods.forEach(function(p, i) { periodIdx[p.key] = i; });
      sourceTxns.forEach(function(t) {
        var code = (t.category || '').toString();
        if (code.charAt(0) === '7') return;
        if (t.owner_funded) return; // v884: owner-paid didn't move business cash
        var dt = (t.posted_date || '').slice(0, 7); // YYYY-MM
        var idx = periodIdx[dt];
        if (idx == null) return;
        var amt = Number(t.amount) || 0;
        if (amt > 0) periods[idx].inflow += amt;
        else periods[idx].outflow += Math.abs(amt);
      });
    }

    var maxFlow = Math.max.apply(null, periods.flatMap(function(p){return [p.inflow, p.outflow];})) || 1;
    var anyFlow = periods.some(function(p){return p.inflow > 0 || p.outflow > 0;});
    if (anyFlow) {
      var title = cfMode === 'years' ? 'Cash flow · all years' : ('Cash flow · last ' + (cfMode === '24m' ? '24 months' : cfMode === '12m' ? '12 months' : '6 months'));
      var tabBtn = function(val, label) {
        var active = cfMode === val;
        return '<button onclick="BooksPage.setCashflow(\'' + val + '\')" style="font-size:11px;padding:3px 8px;border-radius:6px;border:1px solid var(--border);background:' + (active ? 'var(--text)' : 'var(--white)') + ';color:' + (active ? 'var(--white)' : 'var(--text)') + ';cursor:pointer;font-weight:' + (active ? '700' : '500') + ';">' + label + '</button>';
      };
      var nCols = periods.length;
      var colWidth = nCols > 12 ? 1 : (nCols > 6 ? 2 : 4);
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 18px;margin-bottom:18px;">'
        + '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">'
        +   '<div style="font-size:13px;font-weight:700;">' + _esc(title) + '</div>'
        +   '<div style="display:flex;gap:4px;align-items:center;">'
        +     tabBtn('6m', '6 mo') + tabBtn('12m', '12 mo') + tabBtn('24m', '24 mo') + tabBtn('years', 'All yrs')
        +   '</div>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);margin-bottom:8px;text-align:right;"><span style="display:inline-block;width:8px;height:8px;background:var(--green-dark);border-radius:2px;margin-right:4px;"></span>Inflow &nbsp; <span style="display:inline-block;width:8px;height:8px;background:#b45309;border-radius:2px;margin-right:4px;margin-left:8px;"></span>Outflow</div>'
        + '<div style="display:grid;grid-template-columns:repeat(' + nCols + ',1fr);gap:' + (nCols > 12 ? 4 : 8) + 'px;align-items:end;height:120px;padding-bottom:4px;border-bottom:1px solid var(--border);">';
      periods.forEach(function(p) {
        var inH = Math.round(p.inflow / maxFlow * 100);
        var outH = Math.round(p.outflow / maxFlow * 100);
        html += '<div style="display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;">'
          + '<div style="display:flex;gap:2px;align-items:flex-end;height:100%;width:100%;justify-content:center;">'
          +   '<div title="In: $' + Math.round(p.inflow).toLocaleString() + '" style="width:' + (colWidth * 3) + 'px;height:' + inH + '%;background:var(--green-dark);border-radius:2px 2px 0 0;min-height:1px;"></div>'
          +   '<div title="Out: $' + Math.round(p.outflow).toLocaleString() + '" style="width:' + (colWidth * 3) + 'px;height:' + outH + '%;background:#b45309;border-radius:2px 2px 0 0;min-height:1px;"></div>'
          + '</div></div>';
      });
      html += '</div>'
        + '<div style="display:grid;grid-template-columns:repeat(' + nCols + ',1fr);gap:' + (nCols > 12 ? 4 : 8) + 'px;margin-top:6px;">';
      periods.forEach(function(p) {
        var net = p.inflow - p.outflow;
        html += '<div style="text-align:center;">'
          + '<div style="font-size:' + (nCols > 18 ? 9 : nCols > 10 ? 10 : 11) + 'px;font-weight:700;color:var(--text-light);">' + _esc(p.label) + '</div>'
          + (nCols <= 18 ? '<div style="font-size:' + (nCols > 12 ? 9 : 10) + 'px;color:' + (net >= 0 ? 'var(--green-dark)' : '#b91c1c') + ';font-weight:600;">' + (net >= 0 ? '+' : '') + _moneyInt(net) + '</div>' : '')
          + '</div>';
      });
      html += '</div></div>';
    }

    // ──────────────────────────────────────────────────────────────────
    // v869: Books Health Score — single A-F grade summarizing accounting
    // confidence. Inputs: % categorized (1 - 6999_count / total), %
    // reconciled, tax-return-vs-Books agreement (where filings exist).
    // ──────────────────────────────────────────────────────────────────
    var allTxnsAll = _allTxns || [];
    var catTotalAll = allTxnsAll.length;
    var uncatAll = allTxnsAll.filter(function(t) { return (t.category || '6999') === '6999'; }).length;
    var pctCategorized = catTotalAll > 0 ? Math.round((1 - uncatAll / catTotalAll) * 100) : 0;
    var reconciledAll = allTxnsAll.length; // _allTxns has limited columns; use _txns counts for reconciled
    // Compute reconciliation % from _txns (range-limited but representative)
    var rngReconciled = (txns || []).filter(function(t) { return t.reconciled === true; }).length;
    var pctReconciled = (txns && txns.length > 0) ? Math.round((rngReconciled / txns.length) * 100) : 0;
    // Tax-return match: average abs(delta/tax) for years with a federal return
    var taxAgreementScores = [];
    if (_taxFilings && _allTxns) {
      var bookByYear2 = {};
      allTxnsAll.forEach(function(t) {
        var yr = parseInt((t.posted_date || '').slice(0, 4), 10);
        if (!yr) return;
        var cat = (t.category || '').toString();
        if (cat.charAt(0) === '7') return;
        var amt = Number(t.amount) || 0;
        if (!bookByYear2[yr]) bookByYear2[yr] = { rev: 0, exp: 0 };
        if (cat.charAt(0) === '4') bookByYear2[yr].rev += amt;
        else if (amt < 0) bookByYear2[yr].exp += -amt;
      });
      _taxFilings.filter(function(f) { return (f.form_type || '').indexOf('1120') >= 0 || (f.form_type || '').indexOf('Sch') === 0; }).forEach(function(f) {
        var b = bookByYear2[f.tax_year]; if (!b) return;
        var bookNet = b.rev - b.exp;
        var taxNet = Number(f.net_income) || 0;
        if (Math.abs(taxNet) > 100) {
          taxAgreementScores.push(Math.max(0, 100 - Math.abs((bookNet - taxNet) / taxNet) * 100));
        }
      });
    }
    var avgTaxAgreement = taxAgreementScores.length ? Math.round(taxAgreementScores.reduce(function(s, x) { return s + x; }, 0) / taxAgreementScores.length) : null;

    // v871: Sales-tax accuracy — average per-quarter match of BM-invoiced
    // tax vs filed NY-ST sales-tax-collected. Only counts quarters where
    // BOTH sides have data (pre-BM filed quarters are excluded so they
    // don't unfairly tank the score).
    var stScores = [];
    var nyStFilingsForScore = (_taxFilings || []).filter(function(f) {
      return (f.form_type || '').toUpperCase().indexOf('NY-ST') === 0;
    });
    if (nyStFilingsForScore.length > 0 && _invoicesQ && _invoicesQ.length > 0) {
      var invByQ_s = {};
      _invoicesQ.forEach(function(iv) {
        var d = iv.issued_date; if (!d) return;
        var yr = parseInt(d.slice(0, 4), 10), mo = parseInt(d.slice(5, 7), 10);
        if (!yr || !mo) return;
        var key = yr + '-Q' + Math.ceil(mo / 3);
        if (!invByQ_s[key]) invByQ_s[key] = { tax: 0 };
        invByQ_s[key].tax += Number(iv.tax_amount) || 0;
      });
      nyStFilingsForScore.forEach(function(f) {
        var ex = f.extracted || {};
        var key = f.tax_year + '-Q' + (ex.quarter || (f.form_type || '').match(/Q(\d)/) || [0, '?'])[1];
        var filedTax = Number(ex.sales_tax_collected != null ? ex.sales_tax_collected : ex.sales_tax_due) || 0;
        var bmTax = (invByQ_s[key] || {}).tax || 0;
        if (filedTax > 0 && bmTax > 0) {
          var pct = Math.abs((bmTax - filedTax) / filedTax);
          stScores.push(Math.max(0, 100 - pct * 100));
        }
      });
    }
    var avgSalesTax = stScores.length ? Math.round(stScores.reduce(function(s, x) { return s + x; }, 0) / stScores.length) : null;

    // Composite score — weighted average.
    //   With both tax-return AND sales-tax data: cat 35% / recon 25% / tax 25% / sales-tax 15%
    //   With tax-return only:                    cat 40% / recon 30% / tax 30%
    //   With sales-tax only:                     cat 45% / recon 30% / sales-tax 25%
    //   With neither:                            cat 60% / recon 40%
    var composite;
    if (avgTaxAgreement != null && avgSalesTax != null) {
      composite = Math.round(pctCategorized * 0.35 + pctReconciled * 0.25 + avgTaxAgreement * 0.25 + avgSalesTax * 0.15);
    } else if (avgTaxAgreement != null) {
      composite = Math.round(pctCategorized * 0.4 + pctReconciled * 0.3 + avgTaxAgreement * 0.3);
    } else if (avgSalesTax != null) {
      composite = Math.round(pctCategorized * 0.45 + pctReconciled * 0.3 + avgSalesTax * 0.25);
    } else {
      composite = Math.round(pctCategorized * 0.6 + pctReconciled * 0.4);
    }
    var grade = composite >= 90 ? 'A' : composite >= 80 ? 'B' : composite >= 70 ? 'C' : composite >= 60 ? 'D' : 'F';
    var gradeColor = composite >= 80 ? 'var(--green-dark)' : composite >= 70 ? '#b45309' : '#b91c1c';

    // 4 or 5 columns depending on whether sales-tax data exists
    var gridCols = avgSalesTax != null ? '90px 1fr 1fr 1fr 1fr' : '90px 1fr 1fr 1fr';
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 18px;margin-bottom:18px;">'
      + '<div style="display:grid;grid-template-columns:' + gridCols + ';gap:14px;align-items:center;">'
      +   '<div style="text-align:center;"><div style="font-size:32px;font-weight:800;color:' + gradeColor + ';line-height:1;">' + grade + '</div><div style="font-size:11px;color:var(--text-light);margin-top:2px;">' + composite + '/100</div></div>'
      +   '<div><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;font-weight:700;">Categorized</div><div style="font-size:18px;font-weight:700;">' + pctCategorized + '%</div><div style="font-size:11px;color:var(--text-light);">' + (catTotalAll - uncatAll) + ' / ' + catTotalAll + ' rows tagged</div></div>'
      +   '<div><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;font-weight:700;">Reconciled</div><div style="font-size:18px;font-weight:700;">' + pctReconciled + '%</div><div style="font-size:11px;color:var(--text-light);">' + rngReconciled + ' / ' + (txns ? txns.length : 0) + ' in view</div></div>'
      +   '<div><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;font-weight:700;">Tax agreement</div><div style="font-size:18px;font-weight:700;">' + (avgTaxAgreement != null ? avgTaxAgreement + '%' : '—') + '</div><div style="font-size:11px;color:var(--text-light);">' + (taxAgreementScores.length ? taxAgreementScores.length + ' year' + (taxAgreementScores.length === 1 ? '' : 's') + ' compared' : 'no filings on file') + '</div></div>'
      +   (avgSalesTax != null ? '<div><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;font-weight:700;">Sales-tax match</div><div style="font-size:18px;font-weight:700;">' + avgSalesTax + '%</div><div style="font-size:11px;color:var(--text-light);">' + stScores.length + ' qtr' + (stScores.length === 1 ? '' : 's') + ' compared</div></div>' : '')
      + '</div>'
      + '</div>';

    // ──────────────────────────────────────────────────────────────────
    // v886: Multi-Year P&L — bank-data-based P&L for every year on file.
    // The straight answer to "what did I make in 2024 vs 2025". Uses _allTxns
    // (all-time imports, not range-limited). 7xxx and 7300 excluded from P&L
    // because they're owner activity / debt principal (CPA splits).
    // ──────────────────────────────────────────────────────────────────
    if (_allTxns && _allTxns.length) {
      var plByYear = {};
      _allTxns.forEach(function(t) {
        var yr = parseInt((t.posted_date || '').slice(0, 4), 10);
        if (!yr) return;
        var cat = (t.category || '').toString();
        var cls = cat.charAt(0);
        if (cls === '7') return; // exclude all 7xxx (owner / transfers / debt principal)
        var amt = Number(t.amount) || 0;
        if (!plByYear[yr]) plByYear[yr] = { rev: 0, cogs: 0, opex: 0, n: 0 };
        plByYear[yr].n++;
        if (cls === '4') plByYear[yr].rev += amt;
        else if (cls === '5') plByYear[yr].cogs += Math.abs(amt);
        else if (cls === '6') plByYear[yr].opex += Math.abs(amt);
      });
      var plYears = Object.keys(plByYear).map(Number).sort();
      if (plYears.length >= 1) {
        html += '<details open style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 18px;margin-bottom:18px;">'
          + '<summary style="cursor:pointer;font-weight:700;font-size:14px;">💵 Multi-Year P&amp;L (bank-data based)</summary>'
          + '<div style="font-size:11px;color:var(--text-light);margin-top:6px;margin-bottom:10px;">Year-over-year P&amp;L from your bank transactions. 7xxx (owner draws, inter-co transfers, debt principal) excluded so the CPA can layer in depreciation + interest.</div>'
          + '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">'
          + '<thead><tr style="border-bottom:2px solid var(--border);text-align:right;">'
          +   '<th style="text-align:left;padding:6px 8px;">Year</th>'
          +   '<th style="padding:6px 8px;">Revenue</th>'
          +   '<th style="padding:6px 8px;">COGS</th>'
          +   '<th style="padding:6px 8px;">OpEx</th>'
          +   '<th style="padding:6px 8px;">Net Profit</th>'
          +   '<th style="padding:6px 8px;">Margin</th>'
          +   '<th style="padding:6px 8px;">Txns</th>'
          + '</tr></thead><tbody>';
        plYears.forEach(function(yr) {
          var p = plByYear[yr];
          var net = p.rev - p.cogs - p.opex;
          var margin = p.rev > 0 ? Math.round(net / p.rev * 100) : 0;
          var netColor = net > 0 ? 'var(--green-dark)' : (net < 0 ? '#b91c1c' : 'var(--text)');
          html += '<tr style="border-bottom:1px solid var(--bg);text-align:right;">'
            +   '<td style="padding:7px 8px;text-align:left;font-weight:700;">' + yr + '</td>'
            +   '<td style="padding:7px 8px;color:var(--green-dark);">' + _moneyInt(p.rev) + '</td>'
            +   '<td style="padding:7px 8px;color:#b45309;">' + _moneyInt(-p.cogs) + '</td>'
            +   '<td style="padding:7px 8px;color:#b45309;">' + _moneyInt(-p.opex) + '</td>'
            +   '<td style="padding:7px 8px;font-weight:800;color:' + netColor + ';">' + _moneyInt(net) + '</td>'
            +   '<td style="padding:7px 8px;font-weight:600;color:' + netColor + ';">' + (p.rev > 0 ? margin + '%' : '—') + '</td>'
            +   '<td style="padding:7px 8px;color:var(--text-light);font-size:11px;">' + p.n + '</td>'
            + '</tr>';
        });
        html += '</tbody></table></div></details>';
      }
    }

    html += '</div>'; // end PROFIT & LOSS pane

    // ===== TAXES pane: tax-year reconciliation + NY sales-tax reconciliation =====
    _BC('pre-taxes'); html += '<div class="bk-pane" data-pane="taxes" style="display:' + (TAB === 'taxes' ? 'block' : 'none') + ';">';

    // ──────────────────────────────────────────────────────────────────
    // v867: Tax-Year Reconciliation — side-by-side BM Books P&L vs tax
    // filings for each year. The killer feature for "is my CPA right?".
    // Pulls federal returns (1120-S / Schedule C / 1120) for net income
    // and revenue. NY-ST quarterly returns are summed for revenue check.
    // 941 quarterlies are summed for wages-paid check.
    // ──────────────────────────────────────────────────────────────────
    var federalReturns = (_taxFilings || []).filter(function(f) {
      var ft = (f.form_type || '').toLowerCase();
      return ft.indexOf('1120') >= 0 || ft.indexOf('sch') === 0 || ft.indexOf('1040') >= 0 || ft.indexOf('1065') >= 0;
    });
    if (federalReturns.length > 0 && _allTxns) {
      // Build yearly P&L from ALL transactions (not range-limited)
      var bookByYear = {};
      _allTxns.forEach(function(t) {
        var yr = parseInt((t.posted_date || '').slice(0, 4), 10);
        if (!yr) return;
        var cat = (t.category || '').toString();
        var cls = cat.charAt(0);
        if (cls === '7') return; // exclude transfers + owner draws from P&L
        var amt = Number(t.amount) || 0;
        if (!bookByYear[yr]) bookByYear[yr] = { revenue: 0, expenses: 0 };
        // Revenue = positive 4xxx + offset revenue reversals (4xxx negative)
        if (cls === '4') {
          bookByYear[yr].revenue += amt;
        } else if (amt < 0) {
          bookByYear[yr].expenses += -amt;
        }
      });

      html += '<details open style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 18px;margin-bottom:18px;">'
        + '<summary style="cursor:pointer;font-weight:700;font-size:14px;">📋 Tax-Year Reconciliation — BM Books vs filed returns</summary>'
        + '<div style="font-size:11px;color:var(--text-light);margin-top:6px;margin-bottom:10px;">Negative deltas = BM Books reports MORE expense / LESS net than tax return. Goal: within ±10% margin.</div>'
        + '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">'
        + '<thead><tr style="border-bottom:2px solid var(--border);">'
        +   '<th style="text-align:left;padding:6px 8px;">Year</th>'
        +   '<th style="text-align:right;padding:6px 8px;">Tax Return Net</th>'
        +   '<th style="text-align:right;padding:6px 8px;">BM Books Net</th>'
        +   '<th style="text-align:right;padding:6px 8px;">Δ</th>'
        +   '<th style="text-align:right;padding:6px 8px;">Tax Revenue</th>'
        +   '<th style="text-align:right;padding:6px 8px;">BM Revenue</th>'
        +   '<th style="text-align:right;padding:6px 8px;">Form</th>'
        + '</tr></thead><tbody>';
      federalReturns.forEach(function(f) {
        var book = bookByYear[f.tax_year] || { revenue: 0, expenses: 0 };
        var bookNet = book.revenue - book.expenses;
        var taxNet = Number(f.net_income) || 0;
        var taxRev = Number(f.gross_receipts) || 0;
        var netDelta = bookNet - taxNet;
        var netPctOk = Math.abs(taxNet) > 0 ? Math.abs(netDelta / taxNet) < 0.15 : Math.abs(netDelta) < 5000;
        var deltaColor = netPctOk ? 'var(--green-dark)' : '#b91c1c';
        var deltaIcon = netPctOk ? '✓' : '⚠';
        html += '<tr style="border-bottom:1px solid var(--bg);">'
          + '<td style="padding:6px 8px;font-weight:700;">' + f.tax_year + '</td>'
          + '<td style="padding:6px 8px;text-align:right;">' + _moneyInt(taxNet) + '</td>'
          + '<td style="padding:6px 8px;text-align:right;">' + _moneyInt(bookNet) + '</td>'
          + '<td style="padding:6px 8px;text-align:right;font-weight:700;color:' + deltaColor + ';">' + deltaIcon + ' ' + _moneyInt(netDelta) + '</td>'
          + '<td style="padding:6px 8px;text-align:right;color:var(--text-light);">' + _moneyInt(taxRev) + '</td>'
          + '<td style="padding:6px 8px;text-align:right;color:var(--text-light);">' + _moneyInt(book.revenue) + '</td>'
          + '<td style="padding:6px 8px;text-align:right;font-size:11px;color:var(--text-light);">' + _esc(f.form_type || '') + '</td>'
          + '</tr>';
      });
      html += '</tbody></table></div>'
        + '</details>';
    }

    // ──────────────────────────────────────────────────────────────────
    // v871: NY Sales-Tax Reconciliation — quarter-by-quarter, filed
    // ST-100 vs BM-invoiced sales + tax. Catches under-collection (BM
    // billed less than reported to NYS) and under-reporting (BM billed
    // more than reported). For a tree-service LLC the worst case is
    // missing tax on a job — that's NYS's $$$ owed.
    // ──────────────────────────────────────────────────────────────────
    var nyStFilings = (_taxFilings || []).filter(function(f) {
      return (f.form_type || '').toUpperCase().indexOf('NY-ST') === 0;
    });
    if (nyStFilings.length > 0 || (_invoicesQ && _invoicesQ.length > 0)) {
      // Bucket invoices by year/quarter key (e.g. "2025-Q1")
      var invByQ = {};
      (_invoicesQ || []).forEach(function(iv) {
        var d = iv.issued_date;
        if (!d) return;
        var yr = parseInt(d.slice(0, 4), 10);
        var mo = parseInt(d.slice(5, 7), 10);
        if (!yr || !mo) return;
        var q = Math.ceil(mo / 3);
        var key = yr + '-Q' + q;
        if (!invByQ[key]) invByQ[key] = { subtotal: 0, tax: 0, total: 0, n: 0 };
        invByQ[key].subtotal += Number(iv.subtotal) || 0;
        invByQ[key].tax += Number(iv.tax_amount) || 0;
        invByQ[key].total += Number(iv.total) || 0;
        invByQ[key].n += 1;
      });
      // Build merged set of quarter keys: union of filed + invoiced
      var qKeySet = {};
      nyStFilings.forEach(function(f) {
        var key = (f.period || (f.tax_year + '-Q' + (f.form_type || '').replace(/\D/g, '').slice(-1)));
        // Normalize: "Q1 2025" -> "2025-Q1"
        var m = String(key).match(/Q(\d)\s*(\d{4})/);
        if (m) key = m[2] + '-Q' + m[1];
        else key = f.tax_year + '-Q' + ((f.form_type || '').match(/Q(\d)/) || [0, '?'])[1];
        qKeySet[key] = true;
      });
      Object.keys(invByQ).forEach(function(k) { qKeySet[k] = true; });
      var qKeys = Object.keys(qKeySet).sort(); // 2025-Q1 sorts naturally

      // Index filings by normalized key for lookup
      var filedByQ = {};
      nyStFilings.forEach(function(f) {
        var ex = f.extracted || {};
        var key = f.tax_year + '-Q' + (ex.quarter || (f.form_type || '').match(/Q(\d)/) || [0, '?'])[1];
        if (typeof key !== 'string' || key.indexOf('?') >= 0) {
          var m2 = String(f.period || '').match(/Q(\d)\s*(\d{4})/);
          if (m2) key = m2[2] + '-Q' + m2[1];
        }
        filedByQ[key] = {
          gross: Number(ex.gross_sales != null ? ex.gross_sales : f.gross_receipts) || 0,
          taxable: Number(ex.taxable_sales != null ? ex.taxable_sales : (ex.gross_sales || f.gross_receipts)) || 0,
          tax: Number(ex.sales_tax_collected != null ? ex.sales_tax_collected : ex.sales_tax_due) || 0,
          form: f.form_type
        };
      });

      // Totals row
      var tot = { fGross: 0, fTax: 0, bSub: 0, bTax: 0 };

      html += '<details open style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 18px;margin-bottom:18px;">'
        + '<summary style="cursor:pointer;font-weight:700;font-size:14px;">🧾 NY Sales-Tax Reconciliation — ST-100 filings vs BM invoices</summary>'
        + '<div style="font-size:11px;color:var(--text-light);margin-top:6px;margin-bottom:10px;">'
        +   'Δ negative = BM invoiced LESS than filed (under-collected vs. NYS) · Δ positive = BM invoiced MORE than filed (under-reported to NYS). Goal: ±5%.'
        + '</div>'
        + '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">'
        + '<thead><tr style="border-bottom:2px solid var(--border);">'
        +   '<th style="text-align:left;padding:6px 8px;">Quarter</th>'
        +   '<th style="text-align:right;padding:6px 8px;">Filed gross (NY)</th>'
        +   '<th style="text-align:right;padding:6px 8px;">BM invoiced</th>'
        +   '<th style="text-align:right;padding:6px 8px;">Δ sales</th>'
        +   '<th style="text-align:right;padding:6px 8px;">Filed tax</th>'
        +   '<th style="text-align:right;padding:6px 8px;">BM tax</th>'
        +   '<th style="text-align:right;padding:6px 8px;">Δ tax</th>'
        +   '<th style="text-align:right;padding:6px 8px;font-size:11px;">Invoices</th>'
        + '</tr></thead><tbody>';

      qKeys.forEach(function(key) {
        var f = filedByQ[key];
        var b = invByQ[key];
        var fGross = f ? f.gross : 0;
        var fTax = f ? f.tax : 0;
        var bSub = b ? b.subtotal : 0;
        var bTax = b ? b.tax : 0;
        var n = b ? b.n : 0;
        tot.fGross += fGross; tot.fTax += fTax; tot.bSub += bSub; tot.bTax += bTax;
        var dSales = bSub - fGross;
        var dTax = bTax - fTax;
        // Color: green if within 5% AND filed is non-zero, red if either side is zero, yellow if drift
        var pctSales = fGross > 0 ? Math.abs(dSales / fGross) : (bSub > 0 ? 1 : 0);
        var salesOk = fGross > 0 && bSub > 0 && pctSales < 0.05;
        var salesPartial = (fGross === 0 && bSub > 0) || (bSub === 0 && fGross > 0);
        var salesColor = salesOk ? 'var(--green-dark)' : (salesPartial ? '#b45309' : '#b91c1c');
        var salesIcon = salesOk ? '✓' : (salesPartial ? '○' : '⚠');
        var pctTax = fTax > 0 ? Math.abs(dTax / fTax) : (bTax > 0 ? 1 : 0);
        var taxOk = fTax > 0 && bTax > 0 && pctTax < 0.05;
        var taxPartial = (fTax === 0 && bTax > 0) || (bTax === 0 && fTax > 0);
        var taxColor = taxOk ? 'var(--green-dark)' : (taxPartial ? '#b45309' : '#b91c1c');
        var taxIcon = taxOk ? '✓' : (taxPartial ? '○' : '⚠');
        html += '<tr style="border-bottom:1px solid var(--bg);">'
          + '<td style="padding:6px 8px;font-weight:700;">' + _esc(key) + '</td>'
          + '<td style="padding:6px 8px;text-align:right;">' + (fGross ? _moneyInt(fGross) : '<span style="color:var(--text-light);">—</span>') + '</td>'
          + '<td style="padding:6px 8px;text-align:right;">' + (bSub ? _moneyInt(bSub) : '<span style="color:var(--text-light);">—</span>') + '</td>'
          + '<td style="padding:6px 8px;text-align:right;font-weight:700;color:' + salesColor + ';">' + salesIcon + ' ' + (fGross || bSub ? _moneyInt(dSales) : '—') + '</td>'
          + '<td style="padding:6px 8px;text-align:right;color:var(--text-light);">' + (fTax ? _moneyInt(fTax) : '—') + '</td>'
          + '<td style="padding:6px 8px;text-align:right;color:var(--text-light);">' + (bTax ? _moneyInt(bTax) : '—') + '</td>'
          + '<td style="padding:6px 8px;text-align:right;font-weight:700;color:' + taxColor + ';">' + taxIcon + ' ' + (fTax || bTax ? _moneyInt(dTax) : '—') + '</td>'
          + '<td style="padding:6px 8px;text-align:right;font-size:11px;color:var(--text-light);">' + (n || '—') + '</td>'
          + '</tr>';
      });

      // Totals row
      html += '<tr style="border-top:2px solid var(--border);background:var(--bg);">'
        + '<td style="padding:6px 8px;font-weight:800;">All quarters</td>'
        + '<td style="padding:6px 8px;text-align:right;font-weight:700;">' + _moneyInt(tot.fGross) + '</td>'
        + '<td style="padding:6px 8px;text-align:right;font-weight:700;">' + _moneyInt(tot.bSub) + '</td>'
        + '<td style="padding:6px 8px;text-align:right;font-weight:700;">' + _moneyInt(tot.bSub - tot.fGross) + '</td>'
        + '<td style="padding:6px 8px;text-align:right;font-weight:700;color:var(--text-light);">' + _moneyInt(tot.fTax) + '</td>'
        + '<td style="padding:6px 8px;text-align:right;font-weight:700;color:var(--text-light);">' + _moneyInt(tot.bTax) + '</td>'
        + '<td style="padding:6px 8px;text-align:right;font-weight:700;">' + _moneyInt(tot.bTax - tot.fTax) + '</td>'
        + '<td style="padding:6px 8px;"></td>'
        + '</tr>';

      html += '</tbody></table></div>';
      // Footnote if BM has zero invoices for periods that were filed (typical
      // pre-BM history): explain so the user doesn't see all-red and panic.
      var preBm = qKeys.filter(function(k) { return filedByQ[k] && !invByQ[k]; });
      if (preBm.length > 0) {
        html += '<div style="font-size:11px;color:var(--text-light);margin-top:8px;padding:8px 10px;background:var(--bg);border-radius:6px;">'
          +   '<b>Note:</b> ' + preBm.length + ' quarter' + (preBm.length === 1 ? '' : 's') + ' filed with NYS pre-dates BM invoicing (' + _esc(preBm.slice(0, 4).join(', ')) + (preBm.length > 4 ? ', …' : '') + '). Those BM-invoiced columns will be $0 until historical invoices are imported — not an under-collection.'
          + '</div>';
      }
      html += '</details>';
    }

    html += '</div>'; // end TAXES pane

    // ===== INVOICES (A/R) pane: outstanding invoice aging =====
    _BC('pre-invoices'); html += '<div class="bk-pane" data-pane="invoices" style="display:' + (TAB === 'invoices' ? 'block' : 'none') + ';">';

    // ──────────────────────────────────────────────────────────────────
    // v880: Outstanding Invoices (AR aging) — surface unpaid > 0 by age
    // bucket. Direct cash-recovery surface. Drafts get a separate row so
    // Doug can see invoices that were never sent. Each row gets quick-
    // action buttons: Open / Send follow-up / Mark paid.
    // ──────────────────────────────────────────────────────────────────
    var today = new Date();
    var ageDays = function(d) {
      if (!d) return null;
      var diff = Math.floor((today - new Date(d)) / 86400000);
      return diff >= 0 ? diff : null;
    };
    var outstandingAll = (_invoicesQ || []).filter(function(iv) {
      var bal = Number(iv.balance);
      if (isNaN(bal)) bal = Number(iv.total) || 0;
      return bal > 0.01 && iv.status !== 'paid' && iv.status !== 'void';
    }).map(function(iv) {
      var bal = Number(iv.balance);
      if (isNaN(bal)) bal = Number(iv.total) || 0;
      return {
        id: iv.id,
        num: iv.invoice_number,
        client: iv.client_name || 'Unknown client',
        balance: bal,
        issued: iv.issued_date,
        due: iv.due_date,
        status: iv.status,
        age: ageDays(iv.issued_date)
      };
    });
    outstandingAll.sort(function(a, b) { return b.balance - a.balance; });

    if (outstandingAll.length > 0) {
      // Bucket: drafts (never sent), current (<30d), warning (30-60d), late (60-90d), critical (90+d)
      var buckets = {
        drafts: outstandingAll.filter(function(iv) { return iv.status === 'draft' || iv.age == null; }),
        current: outstandingAll.filter(function(iv) { return iv.status !== 'draft' && iv.age != null && iv.age < 30; }),
        warn30: outstandingAll.filter(function(iv) { return iv.status !== 'draft' && iv.age != null && iv.age >= 30 && iv.age < 60; }),
        late60: outstandingAll.filter(function(iv) { return iv.status !== 'draft' && iv.age != null && iv.age >= 60 && iv.age < 90; }),
        crit90: outstandingAll.filter(function(iv) { return iv.status !== 'draft' && iv.age != null && iv.age >= 90; })
      };
      var totalDue = outstandingAll.reduce(function(s, iv) { return s + iv.balance; }, 0);
      var sentOnly = outstandingAll.filter(function(iv) { return iv.status !== 'draft' && iv.age != null; });
      var dso = sentOnly.length ? Math.round(sentOnly.reduce(function(s, iv) { return s + iv.age; }, 0) / sentOnly.length) : 0;
      var hasAged = buckets.warn30.length + buckets.late60.length + buckets.crit90.length > 0;

      // Bucket chip row
      var chip = function(label, n, sum, color, bg) {
        if (n === 0) return '';
        return '<div style="background:' + bg + ';color:' + color + ';padding:8px 12px;border-radius:8px;font-size:12px;font-weight:600;display:inline-flex;align-items:baseline;gap:6px;">'
          + '<span style="font-size:14px;font-weight:800;">' + n + '</span>' + label
          + '<span style="opacity:0.7;font-weight:500;font-size:11px;">· ' + _moneyInt(sum) + '</span></div>';
      };
      var sumOf = function(arr) { return arr.reduce(function(s, iv) { return s + iv.balance; }, 0); };

      html += '<details ' + (hasAged ? 'open' : '') + ' style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 18px;margin-bottom:18px;' + (hasAged ? 'border-left:4px solid #b45309;' : '') + '">'
        + '<summary style="cursor:pointer;font-weight:700;font-size:14px;display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;">'
        +   '<span>💰 Outstanding Invoices <span style="color:var(--text-light);font-weight:500;font-size:12px;">· ' + outstandingAll.length + ' unpaid · ' + _moneyInt(totalDue) + ' due</span></span>'
        +   '<span style="font-size:11px;color:var(--text-light);font-weight:500;">Avg DSO: ' + dso + 'd</span>'
        + '</summary>'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0;">'
        +   chip(' drafts (never sent)', buckets.drafts.length, sumOf(buckets.drafts), '#7f1d1d', '#fef2f2')
        +   chip(' current (<30d)', buckets.current.length, sumOf(buckets.current), '#065f46', '#ecfdf5')
        +   chip(' 30-60d', buckets.warn30.length, sumOf(buckets.warn30), '#92400e', '#fef3c7')
        +   chip(' 60-90d', buckets.late60.length, sumOf(buckets.late60), '#9a3412', '#fff7ed')
        +   chip(' 90+d', buckets.crit90.length, sumOf(buckets.crit90), '#991b1b', '#fef2f2')
        + '</div>'
        + '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">'
        + '<thead><tr style="border-bottom:2px solid var(--border);">'
        +   '<th style="text-align:left;padding:6px 8px;">Inv #</th>'
        +   '<th style="text-align:left;padding:6px 8px;">Client</th>'
        +   '<th style="text-align:right;padding:6px 8px;">Balance</th>'
        +   '<th style="text-align:right;padding:6px 8px;">Age</th>'
        +   '<th style="text-align:left;padding:6px 8px;">Status</th>'
        +   '<th style="text-align:right;padding:6px 8px;">Action</th>'
        + '</tr></thead><tbody>';

      outstandingAll.slice(0, 30).forEach(function(iv) {
        var rowColor;
        if (iv.status === 'draft') rowColor = '#fef2f2';
        else if (iv.age == null) rowColor = 'var(--white)';
        else if (iv.age >= 90) rowColor = '#fef2f2';
        else if (iv.age >= 60) rowColor = '#fff7ed';
        else if (iv.age >= 30) rowColor = '#fef3c7';
        else rowColor = 'var(--white)';
        var ageLabel = iv.status === 'draft' ? '<span style="color:#7f1d1d;font-weight:700;">DRAFT</span>' : (iv.age != null ? iv.age + 'd' : '—');
        var ageColor = (iv.age != null && iv.age >= 60) ? '#991b1b' : (iv.age != null && iv.age >= 30) ? '#92400e' : 'var(--text)';
        var actionBtn = iv.status === 'draft'
          ? '<button onclick="loadPage(\'invoices\');setTimeout(function(){if(typeof InvoicesPage!==\'undefined\'&&InvoicesPage.showForm)InvoicesPage.showForm(\'' + iv.id + '\');},100);" style="background:#7f1d1d;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">Open</button>'
          : '<button onclick="BooksPage.sendInvoiceFollowup(\'' + iv.id + '\')" style="background:#2e7d32;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">📬 Follow-up</button>';
        html += '<tr style="border-bottom:1px solid var(--bg);background:' + rowColor + ';">'
          + '<td style="padding:6px 8px;font-weight:700;">' + (iv.num != null ? '#' + iv.num : '—') + '</td>'
          + '<td style="padding:6px 8px;">' + _esc(iv.client) + '</td>'
          + '<td style="padding:6px 8px;text-align:right;font-weight:700;">' + _moneyInt(iv.balance) + '</td>'
          + '<td style="padding:6px 8px;text-align:right;color:' + ageColor + ';font-weight:600;">' + ageLabel + '</td>'
          + '<td style="padding:6px 8px;font-size:11px;color:var(--text-light);text-transform:capitalize;">' + _esc(iv.status || '—') + '</td>'
          + '<td style="padding:6px 8px;text-align:right;">' + actionBtn + '</td>'
          + '</tr>';
      });

      if (outstandingAll.length > 30) {
        html += '<tr><td colspan="6" style="padding:6px 8px;text-align:center;color:var(--text-light);font-size:11px;font-style:italic;">… ' + (outstandingAll.length - 30) + ' more — open the Invoices page to see all</td></tr>';
      }
      html += '</tbody></table></div></details>';
    }

    // v865: Uncategorized review — groups 6999 rows by merchant prefix,
    // lets the operator bulk-recategorize one merchant at a time with a
    // single click. Saves slogging through 388 individual dropdowns.
    var uncatTxns = txns.filter(function(t) { return (t.category || '6999') === '6999'; });
    if (uncatTxns.length >= 5) {
      var groups = {};
      uncatTxns.forEach(function(t) {
        // Group by first 30 chars of description, stripped of trailing transaction-id-like numbers
        // EXCEPT keep the destination account number when description matches a
        // "PMT TO <digits>" or similar payment-routing pattern — those need to
        // be grouped per-destination so Doug can label each CC/vendor separately.
        var desc = (t.description || '').toUpperCase();
        var key;
        var pmtMatch = desc.match(/(WEB PMT TO|PMT TO|TRANSFER TO|ACH TO)\s+(\d{6,})/);
        if (pmtMatch) {
          key = pmtMatch[1] + ' ' + pmtMatch[2];  // e.g. "WEB PMT TO 4691021837728882"
        } else {
          key = desc.slice(0, 30).replace(/\s+\d{8,}.*$/, '').trim();
        }
        if (!key) key = '(no description)';
        if (!groups[key]) groups[key] = { txns: [], total_abs: 0, total_signed: 0 };
        groups[key].txns.push(t);
        groups[key].total_abs += Math.abs(Number(t.amount) || 0);
        groups[key].total_signed += Number(t.amount) || 0;
      });
      var sortedGroups = Object.keys(groups)
        .map(function(k) { return { key: k, txns: groups[k].txns, total_abs: groups[k].total_abs, total_signed: groups[k].total_signed }; })
        .sort(function(a, b) { return b.total_abs - a.total_abs; })
        .slice(0, 15);

      html += '<details style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 18px;margin-bottom:18px;">'
        + '<summary style="cursor:pointer;font-weight:700;font-size:14px;color:#92400e;">🔍 Uncategorized review — ' + uncatTxns.length + ' rows · top 15 merchants by spend</summary>'
        + '<div style="margin-top:12px;font-size:11px;color:var(--text-light);margin-bottom:8px;">Pick a category for the whole merchant group → click Apply. Each row can still be retagged individually below.</div>';
      sortedGroups.forEach(function(g, idx) {
        var avgPerTxn = g.total_signed / g.txns.length;
        var direction = avgPerTxn < 0 ? '↓ outflow' : '↑ inflow';
        var dirColor = avgPerTxn < 0 ? '#b45309' : 'var(--green-dark)';
        html += '<div style="display:grid;grid-template-columns:1fr 90px 200px 100px;gap:10px;align-items:center;padding:8px 10px;border-radius:8px;background:#fff;margin-bottom:6px;border:1px solid var(--border);">'
          + '<div><div style="font-size:12px;font-weight:700;">' + _esc(g.key.slice(0,40)) + '</div>'
          +     '<div style="font-size:11px;color:var(--text-light);">' + g.txns.length + ' txn' + (g.txns.length===1?'':'s') + ' · ' + direction + '</div></div>'
          + '<div style="text-align:right;font-weight:700;color:' + dirColor + ';font-size:13px;">' + _moneyInt(g.total_abs) + '</div>'
          + '<select id="uncat-sel-' + idx + '" style="padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:#fff;">'
          +   '<option value="">— pick category —</option>'
          +   chart.map(function(co) { return '<option value="' + co.code + '">' + _esc(co.code) + ' · ' + _esc(co.name) + '</option>'; }).join('')
          + '</select>'
          + '<button onclick="BooksPage._bulkRecategorize(' + JSON.stringify(g.txns.map(function(t){return t.id;})).replace(/"/g,'&quot;') + ', document.getElementById(\'uncat-sel-' + idx + '\').value)" style="background:var(--green-dark);color:#fff;border:none;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">Apply</button>'
          + '</div>';
      });
      html += '</details>';
    }

    // Filter row
    html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">'
      + '<select onchange="BooksPage._setRange(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;">'
      +   rangeOpts.map(function(r) { return '<option value="' + r[0] + '"' + (_filter.range === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('')
      + '</select>'
      + '<select onchange="BooksPage._setAccount(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;">'
      +   '<option value="all">All accounts</option>'
      +   accounts.map(function(a) { return '<option value="' + a.id + '"' + (_filter.account === a.id ? ' selected' : '') + '>' + _esc(a.name) + '</option>'; }).join('')
      + '</select>'
      + '<input type="text" placeholder="Search description / merchant…" value="' + _esc(_filter.search) + '" '
      +   'oninput="clearTimeout(window.__booksSearchT);window.__booksSearchT=setTimeout(function(){BooksPage._setSearch(arguments[0]);}.bind(null, this.value), 250);" '
      +   'style="flex:1;padding:7px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;min-width:220px;">'
      + '<span style="margin-left:auto;font-size:12px;color:var(--text-light);">' + txns.length + ' transactions</span>'
      + '</div>';

    // Filter txns
    var filtered = txns.filter(function(t) {
      if (_filter.account !== 'all' && t.account_id !== _filter.account) return false;
      if (_filter.category !== 'all' && (t.category || '') !== _filter.category) return false;
      if (_filter.search) {
        var hay = ((t.description||'') + ' ' + (t.merchant_name||'')).toLowerCase();
        if (hay.indexOf(_filter.search.toLowerCase()) === -1) return false;
      }
      return true;
    });

    html += '</div>'; // end INVOICES (A/R) pane

    // ===== TRANSACTIONS pane: the bank register + categorization =====
    _BC('pre-transactions'); html += '<div class="bk-pane" data-pane="transactions" style="display:' + (TAB === 'transactions' ? 'block' : 'none') + ';">';

    // Transactions table
    if (filtered.length === 0) {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:32px;text-align:center;font-size:13px;color:var(--text-light);">'
        + 'No transactions in this range. <a onclick="BooksPage.syncNow()" style="color:var(--green-dark);cursor:pointer;">Sync now</a> to pull the latest from Plaid.'
        + '</div>';
    } else {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">'
        + '<div style="display:grid;grid-template-columns:90px 1fr 200px 110px;gap:12px;padding:10px 16px;background:var(--bg);font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;">'
        +   '<div>Date</div><div>Description</div><div>Category</div><div style="text-align:right;">Amount</div>'
        + '</div>';

      var chartByCode = {};
      chart.forEach(function(c) { chartByCode[c.code] = c; });

      _BC('txn-loop-start:'+filtered.length+'x'+chart.length);
      filtered.slice(0, 200).forEach(function(t) {
        var amt = Number(t.amount) || 0;
        var amtColor = amt > 0 ? 'var(--green-dark)' : 'var(--text)';
        var c = chartByCode[t.category];
        var pending = t.pending ? '<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:6px;">PENDING</span>' : '';
        // v859: matched chip — green when reconciled, hover shows what it's linked to
        var matched = t.reconciled && t.matched_to_id
          ? '<span title="Linked to ' + _esc(t.matched_to_kind || 'record') + ' ' + _esc(t.matched_to_id).slice(0,8) + '…" style="background:#dcfce7;color:#166534;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:6px;">✓ ' + _esc((t.matched_to_kind || '').slice(0,3).toUpperCase()) + '</span>'
          : '';
        // v884: owner-funded badge — visually distinguish personally-paid biz expenses
        var ownerBadge = t.owner_funded
          ? '<span title="Paid from personal funds (owner-funded business expense)" style="background:#faf5ff;color:#7c3aed;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:6px;border:1px solid #ddd6fe;">👤 OWNER</span>'
          : '';
        html += '<div style="display:grid;grid-template-columns:90px 1fr 200px 110px;gap:12px;padding:11px 16px;border-top:1px solid var(--border);font-size:13px;align-items:center;">'
          +   '<div style="color:var(--text-light);font-size:12px;">' + _date(t.posted_date) + '</div>'
          +   '<div><strong>' + _esc(t.description) + '</strong>' + pending + matched + ownerBadge
          +     (t.merchant_name && t.merchant_name !== t.description ? '<div style="font-size:11px;color:var(--text-light);">' + _esc(t.merchant_name) + '</div>' : '')
          +   '</div>'
          +   '<div>'
          +     '<select onchange="BooksPage._setCategory(\'' + t.id + '\', this.value)" style="width:100%;padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:#fff;">'
          +       '<option value="">— Uncategorized —</option>'
          +       chart.map(function(co) { return '<option value="' + co.code + '"' + (co.code === t.category ? ' selected' : '') + '>' + _esc(co.code) + ' · ' + _esc(co.name) + '</option>'; }).join('')
          +     '</select>'
          +   '</div>'
          +   '<div style="text-align:right;font-weight:700;color:' + amtColor + ';">' + _money(amt) + '</div>'
          + '</div>';
      });
      if (filtered.length > 200) {
        html += '<div style="padding:14px;text-align:center;font-size:12px;color:var(--text-light);">… +' + (filtered.length - 200) + ' more rows. Narrow the filter or shorten the date range.</div>';
      }
      html += '</div>';
    }

    html += '</div>'; // end TRANSACTIONS pane
    html += '</div>'; // close content column
    html += '</div>'; // close sidebar + content flex row
    html += '</div>'; // close max-width wrapper
    _BC('shell-return');
    return html;
  }

  function _renderSetupHint() {
    return '<div style="margin-top:16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:18px;font-size:13px;color:#7c2d12;line-height:1.6;">'
      + '<div style="font-weight:700;color:#9a3412;margin-bottom:6px;">Plaid setup (one-time, ~3 minutes):</div>'
      + '<ol style="padding-left:22px;">'
      +   '<li>Sign up at <a href="https://dashboard.plaid.com/signup" target="_blank" rel="noopener" style="color:var(--green-dark);text-decoration:underline;">dashboard.plaid.com</a> (free Sandbox + Development tiers).</li>'
      +   '<li>Grab your <strong>Client ID</strong> + <strong>Sandbox Secret</strong> from Team Settings → Keys.</li>'
      +   '<li>Paste them in <a onclick="loadPage(\'settings\');setTimeout(function(){try{SettingsPage._switchTab(\'advanced\');document.getElementById(\'plaid-client-id\').scrollIntoView({block:\'center\',behavior:\'smooth\'});}catch(e){}},200);" style="color:var(--green-dark);text-decoration:underline;cursor:pointer;">Settings → Advanced → Plaid (Bank Sync)</a> — BM verifies the keys with Plaid before saving.</li>'
      +   '<li>(Optional) Set webhook URL in Plaid dashboard → Team Settings → API: <code style="background:#fff;padding:2px 6px;border-radius:4px;font-family:monospace;">https://ltpivkqahvplapyagljt.supabase.co/functions/v1/plaid-webhook</code> — enables auto-sync as transactions post.</li>'
      +   '<li>Come back here, click "Connect bank". Sandbox lets you log in as <code>user_good / pass_good</code>.</li>'
      + '</ol>'
      + '</div>';
  }

  function connectBank() {
    if (typeof Plaid === 'undefined') {
      UI.toast('Plaid Link script still loading — try again in a moment', 'error');
      return;
    }

    UI.toast('Requesting Plaid Link token…');
    fetch('https://ltpivkqahvplapyagljt.supabase.co/functions/v1/plaid-link-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID() })
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.error) { UI.toast('Plaid: ' + data.error, 'error'); return; }
      var handler = Plaid.create({
        token: data.link_token,
        onSuccess: function(public_token, metadata) {
          UI.toast('Linked! Importing accounts…');
          fetch('https://ltpivkqahvplapyagljt.supabase.co/functions/v1/plaid-exchange-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenant_id: TENANT_ID(), public_token: public_token, metadata: metadata })
          }).then(function(r) { return r.json(); }).then(function(out) {
            if (out.error) { UI.toast('Exchange failed: ' + out.error, 'error'); return; }
            UI.toast('Bank connected (' + (out.accounts || []).length + ' account' + ((out.accounts||[]).length===1?'':'s') + '). Backfilling 2 years of transactions in the background.', 'success');
            _accounts = null; _txns = null; // force refetch
            _fetchAll().then(function() { loadPage(window._currentPage || 'reports'); });
          });
        },
        onExit: function(err, _meta) {
          if (err) UI.toast('Plaid Link cancelled: ' + (err.error_message || err.error_code || 'unknown'), 'error');
        },
        onEvent: function(_eventName, _meta) { /* analytics hook */ }
      });
      handler.open();
    }).catch(function(e) {
      UI.toast('Network error: ' + e.message, 'error');
    });
  }

  function syncNow() {
    UI.toast('Syncing transactions from Plaid…');
    fetch('https://ltpivkqahvplapyagljt.supabase.co/functions/v1/plaid-sync-transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID() })
    }).then(function(r) { return r.json(); }).then(function(out) {
      if (out.error) { UI.toast('Sync failed: ' + out.error, 'error'); return; }
      UI.toast('Synced ' + (out.synced || 0) + ' transaction' + ((out.synced||0)===1?'':'s'), 'success');
      _txns = null; _fetchAll().then(function() { loadPage(window._currentPage || 'reports'); });
    });
  }

  function _setRange(v) { _filter.range = v; _txns = null; _fetchAll().then(function() { loadPage(window._currentPage || 'reports'); }); }
  function _setAccount(v) { _filter.account = v; loadPage(window._currentPage || 'reports'); }
  function _setSearch(v) { _filter.search = v; loadPage(window._currentPage || 'reports'); }
  function _setCategory(txnId, code) {
    var sb = _supabase(); if (!sb) return;
    sb.from('bank_transactions').update({ category: code || null }).eq('id', txnId).then(function(res) {
      if (res.error) UI.toast('Category save failed', 'error');
      // Update in-memory copy
      if (_txns) {
        var t = _txns.find(function(x) { return x.id === txnId; });
        if (t) t.category = code || null;
      }
    });
  }

  // v865: bulk-recategorize a list of bank_transaction IDs to one COA code.
  // Called by the "Apply" buttons in the Uncategorized Review section.
  async function _bulkRecategorize(ids, code) {
    if (!code) { UI.toast('Pick a category first', 'error'); return; }
    if (!Array.isArray(ids) || !ids.length) return;
    var sb = _supabase(); if (!sb) return;
    UI.toast('Updating ' + ids.length + ' rows…');
    try {
      var r = await sb.from('bank_transactions').update({ category: code }).in('id', ids);
      if (r.error) { UI.toast('Update failed: ' + r.error.message, 'error'); return; }
      // Update in-memory + force re-render
      if (_txns) {
        ids.forEach(function(id) {
          var t = _txns.find(function(x) { return x.id === id; });
          if (t) t.category = code;
        });
      }
      UI.toast('✅ ' + ids.length + ' rows → ' + code);
      loadPage(window._currentPage || 'reports');
    } catch (e) {
      UI.toast('Update error: ' + e.message, 'error');
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Reconciliation (v859) — match unreconciled bank_transactions to BM
  // payments + expenses by amount + posted_date proximity. Auto-confirms
  // unique matches; leaves ambiguous (multi-match) or no-match alone for
  // manual review.
  //
  // Matching rules:
  //   - Positive bank_transaction (deposit) → BM payments
  //     · amount = payment.amount ± $0.01
  //     · |bank.posted_date - payment.payout_date or payment.date| ≤ 3 days
  //   - Negative bank_transaction (withdrawal) → DB.expenses
  //     · amount magnitude = expense.amount ± $0.01
  //     · |bank.posted_date - expense.date| ≤ 3 days
  //
  // Updates bank_transactions.matched_to_kind ('payment'|'expense'|'invoice'),
  // matched_to_id, reconciled=true. Won't overwrite an already-matched row.
  //
  // Per the v848-v858 work, the algorithm runs entirely in the BM client
  // — no edge fn needed. Service role isn't required since the user's
  // JWT already permits read/write on tenant-scoped rows via RLS.
  // ──────────────────────────────────────────────────────────────────
  // v868 — CPA-ready CSV export. Prompts for year, pulls all
  // bank_transactions for that year, groups by COA code, generates a CSV
  // with: Date, Description, Amount, Category Code, Category Name,
  // Account, Reconciled flag, Matched-Payment ID. Downloads to user's
  // Downloads folder via <a download>. Handed to CPA at year-end → they
  // import into QuickBooks / Drake / Lacerte / ProSeries.
  async function exportCpaCsv() {
    var sb = _supabase(); if (!sb) { UI.toast('Supabase not ready', 'error'); return; }
    var tenantId = TENANT_ID(); if (!tenantId) return;

    // Year picker — defaults to most recent year with data
    var allYears = {};
    (_allTxns || []).forEach(function(t) {
      var yr = parseInt((t.posted_date || '').slice(0, 4), 10);
      if (yr) allYears[yr] = true;
    });
    var sortedYears = Object.keys(allYears).sort();
    if (!sortedYears.length) { UI.toast('No transactions to export', 'error'); return; }
    var defaultYear = sortedYears[sortedYears.length - 1];
    var year = prompt('Export which tax year as CPA CSV?\n\nYears with data: ' + sortedYears.join(', '), defaultYear);
    if (!year) return;
    year = parseInt(year, 10);
    if (!year || !allYears[year]) { UI.toast('No data for year ' + year, 'error'); return; }

    UI.toast('Building ' + year + ' CSV…');

    // Fetch ALL transactions for that year (not range-limited)
    var since = year + '-01-01';
    var until = (year + 1) + '-01-01';
    var r = await sb.from('bank_transactions').select('*')
      .eq('tenant_id', tenantId)
      .gte('posted_date', since)
      .lt('posted_date', until)
      .order('posted_date');
    if (r.error) { UI.toast('Fetch error: ' + r.error.message, 'error'); return; }
    var rows = r.data || [];
    if (!rows.length) { UI.toast('Zero rows for ' + year, 'error'); return; }

    // Build COA lookup
    var coaByCode = {};
    (_chart || []).forEach(function(c) { coaByCode[c.code] = c; });
    var acctById = {};
    (_accounts || []).forEach(function(a) { acctById[a.id] = a; });

    // CSV escape helper
    function esc(v) {
      if (v == null) return '';
      var s = String(v);
      if (s.indexOf('"') >= 0 || s.indexOf(',') >= 0 || s.indexOf('\n') >= 0) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }
    var header = ['Date','Description','Merchant','Amount','COA Code','COA Name','COA Type','Account','Reconciled','Matched Kind','Matched ID','External ID','Source'];
    var lines = [header.map(esc).join(',')];
    rows.forEach(function(t) {
      var coa = coaByCode[t.category] || {};
      var acct = acctById[t.account_id] || {};
      lines.push([
        t.posted_date,
        t.description,
        t.merchant_name,
        Number(t.amount).toFixed(2),
        t.category || '',
        coa.name || '',
        coa.account_type || '',
        acct.name || '',
        t.reconciled ? 'Y' : 'N',
        t.matched_to_kind || '',
        t.matched_to_id || '',
        t.external_id || '',
        t.source || ''
      ].map(esc).join(','));
    });

    // Summary block at the bottom — total per COA code (revenue side + expense side separately)
    var coaTotals = {};
    rows.forEach(function(t) {
      var k = t.category || '6999';
      if (!coaTotals[k]) coaTotals[k] = 0;
      coaTotals[k] += Number(t.amount) || 0;
    });
    lines.push('');
    lines.push(['','','','SUMMARY BY COA CODE','','','','','','','','',''].map(esc).join(','));
    lines.push(['COA Code','COA Name','Total','','','','','','','','','',''].map(esc).join(','));
    Object.keys(coaTotals).sort().forEach(function(k) {
      var coa = coaByCode[k] || {};
      lines.push([k, coa.name || '', coaTotals[k].toFixed(2), '', '', '', '', '', '', '', '', '', ''].map(esc).join(','));
    });

    // Trigger download
    var csv = lines.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'snt-books-' + year + '-cpa-export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.toast('✅ ' + rows.length + ' rows exported to Downloads');
  }

  // v881: Year-end CPA Package — a single ZIP containing every spreadsheet
  // the accountant typically asks for. Replaces the back-and-forth email
  // thread where the CPA requests one file, you export, they request another.
  //
  // Contents:
  //   README.txt              — what's in the ZIP + how to read it
  //   1-bookkeeping.csv       — every categorized transaction (same as CSV-only)
  //   2-profit-and-loss.csv   — P&L summary by COA code
  //   3-tax-year-recon.csv    — book P&L vs filed federal return
  //   4-sales-tax-recon.csv   — NY-ST quarterly filings vs BM invoiced tax
  //   5-invoice-aging.csv     — outstanding AR by age bucket
  //   6-wages-941-summary.csv — payroll wages by 941 quarter
  //
  // Lazy-loads JSZip from the CDN script tag in index.html.
  async function exportCpaPackage() {
    if (typeof JSZip === 'undefined') {
      UI.toast('Loading ZIP library…');
      // Wait briefly for the async script tag to land
      for (var i = 0; i < 40; i++) {
        if (typeof JSZip !== 'undefined') break;
        await new Promise(function(r) { setTimeout(r, 100); });
      }
      if (typeof JSZip === 'undefined') {
        UI.toast('ZIP library not available — try again in a moment', 'error');
        return;
      }
    }

    var sb = _supabase(); if (!sb) { UI.toast('Supabase not ready', 'error'); return; }
    var tenantId = TENANT_ID(); if (!tenantId) return;

    var allYears = {};
    (_allTxns || []).forEach(function(t) {
      var yr = parseInt((t.posted_date || '').slice(0, 4), 10);
      if (yr) allYears[yr] = true;
    });
    var sortedYears = Object.keys(allYears).sort();
    if (!sortedYears.length) { UI.toast('No transactions yet', 'error'); return; }
    var defaultYear = sortedYears[sortedYears.length - 1];
    var year = prompt('Build CPA package for which tax year?\n\nYears with data: ' + sortedYears.join(', '), defaultYear);
    if (!year) return;
    year = parseInt(year, 10);
    if (!year || !allYears[year]) { UI.toast('No data for year ' + year, 'error'); return; }

    UI.toast('Building ' + year + ' CPA package…');

    function esc(v) {
      if (v == null) return '';
      var s = String(v);
      if (s.indexOf('"') >= 0 || s.indexOf(',') >= 0 || s.indexOf('\n') >= 0) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }
    function toCsv(rows) { return rows.map(function(row) { return row.map(esc).join(','); }).join('\n'); }

    // Build COA lookup
    var coaByCode = {};
    (_chart || []).forEach(function(c) { coaByCode[c.code] = c; });
    var acctById = {};
    (_accounts || []).forEach(function(a) { acctById[a.id] = a; });

    // ── 1. Bookkeeping CSV (every transaction in the year) ──
    var since = year + '-01-01';
    var until = (year + 1) + '-01-01';
    var txnRes = await sb.from('bank_transactions').select('*')
      .eq('tenant_id', tenantId)
      .gte('posted_date', since).lt('posted_date', until)
      .order('posted_date');
    if (txnRes.error) { UI.toast('Fetch error: ' + txnRes.error.message, 'error'); return; }
    var txnRows = txnRes.data || [];

    var bkRows = [['Date','Description','Merchant','Amount','COA Code','COA Name','COA Type','Account','Reconciled','Matched Kind','Matched ID','External ID','Source']];
    var coaTotals = {};
    txnRows.forEach(function(t) {
      var coa = coaByCode[t.category] || {};
      var acct = acctById[t.account_id] || {};
      bkRows.push([
        t.posted_date, t.description, t.merchant_name, Number(t.amount).toFixed(2),
        t.category || '', coa.name || '', coa.account_type || '', acct.name || '',
        t.reconciled ? 'Y' : 'N', t.matched_to_kind || '', t.matched_to_id || '',
        t.external_id || '', t.source || ''
      ]);
      var k = t.category || '6999';
      coaTotals[k] = (coaTotals[k] || 0) + (Number(t.amount) || 0);
    });

    // ── 2. P&L Summary ──
    var revRows = [], expRows = [], xferRows = [];
    Object.keys(coaTotals).sort().forEach(function(k) {
      var coa = coaByCode[k] || {};
      var row = [k, coa.name || '', coaTotals[k].toFixed(2)];
      var cls = k.charAt(0);
      if (cls === '4') revRows.push(row);
      else if (cls === '7') xferRows.push(row);
      else expRows.push(row);
    });
    var revTotal = revRows.reduce(function(s, r) { return s + Number(r[2]); }, 0);
    var expTotal = expRows.reduce(function(s, r) { return s + Math.abs(Number(r[2])); }, 0);
    var net = revTotal - expTotal;

    var plRows = [['Section','COA Code','COA Name','Amount']];
    plRows.push(['REVENUE','','','']);
    revRows.forEach(function(r) { plRows.push(['Revenue', r[0], r[1], r[2]]); });
    plRows.push(['','','Revenue Total', revTotal.toFixed(2)]);
    plRows.push(['','','','']);
    plRows.push(['EXPENSES','','','']);
    expRows.forEach(function(r) { plRows.push(['Expense', r[0], r[1], Math.abs(Number(r[2])).toFixed(2)]); });
    plRows.push(['','','Expense Total', expTotal.toFixed(2)]);
    plRows.push(['','','','']);
    plRows.push(['NET INCOME','','', net.toFixed(2)]);
    if (xferRows.length) {
      plRows.push(['','','','']);
      plRows.push(['TRANSFERS / DRAWS (not in P&L)','','','']);
      xferRows.forEach(function(r) { plRows.push(['Transfer', r[0], r[1], r[2]]); });
    }

    // ── 3. Tax-Year Reconciliation (book vs filed) ──
    var trRows = [['Tax Year','Form','Tax Return Net','BM Books Net','Δ Net','Tax Return Revenue','BM Books Revenue','Δ Revenue']];
    var federalReturns = (_taxFilings || []).filter(function(f) {
      var ft = (f.form_type || '').toLowerCase();
      return ft.indexOf('1120') >= 0 || ft.indexOf('sch') === 0 || ft.indexOf('1040') >= 0 || ft.indexOf('1065') >= 0;
    });
    var bookByYear = {};
    (_allTxns || []).forEach(function(t) {
      var yr = parseInt((t.posted_date || '').slice(0, 4), 10);
      if (!yr) return;
      var cat = (t.category || '').toString();
      if (cat.charAt(0) === '7') return;
      var amt = Number(t.amount) || 0;
      if (!bookByYear[yr]) bookByYear[yr] = { rev: 0, exp: 0 };
      if (cat.charAt(0) === '4') bookByYear[yr].rev += amt;
      else if (amt < 0) bookByYear[yr].exp += -amt;
    });
    federalReturns.forEach(function(f) {
      var b = bookByYear[f.tax_year] || { rev: 0, exp: 0 };
      var bookNet = b.rev - b.exp;
      var taxNet = Number(f.net_income) || 0;
      var taxRev = Number(f.gross_receipts) || 0;
      trRows.push([f.tax_year, f.form_type || '', taxNet.toFixed(2), bookNet.toFixed(2), (bookNet - taxNet).toFixed(2), taxRev.toFixed(2), b.rev.toFixed(2), (b.rev - taxRev).toFixed(2)]);
    });
    if (federalReturns.length === 0) trRows.push(['(no federal returns imported into tax_filings)','','','','','','','']);

    // ── 4. NY Sales-Tax Reconciliation (quarter by quarter) ──
    var stRows = [['Quarter','Form','Filed Gross Sales','Filed Taxable Sales','Filed Sales Tax Collected','BM Invoiced Subtotal','BM Invoiced Tax','Δ Sales','Δ Tax']];
    var nyStFilings = (_taxFilings || []).filter(function(f) { return (f.form_type || '').toUpperCase().indexOf('NY-ST') === 0; });
    var invByQ = {};
    (_invoicesQ || []).forEach(function(iv) {
      var d = iv.issued_date; if (!d) return;
      var yr = parseInt(d.slice(0, 4), 10), mo = parseInt(d.slice(5, 7), 10);
      if (!yr || !mo) return;
      var key = yr + '-Q' + Math.ceil(mo / 3);
      if (!invByQ[key]) invByQ[key] = { subtotal: 0, tax: 0 };
      invByQ[key].subtotal += Number(iv.subtotal) || 0;
      invByQ[key].tax += Number(iv.tax_amount) || 0;
    });
    nyStFilings.forEach(function(f) {
      var ex = f.extracted || {};
      var key = f.tax_year + '-Q' + (ex.quarter || (f.form_type || '').match(/Q(\d)/) || [0, '?'])[1];
      var b = invByQ[key] || { subtotal: 0, tax: 0 };
      var fGross = Number(ex.gross_sales != null ? ex.gross_sales : f.gross_receipts) || 0;
      var fTaxable = Number(ex.taxable_sales != null ? ex.taxable_sales : fGross) || 0;
      var fTax = Number(ex.sales_tax_collected != null ? ex.sales_tax_collected : ex.sales_tax_due) || 0;
      stRows.push([key, f.form_type || '', fGross.toFixed(2), fTaxable.toFixed(2), fTax.toFixed(2), b.subtotal.toFixed(2), b.tax.toFixed(2), (b.subtotal - fGross).toFixed(2), (b.tax - fTax).toFixed(2)]);
    });
    if (nyStFilings.length === 0) stRows.push(['(no NY-ST filings imported into tax_filings)','','','','','','','','']);

    // ── 5. Invoice Aging (snapshot as of today, for the year's invoices) ──
    var todayD = new Date();
    var arRows = [['Invoice #','Client','Issued Date','Due Date','Total','Balance','Status','Age (days)']];
    (_invoicesQ || []).filter(function(iv) {
      var yr = (iv.issued_date || '').slice(0, 4);
      return yr == year && (iv.status !== 'paid' && iv.status !== 'void') && Number(iv.balance || iv.total || 0) > 0.01;
    }).sort(function(a, b) {
      var bA = Number(a.balance || a.total || 0), bB = Number(b.balance || b.total || 0);
      return bB - bA;
    }).forEach(function(iv) {
      var age = iv.issued_date ? Math.floor((todayD - new Date(iv.issued_date)) / 86400000) : '';
      arRows.push([iv.invoice_number || '', iv.client_name || '', iv.issued_date || '', iv.due_date || '', Number(iv.total || 0).toFixed(2), Number(iv.balance || iv.total || 0).toFixed(2), iv.status || '', age]);
    });
    if (arRows.length === 1) arRows.push(['(no outstanding invoices for ' + year + ')','','','','','','','']);

    // ── 6. Owner-paid business expenses (v884) ──
    // Charges paid from personal cards (Apple Card, etc.) — real Tree-business
    // expenses but never moved business cash. CPA needs these for Schedule M-1
    // (book-to-tax reconciliation) and to record either reimbursement claims or
    // owner capital contributions.
    var ofRows = [['Date','Description','COA Code','COA Name','Amount','Source File','Notes']];
    var ofTotal = 0;
    txnRows.filter(function(t) { return t.owner_funded; }).forEach(function(t) {
      var coa = coaByCode[t.category] || {};
      var amt = Number(t.amount) || 0;
      ofTotal += Math.abs(amt);
      ofRows.push([t.posted_date, t.description, t.category || '', coa.name || '', Math.abs(amt).toFixed(2), (t.notes || '').replace(/^apple:/, ''), t.notes || '']);
    });
    if (ofTotal === 0) ofRows.push(['(no owner-funded transactions for ' + year + ')','','','','','','']);

    // ── 7. 941 Quarterly Wages Summary ──
    var wgRows = [['Tax Year','Quarter','Form','Wages Paid','Source File']];
    var w941 = (_taxFilings || []).filter(function(f) {
      return (f.form_type || '').toUpperCase().indexOf('941') === 0 && f.tax_year == year;
    }).sort(function(a, b) {
      return (a.form_type || '').localeCompare(b.form_type || '');
    });
    w941.forEach(function(f) {
      var ex = f.extracted || {};
      var quarter = (f.form_type || '').match(/Q(\d)/);
      wgRows.push([f.tax_year, quarter ? 'Q' + quarter[1] : '', f.form_type || '', Number(f.wages_paid || ex.wages_paid || 0).toFixed(2), f.source_filename || '']);
    });
    if (w941.length === 0) wgRows.push(['(no 941 quarterly filings imported for ' + year + ')','','','','']);

    // ── README ──
    var brand = (typeof CompanyInfo !== 'undefined' && CompanyInfo.get && CompanyInfo.get('name'))
      || (typeof BM_CONFIG !== 'undefined' && BM_CONFIG.companyName)
      || 'Branch Manager';
    var readme = brand + ' — Year-End CPA Package · Tax Year ' + year + '\n'
      + 'Generated ' + todayD.toISOString().slice(0, 10) + ' by Branch Manager Books\n\n'
      + 'Contents:\n'
      + '  1-bookkeeping.csv        — Every categorized bank transaction in ' + year + '.\n'
      + '                             Columns: Date, Description, Merchant, Amount, COA Code/Name/Type,\n'
      + '                             Account, Reconciled (Y/N), Matched Kind/ID, External ID, Source.\n'
      + '                             ' + txnRows.length + ' rows.\n\n'
      + '  2-profit-and-loss.csv    — P&L summary by Chart-of-Accounts code.\n'
      + '                             Revenue: $' + revTotal.toFixed(2) + '\n'
      + '                             Expenses: $' + expTotal.toFixed(2) + '\n'
      + '                             Net Income: $' + net.toFixed(2) + '\n'
      + '                             Transfers/draws (7xxx codes) are listed separately.\n\n'
      + '  3-tax-year-recon.csv     — Book P&L vs filed federal return for each year on file.\n'
      + '                             Highlights any delta the CPA should explain.\n\n'
      + '  4-sales-tax-recon.csv    — NY-ST quarterly filings vs BM-invoiced sales/tax per quarter.\n'
      + '                             Catches under-collection or under-reporting.\n\n'
      + '  5-invoice-aging.csv      — Outstanding accounts receivable for ' + year + ' invoices, snapshot as of\n'
      + '                             ' + todayD.toISOString().slice(0, 10) + '.\n\n'
      + '  6-owner-paid-expenses.csv — Tree-business expenses paid from personal cards.\n'
      + '                              For ' + year + ': $' + ofTotal.toFixed(2) + ' across ' + (ofRows.length - 1) + ' transactions.\n'
      + '                              These are included in 1-bookkeeping.csv + 2-profit-and-loss.csv\n'
      + '                              but reported separately here so the CPA can decide treatment\n'
      + '                              (capital contribution vs. reimbursement claim). Schedule M-1.\n\n'
      + '  7-wages-941-summary.csv   — Payroll wages by 941 quarter for ' + year + '.\n\n'
      + 'Notes for the CPA:\n'
      + '  • Books generated from bank-statement PDFs (Claude Vision-extracted) + Plaid sync where active.\n'
      + '  • Sales-tax filings (NY-ST) loaded from NYS DTF filing PDFs.\n'
      + '  • Federal returns imported from 1120-S / 1040 / Schedule C / 1065 PDFs.\n'
      + '  • Any "uncategorized" (COA code 6999) transactions are surfaced in BM\'s Books page for cleanup.\n'
      + '  • External IDs are SHA-256 hashes — they uniquely identify each row across re-imports.\n\n'
      + 'Questions? Contact Doug at info@peekskilltree.com / +1 (914) 391-5233.\n';

    // ── Build the ZIP ──
    var zip = new JSZip();
    zip.file('README.txt', readme);
    zip.file('1-bookkeeping.csv', toCsv(bkRows));
    zip.file('2-profit-and-loss.csv', toCsv(plRows));
    zip.file('3-tax-year-recon.csv', toCsv(trRows));
    zip.file('4-sales-tax-recon.csv', toCsv(stRows));
    zip.file('5-invoice-aging.csv', toCsv(arRows));
    zip.file('6-owner-paid-expenses.csv', toCsv(ofRows));
    zip.file('7-wages-941-summary.csv', toCsv(wgRows));

    var blob = await zip.generateAsync({ type: 'blob' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'snt-cpa-package-' + year + '.zip';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.toast('📦 CPA package downloaded (' + (txnRows.length) + ' txns, ' + revRows.length + ' rev codes, ' + expRows.length + ' exp codes)');
  }

  async function reconcileAll() {
    var sb = _supabase(); if (!sb) { UI.toast('Supabase not ready', 'error'); return; }
    var tenantId = TENANT_ID(); if (!tenantId) { UI.toast('No tenant', 'error'); return; }

    UI.toast('🔗 Reconciling…');
    try {
      var since = new Date(Date.now() - parseInt(_filter.range, 10) * 86400000).toISOString().split('T')[0];
      var bankRes = await sb.from('bank_transactions').select('*')
        .eq('tenant_id', tenantId).gte('posted_date', since)
        .or('reconciled.is.false,reconciled.is.null');
      var bankRows = (bankRes.data || []).filter(function(r) { return !r.matched_to_id; });

      var bmPayments = (typeof DB !== 'undefined' && DB.payments && DB.payments.getAll) ? DB.payments.getAll() : [];
      var bmExpenses = (typeof DB !== 'undefined' && DB.expenses && DB.expenses.getAll) ? DB.expenses.getAll() : [];

      function daysBetween(a, b) { return Math.abs((new Date(a) - new Date(b)) / 86400000); }

      var updates = [];
      var stats = { matchedPayments: 0, matchedExpenses: 0, ambiguous: 0, unmatched: 0 };

      // v864: 3-pass matching strategy.
      // Pass 1: exact amount match (±$0.01) within ±3 days — original behavior
      // Pass 2: Stripe-fee-aware — bank deposit net = BM payment gross minus
      //   2.9% + $0.30. Match where expected fee residual < $0.50.
      // Pass 3: looser tolerance for checks/ACH/Zelle — ±$0.50, ±7 days,
      //   constrained to payment methods that aren't card.
      // Pass 4: negative amounts → expenses with ±$0.01 / ±3 days
      // Each row matched at most once; unique-match rule prevents ambiguous.
      var bankUsed = {}, payUsed = {};

      function tryMatch(b, candidates, kind) {
        if (bankUsed[b.id]) return false;
        var unique = candidates.filter(function(p) { return !payUsed[p.id]; });
        if (unique.length === 1) {
          updates.push({ id: b.id, kind: kind, matchId: unique[0].id });
          bankUsed[b.id] = true;
          payUsed[unique[0].id] = true;
          return true;
        }
        if (unique.length > 1) stats.ambiguous++;
        return false;
      }

      // Pass 1 — exact amount match
      bankRows.forEach(function(b) {
        var amt = Number(b.amount) || 0;
        if (amt === 0 || amt < 0) return;
        var targetAmt = amt;
        var matches = bmPayments.filter(function(p) {
          var pAmt = Math.abs(Number(p.amount) || 0);
          if (Math.abs(pAmt - targetAmt) > 0.01) return false;
          var pDate = p.payout_date || p.date;
          if (!pDate) return false;
          return daysBetween(b.posted_date, pDate) <= 3;
        });
        if (tryMatch(b, matches, 'payment')) stats.matchedPayments++;
      });

      // Pass 2 — Stripe-fee-aware match (card payments only)
      bankRows.forEach(function(b) {
        if (bankUsed[b.id]) return;
        var amt = Number(b.amount) || 0;
        if (amt <= 0) return;
        var matches = bmPayments.filter(function(p) {
          if (payUsed[p.id]) return false;
          if ((p.method || '').toLowerCase() !== 'card') return false;
          var pAmt = Math.abs(Number(p.amount) || 0);
          var diff = pAmt - amt;  // gross > net by the fee
          if (diff <= 0.30 || diff > 100) return false;
          var expectedFee = (pAmt * 0.029) + 0.30;
          if (Math.abs(diff - expectedFee) > 0.50) return false;
          var pDate = p.payout_date || p.date;
          if (!pDate) return false;
          return daysBetween(b.posted_date, pDate) <= 3;
        });
        if (tryMatch(b, matches, 'payment')) stats.matchedPayments++;
      });

      // Pass 3 — looser check/ACH/Zelle (±$0.50, ±7 days)
      bankRows.forEach(function(b) {
        if (bankUsed[b.id]) return;
        var amt = Number(b.amount) || 0;
        if (amt <= 0) return;
        var targetAmt = amt;
        var matches = bmPayments.filter(function(p) {
          if (payUsed[p.id]) return false;
          var method = (p.method || '').toLowerCase();
          if (['card'].indexOf(method) >= 0) return false; // cards handled in pass 2
          var pAmt = Math.abs(Number(p.amount) || 0);
          if (Math.abs(pAmt - targetAmt) > 0.50) return false;
          var pDate = p.payout_date || p.date;
          if (!pDate) return false;
          return daysBetween(b.posted_date, pDate) <= 7;
        });
        if (tryMatch(b, matches, 'payment')) stats.matchedPayments++;
      });

      // Pass 4 — expenses (negative amounts) — ±$0.01, ±3 days
      bankRows.forEach(function(b) {
        if (bankUsed[b.id]) return;
        var amt = Number(b.amount) || 0;
        if (amt >= 0) { stats.unmatched++; return; }
        var targetAmt = Math.abs(amt);
        var matches = bmExpenses.filter(function(p) {
          var pAmt = Math.abs(Number(p.amount) || 0);
          if (Math.abs(pAmt - targetAmt) > 0.01) return false;
          var pDate = p.date || p.createdAt;
          if (!pDate) return false;
          return daysBetween(b.posted_date, pDate) <= 3;
        });
        if (tryMatch(b, matches, 'expense')) stats.matchedExpenses++;
      });

      // Count unmatched (positive deposits that fell through all passes)
      bankRows.forEach(function(b) {
        if (!bankUsed[b.id] && Number(b.amount) > 0) stats.unmatched++;
      });

      // Batch update — one PATCH per row (Supabase JS doesn't support bulk-update).
      for (var i = 0; i < updates.length; i++) {
        var u = updates[i];
        await sb.from('bank_transactions').update({
          matched_to_id: u.matchId,
          matched_to_kind: u.kind,
          reconciled: true
        }).eq('id', u.id);
      }

      var msg = '✅ ' + (stats.matchedPayments + stats.matchedExpenses) + ' matched ('
        + stats.matchedPayments + ' payments, ' + stats.matchedExpenses + ' expenses)'
        + (stats.ambiguous ? ' · ' + stats.ambiguous + ' ambiguous' : '')
        + (stats.unmatched ? ' · ' + stats.unmatched + ' unmatched' : '');
      UI.toast(msg);

      // Force re-fetch + re-render
      _accounts = null; _txns = null;
      _fetchAll().then(function() { loadPage(window._currentPage || 'reports'); });
    } catch (e) {
      console.error('reconcileAll failed:', e);
      UI.toast('Reconcile failed: ' + (e.message || 'unknown'), 'error');
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // CSV import (v855)
  //
  // Plaid pricing is "contact sales" — opaque + likely overkill for 1-3
  // bank accounts. CSV import works against every bank that exports
  // a statement CSV (essentially all of them). Doug downloads a monthly
  // CSV, drops it into BM, and we parse + auto-categorize against COA.
  //
  // Flow:
  //   1. Open the CSV import modal (BooksPage.openCsvImport)
  //   2. Pick an existing bank_accounts row (or create one inline by
  //      typing name + last_4)
  //   3. Drop / pick a CSV file
  //   4. We auto-detect the column shape (Chase / BoA / Citi / generic)
  //   5. Preview rows + auto-suggested categories
  //   6. Click "Import N rows" → insert into bank_transactions with
  //      source='csv' + external_id=<hash> so re-importing a CSV that
  //      overlaps a previous one doesn't dupe.
  // ──────────────────────────────────────────────────────────────────

  var _csvState = {
    accountId: '',  // existing bank_accounts.id, or '' for new
    newName: '',
    newLast4: '',
    rows: [],       // parsed rows: { date, amount, description, suggestedCat }
    rawFilename: '',
    columnMap: null // detected mapping
  };

  // Keyword → COA code rules. Order matters — first match wins. Keywords
  // are case-insensitive substring matches against description+merchant.
  // v863: tightened with word boundaries (\b) to prevent false positives.
  // Bugs that cost a manual SQL re-categorization on May 23 2026:
  //  - `mobil` matched inside "MOBILE DEPOSIT" → 6200 Fuel (wrong; was Revenue)
  //  - `nsf` matched inside "TRANSFER" (the "NSF" substring) → 6900 Bank Fees
  //    on every Jobber/Stripe payout (wrong; was Revenue)
  // Lesson: ALL keywords ≤ 5 chars that could appear inside English words
  // need \b. Be explicit. New keywords added to the rules should always
  // include \b unless they're 6+ chars and rare-in-English.
  var CATEGORY_RULES = [
    // Revenue (positive amounts that look like deposits) — must run FIRST
    // so e.g. "stripe transfer" doesn't fall to a 7xxx transfer rule.
    [/stripe.*payout|stripe.*transfer|stripe.*payment/i, '4000'],
    [/\bzelle\b|\bvenmo\b|\bcashapp\b|mobile deposit|deposit from|cash deposit|ach credit|incoming wire|jobber.*transfer/i, '4000'],
    // Materials
    [/home depot|lowes|lowe'?s|harbor freight|tractor supply|northern tool|arborwell|treestuff|sherrill/i, '5200'],
    // Fuel — \bmobil\b prevents "MOBILE DEPOSIT" collision; \bgulf\b prevents "engulf"; \bbp\b for BP gas
    [/\bshell\b|\bexxon\b|\bmobil\b|\bsunoco\b|\bgulf\b|\bchevron\b|\bbp\b|\bcitgo\b|\bvaleros?\b|\bspeedway\b|\bwawa\b|7-?eleven|costco gas|\bfuel\b|cumberland farms/i, '6200'],
    // Equipment Rental / Repair / Purchases
    [/\bstihl\b|husqvarna|chainsaw|chipper|grinder/i, '6400'],
    // Vehicle
    [/auto.*part|\bnapa\b|advance auto|autozone|pep boys|jiffy lube|\bmidas\b|firestone|goodyear|mavis tire/i, '6220'],
    [/progressive.*auto|geico.*auto|state farm|allstate.*auto|nyaip|commercial auto/i, '6210'],
    // Insurance
    [/\bnysif\b|workers.?comp|state insurance fund/i, '6310'],
    [/general liability|\bumbrella\b|hartford|liberty mutual|nationwide/i, '6300'],
    // Dump / debris — \banthon\b for Anthony's Transfer Station
    [/\banthon|transfer station|landfill|\bdump\b|recycl|debris/i, '5400'],
    // Subcontractor
    [/subcontractor|\b1099\b|labor.*contract/i, '5100'],
    // Payroll
    [/\bgusto\b|\badp\b|paychex|quickbooks payroll|eib invoice/i, '6100'],
    // Phone / Internet — t-mobile match BEFORE generic mobil
    [/at&t|verizon|t-?mobile|\bsprint\b|spectrum|optimum|\bcomcast\b|cablevision|xfinity/i, '6510'],
    // Office / Software
    [/dropbox|google\s|microsoft|github|notion|figma|adobe|\bzoom\b|\bslack\b|supabase|cloudflare|sentry|claude|anthropic/i, '6500'],
    // Marketing
    [/facebook|meta\s|google ads|\byelp\b|nextdoor|mailchimp|constant contact/i, '6600'],
    // Permits / Legal
    [/\bpermit\b|\btcia\b|\bisa\b|arborist|department of state|secretary of state/i, '6700'],
    [/\battorney\b|\blegal\b|law office|\bcpa\b|tax preparer/i, '6710'],
    // Travel / Meals — \buber\b prevents "uber" inside other strings
    [/\buber\b|\blyft\b|\bairbnb\b|delta\s|jetblue|united.*air|american.*air|marriott|hilton|hyatt/i, '6800'],
    [/restaurant|\bdiner\b|\bpizza\b|\bcafe\b|coffee|starbucks|dunkin|chipotle|\bdeli\b|jersey mike|calabria/i, '6810'],
    // Stripe fees + Bank fees — \bnsf\b prevents matching "TRANSFER" (which contains NSF)
    [/stripe.*fee|stripe.*processing/i, '6910'],
    [/overdraft|\bnsf\b|monthly fee|service charge|atm fee|wire fee|maintenance fee/i, '6900'],
    // Owner draw / transfers
    [/owner draw|distribution to|payment to doug|payment to brown/i, '7000'],
    [/transfer to|transfer from|online transfer|book transfer/i, '7100']
  ];

  function _suggestCategory(description, merchant, amount) {
    var hay = ((description || '') + ' ' + (merchant || '')).trim();
    if (!hay) return '6999';
    for (var i = 0; i < CATEGORY_RULES.length; i++) {
      if (CATEGORY_RULES[i][0].test(hay)) return CATEGORY_RULES[i][1];
    }
    // Fallback: positive = revenue, negative = uncategorized expense
    if (Number(amount) > 0) return '4000';
    return '6999';
  }

  // Tolerant CSV row parser — handles quoted fields containing commas,
  // double-quote escaping ("" → "), and CRLF / LF line endings.
  function _parseCsv(text) {
    var rows = [];
    var cur = [], field = '', inQuotes = false;
    text = text.replace(/^﻿/, ''); // strip BOM
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else { field += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { cur.push(field); field = ''; }
        else if (ch === '\r') { /* skip */ }
        else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
        else { field += ch; }
      }
    }
    if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
    return rows.filter(function(r) { return r.length && r.some(function(c){ return c && c.trim(); }); });
  }

  // Find column indices for date / amount / description in a header row.
  // Returns { dateIdx, descIdx, amountIdx, debitIdx, creditIdx } — amountIdx
  // is set if one signed Amount column; debit/credit if two columns.
  //
  // Matches must be substring (test on the trimmed header) — Chase uses
  // "Posting Date"/"Description"/"Amount"; M&T uses "Date"/"Description"/
  // "Amount Debit"/"Amount Credit"; BoA uses "Date"/"Description"/"Amount"/
  // "Running Bal."; Citi uses "Status"/"Date"/"Description"/"Debit"/"Credit".
  // v858: relaxed regexes (no ^ anchor) so M&T's "Amount Debit" matches
  // debit and "Amount Credit" matches credit; also added priority ordering
  // when a signed Amount column AND debit/credit columns both exist — Amount
  // wins since it's already signed (Chase pattern).
  function _detectColumns(headerRow) {
    var lower = headerRow.map(function(h) { return (h || '').toLowerCase().trim(); });
    function find(re) { for (var i = 0; i < lower.length; i++) if (re.test(lower[i])) return i; return -1; }
    var debitIdx = find(/\b(debit|withdrawal|amount\s*debit|debits|withdrawals|out)\b/);
    var creditIdx = find(/\b(credit|deposit|amount\s*credit|credits|deposits|payments|in)\b/);
    var amountIdx = find(/^(amount|amt|transaction\s*amount|trans\s*amount)$/);
    // Avoid debitIdx === creditIdx (some banks have a single "Amount" col
    // matching both via the loose regex). If they collide, treat as signed
    // amount and drop debit/credit.
    if (debitIdx >= 0 && debitIdx === creditIdx) { amountIdx = debitIdx; debitIdx = -1; creditIdx = -1; }
    return {
      dateIdx:    find(/\b(post(ed|ing)?\s*date|trans(action)?\s*date|^date$|^date\b)/) ,
      descIdx:    find(/\b(description|memo|payee|details|narrative|merchant|name)\b/),
      amountIdx:  amountIdx,
      debitIdx:   debitIdx,
      creditIdx:  creditIdx
    };
  }

  function _parseAmount(s) {
    if (s == null || s === '') return null;
    // Strip $, commas, parens (which Excel uses for negative)
    var t = String(s).trim();
    var negParen = /^\(.*\)$/.test(t);
    t = t.replace(/[\$,]/g, '').replace(/^\((.*)\)$/, '$1').trim();
    if (t === '' || t === '-') return null;
    var v = parseFloat(t);
    if (isNaN(v)) return null;
    return negParen ? -Math.abs(v) : v;
  }

  function _parseDate(s) {
    if (!s) return null;
    var t = String(s).trim();
    // MM/DD/YYYY or MM/DD/YY
    var m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      var yr = parseInt(m[3], 10); if (yr < 100) yr += 2000;
      return yr + '-' + String(parseInt(m[1], 10)).padStart(2, '0') + '-' + String(parseInt(m[2], 10)).padStart(2, '0');
    }
    // YYYY-MM-DD
    m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0');
    // Fallback: Date.parse
    var d = new Date(t);
    if (!isNaN(d.getTime())) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    return null;
  }

  // SHA-256 hex of a string — used as external_id to dedupe re-imports.
  async function _hashRow(s) {
    var enc = new TextEncoder();
    var buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
    return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('').slice(0, 32);
  }

  function openCsvImport() {
    _csvState.rows = []; _csvState.columnMap = null; _csvState.rawFilename = '';
    _csvState.accountId = (_accounts && _accounts[0] && _accounts[0].id) || '';
    _csvState.newName = ''; _csvState.newLast4 = '';
    _renderCsvModal();
  }

  function _renderCsvModal() {
    if (!window.UI || !UI.openModal) { alert('UI module not ready'); return; }
    var accts = _accounts || [];
    var html = '<div style="padding:20px;max-width:720px;">'
      + '<h2 style="margin:0 0 6px;font-size:20px;font-weight:800;">📥 Import bank CSV</h2>'
      + '<div style="font-size:13px;color:var(--text-light);margin-bottom:14px;line-height:1.5;">Download a CSV from your bank\'s online portal (Chase, BoA, Citi, etc.) and drop it here. Columns auto-detected. Re-importing an overlapping CSV is safe — rows are deduped by content hash.</div>'

      // Step 1 — pick account
      + '<div style="margin-bottom:14px;">'
      +   '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px;">Step 1 · Which account</label>';
    if (accts.length) {
      html += '<select id="csv-account" onchange="BooksPage._csvSetAccount(this.value)" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:#fff;">';
      accts.forEach(function(a) {
        html += '<option value="' + a.id + '"' + (_csvState.accountId === a.id ? ' selected' : '') + '>' + _esc(a.name) + (a.last_4 ? ' ··' + _esc(a.last_4) : '') + '</option>';
      });
      html += '<option value="">+ New account…</option>';
      html += '</select>';
    } else {
      _csvState.accountId = '';
    }
    if (_csvState.accountId === '') {
      html += '<div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-top:8px;">'
        + '<input type="text" placeholder="Account name (e.g. Chase Business Checking)" value="' + _esc(_csvState.newName) + '" oninput="BooksPage._csvSetField(\'newName\', this.value)" style="padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;">'
        + '<input type="text" placeholder="Last 4" maxlength="4" value="' + _esc(_csvState.newLast4) + '" oninput="BooksPage._csvSetField(\'newLast4\', this.value)" style="padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;">'
        + '</div>';
    }
    html += '</div>';

    // Step 2 — file
    html += '<div style="margin-bottom:14px;">'
      + '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px;">Step 2 · Drop your CSV or PDF statement</label>'
      + '<label for="csv-file" style="display:block;border:2px dashed var(--border);border-radius:10px;padding:24px;text-align:center;cursor:pointer;background:var(--bg);">'
      +   '<div style="font-size:30px;margin-bottom:4px;">📄</div>'
      +   '<div style="font-size:13px;font-weight:600;color:var(--text);">' + (_csvState.rawFilename || 'Click to pick a CSV or PDF file') + '</div>'
      +   '<div style="font-size:11px;color:var(--text-light);margin-top:4px;">CSV: M&amp;T / Chase / BoA / Citi / Wells Fargo · PDF: any monthly statement (Claude Vision extracts)</div>'
      + '</label>'
      + '<input id="csv-file" type="file" accept=".csv,text/csv,text/plain,.pdf,application/pdf" style="display:none;" onchange="BooksPage._csvOnFile(this.files && this.files[0])">'
      + '</div>';

    // Step 3 — preview
    if (_csvState.rows.length) {
      html += '<div style="margin-bottom:14px;">'
        + '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px;">Step 3 · Preview ('+ _csvState.rows.length +' rows)</label>'
        + '<div style="max-height:240px;overflow:auto;border:1px solid var(--border);border-radius:8px;">'
        + '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
        + '<thead style="background:var(--bg);position:sticky;top:0;">'
        +   '<tr><th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border);">Date</th>'
        +       '<th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border);">Description</th>'
        +       '<th style="padding:6px 8px;text-align:right;border-bottom:1px solid var(--border);">Amount</th>'
        +       '<th style="padding:6px 8px;text-align:left;border-bottom:1px solid var(--border);">Category</th></tr>'
        + '</thead><tbody>';
      _csvState.rows.slice(0, 50).forEach(function(r) {
        var c = (_chart || []).find(function(x) { return x.code === r.suggestedCat; });
        html += '<tr>'
          + '<td style="padding:5px 8px;border-bottom:1px solid var(--bg);color:var(--text-light);">' + _esc(r.date) + '</td>'
          + '<td style="padding:5px 8px;border-bottom:1px solid var(--bg);">' + _esc((r.description||'').slice(0, 60)) + '</td>'
          + '<td style="padding:5px 8px;border-bottom:1px solid var(--bg);text-align:right;font-weight:700;color:' + (r.amount > 0 ? 'var(--green-dark)' : 'var(--text)') + ';">' + _money(r.amount) + '</td>'
          + '<td style="padding:5px 8px;border-bottom:1px solid var(--bg);color:var(--text-light);">' + _esc((c ? c.code + ' ' + c.name : r.suggestedCat)) + '</td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';
      if (_csvState.rows.length > 50) {
        html += '<div style="font-size:11px;color:var(--text-light);margin-top:4px;">… showing first 50. Full ' + _csvState.rows.length + ' will be imported.</div>';
      }
      html += '</div>';
    }

    // Actions
    var canImport = _csvState.rows.length && (_csvState.accountId || (_csvState.newName.trim() && _csvState.newLast4.trim()));
    html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">'
      + '<button onclick="UI.closeModal()" class="btn btn-outline">Cancel</button>'
      + '<button onclick="BooksPage._csvImport()" ' + (canImport ? '' : 'disabled') + ' style="background:' + (canImport ? 'var(--green-dark)' : 'var(--text-light)') + ';color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:14px;cursor:' + (canImport ? 'pointer' : 'not-allowed') + ';">Import ' + (_csvState.rows.length || '') + ' rows</button>'
      + '</div>';
    html += '</div>';
    UI.openModal(html, { wide: true });
  }

  function _csvSetAccount(v) { _csvState.accountId = v; _renderCsvModal(); }
  function _csvSetField(k, v) { _csvState[k] = v; }

  function _csvOnFile(file) {
    if (!file) return;
    _csvState.rawFilename = file.name;

    // v860a: PDF support via Claude Vision (ai-chat edge fn).
    // Banks only offer CSV for last ~13 months; older history is PDF-only.
    // We base64 the PDF, ship it to ai-chat as a `document` content block,
    // Claude returns a JSON transactions[] array, we convert to the same
    // shape as CSV rows and continue the existing dedupe/upsert flow.
    var isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    if (isPdf) { _extractPdfStatement(file); return; }

    var rd = new FileReader();
    rd.onload = function(ev) {
      try {
        var text = ev.target.result || '';
        var parsed = _parseCsv(text);
        if (parsed.length < 2) { UI.toast('CSV has no rows', 'error'); return; }
        var hdr = parsed[0];
        var cols = _detectColumns(hdr);
        if (cols.dateIdx < 0 || cols.descIdx < 0 || (cols.amountIdx < 0 && cols.debitIdx < 0 && cols.creditIdx < 0)) {
          UI.toast('Couldn\'t detect Date / Description / Amount columns. Sniffed: ' + hdr.join(' | '), 'error');
          return;
        }
        _csvState.columnMap = cols;
        var out = [];
        for (var i = 1; i < parsed.length; i++) {
          var row = parsed[i];
          var date = _parseDate(row[cols.dateIdx]);
          var desc = (row[cols.descIdx] || '').trim();
          var amt = null;
          if (cols.amountIdx >= 0) {
            amt = _parseAmount(row[cols.amountIdx]);
          } else {
            var debit = _parseAmount(row[cols.debitIdx]);
            var credit = _parseAmount(row[cols.creditIdx]);
            if (credit) amt = Math.abs(credit);
            else if (debit) amt = -Math.abs(debit);
          }
          if (date == null || amt == null) continue;
          out.push({
            date: date, amount: amt, description: desc,
            suggestedCat: _suggestCategory(desc, '', amt),
            raw: row.join('|')
          });
        }
        if (!out.length) { UI.toast('Parsed 0 valid rows. Check the file.', 'error'); return; }
        _csvState.rows = out;
        _renderCsvModal();
      } catch (e) {
        console.error('csv parse failed:', e);
        UI.toast('Parse error: ' + (e.message || 'unknown'), 'error');
      }
    };
    rd.readAsText(file);
  }

  // Extract transactions from a PDF bank statement via Claude Vision
  // (ai-chat edge fn → Anthropic API). PDF is base64-encoded and sent as
  // a `document` content block; Claude reads the embedded tables + OCR's
  // any scanned pages and returns structured JSON. Works on any bank
  // statement format — M&T, Chase, BoA, Wells Fargo, paper scans etc.
  async function _extractPdfStatement(file) {
    if (file.size > 30 * 1024 * 1024) { UI.toast('PDF too large (max 30 MB).', 'error'); return; }
    UI.toast('📄 Extracting transactions from PDF (15-40 sec)…');

    var dataUrl = await new Promise(function(resolve, reject) {
      var rd = new FileReader();
      rd.onload = function(e) { resolve(e.target.result); };
      rd.onerror = reject;
      rd.readAsDataURL(file);
    });
    var b64 = dataUrl.split(',')[1];

    var prompt = 'This is a bank statement PDF. Extract EVERY transaction line in the activity / transactions section into a strict JSON array (no prose, no markdown fences). Each row must have these keys:\n'
      + '  - "date" (YYYY-MM-DD; statement year is in the header — if a row only shows MM/DD, use the statement year)\n'
      + '  - "description" (the transaction description / payee / memo, trimmed; combine multi-line continuations)\n'
      + '  - "amount" (signed number; POSITIVE for deposits/credits/incoming, NEGATIVE for withdrawals/debits/checks/fees/outgoing)\n'
      + '\n'
      + 'Skip header/footer rows, balance summaries, totals, page numbers, and any non-transaction line. Skip lines like "Beginning Balance", "Ending Balance", "Total Deposits", "Total Withdrawals". Include checks, ACH transfers, debit-card purchases, fees, interest, deposits, and credits. Preserve original description spelling.\n'
      + '\nReturn ONLY the JSON array. Example shape:\n'
      + '[{"date":"2024-08-15","description":"DEPOSIT FROM STRIPE PAYOUT","amount":1450.00},{"date":"2024-08-16","description":"HOME DEPOT #4023","amount":-89.45}]';

    var sbUrl = (typeof SupabaseDB !== 'undefined' && SupabaseDB.DEFAULT_URL) ? SupabaseDB.DEFAULT_URL : 'https://ltpivkqahvplapyagljt.supabase.co';
    var sbKey = (typeof SupabaseDB !== 'undefined' && SupabaseDB.DEFAULT_KEY) ? SupabaseDB.DEFAULT_KEY : '';
    try {
      var r = await fetch(sbUrl + '/functions/v1/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sbKey, 'apikey': sbKey },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          system: 'You are an expert at reading bank statements. Always return ONLY a single JSON array, never prose, never markdown code fences. If a field is unclear, omit the row entirely rather than guessing.',
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
              { type: 'text', text: prompt }
            ]
          }]
        })
      });
      var data = await r.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      var raw = (data.content && data.content[0] && data.content[0].text) || '';
      raw = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      var arr; try { arr = JSON.parse(raw); } catch(e) { throw new Error('AI returned non-JSON: ' + raw.slice(0, 160)); }
      if (!Array.isArray(arr)) throw new Error('AI returned non-array: ' + raw.slice(0, 160));

      var out = arr.map(function(t) {
        var date = _parseDate(t.date) || (t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : null);
        var amt = (typeof t.amount === 'number') ? t.amount : _parseAmount(String(t.amount || ''));
        var desc = (t.description || '').toString().trim();
        if (date == null || amt == null || !desc) return null;
        return {
          date: date, amount: amt, description: desc,
          suggestedCat: _suggestCategory(desc, '', amt),
          raw: 'pdf:' + file.name
        };
      }).filter(Boolean);

      if (!out.length) { UI.toast('Vision extracted 0 valid transactions. PDF may be corrupted or non-statement.', 'error'); return; }
      _csvState.rows = out;
      _renderCsvModal();
      UI.toast('✅ ' + out.length + ' transactions extracted — review + Import');
    } catch (e) {
      console.error('pdf extract failed:', e);
      UI.toast('Vision extract failed: ' + (e.message || 'unknown'), 'error');
    }
  }

  async function _csvImport() {
    var sb = _supabase(); if (!sb) { UI.toast('Supabase not ready', 'error'); return; }
    var tenantId = TENANT_ID(); if (!tenantId) { UI.toast('No tenant context', 'error'); return; }

    // Resolve or create the account
    var acctId = _csvState.accountId;
    if (!acctId) {
      var newAcct = {
        tenant_id: tenantId,
        name: _csvState.newName.trim(),
        last_4: _csvState.newLast4.trim(),
        account_type: 'checking',
        active: true
      };
      var ins = await sb.from('bank_accounts').insert(newAcct).select('id').single();
      if (ins.error) { UI.toast('Account create failed: ' + ins.error.message, 'error'); return; }
      acctId = ins.data.id;
    }

    UI.toast('Hashing + uploading ' + _csvState.rows.length + ' rows…');

    // Hash each row → external_id for dedupe. Stable across re-imports.
    var bulk = [];
    for (var i = 0; i < _csvState.rows.length; i++) {
      var r = _csvState.rows[i];
      var eid = await _hashRow(acctId + '|' + r.date + '|' + r.amount + '|' + (r.description || ''));
      bulk.push({
        tenant_id: tenantId,
        account_id: acctId,
        posted_date: r.date,
        amount: r.amount,
        description: r.description,
        category: r.suggestedCat || null,
        source: 'csv',
        external_id: eid,
        pending: false,
        reconciled: false
      });
    }

    // upsert on external_id so re-imports don't dupe
    var up = await sb.from('bank_transactions').upsert(bulk, { onConflict: 'external_id', ignoreDuplicates: false });
    if (up.error) { UI.toast('Import failed: ' + up.error.message, 'error'); return; }
    UI.toast(_csvState.rows.length + ' transactions imported ✅');
    UI.closeModal();
    _accounts = null; _txns = null;
    _fetchAll().then(function() { loadPage(window._currentPage || 'reports'); });
  }

  function setCashflow(mode) {
    _filter.cashflow = mode;
    if (window._currentPage) loadPage(window._currentPage);
  }

  // v880: kick off an invoice follow-up email from the Books AR card.
  // Delegates to Workflow.sendInvoice which owns the email + payment-link
  // logic. Falls back to opening the invoice page if Workflow isn't loaded.
  function sendInvoiceFollowup(invoiceId) {
    if (!invoiceId) return;
    if (typeof Workflow !== 'undefined' && typeof Workflow.sendInvoice === 'function') {
      Workflow.sendInvoice(invoiceId);
    } else if (typeof InvoicesPage !== 'undefined' && InvoicesPage.showDetail) {
      loadPage('invoices');
      setTimeout(function() { InvoicesPage.showDetail(invoiceId); }, 100);
    } else {
      loadPage('invoices');
    }
  }

  return {
    render: render,
    connectBank: connectBank,
    syncNow: syncNow,
    openCsvImport: openCsvImport,
    reconcileAll: reconcileAll,
    setCashflow: setCashflow,
    setForecast: setForecast,
    setTab: setTab,
    sendInvoiceFollowup: sendInvoiceFollowup,
    _setRange: _setRange,
    _setAccount: _setAccount,
    _setSearch: _setSearch,
    _setCategory: _setCategory,
    _bulkRecategorize: _bulkRecategorize,
    exportCpaCsv: exportCpaCsv,
    exportCpaPackage: exportCpaPackage,
    _csvSetAccount: _csvSetAccount,
    _csvSetField: _csvSetField,
    _csvOnFile: _csvOnFile,
    _csvImport: _csvImport
  };
})();
