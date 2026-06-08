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
      { name: 'Insurance — Workers Comp (Paychex)', amt: 53775, flag: true,  note: 'VERIFY vs NYSIF audit — may bundle payroll' },
      { name: 'Insurance — Liability / Auto (Erie)', amt: 16600, flag: false, note: '' },
      { name: 'Equip financing — Bucket truck lease (Blue Bridge 155642)', amt: 22951, flag: false, note: '$1,912.56/mo — ONE lease (verified; bank labels it CORP/CONS inconsistently)' },
      { name: 'Equip financing — KM100 telehandler (NEW)', amt: 13200, flag: true,  note: '$1,100/mo x 5yr (Stearns)' },
      { name: 'Repairs & Maintenance', amt: 11000, flag: false, note: '' },
      { name: 'Fuel', amt: 10000, flag: false, note: '' },
      { name: 'Chainsaw / Ropes / Climbing / Gear', amt: 10000, flag: false, note: '' },
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

  render: function() {
    var c = BreakEvenPage._load();
    var ovTotal = c.overhead.reduce(function(s, o) { return s + (parseFloat(o.amt) || 0); }, 0);
    var laborAnnual = c.labor.reduce(function(s, l) { return s + (parseFloat(l.rate) || 0) * (parseFloat(l.hrsWk) || 0) * (parseFloat(c.workWeeks) || 1); }, 0);
    var fixed = ovTotal + laborAnnual;
    var perDay = fixed / (parseFloat(c.workDays) || 1);
    var perWeek = fixed / (parseFloat(c.workWeeks) || 1);
    var rev12 = BreakEvenPage._revenueLast(12);
    var revMo = BreakEvenPage._revenueLast(1);
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
      + '<div style="max-width:1000px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px;">'
      +   '<h2 style="margin:0;font-size:22px;font-weight:700;">⚖️ Break-Even / Day Budget</h2>'
      +   '<span style="font-size:12px;color:var(--text-light);">Minimum to keep operating · live revenue from invoices</span>'
      + '</div>'
      + '<p style="font-size:12px;color:var(--text-light);margin:0 0 16px;">Edit any number below — it saves and recomputes instantly. Yellow = assumption to confirm.</p>';

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
      +   '<label style="font-size:13px;">Target Day Rate ($)<br>' + I(c.dayRate, "BreakEvenPage._set('dayRate',this.value)") + '</label>'
      +   '<label style="font-size:13px;">Direct cost / work day ($)<br>' + I(c.directCostPerDay, "BreakEvenPage._set('directCostPerDay',this.value)") + '</label>'
      +   '<label style="font-size:13px;">Your pay / year ($)<br>' + I(c.ownerPay, "BreakEvenPage._set('ownerPay',this.value)") + '</label>'
      + '</div>'
      + '<div style="margin-top:10px;font-size:12px;color:var(--text-light);">'
      +   '= <b>' + dpm.toFixed(1) + '</b> days/month &nbsp;·&nbsp; <b>' + dpw.toFixed(1) + '</b> days/week (across 52) &nbsp;·&nbsp; <b>' + dpww.toFixed(1) + '</b> days/working-week (across ' + c.workWeeks + ')'
      + '</div></div>';

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
