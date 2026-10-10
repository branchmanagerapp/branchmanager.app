/**
 * Branch Manager — Personal Budget Planner (Dave Ramsey Style)
 * Baby Steps tracker, envelope budgeting, debt snowball
 * Private to each employee — stored in localStorage
 */
var BudgetPage = {
  render: function() {
    var budget = BudgetPage._load();
    var monthlyIncome = parseFloat(localStorage.getItem('bm-my-rate') || '30') * 40 * 4.33; // hourly * 40hrs * 4.33 weeks
    var taxes = (typeof EmployeeCenter !== 'undefined' && EmployeeCenter._calcTaxes) ? EmployeeCenter._calcTaxes(monthlyIncome) : { takeHome: monthlyIncome * 0.72 };
    var takeHome = taxes.takeHome;

    var html = '<div style="text-align:center;margin-bottom:20px;">'
      + '<h2 style="font-size:22px;">📋 Personal Budget</h2>'
      + '<div style="color:var(--text-light);font-size:14px;">Dave Ramsey-Style Financial Planning</div>'
      + '<div style="font-size:13px;color:var(--green-dark);margin-top:4px;">Estimated monthly take-home: <strong>' + UI.money(takeHome) + '</strong></div>'
      + '</div>';

    // Baby Steps Progress
    html += BudgetPage._renderBabySteps(budget);

    // Monthly Budget (Envelope System)
    html += BudgetPage._renderEnvelopes(budget, takeHome);

    // Debt Snowball
    html += BudgetPage._renderDebtSnowball(budget);

    // Savings Goals
    html += BudgetPage._renderSavingsGoals(budget);

    // Monthly Snapshot
    html += BudgetPage._renderMonthlySnapshot(budget, takeHome);

    return html;
  },

  _renderBabySteps: function(budget) {
    var currentStep = budget.babyStep || 1;
    var steps = [
      { num: 1, title: '$1,000 Starter Emergency Fund', desc: 'Save $1,000 as fast as you can', target: 1000 },
      { num: 2, title: 'Pay Off All Debt (Debt Snowball)', desc: 'List debts smallest to largest, attack!', target: 0 },
      { num: 3, title: '3-6 Month Emergency Fund', desc: 'Save 3-6 months of expenses', target: 0 },
      { num: 4, title: 'Invest 15% for Retirement', desc: '15% of gross income into retirement', target: 0 },
      { num: 5, title: 'Save for Kids\' College', desc: 'ESA or 529 plan', target: 0 },
      { num: 6, title: 'Pay Off Home Early', desc: 'Extra mortgage payments', target: 0 },
      { num: 7, title: 'Build Wealth & Give', desc: 'Live and give like no one else!', target: 0 }
    ];

    var html = '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="font-size:16px;margin-bottom:16px;">🎯 Baby Steps</h3>'
      + '<div style="display:flex;gap:4px;margin-bottom:16px;">';

    steps.forEach(function(s) {
      var done = s.num < currentStep;
      var active = s.num === currentStep;
      html += '<div style="flex:1;height:6px;border-radius:3px;background:' + (done ? '#4caf50' : active ? '#ff9800' : '#e0e0e0') + ';"></div>';
    });
    html += '</div>';

    steps.forEach(function(s) {
      var done = s.num < currentStep;
      var active = s.num === currentStep;
      html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;' + (active ? 'background:var(--green-bg);margin:0 -12px;padding:10px 12px;border-radius:8px;' : '') + (s.num > currentStep ? 'opacity:.4;' : '') + '">'
        + '<div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0;'
        + (done ? 'background:#4caf50;color:#fff;' : active ? 'background:var(--green-dark);color:#fff;' : 'background:var(--bg);color:var(--text-light);') + '">'
        + (done ? '✓' : s.num) + '</div>'
        + '<div style="flex:1;"><div style="font-weight:600;font-size:14px;">' + s.title + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);">' + s.desc + '</div></div>'
        + (active ? '<button onclick="BudgetPage.nextStep()" style="background:var(--green-dark);color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">Complete ✓</button>' : '')
        + '</div>';
    });

    html += '</div>';
    return html;
  },

  _renderEnvelopes: function(budget, takeHome) {
    var envelopes = budget.envelopes || [
      { name: 'Housing (Rent/Mortgage)', pct: 25, budgeted: 0, spent: 0 },
      { name: 'Transportation', pct: 10, budgeted: 0, spent: 0 },
      { name: 'Food (Groceries)', pct: 12, budgeted: 0, spent: 0 },
      { name: 'Utilities', pct: 5, budgeted: 0, spent: 0 },
      { name: 'Insurance', pct: 5, budgeted: 0, spent: 0 },
      { name: 'Phone', pct: 3, budgeted: 0, spent: 0 },
      { name: 'Gas/Fuel', pct: 5, budgeted: 0, spent: 0 },
      { name: 'Personal/Clothing', pct: 3, budgeted: 0, spent: 0 },
      { name: 'Entertainment', pct: 3, budgeted: 0, spent: 0 },
      { name: 'Giving/Tithe', pct: 10, budgeted: 0, spent: 0 },
      { name: 'Savings/Emergency', pct: 10, budgeted: 0, spent: 0 },
      { name: 'Debt Payments', pct: 9, budgeted: 0, spent: 0 }
    ];

    // Auto-calculate budgeted amounts from percentages
    envelopes.forEach(function(e) {
      if (!e.budgeted || e.budgeted === 0) e.budgeted = Math.round(takeHome * e.pct / 100);
    });

    var totalBudgeted = envelopes.reduce(function(s, e) { return s + e.budgeted; }, 0);
    var totalSpent = envelopes.reduce(function(s, e) { return s + (e.spent || 0); }, 0);
    var remaining = takeHome - totalBudgeted;

    var html = '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      + '<h3 style="font-size:16px;">✉️ Monthly Budget (Envelopes)</h3>'
      + '<span style="font-size:13px;color:' + (remaining >= 0 ? 'var(--green-dark)' : 'var(--red)') + ';font-weight:600;">' + (remaining >= 0 ? UI.money(remaining) + ' unassigned' : UI.money(Math.abs(remaining)) + ' over budget!') + '</span></div>';

    envelopes.forEach(function(e, idx) {
      var pctUsed = e.budgeted > 0 ? Math.min(100, Math.round((e.spent || 0) / e.budgeted * 100)) : 0;
      var overBudget = (e.spent || 0) > e.budgeted;

      html += '<div style="margin-bottom:10px;">'
        + '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px;">'
        + '<span style="font-weight:600;">' + e.name + '</span>'
        + '<span><span style="color:' + (overBudget ? 'var(--red)' : 'var(--text-light)') + ';">' + UI.money(e.spent || 0) + '</span> / ' + UI.money(e.budgeted) + '</span></div>'
        + '<div style="height:6px;background:var(--bg);border-radius:3px;overflow:hidden;">'
        + '<div style="height:100%;width:' + pctUsed + '%;background:' + (overBudget ? '#f44336' : pctUsed > 80 ? '#ff9800' : '#4caf50') + ';border-radius:3px;"></div></div></div>';
    });

    html += '<div style="display:flex;gap:8px;margin-top:12px;">'
      + '<button onclick="BudgetPage.editEnvelopes()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">✏️ Edit Budget</button>'
      + '<button onclick="BudgetPage.logSpending()" style="background:#1565c0;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">💸 Log Spending</button>'
      + '<button onclick="BudgetPage.resetMonth()" style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 16px;font-size:12px;cursor:pointer;">🔄 New Month</button>'
      + '</div></div>';

    return html;
  },

  _renderDebtSnowball: function(budget) {
    var debts = budget.debts || [];

    var html = '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<h3 style="font-size:16px;">⛄ Debt Snowball</h3>'
      + '<button onclick="BudgetPage.addDebt()" style="background:var(--green-dark);color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">+ Add Debt</button></div>'
      + '<p style="font-size:12px;color:var(--text-light);margin-bottom:12px;">List smallest to largest. Pay minimums on everything, throw all extra at the smallest debt.</p>';

    if (debts.length) {
      var totalDebt = debts.reduce(function(s, d) { return s + (d.balance || 0); }, 0);
      var totalMin = debts.reduce(function(s, d) { return s + (d.minimum || 0); }, 0);
      var totalPaid = debts.reduce(function(s, d) { return s + (d.originalBalance - d.balance); }, 0);

      html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;text-align:center;">'
        + '<div style="padding:10px;background:#fde8e8;border-radius:8px;"><div style="font-size:11px;color:var(--text-light);">Total Debt</div><div style="font-size:18px;font-weight:700;color:var(--red);">' + UI.moneyInt(totalDebt) + '</div></div>'
        + '<div style="padding:10px;background:var(--green-bg);border-radius:8px;"><div style="font-size:11px;color:var(--text-light);">Paid Off</div><div style="font-size:18px;font-weight:700;color:var(--green-dark);">' + UI.moneyInt(totalPaid) + '</div></div>'
        + '<div style="padding:10px;background:var(--bg);border-radius:8px;"><div style="font-size:11px;color:var(--text-light);">Monthly Min</div><div style="font-size:18px;font-weight:700;">' + UI.money(totalMin) + '</div></div></div>';

      debts.sort(function(a, b) { return a.balance - b.balance; });
      debts.forEach(function(d, idx) {
        var pctPaid = d.originalBalance > 0 ? Math.round((d.originalBalance - d.balance) / d.originalBalance * 100) : 0;
        var isTarget = idx === 0 && d.balance > 0; // Smallest balance = current target
        html += '<div style="padding:10px;background:' + (d.balance <= 0 ? '#e8f5e9' : isTarget ? '#fff3e0' : 'var(--bg)') + ';border-radius:8px;margin-bottom:6px;' + (isTarget ? 'border:2px solid #ff9800;' : '') + '">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;">'
          + '<div><strong style="font-size:14px;">' + (d.balance <= 0 ? '✅ ' : isTarget ? '🎯 ' : '') + d.name + '</strong>'
          + '<div style="font-size:12px;color:var(--text-light);">Min: ' + UI.money(d.minimum) + '/mo' + (d.rate ? ' · ' + d.rate + '% APR' : '') + '</div></div>'
          + '<div style="text-align:right;"><div style="font-weight:700;' + (d.balance <= 0 ? 'color:var(--green-dark);' : 'color:var(--red);') + '">' + UI.money(d.balance) + '</div>'
          + '<div style="font-size:11px;color:var(--text-light);">' + pctPaid + '% paid off</div></div></div>'
          + '<div style="height:6px;background:#e0e0e0;border-radius:3px;margin-top:6px;overflow:hidden;">'
          + '<div style="height:100%;width:' + pctPaid + '%;background:' + (d.balance <= 0 ? '#4caf50' : '#ff9800') + ';border-radius:3px;"></div></div></div>';
      });
    } else {
      html += '<div style="text-align:center;padding:20px;color:var(--text-light);font-size:13px;border:2px dashed var(--border);border-radius:8px;">No debts listed. Debt-free! 🎉</div>';
    }
    html += '</div>';
    return html;
  },

  _renderSavingsGoals: function(budget) {
    var goals = budget.savingsGoals || [];
    var html = '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<h3 style="font-size:16px;">🎯 Savings Goals</h3>'
      + '<button onclick="BudgetPage.addGoal()" style="background:var(--green-dark);color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">+ Add Goal</button></div>';

    if (goals.length) {
      goals.forEach(function(g) {
        var pct = g.target > 0 ? Math.min(100, Math.round(g.saved / g.target * 100)) : 0;
        html += '<div style="margin-bottom:12px;">'
          + '<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px;">'
          + '<strong>' + g.name + '</strong>'
          + '<span>' + UI.money(g.saved) + ' / ' + UI.money(g.target) + '</span></div>'
          + '<div style="height:8px;background:var(--bg);border-radius:4px;overflow:hidden;">'
          + '<div style="height:100%;width:' + pct + '%;background:' + (pct >= 100 ? '#4caf50' : '#2196f3') + ';border-radius:4px;"></div></div></div>';
      });
    } else {
      html += '<div style="text-align:center;padding:16px;color:var(--text-light);font-size:13px;">No savings goals yet. What are you saving for?</div>';
    }
    html += '</div>';
    return html;
  },

  _renderMonthlySnapshot: function(budget, takeHome) {
    var envelopes = budget.envelopes || [];
    var totalBudgeted = envelopes.reduce(function(s, e) { return s + (e.budgeted || 0); }, 0);
    var unassigned = takeHome - totalBudgeted;
    var budgetedPct = takeHome > 0 ? Math.min(100, Math.round(totalBudgeted / takeHome * 100)) : 0;

    var html = '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<h3 style="font-size:16px;">📅 Monthly Snapshot</h3>'
      + '<button onclick="BudgetPage.startNewMonth()" style="background:var(--green-dark);color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">+ Start New Month</button></div>';

    // Summary line
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;text-align:center;">'
      + '<div style="padding:10px;background:var(--green-bg);border-radius:8px;"><div style="font-size:11px;color:var(--text-light);">Take-Home</div><div style="font-size:18px;font-weight:700;color:var(--green-dark);">' + UI.moneyInt(takeHome) + '</div></div>'
      + '<div style="padding:10px;background:var(--bg);border-radius:8px;"><div style="font-size:11px;color:var(--text-light);">Budgeted</div><div style="font-size:18px;font-weight:700;">' + UI.moneyInt(totalBudgeted) + '</div></div>'
      + '<div style="padding:10px;background:' + (unassigned < 0 ? '#fde8e8' : '#e8f5e9') + ';border-radius:8px;"><div style="font-size:11px;color:var(--text-light);">Unassigned</div><div style="font-size:18px;font-weight:700;color:' + (unassigned < 0 ? 'var(--red)' : 'var(--green-dark)') + ';">' + UI.moneyInt(unassigned) + '</div></div>'
      + '</div>';

    // Income vs budgeted bar
    html += '<div style="margin-bottom:6px;">'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-light);margin-bottom:4px;">'
      + '<span>Income vs Budgeted</span><span>' + budgetedPct + '% assigned</span></div>'
      + '<div style="height:10px;background:var(--bg);border-radius:5px;overflow:hidden;">'
      + '<div style="height:100%;width:' + budgetedPct + '%;background:' + (budgetedPct > 100 ? '#f44336' : budgetedPct > 90 ? '#ff9800' : '#4caf50') + ';border-radius:5px;transition:width .3s;"></div></div>'
      + '</div>';

    html += '</div>';
    return html;
  },

  // Data management
  _load: function() {
    try { return JSON.parse(localStorage.getItem('bm-budget') || '{}'); } catch(e) { return {}; }
  },
  _save: function(budget) {
    localStorage.setItem('bm-budget', JSON.stringify(budget));
  },

  nextStep: function() {
    var budget = BudgetPage._load();
    budget.babyStep = (budget.babyStep || 1) + 1;
    BudgetPage._save(budget);
    UI.toast('Baby Step ' + (budget.babyStep - 1) + ' complete! 🎉');
    loadPage('budget');
  },

  addDebt: function() {
    var html = '<form id="debt-form" onsubmit="BudgetPage.saveDebt(event)">'
      + UI.formField('Debt Name', 'text', 'debt-name', '', { placeholder: 'e.g., Visa card, Car loan' })
      + UI.formField('Current Balance ($)', 'number', 'debt-balance', '', { placeholder: '2500' })
      + UI.formField('Minimum Payment ($/mo)', 'number', 'debt-min', '', { placeholder: '75' })
      + UI.formField('Interest Rate (%)', 'number', 'debt-rate', '', { placeholder: '18.9' })
      + '</form>';
    UI.showModal('Add Debt', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="document.getElementById(\'debt-form\').requestSubmit()">Add Debt</button>'
    });
  },

  saveDebt: function(e) {
    e.preventDefault();
    var budget = BudgetPage._load();
    if (!budget.debts) budget.debts = [];
    var balance = parseFloat(document.getElementById('debt-balance').value) || 0;
    budget.debts.push({
      name: document.getElementById('debt-name').value,
      balance: balance,
      originalBalance: balance,
      minimum: parseFloat(document.getElementById('debt-min').value) || 0,
      rate: parseFloat(document.getElementById('debt-rate').value) || 0
    });
    BudgetPage._save(budget);
    UI.closeModal();
    UI.toast('Debt added to snowball');
    loadPage('budget');
  },

  addGoal: function() {
    var html = '<form id="goal-form" onsubmit="BudgetPage.saveGoal(event)">'
      + UI.formField('Goal Name', 'text', 'goal-name', '', { placeholder: 'e.g., Emergency fund, Vacation' })
      + UI.formField('Target Amount ($)', 'number', 'goal-target', '', { placeholder: '5000' })
      + UI.formField('Saved So Far ($)', 'number', 'goal-saved', '', { placeholder: '500' })
      + '</form>';
    UI.showModal('Add Savings Goal', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="document.getElementById(\'goal-form\').requestSubmit()">Add Goal</button>'
    });
  },

  saveGoal: function(e) {
    e.preventDefault();
    var budget = BudgetPage._load();
    if (!budget.savingsGoals) budget.savingsGoals = [];
    budget.savingsGoals.push({
      name: document.getElementById('goal-name').value,
      target: parseFloat(document.getElementById('goal-target').value) || 0,
      saved: parseFloat(document.getElementById('goal-saved').value) || 0
    });
    BudgetPage._save(budget);
    UI.closeModal();
    UI.toast('Savings goal added!');
    loadPage('budget');
  },

  editEnvelopes: function() {
    var budget = BudgetPage._load();
    var envelopes = budget.envelopes && budget.envelopes.length ? budget.envelopes : [
      { name: 'Housing (Rent/Mortgage)', pct: 25, budgeted: 0, spent: 0 },
      { name: 'Transportation', pct: 10, budgeted: 0, spent: 0 },
      { name: 'Food (Groceries)', pct: 12, budgeted: 0, spent: 0 },
      { name: 'Utilities', pct: 5, budgeted: 0, spent: 0 },
      { name: 'Insurance', pct: 5, budgeted: 0, spent: 0 },
      { name: 'Phone', pct: 3, budgeted: 0, spent: 0 },
      { name: 'Gas/Fuel', pct: 5, budgeted: 0, spent: 0 },
      { name: 'Personal/Clothing', pct: 3, budgeted: 0, spent: 0 },
      { name: 'Entertainment', pct: 3, budgeted: 0, spent: 0 },
      { name: 'Giving/Tithe', pct: 10, budgeted: 0, spent: 0 },
      { name: 'Savings/Emergency', pct: 10, budgeted: 0, spent: 0 },
      { name: 'Debt Payments', pct: 9, budgeted: 0, spent: 0 }
    ];

    var html = '<div id="env-edit-container">';
    html += '<div style="font-size:12px;color:var(--text-light);margin-bottom:12px;">Adjust your envelope names, percentages, and budgets. Percentages auto-calculate amounts based on your take-home pay.</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 60px 100px 40px;gap:6px;margin-bottom:6px;font-size:11px;color:var(--text-light);font-weight:600;">'
      + '<div>Category</div><div>%</div><div>Monthly $</div><div></div></div>';

    envelopes.forEach(function(e) {
      html += '<div class="env-row" style="display:grid;grid-template-columns:1fr 60px 100px 40px;gap:6px;margin-bottom:4px;">'
        + '<input class="env-name" type="text" value="' + e.name + '" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;">'
        + '<input class="env-pct" type="number" value="' + e.pct + '" min="0" max="100" style="padding:6px;border:1px solid var(--border);border-radius:6px;font-size:13px;">'
        + '<input class="env-budget" type="number" value="' + (e.budgeted || 0) + '" style="padding:6px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-weight:700;">'
        + '<button onclick="this.closest(\'.env-row\').remove()" style="background:#fde8e8;border:none;border-radius:6px;cursor:pointer;font-size:16px;color:#c62828;">×</button>'
        + '</div>';
    });

    html += '</div>'
      + '<button onclick="BudgetPage._addEnvRow()" style="background:var(--bg);border:1px dashed var(--border);border-radius:6px;padding:8px;width:100%;cursor:pointer;font-size:13px;color:var(--text-light);margin-top:4px;">+ Add Category</button>';

    UI.showModal('Edit Budget Envelopes', html, {
      wide: true,
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="BudgetPage._saveEnvelopes()">Save Envelopes</button>'
    });
  },

  _addEnvRow: function() {
    var container = document.getElementById('env-edit-container');
    var row = document.createElement('div');
    row.className = 'env-row';
    row.style.cssText = 'display:grid;grid-template-columns:1fr 60px 100px 40px;gap:6px;margin-bottom:4px;';
    row.innerHTML = '<input class="env-name" type="text" placeholder="Category name" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;">'
      + '<input class="env-pct" type="number" value="0" min="0" max="100" style="padding:6px;border:1px solid var(--border);border-radius:6px;font-size:13px;">'
      + '<input class="env-budget" type="number" value="0" style="padding:6px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-weight:700;">'
      + '<button onclick="this.closest(\'.env-row\').remove()" style="background:#fde8e8;border:none;border-radius:6px;cursor:pointer;font-size:16px;color:#c62828;">×</button>';
    container.insertBefore(row, container.lastElementChild);
  },

  _saveEnvelopes: function() {
    var rows = document.querySelectorAll('.env-row');
    var budget = BudgetPage._load();
    var existing = budget.envelopes || [];
    budget.envelopes = [];
    rows.forEach(function(row) {
      var name = row.querySelector('.env-name').value.trim();
      var pct = parseFloat(row.querySelector('.env-pct').value) || 0;
      var budgeted = parseFloat(row.querySelector('.env-budget').value) || 0;
      var prev = existing.find(function(e) { return e.name === name; }) || {};
      if (name) budget.envelopes.push({ name: name, pct: pct, budgeted: budgeted, spent: prev.spent || 0 });
    });
    BudgetPage._save(budget);
    UI.closeModal();
    UI.toast('Envelopes saved!');
    loadPage('budget');
  },

  logSpending: function() {
    var budget = BudgetPage._load();
    // Initialize default envelopes if none exist
    if (!budget.envelopes || !budget.envelopes.length) {
      budget.envelopes = [
        { name: 'Housing (Rent/Mortgage)', pct: 25, budgeted: 0, spent: 0 },
        { name: 'Transportation', pct: 10, budgeted: 0, spent: 0 },
        { name: 'Food (Groceries)', pct: 12, budgeted: 0, spent: 0 },
        { name: 'Utilities', pct: 5, budgeted: 0, spent: 0 },
        { name: 'Insurance', pct: 5, budgeted: 0, spent: 0 },
        { name: 'Phone', pct: 3, budgeted: 0, spent: 0 },
        { name: 'Gas/Fuel', pct: 5, budgeted: 0, spent: 0 },
        { name: 'Personal/Clothing', pct: 3, budgeted: 0, spent: 0 },
        { name: 'Entertainment', pct: 3, budgeted: 0, spent: 0 },
        { name: 'Giving/Tithe', pct: 10, budgeted: 0, spent: 0 },
        { name: 'Savings/Emergency', pct: 10, budgeted: 0, spent: 0 },
        { name: 'Debt Payments', pct: 9, budgeted: 0, spent: 0 }
      ];
      BudgetPage._save(budget);
    }
    var options = budget.envelopes.map(function(e) { return e.name; });

    var html = '<form id="spend-form" onsubmit="BudgetPage.saveSpending(event)">'
      + UI.formField('Category', 'select', 'spend-cat', '', { options: [''].concat(options) })
      + UI.formField('Amount ($)', 'number', 'spend-amt', '', { placeholder: '45.00' })
      + UI.formField('Note', 'text', 'spend-note', '', { placeholder: 'Groceries at ShopRite' })
      + '</form>';
    UI.showModal('Log Spending', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="document.getElementById(\'spend-form\').requestSubmit()">Log</button>'
    });
  },

  saveSpending: function(e) {
    e.preventDefault();
    var cat = document.getElementById('spend-cat').value;
    var amt = parseFloat(document.getElementById('spend-amt').value) || 0;
    var budget = BudgetPage._load();
    if (!budget.envelopes) return;
    var env = budget.envelopes.find(function(e) { return e.name === cat; });
    if (env) {
      env.spent = (env.spent || 0) + amt;
      BudgetPage._save(budget);
      UI.toast(UI.money(amt) + ' logged to ' + cat);
    }
    UI.closeModal();
    loadPage('budget');
  },

  resetMonth: function() {
    if (!confirm('Reset all spending to $0 for a new month?')) return;
    var budget = BudgetPage._load();
    if (budget.envelopes) {
      budget.envelopes.forEach(function(e) { e.spent = 0; });
      BudgetPage._save(budget);
    }
    UI.toast('Budget reset for new month!');
    loadPage('budget');
  },

  startNewMonth: function() {
    var budget = BudgetPage._load();
    if (budget.envelopes) {
      budget.envelopes.forEach(function(e) { e.spent = 0; });
      BudgetPage._save(budget);
    }
    UI.toast('New month started — spending reset to $0!');
    loadPage('budget');
  }
};
