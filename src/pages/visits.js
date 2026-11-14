/**
 * Branch Manager — Multi-Visit Jobs
 * Track multiple visits/appointments per job (like legacy system)
 */
var Visits = {
  render: function() {
    Visits._migrateLegacy();
    var allVisits = [];
    (DB.visits ? DB.visits.getAll() : []).forEach(function(raw) {
      var job = raw.jobId ? DB.jobs.getById(raw.jobId) : null;
      if (!job) job = { id: raw.jobId || '', clientName: '', description: '' };
      allVisits.push({ visit: Visits._norm(raw), job: job });
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
        + (v.fromJobber ? '<span style="font-size:11px;color:var(--text-light);">from Jobber</span>' : (!isComplete ? '<button onclick="Visits.completeVisit(\'' + job.id + '\',\'' + v.id + '\');" style="background:var(--green-dark);color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">✓ Done</button>' : ''))
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

  // v1277: visits live in the cloud `visits` table (DB.visits). Before, they
  // were an array on the job that never left the phone it was made on.
  // _norm turns a stored row into the shape this page draws.
  _norm: function(r) {
    var notes = String(r.notes || '');
    var fromJobber = notes.indexOf('Jobber: ') === 0;
    var lines = notes.replace(/^Jobber: /, '').split('\n');
    var title = lines.shift() || 'Visit';
    var dur = 0;
    if (r.startTime && r.endTime) {
      var a = r.startTime.split(':'), b = r.endTime.split(':');
      dur = Math.round(((+b[0] * 60 + +b[1]) - (+a[0] * 60 + +a[1])) / 6) / 10;
      if (dur < 0) dur = 0;
    }
    var crew = r.crew;
    if (typeof crew === 'string') { try { crew = JSON.parse(crew); } catch (e) { crew = crew ? crew.split(',') : []; } }
    return { id: r.id, jobId: r.jobId, title: title, date: String(r.scheduledDate || '').slice(0, 10), time: r.startTime || '',
             duration: dur, crew: Array.isArray(crew) ? crew : [], notes: lines.join('\n'), status: r.status || 'scheduled',
             completedAt: r.completedAt, completedBy: r.completedBy, fromJobber: fromJobber };
  },

  // One-time: move any visits saved the old way (array on the job, this phone
  // only) into the cloud table, then clear the array.
  _migrateLegacy: function() {
    if (!DB.visits || Visits._migrated) return;
    Visits._migrated = true;
    try {
      DB.jobs.getAll().forEach(function(j) {
        if (!j.visits || !j.visits.length) return;
        j.visits.forEach(function(v) {
          var st = v.time || '';
          var en = '';
          if (st && v.duration) { var p = st.split(':'); var m = (+p[0]) * 60 + (+p[1]) + Math.round(v.duration * 60); en = ('0' + Math.floor(m / 60) % 24).slice(-2) + ':' + ('0' + m % 60).slice(-2); }
          DB.visits.create({ jobId: j.id, clientId: j.clientId || null, scheduledDate: v.date, startTime: st, endTime: en,
            crew: v.crew || [], status: v.status === 'completed' ? 'completed' : 'scheduled', completedAt: v.completedAt || null,
            notes: (v.title || 'Visit') + (v.notes ? '\n' + v.notes : '') });
        });
        DB.jobs.update(j.id, { visits: [] });
      });
    } catch (e) { console.warn('[visits] legacy move failed', e); }
  },

  // Get visits for a job (drawn shape)
  getForJob: function(jobId) {
    Visits._migrateLegacy();
    return DB.visits ? DB.visits.getByJob(jobId).map(Visits._norm) : [];
  },

  // Add a visit to a job
  addVisit: function(jobId, visit) {
    var j = DB.jobs.getById(jobId);
    if (!j) return;
    var st = visit.time || '';
    var en = '';
    if (st && visit.duration) { var p = st.split(':'); var m = (+p[0]) * 60 + (+p[1]) + Math.round(visit.duration * 60); en = ('0' + Math.floor(m / 60) % 24).slice(-2) + ':' + ('0' + m % 60).slice(-2); }
    DB.visits.create({ jobId: jobId, clientId: j.clientId || null, scheduledDate: visit.date, startTime: st, endTime: en,
      crew: visit.crew || [], status: 'scheduled', notes: (visit.title || 'Visit') + (visit.notes ? '\n' + visit.notes : '') });
    UI.toast('Visit added');
  },

  // Complete a visit
  completeVisit: function(jobId, visitId) {
    DB.visits.update(visitId, { status: 'completed', completedAt: new Date().toISOString() });
    UI.toast('Visit marked complete');
    if (typeof JobsPage !== 'undefined' && jobId) JobsPage.showDetail(jobId);
  },

  // Delete a visit
  deleteVisit: function(jobId, visitId) {
    if (!window.confirm('Remove this visit?')) return;
    DB.visits.remove(visitId);
    UI.toast('Visit removed');
    if (typeof JobsPage !== 'undefined' && jobId) JobsPage.showDetail(jobId);
  },

  // Crew checkboxes from the team list (unique names, active first).
  _crewPicker: function() {
    var seen = {}, names = [];
    try { (DB.team && DB.team.getAll ? DB.team.getAll() : []).forEach(function(t) { var n = String(t.name || '').trim(); if (n && !seen[n.toLowerCase()] && t.active !== false && t.status !== 'inactive') { seen[n.toLowerCase()] = 1; names.push(n); } }); } catch (e) {}
    if (!names.length) return '<input type="text" disabled placeholder="Add people in Team first" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;">';
    return '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + names.map(function(n) {
      return '<label style="display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;"><input type="checkbox" class="visit-crew-cb" value="' + UI.esc(n) + '"> ' + UI.esc(n) + '</label>';
    }).join('') + '</div>';
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
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Crew</label>'
      + Visits._crewPicker()
      + '</div>'
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
    var crew = [].slice.call(document.querySelectorAll('.visit-crew-cb:checked')).map(function(c) { return c.value; });
    var notes = document.getElementById('visit-notes').value.trim();

    if (!date) { UI.toast('Please select a date', 'error'); return; }

    Visits.addVisit(jobId, {
      title: title || 'Visit',
      date: date,
      time: time,
      duration: parseFloat(duration),
      crew: crew,
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

        if (v.fromJobber) {
          html += '<span style="font-size:11px;color:var(--text-light);">from Jobber</span>';
        } else {
          if (!isComplete) {
            html += '<button class="btn btn-primary" onclick="Visits.completeVisit(\'' + jobId + '\',\'' + v.id + '\')" style="font-size:11px;padding:4px 10px;">✓ Done</button>';
          }
          html += '<button onclick="Visits.deleteVisit(\'' + jobId + '\',\'' + v.id + '\')" style="background:none;border:none;cursor:pointer;color:#dc3545;font-size:14px;padding:4px;">×</button>';
        }
        html += '</div></div></div>';
      });
    }

    html += '</div>';
    return html;
  }
};
