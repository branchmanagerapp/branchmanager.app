/**
 * Branch Manager — Email & SMS Templates
 * Pre-built templates for all automation triggers
 * Variables: {{name}}, {{company}}, {{phone}}, {{amount}}, {{date}}, {{jobNumber}}, {{quoteNumber}}, {{invoiceNumber}}, {{address}}
 */
var Templates = {
  // All templates
  library: {
    // ── Request Received ──
    request_received_email: {
      name: 'Request Received',
      trigger: 'New request submitted',
      channel: 'email',
      subject: 'We received your request — {{companyName}}',
      body: 'Hi {{name}},\n\nThanks for reaching out to {{companyName}}! We received your request for service at {{address}}.\n\nWe\'ll review your request and get back to you within 2 hours during business hours to schedule a free on-site estimate.\n\nIf you need immediate assistance, call us at {{companyPhone}}.\n\nTalk soon,\n{{ownerName}}\n{{companyName}}\n{{companyWebsite}}'
    },
    request_received_sms: {
      name: 'Request Received',
      trigger: 'New request submitted',
      channel: 'sms',
      body: 'Hi {{name}}, thanks for your request! We got it and will be in touch within 2 hours to schedule your free estimate. — Doug, {{companyName}} {{companyPhone}}'
    },

    // ── Quote Sent ──
    quote_sent_email: {
      name: 'Quote Sent',
      trigger: 'Quote sent to client',
      channel: 'email',
      subject: 'Your estimate from {{companyName}} — Quote #{{quoteNumber}}',
      body: 'Hi {{name}},\n\nThanks for having us out to take a look. Attached is your estimate for the work we discussed at {{address}}.\n\nQuote #{{quoteNumber}}\nTotal: {{amount}}\n\nTo approve this quote, just reply "approved" to this email or call {{companyPhone}}. We can usually schedule within 1-2 weeks of approval.\n\nLet me know if you have any questions!\n\n{{ownerName}}\n{{companyName}}'
    },
    quote_sent_sms: {
      name: 'Quote Sent',
      trigger: 'Quote sent to client',
      channel: 'sms',
      body: 'Hi {{name}}, your estimate (#{{quoteNumber}}) for {{amount}} is ready! Reply YES to approve or call {{companyPhone}} with questions. — Doug, {{companyName}}'
    },

    // ── Quote Follow-Up (5 days) ──
    quote_followup_5d_email: {
      name: 'Quote Follow-Up (5 days)',
      trigger: '5 days after quote sent, no response',
      channel: 'email',
      subject: 'Quick follow-up on Quote #{{quoteNumber}} — {{amount}}',
      body: 'Hi {{name}},\n\nJust checking in on the estimate I sent for the work at {{address}}.\n\n  Quote #{{quoteNumber}} — {{amount}}\n  Expires: {{expiresAt}}\n\nReady to move forward? Approve in one tap:\n{{approvalLink}}\n\nQuestions or want to adjust scope? Just reply or call {{companyPhone}}.\n\nThanks,\n{{ownerName}}\n{{companyName}}'
    },

    // ── Quote Follow-Up (10 days) ──
    quote_followup_10d_email: {
      name: 'Quote Follow-Up (10 days)',
      trigger: '10 days after quote sent, no response',
      channel: 'email',
      subject: 'Last call: Quote #{{quoteNumber}} expires soon',
      body: 'Hi {{name}},\n\nThis is a final reminder on the estimate for {{address}}. The quote expires {{expiresAt}} — after that we\'ll need to re-quote at current rates.\n\n  Quote #{{quoteNumber}} — {{amount}}\n\nApprove now: {{approvalLink}}\n\nIf you\'ve gone another direction or the timing isn\'t right, just hit reply with "close" and I\'ll archive the file. No hard feelings.\n\nEither way, thanks for considering us.\n\n{{ownerName}}\n{{companyName}}\n{{companyPhone}}'
    },

    // ── Booking Confirmation ──
    booking_confirm_email: {
      name: 'Booking Confirmation',
      trigger: 'Job scheduled',
      channel: 'email',
      subject: 'Your tree service is scheduled — {{date}}',
      body: 'Hi {{name}},\n\nGreat news — your tree service is confirmed!\n\nJob #{{jobNumber}}\nDate: {{date}}\nLocation: {{address}}\n\nOur crew will arrive between 8-9am. Please make sure we have access to the work area. We\'ll give you a call when we\'re on our way.\n\nIf you need to reschedule, just reply to this email or call {{companyPhone}}.\n\nSee you then!\n{{ownerName}}\n{{companyName}}'
    },
    booking_confirm_sms: {
      name: 'Booking Confirmation',
      trigger: 'Job scheduled',
      channel: 'sms',
      body: 'Hi {{name}}, your tree service (Job #{{jobNumber}}) is confirmed for {{date}} at {{address}}. Crew arrives 8-9am. Call {{companyPhone}} to reschedule. — {{companyName}}'
    },

    // ── Visit Reminder (1 day before) ──
    visit_reminder_email: {
      name: 'Visit Reminder (1 day)',
      trigger: '1 day before scheduled visit',
      channel: 'email',
      subject: 'Tomorrow: Tree service at {{address}} — {{date}}',
      body: 'Hi {{name}},\n\nQuick reminder — our crew arrives at {{address}} tomorrow.\n\n  Job #{{jobNumber}}\n  Date: {{date}}\n  Arrival window: 8-9 AM\n\nBefore we get there:\n  • Move vehicles, patio furniture, grills, or anything fragile away from the work area\n  • Make sure side gates / driveway are accessible\n  • Pets indoors if possible (saws are loud)\n\nNeed to reschedule? Tap to call: tel:{{companyPhone}}\n\nWe\'ll text you when the crew is on the way.\n\n{{ownerName}}\n{{companyName}}'
    },
    visit_reminder_sms: {
      name: 'Visit Reminder (1 hr)',
      trigger: '1 hour before scheduled visit',
      channel: 'sms',
      body: 'Hi {{name}}, reminder: our crew is headed to {{address}} shortly for your tree service (Job #{{jobNumber}}). See you soon! — {{companyName}}'
    },

    // ── Invoice Sent ──
    invoice_sent_email: {
      name: 'Invoice Sent',
      trigger: 'Invoice sent to client',
      channel: 'email',
      subject: 'Invoice #{{invoiceNumber}} from {{companyName}} — {{amount}}',
      body: 'Hi {{name}},\n\nThanks for choosing {{companyName}}! Attached is your invoice for the completed work.\n\nInvoice #{{invoiceNumber}}\nAmount: {{amount}}\nDue: {{date}}\n\nPayment methods:\n• Check: Payable to "{{companyName}}"\n• Card: [Payment link included when Stripe is connected]\n\nThank you for your business!\n\n{{ownerName}}\n{{companyName}}\n{{companyPhone}}'
    },

    // ── Invoice Follow-Up (1 day overdue) ──
    invoice_followup_1d_email: {
      name: 'Invoice Follow-Up (1 day)',
      trigger: '1 day after invoice due date',
      channel: 'email',
      subject: 'Reminder: Invoice #{{invoiceNumber}} — {{amount}}',
      body: 'Hi {{name}},\n\nFriendly reminder — invoice #{{invoiceNumber}} for {{amount}} was due yesterday.\n\nPay online (1 minute, card or Apple Pay):\n{{payLink}}\n\nIf payment is already on the way, ignore this. Otherwise hit the link above or call {{companyPhone}}.\n\nThanks,\n{{ownerName}}\n{{companyName}}'
    },

    // ── Invoice Follow-Up (4 days overdue) ──
    invoice_followup_4d_email: {
      name: 'Invoice Follow-Up (4 days)',
      trigger: '4 days after invoice due date',
      channel: 'email',
      subject: 'Action needed: Invoice #{{invoiceNumber}} is 4 days past due',
      body: 'Hi {{name}},\n\nInvoice #{{invoiceNumber}} for {{amount}} is now 4 days past due.\n\nPlease pay today to keep things current:\n{{payLink}}\n\nIf there\'s an issue with the invoice or you need to set up a payment plan, please reply or call {{companyPhone}} so we can sort it out.\n\nThanks for your prompt attention,\n{{ownerName}}\n{{companyName}}'
    },

    // ── Review Request ──
    review_request_email: {
      name: 'Review Request',
      trigger: '2 days after job completed',
      channel: 'email',
      subject: 'How did we do? — {{companyName}}',
      body: 'Hi {{name}},\n\nThanks again for choosing {{companyName}} for your recent tree work at {{address}}.\n\nWe\'d love to hear how we did! A 30-second Google review helps us reach more homeowners in the area:\n\n{{reviewLink}}\n\nThanks for the support!\n{{ownerName}}\n{{companyName}}'
    },
    review_request_sms: {
      name: 'Review Request',
      trigger: '2 days after job completed',
      channel: 'sms',
      body: 'Hi {{name}}, thanks for choosing {{companyName}}! If you were happy with our work, we\'d love a quick Google review: {{reviewLink}} — Thank you! {{ownerName}}'
    },

    // ── Quote Approval Confirmation (auto-sent when client approves) ──
    quote_approved_email: {
      name: 'Quote Approval Confirmation',
      trigger: 'Client approves quote on approve.html',
      channel: 'email',
      subject: 'Approved! Quote #{{quoteNumber}} — next steps',
      body: 'Hi {{name}},\n\nGreat — you\'re on the schedule. Quote #{{quoteNumber}} for {{amount}} is approved.\n\nWhat happens next:\n  1. We\'ll reach out within 1 business day to lock in a date\n  2. We typically schedule within 1-2 weeks\n  3. The day before, you\'ll get a reminder + access prep checklist\n  4. Day-of: we text when the crew is on the way\n\nIf you need to discuss anything before scheduling, reply or call {{companyPhone}}.\n\nThanks for choosing {{companyName}}!\n\n{{ownerName}}'
    }
  },

  // Fill template variables
  fill: function(template, data) {
    var text = template;
    var base = (typeof location !== 'undefined') ? (location.origin + location.pathname.replace(/[^/]*$/, '')) : 'https://branchmanager.app/';
    // v754: pull company strings from CompanyInfo (which checks localStorage
    // overrides first) instead of raw BM_CONFIG. Was: tenant-customized
    // companyName/phone/email/etc never reached outbound SMS or email
    // because Templates.fill hardcoded SNT defaults via BM_CONFIG.
    var ci = (typeof CompanyInfo !== 'undefined') ? CompanyInfo : null;
    var get = function(key, fallback) {
      try { return ci ? (ci.get(key) || fallback) : fallback; } catch (e) { return fallback; }
    };
    var vars = {
      '{{name}}': data.name || data.clientName || '',
      '{{company}}': data.company || '',
      '{{phone}}': data.phone || data.clientPhone || '',
      '{{email}}': data.email || data.clientEmail || '',
      '{{amount}}': data.amount || data.total ? UI.money(data.amount || data.total) : '',
      '{{date}}': data.date ? UI.dateShort(data.date) : '',
      '{{expiresAt}}': data.expiresAt ? UI.dateShort(data.expiresAt) : '',
      '{{address}}': data.address || data.property || '',
      '{{jobNumber}}': data.jobNumber || '',
      '{{quoteNumber}}': data.quoteNumber || '',
      '{{invoiceNumber}}': data.invoiceNumber || '',
      '{{quoteId}}': data.quoteId || data.id || '',
      '{{invoiceId}}': data.invoiceId || data.id || '',
      '{{approvalLink}}': data.approvalLink || (data.quoteId || data.id ? base + 'approve.html?id=' + (data.quoteId || data.id) : ''),
      '{{payLink}}': data.payLink || (data.invoiceId || data.id ? base + 'pay.html?id=' + (data.invoiceId || data.id) : ''),
      '{{reviewLink}}': get('googleReviewUrl', data.reviewLink || (BM_CONFIG && BM_CONFIG.googleReviewUrl) || ''),
      '{{companyName}}': get('name', BM_CONFIG && BM_CONFIG.companyName),
      '{{companyPhone}}': get('phone', BM_CONFIG && BM_CONFIG.phone),
      '{{companyEmail}}': get('email', BM_CONFIG && BM_CONFIG.email),
      '{{companyWebsite}}': get('website', BM_CONFIG && BM_CONFIG.website),
      '{{ownerName}}': get('ownerName', (BM_CONFIG && BM_CONFIG.ownerName) || '')
    };
    Object.keys(vars).forEach(function(key) {
      text = text.split(key).join(vars[key]);
    });
    return text;
  },

  // Get templates by trigger
  getByTrigger: function(trigger) {
    return Object.values(Templates.library).filter(function(t) {
      return t.trigger.toLowerCase().includes(trigger.toLowerCase());
    });
  },

  // Render template editor
  renderEditor: function(templateKey) {
    var t = Templates.library[templateKey];
    if (!t) return '';

    // Check for custom override
    var custom = localStorage.getItem('bm-template-' + templateKey);
    var currentBody = custom || t.body;
    var currentSubject = t.subject ? (localStorage.getItem('bm-template-subj-' + templateKey) || t.subject) : null;

    var html = '<div style="background:var(--white);border-radius:10px;padding:16px;border:1px solid var(--border);margin-bottom:12px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      + '<div><strong style="font-size:14px;">' + t.name + '</strong>'
      + '<span style="font-size:11px;padding:2px 8px;background:' + (t.channel === 'sms' ? '#e3f2fd' : '#f3e5f5') + ';border-radius:4px;margin-left:6px;">' + t.channel.toUpperCase() + '</span></div>'
      + '<span style="font-size:11px;color:var(--text-light);">' + t.trigger + '</span></div>';

    if (currentSubject) {
      html += '<input type="text" id="tpl-subj-' + templateKey + '" value="' + currentSubject.replace(/"/g, '&quot;') + '" style="width:100%;padding:8px;border:2px solid var(--border);border-radius:6px;font-size:13px;margin-bottom:6px;" placeholder="Subject">';
    }
    html += '<textarea id="tpl-body-' + templateKey + '" rows="4" style="width:100%;padding:8px;border:2px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;">' + currentBody + '</textarea>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">'
      + '<span style="font-size:10px;color:var(--text-light);">Variables: {{name}} {{address}} {{amount}} {{date}} {{jobNumber}} {{quoteNumber}} {{invoiceNumber}}</span>'
      + '<div style="display:flex;gap:4px;">'
      + (custom ? '<button onclick="Templates.resetTemplate(\'' + templateKey + '\')" style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;">Reset</button>' : '')
      + '<button onclick="Templates.saveTemplate(\'' + templateKey + '\')" style="background:var(--green-dark);color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:600;">Save</button>'
      + '</div></div></div>';
    return html;
  },

  saveTemplate: function(key) {
    var bodyEl = document.getElementById('tpl-body-' + key);
    var subjEl = document.getElementById('tpl-subj-' + key);
    if (bodyEl) localStorage.setItem('bm-template-' + key, bodyEl.value);
    if (subjEl) localStorage.setItem('bm-template-subj-' + key, subjEl.value);
    UI.toast('Template saved');
  },

  resetTemplate: function(key) {
    localStorage.removeItem('bm-template-' + key);
    localStorage.removeItem('bm-template-subj-' + key);
    UI.toast('Reset to default');
    loadPage('automations');
  }
};
