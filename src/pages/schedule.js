/**
 * Branch Manager — Schedule / Calendar Page
 * legacy system-style with Today agenda, Week, and Month views
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

    // v647: Jobber-pattern mobile schedule — Day / List / Map pills
    // primary, Week / Month under "More". Week scroller strip below the
    // controls (S/M/T/W/T/F/S with date numbers, today highlighted) so
    // jumping days is one tap.
    function _viewPill(viewKey, label) {
      var active = self.view === viewKey;
      return '<button class="btn ' + (active ? 'btn-primary' : '') + '" onclick="SchedulePage.setView(\'' + viewKey + '\')" style="font-size:12px;padding:5px 12px;border-radius:6px;' + (!active ? 'background:none;border:none;color:var(--text-light);' : '') + '">' + label + '</button>';
    }
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px;">'
      + '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">'
      +   '<button class="btn btn-outline" onclick="SchedulePage.prev()" style="padding:4px 10px;">&larr;</button>'
      +   '<h3 id="cal-title" style="font-size:16px;font-weight:700;white-space:nowrap;margin:0 4px;">' + self._getTitle() + '</h3>'
      +   '<button class="btn btn-outline" onclick="SchedulePage.next()" style="padding:4px 10px;">&rarr;</button>'
      +   '<button class="btn btn-outline" onclick="SchedulePage.goToday()" style="font-size:12px;padding:4px 10px;">Today</button>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">'
      +   '<div style="display:flex;gap:2px;background:var(--bg);border-radius:8px;padding:2px;">'
      +     _viewPill('day', 'Day')
      +     _viewPill('list', 'List')
      +     _viewPill('map', 'Map')
      +     _viewPill('week', 'Week')
      +     _viewPill('month', 'Month')
      +   '</div>'
      +   (typeof Weather !== 'undefined' ? toggleSwitch('Weather', wEnabled, 'Weather.toggle()') : '')
      +   toggleSwitch('Photos', pEnabled, 'SchedulePage._togglePhotos()')
      +   toggleSwitch('Archived', showArchived, 'SchedulePage._toggleArchived()')
      + '</div>'
      + '</div>';

    // v647: Week scroller strip (S/M/T/W/T/F/S) — visible in Day/List/Map
    // views since those are single-day-focused. Hidden in Week/Month
    // (those views already show week context).
    if (self.view === 'day' || self.view === 'list' || self.view === 'map') {
      html += self._renderWeekScroller(self.currentDate);
    }

    if (self.view === 'day') {
      html += self._renderDay();
    } else if (self.view === 'list') {
      html += self._renderList();
    } else if (self.view === 'map') {
      html += self._renderMap();
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
    // v647: list + map are day-focused too — single-day title.
    if (SchedulePage.view === 'day' || SchedulePage.view === 'list' || SchedulePage.view === 'map') {
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
    var v = SchedulePage.view;
    if (v === 'day' || v === 'list' || v === 'map') { d.setDate(d.getDate() - 1); }
    else if (v === 'week') { d.setDate(d.getDate() - 7); }
    else { d.setMonth(d.getMonth() - 1); }
    loadPage('schedule');
  },

  next: function() {
    var d = SchedulePage.currentDate;
    var v = SchedulePage.view;
    if (v === 'day' || v === 'list' || v === 'map') { d.setDate(d.getDate() + 1); }
    else if (v === 'week') { d.setDate(d.getDate() + 7); }
    else { d.setMonth(d.getMonth() + 1); }
    loadPage('schedule');
  },

  goToday: function() {
    SchedulePage.currentDate = new Date();
    loadPage('schedule');
  },

  // v647: Jobber-style week scroller strip — S M T W T F S with date numbers,
  // today highlighted in green circle. Tap any day → jump Day view to that date.
  _renderWeekScroller: function(currentDate) {
    var today = SchedulePage._localDateStr(new Date());
    var selected = SchedulePage._localDateStr(currentDate);
    // Compute Sunday of the current week
    var d = new Date(currentDate);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    var dayLetters = ['S','M','T','W','T','F','S'];
    var allJobs = DB.jobs.getAll();
    if (localStorage.getItem('bm-cal-show-archived') !== 'true') {
      allJobs = allJobs.filter(function(j) { return j.status !== 'archived'; });
    }

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:8px 6px;margin-bottom:14px;display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">';
    for (var i = 0; i < 7; i++) {
      var dt = new Date(d);
      dt.setDate(d.getDate() + i);
      var dStr = SchedulePage._localDateStr(dt);
      var isToday = dStr === today;
      var isSelected = dStr === selected;
      var dayJobCount = allJobs.filter(function(j) { return j.scheduledDate && j.scheduledDate.substring(0,10) === dStr; }).length;

      var bg = isToday ? 'var(--green-dark)' : isSelected ? 'var(--green-bg)' : 'transparent';
      var fg = isToday ? '#fff' : 'var(--text)';
      var letterColor = isToday ? 'rgba(255,255,255,.85)' : 'var(--text-light)';

      html += '<button onclick="SchedulePage.currentDate=new Date(\'' + dStr + 'T12:00:00\');if(SchedulePage.view===\'week\'||SchedulePage.view===\'month\')SchedulePage.view=\'day\';loadPage(\'schedule\')" '
        + 'style="border:none;cursor:pointer;background:' + bg + ';color:' + fg + ';border-radius:10px;padding:8px 4px;display:flex;flex-direction:column;align-items:center;gap:2px;transition:background .15s;">'
        +   '<span style="font-size:10px;font-weight:600;letter-spacing:.04em;color:' + letterColor + ';text-transform:uppercase;">' + dayLetters[i] + '</span>'
        +   '<span style="font-size:16px;font-weight:700;line-height:1;">' + dt.getDate() + '</span>'
        +   (dayJobCount > 0
              ? '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:' + (isToday ? '#fff' : 'var(--accent)') + ';margin-top:2px;"></span>'
              : '<span style="display:inline-block;width:5px;height:5px;margin-top:2px;"></span>')
        + '</button>';
    }
    html += '</div>';
    return html;
  },

  // v647: List view — clean vertical timeline of today's jobs in time order.
  // No hour grid; just job cards top-to-bottom with start time chip.
  _renderList: function() {
    var self = SchedulePage;
    var dateStr = self._localDateStr(self.currentDate);
    var allJobs = DB.jobs.getAll();
    if (localStorage.getItem('bm-cal-show-archived') !== 'true') {
      allJobs = allJobs.filter(function(j) { return j.status !== 'archived'; });
    }
    var dayJobs = allJobs.filter(function(j) { return j.scheduledDate && j.scheduledDate.substring(0,10) === dateStr; });
    dayJobs.sort(function(a, b) { return (a.startTime || '99:99').localeCompare(b.startTime || '99:99'); });

    if (!dayJobs.length) {
      return '<div style="background:var(--white);border:1px dashed var(--border);border-radius:12px;padding:32px 16px;text-align:center;color:var(--text-light);">'
        + '<div style="font-size:32px;margin-bottom:6px;">📅</div>'
        + '<div style="font-size:14px;font-weight:600;color:var(--text);">No jobs scheduled</div>'
        + '<div style="font-size:12px;margin-top:4px;">Drag an unscheduled job from Day view, or add one with +.</div>'
        + '</div>';
    }

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">';
    dayJobs.forEach(function(j, i) {
      var statusColor = j.status === 'completed' ? '#2e7d32' : j.status === 'in_progress' ? '#e07c24' : j.status === 'late' ? '#c62828' : '#1565c0';
      var statusBg = j.status === 'completed' ? '#e8f5e9' : j.status === 'in_progress' ? '#fff3e0' : j.status === 'late' ? '#fde8e8' : '#e3f2fd';
      var border = i > 0 ? 'border-top:1px solid var(--border);' : '';
      html += '<div onclick="JobsPage.showDetail(\'' + j.id + '\')" style="cursor:pointer;padding:14px 16px;display:flex;gap:14px;align-items:flex-start;' + border + '">'
        +   '<div style="flex-shrink:0;width:62px;text-align:center;">'
        +     '<div style="font-size:15px;font-weight:800;color:var(--text);line-height:1.1;">' + UI.esc(j.startTime || 'Any')+ '</div>'
        +     (j.endTime ? '<div style="font-size:11px;color:var(--text-light);">' + UI.esc(j.endTime) + '</div>' : '')
        +   '</div>'
        +   '<div style="width:3px;background:' + statusColor + ';border-radius:2px;align-self:stretch;flex-shrink:0;"></div>'
        +   '<div style="flex:1;min-width:0;">'
        +     '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px;">'
        +       '<div style="font-size:14px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(j.clientName || '—') + '</div>'
        +       '<div style="font-size:13px;font-weight:700;color:var(--text);flex-shrink:0;">' + UI.moneyInt(j.total || 0) + '</div>'
        +     '</div>'
        +     (j.property ? '<div style="font-size:12px;color:var(--text-light);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(j.property) + '</div>' : '')
        +     (j.description ? '<div style="font-size:12px;color:var(--text);margin-top:4px;line-height:1.4;">' + UI.esc(j.description) + '</div>' : '')
        +     '<div style="margin-top:6px;display:flex;gap:6px;align-items:center;">'
        +       '<span style="background:' + statusBg + ';color:' + statusColor + ';padding:2px 9px;border-radius:11px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;">' + (j.status || 'scheduled').replace('_', ' ') + '</span>'
        +       (j.crew && j.crew.length ? '<span style="font-size:11px;color:var(--text-light);">👷 ' + UI.esc(j.crew.join(', ')) + '</span>' : '')
        +     '</div>'
        +   '</div>'
        + '</div>';
    });
    html += '</div>';

    var totalRevenue = dayJobs.reduce(function(s, j) { return s + (j.total || 0); }, 0);
    html += '<div style="margin-top:8px;text-align:right;font-size:13px;color:var(--text-light);">'
      + dayJobs.length + ' job' + (dayJobs.length === 1 ? '' : 's') + ' · ' + UI.money(totalRevenue) + ' total'
      + '</div>';
    return html;
  },

  // v647: Map view — embed MapLibre showing today's jobs as pins. Re-uses
  // the same MapLibre infra Dispatch already loads. Pins colored by status.
  _renderMap: function() {
    var self = SchedulePage;
    var dateStr = self._localDateStr(self.currentDate);
    var allJobs = DB.jobs.getAll();
    if (localStorage.getItem('bm-cal-show-archived') !== 'true') {
      allJobs = allJobs.filter(function(j) { return j.status !== 'archived'; });
    }
    var dayJobs = allJobs.filter(function(j) {
      return j.scheduledDate && j.scheduledDate.substring(0,10) === dateStr
        && (j.lat || j.latitude) && (j.lng || j.longitude || j.lon);
    });

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">';
    html += '<div id="schedule-map" style="height:480px;width:100%;background:#e8eef2;"></div>';

    if (dayJobs.length === 0) {
      html += '<div style="padding:14px 16px;font-size:13px;color:var(--text-light);text-align:center;background:var(--bg);border-top:1px solid var(--border);">'
        + 'No jobs with location for this day. Add property addresses to see pins.'
        + '</div>';
    } else {
      html += '<div style="padding:10px 14px;font-size:12px;color:var(--text-light);background:var(--bg);border-top:1px solid var(--border);">'
        + dayJobs.length + ' job' + (dayJobs.length === 1 ? '' : 's') + ' shown · tap a pin for details'
        + '</div>';
    }
    html += '</div>';

    // Init MapLibre after DOM mount (deferred so the container exists)
    setTimeout(function() {
      var el = document.getElementById('schedule-map');
      if (!el || typeof maplibregl === 'undefined') return;
      try {
        // Center: if we have jobs, use first; else fall back to Peekskill area.
        var firstJob = dayJobs[0];
        var centerLng = firstJob ? Number(firstJob.lng || firstJob.longitude || firstJob.lon) : -73.9211;
        var centerLat = firstJob ? Number(firstJob.lat || firstJob.latitude) : 41.2901;
        var map = new maplibregl.Map({
          container: el,
          style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
          center: [centerLng, centerLat],
          zoom: dayJobs.length ? 11 : 9
        });
        map.addControl(new maplibregl.NavigationControl(), 'top-right');
        SchedulePage._mapInstance = map;

        map.on('load', function() {
          var bounds = new maplibregl.LngLatBounds();
          dayJobs.forEach(function(j) {
            var lng = Number(j.lng || j.longitude || j.lon);
            var lat = Number(j.lat || j.latitude);
            if (!lng || !lat) return;
            var statusColor = j.status === 'completed' ? '#2e7d32' : j.status === 'in_progress' ? '#e07c24' : j.status === 'late' ? '#c62828' : '#1565c0';
            var pin = document.createElement('div');
            pin.style.cssText = 'width:28px;height:28px;border-radius:50%;background:' + statusColor + ';border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:800;';
            pin.textContent = (j.startTime || '·').substring(0, 2);
            pin.onclick = function() { JobsPage.showDetail(j.id); };
            new maplibregl.Marker({ element: pin })
              .setLngLat([lng, lat])
              .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(
                '<div style="font-size:13px;font-weight:700;">' + UI.esc(j.clientName || '') + '</div>'
                + (j.startTime ? '<div style="font-size:12px;color:#666;">' + UI.esc(j.startTime) + '</div>' : '')
                + (j.property ? '<div style="font-size:12px;margin-top:4px;">' + UI.esc(j.property) + '</div>' : '')
              ))
              .addTo(map);
            bounds.extend([lng, lat]);
          });
          if (dayJobs.length > 1) map.fitBounds(bounds, { padding: 50, maxZoom: 14 });
        });
      } catch (e) {
        el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-light);font-size:13px;">Map failed to load: ' + e.message + '</div>';
      }
    }, 60);

    return html;
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
