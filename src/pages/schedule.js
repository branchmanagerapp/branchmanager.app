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

  // v677: Reminders inline on the calendar (matches Jobber pattern)
  // - Quote follow-ups: 5d + 10d after sentAt for status=sent (skip if already sent)
  // - Invoice follow-ups: 1d + 4d after dueDate for status=sent/overdue (skip if paid/draft)
  // Cached per-render via window._bmRemindersCache.
  _getReminderIndex: function() {
    if (window._bmRemindersCacheKey === SchedulePage._cacheKey()) return window._bmRemindersCache;
    var idx = {}; // dateStr → [{kind, label, short, id, stage}]
    function push(dateStr, item) { (idx[dateStr] = idx[dateStr] || []).push(item); }
    function add5d(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return SchedulePage._localDateStr(x); }
    function lastName(n) {
      if (!n) return 'client';
      var parts = String(n).trim().split(/\s+/);
      return parts[parts.length - 1];
    }
    function snoozedOr(snoozed, fallback) {
      return (snoozed && typeof snoozed === 'string') ? snoozed.substring(0,10) : fallback;
    }
    function prefDays(key, fallback) {
      var v = parseInt(localStorage.getItem(key), 10);
      return isNaN(v) ? fallback : v;
    }
    var qFu1 = prefDays('bm-sched-q-fu1-days', 5);
    var qFu2 = prefDays('bm-sched-q-fu2-days', 10);
    var iFu1 = prefDays('bm-sched-i-fu1-days', 1);
    var iFu2 = prefDays('bm-sched-i-fu2-days', 4);
    var qs = (typeof DB !== 'undefined' && DB.quotes) ? DB.quotes.getAll() : [];
    qs.forEach(function(q) {
      if (!q.sentAt) return;
      var s = (q.status || '').toLowerCase();
      if (s === 'converted' || s === 'approved' || s === 'archived' || s === 'draft' || s === 'changes_requested') return;
      var sent = new Date(q.sentAt);
      if (isNaN(sent)) return;
      var num = q.quoteNumber || q.id;
      var ln = lastName(q.clientName);
      var label = 'Quote follow-up #' + num + ' · ' + (q.clientName || 'client');
      var short = 'F:' + ln;
      if (!q.followupSentAt) push(snoozedOr(q.followupSnoozedTo, add5d(sent, qFu1)),
        { kind:'quote', stage:1, id:q.id, label:label, short:short });
      if (!q.followup2SentAt) push(snoozedOr(q.followup2SnoozedTo, add5d(sent, qFu2)),
        { kind:'quote', stage:2, id:q.id, label:label + ' (2nd)', short:short + '²' });
    });
    var ivs = (typeof DB !== 'undefined' && DB.invoices) ? DB.invoices.getAll() : [];
    ivs.forEach(function(inv) {
      if (!inv.dueDate) return;
      var s = (inv.status || '').toLowerCase();
      if (s === 'paid' || s === 'archived' || s === 'draft') return;
      var due = new Date(inv.dueDate);
      if (isNaN(due)) return;
      var num = inv.invoiceNumber || inv.id;
      var ln = lastName(inv.clientName);
      var label = 'Invoice overdue #' + num + ' · ' + (inv.clientName || 'client');
      var short = 'O:' + ln;
      if (!inv.followupSentAt) push(snoozedOr(inv.followupSnoozedTo, add5d(due, iFu1)),
        { kind:'invoice', stage:1, id:inv.id, label:label, short:short });
      push(snoozedOr(inv.followup2SnoozedTo, add5d(due, iFu2)),
        { kind:'invoice', stage:2, id:inv.id, label:label + ' (' + iFu2 + 'd overdue)', short:short + '⚠' });
    });
    window._bmRemindersCache = idx;
    window._bmRemindersCacheKey = SchedulePage._cacheKey();
    return idx;
  },
  _cacheKey: function() {
    // Cache invalidates when quotes/invoices counts change. Cheap key.
    var qn = (typeof DB !== 'undefined' && DB.quotes) ? DB.quotes.getAll().length : 0;
    var iv = (typeof DB !== 'undefined' && DB.invoices) ? DB.invoices.getAll().length : 0;
    return qn + ':' + iv + ':' + (Date.now() / 60000 | 0); // refresh every minute
  },
  _getRemindersForDate: function(dateStr) {
    return SchedulePage._getReminderIndex()[dateStr] || [];
  },

  // Paint recurring-job projected occurrences on the calendar.
  // Reads from RecurringJobs.getAll() and walks the cadence forward from
  // startDate within a +/-90 day window.
  _getRecurringIndex: function() {
    if (typeof RecurringJobs === 'undefined') return {};
    if (window._bmRecurringCacheKey === SchedulePage._recurringCacheKey()) return window._bmRecurringCache;
    var idx = {};
    var intervals = { weekly:7, biweekly:14, monthly:30, quarterly:91, biannual:182, annual:365 };
    var rangeStart = new Date(); rangeStart.setDate(rangeStart.getDate() - 30);
    var rangeEnd = new Date(); rangeEnd.setDate(rangeEnd.getDate() + 120);
    RecurringJobs.getAll().forEach(function(rec) {
      if (!rec.active || !rec.startDate) return;
      var step = intervals[rec.frequency] || 30;
      var d = new Date(rec.startDate);
      if (isNaN(d)) return;
      // Walk forward to rangeStart
      while (d < rangeStart) d.setDate(d.getDate() + step);
      while (d <= rangeEnd) {
        var ds = SchedulePage._localDateStr(d);
        (idx[ds] = idx[ds] || []).push({
          id: rec.id,
          clientName: rec.clientName || 'client',
          service: rec.service || '',
          frequency: rec.frequency,
          price: rec.price || 0
        });
        d.setDate(d.getDate() + step);
      }
    });
    window._bmRecurringCache = idx;
    window._bmRecurringCacheKey = SchedulePage._recurringCacheKey();
    return idx;
  },
  _recurringCacheKey: function() {
    var n = (typeof RecurringJobs !== 'undefined') ? RecurringJobs.getAll().length : 0;
    return n + ':' + (Date.now() / 60000 | 0);
  },
  _getRecurringForDate: function(dateStr) {
    return SchedulePage._getRecurringIndex()[dateStr] || [];
  },
  _renderRecurringPill: function(r, compact) {
    function lastName(n) {
      if (!n) return 'client';
      var p = String(n).trim().split(/\s+/);
      return p[p.length - 1];
    }
    var openCall = "loadPage('recurring')";
    var displayText = compact ? ('R:' + lastName(r.clientName)) : ('🔁 ' + r.clientName + ' · ' + r.frequency);
    var titleText = UI.esc((r.clientName || 'client') + ' · ' + r.frequency + (r.service ? ' · ' + r.service : '') + (r.price ? ' · $' + r.price : '') + ' — recurring');
    if (compact) {
      return '<div onclick="event.stopPropagation();' + openCall + '" '
        + 'title="' + titleText + '" '
        + 'style="background:#ede7f6;color:#5e35b1;border-radius:3px;padding:1px 4px;margin-bottom:1px;font-size:9px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;">'
        + '🔁 ' + UI.esc(displayText) + '</div>';
    }
    return '<div onclick="event.stopPropagation();' + openCall + '" '
      + 'title="' + titleText + '" '
      + 'style="background:#ede7f6;border-left:3px solid #7b1fa2;color:#5e35b1;border-radius:4px;padding:4px 6px;margin-bottom:3px;font-size:11px;line-height:1.3;cursor:pointer;">'
      + UI.esc(displayText) + '</div>';
  },
  _recurringEnabled: function() {
    return localStorage.getItem('bm-cal-recurring') !== 'false';
  },
  _toggleRecurring: function() {
    var current = SchedulePage._recurringEnabled();
    localStorage.setItem('bm-cal-recurring', current ? 'false' : 'true');
    window._bmRecurringCacheKey = null;
    loadPage('schedule');
  },
  _renderReminderPill: function(r, compact) {
    var bg = r.kind === 'quote' ? '#fef3c7' : '#fee2e2';
    var bd = r.kind === 'quote' ? '#f59e0b' : '#dc2626';
    var fg = r.kind === 'quote' ? '#92400e' : '#991b1b';
    var openCall = "SchedulePage._openReminder('" + r.kind + "','" + r.id + "'," + r.stage + ")";
    var dismissCall = "event.stopPropagation();SchedulePage._markReminderSent('" + r.kind + "','" + r.id + "'," + r.stage + ")";
    var dragStart = "event.stopPropagation();SchedulePage._dragReminderStart(event,'" + r.kind + "','" + r.id + "'," + r.stage + ")";
    var displayText = compact ? (r.short || r.label) : r.label;
    var titleText = UI.esc(r.label) + ' — click to mark sent / open · drag to move · × to dismiss';
    if (compact) {
      return '<div draggable="true" '
        + 'ondragstart="' + dragStart + '" '
        + 'ondragend="SchedulePage._dragEnd(event)" '
        + 'onclick="event.stopPropagation();' + openCall + '" '
        + 'title="' + titleText + '" '
        + 'style="background:' + bg + ';color:' + fg + ';border-radius:3px;padding:1px 4px;margin-bottom:1px;font-size:9px;line-height:1.3;display:flex;align-items:center;gap:2px;cursor:grab;">'
        +   '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;">⏰ ' + UI.esc(displayText) + '</span>'
        +   '<span onclick="' + dismissCall + '" title="Dismiss" style="cursor:pointer;opacity:.55;font-size:11px;line-height:1;padding:0 2px;flex-shrink:0;">×</span>'
        + '</div>';
    }
    return '<div draggable="true" '
      + 'ondragstart="' + dragStart + '" '
      + 'ondragend="SchedulePage._dragEnd(event)" '
      + 'onclick="event.stopPropagation();' + openCall + '" '
      + 'title="' + titleText + '" '
      + 'style="background:' + bg + ';border-left:3px solid ' + bd + ';color:' + fg + ';border-radius:4px;padding:4px 6px;margin-bottom:3px;font-size:11px;line-height:1.3;display:flex;align-items:center;gap:6px;cursor:grab;">'
      +   '<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">⏰ ' + UI.esc(displayText) + '</span>'
      +   '<span onclick="' + dismissCall + '" title="Dismiss" style="cursor:pointer;opacity:.55;font-size:14px;line-height:1;padding:0 4px;flex-shrink:0;">×</span>'
      + '</div>';
  },

  _openReminder: function(kind, id, stage) {
    var item = (kind === 'quote') ? DB.quotes.getById(id) : DB.invoices.getById(id);
    if (!item) { UI.toast('Item not found'); return; }
    var num = (kind === 'quote' ? item.quoteNumber : item.invoiceNumber) || item.id;
    var noun = kind === 'quote' ? 'Quote' : 'Invoice';
    var stageName = stage === 2 ? '2nd follow-up' : '1st follow-up';
    var dollars = UI.moneyInt(item.total || 0);

    var body = '<div style="font-size:13px;line-height:1.5;">'
      + '<div style="font-weight:700;font-size:14px;margin-bottom:4px;">' + noun + ' #' + num + ' · ' + UI.esc(item.clientName || 'client') + '</div>'
      + '<div style="color:var(--text-light);font-size:12px;margin-bottom:14px;">' + dollars + ' · ' + stageName + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Mark this follow-up as already sent (so it disappears from your calendar), or open the ' + noun.toLowerCase() + ' to send it now.</div>'
      + '</div>';

    UI.modal(
      '⏰ Reminder',
      body,
      [
        { label: 'Mark Sent', fn: "SchedulePage._markReminderSent('" + kind + "','" + id + "'," + stage + ")" },
        { label: 'Open ' + noun, fn: "UI.closeModal();" + (kind === 'quote' ? 'QuotesPage' : 'InvoicesPage') + ".showDetail('" + id + "')", primary: true }
      ]
    );
  },

  _markReminderSent: function(kind, id, stage) {
    var key = stage === 2 ? 'followup2SentAt' : 'followupSentAt';
    var patch = {};
    patch[key] = new Date().toISOString();
    if (kind === 'quote') DB.quotes.update(id, patch);
    else DB.invoices.update(id, patch);
    window._bmRemindersCacheKey = null;
    UI.closeModal();
    UI.toast('Reminder dismissed');
    loadPage('schedule');
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
      +   '<h3 id="cal-title" onclick="SchedulePage._openMonthPicker(event)" title="Jump to month" style="font-size:16px;font-weight:700;white-space:nowrap;margin:0 4px;cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:4px;">' + self._getTitle() + '<span style="font-size:10px;color:var(--text-light);">&#9662;</span></h3>'
      +   '<input type="month" id="cal-month-picker" value="' + self.currentDate.getFullYear() + '-' + String(self.currentDate.getMonth()+1).padStart(2,'0') + '" onchange="SchedulePage._jumpToMonth(this.value)" style="position:absolute;width:0;height:0;opacity:0;border:none;padding:0;">'
      +   '<button class="btn btn-outline" onclick="SchedulePage.next()" style="padding:4px 10px;">&rarr;</button>'
      +   '<button class="btn btn-outline" onclick="SchedulePage.goToday()" style="font-size:12px;padding:4px 10px;">Today</button>'
      +   '<button onclick="JobsPage.showForm()" style="font-size:12px;padding:5px 12px;background:var(--green-dark);color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;white-space:nowrap;">+ New Job</button>'
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
      +   toggleSwitch('Reminders', SchedulePage._remindersEnabled(), 'SchedulePage._toggleReminders()')
      +   toggleSwitch('Recurring', SchedulePage._recurringEnabled(), 'SchedulePage._toggleRecurring()')
      +   ((self.view === 'week' || self.view === 'month') ? toggleSwitch('Panel', SchedulePage._dockedMapEnabled(), 'SchedulePage._toggleDockedMap()') : '')
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
    } else if (self.view === 'week' || self.view === 'month') {
      var showRail = self._dockedMapEnabled() && window.innerWidth >= 900;
      html += self._renderStatStrip(allJobs);
      var calBody = (self.view === 'week') ? self._renderWeek(showRail) : self._renderMonth(showRail);
      if (showRail) {
        html += '<div style="display:flex;gap:12px;align-items:flex-start;">'
          + '<div style="flex:1;min-width:0;">' + calBody + '</div>'
          + '<div style="width:320px;flex-shrink:0;position:sticky;top:8px;">' + self._renderRightRail() + '</div>'
          + '</div>';
      } else {
        html += calBody;
      }
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

  // Compact form for cramped calendar pills: "9a", "3p", "2:30p"
  _formatTimeShort: function(t) {
    if (!t) return '';
    var parts = t.split(':');
    var h = parseInt(parts[0]);
    if (isNaN(h)) return '';
    var m = parts[1] || '00';
    var suffix = h >= 12 ? 'p' : 'a';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return (m === '00' ? String(h) : h + ':' + m) + suffix;
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
          + 'style="background:var(--bg);border:1px solid var(--border);border-left:3px solid ' + SchedulePage._unscheduledStripe(j) + ';border-radius:6px;padding:8px 12px;cursor:grab;min-width:160px;flex-shrink:0;">'
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
  _dragReminder: null,

  _dragStart: function(e, jobId) {
    SchedulePage._dragJobId = jobId;
    SchedulePage._dragReminder = null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', jobId);
    e.target.style.opacity = '0.5';
  },

  _dragReminderStart: function(e, kind, id, stage) {
    SchedulePage._dragReminder = { kind: kind, id: id, stage: stage };
    SchedulePage._dragJobId = null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'reminder:' + kind + ':' + id + ':' + stage);
    e.target.style.opacity = '0.5';
  },

  _dragEnd: function(e) {
    e.target.style.opacity = '1';
  },

  _snoozeReminder: function(r, toDateStr) {
    var key = r.stage === 2 ? 'followup2SnoozedTo' : 'followupSnoozedTo';
    var patch = {};
    patch[key] = toDateStr + 'T12:00:00.000Z';
    if (r.kind === 'quote') DB.quotes.update(r.id, patch);
    else DB.invoices.update(r.id, patch);
    window._bmRemindersCacheKey = null;
    UI.toast('Reminder moved to ' + toDateStr);
    setTimeout(function() { loadPage('schedule'); }, 250);
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

  _remindersEnabled: function() {
    return localStorage.getItem('bm-cal-reminders') === 'true';
  },
  _toggleReminders: function() {
    var current = SchedulePage._remindersEnabled();
    localStorage.setItem('bm-cal-reminders', current ? 'false' : 'true');
    window._bmRemindersCacheKey = null;
    loadPage('schedule');
  },

  // Color the left-border stripe of unscheduled job cards by age.
  // 0–4 days: normal green. 5–9 days: amber. 10+ days: red.
  _unscheduledStripe: function(j) {
    var ts = j.createdAt || j.created_at || j.quoteApprovedAt || j.updatedAt;
    if (!ts) return 'var(--accent)';
    var ms = new Date(ts).getTime();
    if (isNaN(ms)) return 'var(--accent)';
    var ageDays = (Date.now() - ms) / 86400000;
    if (ageDays >= 10) return '#dc2626';
    if (ageDays >= 5) return '#f59e0b';
    return 'var(--accent)';
  },

  _dockedMapEnabled: function() {
    return localStorage.getItem('bm-cal-map') !== 'false';
  },
  _toggleDockedMap: function() {
    var current = SchedulePage._dockedMapEnabled();
    localStorage.setItem('bm-cal-map', current ? 'false' : 'true');
    if (SchedulePage._dockedMapInstance) {
      try { SchedulePage._dockedMapInstance.remove(); } catch(e){}
      SchedulePage._dockedMapInstance = null;
    }
    loadPage('schedule');
  },

  _photosEnabled: function() {
    return localStorage.getItem('bm-cal-photos') !== 'false';
  },

  _dropOnDay: function(e, dateStr) {
    e.preventDefault();
    var el = e.currentTarget;
    if (SchedulePage._dragReminder) {
      SchedulePage._flashDrop(el);
      var r = SchedulePage._dragReminder;
      SchedulePage._dragReminder = null;
      SchedulePage._snoozeReminder(r, dateStr);
      return;
    }
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
    if (SchedulePage._dragReminder) {
      SchedulePage._flashDrop(el);
      var r = SchedulePage._dragReminder;
      SchedulePage._dragReminder = null;
      SchedulePage._markReminderSent(r.kind, r.id, r.stage);
      return;
    }
    var jobId = SchedulePage._dragJobId;
    if (!jobId) return;
    SchedulePage._flashDrop(el);
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

  _renderWeek: function(skipUnscheduledBanner) {
    var d = new Date(SchedulePage.currentDate);
    d.setDate(d.getDate() - d.getDay());
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var today = SchedulePage._localDateStr(new Date());
    var allJobs = DB.jobs.getAll();
    if (localStorage.getItem('bm-cal-show-archived') !== 'true') allJobs = allJobs.filter(function(_j){ return _j.status !== 'archived'; });
    var html = '';

    // Unscheduled jobs panel — suppressed when right-rail Unscheduled tab takes over
    var unscheduled = allJobs.filter(function(j) { return !j.scheduledDate && j.status !== 'completed' && j.status !== 'cancelled'; });
    if (skipUnscheduledBanner) {
      // Right rail handles this — skip duplicate.
    } else {
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
          + 'style="background:var(--bg);border:1px solid var(--border);border-left:3px solid ' + SchedulePage._unscheduledStripe(j) + ';border-radius:6px;padding:8px 12px;cursor:grab;min-width:160px;flex-shrink:0;">'
          + '<div style="font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.clientName || '#' + j.jobNumber) + '</div>'
          + '<div style="font-size:11px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.description || '') + '</div>'
          + '<div style="font-weight:700;font-size:12px;color:var(--green-dark);margin-top:4px;">' + UI.moneyInt(j.total) + '</div></div>';
      });
      html += '</div>';
    } else {
      html += '<div style="font-size:12px;color:var(--text-light);padding:6px 0;">None — drop a scheduled job here to unschedule it.</div>';
    }
    html += '</div>';
    } // end skipUnscheduledBanner else

    html += '<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;background:var(--border);border-radius:12px;overflow:hidden;border:1px solid var(--border);">';

    // Header
    for (var i = 0; i < 7; i++) {
      var dd = new Date(d);
      dd.setDate(dd.getDate() + i);
      var dateStr = SchedulePage._localDateStr(dd);
      var isToday = dateStr === today;
      html += '<div style="background:var(--bg);color:var(--text);padding:6px 8px 8px;text-align:center;font-size:12px;font-weight:700;">'
        + (typeof Weather !== 'undefined' ? '<div style="margin-bottom:2px;min-height:16px;">' + Weather.getInline(dateStr) + '</div>' : '')
        + days[i] + '<br>'
        + (isToday
          ? '<span style="display:inline-flex;width:28px;height:28px;border-radius:50%;background:var(--green-dark);color:#fff;align-items:center;justify-content:center;font-size:15px;font-weight:800;">' + dd.getDate() + '</span>'
          : '<span style="font-size:18px;font-weight:800;">' + dd.getDate() + '</span>')
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
        + 'style="background:var(--white);min-height:120px;padding:6px;cursor:pointer;transition:background .15s,box-shadow .15s;position:relative;"'
        + ' onmouseover="var b=this.querySelector(\'.bm-cell-add\');if(b)b.style.opacity=1" onmouseout="var b=this.querySelector(\'.bm-cell-add\');if(b)b.style.opacity=0">'
        + '<button class="bm-cell-add" onclick="event.stopPropagation();JobsPage.showForm(null,{date:\'' + dateStr + '\'})" title="New job on ' + dateStr + '" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;border:none;background:var(--green-dark);color:#fff;font-size:15px;line-height:1;cursor:pointer;opacity:0;transition:opacity .15s;padding:0;font-weight:700;z-index:2;">+</button>';
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
        var wkTime = SchedulePage._formatTimeShort(j.startTime);
        html += '<div draggable="true" ondragstart="event.stopPropagation();SchedulePage._dragStart(event,\'' + j.id + '\')" ondragend="SchedulePage._dragEnd(event)" onclick="event.stopPropagation();JobsPage.showDetail(\'' + j.id + '\')" style="background:' + bgColor + ';border-left:3px solid ' + borderColor + ';border-radius:6px;padding:6px 8px;margin-bottom:4px;cursor:grab;font-size:12px;">'
          + '<div style="font-weight:700;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (wkTime ? '<span style="color:var(--green-dark);">' + wkTime + '</span> ' : '') + UI.esc(j.clientName || '') + '</div>'
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
      // v677: Quote/invoice reminder pills (Jobber-style)
      if (SchedulePage._remindersEnabled()) {
        var weekReminders = SchedulePage._getRemindersForDate(dateStr);
        weekReminders.forEach(function(r) { html += SchedulePage._renderReminderPill(r, false); });
      }
      if (SchedulePage._recurringEnabled()) {
        var weekRec = SchedulePage._getRecurringForDate(dateStr);
        weekRec.forEach(function(r) { html += SchedulePage._renderRecurringPill(r, false); });
      }
      html += '</div>';
    }
    html += '</div>';

    return html;
  },

  _renderMonth: function(skipUnscheduledBanner) {
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

    // Unscheduled jobs panel — suppressed when right-rail Unscheduled tab takes over
    var unscheduled = allJobs.filter(function(j) { return !j.scheduledDate && j.status !== 'completed' && j.status !== 'cancelled'; });
    if (skipUnscheduledBanner) {
      // Right rail handles this — skip duplicate.
    } else {
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
          + 'style="background:var(--bg);border:1px solid var(--border);border-left:3px solid ' + SchedulePage._unscheduledStripe(j) + ';border-radius:6px;padding:8px 12px;cursor:grab;min-width:160px;flex-shrink:0;">'
          + '<div style="font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.clientName || '#' + j.jobNumber) + '</div>'
          + '<div style="font-size:11px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.description || '') + '</div>'
          + '<div style="font-weight:700;font-size:12px;color:var(--green-dark);margin-top:4px;">' + UI.moneyInt(j.total) + '</div></div>';
      });
      html += '</div>';
    } else {
      html += '<div style="font-size:12px;color:var(--text-light);padding:6px 0;">None — drop a scheduled job here to unschedule it.</div>';
    }
    html += '</div>';
    } // end skipUnscheduledBanner else

    html += '<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;background:var(--border);border-radius:12px;overflow:hidden;border:1px solid var(--border);">';

    days.forEach(function(day) {
      html += '<div style="background:var(--bg);padding:8px;text-align:center;font-size:11px;font-weight:700;color:var(--text-light);">' + day + '</div>';
    });

    for (var i = 0; i < firstDay; i++) {
      html += '<div style="background:#fafafa;min-height:80px;padding:4px;"></div>';
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      var isToday = dateStr === today;
      var wkday = (firstDay + day - 1) % 7;
      var isWeekend = (wkday === 0 || wkday === 6);
      var cellBg = isWeekend ? '#f7f8fa' : 'var(--white)';
      var dayJobs = allJobs.filter(function(j) { return j.scheduledDate && j.scheduledDate.substring(0,10) === dateStr; });

      html += '<div data-date="' + dateStr + '" '
        + 'ondragover="event.preventDefault();this.style.background=\'#e8f5e9\';this.style.boxShadow=\'inset 0 0 0 2px #4caf50\'" '
        + 'ondragleave="this.style.background=\'' + cellBg + '\';this.style.boxShadow=\'none\'" '
        + 'ondrop="SchedulePage._dropOnDay(event,\'' + dateStr + '\')" '
        + 'onclick="SchedulePage.currentDate=new Date(\'' + dateStr + 'T12:00:00\');SchedulePage.setView(\'day\')" '
        + 'style="background:' + cellBg + ';min-height:80px;padding:4px;cursor:pointer;transition:background .15s;position:relative;"'
        + ' onmouseover="var b=this.querySelector(\'.bm-cell-add\');if(b)b.style.opacity=1" onmouseout="var b=this.querySelector(\'.bm-cell-add\');if(b)b.style.opacity=0">'
        + '<button class="bm-cell-add" onclick="event.stopPropagation();JobsPage.showForm(null,{date:\'' + dateStr + '\'})" title="New job on ' + dateStr + '" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;border:none;background:var(--green-dark);color:#fff;font-size:13px;line-height:1;cursor:pointer;opacity:0;transition:opacity .15s;padding:0;font-weight:700;">+</button>'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">'
        + (isToday
            ? '<span style="display:inline-flex;width:22px;height:22px;border-radius:50%;background:var(--green-dark);color:#fff;align-items:center;justify-content:center;font-size:11px;font-weight:800;">' + day + '</span>'
            : '<span style="font-size:12px;font-weight:600;color:var(--text);">' + day + '</span>')
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
        var moTime = SchedulePage._formatTimeShort(j.startTime);
        html += '<div draggable="true" ondragstart="event.stopPropagation();SchedulePage._dragStart(event,\'' + j.id + '\')" ondragend="SchedulePage._dragEnd(event)" '
          + 'onclick="event.stopPropagation();JobsPage.showDetail(\'' + j.id + '\')" '
          + 'style="background:' + bgColor + ';border-radius:4px;padding:2px 4px;margin-bottom:2px;cursor:grab;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
          + (moTime ? '<b style="color:var(--green-dark);">' + moTime + '</b> ' : '')
          + (j.clientName || '#' + j.jobNumber)
          + (mPhotos.length > 0 ? ' 📷' + mPhotos.length : '')
          + '</div>';
      });
      // Admin task dots for this day
      var monthAdminTasks = (typeof AdminTasks !== 'undefined') ? AdminTasks.getForDate(dateStr) : [];
      monthAdminTasks.forEach(function(t) {
        html += '<div style="font-size:9px;color:#7b1fa2;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" onclick="event.stopPropagation();AdminTasks.toggleComplete(\'' + t.id + '\')">&#x25CF; ' + UI.esc(t.title) + '</div>';
      });
      // v677: Quote/invoice reminder pills (Jobber-style, click → detail)
      if (SchedulePage._remindersEnabled()) {
        var monthReminders = SchedulePage._getRemindersForDate(dateStr);
        monthReminders.forEach(function(r) { html += SchedulePage._renderReminderPill(r, true); });
      }
      if (SchedulePage._recurringEnabled()) {
        var monthRec = SchedulePage._getRecurringForDate(dateStr);
        monthRec.forEach(function(r) { html += SchedulePage._renderRecurringPill(r, true); });
      }
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

  _openMonthPicker: function(event) {
    var picker = document.getElementById('cal-month-picker');
    if (!picker) return;
    if (event && event.target) {
      var rect = event.target.getBoundingClientRect();
      picker.style.left = (rect.left + window.scrollX) + 'px';
      picker.style.top = (rect.bottom + window.scrollY) + 'px';
    }
    if (typeof picker.showPicker === 'function') {
      try { picker.showPicker(); return; } catch(e) {}
    }
    picker.focus();
    picker.click();
  },
  _jumpToMonth: function(val) {
    if (!val) return;
    var parts = val.split('-');
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) - 1;
    if (isNaN(y) || isNaN(m)) return;
    SchedulePage.currentDate = new Date(y, m, 1, 12, 0, 0);
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
  },

  _renderStatStrip: function(allJobs) {
    var range = SchedulePage._rangeForView();
    var rangeJobs = allJobs.filter(function(j) {
      if (!j.scheduledDate) return false;
      var ds = j.scheduledDate.substring(0,10);
      return ds >= range.start && ds <= range.end;
    });
    var revenue = rangeJobs.reduce(function(s, j) { return s + (Number(j.total) || 0); }, 0);
    var completed = rangeJobs.filter(function(j) { return j.status === 'completed'; }).length;
    var unscheduled = allJobs.filter(function(j) {
      return !j.scheduledDate && j.status !== 'completed' && j.status !== 'cancelled';
    });
    var queueValue = unscheduled.reduce(function(s, j) { return s + (Number(j.total) || 0); }, 0);
    var rangeLabel = SchedulePage.view === 'week' ? 'This Week' : 'This Month';

    function pill(label, value, color) {
      return '<div style="background:var(--white);border:1px solid var(--border);border-radius:8px;padding:6px 12px;display:inline-flex;align-items:baseline;gap:6px;">'
        + '<span style="font-size:11px;color:var(--text-light);font-weight:600;text-transform:uppercase;letter-spacing:.3px;">' + label + '</span>'
        + '<span style="font-size:14px;font-weight:800;color:' + (color || 'var(--text)') + ';">' + value + '</span>'
        + '</div>';
    }

    return '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center;">'
      + '<span style="font-size:11px;color:var(--text-light);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-right:4px;">' + rangeLabel + '</span>'
      + pill('Jobs', rangeJobs.length)
      + pill('Revenue', UI.moneyInt(revenue), 'var(--green-dark)')
      + pill('Done', completed + '/' + rangeJobs.length)
      + pill('Queue', unscheduled.length + (queueValue ? ' · ' + UI.moneyInt(queueValue) : ''), unscheduled.length > 0 ? '#e07c24' : 'var(--text-light)')
      + '</div>';
  },

  _rangeForView: function() {
    var d = SchedulePage.currentDate;
    var start, end;
    if (SchedulePage.view === 'week') {
      start = new Date(d); start.setDate(start.getDate() - start.getDay());
      end = new Date(start); end.setDate(end.getDate() + 6);
    } else {
      var first = new Date(d.getFullYear(), d.getMonth(), 1);
      start = new Date(first); start.setDate(start.getDate() - first.getDay());
      var last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      end = new Date(last); end.setDate(end.getDate() + (6 - last.getDay()));
    }
    return { start: SchedulePage._localDateStr(start), end: SchedulePage._localDateStr(end) };
  },

  _railTab: function() {
    var t = localStorage.getItem('bm-cal-rail-tab');
    return (t === 'unscheduled') ? 'unscheduled' : 'map';
  },
  _setRailTab: function(tab) {
    localStorage.setItem('bm-cal-rail-tab', tab);
    if (SchedulePage._dockedMapInstance) {
      try { SchedulePage._dockedMapInstance.remove(); } catch(e){}
      SchedulePage._dockedMapInstance = null;
    }
    loadPage('schedule');
  },

  _renderRightRail: function() {
    var allJobs = DB.jobs.getAll();
    if (localStorage.getItem('bm-cal-show-archived') !== 'true') {
      allJobs = allJobs.filter(function(j) { return j.status !== 'archived'; });
    }
    var unscheduled = allJobs.filter(function(j) {
      return !j.scheduledDate && j.status !== 'completed' && j.status !== 'cancelled';
    });
    var activeTab = SchedulePage._railTab();

    function tabBtn(key, label) {
      var active = activeTab === key;
      return '<button onclick="SchedulePage._setRailTab(\'' + key + '\')" '
        + 'style="flex:1;padding:8px 10px;font-size:12px;font-weight:700;border:none;cursor:pointer;'
        + 'background:' + (active ? 'var(--white)' : 'var(--bg)') + ';'
        + 'color:' + (active ? 'var(--text)' : 'var(--text-light)') + ';'
        + 'border-bottom:' + (active ? '2px solid var(--green-dark)' : '2px solid transparent') + ';'
        + 'transition:background .15s,color .15s;">'
        + label + '</button>';
    }

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">'
      + '<div style="display:flex;border-bottom:1px solid var(--border);">'
      +   tabBtn('map', 'Map')
      +   tabBtn('unscheduled', 'Unscheduled' + (unscheduled.length ? ' (' + unscheduled.length + ')' : ''))
      +   '<button onclick="SchedulePage._toggleDockedMap()" title="Hide panel" '
      +     'style="padding:0 10px;background:var(--bg);border:none;border-bottom:2px solid transparent;font-size:18px;line-height:1;cursor:pointer;color:var(--text-light);">&times;</button>'
      + '</div>';

    if (activeTab === 'map') {
      html += SchedulePage._renderRailMap(allJobs);
    } else {
      html += SchedulePage._renderRailUnscheduled(unscheduled);
    }

    html += '</div>';
    return html;
  },

  _renderRailMap: function(allJobs) {
    var range = SchedulePage._rangeForView();
    var rangeJobs = allJobs.filter(function(j) {
      if (!j.scheduledDate) return false;
      var ds = j.scheduledDate.substring(0,10);
      return ds >= range.start && ds <= range.end && (j.lat || j.latitude) && (j.lng || j.longitude || j.lon);
    });

    var html = '<div id="schedule-map-docked" style="height:480px;width:100%;background:#e8eef2;"></div>'
      + '<div style="padding:6px 12px;font-size:11px;color:var(--text-light);background:var(--bg);border-top:1px solid var(--border);text-align:center;">'
      + rangeJobs.length + ' job' + (rangeJobs.length === 1 ? '' : 's') + ' in view'
      + '</div>';

    setTimeout(function() {
      var el = document.getElementById('schedule-map-docked');
      if (!el || typeof maplibregl === 'undefined') return;
      if (SchedulePage._dockedMapInstance) {
        try { SchedulePage._dockedMapInstance.remove(); } catch(e){}
        SchedulePage._dockedMapInstance = null;
      }
      try {
        var first = rangeJobs[0];
        var centerLng = first ? Number(first.lng || first.longitude || first.lon) : -73.9211;
        var centerLat = first ? Number(first.lat || first.latitude) : 41.2901;
        var map = new maplibregl.Map({
          container: el,
          style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
          center: [centerLng, centerLat],
          zoom: rangeJobs.length ? 10 : 9
        });
        map.addControl(new maplibregl.NavigationControl(), 'top-right');
        SchedulePage._dockedMapInstance = map;
        map.on('load', function() {
          var bounds = new maplibregl.LngLatBounds();
          var anyAdded = false;
          rangeJobs.forEach(function(j) {
            var lng = Number(j.lng || j.longitude || j.lon);
            var lat = Number(j.lat || j.latitude);
            if (!lng || !lat) return;
            var statusColor = j.status === 'completed' ? '#2e7d32'
              : j.status === 'in_progress' ? '#e07c24'
              : j.status === 'late' ? '#c62828'
              : '#1565c0';
            var pin = document.createElement('div');
            pin.style.cssText = 'width:22px;height:22px;border-radius:50%;background:' + statusColor + ';border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:pointer;';
            pin.title = (j.clientName || '') + (j.scheduledDate ? ' · ' + j.scheduledDate.substring(5,10) : '');
            pin.onclick = function() { JobsPage.showDetail(j.id); };
            new maplibregl.Marker({ element: pin })
              .setLngLat([lng, lat])
              .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(
                '<div style="font-size:13px;font-weight:700;">' + UI.esc(j.clientName || '') + '</div>'
                + (j.scheduledDate ? '<div style="font-size:11px;color:#666;">' + UI.esc(j.scheduledDate.substring(0,10)) + (j.startTime ? ' · ' + UI.esc(j.startTime) : '') + '</div>' : '')
                + (j.property ? '<div style="font-size:11px;margin-top:3px;">' + UI.esc(j.property) + '</div>' : '')
              ))
              .addTo(map);
            bounds.extend([lng, lat]);
            anyAdded = true;
          });
          if (anyAdded && rangeJobs.length > 1) map.fitBounds(bounds, { padding: 30, maxZoom: 13 });
        });
      } catch(e) {
        el.innerHTML = '<div style="padding:18px;text-align:center;color:var(--text-light);font-size:12px;">Map failed: ' + e.message + '</div>';
      }
    }, 80);

    return html;
  },

  _renderRailUnscheduled: function(unscheduled) {
    var html = '<div id="sched-rail-unscheduled" '
      + 'ondragover="event.preventDefault();this.style.background=\'#fff3e0\';this.style.boxShadow=\'inset 0 0 0 2px #e07c24\'" '
      + 'ondragleave="this.style.background=\'var(--white)\';this.style.boxShadow=\'none\'" '
      + 'ondrop="SchedulePage._dropOnUnscheduled(event)" '
      + 'style="background:var(--white);transition:background .15s;">'
      + '<div style="max-height:440px;overflow-y:auto;padding:8px;">';

    if (unscheduled.length === 0) {
      html += '<div style="padding:32px 12px;text-align:center;font-size:12px;color:var(--text-light);line-height:1.5;">'
        +   'No unscheduled jobs.<br>'
        +   '<span style="font-size:11px;">Drag a scheduled job here to unschedule it.</span>'
        +   '</div>';
    } else {
      unscheduled.forEach(function(j) {
        html += '<div draggable="true" '
          + 'ondragstart="SchedulePage._dragStart(event,\'' + j.id + '\')" '
          + 'ondragend="SchedulePage._dragEnd(event)" '
          + 'onclick="JobsPage.showDetail(\'' + j.id + '\')" '
          + 'style="background:var(--bg);border:1px solid var(--border);border-left:3px solid ' + SchedulePage._unscheduledStripe(j) + ';border-radius:6px;padding:8px 10px;margin-bottom:6px;cursor:grab;">'
          + '<div style="font-weight:700;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.clientName || '#' + j.jobNumber) + '</div>'
          + (j.description ? '<div style="font-size:11px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.description) + '</div>' : '')
          + '<div style="font-weight:700;font-size:12px;color:var(--green-dark);margin-top:3px;">' + UI.moneyInt(j.total) + '</div>'
          + '</div>';
      });
    }

    html += '</div>'  // close scrollable
      + '<div style="padding:6px 12px;font-size:11px;color:var(--text-light);background:var(--bg);border-top:1px solid var(--border);text-align:center;">'
      +   (unscheduled.length === 0 ? 'Empty queue' : unscheduled.length + ' awaiting schedule')
      + '</div>'
      + '</div>';  // close drop-target wrapper
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
