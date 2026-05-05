/**
 * Branch Manager — Multi-Visit Jobs
 * Track multiple visits/appointments per job (like legacy system)
 */
var Visits = {
  render: function() {
    var allJobs = DB.jobs.getAll();
    var allVisits = [];
    allJobs.forEach(function(job) {
      if (job.visits && job.visits.length) {
        job.visits.forEach(function(v) {
          allVisits.push({ visit: v, job: job });
        });
      }
    });

    var now = new Date();
    var upcoming = allVisits.filter(function(x) { return x.visit.status !== 'completed' && new Date(x.visit.date) >= new Date(now.toDateString()); });
    var overdue = allVisits.filter(function(x) { return x.visit.status !== 'completed' && new Date(x.visit.date) < new Date(now.toDateString()); });
    var recent = allVisits.filter(function(x) { return x.visit.status === 'completed'; });

    upcoming.sort(function(a, b) { return new Date(a.visit.date) - new Date(b.visit.date); });
    overdue.sort(function(a, b) { return new Date(a.visit.date) - new Date(b.visit.date); });
    recent.sort(function(a, b) { return new Date(b.visit.completedAt || b.visit.date) - new Date(a.visit.completedAt || a.visit.date); });

    var html = '<div style="max-width:800px;">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;">'
      + '<div class="stat-card"><div class="stat-label">Upcoming</div><div class="stat-value">' + upcoming.length + '</div></div>'
      + '<div class="stat-card"><div class="stat-label">Overdue</div><div class="stat-value" style="color:var(--red);">' + overdue.length + '</div></div>'
      + '<div class="stat-card"><div class="stat-label">Completed</div><div class="stat-value">' + recent.length + '</div></div>'
      + '</div>';

    function renderVisitRow(x, highlight) {
      var v = x.visit; var job = x.job;
      var isComplete = v.status === 'completed';
      var isPast = !isComplete && new Date(v.date) < now;
      var color = isComplete ? 'var(--green-dark)' : isPast ? 'var(--red)' : 'var(--accent)';
      return '<div style="background:var(--white);border:1px solid ' + (highlight || 'var(--border)') + ';border-radius:10px;padding:14px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">'
        + '<div style="display:flex;gap:10px;align-items:flex-start;">'
        + '<div style="width:40px;height:40px;border-radius:8px;background:' + color + '18;color:' + color + ';display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">' + (isComplete ? '✓' : isPast ? '⚠' : '📅') + '</div>'
        + '<div>'
        + '<div style="font-weight:600;font-size:14px;">' + UI.esc(v.title || 'Visit') + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">'
        + '<a href="#" onclick="loadPage(\'jobs\');setTimeout(function(){JobsPage.showDetail(\'' + job.id + '\');},100);return false;" style="color:var(--accent);text-decoration:none;">' + UI.esc(job.clientName || '') + '</a>'
        + (job.description ? ' · ' + UI.esc(job.description).substr(0, 40) : '')
        + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">' + UI.dateShort(v.date) + (v.time ? ' at ' + v.time : '') + (v.duration ? ' · ' + v.duration + 'hr' : '') + '</div>'
        + (v.crew && v.crew.length ? '<div style="font-size:11px;color:var(--text-light);">👷 ' + v.crew.join(', ') + '</div>' : '')
        + '</div></div>'
        + '<div style="flex-shrink:0;">'
        + (!isComplete ? '<button onclick="Visits.completeVisit(\'' + job.id + '\',\'' + v.id + '\');" style="background:var(--green-dark);color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">✓ Done</button>' : '')
        + '</div></div>';
    }

    if (overdue.length > 0) {
      html += '<div style="margin-bottom:16px;"><div style="font-weight:700;font-size:13px;color:var(--red);margin-bottom:8px;">⚠ Overdue (' + overdue.length + ')</div>';
      overdue.forEach(function(x) { html += renderVisitRow(x, 'var(--red)'); });
      html += '</div>';
    }

    if (upcoming.length > 0) {
      html += '<div style="margin-bottom:16px;"><div style="font-weight:700;font-size:13px;margin-bottom:8px;">📅 Upcoming (' + upcoming.length + ')</div>';
      upcoming.forEach(function(x) { html += renderVisitRow(x, null); });
      html += '</div>';
    }

    if (recent.length > 0) {
      html += '<div><div style="font-weight:700;font-size:13px;margin-bottom:8px;">✅ Recently Completed</div>';
      recent.slice(0, 20).forEach(function(x) { html += renderVisitRow(x, null); });
      html += '</div>';
    }

    if (!allVisits.length) {
      html += '<div class="empty-state"><div class="empty-icon">📅</div><h3>No visits yet</h3><p>Multi-visit jobs show up here. Add a follow-up visit from any job detail page.</p><button class="btn btn-primary" style="margin-top:16px;" onclick="loadPage(\'jobs\')">Go to Jobs</button></div>';
    }

    html += '</div>';
    return html;
  },

  // Get visits for a job
  getForJob: function(jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j) return [];
    return j.visits || [];
  },

  // Add a visit to a job
  addVisit: function(jobId, visit) {
    var j = DB.jobs.getById(jobId);
    if (!j) return;
    var visits = j.visits || [];
    visit.id = 'v-' + Date.now();
    visit.status = visit.status || 'scheduled';
    visit.createdAt = new Date().toISOString();
    visits.push(visit);
    DB.jobs.update(jobId, { visits: visits });
    UI.toast('Visit added');
  },

  // Update visit status
  updateVisit: function(jobId, visitId, updates) {
    var j = DB.jobs.getById(jobId);
    if (!j || !j.visits) return;
    var visit = j.visits.find(function(v) { return v.id === visitId; });
    if (visit) {
      Object.keys(updates).forEach(function(k) { visit[k] = updates[k]; });
      DB.jobs.update(jobId, { visits: j.visits });
    }
  },

  // Complete a visit
  completeVisit: function(jobId, visitId) {
    Visits.updateVisit(jobId, visitId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      completedBy: Auth.user ? Auth.user.name : 'User'
    });
    UI.toast('Visit marked complete');
    if (typeof JobsPage !== 'undefined') JobsPage.showDetail(jobId);
  },

  // Delete a visit
  deleteVisit: function(jobId, visitId) {
    var j = DB.jobs.getById(jobId);
    if (!j || !j.visits) return;
    j.visits = j.visits.filter(function(v) { return v.id !== visitId; });
    DB.jobs.update(jobId, { visits: j.visits });
    UI.toast('Visit removed');
    if (typeof JobsPage !== 'undefined') JobsPage.showDetail(jobId);
  },

  // Show add visit form
  showAddForm: function(jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j) return;
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    var tomorrowStr = tomorrow.toISOString().split('T')[0];

    var html = '<div style="display:grid;gap:12px;">'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Visit Title</label>'
      + '<input type="text" id="visit-title" value="Follow-up visit" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Date</label>'
      + '<input type="date" id="visit-date" value="' + tomorrowStr + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Time</label>'
      + '<input type="time" id="visit-time" value="09:00" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div></div>'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Duration</label>'
      + '<select id="visit-duration" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;">'
      + '<option value="1">1 hour</option><option value="2">2 hours</option><option value="3">3 hours</option>'
      + '<option value="4" selected>4 hours (half day)</option><option value="8">8 hours (full day)</option>'
      + '<option value="0">TBD</option></select></div>'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Assigned Crew</label>'
      + '<input type="text" id="visit-crew" placeholder="e.g. Doug, Mike" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Notes</label>'
      + '<textarea id="visit-notes" rows="2" placeholder="What needs to happen on this visit..." style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;resize:vertical;"></textarea></div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
      + '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
      + '<button class="btn btn-primary" onclick="Visits._saveNew(\'' + jobId + '\')">Add Visit</button>'
      + '</div></div>';
    UI.showModal('Schedule Visit — Job #' + (j.jobNumber || ''), html);
  },

  _saveNew: function(jobId) {
    var title = document.getElementById('visit-title').value.trim();
    var date = document.getElementById('visit-date').value;
    var time = document.getElementById('visit-time').value;
    var duration = document.getElementById('visit-duration').value;
    var crew = document.getElementById('visit-crew').value.trim();
    var notes = document.getElementById('visit-notes').value.trim();

    if (!date) { UI.toast('Please select a date', 'error'); return; }

    Visits.addVisit(jobId, {
      title: title || 'Visit',
      date: date,
      time: time,
      duration: parseFloat(duration),
      crew: crew ? crew.split(',').map(function(s) { return s.trim(); }) : [],
      notes: notes
    });
    UI.closeModal();
    if (typeof JobsPage !== 'undefined') JobsPage.showDetail(jobId);
  },

  // Render visits section for job detail
  renderForJob: function(jobId) {
    var visits = Visits.getForJob(jobId);
    var completed = visits.filter(function(v) { return v.status === 'completed'; }).length;

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px;">'
      + '<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin:0;">📅 Visits (' + completed + '/' + visits.length + ')</h4>'
      + '<button class="btn btn-outline" onclick="Visits.showAddForm(\'' + jobId + '\')" style="font-size:11px;padding:4px 12px;">+ Add Visit</button>'
      + '</div>';

    if (visits.length === 0) {
      html += '<div style="padding:20px;text-align:center;color:var(--text-light);font-size:13px;">'
        + 'No visits scheduled. This is a single-visit job.'
        + '<div style="margin-top:8px;"><button class="btn btn-outline" onclick="Visits.showAddForm(\'' + jobId + '\')" style="font-size:12px;">+ Schedule Follow-up</button></div></div>';
    } else {
      visits.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
      visits.forEach(function(v, idx) {
        var isComplete = v.status === 'completed';
        var isPast = new Date(v.date) < new Date() && !isComplete;
        var statusColor = isComplete ? '#2e7d32' : isPast ? '#dc3545' : '#1565c0';
        var statusLabel = isComplete ? 'Completed' : isPast ? 'Overdue' : 'Scheduled';

        html += '<div style="padding:12px 16px;border-bottom:1px solid var(--border);' + (isComplete ? 'opacity:.7;' : '') + '">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
          + '<div style="display:flex;gap:10px;align-items:flex-start;">'
          + '<div style="width:28px;height:28px;border-radius:50%;background:' + statusColor + '20;color:' + statusColor + ';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">'
          + (isComplete ? '✓' : (idx + 1)) + '</div>'
          + '<div>'
          + '<div style="font-weight:600;font-size:14px;">' + UI.esc(v.title || 'Visit ' + (idx + 1)) + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">'
          + UI.dateShort(v.date) + (v.time ? ' at ' + v.time : '') + (v.duration ? ' · ' + v.duration + 'hr' : '')
          + '</div>'
          + (v.crew && v.crew.length ? '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">👷 ' + v.crew.join(', ') + '</div>' : '')
          + (v.notes ? '<div style="font-size:12px;color:var(--text-light);margin-top:4px;font-style:italic;">' + UI.esc(v.notes) + '</div>' : '')
          + (isComplete && v.completedBy ? '<div style="font-size:10px;color:var(--text-light);margin-top:4px;">Completed by ' + v.completedBy + ' · ' + UI.dateRelative(v.completedAt) + '</div>' : '')
          + '</div></div>'
          + '<div style="display:flex;gap:4px;">';

        if (!isComplete) {
          html += '<button class="btn btn-primary" onclick="Visits.completeVisit(\'' + jobId + '\',\'' + v.id + '\')" style="font-size:11px;padding:4px 10px;">✓ Done</button>';
        }
        html += '<button onclick="Visits.deleteVisit(\'' + jobId + '\',\'' + v.id + '\')" style="background:none;border:none;cursor:pointer;color:#dc3545;font-size:14px;padding:4px;">×</button>';
        html += '</div></div></div>';
      });
    }

    html += '</div>';
    return html;
  }
};
