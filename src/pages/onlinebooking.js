/**
 * Branch Manager — Online Booking / Request Form
 * Embeddable form for peekskilltree.com that creates requests in Branch Manager
 * Also generates a standalone booking page at /branchmanager/book
 */
var OnlineBooking = {
  BOOKING_URL: 'https://branchmanager.app/book.html',

  render: function() {
    var bookingUrl = OnlineBooking.BOOKING_URL;

    // Stats from requests with source = online/booking/book
    var allRequests = DB.requests.getAll();
    var onlineReqs = allRequests.filter(function(r) {
      var src = (r.source || '').toLowerCase();
      return src === 'online' || src === 'booking' || src === 'book' || src === 'website' || src === 'web';
    });
    var convertedToQuote = onlineReqs.filter(function(r) {
      return r.status === 'quoted' || r.status === 'converted';
    });
    var conversionRate = onlineReqs.length > 0 ? Math.round(convertedToQuote.length / onlineReqs.length * 100) : 0;

    // Recent 30 days
    var thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    var recentOnline = onlineReqs.filter(function(r) { return r.createdAt && r.createdAt >= thirtyAgo; });

    var html = '<div class="section-header"><h2>Online Booking</h2>'
      + '<p style="color:var(--text-light);margin-top:4px;">Let clients submit requests directly from your website. All submissions automatically create a new Request in Branch Manager.</p></div>';

    // Stats bar
    html += '<div class="stat-grid">'
      + UI.statCard('Online Requests', onlineReqs.length.toString(), 'All time from web form', '', '', '')
      + UI.statCard('Last 30 Days', recentOnline.length.toString(), 'Recent web submissions', recentOnline.length > 0 ? 'up' : '', '', '')
      + UI.statCard('Converted', convertedToQuote.length.toString(), 'Turned into quotes', '', '', '')
      + UI.statCard('Conversion Rate', conversionRate + '%', 'Requests → quotes', conversionRate >= 50 ? 'up' : '', '', '')
      + '</div>';

    // Share / distribute section (3 cards in a row)
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;">';

    // Copy link card
    html += '<div style="background:var(--white);border-radius:12px;padding:18px;border:1px solid var(--border);display:flex;flex-direction:column;gap:10px;">'
      + '<h3 style="font-size:14px;margin:0;">🔗 Direct Link</h3>'
      + '<p style="font-size:12px;color:var(--text-light);margin:0;">Share with clients via text or email</p>'
      + '<div style="display:flex;gap:6px;">'
      + '<input type="text" value="' + bookingUrl + '" readonly onclick="this.select()" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:11px;background:var(--bg);">'
      + '<button onclick="navigator.clipboard.writeText(\'' + bookingUrl + '\').then(function(){UI.toast(\'Link copied!\');})" style="background:var(--green-dark);color:#fff;border:none;padding:8px 12px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;white-space:nowrap;">Copy</button>'
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
      + '<a href="sms:?body=' + encodeURIComponent('Request a free tree service estimate: ' + bookingUrl) + '" style="flex:1;text-align:center;background:#e8f5e9;color:var(--green-dark);border:none;padding:8px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">📱 Text</a>'
      + '<a href="mailto:?subject=' + encodeURIComponent('Request a Free Tree Estimate') + '&body=' + encodeURIComponent('You can request a free estimate here: ' + bookingUrl) + '" style="flex:1;text-align:center;background:#e3f2fd;color:#1565c0;border:none;padding:8px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">📧 Email</a>'
      + '</div></div>';

    // QR Code card
    var qrApiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(bookingUrl);
    html += '<div style="background:var(--white);border-radius:12px;padding:18px;border:1px solid var(--border);display:flex;flex-direction:column;align-items:center;gap:10px;">'
      + '<h3 style="font-size:14px;margin:0;">📱 QR Code</h3>'
      + '<p style="font-size:12px;color:var(--text-light);margin:0;text-align:center;">Print on business cards, job site signs</p>'
      + '<img src="' + qrApiUrl + '" alt="QR Code" style="width:120px;height:120px;border-radius:8px;border:1px solid var(--border);" onerror="this.style.display=\'none\'">'
      + '<a href="' + qrApiUrl + '" download="booking-qr.png" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;font-size:12px;text-decoration:none;text-align:center;">⬇ Download QR</a>'
      + '</div>';

    // Embed code card
    var embedCode = '<iframe src="' + bookingUrl + '" width="100%" height="600" frameborder="0" style="border-radius:12px;border:1px solid #e0e0e0;"></iframe>';
    html += '<div style="background:var(--white);border-radius:12px;padding:18px;border:1px solid var(--border);display:flex;flex-direction:column;gap:10px;">'
      + '<h3 style="font-size:14px;margin:0;">🖥 Website Embed</h3>'
      + '<p style="font-size:12px;color:var(--text-light);margin:0;">Paste on any page of peekskilltree.com</p>'
      + '<div style="background:#1d1d1f;border-radius:8px;padding:12px;overflow-x:auto;">'
      + '<code style="color:#4caf50;font-size:10px;white-space:pre;">&lt;iframe src="' + bookingUrl + '"\n  width="100%" height="600"\n  frameborder="0"&gt;\n&lt;/iframe&gt;</code>'
      + '</div>'
      + '<button onclick="navigator.clipboard.writeText(\'' + embedCode.replace(/'/g, "\\'") + '\').then(function(){UI.toast(\'Embed code copied!\');})" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">📋 Copy Embed Code</button>'
      + '</div>';

    html += '</div>'; // end 3-col grid

    // Form Settings
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<h3 style="font-size:15px;margin-bottom:12px;">Form Settings</h3>'
      + '<div style="display:grid;gap:12px;">';

    var services = [
      'Tree Removal', 'Tree Pruning', 'Stump Removal', 'Storm Damage',
      'Land Clearing', 'Bucket Truck Work', 'Cabling & Bracing',
      'Tree Health Assessment', 'Firewood', 'Other'
    ];
    var savedServices = localStorage.getItem('bm-booking-services') || services.join(',');
    html += '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:6px;font-weight:600;">Services shown on form</label>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    services.forEach(function(s) {
      var checked = savedServices.includes(s);
      html += '<label style="display:flex;align-items:center;gap:4px;font-size:13px;padding:6px 10px;background:' + (checked ? '#e8f5e9' : 'var(--bg)') + ';border-radius:6px;cursor:pointer;border:1px solid ' + (checked ? '#c8e6c9' : 'var(--border)') + ';">'
        + '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="OnlineBooking.toggleService(\'' + s + '\')" style="width:14px;height:14px;">'
        + s + '</label>';
    });
    html += '</div></div>';

    html += '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;font-weight:600;">Auto-reply message (sent after form submission)</label>'
      + '<textarea id="booking-autoreply" rows="3" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;">'
      + (localStorage.getItem('bm-booking-autoreply') || "Thanks for your request! We'll review it and get back to you within 2 hours during business hours. — Doug, " + (CompanyInfo.get('name')))
      + '</textarea>'
      + '<button onclick="localStorage.setItem(\'bm-booking-autoreply\',document.getElementById(\'booking-autoreply\').value);UI.toast(\'Auto-reply saved!\')" style="background:var(--green-dark);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;margin-top:6px;">Save Message</button>'
      + '</div></div></div>';

    // Recent online requests
    if (onlineReqs.length > 0) {
      var sortedOnline = onlineReqs.slice().sort(function(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
        + '<h3 style="font-size:15px;margin:0;">Recent Online Submissions</h3>'
        + '<button onclick="loadPage(\'requests\')" style="background:none;border:1px solid var(--border);padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;color:var(--accent);">View All Requests →</button>'
        + '</div>'
        + '<table class="data-table"><thead><tr><th>Client</th><th>Property</th><th>Service</th><th>Status</th><th>Date</th></tr></thead><tbody>';
      sortedOnline.slice(0, 10).forEach(function(r) {
        html += '<tr onclick="RequestsPage.showDetail(\'' + r.id + '\')" style="cursor:pointer;">'
          + '<td><strong>' + UI.esc(r.clientName || '—') + '</strong></td>'
          + '<td style="color:var(--text-light);font-size:12px;">' + UI.esc((r.property || '').substr(0, 30)) + '</td>'
          + '<td style="font-size:12px;">' + UI.esc(r.serviceType || r.notes || '—') + '</td>'
          + '<td>' + UI.statusBadge(r.status) + '</td>'
          + '<td style="font-size:12px;color:var(--text-light);">' + UI.dateShort(r.createdAt) + '</td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';
    }

    // Live preview
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<h3 style="font-size:15px;margin:0;">Form Preview</h3>'
      + '<a href="' + bookingUrl + '" target="_blank" rel="noopener noreferrer" style="background:var(--green-dark);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-weight:600;font-size:12px;text-decoration:none;">Open Full Form ↗</a>'
      + '</div>'
      + '<div style="border:2px solid var(--border);border-radius:12px;padding:24px;max-width:500px;margin:0 auto;">'
      + OnlineBooking._renderFormPreview()
      + '</div></div>';

    return html;
  },

  _renderFormPreview: function() {
    return '<div style="text-align:center;margin-bottom:20px;">'
      + '<div style="font-size:24px;">🌳</div>'
      + '<h3 style="font-size:18px;color:#1a3c12;">Request a Free Estimate</h3>'
      + '<p style="font-size:13px;color:#666;">' + (CompanyInfo.get('name')) + ' — Peekskill, NY</p></div>'
      + '<div style="display:grid;gap:10px;">'
      + '<input type="text" placeholder="Your Name *" style="padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-size:15px;" disabled>'
      + '<input type="tel" placeholder="Phone Number *" style="padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-size:15px;" disabled>'
      + '<input type="email" placeholder="Email" style="padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-size:15px;" disabled>'
      + '<input type="text" placeholder="Property Address *" style="padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-size:15px;" disabled>'
      + '<select style="padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-size:15px;color:#666;" disabled>'
      + '<option>Select Service Needed...</option>'
      + '<option>Tree Removal</option><option>Tree Pruning</option><option>Stump Removal</option>'
      + '</select>'
      + '<textarea placeholder="Describe the work needed..." rows="3" style="padding:12px;border:2px solid #e0e0e0;border-radius:8px;font-size:15px;font-family:inherit;resize:vertical;" disabled></textarea>'
      + '<button style="background:#1a3c12;color:#fff;border:none;padding:14px;border-radius:8px;font-size:16px;font-weight:700;cursor:not-allowed;opacity:.8;">Submit Request</button>'
      + '<p style="font-size:11px;color:#999;text-align:center;margin:0;">Preview only — <a href="' + OnlineBooking.BOOKING_URL + '" target="_blank" rel="noopener noreferrer" style="color:#1a3c12;">open live form</a></p>'
      + '</div>';
  },

  toggleService: function(service) {
    var current = (localStorage.getItem('bm-booking-services') || '').split(',');
    var idx = current.indexOf(service);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(service);
    localStorage.setItem('bm-booking-services', current.filter(Boolean).join(','));
  },

  _copyEmbed: function() {
    var code = '<iframe src="' + OnlineBooking.BOOKING_URL + '" width="100%" height="600" frameborder="0" style="border-radius:12px;border:1px solid #e0e0e0;"></iframe>';
    navigator.clipboard.writeText(code).then(function() { UI.toast('Copied!'); });
  }
};
