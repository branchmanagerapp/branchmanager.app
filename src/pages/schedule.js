/**
 * Branch Manager — Schedule / Calendar Page
 * Jobber-style with Today agenda, Week, and Month views
 */
var SchedulePage = {
  view: 'month', // v388: default to month view (was week)
  currentDate: new Date(),

  // Returns YYYY-MM-DD in LOCAL time (toISOString returns UTC, off-by-one after ~8pm ET)
  _localDateStr: function(d) {
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  },

  render: function() {
    var self = SchedulePage;
    var html = '';
    // v378: AdminTasks.seedDefaults() removed — was auto-injecting a recurring
    // "Review media uploads & schedule social posts" task that became stale once
    // Media Center moved into SocialBranch. If you want recurring admin reminders
    // back, build them with explicit user opt-in instead of seeding on every render.
    var today = SchedulePage._localDateStr(new Date());
    // v587: archived jobs hidden from calendar by default; toggle reveals them
    // for cases like scheduling social-media posts about completed past jobs.
    var showArchived = localStorage.getItem('bm-cal-show-archived') === 'true';
    var allJobs = DB.jobs.getAll();
    if (!showArchived) allJobs = allJobs.filter(function(j) { return j.status !== 'archived'; });
    var todayJobs = allJobs.filter(function(j) { return j.scheduledDate && j.scheduledDate.substring(0,10) === today; });

    // Today summary (compact — just count, no big card)


    // v384: Weather + Photos toggles moved inline with the Day/Week/Month
    // toggle group instead of taking their own row above. Reclaims one row
    // of vertical space without losing functionality.
    var wEnabled = typeof Weather !== 'undefined' && Weather.isEnabled();
    var pEnabled = localStorage.getItem('bm-cal-photos') !== 'false';
    if (wEnabled) setTimeout(function() { Weather.fetch(); }, 100);

    function toggleSwitch(label, on, onclick) {
      return '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--text-light);font-weight:500;">'
        + label
        + '<button onclick="' + onclick + '" style="position:relative;width:32px;height:18px;border-radius:9px;border:none;cursor:pointer;background:' + (on ? 'var(--accent)' : '#ccc') + ';transition:background .2s;">'
        +   '<span style="position:absolute;top:2px;' + (on ? 'left:16px' : 'left:2px') + ';width:14px;height:14px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.2);"></span>'
        + '</button>'
        + '</label>';
    }

    // Calendar controls — single line on desktop, wraps on narrow.
    // Title shrinks to natural width (was min-width:200px which forced a
    // wrap even when there was room). Tighter button padding too.
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">'
      + '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">'
      +   '<button class="btn btn-outline" onclick="SchedulePage.prev()" style="padding:4px 10px;">&larr;</button>'
      +   '<h3 id="cal-title" style="font-size:16px;font-weight:700;white-space:nowrap;margin:0 4px;">' + self._getTitle() + '</h3>'
      +   '<button class="btn btn-outline" onclick="SchedulePage.next()" style="padding:4px 10px;">&rarr;</button>'
      +   '<button class="btn btn-outline" onclick="SchedulePage.goToday()" style="font-size:12px;padding:4px 10px;">Today</button>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">'
      +   '<div style="display:flex;gap:2px;background:var(--bg);border-radius:8px;padding:2px;">'
      +     '<button class="btn ' + (self.view === 'day' ? 'btn-primary' : '') + '" onclick="SchedulePage.setView(\'day\')" style="font-size:12px;padding:5px 12px;border-radius:6px;' + (self.view !== 'day' ? 'background:none;border:none;color:var(--text-light);' : '') + '">Day</button>'
      +     '<button class="btn ' + (self.view === 'week' ? 'btn-primary' : '') + '" onclick="SchedulePage.setView(\'week\')" style="font-size:12px;padding:5px 12px;border-radius:6px;' + (self.view !== 'week' ? 'background:none;border:none;color:var(--text-light);' : '') + '">Week</button>'
      +     '<button class="btn ' + (self.view === 'month' ? 'btn-primary' : '') + '" onclick="SchedulePage.setView(\'month\')" style="font-size:12px;padding:5px 12px;border-radius:6px;' + (self.view !== 'month' ? 'background:none;border:none;color:var(--text-light);' : '') + '">Month</button>'
      +   '</div>'
      +   (typeof Weather !== 'undefined' ? toggleSwitch('Weather', wEnabled, 'Weather.toggle()') : '')
      +   toggleSwitch('Photos', pEnabled, 'SchedulePage._togglePhotos()')
      +   toggleSwitch('Archived', showArchived, 'SchedulePage._toggleArchived()')
      + '</div>'
      + '</div>';

    if (self.view === 'day') {
      html += self._renderDay();
    } else if (self.view === 'week') {
      html += self._renderWeek();
    } else {
      html += self._renderMonth();
    }

    // Upcoming jobs (next 7 days)
    var next7 = [];
    for (var d = 1; d <= 7; d++) {
      var futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + d);
      var fStr = SchedulePage._localDateStr(futureDate);
      var fJobs = allJobs.filter(function(j) { return j.scheduledDate && j.scheduledDate.substring(0,10) === fStr; });
      if (fJobs.length > 0) {
        next7.push({ date: futureDate, dateStr: fStr, jobs: fJobs });
      }
    }

    if (next7.length > 0) {
      html += '<div style="margin-top:20px;">'
        + '<h3 style="font-size:16px;font-weight:700;margin-bottom:12px;">Upcoming This Week</h3>';
      next7.forEach(function(day) {
        var isTomorrow = (function() { var t = new Date(); t.setDate(t.getDate()+1); return SchedulePage._localDateStr(t) === day.dateStr; })();
        html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:8px;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
          + '<div style="font-weight:700;font-size:13px;">' + SchedulePage._formatDate(day.date, 'short') + (isTomorrow ? ' <span style="font-size:11px;font-weight:700;color:var(--green-dark);background:var(--green-bg);padding:2px 6px;border-radius:8px;">TOMORROW</span>' : '') + '</div>'
          + '<div style="display:flex;align-items:center;gap:6px;">'
          + (isTomorrow ? '<button onclick="if(typeof AutomationsPage!==\'undefined\'){AutomationsPage.runVisitReminders();}else{UI.toast(\'Sending reminders...\');}" style="font-size:11px;padding:3px 10px;background:var(--green-dark);color:#fff;border:none;border-radius:6px;cursor:pointer;white-space:nowrap;">📧 Send Reminders</button>' : '')
          + '<span style="background:var(--green-bg);color:var(--green-dark);font-size:11px;font-weight:700;padding:3px 10px;border-radius:10px;">' + day.jobs.length + ' job' + (day.jobs.length !== 1 ? 's' : '') + '</span>'
          + '</div>'
          + '</div>';
        day.jobs.forEach(function(j) {
          html += '<div onclick="JobsPage.showDetail(\'' + j.id + '\')" style="display:flex;justify-content:space-between;padding:6px 0;cursor:pointer;font-size:13px;">'
            + '<span>' + UI.esc(j.clientName || '#' + j.jobNumber) + '</span>'
            + '<span style="font-weight:700;color:var(--green-dark);">' + UI.moneyInt(j.total) + '</span></div>';
        });
        html += '</div>';
      });
      html += '</div>';
    }

    return html;
  },

  _formatDate: function(d, format) {
    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var sm = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (format === 'full') return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    if (format === 'short') return days[d.getDay()] + ', ' + sm[d.getMonth()] + ' ' + d.getDate();
    return sm[d.getMonth()] + ' ' + d.getDate();
  },

  _formatTime: function(t) {
    if (!t) return '';
    var parts = t.split(':');
    var h = parseInt(parts[0]);
    var m = parts[1] || '00';
    var ampm = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return h + ':' + m + ' ' + ampm;
  },

  _getTitle: function() {
    var d = SchedulePage.currentDate;
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    if (SchedulePage.view === 'day') {
      return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    }
    if (SchedulePage.view === 'month') {
      return months[d.getMonth()] + ' ' + d.getFullYear();
    }
    var start = new Date(d);
    start.setDate(start.getDate() - start.getDay());
    var end = new Date(start);
    end.setDate(end.getDate() + 6);
    var sm = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return sm[start.getMonth()] + ' ' + start.getDate() + ' - ' + (end.getMonth() !== start.getMonth() ? sm[end.getMonth()] + ' ' : '') + end.getDate() + ', ' + end.getFullYear();
  },

  _renderDay: function() {
    var self = SchedulePage;
    var d = SchedulePage.currentDate;
    var dateStr = SchedulePage._localDateStr(d);
    var allJobs = DB.jobs.getAll();
    if (localStorage.getItem('bm-cal-show-archived') !== 'true') allJobs = allJobs.filter(function(_j){ return _j.status !== 'archived'; });
    var dayJobs = allJobs.filter(function(j) { return j.scheduledDate && j.scheduledDate.substring(0,10) === dateStr; });

    var html = '';

    // Unscheduled jobs panel for day view
    var globalUnscheduled = allJobs.filter(function(j) { return !j.scheduledDate && j.status !== 'completed' && j.status !== 'cancelled'; });
    if (globalUnscheduled.length > 0) {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:12px;">'
        + '<div style="font-weight:700;font-size:13px;margin-bottom:8px;">' + String.fromCharCode(128203) + ' Unscheduled Jobs (' + globalUnscheduled.length + ') — <span style="font-size:12px;font-weight:400;color:var(--text-light);">drag to a time slot</span></div>'
        + '<div style="display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;">';
      globalUnscheduled.slice(0, 10).forEach(function(j) {
        html += '<div draggable="true" ondragstart="SchedulePage._dragStart(event,\'' + j.id + '\')" ondragend="SchedulePage._dragEnd(event)" '
          + 'style="background:var(--bg);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:6px;padding:8px 12px;cursor:grab;min-width:160px;flex-shrink:0;">'
          + '<div style="font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.clientName || '#' + j.jobNumber) + '</div>'
          + '<div style="font-size:11px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.description || '') + '</div>'
          + '<div style="font-weight:700;font-size:12px;color:var(--green-dark);margin-top:4px;">' + UI.moneyInt(j.total) + '</div></div>';
      });
      html += '</div></div>';
    }

    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">';

    for (var h = 6; h <= 19; h++) {
      var hour = h > 12 ? h - 12 : h;
      var ampm = h >= 12 ? 'PM' : 'AM';
      var hPad = (h < 10 ? '0' : '') + h;
      var slotJobs = dayJobs.filter(function(j) { return j.startTime && j.startTime.substring(0,2) === hPad; });

      var hourlyWx = (typeof Weather !== 'undefined' && Weather.getHourly) ? Weather.getHourly(dateStr, h) : '';
      html += '<div style="display:flex;border-bottom:1px solid var(--border);min-height:52px;">'
        + '<div style="width:88px;padding:8px 10px;font-size:12px;font-weight:600;color:var(--text-light);border-right:1px solid var(--border);flex-shrink:0;text-align:right;">'
        + hour + ':00 ' + ampm
        + hourlyWx
        + '</div>'
        + '<div data-date="' + dateStr + '" data-hour="' + h + '" '
        + 'ondragover="event.preventDefault();this.style.background=\'#e8f5e9\';this.style.border=\'2px dashed #4caf50\'" '
        + 'ondragleave="this.style.background=\'\';this.style.border=\'none\'" '
        + 'ondrop="SchedulePage._dropOnSlot(event,\'' + dateStr + '\',' + h + ')" '
        + 'style="flex:1;padding:4px 8px;display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start;transition:background .15s;">';

      slotJobs.forEach(function(j) {
        var bgColor = j.status === 'completed' ? '#e6f6ee' : j.status === 'late' ? '#fde8e8' : j.status === 'in_progress' ? '#fefcbf' : '#ebf4ff';
        var borderColor = j.status === 'completed' ? '#1a8a5c' : j.status === 'late' ? '#e53e3e' : j.status === 'in_progress' ? '#ed8936' : '#4299e1';
        html += '<div draggable="true" ondragstart="event.stopPropagation();SchedulePage._dragStart(event,\'' + j.id + '\')" ondragend="SchedulePage._dragEnd(event)" '
          + 'onclick="JobsPage.showDetail(\'' + j.id + '\')" style="background:' + bgColor + ';border-left:3px solid ' + borderColor + ';border-radius:6px;padding:8px 12px;cursor:grab;flex:1;min-width:200px;">'
          + '<div style="font-weight:700;font-size:13px;">' + (j.clientName || '') + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);">' + (j.description || '#' + j.jobNumber) + '</div>'
          + '<div style="display:flex;gap:8px;margin-top:4px;font-size:11px;">'
          + '<span style="font-weight:700;color:var(--accent);">' + UI.moneyInt(j.total) + '</span>'
          + (j.crew ? '<span style="color:var(--text-light);">' + String.fromCharCode(128119) + ' ' + j.crew.join(', ') + '</span>' : '')
          + '</div></div>';
      });

      html += '</div></div>';
    }

    // Unscheduled for this day (have date but no time)
    var unscheduled = dayJobs.filter(function(j) { return !j.startTime; });
    if (unscheduled.length) {
      html += '<div style="display:flex;border-top:2px solid var(--accent);">'
        + '<div style="width:88px;padding:8px 10px;font-size:11px;font-weight:700;color:var(--accent);border-right:1px solid var(--border);text-align:right;">Any<br>time</div>'
        + '<div style="flex:1;padding:6px 8px;display:flex;gap:6px;flex-wrap:wrap;">';
      unscheduled.forEach(function(j) {
        html += '<div draggable="true" ondragstart="SchedulePage._dragStart(event,\'' + j.id + '\')" ondragend="SchedulePage._dragEnd(event)" '
          + 'onclick="JobsPage.showDetail(\'' + j.id + '\')" style="background:var(--green-bg);border-left:3px solid var(--accent);border-radius:6px;padding:8px 12px;cursor:grab;flex:1;min-width:200px;">'
          + '<div style="font-weight:700;font-size:13px;">' + (j.clientName || '') + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);">' + (j.description || '#' + j.jobNumber) + '</div>'
          + '<div style="font-weight:700;font-size:11px;color:var(--accent);margin-top:4px;">' + UI.moneyInt(j.total) + '</div></div>';
      });
      html += '</div></div>';
    }

    html += '</div>';

    // Day summary
    if (dayJobs.length) {
      var dayTotal = dayJobs.reduce(function(s,j) { return s + (j.total||0); }, 0);
      html += '<div class="stat-row" style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-top:16px;background:var(--white);">'
        + '<div style="padding:14px;text-align:center;border-right:1px solid var(--border);"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;font-weight:600;">Jobs</div><div style="font-size:24px;font-weight:800;">' + dayJobs.length + '</div></div>'
        + '<div style="padding:14px;text-align:center;border-right:1px solid var(--border);"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;font-weight:600;">Revenue</div><div style="font-size:24px;font-weight:800;color:var(--accent);">' + UI.moneyInt(dayTotal) + '</div></div>'
        + '<div style="padding:14px;text-align:center;"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;font-weight:600;">Crew</div><div style="font-size:24px;font-weight:800;">' + dayJobs.reduce(function(s,j){return s+(j.crew?j.crew.length:0);},0) + '</div></div>'
        + '</div>';
    } else {
      html += '<div style="margin-top:16px;text-align:center;padding:24px;color:var(--text-light);font-size:14px;">No jobs scheduled for this day. <button class="btn btn-primary" style="margin-left:8px;" onclick="JobsPage.showForm(null,{date:\'' + SchedulePage._localDateStr(SchedulePage.currentDate) + '\'})">+ Schedule Job</button></div>';
    }

    // Admin Tasks section for this day
    var dayAdminTasks = (typeof AdminTasks !== 'undefined') ? AdminTasks.getForDate(dateStr) : [];
    if (dayAdminTasks.length > 0) {
      html += '<div style="background:#f3e5f5;border:1px solid #ce93d8;border-radius:8px;padding:10px 14px;margin-top:8px;">'
        + '<div style="font-size:12px;font-weight:700;color:#6a1b9a;margin-bottom:6px;">&#x1F4CB; Admin Tasks</div>';
      dayAdminTasks.forEach(function(t) {
        html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid #e1bee7;">'
          + '<div onclick="AdminTasks.toggleComplete(\'' + t.id + '\')" style="width:18px;height:18px;border-radius:50%;border:2px solid #7b1fa2;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;margin-top:1px;" onmouseover="this.style.background=\'#ce93d8\'" onmouseout="this.style.background=\'transparent\'">&#x2713;</div>'
          + '<div style="flex:1;">'
          + '<div style="font-size:13px;font-weight:600;color:#4a148c;">' + UI.esc(t.title) + '</div>'
          + (t.recurrence && t.recurrence !== 'none' ? '<div style="font-size:11px;color:#7b1fa2;margin-top:2px;">&#x1F501; ' + t.recurrence.charAt(0).toUpperCase() + t.recurrence.slice(1) + '</div>' : '')
          + '</div>'
          + '</div>';
      });
      html += '</div>';
    }

    return html;
  },

  _dragJobId: null,

  _dragStart: function(e, jobId) {
    SchedulePage._dragJobId = jobId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', jobId);
    e.target.style.opacity = '0.5';
  },

  _dragEnd: function(e) {
    e.target.style.opacity = '1';
  },

  _flashDrop: function(el) {
    el.style.background = '#c8e6c9';
    el.style.border = 'none';
    setTimeout(function() {
      el.style.background = '';
    }, 400);
  },

  _togglePhotos: function() {
    var current = localStorage.getItem('bm-cal-photos') !== 'false';
    localStorage.setItem('bm-cal-photos', current ? 'false' : 'true');
    loadPage('schedule');
  },

  _toggleArchived: function() {
    var current = localStorage.getItem('bm-cal-show-archived') === 'true';
    localStorage.setItem('bm-cal-show-archived', current ? 'false' : 'true');
    loadPage('schedule');
  },

  _photosEnabled: function() {
    return localStorage.getItem('bm-cal-photos') !== 'false';
  },

  _dropOnDay: function(e, dateStr) {
    e.preventDefault();
    var el = e.currentTarget;
    var jobId = SchedulePage._dragJobId;
    if (!jobId) return;
    SchedulePage._flashDrop(el);
    DB.jobs.update(jobId, { scheduledDate: dateStr });
    UI.toast('Job scheduled to ' + dateStr);
    SchedulePage._dragJobId = null;
    setTimeout(function() { loadPage('schedule'); }, 300);
  },

  _dropOnUnscheduled: function(e) {
    e.preventDefault();
    var el = e.currentTarget;
    if (el) { el.style.background = 'var(--white)'; el.style.boxShadow = 'none'; }
    var jobId = SchedulePage._dragJobId;
    if (!jobId) return;
    SchedulePage._flashDrop(el);
    // Clear both scheduledDate and any specific startTime
    DB.jobs.update(jobId, { scheduledDate: null, startTime: null });
    UI.toast('Job unscheduled ✓');
    SchedulePage._dragJobId = null;
    setTimeout(function() { loadPage('schedule'); }, 300);
  },

  _dropOnSlot: function(e, dateStr, hour) {
    e.preventDefault();
    var el = e.currentTarget;
    var jobId = SchedulePage._dragJobId;
    if (!jobId) return;
    SchedulePage._flashDrop(el);
    var startTime = (hour < 10 ? '0' : '') + hour + ':00';
    var displayHour = hour > 12 ? hour - 12 : hour;
    var ampm = hour >= 12 ? 'PM' : 'AM';
    DB.jobs.update(jobId, { scheduledDate: dateStr, startTime: startTime });
    UI.toast('Job scheduled to ' + dateStr + ' at ' + displayHour + ':00 ' + ampm);
    SchedulePage._dragJobId = null;
    setTimeout(function() { loadPage('schedule'); }, 300);
  },

  _renderWeek: function() {
    var d = new Date(SchedulePage.currentDate);
    d.setDate(d.getDate() - d.getDay());
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var today = SchedulePage._localDateStr(new Date());
    var allJobs = DB.jobs.getAll();
    if (localStorage.getItem('bm-cal-show-archived') !== 'true') allJobs = allJobs.filter(function(_j){ return _j.status !== 'archived'; });
    var html = '';

    // Unscheduled jobs panel
    var unscheduled = allJobs.filter(function(j) { return !j.scheduledDate && j.status !== 'completed' && j.status !== 'cancelled'; });
    // Always render the unscheduled panel (even when empty) so it accepts drops
    html += '<div id="sched-unscheduled" '
      + 'ondragover="event.preventDefault();this.style.background=\'#fff3e0\';this.style.boxShadow=\'inset 0 0 0 2px #e07c24\'" '
      + 'ondragleave="this.style.background=\'var(--white)\';this.style.boxShadow=\'none\'" '
      + 'ondrop="SchedulePage._dropOnUnscheduled(event)" '
      + 'style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:12px;transition:background .15s;">'
      + '<div style="font-weight:700;font-size:13px;margin-bottom:8px;">📋 Unscheduled Jobs (' + unscheduled.length + ') — <span style="font-size:12px;font-weight:400;color:var(--text-light);">drag jobs here to unschedule, or to calendar to schedule</span></div>';
    if (unscheduled.length > 0) {
      html += '<div style="display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;">';
      unscheduled.slice(0, 10).forEach(function(j) {
        html += '<div draggable="true" ondragstart="SchedulePage._dragStart(event,\'' + j.id + '\')" ondragend="SchedulePage._dragEnd(event)" '
          + 'style="background:var(--bg);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:6px;padding:8px 12px;cursor:grab;min-width:160px;flex-shrink:0;">'
          + '<div style="font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.clientName || '#' + j.jobNumber) + '</div>'
          + '<div style="font-size:11px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.description || '') + '</div>'
          + '<div style="font-weight:700;font-size:12px;color:var(--green-dark);margin-top:4px;">' + UI.moneyInt(j.total) + '</div></div>';
      });
      html += '</div>';
    } else {
      html += '<div style="font-size:12px;color:var(--text-light);padding:6px 0;">None — drop a scheduled job here to unschedule it.</div>';
    }
    html += '</div>';

    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--border);border-radius:12px;overflow:hidden;border:1px solid var(--border);">';

    // Header
    for (var i = 0; i < 7; i++) {
      var dd = new Date(d);
      dd.setDate(dd.getDate() + i);
      var dateStr = SchedulePage._localDateStr(dd);
      var isToday = dateStr === today;
      html += '<div style="background:' + (isToday ? 'var(--green-dark)' : 'var(--bg)') + ';color:' + (isToday ? '#fff' : 'var(--text)') + ';padding:6px 8px 8px;text-align:center;font-size:12px;font-weight:700;">'
        + (typeof Weather !== 'undefined' ? '<div style="margin-bottom:2px;min-height:16px;">' + Weather.getInline(dateStr) + '</div>' : '')
        + days[i] + '<br><span style="font-size:18px;font-weight:800;">' + dd.getDate() + '</span>'
        + '</div>';
    }

    // Cells
    for (var i = 0; i < 7; i++) {
      var dd = new Date(d);
      dd.setDate(dd.getDate() + i);
      var dateStr = SchedulePage._localDateStr(dd);
      var isToday = dateStr === today;
      var dayJobs = allJobs.filter(function(j) { return j.scheduledDate && j.scheduledDate.substring(0,10) === dateStr; });

      html += '<div data-date="' + dateStr + '" '
        + 'ondragover="event.preventDefault();this.style.background=\'#e8f5e9\';this.style.boxShadow=\'inset 0 0 0 2px #4caf50\'" '
        + 'ondragleave="this.style.background=\'var(--white)\';this.style.boxShadow=\'none\'" '
        + 'ondrop="SchedulePage._dropOnDay(event,\'' + dateStr + '\')" '
        + 'onclick="SchedulePage.currentDate=new Date(\'' + dateStr + 'T12:00:00\');SchedulePage.setView(\'day\')" '
        + 'style="background:var(--white);min-height:120px;padding:6px;cursor:pointer;' + (isToday ? 'border-top:3px solid var(--green-dark);' : '') + 'transition:background .15s,box-shadow .15s;">';
      dayJobs.forEach(function(j) {
        var bgColor = j.status === 'completed' ? '#e8f5e9' : j.status === 'late' ? '#ffebee' : j.status === 'in_progress' ? '#fff3e0' : '#e3f2fd';
        var borderColor = j.status === 'completed' ? '#4caf50' : j.status === 'late' ? '#f44336' : j.status === 'in_progress' ? '#ff9800' : '#2196f3';
        // Photos from job + linked quote (past = content for SocialPilot, future = assessment photos)
        var jobPhotos = [];
        if (typeof Photos !== 'undefined' && SchedulePage._photosEnabled()) {
          jobPhotos = Photos.getAll('job', j.id);
          if (j.quoteId) jobPhotos = jobPhotos.concat(Photos.getAll('quote', j.quoteId));
          if (j.requestId) jobPhotos = jobPhotos.concat(Photos.getAll('request', j.requestId));
        }
        html += '<div draggable="true" ondragstart="event.stopPropagation();SchedulePage._dragStart(event,\'' + j.id + '\')" ondragend="SchedulePage._dragEnd(event)" onclick="event.stopPropagation();JobsPage.showDetail(\'' + j.id + '\')" style="background:' + bgColor + ';border-left:3px solid ' + borderColor + ';border-radius:6px;padding:6px 8px;margin-bottom:4px;cursor:grab;font-size:12px;">'
          + '<div style="font-weight:700;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.clientName || '') + '</div>'
          + '<div style="color:var(--text-light);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.description || '#' + j.jobNumber) + '</div>'
          + '<div style="font-weight:700;font-size:11px;color:var(--green-dark);margin-top:2px;">' + UI.moneyInt(j.total) + '</div>'
          + (jobPhotos.length > 0 ? '<div style="display:flex;gap:2px;margin-top:4px;overflow:hidden;">' + jobPhotos.slice(0, 3).map(function(p) { return '<img src="' + (p.url || p.dataUrl || '') + '" style="width:24px;height:24px;border-radius:3px;object-fit:cover;">'; }).join('') + (jobPhotos.length > 3 ? '<span style="font-size:9px;color:var(--text-light);align-self:center;">+' + (jobPhotos.length - 3) + '</span>' : '') + '</div>' : '')
          + '</div>';
      });
      // Admin task pills for this day
      var weekAdminTasks = (typeof AdminTasks !== 'undefined') ? AdminTasks.getForDate(dateStr) : [];
      weekAdminTasks.forEach(function(t) {
        html += '<div style="background:#f3e5f5;border-left:3px solid #7b1fa2;border-radius:4px;padding:3px 6px;font-size:11px;color:#6a1b9a;cursor:pointer;margin-top:2px;" onclick="event.stopPropagation();AdminTasks.toggleComplete(\'' + t.id + '\')">&#x1F4CB; ' + UI.esc(t.title) + '</div>';
      });
      // "+ job" quick-create removed from week view per user — create jobs via the universal '+' in topbar instead
      html += '</div>';
    }
    html += '</div>';

    return html;
  },

  _renderMonth: function() {
    var d = SchedulePage.currentDate;
    var year = d.getFullYear();
    var month = d.getMonth();
    var firstDay = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var today = SchedulePage._localDateStr(new Date());
    var allJobs = DB.jobs.getAll();
    if (localStorage.getItem('bm-cal-show-archived') !== 'true') allJobs = allJobs.filter(function(_j){ return _j.status !== 'archived'; });
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    var html = '';

    // Unscheduled jobs panel for month view — always rendered so it accepts drops
    var unscheduled = allJobs.filter(function(j) { return !j.scheduledDate && j.status !== 'completed' && j.status !== 'cancelled'; });
    html += '<div id="sched-unscheduled-m" '
      + 'ondragover="event.preventDefault();this.style.background=\'#fff3e0\';this.style.boxShadow=\'inset 0 0 0 2px #e07c24\'" '
      + 'ondragleave="this.style.background=\'var(--white)\';this.style.boxShadow=\'none\'" '
      + 'ondrop="SchedulePage._dropOnUnscheduled(event)" '
      + 'style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:12px;transition:background .15s;">'
      + '<div style="font-weight:700;font-size:13px;margin-bottom:8px;">' + String.fromCharCode(128203) + ' Unscheduled Jobs (' + unscheduled.length + ') — <span style="font-size:12px;font-weight:400;color:var(--text-light);">drag here to unschedule, or to a day to schedule</span></div>';
    if (unscheduled.length > 0) {
      html += '<div style="display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;">';
      unscheduled.slice(0, 10).forEach(function(j) {
        html += '<div draggable="true" ondragstart="SchedulePage._dragStart(event,\'' + j.id + '\')" ondragend="SchedulePage._dragEnd(event)" '
          + 'style="background:var(--bg);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:6px;padding:8px 12px;cursor:grab;min-width:160px;flex-shrink:0;">'
          + '<div style="font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.clientName || '#' + j.jobNumber) + '</div>'
          + '<div style="font-size:11px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.description || '') + '</div>'
          + '<div style="font-weight:700;font-size:12px;color:var(--green-dark);margin-top:4px;">' + UI.moneyInt(j.total) + '</div></div>';
      });
      html += '</div>';
    } else {
      html += '<div style="font-size:12px;color:var(--text-light);padding:6px 0;">None — drop a scheduled job here to unschedule it.</div>';
    }
    html += '</div>';

    html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--border);border-radius:12px;overflow:hidden;border:1px solid var(--border);">';

    days.forEach(function(day) {
      html += '<div style="background:var(--bg);padding:8px;text-align:center;font-size:11px;font-weight:700;color:var(--text-light);">' + day + '</div>';
    });

    for (var i = 0; i < firstDay; i++) {
      html += '<div style="background:#fafafa;min-height:80px;padding:4px;"></div>';
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      var isToday = dateStr === today;
      var dayJobs = allJobs.filter(function(j) { return j.scheduledDate && j.scheduledDate.substring(0,10) === dateStr; });

      html += '<div data-date="' + dateStr + '" '
        + 'ondragover="event.preventDefault();this.style.background=\'#e8f5e9\';this.style.boxShadow=\'inset 0 0 0 2px #4caf50\'" '
        + 'ondragleave="this.style.background=\'var(--white)\';this.style.boxShadow=\'none\'" '
        + 'ondrop="SchedulePage._dropOnDay(event,\'' + dateStr + '\')" '
        + 'onclick="SchedulePage.currentDate=new Date(\'' + dateStr + 'T12:00:00\');SchedulePage.setView(\'day\')" '
        + 'style="background:var(--white);min-height:80px;padding:4px;cursor:pointer;transition:background .15s;' + (isToday ? 'border:2px solid var(--green-dark);' : '') + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">'
        + '<span style="font-size:12px;font-weight:' + (isToday ? '800' : '600') + ';color:' + (isToday ? 'var(--green-dark)' : 'var(--text)') + ';">' + day + '</span>'
        + (typeof Weather !== 'undefined' ? Weather.getInline(dateStr) : '')
        + '</div>';

      dayJobs.forEach(function(j) {
        var bgColor = j.status === 'completed' ? '#e8f5e9' : j.status === 'late' ? '#ffebee' : '#e3f2fd';
        var mPhotos = [];
        if (typeof Photos !== 'undefined' && SchedulePage._photosEnabled()) {
          mPhotos = Photos.getAll('job', j.id);
          if (j.quoteId) mPhotos = mPhotos.concat(Photos.getAll('quote', j.quoteId));
          if (j.requestId) mPhotos = mPhotos.concat(Photos.getAll('request', j.requestId));
        }
        html += '<div draggable="true" ondragstart="event.stopPropagation();SchedulePage._dragStart(event,\'' + j.id + '\')" ondragend="SchedulePage._dragEnd(event)" '
          + 'onclick="event.stopPropagation();JobsPage.showDetail(\'' + j.id + '\')" '
          + 'style="background:' + bgColor + ';border-radius:4px;padding:2px 4px;margin-bottom:2px;cursor:grab;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
          + (j.clientName || '#' + j.jobNumber)
          + (mPhotos.length > 0 ? ' 📷' + mPhotos.length : '')
          + '</div>';
      });
      // Admin task dots for this day
      var monthAdminTasks = (typeof AdminTasks !== 'undefined') ? AdminTasks.getForDate(dateStr) : [];
      monthAdminTasks.forEach(function(t) {
        html += '<div style="font-size:9px;color:#7b1fa2;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" onclick="event.stopPropagation();AdminTasks.toggleComplete(\'' + t.id + '\')">&#x25CF; ' + UI.esc(t.title) + '</div>';
      });
      html += '</div>';
    }

    var totalCells = firstDay + daysInMonth;
    var remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (var i = 0; i < remaining; i++) {
      html += '<div style="background:#fafafa;min-height:80px;padding:4px;"></div>';
    }

    html += '</div>';
    return html;
  },

  setView: function(view) {
    SchedulePage.view = view;
    loadPage('schedule');
  },

  prev: function() {
    var d = SchedulePage.currentDate;
    if (SchedulePage.view === 'day') { d.setDate(d.getDate() - 1); }
    else if (SchedulePage.view === 'week') { d.setDate(d.getDate() - 7); }
    else { d.setMonth(d.getMonth() - 1); }
    loadPage('schedule');
  },

  next: function() {
    var d = SchedulePage.currentDate;
    if (SchedulePage.view === 'day') { d.setDate(d.getDate() + 1); }
    else if (SchedulePage.view === 'week') { d.setDate(d.getDate() + 7); }
    else { d.setMonth(d.getMonth() + 1); }
    loadPage('schedule');
  },

  goToday: function() {
    SchedulePage.currentDate = new Date();
    loadPage('schedule');
  }
};

