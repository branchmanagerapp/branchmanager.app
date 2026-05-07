/**
 * Branch Manager — Chip Drop Spots
 *
 * Map + list of places where the crew can drop wood chips. CRP (the municipal
 * Cortlandt Recycling Park) is the default; this layer adds private-property
 * spots — neighbors who've asked for chips, regulars, drop-and-go contacts.
 *
 * Inspired by ChipDrop's matching pattern, but for our internal ops only:
 * driving back from a job, the crew picks the closest available spot from
 * the map instead of always running back to CRP.
 *
 * Storage: chip_drop_spots Supabase table (tenant-scoped, RLS-enabled,
 * realtime-enabled). Schema: see migrate-chip-drops.sql.
 */
var ChipDrops = {
  _spots: [],
  _filter: 'all', // all | active | full | paused
  _loading: true,
  _err: null,
  _map: null,
  _pins: [],
  _rtSubInited: false,

  // Phase 2 — pulled from the global tenant resolver (window.resolveTenantId,
  // defined in src/supabase.js). Resolver itself has the SNT fallback —
  // single source of truth so friend-tenant migration is a one-line change.
  get TENANT_ID() { return window.resolveTenantId(); },

  render: function() {
    ChipDrops._kickFetch();
    ChipDrops._initRealtime();

    var html = '<div style="max-width:900px;">';

    // Header
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">'
      + '<div>'
      +   '<h2 style="margin:0;font-size:20px;font-weight:700;">🪵 Chip Drop Spots</h2>'
      +   '<p style="margin:2px 0 0;font-size:12px;color:var(--text-light);">Closer alternatives to CRP — log a spot once, route to the closest one next time.</p>'
      + '</div>'
      + '<div style="display:flex;gap:6px;">'
      +   '<button onclick="ChipDrops._addAtCurrentLocation()" class="btn btn-primary" style="font-size:13px;">+ Log Spot Here</button>'
      +   '<button onclick="ChipDrops._openAddModal()" class="btn btn-outline" style="font-size:13px;">+ By Address</button>'
      + '</div>'
      + '</div>';

    // Filter pills
    var filters = [
      { k: 'all',     label: 'All' },
      { k: 'active',  label: 'Active' },
      { k: 'full',    label: 'Full' },
      { k: 'paused',  label: 'Paused' }
    ];
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">';
    filters.forEach(function(f) {
      var on = ChipDrops._filter === f.k;
      var count = ChipDrops._spots.filter(function(s) { return f.k === 'all' || s.status === f.k; }).length;
      html += '<button onclick="ChipDrops._setFilter(\'' + f.k + '\')" '
        + 'style="padding:6px 12px;border-radius:14px;border:1px solid ' + (on ? 'var(--green-dark)' : 'var(--border)') + ';'
        + 'background:' + (on ? 'var(--green-dark)' : 'var(--white)') + ';color:' + (on ? '#fff' : 'var(--text)') + ';'
        + 'font-size:12px;font-weight:' + (on ? '700' : '500') + ';cursor:pointer;">'
        + f.label + ' (' + count + ')</button>';
    });
    html += '</div>';

    // Map + list container
    html += '<div id="chipdrops-map" style="height:380px;border-radius:12px;background:#e8e8e8;border:1px solid var(--border);overflow:hidden;margin-bottom:14px;"></div>';
    html += '<div id="chipdrops-list">' + ChipDrops._renderList() + '</div>';

    html += '</div>';
    return html;
  },

  _renderList: function() {
    if (ChipDrops._loading) return '<div style="text-align:center;padding:40px;color:var(--text-light);font-size:13px;">Loading…</div>';
    if (ChipDrops._err)     return '<div style="background:#fee;border:1px solid #fcc;padding:14px;border-radius:10px;color:#900;font-size:13px;">' + UI.esc(ChipDrops._err) + '</div>';

    var rows = ChipDrops._filteredSpots();
    if (!rows.length) {
      return '<div style="text-align:center;padding:40px;color:var(--text-light);font-size:13px;">No spots match this filter. Tap "+ Log Spot Here" to add one.</div>';
    }

    var html = '<div style="display:grid;gap:8px;">';
    rows.forEach(function(s) {
      var color = s.status === 'full' ? '#c62828' : (s.status === 'paused' ? '#9e9e9e' : '#2e7d32');
      var lastDrop = s.last_drop_at ? UI.dateRelative(s.last_drop_at) : 'never';
      var capLabel = s.capacity_loads >= 999 ? '∞' : ((s.capacity_loads || 0) + ' loads');
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;" onclick="ChipDrops._showDetail(\'' + s.id + '\')">'
        + '<div style="min-width:0;flex:1;">'
        +   '<div style="font-weight:700;font-size:14px;">' + UI.esc(s.name || 'Unnamed') + '</div>'
        +   '<div style="font-size:12px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(s.address || '—') + '</div>'
        +   '<div style="font-size:11px;color:var(--text-light);margin-top:3px;">'
        +     '<span style="color:' + color + ';font-weight:700;text-transform:uppercase;">● ' + UI.esc(s.status || 'active') + '</span>'
        +     ' · cap: ' + capLabel
        +     ' · last drop: ' + lastDrop
        +     (s.accepts_species && s.accepts_species !== 'all' ? ' · ' + UI.esc(s.accepts_species) : '')
        +   '</div>'
        + '</div>'
        + (s.lat && s.lng
            ? '<a href="https://www.google.com/maps/dir/?api=1&destination=' + s.lat + ',' + s.lng + '" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="background:var(--green-bg);color:var(--green-dark);padding:6px 10px;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none;white-space:nowrap;">Directions</a>'
            : '')
        + '</div>';
    });
    html += '</div>';
    return html;
  },

  _filteredSpots: function() {
    return ChipDrops._spots.filter(function(s) {
      if (ChipDrops._filter === 'all') return true;
      return s.status === ChipDrops._filter;
    });
  },

  _setFilter: function(k) {
    ChipDrops._filter = k;
    loadPage('chipdrops');
  },

  // ── Cloud fetch ─────────────────────────────────────────────────────────
  _kickFetch: function() {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client) {
      ChipDrops._loading = false;
      ChipDrops._err = 'Supabase not connected';
      return;
    }
    SupabaseDB.client
      .from('chip_drop_spots')
      .select('*')
      .eq('tenant_id', ChipDrops.TENANT_ID)
      .order('created_at', { ascending: false })
      .then(function(res) {
        ChipDrops._loading = false;
        if (res.error) { ChipDrops._err = res.error.message; }
        else { ChipDrops._spots = res.data || []; }
        // v640: was `_currentPage === 'chipdrops'` only — but Chip Drops
        // lives inside Operations hub now, so currentPage is 'operations'.
        // Check for the actual map container in the DOM instead.
        if (document.getElementById('chipdrops-map')) {
          var listEl = document.getElementById('chipdrops-list');
          if (listEl) listEl.innerHTML = ChipDrops._renderList();
          ChipDrops._renderMap();
        }
      });
  },

  _initRealtime: function() {
    if (ChipDrops._rtSubInited) return;
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client || !SupabaseDB.client.channel) return;
    ChipDrops._rtSubInited = true;
    var ch = SupabaseDB.client.channel('bm-chipdrops-' + Math.random().toString(36).slice(2, 8));
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'chip_drop_spots' }, function() {
      clearTimeout(ChipDrops._rtDebounce);
      ChipDrops._rtDebounce = setTimeout(function() { ChipDrops._kickFetch(); }, 600);
    });
    ch.subscribe();
  },

  // ── Map render ──────────────────────────────────────────────────────────
  _renderMap: function() {
    var el = document.getElementById('chipdrops-map');
    if (!el || typeof maplibregl === 'undefined') return;
    var spots = ChipDrops._filteredSpots().filter(function(s) { return s.lat && s.lng; });

    // v640: detect stale map (container was replaced on re-render). If the
    // existing map's container is no longer the live DOM element, destroy
    // and recreate. Was rendering pins into a detached/orphan node.
    if (ChipDrops._map && ChipDrops._map.getContainer() !== el) {
      try { ChipDrops._map.remove(); } catch(e) {}
      ChipDrops._map = null;
      ChipDrops._pins = [];
    }

    if (!ChipDrops._map) {
      var center = spots.length ? [parseFloat(spots[0].lng), parseFloat(spots[0].lat)] : [-73.91556, 41.27306];
      ChipDrops._map = new maplibregl.Map({
        container: el,
        style: {
          version: 8,
          sources: {
            sat: {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256,
              attribution: 'ESRI World Imagery'
            }
          },
          layers: [{ id: 'sat', type: 'raster', source: 'sat' }]
        },
        center: center,
        zoom: 11
      });
      ChipDrops._map.addControl(new maplibregl.NavigationControl(), 'top-right');
    }

    // Clear existing pins
    ChipDrops._pins.forEach(function(p) { try { p.remove(); } catch(e) {} });
    ChipDrops._pins = [];

    // Add a pin for each spot
    spots.forEach(function(s) {
      var color = s.status === 'full' ? '#c62828' : (s.status === 'paused' ? '#9e9e9e' : '#2e7d32');
      var el = document.createElement('div');
      el.style.cssText = 'width:24px;height:24px;border-radius:50%;background:' + color + ';border:3px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;font-weight:700;';
      el.textContent = '🪵';
      el.title = s.name + ' (' + s.status + ')';
      el.onclick = function(ev) { ev.stopPropagation(); ChipDrops._showDetail(s.id); };
      var marker = new maplibregl.Marker({ element: el })
        .setLngLat([parseFloat(s.lng), parseFloat(s.lat)])
        .addTo(ChipDrops._map);
      ChipDrops._pins.push(marker);
    });

    // Auto-fit when there's more than one
    if (spots.length > 1) {
      var bounds = new maplibregl.LngLatBounds();
      spots.forEach(function(s) { bounds.extend([parseFloat(s.lng), parseFloat(s.lat)]); });
      try { ChipDrops._map.fitBounds(bounds, { padding: 40, maxZoom: 14 }); } catch(e) {}
    }
  },

  // ── Detail / actions ────────────────────────────────────────────────────
  _showDetail: function(id) {
    var s = ChipDrops._spots.find(function(x) { return x.id === id; });
    if (!s) { UI.toast('Spot not found', 'error'); return; }

    var capLabel = s.capacity_loads >= 999 ? 'Unlimited' : ((s.capacity_loads || 0) + ' loads');
    var html = ''
      + '<div style="font-size:14px;line-height:1.6;">'
      +   '<div style="margin-bottom:10px;"><strong>Address:</strong> ' + UI.esc(s.address || '—') + '</div>'
      +   (s.contact_name ? '<div style="margin-bottom:6px;"><strong>Contact:</strong> ' + UI.esc(s.contact_name) + (s.contact_phone ? ' — <a href="tel:' + UI.esc(s.contact_phone) + '">' + UI.esc(s.contact_phone) + '</a>' : '') + '</div>' : '')
      +   '<div style="margin-bottom:6px;"><strong>Status:</strong> ' + UI.esc(s.status || 'active') + '</div>'
      +   '<div style="margin-bottom:6px;"><strong>Capacity:</strong> ' + capLabel + '</div>'
      +   '<div style="margin-bottom:6px;"><strong>Accepts:</strong> ' + UI.esc(s.accepts_species || 'any') + '</div>'
      +   '<div style="margin-bottom:6px;"><strong>Last drop:</strong> ' + (s.last_drop_at ? UI.dateRelative(s.last_drop_at) + ' (' + (s.last_drop_loads || 0) + ' loads)' : 'never') + '</div>'
      +   (s.drop_notes ? '<div style="margin-top:10px;padding:10px;background:#f8f9fa;border-radius:6px;font-size:13px;color:#444;white-space:pre-wrap;">' + UI.esc(s.drop_notes) + '</div>' : '')
      + '</div>';

    var actions = ''
      + (s.lat && s.lng ? '<a href="https://www.google.com/maps/dir/?api=1&destination=' + s.lat + ',' + s.lng + '" target="_blank" rel="noopener" class="btn btn-primary" style="text-decoration:none;">Directions</a> ' : '')
      + '<button class="btn btn-outline" onclick="ChipDrops._logDrop(\'' + s.id + '\')">+ Log Drop</button> '
      + '<button class="btn btn-outline" onclick="ChipDrops._toggleStatus(\'' + s.id + '\')">' + (s.status === 'full' ? 'Mark Active' : 'Mark Full') + '</button> '
      + '<button class="btn btn-outline" onclick="ChipDrops._editSpot(\'' + s.id + '\')">Edit</button>';

    UI.showModal(s.name || 'Chip Drop Spot', html, { footer: actions });
  },

  _logDrop: function(id) {
    var loadsStr = prompt('How many truckloads dropped today?', '1');
    if (!loadsStr) return;
    var loads = parseInt(loadsStr, 10);
    if (isNaN(loads) || loads < 1) { UI.toast('Enter a positive number', 'error'); return; }
    ChipDrops._update(id, { last_drop_at: new Date().toISOString(), last_drop_loads: loads });
    UI.closeModal();
    UI.toast('Drop logged');
  },

  _toggleStatus: function(id) {
    var s = ChipDrops._spots.find(function(x) { return x.id === id; });
    if (!s) return;
    var next = s.status === 'full' ? 'active' : 'full';
    ChipDrops._update(id, { status: next });
    UI.closeModal();
    UI.toast('Marked ' + next);
  },

  _update: function(id, patch) {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client) return;
    patch.updated_at = new Date().toISOString();
    SupabaseDB.client.from('chip_drop_spots').update(patch).eq('id', id).then(function(res) {
      if (res.error) { UI.toast('Save failed: ' + res.error.message, 'error'); return; }
      // Optimistic local update
      var s = ChipDrops._spots.find(function(x) { return x.id === id; });
      if (s) Object.assign(s, patch);
      if (window._currentPage === 'chipdrops') {
        var listEl = document.getElementById('chipdrops-list');
        if (listEl) listEl.innerHTML = ChipDrops._renderList();
        ChipDrops._renderMap();
      }
    });
  },

  // ── Add new spot ────────────────────────────────────────────────────────
  _addAtCurrentLocation: function() {
    if (!navigator.geolocation) { UI.toast('Geolocation not supported', 'error'); ChipDrops._openAddModal(); return; }
    UI.toast('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      function(pos) { ChipDrops._openAddModal({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      function() { UI.toast('Couldn\'t get location — enter address manually', 'error'); ChipDrops._openAddModal(); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  },

  _openAddModal: function(prefill) {
    prefill = prefill || {};
    var html = ''
      + '<div style="display:grid;gap:10px;">'
      +   UI.field('Name *', '<input id="cd-name" type="text" placeholder="e.g. Smith property — Maple Ave">')
      +   UI.field('Address', '<input id="cd-address" type="text" value="' + (prefill.address || '') + '" placeholder="123 Main St, Peekskill, NY">')
      +   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
      +     UI.field('Lat', '<input id="cd-lat" type="text" value="' + (prefill.lat || '') + '" inputmode="decimal">')
      +     UI.field('Lng', '<input id="cd-lng" type="text" value="' + (prefill.lng || '') + '" inputmode="decimal">')
      +   '</div>'
      +   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
      +     UI.field('Contact name', '<input id="cd-contact-name" type="text">')
      +     UI.field('Contact phone', '<input id="cd-contact-phone" type="tel">')
      +   '</div>'
      +   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
      +     UI.field('Capacity (loads)', '<input id="cd-capacity" type="number" value="1" min="1">')
      +     UI.field('Accepts species', '<input id="cd-species" type="text" placeholder="all, oak, pine, etc">')
      +   '</div>'
      +   UI.field('Drop notes', '<textarea id="cd-notes" placeholder="Gate code, where to pile, time windows, etc." style="min-height:80px;"></textarea>')
      + '</div>';
    UI.showModal('+ Log Chip Drop Spot', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button> '
        + '<button class="btn btn-primary" onclick="ChipDrops._saveNew()">Save Spot</button>'
    });
  },

  _saveNew: function() {
    function val(id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }
    var name = val('cd-name');
    if (!name) { UI.toast('Name is required', 'error'); return; }
    var lat = parseFloat(val('cd-lat')) || null;
    var lng = parseFloat(val('cd-lng')) || null;
    var capacity = parseInt(val('cd-capacity'), 10);
    if (isNaN(capacity) || capacity < 1) capacity = 1;

    var row = {
      tenant_id:      ChipDrops.TENANT_ID,
      name:           name,
      address:        val('cd-address') || null,
      lat:            lat,
      lng:            lng,
      contact_name:   val('cd-contact-name') || null,
      contact_phone:  val('cd-contact-phone') || null,
      capacity_loads: capacity,
      accepts_species: val('cd-species') || null,
      drop_notes:     val('cd-notes') || null,
      status:         'active',
      source:         'self_added'
    };

    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client) {
      UI.toast('Supabase not connected', 'error'); return;
    }
    SupabaseDB.client.from('chip_drop_spots').insert(row).select('*').single().then(function(res) {
      if (res.error) { UI.toast('Save failed: ' + res.error.message, 'error'); return; }
      ChipDrops._spots.unshift(res.data);
      UI.closeModal();
      UI.toast('Spot saved');
      loadPage('chipdrops');
    });
  },

  _editSpot: function(id) {
    var s = ChipDrops._spots.find(function(x) { return x.id === id; });
    if (!s) return;
    UI.closeModal();
    setTimeout(function() {
      ChipDrops._openAddModal({ address: s.address, lat: s.lat, lng: s.lng });
      // Pre-fill rest of fields once modal is rendered
      setTimeout(function() {
        function set(id, v) { var el = document.getElementById(id); if (el && v) el.value = v; }
        set('cd-name', s.name);
        set('cd-contact-name', s.contact_name);
        set('cd-contact-phone', s.contact_phone);
        set('cd-capacity', s.capacity_loads);
        set('cd-species', s.accepts_species);
        set('cd-notes', s.drop_notes);
        // Repoint Save to update instead of insert
        var btn = document.querySelector('.modal .btn-primary');
        if (btn) btn.setAttribute('onclick', "ChipDrops._saveEdit('" + id + "')");
      }, 100);
    }, 50);
  },

  _saveEdit: function(id) {
    function val(id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : ''; }
    var name = val('cd-name');
    if (!name) { UI.toast('Name is required', 'error'); return; }
    var lat = parseFloat(val('cd-lat')) || null;
    var lng = parseFloat(val('cd-lng')) || null;
    var capacity = parseInt(val('cd-capacity'), 10);
    if (isNaN(capacity) || capacity < 1) capacity = 1;
    ChipDrops._update(id, {
      name: name,
      address: val('cd-address') || null,
      lat: lat,
      lng: lng,
      contact_name: val('cd-contact-name') || null,
      contact_phone: val('cd-contact-phone') || null,
      capacity_loads: capacity,
      accepts_species: val('cd-species') || null,
      drop_notes: val('cd-notes') || null
    });
    UI.closeModal();
    UI.toast('Spot updated');
  }
};
