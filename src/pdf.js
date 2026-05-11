/**
 * Branch Manager — PDF Generation
 * Creates professional quote and invoice PDFs using browser print
 * No external libraries needed — generates HTML, opens print dialog
 */
var PDF = {
  _style: function() {
    return '<style>'
      + '* { margin:0; padding:0; box-sizing:border-box; }'
      + 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1d1d1f; padding: 40px; }'
      + '.header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px; padding-bottom:20px; border-bottom:3px solid #1a3c12; }'
      + '.company h1 { font-size:22px; color:#1a3c12; } .company p { font-size:12px; color:#666; margin-top:2px; }'
      + '.doc-info { text-align:right; } .doc-info h2 { font-size:28px; color:#1a3c12; } .doc-info p { font-size:13px; color:#666; }'
      + '.client-box { background:#f5f5f5; border-radius:8px; padding:16px; margin-bottom:24px; }'
      + '.client-box h3 { font-size:14px; color:#888; text-transform:uppercase; letter-spacing:.05em; margin-bottom:8px; }'
      + '.client-box p { font-size:14px; margin:2px 0; }'
      + 'table { width:100%; border-collapse:collapse; margin-bottom:24px; }'
      + 'th { background:#1a3c12; color:#fff; padding:10px 14px; text-align:left; font-size:12px; font-weight:700; text-transform:uppercase; }'
      + 'td { padding:10px 14px; border-bottom:1px solid #e0e0e0; font-size:14px; }'
      + 'tr:nth-child(even) { background:#f9f9f9; }'
      + '.total-row td { font-weight:700; font-size:16px; border-top:2px solid #1a3c12; background:#f0f8e8; }'
      + '.total-big { font-size:24px; color:#1a3c12; font-weight:800; }'
      + '.notes { background:#f5f5f5; border-radius:8px; padding:16px; margin-bottom:24px; font-size:13px; color:#555; }'
      + '.notes h4 { font-size:13px; color:#1d1d1f; margin-bottom:6px; }'
      + '.footer { margin-top:40px; padding-top:16px; border-top:1px solid #e0e0e0; text-align:center; font-size:11px; color:#999; }'
      + '.badge { display:inline-block; padding:4px 12px; border-radius:12px; font-size:11px; font-weight:700; }'
      + '.badge-draft { background:#f5f5f5; color:#666; } .badge-sent { background:#fff3e0; color:#e65100; }'
      + '.badge-paid { background:#e8f5e9; color:#2e7d32; } .badge-approved { background:#e8f5e9; color:#2e7d32; }'
      // Print-friendly overrides — ink-saving. Onscreen the PDF preview keeps
      // its full color; when the customer hits Print the green/gray fills are
      // swapped for white + thin rules, dropping ink usage by ~80% and making
      // the doc legible on a B&W laser printer.
      + '@media print {'
      +   ' body { padding:20px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }'
      +   ' .header { border-bottom:2px solid #000 !important; }'
      +   ' .company h1, .doc-info h2, .total-big { color:#000 !important; }'
      +   ' th { background:#fff !important; color:#000 !important; border-bottom:2px solid #000 !important; }'
      +   ' tr:nth-child(even) { background:transparent !important; }'
      +   ' .total-row td { background:transparent !important; border-top:2px solid #000 !important; color:#000 !important; }'
      +   ' .client-box, .notes { background:transparent !important; border:1px solid #ccc !important; }'
      +   ' .badge { border:1px solid #999 !important; background:transparent !important; color:#333 !important; }'
      +   ' .footer { color:#666 !important; }'
      + ' }'
      + '</style>';
  },

  _co: function() {
    return {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      website: CompanyInfo.get('website'),
      address: CompanyInfo.get('address') || '',
      licenses: CompanyInfo.get('licenses')
    };
  },

  _companyHeader: function() {
    var co = PDF._co();
    return '<div class="company">'
      + '<h1>🌳 ' + co.name + '</h1>'
      + '<p>' + co.address + '</p>'
      + '<p>' + co.phone + ' &bull; ' + co.email + '</p>'
      + '<p>Licensed &amp; Insured — ' + co.licenses + '</p>'
      + '</div>';
  },

  _footer: function() {
    var co = PDF._co();
    return '<div class="footer">'
      + co.name + ' &bull; ' + co.website + ' &bull; ' + co.phone + '<br>'
      + 'Licensed &amp; Fully Insured — Westchester &amp; Putnam Counties'
      + '</div>';
  },

  generateQuote: function(quoteId) {
    var q = DB.quotes.getById(quoteId);
    if (!q) { UI.toast('Quote not found', 'error'); return; }
    var client = q.clientId ? DB.clients.getById(q.clientId) : null;

    // v787: stamp a diagonal "DECLINED" / "EXPIRED" watermark on quotes
    // that should not be confused for live offers. Catches PDFs found
    // on a phone weeks later being mistaken for current proposals.
    var stampLabel = null, stampColor = null;
    if (q.status === 'declined') {
      stampLabel = 'DECLINED'; stampColor = '#dc2626';
    } else if (q.status === 'converted') {
      stampLabel = 'CONVERTED'; stampColor = '#15803d';
    } else if (q.expiresAt && new Date(q.expiresAt).getTime() < Date.now()) {
      stampLabel = 'EXPIRED'; stampColor = '#7f1d1d';
    } else if (q.status === 'draft') {
      stampLabel = 'DRAFT'; stampColor = '#6b7280';
    }
    var watermarkCss = stampLabel
      ? '<style>'
        + 'body{position:relative;}'
        + 'body::before{content:"' + stampLabel + '";position:fixed;top:50%;left:50%;'
        + 'transform:translate(-50%,-50%) rotate(-32deg);'
        + 'font-size:160px;font-weight:900;color:' + stampColor + ';'
        + 'opacity:0.13;letter-spacing:8px;pointer-events:none;z-index:9999;'
        + 'font-family:"Helvetica Neue",Arial,sans-serif;white-space:nowrap;'
        + '-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
        + '@media print{body::before{opacity:0.16;}}'
        + '</style>'
      : '';

    var html = '<!DOCTYPE html><html><head><title>Quote #' + q.quoteNumber + (stampLabel ? ' [' + stampLabel + ']' : '') + '</title>' + PDF._style() + watermarkCss + '</head><body>';
    html += '<div class="header">' + PDF._companyHeader()
      + '<div class="doc-info"><h2>QUOTE</h2><p>#' + q.quoteNumber + '</p><p>' + UI.dateShort((q.createdAt || '').split('T')[0]) + '</p>'
      + '<p><span class="badge badge-' + q.status + '">' + (q.status || 'draft').toUpperCase() + '</span></p></div></div>';

    // Client
    html += '<div class="client-box"><h3>Prepared For</h3>';
    if (client) {
      html += '<p><strong>' + client.name + '</strong></p>';
      if (client.address) html += '<p>' + client.address + '</p>';
      if (client.phone) html += '<p>' + UI.phone(client.phone) + '</p>';
      if (client.email) html += '<p>' + client.email + '</p>';
    } else {
      html += '<p><strong>' + (q.clientName || '') + '</strong></p>';
    }
    if (q.property) html += '<p style="margin-top:8px;"><strong>Property:</strong> ' + q.property + '</p>';
    html += '</div>';

    if (q.description) {
      html += '<div style="margin-bottom:16px;"><h3 style="font-size:15px;color:#1a3c12;margin-bottom:6px;">Scope of Work</h3>'
        + '<p style="font-size:14px;line-height:1.6;color:#444;">' + q.description + '</p></div>';
    }

    // Line items
    if (q.lineItems && q.lineItems.length) {
      html += '<table><thead><tr><th>Service</th><th>Description</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Amount</th></tr></thead><tbody>';
      q.lineItems.forEach(function(item) {
        html += '<tr><td>' + (item.service || 'Custom') + '</td><td>' + (item.description || '') + '</td><td style="text-align:center;">' + (item.qty || 1) + '</td><td style="text-align:right;">' + UI.money(item.rate) + '</td><td style="text-align:right;">' + UI.money(item.amount || item.qty * item.rate) + '</td></tr>';
      });
      if (q.taxRate) {
        var pdfSubtotal = q.subtotal || (q.total - (q.taxAmount || 0));
        html += '<tr><td colspan="4" style="text-align:right;color:#666;font-size:13px;">Subtotal</td><td style="text-align:right;color:#666;">' + UI.money(pdfSubtotal) + '</td></tr>';
        html += '<tr><td colspan="4" style="text-align:right;color:#666;font-size:13px;">Tax (' + q.taxRate + '%)</td><td style="text-align:right;color:#666;">' + UI.money(q.taxAmount || 0) + '</td></tr>';
      }
      html += '<tr class="total-row"><td colspan="4" style="text-align:right;">TOTAL</td><td style="text-align:right;" class="total-big">' + UI.money(q.total) + '</td></tr>';
      html += '</tbody></table>';
    }

    // Deposit request
    if (q.total > 1000) {
      var deposit = Math.round(q.total * 0.5);
      html += '<div style="background:#fff3e0;border-radius:8px;padding:16px;margin-bottom:20px;border:1px solid #ffe0b2;">'
        + '<h4 style="font-size:14px;color:#e65100;margin-bottom:6px;">Deposit Required</h4>'
        + '<p style="font-size:14px;">A 50% deposit of <strong>' + UI.money(deposit) + '</strong> is required to schedule this work. '
        + 'Balance of <strong>' + UI.money(q.total - deposit) + '</strong> is due upon completion.</p></div>';
    }

    // Terms
    html += '<div class="notes"><h4>Terms &amp; Conditions</h4>'
      + '<ul style="padding-left:18px;margin-top:6px;line-height:1.8;">'
      + '<li>This quote is valid for 30 days from the date above.</li>'
      + '<li>Payment is due upon completion unless otherwise arranged.</li>'
      + '<li>All work performed by licensed and insured professionals.</li>'
      + '<li>Client responsible for ensuring access and identifying underground utilities.</li>'
      + '<li>Cleanup of debris included. Stump grinding quoted separately if applicable.</li>'
      + '<li>Additional work beyond this scope will be quoted separately.</li>'
      + '</ul></div>';

    // Acceptance signature
    html += '<div style="margin-top:30px;padding:20px;border:2px solid #1a3c12;border-radius:8px;">'
      + '<h4 style="font-size:14px;color:#1a3c12;margin-bottom:16px;">Authorization to Proceed</h4>'
      + '<p style="font-size:13px;color:#555;margin-bottom:20px;">I authorize ' + PDF._co().name + ' to perform the work described above at the quoted price.</p>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">'
      + '<div><div style="border-bottom:1px solid #999;height:30px;margin-bottom:4px;"></div><span style="font-size:11px;color:#888;">Client Signature</span></div>'
      + '<div><div style="border-bottom:1px solid #999;height:30px;margin-bottom:4px;"></div><span style="font-size:11px;color:#888;">Date</span></div>'
      + '</div></div>';

    html += PDF._footer() + '</body></html>';
    PDF._openPrint(html);
  },

  generateInvoice: function(invoiceId) {
    var inv = DB.invoices.getById(invoiceId);
    if (!inv) { UI.toast('Invoice not found', 'error'); return; }
    var client = inv.clientId ? DB.clients.getById(inv.clientId) : null;

    // v787: invoice watermark — PAID / VOID / DRAFT stamped diagonally.
    // Paid invoices re-sent (e.g. for tax records) shouldn't look unpaid;
    // voided invoices shouldn't get paid by accident.
    var invStamp = null, invStampColor = null;
    if (inv.status === 'paid' || (typeof inv.balance === 'number' && inv.balance <= 0 && inv.total > 0)) {
      invStamp = 'PAID'; invStampColor = '#15803d';
    } else if (inv.status === 'void' || inv.status === 'cancelled') {
      invStamp = 'VOID'; invStampColor = '#7f1d1d';
    } else if (inv.status === 'draft') {
      invStamp = 'DRAFT'; invStampColor = '#6b7280';
    } else if (inv.dueDate && new Date(inv.dueDate).getTime() < Date.now() - 30 * 86400000) {
      invStamp = 'OVERDUE'; invStampColor = '#c2410c';
    }
    var invWatermark = invStamp
      ? '<style>'
        + 'body{position:relative;}'
        + 'body::before{content:"' + invStamp + '";position:fixed;top:50%;left:50%;'
        + 'transform:translate(-50%,-50%) rotate(-32deg);'
        + 'font-size:170px;font-weight:900;color:' + invStampColor + ';'
        + 'opacity:0.13;letter-spacing:8px;pointer-events:none;z-index:9999;'
        + 'font-family:"Helvetica Neue",Arial,sans-serif;white-space:nowrap;'
        + '-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
        + '@media print{body::before{opacity:0.16;}}'
        + '</style>'
      : '';

    var html = '<!DOCTYPE html><html><head><title>Invoice #' + inv.invoiceNumber + (invStamp ? ' [' + invStamp + ']' : '') + '</title>' + PDF._style() + invWatermark + '</head><body>';
    html += '<div class="header">' + PDF._companyHeader()
      + '<div class="doc-info"><h2>INVOICE</h2><p>#' + inv.invoiceNumber + '</p><p>Due: ' + UI.dateShort(inv.dueDate) + '</p>'
      + '<p><span class="badge badge-' + inv.status + '">' + (inv.status || 'draft').toUpperCase() + '</span></p></div></div>';

    // Client
    html += '<div class="client-box"><h3>Bill To</h3>';
    if (client) {
      html += '<p><strong>' + client.name + '</strong></p>';
      if (client.address) html += '<p>' + client.address + '</p>';
      if (client.phone) html += '<p>' + UI.phone(client.phone) + '</p>';
      if (client.email) html += '<p>' + client.email + '</p>';
    } else {
      html += '<p><strong>' + (inv.clientName || '') + '</strong></p>';
    }
    html += '</div>';

    // Line items
    if (inv.lineItems && inv.lineItems.length) {
      html += '<table><thead><tr><th>Service</th><th>Description</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Amount</th></tr></thead><tbody>';
      inv.lineItems.forEach(function(item) {
        html += '<tr><td>' + (item.service || 'Custom') + '</td><td>' + (item.description || '') + '</td><td style="text-align:center;">' + (item.qty || 1) + '</td><td style="text-align:right;">' + UI.money(item.rate) + '</td><td style="text-align:right;">' + UI.money(item.amount || item.qty * item.rate) + '</td></tr>';
      });
      if (inv.taxRate) {
        var invPdfSubtotal = inv.subtotal || (inv.total - (inv.taxAmount || 0));
        html += '<tr><td colspan="4" style="text-align:right;color:#666;font-size:13px;">Subtotal</td><td style="text-align:right;color:#666;">' + UI.money(invPdfSubtotal) + '</td></tr>';
        html += '<tr><td colspan="4" style="text-align:right;color:#666;font-size:13px;">Tax (' + inv.taxRate + '%)</td><td style="text-align:right;color:#666;">' + UI.money(inv.taxAmount || 0) + '</td></tr>';
      }
      html += '<tr class="total-row"><td colspan="4" style="text-align:right;">TOTAL</td><td style="text-align:right;" class="total-big">' + UI.money(inv.total) + '</td></tr>';
      if (inv.balance > 0 && inv.balance !== inv.total) {
        html += '<tr><td colspan="4" style="text-align:right;font-weight:600;color:#c0392b;">BALANCE DUE</td><td style="text-align:right;font-weight:800;font-size:20px;color:#c0392b;">' + UI.money(inv.balance) + '</td></tr>';
      }
      html += '</tbody></table>';
    } else {
      html += '<table><thead><tr><th>Description</th><th style="text-align:right;">Amount</th></tr></thead><tbody>';
      html += '<tr><td>' + (inv.subject || 'For Services Rendered') + '</td><td style="text-align:right;" class="total-big">' + UI.money(inv.total) + '</td></tr>';
      html += '</tbody></table>';
    }

    // Payment methods
    html += '<div style="background:#f0f8e8;border-radius:8px;padding:16px;margin-bottom:24px;border:1px solid #c8e6c9;">'
      + '<h4 style="font-size:14px;color:#1a3c12;margin-bottom:10px;">Payment</h4>'
      + '<div style="text-align:center;font-size:14px;">'
      + '<div style="padding:12px;background:#fff;border-radius:6px;border:1px solid #e0e0e0;"><strong>💳 Pay online via the link in your email</strong><br><span style="font-size:12px;color:#666;">Secure card payment powered by Stripe</span></div>'
      + '</div></div>';

    // Payment terms
    html += '<div class="notes"><h4>Payment Terms</h4>'
      + '<p>Payment is due by ' + UI.dateShort(inv.dueDate) + '. '
      + 'Late payments may be subject to a 1.5% monthly finance charge. '
      + 'For questions about this invoice, call ' + co.phone + ' or email ' + co.email + '.</p></div>';

    html += PDF._footer() + '</body></html>';
    PDF._openPrint(html);
  },

  generateJobSheet: function(jobId) {
    var job = DB.jobs.getById(jobId);
    if (!job) { UI.toast('Job not found', 'error'); return; }

    var html = '<!DOCTYPE html><html><head><title>Job Sheet #' + (job.jobNumber || '') + '</title>' + PDF._style()
      + '<style>.check { display:inline-block;width:16px;height:16px;border:2px solid #999;border-radius:3px;margin-right:8px;vertical-align:middle; }</style>'
      + '</head><body>';
    html += '<div class="header">' + PDF._companyHeader()
      + '<div class="doc-info"><h2>JOB SHEET</h2><p>#' + (job.jobNumber || '') + '</p><p>' + UI.dateShort(job.scheduledDate) + '</p></div></div>';

    // Client & property
    html += '<div class="client-box"><h3>Client</h3>'
      + '<p><strong>' + job.clientName + '</strong></p>'
      + '<p>' + (job.property || '') + '</p>'
      + (job.clientPhone ? '<p>📞 ' + job.clientPhone + '</p>' : '')
      + '</div>';

    // Scope
    html += '<div style="margin-bottom:24px;"><h3 style="font-size:16px;margin-bottom:8px;">Scope of Work</h3>'
      + '<p style="font-size:14px;line-height:1.6;">' + (job.description || 'See quote for details') + '</p></div>';

    // Checklist
    html += '<div style="margin-bottom:24px;"><h3 style="font-size:16px;margin-bottom:8px;">Crew Checklist</h3>'
      + '<div style="font-size:14px;line-height:2;">'
      + '<div><span class="check"></span> Scope reviewed with homeowner</div>'
      + '<div><span class="check"></span> Hazards identified (power lines, structures, underground)</div>'
      + '<div><span class="check"></span> Drop zone cleared</div>'
      + '<div><span class="check"></span> Equipment staged and inspected</div>'
      + '<div><span class="check"></span> PPE — all crew</div>'
      + '<div><span class="check"></span> Work completed per scope</div>'
      + '<div><span class="check"></span> Cleanup complete — rake, blow, debris removed</div>'
      + '<div><span class="check"></span> Client walkthrough and sign-off</div>'
      + '<div><span class="check"></span> Before/after photos taken</div>'
      + '</div></div>';

    // Notes
    html += '<div class="notes"><h4>Crew Notes</h4>'
      + '<div style="min-height:100px;border-top:1px solid #ddd;margin-top:8px;"></div></div>';

    // Time tracking
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px;">'
      + '<div style="padding:12px;border:1px solid #ddd;border-radius:8px;"><strong>Arrive:</strong> ___________</div>'
      + '<div style="padding:12px;border:1px solid #ddd;border-radius:8px;"><strong>Depart:</strong> ___________</div>'
      + '<div style="padding:12px;border:1px solid #ddd;border-radius:8px;"><strong>Total Hours:</strong> _______</div>'
      + '</div>';

    html += PDF._footer() + '</body></html>';
    PDF._openPrint(html);
  },

  _openPrint: function(html) {
    var w = window.open('', '_blank', 'width=800,height=1000');
    w.document.write(html);
    w.document.close();
    setTimeout(function() { w.print(); }, 500);
  }
};

// Alias for workflow references
var PDFGen = PDF;
