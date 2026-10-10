/**
 * Branch Manager — Crew Performance
 * Per-crew-member analytics, leaderboard, trends, and team overview.
 * Goes beyond the industry with revenue-per-hour, utilization, and rating breakdowns.
 */
var CrewPerformance = {

  _dateRange: 'month',

  render: function() {
    var self = CrewPerformance;
    var team = JSON.parse(localStorage.getItem('bm-team') || '[]').filter(function(m) { return m.status === 'active'; });
    var allJobs = DB.jobs.getAll();
    var allEntries = JSON.parse(localStorage.getItem('bm-time-entries') || '[]');

    var html = '';

    // ── Hero header ──
    html += '<div style="background:linear-gradient(135deg, var(--green-dark), #1a5c2a);color:#fff;border-radius:12px;padding:28px 24px;margin-bottom:20px;">'
      + '<h2 style="font-size:24px;font-weight:800;margin-bottom:4px;">Crew Performance</h2>'
      + '<div style="opacity:.8;font-size:14px;">Track productivity, revenue, and ratings for every team member</div>'
      + '</div>';

    // ── Date range filter ──
    html += '<div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap;">';
    var ranges = [
      { key: 'week', label: 'This Week' },
      { key: 'month', label: 'This Month' },
      { key: 'quarter', label: 'This Quarter' },
      { key: 'year', label: 'This Year' },
      { key: 'all', label: 'All Time' }
    ];
    ranges.forEach(function(r) {
      var active = self._dateRange === r.key;
      html += '<button onclick="CrewPerformance._dateRange=\'' + r.key + '\';loadPage(\'crewperformance\');" '
        + 'style="padding:8px 16px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;border:'
        + (active ? 'none;background:var(--green-dark);color:#fff;' : '1px solid var(--border);background:var(--white);color:var(--text);')
        + '">' + r.label + '</button>';
    });
    html += '</div>';

    // ── Gather stats for all crew ──
    var crewStats = [];
    team.forEach(function(member) {
      var stats = self._getCrewStats(member.id, self._dateRange, allJobs, allEntries, member.name);
      stats.member = member;
      crewStats.push(stats);
    });
    // Sort by revenue descending
    crewStats.sort(function(a, b) { return b.revenue - a.revenue; });

    // ── Team Overview Stats ──
    var totalTeamRev = crewStats.reduce(function(s, c) { return s + c.revenue; }, 0);
    var totalTeamJobs = crewStats.reduce(function(s, c) { return s + c.jobsCompleted; }, 0);
    var totalTeamHours = crewStats.reduce(function(s, c) { return s + c.hoursWorked; }, 0);
    var avgRating = 0;
    var ratedCount = 0;
    crewStats.forEach(function(c) {
      if (c.avgRating > 0) { avgRating += c.avgRating; ratedCount++; }
    });
    avgRating = ratedCount > 0 ? (avgRating / ratedCount) : 0;

    // Available hours: assume 8 hrs/day, 5 days/week
    var dateInfo = self._getDateBounds(self._dateRange);
    var workDays = self._countWorkDays(dateInfo.start, dateInfo.end);
    var availableHours = workDays * 8 * team.length;
    var utilization = availableHours > 0 ? Math.round((totalTeamHours / availableHours) * 100) : 0;

    var topPerformer = crewStats.length > 0 ? crewStats[0].member.name : '—';

    html += '<div class="stat-grid">'
      + UI.statCard('Team Revenue', UI.moneyInt(totalTeamRev), totalTeamJobs + ' jobs completed', '', '')
      + UI.statCard('Avg Rating', avgRating > 0 ? avgRating.toFixed(1) + ' ★' : 'No ratings', ratedCount + ' rated crew', '', '')
      + UI.statCard('Utilization', utilization + '%', totalTeamHours.toFixed(0) + ' of ' + availableHours + ' hrs', '', '')
      + UI.statCard('Top Performer', topPerformer, crewStats.length > 0 ? UI.moneyInt(crewStats[0].revenue) + ' revenue' : '', '', '')
      + '</div>';

    // ── Leaderboard header + export button ──
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'
      + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-light);">Crew Leaderboard</div>'
      + '<button onclick="CrewPerformance.exportReport()" style="padding:7px 14px;border-radius:8px;border:1px solid var(--border);background:var(--white);font-size:12px;font-weight:600;cursor:pointer;color:var(--text);">📥 Export Report</button>'
      + '</div>';

    if (crewStats.length === 0) {
      html += UI.emptyState('👷', 'No Team Members', 'Add crew members in the Team page to see performance stats.', 'Go to Team', "loadPage('team')");
    } else {
      crewStats.forEach(function(cs, idx) {
        var rank = idx + 1;
        var medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
        var medalBg = idx < 3 ? medalColors[idx] : '#e0e0e0';
        var revPerHr = cs.hoursWorked > 0 ? (cs.revenue / cs.hoursWorked) : 0;
        var roleLabel = cs.member.role || 'Crew';

        html += '<div onclick="CrewPerformance._showDetail(\'' + cs.member.id + '\')" '
          + 'style="background:var(--white);border-radius:12px;padding:16px 20px;border:1px solid var(--border);margin-bottom:10px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.04);'
          + 'transition:box-shadow .15s;position:relative;overflow:hidden;" '
          + 'onmouseover="this.style.boxShadow=\'0 4px 12px rgba(0,0,0,.08)\';" '
          + 'onmouseout="this.style.boxShadow=\'none\';">';

        // Rank badge + Name row
        html += '<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">'
          + '<div style="width:40px;height:40px;border-radius:50%;background:' + medalBg + ';display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff;'
          + (idx < 3 ? 'box-shadow:0 2px 8px ' + medalBg + '66;' : 'color:#999;') + '">' + rank + '</div>'
          + '<div style="flex:1;">'
          + '<div style="font-size:16px;font-weight:700;">' + UI.esc(cs.member.name) + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);">' + UI.esc(roleLabel) + '</div>'
          + '</div>';

        // Top performer badge
        if (idx === 0 && cs.revenue > 0) {
          html += '<div style="background:linear-gradient(135deg,#FFD700,#FFA000);color:#fff;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;">TOP PERFORMER</div>';
        }
        html += '</div>';

        // Stats grid
        html += '<div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-bottom:14px;">';

        // Jobs completed
        html += '<div style="text-align:center;padding:10px 6px;background:#f8fdf8;border-radius:8px;">'
          + '<div style="font-size:20px;font-weight:800;color:var(--green-dark);">' + cs.jobsCompleted + '</div>'
          + '<div style="font-size:10px;color:var(--text-light);margin-top:2px;">Jobs Done</div>'
          + '</div>';

        // Revenue
        html += '<div style="text-align:center;padding:10px 6px;background:#f8fdf8;border-radius:8px;">'
          + '<div style="font-size:20px;font-weight:800;color:var(--green-dark);">' + UI.moneyInt(cs.revenue) + '</div>'
          + '<div style="font-size:10px;color:var(--text-light);margin-top:2px;">Revenue</div>'
          + '</div>';

        // Avg Rating
        html += '<div style="text-align:center;padding:10px 6px;background:#f8fdf8;border-radius:8px;">'
          + '<div style="font-size:20px;font-weight:800;color:' + (cs.avgRating >= 4 ? 'var(--green-dark)' : cs.avgRating >= 3 ? '#ff9800' : cs.avgRating > 0 ? 'var(--red)' : 'var(--text-light)') + ';">'
          + (cs.avgRating > 0 ? cs.avgRating.toFixed(1) + '★' : '—') + '</div>'
          + '<div style="font-size:10px;color:var(--text-light);margin-top:2px;">Avg Rating</div>'
          + '</div>';

        html += '</div>';

        // Bottom stats row
        html += '<div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;">';

        // Hours worked
        html += '<div style="text-align:center;padding:10px 6px;background:#f5f5f5;border-radius:8px;">'
          + '<div style="font-size:16px;font-weight:700;">' + cs.hoursWorked.toFixed(1) + '</div>'
          + '<div style="font-size:10px;color:var(--text-light);margin-top:2px;">Hours</div>'
          + '</div>';

        // Rev per hour
        html += '<div style="text-align:center;padding:10px 6px;background:#f5f5f5;border-radius:8px;">'
          + '<div style="font-size:16px;font-weight:700;">' + UI.moneyInt(revPerHr) + '</div>'
          + '<div style="font-size:10px;color:var(--text-light);margin-top:2px;">Rev/Hour</div>'
          + '</div>';

        // On-time rate
        html += '<div style="text-align:center;padding:10px 6px;background:#f5f5f5;border-radius:8px;">'
          + '<div style="font-size:16px;font-weight:700;color:' + (cs.onTimeRate >= 90 ? 'var(--green-dark)' : cs.onTimeRate >= 70 ? '#ff9800' : 'var(--red)') + ';">'
          + cs.onTimeRate + '%</div>'
          + '<div style="font-size:10px;color:var(--text-light);margin-top:2px;">On-Time</div>'
          + '</div>';

        html += '</div>';

        // Progress bar — revenue contribution
        if (totalTeamRev > 0) {
          var pct = Math.round((cs.revenue / totalTeamRev) * 100);
          html += '<div style="margin-top:12px;">'
            + '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-light);margin-bottom:4px;">'
            + '<span>Revenue contribution</span><span style="font-weight:700;">' + pct + '%</span></div>'
            + '<div style="height:6px;background:#e8e8e8;border-radius:3px;overflow:hidden;">'
            + '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg, var(--green-dark), #4caf50);border-radius:3px;transition:width .3s;"></div>'
            + '</div></div>';
        }

        // Progress bar — monthly goal (if set)
        var memberGoal = parseFloat(localStorage.getItem('bm-crew-goal-' + cs.member.id) || '0');
        if (memberGoal > 0) {
          var goalPct = Math.min(Math.round((cs.revenue / memberGoal) * 100), 100);
          var goalColor = goalPct >= 100 ? 'var(--green-dark)' : goalPct >= 60 ? '#ff9800' : 'var(--red)';
          html += '<div style="margin-top:10px;">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text-light);margin-bottom:4px;">'
            + '<span>Revenue vs Goal</span>'
            + '<span style="font-weight:700;color:' + goalColor + ';">' + UI.moneyInt(cs.revenue) + ' / ' + UI.moneyInt(memberGoal) + ' (' + goalPct + '%)</span>'
            + '</div>'
            + '<div style="height:6px;background:#e8e8e8;border-radius:3px;overflow:hidden;">'
            + '<div style="height:100%;width:' + goalPct + '%;background:' + goalColor + ';border-radius:3px;transition:width .3s;"></div>'
            + '</div></div>';
        }

        // Set goal button (inline, subtle)
        html += '<div style="margin-top:10px;text-align:right;">'
          + '<button onclick="event.stopPropagation();CrewPerformance.setGoal(\'' + cs.member.id + '\')" '
          + 'style="background:none;border:none;font-size:11px;color:var(--text-light);cursor:pointer;padding:2px 4px;" '
          + 'title="Set monthly revenue goal">🎯 ' + (memberGoal > 0 ? 'Edit' : 'Set') + ' Goal</button>'
          + '</div>';

        html += '</div>';
      });
    }

    // ── Team Totals Footer ──
    if (crewStats.length > 0) {
      var teamAvgRating = ratedCount > 0 ? (avgRating).toFixed(1) : '—';
      html += '<div style="background:var(--white);border-radius:12px;padding:16px 20px;border:1px solid var(--border);margin-top:4px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
        + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-light);margin-bottom:12px;">Team Totals</div>'
        + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">'
        + '<div style="text-align:center;padding:10px 6px;background:#f8fdf8;border-radius:8px;">'
        + '<div style="font-size:20px;font-weight:800;color:var(--green-dark);">' + totalTeamHours.toFixed(1) + '</div>'
        + '<div style="font-size:10px;color:var(--text-light);margin-top:2px;">Total Hours</div></div>'
        + '<div style="text-align:center;padding:10px 6px;background:#f8fdf8;border-radius:8px;">'
        + '<div style="font-size:20px;font-weight:800;color:var(--green-dark);">' + UI.moneyInt(totalTeamRev) + '</div>'
        + '<div style="font-size:10px;color:var(--text-light);margin-top:2px;">Total Revenue</div></div>'
        + '<div style="text-align:center;padding:10px 6px;background:#f8fdf8;border-radius:8px;">'
        + '<div style="font-size:20px;font-weight:800;color:' + (parseFloat(teamAvgRating) >= 4 ? 'var(--green-dark)' : '#ff9800') + ';">' + (teamAvgRating !== '—' ? teamAvgRating + '★' : '—') + '</div>'
        + '<div style="font-size:10px;color:var(--text-light);margin-top:2px;">Team Avg Rating</div></div>'
        + '</div></div>';
    }

    return html;
  },

  // ── Calculate stats for one crew member ──
  _getCrewStats: function(memberId, range, allJobs, allEntries, memberName) {
    var self = CrewPerformance;
    var dateInfo = self._getDateBounds(range);
    var start = dateInfo.start;
    var end = dateInfo.end;

    // Filter jobs assigned to this member within date range
    var memberJobs = allJobs.filter(function(j) {
      if (!j.assignedTo) return false;
      var nameMatch = j.assignedTo.toLowerCase().indexOf(memberName.toLowerCase()) > -1;
      if (!nameMatch) return false;
      var jDate = new Date(j.completedDate || j.scheduledDate || j.createdAt);
      return jDate >= start && jDate <= end;
    });

    var completedJobs = memberJobs.filter(function(j) { return j.status === 'completed'; });
    var revenue = completedJobs.reduce(function(s, j) { return s + (j.total || 0); }, 0);

    // Ratings
    var ratings = [];
    completedJobs.forEach(function(j) {
      if (j.satisfaction && j.satisfaction.rating) {
        ratings.push(j.satisfaction.rating);
      }
    });
    var avgRating = ratings.length > 0 ? (ratings.reduce(function(s, r) { return s + r; }, 0) / ratings.length) : 0;

    // Rating breakdown
    var ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    ratings.forEach(function(r) {
      var rounded = Math.round(r);
      if (ratingBreakdown[rounded] !== undefined) {
        ratingBreakdown[rounded]++;
      }
    });

    // Hours from time entries
    var memberEntries = allEntries.filter(function(e) {
      var nameMatch = (e.employeeName || e.user || '').toLowerCase().indexOf(memberName.toLowerCase()) > -1;
      var idMatch = e.employeeId === memberId;
      if (!nameMatch && !idMatch) return false;
      var eDate = new Date(e.date || e.clockIn);
      return eDate >= start && eDate <= end;
    });
    var hoursWorked = memberEntries.reduce(function(s, e) {
      if (e.duration) return s + (e.duration / 3600000);
      if (e.clockIn && e.clockOut) {
        return s + ((new Date(e.clockOut) - new Date(e.clockIn)) / 3600000);
      }
      return s;
    }, 0);

    // On-time completion rate
    var onTimeCount = 0;
    var scheduledCount = 0;
    completedJobs.forEach(function(j) {
      if (j.scheduledDate && j.completedDate) {
        scheduledCount++;
        var sched = new Date(j.scheduledDate).setHours(23, 59, 59);
        var comp = new Date(j.completedDate);
        if (comp <= sched) onTimeCount++;
      }
    });
    var onTimeRate = scheduledCount > 0 ? Math.round((onTimeCount / scheduledCount) * 100) : 100;

    return {
      memberId: memberId,
      memberName: memberName,
      jobsCompleted: completedJobs.length,
      totalJobs: memberJobs.length,
      revenue: revenue,
      avgRating: avgRating,
      ratings: ratings,
      ratingBreakdown: ratingBreakdown,
      hoursWorked: hoursWorked,
      onTimeRate: onTimeRate,
      recentJobs: completedJobs.sort(function(a, b) {
        return new Date(b.completedDate || b.scheduledDate) - new Date(a.completedDate || a.scheduledDate);
      }).slice(0, 10)
    };
  },

  // ── Date range bounds ──
  _getDateBounds: function(range) {
    var now = new Date();
    var start, end;
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    if (range === 'week') {
      start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
    } else if (range === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (range === 'quarter') {
      var qMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), qMonth, 1);
    } else if (range === 'year') {
      start = new Date(now.getFullYear(), 0, 1);
    } else {
      start = new Date(2000, 0, 1);
    }

    return { start: start, end: end };
  },

  // ── Count work days between two dates ──
  _countWorkDays: function(start, end) {
    var count = 0;
    var cur = new Date(start);
    while (cur <= end) {
      var day = cur.getDay();
      if (day !== 0 && day !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  },

  // ── Show detail modal for a crew member ──
  _showDetail: function(memberId) {
    var self = CrewPerformance;
    var team = JSON.parse(localStorage.getItem('bm-team') || '[]');
    var member = null;
    for (var i = 0; i < team.length; i++) {
      if (team[i].id === memberId) { member = team[i]; break; }
    }
    if (!member) return;

    var allJobs = DB.jobs.getAll();
    var allEntries = JSON.parse(localStorage.getItem('bm-time-entries') || '[]');
    var stats = self._getCrewStats(memberId, self._dateRange, allJobs, allEntries, member.name);

    var html = '';

    // ── Profile header ──
    var initials = member.name.split(' ').map(function(w) { return w.charAt(0); }).join('').toUpperCase();
    html += '<div style="text-align:center;margin-bottom:20px;">'
      + '<div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg, var(--green-dark), #4caf50);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;margin-bottom:8px;">' + initials + '</div>'
      + '<h3 style="font-size:20px;font-weight:700;">' + UI.esc(member.name) + '</h3>'
      + '<div style="color:var(--text-light);font-size:13px;">' + UI.esc(member.role || 'Crew Member') + '</div>'
      + '</div>';

    // ── Key metrics ──
    var revPerHr = stats.hoursWorked > 0 ? (stats.revenue / stats.hoursWorked) : 0;
    html += '<div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-bottom:20px;">';

    var metrics = [
      { val: String(stats.jobsCompleted), label: 'Jobs Done', color: 'var(--green-dark)' },
      { val: UI.moneyInt(stats.revenue), label: 'Revenue', color: 'var(--green-dark)' },
      { val: stats.avgRating > 0 ? stats.avgRating.toFixed(1) + '★' : '—', label: 'Avg Rating', color: stats.avgRating >= 4 ? 'var(--green-dark)' : '#ff9800' },
      { val: stats.hoursWorked.toFixed(1), label: 'Hours', color: '#333' },
      { val: UI.moneyInt(revPerHr), label: 'Rev/Hour', color: '#1565c0' },
      { val: stats.onTimeRate + '%', label: 'On-Time', color: stats.onTimeRate >= 90 ? 'var(--green-dark)' : '#ff9800' }
    ];
    metrics.forEach(function(m) {
      html += '<div style="text-align:center;padding:12px 8px;background:#f8f9fa;border-radius:8px;">'
        + '<div style="font-size:22px;font-weight:800;color:' + m.color + ';">' + m.val + '</div>'
        + '<div style="font-size:10px;color:var(--text-light);margin-top:2px;">' + m.label + '</div>'
        + '</div>';
    });
    html += '</div>';

    // ── Monthly trend chart (div-based bar chart) ──
    html += '<div style="background:var(--white);border-radius:12px;padding:16px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-light);margin-bottom:12px;">Monthly Revenue Trend</div>';

    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var now = new Date();
    var monthlyData = [];
    var maxMonthRev = 0;
    for (var m = 0; m < 12; m++) {
      var monthRev = allJobs.filter(function(j) {
        if (j.status !== 'completed') return false;
        if (!j.assignedTo || j.assignedTo.toLowerCase().indexOf(member.name.toLowerCase()) === -1) return false;
        var d = new Date(j.completedDate || j.scheduledDate);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === m;
      }).reduce(function(s, j) { return s + (j.total || 0); }, 0);
      monthlyData.push(monthRev);
      if (monthRev > maxMonthRev) maxMonthRev = monthRev;
    }

    html += '<div style="display:flex;align-items:flex-end;gap:4px;height:120px;padding-bottom:20px;">';
    monthlyData.forEach(function(rev, idx) {
      var h = maxMonthRev > 0 ? Math.max((rev / maxMonthRev) * 100, rev > 0 ? 6 : 2) : 2;
      var isCurrent = idx === now.getMonth();
      html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;">'
        + (rev > 0 ? '<div style="font-size:8px;font-weight:700;color:var(--green-dark);margin-bottom:1px;">' + UI.moneyInt(rev) + '</div>' : '')
        + '<div style="width:100%;height:' + h + 'px;background:' + (isCurrent ? 'var(--green-dark)' : 'var(--green-light)') + ';border-radius:3px 3px 0 0;opacity:' + (rev > 0 ? '1' : '.15') + ';"></div>'
        + '<div style="font-size:8px;color:var(--text-light);margin-top:3px;' + (isCurrent ? 'font-weight:700;color:var(--green-dark);' : '') + '">' + monthNames[idx] + '</div>'
        + '</div>';
    });
    html += '</div></div>';

    // ── Rating breakdown ──
    html += '<div style="background:var(--white);border-radius:12px;padding:16px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-light);margin-bottom:12px;">Rating Breakdown</div>';

    if (stats.ratings.length === 0) {
      html += '<div style="text-align:center;color:var(--text-light);font-size:13px;padding:12px 0;">No ratings yet</div>';
    } else {
      var totalRatings = stats.ratings.length;
      for (var star = 5; star >= 1; star--) {
        var cnt = stats.ratingBreakdown[star] || 0;
        var barPct = totalRatings > 0 ? Math.round((cnt / totalRatings) * 100) : 0;
        var starStr = '';
        for (var s = 0; s < star; s++) starStr += '★';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
          + '<div style="width:60px;font-size:12px;color:#f5a623;text-align:right;">' + starStr + '</div>'
          + '<div style="flex:1;height:14px;background:#f0f0f0;border-radius:7px;overflow:hidden;">'
          + '<div style="height:100%;width:' + barPct + '%;background:linear-gradient(90deg,#f5a623,#ff8f00);border-radius:7px;transition:width .3s;"></div>'
          + '</div>'
          + '<div style="width:36px;font-size:12px;font-weight:600;color:var(--text-light);text-align:right;">' + cnt + '</div>'
          + '</div>';
      }
    }
    html += '</div>';

    // ── Skills / Certifications (editable tags) ──
    var savedSkills = JSON.parse(localStorage.getItem('bm-crew-skills-' + memberId) || '[]');
    html += '<div style="background:var(--white);border-radius:12px;padding:16px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-light);">Skills & Certifications</div>'
      + '<button onclick="CrewPerformance._addSkill(\'' + memberId + '\')" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;color:var(--green-dark);font-weight:600;">+ Add</button>'
      + '</div>'
      + '<div id="crew-skills-' + memberId + '" style="display:flex;flex-wrap:wrap;gap:6px;">';

    if (savedSkills.length === 0) {
      html += '<div style="color:var(--text-light);font-size:13px;">No skills added yet</div>';
    } else {
      savedSkills.forEach(function(skill, idx) {
        html += '<span style="display:inline-flex;align-items:center;gap:4px;padding:5px 12px;background:var(--green-bg);color:var(--green-dark);border-radius:20px;font-size:12px;font-weight:600;">'
          + UI.esc(skill)
          + '<span onclick="event.stopPropagation();CrewPerformance._removeSkill(\'' + memberId + '\',' + idx + ');" style="cursor:pointer;opacity:.6;font-size:14px;margin-left:2px;">&times;</span>'
          + '</span>';
      });
    }
    html += '</div></div>';

    // ── Recent jobs list ──
    html += '<div style="background:var(--white);border-radius:12px;padding:16px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-light);margin-bottom:12px;">Recent Jobs</div>';

    if (stats.recentJobs.length === 0) {
      html += '<div style="text-align:center;color:var(--text-light);font-size:13px;padding:12px 0;">No completed jobs</div>';
    } else {
      stats.recentJobs.forEach(function(j) {
        var rating = (j.satisfaction && j.satisfaction.rating) ? j.satisfaction.rating.toFixed(1) + '★' : '';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f5f5f5;">'
          + '<div>'
          + '<div style="font-size:14px;font-weight:600;">' + UI.esc(j.clientName || 'Unknown') + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);">' + (j.completedDate ? UI.dateShort(j.completedDate) : '—') + '</div>'
          + '</div>'
          + '<div style="text-align:right;">'
          + '<div style="font-size:14px;font-weight:700;color:var(--green-dark);">' + UI.money(j.total || 0) + '</div>'
          + (rating ? '<div style="font-size:12px;color:#f5a623;">' + rating + '</div>' : '')
          + '</div>'
          + '</div>';
      });
    }
    html += '</div>';

    UI.showModal(member.name + ' — Performance', html, { wide: true });
  },

  // ── Skills management ──
  _addSkill: function(memberId) {
    var skill = prompt('Enter skill or certification:');
    if (!skill || !skill.trim()) return;
    var skills = JSON.parse(localStorage.getItem('bm-crew-skills-' + memberId) || '[]');
    skills.push(skill.trim());
    localStorage.setItem('bm-crew-skills-' + memberId, JSON.stringify(skills));
    // Refresh modal
    UI.closeModal();
    CrewPerformance._showDetail(memberId);
  },

  _removeSkill: function(memberId, idx) {
    var skills = JSON.parse(localStorage.getItem('bm-crew-skills-' + memberId) || '[]');
    skills.splice(idx, 1);
    localStorage.setItem('bm-crew-skills-' + memberId, JSON.stringify(skills));
    UI.closeModal();
    CrewPerformance._showDetail(memberId);
  },

  // ── Set monthly revenue goal for a crew member ──
  setGoal: function(memberId) {
    var current = parseFloat(localStorage.getItem('bm-crew-goal-' + memberId) || '0');
    var goal = prompt('Monthly revenue goal for this crew member ($):', current || '');
    if (goal !== null && !isNaN(parseFloat(goal))) {
      localStorage.setItem('bm-crew-goal-' + memberId, parseFloat(goal));
      UI.toast('Goal set!');
      loadPage('crewperformance');
    }
  },

  // ── Export crew report as CSV ──
  exportReport: function() {
    var self = CrewPerformance;
    var team = JSON.parse(localStorage.getItem('bm-team') || '[]').filter(function(m) { return m.status === 'active'; });
    var allJobs = DB.jobs.getAll();
    var allEntries = JSON.parse(localStorage.getItem('bm-time-entries') || '[]');

    var rows = [['Name', 'Role', 'Jobs Completed', 'Revenue', 'Hours', 'Rev/Hour', 'Avg Rating', 'On-Time %', 'Monthly Goal']];
    team.forEach(function(member) {
      var stats = self._getCrewStats(member.id, self._dateRange, allJobs, allEntries, member.name);
      var revPerHr = stats.hoursWorked > 0 ? (stats.revenue / stats.hoursWorked).toFixed(2) : '0.00';
      var goal = localStorage.getItem('bm-crew-goal-' + member.id) || '';
      rows.push([
        member.name,
        member.role || 'Crew',
        stats.jobsCompleted,
        stats.revenue.toFixed(2),
        stats.hoursWorked.toFixed(1),
        revPerHr,
        stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '',
        stats.onTimeRate,
        goal
      ]);
    });

    var csv = rows.map(function(row) {
      return row.map(function(cell) {
        var s = String(cell);
        if (s.indexOf(',') > -1 || s.indexOf('"') > -1 || s.indexOf('\n') > -1) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(',');
    }).join('\n');

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'crew-report-' + self._dateRange + '-' + new Date().toISOString().split('T')[0] + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.toast('Crew report exported!');
  },

  // ── Dashboard widget: compact top 3 performers ──
  renderWidget: function() {
    var self = CrewPerformance;
    var team = JSON.parse(localStorage.getItem('bm-team') || '[]').filter(function(m) { return m.status === 'active'; });
    var allJobs = DB.jobs.getAll();
    var allEntries = JSON.parse(localStorage.getItem('bm-time-entries') || '[]');

    var crewStats = [];
    team.forEach(function(member) {
      var stats = self._getCrewStats(member.id, 'month', allJobs, allEntries, member.name);
      stats.member = member;
      crewStats.push(stats);
    });
    crewStats.sort(function(a, b) { return b.revenue - a.revenue; });
    var top3 = crewStats.slice(0, 3);

    var html = '<div style="background:var(--white);border-radius:12px;padding:16px 20px;border:1px solid var(--border);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'
      + '<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-light);">Top Performers</div>'
      + '<a href="#" onclick="loadPage(\'crewperformance\');return false;" style="font-size:12px;color:var(--green-dark);font-weight:600;text-decoration:none;">View All</a>'
      + '</div>';

    if (top3.length === 0) {
      html += '<div style="text-align:center;color:var(--text-light);font-size:13px;padding:8px 0;">No team data</div>';
    } else {
      var medals = ['🥇', '🥈', '🥉'];
      top3.forEach(function(cs, idx) {
        html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;' + (idx < top3.length - 1 ? 'border-bottom:1px solid #f5f5f5;' : '') + '">'
          + '<div style="font-size:18px;">' + medals[idx] + '</div>'
          + '<div style="flex:1;">'
          + '<div style="font-size:14px;font-weight:600;">' + UI.esc(cs.member.name) + '</div>'
          + '<div style="font-size:11px;color:var(--text-light);">' + cs.jobsCompleted + ' jobs &middot; ' + cs.hoursWorked.toFixed(0) + ' hrs</div>'
          + '</div>'
          + '<div style="font-size:14px;font-weight:700;color:var(--green-dark);">' + UI.moneyInt(cs.revenue) + '</div>'
          + '</div>';
      });
    }
    html += '</div>';
    return html;
  }
};
