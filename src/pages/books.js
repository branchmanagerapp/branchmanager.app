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
  var TENANT_ID = window.resolveTenantId ? window.resolveTenantId() : '93af4348-8bba-4045-ac3e-5e71ec1cc8c5';

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
      sb.from('bank_accounts').select('*').eq('tenant_id', TENANT_ID).eq('active', true).order('created_at'),
      sb.from('bank_transactions').select('*').eq('tenant_id', TENANT_ID).gte('posted_date', since).order('posted_date', { ascending: false }).limit(500),
      sb.from('chart_of_accounts').select('*').eq('tenant_id', TENANT_ID).eq('active', true).order('sort_order')
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
      +   '<button onclick="BooksPage.connectBank()" class="btn btn-primary" style="font-size:13px;">+ Connect bank</button>'
      + '</div>'
      + '</div>';

    // Empty state
    if (accounts.length === 0) {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:48px;text-align:center;">'
        + '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px;">No bank accounts connected yet</div>'
        + '<div style="font-size:13px;color:var(--text-light);max-width:480px;margin:0 auto 18px;line-height:1.55;">Connect a bank to auto-import transactions, categorize them, and generate P&amp;L reports without manual entry. Plaid handles the OAuth — your bank credentials never touch Branch Manager.</div>'
        + '<button onclick="BooksPage.connectBank()" class="btn btn-primary">Connect first bank</button>'
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
      body: JSON.stringify({ tenant_id: TENANT_ID })
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.error) { UI.toast('Plaid: ' + data.error, 'error'); return; }
      var handler = Plaid.create({
        token: data.link_token,
        onSuccess: function(public_token, metadata) {
          UI.toast('Linked! Importing accounts…');
          fetch('https://ltpivkqahvplapyagljt.supabase.co/functions/v1/plaid-exchange-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenant_id: TENANT_ID, public_token: public_token, metadata: metadata })
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
      body: JSON.stringify({ tenant_id: TENANT_ID })
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

  return {
    render: render,
    connectBank: connectBank,
    syncNow: syncNow,
    _setRange: _setRange,
    _setAccount: _setAccount,
    _setSearch: _setSearch,
    _setCategory: _setCategory
  };
})();
