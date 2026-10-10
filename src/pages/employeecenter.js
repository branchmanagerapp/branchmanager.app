/**
 * Branch Manager — Employee Center
 * Personal dashboard for crew members:
 * - Hours worked this week/month/year
 * - Weekly hours goal with progress bar
 * - Overtime tracking (1.5x for hours over 40)
 * - Estimated pay & tax withholdings
 * - PTO / Time-off tracker
 * - Annual projections
 * - Personal budget planner link
 */
var EmployeeCenter = {
  render: function() {
    var userName = (typeof Auth !== 'undefined' && Auth.user) ? Auth.user.name : 'Employee';
    var entries = JSON.parse(localStorage.getItem('bm-time-entries') || '[]')
      .filter(function(e) { return e.user === userName; });

    var now = new Date();
    var weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    var yearStart = new Date(now.getFullYear(), 0, 1);

    var weekHours = EmployeeCenter._sumHours(entries, weekStart);
    var monthHours = EmployeeCenter._sumHours(entries, monthStart);
    var yearHours = EmployeeCenter._sumHours(entries, yearStart);

    // Pay settings
    var hourlyRate = parseFloat(localStorage.getItem('bm-my-rate') || '30');

    // Overtime calculation
    var otHours = Math.max(0, weekHours - 40);
    var regHours = Math.min(40, weekHours);
    var regPay = regHours * hourlyRate;
    var otPay = otHours * hourlyRate * 1.5;
    var weekPay = regPay + otPay;
    var monthPay = monthHours * hourlyRate; // full months use simple rate
    var yearPay = yearHours * hourlyRate;

    // Weekly hours goal
    var hoursGoal = parseFloat(localStorage.getItem('bm-hours-goal') || '40');
    var goalPct = Math.min(100, weekHours / hoursGoal * 100);
    var goalBarColor = weekHours > 40 ? 'var(--red)' : (goalPct >= 100 ? 'var(--green-dark)' : 'var(--green-dark)');

    var html = '<div style="text-align:center;margin-bottom:20px;">'
      + '<h2 style="font-size:22px;">👤 ' + userName + '</h2>'
      + '<div style="color:var(--text-light);font-size:14px;">Employee Dashboard</div></div>';

    // Stats
    html += '<div class="stat-grid">'
      + UI.statCard('This Week', weekHours.toFixed(1) + ' hrs', UI.money(weekPay) + ' gross' + (otHours > 0 ? ' (OT)' : ''), '', '')
      + UI.statCard('This Month', monthHours.toFixed(1) + ' hrs', UI.money(monthPay) + ' gross', '', '')
      + UI.statCard('Year to Date', yearHours.toFixed(1) + ' hrs', UI.money(yearPay) + ' gross', '', '')
      + UI.statCard('Hourly Rate', UI.money(hourlyRate), '<a href="#" onclick="EmployeeCenter.setRate();return false;" style="color:var(--green-dark);">Change</a>', '', '')
      + '</div>';

    // Weekly hours goal progress bar
    html += '<div style="background:var(--white);border-radius:12px;padding:16px 20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      + '<h3 style="font-size:15px;margin:0;">🎯 Weekly Hours Goal</h3>'
      + '<div style="display:flex;gap:8px;align-items:center;">'
      + '<span style="font-size:13px;color:var(--text-light);">' + weekHours.toFixed(1) + ' / ' + hoursGoal.toFixed(0) + ' hrs</span>'
      + '<button onclick="EmployeeCenter.setGoal()" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:var(--bg);">Set Goal</button>'
      + '</div></div>'
      + '<div style="background:#f0f0f0;border-radius:8px;height:14px;overflow:hidden;">'
      + '<div style="height:100%;width:' + goalPct.toFixed(1) + '%;background:' + (weekHours > 40 ? 'var(--red)' : 'var(--green-dark)') + ';border-radius:8px;transition:width .3s;"></div></div>'
      + '<div style="font-size:11px;color:var(--text-light);margin-top:4px;text-align:right;">' + goalPct.toFixed(0) + '% of goal'
      + (weekHours > 40 ? ' — <span style="color:var(--red);font-weight:700;">Overtime!</span>' : '') + '</div>'
      + '</div>';

    // Paycheck estimator
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="font-size:16px;margin-bottom:16px;">💰 Paycheck Estimator</h3>';

    var taxes = EmployeeCenter._calcTaxes(monthPay);
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div style="padding:16px;background:var(--green-bg);border-radius:10px;text-align:center;">'
      + '<div style="font-size:12px;color:var(--text-light);">Monthly Gross</div>'
      + '<div style="font-size:28px;font-weight:800;color:var(--green-dark);">' + UI.money(monthPay) + '</div></div>'
      + '<div style="padding:16px;background:#e3f2fd;border-radius:10px;text-align:center;">'
      + '<div style="font-size:12px;color:var(--text-light);">Estimated Take-Home</div>'
      + '<div style="font-size:28px;font-weight:800;color:#1565c0;">' + UI.money(taxes.takeHome) + '</div></div>'
      + '</div>';

    // Overtime breakdown (only show if there are hours this week)
    if (weekHours > 0) {
      var otBg = otHours > 0 ? '#fff3e0' : 'var(--bg)';
      var otBorder = otHours > 0 ? '#ffe0b2' : 'var(--border)';
      html += '<div style="margin-top:12px;padding:12px;background:' + otBg + ';border:1px solid ' + otBorder + ';border-radius:10px;">'
        + '<h4 style="font-size:13px;margin:0 0 8px 0;' + (otHours > 0 ? 'color:#e65100;' : '') + '">⏱ This Week Breakdown</h4>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;">'
        + '<div><div style="font-size:11px;color:var(--text-light);">Regular (' + regHours.toFixed(1) + ' hrs)</div>'
        + '<div style="font-size:16px;font-weight:700;">' + UI.money(regPay) + '</div></div>'
        + '<div><div style="font-size:11px;color:' + (otHours > 0 ? '#e65100' : 'var(--text-light)') + ';">OT (' + otHours.toFixed(1) + ' hrs @ 1.5x)</div>'
        + '<div style="font-size:16px;font-weight:700;color:' + (otHours > 0 ? '#e65100' : 'var(--text-light)') + ';">' + UI.money(otPay) + '</div></div>'
        + '<div><div style="font-size:11px;color:var(--text-light);">Total Gross</div>'
        + '<div style="font-size:16px;font-weight:800;color:var(--green-dark);">' + UI.money(weekPay) + '</div></div>'
        + '</div></div>';
    }

    // Tax breakdown
    html += '<div style="margin-top:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="var el=document.getElementById(\'tax-detail\');el.style.display=el.style.display===\'none\'?\'block\':\'none\';">'
      + '<h4 style="font-size:14px;">Tax Withholdings Breakdown</h4><span style="color:var(--text-light);">▶</span></div>'
      + '<div id="tax-detail" style="display:none;margin-top:8px;">';

    var taxItems = [
      { label: 'Federal Income Tax (est. 12%)', amount: taxes.federal },
      { label: 'Social Security (6.2%)', amount: taxes.ss },
      { label: 'Medicare (1.45%)', amount: taxes.medicare },
      { label: 'NY State Income Tax (est. 5.5%)', amount: taxes.state },
      { label: 'NY Disability (0.5%)', amount: taxes.disability },
      { label: 'NY Paid Family Leave (0.455%)', amount: taxes.pfl }
    ];
    taxItems.forEach(function(t) {
      html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">'
        + '<span>' + t.label + '</span>'
        + '<span style="font-weight:600;color:var(--red);">-' + UI.money(t.amount) + '</span></div>';
    });
    html += '<div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:700;font-size:15px;border-top:2px solid var(--border);margin-top:4px;">'
      + '<span>Total Taxes</span><span style="color:var(--red);">-' + UI.money(taxes.totalTax) + ' (' + taxes.effectiveRate + '%)</span></div>'
      + '<div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:700;font-size:15px;color:var(--green-dark);">'
      + '<span>Take-Home Pay</span><span>' + UI.money(taxes.takeHome) + '</span></div>'
      + '</div></div></div>';

    // PTO / Time-off tracker
    var ptoKey = 'bm-pto-' + userName.toLowerCase().replace(/\s+/g, '-');
    var ptoAll = [];
    try { ptoAll = JSON.parse(localStorage.getItem(ptoKey)) || []; } catch(e) {}
    var ptoYear = ptoAll.filter(function(p) { return new Date(p.date) >= yearStart; });
    var ptoHours = ptoYear.reduce(function(s, p) { return s + (p.hours || 0); }, 0);
    var sickHours = ptoYear.filter(function(p) { return p.type === 'Sick'; }).reduce(function(s, p) { return s + (p.hours || 0); }, 0);
    var holidayHours = ptoYear.filter(function(p) { return p.type === 'Holiday'; }).reduce(function(s, p) { return s + (p.hours || 0); }, 0);

    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'
      + '<h3 style="font-size:16px;margin:0;">🏖️ Time Off This Year</h3>'
      + '<button onclick="EmployeeCenter.logTimeOff()" style="background:var(--green-dark);color:#fff;border:none;padding:7px 12px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">+ Log Time Off</button>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">'
      + '<div style="padding:10px;background:var(--green-bg);border-radius:8px;text-align:center;"><div style="font-size:11px;color:var(--text-light);">Total PTO</div><div style="font-size:20px;font-weight:800;color:var(--green-dark);">' + ptoHours.toFixed(1) + ' hrs</div></div>'
      + '<div style="padding:10px;background:#fff3e0;border-radius:8px;text-align:center;"><div style="font-size:11px;color:var(--text-light);">Sick Days</div><div style="font-size:20px;font-weight:800;color:#e65100;">' + sickHours.toFixed(1) + ' hrs</div></div>'
      + '<div style="padding:10px;background:#e3f2fd;border-radius:8px;text-align:center;"><div style="font-size:11px;color:var(--text-light);">Holidays</div><div style="font-size:20px;font-weight:800;color:#1565c0;">' + holidayHours.toFixed(1) + ' hrs</div></div>'
      + '</div>';

    if (ptoYear.length) {
      html += '<div style="font-size:13px;font-weight:600;color:var(--text-light);margin-bottom:6px;">Recent</div>';
      ptoYear.slice(-5).reverse().forEach(function(p) {
        var typeColors = { PTO: 'var(--green-dark)', Sick: '#e65100', Holiday: '#1565c0', Personal: '#6a1b9a' };
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">'
          + '<span>' + UI.dateShort(p.date) + ' — ' + (p.notes || p.type) + '</span>'
          + '<span style="font-weight:700;color:' + (typeColors[p.type] || 'var(--text)') + ';">' + p.hours + ' hrs ' + p.type + '</span>'
          + '</div>';
      });
    } else {
      html += '<div style="text-align:center;padding:12px;color:var(--text-light);font-size:13px;">No time off logged yet this year.</div>';
    }
    html += '</div>';

    // Recent time entries
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="font-size:16px;margin-bottom:12px;">⏱ Recent Time Entries</h3>';
    if (entries.length) {
      entries.slice(0, 14).forEach(function(e) {
        html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">'
          + '<span>' + UI.dateShort(e.date) + (e.jobId ? ' — Job' : '') + '</span>'
          + '<span style="font-weight:600;">' + (e.hours || 0).toFixed(1) + ' hrs</span></div>';
      });
    } else {
      html += '<div style="text-align:center;padding:20px;color:var(--text-light);font-size:13px;">No time entries yet. Clock in from the Crew View!</div>';
    }
    html += '</div>';

    // Annual projections
    var weeksWorked = Math.max(1, Math.ceil((now - yearStart) / (7 * 86400000)));
    var avgWeeklyHours = yearHours / weeksWorked;
    var projectedAnnual = avgWeeklyHours * 52 * hourlyRate;
    var annualTaxes = EmployeeCenter._calcTaxes(projectedAnnual);

    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="font-size:16px;margin-bottom:12px;">📊 Annual Projection</h3>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;">'
      + '<div style="padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:11px;color:var(--text-light);">Avg Weekly Hours</div><div style="font-size:18px;font-weight:700;">' + avgWeeklyHours.toFixed(1) + '</div></div>'
      + '<div style="padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:11px;color:var(--text-light);">Projected Gross</div><div style="font-size:18px;font-weight:700;">' + UI.moneyInt(projectedAnnual) + '</div></div>'
      + '<div style="padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:11px;color:var(--text-light);">Projected Net</div><div style="font-size:18px;font-weight:700;">' + UI.moneyInt(annualTaxes.takeHome) + '</div></div>'
      + '</div></div>';

    // Budget planner link
    html += '<button onclick="loadPage(\'budget\')" style="width:100%;padding:16px;background:var(--green-dark);color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;">📋 Open Personal Budget Planner</button>';

    return html;
  },

  _sumHours: function(entries, since) {
    return entries.filter(function(e) { return new Date(e.date) >= since; })
      .reduce(function(s, e) { return s + (e.hours || 0); }, 0);
  },

  _calcTaxes: function(gross) {
    var federal = gross * 0.12;
    var ss = gross * 0.062;
    var medicare = gross * 0.0145;
    var state = gross * 0.055;
    var disability = gross * 0.005;
    var pfl = gross * 0.00455;
    var totalTax = federal + ss + medicare + state + disability + pfl;
    return {
      federal: federal, ss: ss, medicare: medicare, state: state,
      disability: disability, pfl: pfl,
      totalTax: totalTax,
      takeHome: gross - totalTax,
      effectiveRate: gross > 0 ? (totalTax / gross * 100).toFixed(1) : '0'
    };
  },

  setRate: function() {
    var rate = prompt('Enter your hourly rate ($):', localStorage.getItem('bm-my-rate') || '30');
    if (rate !== null && !isNaN(parseFloat(rate))) {
      localStorage.setItem('bm-my-rate', parseFloat(rate));
      UI.toast('Rate updated to $' + parseFloat(rate) + '/hr');
      loadPage('employeecenter');
    }
  },

  setGoal: function() {
    var goal = prompt('Set weekly hours goal:', localStorage.getItem('bm-hours-goal') || '40');
    if (goal !== null && !isNaN(parseFloat(goal)) && parseFloat(goal) > 0) {
      localStorage.setItem('bm-hours-goal', parseFloat(goal));
      UI.toast('Weekly goal set to ' + parseFloat(goal) + ' hrs');
      loadPage('employeecenter');
    }
  },

  logTimeOff: function() {
    var today = new Date().toISOString().split('T')[0];
    var html = '<div style="display:grid;gap:12px;padding:4px 0;">'
      + '<div><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Date</label>'
      + '<input type="date" id="pto-date" value="' + today + '" style="width:100%;padding:8px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Hours</label>'
      + '<input type="number" id="pto-hours" value="8" min="0.5" step="0.5" style="width:100%;padding:8px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Type</label>'
      + '<select id="pto-type" style="width:100%;padding:8px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '<option value="PTO">PTO</option><option value="Sick">Sick</option><option value="Holiday">Holiday</option><option value="Personal">Personal</option>'
      + '</select></div>'
      + '<div><label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Notes (optional)</label>'
      + '<input type="text" id="pto-notes" placeholder="e.g. Doctor appointment" style="width:100%;padding:8px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<button onclick="EmployeeCenter._saveTimeOff()" style="background:var(--green-dark);color:#fff;border:none;padding:12px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;width:100%;">Save Time Off</button>'
      + '</div>';
    UI.showModal('Log Time Off', html);
  },

  _saveTimeOff: function() {
    var date = document.getElementById('pto-date') ? document.getElementById('pto-date').value : '';
    var hours = parseFloat(document.getElementById('pto-hours') ? document.getElementById('pto-hours').value : '0');
    var type = document.getElementById('pto-type') ? document.getElementById('pto-type').value : 'PTO';
    var notes = document.getElementById('pto-notes') ? document.getElementById('pto-notes').value.trim() : '';

    if (!date || isNaN(hours) || hours <= 0) {
      UI.toast('Please enter a valid date and hours');
      return;
    }

    var userName = (typeof Auth !== 'undefined' && Auth.user) ? Auth.user.name : 'Employee';
    var key = 'bm-pto-' + userName.toLowerCase().replace(/\s+/g, '-');
    var all = [];
    try { all = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
    all.push({ id: Date.now().toString(36), date: date, hours: hours, type: type, notes: notes });
    localStorage.setItem(key, JSON.stringify(all));
    UI.closeModal();
    UI.toast(type + ' logged — ' + hours + ' hrs');
    loadPage('employeecenter');
  }
};
