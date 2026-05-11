/**
 * Branch Cam — Photo Upload & Gallery
 * Attach before/after photos to jobs, quotes, and clients
 * GPS + timestamp burned into every shot for proof-of-work
 * Uses Supabase Storage when connected, falls back to base64 in localStorage
 */
var Photos = {
  BUCKET: 'job-photos',
  BRAND: 'Branch Cam',

  // Capture GPS once, reuse across uploads in the same batch (saves prompts + battery)
  _lastGps: null,
  _lastGpsTime: 0,
  _getGps: function() {
    return new Promise(function(resolve) {
      // Reuse if fetched in last 60s
      if (Photos._lastGps && (Date.now() - Photos._lastGpsTime) < 60000) {
        return resolve(Photos._lastGps);
      }
      if (!navigator.geolocation) return resolve(null);
      var done = false;
      var timer = setTimeout(function() { if (!done) { done = true; resolve(null); } }, 4000);
      navigator.geolocation.getCurrentPosition(function(pos) {
        if (done) return; done = true; clearTimeout(timer);
        Photos._lastGps = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        Photos._lastGpsTime = Date.now();
        resolve(Photos._lastGps);
      }, function() {
        if (done) return; done = true; clearTimeout(timer); resolve(null);
      }, { enableHighAccuracy: true, timeout: 4000, maximumAge: 60000 });
    });
  },

  // Burn watermark (date/time + GPS + Branch Cam brand) into image, return Blob
  _stampImage: function(file, gps) {
    return new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
          // Resize to max 1600px (CompanyCam-style — keep readable but slim)
          var maxSize = 1600;
          var w = img.width, h = img.height;
          if (w > maxSize || h > maxSize) {
            if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
            else { w = Math.round(w * maxSize / h); h = maxSize; }
          }
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          // --- Watermark band ---
          var pad = Math.max(10, Math.round(w * 0.012));
          var fontPx = Math.max(14, Math.round(w * 0.024));
          ctx.font = '600 ' + fontPx + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          var smallPx = Math.max(11, Math.round(w * 0.018));

          var d = new Date();
          var dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
          var timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          var gpsStr = gps ? (gps.lat.toFixed(5) + '°, ' + gps.lng.toFixed(5) + '°') : 'GPS unavailable';

          var bandH = Math.round(fontPx * 2.6 + smallPx * 1.6 + pad * 1.4);
          // Gradient bg for readability over any image
          var grad = ctx.createLinearGradient(0, h - bandH, 0, h);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(0.4, 'rgba(0,0,0,0.55)');
          grad.addColorStop(1, 'rgba(0,0,0,0.85)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, h - bandH, w, bandH);

          // Brand pill (top-left of band)
          var pillTxt = '🌳 ' + Photos.BRAND;
          ctx.font = '700 ' + smallPx + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          var pillW = ctx.measureText(pillTxt).width + smallPx * 1.4;
          var pillH = smallPx * 1.8;
          var pillY = h - bandH + pad * 0.6;
          ctx.fillStyle = 'rgba(46, 125, 50, 0.95)';
          Photos._roundRect(ctx, pad, pillY, pillW, pillH, pillH / 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.textBaseline = 'middle';
          ctx.fillText(pillTxt, pad + smallPx * 0.7, pillY + pillH / 2);

          // Date + time (left, big)
          ctx.font = '700 ' + fontPx + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = '#fff';
          ctx.fillText(dateStr + ' · ' + timeStr, pad, h - pad - smallPx - 4);

          // GPS (bottom-left, small)
          ctx.font = '500 ' + smallPx + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fillText('📍 ' + gpsStr, pad, h - pad);

          canvas.toBlob(function(blob) {
            resolve(blob || file);
          }, 'image/jpeg', 0.85);
        };
        img.onerror = function() { resolve(file); };
        img.src = e.target.result;
      };
      reader.onerror = function() { resolve(file); };
      reader.readAsDataURL(file);
    });
  },

  _roundRect: function(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  // Render upload button + gallery for a record
  renderGallery: function(recordType, recordId) {
    var photos = Photos.getPhotos(recordType, recordId);
    var html = '<div style="margin-top:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<h4 style="font-size:14px;">📸 Photos (' + photos.length + ')</h4>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
      + (photos.length ? '<button onclick="Photos.shareGallery(\'' + recordType + '\', \'' + recordId + '\')" style="background:var(--white);color:var(--text);border:1px solid var(--border);padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">🔗 Share</button>' : '')
      + (photos.length >= 2 ? '<button onclick="Photos.shareSlider(\'' + recordType + '\', \'' + recordId + '\')" style="background:var(--white);color:var(--text);border:1px solid var(--border);padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">✨ B/A Slider</button>' : '')
      + (photos.length ? '<button onclick="Photos.generateReport(\'' + recordType + '\', \'' + recordId + '\', \'' + recordType + '\')" style="background:var(--white);color:var(--text);border:1px solid var(--border);padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">📄 Report</button>' : '')
      + '<label style="background:var(--green-dark);color:#fff;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">'
      + '+ Add Photo<input type="file" accept="image/*" multiple onchange="Photos.upload(event, \'' + recordType + '\', \'' + recordId + '\')" style="display:none;">'
      + '</label></div></div>';

    if (photos.length) {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;">';
      photos.forEach(function(p, idx) {
        html += '<div style="position:relative;border-radius:8px;overflow:hidden;aspect-ratio:1;cursor:pointer;" onclick="Photos.viewFull(\'' + recordType + '\', \'' + recordId + '\', ' + idx + ')">'
          + '<img src="' + p.url + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy">'
          + '<div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.6));padding:4px 6px;font-size:10px;color:#fff;">'
          + (p.label || '') + ' ' + (p.date ? UI.dateShort(p.date) : '') + '</div>'
          + '</div>';
      });
      html += '</div>';
    } else {
      html += '<div style="text-align:center;padding:24px;border:2px dashed var(--border);border-radius:10px;color:var(--text-light);font-size:13px;">'
        + 'No photos yet. Tap + Add Photo to attach before/after shots.</div>';
    }
    html += '</div>';
    return html;
  },

  // v784: read EXIF GPS from a JPEG/HEIC file. Returns {lat,lng} or null.
  // Minimal inline parser — reads first 128KB, walks APP1 EXIF block, pulls
  // GPSLatitude/GPSLongitude IFD entries. Robust enough for iPhone/Android
  // camera output; gracefully returns null on anything else.
  _readExifGps: function(file) {
    return new Promise(function(resolve) {
      try {
        var slice = file.slice(0, 128 * 1024);
        var reader = new FileReader();
        reader.onerror = function() { resolve(null); };
        reader.onload = function(e) {
          try {
            var dv = new DataView(e.target.result);
            // JPEG SOI = 0xFFD8
            if (dv.getUint16(0, false) !== 0xFFD8) return resolve(null);
            var offset = 2;
            while (offset < dv.byteLength) {
              if (dv.getUint8(offset) !== 0xFF) return resolve(null);
              var marker = dv.getUint8(offset + 1);
              var size = dv.getUint16(offset + 2, false);
              if (marker === 0xE1) {
                // APP1 — check for "Exif\0\0"
                if (dv.getUint32(offset + 4, false) !== 0x45786966) return resolve(null);
                var tiff = offset + 10;
                var little = dv.getUint16(tiff, false) === 0x4949;
                if (dv.getUint16(tiff + 2, little) !== 0x002A) return resolve(null);
                var ifd0 = tiff + dv.getUint32(tiff + 4, little);
                var nEntries = dv.getUint16(ifd0, little);
                var gpsIfdOffset = null;
                for (var i = 0; i < nEntries; i++) {
                  var entry = ifd0 + 2 + i * 12;
                  var tag = dv.getUint16(entry, little);
                  if (tag === 0x8825) {
                    gpsIfdOffset = tiff + dv.getUint32(entry + 8, little);
                    break;
                  }
                }
                if (!gpsIfdOffset) return resolve(null);
                var gNEntries = dv.getUint16(gpsIfdOffset, little);
                var latRef = null, lat = null, lngRef = null, lng = null;
                var readRational = function(entryOff) {
                  var typeCount = dv.getUint32(entryOff + 4, little);
                  var valOff = dv.getUint32(entryOff + 8, little) + tiff;
                  // 3 RATIONALs = degrees, minutes, seconds
                  if (typeCount < 3) return null;
                  var deg = dv.getUint32(valOff, little) / dv.getUint32(valOff + 4, little);
                  var min = dv.getUint32(valOff + 8, little) / dv.getUint32(valOff + 12, little);
                  var sec = dv.getUint32(valOff + 16, little) / dv.getUint32(valOff + 20, little);
                  return deg + min / 60 + sec / 3600;
                };
                for (var k = 0; k < gNEntries; k++) {
                  var ge = gpsIfdOffset + 2 + k * 12;
                  var gt = dv.getUint16(ge, little);
                  if (gt === 0x0001) latRef = String.fromCharCode(dv.getUint8(ge + 8));
                  else if (gt === 0x0002) lat = readRational(ge);
                  else if (gt === 0x0003) lngRef = String.fromCharCode(dv.getUint8(ge + 8));
                  else if (gt === 0x0004) lng = readRational(ge);
                }
                if (lat == null || lng == null) return resolve(null);
                if (latRef === 'S') lat = -lat;
                if (lngRef === 'W') lng = -lng;
                return resolve({ lat: lat, lng: lng });
              }
              offset += 2 + size;
            }
            resolve(null);
          } catch(err) { resolve(null); }
        };
        reader.readAsArrayBuffer(slice);
      } catch(err) { resolve(null); }
    });
  },

  // v784: Haversine distance in meters between two {lat,lng} pairs.
  _haversineMeters: function(a, b) {
    if (!a || !b) return null;
    var R = 6371000;
    var toRad = function(deg) { return deg * Math.PI / 180; };
    var dLat = toRad(b.lat - a.lat);
    var dLng = toRad(b.lng - a.lng);
    var lat1 = toRad(a.lat);
    var lat2 = toRad(b.lat);
    var h = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.sin(dLng/2) * Math.sin(dLng/2) * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(h));
  },

  // v784: returns the property {lat,lng} for a record, or null. Currently
  // only jobs are checked — could extend to quotes/clients later.
  _getRecordLatLng: function(recordType, recordId) {
    if (recordType !== 'job') return null;
    try {
      var j = DB.jobs.getById(recordId);
      if (!j) return null;
      var lat = Number(j.lat || j.latitude);
      var lng = Number(j.lng || j.longitude || j.lon);
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;
      return { lat: lat, lng: lng };
    } catch(e) { return null; }
  },

  upload: async function(event, recordType, recordId) {
    var files = event.target.files;
    if (!files || !files.length) return;

    // v784: pre-flight EXIF/property cross-check. If a job has lat/lng on
    // file and the file's EXIF GPS is > 250m away, ask before uploading.
    // Skipped silently for non-job uploads or photos without EXIF GPS.
    var propLatLng = Photos._getRecordLatLng(recordType, recordId);
    if (propLatLng && files.length) {
      var farFiles = [];
      for (var fi = 0; fi < files.length; fi++) {
        var exif = await Photos._readExifGps(files[fi]);
        if (exif) {
          var dist = Photos._haversineMeters(exif, propLatLng);
          if (dist != null && dist > 250) {
            farFiles.push({ name: files[fi].name, dist: Math.round(dist) });
          }
        }
      }
      if (farFiles.length) {
        var msg = '⚠ EXIF location mismatch\n\n'
          + farFiles.length + ' of ' + files.length + ' photo(s) were taken more than 250m from this job\'s property:\n\n'
          + farFiles.slice(0, 4).map(function(f){ return '  • ' + f.name + ' — ' + (f.dist > 1000 ? (f.dist/1000).toFixed(1) + 'km' : f.dist + 'm') + ' away'; }).join('\n')
          + (farFiles.length > 4 ? '\n  • ...and ' + (farFiles.length - 4) + ' more' : '')
          + '\n\nProceed with upload anyway? (Cancel = skip these photos)';
        if (!confirm(msg)) {
          UI.toast('Upload cancelled — verify the right job is selected');
          event.target.value = '';
          return;
        }
      }
    }

    // Get GPS once for the whole batch (in parallel with first file read)
    var gpsPromise = Photos._getGps();

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      UI.toast('Stamping ' + file.name + '...');

      // Branch Cam stamp: timestamp + GPS + brand
      var gps = await gpsPromise;
      var stamped = await Photos._stampImage(file, gps);

      if (SupabaseDB && SupabaseDB.ready) {
        // Upload to Supabase Storage + write metadata row to `photos` table
        try {
          var safeName = (file.name || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '.jpg');
          var path = recordType + '/' + recordId + '/' + Date.now() + '_' + safeName;
          var { error } = await SupabaseDB.client.storage.from(Photos.BUCKET).upload(path, stamped, { contentType: 'image/jpeg' });
          if (error) throw error;
          var { data: urlData } = SupabaseDB.client.storage.from(Photos.BUCKET).getPublicUrl(path);

          var meta = {
            record_type: recordType,
            record_id: recordId,
            url: urlData.publicUrl,
            storage_path: path,
            name: file.name,
            label: '',
            taken_at: new Date().toISOString()
          };
          if (gps) { meta.gps_lat = gps.lat; meta.gps_lng = gps.lng; }
          var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
          if (tid) meta.tenant_id = tid;

          var ins = await SupabaseDB.client.from('photos').insert(meta).select().single();
          if (ins.error) console.warn('Photos: meta insert failed:', ins.error.message);

          Photos._savePhoto(recordType, recordId, {
            id: (ins.data && ins.data.id) || null,
            url: urlData.publicUrl,
            storage_path: path,
            name: file.name,
            date: meta.taken_at,
            label: ''
          });
        } catch (e) {
          console.warn('Supabase upload failed, falling back to local:', e);
          Photos._uploadLocal(file, recordType, recordId);
        }
      } else {
        Photos._uploadLocal(file, recordType, recordId);
      }
    }

    UI.toast(files.length + ' photo(s) uploaded!');
    // Refresh the page to show new photos
    if (typeof loadPage === 'function') {
      var currentPage = document.querySelector('.nav-item.active');
      if (currentPage) currentPage.click();
    }
  },

  // Pull all photo metadata for this tenant into local cache (call on app boot)
  syncFromCloud: async function() {
    if (!SupabaseDB || !SupabaseDB.ready) return;
    try {
      var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
      var q = SupabaseDB.client.from('photos').select('*').order('taken_at', { ascending: false });
      if (tid) q = q.eq('tenant_id', tid);
      var { data, error } = await q;
      if (error) { console.warn('Photos.syncFromCloud:', error.message); return; }
      if (!data) return;

      // Group by record_type + record_id and write to bm-photos-* keys
      var groups = {};
      data.forEach(function(row) {
        var key = 'bm-photos-' + row.record_type + '-' + row.record_id;
        if (!groups[key]) groups[key] = [];
        groups[key].push({
          id: row.id,
          url: row.url,
          storage_path: row.storage_path,
          name: row.name,
          label: row.label || '',
          date: row.taken_at || row.created_at,
          gps_lat: row.gps_lat || null,
          gps_lng: row.gps_lng || null,
          tags: Array.isArray(row.tags) ? row.tags : (row.label ? row.label.split(',').map(function(s){return s.trim();}).filter(Boolean) : [])
        });
      });
      Object.keys(groups).forEach(function(k) {
        localStorage.setItem(k, JSON.stringify(groups[k]));
      });
      if (typeof SupabaseDB !== 'undefined' && SupabaseDB._debug) console.debug('Photos.syncFromCloud: cached ' + data.length + ' photos across ' + Object.keys(groups).length + ' records');
    } catch (e) {
      console.warn('Photos.syncFromCloud failed:', e);
    }
  },

  _uploadLocal: async function(file, recordType, recordId) {
    // Stamp with Branch Cam watermark even in local-only mode
    var gps = await Photos._getGps();
    var stamped = await Photos._stampImage(file, gps);
    var reader = new FileReader();
    reader.onload = function(e) {
      var dataUrl = e.target.result;
      Photos._savePhoto(recordType, recordId, {
        url: dataUrl,
        name: file.name,
        date: new Date().toISOString(),
        label: '',
        gps_lat: gps ? gps.lat : null,
        gps_lng: gps ? gps.lng : null
      });
      // If we have Supabase but it failed (offline), queue for later flush
      if (SupabaseDB && SupabaseDB.ready && !navigator.onLine) {
        Photos._enqueue(recordType, recordId, dataUrl, file.name, gps);
      }
    };
    reader.readAsDataURL(stamped);
  },

  _savePhoto: function(recordType, recordId, photo) {
    var key = 'bm-photos-' + recordType + '-' + recordId;
    var photos = [];
    try { photos = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
    photo.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    photos.push(photo);
    localStorage.setItem(key, JSON.stringify(photos));
  },

  getPhotos: function(recordType, recordId) {
    var key = 'bm-photos-' + recordType + '-' + recordId;
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch(e) { return []; }
  },

  // Back-compat alias — schedule.js + others call Photos.getAll(type, id)
  getAll: function(recordType, recordId) {
    return Photos.getPhotos(recordType, recordId);
  },

  // Standard tags for tree-service work
  STANDARD_TAGS: ['Before', 'After', 'Hazard', 'Damage', 'Equipment', 'Permit', 'Receipt', 'Crew', 'Property'],

  viewFull: function(recordType, recordId, index) {
    var photos = Photos.getPhotos(recordType, recordId);
    if (!photos[index]) return;
    var p = photos[index];
    var tags = Photos._getTags(p);

    var overlay = document.createElement('div');
    overlay.id = 'photo-viewer';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:16px;overflow-y:auto;';

    var img = document.createElement('img');
    img.src = p.url;
    img.style.cssText = 'max-width:90vw;max-height:65vh;border-radius:8px;object-fit:contain;';
    overlay.appendChild(img);

    var caption = document.createElement('div');
    caption.style.cssText = 'color:#fff;margin-top:10px;font-size:13px;text-align:center;';
    var capParts = [];
    if (p.date) capParts.push(UI.dateShort(p.date));
    if (p.gps_lat) capParts.push('📍 ' + p.gps_lat.toFixed(4) + ', ' + p.gps_lng.toFixed(4));
    caption.textContent = capParts.join('  ·  ');
    overlay.appendChild(caption);

    // Tag chip picker
    var tagWrap = document.createElement('div');
    tagWrap.style.cssText = 'margin-top:14px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:90vw;';
    Photos.STANDARD_TAGS.forEach(function(t) {
      var on = tags.indexOf(t) !== -1;
      var chip = document.createElement('button');
      chip.textContent = t;
      chip.style.cssText = 'background:' + (on ? '#2e7d32' : 'rgba(255,255,255,0.15)') + ';color:#fff;border:1px solid ' + (on ? '#2e7d32' : 'rgba(255,255,255,0.3)') + ';padding:6px 12px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;';
      chip.onclick = function() { Photos._toggleTag(recordType, recordId, index, t); };
      tagWrap.appendChild(chip);
    });
    overlay.appendChild(tagWrap);

    // Build buttons with addEventListener (no string interpolation — avoids XSS
    // if recordType/recordId ever contain quotes/special chars).
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;justify-content:center;';
    function mkBtn(label, bg, color, onTap) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'background:' + bg + ';color:' + color + ';border:none;padding:8px 14px;border-radius:6px;font-size:13px;cursor:pointer;';
      b.addEventListener('click', onTap);
      return b;
    }
    btnRow.appendChild(mkBtn('+ Tag', '#fff', '#333', function() { Photos._customTag(recordType, recordId, index); }));
    btnRow.appendChild(mkBtn('✎ Annotate', '#fff', '#333', function() { var v = document.getElementById('photo-viewer'); if (v) v.remove(); Photos.annotate(recordType, recordId, index); }));
    btnRow.appendChild(mkBtn('Delete', '#c0392b', '#fff', function() { Photos._deletePhoto(recordType, recordId, index); }));
    btnRow.appendChild(mkBtn('Close', '#555', '#fff', function() { var v = document.getElementById('photo-viewer'); if (v) v.remove(); }));
    overlay.appendChild(btnRow);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  },

  _getTags: function(p) {
    if (Array.isArray(p.tags)) return p.tags;
    if (p.label) return p.label.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    return [];
  },

  _saveTags: function(recordType, recordId, index, tags) {
    var key = 'bm-photos-' + recordType + '-' + recordId;
    var photos = [];
    try { photos = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
    if (!photos[index]) return null;
    photos[index].tags = tags;
    photos[index].label = tags.join(', '); // mirror for legacy compat
    localStorage.setItem(key, JSON.stringify(photos));
    if (photos[index].id && SupabaseDB && SupabaseDB.ready) {
      SupabaseDB.client.from('photos').update({ tags: tags, label: tags.join(', ') }).eq('id', photos[index].id).then(function(res) {
        if (res.error) console.warn('Photos tags sync failed:', res.error.message);
      });
    }
    return photos[index];
  },

  _toggleTag: function(recordType, recordId, index, tag) {
    var photos = Photos.getPhotos(recordType, recordId);
    if (!photos[index]) return;
    var tags = Photos._getTags(photos[index]);
    var i = tags.indexOf(tag);
    if (i === -1) tags.push(tag); else tags.splice(i, 1);
    Photos._saveTags(recordType, recordId, index, tags);
    document.getElementById('photo-viewer').remove();
    Photos.viewFull(recordType, recordId, index);
  },

  _customTag: function(recordType, recordId, index) {
    // iOS-friendly modal replacement for prompt() (Apr 29, 2026 — fix iPhone photo tagging).
    var html = '<div class="form-group">'
      + '<label for="bm-photo-customtag-input">Custom tag:</label>'
      + '<input type="text" id="bm-photo-customtag-input" autocomplete="off" autocapitalize="words" placeholder="e.g. Damage, Tree #4, Leans">'
      + '</div>';
    var footer = '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
      + ' <button class="btn btn-primary" id="bm-photo-customtag-save">Save tag</button>';
    UI.showModal('Custom tag', html, { keepModal: true, footer: footer });
    setTimeout(function() {
      var input = document.getElementById('bm-photo-customtag-input');
      var btn = document.getElementById('bm-photo-customtag-save');
      if (input) input.focus();
      var save = function() {
        if (!input) return;
        var t = (input.value || '').trim();
        if (!t) return;
        UI.closeModal();
        var photos = Photos.getPhotos(recordType, recordId);
        if (!photos[index]) return;
        var tags = Photos._getTags(photos[index]);
        if (tags.indexOf(t) === -1) tags.push(t);
        Photos._saveTags(recordType, recordId, index, tags);
        var viewer = document.getElementById('photo-viewer');
        if (viewer) viewer.remove();
        Photos.viewFull(recordType, recordId, index);
      };
      if (btn) btn.onclick = save;
      if (input) input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    }, 50);
  },

  // ============ BRANCH CAM LIBRARY ============
  // All-photos browser with tag filter + search by client/job
  openLibrary: function() {
    var container = document.getElementById('page-content');
    if (!container) return;

    // Aggregate every photo from every bm-photos-* key
    var all = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || k.indexOf('bm-photos-') !== 0) continue;
      var parts = k.replace('bm-photos-', '').split('-');
      var recordType = parts.shift();
      var recordId = parts.join('-');
      var arr = [];
      try { arr = JSON.parse(localStorage.getItem(k)) || []; } catch(e) { continue; }
      arr.forEach(function(p, idx) {
        all.push({
          recordType: recordType,
          recordId: recordId,
          index: idx,
          url: p.url,
          date: p.date,
          tags: Photos._getTags(p),
          gps_lat: p.gps_lat,
          gps_lng: p.gps_lng
        });
      });
    }
    // Sort newest first
    all.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });

    // Build tag tally
    var tagCounts = {};
    all.forEach(function(ph) { ph.tags.forEach(function(t) { tagCounts[t] = (tagCounts[t] || 0) + 1; }); });
    var allTags = Object.keys(tagCounts).sort(function(a, b) { return tagCounts[b] - tagCounts[a]; });

    var activeTag = Photos._libFilter || '';
    var activeQuery = Photos._libQuery || '';

    // Filter
    var clientLookup = {};
    if (typeof DB !== 'undefined' && DB.clients) {
      DB.clients.list().forEach(function(c) { clientLookup[c.id] = c.name || ''; });
    }
    var filtered = all.filter(function(ph) {
      if (activeTag && ph.tags.indexOf(activeTag) === -1) return false;
      if (activeQuery) {
        var q = activeQuery.toLowerCase();
        var hay = (ph.recordType + ' ' + ph.recordId + ' ' + (clientLookup[ph.recordId] || '') + ' ' + ph.tags.join(' ')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    var html = '<div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">'
      + '<div><h1>📸 Branch Cam Library</h1>'
      + '<p style="color:var(--text-light);font-size:13px;">' + all.length + ' total photos · ' + filtered.length + ' shown</p></div>'
      + '<button class="btn btn-primary" onclick="Photos.newJobHere()" style="font-size:13px;">📍 New job at this location</button>'
      + '</div>';

    // Search box
    html += '<div style="background:var(--white);padding:14px 16px;border-radius:12px;margin-bottom:14px;border:1px solid var(--border);">'
      + '<input id="branchcam-search" type="text" placeholder="Search by client, job ID, tag…" value="' + activeQuery.replace(/"/g, '&quot;') + '" '
      +   'oninput="Photos._libQuery=this.value; clearTimeout(window._lqT); window._lqT=setTimeout(function(){Photos.openLibrary();},250);" '
      +   'style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;">'
      + '</div>';

    // Tag chips
    if (allTags.length) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">';
      // Use data-tag attribute + delegated click — no string-interpolated onclicks (safe vs apostrophes/scripts in tag names)
      function escAttr(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
      html += '<button data-libtag="" style="background:' + (!activeTag ? '#2e7d32' : 'var(--white)') + ';color:' + (!activeTag ? '#fff' : 'var(--text)') + ';border:1px solid ' + (!activeTag ? '#2e7d32' : 'var(--border)') + ';padding:6px 12px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;">All (' + all.length + ')</button>';
      allTags.forEach(function(t) {
        var on = activeTag === t;
        html += '<button data-libtag="' + escAttr(t) + '" style="background:' + (on ? '#2e7d32' : 'var(--white)') + ';color:' + (on ? '#fff' : 'var(--text)') + ';border:1px solid ' + (on ? '#2e7d32' : 'var(--border)') + ';padding:6px 12px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;">' + escAttr(t) + ' (' + tagCounts[t] + ')</button>';
      });
      html += '</div>';
    }

    // Grid
    if (!filtered.length) {
      html += '<div style="text-align:center;padding:40px;color:var(--text-light);">No photos match.</div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">';
      filtered.forEach(function(ph) {
        var subtitle = clientLookup[ph.recordId] || (ph.recordType + ':' + ph.recordId.substring(0,6));
        html += '<div style="position:relative;border-radius:8px;overflow:hidden;aspect-ratio:1;cursor:pointer;background:#000;" '
          + 'onclick="Photos.viewFull(\'' + ph.recordType + '\', \'' + ph.recordId + '\', ' + ph.index + ')">'
          + '<img src="' + ph.url + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;">'
          + '<div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,0.75));padding:6px 8px;color:#fff;font-size:10px;">'
          + '<div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + subtitle + '</div>'
          + '<div style="opacity:0.8;">' + (ph.date ? UI.dateShort(ph.date) : '') + '</div>'
          + '</div></div>';
      });
      html += '</div>';
    }

    container.innerHTML = html;
    // Wire tag-filter buttons (delegated, no inline onclicks)
    container.querySelectorAll('[data-libtag]').forEach(function(b) {
      b.addEventListener('click', function() {
        Photos._libFilter = b.getAttribute('data-libtag') || '';
        Photos.openLibrary();
      });
    });
  },

  _deletePhoto: function(recordType, recordId, index) {
    if (!confirm('Delete this photo?')) return;
    var key = 'bm-photos-' + recordType + '-' + recordId;
    var photos = [];
    try { photos = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
    var removed = photos.splice(index, 1)[0];
    localStorage.setItem(key, JSON.stringify(photos));
    // Sync delete to cloud (storage object + metadata row)
    if (removed && SupabaseDB && SupabaseDB.ready) {
      if (removed.storage_path) {
        SupabaseDB.client.storage.from(Photos.BUCKET).remove([removed.storage_path]).then(function(res) {
          if (res.error) console.warn('Photo storage delete failed:', res.error.message);
        });
      }
      if (removed.id) {
        SupabaseDB.client.from('photos').delete().eq('id', removed.id).then(function(res) {
          if (res.error) console.warn('Photo meta delete failed:', res.error.message);
        });
      }
    }
    document.getElementById('photo-viewer').remove();
    UI.toast('Photo deleted');
  },

  // ============ ONE-TAP NEW JOB AT GPS ============
  newJobHere: async function() {
    UI.toast('Getting your location...');
    var gps = await Photos._getGps();
    if (!gps) { UI.toast('Location unavailable', 'error'); return; }

    // Reverse geocode via OpenStreetMap Nominatim (free, no key)
    var address = gps.lat.toFixed(5) + ', ' + gps.lng.toFixed(5);
    try {
      var resp = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + gps.lat + '&lon=' + gps.lng);
      var j = await resp.json();
      if (j && j.display_name) address = j.display_name;
    } catch (e) {}

    // Suggest nearest existing client by name match in address (no lat/lng on clients yet)
    var clients = (typeof DB !== 'undefined' && DB.clients) ? DB.clients.list() : [];
    var matches = clients.filter(function(c) {
      if (!c.address) return false;
      // crude match: shared street name token
      var addrTokens = address.toLowerCase().split(/[\s,]+/);
      var cTokens = c.address.toLowerCase().split(/[\s,]+/);
      return cTokens.some(function(t) { return t.length > 4 && addrTokens.indexOf(t) !== -1; });
    });

    var clientId = '';
    if (matches.length === 1) {
      if (confirm('Looks like ' + matches[0].name + '\'s property:\n' + matches[0].address + '\n\nUse this client?')) clientId = matches[0].id;
    } else if (matches.length > 1) {
      // iOS-friendly tappable list modal (Apr 29, 2026 — replaces multi-line prompt that
      // only showed the first line on iPhone, blocking client selection).
      // Cap to most recent 50 to keep the list manageable.
      var listMatches = matches.slice(0, 50);
      clientId = await new Promise(function(resolve) {
        var rows = listMatches.map(function(c, i) {
          return '<button type="button" class="btn btn-outline bm-photo-client-pick" data-cid="' + UI.esc(c.id) + '" '
            + 'style="display:block;width:100%;text-align:left;margin-bottom:8px;padding:12px;">'
            + '<div style="font-weight:600;">' + UI.esc(c.name) + '</div>'
            + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">' + UI.esc(c.address || '') + '</div>'
            + '</button>';
        }).join('');
        var html = '<p style="font-size:14px;margin-bottom:12px;">Multiple clients near this address. Pick one:</p>' + rows;
        var footer = '<button class="btn btn-outline" id="bm-photo-pick-cancel">None — create new</button>';
        UI.showModal('Pick a client', html, { keepModal: true, footer: footer });
        setTimeout(function() {
          document.querySelectorAll('.bm-photo-client-pick').forEach(function(b) {
            b.onclick = function() {
              var cid = b.getAttribute('data-cid');
              UI.closeModal();
              resolve(cid || '');
            };
          });
          var cancel = document.getElementById('bm-photo-pick-cancel');
          if (cancel) cancel.onclick = function() { UI.closeModal(); resolve(''); };
        }, 50);
      });
    }

    if (!clientId) {
      // iOS-friendly modal replacement for prompt() (Apr 29, 2026).
      var name = await new Promise(function(resolve) {
        var html = '<div class="form-group">'
          + '<label for="bm-photo-newclient-input">New client name:</label>'
          + '<input type="text" id="bm-photo-newclient-input" autocomplete="off" autocapitalize="words" placeholder="e.g. Smith Family">'
          + '</div>';
        var footer = '<button class="btn btn-outline" id="bm-photo-newclient-cancel">Cancel</button>'
          + ' <button class="btn btn-primary" id="bm-photo-newclient-save">Save</button>';
        UI.showModal('New client', html, { keepModal: true, footer: footer });
        setTimeout(function() {
          var input = document.getElementById('bm-photo-newclient-input');
          var saveBtn = document.getElementById('bm-photo-newclient-save');
          var cancelBtn = document.getElementById('bm-photo-newclient-cancel');
          if (input) input.focus();
          var save = function() {
            if (!input) return;
            var v = (input.value || '').trim();
            UI.closeModal();
            resolve(v);
          };
          if (saveBtn) saveBtn.onclick = save;
          if (cancelBtn) cancelBtn.onclick = function() { UI.closeModal(); resolve(''); };
          if (input) input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); save(); } });
        }, 50);
      });
      if (!name) return;
      var newClient = DB.clients.create({ name: name, address: address, lat: gps.lat, lng: gps.lng });
      clientId = newClient.id;
    }

    // Create request
    var req = DB.requests.create({
      clientId: clientId,
      title: 'New job at ' + address.split(',').slice(0, 2).join(','),
      description: 'GPS-pinned by Branch Cam: ' + gps.lat.toFixed(5) + ', ' + gps.lng.toFixed(5),
      address: address,
      lat: gps.lat,
      lng: gps.lng,
      status: 'new',
      source: 'branchcam-gps',
      createdAt: new Date().toISOString()
    });
    UI.toast('Request created ✓');
    if (typeof loadPage === 'function') loadPage('requests');
  },

  // ============ PROJECT DIARY (chronological grouped by day) ============
  renderDiary: function(recordType, recordId) {
    var photos = Photos.getPhotos(recordType, recordId);
    if (!photos.length) return '';

    // Group by day (YYYY-MM-DD)
    var groups = {};
    photos.forEach(function(p, i) {
      var key = p.date ? p.date.substring(0, 10) : 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push({ p: p, idx: i });
    });
    var days = Object.keys(groups).sort();
    if (days.length < 2) return ''; // diary only useful with multiple days

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin:0;">📖 Project Diary</h4>'
      + '<span style="font-size:11px;color:var(--text-light);">' + days.length + ' days · ' + photos.length + ' photos</span>'
      + '</div>';

    days.forEach(function(day, di) {
      var entries = groups[day];
      var dateLabel = day === 'unknown' ? 'Undated' : new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      var dayTags = {};
      entries.forEach(function(e) { Photos._getTags(e.p).forEach(function(t) { dayTags[t] = (dayTags[t] || 0) + 1; }); });

      html += '<div style="position:relative;padding-left:22px;padding-bottom:' + (di === days.length - 1 ? '0' : '16px') + ';' + (di === days.length - 1 ? '' : 'border-left:2px solid var(--border);margin-left:5px;') + '">'
        + '<div style="position:absolute;left:-6px;top:2px;width:12px;height:12px;border-radius:50%;background:#2e7d32;border:3px solid var(--white);"></div>'
        + '<div style="margin-bottom:6px;font-size:13px;font-weight:700;color:var(--text);">' + dateLabel + ' <span style="font-weight:500;color:var(--text-light);font-size:11px;">· ' + entries.length + ' shot' + (entries.length === 1 ? '' : 's') + '</span></div>';

      // Tag chips for the day
      if (Object.keys(dayTags).length) {
        html += '<div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;">';
        Object.keys(dayTags).forEach(function(t) {
          html += '<span style="background:#e8f5e9;color:#1a3c12;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:600;">' + t + '</span>';
        });
        html += '</div>';
      }

      // Thumbnails
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:4px;">';
      entries.forEach(function(e) {
        html += '<div onclick="Photos.viewFull(\'' + recordType + '\', \'' + recordId + '\', ' + e.idx + ')" '
          + 'style="aspect-ratio:1;background-image:url(\'' + e.p.url + '\');background-size:cover;background-position:center;border-radius:6px;cursor:pointer;"></div>';
      });
      html += '</div></div>';
    });

    html += '</div>';
    return html;
  },

  // ============ BEFORE/AFTER SLIDER SHARE ============
  shareSlider: function(recordType, recordId) {
    var url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'share-slider.html?type=' + encodeURIComponent(recordType) + '&id=' + encodeURIComponent(recordId);
    if (navigator.share) {
      navigator.share({ title: 'Before & After', text: 'See the transformation', url: url }).catch(function(){});
    } else {
      navigator.clipboard.writeText(url).then(function() { UI.toast('Slider link copied!'); }, function() { prompt('Copy this link:', url); });
    }
    return url;
  },

  // ============ SHARE LINK ============
  shareGallery: function(recordType, recordId) {
    var url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'share-photos.html?type=' + encodeURIComponent(recordType) + '&id=' + encodeURIComponent(recordId);
    var msg = 'Photos from your project: ' + url;
    if (navigator.share) {
      navigator.share({ title: 'Project Photos', text: 'Photos from your project', url: url }).catch(function(){});
    } else {
      navigator.clipboard.writeText(url).then(function() { UI.toast('Share link copied!'); }, function() { prompt('Copy this link:', url); });
    }
    return url;
  },

  // ============ PHOTO REPORT PDF ============
  generateReport: function(recordType, recordId, title) {
    var photos = Photos.getPhotos(recordType, recordId);
    if (!photos.length) { UI.toast('No photos to include', 'error'); return; }
    // v756: prefer CompanyInfo (tenant-aware) over BM_CONFIG (SNT defaults).
    var brand = (typeof CompanyInfo !== 'undefined' && CompanyInfo.get('name'))
      || (typeof BM_CONFIG !== 'undefined' && BM_CONFIG.companyName)
      || 'Branch Manager';
    var w = window.open('', '_blank');
    var body = '<html><head><title>Photo Report — ' + (title || recordId) + '</title><style>'
      + 'body{font-family:-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:30px;color:#333;}'
      + 'h1{color:#1a3c12;border-bottom:3px solid #1a3c12;padding-bottom:10px;}'
      + '.meta{color:#777;font-size:13px;margin-bottom:20px;}'
      + '.photo{margin:20px 0;page-break-inside:avoid;}'
      + '.photo img{width:100%;border-radius:8px;}'
      + '.photo-meta{background:#f5f5f5;padding:10px 14px;border-radius:0 0 8px 8px;font-size:12px;}'
      + '.tag{display:inline-block;background:#2e7d32;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;margin-right:4px;}'
      + '@media print{.no-print{display:none;}}'
      + '</style></head><body>'
      + '<button class="no-print" onclick="window.print()" style="float:right;background:#1a3c12;color:#fff;border:none;padding:10px 18px;border-radius:6px;cursor:pointer;">🖨 Print / Save PDF</button>'
      + '<h1>📸 Photo Report</h1>'
      + '<div class="meta"><strong>' + brand + '</strong> · ' + (title || recordType + ' ' + recordId) + ' · ' + photos.length + ' photos · Generated ' + new Date().toLocaleDateString() + '</div>';
    photos.forEach(function(p, i) {
      var tags = Photos._getTags(p);
      body += '<div class="photo"><img src="' + p.url + '">'
        + '<div class="photo-meta">'
        + tags.map(function(t){return '<span class="tag">'+t+'</span>';}).join('')
        + ' #' + (i+1) + ' · ' + (p.date ? new Date(p.date).toLocaleString() : '')
        + (p.gps_lat ? ' · 📍 ' + p.gps_lat.toFixed(4) + ', ' + p.gps_lng.toFixed(4) : '')
        + '</div></div>';
    });
    body += '</body></html>';
    w.document.write(body); w.document.close();
  },

  // ============ ANNOTATION ============
  annotate: function(recordType, recordId, index) {
    var photos = Photos.getPhotos(recordType, recordId);
    if (!photos[index]) return;
    var p = photos[index];

    var overlay = document.createElement('div');
    overlay.id = 'photo-annotator';
    overlay.style.cssText = 'position:fixed;inset:0;background:#000;z-index:10000;display:flex;flex-direction:column;';
    overlay.innerHTML = '<div style="background:#1a1a1a;color:#fff;padding:10px 14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
      + '<button id="ann-undo" style="background:#333;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">↶ Undo</button>'
      + '<button id="ann-clear" style="background:#333;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">Clear</button>'
      + '<input id="ann-color" type="color" value="#ff3b30" style="width:36px;height:32px;border:none;border-radius:6px;cursor:pointer;">'
      + '<button data-tool="pen" class="ann-tool" style="background:#2e7d32;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">✎ Draw</button>'
      + '<button data-tool="arrow" class="ann-tool" style="background:#333;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">→ Arrow</button>'
      + '<button data-tool="circle" class="ann-tool" style="background:#333;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">◯ Circle</button>'
      + '<button data-tool="text" class="ann-tool" style="background:#333;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">T Text</button>'
      + '<div style="flex:1;"></div>'
      + '<button id="ann-save" style="background:#2e7d32;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">Save</button>'
      + '<button id="ann-cancel" style="background:#c0392b;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">Cancel</button>'
      + '</div>'
      + '<div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:auto;"><canvas id="ann-canvas" style="max-width:100%;max-height:100%;cursor:crosshair;background:#000;"></canvas></div>';
    document.body.appendChild(overlay);

    var canvas = document.getElementById('ann-canvas');
    var ctx = canvas.getContext('2d');
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      Photos._annHistory = [canvas.toDataURL()];
    };
    img.src = p.url;

    var tool = 'pen';
    var drawing = false, startX = 0, startY = 0, snapshot = null;

    document.querySelectorAll('.ann-tool').forEach(function(b) {
      b.onclick = function() {
        tool = b.dataset.tool;
        document.querySelectorAll('.ann-tool').forEach(function(x){ x.style.background = '#333'; });
        b.style.background = '#2e7d32';
      };
    });

    function pos(e) {
      var rect = canvas.getBoundingClientRect();
      var sx = canvas.width / rect.width, sy = canvas.height / rect.height;
      var t = e.touches ? e.touches[0] : e;
      return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy };
    }

    function start(e) {
      e.preventDefault();
      drawing = true;
      var pt = pos(e); startX = pt.x; startY = pt.y;
      ctx.strokeStyle = document.getElementById('ann-color').value;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = Math.max(3, canvas.width / 200);
      ctx.lineCap = 'round';
      if (tool === 'text') {
        // iOS-friendly modal replacement for prompt() (Apr 29, 2026).
        // Reset drawing state immediately; the modal callback paints the text on Save.
        drawing = false;
        var anchorX = pt.x, anchorY = pt.y;
        var html = '<div class="form-group">'
          + '<label for="bm-photo-anntext-input">Text annotation:</label>'
          + '<input type="text" id="bm-photo-anntext-input" autocomplete="off" placeholder="Type and tap Add">'
          + '</div>';
        var footer = '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
          + ' <button class="btn btn-primary" id="bm-photo-anntext-save">Add</button>';
        UI.showModal('Add text', html, { keepModal: true, footer: footer });
        setTimeout(function() {
          var input = document.getElementById('bm-photo-anntext-input');
          var btn = document.getElementById('bm-photo-anntext-save');
          if (input) input.focus();
          var save = function() {
            if (!input) return;
            var txt = (input.value || '').trim();
            UI.closeModal();
            if (!txt) return;
            ctx.font = 'bold ' + Math.max(20, canvas.width / 30) + 'px sans-serif';
            ctx.fillText(txt, anchorX, anchorY);
            Photos._annHistory.push(canvas.toDataURL());
          };
          if (btn) btn.onclick = save;
          if (input) input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); save(); } });
        }, 50);
        return;
      }
      if (tool === 'pen') { ctx.beginPath(); ctx.moveTo(pt.x, pt.y); }
      else snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
    function move(e) {
      if (!drawing) return; e.preventDefault();
      var pt = pos(e);
      if (tool === 'pen') { ctx.lineTo(pt.x, pt.y); ctx.stroke(); }
      else if (tool === 'arrow') {
        ctx.putImageData(snapshot, 0, 0);
        ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(pt.x, pt.y); ctx.stroke();
        var ang = Math.atan2(pt.y - startY, pt.x - startX);
        var ah = Math.max(15, canvas.width / 60);
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x - ah * Math.cos(ang - Math.PI/6), pt.y - ah * Math.sin(ang - Math.PI/6));
        ctx.lineTo(pt.x - ah * Math.cos(ang + Math.PI/6), pt.y - ah * Math.sin(ang + Math.PI/6));
        ctx.closePath(); ctx.fill();
      } else if (tool === 'circle') {
        ctx.putImageData(snapshot, 0, 0);
        var rx = Math.abs(pt.x - startX), ry = Math.abs(pt.y - startY);
        ctx.beginPath();
        ctx.ellipse((startX+pt.x)/2, (startY+pt.y)/2, rx/2, ry/2, 0, 0, Math.PI*2);
        ctx.stroke();
      }
    }
    function end() { if (drawing) { drawing = false; Photos._annHistory.push(canvas.toDataURL()); } }
    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move); canvas.addEventListener('mouseup', end); canvas.addEventListener('mouseleave', end);
    canvas.addEventListener('touchstart', start); canvas.addEventListener('touchmove', move); canvas.addEventListener('touchend', end);

    document.getElementById('ann-undo').onclick = function() {
      if (Photos._annHistory.length > 1) { Photos._annHistory.pop(); var i2 = new Image(); i2.onload = function(){ ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(i2,0,0); }; i2.src = Photos._annHistory[Photos._annHistory.length-1]; }
    };
    document.getElementById('ann-clear').onclick = function() {
      ctx.drawImage(img, 0, 0); Photos._annHistory = [canvas.toDataURL()];
    };
    document.getElementById('ann-cancel').onclick = function() { overlay.remove(); };
    document.getElementById('ann-save').onclick = async function() {
      UI.toast('Saving annotated photo...');
      canvas.toBlob(async function(blob) {
        try {
          if (SupabaseDB && SupabaseDB.ready) {
            var path = recordType + '/' + recordId + '/annotated_' + Date.now() + '.jpg';
            var up = await SupabaseDB.client.storage.from(Photos.BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
            if (up.error) throw up.error;
            var pub = SupabaseDB.client.storage.from(Photos.BUCKET).getPublicUrl(path);
            var meta = { record_type: recordType, record_id: recordId, url: pub.data.publicUrl, storage_path: path, name: 'annotated.jpg', label: 'Annotated', tags: ['Annotated'].concat(Photos._getTags(p)), taken_at: new Date().toISOString() };
            var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
            if (tid) meta.tenant_id = tid;
            if (p.gps_lat) { meta.gps_lat = p.gps_lat; meta.gps_lng = p.gps_lng; }
            var ins = await SupabaseDB.client.from('photos').insert(meta).select().single();
            Photos._savePhoto(recordType, recordId, { id: ins.data && ins.data.id, url: pub.data.publicUrl, storage_path: path, name: 'annotated.jpg', label: 'Annotated', tags: meta.tags, date: meta.taken_at, gps_lat: meta.gps_lat, gps_lng: meta.gps_lng });
          } else {
            var reader = new FileReader();
            reader.onload = function(e) {
              Photos._savePhoto(recordType, recordId, { url: e.target.result, name: 'annotated.jpg', label: 'Annotated', tags: ['Annotated'], date: new Date().toISOString() });
            };
            reader.readAsDataURL(blob);
          }
          overlay.remove();
          UI.toast('Annotated photo saved ✓');
          if (typeof loadPage === 'function') { var c = document.querySelector('.nav-item.active'); if (c) c.click(); }
        } catch (e) { UI.toast('Save failed: ' + e.message, 'error'); console.warn(e); }
      }, 'image/jpeg', 0.9);
    };
  },

  // ============ OFFLINE QUEUE ============
  // If upload fails (offline), file is stashed in IndexedDB-style localStorage queue
  // and flushed when online comes back
  _queueKey: 'bm-photo-upload-queue',
  _enqueue: function(recordType, recordId, dataUrl, name, gps) {
    var q = [];
    try { q = JSON.parse(localStorage.getItem(Photos._queueKey)) || []; } catch(e) {}
    q.push({ recordType: recordType, recordId: recordId, dataUrl: dataUrl, name: name, gps: gps, queuedAt: Date.now() });
    try { localStorage.setItem(Photos._queueKey, JSON.stringify(q)); } catch(e) { console.warn('Queue full:', e); }
  },
  flushQueue: async function() {
    if (!navigator.onLine || !SupabaseDB || !SupabaseDB.ready) return;
    var q = [];
    try { q = JSON.parse(localStorage.getItem(Photos._queueKey)) || []; } catch(e) { return; }
    if (!q.length) return;
    UI.toast('Uploading ' + q.length + ' queued photos...');
    var remaining = [];
    for (var i = 0; i < q.length; i++) {
      var item = q[i];
      try {
        var blob = await (await fetch(item.dataUrl)).blob();
        var path = item.recordType + '/' + item.recordId + '/' + Date.now() + '_q.jpg';
        var up = await SupabaseDB.client.storage.from(Photos.BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
        if (up.error) throw up.error;
        var pub = SupabaseDB.client.storage.from(Photos.BUCKET).getPublicUrl(path);
        var meta = { record_type: item.recordType, record_id: item.recordId, url: pub.data.publicUrl, storage_path: path, name: item.name, taken_at: new Date(item.queuedAt).toISOString() };
        var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
        if (tid) meta.tenant_id = tid;
        if (item.gps) { meta.gps_lat = item.gps.lat; meta.gps_lng = item.gps.lng; }
        await SupabaseDB.client.from('photos').insert(meta);
      } catch (e) {
        console.warn('Flush failed for queued item:', e);
        remaining.push(item);
      }
    }
    localStorage.setItem(Photos._queueKey, JSON.stringify(remaining));
    UI.toast(remaining.length ? 'Uploaded ' + (q.length - remaining.length) + ', ' + remaining.length + ' still queued' : 'All queued photos uploaded ✓');
  }
};

// Auto-flush when network returns
if (typeof window !== 'undefined') {
  window.addEventListener('online', function() { if (typeof Photos !== 'undefined') Photos.flushQueue(); });
}
