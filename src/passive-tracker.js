/**
 * Branch Manager — Passive Location Tracker (BETA, owner-only)
 *
 * While BM is the active tab, captures a GPS ping every N seconds, batches
 * them to Supabase (location_pings), and detects "dwells" — periods where
 * you've stayed within a small radius for long enough to probably be doing
 * a job. Dwells get written to `detected_locations` with status='pending'
 * so the Review page can ask you to tag them as job sites.
 *
 * PWA-only mode for now:
 *   - Works while this tab is visible (foreground).
 *   - When backgrounded, iOS/Safari stops firing geolocation updates.
 *   - Capacitor background-geolocation plugin will replace watchPosition
 *     without changing the upstream logic when the native build is ready.
 *
 * Requires:
 *   - Settings toggle  → bm-passive-track === 'true'
 *   - Supabase tables  → location_pings + detected_locations (migrate-location-tracking.sql)
 *   - navigator.geolocation
 */
var PassiveTracker = (function() {

  var state = {
    running:       false,
    watchId:       null,
    flushInterval: null,
    sessionId:     null,
    lastFix:       null,   // { lat, lng, accuracy_m, ts }
    buffer:        [],     // unsaved pings
    cluster:       null    // active dwell cluster being tracked
  };

  // Settings — re-read from localStorage every time so the user can tune live
  function S() {
    return {
      pingIntervalSec: parseInt(localStorage.getItem('bm-passive-interval')       || '60', 10),
      dwellRadiusM:    parseInt(localStorage.getItem('bm-passive-dwell-radius')   || '50', 10),
      dwellMinutes:    parseInt(localStorage.getItem('bm-passive-dwell-minutes')  || '60', 10),
      flushIntervalMs: 3 * 60 * 1000 // 3 minutes
    };
  }

  function uuid4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Haversine distance in meters
  function distM(a, b) {
    var R = 6371000;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
    var s = Math.sin(dLat/2)**2 + Math.sin(dLng/2)**2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function getTenantId() {
    return (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
  }
  function getUserId() {
    return (typeof Auth !== 'undefined' && Auth.user && Auth.user.id) ? Auth.user.id : null;
  }

  // ── Position handler — one fix from watchPosition ────────────────────────
  function onPosition(pos) {
    if (!state.running) return;
    var now = Date.now();
    var fix = {
      lat:        pos.coords.latitude,
      lng:        pos.coords.longitude,
      accuracy_m: pos.coords.accuracy,
      altitude_m: pos.coords.altitude,
      speed_mps:  pos.coords.speed,
      heading:    pos.coords.heading,
      ts:         now,
      iso:        new Date(now).toISOString()
    };

    // Rate-limit — skip if we got a fix within the ping interval
    if (state.lastFix && (now - state.lastFix.ts) < (S().pingIntervalSec * 1000) - 5000) return;

    state.lastFix = fix;

    // Skip low-accuracy fixes (>200m error = useless for dwell)
    if (fix.accuracy_m && fix.accuracy_m > 200) return;

    state.buffer.push({
      id:          uuid4(),
      tenant_id:   getTenantId(),
      user_id:     getUserId(),
      lat:         fix.lat,
      lng:         fix.lng,
      accuracy_m:  fix.accuracy_m,
      altitude_m:  fix.altitude_m,
      speed_mps:   fix.speed_mps,
      heading:     fix.heading,
      client_ts:   fix.iso,
      session_id:  state.sessionId,
      source:      document.hidden ? 'background' : 'foreground'
    });

    // Dwell detection — maintain a running cluster
    updateCluster(fix);
  }

  function onError(err) {
    console.warn('[PassiveTracker] GPS error:', err.message);
    // Don't stop — iOS throws transient errors all the time; watchPosition recovers.
  }

  // ── Dwell cluster tracking ──────────────────────────────────────────────
  function updateCluster(fix) {
    var s = S();
    if (!state.cluster) {
      state.cluster = {
        center_lat:    fix.lat,
        center_lng:    fix.lng,
        first_seen_ts: fix.ts,
        last_seen_ts:  fix.ts,
        ping_count:    1,
        promoted:      false
      };
      return;
    }
    var c = state.cluster;
    var d = distM({ lat: c.center_lat, lng: c.center_lng }, { lat: fix.lat, lng: fix.lng });
    if (d <= s.dwellRadiusM) {
      // Still in the same place — extend
      c.ping_count += 1;
      c.last_seen_ts = fix.ts;
      // Slight drift toward new fix (running mean, weighted)
      c.center_lat = (c.center_lat * 0.9) + (fix.lat * 0.1);
      c.center_lng = (c.center_lng * 0.9) + (fix.lng * 0.1);

      var dwellMin = (c.last_seen_ts - c.first_seen_ts) / 60000;
      if (!c.promoted && dwellMin >= s.dwellMinutes) {
        promoteCluster(c);
        c.promoted = true;
      } else if (c.promoted) {
        // Keep updating dwell_minutes on the existing detected_location row
        updatePromotedCluster(c);
      }
    } else {
      // Moved out of radius — discard cluster (didn't dwell long enough)
      // OR if promoted, finalize it and start a fresh one
      state.cluster = null;
      // Will be re-created on the NEXT fix
    }
  }

  function promoteCluster(c) {
    var row = {
      id:            uuid4(),
      tenant_id:     getTenantId(),
      user_id:       getUserId(),
      center_lat:    c.center_lat,
      center_lng:    c.center_lng,
      radius_m:      S().dwellRadiusM,
      first_seen_at: new Date(c.first_seen_ts).toISOString(),
      last_seen_at:  new Date(c.last_seen_ts).toISOString(),
      dwell_minutes: Math.round((c.last_seen_ts - c.first_seen_ts) / 60000),
      ping_count:    c.ping_count,
      status:        'pending'
    };
    c.id = row.id;
    if (!SupabaseDB || !SupabaseDB.ready) return;
    SupabaseDB.client.from('detected_locations').insert(row).then(function(res) {
      if (res.error) console.warn('[PassiveTracker] dwell insert failed:', res.error.message);
      else notifyDwell(row);
    });
  }

  function updatePromotedCluster(c) {
    if (!c.id || !SupabaseDB || !SupabaseDB.ready) return;
    SupabaseDB.client.from('detected_locations').update({
      center_lat:    c.center_lat,
      center_lng:    c.center_lng,
      last_seen_at:  new Date(c.last_seen_ts).toISOString(),
      dwell_minutes: Math.round((c.last_seen_ts - c.first_seen_ts) / 60000),
      ping_count:    c.ping_count
    }).eq('id', c.id).then(function(){});
  }

  function notifyDwell(row) {
    // Foreground toast
    try { UI.toast('📍 New place detected — tap Review to tag'); } catch(e) {}
    // Browser notification if permission granted
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        var n = new Notification('Branch Manager', {
          body: 'Been here ' + row.dwell_minutes + ' min — tag as a job site?',
          icon: './icons/icon-192.png',
          tag:  'passive-dwell-' + row.id
        });
        n.onclick = function() {
          window.focus();
          if (typeof loadPage === 'function') loadPage('tracking');
        };
      } catch(e) {}
    }
  }

  // ── Buffer flush to Supabase ───────────────────────────────────────────
  function flush() {
    if (!state.buffer.length) return;
    if (!SupabaseDB || !SupabaseDB.ready) return;
    if (!getTenantId() || !getUserId()) return;
    var batch = state.buffer.splice(0, state.buffer.length);
    SupabaseDB.client.from('location_pings').insert(batch).then(function(res) {
      if (res.error) {
        console.warn('[PassiveTracker] ping flush failed:', res.error.message);
        // Put them back so next flush retries
        state.buffer = batch.concat(state.buffer);
      }
    });
  }

  // ── Mode detection ─────────────────────────────────────────────────────
  // In the Capacitor-wrapped native app, prefer the background-geolocation
  // plugin (true background tracking with "Always" permission). Fall back to
  // browser watchPosition in PWA mode (foreground-only).
  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }
  function nativeBG() {
    // Expose from the plugin bridge: BackgroundGeolocation.addWatcher / removeWatcher
    // Exact API depends on the plugin chosen at build-time.
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BackgroundGeolocation) || null;
  }

  // ── Public API ─────────────────────────────────────────────────────────
  function start() {
    if (state.running) return;

    // Ask notification permission once — v637 defensive: requestPermission
    // may not exist on all browsers (Sentry caught TypeError on Chrome 142/Win)
    if (typeof Notification !== 'undefined' && Notification.permission === 'default'
        && typeof Notification.requestPermission === 'function') {
      try { var p = Notification.requestPermission(); if (p && typeof p.catch === 'function') p.catch(function(){}); } catch(e){}
    }

    state.sessionId = uuid4();
    state.lastFix   = null;
    state.buffer    = [];
    state.cluster   = null;
    state.running   = true;

    var bg = nativeBG();
    if (bg && bg.addWatcher) {
      // Native: true background tracking via Capacitor plugin
      bg.addWatcher({
        backgroundMessage:   'Branch Manager is tracking job sites.',
        backgroundTitle:     'Branch Manager',
        requestPermissions:  true,
        stale:               false,
        distanceFilter:      25  // meters — plugin's internal throttle
      }, function(location, error) {
        if (error) { onError(error); return; }
        // Plugin location shape: { latitude, longitude, accuracy, altitude, speed, bearing, time }
        onPosition({
          coords: {
            latitude:  location.latitude,
            longitude: location.longitude,
            accuracy:  location.accuracy,
            altitude:  location.altitude,
            speed:     location.speed,
            heading:   location.bearing
          },
          timestamp: location.time || Date.now()
        });
      }).then(function(watcherId) {
        state.watchId = watcherId;
        console.debug('[PassiveTracker] native BG tracking started, watcher', watcherId);
      }).catch(function(err) {
        console.warn('[PassiveTracker] native BG failed, falling back to watchPosition:', err);
        state.watchId = navigator.geolocation.watchPosition(onPosition, onError, {
          enableHighAccuracy: true, maximumAge: 15000, timeout: 15000
        });
      });
    } else {
      // PWA fallback — foreground only
      if (!navigator.geolocation) { console.warn('[PassiveTracker] no geolocation'); state.running = false; return; }
      state.watchId = navigator.geolocation.watchPosition(onPosition, onError, {
        enableHighAccuracy: true, maximumAge: 15000, timeout: 15000
      });
    }

    state.flushInterval = setInterval(flush, S().flushIntervalMs);
    console.debug('[PassiveTracker] started (' + (isNative() ? 'native' : 'PWA') + '), session', state.sessionId);
  }

  function stop() {
    if (!state.running) return;
    var bg = nativeBG();
    if (state.watchId != null) {
      if (bg && bg.removeWatcher && typeof state.watchId === 'string') {
        bg.removeWatcher({ id: state.watchId }).catch(function(){});
      } else if (navigator.geolocation) {
        navigator.geolocation.clearWatch(state.watchId);
      }
      state.watchId = null;
    }
    if (state.flushInterval) { clearInterval(state.flushInterval); state.flushInterval = null; }
    flush(); // drain
    state.running = false;
    state.cluster = null;
    console.debug('[PassiveTracker] stopped');
  }

  function applySettings() {
    if (!state.running) return;
    // Simple: stop + restart with new settings
    stop();
    start();
  }

  function status() {
    return {
      running:    state.running,
      sessionId:  state.sessionId,
      bufferSize: state.buffer.length,
      lastFix:    state.lastFix,
      cluster:    state.cluster
    };
  }

  // Auto-start on boot if the setting is on, once Auth + Supabase are ready
  function autoStart() {
    var tries = 0;
    var iv = setInterval(function() {
      tries++;
      var ready = (typeof SupabaseDB !== 'undefined' && SupabaseDB.ready)
        && (typeof Auth !== 'undefined' && Auth.user && Auth.user.id);
      if (ready) {
        clearInterval(iv);
        if (localStorage.getItem('bm-passive-track') === 'true') {
          console.debug('[PassiveTracker] auto-start from settings');
          start();
        }
      } else if (tries > 30) {
        clearInterval(iv);
        console.warn('[PassiveTracker] gave up waiting for Auth/Supabase');
      }
    }, 500);
  }

  // Flush on tab close
  window.addEventListener('pagehide', function() { if (state.running) flush(); });

  return {
    start: start,
    stop: stop,
    applySettings: applySettings,
    status: status,
    autoStart: autoStart,
    // Exposed for the Review page / debugging
    _state: state
  };
})();

// Kick off auto-start after deferred scripts load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function(){ PassiveTracker.autoStart(); });
} else {
  PassiveTracker.autoStart();
}
