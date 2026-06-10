/**
 * Branch Manager — Break-Even / Day Budget (business)
 * Day-rate P&L + minimum-weekly-to-operate, modeled on Doug's
 * "Tree Day Budget Profit Loss" sheet. Drivers + overhead + labor are
 * editable and stored in localStorage ('bm-breakeven', cloud-synced via
 * CloudKeys). Revenue actuals pull LIVE from invoices.
 *
 * This is a BUSINESS tool — distinct from BudgetPage (personal Ramsey budget).
 */
var BreakEvenPage = {

  DEFAULTS: {
    workDays: 250,        // original sheet used 300; 250 ≈ realistic
    workWeeks: 44,
    dayRate: 5000,
    directCostPerDay: 1500,  // crew + fuel + materials/dump for one productive crew-day
    ownerPay: 60000,         // what Doug wants to take out per year
    overhead: [
      { name: 'Workers Comp (NYSIF)', amt: 1000, flag: false, note: 'REAL WC ~$1k/yr (bank-verified). The old $53,775 was total Paychex = crew WAGES, double-counted in Crew Labor below.' },
      { name: 'Payroll taxes + Paychex fees (employer)', amt: 12000, flag: false, note: 'employer payroll taxes (~$15k) + processing/401k fees; crew WAGES are in Crew Labor, not here' },
      { name: 'Insurance — Liability / Auto (Erie)', amt: 16600, flag: false, note: '' },
      { name: 'Equip financing — Bucket truck lease (Blue Bridge 155642)', amt: 22951, flag: false, note: '$1,912.56/mo — ONE lease (verified; bank labels it CORP/CONS inconsistently)' },
      { name: 'Equip financing — KM100 telehandler', amt: 13200, flag: false, note: 'REQUIRED — replaces the dead GiANT loader. $1,100/mo x 5yr (Stearns). No competing loader loan in the books (GiANT owned, not financed).' },
      { name: 'Vehicle financing — RAM 2500 (Chase Auto)', amt: 12059, flag: false, note: '$1,004.91/mo to JPMorgan Chase — bank-verified, was missing from the model' },
      { name: 'Repairs & Maintenance', amt: 8000, flag: false, note: 'bank-verified ~$4-7k/yr actual (was $11k)' },
      { name: 'Fuel', amt: 10000, flag: false, note: 'bank-verified — swings $7k (2025) to $12.8k (2024)' },
      { name: 'Chainsaw / Ropes / Climbing / Gear', amt: 5000, flag: false, note: 'bank-verified ~$3-3.6k/yr actual (was $10k)' },
      { name: 'Office / Accounting / Legal / Software', amt: 6000, flag: false, note: '' },
      { name: 'Taxes & Licenses', amt: 10400, flag: false, note: '' }
    ],
    labor: [
      { name: 'Catherine (Conway)', rate: 25, hrsWk: 34 },
      { name: 'Ryan Knapp', rate: 30, hrsWk: 17 }
    ]
  },

  _load: function() {
    try {
      var s = JSON.parse(localStorage.getItem('bm-breakeven') || 'null');
      if (s && s.overhead) return s;
    } catch (e) {}
    var d = JSON.parse(JSON.stringify(BreakEvenPage.DEFAULTS));
    BreakEvenPage._save(d);
    return d;
  },
  _save: function(cfg) {
    localStorage.setItem('bm-breakeven', JSON.stringify(cfg));
    if (typeof CloudSync !== 'undefined' && CloudSync.queue) { try { CloudSync.queue('bm-breakeven'); } catch (e) {} }
  },

  _money: function(n) { return '$' + Math.round(n || 0).toLocaleString(); },

  // Actual revenue per JOB (reliable). NOT per-day — BM has no days-per-job, and
  // jobs span multiple days, so a true day rate can't be derived from this data.
  _actualDayStats: function() {
    try {
      var jobs = (typeof DB !== 'undefined' && DB.jobs) ? DB.jobs.getAll() : [];
      var SNOW = /snow|plow|plough|salt|sand|de-?ic/i;   // exclude snowplow — it's many tiny jobs/day, distorts tree avg
      var vals = [];
      jobs.forEach(function(j) {
        var done = (j.status === 'completed' || j.status === 'invoiced' || j.status === 'paid' || j.completedDate || j.completedAt);
        var v = parseFloat(j.total) || 0;
        var txt = String((j.description || '') + ' ' + (j.notes || ''));
        if (done && v > 0 && !SNOW.test(txt)) vals.push(v);
      });
      if (!vals.length) return null;
      vals.sort(function(a, b) { return a - b; });
      var tot = vals.reduce(function(a, b) { return a + b; }, 0);
      return { jobs: vals.length, avg: tot / vals.length, median: vals[Math.floor(vals.length / 2)] };
    } catch (e) { return null; }
  },

  // Live revenue from invoices
  _revenueLast: function(months) {
    try {
      var invs = (typeof DB !== 'undefined' && DB.invoices) ? DB.invoices.getAll() : [];
      var since = new Date(); since.setMonth(since.getMonth() - months);
      return invs.filter(function(i) {
        var paid = (i.status === 'paid');
        var d = new Date(i.paidAt || i.createdAt || i.created_at || 0);
        return paid && d >= since;
      }).reduce(function(s, i) { return s + (parseFloat(i.total) || 0); }, 0);
    } catch (e) { return 0; }
  },

  // ── Line of Business: Tree / Snow / Smart Lawn (DBA divisions of one entity) ──
  // Keyword classifier — snow plowing and robotic-mower (Smart Lawn) work split
  // out from core tree, so each line gets its own revenue read while rolling up
  // to the combined Second Nature Tree books.
  LINES: { tree: 'Tree', snow: 'Snow', smartlawn: 'Smart Lawn', firewood: 'Firewood' },
  _classifyLine: function(text) {
    var t = (text || '').toLowerCase();
    if (/\bsnow\b|plow|plough|\bsalt\b|de-?ic/.test(t)) return 'snow';
    if (/navimow|yarbo|segway|robotic ?mow|robot ?mow|smart ?lawn/.test(t)) return 'smartlawn';
    if (/fire ?wood|cord ?wood|seasoned wood|wood delivery|split wood/.test(t)) return 'firewood';
    return 'tree';
  },
  // Resolve a line for an invoice: explicit invoice tag → linked job's tag → keywords.
  _lineForInvoice: function(i) {
    if (i.line_of_business) return i.line_of_business;
    try {
      if (i.jobId && typeof DB !== 'undefined' && DB.jobs && DB.jobs.getById) {
        var j = DB.jobs.getById(i.jobId);
        if (j && j.line_of_business) return j.line_of_business;
      }
    } catch (e) {}
    var li = Array.isArray(i.lineItems) ? i.lineItems.map(function(x) { return (x.description || x.name || ''); }).join(' ') : '';
    return BreakEvenPage._classifyLine((i.description || '') + ' ' + (i.notes || '') + ' ' + (i.clientName || '') + ' ' + li);
  },
  _revenueByLine: function(months) {
    var out = { tree: 0, snow: 0, smartlawn: 0, firewood: 0 };
    try {
      var invs = (typeof DB !== 'undefined' && DB.invoices) ? DB.invoices.getAll() : [];
      var since = new Date(); since.setMonth(since.getMonth() - months);
      invs.forEach(function(i) {
        if (i.status !== 'paid') return;
        var d = new Date(i.paidAt || i.createdAt || i.created_at || 0);
        if (d < since) return;
        var line = BreakEvenPage._lineForInvoice(i);
        if (out[line] == null) line = 'tree';
        out[line] += (parseFloat(i.total) || 0);
      });
    } catch (e) {}
    return out;
  },

  // Direct line costs: classify ACTIVE-account expenses (tree entity only) into
  // snow / smartlawn direct spend; everything else is shared overhead (kept
  // company-wide, NOT dumped on tree). Answers "does each side-line cover its
  // own direct costs" honestly, before shared overhead.
  _loadExpenses: function() {
    if (window._bmCostLoaded) return;
    var sb = (typeof SupabaseDB !== 'undefined') ? SupabaseDB.client : null;
    if (!sb) return;
    window._bmCostLoaded = true;
    sb.from('bank_accounts').select('id').eq('active', true).then(function(ar) {
      var ids = ((ar && ar.data) || []).map(function(a) { return a.id; });
      if (!ids.length) { window._bmCostByLine = { snow: 0, smartlawn: 0, firewood: 0, shared: 0 }; return; }
      var since = new Date(); since.setFullYear(since.getFullYear() - 1);
      sb.from('bank_transactions').select('amount,description,merchant_name,account_id')
        .lt('amount', 0).in('account_id', ids).gte('posted_date', since.toISOString().slice(0, 10)).limit(5000)
        .then(function(res) {
          var rows = (res && res.data) || [];
          var out = { snow: 0, smartlawn: 0, firewood: 0, shared: 0 };
          rows.forEach(function(t) {
            var line = BreakEvenPage._classifyLine((t.description || '') + ' ' + (t.merchant_name || ''));
            var amt = Math.abs(parseFloat(t.amount) || 0);
            if (line === 'snow') out.snow += amt;
            else if (line === 'smartlawn') out.smartlawn += amt;
            else if (line === 'firewood') out.firewood += amt;
            else out.shared += amt; // tree-or-shared overhead, company-wide
          });
          window._bmCostByLine = out;
          if (typeof loadPage === 'function') loadPage('breakeven');
        }).catch(function() {});
    }).catch(function() {});
  },

  // Live cash from bank_accounts (populated by Plaid sync / manual entry).
  // Loaded once per session into window._bmCash, then re-renders.
  _loadCash: function() {
    if (window._bmCashLoaded) return;
    var sb = (typeof SupabaseDB !== 'undefined') ? SupabaseDB.client : null;
    if (!sb) return;
    window._bmCashLoaded = true;
    sb.from('bank_accounts').select('name,account_type,balance_current,balance_as_of,active').eq('active', true).then(function(res) {
      var rows = (res && res.data) || [];
      var cash = 0, debt = 0, asof = '';
      rows.forEach(function(a) {
        var b = parseFloat(a.balance_current); if (isNaN(b)) return;
        var t = (a.account_type || '').toLowerCase();
        if (t.indexOf('check') >= 0 || t.indexOf('saving') >= 0 || t.indexOf('depos') >= 0) cash += b;
        else if (t.indexOf('credit') >= 0 || t.indexOf('loan') >= 0 || t.indexOf('line') >= 0) debt += b;
        if (a.balance_as_of && a.balance_as_of > asof) asof = a.balance_as_of;
      });
      window._bmCash = { cash: cash, debt: debt, net: cash - debt, asof: asof, n: rows.length };
      if (typeof loadPage === 'function') loadPage('breakeven');
    }).catch(function() {});
  },

  // Monthly cash flow (income vs expense) from the bank — last 6 months, for the chart.
  _loadMonthly: function() {
    if (window._bmMonthlyLoaded) return;
    var sb = (typeof SupabaseDB !== 'undefined') ? SupabaseDB.client : null;
    if (!sb) return;
    window._bmMonthlyLoaded = true;
    var since = new Date(); since.setMonth(since.getMonth() - 7);
    sb.from('bank_transactions').select('posted_date,amount,description,category').gte('posted_date', since.toISOString().slice(0, 10)).limit(5000).then(function(res) {
      var rows = (res && res.data) || [], m = {};
      rows.forEach(function(t) {
        var d = (t.posted_date || '').slice(0, 7); if (!d) return;
        var du = (t.description || '').toUpperCase(), cc = String(t.category);
        if (cc === '7100' || du.indexOf('PAYMENT - THANK') >= 0 || du.indexOf('WEB PMT TO') >= 0 || du.indexOf('XFER FROM') >= 0 || du.indexOf('XFER TO') >= 0 || du.indexOf('RETURN -') >= 0 || du.indexOf('REVERSE PRE') >= 0) return;
        m[d] = m[d] || { income: 0, expense: 0 };
        if (t.amount > 0) m[d].income += t.amount; else m[d].expense += Math.abs(t.amount);
      });
      var months = Object.keys(m).sort().slice(-6);
      window._bmMonthly = months.map(function(k) { return { month: k, income: m[k].income, expense: m[k].expense }; });
      if (typeof loadPage === 'function') loadPage('breakeven');
    }).catch(function() {});
  },

  render: function() {
    var c = BreakEvenPage._load();
    var ovTotal = c.overhead.reduce(function(s, o) { return s + (parseFloat(o.amt) || 0); }, 0);
    var laborAnnual = c.labor.reduce(function(s, l) { return s + (parseFloat(l.rate) || 0) * (parseFloat(l.hrsWk) || 0) * (parseFloat(c.workWeeks) || 1); }, 0);
    var fixed = ovTotal + laborAnnual;
    var perDay = fixed / (parseFloat(c.workDays) || 1);
    var perWeek = fixed / (parseFloat(c.workWeeks) || 1);
    var rev12 = BreakEvenPage._revenueLast(12);
    var revMo = BreakEvenPage._revenueLast(1);
    var act = BreakEvenPage._actualDayStats();
    var annualFloorVsRev = rev12 - fixed;
    // ── "Work-less" model: how few days cover the nut + your pay ──
    // Crew is a per-day direct cost here (only paid on work days), so FIXED =
    // overhead only (ovTotal), NOT the annualized crew labor.
    var contrib = (parseFloat(c.dayRate) || 0) - (parseFloat(c.directCostPerDay) || 0); // margin/crew-day
    var daysFixed = contrib > 0 ? ovTotal / contrib : 0;
    var daysFixedPay = contrib > 0 ? (ovTotal + (parseFloat(c.ownerPay) || 0)) / contrib : 0;
    var daysOff = 365 - daysFixedPay;

    var I = function(val, onCh, w) {
      return '<input type="number" value="' + (val || 0) + '" onchange="' + onCh + '" style="width:' + (w || 90) + 'px;padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:13px;text-align:right;">';
    };

    var html = ''
      + '<div style="max-width:1000px;padding-top:8px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin:0 0 4px;">'
      +   '<h3 style="margin:0;font-size:16px;font-weight:700;">⚖️ Day Budget</h3>'
      +   '<span style="font-size:12px;color:var(--text-light);">Minimum to keep operating · live revenue from invoices</span>'
      + '</div>'
      + '<p style="font-size:12px;color:var(--text-light);margin:0 0 14px;">Edit any number below — it saves and recomputes instantly. Yellow = assumption to confirm.</p>';

    // ── CASH & RUNWAY (live bank balances) ──
    BreakEvenPage._loadCash();
    var cashD = window._bmCash;
    var smartLawn = (c.smartLawn != null) ? (parseFloat(c.smartLawn) || 0) : 0;
    // Winter nut = only the obligations that bill with ZERO work: insurance
    // (not WC — payroll-based), equipment financing/leases, taxes, office.
    // Fuel / repairs / gear are variable (≈ 0 in a no-income winter).
    var winterFixedAnnual = c.overhead.reduce(function(s, o) {
      var n = (o.name || '').toLowerCase();
      if (/workers? comp|paychex/.test(n)) return s;
      if (/insur|lease|financ|loan|km100|blue bridge|tax|licens|office|account|legal|software/.test(n)) return s + (parseFloat(o.amt) || 0);
      return s;
    }, 0);
    var winterNutMo = winterFixedAnnual / 12 + (parseFloat(c.ownerPay) || 0) / 12; // biz fixed + your draw
    var workingBurnMo = (ovTotal + (parseFloat(c.ownerPay) || 0)) / 12;            // full burn while operating
    html += '<div style="background:#f0f7ff;border:1px solid #bcd8f5;border-radius:12px;padding:14px 16px;margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      +   '<span style="font-weight:700;">💵 Cash &amp; Runway</span>'
      +   (cashD ? '<span style="font-size:11px;color:var(--text-light);">live from bank · as of ' + (cashD.asof || '—') + '</span>' : '<span style="font-size:11px;color:var(--text-light);">connect a bank or enter balances</span>')
      + '</div>';
    if (cashD) {
      var net = cashD.net;
      var afterPayable = net - smartLawn;
      var winterNeed = winterNutMo * 3;
      var runway = winterNutMo > 0 ? net / winterNutMo : 0;
      var winterAfter = afterPayable >= winterNeed;
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">'
        + BreakEvenPage._stat('NET CASH', BreakEvenPage._money(net), '#fff', '#0a7d2c', BreakEvenPage._money(cashD.cash) + ' cash − ' + BreakEvenPage._money(cashD.debt) + ' owed')
        + BreakEvenPage._stat('Winter nut / mo', BreakEvenPage._money(winterNutMo), 'var(--card)', 'var(--text)', 'fixed + your draw (no WC/variable)')
        + BreakEvenPage._stat('Runway', runway.toFixed(1) + ' mo', 'var(--card)', (runway >= 3 ? '#0a7d2c' : '#c0271d'), 'at the winter nut')
        + BreakEvenPage._stat('Winter (3mo, no income)', (net >= winterNeed ? 'covered' : 'SHORT ' + BreakEvenPage._money(winterNeed - net)), (net >= winterNeed ? '#eef7f0' : '#fdecea'), (net >= winterNeed ? '#0a7d2c' : '#c0271d'), 'needs ' + BreakEvenPage._money(winterNeed))
        + '</div>'
        + '<div style="margin-top:10px;font-size:12px;color:var(--text-light);">'
        +   'One-time tree payable ($): ' + I(smartLawn, "BreakEvenPage._set('smartLawn',this.value)") + ' &nbsp;→&nbsp; after paying it, net cash <b>' + BreakEvenPage._money(afterPayable) + '</b>, winter ' + (winterAfter ? '<b style="color:#0a7d2c;">still covered</b>' : '<b style="color:#c0271d;">SHORT ' + BreakEvenPage._money(winterNeed - afterPayable) + '</b>') + '. <span style="color:#999;">(Smart Lawn / Navimow is a separate LLC — not counted here.)</span>'
        +   ' Full operating burn while working ≈ <b>' + BreakEvenPage._money(workingBurnMo) + '/mo</b>.'
        + '</div>';
    } else {
      html += '<div style="font-size:13px;color:var(--text-light);">Loading balances… if this stays blank, no bank balance is set yet (populates from Plaid sync or manual entry in Books).</div>';
    }
    html += '</div>';

    // ── 📊 BUSINESS PICTURE (live charts) ──
    BreakEvenPage._loadMonthly();
    var mo = window._bmMonthly;
    html += '<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:16px;">'
      + '<div style="font-weight:700;margin-bottom:10px;">📊 Business Picture</div>';
    if (mo && mo.length) {
      var maxv = 1;
      mo.forEach(function(x) { maxv = Math.max(maxv, x.income, x.expense); });
      var bars = mo.map(function(x) {
        var ih = Math.max(2, Math.round(x.income / maxv * 110)), eh = Math.max(2, Math.round(x.expense / maxv * 110));
        var net = x.income - x.expense;
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0;">'
          + '<div style="display:flex;align-items:flex-end;gap:3px;height:118px;">'
          +   '<div title="in ' + BreakEvenPage._money(x.income) + '" style="width:13px;height:' + ih + 'px;background:#4caf50;border-radius:3px 3px 0 0;"></div>'
          +   '<div title="out ' + BreakEvenPage._money(x.expense) + '" style="width:13px;height:' + eh + 'px;background:#c0271d;opacity:.85;border-radius:3px 3px 0 0;"></div>'
          + '</div>'
          + '<div style="font-size:10px;font-weight:700;color:' + (net >= 0 ? '#0a7d2c' : '#c0271d') + ';">' + (net >= 0 ? '+' : '') + Math.round(net / 1000) + 'k</div>'
          + '<div style="font-size:10px;color:var(--text-light);">' + x.month.slice(5) + '/' + x.month.slice(2, 4) + '</div>'
          + '</div>';
      }).join('');
      html += '<div style="font-size:12px;color:var(--text-light);margin-bottom:4px;">Cash flow, last 6 months &nbsp;<span style="color:#4caf50;font-weight:700;">▮ in</span> <span style="color:#c0271d;font-weight:700;">▮ out</span> &nbsp;· net below each</div>'
        + '<div style="display:flex;align-items:flex-end;gap:10px;padding:4px 0 2px;">' + bars + '</div>';
    } else {
      html += '<div style="font-size:12px;color:var(--text-light);">Loading monthly chart…</div>';
    }
    if (cashD) {
      var wneed = winterNutMo * 3;
      var wpct = wneed > 0 ? Math.min(100, Math.round(cashD.net / wneed * 100)) : 0;
      html += '<div style="margin-top:14px;">'
        + '<div style="font-size:12px;color:var(--text-light);margin-bottom:4px;">🏦 Winter reserve: <b>' + BreakEvenPage._money(cashD.net) + '</b> of <b>' + BreakEvenPage._money(wneed) + '</b> banked (' + wpct + '%)</div>'
        + '<div style="height:18px;background:#eee;border-radius:9px;overflow:hidden;">'
        +   '<div style="height:100%;width:' + wpct + '%;background:' + (wpct >= 100 ? '#0a7d2c' : '#c79a00') + ';border-radius:9px;"></div>'
        + '</div></div>';
    }
    html += '</div>';

    // ── SALES TARGET TO KEEP GOING ──
    var tgtDays = Math.ceil(daysFixedPay);
    var survDays = Math.ceil(daysFixed);
    var rate = parseFloat(c.dayRate) || 0;
    var tgtAnnual = tgtDays * rate;
    var survAnnual = survDays * rate;
    var wks = parseFloat(c.workWeeks) || 44;
    html += '<div style="background:#fff8e6;border:1px solid #f0d98a;border-radius:12px;padding:14px 16px;margin-bottom:16px;">'
      + '<div style="font-weight:700;margin-bottom:8px;">🎯 To keep going, you need to sell</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">'
      +   BreakEvenPage._stat('Per YEAR', BreakEvenPage._money(tgtAnnual), '#fff', '#7c5a00', 'covers overhead + your ' + BreakEvenPage._money(c.ownerPay))
      +   BreakEvenPage._stat('Per MONTH', BreakEvenPage._money(tgtAnnual / 12), '#fff', '#7c5a00', '≈ ' + (tgtDays / 12).toFixed(1) + ' billed days/mo')
      +   BreakEvenPage._stat('Per WEEK', BreakEvenPage._money(tgtAnnual / wks), '#fff', '#7c5a00', 'across ' + wks + ' working weeks')
      +   BreakEvenPage._stat('Bare survival', BreakEvenPage._money(survAnnual), '#fff', '#c0271d', 'overhead only — $0 to you')
      + '</div>'
      + '<div style="font-size:12px;color:#7c5a00;margin-top:8px;">At your ' + BreakEvenPage._money(rate) + '/day rate that\'s ~<b>' + tgtDays + ' billed days a year</b> (' + (tgtDays / wks).toFixed(1) + '/working-week). Cut a flagged fixed line or raise the day rate and this target drops fast.</div>'
      + '</div>';

    // ── REVENUE & DIRECT COST BY LINE OF BUSINESS (Tree / Snow / Smart Lawn) ──
    BreakEvenPage._loadExpenses();
    var byLine = BreakEvenPage._revenueByLine(12);
    var cost = window._bmCostByLine;
    var lineTotal = byLine.tree + byLine.snow + byLine.smartlawn + byLine.firewood;
    function pct(v) { return lineTotal ? Math.round(v / lineTotal * 100) + '% of revenue' : ''; }
    function sideSub(rev, key) {
      if (cost && cost[key] != null) {
        var dc = cost[key], net = rev - dc;
        return 'rev ' + BreakEvenPage._money(rev) + ' − direct ' + BreakEvenPage._money(dc)
          + ' = <b style="color:' + (net >= 0 ? '#0a7d2c' : '#c0271d') + ';">' + BreakEvenPage._money(net) + '</b>';
      }
      return pct(rev);
    }
    html += '<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      +   '<span style="font-weight:700;">Revenue by line of business</span>'
      +   '<span style="font-size:11px;color:var(--text-light);">last 12 mo · paid invoices</span>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">'
      +   BreakEvenPage._stat('🌳 Tree', BreakEvenPage._money(byLine.tree), 'var(--card)', '#0a7d2c', pct(byLine.tree))
      +   BreakEvenPage._stat('❄️ Snow', BreakEvenPage._money(byLine.snow), 'var(--card)', '#2c6fb3', sideSub(byLine.snow, 'snow'))
      +   BreakEvenPage._stat('🤖 Smart Lawn', BreakEvenPage._money(byLine.smartlawn), 'var(--card)', '#8e44ad', (lineTotal && byLine.smartlawn) || (cost && cost.smartlawn) ? sideSub(byLine.smartlawn, 'smartlawn') : 'new line')
      +   BreakEvenPage._stat('🔥 Firewood', BreakEvenPage._money(byLine.firewood), 'var(--card)', '#b5651d', (lineTotal && byLine.firewood) || (cost && cost.firewood) ? sideSub(byLine.firewood, 'firewood') : 'winter line')
      + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);margin-top:8px;">Snow/Smart Lawn show revenue − their <b>direct</b> spend (does the line cover itself). Shared overhead (insurance, leases, fuel) stays company-wide — not loaded onto a side line. Tag a job\'s line to override the keyword guess.</div>'
      + '</div>';

    // ── DRIVERS ──
    var dpm = (parseFloat(c.workDays) || 0) / 12;
    var dpw = (parseFloat(c.workDays) || 0) / 52;
    var dpww = (parseFloat(c.workDays) || 0) / (parseFloat(c.workWeeks) || 1);
    html += '<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:14px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      +   '<span style="font-weight:700;">Drivers</span>'
      +   '<button onclick="BreakEvenPage._reset()" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;color:var(--text-light);">↺ Reset to current numbers</button>'
      + '</div>'
      + '<div style="display:flex;gap:24px;flex-wrap:wrap;">'
      +   '<label style="font-size:13px;">Work Days / Year<br>' + I(c.workDays, "BreakEvenPage._set('workDays',this.value)") + '</label>'
      +   '<label style="font-size:13px;">Work Weeks / Year<br>' + I(c.workWeeks, "BreakEvenPage._set('workWeeks',this.value)") + '</label>'
      +   '<label style="font-size:13px;font-weight:700;color:var(--green-dark);">⭐ Target Day Rate ($) — your #1 lever<br>'
      +     '<input type="number" value="' + (c.dayRate || 0) + '" onchange="BreakEvenPage._set(\'dayRate\',this.value)" style="width:150px;padding:8px 10px;border:2px solid var(--green-dark);border-radius:7px;font-size:20px;font-weight:800;text-align:right;color:var(--green-dark);background:#f0f9f0;"></label>'
      +   '<label style="font-size:13px;">Direct cost / work day ($)<br>' + I(c.directCostPerDay, "BreakEvenPage._set('directCostPerDay',this.value)") + '</label>'
      +   '<label style="font-size:13px;">Your pay / year ($)<br>' + I(c.ownerPay, "BreakEvenPage._set('ownerPay',this.value)") + '</label>'
      + '</div>'
      + '<div style="margin-top:10px;font-size:12px;color:var(--text-light);">'
      +   '= <b>' + dpm.toFixed(1) + '</b> days/month &nbsp;·&nbsp; <b>' + dpw.toFixed(1) + '</b> days/week (across 52) &nbsp;·&nbsp; <b>' + dpww.toFixed(1) + '</b> days/working-week (across ' + c.workWeeks + ')'
      + '</div>'
      + (act ? '<div style="margin-top:8px;font-size:12px;padding:8px 10px;background:#fff8e6;border:1px solid #f0d98a;border-radius:8px;">'
          + '📊 <b>Actual avg per TREE job: ' + BreakEvenPage._money(act.avg) + '</b> (median ' + BreakEvenPage._money(act.median) + ', ' + act.jobs + ' jobs · snowplow excluded). '
          + 'Note: jobs often span multiple days and BM doesn\'t track days-per-job, so a true per-day rate can\'t be computed from data — set the Target Day Rate above to what a crew-day actually bills.</div>' : '')
      + '</div>';

    // ── BREAK-EVEN HEADLINE ──
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px;">'
      + BreakEvenPage._stat('MIN / WEEK', BreakEvenPage._money(perWeek), '#fff3cd', '#7c5a00', 'minimum to operate')
      + BreakEvenPage._stat('Min / Work Day', BreakEvenPage._money(perDay), 'var(--card)', 'var(--text)', '')
      + BreakEvenPage._stat('Annual Fixed Floor', BreakEvenPage._money(fixed), 'var(--card)', 'var(--text)', 'overhead + crew')
      + BreakEvenPage._stat('Revenue (last 12mo)', BreakEvenPage._money(rev12), 'var(--card)', (annualFloorVsRev >= 0 ? '#0a7d2c' : '#c0271d'), (annualFloorVsRev >= 0 ? 'covers floor +' + BreakEvenPage._money(annualFloorVsRev) : 'SHORT ' + BreakEvenPage._money(-annualFloorVsRev)))
      + '</div>';

    // ── WORK-LESS MODEL (days to cover the nut → time off) ──
    html += '<div style="background:#eef7f0;border:1px solid #bfe3c9;border-radius:12px;padding:14px 16px;margin-bottom:16px;">'
      + '<div style="font-weight:700;margin-bottom:4px;">🌴 How few days can you work? (the time-off model)</div>'
      + '<div style="font-size:12px;color:var(--text-light);margin-bottom:12px;">Each booked crew-day at $' + Math.round(c.dayRate).toLocaleString() + ' nets <b>' + BreakEvenPage._money(contrib) + '</b> toward fixed costs after the $' + Math.round(c.directCostPerDay).toLocaleString() + ' it costs to run that day. So:</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">'
      +   BreakEvenPage._stat('Days to cover OVERHEAD', Math.ceil(daysFixed) + ' days', '#fff', '#0a7d2c', 'just the fixed nut')
      +   BreakEvenPage._stat('Days to ALSO pay you ' + BreakEvenPage._money(c.ownerPay), Math.ceil(daysFixedPay) + ' days', '#fff', '#0a7d2c', 'fixed + your pay')
      +   BreakEvenPage._stat('That leaves you', Math.max(0, Math.floor(daysOff)) + ' days off', '#fff3cd', '#7c5a00', '≈ ' + Math.floor(daysOff / 7) + ' weeks off/yr')
      + '</div>'
      + '<div style="font-size:12px;color:#2c5a36;margin-top:10px;line-height:1.5;">Work just <b>' + Math.ceil(daysFixedPay) + ' solid $' + Math.round(c.dayRate).toLocaleString() + ' days a year</b> and the company covers all fixed costs AND pays you ' + BreakEvenPage._money(c.ownerPay) + '. The rest is time off (Catherine’s Prague/Tokyo, your own). The catch isn’t the cost structure — it’s <b>booking + collecting</b> those days. Raise the day rate or cut a fixed line (e.g. kill a dead-machine lease) and the required days drop further.</div>'
      + '</div>';

    // ── ANNUAL OVERHEAD ──
    html += '<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:14px;">'
      + '<div style="font-weight:700;margin-bottom:10px;">Annual Fixed Overhead</div>'
      + '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
      + '<tr style="color:var(--text-light);text-align:right;"><th style="text-align:left;">Category</th><th>Annual $</th><th>Per Work Day</th><th style="text-align:left;padding-left:10px;">Note</th></tr>';
    c.overhead.forEach(function(o, idx) {
      html += '<tr style="border-top:1px solid var(--border);' + (o.flag ? 'background:#fffbe6;' : '') + '">'
        + '<td style="padding:5px 0;">' + UI.esc(o.name) + '</td>'
        + '<td style="text-align:right;">' + I(o.amt, "BreakEvenPage._setOv(" + idx + ",this.value)") + '</td>'
        + '<td style="text-align:right;color:var(--text-light);">' + BreakEvenPage._money((parseFloat(o.amt) || 0) / (parseFloat(c.workDays) || 1)) + '</td>'
        + '<td style="font-size:11px;color:#8a6d00;padding-left:10px;">' + UI.esc(o.note || '') + '</td></tr>';
    });
    html += '<tr style="border-top:2px solid var(--border);font-weight:700;"><td style="padding:6px 0;">TOTAL OVERHEAD</td>'
      + '<td style="text-align:right;">' + BreakEvenPage._money(ovTotal) + '</td>'
      + '<td style="text-align:right;">' + BreakEvenPage._money(ovTotal / (parseFloat(c.workDays) || 1)) + '</td><td></td></tr>'
      + '</table></div>';

    // ── LABOR ──
    html += '<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:14px;">'
      + '<div style="font-weight:700;margin-bottom:10px;">Crew Labor</div>'
      + '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
      + '<tr style="color:var(--text-light);text-align:right;"><th style="text-align:left;">Person</th><th>$/hr</th><th>Hrs/Wk</th><th>Annual (× work wks)</th></tr>';
    c.labor.forEach(function(l, idx) {
      var ann = (parseFloat(l.rate) || 0) * (parseFloat(l.hrsWk) || 0) * (parseFloat(c.workWeeks) || 0);
      html += '<tr style="border-top:1px solid var(--border);"><td style="padding:5px 0;">' + UI.esc(l.name) + '</td>'
        + '<td style="text-align:right;">' + I(l.rate, "BreakEvenPage._setLab(" + idx + ",'rate',this.value)", 60) + '</td>'
        + '<td style="text-align:right;">' + I(l.hrsWk, "BreakEvenPage._setLab(" + idx + ",'hrsWk',this.value)", 60) + '</td>'
        + '<td style="text-align:right;color:var(--text-light);">' + BreakEvenPage._money(ann) + '</td></tr>';
    });
    html += '<tr style="border-top:2px solid var(--border);font-weight:700;"><td style="padding:6px 0;">TOTAL LABOR</td><td></td><td></td>'
      + '<td style="text-align:right;">' + BreakEvenPage._money(laborAnnual) + '</td></tr></table></div>';

    html += '<div style="font-size:12px;color:var(--text-light);background:#f6f6f4;border-radius:10px;padding:12px;line-height:1.5;">'
      + '<b>Read this right:</b> the weekly minimum (' + BreakEvenPage._money(perWeek) + ') is the <b>fixed floor</b> — overhead + crew wages only. '
      + 'It does NOT include job materials/dump fees (covered in job pricing) or your own pay, so real billing must clear this plus margin. '
      + 'One full crew-day bills ~' + BreakEvenPage._money(c.dayRate) + ', so ~' + (Math.max(1, Math.ceil(perWeek / (c.dayRate || 1)))) + ' solid days/week covers it. '
      + 'Seasonal: you must bank ~3× the winter floor by December to survive Jan–Mar. '
      + 'Revenue this month so far: <b>' + BreakEvenPage._money(revMo) + '</b>.</div>'
      + '</div>';

    return html;
  },

  _stat: function(label, val, bg, color, sub) {
    return '<div style="background:' + bg + ';border:1px solid var(--border);border-radius:12px;padding:12px 14px;">'
      + '<div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;">' + label + '</div>'
      + '<div style="font-size:22px;font-weight:800;color:' + color + ';margin-top:2px;">' + val + '</div>'
      + (sub ? '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">' + sub + '</div>' : '') + '</div>';
  },

  _reset: function() {
    if (!confirm('Reset all break-even numbers to the current defaults? This overwrites your edits.')) return;
    localStorage.removeItem('bm-breakeven');
    BreakEvenPage._save(JSON.parse(JSON.stringify(BreakEvenPage.DEFAULTS)));
    loadPage('breakeven');
  },
  _set: function(k, v) { var c = BreakEvenPage._load(); c[k] = parseFloat(v) || 0; BreakEvenPage._save(c); loadPage('breakeven'); },
  _setOv: function(i, v) { var c = BreakEvenPage._load(); c.overhead[i].amt = parseFloat(v) || 0; BreakEvenPage._save(c); loadPage('breakeven'); },
  _setLab: function(i, f, v) { var c = BreakEvenPage._load(); c.labor[i][f] = parseFloat(v) || 0; BreakEvenPage._save(c); loadPage('breakeven'); }
};
