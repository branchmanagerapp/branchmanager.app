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
  var _filter = { account: 'all', category: 'all', search: '', range: '90' };

  function _supabase() {
    return (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
  }

  function _fetchAll() {
    var sb = _supabase();
    if (!sb) return Promise.resolve();
    var rangeDays = parseInt(_filter.range, 10) || 90;
    var since = new Date(Date.now() - rangeDays * 86400000).toISOString().split('T')[0];

    return Promise.all([
      sb.from('bank_accounts').select('*').eq('tenant_id', TENANT_ID()).eq('active', true).order('created_at'),
      sb.from('bank_transactions').select('*').eq('tenant_id', TENANT_ID()).gte('posted_date', since).order('posted_date', { ascending: false }).limit(500),
      sb.from('chart_of_accounts').select('*').eq('tenant_id', TENANT_ID()).eq('active', true).order('sort_order')
    ]).then(function(results) {
      _accounts = (results[0] && results[0].data) || [];
      _txns = (results[1] && results[1].data) || [];
      _chart = (results[2] && results[2].data) || [];
    });
  }

  function render() {
    if (_accounts === null) {
      _fetchAll().then(function() {
        if (window._currentPage === 'reports' && (window._reportsTab || 'insights') === 'books') {
          loadPage('reports');
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

  function _renderShell() {
    var accounts = _accounts || [];
    var txns = _txns || [];
    var chart = _chart || [];

    var html = '<div style="max-width:1200px;">';

    // Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px;">'
      + '<div>'
      +   '<h2 style="margin:0;font-size:22px;font-weight:800;">Books</h2>'
      +   '<div style="font-size:13px;color:var(--text-light);margin-top:2px;">Bank transactions, auto-categorized against your chart of accounts.</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      +   (accounts.length > 0 ? '<button onclick="BooksPage.syncNow()" class="btn btn-outline" style="font-size:13px;">Sync now</button>' : '')
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
        +   '<button onclick="BooksPage.connectBank()" class="btn btn-outline" style="font-size:14px;padding:12px 22px;">🔗 Connect via Plaid (auto, $)</button>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);max-width:480px;margin:0 auto;line-height:1.55;">CSV: download your monthly statement, drop it in BM. Free, works with every bank. Plaid: auto-syncs every 4h, requires Plaid signup + pricing call.</div>'
        + '</div>';
      html += _renderSetupHint();
      html += '</div>';
      return html;
    }

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

    // Filter row
    var rangeOpts = [['30','30 days'],['90','90 days'],['180','6 months'],['365','12 months'],['730','24 months']];
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

      filtered.slice(0, 200).forEach(function(t) {
        var amt = Number(t.amount) || 0;
        var amtColor = amt > 0 ? 'var(--green-dark)' : 'var(--text)';
        var c = chartByCode[t.category];
        var pending = t.pending ? '<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:1px 6px;border-radius:6px;margin-left:6px;">PENDING</span>' : '';
        html += '<div style="display:grid;grid-template-columns:90px 1fr 200px 110px;gap:12px;padding:11px 16px;border-top:1px solid var(--border);font-size:13px;align-items:center;">'
          +   '<div style="color:var(--text-light);font-size:12px;">' + _date(t.posted_date) + '</div>'
          +   '<div><strong>' + _esc(t.description) + '</strong>' + pending
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

    html += '</div>';
    return html;
  }

  function _renderSetupHint() {
    return '<div style="margin-top:16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:18px;font-size:13px;color:#7c2d12;line-height:1.6;">'
      + '<div style="font-weight:700;color:#9a3412;margin-bottom:6px;">First-time setup (one-time):</div>'
      + '<ol style="padding-left:22px;">'
      +   '<li>Sign up at <a href="https://dashboard.plaid.com/signup" target="_blank" rel="noopener" style="color:var(--green-dark);text-decoration:underline;">dashboard.plaid.com</a> (free Sandbox + Development tiers).</li>'
      +   '<li>Grab your <strong>Client ID</strong> + <strong>Sandbox Secret</strong> from Team Settings → Keys.</li>'
      +   '<li>Run in terminal: <code style="background:#fff;padding:2px 6px;border-radius:4px;font-family:monospace;">SUPABASE_ACCESS_TOKEN=… supabase secrets set PLAID_CLIENT_ID=xxx PLAID_SECRET=yyy PLAID_ENV=sandbox --project-ref ltpivkqahvplapyagljt</code></li>'
      +   '<li>Set webhook URL in Plaid dashboard → Team Settings → API: <code style="background:#fff;padding:2px 6px;border-radius:4px;font-family:monospace;">https://ltpivkqahvplapyagljt.supabase.co/functions/v1/plaid-webhook</code></li>'
      +   '<li>Click "Connect bank" above. Plaid Link will open. Sandbox lets you log in as user_good / pass_good with any bank.</li>'
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
            _fetchAll().then(function() { loadPage('reports'); });
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
      _txns = null; _fetchAll().then(function() { loadPage('reports'); });
    });
  }

  function _setRange(v) { _filter.range = v; _txns = null; _fetchAll().then(function() { loadPage('reports'); }); }
  function _setAccount(v) { _filter.account = v; loadPage('reports'); }
  function _setSearch(v) { _filter.search = v; loadPage('reports'); }
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
  var CATEGORY_RULES = [
    // Revenue (positive amounts that look like deposits)
    [/stripe.*payout|stripe.*transfer/i,          '4000'],  // Service Revenue (Stripe payout)
    [/zelle|venmo|cashapp|deposit|ach credit|incoming/i, '4000'],
    // Materials
    [/home depot|lowes|lowe'?s|harbor freight|tractor supply|northern tool|arborwell|treestuff|sherrill/i, '5200'],
    // Fuel
    [/shell|exxon|mobil|sunoco|gulf|chevron|bp\s|citgo|valero|speedway|wawa|7-?eleven|costco gas|fuel/i, '6200'],
    // Equipment Rental / Repair / Purchases
    [/stihl|husqvarna|equipment|saw|chainsaw|chipper|grinder/i, '6400'],
    // Vehicle
    [/auto.*part|napa|advance auto|autozone|pep boys|jiffy lube|midas|firestone|goodyear|mavis tire/i, '6220'],
    [/progressive.*auto|geico.*auto|state farm|allstate.*auto|nyaip|commercial auto/i, '6210'],
    // Insurance
    [/nysif|workers.?comp|state insurance fund/i, '6310'],
    [/general liability|umbrella|hartford|liberty mutual|nationwide/i, '6300'],
    // Dump / debris
    [/anthon|transfer station|landfill|dump|recycl|debris/i, '5400'],
    // Subcontractor
    [/subcontractor|1099|labor.*contract/i, '5100'],
    // Payroll
    [/gusto|adp|paychex|quickbooks payroll/i, '6100'],
    // Phone / Internet
    [/at&t|verizon|t-?mobile|sprint|spectrum|optimum|comcast|cablevision|xfinity/i, '6510'],
    // Office / Software
    [/dropbox|google|microsoft|github|notion|figma|adobe|zoom|slack|supabase|cloudflare|sentry|claude|anthropic/i, '6500'],
    // Marketing
    [/facebook|meta\s|google ads|yelp|nextdoor|mailchimp|constant contact/i, '6600'],
    // Permits / Legal
    [/permit|tcia|isa|arborist|department of state|secretary of state/i, '6700'],
    [/attorney|legal|law office|cpa\s|tax preparer/i, '6710'],
    // Travel / Meals
    [/uber|lyft|airbnb|delta|jetblue|united.*air|american.*air|marriott|hilton|hyatt/i, '6800'],
    [/restaurant|diner|pizza|cafe|coffee|starbucks|dunkin|chipotle/i, '6810'],
    // Stripe fees + Bank fees
    [/stripe.*fee|stripe.*processing/i, '6910'],
    [/overdraft|nsf|monthly fee|service charge|atm fee|wire fee|maintenance fee/i, '6900'],
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
  function _detectColumns(headerRow) {
    var lower = headerRow.map(function(h) { return (h || '').toLowerCase().trim(); });
    function find(re) { for (var i = 0; i < lower.length; i++) if (re.test(lower[i])) return i; return -1; }
    return {
      dateIdx:    find(/^(post|posting|trans|transaction|date|posted date|trans\s*date)/),
      descIdx:    find(/^(desc|description|memo|payee|details|name|narrative)/),
      amountIdx:  find(/^(amount|amt)$/),
      debitIdx:   find(/^(debit|withdrawal|out|withdrawals)/),
      creditIdx:  find(/^(credit|deposit|in|deposits|payments)/)
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
      + '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:6px;">Step 2 · Drop your CSV</label>'
      + '<label for="csv-file" style="display:block;border:2px dashed var(--border);border-radius:10px;padding:24px;text-align:center;cursor:pointer;background:var(--bg);">'
      +   '<div style="font-size:30px;margin-bottom:4px;">📄</div>'
      +   '<div style="font-size:13px;font-weight:600;color:var(--text);">' + (_csvState.rawFilename || 'Click to pick a CSV file') + '</div>'
      +   '<div style="font-size:11px;color:var(--text-light);margin-top:4px;">Chase / BoA / Citi / Wells Fargo / generic supported</div>'
      + '</label>'
      + '<input id="csv-file" type="file" accept=".csv,text/csv,text/plain" style="display:none;" onchange="BooksPage._csvOnFile(this.files && this.files[0])">'
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
    _fetchAll().then(function() { loadPage('reports'); });
  }

  return {
    render: render,
    connectBank: connectBank,
    syncNow: syncNow,
    openCsvImport: openCsvImport,
    _setRange: _setRange,
    _setAccount: _setAccount,
    _setSearch: _setSearch,
    _setCategory: _setCategory,
    _csvSetAccount: _csvSetAccount,
    _csvSetField: _csvSetField,
    _csvOnFile: _csvOnFile,
    _csvImport: _csvImport
  };
})();
