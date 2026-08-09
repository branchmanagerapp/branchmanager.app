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
  _approvalsLoaded: false,
  _lastRun: null,

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

  // v743: approvals are now cloud-synced via the payroll_approvals
  // table. localStorage is a write-through cache so the UI is instant
  // while a background insert/upsert hits Supabase. On page open we
  // also pull-merge cloud rows so iPhone↔desktop stays in sync.
  _getApprovals: function() {
    if (!PayrollPage._approvals) {
      try { PayrollPage._approvals = JSON.parse(localStorage.getItem('bm-payroll-approvals') || '{}'); } catch(e) { PayrollPage._approvals = {}; }
    }
    if (!PayrollPage._approvalsLoaded) {
      PayrollPage._approvalsLoaded = true;
      PayrollPage._pullCloudApprovals();
    }
    return PayrollPage._approvals;
  },

  _saveApprovals: function() {
    localStorage.setItem('bm-payroll-approvals', JSON.stringify(PayrollPage._approvals || {}));
  },

  _pullCloudApprovals: function() {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) return;
    // Pull last 90 days so we don't bloat memory
    var cutoff = new Date(Date.now() - 90 * 86400000).toISOString().substring(0, 10);
    sb.from('payroll_approvals').select('*').gte('week_start', cutoff).then(function(r) {
      if (r.error || !r.data) return;
      var changed = false;
      r.data.forEach(function(row) {
        var key = row.day
          ? (row.employee_name + '_day_' + row.day)
          : (row.employee_name + '_' + row.week_start);
        var prev = PayrollPage._approvals[key];
        if (prev !== row.status) { PayrollPage._approvals[key] = row.status; changed = true; }
        if (row.edited_after) {
          var ea = key + '_editedAfter';
          if (!PayrollPage._approvals[ea]) { PayrollPage._approvals[ea] = true; changed = true; }
        }
      });
      if (changed) {
        PayrollPage._saveApprovals();
        // Only re-render if user is still on the payroll page
        if (window.currentPage === 'payroll') loadPage('payroll');
      }
    });
  },

  _pushCloudApproval: function(employeeName, weekStart, day, status, editedAfter) {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) return;
    var tenantId = (typeof window !== 'undefined' && window.resolveTenantId) ? window.resolveTenantId() : null;
    if (!tenantId) return;
    var approvedBy = (typeof Auth !== 'undefined' && Auth.user && Auth.user.name) ? Auth.user.name : null;
    var row = {
      tenant_id: tenantId,
      employee_name: employeeName,
      week_start: weekStart,
      day: day || null,
      status: status,
      edited_after: !!editedAfter,
      approved_by: approvedBy,
      approved_at: new Date().toISOString()
    };
    sb.from('payroll_approvals')
      .upsert(row, { onConflict: 'tenant_id,employee_name,week_start,day' })
      .then(function(r) {
        if (r.error) console.warn('payroll_approvals upsert failed:', r.error.message);
      });
  },

  _deleteCloudApproval: function(employeeName, weekStart, day) {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) return;
    var q = sb.from('payroll_approvals').delete()
      .eq('employee_name', employeeName).eq('week_start', weekStart);
    q = day ? q.eq('day', day) : q.is('day', null);
    q.then(function(){});
  },

  _getEmployees: function() {
    var team = JSON.parse(localStorage.getItem('bm-team') || '[]');
    if (team.length === 0) {
      team = [{ id: 'owner', name: CompanyInfo.get('ownerName') || 'Owner', role: 'owner', rate: 0, active: true }];
    }
    // v1086: commission roles (Michelle) are excluded from the hours grid —
    // they're paid per-sale, not per-hour (Doug 8/6). Commission enters
    // payroll as its own run line when a payout is recorded, never as time.
    return team.filter(function(t) { return t.active !== false && t.employment_type !== 'commission'; });
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
  // ── v1096: Bouncie payroll panel ──────────────────────────────────────
  // Per-day, collapsible "what the truck did + suggested clock in/out",
  // reconstructed from vehicle_positions (the F-750 work truck). Rules:
  // hours start at the yard (commute/Ram excluded); suggest ±30 min yard
  // buffer around truck first/last movement; per-person, Doug confirms.
  // Lazy-loads on expand so it never queries unless opened.
  _bouncieLoaded: false,
  _renderBouncie: function(dates) {
    var rows = dates.map(function(d) {
      var dn = new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'numeric', day:'numeric' });
      var note = ''; try { note = localStorage.getItem('bm-payroll-note-' + d) || ''; } catch(e) {}
      return '<div data-bday="' + d + '" style="border-top:1px solid var(--border);padding:10px 14px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'
        +   '<strong style="font-size:13px;">' + dn + '</strong>'
        +   '<span class="bday-sum" style="font-size:12px;color:var(--text-light);">loading…</span>'
        + '</div>'
        + '<div class="bday-detail" style="font-size:11.5px;color:var(--text-light);margin-top:3px;"></div>'
        + '<textarea placeholder="Notes…" onchange="PayrollPage._saveBouncieNote(\'' + d + '\',this.value)" style="width:100%;margin-top:6px;border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-size:12px;min-height:32px;resize:vertical;box-sizing:border-box;">' + (typeof UI !== 'undefined' ? UI.esc(note) : note) + '</textarea>'
        + '</div>';
    }).join('');
    return '<details ontoggle="if(this.open)PayrollPage._loadBouncieWeek()" style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin-bottom:16px;overflow:hidden;">'
      + '<summary style="padding:12px 16px;cursor:pointer;font-weight:700;font-size:14px;list-style:none;display:flex;justify-content:space-between;align-items:center;">'
      +   '<span>🛰 Bouncie — truck day &amp; suggested hours</span><span style="font-size:11px;color:var(--text-light);font-weight:500;">tap ▾</span>'
      + '</summary>'
      + '<div id="bouncie-week">' + rows + '</div>'
      + '<div style="padding:8px 16px 12px;font-size:11px;color:var(--text-light);line-height:1.5;">Suggested clock = work-truck yard-out/return ±30 min buffer. Commute (Ram) excluded; hours start at the yard. Confirm per person — first arrival ≠ everyone in.</div>'
      + '</details>';
  },
  _loadBouncieWeek: function() {
    if (PayrollPage._bouncieLoaded) return; PayrollPage._bouncieLoaded = true;
    var rows = document.querySelectorAll('#bouncie-week [data-bday]');
    Array.prototype.forEach.call(rows, function(row) {
      var d = row.getAttribute('data-bday');
      PayrollPage._bouncieDay(d).then(function(r) {
        var sum = row.querySelector('.bday-sum'); var det = row.querySelector('.bday-detail');
        if (!r || !r.firstMove) { if (sum) sum.textContent = 'no truck movement'; return; }
        if (sum) sum.innerHTML = '<span style="color:var(--green-dark);font-weight:700;">' + r.inSug + ' – ' + r.outSug + '</span>';
        if (det) det.textContent = 'Truck out ' + r.firstMove + '–' + r.lastMove + ' (~' + r.movingHrs + 'h moving) · suggested clock in bold above';
      });
    });
  },
  _bouncieDay: function(dateStr) {
    var C = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!C) return Promise.resolve(null);
    var next = new Date(new Date(dateStr + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
    function et(ts) { return ts ? new Date(ts).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }) : null; }
    function shift(ts, m) { return new Date(new Date(ts).getTime() + m * 60000); }
    var q = function(asc) { return C.from('vehicle_positions').select('ts').gte('ts', dateStr).lt('ts', next).gt('speed_mph', 1).order('ts', { ascending: asc }).limit(1); };
    return Promise.all([q(true), q(false)]).then(function(res) {
      var fm = res[0].data && res[0].data[0] && res[0].data[0].ts;
      var lm = res[1].data && res[1].data[0] && res[1].data[0].ts;
      if (!fm || !lm) return null;
      return {
        firstMove: et(fm), lastMove: et(lm),
        movingHrs: ((new Date(lm) - new Date(fm)) / 3600000).toFixed(1),
        inSug: et(shift(fm, -30)), outSug: et(shift(lm, 30))
      };
    }).catch(function() { return null; });
  },
  _saveBouncieNote: function(d, v) { try { localStorage.setItem('bm-payroll-note-' + d, v); if (typeof UI !== 'undefined') UI.toast('Note saved'); } catch(e) {} },

  render: function() {
    var self = PayrollPage;
    self._bouncieLoaded = false;
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

    // ── Bouncie GPS panel (v1096) — truck day + suggested hours ──
    html += self._renderBouncie(dates);

    // ── Bulk Actions ──
    html += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">'
      + '<button onclick="PayrollPage.approveAll(\'' + weekStart + '\')" class="btn btn-primary" style="font-size:12px;">✓ Approve All</button>'
      + '<button onclick="PayrollPage.showPayrollSummary(\'' + weekStart + '\')" class="btn btn-outline" style="font-size:12px;">📊 Payroll Summary</button>'
      + '<button onclick="PayrollPage.exportWeek(\'' + weekStart + '\')" class="btn btn-outline" style="font-size:12px;">📥 Export CSV</button>'
      + '<button onclick="TeamPage.showForm()" class="btn btn-outline" style="font-size:12px;">+ Add Crew</button>'
      + '<button onclick="window.open(\'onboarding/\',\'_blank\')" class="btn btn-outline" style="font-size:12px;">🎓 Onboarding</button>'
      + '</div>';

    // ── Week Grid ──
    // v1089: phones get a per-crew stacked card (the 9-col grid crushed at 375px);
    // desktop keeps the original grid untouched.
    var isMobile = (typeof window !== 'undefined') && window.innerWidth <= 700;
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">';

    // Header row
    if (!isMobile)
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
      if (isMobile) { html += self._mobileEmpCard(emp, dates, approvals, today, weekStart); return; }
      var weekTotal = 0;
      var weekIssues = 0;
      var empKey = self._approvalKey(emp.name || emp.id, weekStart);
      // v745: week-level approval = explicit week-approval OR every
      // working-day cell individually approved (computed below as we
      // walk the date cells).
      var weekExplicit = approvals[empKey] === 'approved';
      var workingDaysCount = 0;
      var daysApprovedCount = 0;

      html += '<div style="display:grid;grid-template-columns:140px repeat(7,1fr) 70px;border-bottom:1px solid #f0f0f0;align-items:stretch;">';

      // Employee name cell — click opens the crew profile (TeamPage.showDetail).
      // v743: avatar shows photo_url if present, falls back to first-letter monogram.
      var avatar;
      if (emp.photo_url) {
        avatar = '<img src="' + UI.esc(emp.photo_url) + '" alt="" '
          + 'style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#f3f4f6;">';
      } else {
        avatar = '<div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">'
          + (emp.name || '?').charAt(0).toUpperCase() + '</div>';
      }
      html += '<div onclick="if(typeof TeamPage!==\'undefined\')TeamPage.showDetail(\'' + UI.esc(emp.id) + '\')" '
        + 'title="View crew profile" '
        + 'style="padding:10px 12px;display:flex;align-items:center;gap:8px;border-right:1px solid #f0f0f0;cursor:pointer;">'
        + avatar
        + '<div style="min-width:0;"><div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--accent);">' + UI.esc(emp.name || '') + '</div></div>'
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
        // v745: track per-day rollup. Only days with hours OR entries count.
        if (dayHours > 0 || entries.length > 0) {
          workingDaysCount++;
          if (dayApproved && !editedAfterApproval) daysApprovedCount++;
        }

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

      // Weekly total (v745: derived approval — week tile shows ✓ if the
      // week is explicitly approved OR every working day is approved.
      // Partial day approvals show ✓ N/M).
      var overtime = Math.max(0, weekTotal - 40);
      var allDaysOk = workingDaysCount > 0 && daysApprovedCount === workingDaysCount;
      var weekApproved = weekExplicit || allDaysOk;
      var partialBadge = (!weekApproved && daysApprovedCount > 0)
        ? '<div style="font-size:9px;color:#16a34a;">✓ ' + daysApprovedCount + '/' + workingDaysCount + '</div>'
        : '';
      html += '<div style="padding:10px 6px;text-align:center;font-weight:800;font-size:15px;background:' + (weekApproved ? '#f0fdf4' : 'var(--bg)') + ';border-left:2px solid var(--border);">'
        + weekTotal.toFixed(1)
        + (overtime > 0 ? '<div style="font-size:10px;color:#ef4444;font-weight:600;">' + overtime.toFixed(1) + ' OT</div>' : '')
        + (weekApproved ? '<div style="font-size:9px;color:#22c55e;">✓</div>' : partialBadge)
        + (weekIssues > 0 ? '<div style="font-size:9px;color:#ef4444;">' + weekIssues + ' issues</div>' : '')
        + '</div>';

      html += '</div>'; // end employee row
    });

    html += '</div>'; // end grid

    // ── Weekly Review Panel ──
    html += PayrollPage._renderWeeklyReview(dates, employees, weekStart);

    // ── Earnings Ledger (v1082) — earned vs paid per member ──
    html += '<div id="pay-ledger" style="margin-top:20px;"><div style="font-size:12px;color:var(--text-light);">Loading earnings ledger…</div></div>';
    setTimeout(PayrollPage._loadLedger, 0);

    // v383: My Pay (employeecenter) folded under Payroll. Link at bottom for now;
    // will pull out to its own page once Crew View ships and crew-vs-admin nav splits.
    html += '<div style="margin-top:24px;padding:14px 16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;">'
      +   '<div><strong style="font-size:13px;">My Pay & Hours</strong><div style="font-size:11px;color:var(--text-light);margin-top:2px;">Personal view: paystubs, hours worked, time off.</div></div>'
      +   '<button onclick="loadPage(\'employeecenter\')" class="btn btn-outline" style="font-size:12px;">Open My Pay &rarr;</button>'
      + '</div>';

    html += '</div>';
    return html;
  },

  // v1089: phone layout — one card per crew member, days stacked vertically.
  // Reuses the exact same data + approval logic as the desktop grid.
  _mobileEmpCard: function(emp, dates, approvals, today, weekStart) {
    var self = PayrollPage;
    var dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var empKey = self._approvalKey(emp.name || emp.id, weekStart);
    var weekExplicit = approvals[empKey] === 'approved';
    var weekTotal = 0, weekIssues = 0, workingDaysCount = 0, daysApprovedCount = 0;
    var rows = '';
    dates.forEach(function(date, i) {
      var entries = self._getEntriesForDate(emp.name || emp.id, date);
      var dayHours = self._totalHours(entries);
      weekTotal += dayHours;
      var issues = self._hasIssues(entries, date);
      if (issues.length) weekIssues++;
      var cellKey = (emp.name || emp.id) + '_' + date;
      var expanded = self._expandedCells[cellKey];
      var dayKey = self._dayApprovalKey(emp.name || emp.id, date);
      var dayApproved = approvals[dayKey] === 'approved';
      var editedAfterApproval = dayApproved && approvals[dayKey + '_editedAfter'];
      var barColor = issues.length > 0 ? '#ef4444' : (dayHours > 0 ? '#22c55e' : '#e5e7eb');
      if (editedAfterApproval) barColor = '#f59e0b';
      if (dayHours > 0 || entries.length > 0) {
        workingDaysCount++;
        if (dayApproved && !editedAfterApproval) daysApprovedCount++;
      }
      var isToday = date === today;
      rows += '<div onclick="PayrollPage._toggleCell(\'' + cellKey + '\')" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid #f4f4f4;cursor:pointer;' + (isToday ? 'background:#f0fdf4;' : '') + '">'
        + '<div style="width:52px;font-size:12px;font-weight:700;color:var(--text-light);">' + dayNames[i] + ' ' + new Date(date).getDate() + '</div>'
        + '<div style="width:6px;align-self:stretch;border-radius:3px;background:' + barColor + ';"></div>'
        + '<div style="flex:1;font-size:14px;font-weight:' + (dayHours > 0 ? '700' : '400') + ';color:' + (dayHours > 0 ? 'var(--text)' : '#bbb') + ';">' + (dayHours > 0 ? dayHours.toFixed(1) + ' h' : '—') + '</div>'
        + (entries.some(function(e) { return e.notes; }) ? '<span style="font-size:11px;">📝</span>' : '')
        + (dayApproved && !editedAfterApproval ? '<span style="font-size:11px;color:#22c55e;">✓</span>' : '')
        + (editedAfterApproval ? '<span style="font-size:11px;color:#f59e0b;">⚠</span>' : '')
        + '<span style="color:#ccc;font-size:12px;">' + (expanded ? '▾' : '▸') + '</span>'
        + '</div>';
      if (expanded) {
        rows += '<div style="padding:4px 12px 10px 68px;font-size:12px;" onclick="event.stopPropagation()">';
        issues.forEach(function(iss) { rows += '<div style="color:#ef4444;font-size:11px;">⚠ ' + iss + '</div>'; });
        entries.forEach(function(e) {
          rows += '<div style="color:var(--text-light);margin-top:2px;">'
            + (e.clockIn ? new Date(e.clockIn).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '') + (e.clockOut ? '–' + new Date(e.clockOut).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '') + ' ' + (e.hours ? e.hours.toFixed(1) + 'h' : '')
            + '</div>';
          if (e.notes) rows += '<div style="color:var(--text-light);font-style:italic;">' + UI.esc(e.notes) + '</div>';
        });
        rows += '<button onclick="event.stopPropagation();PayrollPage.showDayDetail(\'' + UI.esc(emp.name || emp.id) + '\',\'' + date + '\')" style="margin-top:6px;font-size:12px;background:var(--accent);color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;">Details</button>';
        if (dayApproved && !editedAfterApproval) rows += '<div style="font-size:10px;color:#22c55e;margin-top:3px;">✓ Approved</div>';
        if (editedAfterApproval) rows += '<div style="font-size:10px;color:#f59e0b;margin-top:3px;">⚠ Re-approval needed</div>';
        rows += '</div>';
      }
    });
    var overtime = Math.max(0, weekTotal - 40);
    var allDaysOk = workingDaysCount > 0 && daysApprovedCount === workingDaysCount;
    var weekApproved = weekExplicit || allDaysOk;
    var avatar = emp.photo_url
      ? '<img src="' + UI.esc(emp.photo_url) + '" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;background:#f3f4f6;">'
      : '<div style="width:32px;height:32px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">' + (emp.name || '?').charAt(0).toUpperCase() + '</div>';
    return '<div style="border-bottom:8px solid var(--bg);">'
      + '<div onclick="if(typeof TeamPage!==\'undefined\')TeamPage.showDetail(\'' + UI.esc(emp.id) + '\')" style="display:flex;align-items:center;gap:10px;padding:12px;background:' + (weekApproved ? '#f0fdf4' : 'var(--bg)') + ';cursor:pointer;">'
      + avatar
      + '<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(emp.name || '') + '</div>'
      + (weekIssues > 0 ? '<div style="font-size:11px;color:#ef4444;">' + weekIssues + ' issue' + (weekIssues > 1 ? 's' : '') + '</div>' : '')
      + '</div>'
      + '<div style="text-align:right;"><div style="font-weight:800;font-size:17px;">' + weekTotal.toFixed(1) + '<span style="font-size:11px;font-weight:600;color:var(--text-light);"> h</span></div>'
      + (overtime > 0 ? '<div style="font-size:10px;color:#ef4444;font-weight:600;">' + overtime.toFixed(1) + ' OT</div>' : '')
      + (weekApproved ? '<div style="font-size:10px;color:#22c55e;">✓ approved</div>' : (daysApprovedCount > 0 ? '<div style="font-size:10px;color:#16a34a;">✓ ' + daysApprovedCount + '/' + workingDaysCount + '</div>' : ''))
      + '</div></div>'
      + rows
      + '</div>';
  },

  // ── Weekly Review Panel ──
  _renderWeeklyReview: function(dates, employees, weekStart) {
    var approvals = PayrollPage._getApprovals();
    var totalHours = 0, totalOT = 0, totalPTO = 0;
    var warnings = [];
    var approved = 0, pending = 0;

    employees.forEach(function(emp) {
      var empWeek = 0;
      var workingDays = 0;
      var daysApproved = 0;
      dates.forEach(function(d) {
        var entries = PayrollPage._getEntriesForDate(emp.name || emp.id, d);
        var dayHrs = PayrollPage._totalHours(entries);
        empWeek += dayHrs;
        var issues = PayrollPage._hasIssues(entries, d);
        issues.forEach(function(iss) { warnings.push(emp.name + ' (' + d + '): ' + iss); });
        // v745: track per-day approvals so they can roll up to the week.
        // A day "needs approval" only if it has hours OR notes; days with
        // nothing don't count against the rollup.
        if (dayHrs > 0 || entries.length > 0) {
          workingDays++;
          var dayKey = PayrollPage._dayApprovalKey(emp.name || emp.id, d);
          if (approvals[dayKey] === 'approved' && !approvals[dayKey + '_editedAfter']) daysApproved++;
        }
      });
      totalHours += empWeek;
      var ot = Math.max(0, empWeek - 40);
      totalOT += ot;

      // Roll up: employee is "approved" if their week is explicitly approved
      // OR every one of their working days is individually approved.
      var empKey = PayrollPage._approvalKey(emp.name || emp.id, weekStart);
      var weekExplicit = approvals[empKey] === 'approved';
      var allDaysApproved = workingDays > 0 && daysApproved === workingDays;
      if (weekExplicit || allDaysApproved) approved++;
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
      + (payrollReady ? 'All hours approved, no warnings. Open the Payroll Summary to review hours and run payroll.' : (pending > 0 ? pending + ' employee(s) pending approval. ' : '') + (warnings.length > 0 ? warnings.length + ' warning(s) to resolve.' : ''))
      + '</div></div>'
      + (payrollReady ? '<button onclick="PayrollPage.showPayrollSummary(\'' + weekStart + '\')" class="btn btn-primary" style="margin-left:auto;white-space:nowrap;">💰 Run Payroll</button>' : '')
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

  // ── Approvals (cloud-synced v743) ──
  approveDay: function(userId, date) {
    var dayKey = PayrollPage._dayApprovalKey(userId, date);
    PayrollPage._getApprovals();
    PayrollPage._approvals[dayKey] = 'approved';
    delete PayrollPage._approvals[dayKey + '_editedAfter'];
    PayrollPage._saveApprovals();
    // Derive week_start for cloud row
    var d = new Date(date);
    var monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    var weekStart = monday.toISOString().substring(0, 10);
    PayrollPage._pushCloudApproval(userId, weekStart, date, 'approved', false);
    UI.closeModal();
    UI.toast('Day approved ✓');
    loadPage('payroll');
  },

  approveEmployee: function(userId, weekStart) {
    var empKey = PayrollPage._approvalKey(userId, weekStart);
    PayrollPage._getApprovals();
    PayrollPage._approvals[empKey] = 'approved';
    PayrollPage._saveApprovals();
    PayrollPage._pushCloudApproval(userId, weekStart, null, 'approved', false);
    UI.toast(userId + ' approved for the week ✓');
    loadPage('payroll');
  },

  approveAll: function(weekStart) {
    var employees = PayrollPage._getEmployees();
    PayrollPage._getApprovals();
    employees.forEach(function(emp) {
      var name = emp.name || emp.id;
      var empKey = PayrollPage._approvalKey(name, weekStart);
      PayrollPage._approvals[empKey] = 'approved';
      PayrollPage._pushCloudApproval(name, weekStart, null, 'approved', false);
    });
    PayrollPage._saveApprovals();
    UI.toast('All employees approved ✓');
    loadPage('payroll');
  },

  // ── Payroll Summary Modal ──
  // v743: rates are editable inline (✏️ next to each rate); export
  // generates an ACH-ready CSV (employee name, hours, gross, blank
  // routing/account for the bank's batch importer to fill); "Mark Paid"
  // records the run in payroll_runs.
  showPayrollSummary: function(weekStart) {
    var dates = PayrollPage._getWeekDates(PayrollPage._weekOffset);
    var employees = PayrollPage._getEmployees();
    var html = '<table class="data-table" style="width:100%;font-size:13px;"><thead><tr><th>Employee</th><th>Regular</th><th>OT</th><th>Total Hrs</th><th>Rate</th><th>Gross Pay</th><th>Status</th></tr></thead><tbody>';

    var grandTotal = 0;
    var totalHours = 0;
    var totalOT = 0;
    employees.forEach(function(emp) {
      var weekHours = 0;
      dates.forEach(function(d) {
        weekHours += PayrollPage._totalHours(PayrollPage._getEntriesForDate(emp.name || emp.id, d));
      });
      var regular = Math.min(weekHours, 40);
      var ot = Math.max(0, weekHours - 40);
      var rate = Number(emp.rate || emp.payRate || 0);
      var gross = (regular * rate) + (ot * rate * 1.5);
      grandTotal += gross;
      totalHours += weekHours;
      totalOT += ot;
      // v745: same rollup as the Payroll grid — week tile shows ✓ if
      // explicit week-approval OR every working day is individually approved.
      var apx = PayrollPage._getApprovals();
      var empKey = PayrollPage._approvalKey(emp.name || emp.id, weekStart);
      var weekExp = apx[empKey] === 'approved';
      var wDays = 0, wDaysOk = 0;
      dates.forEach(function(d) {
        var ents = PayrollPage._getEntriesForDate(emp.name || emp.id, d);
        var dh = PayrollPage._totalHours(ents);
        if (dh > 0 || ents.length > 0) {
          wDays++;
          var dk = PayrollPage._dayApprovalKey(emp.name || emp.id, d);
          if (apx[dk] === 'approved' && !apx[dk + '_editedAfter']) wDaysOk++;
        }
      });
      var approved = weekExp || (wDays > 0 && wDays === wDaysOk);
      var partialNote = (!approved && wDaysOk > 0) ? ' <span style="color:var(--text-light);font-weight:400;">(' + wDaysOk + '/' + wDays + ')</span>' : '';

      html += '<tr>'
        + '<td style="font-weight:600;">' + UI.esc(emp.name || '') + '</td>'
        + '<td>' + regular.toFixed(1) + '</td>'
        + '<td style="color:' + (ot > 0 ? '#d97706' : 'var(--text)') + ';">' + ot.toFixed(1) + '</td>'
        + '<td style="font-weight:700;">' + weekHours.toFixed(1) + '</td>'
        + '<td>' + (rate ? '$' + rate.toFixed(2) + '/hr' : '<span style="color:var(--text-light);">— set —</span>')
        +   ' <button onclick="PayrollPage.editRate(\'' + UI.esc(emp.id) + '\')" style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--text-light);padding:0 4px;" title="Edit rate">✏️</button></td>'
        + '<td style="font-weight:700;">' + (rate ? '$' + gross.toFixed(2) : '—') + '</td>'
        + '<td>' + (approved ? '<span style="color:#22c55e;font-weight:600;">✓ Approved</span>' : '<span style="color:#d97706;">Pending' + partialNote + '</span>') + '</td>'
        + '</tr>';
    });

    html += '<tr style="font-weight:800;border-top:2px solid var(--border);background:var(--bg);">'
      + '<td>TOTAL</td><td>' + Math.min(totalHours, totalHours - totalOT + 40 * employees.length).toFixed(1) + '</td>'
      + '<td>' + totalOT.toFixed(1) + '</td><td>' + totalHours.toFixed(1) + '</td><td></td>'
      + '<td>$' + grandTotal.toFixed(2) + '</td><td></td></tr>';
    html += '</tbody></table>';

    html += '<div style="margin-top:10px;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--text-light);line-height:1.5;">'
      + '💡 <strong>To run payroll:</strong> enter each employee\'s <strong>Regular</strong> and <strong>OT</strong> hours above into your payroll provider (e.g. Gusto) — it calculates taxes and pays your team. '
      + 'The <strong>ACH-Ready CSV</strong> is a separate option: a bank batch file to pay employees directly <em>without</em> a payroll provider. <strong>Mark Paid</strong> records the run here once payment is sent.'
      + '</div>';

    // Last run banner if any payroll_run exists for this week
    html += '<div id="last-run-banner" style="margin-top:12px;"></div>';

    UI.showModal('Payroll Summary — Week of ' + new Date(weekStart).toLocaleDateString(), html, { wide: true,
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
        + ' <button class="btn btn-outline" onclick="PayrollPage.exportACH(\'' + weekStart + '\')">📥 ACH-Ready CSV</button>'
        + ' <button class="btn btn-primary" onclick="PayrollPage.markPaid(\'' + weekStart + '\')">💰 Mark Paid</button>'
    });

    // Async: show "last run" banner if this week was already paid
    PayrollPage._loadLastRunBanner(weekStart);
  },

  // v743: edit an employee's hourly rate. Lives in team_members.rate
  // (cloud-synced via DB.team). Also updates the local cache so the
  // modal re-renders with the new number.
  editRate: function(empId) {
    var emp = PayrollPage._getEmployees().find(function(e) { return e.id === empId; });
    if (!emp) { UI.toast('Employee not found', 'error'); return; }
    var cur = (emp.rate || emp.payRate || 0);
    var val = prompt('Hourly rate for ' + (emp.name || '') + ' ($/hr):', cur.toString());
    if (val === null) return;
    var n = parseFloat(val);
    if (isNaN(n) || n < 0) { UI.toast('Invalid rate', 'error'); return; }
    // Update team_members via DB.team if available, else localStorage.
    if (typeof DB !== 'undefined' && DB.team && DB.team.update) {
      DB.team.update(empId, { rate: n });
    } else {
      var members = [];
      try { members = JSON.parse(localStorage.getItem('bm-team') || '[]'); } catch(e){}
      var idx = members.findIndex(function(m) { return m.id === empId; });
      if (idx >= 0) { members[idx].rate = n; localStorage.setItem('bm-team', JSON.stringify(members)); }
    }
    UI.toast('Rate set: $' + n.toFixed(2) + '/hr');
    // Re-render summary modal with new rate
    UI.closeModal();
    setTimeout(function() { PayrollPage.showPayrollSummary(PayrollPage._getWeekDates(PayrollPage._weekOffset)[0]); }, 60);
  },

  // v743: ACH-ready CSV export. Bank-friendly column order: employee
  // name, gross pay, hours, OT hours, plus blank routing/account so
  // Doug can paste the bank's saved values OR the bank can map them
  // from the file's header row.
  exportACH: function(weekStart) {
    var dates = PayrollPage._getWeekDates(PayrollPage._weekOffset);
    var employees = PayrollPage._getEmployees();
    var rows = ['Employee Name,Routing Number,Account Number,Hours,Overtime Hours,Rate,Gross Pay,Pay Period Start,Pay Period End,Memo'];
    var weekEnd = dates[6];
    var grandTotal = 0;
    var employeeCount = 0;
    var totalHours = 0;
    var totalOT = 0;
    var batch = [];
    employees.forEach(function(emp) {
      var weekHours = 0;
      dates.forEach(function(d) {
        weekHours += PayrollPage._totalHours(PayrollPage._getEntriesForDate(emp.name || emp.id, d));
      });
      if (weekHours <= 0) return;
      var ot = Math.max(0, weekHours - 40);
      var reg = Math.min(weekHours, 40);
      var rate = Number(emp.rate || emp.payRate || 0);
      var gross = (reg * rate) + (ot * rate * 1.5);
      grandTotal += gross;
      employeeCount++;
      totalHours += weekHours;
      totalOT += ot;
      var memo = 'BM Payroll ' + weekStart + ' to ' + weekEnd;
      // Escape commas inside name
      var csvName = (emp.name || '').indexOf(',') >= 0 ? '"' + emp.name.replace(/"/g, '""') + '"' : (emp.name || '');
      rows.push([csvName, '', '', weekHours.toFixed(2), ot.toFixed(2), rate.toFixed(2), gross.toFixed(2), weekStart, weekEnd, memo].join(','));
      batch.push({ name: emp.name, hours: weekHours, ot: ot, rate: rate, gross: gross });
    });
    if (!employeeCount) { UI.toast('No hours to export', 'error'); return; }

    var blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'payroll-ach-' + weekStart + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);

    // Record the export as a payroll_run with status='exported'
    PayrollPage._recordRun(weekStart, weekEnd, batch, {
      totalHours: totalHours, totalOT: totalOT, totalGross: grandTotal,
      employeeCount: employeeCount, method: 'ach_csv', status: 'exported'
    });
    UI.toast('ACH CSV exported — $' + grandTotal.toFixed(2) + ' across ' + employeeCount + ' employee(s)');
  },

  // v743: Mark Paid records a payroll_run row. Doug confirms before
  // committing because reversing a paid run is manual.
  markPaid: function(weekStart) {
    var dates = PayrollPage._getWeekDates(PayrollPage._weekOffset);
    var employees = PayrollPage._getEmployees();
    var weekEnd = dates[6];
    var totalHours = 0, totalOT = 0, totalGross = 0, employeeCount = 0;
    var batch = [];
    employees.forEach(function(emp) {
      var weekHours = 0;
      dates.forEach(function(d) {
        weekHours += PayrollPage._totalHours(PayrollPage._getEntriesForDate(emp.name || emp.id, d));
      });
      if (weekHours <= 0) return;
      var ot = Math.max(0, weekHours - 40);
      var reg = Math.min(weekHours, 40);
      var rate = Number(emp.rate || emp.payRate || 0);
      var gross = (reg * rate) + (ot * rate * 1.5);
      employeeCount++;
      totalHours += weekHours;
      totalOT += ot;
      totalGross += gross;
      batch.push({ name: emp.name, hours: weekHours, ot: ot, rate: rate, gross: gross });
    });
    if (!employeeCount) { UI.toast('No hours to pay', 'error'); return; }

    if (!confirm('Mark week of ' + weekStart + ' as PAID?\n\n'
      + employeeCount + ' employee(s) · ' + totalHours.toFixed(1) + ' hrs · $' + totalGross.toFixed(2)
      + '\n\nThis records a payroll run. Reverse only if needed.')) return;

    PayrollPage._recordRun(weekStart, weekEnd, batch, {
      totalHours: totalHours, totalOT: totalOT, totalGross: totalGross,
      employeeCount: employeeCount, method: 'manual', status: 'paid'
    });
    UI.toast('Marked paid: $' + totalGross.toFixed(2));
    UI.closeModal();
  },

  _recordRun: function(weekStart, weekEnd, batch, meta) {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    var tenantId = (typeof window !== 'undefined' && window.resolveTenantId) ? window.resolveTenantId() : null;
    if (!sb || !tenantId) {
      // Fallback: localStorage cache only
      try {
        var local = JSON.parse(localStorage.getItem('bm-payroll-runs') || '[]');
        local.unshift({ weekStart: weekStart, weekEnd: weekEnd, batch: batch, meta: meta, at: new Date().toISOString() });
        localStorage.setItem('bm-payroll-runs', JSON.stringify(local.slice(0, 60)));
      } catch(e){}
      return;
    }
    var paidBy = (typeof Auth !== 'undefined' && Auth.user && Auth.user.name) ? Auth.user.name : null;
    var row = {
      tenant_id: tenantId,
      week_start: weekStart,
      week_end: weekEnd,
      status: meta.status,
      total_hours: meta.totalHours,
      total_ot: meta.totalOT,
      total_gross: meta.totalGross,
      employee_count: meta.employeeCount,
      method: meta.method,
      batch_payload: batch,
      paid_by: paidBy
    };
    if (meta.status === 'paid') row.paid_at = new Date().toISOString();
    if (meta.status === 'exported') row.exported_at = new Date().toISOString();
    sb.from('payroll_runs').insert(row).then(function(r) {
      if (r.error) console.warn('payroll_runs insert failed:', r.error.message);
    });
  },

  _loadLastRunBanner: function(weekStart) {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) return;
    sb.from('payroll_runs').select('*').eq('week_start', weekStart).order('created_at', { ascending: false }).limit(1).maybeSingle().then(function(r) {
      var el = document.getElementById('last-run-banner');
      if (!el || !r.data) return;
      var run = r.data;
      var label = run.status === 'paid' ? '💰 Marked paid' : '📥 Exported';
      var when = new Date(run.paid_at || run.exported_at || run.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
      el.innerHTML = '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 14px;font-size:12px;">'
        + label + ' ' + when + ' · $' + Number(run.total_gross || 0).toFixed(2)
        + ' across ' + (run.employee_count || 0) + ' employee(s) via ' + UI.esc(run.method || '?')
        + '</div>';
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

  // v743: triggerGusto kept as a thin shim so anything still wired to
  // the old button just opens the new Payroll Summary modal. Delete
  // once nothing in the codebase calls it.
  triggerGusto: function(weekStart) {
    PayrollPage.showPayrollSummary(weekStart);
  },

  // ── EARNINGS LEDGER (v1082) ─────────────────────────────
  // Server fn earnings-sync builds earned rows from time_entries nightly;
  // payments/adjustments are recorded here. Balance = earned − paid.
  // Until payments are recorded, balances are "earned on record", NOT owed —
  // the Settle-up button zeroes history so accrual starts clean.
  _ledgerRows: null,
  _loadLedger: function() {
    var el = document.getElementById('pay-ledger');
    if (!el || typeof SupabaseDB === 'undefined' || !SupabaseDB.client) return;
    SupabaseDB.client.from('earnings_ledger')
      .select('member_name, kind, amount, entry_date')
      .then(function(res) {
        if (!document.getElementById('pay-ledger')) return;
        if (res.error) {
          document.getElementById('pay-ledger').innerHTML =
            '<div style="font-size:12px;color:var(--red);">Ledger unavailable: ' + UI.esc(res.error.message) + '</div>';
          return;
        }
        PayrollPage._ledgerRows = res.data || [];
        PayrollPage._renderLedger();
      });
  },
  _renderLedger: function() {
    var el = document.getElementById('pay-ledger');
    if (!el) return;
    var rows = PayrollPage._ledgerRows || [];
    var agg = {};
    rows.forEach(function(r) {
      var a = agg[r.member_name] = agg[r.member_name] || { earned: 0, paid: 0, adj: 0 };
      var amt = +r.amount || 0;
      if (r.kind === 'earned') a.earned += amt;
      else if (r.kind === 'payment') a.paid += -amt;
      else a.adj += amt;
    });
    var names = Object.keys(agg).sort();
    var anyPayments = rows.some(function(r) { return r.kind === 'payment'; });
    var fmt = function(n) { return '$' + (+n).toLocaleString('en-US', { minimumFractionDigits: 2 }); };
    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px;">'
      + '<strong style="font-size:14px;">💰 Earnings ledger</strong>'
      + '<span style="font-size:11px;color:var(--text-light);">earned from logged hours · payments count once recorded</span></div>';
    if (!anyPayments) {
      html += '<div style="font-size:12px;background:#fff8e6;border:1px solid #f0d97a;border-radius:8px;padding:8px 10px;margin-bottom:10px;">'
        + '⚠️ No payments recorded yet, so these are <b>earned-on-record totals since Jan 2024</b>, not amounts owed. '
        + 'Tap <b>Settle up</b> on anyone you\'re square with — the ledger starts counting fresh from today.</div>';
    }
    html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:430px;">'
      + '<tr style="text-align:left;color:var(--text-light);font-size:11px;"><th style="padding:6px 8px;">Member</th><th style="padding:6px 8px;text-align:right;">Earned</th><th style="padding:6px 8px;text-align:right;">Paid</th><th style="padding:6px 8px;text-align:right;">Balance</th><th style="padding:6px 8px;"></th></tr>';
    names.forEach(function(n) {
      var a = agg[n];
      var bal = Math.round((a.earned + a.adj - a.paid) * 100) / 100;
      var esc = n.replace(/'/g, "\\'");
      html += '<tr style="border-top:1px solid var(--border);">'
        + '<td style="padding:8px;font-weight:600;">' + UI.esc(n) + '</td>'
        + '<td style="padding:8px;text-align:right;">' + fmt(a.earned + a.adj) + '</td>'
        + '<td style="padding:8px;text-align:right;">' + fmt(a.paid) + '</td>'
        + '<td style="padding:8px;text-align:right;font-weight:700;color:' + (bal > 0.009 ? 'var(--red)' : 'var(--green-dark)') + ';">' + fmt(bal) + '</td>'
        + '<td style="padding:8px;white-space:nowrap;">'
        + '<button onclick="PayrollPage.recordPayment(\'' + esc + '\')" class="btn btn-outline" style="font-size:11px;padding:4px 8px;">Record payment</button> '
        + (bal > 0.009 ? '<button onclick="PayrollPage.settleUp(\'' + esc + '\',' + bal + ')" class="btn btn-outline" style="font-size:11px;padding:4px 8px;">Settle up</button>' : '')
        + '</td></tr>';
    });
    html += '</table></div></div>';
    el.innerHTML = html;
  },
  _insertLedgerRow: function(row, doneMsg) {
    row.tenant_id = DB.getTenantId();
    row.source = 'manual';
    row.source_key = 'man-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    SupabaseDB.client.from('earnings_ledger').insert(row).then(function(res) {
      if (res.error) { UI.toast('Save failed: ' + res.error.message, 'error'); return; }
      UI.toast(doneMsg);
      PayrollPage._loadLedger();
    });
  },
  recordPayment: function(name) {
    var amt = parseFloat(prompt('Amount paid to ' + name + ' (e.g. 600):') || '');
    if (!amt || amt <= 0) return;
    var note = prompt('Note (how/when — e.g. "Zelle 8/4"):') || '';
    PayrollPage._insertLedgerRow({
      member_name: name, entry_date: new Date().toISOString().slice(0, 10),
      kind: 'payment', amount: -Math.abs(amt), notes: note.slice(0, 200) || null
    }, 'Payment recorded — ' + name);
  },
  settleUp: function(name, bal) {
    if (!confirm('Mark ' + name + ' as fully settled through today? Records a payment of $' + bal.toFixed(2) + ' so the ledger starts fresh. (Does not move any money.)')) return;
    PayrollPage._insertLedgerRow({
      member_name: name, entry_date: new Date().toISOString().slice(0, 10),
      kind: 'payment', amount: -Math.abs(bal), notes: 'Settled up through today (opening-balance zero-out)'
    }, name + ' marked settled');
  }
};
