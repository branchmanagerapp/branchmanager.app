// Fleet page — vehicle list + live positions on MapLibre.
// Powered by Bouncie OBD-II trackers (trucks) and Trak-4 Portable (chipper/trailer, future).
// v421 (Apr 26, 2026)

var FleetPage = {
  _vehicles: [],
  _selectedId: null,
  _loading: true,
  _err: null,
  _refreshTimer: null,

  render: function() {
    var self = FleetPage;
    // v637: do NOT reset _fetched / _renderedOnce here. The previous code
    // reset both on every render, but _refresh() calls loadPage('operations')
    // on success — which re-renders this page — which re-reset the flags —
    // which fired _refresh again — infinite loop. Now the first render
    // fetches once; user refresh + 30s interval still update.
    self._kickFetch();
    // Auto-refresh every 30s while page is visible
    if (self._refreshTimer) clearInterval(self._refreshTimer);
    self._refreshTimer = setInterval(function() {
      if (!document.getElementById('fleet-list')) { clearInterval(self._refreshTimer); return; }
      self._refresh(false);
    }, 30000);

    var html = '';

    // ── Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">'
      + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
      +   '<h3 style="font-size:16px;font-weight:700;margin:0;">Fleet</h3>'
      +   '<span style="font-size:13px;color:var(--text-light);">(' + self._vehicles.length + ')</span>'
      + '</div>'
      + '<div style="display:flex;gap:8px;">'
      +   '<button onclick="FleetPage.showAdd()" class="btn btn-primary" style="font-size:12px;">+ Add Vehicle</button>'
      +   '<button onclick="FleetPage._refresh(true)" class="btn btn-outline" style="font-size:12px;">↻ Refresh</button>'
      + '</div></div>';

    if (self._err) {
      html += '<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:12px;margin-bottom:12px;font-size:13px;">' + UI.esc(self._err) + '</div>';
    }

    if (self._loading && self._vehicles.length === 0) {
      html += '<div style="text-align:center;padding:30px;color:var(--text-light);font-size:13px;">Loading fleet…</div>';
      return html;
    }

    if (self._vehicles.length === 0) {
      html += '<div style="background:var(--white);border-radius:12px;padding:30px;text-align:center;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
        + '<div style="font-size:36px;margin-bottom:8px;">🚛</div>'
        + '<div style="font-size:14px;font-weight:700;margin-bottom:4px;">No vehicles yet</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-bottom:14px;">Add your fleet vehicles. Bouncie OBD-II trackers will auto-register on first webhook event, or you can add manually below.</div>'
        + '<button onclick="FleetPage.showAdd()" class="btn btn-primary" style="font-size:12px;">+ Add Vehicle</button>'
        + '<details style="margin-top:18px;text-align:left;font-size:12px;color:var(--text-light);"><summary style="cursor:pointer;">Hardware setup notes</summary>'
        + '<ul style="margin-top:8px;padding-left:18px;line-height:1.6;">'
        + '<li><b>Trucks:</b> Bouncie OBD-II ($77/device + $96/yr). Plug into OBD port under dashboard. Auto-registers on first trip.</li>'
        + '<li><b>Chipper / trailer:</b> Trak-4 Portable (later). Battery-powered, magnetic mount. Manual add here.</li>'
        + '<li>Webhook URL for Bouncie: <code style="background:var(--bg);padding:1px 4px;border-radius:3px;">' + (window.SB_FUNC_URL || 'https://ltpivkqahvplapyagljt.supabase.co/functions/v1') + '/bouncie-webhook</code></li>'
        + '</ul></details>'
        + '</div>';
      return html;
    }

    // v425: dropped duplicate map — Dispatch has the canonical MapLibre.
    // "Show Fleet" toggle on Dispatch surfaces vehicle markers there.
    var locatable = self._vehicles.filter(function(v) { return v.last_lat && v.last_lon; });
    if (locatable.length) {
      html += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:14px;font-size:12px;color:var(--text-light);">'
        + locatable.length + ' vehicle' + (locatable.length===1?'':'s') + ' with live position. <a href="#" onclick="window._opsTab=\'dispatch\';loadPage(\'operations\');return false;" style="color:var(--accent);">Open on Dispatch map →</a>'
        + '</div>';
    }

    // ── List view
    html += '<div id="fleet-list" style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">';
    html += '<div class="data-table">';
    html += '<div class="data-table-header" style="display:grid;grid-template-columns:1.5fr 1fr 110px 110px 1fr 80px;gap:12px;padding:10px 16px;background:var(--bg);font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;">'
      + '<div>Vehicle</div><div>Tracker</div><div>Status</div><div>Speed</div><div>Last Seen</div><div></div></div>';

    self._vehicles.forEach(function(v) {
      var status = self._statusOf(v);
      html += '<div onclick="FleetPage.showDetail(\'' + v.id + '\')" style="display:grid;grid-template-columns:1.5fr 1fr 110px 110px 1fr 80px;gap:12px;padding:12px 16px;border-top:1px solid var(--border);cursor:pointer;font-size:13px;align-items:center;">'
        + '<div><div style="font-weight:600;">' + UI.esc(v.name || '—') + '</div>'
        +   (v.nickname ? '<div style="font-size:11px;color:var(--text-light);">' + UI.esc(v.nickname) + '</div>' : '')
        + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);">' + UI.esc(v.tracker_provider || 'none') + (v.tracker_device_id ? ' <span style="opacity:.6;">' + UI.esc(String(v.tracker_device_id).slice(-6)) + '</span>' : '') + '</div>'
        + '<div><span id="fleet-status-' + v.id + '" style="background:' + status.bg + ';color:' + status.fg + ';padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">' + status.label + '</span></div>'
        + '<div id="fleet-speed-' + v.id + '">' + (v.last_speed_mph != null ? Math.round(v.last_speed_mph) + ' mph' : '—') + '</div>'
        + '<div id="fleet-seen-' + v.id + '" style="font-size:12px;color:var(--text-light);">' + (v.last_seen_at ? UI.timeAgo(v.last_seen_at) : 'never') + '</div>'
        + '<div style="text-align:right;">' + (v.last_lat ? '<a href="https://maps.apple.com/?ll=' + v.last_lat + ',' + v.last_lon + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:none;font-size:12px;" onclick="event.stopPropagation();">📍 Map</a>' : '') + '</div>'
        + '</div>';
    });
    html += '</div></div>';

    return html;
  },

  _statusOf: function(v) {
    if (!v.last_seen_at) return { label: 'No data', bg: 'var(--bg)', fg: 'var(--text-light)' };
    var ageMin = (Date.now() - new Date(v.last_seen_at).getTime()) / 60000;
    if (ageMin < 5) {
      if (v.last_ignition === false) return { label: 'Parked', bg: '#e8f5e9', fg: '#2e7d32' };
      if ((v.last_speed_mph || 0) > 1) return { label: 'Driving', bg: '#fff3e0', fg: '#e07c24' };
      return { label: 'Idle', bg: '#fffde7', fg: '#a37200' };
    }
    if (ageMin < 60) return { label: 'Recent', bg: '#e3f2fd', fg: '#1565c0' };
    if (ageMin < 1440) return { label: 'Stale', bg: '#fff3e0', fg: '#a04400' };
    return { label: 'Offline', bg: '#fde8e8', fg: '#c62828' };
  },

  _kickFetch: function() {
    if (FleetPage._fetched) return;
    FleetPage._fetched = true;
    FleetPage._refresh(false);
  },

  _refresh: function(forceRender) {
    var self = FleetPage;
    self._loading = true;
    self._err = null;
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) {
      self._err = 'Supabase client not ready';
      self._loading = false;
      // Fleet only renders inside the Operations hub — there's no top-level
      // 'fleet' route. Re-render via Operations with the fleet tab active.
      if (forceRender) { window._opsTab = 'fleet'; loadPage('operations'); }
      return;
    }
    sb.from('vehicles').select('*').eq('active', true).order('name', { ascending: true }).then(function(r) {
      self._vehicles = r.data || [];
      if (r.error) self._err = r.error.message;
      self._loading = false;
      if (forceRender || !self._renderedOnce) {
        self._renderedOnce = true;
        window._opsTab = 'fleet';
        loadPage('operations');
      } else {
        // Silently update the status badges in-place without full re-render
        self._vehicles.forEach(function(v) {
          var badge = document.getElementById('fleet-status-' + v.id);
          var speed = document.getElementById('fleet-speed-' + v.id);
          var seen = document.getElementById('fleet-seen-' + v.id);
          var s = self._statusOf(v);
          if (badge) { badge.textContent = s.label; badge.style.background = s.bg; badge.style.color = s.fg; }
          if (speed) speed.textContent = v.last_speed_mph != null ? Math.round(v.last_speed_mph) + ' mph' : '—';
          if (seen) seen.textContent = v.last_seen_at ? UI.timeAgo(v.last_seen_at) : 'never';
        });
      }
    });
  },

  showAdd: function() {
    var body = '<div style="display:grid;gap:10px;">'
      + '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;">Name<input id="fleet-name" placeholder="e.g. Bucket Truck #1" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-top:4px;"></label>'
      + '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;">Nickname<input id="fleet-nick" placeholder="e.g. The Beast" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-top:4px;"></label>'
      + '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;">License Plate<input id="fleet-plate" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-top:4px;"></label>'
      + '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;">Type<select id="fleet-type" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-top:4px;">'
      +   '<option value="bucket">Bucket Truck</option><option value="dump">Dump Truck</option><option value="pickup">Pickup</option><option value="chipper">Chipper</option><option value="trailer">Trailer</option><option value="other">Other</option>'
      + '</select></label>'
      + '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;">Tracker Provider<select id="fleet-tracker" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-top:4px;">'
      +   '<option value="">— None yet —</option><option value="bouncie">Bouncie OBD-II</option><option value="trak4">Trak-4 Portable</option><option value="manual">Manual entry</option>'
      + '</select></label>'
      + '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;">Tracker Device ID (IMEI)<input id="fleet-device" placeholder="Leave blank — auto-registers on first Bouncie event" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-top:4px;"></label>'
      + '</div>';
    var footer = '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
      + '<button class="btn btn-primary" onclick="FleetPage.saveAdd()">Save</button>';
    UI.showModal('Add Vehicle', body, { footer: footer });
  },

  saveAdd: function() {
    var name = document.getElementById('fleet-name').value.trim();
    if (!name) { UI.toast('Name is required', 'error'); return; }
    var row = {
      tenant_id: window.resolveTenantId(),
      name: name,
      nickname: document.getElementById('fleet-nick').value.trim() || null,
      license_plate: document.getElementById('fleet-plate').value.trim() || null,
      type: document.getElementById('fleet-type').value || 'truck',
      tracker_provider: document.getElementById('fleet-tracker').value || null,
      tracker_device_id: document.getElementById('fleet-device').value.trim() || null,
      active: true
    };
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) { UI.toast('Supabase not ready', 'error'); return; }
    sb.from('vehicles').insert(row).then(function(r) {
      if (r.error) { UI.toast('Save failed: ' + r.error.message, 'error'); return; }
      UI.toast('Vehicle added');
      UI.closeModal();
      FleetPage._fetched = false;
      FleetPage._refresh(true);
    });
  },

  showDetail: async function(id) {
    FleetPage._selectedId = id;
    var v = FleetPage._vehicles.filter(function(x) { return x.id === id; })[0];
    if (!v) return;
    var status = FleetPage._statusOf(v);
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;

    var baseHtml = '<div style="font-size:13px;line-height:1.7;">'
      + '<div><b>Status:</b> <span style="background:' + status.bg + ';color:' + status.fg + ';padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">' + status.label + '</span></div>'
      + (v.last_seen_at ? '<div><b>Last seen:</b> ' + UI.timeAgo(v.last_seen_at) + '</div>' : '')
      + (v.last_lat ? '<div><b>Last position:</b> <a href="https://maps.apple.com/?ll=' + v.last_lat + ',' + v.last_lon + '&q=' + encodeURIComponent(v.name) + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">' + v.last_lat.toFixed(5) + ', ' + v.last_lon.toFixed(5) + ' ↗</a></div>' : '')
      + (v.last_speed_mph != null ? '<div><b>Speed:</b> ' + Math.round(v.last_speed_mph) + ' mph</div>' : '')
      + (v.license_plate ? '<div><b>Plate:</b> ' + UI.esc(v.license_plate) + '</div>' : '')
      + (v.type ? '<div><b>Type:</b> ' + UI.esc(v.type) + '</div>' : '')
      + (v.tracker_provider ? '<div><b>Tracker:</b> ' + UI.esc(v.tracker_provider) + (v.tracker_device_id ? ' <code style="background:var(--bg);padding:1px 4px;border-radius:3px;font-size:11px;">' + UI.esc(v.tracker_device_id) + '</code>' : '') + '</div>' : '<div style="color:var(--text-light);"><b>Tracker:</b> not configured</div>')
      + '</div>'
      + '<div id="fleet-detail-extra" style="margin-top:12px;"><div style="color:var(--text-light);font-size:12px;">Loading history…</div></div>';

    var assignBtn = !v.tracker_device_id
      ? '<button class="btn btn-outline" style="font-size:12px;" onclick="FleetPage.showAssignTracker(\'' + id + '\')">🔗 Assign Tracker</button>'
      : '';
    var footer = assignBtn
      + '<button class="btn btn-outline" style="color:#c62828;" onclick="FleetPage.archive(\'' + id + '\')">Archive</button>'
      + '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>';
    UI.showModal(v.name + (v.nickname ? ' — ' + v.nickname : ''), baseHtml, { footer: footer });

    // Async: load position history + open maintenance alerts
    if (!sb) return;
    try {
      var [posRes, maintRes] = await Promise.all([
        sb.from('vehicle_positions').select('ts,lat,lon,speed_mph,ignition').eq('vehicle_id', id).order('ts', { ascending: false }).limit(12),
        sb.from('vehicle_maintenance').select('title,severity,kind,created_at').eq('vehicle_id', id).eq('status', 'open').order('created_at', { ascending: false }).limit(5)
      ]);

      var extra = document.getElementById('fleet-detail-extra');
      if (!extra) return;
      var out = '';

      if (maintRes.data && maintRes.data.length > 0) {
        out += '<div style="margin-bottom:10px;">';
        out += '<div style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">⚠ Open Alerts</div>';
        maintRes.data.forEach(function(m) {
          var sev = m.severity === 'warning' ? '#e65100' : m.severity === 'critical' ? '#c62828' : '#1565c0';
          out += '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;">'
            + '<span style="color:' + sev + ';font-weight:700;">' + (m.severity === 'warning' ? '⚠' : m.severity === 'critical' ? '🔴' : 'ℹ') + '</span>'
            + '<span>' + UI.esc(m.title) + '</span>'
            + '</div>';
        });
        out += '</div>';
      }

      if (posRes.data && posRes.data.length > 0) {
        out += '<div style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">Recent Positions</div>';
        out += '<div style="max-height:180px;overflow-y:auto;">';
        posRes.data.forEach(function(p) {
          var ago = (function(d) {
            var s = Math.floor((Date.now() - new Date(d)) / 1000);
            if (s < 60) return s + 's ago';
            if (s < 3600) return Math.floor(s/60) + 'm ago';
            if (s < 86400) return Math.floor(s/3600) + 'h ago';
            return Math.floor(s/86400) + 'd ago';
          })(p.ts);
          out += '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--border);font-size:12px;">'
            + '<a href="https://maps.apple.com/?ll=' + p.lat + ',' + p.lon + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">'
            + p.lat.toFixed(4) + ', ' + p.lon.toFixed(4) + ' ↗'
            + '</a>'
            + '<span style="color:var(--text-light);">' + (p.speed_mph != null ? Math.round(p.speed_mph) + ' mph · ' : '') + ago + '</span>'
            + '</div>';
        });
        out += '</div>';
      } else {
        out += '<div style="color:var(--text-light);font-size:12px;">No position history yet — waiting for first Bouncie event.</div>';
      }

      extra.innerHTML = out;
    } catch(e) {
      var extra2 = document.getElementById('fleet-detail-extra');
      if (extra2) extra2.innerHTML = '<div style="color:var(--text-light);font-size:12px;">Could not load history.</div>';
    }
  },

  _map: null,
  _markers: [],
  _initMap: function() {
    var el = document.getElementById('fleet-map');
    if (!el || typeof maplibregl === 'undefined' || el._initialized) return;
    el._initialized = true;
    var locatable = FleetPage._vehicles.filter(function(v) { return v.last_lat && v.last_lon; });
    var center = [-73.9212, 41.2901]; // Peekskill HQ default
    if (locatable.length) center = [locatable[0].last_lon, locatable[0].last_lat];
    FleetPage._map = new maplibregl.Map({
      container: 'fleet-map',
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: center,
      zoom: 11
    });
    FleetPage._map.addControl(new maplibregl.NavigationControl(), 'top-right');
    FleetPage._map.on('load', function() {
      // HQ marker
      new maplibregl.Marker({ color: '#1a3c12' })
        .setLngLat([-73.9210, 41.2847])
        .setPopup(new maplibregl.Popup().setHTML('<strong>🏠 HQ</strong>'))
        .addTo(FleetPage._map);
      // Vehicle markers
      locatable.forEach(function(v) {
        var status = FleetPage._statusOf(v);
        var color = status.label === 'Driving' ? '#e07c24' : status.label === 'Parked' || status.label === 'Idle' ? '#2e7d32' : status.label === 'Offline' ? '#c62828' : '#1565c0';
        var m = new maplibregl.Marker({ color: color })
          .setLngLat([v.last_lon, v.last_lat])
          .setPopup(new maplibregl.Popup().setHTML('<strong>' + UI.esc(v.name) + '</strong><br>' + status.label + (v.last_speed_mph != null ? ' · ' + Math.round(v.last_speed_mph) + ' mph' : '') + '<br>' + UI.timeAgo(v.last_seen_at)))
          .addTo(FleetPage._map);
        FleetPage._markers.push(m);
      });
      // Auto-fit if multiple
      if (locatable.length > 1) {
        var b = new maplibregl.LngLatBounds();
        locatable.forEach(function(v) { b.extend([v.last_lon, v.last_lat]); });
        b.extend([-73.9210, 41.2847]);
        FleetPage._map.fitBounds(b, { padding: 40, maxZoom: 14 });
      }
    });
  },

  showAssignTracker: function(id) {
    var body = '<div style="display:grid;gap:12px;">'
      + '<div style="font-size:13px;color:var(--text-light);">Enter the IMEI printed on the Bouncie device label. On first Bouncie event, this vehicle row will be claimed automatically. You can also paste it here now to pre-link it.</div>'
      + '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;">Tracker Provider<select id="fat-provider" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-top:4px;">'
      +   '<option value="bouncie">Bouncie OBD-II</option><option value="trak4">Trak-4 Portable</option><option value="manual">Manual</option>'
      + '</select></label>'
      + '<label style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;">Device ID / IMEI<input id="fat-imei" placeholder="e.g. 123456789012345" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-top:4px;" onkeydown="if(event.key===\'Enter\')FleetPage.saveAssignTracker(\'' + id + '\')"></label>'
      + '</div>';
    var footer = '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
      + '<button class="btn btn-primary" onclick="FleetPage.saveAssignTracker(\'' + id + '\')">Save</button>';
    UI.showModal('Assign Tracker', body, { footer: footer });
    setTimeout(function(){ var el = document.getElementById('fat-imei'); if(el) el.focus(); }, 100);
  },

  saveAssignTracker: function(id) {
    var imei = (document.getElementById('fat-imei') || {}).value || '';
    var provider = (document.getElementById('fat-provider') || {}).value || 'bouncie';
    imei = imei.trim();
    if (!imei) { UI.toast('IMEI is required', 'error'); return; }
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) { UI.toast('Supabase not ready', 'error'); return; }
    sb.from('vehicles').update({ tracker_device_id: imei, tracker_provider: provider }).eq('id', id).then(function(r) {
      if (r.error) { UI.toast('Save failed: ' + r.error.message, 'error'); return; }
      UI.toast('Tracker assigned');
      UI.closeModal();
      FleetPage._fetched = false;
      FleetPage._refresh(true);
    });
  },

  archive: function(id) {
    if (!confirm('Archive this vehicle? It will no longer receive position updates from its tracker.')) return;
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) { UI.toast('Supabase not ready', 'error'); return; }
    sb.from('vehicles').update({ active: false }).eq('id', id).then(function(r) {
      if (r.error) { UI.toast('Archive failed: ' + r.error.message, 'error'); return; }
      UI.toast('Vehicle archived');
      UI.closeModal();
      FleetPage._fetched = false;
      FleetPage._refresh(true);
    });
  }
};
