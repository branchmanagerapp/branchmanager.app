/**
 * Branch Manager — Stripe Integration
 * Payment links, checkout, invoice payment tracking
 *
 * HOW IT WORKS (no backend needed):
 * 1. Create ONE "Base Payment Link" in Stripe Dashboard:
 *    - Product: "Tree Service" — Price: $0.01 per unit
 *    - Enable: "Let customers adjust quantity"
 *    - Copy the link URL (e.g. https://buy.stripe.com/abc123)
 * 2. Paste it in Settings → Stripe → Base Payment Link
 * 3. Every invoice/pay.html auto-appends ?prefilled_quantity=<cents>
 *    so Stripe pre-fills the exact amount. Client just clicks Pay.
 * 4. Tip: customer can increase quantity by the tip amount in cents.
 */
var Stripe = {
  publishableKey: null,
  DEFAULT_PK: 'pk_live_51TDawDBGJHz1j102gKSfimIBsbD7OtFgtKtEG7wRjSEIRM0IEsyV3gBSXs5ESx8eRIK9EXfGYJk3lgKKyB5fFeJP00Zwn4B4ED',

  init: function() {
    Stripe.publishableKey = localStorage.getItem('bm-stripe-pk') || Stripe.DEFAULT_PK;
    if (Stripe.publishableKey && !localStorage.getItem('bm-stripe-pk')) {
      localStorage.setItem('bm-stripe-pk', Stripe.publishableKey);
    }
  },

  isConnected: function() {
    return !!Stripe.publishableKey;
  },

  // Get the base payment link (stored in settings)
  getBaseLink: function() {
    return localStorage.getItem('bm-stripe-base-link') || '';
  },

  // Build a payment URL for a specific dollar amount
  // Uses prefilled_quantity trick: base link product = $0.01/unit, qty = cents
  buildPayUrl: function(amountDollars, invoiceNum) {
    var base = Stripe.getBaseLink();
    if (!base) return '';
    // Card surcharge: pay link IS a card payment -> gross up by the fee.
    var qty = Math.round(Stripe.cardTotal(amountDollars) * 100);
    if (qty < 1) qty = 1;
    var sep = base.indexOf('?') >= 0 ? '&' : '?';
    var url = base + sep + 'prefilled_quantity=' + qty;
    if (invoiceNum) url += '&client_reference_id=INV-' + invoiceNum;
    return url;
  },

  SURCHARGE_CARD: true,
  cardTotal: function(amountDollars) {
    var a = parseFloat(amountDollars) || 0;
    return Stripe.SURCHARGE_CARD ? Math.round((a + Stripe.calcFees(a).card) * 100) / 100 : a;
  },

  // Get effective payment link for invoice:
  // 1. If invoice has a specific Stripe URL stored → use it
  // 2. If base link configured → auto-build with prefilled amount
  // 3. Otherwise → null
  getPaymentLink: function(invoiceId) {
    var inv = DB.invoices.getById(invoiceId);
    if (!inv) return null;
    if (inv.stripePaymentUrl) return inv.stripePaymentUrl;
    var base = Stripe.getBaseLink();
    if (base) return Stripe.buildPayUrl(inv.balance || inv.total, inv.invoiceNumber);
    return null;
  },

  // Render payment button for invoice detail
  paymentButton: function(invoiceId) {
    var inv = DB.invoices.getById(invoiceId);
    if (!inv || inv.status === 'paid') return '';

    var link = Stripe.getPaymentLink(invoiceId);

    if (!link && !Stripe.isConnected()) {
      return '<div style="margin-top:12px;padding:12px;background:var(--bg);border-radius:8px;font-size:13px;color:var(--text-light);">'
        + '💳 Set up Stripe in Settings to accept online payments'
        + '</div>';
    }

    if (link) {
      return '<div style="margin-top:12px;">'
        + '<a href="' + link + '" target="_blank" rel="noopener noreferrer" class="btn" style="background:#635bff;color:#fff;width:100%;padding:12px;font-size:15px;display:block;text-align:center;text-decoration:none;">'
        + '💳 Open Stripe — ' + UI.money(inv.balance || inv.total)
        + '</a>'
        + '<button class="btn btn-outline" style="width:100%;margin-top:6px;font-size:12px;" onclick="Stripe.sendPaymentLink(\'' + invoiceId + '\')">'
        + '📧 Email Pay Link to Client</button>'
        + '<div style="font-size:11px;color:var(--text-light);text-align:center;margin-top:4px;">Clients can also add a tip on the payment page</div>'
        + '</div>';
    }

    return '<div style="margin-top:12px;">'
      + '<button class="btn" style="background:#635bff;color:#fff;width:100%;padding:12px;font-size:15px;" onclick="Stripe.sendPaymentLink(\'' + invoiceId + '\')">'
      + '💳 Send Payment Link — ' + UI.money(inv.balance || inv.total)
      + '</button>'
      + '</div>';
  },

  // Send payment link email to client
  sendPaymentLink: function(invoiceId) {
    var inv = DB.invoices.getById(invoiceId);
    if (!inv) return;
    var client = inv.clientId ? DB.clients.getById(inv.clientId) : null;
    var email = inv.clientEmail || (client && client.email) || '';
    if (!email) { UI.toast('No email on file for this client', 'error'); return; }

    // Use InvoicesPage send flow which builds full HTML email
    if (typeof InvoicesPage !== 'undefined' && InvoicesPage._sendInvoiceEmail) {
      InvoicesPage._sendInvoiceEmail(invoiceId);
    } else {
      UI.toast('Invoice email sent to ' + email);
      DB.invoices.update(invoiceId, { paymentLinkSent: new Date().toISOString(), paymentLinkEmail: email });
    }
  },

  // Render Stripe settings section
  renderSettings: function() {
    var connected = Stripe.isConnected();
    var pk = localStorage.getItem('bm-stripe-pk') || '';
    var baseLink = Stripe.getBaseLink();

    return '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">'
      + '<div style="width:40px;height:40px;background:#635bff;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:18px;">S</div>'
      + '<div><h3 style="margin:0;">Stripe Payments</h3>'
      + '<div style="font-size:12px;color:' + (connected ? 'var(--green-dark)' : 'var(--text-light)') + ';">' + (connected ? '✅ Connected' : '⚪ Not connected') + '</div>'
      + '</div></div>'
      + '<p style="font-size:13px;color:var(--text-light);margin-bottom:16px;">Clients pay invoices online with a card. Funds deposit to your bank in 2 business days. Optional tip selection built in.</p>'
      // Fee table
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;font-size:12px;text-align:center;">'
      + '<div style="padding:10px;background:var(--bg);border-radius:8px;"><strong style="font-size:16px;">2.9%</strong><br><span style="color:var(--text-light);">+ $0.30 card</span></div>'
      + '<div style="padding:10px;background:var(--bg);border-radius:8px;"><strong style="font-size:16px;">0.8%</strong><br><span style="color:var(--text-light);">ACH transfer</span></div>'
      + '<div style="padding:10px;background:var(--bg);border-radius:8px;"><strong style="font-size:16px;">2 days</strong><br><span style="color:var(--text-light);">to your bank</span></div>'
      + '</div>'
      // Publishable key
      + UI.formField('Stripe Publishable Key', 'text', 'stripe-pk', pk, { placeholder: 'pk_live_...' })
      // Base payment link — auto-create OR paste manually
      + '<div style="background:#f3f0ff;border:1px solid #d6cbff;border-radius:8px;padding:14px 16px;margin-bottom:12px;">'
      + '<div style="font-size:13px;font-weight:700;color:#4c1d95;margin-bottom:8px;">⚡ Base Payment Link (one-time setup)</div>'
      + (baseLink
          ? '<div style="background:#fff;border:1px solid #c8e6c9;border-radius:7px;padding:10px 12px;margin-bottom:10px;">'
            + '<div style="font-size:12px;font-weight:600;color:#059669;margin-bottom:3px;">✅ Configured</div>'
            + '<div style="font-size:11px;color:var(--text-light);word-break:break-all;font-family:monospace;">' + baseLink + '</div>'
            + '</div>'
          : '<div style="font-size:12px;color:var(--text-light);margin-bottom:10px;line-height:1.5;">One Payment Link drives every invoice (each invoice prefills its own amount). Click the button below — BM will create it via Stripe API in seconds. Or paste an existing link manually.</div>'
            + '<div style="background:#fff;border-radius:7px;padding:10px 12px;margin-bottom:8px;">'
            + '<div style="font-size:12px;font-weight:600;margin-bottom:6px;">🚀 Create automatically</div>'
            + '<input type="password" id="stripe-sk" placeholder="sk_live_... (Stripe secret key, used once, not stored)" autocomplete="off" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:monospace;margin-bottom:6px;box-sizing:border-box;">'
            + '<div style="font-size:10px;color:var(--text-light);margin-bottom:8px;">Get it: <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">dashboard.stripe.com/apikeys</a> → reveal "Secret key"</div>'
            + '<button type="button" onclick="Stripe.autoCreateLink()" style="background:#635bff;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;width:100%;">Create Payment Link automatically</button>'
            + '</div>'
            + '<div style="text-align:center;font-size:10px;color:var(--text-light);margin:8px 0;text-transform:uppercase;letter-spacing:.06em;">Or paste manually</div>')
      + UI.formField('Base Payment Link URL', 'text', 'stripe-base-link', baseLink, { placeholder: 'https://buy.stripe.com/...' })
      + '</div>'
      // Webhook auto-mark-paid section
      + '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;margin-bottom:12px;">'
      + '<div style="font-size:13px;font-weight:700;color:#14532d;margin-bottom:6px;">🔔 Auto-Mark Paid (Webhook)</div>'
      + '<div style="font-size:12px;color:#166534;margin-bottom:8px;">When a client pays, the invoice automatically flips to <strong>Paid</strong> and you get an email — no manual work.</div>'
      + '<div style="background:#fff;border-radius:6px;padding:8px 10px;font-size:11px;color:#374151;margin-bottom:8px;font-family:monospace;word-break:break-all;">'
      + '📡 Webhook URL:<br>'
      + '<strong>https://ltpivkqahvplapyagljt.supabase.co/functions/v1/stripe-webhook</strong>'
      + '</div>'
      + '<div style="font-size:11px;color:#166534;margin-bottom:6px;"><strong>One-time setup steps:</strong></div>'
      + '<ol style="font-size:11px;color:#166534;margin:0 0 8px 16px;line-height:1.7;">'
      + '<li><a href="https://dashboard.stripe.com/webhooks/create" target="_blank" rel="noopener noreferrer" style="color:#059669;">Stripe → Developers → Webhooks → Add endpoint</a></li>'
      + '<li>Paste the URL above → Events: <code>checkout.session.completed</code></li>'
      + '<li>Copy the "Signing secret" (whsec_...) — paste in terminal:<br>'
      + '<code style="background:#dcfce7;padding:2px 4px;border-radius:3px;">supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...</code></li>'
      + '<li>Set Payment Link success URL → <code>https://branchmanager.app/paid.html</code></li>'
      + '</ol>'
      + '<div style="font-size:11px;color:#6b7280;">Also deploy the Edge Function: <code>supabase functions deploy stripe-webhook --no-verify-jwt</code></div>'
      + '</div>'
      // Action buttons
      + '<div style="display:flex;gap:8px;">'
      + '<button class="btn btn-primary" onclick="Stripe.saveSettings()">Save Settings</button>'
      + '<a href="https://dashboard.stripe.com/payment-links/create" target="_blank" rel="noopener noreferrer" class="btn btn-outline">Create Payment Link →</a>'
      + (connected ? '<button class="btn btn-outline" onclick="Stripe.disconnect()">Disconnect</button>' : '')
      + '</div>'
      + '<p style="font-size:11px;color:var(--text-light);margin-top:8px;">Publishable key from <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" style="color:var(--green-dark);">dashboard.stripe.com/apikeys</a></p>'
      + '</div>';
  },

  // Returns the current Supabase Auth session JWT or null. Used to gate
  // owner-only edge functions (save-stripe-secret, stripe-create-link,
  // transition-blast). Without this header the edge fn returns 401, which
  // stops the prior money-grade exploit where any caller could PATCH a
  // tenant's stripe_secret_key to attacker-controlled sk_live_...
  _getOwnerJwt: async function() {
    try {
      if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client) return null;
      var s = await SupabaseDB.client.auth.getSession();
      return (s && s.data && s.data.session && s.data.session.access_token) || null;
    } catch (e) { return null; }
  },

  saveSecretKey: async function() {
    var el = document.getElementById('stripe-sk-save');
    var sk = el ? el.value.trim() : '';
    if (!sk || !sk.startsWith('sk_')) {
      UI.toast('Paste your Stripe secret key (starts with sk_)', 'error');
      if (el) el.focus();
      return;
    }
    var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    if (!tid) { UI.toast('No tenant — sign in?', 'error'); return; }
    var jwt = await Stripe._getOwnerJwt();
    if (!jwt) { UI.toast('Sign in required to save Stripe key (owner-only)', 'error'); return; }
    UI.toast('Verifying with Stripe…');
    fetch('https://ltpivkqahvplapyagljt.supabase.co/functions/v1/save-stripe-secret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
      body: JSON.stringify({ tenantId: tid, secretKey: sk, verify: true })
    }).then(function(r) { return r.json(); }).then(function(res) {
      if (el) el.value = '';
      if (!res || !res.ok) { UI.toast('Save failed: ' + ((res && res.error) || 'unknown'), 'error'); return; }
      UI.toast('✓ Stripe secret saved — embedded payments enabled');
    }).catch(function(e) { UI.toast('Network error: ' + e.message, 'error'); });
  },

  autoCreateLink: async function() {
    var skEl = document.getElementById('stripe-sk');
    var sk = skEl ? skEl.value.trim() : '';
    if (!sk || !sk.startsWith('sk_')) {
      UI.toast('Paste your Stripe secret key (starts with sk_)', 'error');
      if (skEl) skEl.focus();
      return;
    }
    var jwt = await Stripe._getOwnerJwt();
    if (!jwt) { UI.toast('Sign in required to create Payment Link (owner-only)', 'error'); return; }
    UI.toast('Creating Payment Link with Stripe…');
    var SUPA_URL = 'https://ltpivkqahvplapyagljt.supabase.co';
    fetch(SUPA_URL + '/functions/v1/stripe-create-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
      body: JSON.stringify({
        secretKey: sk,
        successUrl: 'https://branchmanager.app/paid.html',
        productName: 'Service Invoice',
        tenantId: (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null
      })
    }).then(function(r) { return r.json(); }).then(function(res) {
      if (skEl) skEl.value = '';  // wipe sk from DOM regardless
      if (!res || !res.ok || !res.url) {
        UI.toast('Stripe error: ' + ((res && res.error) || 'unknown'), 'error');
        return;
      }
      // Save link via the normal save path so localStorage + tenants.config stay in sync
      var linkInput = document.getElementById('stripe-base-link');
      if (linkInput) linkInput.value = res.url;
      Stripe.saveSettings();
      UI.toast('✓ Payment Link created and saved');
    }).catch(function(e) {
      UI.toast('Network error: ' + e.message, 'error');
    });
  },

  saveSettings: function() {
    var pk = document.getElementById('stripe-pk') ? document.getElementById('stripe-pk').value.trim() : '';
    var baseLink = document.getElementById('stripe-base-link') ? document.getElementById('stripe-base-link').value.trim() : '';

    if (pk && !pk.startsWith('pk_')) { UI.toast('Key should start with pk_live_ or pk_test_', 'error'); return; }
    if (baseLink && !baseLink.startsWith('https://')) { UI.toast('Payment link must start with https://', 'error'); return; }

    if (pk) { localStorage.setItem('bm-stripe-pk', pk); Stripe.publishableKey = pk; }
    if (baseLink !== undefined) {
      if (baseLink) localStorage.setItem('bm-stripe-base-link', baseLink);
      else localStorage.removeItem('bm-stripe-base-link');
    }

    // Also push base_link to tenants.config so pay.html (running in CUSTOMER's
    // browser, no access to Doug's localStorage) can read it. Without this the
    // public Pay page will show "Online payment not set up yet" forever.
    Stripe._pushBaseLinkToTenant(baseLink);

    UI.toast('Stripe settings saved ✓');
    loadPage('settings');
  },

  _pushBaseLinkToTenant: function(baseLink) {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client) return;
    var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    if (!tid) return;
    // Read existing config, merge, write back. jsonb update without a stored
    // proc requires read-modify-write client-side.
    SupabaseDB.client.from('tenants').select('config').eq('id', tid).single().then(function(res) {
      if (res.error) { console.warn('[Stripe] tenant fetch failed:', res.error.message); return; }
      var cfg = (res.data && res.data.config) || {};
      if (baseLink) cfg.stripe_base_link = baseLink;
      else delete cfg.stripe_base_link;
      SupabaseDB.client.from('tenants').update({ config: cfg }).eq('id', tid).then(function(res2) {
        if (res2.error) console.warn('[Stripe] tenant update failed:', res2.error.message);
      });
    });
  },

  saveKey: function() { Stripe.saveSettings(); },

  disconnect: function() {
    localStorage.removeItem('bm-stripe-pk');
    localStorage.removeItem('bm-stripe-base-link');
    Stripe.publishableKey = null;
    UI.toast('Stripe disconnected');
    loadPage('settings');
  },

  calcFees: function(amount) {
    var cardFee = Math.round((amount * 0.029 + 0.30) * 100) / 100;
    var achFee = Math.round((Math.min(amount * 0.008, 5)) * 100) / 100;
    return { card: cardFee, ach: achFee, cardNet: amount - cardFee, achNet: amount - achFee };
  }
};

Stripe.init();
