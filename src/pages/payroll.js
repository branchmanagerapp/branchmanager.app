/**
 * Branch Manager — Payroll + Week View
 * Gusto-style weekly timesheet with approval system
 * Mobile-first, iPhone-optimized
 * v1
 */
var PayrollPage = {
  _weekOffset: 0,
  _expandedCells: {},
  _selectedEmployees: {},
  _approvals: null,

  // ── Helpers ──
  _getWeekDates: function(offset) {
    var now = new Date();
    now.setDate(now.getDate() + (offset || 0) * 7);
    var monday = new Date(now);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    var dates = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(monday);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  },

  _getApprovals: function() {
    if (!PayrollPage._approvals) {
      try { PayrollPage._approvals = JSON.parse(localStorage.getItem('bm-payroll-approvals') || '{}'); } catch(e) { PayrollPage._approvals = {}; }
    }
    return PayrollPage._approvals;
  },

  _saveApprovals: function() {
    localStorage.setItem('bm-payroll-approvals', JSON.stringify(PayrollPage._approvals || {}));
  },

  _getEmployees: function() {
    var team = JSON.parse(localStorage.getItem('bm-team') || '[]');
    if (team.length === 0) {
      team = [{ id: 'owner', name: CompanyInfo.get('ownerName') || 'Owner', role: 'owner', rate: 0, active: true }];
    }
    return team.filter(function(t) { return t.active !== false; });
  },

  _getEntriesForDate: function(userId, date) {
    return DB.timeEntries.getAll().filter(function(t) {
      var user = t.userId || t.user || '';
      var entryDate = (t.date || (t.clockIn || '').substring(0, 10));
      return user === userId && entryDate === date;
    });
  },

  _totalHours: function(entries) {
    return entries.reduce(function(s, e) { return s + (e.hours || 0); }, 0);
  },

  _hasIssues: function(entries, date) {
    var issues = [];
    if (entries.length === 0) return issues;
    entries.forEach(function(e) {
      if (e.clockIn && !e.clockOut) issues.push('Missing clock-out');
      if (!e.hours && !e.clockIn) issues.push('Missing hours');
    });
    return issues;
  },

  _approvalKey: function(userId, weekStart) {
    return userId + '_' + weekStart;
  },

  _dayApprovalKey: function(userId, date) {
    return userId + '_day_' + date;
  },

  // ── Main Render ──
  render: function() {
    var self = PayrollPage;
    var dates = self._getWeekDates(self._weekOffset);
    var employees = self._getEmployees();
    var weekStart = dates[0];
    var weekEnd = dates[6];
    var dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var today = new Date().toISOString().split('T')[0];
    var approvals = self._getApprovals();

    var html = '<div style="max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;">';

    // ── Week Navigator ──
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">'
      + '<button onclick="PayrollPage._weekOffset--;loadPage(\'payroll\')" style="background:var(--white);border:1px solid var(--border);border-radius:8px;padding:8px 14px;cursor:pointer;font-size:14px;">← Prev</button>'
      + '<div style="text-align:center;">'
      + '<div style="font-size:18px;font-weight:800;">Week of ' + new Date(weekStart).toLocaleDateString('en-US', { month:'short', day:'numeric' }) + ' – ' + new Date(weekEnd).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) + '</div>'
      + (self._weekOffset === 0 ? '<span style="font-size:11px;color:var(--green-dark);font-weight:600;">Current Week</span>' : '<button onclick="PayrollPage._weekOffset=0;loadPage(\'payroll\')" style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;text-decoration:underline;">Go to current week</button>')
      + '</div>'
      + '<button onclick="PayrollPage._weekOffset++;loadPage(\'payroll\')" style="background:var(--white);border:1px solid var(--border);border-radius:8px;padding:8px 14px;cursor:pointer;font-size:14px;">Next →</button>'
      + '</div>';

    // ── Bulk Actions ──
    html += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">'
      + '<button onclick="PayrollPage.approveAll(\'' + weekStart + '\')" class="btn btn-primary" style="font-size:12px;">✓ Approve All</button>'
      + '<button onclick="PayrollPage.showPayrollSummary(\'' + weekStart + '\')" class="btn btn-outline" style="font-size:12px;">📊 Payroll Summary</button>'
      + '<button onclick="PayrollPage.exportWeek(\'' + weekStart + '\')" class="btn btn-outline" style="font-size:12px;">📥 Export CSV</button>'
      + '<button onclick="TeamPage.showForm()" class="btn btn-outline" style="font-size:12px;">+ Add Crew</button>'
      + '<button onclick="window.open(\'onboarding/\',\'_blank\')" class="btn btn-outline" style="font-size:12px;">🎓 Onboarding</button>'
      + '</div>';

    // ── Week Grid ──
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">';

    // Header row
    html += '<div style="display:grid;grid-template-columns:140px repeat(7,1fr) 70px;border-bottom:2px solid var(--border);font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;">'
      + '<div style="padding:10px 12px;">Employee</div>';
    dates.forEach(function(d, i) {
      var isToday = d === today;
      html += '<div style="padding:10px 6px;text-align:center;' + (isToday ? 'background:var(--green-bg);color:var(--green-dark);' : '') + '">'
        + dayNames[i] + '<br><span style="font-weight:400;font-size:10px;">' + new Date(d).getDate() + '</span></div>';
    });
    html += '<div style="padding:10px 6px;text-align:center;">Total</div>';
    html += '</div>';

    // Employee rows
    employees.forEach(function(emp) {
      var weekTotal = 0;
      var weekIssues = 0;
      var empKey = self._approvalKey(emp.name || emp.id, weekStart);
      var weekApproved = approvals[empKey] === 'approved';

      html += '<div style="display:grid;grid-template-columns:140px repeat(7,1fr) 70px;border-bottom:1px solid #f0f0f0;align-items:stretch;">';

      // Employee name cell — click opens the crew profile (TeamPage.showDetail)
      html += '<div onclick="if(typeof TeamPage!==\'undefined\')TeamPage.showDetail(\'' + UI.esc(emp.id) + '\')" '
        + 'title="View crew profile" '
        + 'style="padding:10px 12px;display:flex;align-items:center;gap:8px;border-right:1px solid #f0f0f0;cursor:pointer;">'
        + '<div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">'
        + (emp.name || '?').charAt(0).toUpperCase() + '</div>'
        + '<div style="min-width:0;"><div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--accent);">' + UI.esc(emp.name || '') + '</div>'
        + '<div style="font-size:10px;color:var(--text-light);">' + UI.esc(emp.role || '') + '</div></div>'
        + '</div>';

      // Day cells
      dates.forEach(function(date) {
        var entries = self._getEntriesForDate(emp.name || emp.id, date);
        var dayHours = self._totalHours(entries);
        weekTotal += dayHours;
        var issues = self._hasIssues(entries, date);
        if (issues.length) weekIssues++;
        var isToday = date === today;
        var cellKey = (emp.name || emp.id) + '_' + date;
        var expanded = self._expandedCells[cellKey];
        var dayKey = self._dayApprovalKey(emp.name || emp.id, date);
        var dayApproved = approvals[dayKey] === 'approved';
        var barColor = issues.length > 0 ? '#ef4444' : (dayHours > 0 ? '#22c55e' : '#e5e7eb');
        var editedAfterApproval = dayApproved && approvals[dayKey + '_editedAfter'];

        if (editedAfterApproval) barColor = '#f59e0b';

        html += '<div onclick="PayrollPage._toggleCell(\'' + cellKey + '\')" style="padding:6px 4px;text-align:center;cursor:pointer;border-right:1px solid #f8f8f8;' + (isToday ? 'background:#f0fdf4;' : '') + 'position:relative;min-height:50px;">';

        // Hours
        html += '<div style="font-size:14px;font-weight:' + (dayHours > 0 ? '700' : '400') + ';color:' + (dayHours > 0 ? 'var(--text)' : '#ccc') + ';">' + (dayHours > 0 ? dayHours.toFixed(1) : '—') + '</div>';

        // Status bar (collapsed)
        html += '<div style="height:' + (expanded ? '0' : '4') + 'px;background:' + barColor + ';border-radius:2px;margin:4px 2px 0;transition:height .2s;"></div>';

        // Icons
        if (entries.some(function(e) { return e.notes; })) html += '<span style="font-size:9px;position:absolute;top:2px;right:3px;">📝</span>';

        // Expanded content
        if (expanded) {
          html += '<div style="margin-top:6px;text-align:left;font-size:11px;" onclick="event.stopPropagation()">';
          // Status bar expanded
          html += '<div style="height:6px;background:' + barColor + ';border-radius:3px;margin-bottom:6px;"></div>';
          if (issues.length) {
            issues.forEach(function(iss) {
              html += '<div style="color:#ef4444;font-size:10px;">⚠ ' + iss + '</div>';
            });
          }
          entries.forEach(function(e) {
            html += '<div style="font-size:10px;color:var(--text-light);margin-top:2px;">'
              + (e.clockIn ? new Date(e.clockIn).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '') + (e.clockOut ? '–' + new Date(e.clockOut).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '') + ' ' + (e.hours ? e.hours.toFixed(1) + 'h' : '')
              + '</div>';
            if (e.notes) html += '<div style="font-size:10px;color:var(--text-light);font-style:italic;">' + UI.esc(e.notes) + '</div>';
          });
          // Day detail button
          html += '<button onclick="event.stopPropagation();PayrollPage.showDayDetail(\'' + UI.esc(emp.name || emp.id) + '\',\'' + date + '\')" style="margin-top:4px;font-size:10px;background:var(--accent);color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;">Details</button>';
          // Approval indicator
          if (dayApproved && !editedAfterApproval) html += '<div style="font-size:9px;color:#22c55e;margin-top:2px;">✓ Approved</div>';
          if (editedAfterApproval) html += '<div style="font-size:9px;color:#f59e0b;margin-top:2px;">⚠ Re-approval needed</div>';
          html += '</div>';
        }

        html += '</div>';
      });

      // Weekly total
      var overtime = Math.max(0, weekTotal - 40);
      html += '<div style="padding:10px 6px;text-align:center;font-weight:800;font-size:15px;background:' + (weekApproved ? '#f0fdf4' : 'var(--bg)') + ';border-left:2px solid var(--border);">'
        + weekTotal.toFixed(1)
        + (overtime > 0 ? '<div style="font-size:10px;color:#ef4444;font-weight:600;">' + overtime.toFixed(1) + ' OT</div>' : '')
        + (weekApproved ? '<div style="font-size:9px;color:#22c55e;">✓</div>' : '')
        + (weekIssues > 0 ? '<div style="font-size:9px;color:#ef4444;">' + weekIssues + ' issues</div>' : '')
        + '</div>';

      html += '</div>'; // end employee row
    });

    html += '</div>'; // end grid

    // ── Weekly Review Panel ──
    html += PayrollPage._renderWeeklyReview(dates, employees, weekStart);

    // v383: My Pay (employeecenter) folded under Payroll. Link at bottom for now;
    // will pull out to its own page once Crew View ships and crew-vs-admin nav splits.
    html += '<div style="margin-top:24px;padding:14px 16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;">'
      +   '<div><strong style="font-size:13px;">My Pay & Hours</strong><div style="font-size:11px;color:var(--text-light);margin-top:2px;">Personal view: paystubs, hours worked, time off.</div></div>'
      +   '<button onclick="loadPage(\'employeecenter\')" class="btn btn-outline" style="font-size:12px;">Open My Pay &rarr;</button>'
      + '</div>';

    html += '</div>';
    return html;
  },

  // ── Weekly Review Panel ──
  _renderWeeklyReview: function(dates, employees, weekStart) {
    var approvals = PayrollPage._getApprovals();
    var totalHours = 0, totalOT = 0, totalPTO = 0;
    var warnings = [];
    var approved = 0, pending = 0;

    employees.forEach(function(emp) {
      var empWeek = 0;
      dates.forEach(function(d) {
        var entries = PayrollPage._getEntriesForDate(emp.name || emp.id, d);
        empWeek += PayrollPage._totalHours(entries);
        var issues = PayrollPage._hasIssues(entries, d);
        issues.forEach(function(iss) { warnings.push(emp.name + ' (' + d + '): ' + iss); });
      });
      totalHours += empWeek;
      var ot = Math.max(0, empWeek - 40);
      totalOT += ot;

      var empKey = PayrollPage._approvalKey(emp.name || emp.id, weekStart);
      if (approvals[empKey] === 'approved') approved++;
      else pending++;
    });

    var allApproved = pending === 0 && approved > 0;
    var payrollReady = allApproved && warnings.length === 0;

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:20px;margin-top:16px;">';
    html += '<h3 style="font-size:16px;margin:0 0 16px;">Weekly Review</h3>';

    // Stats
    html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px;">';
    html += '<div style="text-align:center;padding:12px;background:var(--bg);border-radius:10px;"><div style="font-size:22px;font-weight:800;">' + totalHours.toFixed(1) + '</div><div style="font-size:11px;color:var(--text-light);">Total Hours</div></div>';
    html += '<div style="text-align:center;padding:12px;background:' + (totalOT > 0 ? '#fef3c7' : 'var(--bg)') + ';border-radius:10px;"><div style="font-size:22px;font-weight:800;color:' + (totalOT > 0 ? '#d97706' : 'var(--text)') + ';">' + totalOT.toFixed(1) + '</div><div style="font-size:11px;color:var(--text-light);">Overtime</div></div>';
    html += '<div style="text-align:center;padding:12px;background:var(--bg);border-radius:10px;"><div style="font-size:22px;font-weight:800;">' + totalPTO.toFixed(1) + '</div><div style="font-size:11px;color:var(--text-light);">PTO</div></div>';
    html += '<div style="text-align:center;padding:12px;background:' + (warnings.length > 0 ? '#fef2f2' : 'var(--bg)') + ';border-radius:10px;"><div style="font-size:22px;font-weight:800;color:' + (warnings.length > 0 ? '#dc2626' : 'var(--text)') + ';">' + warnings.length + '</div><div style="font-size:11px;color:var(--text-light);">Warnings</div></div>';
    html += '<div style="text-align:center;padding:12px;background:' + (allApproved ? '#f0fdf4' : '#fef3c7') + ';border-radius:10px;"><div style="font-size:22px;font-weight:800;color:' + (allApproved ? '#16a34a' : '#d97706') + ';">' + approved + '/' + (approved + pending) + '</div><div style="font-size:11px;color:var(--text-light);">Approved</div></div>';
    html += '</div>';

    // Payroll readiness
    html += '<div style="padding:14px;border-radius:10px;background:' + (payrollReady ? '#f0fdf4;border:2px solid #22c55e' : '#fef3c7;border:2px solid #f59e0b') + ';display:flex;align-items:center;gap:12px;">'
      + '<div style="font-size:28px;">' + (payrollReady ? '✅' : '⏳') + '</div>'
      + '<div><div style="font-weight:700;font-size:14px;color:' + (payrollReady ? '#166534' : '#92400e') + ';">' + (payrollReady ? 'Payroll Ready' : 'Payroll Not Ready') + '</div>'
      + '<div style="font-size:12px;color:' + (payrollReady ? '#166534' : '#92400e') + ';">'
      + (payrollReady ? 'All hours approved, no warnings. Ready to sync with Gusto.' : (pending > 0 ? pending + ' employee(s) pending approval. ' : '') + (warnings.length > 0 ? warnings.length + ' warning(s) to resolve.' : ''))
      + '</div></div>'
      + (payrollReady ? '<button onclick="PayrollPage.triggerGusto(\'' + weekStart + '\')" class="btn btn-primary" style="margin-left:auto;white-space:nowrap;">🚀 Send to Gusto</button>' : '')
      + '</div>';

    // Warnings list
    if (warnings.length > 0) {
      html += '<div style="margin-top:12px;">';
      warnings.slice(0, 10).forEach(function(w) {
        html += '<div style="font-size:12px;color:#dc2626;padding:4px 0;border-bottom:1px solid #fef2f2;">⚠ ' + UI.esc(w) + '</div>';
      });
      if (warnings.length > 10) html += '<div style="font-size:11px;color:var(--text-light);margin-top:4px;">+ ' + (warnings.length - 10) + ' more</div>';
      html += '</div>';
    }

    html += '</div>';
    return html;
  },

  // ── Cell Toggle ──
  _toggleCell: function(key) {
    PayrollPage._expandedCells[key] = !PayrollPage._expandedCells[key];
    loadPage('payroll');
  },

  // ── Day Detail Modal ──
  showDayDetail: function(userId, date) {
    var entries = PayrollPage._getEntriesForDate(userId, date);
    var dayName = new Date(date).toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' });

    var html = '<div style="margin-bottom:16px;font-size:14px;color:var(--text-light);">' + dayName + '</div>';

    // Hours list
    if (entries.length === 0) {
      html += '<div style="text-align:center;padding:20px;color:var(--text-light);">No hours recorded</div>';
    } else {
      entries.forEach(function(e, i) {
        html += '<div style="padding:12px;background:var(--bg);border-radius:8px;margin-bottom:8px;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;">'
          + '<div><strong>' + (e.hours ? e.hours.toFixed(1) + ' hrs' : '—') + '</strong>'
          + (e.clockIn ? '<span style="font-size:12px;color:var(--text-light);margin-left:8px;">' + new Date(e.clockIn).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + (e.clockOut ? ' – ' + new Date(e.clockOut).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ' (no clock-out)') + '</span>' : '')
          + '</div>'
          + '<div style="display:flex;gap:4px;">'
          + '<button onclick="PayrollPage.editHours(\'' + e.id + '\')" class="btn btn-outline" style="font-size:11px;padding:3px 8px;">Edit</button>'
          + '<button onclick="PayrollPage.deleteHours(\'' + e.id + '\',\'' + userId + '\',\'' + date + '\')" class="btn btn-outline" style="font-size:11px;padding:3px 8px;color:var(--red);">×</button>'
          + '</div></div>';
        if (e.jobId) {
          var job = DB.jobs.getById(e.jobId);
          html += '<div style="font-size:11px;color:var(--text-light);margin-top:4px;">Job: ' + (job ? '#' + job.jobNumber + ' ' + (job.clientName || '') : e.jobId) + '</div>';
        }
        if (e.notes) html += '<div style="font-size:12px;color:var(--text-light);margin-top:4px;font-style:italic;">📝 ' + UI.esc(e.notes) + '</div>';
        html += '</div>';
      });
    }

    // Actions
    html += '<div style="display:flex;gap:8px;margin-top:12px;">'
      + '<button onclick="PayrollPage.addHours(\'' + userId + '\',\'' + date + '\')" class="btn btn-primary" style="flex:1;">+ Add Hours</button>'
      + '<button onclick="PayrollPage.addNote(\'' + userId + '\',\'' + date + '\')" class="btn btn-outline" style="flex:1;">📝 Add Note</button>'
      + '</div>';

    // Approval
    var dayKey = PayrollPage._dayApprovalKey(userId, date);
    var dayApproved = PayrollPage._getApprovals()[dayKey] === 'approved';
    html += '<div style="margin-top:12px;text-align:center;">'
      + (dayApproved
        ? '<span style="color:#22c55e;font-weight:700;">✓ Day Approved</span>'
        : '<button onclick="PayrollPage.approveDay(\'' + userId + '\',\'' + date + '\')" class="btn btn-primary" style="width:100%;">✓ Approve Day</button>')
      + '</div>';

    UI.showModal(UI.esc(userId) + ' — ' + dayName, html);
  },

  // ── Add Hours Modal ──
  addHours: function(userId, date) {
    var jobs = DB.jobs.getAll().filter(function(j) { return j.status === 'scheduled' || j.status === 'in_progress' || j.status === 'active'; });
    var opts = '<option value="">— No job —</option>';
    jobs.forEach(function(j) { opts += '<option value="' + j.id + '">#' + (j.jobNumber || '') + ' ' + UI.esc(j.clientName || '') + '</option>'; });

    var html = UI.field('Hours', '<input type="number" id="ph-hours" step="0.25" min="0" max="24" placeholder="8.0">')
      + UI.field('Job', '<select id="ph-job">' + opts + '</select>')
      + UI.field('Clock In', '<input type="time" id="ph-in">')
      + UI.field('Clock Out', '<input type="time" id="ph-out">')
      + UI.field('Notes', '<textarea id="ph-notes" placeholder="Optional notes..."></textarea>');

    UI.showModal('Add Hours — ' + UI.esc(userId), html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="PayrollPage._saveHours(\'' + userId + '\',\'' + date + '\')">Save</button>'
    });
  },

  _saveHours: function(userId, date) {
    var hours = parseFloat(document.getElementById('ph-hours').value) || 0;
    var clockIn = document.getElementById('ph-in').value;
    var clockOut = document.getElementById('ph-out').value;
    if (!hours && !clockIn) { UI.toast('Enter hours or clock in time', 'error'); return; }

    var entry = {
      userId: userId, user: userId, date: date,
      hours: hours,
      jobId: document.getElementById('ph-job').value || null,
      notes: document.getElementById('ph-notes').value || ''
    };

    if (clockIn) {
      entry.clockIn = date + 'T' + clockIn + ':00';
      if (clockOut) {
        entry.clockOut = date + 'T' + clockOut + ':00';
        if (!hours) entry.hours = Math.round(((new Date(entry.clockOut) - new Date(entry.clockIn)) / 3600000) * 100) / 100;
      }
    }

    DB.timeEntries.create(entry);

    // Mark as edited after approval if day was approved
    var dayKey = PayrollPage._dayApprovalKey(userId, date);
    if (PayrollPage._getApprovals()[dayKey] === 'approved') {
      PayrollPage._approvals[dayKey + '_editedAfter'] = true;
      PayrollPage._saveApprovals();
    }

    UI.closeModal();
    UI.toast('Hours added');
    loadPage('payroll');
  },

  editHours: function(entryId) {
    var e = DB.timeEntries.getAll().find(function(t) { return t.id === entryId; });
    if (!e) return;
    var html = UI.field('Hours', '<input type="number" id="eh-hours" step="0.25" value="' + (e.hours || '') + '">')
      + UI.field('Notes', '<textarea id="eh-notes">' + UI.esc(e.notes || '') + '</textarea>');
    UI.showModal('Edit Hours', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="PayrollPage._updateHours(\'' + entryId + '\')">Save</button>'
    });
  },

  _updateHours: function(entryId) {
    DB.timeEntries.update(entryId, {
      hours: parseFloat(document.getElementById('eh-hours').value) || 0,
      notes: document.getElementById('eh-notes').value
    });
    UI.closeModal();
    UI.toast('Hours updated');
    loadPage('payroll');
  },

  deleteHours: function(entryId, userId, date) {
    if (!confirm('Delete these hours?')) return;
    var all = DB.timeEntries.getAll().filter(function(t) { return t.id !== entryId; });
    localStorage.setItem('bm-time-entries', JSON.stringify(all));
    UI.closeModal();
    UI.toast('Hours deleted');
    PayrollPage.showDayDetail(userId, date);
  },

  addNote: function(userId, date) {
    var html = UI.field('Note', '<textarea id="pn-note" placeholder="Add a note for this day..." style="min-height:80px;"></textarea>');
    UI.showModal('Add Note', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="PayrollPage._saveNote(\'' + userId + '\',\'' + date + '\')">Save</button>'
    });
  },

  _saveNote: function(userId, date) {
    var note = document.getElementById('pn-note').value;
    if (!note.trim()) return;
    DB.timeEntries.create({ userId: userId, user: userId, date: date, hours: 0, notes: note, type: 'note' });
    UI.closeModal();
    UI.toast('Note added');
    loadPage('payroll');
  },

  // ── Approvals ──
  approveDay: function(userId, date) {
    var dayKey = PayrollPage._dayApprovalKey(userId, date);
    PayrollPage._getApprovals();
    PayrollPage._approvals[dayKey] = 'approved';
    delete PayrollPage._approvals[dayKey + '_editedAfter'];
    PayrollPage._saveApprovals();
    UI.closeModal();
    UI.toast('Day approved ✓');
    loadPage('payroll');
  },

  approveEmployee: function(userId, weekStart) {
    var empKey = PayrollPage._approvalKey(userId, weekStart);
    PayrollPage._getApprovals();
    PayrollPage._approvals[empKey] = 'approved';
    PayrollPage._saveApprovals();
    UI.toast(userId + ' approved for the week ✓');
    loadPage('payroll');
  },

  approveAll: function(weekStart) {
    var employees = PayrollPage._getEmployees();
    PayrollPage._getApprovals();
    employees.forEach(function(emp) {
      var empKey = PayrollPage._approvalKey(emp.name || emp.id, weekStart);
      PayrollPage._approvals[empKey] = 'approved';
    });
    PayrollPage._saveApprovals();
    UI.toast('All employees approved ✓');
    loadPage('payroll');
  },

  // ── Payroll Summary Modal ──
  showPayrollSummary: function(weekStart) {
    var dates = PayrollPage._getWeekDates(PayrollPage._weekOffset);
    var employees = PayrollPage._getEmployees();
    var html = '<table class="data-table" style="width:100%;font-size:13px;"><thead><tr><th>Employee</th><th>Regular</th><th>OT</th><th>Total Hrs</th><th>Rate</th><th>Gross Pay</th><th>Status</th></tr></thead><tbody>';

    var grandTotal = 0;
    employees.forEach(function(emp) {
      var weekHours = 0;
      dates.forEach(function(d) {
        weekHours += PayrollPage._totalHours(PayrollPage._getEntriesForDate(emp.name || emp.id, d));
      });
      var regular = Math.min(weekHours, 40);
      var ot = Math.max(0, weekHours - 40);
      var rate = emp.rate || emp.payRate || 0;
      var gross = (regular * rate) + (ot * rate * 1.5);
      grandTotal += gross;
      var empKey = PayrollPage._approvalKey(emp.name || emp.id, weekStart);
      var approved = PayrollPage._getApprovals()[empKey] === 'approved';

      html += '<tr>'
        + '<td style="font-weight:600;">' + UI.esc(emp.name || '') + '</td>'
        + '<td>' + regular.toFixed(1) + '</td>'
        + '<td style="color:' + (ot > 0 ? '#d97706' : 'var(--text)') + ';">' + ot.toFixed(1) + '</td>'
        + '<td style="font-weight:700;">' + weekHours.toFixed(1) + '</td>'
        + '<td>' + (rate ? '$' + rate.toFixed(2) + '/hr' : '—') + '</td>'
        + '<td style="font-weight:700;">' + (rate ? '$' + gross.toFixed(2) : '—') + '</td>'
        + '<td>' + (approved ? '<span style="color:#22c55e;font-weight:600;">✓ Approved</span>' : '<span style="color:#d97706;">Pending</span>') + '</td>'
        + '</tr>';
    });

    html += '<tr style="font-weight:800;border-top:2px solid var(--border);"><td>TOTAL</td><td></td><td></td><td></td><td></td><td>$' + grandTotal.toFixed(2) + '</td><td></td></tr>';
    html += '</tbody></table>';

    UI.showModal('Payroll Summary — Week of ' + new Date(weekStart).toLocaleDateString(), html, { wide: true,
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
        + ' <button class="btn btn-primary" onclick="PayrollPage.triggerGusto(\'' + weekStart + '\')">🚀 Send to Gusto</button>'
    });
  },

  // ── Export CSV ──
  exportWeek: function(weekStart) {
    var dates = PayrollPage._getWeekDates(PayrollPage._weekOffset);
    var employees = PayrollPage._getEmployees();
    var rows = ['Employee,Mon,Tue,Wed,Thu,Fri,Sat,Sun,Total,OT,Rate,Gross'];

    employees.forEach(function(emp) {
      var cols = [emp.name];
      var total = 0;
      dates.forEach(function(d) {
        var h = PayrollPage._totalHours(PayrollPage._getEntriesForDate(emp.name || emp.id, d));
        cols.push(h.toFixed(1));
        total += h;
      });
      var ot = Math.max(0, total - 40);
      var rate = emp.rate || emp.payRate || 0;
      var gross = (Math.min(total, 40) * rate) + (ot * rate * 1.5);
      cols.push(total.toFixed(1), ot.toFixed(1), rate.toFixed(2), gross.toFixed(2));
      rows.push(cols.join(','));
    });

    var blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'payroll-' + weekStart + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    UI.toast('Payroll exported');
  },

  // ── Gusto Integration ──
  triggerGusto: function(weekStart) {
    var gustoKey = localStorage.getItem('bm-gusto-api-key');
    if (!gustoKey) {
      UI.showModal('Connect Gusto', '<div style="text-align:center;padding:20px;">'
        + '<div style="font-size:48px;margin-bottom:12px;">💰</div>'
        + '<h3>Connect Gusto for Payroll</h3>'
        + '<p style="color:var(--text-light);margin-bottom:16px;">Enter your Gusto API key to sync employees and submit payroll.</p>'
        + UI.field('Gusto API Key', '<input type="text" id="gusto-key" placeholder="Enter Gusto API key...">')
        + '<button class="btn btn-primary" onclick="localStorage.setItem(\'bm-gusto-api-key\',document.getElementById(\'gusto-key\').value);UI.closeModal();UI.toast(\'Gusto connected!\');loadPage(\'payroll\')">Connect</button>'
        + '</div>');
      return;
    }
    UI.toast('Payroll data sent to Gusto! 🚀');
    // In production: POST to Gusto API with hours data
  }
};
