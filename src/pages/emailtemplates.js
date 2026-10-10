/**
 * Branch Manager — Email Templates
 * Pre-built and custom email templates with merge fields.
 * Used by Automations, Comms, and manual sends.
 *
 * Templates stored in localStorage key 'bm-email-templates'
 * Merge fields: {{clientName}}, {{jobNumber}}, {{quoteTotal}}, etc.
 */
var EmailTemplates = {
  render: function() { return EmailTemplates.renderSettings(); },

  STORAGE_KEY: 'bm-email-templates',

  // All available merge fields with descriptions and sample data
  MERGE_FIELDS: {
    clientName:      { label: 'Client Name',        sample: 'John Smith' },
    clientFirstName: { label: 'Client First Name',  sample: 'John' },
    clientEmail:     { label: 'Client Email',       sample: 'john@example.com' },
    clientPhone:     { label: 'Client Phone',       sample: '(914) 555-1234' },
    jobNumber:       { label: 'Job #',              sample: 'JOB-1042' },
    jobDescription:  { label: 'Job Description',    sample: 'Remove dead oak tree in backyard' },
    jobDate:         { label: 'Job Date',           sample: 'April 15, 2026' },
    jobTotal:        { label: 'Job Total',          sample: '$2,400.00' },
    quoteNumber:     { label: 'Quote #',            sample: 'QTE-0587' },
    quoteTotal:      { label: 'Quote Total',        sample: '$2,400.00' },
    quoteDate:       { label: 'Quote Date',         sample: 'March 25, 2026' },
    quoteExpiry:     { label: 'Quote Expiry',       sample: 'April 25, 2026' },
    invoiceNumber:   { label: 'Invoice #',          sample: 'INV-0893' },
    invoiceTotal:    { label: 'Invoice Total',      sample: '$2,400.00' },
    invoiceDueDate:  { label: 'Invoice Due Date',   sample: 'April 1, 2026' },
    invoiceBalance:  { label: 'Invoice Balance',    sample: '$2,400.00' },
    companyName:     { label: 'Company Name',       sample: BM_CONFIG.companyName },
    companyPhone:    { label: 'Company Phone',      sample: BM_CONFIG.phone },
    reviewLink:      { label: 'Google Review Link', sample: BM_CONFIG.googleReviewUrl }
  },

  // ─── Default Templates ───────────────────────────────────────

  _defaults: {
    quoteFollowup5: {
      id: 'quoteFollowup5',
      name: 'Quote Follow-up (5 Days)',
      category: 'quotes',
      isDefault: true,
      subject: 'Following up on your tree service quote #{{quoteNumber}}',
      body: 'Hi {{clientFirstName}},\n\n'
        + 'I wanted to follow up on the estimate we put together for you on {{quoteDate}} for {{jobDescription}}.\n\n'
        + 'Your quote (#{{quoteNumber}}) came to {{quoteTotal}}. If you have any questions about the scope of work or pricing, I am happy to walk through it with you.\n\n'
        + 'We have availability coming up soon and would love to get you on the schedule. Just reply to this email or give us a call at {{companyPhone}} to get started.\n\n'
        + 'Thanks,\n'
        + CompanyInfo.get('ownerName') + '\n'
        + '{{companyName}}\n'
        + '{{companyPhone}}'
    },

    quoteFollowup10: {
      id: 'quoteFollowup10',
      name: 'Quote Follow-up (10 Days)',
      category: 'quotes',
      isDefault: true,
      subject: 'Still interested? Your quote #{{quoteNumber}} is ready to go',
      body: 'Hi {{clientFirstName}},\n\n'
        + 'Just checking in one more time on your tree service quote (#{{quoteNumber}}) from {{quoteDate}}.\n\n'
        + 'The total was {{quoteTotal}} for {{jobDescription}}. This quote is valid through {{quoteExpiry}}, so there is still time to lock in the price.\n\n'
        + 'If your plans have changed or you went in a different direction, no worries at all. But if you are still thinking it over, I am here to answer any questions.\n\n'
        + 'You can reach me directly at {{companyPhone}} or just reply to this email.\n\n'
        + 'Best,\n'
        + CompanyInfo.get('ownerName') + '\n'
        + '{{companyName}}'
    },

    invoiceReminder1: {
      id: 'invoiceReminder1',
      name: 'Invoice Reminder (1 Day Overdue)',
      category: 'invoices',
      isDefault: true,
      subject: 'Friendly reminder: Invoice #{{invoiceNumber}} is due',
      body: 'Hi {{clientFirstName}},\n\n'
        + 'This is a friendly reminder that invoice #{{invoiceNumber}} for {{invoiceTotal}} was due on {{invoiceDueDate}}.\n\n'
        + 'If you have already sent payment, please disregard this message. Otherwise, the remaining balance of {{invoiceBalance}} can be paid at your earliest convenience.\n\n'
        + 'If you have any questions about the invoice, feel free to reach out.\n\n'
        + 'Thank you,\n'
        + CompanyInfo.get('ownerName') + '\n'
        + '{{companyName}}\n'
        + '{{companyPhone}}'
    },

    invoiceReminder4: {
      id: 'invoiceReminder4',
      name: 'Invoice Reminder (4 Days Overdue)',
      category: 'invoices',
      isDefault: true,
      subject: 'Past due: Invoice #{{invoiceNumber}} — {{invoiceBalance}} remaining',
      body: 'Hi {{clientFirstName}},\n\n'
        + 'I wanted to follow up regarding invoice #{{invoiceNumber}} which was due on {{invoiceDueDate}}. The outstanding balance is {{invoiceBalance}}.\n\n'
        + 'We understand things can slip through the cracks. If there is an issue with the invoice or you need to discuss payment arrangements, please do not hesitate to reach out.\n\n'
        + 'You can call or text us at {{companyPhone}}, or reply to this email.\n\n'
        + 'Thank you for your prompt attention.\n\n'
        + CompanyInfo.get('ownerName') + '\n'
        + '{{companyName}}'
    },

    bookingConfirmation: {
      id: 'bookingConfirmation',
      name: 'Booking Confirmation',
      category: 'jobs',
      isDefault: true,
      subject: 'You are booked! Job #{{jobNumber}} confirmed for {{jobDate}}',
      body: 'Hi {{clientFirstName}},\n\n'
        + 'Great news — your tree service job is confirmed!\n\n'
        + 'Job #{{jobNumber}}\n'
        + 'Service: {{jobDescription}}\n'
        + 'Date: {{jobDate}}\n'
        + 'Total: {{jobTotal}}\n\n'
        + 'Here is what to expect:\n'
        + '- Our crew will arrive in the morning (weather permitting)\n'
        + '- We will handle all cleanup and haul away debris\n'
        + '- If we need to reschedule due to weather, we will contact you\n\n'
        + 'Please make sure the work area is accessible and any vehicles or items are moved away from the trees.\n\n'
        + 'If you have any questions before your appointment, call us at {{companyPhone}}.\n\n'
        + 'See you soon!\n'
        + CompanyInfo.get('ownerName') + '\n'
        + '{{companyName}}'
    },

    jobComplete: {
      id: 'jobComplete',
      name: 'Job Completion + Review Request',
      category: 'jobs',
      isDefault: true,
      subject: 'Your tree work is complete — how did we do?',
      body: 'Hi {{clientFirstName}},\n\n'
        + 'We have finished the work at your property! Job #{{jobNumber}} ({{jobDescription}}) is now complete.\n\n'
        + 'We hope everything looks great. If you notice anything that needs attention, please let us know right away and we will take care of it.\n\n'
        + 'If you were happy with the service, it would mean a lot if you could leave us a quick Google review. It only takes a minute and really helps our small business:\n\n'
        + '{{reviewLink}}\n\n'
        + 'Thank you for choosing {{companyName}}. We appreciate your business and hope to work with you again!\n\n'
        + CompanyInfo.get('ownerName') + '\n'
        + '{{companyPhone}}'
    },

    estimateScheduled: {
      id: 'estimateScheduled',
      name: 'Estimate Scheduled',
      category: 'quotes',
      isDefault: true,
      subject: 'Your free estimate is scheduled for {{jobDate}}',
      body: 'Hi {{clientFirstName}},\n\n'
        + 'Thank you for reaching out to {{companyName}}! Your free on-site estimate has been scheduled.\n\n'
        + 'Date: {{jobDate}}\n'
        + 'Service requested: {{jobDescription}}\n\n'
        + 'I will come out to your property, take a look at the trees, and put together a detailed quote for you. The visit usually takes about 15-20 minutes.\n\n'
        + 'A few things that help:\n'
        + '- Point out which trees need work\n'
        + '- Let me know about any access concerns (fences, power lines, etc.)\n'
        + '- No need to be home if the trees are visible from the yard\n\n'
        + 'If you need to reschedule, just call or text me at {{companyPhone}}.\n\n'
        + 'Looking forward to meeting you!\n'
        + CompanyInfo.get('ownerName') + '\n'
        + '{{companyName}}'
    },

    thankYou: {
      id: 'thankYou',
      name: 'Thank You (After Payment)',
      category: 'invoices',
      isDefault: true,
      subject: 'Payment received — thank you, {{clientFirstName}}!',
      body: 'Hi {{clientFirstName}},\n\n'
        + 'We received your payment of {{invoiceTotal}} for invoice #{{invoiceNumber}}. Thank you!\n\n'
        + 'It was a pleasure working on your property. If you ever need tree pruning, removal, stump grinding, or any other tree care down the road, do not hesitate to reach out.\n\n'
        + 'And if you know anyone who needs tree work, we would love a referral. Word of mouth is how we have built our business!\n\n'
        + 'Thanks again for choosing {{companyName}}.\n\n'
        + 'Best,\n'
        + CompanyInfo.get('ownerName') + '\n'
        + '{{companyPhone}}'
    },

    requestReceived: {
      id: 'requestReceived',
      name: 'Request Received',
      category: 'requests',
      isDefault: true,
      subject: 'We got your request — {{companyName}}',
      body: 'Hi {{clientFirstName}},\n\n'
        + 'Thank you for contacting {{companyName}}! We received your service request and will get back to you shortly.\n\n'
        + 'What happens next:\n'
        + '1. We review your request (usually within a few hours)\n'
        + '2. We schedule a free on-site estimate if needed\n'
        + '3. You receive a detailed quote with pricing\n\n'
        + 'If this is urgent (storm damage, hazardous tree), please call us directly at {{companyPhone}} for priority service.\n\n'
        + 'We look forward to helping you!\n\n'
        + CompanyInfo.get('ownerName') + '\n'
        + '{{companyName}}\n'
        + '{{companyPhone}}'
    },

    visitReminder: {
      id: 'visitReminder',
      name: 'Visit Reminder (Day Before)',
      category: 'jobs',
      isDefault: true,
      subject: 'Reminder: We are coming tomorrow — Job #{{jobNumber}}',
      body: 'Hi {{clientFirstName}},\n\n'
        + 'Just a reminder that our crew is scheduled to be at your property tomorrow ({{jobDate}}) for {{jobDescription}}.\n\n'
        + 'Please make sure:\n'
        + '- Gates are unlocked or accessible\n'
        + '- Vehicles are moved away from the work area\n'
        + '- Pets are secured indoors if possible\n\n'
        + 'Our crew typically arrives in the morning. If anything has changed or you need to reschedule, please call us at {{companyPhone}} as soon as possible.\n\n'
        + 'See you tomorrow!\n'
        + CompanyInfo.get('ownerName') + '\n'
        + '{{companyName}}'
    },

    seasonalPromo: {
      id: 'seasonalPromo',
      name: 'Seasonal Promotion',
      category: 'marketing',
      isDefault: true,
      subject: 'Spring tree care special — {{companyName}}',
      body: 'Hi {{clientFirstName}},\n\n'
        + 'Spring is here and it is the perfect time to take care of your trees!\n\n'
        + 'Now through the end of the month, we are offering:\n'
        + '- Free hazard assessments for dead or leaning trees\n'
        + '- 10% off pruning jobs for returning customers\n'
        + '- Free wood chip delivery with any removal job\n\n'
        + 'Whether you need pruning, removal, stump grinding, or just want a professional to check on your trees, give us a call at {{companyPhone}} or reply to this email.\n\n'
        + 'Thanks for being a valued customer of {{companyName}}!\n\n'
        + CompanyInfo.get('ownerName') + '\n'
        + '{{companyPhone}}'
    }
  },

  // ─── Core Methods ────────────────────────────────────────────

  /**
   * Get all templates (defaults merged with any custom overrides)
   */
  getAll: function() {
    var stored = {};
    try { stored = JSON.parse(localStorage.getItem(EmailTemplates.STORAGE_KEY)) || {}; } catch(e) {}

    // Start with defaults
    var all = {};
    var key;
    for (key in EmailTemplates._defaults) {
      if (EmailTemplates._defaults.hasOwnProperty(key)) {
        all[key] = EmailTemplates._defaults[key];
      }
    }

    // Overlay stored templates (custom + overridden defaults)
    for (key in stored) {
      if (stored.hasOwnProperty(key)) {
        all[key] = stored[key];
      }
    }

    return all;
  },

  /**
   * Get a single template by ID
   */
  getById: function(id) {
    var all = EmailTemplates.getAll();
    return all[id] || null;
  },

  /**
   * Save or update a template
   */
  save: function(id, data) {
    var stored = {};
    try { stored = JSON.parse(localStorage.getItem(EmailTemplates.STORAGE_KEY)) || {}; } catch(e) {}
    data.id = id;
    stored[id] = data;
    localStorage.setItem(EmailTemplates.STORAGE_KEY, JSON.stringify(stored));
  },

  /**
   * Delete a template. Default templates are restored; custom templates are removed.
   */
  delete: function(id) {
    var stored = {};
    try { stored = JSON.parse(localStorage.getItem(EmailTemplates.STORAGE_KEY)) || {}; } catch(e) {}
    delete stored[id];
    localStorage.setItem(EmailTemplates.STORAGE_KEY, JSON.stringify(stored));
  },

  /**
   * Reset a default template to its original content
   */
  resetToDefault: function(id) {
    if (EmailTemplates._defaults[id]) {
      EmailTemplates.delete(id);
      UI.toast('Template reset to default');
    }
  },

  /**
   * Merge a template with actual data, replacing all {{field}} placeholders
   * @param {string} templateId - template to merge
   * @param {object} data - key/value pairs matching merge field names
   * @returns {object} {subject, body} with placeholders replaced
   */
  merge: function(templateId, data) {
    var tpl = EmailTemplates.getById(templateId);
    if (!tpl) return { subject: '', body: '' };

    var mergeData = {};
    // Always fill company fields
    mergeData.companyName = CompanyInfo.get('name');
    mergeData.companyPhone = CompanyInfo.get('phone');
    mergeData.companyEmail = CompanyInfo.get('email');
    mergeData.companyWebsite = CompanyInfo.get('website');
    mergeData.reviewLink = (function(){ try { return CompanyInfo.own('googleReviewUrl') || ''; } catch(e) { return ''; } })();

    // Overlay provided data
    var key;
    for (key in data) {
      if (data.hasOwnProperty(key)) {
        mergeData[key] = data[key];
      }
    }

    var subject = tpl.subject;
    var body = tpl.body;

    for (key in mergeData) {
      if (mergeData.hasOwnProperty(key)) {
        var tag = '{{' + key + '}}';
        var val = mergeData[key] || '';
        while (subject.indexOf(tag) !== -1) {
          subject = subject.replace(tag, val);
        }
        while (body.indexOf(tag) !== -1) {
          body = body.replace(tag, val);
        }
      }
    }

    return { subject: subject, body: body };
  },

  /**
   * Merge with sample data for preview purposes
   */
  mergeWithSample: function(templateId) {
    var sampleData = {};
    var key;
    for (key in EmailTemplates.MERGE_FIELDS) {
      if (EmailTemplates.MERGE_FIELDS.hasOwnProperty(key)) {
        sampleData[key] = EmailTemplates.MERGE_FIELDS[key].sample;
      }
    }
    return EmailTemplates.merge(templateId, sampleData);
  },

  /**
   * Merge raw subject/body strings with sample data (for live preview in editor)
   */
  _mergeRaw: function(subject, body) {
    var key;
    for (key in EmailTemplates.MERGE_FIELDS) {
      if (EmailTemplates.MERGE_FIELDS.hasOwnProperty(key)) {
        var tag = '{{' + key + '}}';
        var val = EmailTemplates.MERGE_FIELDS[key].sample;
        while (subject.indexOf(tag) !== -1) {
          subject = subject.replace(tag, val);
        }
        while (body.indexOf(tag) !== -1) {
          body = body.replace(tag, val);
        }
      }
    }
    return { subject: subject, body: body };
  },

  // ─── UI Rendering ────────────────────────────────────────────

  /**
   * Full template manager UI for the Settings page
   */
  renderSettings: function() {
    var all = EmailTemplates.getAll();
    var categories = { quotes: 'Quotes', invoices: 'Invoices', jobs: 'Jobs', requests: 'Requests', marketing: 'Marketing', custom: 'Custom' };

    var html = '<div style="margin-top:20px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      + '<div>'
      + '<h3 style="font-size:17px;margin:0;">Email Templates</h3>'
      + '<p style="font-size:13px;color:var(--text-light);margin:4px 0 0 0;">Manage templates used by automations and manual emails.</p>'
      + '</div>'
      + '<button class="btn btn-primary" onclick="EmailTemplates._showNewTemplateForm()" style="font-size:13px;">+ New Template</button>'
      + '</div>';

    // Render by category
    var catKey;
    for (catKey in categories) {
      if (!categories.hasOwnProperty(catKey)) continue;
      var catTemplates = [];
      var tKey;
      for (tKey in all) {
        if (all.hasOwnProperty(tKey) && (all[tKey].category === catKey || (catKey === 'custom' && !all[tKey].isDefault && !categories[all[tKey].category]))) {
          catTemplates.push(all[tKey]);
        }
      }
      if (!catTemplates.length) continue;

      html += '<div style="margin-bottom:20px;">'
        + '<h4 style="font-size:14px;color:var(--text-light);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">' + UI.esc(categories[catKey]) + '</h4>';

      catTemplates.forEach(function(tpl) {
        var isCustom = !EmailTemplates._defaults[tpl.id];
        var isModified = !isCustom && EmailTemplates._isModified(tpl.id);
        var badge = '';
        if (isCustom) {
          badge = '<span style="font-size:10px;background:#e3f2fd;color:#1565c0;padding:2px 6px;border-radius:4px;margin-left:6px;">Custom</span>';
        } else if (isModified) {
          badge = '<span style="font-size:10px;background:#fff3e0;color:#e65100;padding:2px 6px;border-radius:4px;margin-left:6px;">Modified</span>';
        }

        html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-weight:600;font-size:14px;">' + UI.esc(tpl.name) + badge + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Subject: ' + UI.esc(tpl.subject) + '</div>'
          + '</div>'
          + '<div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px;">'
          + '<button class="btn btn-outline" onclick="EmailTemplates.showPreview(\'' + tpl.id + '\')" style="font-size:12px;padding:5px 10px;">Preview</button>'
          + '<button class="btn btn-outline" onclick="EmailTemplates.renderEditor(\'' + tpl.id + '\')" style="font-size:12px;padding:5px 10px;">Edit</button>';

        if (isCustom) {
          html += '<button class="btn btn-outline" onclick="EmailTemplates._confirmDelete(\'' + tpl.id + '\')" style="font-size:12px;padding:5px 10px;color:#c0392b;border-color:#c0392b;">Delete</button>';
        } else if (isModified) {
          html += '<button class="btn btn-outline" onclick="EmailTemplates.resetToDefault(\'' + tpl.id + '\');EmailTemplates._refreshSettings();" style="font-size:12px;padding:5px 10px;">Reset</button>';
        }

        html += '</div></div>';
      });

      html += '</div>';
    }

    html += '</div>';
    return html;
  },

  /**
   * Show a preview modal with sample data merged in
   */
  showPreview: function(templateId) {
    var tpl = EmailTemplates.getById(templateId);
    if (!tpl) return;
    var merged = EmailTemplates.mergeWithSample(templateId);

    var html = '<div style="max-width:600px;">'
      + '<div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:16px;">'
      + '<div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Subject</div>'
      + '<div style="font-size:15px;font-weight:600;">' + UI.esc(merged.subject) + '</div>'
      + '</div>'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:8px;padding:20px;font-size:14px;line-height:1.7;white-space:pre-wrap;">'
      + UI.esc(merged.body)
      + '</div>'
      + '<div style="margin-top:12px;font-size:11px;color:var(--text-light);text-align:center;">Preview shown with sample data. Actual merge fields will be replaced with real client/job data.</div>'
      + '</div>';

    UI.showModal(tpl.name + ' — Preview', html);
  },

  /**
   * Open the template editor modal
   */
  renderEditor: function(templateId) {
    var tpl = EmailTemplates.getById(templateId);
    var isNew = !tpl;
    if (isNew) {
      tpl = { id: '', name: '', category: 'custom', subject: '', body: '', isDefault: false };
    }

    var isDefault = !!EmailTemplates._defaults[templateId];

    // Build merge field buttons grouped by type
    var fieldGroups = {
      'Client': ['clientName', 'clientFirstName', 'clientEmail', 'clientPhone'],
      'Job': ['jobNumber', 'jobDescription', 'jobDate', 'jobTotal'],
      'Quote': ['quoteNumber', 'quoteTotal', 'quoteDate', 'quoteExpiry'],
      'Invoice': ['invoiceNumber', 'invoiceTotal', 'invoiceDueDate', 'invoiceBalance'],
      'Company': ['companyName', 'companyPhone', 'reviewLink']
    };

    var mergeFieldsHtml = '';
    var gKey;
    for (gKey in fieldGroups) {
      if (!fieldGroups.hasOwnProperty(gKey)) continue;
      mergeFieldsHtml += '<div style="margin-bottom:8px;">'
        + '<div style="font-size:11px;color:var(--text-light);margin-bottom:4px;">' + gKey + '</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
      fieldGroups[gKey].forEach(function(fieldKey) {
        var info = EmailTemplates.MERGE_FIELDS[fieldKey];
        mergeFieldsHtml += '<button type="button" onclick="EmailTemplates._insertMergeField(\'' + fieldKey + '\')" '
          + 'style="font-size:11px;padding:3px 8px;background:#e8f5e9;color:var(--green-dark);border:1px solid #c8e6c9;border-radius:4px;cursor:pointer;white-space:nowrap;">'
          + '{{' + fieldKey + '}}</button>';
      });
      mergeFieldsHtml += '</div></div>';
    }

    var html = '<div style="max-width:700px;">'
      // Template name (editable for custom, read-only for defaults)
      + '<div style="margin-bottom:12px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Template Name</label>'
      + '<input type="text" id="tpl-edit-name" value="' + UI.esc(tpl.name) + '" ' + (isDefault ? 'readonly' : '') + ' '
      + 'style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;' + (isDefault ? 'background:#f5f5f5;' : '') + '" placeholder="e.g. Spring Follow-up">'
      + '</div>'

      // Category (for custom templates)
      + '<div style="margin-bottom:12px;' + (isDefault ? 'display:none;' : '') + '">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Category</label>'
      + '<select id="tpl-edit-category" style="padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '<option value="quotes"' + (tpl.category === 'quotes' ? ' selected' : '') + '>Quotes</option>'
      + '<option value="invoices"' + (tpl.category === 'invoices' ? ' selected' : '') + '>Invoices</option>'
      + '<option value="jobs"' + (tpl.category === 'jobs' ? ' selected' : '') + '>Jobs</option>'
      + '<option value="requests"' + (tpl.category === 'requests' ? ' selected' : '') + '>Requests</option>'
      + '<option value="marketing"' + (tpl.category === 'marketing' ? ' selected' : '') + '>Marketing</option>'
      + '<option value="custom"' + (tpl.category === 'custom' ? ' selected' : '') + '>Custom</option>'
      + '</select>'
      + '</div>'

      // Merge fields palette
      + '<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:12px;">'
      + '<div style="font-size:12px;font-weight:600;margin-bottom:6px;">Insert Merge Field <span style="font-weight:400;color:var(--text-light);">(click to insert at cursor)</span></div>'
      + mergeFieldsHtml
      + '</div>'

      // Subject line
      + '<div style="margin-bottom:12px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Subject Line</label>'
      + '<input type="text" id="tpl-edit-subject" value="' + UI.esc(tpl.subject) + '" '
      + 'style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;" '
      + 'placeholder="Email subject line..." oninput="EmailTemplates._updateLivePreview()" onfocus="EmailTemplates._lastFocused=this">'
      + '</div>'

      // Body
      + '<div style="margin-bottom:12px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Body</label>'
      + '<textarea id="tpl-edit-body" rows="12" '
      + 'style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;line-height:1.6;" '
      + 'placeholder="Write your email body here..." oninput="EmailTemplates._updateLivePreview()" onfocus="EmailTemplates._lastFocused=this">'
      + UI.esc(tpl.body)
      + '</textarea>'
      + '</div>'

      // Live preview toggle
      + '<div style="margin-bottom:12px;">'
      + '<button type="button" onclick="EmailTemplates._toggleLivePreview()" class="btn btn-outline" style="font-size:12px;padding:5px 12px;">Toggle Live Preview</button>'
      + '</div>'
      + '<div id="tpl-live-preview" style="display:none;background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:12px;">'
      + '<div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Live Preview (sample data)</div>'
      + '<div id="tpl-preview-subject" style="font-weight:600;font-size:14px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border);"></div>'
      + '<div id="tpl-preview-body" style="font-size:13px;line-height:1.7;white-space:pre-wrap;"></div>'
      + '</div>'

      // Buttons
      + '<div style="display:flex;gap:8px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--border);">';

    if (isDefault) {
      html += '<button class="btn btn-outline" onclick="EmailTemplates.resetToDefault(\'' + templateId + '\');UI.closeModal();" style="margin-right:auto;font-size:13px;">Reset to Default</button>';
    }

    html += '<button class="btn btn-outline" onclick="UI.closeModal()" style="font-size:13px;">Cancel</button>'
      + '<button class="btn btn-primary" onclick="EmailTemplates._saveFromEditor(\'' + UI.esc(templateId || '') + '\', ' + isDefault + ')" style="font-size:13px;">Save Template</button>'
      + '</div></div>';

    UI.showModal((isNew ? 'New Template' : 'Edit: ' + tpl.name), html);

    // Initialize live preview if visible
    EmailTemplates._lastFocused = null;
  },

  // ─── Internal UI Helpers ─────────────────────────────────────

  /** Track which field was last focused (subject or body) for merge field insertion */
  _lastFocused: null,

  /** Insert a merge field tag at the cursor position in the last focused input */
  _insertMergeField: function(fieldKey) {
    var tag = '{{' + fieldKey + '}}';
    var target = EmailTemplates._lastFocused;

    // Default to body if nothing focused
    if (!target) {
      target = document.getElementById('tpl-edit-body');
    }
    if (!target) return;

    var start = target.selectionStart;
    var end = target.selectionEnd;
    var val = target.value;

    target.value = val.substring(0, start) + tag + val.substring(end);
    target.selectionStart = target.selectionEnd = start + tag.length;
    target.focus();

    EmailTemplates._updateLivePreview();
  },

  /** Toggle the live preview pane */
  _toggleLivePreview: function() {
    var el = document.getElementById('tpl-live-preview');
    if (!el) return;
    if (el.style.display === 'none') {
      el.style.display = 'block';
      EmailTemplates._updateLivePreview();
    } else {
      el.style.display = 'none';
    }
  },

  /** Update the live preview with current editor content */
  _updateLivePreview: function() {
    var subjectEl = document.getElementById('tpl-preview-subject');
    var bodyEl = document.getElementById('tpl-preview-body');
    if (!subjectEl || !bodyEl) return;

    var subjectInput = document.getElementById('tpl-edit-subject');
    var bodyInput = document.getElementById('tpl-edit-body');
    if (!subjectInput || !bodyInput) return;

    var merged = EmailTemplates._mergeRaw(subjectInput.value, bodyInput.value);
    subjectEl.textContent = merged.subject;
    bodyEl.textContent = merged.body;
  },

  /** Save template from the editor modal */
  _saveFromEditor: function(originalId, isDefault) {
    var name = document.getElementById('tpl-edit-name').value.trim();
    var subject = document.getElementById('tpl-edit-subject').value.trim();
    var body = document.getElementById('tpl-edit-body').value.trim();

    if (!name) { UI.toast('Template name is required', 'error'); return; }
    if (!subject) { UI.toast('Subject line is required', 'error'); return; }
    if (!body) { UI.toast('Body is required', 'error'); return; }

    var id = originalId;
    var categoryEl = document.getElementById('tpl-edit-category');

    if (!id) {
      // New template — generate an ID
      id = 'custom-' + Date.now().toString(36);
    }

    var data = {
      id: id,
      name: name,
      category: isDefault ? EmailTemplates._defaults[id].category : (categoryEl ? categoryEl.value : 'custom'),
      isDefault: isDefault,
      subject: subject,
      body: body
    };

    EmailTemplates.save(id, data);
    UI.toast('Template saved');
    UI.closeModal();
    EmailTemplates._refreshSettings();
  },

  /** Show new template form */
  _showNewTemplateForm: function() {
    EmailTemplates.renderEditor(null);
  },

  /** Confirm deletion of a custom template */
  _confirmDelete: function(id) {
    var tpl = EmailTemplates.getById(id);
    if (!tpl) return;

    var html = '<div style="text-align:center;padding:10px;">'
      + '<p style="font-size:14px;">Are you sure you want to delete the template <strong>' + UI.esc(tpl.name) + '</strong>?</p>'
      + '<p style="font-size:13px;color:var(--text-light);">This action cannot be undone.</p>'
      + '<div style="display:flex;gap:8px;justify-content:center;margin-top:16px;">'
      + '<button class="btn btn-outline" onclick="UI.closeModal()" style="font-size:13px;">Cancel</button>'
      + '<button class="btn btn-primary" onclick="EmailTemplates.delete(\'' + id + '\');UI.closeModal();EmailTemplates._refreshSettings();" style="font-size:13px;background:#c0392b;">Delete</button>'
      + '</div></div>';

    UI.showModal('Delete Template', html, { keepModal: true });
  },

  /** Check if a default template has been modified */
  _isModified: function(id) {
    var stored = {};
    try { stored = JSON.parse(localStorage.getItem(EmailTemplates.STORAGE_KEY)) || {}; } catch(e) {}
    return !!stored[id];
  },

  /** Re-render the settings section (call after save/delete) */
  _refreshSettings: function() {
    var container = document.getElementById('email-templates-settings');
    if (container) {
      container.innerHTML = EmailTemplates.renderSettings();
    }
  },

  /**
   * Get list of templates suitable for a specific automation type
   */
  getForAutomation: function(automationType) {
    var mapping = {
      quoteFollowup1: 'quoteFollowup5',
      quoteFollowup2: 'quoteFollowup10',
      invoiceFollowup1: 'invoiceReminder1',
      invoiceFollowup2: 'invoiceReminder4',
      bookingConfirm: 'bookingConfirmation',
      reviewRequest: 'jobComplete',
      requestConfirm: 'requestReceived',
      visitReminderEmail: 'visitReminder'
    };
    var templateId = mapping[automationType];
    if (templateId) return EmailTemplates.getById(templateId);
    return null;
  },

  /**
   * Get all template IDs grouped by category
   */
  getGrouped: function() {
    var all = EmailTemplates.getAll();
    var groups = {};
    var key;
    for (key in all) {
      if (!all.hasOwnProperty(key)) continue;
      var cat = all[key].category || 'custom';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(all[key]);
    }
    return groups;
  }
};
