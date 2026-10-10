/**
 * Branch Manager — Photo Map (CompanyCam Style)
 * All job photos geotagged and plotted on a map
 * GPS captured at time of photo, organized by job/property
 */
var PhotoMap = {
  map: null,

  render: function() {
    // Collect all photos with GPS data
    var allPhotos = PhotoMap.getAllPhotos();
    var withGPS = allPhotos.filter(function(p) { return p.lat && p.lng; });

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<div class="section-header" style="margin:0;"><h2>📸 Photo Map</h2>'
      + '<p style="color:var(--text-light);font-size:13px;margin-top:2px;">' + allPhotos.length + ' photos · ' + withGPS.length + ' geotagged</p></div>'
      + '<div style="display:flex;gap:6px;">'
      + '<button onclick="PhotoMap.filterType(\'all\')" class="filter-btn" style="background:var(--green-dark);color:#fff;">All</button>'
      + '<button onclick="PhotoMap.filterType(\'before\')" class="filter-btn">Before</button>'
      + '<button onclick="PhotoMap.filterType(\'after\')" class="filter-btn">After</button>'
      + '</div></div>';

    // Map
    html += '<div id="photo-map" style="height:450px;border-radius:12px;border:1px solid var(--border);overflow:hidden;margin-bottom:16px;"></div>';

    // Stats bar
    var jobs = {};
    allPhotos.forEach(function(p) {
      if (p.jobId) {
        if (!jobs[p.jobId]) jobs[p.jobId] = 0;
        jobs[p.jobId]++;
      }
    });
    html += '<div style="display:flex;gap:16px;padding:8px 0;font-size:13px;color:var(--text-light);flex-wrap:wrap;">'
      + '<span>📸 ' + allPhotos.length + ' total photos</span>'
      + '<span>📍 ' + withGPS.length + ' geotagged</span>'
      + '<span>🌳 ' + Object.keys(jobs).length + ' jobs with photos</span>'
      + '</div>';

    // Recent photos grid
    html += '<div style="background:var(--white);border-radius:12px;padding:16px;border:1px solid var(--border);">'
      + '<h3 style="font-size:15px;margin-bottom:12px;">Recent Photos</h3>'
      + '<div id="photo-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">';

    allPhotos.slice(0, 24).forEach(function(p, idx) {
      html += '<div style="position:relative;border-radius:8px;overflow:hidden;aspect-ratio:1;cursor:pointer;" onclick="Photos.viewFull(\'' + p.recordType + '\', \'' + p.recordId + '\', ' + p.index + ')">'
        + '<img src="' + p.url + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy">'
        + '<div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.7));padding:6px 8px;">'
        + '<div style="font-size:10px;color:#fff;font-weight:600;">' + (p.label || '') + '</div>'
        + '<div style="font-size:9px;color:rgba(255,255,255,.7);">' + (p.clientName || '') + ' · ' + (p.date ? UI.dateShort(p.date) : '') + '</div>'
        + '</div>'
        + (p.lat ? '<div style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.5);color:#fff;font-size:9px;padding:2px 5px;border-radius:3px;">📍</div>' : '')
        + '</div>';
    });

    if (allPhotos.length === 0) {
      html += '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-light);">'
        + '<div style="font-size:36px;margin-bottom:8px;">📸</div>'
        + '<p>No photos yet. Take photos from the Crew View or Job detail pages.</p></div>';
    }
    html += '</div></div>';

    // Init map after render
    setTimeout(function() { PhotoMap._initMap(withGPS); }, 100);

    return html;
  },

  getAllPhotos: function() {
    var allPhotos = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.startsWith('bm-photos-')) {
        try {
          var parts = key.replace('bm-photos-', '').split('-');
          var recordType = parts[0];
          var recordId = parts.slice(1).join('-');
          var photos = JSON.parse(localStorage.getItem(key)) || [];

          // Try to get client name from the job/quote
          var clientName = '';
          if (recordType === 'job') {
            var job = DB.jobs.getById(recordId);
            if (job) clientName = job.clientName || '';
          } else if (recordType === 'client') {
            var client = DB.clients.getById(recordId);
            if (client) clientName = client.name || '';
          }

          photos.forEach(function(p, idx) {
            allPhotos.push({
              url: p.url,
              lat: p.lat || null,
              lng: p.lng || null,
              label: p.label || '',
              date: p.date || '',
              name: p.name || '',
              recordType: recordType,
              recordId: recordId,
              jobId: recordType === 'job' ? recordId : null,
              clientName: clientName,
              index: idx
            });
          });
        } catch(e) {}
      }
    }
    allPhotos.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    return allPhotos;
  },

  _initMap: function(photos) {
    if (!document.getElementById('photo-map')) return;

    // Load Leaflet
    if (!document.getElementById('leaflet-css-pm')) {
      var link = document.createElement('link');
      link.id = 'leaflet-css-pm';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (!window.L) {
      var script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = function() { PhotoMap._buildMap(photos); };
      document.head.appendChild(script);
    } else {
      PhotoMap._buildMap(photos);
    }
  },

  _buildMap: function(photos) {
    var el = document.getElementById('photo-map');
    if (!el || !window.L) return;

    if (PhotoMap.map) PhotoMap.map.remove();
    PhotoMap.map = L.map('photo-map').setView([41.29, -73.92], 11);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles: Esri'
    }).addTo(PhotoMap.map);

    // Add photo markers
    photos.forEach(function(p) {
      var icon = L.divIcon({
        className: 'photo-marker',
        html: '<div style="width:40px;height:40px;border-radius:6px;overflow:hidden;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:pointer;">'
          + '<img src="' + p.url + '" style="width:100%;height:100%;object-fit:cover;"></div>',
        iconSize: [46, 46],
        iconAnchor: [23, 23]
      });

      L.marker([p.lat, p.lng], { icon: icon })
        .bindPopup('<div style="text-align:center;min-width:150px;">'
          + '<img src="' + p.url + '" style="width:150px;height:100px;object-fit:cover;border-radius:6px;margin-bottom:6px;">'
          + '<div style="font-weight:600;font-size:13px;">' + (p.clientName || 'Job Photo') + '</div>'
          + '<div style="font-size:11px;color:#666;">' + (p.label || '') + ' · ' + (p.date ? UI.dateShort(p.date) : '') + '</div>'
          + '</div>')
        .addTo(PhotoMap.map);
    });

    // Fit bounds if we have photos
    if (photos.length > 0) {
      var bounds = L.latLngBounds(photos.map(function(p) { return [p.lat, p.lng]; }));
      PhotoMap.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  },

  filterType: function(type) {
    // Filter photos by label (before/after)
    var grid = document.getElementById('photo-grid');
    if (!grid) return;
    var allPhotos = PhotoMap.getAllPhotos();
    if (type !== 'all') {
      allPhotos = allPhotos.filter(function(p) {
        return (p.label || '').toLowerCase().includes(type);
      });
    }
    // Re-render grid (simplified)
    UI.toast('Showing ' + type + ' photos (' + allPhotos.length + ')');
  }
};

