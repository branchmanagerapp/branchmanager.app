/**
 * Branch Manager — Time Tracking
 * Employee clock in/out per job, timesheets
 * Accessible from dashboard for crew members
 */
var TimeTrackPage = {
  _tab: 'mine',

  get currentUser() { return (typeof Auth !== 'undefined' && Auth.user && Auth.user.name) ? Auth.user.name : (CompanyInfo.get('ownerName') || 'Owner'); },

  get isOwnerOrManager() {
    if (typeof Auth === 'undefined' || !Auth.user) return true; // default to full access
    return Auth.user.role === 'owner' || Auth.user.role === 'manager';
  },

  setTab: function(tab) {
    TimeTrackPage._tab = tab;
    var content = document.getElementById('timetrack-content');
    if (!content) return;
    content.innerHTML = tab === 'mine' ? TimeTrackPage._renderMyTime() : TimeTrackPage._renderAllEmployees();
    // Update tab button styles
    ['mine','all'].forEach(function(t) {
      var btn = document.getElementById('tab-tt-' + t);
      if (!btn) return;
      if (t === tab) {
        btn.style.borderBottom = '3px solid var(--green-dark)';
        btn.style.color = 'var(--green-dark)';
        btn.style.fontWeight = '700';
        btn.style.background = 'transparent';
      } else {
        btn.style.borderBottom = '3px solid transparent';
        btn.style.color = 'var(--text-light)';
        btn.style.fontWeight = '500';
        btn.style.background = 'transparent';
      }
    });
  },

  render: function() {
    var html = '<div style="max-width:900px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      + '<h2 style="margin:0;">Time Tracking</h2>'
      + '<button class="btn btn-outline" onclick="TimeTrackPage.openManualEntry()" style="font-size:13px;">+ Manual Entry</button>'
      + '</div>';

    if (TimeTrackPage.isOwnerOrManager) {
      var activeTab = TimeTrackPage._tab;
      var tabStyle = 'padding:10px 20px;border:none;cursor:pointer;font-size:14px;transition:all .15s;border-bottom:3px solid transparent;';
      function tabBtn(key, label) {
        var on = activeTab === key;
        return '<button id="tab-tt-' + key + '" onclick="TimeTrackPage.setTab(\'' + key + '\')" style="' + tabStyle
          + (on ? 'border-bottom:3px solid var(--green-dark);color:var(--green-dark);font-weight:700;background:transparent;' : 'color:var(--text-light);font-weight:500;background:transparent;')
          + '">' + label + '</button>';
      }
      html += '<div style="display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid var(--border);">'
        + tabBtn('mine', 'My Time')
        + tabBtn('all', 'All Employees')
        + tabBtn('trucks', '🚛 Truck Hours')
        + '</div>';
    }

    var content;
    if (TimeTrackPage._tab === 'trucks' && TimeTrackPage.isOwnerOrManager) {
      content = TimeTrackPage._renderTruckHours();
    } else if (TimeTrackPage._tab === 'all' && TimeTrackPage.isOwnerOrManager) {
      content = TimeTrackPage._renderAllEmployees();
    } else {
      content = TimeTrackPage._renderMyTime();
    }
    html += '<div id="timetrack-content">' + content + '</div>';

    // Manual entry modal placeholder
    html += TimeTrackPage._renderManualEntryModal();

    html += '</div>';
    return html;
  },

  _renderMyTime: function() {
    var html = TimeTrackPage.renderClockWidget();
    html += TimeTrackPage.renderTimesheet();
    html += TimeTrackPage._renderPayPeriodSummary();
    return html;
  },

  // v740: Truck Hours tab — falls back to GPS-derived work hours when an
  // employee forgets to clock in, or as company-wide policy. Pulls from
  // public.vehicle_daily_hours view (created in
  // 20260510_vehicle_daily_hours_view.sql). Adds a configurable prep
  // buffer (default 30 min) on top of road time to account for yard
  // load-up, equipment checks, etc.
  // v745: click-to-focus a Truck Hours row. Stores the row key
  // (vehicle_id + '__' + day) so a redraw preserves the focus.
  _activeTruckRowKey: null,
  _focusTruckRow: function(keyEnc) {
    var key = decodeURIComponent(keyEnc);
    TimeTrackPage._activeTruckRowKey = (TimeTrackPage._activeTruckRowKey === key) ? null : key;
    TimeTrackPage._renderTruckHoursAsync();
  },

  _truckPrepBufferMin: function() {
    var v = parseInt(localStorage.getItem('bm-truck-prep-buffer-min') || '30', 10);
    return isNaN(v) ? 30 : v;
  },
  _setTruckPrepBuffer: function(min) {
    var n = parseInt(min, 10);
    if (isNaN(n) || n < 0) n = 0;
    if (n > 240) n = 240;
    localStorage.setItem('bm-truck-prep-buffer-min', String(n));
    TimeTrackPage._renderTruckHoursAsync();
  },
  _renderTruckHours: function() {
    // Kick off the fetch right after render; placeholder shown until then.
    setTimeout(TimeTrackPage._renderTruckHoursAsync, 30);
    var buf = TimeTrackPage._truckPrepBufferMin();
    return '<div id="truck-hours-root">'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">'
      +   '<div>'
      +     '<div style="font-size:13px;font-weight:700;">Prep buffer (per truck-day)</div>'
      +     '<div style="font-size:12px;color:var(--text-light);">Added on top of road time to cover yard load-up, equipment checks, drive prep.</div>'
      +   '</div>'
      +   '<div style="display:inline-flex;align-items:center;gap:8px;">'
      +     '<input type="number" id="truck-prep-buf" value="' + buf + '" min="0" max="240" '
      +       'onchange="TimeTrackPage._setTruckPrepBuffer(this.value)" '
      +       'style="width:80px;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-weight:600;text-align:center;">'
      +     '<span style="font-size:13px;color:var(--text-light);">min</span>'
      +   '</div>'
      + '</div>'
      + '<div id="truck-hours-list" style="padding:40px 16px;text-align:center;color:var(--text-light);font-size:13px;">Loading truck hours…</div>'
      + '</div>';
  },

  _renderTruckHoursAsync: function() {
    var listEl = document.getElementById('truck-hours-list');
    if (!listEl) return;
    var sb = (typeof SupabaseDB !== 'undefined') ? SupabaseDB.client : null;
    if (!sb) {
      listEl.innerHTML = '<div style="color:#c62828;">Supabase not connected — sign in and retry.</div>';
      return;
    }
    var cutoff = new Date(Date.now() - 14 * 86400000).toISOString().substring(0, 10);
    sb.from('vehicle_daily_hours')
      .select('*')
      .gte('day', cutoff)
      .order('day', { ascending: false })
      .then(function(r) {
        if (r.error) {
          listEl.innerHTML = '<div style="color:#c62828;">Couldn\'t load truck hours: ' + (r.error.message || 'unknown error') + '</div>';
          return;
        }
        listEl.innerHTML = TimeTrackPage._renderTruckRows(r.data || []);
      });
  },

  _renderTruckRows: function(rows) {
    if (!rows.length) {
      return '<div style="padding:30px;text-align:center;color:var(--text-light);font-size:13px;background:var(--white);border:1px solid var(--border);border-radius:10px;">'
        + 'No truck activity in the last 14 days.'
        + '</div>';
    }
    var prepMin = TimeTrackPage._truckPrepBufferMin();
    function fmtTime(iso) {
      try {
        var d = new Date(iso);
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      } catch(e) { return iso; }
    }
    function fmtDate(d) {
      try {
        var dt = new Date(d + 'T12:00:00');
        return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      } catch(e) { return d; }
    }
    function fmtDuration(sec) {
      var h = Math.floor(sec / 3600);
      var m = Math.round((sec - h * 3600) / 60);
      return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
    }

    // Group by day
    var byDay = {};
    rows.forEach(function(r) {
      (byDay[r.day] = byDay[r.day] || []).push(r);
    });
    var days = Object.keys(byDay).sort().reverse();
    var me = TimeTrackPage.currentUser;

    var html = '';
    days.forEach(function(day) {
      html += '<div style="margin-bottom:14px;background:var(--white);border:1px solid var(--border);border-radius:10px;overflow:hidden;">'
        +   '<div style="padding:10px 14px;background:var(--bg);border-bottom:1px solid var(--border);font-weight:700;font-size:13px;">' + fmtDate(day) + '</div>';
      byDay[day].forEach(function(r) {
        var roadSec = r.duration_seconds || 0;
        var paidSec = roadSec + prepMin * 60;
        var paidHrs = (paidSec / 3600).toFixed(2);
        var displayName = r.vehicle_nickname || r.vehicle_name || 'Unnamed truck';
        var driver = r.driver_name || '';
        var driverIsMe = driver && driver.trim().toLowerCase() === (me || '').trim().toLowerCase();
        var encVeh = encodeURIComponent(r.vehicle_id);
        var encDay = encodeURIComponent(r.day);
        var encFirst = encodeURIComponent(r.first_seen_ts);
        var encLast = encodeURIComponent(r.last_seen_ts);

        var driverPill = '<button onclick="TimeTrackPage._editTruckDriver(\'' + encVeh + '\',\'' + encDay + '\')" '
          + 'style="background:' + (driver ? 'var(--green-bg)' : '#fef3c7') + ';color:' + (driver ? 'var(--green-dark)' : '#92400e') + ';'
          + 'border:1px solid ' + (driver ? 'var(--green-dark)' : '#fbbf24') + ';border-radius:14px;'
          + 'padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;margin-top:4px;" '
          + 'title="' + (r.driver_is_override ? 'Day-specific assignment' : (driver ? 'Default driver' : 'No driver assigned')) + '">'
          + '👤 ' + (driver ? UI.esc(driver) : 'Assign driver') + (r.driver_is_override ? ' *' : '')
          + '</button>';

        var applyBtn;
        if (driverIsMe || !driver) {
          applyBtn = '<button onclick="TimeTrackPage._applyTruckDayToTimesheet(\'' + encVeh + '\',\'' + encDay + '\',\'' + encFirst + '\',\'' + encLast + '\',\'' + (driver ? encodeURIComponent(driver) : encodeURIComponent(me)) + '\')" '
            + 'style="background:var(--green-dark);color:#fff;border:0;border-radius:6px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;margin-top:6px;">'
            + '⏱ Apply to my timesheet' + '</button>';
        } else {
          applyBtn = '<button onclick="TimeTrackPage._applyTruckDayToTimesheet(\'' + encVeh + '\',\'' + encDay + '\',\'' + encFirst + '\',\'' + encLast + '\',\'' + encodeURIComponent(driver) + '\')" '
            + 'style="background:var(--white);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:7px 12px;font-size:12px;font-weight:600;cursor:pointer;margin-top:6px;">'
            + '⏱ Apply to ' + UI.esc(driver.split(' ')[0]) + '&rsquo;s timesheet' + '</button>';
        }

        // v745: click-to-focus a row. Click expands a detail strip with
        // recent positions + action buttons; click another to move the
        // focus. State held in TimeTrackPage._activeTruckRowKey so re-
        // renders keep it.
        var rowKey = r.vehicle_id + '__' + r.day;
        var isFocused = TimeTrackPage._activeTruckRowKey === rowKey;
        html += '<div onclick="TimeTrackPage._focusTruckRow(\'' + encodeURIComponent(rowKey) + '\')" '
          + 'style="padding:12px 14px;border-bottom:1px solid #f5f5f5;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;cursor:pointer;'
          + (isFocused ? 'background:#f0fdf4;border-left:3px solid var(--green-dark);' : 'border-left:3px solid transparent;')
          + '">'
          +   '<div style="flex:1;min-width:0;">'
          +     '<div style="font-weight:700;font-size:14px;">🚛 ' + (UI.esc ? UI.esc(displayName) : displayName) + '</div>'
          +     '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">'
          +       fmtTime(r.first_seen_ts) + ' → ' + fmtTime(r.last_seen_ts)
          +       ' · ' + r.ping_count + ' pings'
          +       (r.max_speed_mph ? ' · max ' + Math.round(r.max_speed_mph) + ' mph' : '')
          +     '</div>'
          +     driverPill
          +   '</div>'
          +   '<div style="text-align:right;flex-shrink:0;" onclick="event.stopPropagation()">'
          +     '<div style="font-size:11px;color:var(--text-light);">Road ' + fmtDuration(roadSec) + '</div>'
          +     '<div style="font-size:16px;font-weight:800;color:var(--green-dark);">' + fmtDuration(paidSec) + '</div>'
          +     '<div style="font-size:10px;color:var(--text-light);">incl. ' + prepMin + 'm prep · ' + paidHrs + 'h</div>'
          +     applyBtn
          +   '</div>'
          + '</div>';
        // Expanded detail strip
        if (isFocused) {
          html += '<div style="background:#f9fafb;padding:10px 14px;border-bottom:1px solid #f5f5f5;font-size:12px;color:var(--text-light);display:flex;flex-wrap:wrap;gap:12px;align-items:center;">'
            +   '<span><b style="color:var(--text);">Day window:</b> ' + fmtDuration(roadSec) + ' of road time</span>'
            +   '<span><b style="color:var(--text);">Pings:</b> ' + r.ping_count + '</span>'
            +   (r.max_speed_mph ? '<span><b style="color:var(--text);">Top speed:</b> ' + Math.round(r.max_speed_mph) + ' mph</span>' : '')
            +   '<span style="margin-left:auto;display:flex;gap:6px;" onclick="event.stopPropagation()">'
            +     '<button onclick="window._opsTab=\'dispatch\';loadPage(\'operations\')" '
            +       'style="font-size:11px;padding:4px 10px;border:1px solid var(--border);background:var(--white);border-radius:6px;cursor:pointer;">🗺 Open on map</button>'
            +   '</span>'
            + '</div>';
        }
      });
      html += '</div>';
    });
    return html;
  },

  // v741: Apply a truck-day window to a timesheet. Creates a timeEntries
  // row using first/last ping ± prep buffer (prep is added to clock-in,
  // not clock-out, so the entry reflects "got to yard 30 min early").
  _applyTruckDayToTimesheet: function(vehicleId, day, firstIso, lastIso, driverEnc) {
    var first = decodeURIComponent(firstIso);
    var last = decodeURIComponent(lastIso);
    var driver = driverEnc ? decodeURIComponent(driverEnc) : TimeTrackPage.currentUser;
    var prepMin = TimeTrackPage._truckPrepBufferMin();
    var firstDt = new Date(first);
    var clockIn = new Date(firstDt.getTime() - prepMin * 60000).toISOString();
    var clockOut = last;
    var hours = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000;
    if (!isFinite(hours) || hours <= 0) {
      UI.toast('Invalid window — cannot apply');
      return;
    }
    // Dedupe: if there's already a truck-derived entry for this user/day, replace it.
    var dayStr = decodeURIComponent(day);
    var existing = DB.timeEntries.getAll().filter(function(t) {
      return (t.user === driver || t.userId === driver)
        && (t.date || '').indexOf(dayStr) === 0
        && t.source === 'truck-derived';
    });
    if (existing.length) {
      if (!confirm(driver + ' already has a truck-derived entry on ' + dayStr + '. Replace it?')) return;
      // Direct localStorage delete since DB API has no remove method
      try {
        var allKey = 'bm-time-entries';
        var allRows = JSON.parse(localStorage.getItem(allKey) || '[]');
        var keepIds = {};
        existing.forEach(function(e) { keepIds[e.id] = 1; });
        var remaining = allRows.filter(function(r) { return !keepIds[r.id]; });
        localStorage.setItem(allKey, JSON.stringify(remaining));
      } catch(err) {}
    }
    var entry = {
      user: driver,
      userId: driver,
      jobId: null,
      date: dayStr,
      clockIn: clockIn,
      clockOut: clockOut,
      hours: Math.round(hours * 100) / 100,
      manual: true,
      source: 'truck-derived',
      vehicleId: vehicleId,
      notes: 'Auto-applied from truck GPS (incl. ' + prepMin + 'm prep)'
    };
    if (typeof DB !== 'undefined' && DB.timeEntries && DB.timeEntries.create) {
      DB.timeEntries.create(entry);
    } else {
      var key = 'bm-time-entries';
      var all = [];
      try { all = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
      entry.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
      all.unshift(entry);
      localStorage.setItem(key, JSON.stringify(all));
    }
    UI.toast('Applied ' + hours.toFixed(2) + 'h to ' + driver + ' on ' + dayStr);
  },

  // v741: Set/clear driver for a specific truck-day. Click → prompt for
  // the employee name; blank input clears the override (falls back to
  // the vehicle's default_driver_name).
  _editTruckDriver: function(vehicleIdEnc, dayEnc) {
    var vehicleId = decodeURIComponent(vehicleIdEnc);
    var day = decodeURIComponent(dayEnc);
    var sb = (typeof SupabaseDB !== 'undefined') ? SupabaseDB.client : null;
    if (!sb) { UI.toast('Supabase not connected'); return; }
    var currentName = '';
    sb.from('vehicle_day_assignments')
      .select('driver_name')
      .eq('vehicle_id', vehicleId).eq('day', day).maybeSingle()
      .then(function(r) {
        currentName = (r && r.data && r.data.driver_name) || '';
        var entered = prompt('Driver for this truck on ' + day + '\n\n(Leave blank to clear day override and use the truck\'s default driver. To set the default, edit the truck on the Fleet page.)', currentName);
        if (entered === null) return;
        entered = entered.trim();
        if (!entered) {
          sb.from('vehicle_day_assignments').delete().eq('vehicle_id', vehicleId).eq('day', day).then(function(r2) {
            if (r2.error) { UI.toast('Error: ' + r2.error.message); return; }
            UI.toast('Day override cleared');
            TimeTrackPage._renderTruckHoursAsync();
          });
          return;
        }
        var tenantId = (typeof window !== 'undefined' && window.resolveTenantId) ? window.resolveTenantId() : null;
        var row = { vehicle_id: vehicleId, day: day, driver_name: entered };
        if (tenantId) row.tenant_id = tenantId;
        sb.from('vehicle_day_assignments').upsert(row, { onConflict: 'vehicle_id,day' }).then(function(r3) {
          if (r3.error) { UI.toast('Error: ' + r3.error.message); return; }
          UI.toast('Driver set: ' + entered);
          TimeTrackPage._renderTruckHoursAsync();
        });
      });
  },

  _renderAllEmployees: function() {
    var allEntries = DB.timeEntries.getAll();

    // Current week bounds
    var now = new Date();
    var dayOfWeek = now.getDay();
    var daysFromMon = (dayOfWeek + 6) % 7;
    var weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysFromMon);
    weekStart.setHours(0,0,0,0);
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23,59,59,999);
    var weekStartStr = weekStart.toISOString().split('T')[0];

    var weekEntries = allEntries.filter(function(t) {
      var d = t.date || (t.clockIn ? t.clockIn.split('T')[0] : '');
      return d >= weekStartStr;
    });

    // Group by employee
    var byEmp = {};
    weekEntries.forEach(function(t) {
      var name = t.user || 'Unknown';
      if (!byEmp[name]) byEmp[name] = { hours: 0 };
      var hours = t.hours || 0;
      if (!t.clockOut && t.clockIn) {
        hours = (Date.now() - new Date(t.clockIn).getTime()) / 3600000;
      }
      byEmp[name].hours += hours;
    });

    var names = Object.keys(byEmp).sort();
    var totalCrewHours = 0;
    var totalPayroll = 0;

    var rows = '';
    names.forEach(function(name) {
      var hours = byEmp[name].hours;
      var rate = parseFloat(localStorage.getItem('bm-rate-' + name) || 30);
      var regHours = Math.min(hours, 40);
      var otHours = Math.max(0, hours - 40);
      var estPay = (regHours * rate) + (otHours * rate * 1.5);
      totalCrewHours += hours;
      totalPayroll += estPay;

      rows += '<tr>'
        + '<td><strong>' + UI.esc(name) + '</strong></td>'
        + '<td style="text-align:right;">' + hours.toFixed(1) + ' hrs'
        + (otHours > 0 ? ' <span style="color:var(--red);font-weight:700;">⚠️ OT: ' + otHours.toFixed(1) + 'h</span>' : '')
        + '</td>'
        + '<td style="text-align:right;">$' + rate.toFixed(0) + '/hr'
        + ' <button onclick="TimeTrackPage.editRate(\'' + UI.esc(name) + '\')" style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--text-light);padding:0 4px;">✏️</button>'
        + '</td>'
        + '<td style="text-align:right;font-weight:700;color:var(--green-dark);">' + UI.money(estPay) + '</td>'
        + '</tr>';
    });

    var html = '';

    if (!names.length) {
      html += '<div class="empty-state"><div class="empty-icon">👥</div><h3>No time entries this week</h3><p>Entries will appear once employees clock in.</p></div>';
      return html;
    }

    // Summary cards
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;">'
      + '<div class="stat-card"><div class="stat-label">Total Crew Hours</div><div class="stat-value">' + totalCrewHours.toFixed(1) + '</div></div>'
      + '<div class="stat-card"><div class="stat-label">Active Employees</div><div class="stat-value">' + names.length + '</div></div>'
      + '<div class="stat-card"><div class="stat-label">Est. Weekly Payroll</div><div class="stat-value">' + UI.money(totalPayroll) + '</div></div>'
      + '</div>';

    // Table
    html += '<div style="background:var(--white);border-radius:12px;border:1px solid var(--border);overflow:hidden;">'
      + '<table class="data-table"><thead><tr>'
      + '<th>Employee</th><th style="text-align:right;">This Week</th><th style="text-align:right;">Hourly Rate</th><th style="text-align:right;">Est. Pay</th>'
      + '</tr></thead><tbody>'
      + rows
      + '<tr style="background:var(--bg);font-weight:700;">'
      + '<td>Total</td>'
      + '<td style="text-align:right;">' + totalCrewHours.toFixed(1) + ' hrs</td>'
      + '<td></td>'
      + '<td style="text-align:right;color:var(--green-dark);">' + UI.money(totalPayroll) + '</td>'
      + '</tr>'
      + '</tbody></table></div>';

    // Per-employee detail breakdown
    html += '<h3 style="margin:24px 0 12px;">Individual Timesheets — This Week</h3>';
    names.forEach(function(name) {
      var empEntries = weekEntries.filter(function(t) { return t.user === name; });
      var byDate = {};
      empEntries.forEach(function(t) {
        var d = t.date || (t.clockIn ? t.clockIn.split('T')[0] : '');
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(t);
      });
      var dates = Object.keys(byDate).sort().reverse();
      var today = new Date().toISOString().split('T')[0];

      html += '<details style="margin-bottom:12px;" open>'
        + '<summary style="cursor:pointer;padding:10px 14px;background:var(--white);border:1px solid var(--border);border-radius:10px;font-weight:600;">'
        + '👤 ' + UI.esc(name) + ' &nbsp;<span style="font-weight:400;color:var(--text-light);">' + byEmp[name].hours.toFixed(1) + ' hrs this week</span>'
        + '</summary>'
        + '<div style="border:1px solid var(--border);border-top:none;border-radius:0 0 10px 10px;overflow:hidden;">'
        + '<table class="data-table"><thead><tr><th>Date</th><th>Job</th><th>In</th><th>Out</th><th style="text-align:right;">Hours</th></tr></thead><tbody>';

      dates.forEach(function(date) {
        byDate[date].forEach(function(t, i) {
          var job = t.jobId ? DB.jobs.getById(t.jobId) : null;
          var isActive = !t.clockOut && date === today;
          var hours = isActive ? (Date.now() - new Date(t.clockIn).getTime()) / 3600000 : (t.hours || 0);
          var clockOutDisplay = t.clockOut
            ? new Date(t.clockOut).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
            : (isActive ? '<span style="color:var(--green-dark);font-weight:600;">active</span>' : '—');
          html += '<tr>'
            + '<td>' + (i === 0 ? '<strong>' + UI.dateShort(date) + '</strong>' : '') + '</td>'
            + '<td>' + (job ? UI.esc(job.clientName + ' #' + job.jobNumber) : 'General') + '</td>'
            + '<td>' + (t.clockIn ? new Date(t.clockIn).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—') + '</td>'
            + '<td>' + clockOutDisplay + '</td>'
            + '<td style="text-align:right;font-weight:600;">' + hours.toFixed(1) + '</td>'
            + '</tr>';
        });
      });

      html += '</tbody></table></div></details>';
    });

    return html;
  },

  _renderPayPeriodSummary: function() {
    var rate = parseFloat(localStorage.getItem('bm-my-rate') || 30);
    var now = new Date();
    var dayOfWeek = now.getDay();
    var daysFromMon = (dayOfWeek + 6) % 7;
    var weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysFromMon);
    weekStart.setHours(0,0,0,0);
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    var weekStartStr = weekStart.toISOString().split('T')[0];
    var weekEndStr = weekEnd.toISOString().split('T')[0];

    var entries = DB.timeEntries.getAll().filter(function(t) {
      var d = t.date || (t.clockIn ? t.clockIn.split('T')[0] : '');
      return d >= weekStartStr && d <= weekEndStr && t.user === TimeTrackPage.currentUser;
    });

    var totalHours = entries.reduce(function(s, t) {
      if (!t.clockOut && t.clockIn) return s + (Date.now() - new Date(t.clockIn).getTime()) / 3600000;
      return s + (t.hours || 0);
    }, 0);

    var regHours = Math.min(totalHours, 40);
    var otHours = Math.max(0, totalHours - 40);
    var grossPay = (regHours * rate) + (otHours * rate * 1.5);

    var fmtDate = function(d) { return d.toLocaleDateString('en-US', {month:'short', day:'numeric'}); };

    return '<div style="margin-top:20px;background:var(--white);border:2px solid var(--green-dark);border-radius:12px;padding:20px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'
      + '<h3 style="margin:0;font-size:15px;">Pay Period Summary</h3>'
      + '<span style="font-size:12px;color:var(--text-light);">' + fmtDate(weekStart) + ' – ' + fmtDate(weekEnd) + '</span>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">'
      + '<div style="text-align:center;background:var(--bg);border-radius:8px;padding:10px;">'
      +   '<div style="font-size:11px;color:var(--text-light);margin-bottom:4px;">Total Hours</div>'
      +   '<div style="font-size:1.3rem;font-weight:700;">' + totalHours.toFixed(1) + '</div>'
      + '</div>'
      + '<div style="text-align:center;background:var(--bg);border-radius:8px;padding:10px;">'
      +   '<div style="font-size:11px;color:var(--text-light);margin-bottom:4px;">Regular</div>'
      +   '<div style="font-size:1.3rem;font-weight:700;">' + regHours.toFixed(1) + '</div>'
      + '</div>'
      + '<div style="text-align:center;background:' + (otHours > 0 ? '#fff3f3' : 'var(--bg)') + ';border-radius:8px;padding:10px;">'
      +   '<div style="font-size:11px;color:var(--text-light);margin-bottom:4px;">Overtime</div>'
      +   '<div style="font-size:1.3rem;font-weight:700;color:' + (otHours > 0 ? 'var(--red)' : 'inherit') + ';">' + otHours.toFixed(1) + '</div>'
      + '</div>'
      + '<div style="text-align:center;background:var(--green-bg);border-radius:8px;padding:10px;">'
      +   '<div style="font-size:11px;color:var(--green-dark);margin-bottom:4px;">Est. Gross Pay</div>'
      +   '<div style="font-size:1.3rem;font-weight:700;color:var(--green-dark);">' + UI.money(grossPay) + '</div>'
      + '</div>'
      + '</div>'
      + '<div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;">'
      + '<span style="font-size:12px;color:var(--text-light);">Hourly rate: $' + rate.toFixed(0) + '/hr</span>'
      + '<button onclick="TimeTrackPage.editMyRate()" class="btn btn-outline" style="font-size:12px;padding:4px 10px;">Edit Rate</button>'
      + '</div>'
      + '</div>';
  },

  _renderManualEntryModal: function() {
    var allJobs = DB.jobs.getAll().filter(function(j) { return j.status === 'scheduled' || j.status === 'in_progress'; });
    var jobOptions = '<option value="">No Job / General</option>'
      + allJobs.map(function(j) { return '<option value="' + j.id + '">' + UI.esc(j.clientName + ' #' + j.jobNumber) + '</option>'; }).join('');

    return '<div id="manual-entry-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:none;align-items:center;justify-content:center;">'
      + '<div style="background:var(--white);border-radius:14px;padding:24px;width:min(96vw,480px);max-height:90vh;overflow-y:auto;">'
      + '<h3 style="margin-bottom:16px;">Add Manual Time Entry</h3>'
      + '<div style="display:flex;flex-direction:column;gap:10px;">'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Employee</label>'
      + '<input id="me-emp" type="text" value="' + UI.esc(TimeTrackPage.currentUser) + '" style="width:100%;padding:8px;border:2px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Job</label>'
      + '<select id="me-job" style="width:100%;padding:8px;border:2px solid var(--border);border-radius:6px;font-size:13px;">' + jobOptions + '</select></div>'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Date</label>'
      + '<input id="me-date" type="date" value="' + new Date().toISOString().split('T')[0] + '" style="width:100%;padding:8px;border:2px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Clock In</label>'
      + '<input id="me-in" type="time" value="08:00" style="width:100%;padding:8px;border:2px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Clock Out</label>'
      + '<input id="me-out" type="time" value="16:00" style="width:100%;padding:8px;border:2px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;margin-top:18px;">'
      + '<button class="btn btn-primary" onclick="TimeTrackPage.saveManualEntry()" style="flex:1;">Save Entry</button>'
      + '<button class="btn btn-outline" onclick="TimeTrackPage.closeManualEntry()" style="flex:1;">Cancel</button>'
      + '</div>'
      + '</div></div>';
  },

  openManualEntry: function() {
    var modal = document.getElementById('manual-entry-modal');
    if (modal) modal.style.display = 'flex';
  },

  closeManualEntry: function() {
    var modal = document.getElementById('manual-entry-modal');
    if (modal) modal.style.display = 'none';
  },

  saveManualEntry: function() {
    var emp = (document.getElementById('me-emp') || {}).value || TimeTrackPage.currentUser;
    var jobId = (document.getElementById('me-job') || {}).value || null;
    var date = (document.getElementById('me-date') || {}).value;
    var clockInTime = (document.getElementById('me-in') || {}).value;
    var clockOutTime = (document.getElementById('me-out') || {}).value;

    if (!date || !clockInTime || !clockOutTime) { UI.toast('Fill in all fields', 'error'); return; }

    var clockIn = new Date(date + 'T' + clockInTime + ':00').toISOString();
    var clockOut = new Date(date + 'T' + clockOutTime + ':00').toISOString();
    var hours = (new Date(clockOut) - new Date(clockIn)) / 3600000;
    if (hours <= 0) { UI.toast('Clock out must be after clock in', 'error'); return; }

    var entry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      user: emp,
      jobId: jobId || null,
      date: date,
      clockIn: clockIn,
      clockOut: clockOut,
      hours: hours,
      manual: true
    };

    // Save via DB if available, else direct localStorage
    if (typeof DB !== 'undefined' && DB.timeEntries && DB.timeEntries.add) {
      DB.timeEntries.add(entry);
    } else {
      var key = 'bm-timeentries';
      var all = [];
      try { all = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
      all.unshift(entry);
      localStorage.setItem(key, JSON.stringify(all));
    }

    UI.toast('Entry saved: ' + hours.toFixed(1) + ' hrs for ' + emp);
    TimeTrackPage.closeManualEntry();
    loadPage(currentPage);
  },

  editRate: function(empName) {
    var current = localStorage.getItem('bm-rate-' + empName) || '30';
    var val = prompt('Hourly rate for ' + empName + ' ($/hr):', current);
    if (val !== null && !isNaN(parseFloat(val))) {
      localStorage.setItem('bm-rate-' + empName, parseFloat(val).toFixed(2));
      UI.toast('Rate updated for ' + empName);
      if (TimeTrackPage._tab === 'all') {
        TimeTrackPage.setTab('all');
      }
    }
  },

  editMyRate: function() {
    var current = localStorage.getItem('bm-my-rate') || '30';
    var val = prompt('Your hourly rate ($/hr):', current);
    if (val !== null && !isNaN(parseFloat(val))) {
      localStorage.setItem('bm-my-rate', parseFloat(val).toFixed(2));
      UI.toast('Rate updated');
      loadPage(currentPage);
    }
  },

  renderClockWidget: function() {
    var today = new Date().toISOString().split('T')[0];
    var todayEntries = DB.timeEntries.getByUser(TimeTrackPage.currentUser, today);
    var activeEntry = todayEntries.find(function(t) { return !t.clockOut; });
    var todayJobs = DB.jobs.getToday();
    var allJobs = DB.jobs.getAll().filter(function(j) { return j.status === 'scheduled' || j.status === 'in_progress'; });

    var html = '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<h3 style="margin-bottom:12px;">⏱️ Time Clock</h3>';

    if (activeEntry) {
      // Currently clocked in
      var job = activeEntry.jobId ? DB.jobs.getById(activeEntry.jobId) : null;
      var elapsed = ((Date.now() - new Date(activeEntry.clockIn).getTime()) / 3600000).toFixed(1);
      var clockInMs = new Date(activeEntry.clockIn).getTime();
      html += '<div style="background:var(--green-bg);border:2px solid var(--green-dark);border-radius:10px;padding:16px;text-align:center;">'
        + '<div style="font-size:13px;color:var(--green-dark);font-weight:600;">CLOCKED IN</div>'
        + '<div id="tt-elapsed-display" style="font-size:2.5rem;font-weight:800;color:var(--green-dark);">' + elapsed + ' hrs</div>'
        + (job ? '<div style="font-size:14px;color:var(--text);">' + job.clientName + ' — #' + job.jobNumber + '</div>' : '')
        + '<button class="btn" style="background:var(--red);color:#fff;margin-top:12px;padding:12px 32px;font-size:16px;" onclick="TimeTrackPage.clockOut(\'' + activeEntry.id + '\')">Clock Out</button>'
        + '</div>';
    } else {
      // Not clocked in — show available jobs
      html += '<div style="text-align:center;padding:12px;color:var(--text-light);margin-bottom:12px;">Not clocked in</div>';
      if (allJobs.length) {
        html += '<div style="font-size:13px;font-weight:600;margin-bottom:8px;">Clock in to a job:</div>';
        allJobs.forEach(function(j) {
          html += '<button class="btn btn-outline" style="width:100%;margin-bottom:6px;justify-content:space-between;" onclick="TimeTrackPage.clockIn(\'' + j.id + '\')">'
            + '<span>🔧 ' + j.clientName + ' — ' + (j.description || '#' + j.jobNumber) + '</span>'
            + '<span style="font-weight:700;">' + UI.dateShort(j.scheduledDate) + '</span>'
            + '</button>';
        });
      }
      html += '<button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="TimeTrackPage.clockIn(null)">Clock In (No Job)</button>';
    }

    // Today's entries
    if (todayEntries.length > 0) {
      html += '<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px;">'
        + '<h4 style="font-size:13px;margin-bottom:8px;">Today\'s Time</h4>';
      var totalHours = 0;
      todayEntries.forEach(function(t) {
        var job = t.jobId ? DB.jobs.getById(t.jobId) : null;
        var hours = t.hours || 0;
        if (!t.clockOut) hours = (Date.now() - new Date(t.clockIn).getTime()) / 3600000;
        totalHours += hours;
        var clockInTime = new Date(t.clockIn).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
        var clockOutTime = t.clockOut ? new Date(t.clockOut).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'active';

        html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">'
          + '<span>' + (job ? job.clientName + ' #' + job.jobNumber : 'General') + '</span>'
          + '<span>' + clockInTime + ' - ' + clockOutTime + '</span>'
          + '<span style="font-weight:700;">' + hours.toFixed(1) + ' hrs</span>'
          + '</div>';
      });
      html += '<div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:700;font-size:14px;">'
        + '<span>Total Today</span><span style="color:var(--green-dark);">' + totalHours.toFixed(1) + ' hrs</span></div>';
      html += '</div>';
    }

    html += '</div>';

    // Start live tick if clocked in
    if (activeEntry) {
      setTimeout(function() {
        var el = document.getElementById('tt-elapsed-display');
        if (!el) return;
        if (TimeTrackPage._tickInterval) clearInterval(TimeTrackPage._tickInterval);
        TimeTrackPage._tickInterval = setInterval(function() {
          var el2 = document.getElementById('tt-elapsed-display');
          if (!el2) { clearInterval(TimeTrackPage._tickInterval); return; }
          el2.textContent = ((Date.now() - clockInMs) / 3600000).toFixed(2) + ' hrs';
        }, 30000); // update every 30s
      }, 100);
    }

    return html;
  },

  _tickInterval: null,

  clockIn: function(jobId) {
    var entry = DB.timeEntries.clockIn(TimeTrackPage.currentUser, jobId);
    if (jobId) {
      DB.jobs.update(jobId, { status: 'in_progress' });
    }
    UI.toast('Clocked in');
    loadPage(currentPage);
  },

  clockOut: function(entryId) {
    DB.timeEntries.clockOut(entryId);
    UI.toast('Clocked out');
    loadPage(currentPage);
  },

  renderTimesheet: function() {
    var entries = DB.timeEntries.getAll();
    var today = new Date().toISOString().split('T')[0];

    // Current week: Mon through today
    var now = new Date();
    var dayOfWeek = now.getDay(); // 0=Sun
    var daysFromMon = (dayOfWeek + 6) % 7;
    var weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysFromMon);
    var weekStartStr = weekStart.toISOString().split('T')[0];

    // Split entries into this week vs history
    var weekEntries = entries.filter(function(t) {
      var d = t.date || (t.clockIn ? t.clockIn.split('T')[0] : '');
      return d >= weekStartStr;
    });
    var historyEntries = entries.filter(function(t) {
      var d = t.date || (t.clockIn ? t.clockIn.split('T')[0] : '');
      return d && d < weekStartStr;
    });

    var renderSection = function(sectionEntries, label) {
      var byDate = {};
      sectionEntries.forEach(function(t) {
        var d = t.date || (t.clockIn ? t.clockIn.split('T')[0] : '');
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(t);
      });
      var dates = Object.keys(byDate).sort().reverse();
      var totalHours = 0;

      var html = '<h3 style="margin-bottom:12px;margin-top:20px;">' + label + '</h3>';
      html += '<div style="background:var(--white);border-radius:12px;border:1px solid var(--border);overflow:hidden;">';
      html += '<table class="data-table"><thead><tr><th>Date</th><th>Job</th><th>Clock In</th><th>Clock Out</th><th style="text-align:right;">Hours</th></tr></thead><tbody>';

      if (dates.length === 0) {
        html += '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:24px;">No entries this week.</td></tr>';
      } else {
        dates.forEach(function(date) {
          var dayEntries = byDate[date];
          var dayTotal = 0;
          dayEntries.forEach(function(t, i) {
            var job = t.jobId ? DB.jobs.getById(t.jobId) : null;
            var isActiveToday = !t.clockOut && date === today;
            var hours = isActiveToday
              ? (Date.now() - new Date(t.clockIn).getTime()) / 3600000
              : (t.hours || 0);
            dayTotal += hours;
            totalHours += hours;
            var clockOutDisplay = t.clockOut
              ? new Date(t.clockOut).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
              : (isActiveToday ? '<span style="color:var(--green-dark);font-weight:600;">active</span>' : '—');
            html += '<tr>'
              + '<td>' + (i === 0 ? '<strong>' + UI.dateShort(date) + '</strong>' : '') + '</td>'
              + '<td>' + (job ? job.clientName + ' #' + job.jobNumber : 'General') + '</td>'
              + '<td>' + (t.clockIn ? new Date(t.clockIn).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—') + '</td>'
              + '<td>' + clockOutDisplay + '</td>'
              + '<td style="text-align:right;font-weight:600;">' + hours.toFixed(1) + '</td>'
              + '</tr>';
          });
          html += '<tr style="background:var(--bg);"><td colspan="4" style="text-align:right;font-weight:600;font-size:12px;">Day Total</td><td style="text-align:right;font-weight:700;">' + dayTotal.toFixed(1) + '</td></tr>';
        });
      }

      html += '</tbody></table></div>';
      if (totalHours > 0) {
        html += '<div style="margin-top:8px;padding:12px 16px;background:var(--green-dark);border-radius:10px;color:#fff;display:flex;justify-content:space-between;align-items:center;">'
          + '<span style="font-weight:600;">' + (label.includes('Week') ? 'Week' : 'History') + ' Total</span>'
          + '<span style="font-size:1.4rem;font-weight:800;">' + totalHours.toFixed(1) + ' hours</span>'
          + '</div>';
      }
      return html;
    };

    var html = renderSection(weekEntries, 'This Week');

    if (historyEntries.length > 0) {
      // Show last 30 history entries
      var recent = historyEntries.sort(function(a, b) {
        var da = a.date || (a.clockIn ? a.clockIn.split('T')[0] : '');
        var db = b.date || (b.clockIn ? b.clockIn.split('T')[0] : '');
        return db.localeCompare(da);
      }).slice(0, 30);
      html += renderSection(recent, 'History');
    }

    return html;
  }
};
