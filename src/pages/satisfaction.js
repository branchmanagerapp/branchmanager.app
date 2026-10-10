/**
 * Branch Manager — Client Satisfaction & NPS Tracker
 * Track client ratings after job completion, calculate NPS score
 */
var Satisfaction = {
  // Rate a job (1-5 stars + optional comment)
  rate: function(jobId, rating, comment) {
    var j = DB.jobs.getById(jobId);
    if (!j) return;
    DB.jobs.update(jobId, {
      satisfaction: {
        rating: rating,
        comment: comment || '',
        ratedAt: new Date().toISOString(),
        ratedBy: j.clientName || 'Client'
      }
    });
    UI.toast('Rating saved — ' + rating + ' stars');
  },

  // Show rating modal for a job
  showRatingModal: function(jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j) return;
    var existing = j.satisfaction || {};

    var html = '<div style="text-align:center;padding:8px 0 16px;">'
      + '<div style="font-size:14px;color:var(--text-light);margin-bottom:4px;">Job #' + (j.jobNumber || '') + ' — ' + UI.esc(j.clientName || '') + '</div>'
      + '<div style="font-size:13px;color:var(--text-light);margin-bottom:16px;">' + UI.esc(j.description || '') + '</div>'
      + '<div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-light);margin-bottom:8px;">How satisfied was the client?</div>'
      + '<div id="sat-stars" style="display:flex;justify-content:center;gap:4px;margin-bottom:16px;">';

    for (var i = 1; i <= 5; i++) {
      var active = existing.rating && i <= existing.rating;
      html += '<button onclick="Satisfaction._selectStar(' + i + ')" data-star="' + i + '" style="font-size:36px;background:none;border:none;cursor:pointer;transition:transform .15s;padding:2px 4px;' + (active ? '' : 'opacity:.3;') + '"'
        + ' onmouseover="Satisfaction._hoverStar(' + i + ')" onmouseout="Satisfaction._hoverStar(0)">'
        + '⭐</button>';
    }

    html += '</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-light);margin:-8px 20px 12px;"><span>Unhappy</span><span>Very Happy</span></div>'
      + '<input type="hidden" id="sat-rating" value="' + (existing.rating || 0) + '">'
      + '<div style="text-align:left;">'
      + '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Client feedback (optional)</label>'
      + '<textarea id="sat-comment" rows="3" placeholder="Any comments from the client..." style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:13px;resize:vertical;">' + UI.esc(existing.comment || '') + '</textarea>'
      + '</div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'
      + '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
      + '<button class="btn btn-primary" onclick="Satisfaction._save(\'' + jobId + '\')">Save Rating</button>'
      + '</div></div>';

    UI.showModal('Client Satisfaction', html);
  },

  _selectedRating: 0,

  _selectStar: function(n) {
    Satisfaction._selectedRating = n;
    document.getElementById('sat-rating').value = n;
    var stars = document.querySelectorAll('#sat-stars button');
    stars.forEach(function(btn) {
      var s = parseInt(btn.dataset.star);
      btn.style.opacity = s <= n ? '1' : '.3';
      btn.style.transform = s === n ? 'scale(1.2)' : 'scale(1)';
    });
  },

  _hoverStar: function(n) {
    if (n === 0) {
      // Reset to selected
      var sel = Satisfaction._selectedRating || parseInt(document.getElementById('sat-rating').value) || 0;
      Satisfaction._selectStar(sel);
      return;
    }
    var stars = document.querySelectorAll('#sat-stars button');
    stars.forEach(function(btn) {
      var s = parseInt(btn.dataset.star);
      btn.style.opacity = s <= n ? '1' : '.3';
    });
  },

  _save: function(jobId) {
    var rating = parseInt(document.getElementById('sat-rating').value);
    if (!rating || rating < 1) { UI.toast('Please select a rating', 'error'); return; }
    var comment = document.getElementById('sat-comment').value.trim();
    Satisfaction.rate(jobId, rating, comment);
    UI.closeModal();
    if (typeof JobsPage !== 'undefined' && typeof JobsPage.showDetail === 'function') {
      JobsPage.showDetail(jobId);
    }
  },

  // Render satisfaction badge for job detail
  renderBadge: function(jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j || !j.satisfaction) return '';
    var s = j.satisfaction;
    var stars = '';
    for (var i = 1; i <= 5; i++) {
      stars += i <= s.rating ? '⭐' : '☆';
    }
    var colors = ['', '#dc3545', '#fd7e14', '#ffc107', '#7ac143', '#2e7d32'];
    return '<div style="display:inline-flex;align-items:center;gap:6px;background:' + colors[s.rating] + '15;border:1px solid ' + colors[s.rating] + '30;padding:4px 10px;border-radius:8px;font-size:12px;">'
      + '<span>' + stars + '</span>'
      + '<span style="font-weight:600;color:' + colors[s.rating] + ';">' + s.rating + '/5</span>'
      + '</div>';
  },

  // Render inline rating for job detail
  renderForJob: function(jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j) return '';
    var s = j.satisfaction;

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin:0;">😊 Client Satisfaction</h4>'
      + '<button class="btn btn-outline" onclick="Satisfaction.showRatingModal(\'' + jobId + '\')" style="font-size:11px;padding:4px 10px;">' + (s ? 'Edit' : '+ Rate') + '</button></div>';

    if (s) {
      var stars = '';
      for (var i = 1; i <= 5; i++) stars += i <= s.rating ? '⭐' : '☆';
      html += '<div style="font-size:24px;margin-bottom:4px;">' + stars + '</div>'
        + '<div style="font-size:13px;font-weight:600;">' + s.rating + ' out of 5</div>';
      if (s.comment) {
        html += '<div style="font-size:13px;color:var(--text-light);margin-top:8px;font-style:italic;background:var(--bg);padding:8px 12px;border-radius:8px;">"' + UI.esc(s.comment) + '"</div>';
      }
      html += '<div style="font-size:11px;color:var(--text-light);margin-top:6px;">Rated ' + UI.dateRelative(s.ratedAt) + '</div>';
    } else {
      html += '<div style="font-size:13px;color:var(--text-light);">No rating yet — rate after job completion</div>';
    }

    html += '</div>';
    return html;
  },

  // Calculate NPS score across all rated jobs
  getNPS: function() {
    var jobs = DB.jobs.getAll();
    var rated = jobs.filter(function(j) { return j.satisfaction && j.satisfaction.rating; });
    if (rated.length === 0) return { score: 0, promoters: 0, passives: 0, detractors: 0, total: 0 };

    var promoters = 0, passives = 0, detractors = 0;
    rated.forEach(function(j) {
      var r = j.satisfaction.rating;
      if (r >= 5) promoters++;
      else if (r >= 4) passives++;
      else detractors++;
    });

    return {
      score: Math.round(((promoters - detractors) / rated.length) * 100),
      promoters: promoters,
      passives: passives,
      detractors: detractors,
      total: rated.length,
      avgRating: (rated.reduce(function(s, j) { return s + j.satisfaction.rating; }, 0) / rated.length).toFixed(1)
    };
  },

  // Full page — NPS dashboard + list of all rated jobs
  render: function() {
    var nps = Satisfaction.getNPS();
    var jobs = DB.jobs.getAll().filter(function(j) { return j.satisfaction && j.satisfaction.rating; });
    jobs.sort(function(a, b) { return new Date(b.satisfaction.ratedAt) - new Date(a.satisfaction.ratedAt); });

    var html = '<div style="max-width:800px;">';

    // NPS widget at top
    if (nps.total > 0) {
      html += Satisfaction.renderNPSWidget();
    } else {
      html += '<div class="empty-state"><div class="empty-icon">😊</div>'
        + '<h3>No ratings yet</h3>'
        + '<p>Rate clients from the job detail view after completing jobs.</p>'
        + '<button class="btn btn-primary" style="margin-top:16px;" onclick="loadPage(\'jobs\')">Go to Jobs</button></div>';
      html += '</div>';
      return html;
    }

    // Ratings breakdown
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;margin-bottom:12px;">Rating Breakdown</h4>'
      + '<div style="display:flex;flex-direction:column;gap:6px;">';
    for (var r = 5; r >= 1; r--) {
      var count = jobs.filter(function(j) { return j.satisfaction.rating === r; }).length;
      var pct = nps.total > 0 ? Math.round(count / nps.total * 100) : 0;
      var stars = '';
      for (var s = 1; s <= 5; s++) stars += s <= r ? '⭐' : '☆';
      html += '<div style="display:flex;align-items:center;gap:8px;font-size:13px;">'
        + '<span style="width:80px;font-size:11px;">' + stars + '</span>'
        + '<div style="flex:1;height:8px;background:var(--bg);border-radius:4px;overflow:hidden;">'
        + '<div style="height:100%;width:' + pct + '%;background:#4caf50;border-radius:4px;"></div></div>'
        + '<span style="width:30px;text-align:right;color:var(--text-light);">' + count + '</span>'
        + '</div>';
    }
    html += '</div></div>';

    // Recent rated jobs list
    html += '<h4 style="font-size:14px;font-weight:700;margin-bottom:12px;">Recent Ratings</h4>';
    jobs.slice(0, 30).forEach(function(j) {
      var stars = '';
      for (var i = 1; i <= 5; i++) stars += i <= j.satisfaction.rating ? '⭐' : '☆';
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:8px;cursor:pointer;" onclick="loadPage(\'jobs\');JobsPage.showDetail(\'' + j.id + '\')">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">'
        + '<div>'
        + '<div style="font-weight:600;font-size:14px;">' + UI.esc(j.clientName || '—') + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">' + UI.esc(j.description || '') + '</div>'
        + '</div>'
        + '<div style="text-align:right;">'
        + '<div style="font-size:18px;">' + stars + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);">' + UI.dateRelative(j.satisfaction.ratedAt) + '</div>'
        + '</div></div>'
        + (j.satisfaction.comment ? '<div style="font-size:13px;color:var(--text-light);margin-top:8px;font-style:italic;background:var(--bg);padding:8px 12px;border-radius:8px;">"' + UI.esc(j.satisfaction.comment) + '"</div>' : '')
        + '</div>';
    });

    html += '</div>';
    return html;
  },

  // Render NPS widget for dashboard/reports
  renderNPSWidget: function() {
    var nps = Satisfaction.getNPS();
    if (nps.total === 0) return '';

    var scoreColor = nps.score >= 50 ? '#2e7d32' : nps.score >= 0 ? '#e6a817' : '#dc3545';

    return '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">😊 Client Satisfaction</h4>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center;">'
      + '<div><div style="font-size:28px;font-weight:800;color:' + scoreColor + ';">' + nps.score + '</div><div style="font-size:11px;color:var(--text-light);">NPS Score</div></div>'
      + '<div><div style="font-size:28px;font-weight:800;">' + nps.avgRating + '</div><div style="font-size:11px;color:var(--text-light);">Avg Rating</div></div>'
      + '<div><div style="font-size:28px;font-weight:800;">' + nps.total + '</div><div style="font-size:11px;color:var(--text-light);">Rated Jobs</div></div>'
      + '</div>'
      + '<div style="display:flex;gap:4px;margin-top:12px;height:8px;border-radius:4px;overflow:hidden;">'
      + (nps.promoters > 0 ? '<div style="flex:' + nps.promoters + ';background:#2e7d32;" title="Promoters: ' + nps.promoters + '"></div>' : '')
      + (nps.passives > 0 ? '<div style="flex:' + nps.passives + ';background:#ffc107;" title="Passives: ' + nps.passives + '"></div>' : '')
      + (nps.detractors > 0 ? '<div style="flex:' + nps.detractors + ';background:#dc3545;" title="Detractors: ' + nps.detractors + '"></div>' : '')
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:var(--text-light);">'
      + '<span>🟢 ' + nps.promoters + ' promoters</span><span>🟡 ' + nps.passives + ' passive</span><span>🔴 ' + nps.detractors + ' detractors</span></div>'
      + '</div>';
  }
};