var AdminTasks = {
  getAll: function() {
    try { return JSON.parse(localStorage.getItem('bm-admin-tasks') || '[]'); } catch(e) { return []; }
  },
  save: function(arr) {
    localStorage.setItem('bm-admin-tasks', JSON.stringify(arr));
  },
  add: function(task) {
    var all = this.getAll();
    all.push(task);
    this.save(all);
  },
  toggleComplete: function(id) {
    var all = this.getAll();
    var t = all.find(function(t) { return t.id === id; });
    if (t) {
      t.completed = !t.completed;
      if (t.recurrence === 'weekly' && t.completed) {
        // Spawn next occurrence 7 days later
        var nextDate = new Date(t.dueDate + 'T12:00:00');
        nextDate.setDate(nextDate.getDate() + 7);
        var nextDateStr = SchedulePage._localDateStr(nextDate);
        all.push({
          id: 'at_' + Date.now(),
          title: t.title,
          dueDate: nextDateStr,
          completed: false,
          recurrence: 'weekly',
          category: t.category,
          color: t.color || '#7b1fa2'
        });
      } else if (t.recurrence === 'monthly' && t.completed) {
        // Spawn next occurrence 1 month later
        var nextDate = new Date(t.dueDate + 'T12:00:00');
        nextDate.setMonth(nextDate.getMonth() + 1);
        var nextDateStr = SchedulePage._localDateStr(nextDate);
        all.push({
          id: 'at_' + Date.now(),
          title: t.title,
          dueDate: nextDateStr,
          completed: false,
          recurrence: 'monthly',
          category: t.category,
          color: t.color || '#7b1fa2'
        });
      }
    }
    this.save(all);
    if (typeof loadPage === 'function') loadPage('schedule');
  },
  getForDate: function(dateStr) {
    return this.getAll().filter(function(t) { return t.dueDate === dateStr && !t.completed; });
  },
  getForWeek: function(startDateStr, endDateStr) {
    return this.getAll().filter(function(t) { return !t.completed && t.dueDate >= startDateStr && t.dueDate <= endDateStr; });
  },
  // v378: seedDefaults() removed — see render() for context.
  seedDefaults: function() { /* no-op */ }
};
