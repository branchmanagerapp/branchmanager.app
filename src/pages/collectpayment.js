/**
 * Branch Manager — Embedded Collect Payment (legacy system-style)
 *
 * Multi-invoice card collection with Stripe Elements. User picks any
 * combination of unpaid invoices for a single client (or any client),
 * sees the total, fills in card form inline, charges in one go.
 *
 * Architecture:
 *   1. UI lists outstanding invoices (filterable by client) with checkboxes.
 *   2. On "Charge" click → POST to stripe-charge edge fn → returns clientSecret.
 *   3. stripe.confirmCardPayment(clientSecret, { payment_method: cardElement }).
 *   4. On success → stripe-webhook fires payment_intent.succeeded with
 *      metadata.invoice_ids → marks all selected invoices paid.
 */

var CollectPaymentPage = {
  _selectedClientId: null,
  _selectedInvoiceIds: [],
  _stripe: null,
  _elements: null,
  _cardElement: null,

  render: function() {
    document.getElementById('pageTitle').textContent = 'Collect Payment';
    document.getElementById('pageAction').style.display = 'none';

    var pk = localStorage.getItem('bm-stripe-pk') || '';
    if (!pk) {
      document.getElementById('pageContent').innerHTML = CollectPaymentPage._notConnectedHtml();
      return;
    }

    // Read clientId from hash (?c= or #collectpayment?clientId=...)
    var qs = (location.hash.split('?')[1] || '');
    var params = {};
    qs.split('&').forEach(function(p) { var kv = p.split('='); if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); });
    if (params.clientId) CollectPaymentPage._selectedClientId = params.clientId;

    var html = '<div style="max-width:920px;margin:0 auto;padding:8px 0;">'
      + CollectPaymentPage._clientPicker()
      + '<div id="cp-body" style="margin-top:16px;">' + CollectPaymentPage._invoiceListAndForm() + '</div>'
      + '</div>';

    document.getElementById('pageContent').innerHTML = html;
    setTimeout(CollectPaymentPage._mountStripe, 50);
  },

  _notConnectedHtml: function() {
    return '<div style="max-width:560px;margin:80px auto;text-align:center;padding:32px 24px;background:var(--white);border:1px solid var(--border);border-radius:12px;">'
      + '<div style="font-size:48px;margin-bottom:12px;">💳</div>'
      + '<h3 style="margin:0 0 8px;font-size:18px;">Stripe not connected</h3>'
      + '<p style="color:var(--text-light);font-size:13px;margin-bottom:16px;line-height:1.6;">Connect Stripe in Settings to take card payments inside Branch Manager. Takes one minute.</p>'
      + '<button class="btn btn-primary" onclick="loadPage(\'settings\')">Open Settings →</button>'
      + '</div>';
  },

  _clientPicker: function() {
    var clients = DB.clients.getAll().filter(function(c) {
      var unpaid = DB.invoices.getAll().filter(function(i) {
        return i.clientId === c.id && i.status !== 'paid' && i.status !== 'cancelled' && i.status !== 'archived' && (i.balance || i.total || 0) > 0;
      });
      return unpaid.length > 0;
    }).sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });

    var sel = CollectPaymentPage._selectedClientId || '';
    var opts = '<option value="">— All clients with open invoices —</option>'
      + clients.map(function(c) {
          var unpaid = DB.invoices.getAll().filter(function(i){ return i.clientId === c.id && i.status !== 'paid' && i.status !== 'cancelled' && i.status !== 'archived' && (i.balance || i.total || 0) > 0; });
          var sum = unpaid.reduce(function(s, i){ return s + (i.balance || i.total || 0); }, 0);
          return '<option value="' + c.id + '"' + (sel === c.id ? ' selected' : '') + '>' + UI.esc(c.name) + ' — ' + UI.money(sum) + ' across ' + unpaid.length + '</option>';
        }).join('');

    return '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">'
      + '<label style="font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;">Client:</label>'
      + '<select id="cp-client" onchange="CollectPaymentPage._onClientChange(this.value)" style="flex:1;min-width:220px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;">' + opts + '</select>'
      + '</div>';
  },

  _onClientChange: function(id) {
    CollectPaymentPage._selectedClientId = id || null;
    CollectPaymentPage._selectedInvoiceIds = [];
    document.getElementById('cp-body').innerHTML = CollectPaymentPage._invoiceListAndForm();
    setTimeout(CollectPaymentPage._mountStripe, 50);
  },

  _eligibleInvoices: function() {
    return DB.invoices.getAll().filter(function(i) {
      if (i.status === 'paid' || i.status === 'cancelled' || i.status === 'archived') return false;
      if ((i.balance || i.total || 0) <= 0) return false;
      if (CollectPaymentPage._selectedClientId && i.clientId !== CollectPaymentPage._selectedClientId) return false;
      return true;
    }).sort(function(a, b) {
      // Past-due first, then by issued_date desc
      var aDue = a.dueDate && new Date(a.dueDate) < new Date() ? 0 : 1;
      var bDue = b.dueDate && new Date(b.dueDate) < new Date() ? 0 : 1;
      if (aDue !== bDue) return aDue - bDue;
      return (b.issuedDate || b.createdAt || '').localeCompare(a.issuedDate || a.createdAt || '');
    });
  },

  _invoiceListAndForm: function() {
    var invs = CollectPaymentPage._eligibleInvoices();
    if (invs.length === 0) {
      return '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:32px;text-align:center;color:var(--text-light);font-size:14px;">No outstanding invoices' + (CollectPaymentPage._selectedClientId ? ' for this client' : '') + ' 🎉</div>';
    }
    // If single client, auto-select all by default
    var defaultSelect = !!CollectPaymentPage._selectedClientId;
    if (defaultSelect && CollectPaymentPage._selectedInvoiceIds.length === 0) {
      CollectPaymentPage._selectedInvoiceIds = invs.map(function(i){ return i.id; });
    }

    var rows = invs.map(function(inv) {
      var bal = parseFloat(inv.balance || inv.total || 0);
      var checked = CollectPaymentPage._selectedInvoiceIds.indexOf(inv.id) >= 0;
      var pastDue = inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== 'paid';
      return '<tr onclick="CollectPaymentPage._toggleInvoice(\'' + inv.id + '\')" style="cursor:pointer;border-top:1px solid var(--border);' + (checked ? 'background:#f0fdf4;' : '') + '">'
        + '<td style="padding:10px 12px;width:40px;text-align:center;"><input type="checkbox" ' + (checked ? 'checked' : '') + ' onclick="event.stopPropagation();CollectPaymentPage._toggleInvoice(\'' + inv.id + '\')" style="width:18px;height:18px;cursor:pointer;"></td>'
        + '<td style="padding:10px 12px;font-weight:600;">#' + (inv.invoiceNumber || '—') + '</td>'
        + '<td style="padding:10px 12px;">' + UI.esc(inv.clientName || '—') + (pastDue ? ' <span style="background:#fee2e2;color:#dc2626;font-size:10px;padding:2px 6px;border-radius:10px;font-weight:700;margin-left:6px;">Past due</span>' : '') + '</td>'
        + '<td style="padding:10px 12px;color:var(--text-light);font-size:12px;">' + (inv.dueDate ? 'Due ' + UI.dateShort(inv.dueDate) : 'Due on receipt') + '</td>'
        + '<td style="padding:10px 12px;text-align:right;font-weight:700;">' + UI.money(bal) + '</td>'
        + '</tr>';
    }).join('');

    var totalSelected = invs.filter(function(i){ return CollectPaymentPage._selectedInvoiceIds.indexOf(i.id) >= 0; })
      .reduce(function(s, i){ return s + (parseFloat(i.balance) || parseFloat(i.total) || 0); }, 0);

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px;">'
      + '<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">'
      +   '<h4 style="font-size:12px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;margin:0;font-weight:700;">Outstanding invoices</h4>'
      +   '<span style="font-size:12px;color:var(--text-light);">' + invs.length + ' · select to combine</span>'
      + '</div>'
      + '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
      +   '<thead><tr style="background:var(--bg);">'
      +     '<th style="padding:8px 12px;text-align:center;font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;width:40px;"></th>'
      +     '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;">Invoice</th>'
      +     '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;">Client</th>'
      +     '<th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;">Due</th>'
      +     '<th style="padding:8px 12px;text-align:right;font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;">Balance</th>'
      +   '</tr></thead><tbody>' + rows + '</tbody></table>'
      + '</div>';

    // Card form (Stripe Elements mounts into #cp-card-element after render)
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:20px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      +   '<h4 style="font-size:12px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;margin:0;font-weight:700;">Card details</h4>'
      +   '<span id="cp-total-display" style="font-size:18px;font-weight:800;color:#1a3c12;">' + UI.money(totalSelected) + '</span>'
      + '</div>'
      + '<div id="cp-card-element" style="padding:14px;border:1px solid var(--border);border-radius:8px;background:#fff;min-height:44px;"></div>'
      + '<div id="cp-card-error" style="color:#dc2626;font-size:13px;margin-top:8px;display:none;"></div>'
      + '<div style="display:flex;gap:8px;align-items:center;margin-top:16px;">'
      +   '<button id="cp-charge-btn" onclick="CollectPaymentPage._charge()" style="flex:1;background:#2e7d32;color:#fff;border:none;padding:14px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">💳 Charge <span id="cp-charge-amount">' + UI.money(totalSelected) + '</span></button>'
      +   '<button onclick="loadPage(\'invoices\')" style="background:#fff;color:var(--text);border:1px solid var(--border);padding:14px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Cancel</button>'
      + '</div>'
      + '<div id="cp-status" style="margin-top:12px;font-size:13px;"></div>'
      + '</div>';
    return html;
  },

  _toggleInvoice: function(id) {
    var idx = CollectPaymentPage._selectedInvoiceIds.indexOf(id);
    if (idx >= 0) CollectPaymentPage._selectedInvoiceIds.splice(idx, 1);
    else CollectPaymentPage._selectedInvoiceIds.push(id);
    CollectPaymentPage._refreshTotal();
    // Re-render the row backgrounds
    document.getElementById('cp-body').innerHTML = CollectPaymentPage._invoiceListAndForm();
    setTimeout(CollectPaymentPage._mountStripe, 50);
  },

  _refreshTotal: function() {
    var total = CollectPaymentPage._selectedInvoiceIds
      .map(function(id) { return DB.invoices.getById(id); })
      .filter(Boolean)
      .reduce(function(s, i) { return s + (parseFloat(i.balance) || parseFloat(i.total) || 0); }, 0);
    var disp = document.getElementById('cp-total-display');
    var btn = document.getElementById('cp-charge-amount');
    if (disp) disp.textContent = UI.money(total);
    if (btn) btn.textContent = UI.money(total);
  },

  _mountStripe: function() {
    if (CollectPaymentPage._cardElement) return; // Already mounted
    if (typeof window.Stripe !== 'function') {
      // Stripe.js not loaded yet — retry shortly
      setTimeout(CollectPaymentPage._mountStripe, 500);
      return;
    }
    var pk = localStorage.getItem('bm-stripe-pk') || '';
    if (!pk) return;
    var mount = document.getElementById('cp-card-element');
    if (!mount) return;
    try {
      CollectPaymentPage._stripe = window.Stripe(pk);
      CollectPaymentPage._elements = CollectPaymentPage._stripe.elements();
      CollectPaymentPage._cardElement = CollectPaymentPage._elements.create('card', {
        style: {
          base: { fontSize: '15px', color: '#1a1a1a', fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', '::placeholder': { color: '#9ca3af' } },
          invalid: { color: '#dc2626' }
        }
      });
      CollectPaymentPage._cardElement.mount(mount);
      CollectPaymentPage._cardElement.on('change', function(e) {
        var err = document.getElementById('cp-card-error');
        if (err) {
          if (e.error) { err.textContent = e.error.message; err.style.display = 'block'; }
          else { err.style.display = 'none'; }
        }
      });
    } catch (e) {
      console.warn('[CollectPayment] Stripe Elements mount failed:', e);
    }
  },

  _charge: function() {
    var selectedIds = CollectPaymentPage._selectedInvoiceIds;
    if (!selectedIds.length) { UI.toast('Pick at least one invoice', 'error'); return; }
    if (!CollectPaymentPage._stripe || !CollectPaymentPage._cardElement) { UI.toast('Stripe not ready — try refresh', 'error'); return; }

    var total = selectedIds.map(function(id) { return DB.invoices.getById(id); }).filter(Boolean)
      .reduce(function(s, i) { return s + (parseFloat(i.balance) || parseFloat(i.total) || 0); }, 0);
    if (total < 0.5) { UI.toast('Total must be at least $0.50', 'error'); return; }

    var btn = document.getElementById('cp-charge-btn');
    var statusEl = document.getElementById('cp-status');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-light);">Creating payment intent…</span>';

    var tenantId = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    var firstInv = DB.invoices.getById(selectedIds[0]);
    var clientEmail = (firstInv && firstInv.clientEmail) || '';

    fetch('https://ltpivkqahvplapyagljt.supabase.co/functions/v1/stripe-charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: tenantId,
        amount: total,
        invoiceIds: selectedIds,
        customerEmail: clientEmail
      })
    }).then(function(r) { return r.json(); }).then(function(res) {
      if (!res || !res.ok || !res.clientSecret) {
        throw new Error((res && res.error) || 'PaymentIntent failed');
      }
      if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-light);">Confirming card with Stripe…</span>';
      return CollectPaymentPage._stripe.confirmCardPayment(res.clientSecret, {
        payment_method: { card: CollectPaymentPage._cardElement }
      });
    }).then(function(result) {
      if (result.error) throw new Error(result.error.message);
      // Webhook will mark invoices paid; show success now
      if (statusEl) {
        statusEl.innerHTML = '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;color:#166534;font-weight:600;">✅ Payment succeeded — ' + UI.money(total) + ' charged. Invoices will mark paid in seconds (via Stripe webhook).</div>';
      }
      UI.toast('Payment received ✓ ' + UI.money(total));
      // Soft-update local state
      selectedIds.forEach(function(id) {
        DB.invoices.update(id, { status: 'paid', balance: 0, paymentMethod: 'stripe', paidDate: new Date().toISOString() });
      });
      CollectPaymentPage._selectedInvoiceIds = [];
      setTimeout(function() { loadPage('invoices'); }, 2500);
    }).catch(function(err) {
      console.error('[CollectPayment] charge failed:', err);
      if (statusEl) statusEl.innerHTML = '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;color:#991b1b;">❌ ' + (err.message || 'Charge failed') + '</div>';
      if (btn) { btn.disabled = false; btn.textContent = '💳 Charge ' + UI.money(total); }
    });
  }
};
