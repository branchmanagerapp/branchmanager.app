/**
 * Branch Manager — Expense Tracking
 * Track business costs, receipts, and monthly P&L
 */
var ExpensesPage = {
  _viewMonth: undefined,
  _viewYear: undefined,

  _categories: [
    { key: 'fuel', label: 'Fuel', icon: '⛽' },
    { key: 'equipment', label: 'Equipment', icon: '🔧' },
    { key: 'insurance', label: 'Insurance', icon: '🛡️' },
    { key: 'vehicle', label: 'Vehicle', icon: '🚛' },
    { key: 'supplies', label: 'Supplies', icon: '🪚' },
    { key: 'labor', label: 'Labor/Payroll', icon: '👷' },
    { key: 'office', label: 'Office/Admin', icon: '📎' },
    { key: 'marketing', label: 'Marketing', icon: '📣' },
    { key: 'other', label: 'Other', icon: '📋' }
  ],

  render: function() {
    var expenses = DB.expenses ? DB.expenses.getAll() : [];
    var now = new Date();
    var thisMonth = expenses.filter(function(e) {
      return new Date(e.date).getMonth() === now.getMonth() && new Date(e.date).getFullYear() === now.getFullYear();
    });
    var totalThisMonth = thisMonth.reduce(function(s, e) { return s + (e.amount || 0); }, 0);
    var totalAllTime = expenses.reduce(function(s, e) { return s + (e.amount || 0); }, 0);

    var categories = ExpensesPage._categories;

    var html = '<div class="stat-grid">'
      + UI.statCard('This Month', UI.moneyInt(totalThisMonth), thisMonth.length + ' variable expenses', '', '', '')
      + UI.statCard('Fixed Monthly', UI.moneyInt(ExpensesPage._getFixedCosts()), 'Truck, insurance, etc.', '', '', '')
      + UI.statCard('Total Monthly', UI.moneyInt(totalThisMonth + ExpensesPage._getFixedCosts()), 'Variable + fixed', '', '', '')
      + UI.statCard('All Time', UI.moneyInt(totalAllTime), expenses.length + ' expenses logged', '', '', '')
      + '</div>';

    // v690: Header row with Jobber import button next to title.
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">'
      + '<h2 style="margin:0;font-size:22px;font-weight:800;">Expenses</h2>'
      + '<div style="display:flex;gap:8px;">'
      +   '<button onclick="ExpensesPage.showJobberImport()" class="btn btn-outline" style="font-size:12px;">Import from Jobber CSV</button>'
      + '</div>'
      + '</div>';

    // Add expense form — 7 columns: date, amount, category, description, vendor, job, button
    var todayStr = new Date().toISOString().split('T')[0];
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<h3 style="font-size:15px;margin-bottom:12px;">Add Expense</h3>'
      + '<div style="display:grid;grid-template-columns:auto 1fr 1fr 1fr 1fr 1fr auto;gap:8px;align-items:end;">'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Date</label>'
      + '<input type="date" id="exp-date" value="' + todayStr + '" style="padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Amount</label>'
      + '<input type="number" id="exp-amount" placeholder="0.00" step="0.01" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:15px;font-weight:700;"></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Category</label>'
      + '<select id="exp-category" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">';
    categories.forEach(function(c) { html += '<option value="' + c.key + '">' + c.icon + ' ' + c.label + '</option>'; });
    html += '</select></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Description</label>'
      + '<input type="text" id="exp-desc" placeholder="What was it for?" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Vendor</label>'
      + '<input type="text" id="exp-vendor" placeholder="e.g. Home Depot" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Job (optional)</label>'
      + '<input type="text" id="exp-job" placeholder="Job # or client" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<button onclick="ExpensesPage.addExpense()" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:700;cursor:pointer;white-space:nowrap;">+ Add</button>'
      + '</div></div>';

    // Fixed costs setup
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="var el=document.getElementById(\'fixed-costs\');el.style.display=el.style.display===\'none\'?\'block\':\'none\';">'
      + '<h3 style="font-size:15px;">Fixed Monthly Costs</h3><span style="color:var(--text-light);">▶</span></div>'
      + '<div id="fixed-costs" style="display:none;margin-top:12px;">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">';
    var fixedDefaults = [
      { key: 'truck_payment', label: 'Truck Payment', default: 1912 },
      { key: 'pickup_payment', label: 'Pickup Payment', default: 1000 },
      { key: 'insurance_monthly', label: 'Insurance', default: 1300 },
      { key: 'repair_fund', label: 'Repair Fund', default: 1000 },
      { key: 'phone', label: 'Phone/Dialpad', default: 75 },
      { key: 'software', label: 'Software', default: 50 },
      { key: 'storage', label: 'Storage/Yard', default: 0 },
      { key: 'loan', label: 'Loan Payment', default: 0 },
      { key: 'other_fixed', label: 'Other Fixed', default: 0 }
    ];
    fixedDefaults.forEach(function(f) {
      var saved = localStorage.getItem('bm-fixed-' + f.key);
      var val = saved !== null ? saved : f.default;
      html += '<div><label style="font-size:11px;color:var(--text-light);display:block;margin-bottom:3px;">' + f.label + '</label>'
        + '<input type="number" id="fixed-' + f.key + '" value="' + val + '" onchange="ExpensesPage.saveFixed(\'' + f.key + '\', this.value)" style="width:100%;padding:8px;border:2px solid var(--border);border-radius:6px;font-size:14px;font-weight:600;"></div>';
    });
    html += '</div></div></div>';

    // Expense list — show selected month
    var viewMonth = ExpensesPage._viewMonth !== undefined ? ExpensesPage._viewMonth : now.getMonth();
    var viewYear = ExpensesPage._viewYear !== undefined ? ExpensesPage._viewYear : now.getFullYear();
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var viewExpenses = expenses.filter(function(e) {
      var d = new Date(e.date);
      return d.getMonth() === viewMonth && d.getFullYear() === viewYear;
    });
    var prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    var prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    var nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    var nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    var isCurrentMonth = viewMonth === now.getMonth() && viewYear === now.getFullYear();

    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<h3 style="font-size:15px;">Expenses — ' + monthNames[viewMonth] + ' ' + viewYear + '</h3>'
      + '<div style="display:flex;gap:6px;align-items:center;">'
      + '<button onclick="ExpensesPage.exportCSV()" style="border:1px solid var(--green-dark);background:var(--white);color:var(--green-dark);border-radius:6px;padding:4px 12px;cursor:pointer;font-size:12px;font-weight:600;">Export CSV</button>'
      + '<button onclick="ExpensesPage._viewMonth=' + prevMonth + ';ExpensesPage._viewYear=' + prevYear + ';loadPage(\'expenses\')" style="border:1px solid var(--border);background:var(--white);border-radius:6px;padding:4px 10px;cursor:pointer;">◀</button>'
      + (isCurrentMonth ? '' : '<button onclick="ExpensesPage._viewMonth=' + now.getMonth() + ';ExpensesPage._viewYear=' + now.getFullYear() + ';loadPage(\'expenses\')" style="border:1px solid var(--border);background:var(--white);border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;">Today</button>')
      + '<button onclick="ExpensesPage._viewMonth=' + nextMonth + ';ExpensesPage._viewYear=' + nextYear + ';loadPage(\'expenses\')" style="border:1px solid var(--border);background:var(--white);border-radius:6px;padding:4px 10px;cursor:pointer;">▶</button>'
      + '</div></div>';
    if (viewExpenses.length) {
      // Group by category
      var grouped = {};
      viewExpenses.forEach(function(e) {
        if (!grouped[e.category]) grouped[e.category] = [];
        grouped[e.category].push(e);
      });
      Object.keys(grouped).forEach(function(cat) {
        var catInfo = categories.find(function(c) { return c.key === cat; }) || { icon: '📋', label: cat };
        var catTotal = grouped[cat].reduce(function(s, e) { return s + e.amount; }, 0);
        html += '<div style="margin-bottom:12px;">'
          + '<div style="display:flex;justify-content:space-between;padding:6px 0;font-weight:600;border-bottom:1px solid var(--border);">'
          + '<span>' + catInfo.icon + ' ' + catInfo.label + '</span><span>' + UI.money(catTotal) + '</span></div>';
        grouped[cat].forEach(function(e) {
          var vendorBadge = e.vendor ? ' <span style="font-size:11px;background:#e8f5e9;color:var(--green-dark);padding:1px 5px;border-radius:4px;">' + UI.esc(e.vendor) + '</span>' : '';
          var jobBadge = e.jobNote ? ' <span style="font-size:11px;background:var(--bg);padding:1px 5px;border-radius:4px;">' + UI.esc(e.jobNote) + '</span>' : '';
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0 6px 24px;font-size:13px;border-bottom:1px solid #f5f5f5;">'
            + '<span style="color:var(--text-light);">' + UI.esc(e.description || cat) + vendorBadge + jobBadge + ' <span style="font-size:11px;">' + UI.dateShort(e.date) + '</span></span>'
            + '<div style="display:flex;align-items:center;gap:6px;"><span style="font-weight:600;">' + UI.money(e.amount) + '</span>'
            + '<button onclick="ExpensesPage.openEditModal(\'' + e.id + '\')" style="background:none;border:none;cursor:pointer;color:var(--text-light);font-size:14px;padding:2px 4px;line-height:1;" title="Edit">✏️</button>'
            + '<button onclick="ExpensesPage.deleteExpense(\'' + e.id + '\')" style="background:none;border:none;cursor:pointer;color:var(--text-light);font-size:16px;padding:2px 4px;line-height:1;" title="Delete">×</button></div></div>';
        });
        html += '</div>';
      });
    } else {
      html += '<div style="text-align:center;padding:20px;color:var(--text-light);font-size:14px;">No expenses for ' + monthNames[viewMonth] + ' ' + viewYear + '. Add one above.</div>';
    }
    html += '</div>';

    // This Month by Category breakdown (bar chart)
    if (thisMonth.length > 0) {
      var catTotals = {};
      thisMonth.forEach(function(e) {
        catTotals[e.category] = (catTotals[e.category] || 0) + (e.amount || 0);
      });
      var maxCatVal = Object.keys(catTotals).reduce(function(m, k) { return Math.max(m, catTotals[k]); }, 0);
      html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);">'
        + '<h3 style="font-size:15px;margin-bottom:14px;">This Month by Category</h3>';
      // Sort by descending total
      var sortedCats = Object.keys(catTotals).sort(function(a, b) { return catTotals[b] - catTotals[a]; });
      sortedCats.forEach(function(cat) {
        var catInfo = categories.find(function(c) { return c.key === cat; }) || { icon: '📋', label: cat };
        var pct = maxCatVal > 0 ? Math.round((catTotals[cat] / maxCatVal) * 100) : 0;
        html += '<div style="display:grid;grid-template-columns:140px 1fr 80px;align-items:center;gap:10px;margin-bottom:10px;">'
          + '<span style="font-size:13px;">' + catInfo.icon + ' ' + catInfo.label + '</span>'
          + '<div style="background:#f0f0f0;border-radius:4px;height:12px;overflow:hidden;">'
          + '<div style="background:var(--green-dark);width:' + pct + '%;height:100%;border-radius:4px;transition:width 0.3s;"></div></div>'
          + '<span style="font-size:13px;font-weight:600;text-align:right;">' + UI.money(catTotals[cat]) + '</span>'
          + '</div>';
      });
      html += '</div>';
    }

    // Edit modal placeholder (rendered into body)
    html += '<div id="exp-edit-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;">'
      + '<div style="background:var(--white);border-radius:12px;padding:24px;width:420px;max-width:95vw;">'
      + '<h3 style="font-size:16px;margin-bottom:16px;">Edit Expense</h3>'
      + '<div style="display:grid;gap:10px;">'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Date</label>'
      + '<input type="date" id="edit-exp-date" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Amount</label>'
      + '<input type="number" id="edit-exp-amount" step="0.01" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:15px;font-weight:700;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Category</label>'
      + '<select id="edit-exp-category" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">';
    categories.forEach(function(c) { html += '<option value="' + c.key + '">' + c.icon + ' ' + c.label + '</option>'; });
    html += '</select></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Description</label>'
      + '<input type="text" id="edit-exp-desc" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Vendor</label>'
      + '<input type="text" id="edit-exp-vendor" placeholder="e.g. Sunoco" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Job (optional)</label>'
      + '<input type="text" id="edit-exp-job" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;"></div>'
      + '</div>'
      + '<input type="hidden" id="edit-exp-id">'
      + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">'
      + '<button onclick="ExpensesPage.closeEditModal()" style="border:1px solid var(--border);background:var(--white);border-radius:8px;padding:10px 18px;cursor:pointer;font-size:14px;">Cancel</button>'
      + '<button onclick="ExpensesPage.saveEdit()" style="background:var(--green-dark);color:#fff;border:none;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer;font-size:14px;">Save</button>'
      + '</div></div></div>';

    return html;
  },

  openEditModal: function(id) {
    var expense = DB.expenses ? DB.expenses.get(id) : null;
    if (!expense) { UI.toast('Expense not found', 'error'); return; }
    document.getElementById('edit-exp-id').value = id;
    // Date: stored as ISO string, extract YYYY-MM-DD portion
    var dateStr = expense.date ? expense.date.substring(0, 10) : new Date().toISOString().substring(0, 10);
    document.getElementById('edit-exp-date').value = dateStr;
    document.getElementById('edit-exp-amount').value = expense.amount || '';
    document.getElementById('edit-exp-category').value = expense.category || 'other';
    document.getElementById('edit-exp-desc').value = expense.description || '';
    document.getElementById('edit-exp-vendor').value = expense.vendor || '';
    document.getElementById('edit-exp-job').value = expense.jobNote || '';
    var modal = document.getElementById('exp-edit-modal');
    modal.style.display = 'flex';
  },

  closeEditModal: function() {
    var modal = document.getElementById('exp-edit-modal');
    if (modal) modal.style.display = 'none';
  },

  saveEdit: function() {
    var id = document.getElementById('edit-exp-id').value;
    var amount = parseFloat(document.getElementById('edit-exp-amount').value);
    if (!amount || amount <= 0) { UI.toast('Enter a valid amount', 'error'); return; }
    var dateVal = document.getElementById('edit-exp-date').value;
    var updates = {
      amount: amount,
      category: document.getElementById('edit-exp-category').value,
      description: document.getElementById('edit-exp-desc').value.trim(),
      vendor: document.getElementById('edit-exp-vendor').value.trim(),
      jobNote: document.getElementById('edit-exp-job').value.trim(),
      date: dateVal ? dateVal + 'T12:00:00.000Z' : new Date().toISOString()
    };
    if (DB.expenses && DB.expenses.update) {
      DB.expenses.update(id, updates);
    }
    ExpensesPage.closeEditModal();
    UI.toast('Expense updated');
    loadPage('expenses');
  },

  addExpense: function() {
    var amount = parseFloat(document.getElementById('exp-amount').value);
    var category = document.getElementById('exp-category').value;
    var desc = document.getElementById('exp-desc').value;
    var dateEl = document.getElementById('exp-date');
    var jobEl = document.getElementById('exp-job');
    var vendorEl = document.getElementById('exp-vendor');
    if (!amount || amount <= 0) { UI.toast('Enter an amount', 'error'); return; }

    var dateVal = (dateEl && dateEl.value) ? dateEl.value + 'T12:00:00.000Z' : new Date().toISOString();
    DB.expenses.create({
      amount: amount,
      category: category,
      description: desc,
      date: dateVal,
      vendor: vendorEl ? vendorEl.value.trim() : '',
      jobNote: jobEl ? jobEl.value.trim() : ''
    });
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-desc').value = '';
    if (vendorEl) vendorEl.value = '';
    if (jobEl) jobEl.value = '';
    UI.toast('Expense added: ' + UI.money(amount));
    loadPage('expenses');
  },

  deleteExpense: function(id) {
    if (!confirm('Delete this expense?')) return;
    DB.expenses.remove(id);
    UI.toast('Expense deleted');
    loadPage('expenses');
  },

  exportCSV: function() {
    var expenses = DB.expenses ? DB.expenses.getAll() : [];
    if (!expenses.length) { UI.toast('No expenses to export', 'error'); return; }
    var rows = [['Date', 'Category', 'Description', 'Vendor', 'Amount', 'Job']];
    expenses.forEach(function(e) {
      var categories = ExpensesPage._categories;
      var catInfo = categories.find(function(c) { return c.key === e.category; });
      var catLabel = catInfo ? catInfo.label : (e.category || '');
      var dateStr = e.date ? e.date.substring(0, 10) : '';
      rows.push([
        dateStr,
        catLabel,
        (e.description || '').replace(/,/g, ';'),
        (e.vendor || '').replace(/,/g, ';'),
        (e.amount || 0).toFixed(2),
        (e.jobNote || '').replace(/,/g, ';')
      ]);
    });
    var csv = rows.map(function(r) { return r.join(','); }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'expenses-' + new Date().toISOString().substring(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    UI.toast('CSV exported (' + (rows.length - 1) + ' rows)');
  },

  saveFixed: function(key, value) {
    localStorage.setItem('bm-fixed-' + key, value);
  },

  _getFixedCosts: function() {
    var keys = ['truck_payment', 'pickup_payment', 'insurance_monthly', 'repair_fund', 'phone', 'software', 'storage', 'loan', 'other_fixed'];
    var defaults = { truck_payment: 1912, pickup_payment: 1000, insurance_monthly: 1300, repair_fund: 1000, phone: 75, software: 50, storage: 0, loan: 0, other_fixed: 0 };
    return keys.reduce(function(total, key) {
      var val = localStorage.getItem('bm-fixed-' + key);
      var num = parseFloat(val !== null ? val : defaults[key]);
      return total + (isNaN(num) ? defaults[key] : num);
    }, 0);
  },

  // v690: Jobber CSV importer. Pastes/uploads Jobber Expenses CSV and
  // creates BM expenses in localStorage (DB.expenses). Auto-maps common
  // Jobber column names (Description, Date, Amount, Category, Vendor, Notes).
  showJobberImport: function() {
    var body = '<div style="font-size:13px;color:var(--text-light);line-height:1.6;">'
      + '<p style="margin:0 0 12px;">Paste a Jobber Expenses CSV export below, or drop a .csv file. Each row becomes one BM expense. Column names are matched case-insensitively (Description / Title, Date, Amount / Total, Category / Accounting code, Vendor, Notes).</p>'
      + '<textarea id="exp-jobber-csv" rows="10" placeholder="Description,Category,Date,Amount,Vendor,Notes&#10;HD Run,Materials,2025-12-02,0,Home Depot,&#10;Saw Parts,Equipment,2025-11-20,184.24,…" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:monospace;resize:vertical;"></textarea>'
      + '<div style="margin-top:8px;font-size:12px;color:var(--text-light);">Or drop a .csv file: <input type="file" id="exp-jobber-file" accept=".csv,text/csv" onchange="ExpensesPage._loadJobberFile(event)" style="font-size:12px;"></div>'
      + '</div>';
    UI.modal('Import expenses from Jobber CSV', body, [
      { label: 'Cancel', fn: 'UI.closeModal()' },
      { label: 'Import', fn: 'ExpensesPage._runJobberImport()', primary: true }
    ]);
  },

  _loadJobberFile: function(ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function() { document.getElementById('exp-jobber-csv').value = reader.result; };
    reader.readAsText(f);
  },

  _runJobberImport: function() {
    var csv = (document.getElementById('exp-jobber-csv').value || '').trim();
    if (!csv) { UI.toast('Paste CSV first', 'error'); return; }

    var lines = csv.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { UI.toast('CSV needs header + at least 1 row', 'error'); return; }

    var parseLine = function(s) {
      var out = [], cur = '', q = false;
      for (var i = 0; i < s.length; i++) {
        var ch = s[i];
        if (ch === '"') { if (q && s[i+1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (ch === ',' && !q) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out;
    };
    var header = parseLine(lines[0]).map(function(h) { return h.trim().toLowerCase(); });
    var col = function(row, names) {
      for (var i = 0; i < names.length; i++) {
        var idx = header.indexOf(names[i].toLowerCase());
        if (idx >= 0) return (row[idx] || '').trim();
      }
      return '';
    };
    var parseDate = function(s) {
      if (!s) return null;
      var d = new Date(s);
      if (!isNaN(d)) return d.toISOString().split('T')[0];
      return null;
    };
    var parseAmt = function(s) { return parseFloat(String(s||'').replace(/[$,]/g, '')) || 0; };

    var inserted = 0;
    for (var i = 1; i < lines.length; i++) {
      var r = parseLine(lines[i]);
      var amt = parseAmt(col(r, ['amount','total','total ($)','price']));
      var desc = col(r, ['description','title','name','expense']);
      if (!desc && !amt) continue;
      var rec = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        date: parseDate(col(r, ['date','expense date','created date'])) || new Date().toISOString().split('T')[0],
        amount: amt,
        description: desc,
        category: (col(r, ['category','accounting code','type']) || 'other').toLowerCase().replace(/\s+/g,'_'),
        vendor: col(r, ['vendor','merchant','payee','to']),
        job: col(r, ['job','job#','job number']),
        notes: col(r, ['notes','memo','details']),
        importSource: 'jobber-csv-' + new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (typeof DB !== 'undefined' && DB.expenses && DB.expenses.add) DB.expenses.add(rec);
      else {
        // Fallback: manual localStorage write
        var arr = JSON.parse(localStorage.getItem('bm-expenses') || '[]');
        arr.push(rec);
        localStorage.setItem('bm-expenses', JSON.stringify(arr));
      }
      inserted++;
    }

    UI.toast('Imported ' + inserted + ' expense' + (inserted === 1 ? '' : 's'), 'success');
    UI.closeModal();
    loadPage('expenses');
  }
};
