/**
 * Branch Manager — Crew Dispatch / Today's Route
 * Shows today's jobs in order with driving directions between stops
 * Includes route optimization, live ETAs, distance badges, and route summary
 */

// Town coordinate lookup for Westchester/Putnam area
var _townCoords = {
  'Peekskill': [41.2901, -73.9212],
  'Yorktown': [41.2709, -73.7770],
  'Cortlandt': [41.2504, -73.8866],
  'Croton': [41.2087, -73.8912],
  'Ossining': [41.1626, -73.8615],
  'Briarcliff': [41.1459, -73.8237],
  'Chappaqua': [41.1595, -73.7648],
  'Mount Kisco': [41.2048, -73.7268],
  'Bedford': [41.2043, -73.6440],
  'Somers': [41.3350, -73.7198],
  'Katonah': [41.2598, -73.6851],
  'Mahopac': [41.3723, -73.7318],
  'Cold Spring': [41.4200, -73.9547],
  'Garrison': [41.3817, -73.9477],
  'Putnam Valley': [41.3948, -73.8587],
  'Pleasantville': [41.1329, -73.7915],
  'Carmel': [41.4301, -73.6807],
  'White Plains': [41.0340, -73.7629],
  'Buchanan': [41.2612, -73.9378],
  'Verplanck': [41.2534, -73.9578]
};

var _hqCoords = [41.2901, -73.9212]; // 1 Highland Industrial Park, Peekskill

