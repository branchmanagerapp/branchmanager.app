/**
 * Branch Manager — Property Map
 * Satellite view with draggable equipment placement for quotes/jobs
 * Uses MapLibre GL + ESRI satellite tiles (free)
 */
var PropertyMap = {
  render: function() {
    var jobs = DB.jobs.getAll().filter(function(j) { return j.property || j.clientName; });
    jobs.sort(function(a, b) { return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0); });

    var html = '<div style="max-width:800px;">'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:20px;">'
      + '<div style="font-weight:700;font-size:15px;margin-bottom:8px;">🗺 Property Map</div>'
      + '<div style="font-size:13px;color:var(--text-light);margin-bottom:14px;line-height:1.6;">Open a satellite map for any address and drag equipment icons (bucket truck, chipper, crane, crew) to plan job logistics. Save the layout with a quote or job.</div>'
      + '<div style="display:flex;gap:8px;">'
      + '<input type="text" id="propmap-address-input" placeholder="Enter any address to open map..." style="flex:1;padding:10px 14px;border:2px solid var(--border);border-radius:8px;font-size:14px;" onkeydown="if(event.key===\'Enter\')PropertyMap._openFromInput();">'
      + '<button class="btn btn-primary" onclick="PropertyMap._openFromInput()">Open Map</button>'
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">';

    PropertyMap.equipmentList.forEach(function(eq) {
      html += '<div style="font-size:11px;padding:4px 10px;background:' + eq.color + '22;color:' + eq.color + ';border-radius:12px;font-weight:600;border:1px solid ' + eq.color + '44;">' + eq.label + '</div>';
    });
    html += '</div></div>';

    // Recent jobs
    if (jobs.length) {
      html += '<div style="font-weight:700;font-size:13px;margin-bottom:10px;">Recent Jobs</div>';
      jobs.slice(0, 30).forEach(function(j) {
        var address = j.property || '';
        var hasSavedMap = j.mapMarkers && j.mapMarkers.length > 0;
        html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;">'
          + '<div style="min-width:0;">'
          + '<div style="font-weight:600;font-size:14px;">' + UI.esc(j.clientName || '') + (j.jobNumber ? ' · Job #' + j.jobNumber : '') + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(address || 'No address') + '</div>'
          + '</div>'
          + '<div style="display:flex;gap:6px;flex-shrink:0;">'
          + (hasSavedMap ? '<span style="font-size:11px;color:var(--green-dark);padding:3px 8px;background:#e8f5e9;border-radius:10px;font-weight:600;">📍 Saved</span>' : '')
          + (address ? '<button onclick="PropertyMap.show(\'' + address.replace(/'/g, "\\'") + '\',' + (hasSavedMap ? 'DB.jobs.getById(\'' + j.id + '\').mapMarkers' : 'null') + ');" style="background:var(--accent);color:#fff;border:none;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Open Map</button>' : '')
          + '</div></div>';
      });
    } else {
      html += '<div class="empty-state"><div class="empty-icon">🗺</div><h3>No jobs yet</h3><p>Property maps open per job. Start by entering an address above or opening a job.</p></div>';
    }

    html += '</div>';
    return html;
  },

  _openFromInput: function() {
    var input = document.getElementById('propmap-address-input');
    var address = input ? input.value.trim() : '';
    if (!address) { UI.toast('Enter an address first', 'error'); return; }
    PropertyMap.show(address, null);
  },

  map: null,
  markers: [],
  // Equipment with relative dimensions (w x h in feet) for scaled rectangles on map
  equipmentList: [
    { id: 'bucket',    label: 'Bucket Truck', color: '#2196f3', w: 35, h: 10, icon: '🚛' },
    { id: 'chipper',   label: 'Chipper',      color: '#4caf50', w: 14, h: 6,  icon: '🪵' },
    { id: 'crane',     label: 'Crane',        color: '#ff9800', w: 50, h: 12, icon: '🏗' },
    { id: 'truck',     label: 'Chip Truck',   color: '#607d8b', w: 28, h: 9,  icon: '🚚' },
    { id: 'ram',       label: 'Ram 2500',     color: '#9c27b0', w: 20, h: 7,  icon: '🛻' },
    { id: 'trailer',   label: 'Trailer',      color: '#78909c', w: 22, h: 8,  icon: '🚗' },
    { id: 'hazard',    label: 'Hazard',       color: '#f44336', w: 6,  h: 6,  icon: '⚠️' },
    { id: 'powerline', label: 'Power Lines',  color: '#ffc107', w: 4,  h: 40, icon: '⚡' }
  ],

  show: function(address, existingMarkers) {
    // Load MapLibre if not already loaded
    if (!window.maplibregl) {
      var link = document.createElement('link');
      link.href = 'https://unpkg.com/maplibre-gl@4.1.2/dist/maplibre-gl.css';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
      var script = document.createElement('script');
      script.src = 'https://unpkg.com/maplibre-gl@4.1.2/dist/maplibre-gl.js';
      script.onload = function() { PropertyMap._init(address, existingMarkers); };
      document.head.appendChild(script);
    } else {
      PropertyMap._init(address, existingMarkers);
    }
  },

  _init: function(address, existingMarkers) {
    var self = PropertyMap;
    var isMobile = window.innerWidth < 768;

    // ── Build equipment buttons (shared between mobile and desktop) ──
    var eqButtons = '';
    self.equipmentList.forEach(function(eq) {
      var pw = Math.max(Math.round(eq.w * 0.8), 8);
      var ph = Math.max(Math.round(eq.h * 0.8), 6);
      var iconStr = '<span style="font-size:16px;line-height:1;">' + (eq.icon || '📍') + '</span>';
      if (isMobile) {
        eqButtons += '<button type="button" style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--white);border:1px solid var(--border);border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;" '
          + 'onclick="PropertyMap.addEquipment(\'' + eq.id + '\')">'
          + iconStr + eq.label + '</button>';
      } else {
        eqButtons += '<button type="button" style="display:inline-flex;align-items:center;gap:6px;padding:8px 10px;background:var(--white);border:1px solid var(--border);border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;" '
          + 'onclick="PropertyMap.addEquipment(\'' + eq.id + '\')">'
          + iconStr + eq.label + '</button>';
      }
    });

    var html;
    if (isMobile) {
      // ── MOBILE: Map LEFT, equipment list RIGHT (side-by-side) ──
      html = '<div id="propmap-fullpage" style="position:fixed;inset:0;z-index:9999;background:var(--white);display:flex;flex-direction:column;">'
        // Top bar
        + '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--white);border-bottom:1px solid var(--border);z-index:10;">'
        + '<button onclick="PropertyMap.closeMobile()" style="background:none;border:none;font-size:20px;cursor:pointer;padding:4px;">✕</button>'
        + '<input type="text" id="map-address" value="' + (address || '') + '" placeholder="Enter address..." style="flex:1;padding:8px 10px;border:2px solid var(--border);border-radius:8px;font-size:14px;font-weight:600;">'
        + '<button class="btn btn-primary" style="padding:6px 12px;font-size:13px;" onclick="PropertyMap.geocode()">Go</button>'
        + '</div>'
        // Body: map ON TOP (full width), equipment strip at BOTTOM
        + '<div style="flex:1;display:flex;flex-direction:column;min-height:0;">'
        +   '<div style="flex:1;position:relative;min-height:0;">'
        +     '<div id="prop-map" style="width:100%;height:100%;"></div>'
        +     '<div id="placed-count" style="position:absolute;top:10px;right:10px;background:var(--accent);color:#fff;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;display:none;">0 placed</div>'
        +   '</div>'
        +   '<div style="background:var(--bg);border-top:1px solid var(--border);flex-shrink:0;">'
        +     '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--white);border-bottom:1px solid var(--border);">'
        +       '<span style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;">🛠 Equipment</span>'
        +       '<button class="btn btn-outline" style="font-size:11px;padding:4px 10px;" onclick="PropertyMap.clearMarkers()">Clear all</button>'
        +     '</div>'
        +     '<div id="eq-drawer-body" style="padding:8px;display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;white-space:nowrap;">' + eqButtons + '</div>'
        +   '</div>'
        + '</div>'
        // Bottom action bar
        + '<div style="padding:10px 12px;background:var(--white);border-top:1px solid var(--border);display:flex;gap:8px;">'
        + '<button class="btn btn-outline" style="flex:1;" onclick="PropertyMap.closeMobile()">Cancel</button>'
        + '<button class="btn btn-primary" style="flex:1;" onclick="PropertyMap.saveToRecord();PropertyMap.closeMobile();">Save to Quote</button>'
        + '</div>'
        + '</div>';

      // Inject into body (not a modal)
      var container = document.createElement('div');
      container.id = 'propmap-container';
      container.innerHTML = html;
      document.body.appendChild(container);
    } else {
      // ── DESKTOP: Map ON TOP, equipment strip at BOTTOM (was right sidebar) ──
      html = '<div style="display:flex;flex-direction:column;gap:10px;height:72vh;min-height:440px;">'
        + '<div style="flex:1;position:relative;min-height:0;">'
        +   '<div id="prop-map" style="width:100%;height:100%;border-radius:10px;overflow:hidden;"></div>'
        +   '<div style="position:absolute;top:10px;left:10px;z-index:10;">'
        +     '<div style="background:rgba(255,255,255,.95);border-radius:8px;padding:8px 12px;box-shadow:0 2px 8px rgba(0,0,0,.2);font-size:13px;">'
        +       '<input type="text" id="map-address" value="' + (address || '') + '" placeholder="Enter address..." style="border:none;outline:none;font-size:14px;width:250px;font-weight:600;">'
        +       ' <button class="btn btn-primary" style="padding:4px 12px;font-size:12px;" onclick="PropertyMap.geocode()">Go</button>'
        +     '</div>'
        +   '</div>'
        + '</div>'
        + '<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;flex-shrink:0;">'
        +   '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--white);border-radius:10px 10px 0 0;">'
        +     '<div><strong style="font-size:13px;">Equipment</strong><span style="font-size:11px;color:var(--text-light);margin-left:8px;">Click to place. Drag to move.</span></div>'
        +     '<button class="btn btn-outline" style="font-size:12px;padding:5px 12px;" onclick="PropertyMap.clearMarkers()">Clear all</button>'
        +   '</div>'
        +   '<div style="padding:10px;display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;">' + eqButtons + '</div>'
        + '</div>'
        + '</div>'
        + '<div id="placed-equipment" style="margin-top:12px;"></div>';

      UI.showModal('Property Map', html, {
        wide: true,
        footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
          + ' <button class="btn btn-primary" onclick="PropertyMap.saveToRecord()">Save to Quote/Job</button>'
      });
    }

    // Init map after modal renders
    setTimeout(function() {
      self.map = new maplibregl.Map({
        container: 'prop-map',
        style: {
          version: 8,
          sources: {
            'satellite': {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256, maxzoom: 19
            },
            'labels': {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256, maxzoom: 19
            },
            // Free global DEM from AWS Terrain Tiles (Mapzen/Nextzen mirror).
            // Terrarium RGB encoding — MapLibre decodes natively.
            'terrain-rgb': {
              type: 'raster-dem',
              tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
              tileSize: 256,
              maxzoom: 15,
              encoding: 'terrarium'
            }
          },
          layers: [
            { id: 'satellite-layer', type: 'raster', source: 'satellite' },
            {
              id: 'hillshade-layer',
              type: 'hillshade',
              source: 'terrain-rgb',
              layout: { visibility: 'none' },
              paint: {
                'hillshade-exaggeration': 0.6,
                'hillshade-shadow-color': '#1a3c12',
                'hillshade-highlight-color': '#fffbe0',
                'hillshade-accent-color': '#e07c24'
              }
            },
            { id: 'labels-layer', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.6 } }
          ]
        },
        center: [-73.9204, 41.2890], // Peekskill default
        zoom: 18,
        maxPitch: 60
      });
      // Enhanced nav: compass + pitch visualizer (2D/3D tilt indicator in the control)
      self.map.addControl(new maplibregl.NavigationControl({
        visualizePitch: true,
        showZoom: true,
        showCompass: true
      }), 'top-right');

      // Mobile: enable drag-rotate on touch (disabled by default in MapLibre)
      // Two-finger rotate/pitch gestures
      if (self.map.touchZoomRotate) self.map.touchZoomRotate.enable();
      if (self.map.touchPitch) self.map.touchPitch.enable();
      if (self.map.dragRotate) self.map.dragRotate.enable();

      // Unified tool panel — vertical stack in top-right under the compass
      var mapContainer = document.getElementById('prop-map');
      var toolPanel = document.createElement('div');
      toolPanel.style.cssText = 'position:absolute;top:136px;right:10px;z-index:10;display:flex;flex-direction:column;gap:4px;background:rgba(255,255,255,.95);border:1px solid rgba(0,0,0,.15);border-radius:6px;padding:3px;box-shadow:0 1px 3px rgba(0,0,0,.2);';

      var btnStyle = 'background:transparent;border:none;border-radius:4px;padding:6px;font-size:13px;font-weight:700;color:var(--text);cursor:pointer;min-width:30px;min-height:30px;display:flex;align-items:center;justify-content:center;';

      // 3D / 2D toggle
      var toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.textContent = '3D';
      toggleBtn.title = 'Toggle 2D / 3D tilt';
      toggleBtn.style.cssText = btnStyle;
      toggleBtn.onclick = function() {
        var cur = self.map.getPitch();
        if (cur > 5) {
          self.map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
          toggleBtn.textContent = '3D';
          toggleBtn.style.background = 'transparent';
          toggleBtn.style.color = 'var(--text)';
        } else {
          self.map.easeTo({ pitch: 60, duration: 400 });
          toggleBtn.textContent = '2D';
          toggleBtn.style.background = '#1a3c12';
          toggleBtn.style.color = '#fff';
        }
      };
      toolPanel.appendChild(toggleBtn);

      if (mapContainer && mapContainer.parentElement) mapContainer.parentElement.appendChild(toolPanel);

      // Terrain toggle — goes into the same panel
      var terrainBtn = document.createElement('button');
      terrainBtn.type = 'button';
      terrainBtn.textContent = '⛰';
      terrainBtn.title = 'Toggle elevation shading';
      terrainBtn.style.cssText = btnStyle + 'font-size:15px;';
      terrainBtn.onclick = function() {
        var vis = self.map.getLayoutProperty('hillshade-layer', 'visibility');
        var on = vis === 'visible';
        self.map.setLayoutProperty('hillshade-layer', 'visibility', on ? 'none' : 'visible');
        terrainBtn.style.background = on ? 'transparent' : '#1a3c12';
        terrainBtn.style.color = on ? 'var(--text)' : '#fff';
      };
      toolPanel.appendChild(terrainBtn);

      // Elevation readout — tap map → show elevation in feet (USGS free service)
      var elevReadout = document.createElement('div');
      elevReadout.id = 'elev-readout';
      elevReadout.style.cssText = 'position:absolute;bottom:14px;left:14px;z-index:10;background:rgba(0,0,0,.78);color:#fff;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.3);display:none;';
      elevReadout.textContent = 'Tap map for elevation';
      if (mapContainer && mapContainer.parentElement) mapContainer.parentElement.appendChild(elevReadout);

      self.map.on('click', function(e) {
        // Ignore clicks on markers (they have their own handlers)
        if (e.originalEvent && e.originalEvent.target && e.originalEvent.target.closest && e.originalEvent.target.closest('.maplibregl-marker')) return;
        // If a marker is waiting for a direction tap, consume this click for that
        if (self._directingMarker) {
          var did = self._applyDirection(e.lngLat);
          if (did) { UI.toast('Direction set ✓'); return; }
        }
        var lat = e.lngLat.lat, lng = e.lngLat.lng;
        elevReadout.style.display = 'block';
        elevReadout.textContent = '⏳ Querying elevation…';
        fetch('https://epqs.nationalmap.gov/v1/json?x=' + lng + '&y=' + lat + '&units=Feet&wkid=4326')
          .then(function(r) { return r.json(); })
          .then(function(data) {
            var ft = data && (data.value !== undefined ? data.value : (data.USGS_Elevation_Point_Query_Service && data.USGS_Elevation_Point_Query_Service.Elevation_Query && data.USGS_Elevation_Point_Query_Service.Elevation_Query.Elevation));
            if (ft === undefined || ft === null || ft === -1000000) {
              elevReadout.textContent = '⛰ No data (US coverage only)';
            } else {
              elevReadout.textContent = '⛰ ' + Math.round(ft) + ' ft · ' + lat.toFixed(5) + '°, ' + lng.toFixed(5) + '°';
            }
          })
          .catch(function() { elevReadout.textContent = '⛰ Elevation service unreachable'; });
      });

      self.markers = [];

      // If address provided, geocode immediately
      if (address) {
        setTimeout(function() { self.geocode(); }, 500);
      }

      // Restore existing markers (incl. saved rotation)
      if (existingMarkers && existingMarkers.length) {
        existingMarkers.forEach(function(m) {
          self._placeMarker(m.id, m.lng, m.lat, m.notes, m.rotation || 0);
        });
      }
    }, 300);
  },

  geocode: function() {
    var address = document.getElementById('map-address').value.trim();
    if (!address) return;

    fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(address) + '&limit=1')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.length > 0) {
          var lat = parseFloat(data[0].lat);
          var lng = parseFloat(data[0].lon);
          PropertyMap.map.flyTo({ center: [lng, lat], zoom: 19, duration: 1500 });
        } else {
          UI.toast('Address not found', 'error');
        }
      })
      .catch(function() { UI.toast('Geocoding failed', 'error'); });
  },

  addEquipment: function(eqId) {
    var self = PropertyMap;
    if (!self.map) return;
    var center = self.map.getCenter();
    var offset = self.markers.length * 0.00003;
    self._placeMarker(eqId, center.lng + offset, center.lat + offset, '');
    // Enter direction-setting mode: next map tap sets the marker's rotation
    var justPlaced = self.markers[self.markers.length - 1];
    self._setDirectingMarker(justPlaced);
    UI.toast('📍 Placed. Tap a point on the map to set direction.');
  },

  // Angle helper — MapLibre lng/lat → rotation degrees so equipment "points" toward a target
  _bearingDeg: function(fromLng, fromLat, toLng, toLat) {
    var dx = toLng - fromLng;
    var dy = toLat - fromLat;
    // Marker at 0° points up in screen space. Web y-axis is inverted → negate dy.
    var rad = Math.atan2(dx, dy); // 0 = north/up, clockwise
    var deg = rad * 180 / Math.PI;
    // We want 0° to mean "pointing RIGHT" like a truck (long axis horizontal) — add 90°
    return (deg + 90) % 360;
  },

  _setDirectingMarker: function(md) {
    PropertyMap._directingMarker = md || null;
  },

  _applyDirection: function(lngLat) {
    var self = PropertyMap;
    var md = self._directingMarker;
    if (!md) return false;
    var deg = self._bearingDeg(md.lng, md.lat, lngLat.lng, lngLat.lat);
    md.rotation = deg;
    // Find the marker's inner element and rotate it
    var el = md.marker.getElement();
    var inner = el.querySelector('.equip-inner');
    if (inner) inner.style.transform = 'rotate(' + deg + 'deg)';
    self._directingMarker = null;
    if (typeof window._bmEquipmentMapHook === 'function') window._bmEquipmentMapHook(self.markers);
    return true;
  },

  // Convert feet to pixels at current zoom level
  _feetToPixels: function(feet) {
    if (!PropertyMap.map) return feet;
    var zoom = PropertyMap.map.getZoom();
    // At zoom 20, ~1ft = 1px. Each zoom level halves the scale.
    var pixelsPerFoot = Math.pow(2, zoom - 20) * 1.0;
    return Math.max(feet * pixelsPerFoot, 1);
  },

  _placeMarker: function(eqId, lng, lat, notes, savedRotation) {
    var self = PropertyMap;
    var eq = self.equipmentList.find(function(e) { return e.id === eqId; });
    if (!eq) return;

    // Marker: OUTER div is MapLibre-controlled (don't touch its transform!).
    // INNER div holds the visual + gets rotated so MapLibre positioning stays intact.
    var el = document.createElement('div');
    var rotation = savedRotation || 0;
    var minW = Math.max(eq.w * 1.5, 34);
    var minH = Math.max(eq.h * 1.5, 20);
    // Outer wrapper: sized, but no background/rotation (MapLibre will position via transform)
    el.style.cssText = 'width:' + minW + 'px;height:' + minH + 'px;cursor:grab;position:relative;';
    el.title = eq.label + ' — tap to select, drag to move';

    // Inner: the actual visual + rotation target
    var inner = document.createElement('div');
    inner.className = 'equip-inner';
    inner.style.cssText = 'width:100%;height:100%;background:' + eq.color + 'cc;'
      + 'border-radius:4px;display:flex;align-items:center;justify-content:center;'
      + 'border:2px solid rgba(255,255,255,.9);box-shadow:0 3px 10px rgba(0,0,0,.55);'
      + 'transition:transform .2s ease,box-shadow .15s;backdrop-filter:blur(2px);'
      + 'transform-origin:50% 50%;transform:rotate(' + rotation + 'deg);';
    var iconSize = Math.max(Math.min(minH * 0.85, 28), 16);
    inner.innerHTML = '<span style="font-size:' + iconSize + 'px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5));pointer-events:none;line-height:1;">' + (eq.icon || '📍') + '</span>';
    el.appendChild(inner);

    // Tap the marker → enter "directing" mode. Next map tap sets its rotation.
    el.addEventListener('click', function(e) {
      e.stopPropagation();
      // Visual feedback: selection ring on this, clear others
      self.markers.forEach(function(m) {
        var otherInner = m.marker && m.marker.getElement && m.marker.getElement().querySelector('.equip-inner');
        if (otherInner) otherInner.style.boxShadow = '0 3px 10px rgba(0,0,0,.55)';
      });
      inner.style.boxShadow = '0 0 0 3px ' + eq.color + ', 0 3px 14px rgba(0,0,0,.55)';
      self._setDirectingMarker(markerData);
      UI.toast('🧭 Tap a point on the map to set direction.');
    });

    // Update size on zoom — touch OUTER size + INNER rotation only (never outer transform)
    var updateSize = function() {
      var scale = Math.pow(2, (self.map.getZoom() - 18)) * 1.5;
      scale = Math.max(scale, 0.5);
      scale = Math.min(scale, 4);
      var w = Math.max(eq.w * scale, 34);
      var h = Math.max(eq.h * scale, 20);
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      var iconSpan = inner.querySelector('span');
      if (iconSpan) iconSpan.style.fontSize = Math.max(Math.min(h * 0.8, 28), 14) + 'px';
      inner.style.transform = 'rotate(' + rotation + 'deg)';
    };
    self.map.on('zoom', updateSize);

    var marker = new maplibregl.Marker({ element: el, draggable: true })
      .setLngLat([lng, lat])
      .addTo(self.map);

    var markerData = { id: eqId, type: eqId, label: eq.label, lng: lng, lat: lat, rotation: rotation, notes: notes || '', marker: marker, cleanup: function() { self.map.off('zoom', updateSize); } };
    self.markers.push(markerData);
    if (typeof window._bmEquipmentMapHook === 'function') window._bmEquipmentMapHook(self.markers);

    marker.on('dragend', function() {
      var pos = marker.getLngLat();
      markerData.lng = pos.lng;
      markerData.lat = pos.lat;
      if (typeof window._bmEquipmentMapHook === 'function') window._bmEquipmentMapHook(self.markers);
    });

    self._updatePlacedList();
  },

  _updatePlacedList: function() {
    var self = PropertyMap;

    // Update mobile badge
    var badge = document.getElementById('placed-count');
    if (badge) {
      badge.style.display = self.markers.length > 0 ? '' : 'none';
      badge.textContent = self.markers.length + ' placed';
    }

    var el = document.getElementById('placed-equipment');
    if (!el) return;

    if (self.markers.length === 0) {
      el.innerHTML = '';
      return;
    }

    var html = '<div style="background:var(--white);border-radius:10px;border:1px solid var(--border);padding:12px;">'
      + '<h4 style="font-size:13px;margin-bottom:8px;">Placed Equipment (' + self.markers.length + ')</h4>';
    self.markers.forEach(function(m, i) {
      var mEq = PropertyMap.equipmentList.find(function(e){return e.id===m.id;}) || {};
      html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">'
        + '<span style="display:inline-block;width:20px;height:10px;background:' + (mEq.color||'#999') + ';border-radius:2px;flex-shrink:0;"></span>'
        + '<span style="flex:1;">' + m.label + '</span>'
        + '<button style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;" onclick="PropertyMap.removeMarker(' + i + ')">&times;</button>'
        + '</div>';
    });
    html += '</div>';
    el.innerHTML = html;
  },

  removeMarker: function(index) {
    var self = PropertyMap;
    if (self.markers[index]) {
      self.markers[index].marker.remove();
      self.markers.splice(index, 1);
      self._updatePlacedList();
      if (typeof window._bmEquipmentMapHook === 'function') window._bmEquipmentMapHook(self.markers);
    }
  },

  clearMarkers: function() {
    var self = PropertyMap;
    self.markers.forEach(function(m) { m.marker.remove(); });
    self.markers = [];
    self._updatePlacedList();
    if (typeof window._bmEquipmentMapHook === 'function') window._bmEquipmentMapHook(self.markers);
  },

  getMarkerData: function() {
    return PropertyMap.markers.map(function(m) {
      return { id: m.id, label: m.label, icon: m.icon, lng: m.lng, lat: m.lat, rotation: m.rotation || 0, notes: m.notes };
    });
  },

  saveToRecord: function() {
    var data = PropertyMap.getMarkerData();
    PropertyMap._savedData = data;
    UI.toast(data.length + ' equipment positions saved');
    UI.closeModal();
  },

  _toggleDrawer: function() {
    var body = document.getElementById('eq-drawer-body');
    var chev = document.getElementById('eq-drawer-chev');
    if (!body) return;
    var open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    if (chev) chev.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
  },

  closeMobile: function() {
    var container = document.getElementById('propmap-container');
    if (container) container.remove();
    if (PropertyMap.map) {
      PropertyMap.map.remove();
      PropertyMap.map = null;
    }
  }
};
