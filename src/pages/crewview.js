/**
 * Branch Manager — Crew View
 * Simplified mobile-first view for crew members
 * Shows: today's jobs, clock in/out, navigation, photos, notes
 */
var CrewView = {
  render: function() {
    var today = new Date();
    var todayStr = today.toISOString().split('T')[0];
    var jobs = DB.jobs.getAll().filter(function(j) {
      if (!j.scheduledDate) return false;
      return j.scheduledDate.split('T')[0] === todayStr;
    });
    var upcoming = DB.jobs.getAll().filter(function(j) {
      if (!j.scheduledDate) return false;
      var d = new Date(j.scheduledDate);
      return d > today && d < new Date(today.getTime() + 7 * 86400000);
    }).slice(0, 5);

    var userName = (typeof Auth !== 'undefined' && Auth.user) ? Auth.user.name : 'Crew';

    // Header
    // Daily pre-trip inspection at top of Crew View (moved from Dashboard)
    var _inspHtml = (typeof DailyInspection !== 'undefined') ? DailyInspection.render() : '';
    var html = _inspHtml
      + '<div style="text-align:center;padding:20px 0 12px;">'
      + '<div style="font-size:36px;margin-bottom:8px;">🌳</div>'
      + '<h2 style="font-size:20px;">Good ' + CrewView._greeting() + ', ' + userName.split(' ')[0] + '!</h2>'
      + '<div style="color:var(--text-light);font-size:14px;">' + today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + '</div>'
      + '</div>';

    // GPS status
    if (typeof Geofence !== 'undefined') {
      html += Geofence.renderStatus();
    }

    // Weather
    if (typeof Weather !== 'undefined') {
      html += Weather.renderWidget();
    }

    // Time clock — big and centered
    html += '<div style="background:var(--white);border-radius:16px;padding:24px;border:1px solid var(--border);margin-bottom:16px;text-align:center;">'
      + '<h3 style="font-size:16px;margin-bottom:12px;">⏱ Time Clock</h3>';
    var clockedIn = localStorage.getItem('bm-clock-in');
    if (clockedIn) {
      var startTime = new Date(clockedIn);
      var elapsed = Math.round((Date.now() - startTime.getTime()) / 60000);
      var hrs = Math.floor(elapsed / 60);
      var mins = elapsed % 60;
      html += '<div style="font-size:48px;font-weight:800;color:var(--green-dark);margin:12px 0;">' + hrs + ':' + String(mins).padStart(2, '0') + '</div>'
        + '<div style="font-size:14px;color:var(--text-light);margin-bottom:16px;">Clocked in since ' + startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + '</div>'
        + '<button onclick="CrewView.clockOut()" style="background:var(--red);color:#fff;border:none;padding:16px 40px;border-radius:12px;font-size:18px;font-weight:700;cursor:pointer;width:100%;max-width:300px;">🔴 Clock Out</button>';
    } else {
      html += '<div style="font-size:48px;font-weight:800;color:var(--text-light);margin:12px 0;">0:00</div>'
        + '<div style="font-size:14px;color:var(--text-light);margin-bottom:16px;">Not clocked in</div>'
        + '<button onclick="CrewView.clockIn()" style="background:var(--green-dark);color:#fff;border:none;padding:16px 40px;border-radius:12px;font-size:18px;font-weight:700;cursor:pointer;width:100%;max-width:300px;">🟢 Clock In</button>';
    }
    html += '</div>';

    // Today summary bar
    var completed = jobs.filter(function(j) { return j.status === 'completed'; }).length;
    var inProgress = jobs.filter(function(j) { return j.status === 'in_progress'; }).length;
    var todayRevenue = jobs.reduce(function(s, j) { return s + (j.total || 0); }, 0);
    if (jobs.length > 0) {
      var pct = jobs.length > 0 ? Math.round(completed / jobs.length * 100) : 0;
      html += '<div style="background:var(--white);border-radius:12px;padding:14px 16px;border:1px solid var(--border);margin-bottom:16px;">'
        + '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">'
        + '<span style="font-weight:600;">' + completed + ' of ' + jobs.length + ' done</span>'
        + '<span style="font-weight:700;color:var(--green-dark);">' + UI.moneyInt(todayRevenue) + ' today</span></div>'
        + '<div style="background:#e8e8e8;border-radius:6px;height:8px;overflow:hidden;">'
        + '<div style="background:var(--green-dark);height:100%;width:' + pct + '%;border-radius:6px;transition:width .3s;"></div>'
        + '</div>'
        + (inProgress > 0 ? '<div style="font-size:11px;color:#ff9800;font-weight:600;margin-top:4px;">🔧 ' + inProgress + ' in progress</div>' : '')
        + '</div>';
    }

    // Today's jobs
    html += '<div style="margin-bottom:16px;">'
      + '<h3 style="font-size:16px;margin-bottom:12px;">Today\'s Jobs (' + jobs.length + ')</h3>';

    if (jobs.length) {
      jobs.forEach(function(j, idx) {
        var statusColors = { scheduled: '#2196f3', in_progress: '#ff9800', completed: '#4caf50', late: '#dc3545' };
        var statusBorder = statusColors[j.status] || '#999';
        var isCompleted = j.status === 'completed';

        html += '<div style="background:var(--white);border-radius:12px;padding:16px;border:1px solid var(--border);margin-bottom:10px;border-left:4px solid ' + statusBorder + ';' + (isCompleted ? 'opacity:.75;' : '') + '">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
          + '<strong style="font-size:16px;">' + UI.esc(j.clientName) + '</strong>'
          + UI.statusBadge(j.status)
          + '</div>'
          + (j.description ? '<div style="font-size:13px;color:var(--text-light);margin-top:3px;">' + UI.esc(j.description) + '</div>' : '')
          + '<div style="font-size:13px;color:var(--text-light);margin-top:3px;">📍 ' + UI.esc(j.property || j.address || 'No address') + '</div>'
          + (j.startTime ? '<div style="font-size:12px;color:#1565c0;margin-top:2px;">⏰ ' + CrewView._formatTime(j.startTime) + '</div>' : '')
          + (j.crewNotes ? '<div style="font-size:12px;background:#fff3e0;padding:6px 8px;border-radius:6px;margin-top:6px;color:#e65100;">📋 ' + UI.esc(j.crewNotes) + '</div>' : '')
          + '</div>'
          + '<div style="font-weight:700;color:var(--green-dark);font-size:16px;white-space:nowrap;margin-left:8px;">' + UI.moneyInt(j.total || 0) + '</div></div>'

          // Action buttons — big and touch-friendly
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
          + '<a href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(j.property || j.clientName) + '" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;background:var(--green-bg);border:1px solid #c8e6c9;border-radius:10px;text-decoration:none;color:var(--green-dark);font-weight:600;font-size:14px;">🗺 Navigate</a>'
          + '<a href="tel:' + (j.clientPhone || '').replace(/\D/g, '') + '" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;background:#e3f2fd;border:1px solid #bbdefb;border-radius:10px;text-decoration:none;color:#1565c0;font-weight:600;font-size:14px;">📞 Call</a>';

        if (j.status === 'scheduled') {
          html += '<button onclick="CrewView.startJob(\'' + j.id + '\')" style="grid-column:span 2;padding:12px;background:#ff9800;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer;">▶ Start Job</button>';
        } else if (j.status === 'in_progress') {
          html += '<button onclick="CrewView.completeJob(\'' + j.id + '\')" style="grid-column:span 2;padding:12px;background:var(--green-dark);color:#fff;border:none;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer;">✅ Complete Job</button>';
        } else if (j.status === 'completed') {
          html += '<div style="grid-column:span 2;padding:12px;background:#e8f5e9;border-radius:10px;text-align:center;color:#2e7d32;font-weight:600;">✅ Completed' + (j.completedAt ? ' · ' + new Date(j.completedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '') + '</div>';
        }

        // Photo + Notes row
        html += '</div>'
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">'
          + '<label style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:var(--bg);border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-light);">'
          + '📸 Photo<input type="file" accept="image/*" multiple onchange="if(typeof Photos!==\'undefined\')Photos.upload(event,\'job\',\'' + j.id + '\')" style="display:none;">'
          + '</label>'
          + '<button onclick="CrewView.addNote(\'' + j.id + '\')" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:var(--bg);border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-light);border:none;">📝 Add Note</button>'
          + '</div>'
          + '</div>';
      });
    } else {
      html += '<div style="text-align:center;padding:40px;background:var(--white);border-radius:12px;border:1px solid var(--border);">'
        + '<div style="font-size:36px;margin-bottom:8px;">☀️</div>'
        + '<h3 style="font-size:16px;">No jobs today</h3>'
        + '<p style="font-size:13px;color:var(--text-light);">Enjoy the day off!</p></div>';
    }
    html += '</div>';

    // Upcoming this week
    if (upcoming.length) {
      html += '<div style="background:var(--white);border-radius:12px;padding:16px;border:1px solid var(--border);margin-bottom:16px;">'
        + '<h3 style="font-size:15px;margin-bottom:12px;">This Week</h3>';
      upcoming.forEach(function(j) {
        html += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">'
          + '<div><strong>' + UI.esc(j.clientName) + '</strong>'
          + (j.description ? ' <span style="color:var(--text-light);">— ' + UI.esc(j.description.substr(0, 30)) + '</span>' : '')
          + (j.property ? '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">📍 ' + UI.esc(j.property.substr(0, 40)) + '</div>' : '')
          + '</div>'
          + '<div style="text-align:right;flex-shrink:0;">'
          + '<div style="color:var(--text-light);font-size:12px;">' + UI.dateShort(j.scheduledDate) + '</div>'
          + '<div style="font-weight:600;color:var(--green-dark);font-size:12px;">' + UI.moneyInt(j.total || 0) + '</div>'
          + '</div></div>';
      });
      html += '</div>';
    }

    // Quick access links at bottom
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;">'
      + '<button onclick="loadPage(\'timetrack\')" style="padding:14px 8px;background:var(--white);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;color:var(--text);">⏱ Timesheet</button>'
      + '<button onclick="loadPage(\'expenses\')" style="padding:14px 8px;background:var(--white);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;color:var(--text);">💸 Expenses</button>'
      + '<button onclick="loadPage(\'dispatch\')" style="padding:14px 8px;background:var(--white);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;color:var(--text);">🗺 Route</button>'
      + '</div>';

    return html;
  },

  _greeting: function() {
    var h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  },

  _formatTime: function(t) {
    if (!t) return '';
    var parts = t.split(':');
    var h = parseInt(parts[0]);
    var m = parts[1] || '00';
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + m + ' ' + ampm;
  },

  // v1083: hours land on the JOB. Clock-in captures which of today's jobs
  // this session belongs to (auto-picked when there's exactly one), and
  // clock-out stamps that jobId on the time entry so JobCosting/profit
  // cards finally get real labor numbers.
  clockIn: function() {
    var todayStr = new Date().toISOString().split('T')[0];
    var todays = DB.jobs.getAll().filter(function(j) {
      if (!j.scheduledDate) return false;
      return j.scheduledDate.split('T')[0] === todayStr;
    });
    if (todays.length === 1) {
      localStorage.setItem('bm-clock-job', todays[0].id);
      CrewView._beginClock();
    } else if (todays.length > 1) {
      var html = '<div style="display:grid;gap:8px;">';
      todays.forEach(function(j) {
        html += '<button class="btn btn-outline" style="width:100%;text-align:left;padding:12px;" onclick="CrewView._pickClockJob(\'' + j.id + '\')">'
          + '#' + (j.jobNumber || '') + ' ' + UI.esc(j.clientName || '')
          + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">' + UI.esc(j.property || '') + '</div></button>';
      });
      html += '<button class="btn btn-outline" style="width:100%;padding:12px;" onclick="CrewView._pickClockJob(\'\')">No job / other work</button></div>';
      UI.showModal('Which job are you on?', html);
    } else {
      localStorage.removeItem('bm-clock-job');
      CrewView._beginClock();
    }
  },

  _pickClockJob: function(jobId) {
    if (jobId) localStorage.setItem('bm-clock-job', jobId);
    else localStorage.removeItem('bm-clock-job');
    UI.closeModal();
    CrewView._beginClock();
  },

  _beginClock: function() {
    localStorage.setItem('bm-clock-in', new Date().toISOString());
    UI.toast('Clocked in! ⏱');
    CrewView._startGPSTracker();
    loadPage('crewview');
  },

  clockOut: function() {
    var startTime = localStorage.getItem('bm-clock-in');
    if (startTime) {
      var elapsed = Math.round((Date.now() - new Date(startTime).getTime()) / 60000);
      var hrs = (elapsed / 60).toFixed(1);
      localStorage.removeItem('bm-clock-in');

      // Save time entry via DB so it syncs to Supabase
      var userName = (typeof Auth !== 'undefined' && Auth.user) ? Auth.user.name : 'Crew';
      DB.timeEntries.create({
        userId: userName,
        user: userName,
        date: new Date().toISOString().split('T')[0],
        hours: parseFloat(hrs),
        jobId: localStorage.getItem('bm-clock-job') || null,
        clockIn: startTime,
        clockOut: new Date().toISOString()
      });
      localStorage.removeItem('bm-clock-job');

      UI.toast('Clocked out! ' + hrs + ' hours logged');
      CrewView._stopGPSTracker();

      // Prompt for expenses
      CrewView._showExpensePrompt(hrs);
    }
  },

  addNote: function(jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j) return;
    var html = '<div style="display:grid;gap:10px;">'
      + '<p style="font-size:13px;color:var(--text-light);margin:0;">Add a note for the office about this job:</p>'
      + '<textarea id="crew-note-text" rows="4" placeholder="e.g. Large limb hanging over fence, client wants us to call before we leave..." style="width:100%;padding:12px;border:2px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;">'
      + UI.esc(j.crewNotes || '') + '</textarea>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
      + '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
      + '<button class="btn btn-primary" onclick="CrewView._saveNote(\'' + jobId + '\')">Save Note</button>'
      + '</div></div>';
    UI.showModal('Job Note — ' + UI.esc(j.clientName || ''), html);
  },

  _saveNote: function(jobId) {
    var text = (document.getElementById('crew-note-text').value || '').trim();
    DB.jobs.update(jobId, { crewNotes: text, updatedAt: new Date().toISOString() });
    UI.closeModal();
    UI.toast('Note saved');
    loadPage('crewview');
  },

  _showExpensePrompt: function(hours) {
    var html = '<div style="text-align:center;margin-bottom:16px;">'
      + '<div style="font-size:36px;">⛽</div>'
      + '<h3 style="margin:8px 0 4px;">Log any expenses?</h3>'
      + '<p style="font-size:13px;color:var(--text-light);">You worked ' + hours + ' hours. Add fuel, dump fees, or supplies before you forget.</p></div>'
      + '<div style="display:grid;gap:8px;">'
      + '<div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:8px;">'
      + '<select id="exp-cat-prompt" style="padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '<option value="fuel">⛽ Fuel</option><option value="supplies">🪚 Supplies</option><option value="dump">🚛 Dump Fee</option><option value="food">🍔 Food</option><option value="other">📋 Other</option></select>'
      + '<input type="number" id="exp-amt-prompt" placeholder="Amount $" step="0.01" style="padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;">'
      + '<input type="text" id="exp-note-prompt" placeholder="Note (optional)" style="padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '</div>'
      + '<button onclick="CrewView._saveExpenseFromPrompt()" style="background:var(--green-dark);color:#fff;border:none;padding:12px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">💰 Add Expense</button>'
      + '</div>';

    UI.showModal('End of Day', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal();loadPage(\'crewview\');">Skip — No Expenses</button>'
    });
  },

  _saveExpenseFromPrompt: function() {
    var amt = parseFloat(document.getElementById('exp-amt-prompt').value);
    if (!amt || amt <= 0) { UI.toast('Enter an amount', 'error'); return; }
    var cat = document.getElementById('exp-cat-prompt').value;
    var note = document.getElementById('exp-note-prompt').value;

    if (!DB.expenses) {
      DB.expenses = {
        getAll: function() { try { return JSON.parse(localStorage.getItem('bm-expenses')) || []; } catch(e) { return []; } },
        create: function(r) {
          var all = DB.expenses.getAll();
          r.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
          r.date = r.date || new Date().toISOString();
          all.unshift(r);
          localStorage.setItem('bm-expenses', JSON.stringify(all));
          return r;
        }
      };
    }

    DB.expenses.create({ amount: amt, category: cat, description: note || cat });
    UI.toast('Expense logged: $' + amt.toFixed(2));

    // Clear and allow adding more
    document.getElementById('exp-amt-prompt').value = '';
    document.getElementById('exp-note-prompt').value = '';
  },

  startJob: function(jobId) {
    DB.jobs.update(jobId, { status: 'in_progress', startedAt: new Date().toISOString() });
    UI.toast('Job started! 🌳');
    loadPage('crewview');
  },

  completeJob: function(jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j) return;

    // Prompt for quick note before completing
    var html = '<div style="text-align:center;margin-bottom:16px;">'
      + '<div style="font-size:36px;margin-bottom:8px;">✅</div>'
      + '<h3 style="margin:0 0 4px;">Complete Job</h3>'
      + '<p style="font-size:13px;color:var(--text-light);">' + UI.esc(j.clientName || '') + '</p></div>'
      + '<textarea id="complete-notes" rows="3" placeholder="Any notes for the office? (optional)" style="width:100%;padding:12px;border:2px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;"></textarea>'
      + '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">'
      + '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
      + '<button class="btn btn-primary" onclick="CrewView._doCompleteJob(\'' + jobId + '\')">Mark Complete ✅</button>'
      + '</div>';
    UI.showModal('Complete Job', html);
  },

  _doCompleteJob: function(jobId) {
    var notes = (document.getElementById('complete-notes') || {}).value || '';
    // Save notes first (Workflow.completeAndDraft will preserve them).
    if (notes.trim()) DB.jobs.update(jobId, { crewNotes: notes.trim() });
    // v460: crew app auto-drafts the invoice — crew shouldn't be prompted to
    // make billing decisions, owner reviews drafts later in Invoices.
    var r = (typeof Workflow !== 'undefined' && Workflow.completeAndDraft)
      ? Workflow.completeAndDraft(jobId)
      : (DB.jobs.update(jobId, { status: 'completed', completedAt: new Date().toISOString() }), { invoice: null });
    UI.closeModal();
    UI.toast(r.invoice ? 'Job completed ✅ · Invoice draft created' : 'Job completed! ✅');
    loadPage('crewview');
  },

  // ═══ GPS LIVE TRACKING ═══
  _gpsInterval: null,
  _gpsWatchId: null,
  _lastLat: null,
  _lastLng: null,

  _startGPSTracker: function() {
    if (CrewView._gpsInterval) return; // already running
    if (!navigator.geolocation) return;

    var userName = (typeof Auth !== 'undefined' && Auth.user) ? Auth.user.name : 'Crew';
    var userId = (typeof Auth !== 'undefined' && Auth.user) ? (Auth.user.id || Auth.user.email || userName) : userName;

    // Watch position for accuracy
    CrewView._gpsWatchId = navigator.geolocation.watchPosition(
      function(pos) {
        CrewView._lastLat = pos.coords.latitude;
        CrewView._lastLng = pos.coords.longitude;
        CrewView._lastAccuracy = pos.coords.accuracy;
        CrewView._lastHeading = pos.coords.heading;
        CrewView._lastSpeed = pos.coords.speed;
      },
      function() {},
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 }
    );

    // Ping Supabase every 60 seconds
    CrewView._gpsInterval = setInterval(function() {
      CrewView._sendGPSPing(userId, userName);
    }, 60000);

    // Send first ping immediately
    navigator.geolocation.getCurrentPosition(function(pos) {
      CrewView._lastLat = pos.coords.latitude;
      CrewView._lastLng = pos.coords.longitude;
      CrewView._lastAccuracy = pos.coords.accuracy;
      CrewView._sendGPSPing(userId, userName);
    }, function() {}, { enableHighAccuracy: true, timeout: 10000 });
  },

  _stopGPSTracker: function() {
    if (CrewView._gpsInterval) {
      clearInterval(CrewView._gpsInterval);
      CrewView._gpsInterval = null;
    }
    if (CrewView._gpsWatchId !== null) {
      navigator.geolocation.clearWatch(CrewView._gpsWatchId);
      CrewView._gpsWatchId = null;
    }
    // Mark offline in Supabase
    var userName = (typeof Auth !== 'undefined' && Auth.user) ? Auth.user.name : 'Crew';
    var userId = (typeof Auth !== 'undefined' && Auth.user) ? (Auth.user.id || Auth.user.email || userName) : userName;
    CrewView._sendGPSPing(userId, userName, 'offline');
  },

  _sendGPSPing: function(userId, userName, overrideStatus) {
    if (!CrewView._lastLat || !CrewView._lastLng) return;
    if (!SupabaseDB.client) return;

    // Determine status based on proximity to today's jobs
    var status = overrideStatus || 'active';
    if (!overrideStatus) {
      var todayStr = new Date().toISOString().split('T')[0];
      var jobs = DB.jobs.getAll().filter(function(j) {
        return j.scheduledDate && j.scheduledDate.split('T')[0] === todayStr && j.status !== 'completed';
      });
      var currentJobId = null;
      var currentJobName = null;
      jobs.forEach(function(j) {
        var jCoords = null;
        if (j.lat && j.lng) jCoords = [j.lat, j.lng];
        else if (typeof DispatchPage !== 'undefined') jCoords = DispatchPage._getJobCoords(j);
        if (jCoords) {
          var dist = CrewView._gpsDist(CrewView._lastLat, CrewView._lastLng, jCoords[0], jCoords[1]);
          if (dist <= 200) {
            status = 'on_site';
            currentJobId = j.id;
            currentJobName = j.clientName;
            // Auto-mark job en route / in progress
            if (j.status === 'scheduled') {
              DB.jobs.update(j.id, { status: 'in_progress', startedAt: new Date().toISOString() });
            }
          } else if (dist <= 1500 && status !== 'on_site') {
            status = 'en_route';
            currentJobId = j.id;
            currentJobName = j.clientName;
          }
        }
      });
    }

    // Upsert to crew_locations. tenant_id is now defaulted at the DB level
    // (May 2 hardening) but set explicitly here too — defense in depth.
    SupabaseDB.client.from('crew_locations').upsert({
      tenant_id: window.resolveTenantId(),
      user_id: userId,
      user_name: userName,
      role: (typeof Auth !== 'undefined' && Auth.user) ? Auth.user.role : 'crew_member',
      lat: CrewView._lastLat,
      lng: CrewView._lastLng,
      accuracy: CrewView._lastAccuracy || null,
      heading: CrewView._lastHeading || null,
      speed: CrewView._lastSpeed || null,
      status: status,
      current_job_id: currentJobId || null,
      current_job_name: currentJobName || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' }).then(function() {
      if (SupabaseDB._debug) console.debug('GPS ping sent:', status);
    }).catch(function(e) {
      if (SupabaseDB._debug) console.warn('GPS ping failed:', e);
    });
  },

  // Haversine distance in meters
  _gpsDist: function(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
      * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  // Resume tracker if page loads while clocked in
  _resumeGPS: function() {
    if (localStorage.getItem('bm-clock-in') && !CrewView._gpsInterval) {
      CrewView._startGPSTracker();
    }
  }
};
