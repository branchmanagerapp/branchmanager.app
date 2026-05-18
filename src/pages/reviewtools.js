/**
 * Branch Manager — Review Tools
 * Google review link, QR codes, review tracking, follow-up
 */
var ReviewTools = {
  // White-label: tenant's own Google review link only (Settings → Social
  // & Reviews). Empty when unset; QR/poster/copy all degrade to a setup
  // prompt so a friend's customers are never routed to another business.
  GOOGLE_REVIEW_URL: '',
  _revUrl: function() {
    try { return (typeof CompanyInfo !== 'undefined' && CompanyInfo.own('googleReviewUrl')) || ''; }
    catch (e) { return ''; }
  },
  _needLinkCard: function(msg) {
    return '<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:12px;padding:20px;margin-bottom:16px;text-align:center;">'
      + '<div style="font-size:13px;color:#8a6d00;margin-bottom:10px;">' + (msg || 'Add your Google review link to generate this.') + '</div>'
      + '<button onclick="TenantSetup._jumpToSettings(\'business\',\'sr-review\')" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">⚙ Set Google review link</button>'
      + '</div>';
  },

  _co: function() {
    return {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      website: CompanyInfo.get('website')
    };
  },

  // Trust-line for customer-facing review collateral (printable card +
  // QR poster). White-label safe: locale from the TENANT's own saved
  // address only (never BM_CONFIG = SNT's Peekskill addr in the shared
  // bundle). No tenant address => generic credential only.
  _loc: function() {
    var a = '';
    try { a = String(localStorage.getItem('bm-co-address') || ''); } catch (e) {}
    var m = a.replace(/\s*\d{5}(-\d{4})?\s*$/, '').match(/([A-Za-z.\s]+,\s*[A-Za-z]{2,})\s*$/);
    var city = m ? m[1].trim().replace(/\s+/g, ' ') : '';
    return city ? ('Licensed & Insured — ' + city) : 'Licensed & Insured';
  },

  render: function() {
    var html = '<div class="section-header"><h2>⭐ Review Tools</h2></div>';

    // Stats
    html += '<div class="stat-grid">'
      + UI.statCard('Google Rating', '5.0 ★', '100+ reviews', 'up', '')
      + UI.statCard('Review Link', 'Copy & Share', 'Tap to copy', '', '', 'ReviewTools.copyLink()')
      + UI.statCard('QR Code', 'Download', 'Print for trucks/cards', '', '', 'ReviewTools.downloadQR()')
      + '</div>';

    // QR Code display
    html += '<div style="background:var(--white);border-radius:12px;padding:24px;border:1px solid var(--border);margin-bottom:16px;text-align:center;">'
      + '<h3 style="font-size:16px;margin-bottom:16px;">Google Review QR Code</h3>'
      + '<div id="review-qr" style="display:inline-block;padding:16px;background:#fff;border-radius:12px;border:1px solid var(--border);">'
      + (ReviewTools._revUrl()
          ? '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(ReviewTools._revUrl()) + '" alt="Review QR Code" style="width:200px;height:200px;">'
          : '<div style="width:200px;height:200px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:12px;color:#8a6d00;background:#fff8e1;border-radius:8px;padding:12px;">Add your Google review link in Settings to generate your QR code</div>')
      + '</div>'
      + '<div style="margin-top:12px;font-size:14px;font-weight:600;color:var(--green-dark);">Scan to leave a Google review</div>'
      + '<p style="font-size:12px;color:var(--text-light);margin-top:4px;">Print this QR code on business cards, truck magnets, invoices, and leave-behind cards.</p>'
      + '<div style="display:flex;gap:8px;justify-content:center;margin-top:16px;">'
      + '<button onclick="ReviewTools.downloadQR()" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;">📥 Download QR</button>'
      + '<button onclick="ReviewTools.copyLink()" style="background:#1565c0;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;">🔗 Copy Link</button>'
      + '<button onclick="ReviewTools.printCard()" style="background:#6a1b9a;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;">🖨 Print Card</button>'
      + '<button onclick="ReviewTools.generateSocialCard()" style="background:#e07c24;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;">📱 Social Card</button>'
      + '<button onclick="ReviewTools.showTemplateEditor()" style="background:var(--text);color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;">✏️ Edit Templates</button>'
      + '<button onclick="ReviewTools.showAutoSettings()" style="background:none;border:2px solid var(--border);color:var(--text);padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;">⚙️ Auto Settings</button>'
      + '</div></div>';

    // Review request sender
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<h3 style="font-size:16px;margin-bottom:12px;">Send Review Request</h3>'
      + '<p style="font-size:13px;color:var(--text-light);margin-bottom:12px;">Send a review request to a recent client via text or email.</p>';

    // Recent completed jobs
    var completed = DB.jobs.getAll().filter(function(j) { return j.status === 'completed'; }).slice(0, 10);
    if (completed.length) {
      completed.forEach(function(j) {
        var sent = localStorage.getItem('bm-review-sent-' + j.id);
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0;">'
          + '<div><strong style="font-size:14px;">' + j.clientName + '</strong>'
          + '<div style="font-size:12px;color:var(--text-light);">' + (j.description || '') + ' · ' + UI.dateShort(j.completedDate || j.createdAt) + '</div></div>'
          + '<div>' + (sent ? '<span style="font-size:12px;color:var(--green-dark);">✅ Sent</span>'
            : '<button onclick="ReviewTools.sendRequest(\'' + j.id + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Send Request</button>')
          + '</div></div>';
      });
    } else {
      html += '<div style="text-align:center;padding:16px;color:var(--text-light);font-size:13px;">No completed jobs yet.</div>';
    }
    html += '</div>';

    // Shareable links
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);">'
      + '<h3 style="font-size:16px;margin-bottom:12px;">Review Links</h3>'
      + '<div style="display:grid;gap:8px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg);border-radius:8px;">'
      + '<div><strong style="font-size:13px;">Google</strong><div style="font-size:11px;color:var(--text-light);">Primary — most important</div></div>'
      + '<button onclick="ReviewTools.copyLink()" style="background:var(--green-dark);color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">Copy</button></div>'
      + (function(){ var y = ''; try { y = (typeof CompanyInfo !== 'undefined' && CompanyInfo.own('yelpUrl')) || ''; } catch(e) {} return y
          ? '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:var(--bg);border-radius:8px;">'
            + '<div><strong style="font-size:13px;">Yelp</strong><div style="font-size:11px;color:var(--text-light);">' + UI.esc(y) + '</div></div>'
            + '<button onclick="navigator.clipboard.writeText(\'' + UI.esc(y) + '\');UI.toast(\'Copied!\')" style="background:var(--green-dark);color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">Copy</button></div>'
          : ''; })()
      + '</div></div>';

    return html;
  },

  copyLink: function() {
    var u = ReviewTools._revUrl();
    if (!u) {
      UI.toast('Add your Google review link in Settings first');
      try { TenantSetup._jumpToSettings('business', 'sr-review'); } catch (e) {}
      return;
    }
    navigator.clipboard.writeText(u);
    UI.toast('Google review link copied! 🔗');
  },

  downloadQR: function() {
    var u = ReviewTools._revUrl();
    if (!u) {
      UI.toast('Add your Google review link in Settings first');
      try { TenantSetup._jumpToSettings('business', 'sr-review'); } catch (e) {}
      return;
    }
    var url = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&format=png&data=' + encodeURIComponent(u);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'second-nature-google-review-qr.png';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    UI.toast('QR code downloading...');
  },

  printCard: function() {
    if (!ReviewTools._revUrl()) {
      UI.toast('Add your Google review link in Settings to print review cards');
      try { TenantSetup._jumpToSettings('business', 'sr-review'); } catch (e) {}
      return;
    }
    var html = '<!DOCTYPE html><html><head><title>Review Card</title><style>'
      + 'body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fff;}'
      + '.card{width:3.5in;padding:24px;text-align:center;border:2px solid #1a3c12;border-radius:12px;}'
      + '</style></head><body><div class="card">'
      + '<div style="font-size:28px;">🌳</div>'
      + '<h2 style="color:#1a3c12;font-size:16px;margin:8px 0 4px;">' + ReviewTools._co().name + '</h2>'
      + '<p style="font-size:11px;color:#666;margin:0 0 16px;">' + ReviewTools._loc() + '</p>'
      + '<p style="font-size:13px;font-weight:600;margin:0 0 12px;">Enjoyed our work? We\'d love a review!</p>'
      + '<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(ReviewTools._revUrl()) + '" style="width:150px;height:150px;">'
      + '<p style="font-size:10px;color:#666;margin:8px 0 0;">Scan to leave a Google review</p>'
      + '<p style="font-size:10px;color:#999;margin:4px 0 0;">' + ReviewTools._co().phone + ' · ' + ReviewTools._co().website + '</p>'
      + '</div></body></html>';
    var w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(function() { w.print(); }, 500);
  },

  sendRequest: function(jobId) {
    var job = DB.jobs.getById(jobId);
    if (!job) return;
    if (!ReviewTools._revUrl()) {
      UI.toast('Add your Google review link in Settings before sending review requests');
      try { TenantSetup._jumpToSettings('business', 'sr-review'); } catch (e) {}
      return;
    }

    // Try email template
    if (typeof Email !== 'undefined' && typeof Templates !== 'undefined') {
      Email.sendTemplate('review_request_email', {
        name: job.clientName,
        address: job.property || '',
        email: job.clientEmail || '',
        id: job.clientId
      });
    }

    // Also log to ReviewsPage requests
    if (typeof ReviewsPage !== 'undefined') {
      var requests = ReviewsPage.getRequests();
      requests.push({ jobId: job.id, jobNumber: job.jobNumber, clientName: job.clientName, sentAt: new Date().toISOString(), source: 'review-tools' });
      ReviewsPage.saveRequests(requests);
    }

    // Mark as sent
    localStorage.setItem('bm-review-sent-' + jobId, new Date().toISOString());
    UI.toast('Review request sent to ' + job.clientName);
    loadPage('reviewtools');
  },

  showTemplateEditor: function() {
    var saved = localStorage.getItem('bm-review-sms-template') || 'Hi {name}! Thanks for choosing ' + ReviewTools._co().name + '. If you were happy with our work, a quick Google review would mean a lot: ' + ReviewTools._revUrl();
    var emailSaved = localStorage.getItem('bm-review-email-template') || 'Hi {name},\n\nThank you for trusting ' + ReviewTools._co().name + ' with your tree care needs. We hope you\'re happy with the results!\n\nWould you mind taking a minute to leave us a Google review? It helps other homeowners find reliable tree service.\n\n' + ReviewTools._revUrl() + '\n\nThank you!\n— ' + (ReviewTools._co().name || 'the team');

    var html = UI.field('SMS Template', '<textarea id="rt-sms-tpl" style="min-height:80px;font-size:13px;">' + UI.esc(saved) + '</textarea>')
      + '<div style="font-size:11px;color:var(--text-light);margin:-8px 0 12px;">Use {name} for client name. Max 160 chars for SMS.</div>'
      + UI.field('Email Template', '<textarea id="rt-email-tpl" style="min-height:120px;font-size:13px;">' + UI.esc(emailSaved) + '</textarea>')
      + '<div style="font-size:11px;color:var(--text-light);margin:-8px 0 12px;">Use {name} for client name, {service} for service type.</div>';

    UI.showModal('Review Request Templates', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="ReviewTools._saveTemplates()">Save Templates</button>'
    });
  },

  _saveTemplates: function() {
    localStorage.setItem('bm-review-sms-template', document.getElementById('rt-sms-tpl').value);
    localStorage.setItem('bm-review-email-template', document.getElementById('rt-email-tpl').value);
    UI.closeModal();
    UI.toast('Review templates saved!');
  },

  showAutoSettings: function() {
    if (typeof ReviewsPage !== 'undefined' && ReviewsPage.showAutoSettings) {
      ReviewsPage.showAutoSettings();
    } else {
      UI.toast('Auto-review settings are on the Reviews page');
    }
  },

  // Generate a review card image for social media
  generateSocialCard: function() {
    if (!ReviewTools._revUrl()) {
      UI.toast('Add your Google review link in Settings to generate a social card');
      try { TenantSetup._jumpToSettings('business', 'sr-review'); } catch (e) {}
      return;
    }
    var html = '<!DOCTYPE html><html><head><title>Review Card</title><style>'
      + 'body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5;}'
      + '.card{width:600px;height:315px;background:linear-gradient(135deg,#1a3c12 0%,#2d5a27 100%);border-radius:16px;color:#fff;display:flex;align-items:center;padding:40px;gap:30px;}'
      + '</style></head><body><div class="card">'
      + '<div style="flex:1;">'
      + '<div style="font-size:48px;margin-bottom:8px;">🌳</div>'
      + '<h1 style="font-size:24px;margin:0 0 8px;">' + ReviewTools._co().name + '</h1>'
      + '<div style="font-size:28px;color:#fbbf24;margin-bottom:8px;">★★★★★</div>'
      + '<p style="font-size:14px;opacity:.8;margin:0;">100+ Five Star Reviews on Google</p>'
      + '<p style="font-size:13px;opacity:.6;margin:8px 0 0;">' + ReviewTools._loc() + '</p>'
      + '</div>'
      + '<div style="text-align:center;">'
      + '<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=255-255-255&bgcolor=0-0-0-0&data=' + encodeURIComponent(ReviewTools._revUrl()) + '" style="width:140px;height:140px;border-radius:8px;">'
      + '<p style="font-size:11px;opacity:.7;margin:8px 0 0;">Scan to review</p>'
      + '</div></div></body></html>';
    var w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    UI.toast('Social card opened — screenshot it to share');
  }
};
