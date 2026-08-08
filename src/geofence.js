/**
 * Branch Manager — Geofence & GPS Reminders
 *
 * 1. Geofence around the tenant's base — reminds to clock in/out
 * 2. Scheduled job reminders — push notification at job start time
 * 3. Auto-detect arriving/leaving the yard
 * 4. v1090: arriving at a job site prompts "capture notes" → opens the job
 *    and starts the voice-memo (speech-to-text) flow. Job addresses are
 *    geocoded via Nominatim, cached in localStorage ('bm-jobgeo-*').
 *
 * Uses browser Geolocation API + Notification API. All of this runs only
 * while the PWA is open/foregrounded — browsers give web apps no true
 * background geofencing; a native wrapper would be needed for that.
 */
var Geofence = {
  // White-label: the clock-in/out base is the TENANT's own geocoded
  // business address (CompanyGeo) — never SNT's Peekskill yard. null when
  // the tenant has not set an address → the base geofence is inert
  // (job-site geofences still work). _base() returns {lat,lng,radius}|null.
  BASE_RADIUS: 150, // meters (~500 ft)
  _base: function() {
    try {
      var g = (typeof CompanyGeo !== 'undefined' && CompanyGeo.cached()) || null;
      if (!g) { if (typeof CompanyGeo !== 'undefined') CompanyGeo.resolve(); return null; }
      return { lat: g.lat, lng: g.lon, radius: Geofence.BASE_RADIUS };
    } catch (e) { return null; }
  },

  watchId: null,
  isAtBase: false,
  lastNotification: 0,
  _checkInterval: null,

  init: function() {
    // Request notification permission — v637 defensive (requestPermission
    // missing on some browsers/contexts)
    if ('Notification' in window && Notification.permission === 'default'
        && typeof Notification.requestPermission === 'function') {
      try { var p = Notification.requestPermission(); if (p && typeof p.catch === 'function') p.catch(function(){}); } catch(e){}
    }

    // Start watching position
    if (navigator.geolocation) {
      Geofence.watchId = navigator.geolocation.watchPosition(
        Geofence._onPosition,
        function(err) { console.debug('Geofence: GPS error', err.message); },
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
      );
      console.debug('Geofence: watching position');
    }

    // Check for upcoming job reminders every minute
    Geofence._checkInterval = setInterval(Geofence._checkJobReminders, 60000);
    // Also check immediately
    setTimeout(Geofence._checkJobReminders, 5000);
  },

  stop: function() {
    if (Geofence.watchId !== null) {
      navigator.geolocation.clearWatch(Geofence.watchId);
      Geofence.watchId = null;
    }
    if (Geofence._checkInterval) {
      clearInterval(Geofence._checkInterval);
    }
  },

  _onPosition: function(pos) {
    var lat = pos.coords.latitude;
    var lng = pos.coords.longitude;
    // v799: stash the latest position so late-arrival detector (which runs
    // on a fixed 60s interval, not on every GPS update) can read it.
    Geofence._lastPos = { lat: lat, lng: lng, ts: Date.now() };
    var _base = Geofence._base();
    var wasAtBase = Geofence.isAtBase;
    Geofence.isAtBase = _base ? (Geofence._distance(lat, lng, _base.lat, _base.lng) <= _base.radius) : false;

    if (_base) {
    // ── ARRIVING at base ──
    if (Geofence.isAtBase && !wasAtBase) {
      var clockedIn = localStorage.getItem('bm-clock-in');
      if (!clockedIn) {
        Geofence._notify(
          '🏠 You\'re at the yard!',
          'Clock in to start tracking your hours.',
          'clock-in'
        );
        // Show in-app reminder
        Geofence._showBanner('🏠 You arrived at the yard — <a href="#" onclick="CrewView.clockIn();Geofence._hideBanner();return false;" style="color:#fff;font-weight:700;">Clock In Now</a>');
      }
    }

    // ── LEAVING base ──
    if (!Geofence.isAtBase && wasAtBase) {
      var clockedIn = localStorage.getItem('bm-clock-in');
      if (clockedIn) {
        // Check if there's a job scheduled
        var todayJobs = Geofence._getTodayJobs();
        var nextJob = todayJobs.find(function(j) { return j.status === 'scheduled'; });
        if (nextJob) {
          Geofence._notify(
            '🚛 Heading out!',
            'Next job: ' + nextJob.clientName + ' — ' + (nextJob.property || ''),
            'leaving-base'
          );
          Geofence._showBanner('🚛 Heading to <strong>' + nextJob.clientName + '</strong> — <a href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(nextJob.property || nextJob.clientName) + '" target="_blank" rel="noopener noreferrer" style="color:#fff;font-weight:700;">Navigate</a>');
        }
      } else {
        // Left without clocking in
        Geofence._notify(
          '⚠️ Did you forget to clock in?',
          'You left the yard without clocking in.',
          'forgot-clock'
        );
      }
    }
    } // end if(_base) — base geofence inert until tenant sets an address

    // ── ARRIVING at job site → prompt to capture voice notes ──
    // Gated on the Settings "Arrival Note Reminders" toggle (default ON).
    var todayJobs = Geofence.remindersEnabled() ? Geofence._getTodayJobs() : [];
    todayJobs.forEach(function(j) {
      if (j._lat && j._lng && j.status === 'scheduled') {
        var distToJob = Geofence._distance(lat, lng, j._lat, j._lng);
        if (distToJob <= 200) { // Within 200m of job site
          var notifKey = 'bm-arrived-' + j.id;
          if (!localStorage.getItem(notifKey)) {
            localStorage.setItem(notifKey, new Date().toISOString());
            Geofence._notify(
              '📍 Arrived at ' + (j.clientName || 'job site'),
              'Capture notes while the job is fresh — tap to start the mic.',
              'arrived-job',
              function() { Geofence.captureNotes(j.id); }
            );
            Geofence._showBanner('📍 At <strong>' + UI.esc(j.clientName || '') + '</strong> — <a href="#" onclick="Geofence.captureNotes(\'' + j.id + '\');return false;" style="color:#fff;font-weight:700;">🎤 Capture notes</a> &nbsp;·&nbsp; <a href="#" onclick="CrewView.startJob(\'' + j.id + '\');Geofence._hideBanner();return false;" style="color:#fff;font-weight:700;">Start Job</a>');
          }
        }
      }
    });

    // Update status display
    var statusEl = document.getElementById('gps-status');
    if (statusEl) {
      // (pre-v1090 this read an undefined `distToBase` → ReferenceError
      // whenever the crew-view GPS widget was visible away from base)
      var baseTxt = 'GPS active';
      if (_base) {
        baseTxt = Geofence.isAtBase ? 'At yard'
          : Geofence._distance(lat, lng, _base.lat, _base.lng).toFixed(0) + 'm from yard';
      }
      statusEl.innerHTML = '📍 ' + baseTxt + ' · Accuracy: ' + Math.round(pos.coords.accuracy) + 'm';
    }
  },

  // Whether the arrival "capture notes" prompt is on (Settings toggle,
  // default ON). Does not affect the base clock-in geofence.
  remindersEnabled: function() {
    return localStorage.getItem('bm-location-reminders') !== 'false';
  },

  // Fire an arrival reminder on demand, without GPS — the Settings
  // "Send a test reminder" button. Picks today's first scheduled job with
  // an address; falls back to any scheduled job so it's always testable.
  testReminder: function() {
    var pick = null;
    var today = Geofence._getTodayJobs().filter(function(j) { return j.status === 'scheduled'; });
    pick = today.find(function(j) { return j.property; }) || today[0];
    if (!pick && typeof DB !== 'undefined' && DB.jobs) {
      pick = DB.jobs.getAll().filter(function(j) { return j.status === 'scheduled' && j.property; })[0];
    }
    if (!pick) {
      if (typeof UI !== 'undefined') UI.toast('No scheduled job to test with — schedule one first', 'error');
      return;
    }
    if (typeof UI !== 'undefined') UI.toast('Test: simulating arrival at ' + (pick.clientName || 'job'));
    // Clear the once-per-day guard + the throttle so the test always shows.
    localStorage.removeItem('bm-arrived-' + pick.id);
    Geofence.lastNotification = 0;
    Geofence._notify(
      '📍 Arrived at ' + (pick.clientName || 'job site') + ' (test)',
      'Capture notes while the job is fresh — tap to start the mic.',
      'arrived-job',
      function() { Geofence.captureNotes(pick.id); }
    );
    Geofence._showBanner('📍 At <strong>' + UI.esc(pick.clientName || '') + '</strong> — <a href="#" onclick="Geofence.captureNotes(\'' + pick.id + '\');return false;" style="color:#fff;font-weight:700;">🎤 Capture notes</a> &nbsp;·&nbsp; <a href="#" onclick="CrewView.startJob(\'' + pick.id + '\');Geofence._hideBanner();return false;" style="color:#fff;font-weight:700;">Start Job</a>');
  },

  // Open the job record and start the existing voice-memo flow
  // (JobsPage._toggleVoiceMemo — speech-to-text appended to job notes).
  captureNotes: function(jobId) {
    Geofence._hideBanner();
    if (typeof JobsPage === 'undefined' || typeof loadPage !== 'function') return;
    JobsPage._pendingDetail = jobId;
    loadPage('jobs');
    // Start the mic once the job detail (and its mic button) has rendered.
    var tries = 0;
    var t = setInterval(function() {
      if (document.getElementById('job-mic-btn-' + jobId)) {
        clearInterval(t);
        JobsPage._toggleVoiceMemo(jobId);
      } else if (++tries > 24) {
        clearInterval(t); // gave up after ~6s — job detail is open, mic is one tap away
      }
    }, 250);
  },

  _checkJobReminders: function() {
    var now = new Date();
    // Resolve coords for today's job addresses (cached, one lookup per tick)
    try { Geofence._geocodeTodayJobs(); } catch (e) {}
    var todayJobs = Geofence._getTodayJobs();

    todayJobs.forEach(function(j) {
      if (j.status !== 'scheduled') return;

      // Check if job has a start time
      var jobTime = j.scheduledDate ? new Date(j.scheduledDate) : null;
      if (!jobTime) return;

      // If job time doesn't have hours set, default to 8am
      if (jobTime.getHours() === 0) jobTime.setHours(8, 0, 0);

      var minutesUntil = (jobTime - now) / 60000;
      var notifKey = 'bm-jobremind-' + j.id;
      var alreadySent = localStorage.getItem(notifKey);

      // 15 minutes before
      if (minutesUntil > 0 && minutesUntil <= 15 && !alreadySent) {
        localStorage.setItem(notifKey, new Date().toISOString());
        Geofence._notify(
          '⏰ Job starting in ' + Math.round(minutesUntil) + ' min',
          j.clientName + ' — ' + (j.property || j.description || ''),
          'job-reminder'
        );
        Geofence._showBanner('⏰ <strong>' + j.clientName + '</strong> starts in ' + Math.round(minutesUntil) + ' min — <a href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(j.property || j.clientName) + '" target="_blank" rel="noopener noreferrer" style="color:#fff;font-weight:700;">Navigate</a>');
      }

      // At job time
      if (minutesUntil <= 0 && minutesUntil > -5 && !alreadySent) {
        localStorage.setItem(notifKey, new Date().toISOString());
        Geofence._notify(
          '🌳 Time to start!',
          j.clientName + ' is scheduled NOW',
          'job-now'
        );
      }

      // v799: late-arrival auto-text. If job's startTime has passed by >15
      // min AND we're not at the property yet (>500m), text the client a
      // courtesy "running behind, on the way" + ETA. Fires once per job
      // per day. Skips silently when:
      //   - no client phone on file
      //   - no job lat/lng
      //   - Dialpad not configured (no DIALPAD_API_KEY)
      //   - kill switch bm-late-text-disabled set
      var lateKey = 'bm-late-text-' + j.id;
      if (
        minutesUntil < -15
        && minutesUntil > -180  // give up after 3hrs late — too late, call instead
        && !localStorage.getItem(lateKey)
        && localStorage.getItem('bm-late-text-disabled') !== 'true'
        && j.clientPhone && (j.clientPhone || '').replace(/\D/g, '').length >= 10
        && j._lat && j._lng
        && Geofence._lastPos
        && typeof Dialpad !== 'undefined' && Dialpad.sendSMS
      ) {
        var distToJob = Geofence._distance(
          Geofence._lastPos.lat, Geofence._lastPos.lng,
          j._lat, j._lng
        );
        if (distToJob > 500) {
          // ETA estimate: 35mph average through suburbs/highways = ~14.7 m/s.
          // Floored to 5min granularity for a believable number.
          var etaMin = Math.max(5, Math.round(distToJob / 14.7 / 60 / 5) * 5);
          var firstName = (j.clientName || '').split(' ')[0] || 'there';
          var coName = (typeof CompanyInfo !== 'undefined' && CompanyInfo.get && CompanyInfo.get('name')) || 'us';
          var msg = 'Hi ' + firstName + ', it\'s ' + coName + ' — running about ' + etaMin + ' min behind on today\'s appointment. We\'re on the way! Sorry for the delay.';
          try {
            Dialpad.sendSMS(j.clientPhone, msg, j.clientId);
            localStorage.setItem(lateKey, new Date().toISOString());
            Geofence._notify(
              '🚚 Late-arrival SMS sent',
              'Texted ' + j.clientName + ' that we\'re ~' + etaMin + ' min behind.',
              'late-text'
            );
          } catch(err) {
            console.warn('[Geofence] late-arrival SMS failed:', err);
          }
        }
      }
    });

    // End of day reminder — if still clocked in at 5pm
    if (now.getHours() === 17 && now.getMinutes() === 0) {
      var clockedIn = localStorage.getItem('bm-clock-in');
      if (clockedIn) {
        var startTime = new Date(clockedIn);
        var hoursWorked = ((now - startTime) / 3600000).toFixed(1);
        Geofence._notify(
          '🕐 End of day check',
          'You\'ve been clocked in for ' + hoursWorked + ' hours. Don\'t forget to clock out!',
          'eod'
        );
      }
    }
  },

  _getTodayJobs: function() {
    var todayStr = new Date().toISOString().split('T')[0];
    return DB.jobs.getAll().filter(function(j) {
      if (!j.scheduledDate) return false;
      return j.scheduledDate.split('T')[0] === todayStr;
    }).map(function(j) {
      // Attach cached geocode so the job-site arrival check can fire. `_lat`/
      // `_lng` are transient — db.js's _stripUnknownCols drops them on push.
      if (!j._lat && j.property) {
        var g = Geofence._geoCached(j.property);
        if (g) { j._lat = g.lat; j._lng = g.lng; }
      }
      return j;
    });
  },

  // ── Job-address geocoding (Nominatim — same provider as clientmap) ──
  // Cache: localStorage 'bm-jobgeo-<addr>' = {lat,lng} on hit, {miss:ts} on
  // no-result (retried after 24h). At most ONE uncached lookup per minute
  // tick, far inside Nominatim's 1 req/s policy.
  _geoKey: function(addr) {
    return 'bm-jobgeo-' + String(addr).toLowerCase().replace(/\s+/g, ' ').trim();
  },
  _geoCached: function(addr) {
    try {
      var v = JSON.parse(localStorage.getItem(Geofence._geoKey(addr)) || 'null');
      return (v && v.lat) ? v : null;
    } catch (e) { return null; }
  },
  _geocodeInFlight: false,
  _geocodeTodayJobs: function() {
    if (Geofence._geocodeInFlight) return;
    var jobs = Geofence._getTodayJobs();
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i];
      if (j.status !== 'scheduled' || !j.property || j._lat) continue;
      var key = Geofence._geoKey(j.property);
      var cached = null;
      try { cached = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) {}
      if (cached && (cached.lat || (cached.miss && Date.now() - cached.miss < 86400000))) continue;
      Geofence._geocodeInFlight = true;
      (function(k, addr) {
        fetch('https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=1&q=' + encodeURIComponent(addr))
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data && data.length) {
              localStorage.setItem(k, JSON.stringify({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }));
            } else {
              localStorage.setItem(k, JSON.stringify({ miss: Date.now() }));
            }
          })
          .catch(function() {})
          .then(function() { Geofence._geocodeInFlight = false; });
      })(key, j.property);
      break; // one lookup per tick
    }
  },

  // Haversine distance in meters
  _distance: function(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
      * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  // Send browser notification. Optional onclick runs when the user taps it.
  _notify: function(title, body, tag, onclick) {
    // Throttle — no more than 1 notification per 2 minutes
    if (Date.now() - Geofence.lastNotification < 120000) return;
    Geofence.lastNotification = Date.now();

    if ('Notification' in window && Notification.permission === 'granted') {
      var opts = {
        body: body,
        icon: 'icons/icon-192.png',
        tag: tag,
        vibrate: [200, 100, 200],
        requireInteraction: true
      };
      try {
        var n = new Notification(title, opts);
        n.onclick = function() {
          window.focus();
          if (typeof onclick === 'function') { try { onclick(); } catch(e) {} }
          n.close();
        };
        // Auto-close after 30 seconds
        setTimeout(function() { n.close(); }, 30000);
      } catch(e) {
        // iOS Safari has no Notification constructor — fall back to the
        // service-worker path (no click routing there; the in-app banner
        // carries the tap action, and geofencing only runs while the PWA
        // is open anyway — browsers give PWAs no true background GPS).
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
          navigator.serviceWorker.getRegistration().then(function(reg) {
            if (reg && reg.showNotification) reg.showNotification(title, opts);
          }).catch(function(){});
        }
      }
    }
  },

  // In-app banner
  _showBanner: function(html) {
    var existing = document.getElementById('geo-banner');
    if (existing) existing.remove();

    var banner = document.createElement('div');
    banner.id = 'geo-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:var(--green-dark);color:#fff;padding:14px 20px;font-size:14px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.3);display:flex;justify-content:space-between;align-items:center;';
    banner.innerHTML = '<span>' + html + '</span>'
      + '<button onclick="Geofence._hideBanner()" style="background:rgba(255,255,255,.2);border:none;color:#fff;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:16px;">✕</button>';
    document.body.appendChild(banner);

    // Auto-hide after 15 seconds
    setTimeout(function() { Geofence._hideBanner(); }, 15000);
  },

  _hideBanner: function() {
    var banner = document.getElementById('geo-banner');
    if (banner) banner.remove();
  },

  // Render GPS status widget for crew view
  renderStatus: function() {
    return '<div style="background:var(--white);border-radius:10px;padding:12px;border:1px solid var(--border);margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">'
      + '<div id="gps-status" style="font-size:12px;color:var(--text-light);">📍 Getting location...</div>'
      + '<div style="display:flex;gap:6px;">'
      + '<span style="width:8px;height:8px;border-radius:50%;background:' + (Geofence.isAtBase ? '#4caf50' : '#ff9800') + ';display:inline-block;"></span>'
      + '<span style="font-size:11px;color:var(--text-light);">' + (Geofence.isAtBase ? 'At Yard' : 'In Field') + '</span>'
      + '</div></div>';
  }
};

// Auto-start geofencing when logged in
if (Auth && Auth.isLoggedIn()) {
  Geofence.init();
}
