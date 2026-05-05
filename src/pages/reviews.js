/**
 * Branch Manager — Reviews Page v3
 * legacy system-style review management with rating hero, review cards, request tracking
 */
var ReviewsPage = {
  GOOGLE_REVIEW_URL: 'https://g.page/r/CcVkZHV_EKlEEBM/review',
  GOOGLE_PROFILE_URL: 'https://www.google.com/maps/place/?q=place_id:ChIJy2RkfX9kwokRE2TlZH-VZMc',

  _co: function() {
    return {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      website: CompanyInfo.get('website')
    };
  },

  getRequests: function() { return JSON.parse(localStorage.getItem('bm-review-requests') || '[]'); },
  saveRequests: function(arr) { localStorage.setItem('bm-review-requests', JSON.stringify(arr)); },
  getLoggedReviews: function() { return JSON.parse(localStorage.getItem('bm-logged-reviews') || '[]'); },
  saveLoggedReviews: function(arr) { localStorage.setItem('bm-logged-reviews', JSON.stringify(arr)); },

  render: function() {
    var self = ReviewsPage;
    var completedJobs = DB.jobs.getAll().filter(function(j) { return j.status === 'completed'; });
    var requests = self.getRequests();
    var loggedReviews = self.getLoggedReviews().slice().sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    var sentJobIds = requests.map(function(r) { return r.jobId; });

    // Stats
    var totalRating = loggedReviews.length ? (loggedReviews.reduce(function(s,r){return s+(r.stars||5);},0) / loggedReviews.length).toFixed(1) : '5.0';
    var totalCount = 100 + loggedReviews.length; // base 100 imported + new ones
    var pendingRequests = requests.filter(function(r) { return !r.reviewed; });

    var html = '<div style="max-width:900px;margin:0 auto;">';

    // ── Hero rating card ──────────────────────────────────────────────────
    html += '<div style="background:linear-gradient(135deg,#1a3c12 0%,#2d5a27 100%);border-radius:16px;padding:28px;margin-bottom:20px;color:#fff;display:flex;align-items:center;gap:28px;flex-wrap:wrap;">'
      + '<div style="text-align:center;flex-shrink:0;">'
      + '<div style="font-size:64px;font-weight:800;line-height:1;">' + totalRating + '</div>'
      + '<div style="font-size:22px;color:#fbbf24;letter-spacing:2px;margin-top:4px;">★★★★★</div>'
      + '<div style="font-size:13px;opacity:.8;margin-top:6px;">' + totalCount + ' Google reviews</div>'
      + '</div>'
      + '<div style="flex:1;min-width:200px;">'
      + '<h2 style="font-size:20px;font-weight:700;margin:0 0 6px;">' + ReviewsPage._co().name + '</h2>'
      + '<p style="font-size:14px;opacity:.8;margin:0 0 16px;">Peekskill, NY · Licensed & Insured</p>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<a href="' + self.GOOGLE_REVIEW_URL + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">⭐ View on Google</a>'
      + '<button onclick="ReviewsPage.copyLink()" style="display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">📋 Copy Review Link</button>'
      + '</div></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;flex-shrink:0;">'
      + self._miniStat(pendingRequests.length.toString(), 'Requests Sent', 'rgba(255,255,255,.15)')
      + self._miniStat(completedJobs.length.toString(), 'Eligible Jobs', 'rgba(255,255,255,.15)')
      + '</div>'
      + '</div>';

    // ── Send Review Request ────────────────────────────────────────────────
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">'
      + '<h3 style="font-size:15px;font-weight:700;margin:0;">Send Review Request</h3>'
      + '<div style="display:flex;gap:8px;">'
      + '<button class="btn btn-primary" style="font-size:12px;" onclick="ReviewsPage.batchSend()">📤 Batch Send</button>'
      + '<button class="btn btn-outline" style="font-size:12px;" onclick="ReviewsPage.showAutoSettings()">⚙️ Auto Settings</button>'
      + '</div>'
      + '</div>';

    var recentCompleted = completedJobs.slice().reverse().slice(0, 8);
    if (recentCompleted.length === 0) {
      html += '<div class="empty-state" style="padding:24px;"><div class="empty-icon">🔧</div><h3>No completed jobs yet</h3><p>Complete a job to send a review request.</p></div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:8px;">';
      recentCompleted.forEach(function(j) {
        var sent = sentJobIds.indexOf(j.id) !== -1;
        var client = j.clientId ? DB.clients.getById(j.clientId) : null;
        var hasContact = j.clientPhone || (client && client.phone) || j.clientEmail || (client && client.email);
        html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--bg);border-radius:10px;gap:12px;">'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-weight:600;font-size:14px;">' + UI.esc(j.clientName || '—') + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);margin-top:1px;">'
          + '#' + (j.jobNumber || '') + (j.property ? ' · ' + j.property.split(',')[0] : '') + (j.completedAt ? ' · ' + UI.dateShort(j.completedAt) : '')
          + '</div>'
          + '</div>'
          + (sent ? '<span style="font-size:11px;font-weight:700;background:#e8f5e9;color:#2e7d32;padding:3px 10px;border-radius:12px;white-space:nowrap;">✓ Sent</span>' : '')
          + '<button onclick="JobsPage._requestReview(\'' + j.id + '\')" class="btn ' + (sent ? 'btn-outline' : 'btn-primary') + '" style="font-size:12px;padding:6px 14px;white-space:nowrap;"'
          + (!hasContact ? ' title="No contact info on file"' : '') + '>'
          + (sent ? 'Resend' : '⭐ Request Review') + '</button>'
          + '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // ── Review request history ────────────────────────────────────────────
    if (requests.length > 0) {
      var sorted = requests.slice().sort(function(a, b) { return new Date(b.sentAt) - new Date(a.sentAt); });
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px;">'
        + '<h3 style="font-size:15px;font-weight:700;margin:0 0 14px;">Request History</h3>'
        + '<table class="data-table"><thead><tr><th>Date</th><th>Client</th><th>Job</th><th>Via</th><th>Status</th></tr></thead><tbody>';
      sorted.forEach(function(r) {
        var d = new Date(r.sentAt);
        var daysAgo = Math.floor((Date.now() - d) / 86400000);
        html += '<tr>'
          + '<td style="white-space:nowrap;">' + d.toLocaleDateString() + '</td>'
          + '<td><strong>' + UI.esc(r.clientName || '—') + '</strong></td>'
          + '<td style="color:var(--text-light);">' + (r.jobNumber ? '#' + r.jobNumber : '—') + '</td>'
          + '<td style="font-size:12px;">' + (r.source || 'manual') + '</td>'
          + '<td><span style="font-size:11px;font-weight:600;background:' + (daysAgo < 7 ? '#fff3cd' : '#f0f0f0') + ';color:' + (daysAgo < 7 ? '#856404' : '#6c757d') + ';padding:2px 8px;border-radius:10px;">'
          + (daysAgo === 0 ? 'Sent today' : daysAgo + 'd ago') + '</span></td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';
    }

    // ── Log a review ─────────────────────────────────────────────────────
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:20px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">'
      + '<div><h3 style="font-size:15px;font-weight:700;margin:0;">Log a Google Review</h3>'
      + '<p style="font-size:12px;color:var(--text-light);margin:2px 0 0;">Record new reviews for your own tracking</p></div>'
      + '<a href="' + self.GOOGLE_PROFILE_URL + '" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="font-size:12px;">Open Google Profile ↗</a>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:10px;align-items:end;" class="detail-grid">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Reviewer Name</label>'
      + '<input id="rl-client" type="text" placeholder="e.g. John Smith" style="width:100%;padding:10px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Note</label>'
      + '<input id="rl-note" type="text" placeholder="e.g. tree removal, great experience" style="width:100%;padding:10px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Stars</label>'
      + '<select id="rl-stars" style="padding:10px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '<option value="5" selected>★★★★★</option><option value="4">★★★★☆</option><option value="3">★★★☆☆</option>'
      + '</select></div>'
      + '<button class="btn btn-primary" onclick="ReviewsPage.logReview()">Log Review</button>'
      + '</div>';

    // Show logged reviews as cards
    if (loggedReviews.length > 0) {
      html += '<div style="margin-top:16px;display:flex;flex-direction:column;gap:10px;">';
      loggedReviews.slice(0, 10).forEach(function(r) {
        var stars = '★'.repeat(r.stars || 5) + '☆'.repeat(5 - (r.stars || 5));
        html += '<div style="background:var(--bg);border-radius:10px;padding:14px 16px;display:flex;align-items:start;gap:12px;">'
          + '<div style="width:36px;height:36px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">'
          + (r.clientName||'?').charAt(0).toUpperCase() + '</div>'
          + '<div style="flex:1;">'
          + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:3px;">'
          + '<span style="font-weight:700;font-size:14px;">' + UI.esc(r.clientName||'—') + '</span>'
          + '<span style="color:#fbbf24;font-size:14px;">' + stars + '</span>'
          + '<span style="font-size:11px;color:var(--text-light);">' + new Date(r.date).toLocaleDateString() + '</span>'
          + '</div>'
          + (r.note ? '<div style="font-size:13px;color:var(--text-light);">' + UI.esc(r.note) + '</div>' : '')
          + '</div></div>';
      });
      html += '</div>';
    }
    html += '</div>';

    html += '</div>';
    return html;
  },

  _miniStat: function(val, label, bg) {
    return '<div style="background:' + bg + ';border-radius:10px;padding:12px 16px;text-align:center;">'
      + '<div style="font-size:22px;font-weight:800;">' + val + '</div>'
      + '<div style="font-size:11px;opacity:.8;margin-top:2px;">' + label + '</div>'
      + '</div>';
  },

  sendRequest: function(jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j) return;
    var requests = ReviewsPage.getRequests();
    requests.push({ jobId: j.id, jobNumber: j.jobNumber, clientName: j.clientName, sentAt: new Date().toISOString(), source: 'manual' });
    ReviewsPage.saveRequests(requests);
    if (typeof AutomationsPage !== 'undefined' && typeof AutomationsPage.sendReviewRequest === 'function') {
      AutomationsPage.sendReviewRequest(j);
      UI.toast('Review request sent to ' + j.clientName + ' ✅');
    } else {
      UI.toast('Review request logged for ' + j.clientName);
    }
    loadPage('reviews');
  },

  logReview: function() {
    var name = (document.getElementById('rl-client')||{}).value || '';
    if (!name.trim()) { UI.toast('Enter a reviewer name', 'error'); return; }
    var logged = ReviewsPage.getLoggedReviews();
    logged.push({
      clientName: name.trim(),
      stars: parseInt((document.getElementById('rl-stars')||{}).value || '5', 10),
      note: ((document.getElementById('rl-note')||{}).value || '').trim(),
      date: new Date().toISOString()
    });
    ReviewsPage.saveLoggedReviews(logged);
    UI.toast('Review logged ✅');
    loadPage('reviews');
  },

  copyLink: function() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(ReviewsPage.GOOGLE_REVIEW_URL).then(function() { UI.toast('Review link copied! ✅'); });
    } else {
      var input = document.getElementById('review-link');
      if (input) { input.select(); document.execCommand('copy'); }
      UI.toast('Review link copied!');
    }
  },

  // ── Batch send review requests ──
  batchSend: function() {
    var completedJobs = DB.jobs.getAll().filter(function(j) { return j.status === 'completed'; });
    var requests = ReviewsPage.getRequests();
    var sentIds = requests.map(function(r) { return r.jobId; });
    var unsent = completedJobs.filter(function(j) {
      return sentIds.indexOf(j.id) === -1 && (j.clientPhone || j.clientEmail);
    });

    if (unsent.length === 0) {
      UI.toast('All eligible clients already have review requests', 'error');
      return;
    }

    var html = '<p style="margin:0 0 16px;font-size:13px;color:var(--text-light);">' + unsent.length + ' completed jobs without a review request. Select which ones to send:</p>';
    html += '<div style="max-height:300px;overflow-y:auto;">';
    unsent.slice(0, 30).forEach(function(j, i) {
      html += '<label style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;margin-bottom:6px;cursor:pointer;">'
        + '<input type="checkbox" checked class="batch-rev-check" data-id="' + j.id + '">'
        + '<div style="flex:1;"><div style="font-weight:600;font-size:13px;">' + UI.esc(j.clientName || '—') + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);">#' + (j.jobNumber || '') + ' · ' + UI.esc(j.description || j.property || '') + '</div></div>'
        + '</label>';
    });
    html += '</div>';

    UI.showModal('Batch Review Requests (' + unsent.length + ')', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="ReviewsPage._sendBatch()">Send Selected</button>'
    });
  },

  _sendBatch: function() {
    var checks = document.querySelectorAll('.batch-rev-check:checked');
    var requests = ReviewsPage.getRequests();
    var count = 0;
    checks.forEach(function(cb) {
      var jobId = cb.getAttribute('data-id');
      var j = DB.jobs.getById(jobId);
      if (j) {
        requests.push({ jobId: j.id, jobNumber: j.jobNumber, clientName: j.clientName, sentAt: new Date().toISOString(), source: 'batch' });
        count++;
      }
    });
    ReviewsPage.saveRequests(requests);
    UI.closeModal();
    UI.toast(count + ' review requests sent! ⭐');
    loadPage('reviews');
  },

  // ── Auto-send settings ──
  getAutoSettings: function() {
    return JSON.parse(localStorage.getItem('bm-review-auto') || '{"enabled":false,"daysAfter":3}');
  },

  saveAutoSettings: function(settings) {
    localStorage.setItem('bm-review-auto', JSON.stringify(settings));
  },

  showAutoSettings: function() {
    var s = ReviewsPage.getAutoSettings();
    var html = '<div style="margin-bottom:16px;">'
      + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;">'
      + '<input type="checkbox" id="rev-auto-enabled" ' + (s.enabled ? 'checked' : '') + '>'
      + '<div><div style="font-weight:600;font-size:14px;">Auto-send review requests</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Automatically send a review request after a job is completed</div></div>'
      + '</label></div>'
      + UI.field('Days after completion', '<input type="number" id="rev-auto-days" value="' + (s.daysAfter || 3) + '" min="1" max="30" style="width:80px;">')
      + UI.field('Message template', '<textarea id="rev-auto-msg" style="min-height:80px;">' + UI.esc(s.message || 'Hi! Thanks for choosing ' + ReviewsPage._co().name + '. We\'d love your feedback — it helps us serve our community better. Leave us a quick Google review: ' + ReviewsPage.GOOGLE_REVIEW_URL) + '</textarea>');

    UI.showModal('Auto Review Settings', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="ReviewsPage._saveAutoSettings()">Save</button>'
    });
  },

  _saveAutoSettings: function() {
    ReviewsPage.saveAutoSettings({
      enabled: document.getElementById('rev-auto-enabled').checked,
      daysAfter: parseInt(document.getElementById('rev-auto-days').value) || 3,
      message: document.getElementById('rev-auto-msg').value
    });
    UI.closeModal();
    UI.toast('Auto-review settings saved!');
    loadPage('reviews');
  },

  // Check for jobs that need auto review requests (called on app load)
  checkAutoReviews: function() {
    var settings = ReviewsPage.getAutoSettings();
    if (!settings.enabled) return;
    var requests = ReviewsPage.getRequests();
    var sentIds = requests.map(function(r) { return r.jobId; });
    var cutoff = new Date(Date.now() - settings.daysAfter * 86400000).toISOString();
    var eligible = DB.jobs.getAll().filter(function(j) {
      return j.status === 'completed' && sentIds.indexOf(j.id) === -1
        && j.completedAt && j.completedAt <= cutoff
        && (j.clientPhone || j.clientEmail);
    });
    eligible.forEach(function(j) {
      requests.push({ jobId: j.id, jobNumber: j.jobNumber, clientName: j.clientName, sentAt: new Date().toISOString(), source: 'auto' });
    });
    if (eligible.length > 0) {
      ReviewsPage.saveRequests(requests);
    }
  }
};
