/**
 * Branch Manager — Profit & Loss Report
 * Monthly/yearly revenue vs expenses breakdown
 * v2
 */
var ProfitLossPage = {
  render: function() {
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // Switcher
    var view = ProfitLossPage._view || 'month';
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      + '<div class="section-header" style="margin:0;"><h2>Profit & Loss</h2></div>'
      + '<div style="display:flex;gap:4px;background:var(--bg);border-radius:8px;padding:3px;">';
    ['month','quarter','year'].forEach(function(v) {
      var active = v === view ? 'background:var(--green-dark);color:#fff;' : 'background:transparent;color:var(--text);';
      html += '<button onclick="ProfitLossPage._view=\'' + v + '\';loadPage(\'profitloss\');" style="border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;' + active + '">' + v.charAt(0).toUpperCase() + v.slice(1) + '</button>';
    });
    html += '</div></div>';

    // Calculate P&L
    var invoices = DB.invoices.getAll();
    var expenses = DB.expenses ? DB.expenses.getAll() : [];
    var fixedCosts = ExpensesPage ? ExpensesPage._getFixedCosts() : 0;

    // Filter by period
    var periodStart, periodEnd, periodLabel;
    if (view === 'month') {
      periodStart = new Date(year, month, 1);
      periodEnd = new Date(year, month + 1, 0);
      periodLabel = monthNames[month] + ' ' + year;
    } else if (view === 'quarter') {
      var qStart = Math.floor(month / 3) * 3;
      periodStart = new Date(year, qStart, 1);
      periodEnd = new Date(year, qStart + 3, 0);
      periodLabel = 'Q' + (Math.floor(month / 3) + 1) + ' ' + year;
    } else {
      periodStart = new Date(year, 0, 1);
      periodEnd = new Date(year, 11, 31);
      periodLabel = year.toString();
    }

    var periodInvoices = invoices.filter(function(i) {
      var d = new Date(i.createdAt);
      return d >= periodStart && d <= periodEnd;
    });
    var periodExpenses = expenses.filter(function(e) {
      var d = new Date(e.date);
      return d >= periodStart && d <= periodEnd;
    });

    var revenue = periodInvoices.reduce(function(s, i) { return s + (i.total || 0); }, 0);
    var collected = periodInvoices.filter(function(i) { return i.status === 'paid'; }).reduce(function(s, i) { return s + (i.total || 0); }, 0);
    var outstanding = revenue - collected;
    var variableExpenses = periodExpenses.reduce(function(s, e) { return s + (e.amount || 0); }, 0);
    var monthsInPeriod = view === 'month' ? 1 : view === 'quarter' ? 3 : 12;
    var totalFixed = fixedCosts * monthsInPeriod;
    var totalExpenses = variableExpenses + totalFixed;
    var netProfit = revenue - totalExpenses;
    var margin = revenue > 0 ? Math.round(netProfit / revenue * 100) : 0;

    // Summary cards
    html += '<div class="stat-grid">'
      + UI.statCard('Revenue', UI.moneyInt(revenue), periodInvoices.length + ' invoices • ' + periodLabel, '', '', '')
      + UI.statCard('Collected', UI.moneyInt(collected), UI.moneyInt(outstanding) + ' outstanding', collected >= revenue ? 'up' : '', '', '')
      + UI.statCard('Total Costs', UI.moneyInt(totalExpenses), 'Fixed: ' + UI.moneyInt(totalFixed) + ' + Variable: ' + UI.moneyInt(variableExpenses), '', '', '')
      + UI.statCard('Net Profit', UI.moneyInt(netProfit), margin + '% margin', netProfit > 0 ? 'up' : 'down', '', '')
      + '</div>';

    // Visual P&L bar
    var maxBar = Math.max(revenue, totalExpenses, 1);
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="font-size:15px;margin-bottom:16px;">Revenue vs Costs — ' + periodLabel + '</h3>'
      + '<div style="margin-bottom:12px;">'
      + '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span>Revenue</span><strong>' + UI.moneyInt(revenue) + '</strong></div>'
      + '<div style="height:24px;background:var(--bg);border-radius:6px;overflow:hidden;"><div style="height:100%;width:' + (revenue / maxBar * 100) + '%;background:#4caf50;border-radius:6px;"></div></div></div>'
      + '<div style="margin-bottom:12px;">'
      + '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span>Fixed Costs</span><strong>' + UI.moneyInt(totalFixed) + '</strong></div>'
      + '<div style="height:24px;background:var(--bg);border-radius:6px;overflow:hidden;"><div style="height:100%;width:' + (totalFixed / maxBar * 100) + '%;background:#ff9800;border-radius:6px;"></div></div></div>'
      + '<div style="margin-bottom:12px;">'
      + '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span>Variable Costs</span><strong>' + UI.moneyInt(variableExpenses) + '</strong></div>'
      + '<div style="height:24px;background:var(--bg);border-radius:6px;overflow:hidden;"><div style="height:100%;width:' + (variableExpenses / maxBar * 100) + '%;background:#f44336;border-radius:6px;"></div></div></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;padding-top:12px;border-top:2px solid var(--border);color:' + (netProfit >= 0 ? '#4caf50' : '#f44336') + ';">'
      + '<span>Net Profit</span><span>' + UI.moneyInt(netProfit) + ' (' + margin + '%)</span></div>'
      + '</div>';

    // Expense breakdown by category
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">';

    // Revenue breakdown
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="font-size:15px;margin-bottom:12px;">Revenue Breakdown</h3>';
    if (periodInvoices.length) {
      var statusGroups = {};
      periodInvoices.forEach(function(i) {
        var s = i.status || 'unknown';
        if (!statusGroups[s]) statusGroups[s] = { count: 0, total: 0 };
        statusGroups[s].count++;
        statusGroups[s].total += i.total || 0;
      });
      Object.keys(statusGroups).forEach(function(s) {
        var g = statusGroups[s];
        html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">'
          + '<span style="text-transform:capitalize;">' + s.replace(/_/g, ' ') + ' (' + g.count + ')</span>'
          + '<strong>' + UI.moneyInt(g.total) + '</strong></div>';
      });
    } else {
      html += '<div style="color:var(--text-light);font-size:13px;">No invoices this period.</div>';
    }
    html += '</div>';

    // Cost breakdown
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="font-size:15px;margin-bottom:12px;">Cost Breakdown</h3>';
    // Fixed costs
    html += '<div style="font-size:12px;color:var(--text-light);font-weight:600;margin-bottom:4px;">FIXED (monthly)</div>';
    var fixedItems = [
      { label: 'Truck Payment', key: 'truck_payment', default: 1912 },
      { label: 'Pickup Payment', key: 'pickup_payment', default: 1000 },
      { label: 'Insurance', key: 'insurance_monthly', default: 1300 },
      { label: 'Repair Fund', key: 'repair_fund', default: 1000 }
    ];
    fixedItems.forEach(function(f) {
      var val = parseFloat(localStorage.getItem('bm-fixed-' + f.key)) || f.default;
      if (val > 0) {
        html += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span>' + f.label + '</span><span>' + UI.money(val) + '/mo</span></div>';
      }
    });

    // Variable costs by category
    if (periodExpenses.length) {
      html += '<div style="font-size:12px;color:var(--text-light);font-weight:600;margin:8px 0 4px;">VARIABLE</div>';
      var catTotals = {};
      periodExpenses.forEach(function(e) {
        if (!catTotals[e.category]) catTotals[e.category] = 0;
        catTotals[e.category] += e.amount;
      });
      Object.keys(catTotals).forEach(function(cat) {
        html += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span style="text-transform:capitalize;">' + cat.replace(/_/g, ' ') + '</span><strong>' + UI.money(catTotals[cat]) + '</strong></div>';
      });
    }
    html += '</div></div>';

    // Monthly trend (year view)
    if (view === 'year') {
      // Compute max monthly revenue for this year (for scaling bars)
      var maxMRev = 0;
      for (var mx = 0; mx < 12; mx++) {
        var mxStart = new Date(year, mx, 1);
        var mxEnd = new Date(year, mx + 1, 0);
        var mxRev = invoices.filter(function(i) { var d = new Date(i.createdAt); return d >= mxStart && d <= mxEnd; }).reduce(function(s, i) { return s + (i.total || 0); }, 0);
        if (mxRev > maxMRev) maxMRev = mxRev;
      }
      // Also factor in last year's monthly max for consistent scale
      var prevYear = year - 1;
      var prevInvoices = DB.invoices.getAll().filter(function(i) {
        var d = new Date(i.createdAt);
        return d.getFullYear() === prevYear;
      });
      for (var px = 0; px < 12; px++) {
        var pxStart = new Date(prevYear, px, 1);
        var pxEnd = new Date(prevYear, px + 1, 0);
        var pxRev = prevInvoices.filter(function(i) { var d = new Date(i.createdAt); return d >= pxStart && d <= pxEnd; }).reduce(function(s, i) { return s + (i.total || 0); }, 0);
        if (pxRev > maxMRev) maxMRev = pxRev;
      }

      html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-top:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
        + '<h3 style="font-size:15px;margin:0;">Monthly Trend — ' + year + '</h3>'
        + '<div style="display:flex;gap:12px;font-size:11px;color:var(--text-light);">'
        + '<span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#4caf50;"></span>' + year + '</span>'
        + '<span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#ccc;"></span>' + prevYear + '</span>'
        + '</div></div>'
        + '<div style="display:grid;grid-template-columns:repeat(12,1fr);gap:4px;text-align:center;font-size:11px;">';
      for (var m = 0; m < 12; m++) {
        var mStart = new Date(year, m, 1);
        var mEnd = new Date(year, m + 1, 0);
        var mRev = invoices.filter(function(i) { var d = new Date(i.createdAt); return d >= mStart && d <= mEnd; }).reduce(function(s, i) { return s + (i.total || 0); }, 0);
        var barH = maxMRev > 0 ? Math.max(4, (mRev / maxMRev) * 80) : 4;
        // Previous year same month
        var pmStart = new Date(prevYear, m, 1);
        var pmEnd = new Date(prevYear, m + 1, 0);
        var pmRev = prevInvoices.filter(function(i) { var d = new Date(i.createdAt); return d >= pmStart && d <= pmEnd; }).reduce(function(s, i) { return s + (i.total || 0); }, 0);
        var pBarH = maxMRev > 0 ? Math.max(4, (pmRev / maxMRev) * 80) : 4;
        html += '<div>'
          + '<div style="height:80px;display:flex;align-items:flex-end;justify-content:center;gap:2px;">'
          + '<div style="width:45%;height:' + pBarH + 'px;background:#ccc;border-radius:3px;" title="' + prevYear + ' ' + monthNames[m] + ': $' + Math.round(pmRev) + '"></div>'
          + '<div style="width:45%;height:' + barH + 'px;background:' + (m <= month ? '#4caf50' : '#e0e0e0') + ';border-radius:3px;" title="' + year + ' ' + monthNames[m] + ': $' + Math.round(mRev) + '"></div>'
          + '</div>'
          + '<div style="margin-top:4px;color:var(--text-light);">' + monthNames[m] + '</div>'
          + '<div style="font-weight:600;">' + (mRev > 0 ? '$' + Math.round(mRev / 1000) + 'k' : '-') + '</div>'
          + '</div>';
      }
      html += '</div></div>';
    }

    // Export button
    html += '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">'
      + '<button onclick="ProfitLossPage.exportCSV(\'' + periodLabel + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">📥 Export CSV</button>'
      + '<button onclick="window.print()" style="background:none;border:2px solid var(--border);padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">🖨 Print</button>'
      + '</div>';

    return html;
  },

  exportCSV: function(period) {
    var invoices = DB.invoices.getAll();
    var expenses = DB.expenses ? DB.expenses.getAll() : [];

    var rows = ['Type,Category,Description,Amount,Date'];

    // Revenue rows
    invoices.forEach(function(i) {
      if (i.status === 'paid') {
        rows.push('Revenue,Invoice #' + (i.invoiceNumber || '') + ',' + (i.clientName || '').replace(/,/g, '') + ',' + (i.total || 0) + ',' + (i.createdAt || '').split('T')[0]);
      }
    });

    // Expense rows
    expenses.forEach(function(e) {
      rows.push('Expense,' + (e.category || 'Other').replace(/,/g, '') + ',' + (e.description || '').replace(/,/g, '') + ',' + (e.amount || 0) + ',' + (e.date || '').split('T')[0]);
    });

    // Fixed costs
    var fixedItems = [
      { label: 'Truck Payment', key: 'truck_payment', default: 1912 },
      { label: 'Pickup Payment', key: 'pickup_payment', default: 1000 },
      { label: 'Insurance', key: 'insurance_monthly', default: 1300 },
      { label: 'Repair Fund', key: 'repair_fund', default: 1000 }
    ];
    fixedItems.forEach(function(f) {
      var val = parseFloat(localStorage.getItem('bm-fixed-' + f.key)) || f.default;
      if (val > 0) rows.push('Fixed Cost,' + f.label + ',Monthly,' + val + ',');
    });

    var csv = rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'profit-loss-' + (period || 'report') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.toast('P&L exported as CSV');
  }
};
