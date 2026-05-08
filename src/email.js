/**
 * Branch Manager — Email Sending
 * v372: Email provider switched from SendGrid → Resend (SendGrid trial ends
 * May 22, 2026). Resend is configured server-side as RESEND_API_KEY in the
 * Supabase send-email edge function — clients no longer carry an API key.
 * Falls back to mailto: if the user is offline / function fails.
 */
var Email = {
  init: function() {
    // One-shot migrate the legacy bm-sendgrid-key into a deprecated slot
    // so it stops syncing across devices but isn't silently lost. Safe to
    // delete this whole branch a few weeks after v372 ships.
    if (localStorage.getItem('bm-sendgrid-key')) {
      try { localStorage.setItem('bm-sendgrid-key-deprecated', localStorage.getItem('bm-sendgrid-key')); } catch(e){}
      try { localStorage.removeItem('bm-sendgrid-key'); } catch(e){}
    }
  },

  // Kept as a stub so existing callers (jobs.js, requests.js, workflow.js,
  // weeklysummary.js) don't need to change. Resend lives server-side.
  isConfigured: function() { return true; },

  _isValidEmail: function(e) { return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); },

  // Deliverability guard — refuse to re-send to addresses Resend has marked
  // bounced/complained (resend-webhook edge fn flips clients.email_status).
  // Lookup is best-effort: if Supabase is slow/unreachable or the column
  // doesn't exist yet, ALLOW the send. Never block on a slow query.
  _isBlockedRecipient: async function(to) {
    try {
      // BM's Supabase singleton is named SupabaseDB.client (not Supacloud).
      if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client) return false;
      var lookup = SupabaseDB.client
        .from('clients')
        .select('email_status')
        .ilike('email', to)
        .limit(1);
      // Race a 1.5s timeout so a hung request doesn't block outbound email.
      var timeout = new Promise(function(resolve){ setTimeout(function(){ resolve({ data: null, error: 'timeout' }); }, 1500); });
      var result = await Promise.race([lookup, timeout]);
      if (!result || result.error || !result.data || !result.data.length) return false;
      var status = result.data[0].email_status;
      return status === 'bounced' || status === 'complained';
    } catch (e) {
      console.warn('[Email] deliverability lookup failed (allowing send):', e);
      return false;
    }
  },

  _mailto: function(to, subject, body) {
    window.open('mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body));
  },

  // Send via Supabase send-email edge function → Resend
  send: async function(to, subject, body, options) {
    options = options || {};

    if (!Email._isValidEmail(to)) {
      UI.toast('Invalid recipient: ' + to, 'error');
      return { success: false, method: 'invalid', error: 'bad recipient' };
    }

    // Deliverability guard — skip known-bad recipients (hard bounce / spam
    // complaint flagged by resend-webhook). Lookup is fail-open via timeout.
    var blocked = await Email._isBlockedRecipient(to);
    if (blocked) {
      if (!options.silent) UI.toast('Skipped: ' + to + ' is on bounce/complaint list', 'error');
      return { success: false, method: 'blocked', error: 'recipient flagged bounced/complained' };
    }

    var SUPA_URL = 'https://ltpivkqahvplapyagljt.supabase.co';
    var payload = {
      to: to, subject: subject,
      text: body,
      html: options.htmlBody || Email.htmlWrap(body)
    };
    if (options.replyTo) payload.replyTo = options.replyTo;
    if (options.from) payload.from = options.from;

    // v671: white-label per-tenant FROM. If the tenant's subscription tier
    // unlocks `email_per_tenant` (Crew+) AND the caller didn't pass an
    // explicit `from`, derive FROM/replyTo from CompanyInfo so emails go out
    // as the tenant's own brand. Solo tier and missing-config tenants fall
    // through to the server-side RESEND_PLATFORM_FROM default.
    if (!payload.from && typeof Subscription !== 'undefined' && Subscription.canUseFeature && Subscription.canUseFeature('email_per_tenant')) {
      try {
        var coName = (typeof CompanyInfo !== 'undefined' && CompanyInfo.get('name')) || '';
        var coEmail = (typeof CompanyInfo !== 'undefined' && CompanyInfo.get('email')) || '';
        if (coName && coEmail && coEmail.indexOf('@') >= 0) {
          payload.from = coName + ' <' + coEmail + '>';
          if (!payload.replyTo) payload.replyTo = coEmail;
        }
      } catch(e) {}
    }

    var attempt = async function() {
      return fetch(SUPA_URL + '/functions/v1/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    };

    try {
      var response = await attempt();
      if ((response.status >= 500 || response.status === 429)) {
        await new Promise(function(r){ setTimeout(r, 700); });
        response = await attempt();
      }

      if (response.ok) {
        if (!options.silent) UI.toast('Email sent to ' + to);
        return { success: true, method: 'resend', status: response.status };
      }

      var errText = await response.text();
      var hint;
      if (response.status === 401 || response.status === 403) hint = 'Resend key invalid (check RESEND_API_KEY secret)';
      else if (response.status === 400) hint = 'Bad request (likely unverified sender)';
      else if (response.status === 429) hint = 'Rate limited — try later';
      else hint = 'Resend ' + response.status;
      console.warn('[Email] send failed:', response.status, errText);
      // Silent mode (batch automations): don't toast, don't open mailto on every failure.
      // The async toast/mailto used to fire AFTER UI.toast was restored in
      // automations._autoRun's finally block — turning a key-broken Resend into a
      // 21-toast + 21-mailto-popup avalanche on app startup.
      if (!options.silent) {
        UI.toast('Email failed: ' + hint + ' — opening mail app', 'error');
        Email._mailto(to, subject, body);
      }
      return { success: false, method: 'resend_error', status: response.status, error: errText, hint: hint };
    } catch (e) {
      console.warn('[Email] network error:', e);
      if (!options.silent) {
        UI.toast('Email failed: network — opening mail app', 'error');
        Email._mailto(to, subject, body);
      }
      return { success: false, method: 'mailto_fallback', error: e.message };
    }
  },

  sendTemplate: function(templateKey, clientData) {
    var t = Templates.library[templateKey];
    if (!t) { UI.toast('Template not found', 'error'); return; }
    if (!clientData.email) { UI.toast('No email on file for ' + (clientData.name || 'this client'), 'error'); return; }

    var subject = t.subject ? Templates.fill(t.subject, clientData) : BM_CONFIG.companyName;
    var body = Templates.fill(t.body, clientData);

    Email.send(clientData.email, subject, body);

    if (clientData.id && typeof CommsLog !== 'undefined') {
      var key = 'bm-comms-' + clientData.id;
      var all = [];
      try { all = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
      all.unshift({
        id: Date.now().toString(36),
        clientId: clientData.id,
        type: 'email',
        direction: 'outbound',
        notes: 'Sent: ' + (t.name || templateKey) + ' — ' + subject,
        date: new Date().toISOString(),
        user: 'Doug'
      });
      localStorage.setItem(key, JSON.stringify(all));
    }
  },

  htmlWrap: function(bodyText) {
    var htmlBody = bodyText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/(https?:\/\/[^\s\n<]+)/g, '<a href="$1" style="color:#00836c;font-weight:600;">$1</a>')
      .replace(/\n\n/g, '</p><p style="margin:0 0 12px;">')
      .replace(/\n/g, '<br>');

    return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
      + '<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,sans-serif;">'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">'
      + '<tr><td align="center">'
      + '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">'
      + '<tr><td style="background:#1a3c12;padding:24px 32px;">'
      + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
      + '<td><div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-.3px;">' + BM_CONFIG.companyName + '</div>'
      + '<div style="font-size:12px;color:#a8d5a2;margin-top:3px;">' + BM_CONFIG.tagline + '</div></td>'
      + '</tr></table></td></tr>'
      + '<tr><td style="padding:32px;font-size:15px;line-height:1.7;color:#333333;">'
      + '<p style="margin:0 0 12px;">' + htmlBody + '</p>'
      + '</td></tr>'
      + '<tr><td style="background:#f8f8f8;padding:20px 32px;border-top:1px solid #e8e8e8;text-align:center;">'
      + '<div style="font-size:13px;color:#888;line-height:1.6;">'
      + '<strong style="color:#555;">' + BM_CONFIG.companyName + '</strong><br>'
      + '<a href="tel:' + BM_CONFIG.phoneDigits + '" style="color:#00836c;text-decoration:none;">' + BM_CONFIG.phone + '</a> &nbsp;·&nbsp; '
      + '<a href="mailto:' + BM_CONFIG.email + '" style="color:#00836c;text-decoration:none;">' + BM_CONFIG.email + '</a> &nbsp;·&nbsp; '
      + '<a href="' + BM_CONFIG.websiteUrl + '" style="color:#00836c;text-decoration:none;">' + BM_CONFIG.website + '</a>'
      + '</div>'
      + '<div style="font-size:11px;color:#aaa;margin-top:8px;">You received this because you contacted ' + BM_CONFIG.companyName + '.</div>'
      + '</td></tr>'
      + '</table>'
      + '</td></tr></table>'
      + '</body></html>';
  },

  // Settings UI — now a status panel only (no key field; Resend is server-keyed)
  renderSettings: function() {
    return '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">'
      + '<div style="width:40px;height:40px;background:#000;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px;">RS</div>'
      + '<div><h3 style="margin:0;">Resend Email</h3>'
      + '<div style="font-size:12px;color:var(--green-dark);">Connected (server-side key)</div>'
      + '</div></div>'
      + '<p style="font-size:13px;color:var(--text-light);margin-bottom:12px;">Outbound email goes through Resend via the <code>send-email</code> Supabase edge function. Free at our volume.</p>'
      + '<div style="display:flex;gap:8px;">'
      + '<button onclick="Email.testSend()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;">Test Send</button>'
      + '</div>'
      + '<p style="font-size:11px;color:var(--text-light);margin-top:8px;">From address: onboarding@resend.dev (until <code>peekskilltree.com</code> is DNS-verified in Resend, then we can switch to <code>info@peekskilltree.com</code>).</p>'
      + '</div>';
  },

  // Legacy — kept so any old call site doesn't 500. No-op.
  saveKey: function() {
    UI.toast('Resend is configured server-side — no client key needed', 'info');
  },

  testSend: function() {
    Email.send(BM_CONFIG.email, 'Branch Manager Test Email',
      'This is a test email from Branch Manager.\n\nIf you received this, email sending is working!\n\n— Branch Manager');
  }
};

Email.init();