var DispatchPage = {

  // Haversine distance in miles between two [lat, lng] pairs
  _haversine: function(coord1, coord2) {
    var R = 3959; // Earth radius in miles
    var dLat = (coord2[0] - coord1[0]) * Math.PI / 180;
    var dLon = (coord2[1] - coord1[1]) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(coord1[0] * Math.PI / 180) * Math.cos(coord2[0] * Math.PI / 180)
      * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  // Get coordinates for a job — check lat/lng fields, then try town lookup
  _getJobCoords: function(job) {
    if (job.lat && job.lng) return [job.lat, job.lng];
    if (job.latitude && job.longitude) return [job.latitude, job.longitude];

    var address = job.property || job.address || '';
    var towns = Object.keys(_townCoords);
    for (var i = 0; i < towns.length; i++) {
      if (address.toLowerCase().indexOf(towns[i].toLowerCase()) !== -1) {
        return _townCoords[towns[i]];
      }
    }
    // Default to HQ if no match
    return _hqCoords;
  },

  // Estimate job duration in hours based on total
  _estimateJobHours: function(total) {
    if (!total || total <= 0) return 1;
    if (total <= 250) return 1;
    if (total <= 500) return 2;
    if (total <= 750) return 3;
    if (total <= 1000) return 4;
    if (total <= 1500) return 6;
    return 8; // $2000+ = full day
  },

  // Format time from decimal hours (e.g., 9.25 -> "9:15 AM")
  _formatTime: function(decimalHours) {
    var hours = Math.floor(decimalHours);
    var minutes = Math.round((decimalHours - hours) * 60);
    if (minutes >= 60) { hours += 1; minutes = 0; }
    var ampm = hours >= 12 ? 'PM' : 'AM';
    var displayHour = hours > 12 ? hours - 12 : hours;
    if (displayHour === 0) displayHour = 12;
    var displayMin = minutes < 10 ? '0' + minutes : '' + minutes;
    return displayHour + ':' + displayMin + ' ' + ampm;
  },

  // Calculate route stats: distances, ETAs, total miles, finish time
  _calcRouteStats: function(jobs) {
    var stats = {
      distances: [],    // distance from prev stop (HQ for first)
      etas: [],         // ETA string for each job
      totalMiles: 0,
      finishTime: '',
      durations: []     // job duration in hours
    };

    if (!jobs.length) return stats;

    var currentTime = 7.0; // 7:00 AM in decimal hours
    var prevCoords = _hqCoords;
    var totalDist = 0;

    for (var i = 0; i < jobs.length; i++) {
      var jobCoords = this._getJobCoords(jobs[i]);
      var dist = this._haversine(prevCoords, jobCoords);

      // Road distance is roughly 1.3x straight-line distance
      var roadDist = dist * 1.3;
      stats.distances.push(roadDist);
      totalDist += roadDist;

      // Travel time: 15 min average between jobs
      if (i > 0) {
        currentTime += 0.25; // 15 minutes travel
      }

      stats.etas.push(this._formatTime(currentTime));

      // Job duration based on total
      var duration = this._estimateJobHours(jobs[i].total || 0);
      stats.durations.push(duration);
      currentTime += duration;

      prevCoords = jobCoords;
    }

    // Add return trip distance
    var returnDist = this._haversine(prevCoords, _hqCoords) * 1.3;
    totalDist += returnDist;

    stats.totalMiles = Math.round(totalDist * 10) / 10;
    stats.finishTime = this._formatTime(currentTime + 0.25); // 15 min return

    return stats;
  },

  // Nearest-neighbor route optimization
  optimizeRoute: function() {
    var todayStr = new Date().toISOString().split('T')[0];
    var jobs = DB.jobs.getAll().filter(function(j) {
      if (!j.scheduledDate) return false;
      return j.scheduledDate.split('T')[0] === todayStr;
    });

    if (jobs.length < 2) {
      UI.toast('Need at least 2 jobs to optimize', 'error');
      return;
    }

    // Nearest-neighbor algorithm starting from HQ
    var self = DispatchPage;
    var unvisited = jobs.slice();
    var ordered = [];
    var currentCoords = _hqCoords;

    while (unvisited.length > 0) {
      var nearestIdx = 0;
      var nearestDist = Infinity;

      for (var i = 0; i < unvisited.length; i++) {
        var coords = self._getJobCoords(unvisited[i]);
        var dist = self._haversine(currentCoords, coords);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }

      var nearest = unvisited.splice(nearestIdx, 1)[0];
      ordered.push(nearest);
      currentCoords = self._getJobCoords(nearest);
    }

    // Update schedule order by setting a routeOrder field
    for (var k = 0; k < ordered.length; k++) {
      DB.jobs.update(ordered[k].id, { routeOrder: k + 1 });
    }

    var routeStats = self._calcRouteStats(ordered);
    UI.toast('Route optimized! Estimated ' + routeStats.totalMiles + ' miles');
    loadPage('dispatch');
  },

  render: function() {
    var today = new Date();
    var todayStr = today.toISOString().split('T')[0];
    var jobs = DB.jobs.getAll().filter(function(j) {
      if (!j.scheduledDate) return false;
      return j.scheduledDate.split('T')[0] === todayStr;
    });

    // Sort by routeOrder if available, otherwise keep original order
    jobs.sort(function(a, b) {
      var aOrder = a.routeOrder || 999;
      var bOrder = b.routeOrder || 999;
      return aOrder - bOrder;
    });

    // Calculate route stats
    var routeStats = this._calcRouteStats(jobs);

    // v662: Header is just title + date. Action buttons moved below the
    // map per "map first" \u2014 the map is what dispatchers want to see
    // immediately on landing.
    var html = '<div style="margin-bottom:14px;">'
      + '<h2 style="margin:0;">\uD83D\uDE9B Today\'s Dispatch</h2>'
      + '<p style="color:var(--text-light);font-size:13px;margin:2px 0 0;">' + UI.dateShort(today.toISOString()) + ' \u2014 ' + jobs.length + ' job' + (jobs.length === 1 ? '' : 's') + '</p>'
      + '</div>';

    // v662: Route summary collapsed from a 4-up gradient card to a single
    // line \u2014 same data, ~80px less vertical space, no heavy visual.
    if (jobs.length) {
      var dayTotal = jobs.reduce(function(s, j) { return s + (j.total || 0); }, 0);
      html += '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;font-size:13px;color:var(--green-dark);">'
        + '<span><strong>' + jobs.length + '</strong> job' + (jobs.length === 1 ? '' : 's') + '</span>'
        + '<span style="color:#cbd5e1;">\u00B7</span>'
        + '<span><strong>' + UI.money(dayTotal) + '</strong></span>'
        + '<span style="color:#cbd5e1;">\u00B7</span>'
        + '<span><strong>' + routeStats.totalMiles + '</strong> mi</span>'
        + '<span style="color:#cbd5e1;">\u00B7</span>'
        + '<span>finish <strong>' + routeStats.finishTime + '</strong></span>'
        + '</div>';
    }

    // ═══ LIVE MAP — Jobs + Crew + Fleet vehicles + opt-in layers ═══
    var fleetOn     = window._dispatchFleetLayer !== false;   // default ON
    var chipDropsOn = window._dispatchChipDropsLayer === true; // default OFF
    var weatherOn   = window._dispatchWeatherLayer === true;   // default OFF
    var activeCount = (fleetOn ? 1 : 0) + (chipDropsOn ? 1 : 0) + (weatherOn ? 1 : 0);
    var layerOpt = function(stateKey, action, checked, label) {
      return '<label style="display:flex;gap:8px;align-items:center;padding:8px 12px;cursor:pointer;font-size:13px;border-radius:6px;">'
        +   '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="window.' + stateKey + '=this.checked;DispatchPage.' + action + '();" style="cursor:pointer;">'
        +   label
        + '</label>';
    };
    html += '<div id="dispatch-map-wrap" style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:16px;position:relative;">'
      + '<div style="padding:10px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);gap:8px;flex-wrap:wrap;">'
      + '<span style="font-weight:700;font-size:14px;">📍 Live Map</span>'
      + '<div style="display:flex;gap:10px;align-items:center;">'
      +   '<details id="dispatch-layers-dd" style="position:relative;">'
      +     '<summary style="list-style:none;cursor:pointer;background:#f1f5f9;border:1px solid var(--border);border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;color:var(--text);user-select:none;">🎛 Layers' + (activeCount ? ' <span style="background:var(--green-dark);color:#fff;border-radius:10px;padding:1px 7px;margin-left:4px;font-size:11px;">' + activeCount + '</span>' : '') + ' ▾</summary>'
      +     '<div style="position:absolute;right:0;top:calc(100% + 4px);background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.08);min-width:180px;padding:4px;z-index:50;">'
      +       layerOpt('_dispatchFleetLayer',     '_refreshFleetMarkers', fleetOn,     '🚛 Fleet')
      +       layerOpt('_dispatchChipDropsLayer', '_loadChipDrops',       chipDropsOn, '🪵 Chip Drops')
      +       layerOpt('_dispatchWeatherLayer',   '_toggleWeatherLayer',  weatherOn,   '🌧 Radar')
      +     '</div>'
      +   '</details>'
      +   '<span id="dispatch-map-status" style="font-size:11px;color:var(--text-light);">Loading...</span>'
      + '</div></div>'
      + '<div id="dispatch-map" style="height:520px;width:100%;"></div></div>';

    // v662: Route action buttons moved below the map. Map first, act second.
    if (jobs.length) {
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">'
        + '<button onclick="DispatchPage.optimizeRoute()" style="background:#1565c0;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">🔄 Optimize Route</button>'
        + '<button onclick="DispatchPage.openRoute()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 14px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">🗺 Open in Maps</button>'
        + '<button onclick="DispatchPage.shareRoute()" style="background:#fff;color:var(--text);border:1px solid var(--border);padding:8px 14px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">🚛 Share Truck Route</button>'
        + '</div>';
    }

    // v685: Weather widget removed from Dispatch — there's a topbar weather
    // chip now. Radar map layer toggle (above) still available. Doug ask.

    // Job route list \u2014 v685: compact rows; click to pan map (not nav-away).
    html += '<div style="position:relative;">';
    if (jobs.length) {
      html += '<div style="font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;margin:4px 0 8px;">Today\'s route \u2014 click a stop to pan map</div>';
      jobs.forEach(function(j, idx) {
        var statusColors = { scheduled: '#2196f3', in_progress: '#ff9800', completed: '#4caf50' };
        var color = statusColors[j.status] || '#999';
        var distMiles = routeStats.distances[idx] || 0;
        var distLabel = distMiles < 1 ? '<1mi' : (Math.round(distMiles * 10) / 10) + 'mi';
        var eta = routeStats.etas[idx] || '';
        html += '<div onclick="DispatchPage._panToJob(\'' + j.id + '\')" '
          + 'style="display:flex;align-items:center;gap:10px;background:var(--white);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px;cursor:pointer;font-size:13px;">'
          +   '<div style="width:24px;height:24px;background:' + color + ';border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;flex-shrink:0;">' + (idx + 1) + '</div>'
          +   '<div style="flex:1;min-width:0;">'
          +     '<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.clientName || ('Job #' + j.jobNumber)) + '</div>'
          +     '<div style="font-size:11px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.property || j.address || '\u2014') + '</div>'
          +   '</div>'
          +   '<div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">'
          +     (eta ? '<span style="background:#e3f2fd;color:#1565c0;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;">ETA ' + eta + '</span>' : '')
          +     '<span style="background:#fff3e0;color:#e65100;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;">' + distLabel + '</span>'
          +     '<span style="font-weight:700;color:var(--green-dark);font-size:12px;">' + UI.money(j.total || 0) + '</span>'
          +     '<button onclick="event.stopPropagation();JobsPage.showDetail(\'' + j.id + '\')" title="Open job detail" style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;color:var(--text-light);">\u2197</button>'
          +   '</div>'
          + '</div>';
      });
    } else {
      // v685: when today is empty, show upcoming/approved jobs as fallback.
      // Click \u2192 pan map. Same "click \u2192 flyTo" pattern.
      var upcoming = DB.jobs.getAll().filter(function(j) {
        var s = (j.status || '').toLowerCase();
        if (s === 'completed' || s === 'cancelled' || s === 'archived') return false;
        // Future-scheduled OR approved-not-yet-scheduled
        if (j.scheduledDate) {
          var d = j.scheduledDate.split('T')[0];
          return d > todayStr;
        }
        return s === 'scheduled' || s === 'approved' || s === 'pending';
      }).sort(function(a, b) {
        var ad = a.scheduledDate || '9999';
        var bd = b.scheduledDate || '9999';
        return ad.localeCompare(bd);
      }).slice(0, 12);

      if (upcoming.length) {
        html += '<div style="font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;margin:4px 0 8px;">No jobs today \u2014 upcoming &amp; approved (' + upcoming.length + ') \u2014 click to pan map</div>';
        upcoming.forEach(function(j) {
          var when = j.scheduledDate ? UI.dateShort(j.scheduledDate) : (j.status || 'unscheduled');
          html += '<div onclick="DispatchPage._panToJob(\'' + j.id + '\')" '
            + 'style="display:flex;align-items:center;gap:10px;background:var(--white);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px;cursor:pointer;font-size:13px;">'
            +   '<div style="width:8px;height:8px;background:#2196f3;border-radius:50%;flex-shrink:0;"></div>'
            +   '<div style="flex:1;min-width:0;">'
            +     '<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.clientName || ('Job #' + j.jobNumber)) + '</div>'
            +     '<div style="font-size:11px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.property || j.address || '\u2014') + '</div>'
            +   '</div>'
            +   '<div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">'
            +     '<span style="font-size:11px;color:var(--text-light);">' + when + '</span>'
            +     '<span style="font-weight:700;color:var(--green-dark);font-size:12px;">' + UI.money(j.total || 0) + '</span>'
            +     '<button onclick="event.stopPropagation();JobsPage.showDetail(\'' + j.id + '\')" title="Open job detail" style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;color:var(--text-light);">\u2197</button>'
            +   '</div>'
            + '</div>';
        });
      } else {
        html += '<div style="text-align:center;padding:30px 20px;background:var(--white);border-radius:10px;border:1px solid var(--border);font-size:13px;color:var(--text-light);">'
          + '\uD83C\uDF33 No upcoming jobs. Open the <a onclick="loadPage(\'schedule\');return false;" style="color:var(--green-dark);cursor:pointer;">schedule</a> to plan work.'
          + '</div>';
      }
    }
    html += '</div>';

    return html;
  },

  navigate: function(address) {
    if (!address) { UI.toast('No address on file', 'error'); return; }
    var url = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(address);
    window.open(url, '_blank');
  },

  // v685: pan/zoom dispatch map to a specific job's location, open its
  // popup if a marker exists. Used when user clicks a job card in the
  // list below the map.
  _panToJob: function(jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j) return;
    var coords = DispatchPage._getJobCoords(j);
    if (!coords || !DispatchPage._map) return;
    DispatchPage._map.flyTo({ center: [coords[1], coords[0]], zoom: 15, speed: 1.3 });
    // Open the marker's popup if we have one cached for this job
    var markers = DispatchPage._jobMarkers || [];
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var ll = m.getLngLat();
      if (Math.abs(ll.lng - coords[1]) < 0.0001 && Math.abs(ll.lat - coords[0]) < 0.0001) {
        try { m.togglePopup(); } catch(e) {}
        break;
      }
    }
    // Scroll the page up so the map is visible
    var mapEl = document.getElementById('dispatch-map-wrap');
    if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  callClient: function(jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j) { UI.toast('Job not found'); return; }
    var client = j.clientId ? DB.clients.getById(j.clientId) : null;
    var phone = j.clientPhone || (client && client.phone);
    if (!phone) { UI.toast('No phone number on file'); return; }
    window.location.href = 'tel:' + phone.replace(/\D/g,'');
  },

  openRoute: function() {
    var jobs = DB.jobs.getAll().filter(function(j) {
      if (!j.scheduledDate) return false;
      return j.scheduledDate.split('T')[0] === new Date().toISOString().split('T')[0];
    });
    if (!jobs.length) { UI.toast('No jobs today', 'error'); return; }

    // Sort by routeOrder if optimized
    jobs.sort(function(a, b) {
      return (a.routeOrder || 999) - (b.routeOrder || 999);
    });

    // Build Google Maps multi-stop URL
    var origin = encodeURIComponent(BM_CONFIG.address || '1 Highland Industrial Park, Peekskill, NY 10566');
    var waypoints = jobs.map(function(j) { return encodeURIComponent(j.property || j.address || ''); }).join('/');
    var url = 'https://www.google.com/maps/dir/' + origin + '/' + waypoints + '/' + origin;
    window.open(url, '_blank');
  },

  // Build a crew-ready route message: truck specs + ordered stops + locked Google Maps URL.
  // Locking via explicit /waypoints/ path prevents Google from reordering into shortcuts
  // (which is how crews end up under low bridges on the Taconic).
  _buildRouteMessage: function(jobs) {
    var specs = (typeof BM_CONFIG !== 'undefined' && BM_CONFIG.truckSpecs) || {};
    var origin = BM_CONFIG.address || '';
    var originEnc = encodeURIComponent(origin);
    var waypoints = jobs.map(function(j) { return encodeURIComponent(j.property || j.address || ''); }).join('/');
    var url = 'https://www.google.com/maps/dir/' + originEnc + '/' + waypoints + '/' + originEnc;

    var lines = [];
    lines.push('🚛 LOCKED TRUCK ROUTE — ' + new Date().toLocaleDateString());
    lines.push('');
    if (specs.heightFt || specs.heightIn) {
      lines.push('⚠️ Truck height: ' + (specs.heightFt || 0) + '\'' + (specs.heightIn || 0) + '"');
    }
    if (specs.weightLbs) {
      lines.push('⚠️ GVWR: ' + specs.weightLbs.toLocaleString() + ' lbs');
    }
    if (specs.notes) {
      lines.push('⚠️ ' + specs.notes);
    }
    lines.push('');
    lines.push('Follow stops IN ORDER. Do not let GPS reorder:');
    jobs.forEach(function(j, i) {
      var label = (i + 1) + '. ' + (j.clientName || 'Job') + ' — ' + (j.property || j.address || 'no address');
      if (j.scheduledTime) label += ' @ ' + j.scheduledTime;
      lines.push(label);
    });
    lines.push('');
    lines.push('Open route: ' + url);
    return { text: lines.join('\n'), url: url };
  },

  shareRoute: function() {
    var jobs = DB.jobs.getAll().filter(function(j) {
      if (!j.scheduledDate) return false;
      return j.scheduledDate.split('T')[0] === new Date().toISOString().split('T')[0];
    });
    if (!jobs.length) { UI.toast('No jobs today', 'error'); return; }
    jobs.sort(function(a, b) { return (a.routeOrder || 999) - (b.routeOrder || 999); });

    var msg = DispatchPage._buildRouteMessage(jobs);

    // Try the native share sheet first (iOS / Android / Safari desktop)
    if (navigator.share) {
      navigator.share({
        title: 'Truck Route — ' + new Date().toLocaleDateString(),
        text: msg.text
      }).catch(function(){ /* user cancelled */ });
      return;
    }

    // Fallback — show a modal with the message + copy button
    var safeText = (msg.text || '').replace(/</g, '&lt;');
    var html = '<div style="padding:4px 0;">'
      + '<p style="font-size:12px;color:var(--text-light);margin-bottom:12px;">Copy + paste into text message to crew. Waypoints are locked in order — Google Maps won\'t reroute them.</p>'
      + '<textarea id="bm-route-text" readonly style="width:100%;height:260px;font-family:monospace;font-size:12px;padding:10px;border:1px solid var(--border);border-radius:8px;box-sizing:border-box;">' + safeText + '</textarea>'
      + '<div style="display:flex;gap:8px;margin-top:12px;">'
      +   '<button class="btn btn-primary" style="flex:1;" onclick="(function(){var t=document.getElementById(\'bm-route-text\');t.select();document.execCommand(\'copy\');UI.toast(\'Copied ✓\');})()">📋 Copy to clipboard</button>'
      +   '<button class="btn btn-outline" onclick="window.open(\'sms:?&body=\' + encodeURIComponent(document.getElementById(\'bm-route-text\').value))">💬 Send via SMS</button>'
      + '</div>'
      + '</div>';
    UI.showModal('🚛 Share Truck Route', html);
  },

  startJob: function(jobId) {
    DB.jobs.update(jobId, { status: 'in_progress', startedAt: new Date().toISOString() });
    UI.toast('Job started!');
    loadPage('dispatch');
  },

  completeJob: function(jobId) {
    // v460: auto-draft on dispatch complete (no prompt opportunity here).
    var r = (typeof Workflow !== 'undefined' && Workflow.completeAndDraft)
      ? Workflow.completeAndDraft(jobId)
      : (DB.jobs.update(jobId, { status: 'completed', completedAt: new Date().toISOString() }), { invoice: null });
    UI.toast(r.invoice ? 'Job completed · Invoice #' + r.invoice.invoiceNumber + ' draft ready' : 'Job completed!');
    loadPage('dispatch');
  },

  // ═══ LIVE MAP ═══
  _map: null,
  _crewMarkers: {},
  _jobMarkers: [],
  _refreshTimer: null,

  initMap: function() {
    var mapEl = document.getElementById('dispatch-map');
    if (!mapEl) return;  // page nav'd away
    // v663: maplibre is `defer`-loaded from unpkg — may not be ready when
    // initMap fires on first render. Was bailing with "Map unavailable"; now
    // retries ~every 50ms until ready (typical: 1-3 retries on cold load).
    if (typeof maplibregl === 'undefined') {
      var status = document.getElementById('dispatch-map-status');
      if (status) status.textContent = 'Loading map…';
      DispatchPage._waitMs = (DispatchPage._waitMs || 0) + 50;
      if (DispatchPage._waitMs > 5000) {  // give up after 5s
        if (status) status.textContent = 'Map unavailable (maplibre failed to load)';
        return;
      }
      setTimeout(function() { DispatchPage.initMap(); }, 50);
      return;
    }
    DispatchPage._waitMs = 0;

    DispatchPage._map = new maplibregl.Map({
      container: 'dispatch-map',
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [-73.9212, 41.2901], // Peekskill
      zoom: 11
    });

    DispatchPage._map.addControl(new maplibregl.NavigationControl(), 'top-right');

    DispatchPage._map.on('load', function() {
      // Add HQ marker
      new maplibregl.Marker({ color: '#1a3c12' })
        .setLngLat([-73.9210, 41.2847])
        .setPopup(new maplibregl.Popup().setHTML('<strong>🏠 HQ</strong><br>1 Highland Industrial Park'))
        .addTo(DispatchPage._map);

      // Add today's job pins (sync, no network)
      DispatchPage._addJobPins();

      // v663: Fire all data loads in parallel (was sequential). Each is its
      // own Supabase round-trip; running them concurrently shaves ~half the
      // perceived load time. None of them depend on each other.
      DispatchPage._loadCrewLocations();
      DispatchPage._loadFleetLocations();
      DispatchPage._loadChipDrops();
      DispatchPage._toggleWeatherLayer();

      // v663: Refresh interval bumped 30s → 60s. Crew+fleet positions don't
      // change fast enough to justify a Supabase round-trip every half minute.
      DispatchPage._refreshTimer = setInterval(function() {
        DispatchPage._loadCrewLocations();
        DispatchPage._loadFleetLocations();
      }, 60000);
    });
  },

  // ── Fleet vehicle layer (Bouncie OBD trucks, Trak-4 chipper/trailer) ──
  _fleetMarkers: {},
  _loadFleetLocations: function() {
    if (window._dispatchFleetLayer === false) {
      DispatchPage._refreshFleetMarkers();
      return;
    }
    var _sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!_sb || !DispatchPage._map) return;
    _sb.from('vehicles').select('id, name, last_lat, last_lon, last_seen_at, last_speed_mph, last_ignition, type').eq('active', true).then(function(r) {
      if (r.error) { console.warn('fleet fetch:', r.error.message); return; }
      DispatchPage._fleetData = r.data || [];
      DispatchPage._refreshFleetMarkers();
    });
  },
  _refreshFleetMarkers: function() {
    if (!DispatchPage._map) return;
    var show = window._dispatchFleetLayer !== false;
    var data = DispatchPage._fleetData || [];
    // Remove markers not in current set or if hidden
    Object.keys(DispatchPage._fleetMarkers).forEach(function(id) {
      var keep = show && data.some(function(v) { return v.id === id && v.last_lat && v.last_lon; });
      if (!keep) {
        try { DispatchPage._fleetMarkers[id].remove(); } catch(e) {}
        delete DispatchPage._fleetMarkers[id];
      }
    });
    if (!show) return;
    data.forEach(function(v) {
      if (!v.last_lat || !v.last_lon) return;
      var ageMin = v.last_seen_at ? (Date.now() - new Date(v.last_seen_at).getTime()) / 60000 : 9999;
      var color;
      if (ageMin > 1440) color = '#c62828'; // offline
      else if (ageMin > 60) color = '#a04400'; // stale
      else if (v.last_ignition === false) color = '#2e7d32'; // parked
      else if ((v.last_speed_mph || 0) > 1) color = '#e07c24'; // driving
      else color = '#a37200'; // idle
      var existing = DispatchPage._fleetMarkers[v.id];
      if (existing) {
        existing.setLngLat([v.last_lon, v.last_lat]);
      } else {
        var icon = v.type === 'chipper' ? '🪵' : v.type === 'trailer' ? '🚚' : '🚛';
        var el = document.createElement('div');
        el.style.cssText = 'width:30px;height:30px;border-radius:50%;background:' + color + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer;';
        el.textContent = icon;
        var m = new maplibregl.Marker({ element: el })
          .setLngLat([v.last_lon, v.last_lat])
          .setPopup(new maplibregl.Popup().setHTML('<strong>' + UI.esc(v.name || '—') + '</strong><br>' + (v.last_speed_mph != null ? Math.round(v.last_speed_mph) + ' mph · ' : '') + (v.last_seen_at ? UI.timeAgo(v.last_seen_at) : '')))
          .addTo(DispatchPage._map);
        DispatchPage._fleetMarkers[v.id] = m;
      }
    });
  },

  // ── Chip-drop spot layer (v660: was its own Operations tab; now an opt-in
  // map layer here). Reads chip_drop_spots table; respects status colors.
  _chipDropMarkers: {},
  _loadChipDrops: function() {
    if (!DispatchPage._map) return;
    if (window._dispatchChipDropsLayer !== true) {
      DispatchPage._refreshChipDropMarkers([]);
      return;
    }
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    var tid = (typeof window !== 'undefined' && window.resolveTenantId) ? window.resolveTenantId() : null;
    if (!sb || !tid) return;
    sb.from('chip_drop_spots').select('id, name, address, lat, lng, status, last_drop_at').eq('tenant_id', tid).then(function(r) {
      if (r.error) { console.warn('chipdrops fetch:', r.error.message); return; }
      DispatchPage._refreshChipDropMarkers(r.data || []);
    });
  },
  _refreshChipDropMarkers: function(spots) {
    if (!DispatchPage._map) return;
    var show = window._dispatchChipDropsLayer === true;
    Object.keys(DispatchPage._chipDropMarkers).forEach(function(id) {
      var keep = show && spots.some(function(s) { return s.id === id && s.lat && s.lng; });
      if (!keep) {
        try { DispatchPage._chipDropMarkers[id].remove(); } catch(e) {}
        delete DispatchPage._chipDropMarkers[id];
      }
    });
    if (!show) return;
    spots.forEach(function(s) {
      if (!s.lat || !s.lng) return;
      if (DispatchPage._chipDropMarkers[s.id]) return;
      var color = s.status === 'full' ? '#c62828' : (s.status === 'paused' ? '#9e9e9e' : '#2e7d32');
      var el = document.createElement('div');
      el.style.cssText = 'width:26px;height:26px;border-radius:50%;background:' + color + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer;';
      el.textContent = '🪵';
      var popupHtml = '<strong>' + UI.esc(s.name || 'Chip drop') + '</strong>'
        + (s.address ? '<br><span style="font-size:12px;">' + UI.esc(s.address) + '</span>' : '')
        + '<br><span style="font-size:12px;color:' + color + ';text-transform:capitalize;">' + UI.esc(s.status || 'active') + '</span>'
        + (s.last_drop_at ? '<br><span style="font-size:11px;color:#64748b;">last drop: ' + UI.dateRelative(s.last_drop_at) + '</span>' : '')
        + '<br><a href="#chipdrops" style="font-size:11px;">Manage →</a>';
      var m = new maplibregl.Marker({ element: el })
        .setLngLat([parseFloat(s.lng), parseFloat(s.lat)])
        .setPopup(new maplibregl.Popup().setHTML(popupHtml))
        .addTo(DispatchPage._map);
      DispatchPage._chipDropMarkers[s.id] = m;
    });
  },

  // ── Weather radar layer (v660: was its own Operations tab; now an opt-in
  // map layer here). Uses RainViewer's tile API — free, no key needed.
  _weatherLayerId: 'weather-radar',
  _toggleWeatherLayer: function() {
    if (!DispatchPage._map) return;
    var on = window._dispatchWeatherLayer === true;
    var map = DispatchPage._map;
    var layerId = DispatchPage._weatherLayerId;
    var sourceId = layerId + '-src';
    var present = !!map.getLayer(layerId);
    if (on && !present) {
      // RainViewer's nowcast endpoint returns the most recent radar frame URL
      fetch('https://api.rainviewer.com/public/weather-maps.json').then(function(r) {
        return r.json();
      }).then(function(data) {
        var frames = data && data.radar && data.radar.past;
        if (!frames || !frames.length) return;
        var latest = frames[frames.length - 1];
        var tileUrl = data.host + latest.path + '/256/{z}/{x}/{y}/2/1_1.png';
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        map.addSource(sourceId, { type: 'raster', tiles: [tileUrl], tileSize: 256 });
        map.addLayer({ id: layerId, type: 'raster', source: sourceId, paint: { 'raster-opacity': 0.6 } });
      }).catch(function(e) { console.warn('weather radar:', e); });
    } else if (!on && present) {
      try { map.removeLayer(layerId); } catch(e) {}
      try { map.removeSource(sourceId); } catch(e) {}
    }
  },

  _addJobPins: function() {
    var today = new Date().toISOString().split('T')[0];
    var jobs = DB.jobs.getAll().filter(function(j) {
      return j.scheduledDate && j.scheduledDate.split('T')[0] === today;
    });

    var bounds = new maplibregl.LngLatBounds();
    bounds.extend([-73.9210, 41.2847]); // HQ

    jobs.forEach(function(j, i) {
      var coords = DispatchPage._getJobCoords(j);
      if (!coords) return;

      var color = j.status === 'completed' ? '#2e7d32' : j.status === 'in_progress' ? '#e07c24' : '#1565c0';
      var marker = new maplibregl.Marker({ color: color, scale: 0.8 })
        .setLngLat([coords[1], coords[0]])
        .setPopup(new maplibregl.Popup().setHTML(
          '<strong>' + (i + 1) + '. ' + (j.clientName || 'Job') + '</strong>'
          + '<br><span style="font-size:12px;">' + (j.property || '') + '</span>'
          + '<br><span style="font-size:12px;color:' + color + ';">' + (j.status || 'scheduled') + '</span>'
        ))
        .addTo(DispatchPage._map);

      DispatchPage._jobMarkers.push(marker);
      bounds.extend([coords[1], coords[0]]);
    });

    if (jobs.length) {
      DispatchPage._map.fitBounds(bounds, { padding: 50, maxZoom: 14 });
    }
  },

  _loadCrewLocations: function() {
    if (!SupabaseDB.client) {
      var status = document.getElementById('dispatch-map-status');
      if (status) status.textContent = 'Supabase not connected';
      return;
    }

    SupabaseDB.client.from('crew_locations')
      .select('*')
      .gte('updated_at', new Date(Date.now() - 3600000).toISOString()) // last hour only
      .then(function(res) {
        if (res.error) return;
        var locations = res.data || [];

        var status = document.getElementById('dispatch-map-status');
        if (status) {
          var active = locations.filter(function(l) { return l.status !== 'offline'; });
          status.textContent = active.length + ' crew active · Updated ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }

        // Update/create markers
        locations.forEach(function(loc) {
          if (!loc.lat || !loc.lng) return;
          var existing = DispatchPage._crewMarkers[loc.user_id];

          var statusEmoji = loc.status === 'on_site' ? '🌳' : loc.status === 'en_route' ? '🚛' : loc.status === 'offline' ? '⚫' : '🟢';
          var popupHtml = '<strong>' + statusEmoji + ' ' + (loc.user_name || 'Crew') + '</strong>'
            + '<br><span style="font-size:12px;">' + (loc.status || 'active') + '</span>'
            + (loc.current_job_name ? '<br><span style="font-size:12px;">@ ' + loc.current_job_name + '</span>' : '')
            + '<br><span style="font-size:11px;color:#888;">Updated ' + new Date(loc.updated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + '</span>';

          if (existing) {
            existing.setLngLat([loc.lng, loc.lat]);
            existing.getPopup().setHTML(popupHtml);
          } else {
            // Create crew marker — orange circle with truck icon
            var el = document.createElement('div');
            el.style.cssText = 'width:36px;height:36px;background:#e65100;border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;';
            el.textContent = '🚛';
            if (loc.status === 'offline') { el.style.background = '#999'; el.style.opacity = '0.5'; }

            var marker = new maplibregl.Marker({ element: el })
              .setLngLat([loc.lng, loc.lat])
              .setPopup(new maplibregl.Popup().setHTML(popupHtml))
              .addTo(DispatchPage._map);

            DispatchPage._crewMarkers[loc.user_id] = marker;
          }
        });

        // Fit bounds to include crew
        if (locations.length && DispatchPage._map) {
          var bounds = DispatchPage._map.getBounds();
          locations.forEach(function(loc) {
            if (loc.lat && loc.lng && loc.status !== 'offline') {
              bounds.extend([loc.lng, loc.lat]);
            }
          });
        }
      }).catch(function() {});
  },

  destroyMap: function() {
    if (DispatchPage._refreshTimer) {
      clearInterval(DispatchPage._refreshTimer);
      DispatchPage._refreshTimer = null;
    }
    if (DispatchPage._map) {
      DispatchPage._map.remove();
      DispatchPage._map = null;
    }
    DispatchPage._crewMarkers = {};
    DispatchPage._jobMarkers = [];
  }
};