// ── Enhanced Photo Upload with GPS ──
// Override the Photos upload to capture GPS (only if Photos is loaded)
if (typeof Photos === 'undefined') { console.warn('PhotoMap: Photos not loaded yet, GPS capture skipped'); }
var _origUploadLocal = typeof Photos !== 'undefined' ? Photos._uploadLocal : null;
if (typeof Photos !== 'undefined') Photos._uploadLocal = function(file, recordType, recordId) {
  // Get GPS position while processing photo
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      // Store GPS for next photo save
      Photos._lastGPS = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
    }, function() {
      Photos._lastGPS = null;
    }, { enableHighAccuracy: true, timeout: 5000 });
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var maxSize = 1200; // Slightly higher quality for CompanyCam style
      var w = img.width, h = img.height;
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = h * maxSize / w; w = maxSize; }
        else { w = w * maxSize / h; h = maxSize; }
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.8);

      var photo = {
        url: dataUrl,
        name: file.name,
        date: new Date().toISOString(),
        label: ''
      };

      // Attach GPS if available
      if (Photos._lastGPS) {
        photo.lat = Photos._lastGPS.lat;
        photo.lng = Photos._lastGPS.lng;
        photo.accuracy = Photos._lastGPS.accuracy;
        Photos._lastGPS = null;
      }

      Photos._savePhoto(recordType, recordId, photo);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

// Also request GPS permission on page load
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(function() {}, function() {}, { enableHighAccuracy: true });
}
