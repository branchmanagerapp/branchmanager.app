/**
 * Branch Manager — Quote → Job → Invoice Workflow
 * One-click conversions between pipeline stages
 */
var Workflow = {
  _co: function() {
    return {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      website: CompanyInfo.get('website')
    };
  },

  render: function() {
    var requests = DB.requests ? DB.requests.getAll() : [];
    var quotes = DB.quotes.getAll();
    var jobs = DB.jobs.getAll();
    var invoices = DB.invoices.getAll();

    var openRequests = requests.filter(function(r) { return r.status !== 'converted' && r.status !== 'cancelled'; }).length;
    var openQuotes = quotes.filter(function(q) { return q.status === 'draft' || q.status === 'sent' || q.status === 'awaiting'; }).length;
    var activeJobs = jobs.filter(function(j) { return j.status === 'scheduled' || j.status === 'in_progress'; }).length;
    var unpaidInvoices = invoices.filter(function(i) { return i.status !== 'paid' && (i.balance || 0) > 0; });
    var unpaidTotal = unpaidInvoices.reduce(function(s, i) { return s + (i.balance || 0); }, 0);

    var html = '<div style="max-width:900px;">'
      // Pipeline flow
      + '<div style="display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr;gap:0;align-items:center;margin-bottom:28px;background:var(--white);border:1px solid var(--border);border-radius:14px;padding:20px;overflow:hidden;">'
      + Workflow._stageBox('📥', 'Requests', openRequests, 'requests', '#1565c0')
      + '<div style="font-size:20px;color:var(--border);font-weight:300;">→</div>'
      + Workflow._stageBox('📋', 'Quotes', openQuotes, 'quotes', '#ff9800')
      + '<div style="font-size:20px;color:var(--border);font-weight:300;">→</div>'
      + Workflow._stageBox('🔨', 'Active Jobs', activeJobs, 'jobs', 'var(--green-dark)')
      + '<div style="font-size:20px;color:var(--border);font-weight:300;">→</div>'
      + Workflow._stageBox('💰', 'Unpaid', UI.money(unpaidTotal), 'invoices', 'var(--red)')
      + '</div>';

    // Quotes ready to convert
    var approvedQuotes = quotes.filter(function(q) { return q.status === 'approved' && !q.convertedJobId; });
    if (approvedQuotes.length) {
      html += '<div style="margin-bottom:20px;"><div style="font-weight:700;font-size:13px;color:var(--green-dark);margin-bottom:10px;">✅ Quotes Ready to Convert → Job (' + approvedQuotes.length + ')</div>';
      approvedQuotes.slice(0, 10).forEach(function(q) {
        html += '<div style="background:var(--white);border:1px solid #c8e6c9;border-radius:10px;padding:12px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:12px;">'
          + '<div>'
          + '<div style="font-weight:600;font-size:14px;">' + UI.esc(q.clientName || '') + (q.quoteNumber ? ' · Quote #' + q.quoteNumber : '') + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);">' + (q.description || '').substr(0, 60) + ' · ' + UI.money(q.total) + '</div>'
          + '</div>'
          + '<button onclick="QuotesPage._convertAndBook(\'' + q.id + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">→ Create &amp; Book</button>'
          + '</div>';
      });
      html += '</div>';
    }

    // Jobs ready to invoice — filter by scheduledDate within 60 days to skip old legacy import data
    var cutoff60 = new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0];
    var completedNoInvoice = jobs.filter(function(j) {
      return j.status === 'completed' && !j.invoiceId && j.scheduledDate && j.scheduledDate >= cutoff60;
    });
    // Fallback: also show jobs with no scheduledDate but created recently (manually created)
    var cutoff7 = new Date(Date.now() - 7 * 86400000).toISOString();
    var recentManual = jobs.filter(function(j) {
      return j.status === 'completed' && !j.invoiceId && !j.scheduledDate && (j.createdAt || '') > cutoff7;
    });
    completedNoInvoice = completedNoInvoice.concat(recentManual);
    var totalCompletedNoInvoice = jobs.filter(function(j) { return j.status === 'completed' && !j.invoiceId; }).length;
    if (completedNoInvoice.length) {
      html += '<div style="margin-bottom:20px;"><div style="font-weight:700;font-size:13px;color:#e65100;margin-bottom:10px;">🔔 Completed Jobs Needing Invoice (' + completedNoInvoice.length + (totalCompletedNoInvoice > completedNoInvoice.length ? ' recent · ' + totalCompletedNoInvoice + ' total' : '') + ')</div>';
      completedNoInvoice.slice(0, 10).forEach(function(j) {
        html += '<div style="background:var(--white);border:1px solid #ffe0b2;border-radius:10px;padding:12px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:12px;">'
          + '<div>'
          + '<div style="font-weight:600;font-size:14px;">' + UI.esc(j.clientName || '') + (j.jobNumber ? ' · Job #' + j.jobNumber : '') + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);">' + (j.description || '').substr(0, 60) + ' · ' + UI.money(j.total) + '</div>'
          + '</div>'
          + '<button onclick="var inv=Workflow.jobToInvoice(\'' + j.id + '\');if(inv){loadPage(\'invoices\');setTimeout(function(){if(typeof InvoicesPage!==\'undefined\')InvoicesPage.showDetail(inv.id);else loadPage(\'invoices\');},100);}" style="background:#e65100;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">→ Create Invoice</button>'
          + '</div>';
      });
      html += '</div>';
    }

    // Overdue invoices
    var today = new Date().toISOString().split('T')[0];
    var overdueInvoices = unpaidInvoices.filter(function(i) { return i.dueDate && i.dueDate < today; });
    if (overdueInvoices.length) {
      html += '<div><div style="font-weight:700;font-size:13px;color:var(--red);margin-bottom:10px;">⚠ Overdue Invoices (' + overdueInvoices.length + ')</div>';
      overdueInvoices.slice(0, 10).forEach(function(inv) {
        var daysOverdue = Math.floor((new Date() - new Date(inv.dueDate)) / 86400000);
        html += '<div style="background:var(--white);border:1px solid var(--red);border-radius:10px;padding:12px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:12px;">'
          + '<div>'
          + '<div style="font-weight:600;font-size:14px;">' + UI.esc(inv.clientName || '') + (inv.invoiceNumber ? ' · Invoice #' + inv.invoiceNumber : '') + '</div>'
          + '<div style="font-size:12px;color:var(--red);">' + daysOverdue + ' days overdue · ' + UI.money(inv.balance) + ' due</div>'
          + '</div>'
          + '<button onclick="loadPage(\'invoices\');setTimeout(function(){if(typeof InvoicesPage!==\'undefined\')InvoicesPage.showDetail(\'' + inv.id + '\');else loadPage(\'invoices\');},100);" style="background:var(--red);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">View Invoice</button>'
          + '</div>';
      });
      html += '</div>';
    }

    if (!approvedQuotes.length && !completedNoInvoice.length && !overdueInvoices.length) {
      html += '<div class="empty-state"><div class="empty-icon">✅</div><h3>All caught up!</h3><p>No quotes to convert, no jobs waiting on invoices, no overdue invoices.</p></div>';
    }

    html += '</div>';
    return html;
  },

  _stageBox: function(icon, label, value, page, color) {
    return '<div style="text-align:center;cursor:pointer;padding:8px 16px;" onclick="loadPage(\'' + page + '\')">'
      + '<div style="font-size:24px;margin-bottom:4px;">' + icon + '</div>'
      + '<div style="font-size:22px;font-weight:800;color:' + color + ';">' + value + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">' + label + '</div>'
      + '</div>';
  },

  // Convert a quote to a job
  quoteToJob: function(quoteId) {
    var quote = DB.quotes.getById(quoteId);
    if (!quote) { UI.toast('Quote not found', 'error'); return; }

    var job = DB.jobs.create({
      clientName: quote.clientName,
      clientId: quote.clientId || '',
      clientEmail: quote.clientEmail || '',
      clientPhone: quote.clientPhone || '',
      property: quote.property || '',
      description: quote.description || 'From Quote #' + (quote.quoteNumber || ''),
      total: quote.total || 0,
      status: 'scheduled',
      quoteId: quoteId,
      lineItems: quote.lineItems || [],
      taxRate: quote.taxRate || parseFloat(localStorage.getItem('bm-tax-rate')) || 8.375,
      source: 'quote'
    });

    // Update quote status
    DB.quotes.update(quoteId, { status: 'converted', convertedJobId: job.id });

    UI.toast('Quote #' + (quote.quoteNumber || '') + ' → Job #' + job.jobNumber + ' created!');
    return job;
  },

  // Convert a job to an invoice
  jobToInvoice: function(jobId) {
    var job = DB.jobs.getById(jobId);
    if (!job) { UI.toast('Job not found', 'error'); return; }

    // Subject derivation matches invoices.js bulk path (v458): real description
    // first, then first line-item, then "Job #N" fallback. Replaces the older
    // generic "For Services Rendered" so invoice list rows show what the
    // work actually was.
    var firstItem = (job.lineItems && job.lineItems[0]) || {};
    var derivedSubject = (job.description && job.description.trim())
      || firstItem.service
      || firstItem.description
      || 'Job #' + (job.jobNumber || '');

    var invoice = DB.invoices.create({
      clientName: job.clientName,
      clientId: job.clientId || '',
      clientEmail: job.clientEmail || '',
      clientPhone: job.clientPhone || '',
      property: job.property || '',
      subject: derivedSubject,
      total: job.total || 0,
      balance: job.total || 0,
      amountPaid: 0,
      status: 'draft',
      jobId: jobId,
      lineItems: job.lineItems || [],
      dueDate: (function() { var payTerms = localStorage.getItem('bm-payment-terms') || 'net30'; var daysDue = payTerms === 'due-on-completion' ? 0 : payTerms === 'net15' ? 15 : payTerms === 'net60' ? 60 : 30; return new Date(Date.now() + daysDue * 86400000).toISOString().split('T')[0]; })()
    });

    // Update job status
    DB.jobs.update(jobId, { status: 'completed', invoiceId: invoice.id });

    UI.toast('Job → Invoice #' + invoice.invoiceNumber + ' created!');
    return invoice;
  },

  // Mark a job complete + auto-create a draft invoice (per Doug's rule:
  // every mark-complete should create the next draft, no prompt). Idempotent:
  // if the job already has an invoiceId or total <= 0, skips invoice creation.
  // Returns { job, invoice, alreadyHadInvoice, skippedNoTotal }.
  // Used by every call site that flips a job to 'completed': _markComplete,
  // _quickComplete, _batchComplete, dispatch, crewview, dashboard, visits,
  // bulk-close-unscheduled. Each call site keeps its own UI flow (toast,
  // modal, route) — this just guarantees the invoice draft exists.
  completeAndDraft: function(jobId, opts) {
    opts = opts || {};
    var job = DB.jobs.getById(jobId);
    if (!job) return { job: null, invoice: null };
    var alreadyHadInvoice = !!job.invoiceId;
    var skippedNoTotal = !alreadyHadInvoice && !((job.total || 0) > 0);

    // Always flip status + stamp completedAt (idempotent — repeat completes
    // just refresh the timestamp). Don't overwrite invoiceId if one exists.
    var updates = { status: 'completed', completedAt: new Date().toISOString() };
    DB.jobs.update(jobId, updates);

    var invoice = null;
    if (!alreadyHadInvoice && !skippedNoTotal && !opts.skipInvoice) {
      // jobToInvoice handles subject derivation, due date, line items.
      // It also re-updates the job to set invoiceId.
      // Suppress its toast if caller wants silent mode (batch flows).
      var origToast = UI.toast;
      if (opts.silent) UI.toast = function() {};
      try {
        invoice = Workflow.jobToInvoice(jobId);
      } finally {
        if (opts.silent) UI.toast = origToast;
      }
    }
    return { job: DB.jobs.getById(jobId), invoice: invoice, alreadyHadInvoice: alreadyHadInvoice, skippedNoTotal: skippedNoTotal };
  },

  // Mark invoice as paid
  markPaid: function(invoiceId, method) {
    var inv = DB.invoices.getById(invoiceId);
    if (!inv) return;
    method = method || 'cash';
    var nowIso = new Date().toISOString();

    DB.invoices.update(invoiceId, {
      status: 'paid',
      amountPaid: inv.total,
      balance: 0,
      paidDate: nowIso,
      paymentMethod: method
    });

    // v464: cross-record propagation. Was a one-line invoice update — left
    // the linked job stuck at 'completed' forever. Per Doug:
    // "make sure all the pages and flow mark one another if need be."
    // Now markPaid also flips the originating job to 'invoiced' (workflow
    // progress bar's terminal state).
    // Client-level roll-ups (lifetime paid, last-paid) intentionally NOT
    // written here — the cloud clients schema doesn't have those columns
    // and cloud upserts would 400. Roll-ups are computed at query time
    // from SUM(invoices.amount_paid WHERE client_id = X). If we ever want
    // them denormalized, add a migration first.
    if (inv.jobId) {
      var job = DB.jobs.getById(inv.jobId);
      if (job && job.status !== 'invoiced') {
        DB.jobs.update(inv.jobId, { status: 'invoiced' });
      }
    }

    // Log to payment history so Payments.renderForInvoice() shows it
    var pKey = 'bm-payments-' + invoiceId;
    var allPmts = [];
    try { allPmts = JSON.parse(localStorage.getItem(pKey)) || []; } catch(e) {}
    allPmts.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      invoiceId: invoiceId, amount: inv.total, method: method, note: '', date: nowIso, user: 'Doug'
    });
    localStorage.setItem(pKey, JSON.stringify(allPmts));

    UI.toast('Invoice #' + (inv.invoiceNumber || '') + ' paid — ' + UI.money(inv.total) + (inv.jobId ? ' · job marked invoiced' : ''));
  },

  // Render conversion buttons
  quoteActions: function(quoteId) {
    var quote = DB.quotes.getById(quoteId);
    if (!quote) return '';
    if (quote.status === 'converted') {
      return '<div style="padding:8px 12px;background:#e8f5e9;border-radius:6px;font-size:13px;color:#2e7d32;">✅ Converted to job</div>';
    }
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button onclick="QuotesPage._convertAndBook(\'' + quoteId + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">✅ Convert &amp; Book</button>'
      + '<button onclick="Workflow.sendQuote(\'' + quoteId + '\')" style="background:#1565c0;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">📧 Send to Client</button>'
      + '<button onclick="PDFGen.generateQuote(\'' + quoteId + '\')" style="background:#6a1b9a;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">📄 Download PDF</button>'
      + '</div>';
  },

  jobActions: function(jobId) {
    var job = DB.jobs.getById(jobId);
    if (!job) return '';
    var html = '<div style="display:flex;gap:8px;flex-wrap:wrap;">';

    if (job.status === 'scheduled') {
      html += '<button onclick="DB.jobs.update(\'' + jobId + '\',{status:\'in_progress\',startedAt:new Date().toISOString()});UI.toast(\'Job started\');loadPage(\'jobs\');" style="background:#ff9800;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">▶ Start Job</button>';
    }
    if (job.status === 'in_progress') {
      html += '<button onclick="(function(){var inv=Workflow.jobToInvoice(\'' + jobId + '\');loadPage(\'invoices\');if(inv)setTimeout(function(){if(typeof InvoicesPage!==\'undefined\')InvoicesPage.showDetail(inv.id);else loadPage(\'invoices\');},100);})()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">✅ Complete & Invoice</button>';
    }
    if (job.status === 'completed' && !job.invoiceId) {
      html += '<button onclick="(function(){var inv=Workflow.jobToInvoice(\'' + jobId + '\');loadPage(\'invoices\');if(inv)setTimeout(function(){if(typeof InvoicesPage!==\'undefined\')InvoicesPage.showDetail(inv.id);else loadPage(\'invoices\');},100);})()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">💰 Create Invoice</button>';
    }

    html += '<button onclick="PDFGen.generateJobSheet(\'' + jobId + '\')" style="background:#6a1b9a;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">📄 Job Sheet PDF</button>';

    // Photo button
    html += '<button onclick="document.getElementById(\'job-photos-section\').scrollIntoView({behavior:\'smooth\'})" style="background:#e3f2fd;border:1px solid #bbdefb;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;font-weight:600;color:#1565c0;">📸 Photos</button>';

    html += '</div>';
    return html;
  },

  invoiceActions: function(invoiceId) {
    var inv = DB.invoices.getById(invoiceId);
    if (!inv) return '';

    if (inv.status === 'paid') {
      return '<div style="padding:8px 12px;background:#e8f5e9;border-radius:6px;font-size:13px;color:#2e7d32;">✅ Paid ' + UI.money(inv.total) + (inv.paidDate ? ' on ' + UI.dateShort(inv.paidDate) : '') + '</div>';
    }

    var html = '<div style="display:flex;gap:8px;flex-wrap:wrap;">';

    // Payment methods
    html += '<button onclick="Workflow.markPaid(\'' + invoiceId + '\',\'cash\');loadPage(\'invoices\');" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">💵 Cash</button>'
      + '<button onclick="Workflow.markPaid(\'' + invoiceId + '\',\'check\');loadPage(\'invoices\');" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">📝 Check</button>';

    // Stripe (if connected)
    if (typeof Stripe !== 'undefined' && Stripe.paymentButton) {
      html += Stripe.paymentButton(invoiceId);
    }

    // Send & PDF
    html += '<button onclick="Workflow.sendInvoice(\'' + invoiceId + '\')" style="background:#1565c0;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">📧 Send</button>'
      + '<button onclick="PDFGen.generateInvoice(\'' + invoiceId + '\')" style="background:#6a1b9a;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;">📄 PDF</button>';

    html += '</div>';
    return html;
  },

  sendQuote: function(quoteId) {
    var q = DB.quotes.getById(quoteId);
    if (!q) { UI.toast('Quote not found', 'error'); return; }

    // Find client email
    var allClients = JSON.parse(localStorage.getItem('bm-clients') || '[]');
    var client = allClients.find(function(c) { return c.id === q.clientId || (c.name||'').toLowerCase() === (q.clientName||'').toLowerCase(); });
    var email = (client && client.email) || q.clientEmail || '';
    var firstName = (q.clientName || '').split(' ')[0] || 'there';

    var approveLink = 'https://branchmanager.app/approve.html?id=' + quoteId;
    var subject = 'Your estimate from ' + Workflow._co().name + ' — Quote #' + (q.quoteNumber || '');
    var body = 'Hi ' + firstName + ',\n\n'
      + 'Thanks for having us out to take a look! Here\'s your estimate for the work we discussed.\n\n'
      + '📋 Quote #' + (q.quoteNumber || '') + '\n'
      + '📍 ' + (q.property || 'Your property') + '\n'
      + '💰 Total: ' + UI.money(q.total) + '\n\n'
      + (q.description ? '📝 ' + q.description + '\n\n' : '')
      + '✅ Review & Approve Online:\n' + approveLink + '\n\n'
      + 'You can approve, request changes, or ask questions directly from that link.\n\n'
      + 'We can usually schedule within 1-2 weeks of approval. Give us a call anytime at ' + Workflow._co().phone + '.\n\n'
      + CompanyInfo.get('ownerName') + '\n' + Workflow._co().name + '\n' + Workflow._co().phone + '\n' + Workflow._co().email;

    var html = '<div style="padding:16px;">'
      + '<div style="margin-bottom:16px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">To</label>'
      + '<input type="email" id="q-send-to" value="' + email + '" placeholder="client@email.com" style="width:100%;padding:8px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '</div>'
      + '<div style="margin-bottom:16px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Subject</label>'
      + '<input type="text" id="q-send-subject" value="' + subject.replace(/"/g, '&quot;') + '" style="width:100%;padding:8px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '</div>'
      + '<div style="margin-bottom:16px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Message</label>'
      + '<textarea id="q-send-body" rows="14" style="width:100%;padding:10px 12px;border:2px solid var(--border);border-radius:8px;font-size:13px;line-height:1.6;font-family:inherit;resize:vertical;">' + body + '</textarea>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">📎 Quote PDF will be attached</div>'
      + '</div>';

    UI.showModal('Send Quote #' + (q.quoteNumber || ''), html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-outline" onclick="PDF.generateQuote(\'' + quoteId + '\')">👁 Preview PDF</button>'
        + ' <button class="btn btn-primary" onclick="Workflow._confirmSendQuote(\'' + quoteId + '\')">📧 Send Quote</button>'
    });
  },

  _confirmSendQuote: function(quoteId) {
    var to = document.getElementById('q-send-to').value.trim();
    if (!to) { UI.toast('Enter an email address', 'error'); return; }
    var subject = document.getElementById('q-send-subject').value;
    var body = document.getElementById('q-send-body').value;

    // Build HTML email
    var q = DB.quotes.getById(quoteId) || {};
    var firstName = (q.clientName || '').split(' ')[0] || 'there';
    var approveLink = 'https://branchmanager.app/approve.html?id=' + quoteId;
    var totalStr = (typeof UI !== 'undefined' && UI.money) ? UI.money(q.total) : ('$' + (q.total || '0'));
    var htmlBody = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
      + '<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">'
      + '<tr><td align="center">'
      + '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">'
      // Header
      + '<tr><td style="background:#1a3c12;padding:28px 32px;">'
      + '<p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">' + Workflow._co().name + '</p>'
      + '<p style="margin:6px 0 0;font-size:13px;color:#a8d5a2;">Licensed &amp; Insured — Westchester &amp; Putnam Counties</p>'
      + '</td></tr>'
      // Body
      + '<tr><td style="padding:32px;">'
      + '<p style="margin:0 0 20px;font-size:16px;color:#333333;">Hi ' + firstName + ',</p>'
      + '<p style="margin:0 0 24px;font-size:15px;color:#555555;line-height:1.6;">Thanks for having us out to take a look! Here\'s your estimate for the work we discussed. You can review and approve it online using the button below.</p>'
      // Quote detail box
      + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8faf7;border:1px solid #d4e6d0;border-radius:8px;margin-bottom:28px;">'
      + '<tr><td style="padding:20px 24px;">'
      + '<p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#1a3c12;text-transform:uppercase;letter-spacing:0.5px;">Quote Summary</p>'
      + '<table width="100%" cellpadding="0" cellspacing="0">'
      + '<tr><td style="padding:6px 0;font-size:14px;color:#666666;">Quote Number</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#222222;text-align:right;">#' + (q.quoteNumber || '') + '</td></tr>'
      + '<tr><td style="padding:6px 0;font-size:14px;color:#666666;">Client</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#222222;text-align:right;">' + (q.clientName || '') + '</td></tr>'
      + '<tr><td style="padding:6px 0;font-size:14px;color:#666666;">Property</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#222222;text-align:right;">' + (q.property || 'Your property') + '</td></tr>'
      + '<tr><td style="padding:6px 0;font-size:14px;color:#666666;">Total</td><td style="padding:6px 0;font-size:18px;font-weight:700;color:#1a3c12;text-align:right;">' + totalStr + '</td></tr>'
      + '</table>'
      + (q.description ? '<p style="margin:12px 0 0;font-size:13px;color:#555555;line-height:1.5;border-top:1px solid #d4e6d0;padding-top:12px;">' + q.description + '</p>' : '')
      + '</td></tr>'
      + '</table>'
      // Approve button
      + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">'
      + '<tr><td align="center">'
      + '<a href="' + approveLink + '" style="display:inline-block;background:#1a3c12;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 40px;border-radius:8px;letter-spacing:0.3px;">View &amp; Approve Quote</a>'
      + '</td></tr>'
      + '</table>'
      + '<p style="margin:0 0 8px;font-size:13px;color:#888888;text-align:center;">You can approve, request changes, or ask questions directly from that link.</p>'
      + '<p style="margin:0 0 24px;font-size:12px;color:#aaaaaa;text-align:center;">Direct link: <a href="' + approveLink + '" style="color:#1a3c12;">' + approveLink + '</a></p>'
      + '<p style="margin:0;font-size:14px;color:#555555;line-height:1.6;">We can usually schedule within 1-2 weeks of approval. Give us a call anytime at ' + Workflow._co().phone + '.</p>'
      + '</td></tr>'
      // Footer
      + '<tr><td style="background:#f0f4ef;border-top:1px solid #d4e6d0;padding:20px 32px;text-align:center;">'
      + '<p style="margin:0 0 4px;font-size:13px;color:#555555;font-weight:600;">' + Workflow._co().name + '</p>'
      + '<p style="margin:0;font-size:12px;color:#888888;">' + Workflow._co().phone + ' &nbsp;·&nbsp; <a href="mailto:' + Workflow._co().email + '" style="color:#1a3c12;text-decoration:none;">' + Workflow._co().email + '</a> &nbsp;·&nbsp; <a href="https://' + Workflow._co().website + '" style="color:#1a3c12;text-decoration:none;">' + Workflow._co().website + '</a></p>'
      + '<p style="margin:8px 0 0;font-size:11px;color:#aaaaaa;">Licensed &amp; Insured — WC-32079 (Westchester) · PC-50644 (Putnam)</p>'
      + '</td></tr>'
      + '</table>'
      + '</td></tr>'
      + '</table>'
      + '</body></html>';

    Workflow._sendViaSupabase(to, subject, body, function(ok) {
      if (!ok) {
        var mailto = 'mailto:' + to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        window.open(mailto, '_blank');
      }
    }, { htmlBody: htmlBody });

    DB.quotes.update(quoteId, { status: 'sent', sentAt: new Date().toISOString(), sentTo: to });
    UI.closeModal();
    UI.toast('Quote sent to ' + to);
  },

  sendInvoice: function(invoiceId) {
    var inv = DB.invoices.getById(invoiceId);
    if (!inv) { UI.toast('Invoice not found', 'error'); return; }

    var client = inv.clientId ? DB.clients.getById(inv.clientId) : null;
    var email = (client && client.email) || inv.clientEmail || '';
    var firstName = (inv.clientName || '').split(' ')[0] || 'there';

    var payLink = 'https://branchmanager.app/pay.html?id=' + invoiceId;
    var subject = 'Invoice #' + inv.invoiceNumber + ' from ' + Workflow._co().name + ' — ' + UI.money(inv.total);
    var body = 'Hi ' + firstName + ',\n\n'
      + 'Please find your invoice attached for the work completed at your property.\n\n'
      + '🧾 Invoice #' + inv.invoiceNumber + '\n'
      + '💰 Amount Due: ' + UI.money(inv.balance || inv.total) + '\n'
      + '📅 Due: ' + UI.dateShort(inv.dueDate) + '\n\n'
      + '💳 Pay Online (card):\n' + payLink + '\n\n'
      + 'Or pay by check payable to ' + Workflow._co().name + '.\n\n'
      + 'Thank you for choosing ' + Workflow._co().name + '!\n\n'
      + CompanyInfo.get('ownerName') + '\n' + Workflow._co().phone + '\n' + Workflow._co().email;

    var html = '<div style="padding:16px;">'
      + '<div style="margin-bottom:16px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">To</label>'
      + '<input type="email" id="inv-send-to" value="' + email + '" placeholder="client@email.com" style="width:100%;padding:8px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '</div>'
      + '<div style="margin-bottom:16px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Subject</label>'
      + '<input type="text" id="inv-send-subject" value="' + subject + '" style="width:100%;padding:8px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '</div>'
      + '<div style="margin-bottom:16px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Message</label>'
      + '<textarea id="inv-send-body" rows="14" style="width:100%;padding:10px 12px;border:2px solid var(--border);border-radius:8px;font-size:13px;line-height:1.6;font-family:inherit;resize:vertical;">' + body + '</textarea>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">📎 Invoice PDF will be attached</div>'
      + '</div>';

    UI.showModal('Send Invoice #' + inv.invoiceNumber, html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-outline" onclick="PDF.generateInvoice(\'' + invoiceId + '\')">👁 Preview PDF</button>'
        + ' <button class="btn btn-primary" onclick="Workflow._confirmSendInvoice(\'' + invoiceId + '\')">📧 Send Invoice</button>'
    });
  },

  _confirmSendInvoice: function(invoiceId) {
    var to = document.getElementById('inv-send-to').value.trim();
    if (!to) { UI.toast('Enter an email address', 'error'); return; }

    var subject = document.getElementById('inv-send-subject').value;
    var body = document.getElementById('inv-send-body').value;

    // Build HTML email
    var inv = DB.invoices.getById(invoiceId) || {};
    var firstName = (inv.clientName || '').split(' ')[0] || 'there';
    var payLink = 'https://branchmanager.app/pay.html?id=' + invoiceId;
    var amountDue = (typeof UI !== 'undefined' && UI.money) ? UI.money(inv.balance || inv.total) : ('$' + (inv.balance || inv.total || '0'));
    var dueDateStr = (typeof UI !== 'undefined' && UI.dateShort) ? UI.dateShort(inv.dueDate) : (inv.dueDate || '');
    var htmlBody = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
      + '<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">'
      + '<tr><td align="center">'
      + '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">'
      // Header
      + '<tr><td style="background:#1a3c12;padding:28px 32px;">'
      + '<p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">' + Workflow._co().name + '</p>'
      + '<p style="margin:6px 0 0;font-size:13px;color:#a8d5a2;">Licensed &amp; Insured — Westchester &amp; Putnam Counties</p>'
      + '</td></tr>'
      // Body
      + '<tr><td style="padding:32px;">'
      + '<p style="margin:0 0 20px;font-size:16px;color:#333333;">Hi ' + firstName + ',</p>'
      + '<p style="margin:0 0 24px;font-size:15px;color:#555555;line-height:1.6;">Please find your invoice below for the work completed at your property. You can pay online securely using the button below.</p>'
      // Invoice detail box
      + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8faf7;border:1px solid #d4e6d0;border-radius:8px;margin-bottom:28px;">'
      + '<tr><td style="padding:20px 24px;">'
      + '<p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#1a3c12;text-transform:uppercase;letter-spacing:0.5px;">Invoice Summary</p>'
      + '<table width="100%" cellpadding="0" cellspacing="0">'
      + '<tr><td style="padding:6px 0;font-size:14px;color:#666666;">Invoice Number</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#222222;text-align:right;">#' + (inv.invoiceNumber || '') + '</td></tr>'
      + '<tr><td style="padding:6px 0;font-size:14px;color:#666666;">Client</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#222222;text-align:right;">' + (inv.clientName || '') + '</td></tr>'
      + '<tr><td style="padding:6px 0;font-size:14px;color:#666666;">Amount Due</td><td style="padding:6px 0;font-size:18px;font-weight:700;color:#1a3c12;text-align:right;">' + amountDue + '</td></tr>'
      + '<tr><td style="padding:6px 0;font-size:14px;color:#666666;">Due Date</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#222222;text-align:right;">' + dueDateStr + '</td></tr>'
      + '</table>'
      + '</td></tr>'
      + '</table>'
      // Pay button
      + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">'
      + '<tr><td align="center">'
      + '<a href="' + payLink + '" style="display:inline-block;background:#1a3c12;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 40px;border-radius:8px;letter-spacing:0.3px;">Pay Online Now</a>'
      + '</td></tr>'
      + '</table>'
      + '<p style="margin:0 0 8px;font-size:13px;color:#888888;text-align:center;">Or pay by check payable to <strong>' + Workflow._co().name + '</strong></p>'
      + '<p style="margin:0;font-size:12px;color:#aaaaaa;text-align:center;">Direct link: <a href="' + payLink + '" style="color:#1a3c12;">' + payLink + '</a></p>'
      + '</td></tr>'
      // Footer
      + '<tr><td style="background:#f0f4ef;border-top:1px solid #d4e6d0;padding:20px 32px;text-align:center;">'
      + '<p style="margin:0 0 4px;font-size:13px;color:#555555;font-weight:600;">' + Workflow._co().name + '</p>'
      + '<p style="margin:0;font-size:12px;color:#888888;">' + Workflow._co().phone + ' &nbsp;·&nbsp; <a href="mailto:' + Workflow._co().email + '" style="color:#1a3c12;text-decoration:none;">' + Workflow._co().email + '</a> &nbsp;·&nbsp; <a href="https://' + Workflow._co().website + '" style="color:#1a3c12;text-decoration:none;">' + Workflow._co().website + '</a></p>'
      + '<p style="margin:8px 0 0;font-size:11px;color:#aaaaaa;">Licensed &amp; Insured — WC-32079 (Westchester) · PC-50644 (Putnam)</p>'
      + '</td></tr>'
      + '</table>'
      + '</td></tr>'
      + '</table>'
      + '</body></html>';

    // Try SendGrid via Supabase, fallback to mailto
    Workflow._sendViaSupabase(to, subject, body, function(ok) {
      if (!ok) {
        var mailto = 'mailto:' + to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        window.open(mailto, '_blank');
      }
    }, { htmlBody: htmlBody });

    DB.invoices.update(invoiceId, { status: 'sent', sentAt: new Date().toISOString(), sentTo: to });
    UI.closeModal();
    UI.toast('Invoice sent to ' + to);
  },

  _sendViaSupabase: function(to, subject, body, callback, options) {
    options = options || {};
    // Use Email.send() (SendGrid) if configured, else let caller handle fallback
    if (typeof Email !== 'undefined' && Email.isConfigured()) {
      Email.send(to, subject, body, options).then(function(result) {
        if (callback) callback(result && result.success);
      }).catch(function(err) {
        console.error('[Workflow] Email.send failed:', err);
        if (callback) callback(false);
      });
    } else {
      if (callback) callback(false);
    }
  },

  // Show a payment recording modal with method selection
  showMarkPaid: function(invoiceId) {
    var inv = DB.invoices.getById(invoiceId);
    if (!inv) return;
    var balance = inv.balance || inv.total || 0;
    var hasEmail = !!(inv.clientEmail || (inv.clientId && DB.clients.getById(inv.clientId) && DB.clients.getById(inv.clientId).email));

    // Two-path top: send payment link OR record payment manually
    var html = '<div style="text-align:center;padding:4px 0 12px;">'
      + '<h3 style="font-size:18px;margin:0 0 4px;">Collect Payment</h3>'
      + '<p style="color:var(--text-light);font-size:14px;margin:0;">Invoice #' + inv.invoiceNumber + ' — ' + UI.money(balance) + ' due</p>'
      + '</div>'
      // Send-link shortcut
      + (hasEmail
          ? '<button type="button" onclick="UI.closeModal();InvoicesPage._sendInvoiceEmail(\'' + invoiceId + '\')" style="width:100%;background:#635bff;color:#fff;border:none;padding:14px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:8px;">💳 Email payment link to client</button>'
          : '<div style="padding:10px 12px;background:#fff8e1;border:1px solid #ffe082;border-radius:8px;font-size:12px;color:#7c5e00;margin-bottom:8px;">No email on file — add one to send a payment link.</div>')
      + '<div style="text-align:center;font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;margin:14px 0 10px;">Or record payment manually</div>'
      + '<div style="text-align:left;margin-bottom:16px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);">Amount Received</label>'
      + '<input type="number" id="mp-amount" value="' + balance.toFixed(2) + '" step="0.01" min="0.01" style="width:100%;padding:12px;border:2px solid var(--border);border-radius:8px;font-size:18px;font-weight:700;margin-top:4px;text-align:center;">'
      + '</div>'
      + '<div style="text-align:left;margin-bottom:8px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);margin-bottom:8px;display:block;">Payment Method</label>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">';
    ['Cash', 'Check', 'Card', 'Other'].forEach(function(m, i) {
      html += '<button type="button" class="mp-method-btn" data-method="' + m.toLowerCase() + '" '
        + 'onclick="document.querySelectorAll(\'.mp-method-btn\').forEach(function(b){b.style.background=\'var(--bg)\';b.style.color=\'var(--text)\';b.style.borderColor=\'var(--border)\'});this.style.background=\'var(--green-dark)\';this.style.color=\'#fff\';this.style.borderColor=\'var(--green-dark)\';document.getElementById(\'mp-method-val\').value=this.dataset.method;" '
        + 'style="padding:10px 8px;background:' + (i === 0 ? 'var(--green-dark);color:#fff' : 'var(--bg);color:var(--text)') + ';border:2px solid ' + (i === 0 ? 'var(--green-dark)' : 'var(--border)') + ';border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">'
        + m + '</button>';
    });
    html += '</div>'
      + '<input type="hidden" id="mp-method-val" value="cash">'
      + '</div>'
      + '<div style="text-align:left;margin-bottom:20px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);">Note (optional)</label>'
      + '<input type="text" id="mp-note" placeholder="Check #, transaction ID..." style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;margin-top:4px;">'
      + '</div>';

    UI.showModal('Record Payment', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="Workflow._confirmMarkPaid(\'' + invoiceId + '\')">✅ Record Payment</button>'
    });
  },

  _confirmMarkPaid: function(invoiceId) {
    var amount = parseFloat(document.getElementById('mp-amount').value);
    var method = document.getElementById('mp-method-val').value || 'cash';
    var note = document.getElementById('mp-note') ? document.getElementById('mp-note').value : '';
    if (!amount || amount <= 0) { UI.toast('Enter a valid amount', 'error'); return; }

    var inv = DB.invoices.getById(invoiceId);
    if (!inv) return;

    var prevPaid = inv.amountPaid || 0;
    var newPaid = prevPaid + amount;
    var newBalance = Math.max(0, (inv.total || 0) - newPaid);
    var isFullyPaid = newBalance <= 0;

    DB.invoices.update(invoiceId, {
      status: isFullyPaid ? 'paid' : 'partial',
      balance: newBalance,
      amountPaid: newPaid,
      paidDate: isFullyPaid ? new Date().toISOString() : (inv.paidDate || null),
      paymentMethod: method
    });

    // Save to payment history log
    var pKey = 'bm-payments-' + invoiceId;
    var allPmts = [];
    try { allPmts = JSON.parse(localStorage.getItem(pKey)) || []; } catch(e) {}
    allPmts.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      invoiceId: invoiceId,
      amount: amount,
      method: method,
      note: note,
      date: new Date().toISOString(),
      user: 'Doug'
    });
    localStorage.setItem(pKey, JSON.stringify(allPmts));

    if (isFullyPaid) {
      UI.toast('Payment recorded! ✅ Invoice #' + (inv.invoiceNumber || invoiceId) + ' marked paid.');
      // Optionally send thank-you email if email is configured and client has an address
      var clientEmail = inv.clientEmail || '';
      if (clientEmail && typeof Email !== 'undefined' && Email.isConfigured()) {
        var firstName = (inv.clientName || '').split(' ')[0] || 'there';
        var thankSubject = 'Thank you for your payment — ' + Workflow._co().name;
        var thankBody = 'Hi ' + firstName + ',\n\nThank you for your payment of ' + UI.money(amount) + '! Invoice #' + (inv.invoiceNumber || '') + ' is now paid in full.\n\n'
          + 'We appreciate your business and look forward to serving you again.\n\n'
          + 'Thank you,\n' + CompanyInfo.get('ownerName') + '\n' + Workflow._co().name + '\n' + Workflow._co().phone + '\n' + Workflow._co().website;
        Email.send(clientEmail, thankSubject, thankBody);
      }
    } else {
      UI.toast('Payment recorded — ' + UI.money(amount) + ' via ' + method + '. Balance: ' + UI.money(newBalance));
    }
    UI.closeModal();
    if (typeof InvoicesPage !== 'undefined') InvoicesPage.showDetail(invoiceId);
  }
};
