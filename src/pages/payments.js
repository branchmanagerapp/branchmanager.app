/**
 * Branch Manager — Payment & Deposit Tracking
 * Record partial payments, deposits, payment history per invoice
 */
var Payments = {
  _co: function() {
    return {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      website: CompanyInfo.get('website')
    };
  },

  _filterMethod: 'all',
  _filterPeriod: 'month',

  setFilter: function(type, value) {
    if (type === 'method') Payments._filterMethod = value;
    if (type === 'period') Payments._filterPeriod = value;
    var el = document.getElementById('payments-main');
    if (el) el.innerHTML = Payments._renderContent();
  },

  render: function() {
    return '<div style="max-width:860px;" id="payments-page">'
      + Payments._renderContent()
      + '</div>';
  },

  _getAllPayments: function() {
    // Prefer the cached Supabase pull if available
    var cached = [];
    try { cached = JSON.parse(localStorage.getItem('bm-payments-cache') || '[]'); } catch(e) {}

    // Merge with per-client localStorage keys (offline new payments not yet synced)
    // Dedup by id PRIMARILY; fall back to composite key only if id is missing
    var byId = {};
    var byCompositeKey = {};
    var addPayment = function(p) {
      if (p.id && byId[p.id]) return; // already have this exact payment
      if (p.id) { byId[p.id] = p; return; }
      // Fallback: no id, use composite key (legacy data only)
      var ts = p.date ? new Date(p.date).getTime() : 0;
      var key = (p.clientName || p.client_name || '') + '|' + ts + '|' + parseFloat(p.amount);
      if (!byCompositeKey[key]) byCompositeKey[key] = p;
    };
    cached.forEach(addPayment);
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.startsWith('bm-payments-') && k !== 'bm-payments-cache') {
        try {
          var items = JSON.parse(localStorage.getItem(k)) || [];
          items.forEach(addPayment);
        } catch(e) {}
      }
    }

    var allPayments = Object.values(byId).concat(Object.values(byCompositeKey));
    allPayments.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

    // Async fetch from Supabase + cache it
    Payments._syncFromSupabase();
    return allPayments;
  },

  _syncFromSupabase: function() {
    if (Payments._syncing) return;
    Payments._syncing = true;
    var url = localStorage.getItem('bm-supabase-url') || 'https://ltpivkqahvplapyagljt.supabase.co';
    var key = localStorage.getItem('bm-supabase-key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI';
    if (!url || !key) { Payments._syncing = false; return; }
    console.debug('[Payments] Fetching from', url);
    fetch(url + '/rest/v1/payments?select=*&order=date.desc&limit=5000', {
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
    }).then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(data) {
      if (!Array.isArray(data)) { Payments._syncing = false; return; }
      // Convert snake_case to camelCase for the UI
      var converted = data.map(function(row) {
        return {
          id: row.id,
          amount: parseFloat(row.amount) || 0,
          date: row.date,
          payoutDate: row.payout_date,
          method: row.method,
          status: row.status,
          clientId: row.client_id,
          clientName: row.client_name,
          invoiceId: row.invoice_id,
          source: row.source,
          notes: row.notes
        };
      });
      localStorage.setItem('bm-payments-cache', JSON.stringify(converted));
      Payments._syncing = false;
      // Re-render if still on payments tab/page
      if (window._currentPage === 'payments' || (window._currentPage === 'invoices' && InvoicesPage && InvoicesPage._activeTab === 'payments')) {
        if (typeof loadPage === 'function') loadPage(window._currentPage);
      }
    }).catch(function(err) { console.warn('[Payments sync] error:', err); Payments._syncing = false; });
  },

  _filterByPeriod: function(payments, period) {
    var now = new Date();
    var cutoff;
    if (period === 'month') {
      cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'lastmonth') {
      cutoff = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      var endCutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      return payments.filter(function(p) {
        var d = new Date(p.date);
        return d >= cutoff && d < endCutoff;
      });
    } else if (period === '3months') {
      cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    } else {
      return payments; // all time
    }
    return payments.filter(function(p) { return new Date(p.date) >= cutoff; });
  },

  _renderContent: function() {
    var allPayments = Payments._getAllPayments();

    var now = new Date();
    var thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    var sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Stat 1: Collected this month
    var collectedTotal = allPayments.filter(function(p) { return new Date(p.date) >= thisMonthStart; })
      .reduce(function(s, p) { return s + (p.amount || 0); }, 0);

    // Stat 2: Invoice payment time — avg days between invoice issued and payment
    var recentPaid = allPayments.filter(function(p) { return new Date(p.date) >= thirtyDaysAgo && p.invoiceId; });
    var daySum = 0; var dayCount = 0;
    recentPaid.forEach(function(p) {
      var inv = DB.invoices.getById(p.invoiceId);
      if (inv && inv.issuedDate) {
        var issued = new Date(inv.issuedDate || inv.createdAt || inv.date);
        var paid = new Date(p.date);
        var diff = Math.max(0, Math.round((paid - issued) / (1000 * 60 * 60 * 24)));
        daySum += diff; dayCount++;
      }
    });
    var avgPayDays = dayCount > 0 ? Math.round(daySum / dayCount) : '—';

    // Stat 3: Invoices paid on time — % paid before or on due date (last 60 days)
    var allInvoices = (typeof DB !== 'undefined' && DB.invoices && DB.invoices.getAll) ? DB.invoices.getAll() : [];
    var paidInvoices = allInvoices.filter(function(inv) {
      return inv.status === 'paid' && inv.paidDate && new Date(inv.paidDate) >= sixtyDaysAgo;
    });
    var onTimeCount = 0;
    paidInvoices.forEach(function(inv) {
      if (inv.dueDate) {
        var due = new Date(inv.dueDate);
        var paid = new Date(inv.paidDate);
        if (paid <= due) onTimeCount++;
      } else {
        onTimeCount++; // no due date = on time by default
      }
    });
    var onTimePct = paidInvoices.length > 0 ? Math.round((onTimeCount / paidInvoices.length) * 100) : '—';

    // Apply filters to list
    var filtered = Payments._filterByPeriod(allPayments, Payments._filterPeriod);
    if (Payments._filterMethod !== 'all') {
      filtered = filtered.filter(function(p) { return (p.method || 'other') === Payments._filterMethod; });
    }

    // Month name for Collected label
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var monthLabel = monthNames[now.getMonth()] + ' ' + now.getFullYear();

    // === Stats row (3 cards, legacy system-style) ===
    var html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px;">';

    // Collected
    html += '<div class="stat-card">'
      + '<div class="stat-label">Collected</div>'
      + '<div class="stat-value">' + UI.money(collectedTotal) + '</div>'
      + '<div style="font-size:13px;color:var(--text-light);margin-top:2px;">' + monthLabel + '</div>'
      + '</div>';

    // Invoice payment time
    html += '<div class="stat-card">'
      + '<div class="stat-label">Invoice payment time</div>'
      + '<div class="stat-value">' + (avgPayDays === '—' ? '—' : avgPayDays + ' days') + '</div>'
      + '<div style="font-size:13px;color:var(--text-light);margin-top:2px;">Avg last 30 days</div>'
      + '</div>';

    // Invoices paid on time
    var onTimeColor = onTimePct === '—' ? 'var(--text)' : (onTimePct >= 80 ? 'var(--green-dark)' : (onTimePct >= 50 ? '#e67e22' : 'var(--red)'));
    html += '<div class="stat-card">'
      + '<div class="stat-label">Invoices paid on time</div>'
      + '<div class="stat-value" style="color:' + onTimeColor + ';">' + (onTimePct === '—' ? '—' : onTimePct + '%') + '</div>'
      + '<div style="font-size:13px;color:var(--text-light);margin-top:2px;">' + onTimeCount + ' of ' + paidInvoices.length + ' (last 60 days)</div>'
      + '</div>';

    html += '</div>';

    // === Payment method breakdown (BM advantage) ===
    var methods = ['cash','check','card','stripe','deposit','other'];
    var methodTotals = {};
    methods.forEach(function(m) { methodTotals[m] = 0; });
    var allTimeTotal = allPayments.reduce(function(s, p) { return s + (p.amount || 0); }, 0);
    allPayments.forEach(function(p) {
      var m = p.method || 'other';
      if (!methodTotals[m]) methodTotals[m] = 0;
      methodTotals[m] += (p.amount || 0);
    });
    var methodMax = Math.max.apply(null, methods.map(function(m) { return methodTotals[m] || 0; })) || 1;
    var methodIcons = { cash: '💵', check: '📝', card: '💳', stripe: '🔵', deposit: '🏦', other: '💰' };

    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:16px;">'
      + '<h4 style="font-size:15px;margin-bottom:12px;font-weight:700;">Payment Method Breakdown</h4>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;">';

    methods.forEach(function(m) {
      var amt = methodTotals[m] || 0;
      if (amt === 0) return;
      var pct = Math.round((amt / methodMax) * 100);
      var pctOfTotal = allTimeTotal > 0 ? Math.round((amt / allTimeTotal) * 100) : 0;
      html += '<div style="background:var(--bg);border-radius:8px;padding:10px;">'
        + '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">'
        + '<span style="font-weight:600;text-transform:capitalize;">' + methodIcons[m] + ' ' + m + '</span>'
        + '<span style="color:var(--text-light);">' + pctOfTotal + '%</span>'
        + '</div>'
        + '<div style="height:6px;background:var(--border);border-radius:3px;margin-bottom:4px;overflow:hidden;">'
        + '<div style="height:100%;width:' + pct + '%;background:var(--green-dark);border-radius:3px;"></div>'
        + '</div>'
        + '<div style="font-size:15px;font-weight:700;">' + UI.money(amt) + '</div>'
        + '</div>';
    });

    html += '</div></div>';

    // === Filter bar ===
    var periodFilters = [
      { val: 'month', label: 'This Month' },
      { val: 'lastmonth', label: 'Last Month' },
      { val: '3months', label: 'Last 3 Mo' },
      { val: 'all', label: 'All Time' }
    ];
    var methodFilters = ['all','cash','check','card','stripe','deposit','other'];

    var filterBtnStyle = function(active) {
      return 'padding:6px 12px;border-radius:6px;border:1.5px solid ' + (active ? 'var(--green-dark)' : 'var(--border)') + ';background:' + (active ? 'var(--green-dark)' : 'var(--white)') + ';color:' + (active ? '#fff' : 'var(--text)') + ';cursor:pointer;font-size:13px;font-weight:600;';
    };

    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<span style="font-size:13px;font-weight:600;color:var(--text-light);margin-right:4px;">Period:</span>';
    periodFilters.forEach(function(f) {
      html += '<button style="' + filterBtnStyle(Payments._filterPeriod === f.val) + '" onclick="Payments.setFilter(\'period\',\'' + f.val + '\')">' + f.label + '</button>';
    });
    html += '<span style="font-size:13px;font-weight:600;color:var(--text-light);margin-left:8px;margin-right:4px;">Method:</span>';
    methodFilters.forEach(function(m) {
      var label = m === 'all' ? 'All' : ((methodIcons[m] || '') + ' ' + m.charAt(0).toUpperCase() + m.slice(1));
      html += '<button style="' + filterBtnStyle(Payments._filterMethod === m) + '" onclick="Payments.setFilter(\'method\',\'' + m + '\')">' + label + '</button>';
    });

    // Export CSV button
    html += '<button onclick="Payments.exportCSV()" class="btn btn-outline" style="margin-left:auto;font-size:13px;padding:6px 12px;">Export CSV</button>';
    html += '</div>';

    // === Column headers ===
    html += '<div class="detail-grid" style="display:grid;grid-template-columns:2fr 1fr 1fr 100px 100px 110px;gap:8px;padding:8px 16px;font-size:12px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:0.5px;">'
      + '<div>Client</div>'
      + '<div>Payment date</div>'
      + '<div>Payout date</div>'
      + '<div>Status</div>'
      + '<div>Method</div>'
      + '<div style="text-align:right;">Amount</div>'
      + '</div>';

    // Wrap list in updatable div
    html += '<div id="payments-main">';
    html += Payments._renderList(filtered);
    html += '</div>';

    return html;
  },

  _renderList: function(filtered) {
    if (!filtered.length) {
      return '<div class="empty-state"><div class="empty-icon">💵</div><h3>No payments match this filter</h3><p>Try a different date range or payment method.</p><button class="btn btn-primary" style="margin-top:16px;" onclick="loadPage(\'invoices\')">Go to Invoices</button></div>';
    }

    var methodIcons = { cash: '💵', check: '📝', card: '💳', stripe: '🔵', deposit: '🏦', other: '💰' };
    var methodLabels = { cash: 'Cash', check: 'Check', card: 'Card', stripe: 'Stripe', deposit: 'Deposit', other: 'Other' };
    var manualMethods = { cash: true, check: true, other: true };
    var html = '';

    filtered.slice(0, 150).forEach(function(p) {
      var inv = p.invoiceId ? DB.invoices.getById(p.invoiceId) : null;
      var clientName = inv ? (inv.clientName || 'Unknown') : 'Unknown';
      var invNum = inv ? (inv.invoiceNumber || '') : '';
      var clientEmail = inv ? (inv.clientEmail || '') : '';

      // Payment date
      var payDate = UI.dateShort(p.date);

      // Payout date — manual methods show "Manual", card/stripe could show a payout date
      var payoutDate = manualMethods[p.method] ? 'Manual' : (p.payoutDate ? UI.dateShort(p.payoutDate) : payDate);

      // Build mailto for receipt
      var receiptSubject = encodeURIComponent('Payment Receipt' + (invNum ? ' — Invoice #' + invNum : ''));
      var receiptBody = encodeURIComponent(
        'Hi' + (clientName !== 'Unknown' ? ' ' + clientName.split(' ')[0] : '') + ',\n\n'
        + 'Thank you for your payment.\n\n'
        + 'Amount: ' + UI.money(p.amount) + '\n'
        + 'Method: ' + (p.method || 'payment') + '\n'
        + 'Date: ' + UI.dateShort(p.date) + '\n'
        + (invNum ? 'Invoice #: ' + invNum + '\n' : '')
        + (p.note ? 'Note: ' + p.note + '\n' : '')
        + '\nThank you for choosing ' + Payments._co().name + '!\n\n'
        + Payments._co().name + '\n' + Payments._co().phone + '\n' + Payments._co().email
      );
      var mailtoHref = 'mailto:' + (clientEmail || '') + '?subject=' + receiptSubject + '&body=' + receiptBody;

      // Invoice link
      var invLink = invNum
        ? '<a href="#" onclick="loadPage(\'invoices\');setTimeout(function(){if(typeof InvoicesPage!==\'undefined\')InvoicesPage.showDetail(\'' + p.invoiceId + '\');},100);return false;" style="color:var(--green-dark);font-size:13px;text-decoration:none;">Invoice #' + UI.esc(invNum) + '</a>'
        : '<span style="font-size:13px;color:var(--text-light);">No invoice</span>';

      html += '<div class="detail-grid" style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:6px;display:grid;grid-template-columns:2fr 1fr 1fr 100px 100px 110px;gap:8px;align-items:center;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'

        // Client name + invoice link
        + '<div>'
        + '<div style="font-weight:700;font-size:16px;line-height:1.3;">' + UI.esc(clientName) + '</div>'
        + invLink
        + (p.note ? '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">' + UI.esc(p.note) + '</div>' : '')
        + '</div>'

        // Payment date
        + '<div style="font-size:15px;color:var(--text);">' + payDate + '</div>'

        // Payout date
        + '<div style="font-size:15px;color:' + (payoutDate === 'Manual' ? 'var(--text-light)' : 'var(--text)') + ';">' + payoutDate + '</div>'

        // Status badge
        + '<div>'
        + '<span style="display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:600;color:var(--green-dark);background:rgba(34,139,34,0.08);padding:4px 10px;border-radius:20px;white-space:nowrap;">'
        + '<span style="width:7px;height:7px;border-radius:50%;background:var(--green-dark);display:inline-block;"></span> Succeeded'
        + '</span>'
        + '</div>'

        // Method with icon
        + '<div style="font-size:15px;white-space:nowrap;">'
        + (methodIcons[p.method] || '💰') + ' ' + (methodLabels[p.method] || 'Other')
        + '</div>'

        // Amount + receipt link (right-aligned)
        + '<div style="text-align:right;">'
        + '<div style="font-weight:700;font-size:16px;color:var(--green-dark);">+' + UI.money(p.amount) + '</div>'
        + '<div style="display:flex;gap:6px;justify-content:flex-end;align-items:center;margin-top:2px;">'
        +   (p.receipt_url || p.receiptUrl
              ? '<a href="' + UI.esc(p.receipt_url || p.receiptUrl) + '" target="_blank" rel="noopener noreferrer" title="View attached receipt" style="font-size:12px;color:var(--green-dark);text-decoration:none;font-weight:600;">📎 Receipt</a>'
              : '<button onclick="Payments._uploadReceipt(\'' + (p.id || '') + '\')" title="Attach proof of payment" style="font-size:11px;background:none;border:1px solid var(--border);border-radius:4px;padding:2px 8px;cursor:pointer;color:var(--text-light);">📎 Attach</button>')
        +   '<a href="' + mailtoHref + '" title="Email receipt" style="font-size:12px;color:var(--text-light);text-decoration:none;">✉️</a>'
        + '</div>'
        + '</div>'

        + '</div>';
    });

    return html;
  },

  exportCSV: function() {
    var allPayments = Payments._getAllPayments();
    var filtered = Payments._filterByPeriod(allPayments, Payments._filterPeriod);
    if (Payments._filterMethod !== 'all') {
      filtered = filtered.filter(function(p) { return (p.method || 'other') === Payments._filterMethod; });
    }

    var rows = [['Date','Client','Invoice #','Method','Amount','Note']];
    filtered.forEach(function(p) {
      var inv = p.invoiceId ? DB.invoices.getById(p.invoiceId) : null;
      rows.push([
        UI.dateShort(p.date),
        inv ? (inv.clientName || '') : '',
        inv ? (inv.invoiceNumber || '') : '',
        p.method || '',
        (p.amount || 0).toFixed(2),
        p.note || ''
      ]);
    });

    var csv = rows.map(function(row) {
      return row.map(function(cell) {
        var s = String(cell).replace(/"/g, '""');
        return /[,"\n]/.test(s) ? '"' + s + '"' : s;
      }).join(',');
    }).join('\r\n');

    var blob = new Blob([csv], {type: 'text/csv'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'payments-' + new Date().toISOString().split('T')[0] + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.toast('CSV exported (' + filtered.length + ' payments)');
  },

  // Render payment history for an invoice
  renderForInvoice: function(invoiceId, options) {
    options = options || {};
    var payments = Payments.getAll(invoiceId);
    var inv = DB.invoices.getById(invoiceId);
    if (!inv) return '';

    var totalPaid = payments.reduce(function(s, p) { return s + (p.amount || 0); }, 0);
    var remaining = (inv.total || 0) - totalPaid;

    var html = '<div>';
    if (!options.hideHeader) {
      html += '<h4 style="font-size:14px;margin-bottom:8px;">Payment History</h4>';
    }

    // Progress bar
    var pctPaid = inv.total > 0 ? Math.min(100, Math.round(totalPaid / inv.total * 100)) : 0;
    html += '<div style="margin-bottom:12px;">'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">'
      + '<span>Paid: ' + UI.money(totalPaid) + '</span>'
      + '<span style="color:' + (remaining > 0 ? 'var(--red)' : 'var(--green-dark)') + ';">Remaining: ' + UI.money(Math.max(0, remaining)) + '</span></div>'
      + '<div style="height:8px;background:var(--bg);border-radius:4px;overflow:hidden;">'
      + '<div style="height:100%;width:' + pctPaid + '%;background:' + (pctPaid >= 100 ? '#4caf50' : '#ff9800') + ';border-radius:4px;transition:width .3s;"></div>'
      + '</div></div>';

    // Payment list
    if (payments.length) {
      payments.forEach(function(p) {
        var methodIcons = { cash: '💵', check: '📝', card: '💳', stripe: '🔵', deposit: '🏦', other: '💰' };
        html += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">'
          + '<div><span>' + (methodIcons[p.method] || '💰') + '</span> '
          + '<span style="text-transform:capitalize;font-weight:600;">' + (p.method || 'payment') + '</span>'
          + (p.note ? ' <span style="color:var(--text-light);">— ' + p.note + '</span>' : '')
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:8px;">'
          + '<span style="font-weight:700;color:var(--green-dark);">+' + UI.money(p.amount) + '</span>'
          + '<span style="font-size:11px;color:var(--text-light);">' + UI.dateShort(p.date) + '</span>'
          + '</div></div>';
      });
    }

    // Add payment form (suppressed when caller has its own Collect Payment CTA)
    if (remaining > 0 && !options.hideRecordForm) {
      html += '<div style="margin-top:12px;padding:12px;background:var(--bg);border-radius:8px;">'
        + '<div style="font-size:13px;font-weight:600;margin-bottom:8px;">Record Payment</div>'
        + '<div style="display:flex;gap:6px;align-items:end;">'
        + '<div style="flex:1;"><input type="number" id="pay-amount-' + invoiceId + '" value="' + remaining.toFixed(2) + '" step="0.01" style="width:100%;padding:8px;border:2px solid var(--border);border-radius:6px;font-size:14px;font-weight:700;"></div>'
        + '<select id="pay-method-' + invoiceId + '" style="padding:8px;border:2px solid var(--border);border-radius:6px;font-size:13px;">'
        + '<option value="cash">💵 Cash</option><option value="check">📝 Check</option><option value="card">💳 Card</option><option value="deposit">🏦 Deposit</option></select>'
        + '<input type="text" id="pay-note-' + invoiceId + '" placeholder="Note (check #, etc)" style="flex:1;padding:8px;border:2px solid var(--border);border-radius:6px;font-size:13px;">'
        + '<button onclick="Payments.record(\'' + invoiceId + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:8px 14px;border-radius:6px;font-weight:600;cursor:pointer;white-space:nowrap;">Record</button>'
        + '</div></div>';
    }

    html += '</div>';
    return html;
  },

  record: function(invoiceId) {
    var amountEl = document.getElementById('pay-amount-' + invoiceId);
    var methodEl = document.getElementById('pay-method-' + invoiceId);
    var noteEl = document.getElementById('pay-note-' + invoiceId);
    if (!amountEl) return;

    var amount = parseFloat(amountEl.value);
    if (!amount || amount <= 0) { UI.toast('Enter amount', 'error'); return; }

    var payment = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      invoiceId: invoiceId,
      amount: amount,
      method: methodEl ? methodEl.value : 'cash',
      note: noteEl ? noteEl.value : '',
      date: new Date().toISOString(),
      user: (typeof Auth !== 'undefined' && Auth.user && Auth.user.name) ? Auth.user.name : (localStorage.getItem('bm-co-owner') || 'Owner')
    };

    // Save payment
    var key = 'bm-payments-' + invoiceId;
    var all = [];
    try { all = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
    all.unshift(payment);
    localStorage.setItem(key, JSON.stringify(all));

    // Update invoice balance
    var inv = DB.invoices.getById(invoiceId);
    if (inv) {
      var totalPaid = all.reduce(function(s, p) { return s + (p.amount || 0); }, 0);
      var newBalance = Math.max(0, (inv.total || 0) - totalPaid);
      var updates = {
        amountPaid: totalPaid,
        balance: newBalance
      };
      if (newBalance <= 0) {
        updates.status = 'paid';
        updates.paidDate = new Date().toISOString();
      }
      DB.invoices.update(invoiceId, updates);
    }

    UI.toast('Payment recorded: ' + UI.money(amount) + ' via ' + (methodEl ? methodEl.value : 'cash'));

    // Refresh
    if (typeof InvoicesPage !== 'undefined') {
      InvoicesPage.showDetail(invoiceId);
    }
  },

  getAll: function(invoiceId) {
    var key = 'bm-payments-' + invoiceId;
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch(e) { return []; }
  },

  // Collect deposit before work starts
  collectDeposit: function(invoiceId, percentage) {
    var inv = DB.invoices.getById(invoiceId);
    if (!inv) return;
    var depositAmount = Math.round(inv.total * (percentage || 0.5) * 100) / 100;

    var payment = {
      id: Date.now().toString(36),
      invoiceId: invoiceId,
      amount: depositAmount,
      method: 'deposit',
      note: percentage * 100 + '% deposit',
      date: new Date().toISOString(),
      user: (typeof Auth !== 'undefined' && Auth.user && Auth.user.name) ? Auth.user.name : (localStorage.getItem('bm-co-owner') || 'Owner')
    };

    var key = 'bm-payments-' + invoiceId;
    var all = [];
    try { all = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
    all.unshift(payment);
    localStorage.setItem(key, JSON.stringify(all));

    DB.invoices.update(invoiceId, {
      amountPaid: depositAmount,
      balance: inv.total - depositAmount,
      status: 'partial'
    });

    UI.toast('Deposit collected: ' + UI.money(depositAmount));
  },

  // v774: attach a proof-of-payment file (PDF/JPEG) to a payment row.
  // File lands in Storage under payment-receipts/<payment_id>/<…>;
  // the public URL is stamped on payments.receipt_url so it's clickable
  // from the payments list AND from the invoice detail.
  _uploadReceipt: function(paymentId) {
    if (!paymentId) { UI.toast('Missing payment id', 'error'); return; }
    var html = '<div style="font-size:13px;line-height:1.6;margin-bottom:12px;">'
      + '<p>Attach a proof-of-payment file (PDF, image, or bank screenshot). The link will show on the payment row and on the invoice detail.</p>'
      + '<input type="file" id="rcpt-file" accept=".pdf,image/*,.png,.jpg,.jpeg" '
      +   'onchange="Payments._doUploadReceipt(\'' + paymentId + '\', this.files[0])" '
      +   'style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;margin-top:8px;">'
      + '<div id="rcpt-status" style="margin-top:10px;font-size:12px;min-height:16px;"></div>'
      + '</div>';
    UI.showModal('Attach receipt', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
    });
  },

  _doUploadReceipt: async function(paymentId, file) {
    if (!file) return;
    var statusEl = document.getElementById('rcpt-status');
    if (statusEl) statusEl.textContent = 'Uploading ' + file.name + '…';
    try {
      if (typeof BMUpload === 'undefined' || !BMUpload.uploadFile) throw new Error('Upload helper not loaded');
      var up = await BMUpload.uploadFile(file, 'payment-receipts/' + paymentId);
      var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
      if (!sb) throw new Error('Supabase not connected');
      var r = await sb.from('payments').update({
        receipt_url: up.url,
        receipt_uploaded_at: new Date().toISOString()
      }).eq('id', paymentId);
      if (r.error) throw new Error(r.error.message);
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--green-dark);">✓ Attached</span>';
      UI.toast('Receipt attached');
      setTimeout(function() {
        UI.closeModal();
        if (window._currentPage === 'reports' || window._currentPage === 'invoices' || window._currentPage === 'payments') loadPage(window._currentPage);
      }, 600);
    } catch (e) {
      if (statusEl) statusEl.innerHTML = '<span style="color:#c62828;">Upload failed: ' + UI.esc(e.message || 'unknown') + '</span>';
    }
  }
};
