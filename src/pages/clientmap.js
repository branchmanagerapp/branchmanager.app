/**
 * Branch Manager — Client Map View
 * All clients plotted on a map, color-coded by status
 * Click to see client details, filter by tag/status
 * Uses Leaflet + OpenStreetMap (free, no API key)
 */
var ClientMapPage = {
  map: null,
  markers: [],

  render: function() {
    var clients = DB.clients.getAll();
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<div class="section-header" style="margin:0;"><h2>Client Map</h2>'
      + '<p style="color:var(--text-light);font-size:13px;margin-top:2px;">' + clients.length + ' clients</p></div>'
      + '<div style="display:flex;gap:6px;">'
      + '<button onclick="ClientMapPage.filterStatus(\'all\')" class="filter-btn" style="background:var(--green-dark);color:#fff;">All</button>'
      + '<button onclick="ClientMapPage.filterStatus(\'active\')" class="filter-btn">Active</button>'
      + '<button onclick="ClientMapPage.filterStatus(\'lead\')" class="filter-btn">Leads</button>'
      + '</div></div>';

    // Map container
    html += '<div id="client-map" style="height:500px;border-radius:12px;border:1px solid var(--border);overflow:hidden;"></div>';

    // Stats bar
    var active = clients.filter(function(c) { return c.status === 'active'; }).length;
    var leads = clients.filter(function(c) { return c.status === 'lead'; }).length;
    html += '<div style="display:flex;gap:16px;padding:12px 0;font-size:13px;color:var(--text-light);">'
      + '<span>🟢 Active: <strong>' + active + '</strong></span>'
      + '<span>🔵 Leads: <strong>' + leads + '</strong></span>'
      + '<span>⚪ Other: <strong>' + (clients.length - active - leads) + '</strong></span>'
      + '</div>';

    // Client list below map
    html += '<div style="background:var(--white);border-radius:12px;padding:16px;border:1px solid var(--border);margin-top:8px;max-height:300px;overflow-y:auto;">'
      + '<h4 style="font-size:14px;margin-bottom:8px;">Clients by Area</h4>'
      + '<div id="client-list-map">';

    // Group by city
    var byCity = {};
    clients.forEach(function(c) {
      var city = c.city || 'Unknown';
      if (!byCity[city]) byCity[city] = [];
      byCity[city].push(c);
    });
    var sortedCities = Object.keys(byCity).sort(function(a, b) { return byCity[b].length - byCity[a].length; });
    sortedCities.forEach(function(city) {
      html += '<div style="margin-bottom:8px;">'
        + '<div style="font-weight:600;font-size:13px;color:var(--green-dark);border-bottom:1px solid var(--border);padding:4px 0;">' + city + ' (' + byCity[city].length + ')</div>';
      byCity[city].slice(0, 5).forEach(function(c) {
        html += '<div style="display:flex;justify-content:space-between;padding:3px 0 3px 12px;font-size:12px;cursor:pointer;" onclick="loadPage(\'clients\');setTimeout(function(){ClientsPage.showDetail(\'' + c.id + '\')},100);">'
          + '<span>' + c.name + '</span><span style="color:var(--text-light);">' + (c.address || '') + '</span></div>';
      });
      if (byCity[city].length > 5) {
        html += '<div style="font-size:11px;color:var(--text-light);padding:2px 12px;">+ ' + (byCity[city].length - 5) + ' more</div>';
      }
      html += '</div>';
    });
    html += '</div></div>';

    // Load Leaflet and init map after render
    setTimeout(function() { ClientMapPage._initMap(clients); }, 100);

    return html;
  },

  _initMap: function(clients) {
    // Load Leaflet CSS if not present
    if (!document.getElementById('leaflet-css')) {
      var link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // Load Leaflet JS if not present
    if (!window.L) {
      var script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = function() { ClientMapPage._buildMap(clients); };
      document.head.appendChild(script);
    } else {
      ClientMapPage._buildMap(clients);
    }
  },

  _buildMap: function(clients) {
    var el = document.getElementById('client-map');
    if (!el || !window.L) return;

    // Center on Peekskill
    if (ClientMapPage.map) { ClientMapPage.map.remove(); }
    ClientMapPage.map = L.map('client-map').setView([41.29, -73.92], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap'
    }).addTo(ClientMapPage.map);

    // Geocode and place markers
    ClientMapPage.markers = [];
    var geocoded = 0;
    var toGeocode = clients.filter(function(c) { return c.address || c.city; });

    // Use cached geocode results
    toGeocode.forEach(function(c) {
      var cacheKey = 'bm-geo-' + (c.address + ' ' + (c.city || '') + ' ' + (c.state || 'NY')).replace(/\s+/g, '-').toLowerCase();
      var cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          var coords = JSON.parse(cached);
          ClientMapPage._addMarker(c, coords.lat, coords.lng);
        } catch(e) {}
      } else {
        // Rate-limit geocoding (Nominatim requires 1 req/sec)
        geocoded++;
        if (geocoded <= 20) { // Only geocode first 20 uncached
          setTimeout(function() {
            ClientMapPage._geocode(c, cacheKey);
          }, geocoded * 1100);
        }
      }
    });

    // Add service area circle
    L.circle([41.29, -73.92], {
      radius: 32000, // ~20 miles
      color: '#4a8a10',
      fillColor: '#4a8a10',
      fillOpacity: 0.05,
      weight: 1,
      dashArray: '5,5'
    }).addTo(ClientMapPage.map);
  },

  _geocode: function(client, cacheKey) {
    var addr = (client.address || '') + ', ' + (client.city || '') + ', ' + (client.state || 'NY') + ' ' + (client.zip || '');
    var url = 'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(addr) + '&limit=1';

    fetch(url, { headers: { 'User-Agent': 'BranchManager/1.0' } })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data && data.length > 0) {
          var lat = parseFloat(data[0].lat);
          var lng = parseFloat(data[0].lon);
          localStorage.setItem(cacheKey, JSON.stringify({ lat: lat, lng: lng }));
          ClientMapPage._addMarker(client, lat, lng);
        }
      }).catch(function() {});
  },

  _addMarker: function(client, lat, lng) {
    if (!ClientMapPage.map) return;
    var colors = { active: '#4caf50', lead: '#2196f3', inactive: '#999', archived: '#666' };
    var color = colors[client.status] || '#999';

    var icon = L.divIcon({
      className: 'client-marker',
      html: '<div style="width:12px;height:12px;border-radius:50%;background:' + color + ';border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    var marker = L.marker([lat, lng], { icon: icon })
      .bindPopup('<strong>' + client.name + '</strong><br>' + (client.address || '') + '<br>'
        + (client.phone ? '<a href="tel:' + client.phone + '">' + client.phone + '</a><br>' : '')
        + '<span style="color:' + color + ';text-transform:capitalize;">' + (client.status || '') + '</span>')
      .addTo(ClientMapPage.map);

    ClientMapPage.markers.push({ marker: marker, client: client });
  },

  filterStatus: function(status) {
    ClientMapPage.markers.forEach(function(m) {
      if (status === 'all' || m.client.status === status) {
        m.marker.setOpacity(1);
      } else {
        m.marker.setOpacity(0.15);
      }
    });
  }
};
