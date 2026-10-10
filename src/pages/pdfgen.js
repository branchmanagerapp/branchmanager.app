/**
 * Branch Manager — PDF Generation Module
 * Generates professional, branded PDF documents for quotes, invoices, and job summaries
 * Uses browser print-to-PDF via styled popup window (no external libraries)
 */
var PDFGen = {
  get COMPANY() {
    return {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      address: CompanyInfo.get('address') || '',
      licenseWC: (CompanyInfo.get('licenses')).split(',')[0].trim(),
      licensePutnam: (CompanyInfo.get('licenses')).split(',')[1] ? (CompanyInfo.get('licenses')).split(',')[1].trim() : 'PC-50644',
      website: CompanyInfo.get('website'),
      color: '#2e7d32'
    };
  },

  /**
   * Generate and open a print-ready Quote PDF
   */
  generateQuote: function(quoteId) {
    var q = DB.quotes.getById(quoteId);
    if (!q) { UI.toast('Quote not found', 'error'); return; }
    var client = q.clientId ? DB.clients.getById(q.clientId) : null;

    var quoteNum = q.quoteNumber || q.id || '';
    var createdDate = PDFGen._formatDate(q.createdAt);
    var validUntil = q.validUntil ? PDFGen._formatDate(q.validUntil) : PDFGen._addDays(q.createdAt, 30);

    // Client info
    var cName = client ? client.name : (q.clientName || '');
    var cAddress = client ? (client.address || '') : (q.property || '');
    var cPhone = client ? (client.phone || '') : (q.clientPhone || '');
    var cEmail = client ? (client.email || '') : (q.clientEmail || '');
    var property = q.property || cAddress;

    // Build line items from whichever field exists
    var items = q.lineItems || q.items || [];
    var subtotal = 0;
    items.forEach(function(item) {
      var amt = item.amount || item.total || ((item.qty || 1) * (item.rate || item.unitPrice || 0));
      subtotal += amt;
    });
    var tax = q.tax || 0;
    var total = q.total || (subtotal + tax);

    // Build HTML
    var body = '';

    // Header
    body += PDFGen._buildHeader('QUOTE', [
      { label: 'Quote #', value: quoteNum },
      { label: 'Date', value: createdDate },
      { label: 'Valid Until', value: validUntil },
      { label: 'Status', value: (q.status || 'draft').toUpperCase(), badge: q.status }
    ]);

    // Client info block
    body += PDFGen._buildClientBlock('Prepared For', cName, cAddress, cPhone, cEmail, property);

    // Scope of work
    if (q.description) {
      body += '<div class="scope-section">'
        + '<h3 class="section-title">Scope of Work</h3>'
        + '<p class="scope-text">' + PDFGen._escapeHtml(q.description) + '</p>'
        + '</div>';
    }

    // Line items table
    if (items.length) {
      body += PDFGen._buildLineItems(items);

      // Totals
      body += '<div class="totals-block">';
      if (tax > 0) {
        body += '<div class="totals-row"><span>Subtotal</span><span>' + PDFGen._money(subtotal) + '</span></div>';
        body += '<div class="totals-row"><span>Tax</span><span>' + PDFGen._money(tax) + '</span></div>';
      }
      body += '<div class="totals-row totals-grand"><span>Total</span><span>' + PDFGen._money(total) + '</span></div>';
      body += '</div>';
    } else {
      // Single total if no line items
      body += '<div class="totals-block">';
      body += '<div class="totals-row totals-grand"><span>Total</span><span>' + PDFGen._money(total) + '</span></div>';
      body += '</div>';
    }

    // Time & Material estimate (internal reference — not shown on client PDF by default)
    if (q.timeMaterial && q.timeMaterial.totalHrs) {
      var tm = q.timeMaterial;
      body += '<div style="margin:20px 0;border:2px solid #e5e7eb;border-radius:10px;overflow:hidden;">'
        + '<div style="background:#f0f4ff;padding:10px 16px;font-weight:700;font-size:14px;border-bottom:2px solid #e5e7eb;">Production Estimate</div>'
        + '<div style="padding:14px 16px;font-size:13px;">'
        + '<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>Climber: ' + (tm.climberHrs || 0) + ' hrs</span>'
        + '<span>Ground crew (' + (tm.groundCount || 0) + '): ' + (tm.groundHrs || 0) + ' hrs</span></div>'
        + '<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>Total job hours: ' + tm.totalHrs + '</span>'
        + (tm.disposal ? '<span>Disposal: ' + PDFGen._money(tm.disposal) + '</span>' : '') + '</div>'
        + '<div style="padding:3px 0;">Equipment: '
        + (tm.bucket ? 'Bucket truck ' : '') + (tm.chipper ? 'Chipper ' : '') + (tm.crane ? 'Crane ' : '') + (tm.stumpGrinder ? 'Stump grinder ' : '')
        + (!tm.bucket && !tm.chipper && !tm.crane && !tm.stumpGrinder ? 'None' : '')
        + '</div>'
        + (tm.tmTotal ? '<div style="padding:6px 0;border-top:1px solid #e5e7eb;font-weight:700;text-align:right;">T&M Price: ' + PDFGen._money(tm.tmTotal) + '</div>' : '')
        + '</div></div>';
    }

    // Deposit notice
    if (q.depositRequired && q.depositDue > 0) {
      body += '<div class="deposit-notice">'
        + '<h4>Deposit Required</h4>'
        + '<p>A deposit of <strong>' + PDFGen._money(q.depositDue) + '</strong> is required to schedule this work.</p>'
        + '</div>';
    } else if (total > 1000) {
      var deposit = Math.round(total * 0.5);
      body += '<div class="deposit-notice">'
        + '<h4>Deposit Required</h4>'
        + '<p>A 50% deposit of <strong>' + PDFGen._money(deposit) + '</strong> is required to schedule this work. '
        + 'The remaining balance of <strong>' + PDFGen._money(total - deposit) + '</strong> is due upon completion.</p>'
        + '</div>';
    }

    // Notes
    if (q.notes) {
      body += '<div class="notes-section">'
        + '<h4>Notes</h4>'
        + '<p>' + PDFGen._escapeHtml(q.notes) + '</p>'
        + '</div>';
    }

    // Terms & conditions (comprehensive tree service terms)
    body += '<div class="terms-section">'
      + '<h4>Terms &amp; Conditions</h4>'
      + '<ul>'
      + '<li><strong>Validity:</strong> This quote is valid for 30 days from the date above. Pricing may change after expiration.</li>'
      + '<li><strong>Payment:</strong> A 50% deposit is required to schedule work unless otherwise noted. Remaining balance is due upon completion. Invoices unpaid after 30 days are subject to a 1.5% monthly late fee.</li>'
      + '<li><strong>Scheduling:</strong> Work will be scheduled within 2-4 weeks of deposit receipt, weather permitting. ' + PDFGen.COMPANY.name + ' will provide 24-48 hours advance notice.</li>'
      + '<li><strong>Access:</strong> Client will provide clear access to the work area for trucks and equipment. Client will move vehicles, outdoor furniture, and fragile items from the work zone. If access is blocked on the scheduled date, a trip charge may apply.</li>'
      + '<li><strong>Scope:</strong> This quote covers only the work described above. Additional work will be quoted separately and requires written approval before proceeding.</li>'
      + '<li><strong>Cleanup:</strong> All debris from the contracted work will be removed. Wood may be left on-site if requested.</li>'
      + '<li><strong>Stump Grinding:</strong> If included, stumps are ground 6-8 inches below grade. Grindings fill the hole unless removal is specified. Contractor is not responsible for underground utilities, irrigation, or septic unless disclosed in advance.</li>'
      + '<li><strong>Insurance:</strong> ' + PDFGen.COMPANY.name + ' carries General Liability and Workers\' Compensation insurance. Certificates available upon request.</li>'
      + '<li><strong>Liability:</strong> ' + PDFGen.COMPANY.name + ' is not responsible for pre-existing conditions (dead limbs, disease, structural defects not visible at time of estimate), underground utilities not disclosed by client, or damage caused by weather events. Total liability shall not exceed the contract amount.</li>'
      + '<li><strong>Permits:</strong> Client is responsible for obtaining any required tree removal permits. Contractor can assist with permit applications if needed.</li>'
      + '<li><strong>Cancellation:</strong> Cancel with 48 hours notice for full deposit refund. Cancellations within 48 hours: deposit is forfeited. If work has begun, client owes for work completed to date.</li>'
      + '<li><strong>Warranty:</strong> Workmanship warranted for 30 days. Does not cover natural events (storms, disease, pest damage).</li>'
      + '</ul>'
      + '<p style="font-size:10px;color:#666;margin-top:8px;">' + PDFGen.COMPANY.name + ' · ' + PDFGen.COMPANY.address + ' · ' + PDFGen.COMPANY.phone + ' · Licensed &amp; Fully Insured · ' + PDFGen.COMPANY.licenses + '</p>'
      + '</div>';

    // Signature block
    body += '<div class="signature-block">'
      + '<h4>Authorization to Proceed</h4>'
      + '<p class="sig-desc">I authorize ' + PDFGen.COMPANY.name + ' to perform the work described above at the quoted price.</p>'
      + '<div class="sig-grid">'
      + '<div class="sig-field"><div class="sig-line"></div><span>Client Signature</span></div>'
      + '<div class="sig-field"><div class="sig-line"></div><span>Printed Name</span></div>'
      + '<div class="sig-field"><div class="sig-line"></div><span>Date</span></div>'
      + '</div>'
      + '</div>';

    // Footer
    body += PDFGen._buildFooter();

    PDFGen._openPrintWindow('Quote #' + quoteNum, body);
  },

  /**
   * Generate and open a print-ready Invoice PDF
   */
  generateInvoice: function(invoiceId) {
    var inv = DB.invoices.getById(invoiceId);
    if (!inv) { UI.toast('Invoice not found', 'error'); return; }
    var client = inv.clientId ? DB.clients.getById(inv.clientId) : null;

    var invNum = inv.invoiceNumber || inv.id || '';
    var createdDate = PDFGen._formatDate(inv.createdAt);
    var dueDate = inv.dueDate ? PDFGen._formatDate(inv.dueDate) : '';

    // Client info
    var cName = client ? client.name : (inv.clientName || '');
    var cAddress = client ? (client.address || '') : (inv.property || '');
    var cPhone = client ? (client.phone || '') : (inv.clientPhone || '');
    var cEmail = client ? (client.email || '') : (inv.clientEmail || '');

    // Items and totals
    var items = inv.lineItems || inv.items || [];
    var subtotal = 0;
    items.forEach(function(item) {
      var amt = item.amount || item.total || ((item.qty || 1) * (item.rate || item.unitPrice || 0));
      subtotal += amt;
    });
    var tax = inv.tax || 0;
    var total = inv.total || (subtotal + tax);
    var paidAmount = inv.paidAmount || inv.paid || 0;
    var balance = inv.balance !== undefined ? inv.balance : (total - paidAmount);
    var isOverdue = inv.status === 'overdue' || (inv.dueDate && new Date(inv.dueDate) < new Date() && balance > 0);

    // Build HTML
    var body = '';

    // Overdue banner
    if (isOverdue) {
      body += '<div class="overdue-banner">PAST DUE — Payment was due ' + dueDate + '</div>';
    }

    // Header
    var headerMeta = [
      { label: 'Invoice #', value: invNum },
      { label: 'Date', value: createdDate },
      { label: 'Due Date', value: dueDate }
    ];
    if (inv.status) {
      headerMeta.push({ label: 'Status', value: (inv.status || '').toUpperCase(), badge: inv.status });
    }
    body += PDFGen._buildHeader('INVOICE', headerMeta);

    // Client info block
    body += PDFGen._buildClientBlock('Bill To', cName, cAddress, cPhone, cEmail);

    // Line items table
    if (items.length) {
      body += PDFGen._buildLineItems(items);
    } else {
      // Fallback: single description row
      body += '<table class="items-table">'
        + '<thead><tr><th>Description</th><th class="col-right">Amount</th></tr></thead>'
        + '<tbody>'
        + '<tr><td>' + PDFGen._escapeHtml(inv.subject || 'Tree services rendered') + '</td>'
        + '<td class="col-right">' + PDFGen._money(total) + '</td></tr>'
        + '</tbody></table>';
    }

    // Totals
    body += '<div class="totals-block">';
    if (items.length && tax > 0) {
      body += '<div class="totals-row"><span>Subtotal</span><span>' + PDFGen._money(subtotal) + '</span></div>';
      body += '<div class="totals-row"><span>Tax</span><span>' + PDFGen._money(tax) + '</span></div>';
    }
    body += '<div class="totals-row totals-grand"><span>Total</span><span>' + PDFGen._money(total) + '</span></div>';
    if (paidAmount > 0) {
      body += '<div class="totals-row totals-paid"><span>Amount Paid</span><span>-' + PDFGen._money(paidAmount) + '</span></div>';
    }
    if (balance > 0 && balance !== total) {
      var balClass = isOverdue ? 'totals-row totals-balance totals-overdue' : 'totals-row totals-balance';
      body += '<div class="' + balClass + '"><span>Balance Due</span><span>' + PDFGen._money(balance) + '</span></div>';
    }
    body += '</div>';

    // Payment options
    body += '<div class="payment-options">'
      + '<h4>Payment Options</h4>'
      + '<div class="pay-grid">'
      + '<div class="pay-method"><strong>Check</strong><span>Payable to:<br>' + PDFGen.COMPANY.name + '</span></div>'
      + '<div class="pay-method"><strong>Credit Card</strong><span>Pay online via<br>emailed link</span></div>'
      + '</div>'
      + '</div>';

    // Notes
    if (inv.notes) {
      body += '<div class="notes-section">'
        + '<h4>Notes</h4>'
        + '<p>' + PDFGen._escapeHtml(inv.notes) + '</p>'
        + '</div>';
    }

    // Payment terms
    body += '<div class="terms-section terms-short">'
      + '<h4>Payment Terms</h4>'
      + '<p>Payment is due by <strong>' + dueDate + '</strong>. '
      + 'Late payments may be subject to a 1.5% monthly finance charge. '
      + 'For questions about this invoice, please call ' + PDFGen.COMPANY.phone + ' or email ' + PDFGen.COMPANY.email + '.</p>'
      + '</div>';

    // Thank you
    body += '<div class="thank-you">Thank you for your business!</div>';

    // Footer
    body += PDFGen._buildFooter();

    PDFGen._openPrintWindow('Invoice #' + invNum, body);
  },

  /**
   * Generate and open a print-ready Job Summary PDF
   */
  generateJobSummary: function(jobId) {
    var job = DB.jobs.getById(jobId);
    if (!job) { UI.toast('Job not found', 'error'); return; }
    var client = job.clientId ? DB.clients.getById(job.clientId) : null;

    var jobNum = job.jobNumber || job.id || '';
    var cName = client ? client.name : (job.clientName || '');
    var property = job.property || (client ? (client.address || '') : '');

    // Build HTML
    var body = '';

    // Header
    body += PDFGen._buildHeader('JOB SUMMARY', [
      { label: 'Job #', value: jobNum },
      { label: 'Date', value: PDFGen._formatDate(job.scheduledDate || job.createdAt) },
      { label: 'Status', value: (job.status || '').toUpperCase(), badge: job.status }
    ]);

    // Job details grid
    body += '<div class="job-details-grid">'
      + '<div class="job-detail-card">'
      + '<h4>Client</h4>'
      + '<p class="detail-primary">' + PDFGen._escapeHtml(cName) + '</p>';
    if (client && client.phone) {
      body += '<p class="detail-secondary">' + (client.phone || '') + '</p>';
    }
    if (client && client.email) {
      body += '<p class="detail-secondary">' + (client.email || '') + '</p>';
    }
    body += '</div>';

    body += '<div class="job-detail-card">'
      + '<h4>Property</h4>'
      + '<p class="detail-primary">' + PDFGen._escapeHtml(property) + '</p>'
      + '</div>';

    if (job.completedDate || job.completedAt) {
      body += '<div class="job-detail-card">'
        + '<h4>Completed</h4>'
        + '<p class="detail-primary">' + PDFGen._formatDate(job.completedDate || job.completedAt) + '</p>'
        + '</div>';
    }

    if (job.crew || job.assignedTo) {
      var crewText = '';
      if (job.crew && Array.isArray(job.crew)) {
        crewText = job.crew.join(', ');
      } else if (job.crew) {
        crewText = job.crew;
      } else {
        crewText = job.assignedTo;
      }
      body += '<div class="job-detail-card">'
        + '<h4>Crew Assigned</h4>'
        + '<p class="detail-primary">' + PDFGen._escapeHtml(crewText) + '</p>'
        + '</div>';
    }
    body += '</div>';

    // Scope of work / description
    if (job.description) {
      body += '<div class="scope-section">'
        + '<h3 class="section-title">Services Performed</h3>'
        + '<p class="scope-text">' + PDFGen._escapeHtml(job.description) + '</p>'
        + '</div>';
    }

    // Line items if available
    var items = job.lineItems || job.items || [];
    if (items.length) {
      body += '<h3 class="section-title">Service Details</h3>';
      body += PDFGen._buildLineItems(items);
    }

    // Total cost
    if (job.total) {
      body += '<div class="totals-block">';
      body += '<div class="totals-row totals-grand"><span>Total Cost</span><span>' + PDFGen._money(job.total) + '</span></div>';
      body += '</div>';
    }

    // Photos section
    var photos = job.photos || [];
    if (photos.length) {
      body += '<div class="photos-section">'
        + '<h3 class="section-title">Photos</h3>'
        + '<div class="photo-grid">';
      photos.forEach(function(photo) {
        var src = photo.url || photo.src || photo;
        var caption = photo.caption || photo.label || '';
        body += '<div class="photo-item">'
          + '<img src="' + src + '" alt="' + PDFGen._escapeHtml(caption) + '">'
          + (caption ? '<span class="photo-caption">' + PDFGen._escapeHtml(caption) + '</span>' : '')
          + '</div>';
      });
      body += '</div></div>';
    }

    // Notes
    if (job.notes) {
      body += '<div class="notes-section">'
        + '<h4>Job Notes</h4>'
        + '<p>' + PDFGen._escapeHtml(job.notes) + '</p>'
        + '</div>';
    }

    // Footer
    body += PDFGen._buildFooter();

    PDFGen._openPrintWindow('Job Summary #' + jobNum, body);
  },

  // =====================================================
  // Private helper methods
  // =====================================================

  /**
   * Build the company header section
   */
  _buildHeader: function(docType, metaItems) {
    var html = '<div class="doc-header">'
      + '<div class="header-left">'
      + '<div class="company-bar"></div>'
      + '<div class="company-info">'
      + '<h1 class="company-name">' + PDFGen.COMPANY.name + '</h1>'
      + '<p>' + PDFGen.COMPANY.address + '</p>'
      + '<p>' + PDFGen.COMPANY.phone + '</p>'
      + '<p>' + PDFGen.COMPANY.email + '</p>'
      + '</div>'
      + '</div>'
      + '<div class="header-right">'
      + '<h2 class="doc-type">' + docType + '</h2>';

    if (metaItems && metaItems.length) {
      metaItems.forEach(function(item) {
        if (item.badge) {
          html += '<p class="meta-line"><span class="meta-label">' + item.label + '</span> '
            + '<span class="status-badge status-' + item.badge + '">' + item.value + '</span></p>';
        } else {
          html += '<p class="meta-line"><span class="meta-label">' + item.label + '</span> ' + item.value + '</p>';
        }
      });
    }

    html += '</div></div>';
    return html;
  },

  /**
   * Build a client info block
   */
  _buildClientBlock: function(heading, name, address, phone, email, property) {
    var html = '<div class="client-block">'
      + '<h3 class="block-label">' + heading + '</h3>'
      + '<p class="client-name">' + PDFGen._escapeHtml(name) + '</p>';
    if (address) html += '<p>' + PDFGen._escapeHtml(address) + '</p>';
    if (phone) html += '<p>' + PDFGen._escapeHtml(phone) + '</p>';
    if (email) html += '<p>' + PDFGen._escapeHtml(email) + '</p>';
    if (property && property !== address) {
      html += '<p class="property-line"><strong>Property:</strong> ' + PDFGen._escapeHtml(property) + '</p>';
    }
    html += '</div>';
    return html;
  },

  /**
   * Build an HTML table for line items
   */
  _buildLineItems: function(items) {
    var html = '<table class="items-table">'
      + '<thead><tr>'
      + '<th>Service</th>'
      + '<th>Description</th>'
      + '<th class="col-center">Qty</th>'
      + '<th class="col-right">Unit Price</th>'
      + '<th class="col-right">Total</th>'
      + '</tr></thead>'
      + '<tbody>';

    items.forEach(function(item, idx) {
      var name = item.service || item.name || 'Service';
      var desc = item.description || '';
      var qty = item.qty || item.quantity || 1;
      var rate = item.rate || item.unitPrice || item.price || 0;
      var amt = item.amount || item.total || (qty * rate);
      var rowClass = idx % 2 === 1 ? ' class="alt-row"' : '';

      html += '<tr' + rowClass + '>'
        + '<td class="item-name">' + PDFGen._escapeHtml(name) + '</td>'
        + '<td class="item-desc">' + PDFGen._escapeHtml(desc) + '</td>'
        + '<td class="col-center">' + qty + '</td>'
        + '<td class="col-right">' + PDFGen._money(rate) + '</td>'
        + '<td class="col-right">' + PDFGen._money(amt) + '</td>'
        + '</tr>';
    });

    html += '</tbody></table>';
    return html;
  },

  /**
   * Build the footer with license numbers
   */
  _buildFooter: function() {
    return '<div class="doc-footer">'
      + '<div class="footer-line">' + PDFGen.COMPANY.name + ' &bull; ' + PDFGen.COMPANY.website + ' &bull; ' + PDFGen.COMPANY.phone + '</div>'
      + '<div class="footer-line">Licensed &amp; Fully Insured &mdash; Westchester County (' + PDFGen.COMPANY.licenseWC + ') &bull; Putnam County (' + PDFGen.COMPANY.licensePutnam + ')</div>'
      + '</div>';
  },

  /**
   * Open a new print-optimized window and trigger print dialog
   */
  _openPrintWindow: function(title, bodyHtml) {
    var fullHtml = '<!DOCTYPE html>'
      + '<html lang="en">'
      + '<head>'
      + '<meta charset="UTF-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
      + '<title>' + PDFGen._escapeHtml(title) + ' — ' + PDFGen.COMPANY.name + '</title>'
      + PDFGen._buildStyles()
      + '</head>'
      + '<body>'
      + '<div class="page">'
      + bodyHtml
      + '</div>'
      + '</body></html>';

    var w = window.open('', '_blank', 'width=850,height=1100');
    if (!w) {
      UI.toast('Pop-up blocked — please allow pop-ups for this site', 'error');
      return;
    }
    w.document.write(fullHtml);
    w.document.close();

    // Auto-trigger print after rendering
    setTimeout(function() {
      w.focus();
      w.print();
    }, 600);
  },

  /**
   * Build the full CSS stylesheet for print documents
   */
  _buildStyles: function() {
    var c = PDFGen.COMPANY.color;
    return '<style>'
      // Page setup for print
      + '@page {'
      + '  margin: 0.75in;'
      + '  size: letter;'
      + '}'

      // Reset and base
      + '*, *::before, *::after {'
      + '  margin: 0;'
      + '  padding: 0;'
      + '  box-sizing: border-box;'
      + '}'
      + 'body {'
      + '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;'
      + '  font-size: 14px;'
      + '  line-height: 1.5;'
      + '  color: #1a1a1a;'
      + '  background: #f5f5f5;'
      + '}'
      + '.page {'
      + '  max-width: 800px;'
      + '  margin: 20px auto;'
      + '  background: #fff;'
      + '  padding: 48px;'
      + '  box-shadow: 0 2px 16px rgba(0,0,0,0.1);'
      + '  border-radius: 4px;'
      + '}'

      // ==========================================
      // Header
      // ==========================================
      + '.doc-header {'
      + '  display: flex;'
      + '  justify-content: space-between;'
      + '  align-items: flex-start;'
      + '  margin-bottom: 32px;'
      + '  padding-bottom: 24px;'
      + '  border-bottom: 3px solid ' + c + ';'
      + '}'
      + '.header-left {'
      + '  display: flex;'
      + '  align-items: flex-start;'
      + '  gap: 14px;'
      + '}'
      + '.company-bar {'
      + '  width: 6px;'
      + '  min-height: 70px;'
      + '  background: ' + c + ';'
      + '  border-radius: 3px;'
      + '  flex-shrink: 0;'
      + '}'
      + '.company-name {'
      + '  font-size: 22px;'
      + '  font-weight: 800;'
      + '  color: ' + c + ';'
      + '  margin-bottom: 4px;'
      + '}'
      + '.company-info p {'
      + '  font-size: 12px;'
      + '  color: #666;'
      + '  line-height: 1.6;'
      + '}'
      + '.header-right {'
      + '  text-align: right;'
      + '}'
      + '.doc-type {'
      + '  font-size: 32px;'
      + '  font-weight: 800;'
      + '  color: ' + c + ';'
      + '  letter-spacing: 0.02em;'
      + '  margin-bottom: 8px;'
      + '}'
      + '.meta-line {'
      + '  font-size: 13px;'
      + '  color: #555;'
      + '  margin-bottom: 2px;'
      + '}'
      + '.meta-label {'
      + '  font-weight: 600;'
      + '  color: #333;'
      + '}'

      // Status badges
      + '.status-badge {'
      + '  display: inline-block;'
      + '  padding: 2px 10px;'
      + '  border-radius: 10px;'
      + '  font-size: 11px;'
      + '  font-weight: 700;'
      + '  letter-spacing: 0.03em;'
      + '}'
      + '.status-draft { background: #f0f0f0; color: #666; }'
      + '.status-sent { background: #fff3e0; color: #e65100; }'
      + '.status-approved { background: #e8f5e9; color: #2e7d32; }'
      + '.status-paid { background: #e8f5e9; color: #2e7d32; }'
      + '.status-overdue { background: #ffebee; color: #c62828; }'
      + '.status-completed { background: #e3f2fd; color: #1565c0; }'
      + '.status-scheduled { background: #fff3e0; color: #e65100; }'
      + '.status-in_progress { background: #e3f2fd; color: #1565c0; }'
      + '.status-cancelled { background: #f0f0f0; color: #999; }'

      // ==========================================
      // Client block
      // ==========================================
      + '.client-block {'
      + '  background: #f8f9fa;'
      + '  border-radius: 8px;'
      + '  padding: 20px 24px;'
      + '  margin-bottom: 28px;'
      + '  border-left: 4px solid ' + c + ';'
      + '}'
      + '.block-label {'
      + '  font-size: 11px;'
      + '  font-weight: 700;'
      + '  color: #888;'
      + '  text-transform: uppercase;'
      + '  letter-spacing: 0.08em;'
      + '  margin-bottom: 8px;'
      + '}'
      + '.client-name {'
      + '  font-size: 18px;'
      + '  font-weight: 700;'
      + '  color: #1a1a1a;'
      + '  margin-bottom: 4px;'
      + '}'
      + '.client-block p {'
      + '  font-size: 13px;'
      + '  color: #555;'
      + '  line-height: 1.6;'
      + '}'
      + '.property-line {'
      + '  margin-top: 8px;'
      + '}'

      // ==========================================
      // Scope section
      // ==========================================
      + '.scope-section {'
      + '  margin-bottom: 24px;'
      + '}'
      + '.section-title {'
      + '  font-size: 15px;'
      + '  font-weight: 700;'
      + '  color: ' + c + ';'
      + '  margin-bottom: 8px;'
      + '  padding-bottom: 4px;'
      + '  border-bottom: 1px solid #e8e8e8;'
      + '}'
      + '.scope-text {'
      + '  font-size: 14px;'
      + '  line-height: 1.7;'
      + '  color: #444;'
      + '}'

      // ==========================================
      // Line items table
      // ==========================================
      + '.items-table {'
      + '  width: 100%;'
      + '  border-collapse: collapse;'
      + '  margin-bottom: 4px;'
      + '}'
      + '.items-table thead th {'
      + '  background: ' + c + ';'
      + '  color: #fff;'
      + '  padding: 10px 14px;'
      + '  font-size: 11px;'
      + '  font-weight: 700;'
      + '  text-transform: uppercase;'
      + '  letter-spacing: 0.04em;'
      + '  text-align: left;'
      + '}'
      + '.items-table td {'
      + '  padding: 10px 14px;'
      + '  font-size: 13px;'
      + '  border-bottom: 1px solid #eee;'
      + '  vertical-align: top;'
      + '}'
      + '.alt-row { background: #fafafa; }'
      + '.item-name { font-weight: 600; }'
      + '.item-desc { color: #666; }'
      + '.col-center { text-align: center; }'
      + '.col-right { text-align: right; }'

      // ==========================================
      // Totals
      // ==========================================
      + '.totals-block {'
      + '  margin-left: auto;'
      + '  width: 280px;'
      + '  margin-bottom: 28px;'
      + '}'
      + '.totals-row {'
      + '  display: flex;'
      + '  justify-content: space-between;'
      + '  padding: 8px 14px;'
      + '  font-size: 14px;'
      + '  border-bottom: 1px solid #eee;'
      + '}'
      + '.totals-grand {'
      + '  background: #f0f7ed;'
      + '  border: 2px solid ' + c + ';'
      + '  border-radius: 6px;'
      + '  font-size: 18px;'
      + '  font-weight: 800;'
      + '  color: ' + c + ';'
      + '  margin-top: 4px;'
      + '}'
      + '.totals-paid {'
      + '  color: ' + c + ';'
      + '  font-weight: 600;'
      + '}'
      + '.totals-balance {'
      + '  font-weight: 700;'
      + '  font-size: 16px;'
      + '  margin-top: 4px;'
      + '  border-radius: 6px;'
      + '}'
      + '.totals-overdue {'
      + '  background: #ffebee;'
      + '  border: 2px solid #c62828;'
      + '  color: #c62828;'
      + '}'

      // ==========================================
      // Deposit notice
      // ==========================================
      + '.deposit-notice {'
      + '  background: #fff8e1;'
      + '  border: 1px solid #ffe082;'
      + '  border-radius: 8px;'
      + '  padding: 16px 20px;'
      + '  margin-bottom: 24px;'
      + '}'
      + '.deposit-notice h4 {'
      + '  font-size: 14px;'
      + '  color: #e65100;'
      + '  margin-bottom: 6px;'
      + '}'
      + '.deposit-notice p {'
      + '  font-size: 13px;'
      + '  color: #555;'
      + '  line-height: 1.6;'
      + '}'

      // ==========================================
      // Overdue banner
      // ==========================================
      + '.overdue-banner {'
      + '  background: #c62828;'
      + '  color: #fff;'
      + '  text-align: center;'
      + '  padding: 10px;'
      + '  font-size: 14px;'
      + '  font-weight: 700;'
      + '  letter-spacing: 0.04em;'
      + '  border-radius: 6px;'
      + '  margin-bottom: 24px;'
      + '}'

      // ==========================================
      // Payment options
      // ==========================================
      + '.payment-options {'
      + '  background: #f0f7ed;'
      + '  border: 1px solid #c8e6c9;'
      + '  border-radius: 8px;'
      + '  padding: 20px 24px;'
      + '  margin-bottom: 24px;'
      + '}'
      + '.payment-options h4 {'
      + '  font-size: 14px;'
      + '  font-weight: 700;'
      + '  color: ' + c + ';'
      + '  margin-bottom: 12px;'
      + '}'
      + '.pay-grid {'
      + '  display: grid;'
      + '  grid-template-columns: repeat(4, 1fr);'
      + '  gap: 12px;'
      + '}'
      + '.pay-method {'
      + '  background: #fff;'
      + '  border: 1px solid #e0e0e0;'
      + '  border-radius: 6px;'
      + '  padding: 12px;'
      + '  text-align: center;'
      + '  font-size: 12px;'
      + '}'
      + '.pay-method strong {'
      + '  display: block;'
      + '  margin-bottom: 4px;'
      + '  font-size: 13px;'
      + '}'
      + '.pay-method span {'
      + '  color: #666;'
      + '  line-height: 1.4;'
      + '}'

      // ==========================================
      // Notes & terms
      // ==========================================
      + '.notes-section {'
      + '  background: #f8f9fa;'
      + '  border-radius: 8px;'
      + '  padding: 16px 20px;'
      + '  margin-bottom: 20px;'
      + '}'
      + '.notes-section h4, .terms-section h4 {'
      + '  font-size: 13px;'
      + '  font-weight: 700;'
      + '  color: #333;'
      + '  margin-bottom: 8px;'
      + '}'
      + '.notes-section p {'
      + '  font-size: 13px;'
      + '  color: #555;'
      + '  line-height: 1.6;'
      + '}'
      + '.terms-section {'
      + '  margin-bottom: 24px;'
      + '}'
      + '.terms-section ul {'
      + '  padding-left: 20px;'
      + '  font-size: 12px;'
      + '  color: #666;'
      + '  line-height: 2;'
      + '}'
      + '.terms-section li {'
      + '  margin-bottom: 2px;'
      + '}'
      + '.terms-short p {'
      + '  font-size: 12px;'
      + '  color: #666;'
      + '  line-height: 1.7;'
      + '}'

      // ==========================================
      // Signature block
      // ==========================================
      + '.signature-block {'
      + '  border: 2px solid ' + c + ';'
      + '  border-radius: 8px;'
      + '  padding: 24px;'
      + '  margin-bottom: 32px;'
      + '  page-break-inside: avoid;'
      + '}'
      + '.signature-block h4 {'
      + '  font-size: 15px;'
      + '  font-weight: 700;'
      + '  color: ' + c + ';'
      + '  margin-bottom: 8px;'
      + '}'
      + '.sig-desc {'
      + '  font-size: 12px;'
      + '  color: #666;'
      + '  margin-bottom: 24px;'
      + '}'
      + '.sig-grid {'
      + '  display: grid;'
      + '  grid-template-columns: 2fr 1.5fr 1fr;'
      + '  gap: 24px;'
      + '}'
      + '.sig-field span {'
      + '  font-size: 11px;'
      + '  color: #999;'
      + '}'
      + '.sig-line {'
      + '  border-bottom: 1px solid #999;'
      + '  height: 32px;'
      + '  margin-bottom: 4px;'
      + '}'

      // ==========================================
      // Thank you
      // ==========================================
      + '.thank-you {'
      + '  text-align: center;'
      + '  font-size: 16px;'
      + '  font-weight: 600;'
      + '  color: ' + c + ';'
      + '  margin: 28px 0 8px;'
      + '  padding: 16px;'
      + '}'

      // ==========================================
      // Job summary specifics
      // ==========================================
      + '.job-details-grid {'
      + '  display: grid;'
      + '  grid-template-columns: 1fr 1fr;'
      + '  gap: 16px;'
      + '  margin-bottom: 28px;'
      + '}'
      + '.job-detail-card {'
      + '  background: #f8f9fa;'
      + '  border-radius: 8px;'
      + '  padding: 16px 20px;'
      + '  border-left: 4px solid ' + c + ';'
      + '}'
      + '.job-detail-card h4 {'
      + '  font-size: 11px;'
      + '  font-weight: 700;'
      + '  color: #888;'
      + '  text-transform: uppercase;'
      + '  letter-spacing: 0.06em;'
      + '  margin-bottom: 6px;'
      + '}'
      + '.detail-primary {'
      + '  font-size: 15px;'
      + '  font-weight: 600;'
      + '  color: #1a1a1a;'
      + '}'
      + '.detail-secondary {'
      + '  font-size: 13px;'
      + '  color: #666;'
      + '}'

      // Photos
      + '.photos-section {'
      + '  margin-bottom: 24px;'
      + '}'
      + '.photo-grid {'
      + '  display: grid;'
      + '  grid-template-columns: repeat(3, 1fr);'
      + '  gap: 12px;'
      + '  margin-top: 12px;'
      + '}'
      + '.photo-item {'
      + '  text-align: center;'
      + '}'
      + '.photo-item img {'
      + '  width: 100%;'
      + '  height: 180px;'
      + '  object-fit: cover;'
      + '  border-radius: 6px;'
      + '  border: 1px solid #e0e0e0;'
      + '}'
      + '.photo-caption {'
      + '  display: block;'
      + '  font-size: 11px;'
      + '  color: #888;'
      + '  margin-top: 4px;'
      + '}'

      // ==========================================
      // Footer
      // ==========================================
      + '.doc-footer {'
      + '  margin-top: 40px;'
      + '  padding-top: 16px;'
      + '  border-top: 2px solid #e8e8e8;'
      + '  text-align: center;'
      + '}'
      + '.footer-line {'
      + '  font-size: 11px;'
      + '  color: #999;'
      + '  line-height: 1.8;'
      + '}'

      // ==========================================
      // Print overrides
      // ==========================================
      + '@media print {'
      + '  body { background: #fff; }'
      + '  .page {'
      + '    max-width: none;'
      + '    margin: 0;'
      + '    padding: 0;'
      + '    box-shadow: none;'
      + '    border-radius: 0;'
      + '  }'
      + '  .overdue-banner { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
      + '  .items-table thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
      + '  .alt-row { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
      + '  .totals-grand { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
      + '  .totals-overdue { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
      + '  .company-bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
      + '  .status-badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
      + '  .payment-options { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
      + '  .deposit-notice { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
      + '  .client-block { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
      + '  .job-detail-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
      + '  .signature-block { page-break-inside: avoid; }'
      + '  .terms-section { page-break-inside: avoid; }'
      + '  .photo-grid { page-break-inside: avoid; }'
      + '}'

      + '</style>';
  },

  // =====================================================
  // Utility methods
  // =====================================================

  _money: function(val) {
    var num = parseFloat(val) || 0;
    return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },

  _formatDate: function(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  },

  _addDays: function(dateStr, days) {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + days);
    return PDFGen._formatDate(d.toISOString());
  },

  _escapeHtml: function(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  // Alias for backwards compatibility
  generateJobSheet: function(jobId) { return PDFGen.generateJobSummary(jobId); }
};

// Route all PDF.* onclick calls (invoices/quotes/jobs/workflow) to the newer PDFGen module
// (overrides the older var PDF from src/pdf.js which loads before this file).
window.PDF = PDFGen;
