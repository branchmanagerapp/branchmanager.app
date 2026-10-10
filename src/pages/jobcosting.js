/**
 * Branch Manager — Job Costing v2
 * Compare estimated vs actual costs per job
 * Track profitability by job, client, service type
 * Adds: per-job expense logging, overhead settings, horizontal bar profitability chart
 */
var JobCosting = {

  // --- LocalStorage helpers ---
  getOverhead: function(key, def) {
    var v = localStorage.getItem(key);
    return v !== null ? parseFloat(v) : def;
  },

  // v768: Single source of truth for per-job P&L numbers.
  // Reused by:
  //   - JobsPage._renderProfitCard (the per-job card)
  //   - JobCosting.render (the report-wide table)
  // Inputs: a job object (any shape — uses .id / .total / .lineItems) and
  // optionally the pre-filtered timeEntries (saves a getAll() call from
  // hot paths like JobsPage.showDetail which already has them).
  //
  // Cost model:
  //   labor    = sum(timeEntries.hours) × hourlyRate
  //   hourlyRate = job.crew[0]'s rate from bm-team if set; else
  //                bm-my-rate localStorage default $50
  //   materials = sum(line items with item.kind === 'material' OR
  //                   matching service in DB.materials)
  //   expenses  = sum(bm-job-expenses-{id})
  //   revenue   = job.total
  //   profit    = revenue - (labor + materials + expenses)
  //   margin    = round(profit / revenue * 100), 0 if no revenue
  getJobStats: function(job, preFilteredEntries) {
    if (!job) return { revenue:0, laborCost:0, materialsAndExpenses:0, totalCost:0, profit:0, margin:0, hours:0, hourlyRate:0, expenseCount:0 };
    var entries = preFilteredEntries;
    if (!entries) {
      var allEntries = (typeof DB !== 'undefined' && DB.timeEntries && DB.timeEntries.getAll)
        ? DB.timeEntries.getAll()
        : (function(){ try { return JSON.parse(localStorage.getItem('bm-time-entries') || '[]'); } catch(e) { return []; } })();
      entries = allEntries.filter(function(e) { return e.jobId === job.id; });
    }
    var hours = entries.reduce(function(s, e) { return s + (Number(e.hours) || 0); }, 0);
    // Pick a blended rate. If the first crew member has a saved rate, use
    // that; else fall back to bm-my-rate (legacy) or $50.
    var hourlyRate = 0;
    try {
      var team = JSON.parse(localStorage.getItem('bm-team') || '[]');
      if (job.crew && job.crew.length) {
        for (var i = 0; i < job.crew.length; i++) {
          var m = team.find(function(t) { return t.name === job.crew[i]; });
          if (m && Number(m.rate) > 0) { hourlyRate = Number(m.rate); break; }
        }
      }
    } catch(e) {}
    if (!hourlyRate) {
      hourlyRate = parseFloat(localStorage.getItem('bm-my-rate') || '50') || 50;
    }
    var laborCost = hours * hourlyRate;
    // Logged per-job expenses (manually entered cost rows)
    var expenses = [];
    try { expenses = JSON.parse(localStorage.getItem('bm-job-expenses-' + job.id) || '[]'); } catch(e) {}
    var expenseTotal = expenses.reduce(function(s, e) { return s + (Number(e.amount) || 0); }, 0);
    // Materials extracted from line items where kind=='material' OR rate>0
    // and service description matches a known material.
    var materialsCost = 0;
    if (Array.isArray(job.lineItems)) {
      job.lineItems.forEach(function(li) {
        if (li && (li.kind === 'material' || li.type === 'material')) {
          var qty = Number(li.qty || 1);
          var rate = Number(li.rate || li.cost || 0);
          materialsCost += qty * rate;
        }
      });
    }
    var revenue = Number(job.total) || 0;
    var totalCost = laborCost + materialsCost + expenseTotal;
    var profit = revenue - totalCost;
    var margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
    return {
      revenue: revenue,
      laborCost: laborCost,
      materialsCost: materialsCost,
      expenseTotal: expenseTotal,
      materialsAndExpenses: materialsCost + expenseTotal,
      totalCost: totalCost,
      profit: profit,
      margin: margin,
      hours: hours,
      hourlyRate: hourlyRate,
      expenseCount: expenses.length
    };
  },

  render: function() {
    var jobs = DB.jobs.getAll().filter(function(j) { return j.status === 'completed'; });
    var timeEntries = JSON.parse(localStorage.getItem('bm-time-entries') || '[]');
    var hourlyRate = parseFloat(localStorage.getItem('bm-my-rate') || '50');

    // Calculate profitability per job
    var costed = jobs.map(function(j) {
      var jobHours = timeEntries.filter(function(e) { return e.jobId === j.id; })
        .reduce(function(s, e) { return s + (e.hours || 0); }, 0);
      var laborCost = jobHours * hourlyRate;
      var expenses = JSON.parse(localStorage.getItem('bm-job-expenses-' + j.id) || '[]');
      var expenseTotal = expenses.reduce(function(s, e) { return s + (e.amount || 0); }, 0);
      var totalCost = laborCost + expenseTotal;
      var revenue = j.total || 0;
      var profit = revenue - totalCost;
      var margin = revenue > 0 ? Math.round(profit / revenue * 100) : 0;

      return {
        id: j.id, jobNumber: j.jobNumber, clientName: j.clientName, description: j.description,
        revenue: revenue, laborCost: laborCost, expenseTotal: expenseTotal,
        totalCost: totalCost, profit: profit, margin: margin,
        hours: jobHours, completedDate: j.completedDate || j.createdAt
      };
    });

    // Sort by date
    costed.sort(function(a, b) { return new Date(b.completedDate) - new Date(a.completedDate); });

    var totalRevenue = costed.reduce(function(s, j) { return s + j.revenue; }, 0);
    var totalCost = costed.reduce(function(s, j) { return s + j.totalCost; }, 0);
    var totalProfit = totalRevenue - totalCost;
    var avgMargin = totalRevenue > 0 ? Math.round(totalProfit / totalRevenue * 100) : 0;
    var avgJobValue = costed.length > 0 ? Math.round(totalRevenue / costed.length) : 0;

    // --- Stats ---
    var html = '<div class="stat-grid">'
      + UI.statCard('Avg Job Value', UI.moneyInt(avgJobValue), costed.length + ' completed jobs', '', '')
      + UI.statCard('Total Revenue', UI.moneyInt(totalRevenue), 'All completed jobs', 'up', '')
      + UI.statCard('Total Costs', UI.moneyInt(totalCost), 'Labor + expenses', '', '')
      + UI.statCard('Profit Margin', avgMargin + '%', UI.moneyInt(totalProfit) + ' profit', avgMargin >= 30 ? 'up' : 'down', '')
      + '</div>';

    // --- Margin legend ---
    html += '<div style="display:flex;gap:16px;align-items:center;font-size:12px;color:var(--text-light);margin-bottom:16px;flex-wrap:wrap;">'
      + '<span style="background:#e8f5e9;color:#2e7d32;padding:4px 10px;border-radius:6px;font-weight:600;">&#x1f7e2; 40%+ Excellent</span>'
      + '<span style="background:#fff8e1;color:#e65100;padding:4px 10px;border-radius:6px;font-weight:600;">&#x1f7e1; 20–40% OK</span>'
      + '<span style="background:#ffebee;color:#c62828;padding:4px 10px;border-radius:6px;font-weight:600;">&#x1f534; &lt;20% Below Target</span>'
      + '</div>';

    // --- Log Job Costs card ---
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<h3 style="font-size:16px;margin-bottom:14px;">Log Job Costs</h3>'
      + '<div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:10px;align-items:end;flex-wrap:wrap;">'
      + '<div>'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Job</label>'
      + '<select id="jc-job-select" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:13px;">';

    if (jobs.length === 0) {
      html += '<option value="">— No completed jobs —</option>';
    } else {
      html += '<option value="">— Select a job —</option>';
      jobs.slice(0, 30).forEach(function(j) {
        html += '<option value="' + j.id + '">#' + j.jobNumber + ' ' + j.clientName + (j.description ? ' — ' + j.description.substring(0, 25) : '') + '</option>';
      });
    }

    html += '</select></div>'
      + '<div>'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Category</label>'
      + '<select id="jc-category" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:13px;">'
      + '<option value="fuel">Fuel</option>'
      + '<option value="dump_fees">Dump Fees</option>'
      + '<option value="subcontractor">Subcontractor</option>'
      + '<option value="materials">Materials</option>'
      + '<option value="equipment_rental">Equipment Rental</option>'
      + '</select></div>'
      + '<div>'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Amount ($)</label>'
      + '<input id="jc-amount" type="number" min="0" step="0.01" placeholder="0.00" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;">'
      + '</div>'
      + '<button class="btn btn-primary" onclick="JobCosting.saveExpense()">Save</button>'
      + '</div></div>';

    // --- Overhead settings (collapsible) ---
    var ohInsurance = JobCosting.getOverhead('bm-oh-insurance', 18);
    var ohEquip = JobCosting.getOverhead('bm-oh-equip', 500);
    var ohVehicle = JobCosting.getOverhead('bm-oh-vehicle', 2900);
    var monthlyOverhead = ohEquip + ohVehicle + (totalRevenue / 12 * ohInsurance / 100);
    var avgJobsPerMonth = costed.length > 0 ? Math.max(1, Math.round(costed.length / 12)) : 4;
    var perJobOverhead = Math.round(monthlyOverhead / avgJobsPerMonth);

    html += '<div style="background:var(--white);border-radius:12px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<div style="padding:16px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;" onclick="JobCosting.toggleOverhead()">'
      + '<h3 style="font-size:15px;margin:0;">Overhead Assumptions</h3>'
      + '<span id="jc-oh-arrow" style="font-size:18px;color:var(--text-light);">▼</span>'
      + '</div>'
      + '<div id="jc-overhead-body" style="display:none;padding:0 20px 20px;">'
      + '<p style="font-size:13px;color:var(--text-light);margin-bottom:14px;">These values are used to estimate your true overhead cost per job.</p>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">'
      + '<div>'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Insurance &amp; WC (% of revenue)</label>'
      + '<input id="oh-insurance" type="number" value="' + ohInsurance + '" min="0" max="100" step="0.5" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;" onchange="JobCosting.saveOverhead(\'bm-oh-insurance\', this.value)">'
      + '</div>'
      + '<div>'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Equipment Depreciation ($/mo)</label>'
      + '<input id="oh-equip" type="number" value="' + ohEquip + '" min="0" step="50" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;" onchange="JobCosting.saveOverhead(\'bm-oh-equip\', this.value)">'
      + '</div>'
      + '<div>'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Vehicle Costs ($/mo)</label>'
      + '<input id="oh-vehicle" type="number" value="' + ohVehicle + '" min="0" step="100" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;" onchange="JobCosting.saveOverhead(\'bm-oh-vehicle\', this.value)">'
      + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:24px;background:var(--bg);padding:14px 16px;border-radius:8px;font-size:13px;">'
      + '<div><span style="color:var(--text-light);">Monthly Overhead Total: </span><strong>' + UI.moneyInt(Math.round(monthlyOverhead)) + '</strong></div>'
      + '<div><span style="color:var(--text-light);">Est. Per-Job Overhead: </span><strong style="color:var(--green-dark);">' + UI.moneyInt(perJobOverhead) + '</strong> <span style="color:var(--text-light);">(' + avgJobsPerMonth + ' jobs/mo avg)</span></div>'
      + '</div>'
      + '</div></div>';

    // --- Horizontal bar chart: last 10 jobs ---
    var chartJobs = costed.slice(0, 10);
    if (chartJobs.length > 0) {
      var maxRevenue = Math.max.apply(null, chartJobs.map(function(j) { return j.revenue || 1; }));
      html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
        + '<h3 style="font-size:16px;margin-bottom:16px;">Profit vs Cost — Last ' + chartJobs.length + ' Jobs</h3>';
      chartJobs.forEach(function(j) {
        var costPct = maxRevenue > 0 ? Math.round(j.totalCost / maxRevenue * 100) : 0;
        var profitPct = maxRevenue > 0 ? Math.max(0, Math.round(j.profit / maxRevenue * 100)) : 0;
        var barColor = j.margin >= 40 ? '#4caf50' : j.margin >= 20 ? '#ff9800' : '#f44336';
        html += '<div style="margin-bottom:12px;">'
          + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">'
          + '<span style="font-weight:600;">' + j.clientName + '</span>'
          + '<span style="color:var(--text-light);">' + UI.money(j.revenue) + ' rev · ' + UI.money(j.totalCost) + ' cost · <strong style="color:' + (j.profit >= 0 ? 'var(--green-dark)' : '#f44336') + ';">' + j.margin + '%</strong></span>'
          + '</div>'
          + '<div style="height:18px;background:var(--bg);border-radius:4px;overflow:hidden;display:flex;">'
          + '<div style="width:' + costPct + '%;background:#ccc;border-radius:4px 0 0 4px;transition:width 0.3s;"></div>'
          + '<div style="width:' + profitPct + '%;background:' + barColor + ';border-radius:0 4px 4px 0;transition:width 0.3s;"></div>'
          + '</div>'
          + '</div>';
      });
      html += '<div style="display:flex;gap:16px;margin-top:8px;font-size:11px;color:var(--text-light);">'
        + '<span><span style="display:inline-block;width:12px;height:12px;background:#ccc;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>Cost</span>'
        + '<span><span style="display:inline-block;width:12px;height:12px;background:#4caf50;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>Profit</span>'
        + '</div>'
        + '</div>';
    }

    // --- Profitability table ---
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<h3 style="font-size:16px;margin-bottom:16px;">Job Profitability Table</h3>'
      + '<table class="data-table"><thead><tr>'
      + '<th>Client</th><th>Job</th><th style="text-align:right;">Revenue</th><th style="text-align:right;">Cost</th><th style="text-align:right;">Profit</th><th style="text-align:right;">Margin</th>'
      + '</tr></thead><tbody>';

    costed.slice(0, 20).forEach(function(j) {
      var marginColor = j.margin >= 40 ? '#4caf50' : j.margin >= 20 ? '#ff9800' : '#f44336';
      html += '<tr style="cursor:pointer;" onclick="JobCosting.showDetail(\'' + j.id + '\')">'
        + '<td><strong>' + j.clientName + '</strong></td>'
        + '<td style="font-size:12px;color:var(--text-light);">' + (j.description || '').substring(0, 30) + '</td>'
        + '<td style="text-align:right;">' + UI.money(j.revenue) + '</td>'
        + '<td style="text-align:right;color:var(--text-light);">' + UI.money(j.totalCost) + '</td>'
        + '<td style="text-align:right;font-weight:600;color:' + (j.profit >= 0 ? 'var(--green-dark)' : 'var(--red)') + ';">' + UI.money(j.profit) + '</td>'
        + '<td style="text-align:right;"><span style="background:' + marginColor + ';color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">' + j.margin + '%</span></td>'
        + '</tr>';
    });

    if (costed.length === 0) {
      html += '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-light);">Complete jobs and track time to see profitability.</td></tr>';
    }
    html += '</tbody></table></div>';

    // --- Tips ---
    html += '<div style="background:var(--green-bg);border-radius:12px;padding:16px;border:1px solid #c8e6c9;font-size:13px;">'
      + '<strong style="color:var(--green-dark);">&#x1f4a1; Profitability Tips:</strong>'
      + '<ul style="margin:8px 0 0;padding-left:20px;color:var(--text-light);line-height:1.8;">'
      + '<li>Track time on EVERY job — even 30-minute stops</li>'
      + '<li>Log fuel, dump fees, and material costs per job</li>'
      + '<li>Target 35-50% profit margin on tree work</li>'
      + '<li>Jobs under 20% margin need pricing adjustment</li>'
      + '</ul></div>';

    return html;
  },

  saveExpense: function() {
    var jobId = (document.getElementById('jc-job-select') || {}).value;
    var category = (document.getElementById('jc-category') || {}).value;
    var amountEl = document.getElementById('jc-amount');
    var amount = parseFloat(amountEl ? amountEl.value : '');

    if (!jobId) { UI.toast('Please select a job.'); return; }
    if (!amount || amount <= 0) { UI.toast('Please enter a valid amount.'); return; }

    var key = 'bm-job-expenses-' + jobId;
    var expenses = JSON.parse(localStorage.getItem(key) || '[]');
    expenses.push({ category: category, amount: amount, date: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(expenses));

    UI.toast('Expense saved — ' + category + ' $' + amount.toFixed(2));
    if (amountEl) amountEl.value = '';
    if (typeof App !== 'undefined' && typeof App.renderPage === 'function') { App.renderPage(); }
  },

  saveOverhead: function(key, value) {
    localStorage.setItem(key, parseFloat(value) || 0);
  },

  toggleOverhead: function() {
    var body = document.getElementById('jc-overhead-body');
    var arrow = document.getElementById('jc-oh-arrow');
    if (!body) return;
    var isHidden = body.style.display === 'none';
    body.style.display = isHidden ? 'block' : 'none';
    if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
  },

  showDetail: function(jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j) return;
    JobsPage.showDetail(jobId);
  }
};
