/**
 * Branch Manager — Before/After Photo Comparison
 * Capture dramatic before/after transformations for jobs.
 * Interactive slider comparison, gallery, social sharing.
 * Something the industry doesn't have.
 */
var BeforeAfter = {

  _storageKey: 'bm-beforeafter',

  _co: function() {
    return {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      website: CompanyInfo.get('website')
    };
  },

  // ── Data Access ──

  getAll: function() {
    var stored = localStorage.getItem(BeforeAfter._storageKey);
    return stored ? JSON.parse(stored) : [];
  },

  _save: function(pairs) {
    localStorage.setItem(BeforeAfter._storageKey, JSON.stringify(pairs));
  },

  getById: function(id) {
    var pairs = BeforeAfter.getAll();
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i].id === id) return pairs[i];
    }
    return null;
  },

  getForJob: function(jobId) {
    return BeforeAfter.getAll().filter(function(p) { return p.jobId === jobId; });
  },

  _generateId: function() {
    return 'ba-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  },

  // ── Full Gallery Page ──

  render: function() {
    var pairs = BeforeAfter.getAll();
    var now = new Date();
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    var thisMonth = pairs.filter(function(p) { return p.createdAt >= monthStart; });

    // Find most documented client
    var clientCounts = {};
    pairs.forEach(function(p) {
      var name = p.clientName || 'Unknown';
      clientCounts[name] = (clientCounts[name] || 0) + 1;
    });
    var topClient = '';
    var topCount = 0;
    Object.keys(clientCounts).forEach(function(name) {
      if (clientCounts[name] > topCount) {
        topClient = name;
        topCount = clientCounts[name];
      }
    });

    var html = '<div class="stat-grid">'
      + UI.statCard('Total Pairs', pairs.length.toString(), 'Before/after photos', '', '')
      + UI.statCard('This Month', thisMonth.length.toString(), 'New comparisons', thisMonth.length > 0 ? 'up' : '', '')
      + UI.statCard('Top Client', topClient || 'None yet', topCount > 0 ? topCount + ' pairs' : '', '', '')
      + '</div>';

    // Filters
    html += '<div style="background:var(--white);border-radius:12px;padding:16px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">'
      + '<input type="text" id="ba-filter-client" placeholder="Filter by client..." oninput="BeforeAfter._applyFilters()" '
      + 'style="flex:1;min-width:160px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;">'
      + '<input type="date" id="ba-filter-from" onchange="BeforeAfter._applyFilters()" '
      + 'style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;">'
      + '<span style="font-size:13px;color:var(--text-light);">to</span>'
      + '<input type="date" id="ba-filter-to" onchange="BeforeAfter._applyFilters()" '
      + 'style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;">'
      + '<button onclick="BeforeAfter._clearFilters()" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:#fff;font-size:13px;cursor:pointer;">Clear</button>'
      + '</div></div>';

    // Add button
    html += '<div style="display:flex;justify-content:flex-end;margin-bottom:16px;">'
      + '<button onclick="BeforeAfter.addPair()" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;">+ Add Before/After</button>'
      + '</div>';

    // Gallery grid
    html += '<div id="ba-gallery">';
    html += BeforeAfter._renderGalleryGrid(pairs);
    html += '</div>';

    return html;
  },

  _renderGalleryGrid: function(pairs) {
    if (pairs.length === 0) {
      return '<div style="background:var(--white);border-radius:12px;padding:40px;text-align:center;border:1px solid var(--border);">'
        + '<div style="font-size:48px;margin-bottom:12px;">📸</div>'
        + '<h3 style="font-size:16px;margin-bottom:8px;">No Before/After Photos Yet</h3>'
        + '<p style="color:var(--text-light);font-size:14px;margin-bottom:16px;">Capture dramatic transformations to impress clients and win new business.</p>'
        + '<button onclick="BeforeAfter.addPair()" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;">Add Your First Pair</button>'
        + '</div>';
    }

    // Sort newest first
    var sorted = pairs.slice().sort(function(a, b) {
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">';
    sorted.forEach(function(pair) {
      var hasSlider = pair.beforeImg && pair.afterImg;
      html += '<div style="background:var(--white);border-radius:12px;border:1px solid var(--border);overflow:hidden;cursor:pointer;" onclick="BeforeAfter.showSlider(\'' + pair.id + '\')">';

      // Preview images
      if (hasSlider) {
        html += '<div style="position:relative;height:200px;overflow:hidden;">'
          + '<img src="' + pair.afterImg + '" style="width:100%;height:100%;object-fit:cover;">'
          + '<div style="position:absolute;top:0;left:0;width:50%;height:100%;overflow:hidden;">'
          + '<img src="' + pair.beforeImg + '" style="width:200%;height:100%;object-fit:cover;">'
          + '</div>'
          + '<div style="position:absolute;top:0;left:50%;width:2px;height:100%;background:#fff;"></div>'
          + '<span style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,.6);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">BEFORE</span>'
          + '<span style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.6);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">AFTER</span>'
          + '</div>';
      } else {
        var img = pair.beforeImg || pair.afterImg;
        html += '<div style="height:200px;overflow:hidden;background:#f5f5f5;display:flex;align-items:center;justify-content:center;">';
        if (img) {
          html += '<img src="' + img + '" style="width:100%;height:100%;object-fit:cover;">';
        } else {
          html += '<span style="color:var(--text-light);font-size:14px;">No photos yet</span>';
        }
        html += '</div>';
      }

      // Card info
      html += '<div style="padding:12px;">'
        + '<div style="font-weight:600;font-size:14px;margin-bottom:4px;">' + UI.esc(pair.clientName || 'Unknown Client') + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-bottom:6px;">' + UI.dateShort(pair.createdAt) + '</div>';
      if (pair.caption) {
        html += '<div style="font-size:13px;color:var(--text);line-height:1.4;">' + UI.esc(pair.caption) + '</div>';
      }
      if (pair.tags && pair.tags.length) {
        html += '<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">';
        pair.tags.forEach(function(tag) {
          html += '<span style="background:#e8f5e9;color:var(--green-dark);font-size:11px;padding:2px 8px;border-radius:10px;">' + UI.esc(tag) + '</span>';
        });
        html += '</div>';
      }
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  },

  _applyFilters: function() {
    var clientFilter = (document.getElementById('ba-filter-client') || {}).value || '';
    var fromDate = (document.getElementById('ba-filter-from') || {}).value || '';
    var toDate = (document.getElementById('ba-filter-to') || {}).value || '';
    var pairs = BeforeAfter.getAll();

    if (clientFilter) {
      var q = clientFilter.toLowerCase();
      pairs = pairs.filter(function(p) {
        return (p.clientName || '').toLowerCase().indexOf(q) !== -1;
      });
    }
    if (fromDate) {
      pairs = pairs.filter(function(p) {
        return (p.createdAt || '').slice(0, 10) >= fromDate;
      });
    }
    if (toDate) {
      pairs = pairs.filter(function(p) {
        return (p.createdAt || '').slice(0, 10) <= toDate;
      });
    }

    var gallery = document.getElementById('ba-gallery');
    if (gallery) gallery.innerHTML = BeforeAfter._renderGalleryGrid(pairs);
  },

  _clearFilters: function() {
    var el;
    el = document.getElementById('ba-filter-client'); if (el) el.value = '';
    el = document.getElementById('ba-filter-from'); if (el) el.value = '';
    el = document.getElementById('ba-filter-to'); if (el) el.value = '';
    BeforeAfter._applyFilters();
  },

  // ── Render For Job (embedded in job detail) ──

  renderForJob: function(jobId) {
    var pairs = BeforeAfter.getForJob(jobId);

    var html = '<div style="background:var(--white);border-radius:12px;padding:16px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<h4 style="font-size:15px;margin:0;">Before / After Photos</h4>'
      + '<button onclick="BeforeAfter.addPair(\'' + jobId + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;">+ Add Before/After</button>'
      + '</div>';

    if (pairs.length === 0) {
      html += '<div style="text-align:center;padding:20px;color:var(--text-light);">'
        + '<div style="font-size:32px;margin-bottom:8px;">📷</div>'
        + '<p style="font-size:13px;margin:0;">No before/after photos for this job yet.</p>'
        + '</div>';
    } else {
      pairs.forEach(function(pair) {
        var hasSlider = pair.beforeImg && pair.afterImg;
        html += '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:10px;">';

        // Mini slider preview
        if (hasSlider) {
          html += '<div style="position:relative;height:140px;overflow:hidden;cursor:pointer;" onclick="BeforeAfter.showSlider(\'' + pair.id + '\')">'
            + '<img src="' + pair.afterImg + '" style="width:100%;height:100%;object-fit:cover;">'
            + '<div style="position:absolute;top:0;left:0;width:50%;height:100%;overflow:hidden;">'
            + '<img src="' + pair.beforeImg + '" style="width:200%;height:100%;object-fit:cover;">'
            + '</div>'
            + '<div style="position:absolute;top:0;left:50%;width:2px;height:100%;background:#fff;"></div>'
            + '<span style="position:absolute;top:6px;left:6px;background:rgba(0,0,0,.6);color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">BEFORE</span>'
            + '<span style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,.6);color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">AFTER</span>'
            + '<div style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,.6);color:#fff;padding:2px 8px;border-radius:4px;font-size:10px;">Tap to compare</div>'
            + '</div>';
        } else {
          var img = pair.beforeImg || pair.afterImg;
          html += '<div style="height:140px;overflow:hidden;background:#f5f5f5;display:flex;align-items:center;justify-content:center;cursor:pointer;" onclick="BeforeAfter.showSlider(\'' + pair.id + '\')">';
          if (img) {
            html += '<img src="' + img + '" style="width:100%;height:100%;object-fit:cover;">';
            html += '<span style="position:absolute;top:6px;left:6px;background:rgba(0,0,0,.6);color:#fff;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">' + (pair.beforeImg ? 'BEFORE' : 'AFTER') + ' only</span>';
          } else {
            html += '<span style="color:var(--text-light);font-size:13px;">No photos added</span>';
          }
          html += '</div>';
        }

        // Caption row
        html += '<div style="padding:8px 10px;display:flex;justify-content:space-between;align-items:center;">'
          + '<div style="font-size:13px;color:var(--text);">' + UI.esc(pair.caption || 'No caption') + '</div>'
          + '<div style="display:flex;gap:6px;">'
          + '<button onclick="event.stopPropagation();BeforeAfter.editCaption(\'' + pair.id + '\')" style="background:none;border:1px solid var(--border);padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;">Edit</button>'
          + '<button onclick="event.stopPropagation();BeforeAfter.deletePair(\'' + pair.id + '\')" style="background:none;border:1px solid #ffcdd2;color:#c62828;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;">Delete</button>'
          + '</div></div>';

        html += '</div>';
      });
    }

    html += '</div>';
    return html;
  },

  // ── Add Pair Modal ──

  addPair: function(jobId) {
    var jobs = [];
    if (typeof DB !== 'undefined' && DB.jobs) {
      jobs = DB.jobs.getAll();
    }

    var html = '<div style="display:flex;flex-direction:column;gap:16px;">';

    // Job selector (only if not tied to a job)
    if (!jobId) {
      html += '<div>'
        + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Job</label>'
        + '<select id="ba-job-select" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;" onchange="BeforeAfter._onJobSelect()">'
        + '<option value="">Select a job...</option>';
      jobs.forEach(function(j) {
        html += '<option value="' + j.id + '">' + UI.esc((j.clientName || 'Unknown') + ' - ' + (j.title || j.service || 'Job')) + '</option>';
      });
      html += '</select></div>';
    }

    // Client name (auto-filled from job, or manual)
    html += '<div>'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Client Name</label>'
      + '<input type="text" id="ba-client-name" placeholder="Client name" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;">'
      + '</div>';

    // Before photo
    html += '<div>'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Before Photo</label>'
      + '<div id="ba-before-preview" style="display:none;margin-bottom:8px;position:relative;">'
      + '<img id="ba-before-img" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;">'
      + '<button onclick="BeforeAfter._clearPhoto(\'before\')" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;border:none;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:14px;">&times;</button>'
      + '</div>'
      + '<input type="file" id="ba-before-file" accept="image/*" onchange="BeforeAfter._handlePhoto(\'before\', this)" '
      + 'style="display:none;">'
      + '<button onclick="document.getElementById(\'ba-before-file\').click()" id="ba-before-btn" style="width:100%;padding:24px;border:2px dashed var(--border);border-radius:8px;background:#fafafa;cursor:pointer;font-size:14px;color:var(--text-light);">'
      + '📷 Take or Choose BEFORE Photo</button>'
      + '</div>';

    // After photo
    html += '<div>'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">After Photo</label>'
      + '<div id="ba-after-preview" style="display:none;margin-bottom:8px;position:relative;">'
      + '<img id="ba-after-img" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;">'
      + '<button onclick="BeforeAfter._clearPhoto(\'after\')" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;border:none;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:14px;">&times;</button>'
      + '</div>'
      + '<input type="file" id="ba-after-file" accept="image/*" onchange="BeforeAfter._handlePhoto(\'after\', this)" '
      + 'style="display:none;">'
      + '<button onclick="document.getElementById(\'ba-after-file\').click()" id="ba-after-btn" style="width:100%;padding:24px;border:2px dashed var(--border);border-radius:8px;background:#fafafa;cursor:pointer;font-size:14px;color:var(--text-light);">'
      + '📷 Take or Choose AFTER Photo</button>'
      + '</div>';

    // Caption
    html += '<div>'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Caption</label>'
      + '<textarea id="ba-caption" rows="2" placeholder="e.g. Large oak removal in Cortlandt Manor" '
      + 'style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;resize:vertical;box-sizing:border-box;"></textarea>'
      + '</div>';

    // Tags
    html += '<div>'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Tags (comma-separated)</label>'
      + '<input type="text" id="ba-tags" placeholder="e.g. tree removal, oak, crane" '
      + 'style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;">'
      + '</div>';

    html += '</div>';

    // Store jobId for later
    BeforeAfter._pendingJobId = jobId || '';
    BeforeAfter._pendingBeforeImg = '';
    BeforeAfter._pendingAfterImg = '';

    UI.showModal('Add Before / After', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button> '
        + '<button class="btn btn-primary" onclick="BeforeAfter._savePair()">Save Pair</button>'
    });
  },

  _onJobSelect: function() {
    var sel = document.getElementById('ba-job-select');
    var nameInput = document.getElementById('ba-client-name');
    if (!sel || !nameInput) return;
    var jobId = sel.value;
    if (jobId && typeof DB !== 'undefined' && DB.jobs && DB.jobs.getById) {
      var j = DB.jobs.getById(jobId);
      if (j && j.clientName) nameInput.value = j.clientName;
    }
  },

  _handlePhoto: function(which, input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
      var dataUrl = e.target.result;
      // Resize to max 1200px to save localStorage space
      BeforeAfter._resizeImage(dataUrl, 1200, function(resized) {
        if (which === 'before') {
          BeforeAfter._pendingBeforeImg = resized;
        } else {
          BeforeAfter._pendingAfterImg = resized;
        }
        // Show preview
        var preview = document.getElementById('ba-' + which + '-preview');
        var img = document.getElementById('ba-' + which + '-img');
        var btn = document.getElementById('ba-' + which + '-btn');
        if (preview) preview.style.display = 'block';
        if (img) img.src = resized;
        if (btn) btn.style.display = 'none';
      });
    };
    reader.readAsDataURL(file);
  },

  _clearPhoto: function(which) {
    if (which === 'before') {
      BeforeAfter._pendingBeforeImg = '';
    } else {
      BeforeAfter._pendingAfterImg = '';
    }
    var preview = document.getElementById('ba-' + which + '-preview');
    var btn = document.getElementById('ba-' + which + '-btn');
    if (preview) preview.style.display = 'none';
    if (btn) btn.style.display = 'block';
  },

  _resizeImage: function(dataUrl, maxDim, callback) {
    var img = new Image();
    img.onload = function() {
      var w = img.width;
      var h = img.height;
      if (w <= maxDim && h <= maxDim) {
        callback(dataUrl);
        return;
      }
      var ratio = Math.min(maxDim / w, maxDim / h);
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = dataUrl;
  },

  _savePair: function() {
    var jobId = BeforeAfter._pendingJobId || ((document.getElementById('ba-job-select') || {}).value || '');
    var clientName = (document.getElementById('ba-client-name') || {}).value || '';
    var caption = (document.getElementById('ba-caption') || {}).value || '';
    var tagsRaw = (document.getElementById('ba-tags') || {}).value || '';
    var beforeImg = BeforeAfter._pendingBeforeImg || '';
    var afterImg = BeforeAfter._pendingAfterImg || '';

    if (!beforeImg && !afterImg) {
      UI.toast('Add at least one photo', 'error');
      return;
    }
    if (!clientName) {
      UI.toast('Enter a client name', 'error');
      return;
    }

    var tags = tagsRaw ? tagsRaw.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t; }) : [];

    var pair = {
      id: BeforeAfter._generateId(),
      jobId: jobId,
      clientName: clientName,
      beforeImg: beforeImg,
      afterImg: afterImg,
      caption: caption,
      tags: tags,
      createdAt: new Date().toISOString()
    };

    var pairs = BeforeAfter.getAll();
    pairs.push(pair);

    try {
      BeforeAfter._save(pairs);
    } catch (e) {
      if (e.name === 'QuotaExceededError' || (e.message && e.message.indexOf('quota') !== -1)) {
        UI.toast('Storage full. Try deleting old pairs first.', 'error');
        return;
      }
      throw e;
    }

    UI.closeModal();
    UI.toast('Before/after pair saved');

    // Refresh current view
    if (typeof loadPage === 'function') {
      var current = window._currentPage || '';
      if (current === 'beforeafter') {
        loadPage('beforeafter');
      } else if (current && jobId) {
        loadPage(current);
      }
    }
  },

  // ── Slider Comparison Modal ──

  showSlider: function(pairId) {
    var pair = BeforeAfter.getById(pairId);
    if (!pair) { UI.toast('Photo pair not found', 'error'); return; }

    var containerId = 'ba-slider-' + Date.now();

    var html = '<div style="margin-bottom:12px;">'
      + '<div style="font-weight:600;font-size:16px;margin-bottom:4px;">' + UI.esc(pair.clientName || '') + '</div>'
      + '<div style="font-size:13px;color:var(--text-light);">' + UI.dateShort(pair.createdAt) + '</div>'
      + (pair.caption ? '<div style="font-size:14px;margin-top:6px;">' + UI.esc(pair.caption) + '</div>' : '')
      + '</div>';

    if (pair.beforeImg && pair.afterImg) {
      // Interactive slider
      html += '<div id="' + containerId + '" style="position:relative;width:100%;height:350px;overflow:hidden;border-radius:10px;cursor:ew-resize;user-select:none;-webkit-user-select:none;touch-action:none;">'
        // After image (background, full width)
        + '<img src="' + pair.afterImg + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;" draggable="false">'
        // Before image (clipped to left of divider)
        + '<div class="ba-before-clip" style="position:absolute;top:0;left:0;width:50%;height:100%;overflow:hidden;">'
        + '<img src="' + pair.beforeImg + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;" draggable="false">'
        + '</div>'
        // Divider handle
        + '<div class="ba-divider" style="position:absolute;top:0;left:50%;width:4px;height:100%;background:#fff;transform:translateX(-50%);z-index:10;pointer-events:none;">'
        + '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;background:#fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;pointer-events:none;">'
        + '<span style="font-size:16px;color:#333;">&#x2194;</span>'
        + '</div></div>'
        // Labels
        + '<span style="position:absolute;top:10px;left:10px;background:rgba(0,0,0,.65);color:#fff;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:700;z-index:5;pointer-events:none;">BEFORE</span>'
        + '<span style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,.65);color:#fff;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:700;z-index:5;pointer-events:none;">AFTER</span>'
        + '</div>';
    } else {
      // Single image
      var img = pair.beforeImg || pair.afterImg;
      var label = pair.beforeImg ? 'BEFORE' : 'AFTER';
      if (img) {
        html += '<div style="position:relative;border-radius:10px;overflow:hidden;">'
          + '<img src="' + img + '" style="width:100%;max-height:400px;object-fit:cover;">'
          + '<span style="position:absolute;top:10px;left:10px;background:rgba(0,0,0,.65);color:#fff;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:700;">' + label + '</span>'
          + '</div>';
      } else {
        html += '<div style="padding:40px;text-align:center;color:var(--text-light);">No photos attached</div>';
      }
    }

    // Tags
    if (pair.tags && pair.tags.length) {
      html += '<div style="margin-top:10px;display:flex;gap:4px;flex-wrap:wrap;">';
      pair.tags.forEach(function(tag) {
        html += '<span style="background:#e8f5e9;color:var(--green-dark);font-size:11px;padding:2px 8px;border-radius:10px;">' + UI.esc(tag) + '</span>';
      });
      html += '</div>';
    }

    // Action buttons
    html += '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">';
    html += '<button onclick="BeforeAfter.copyForSocial(\'' + pairId + '\')" style="flex:1;min-width:120px;padding:10px;background:#1877f2;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">Copy for Social</button>';
    html += '<button onclick="BeforeAfter.sendToClient(\'' + pairId + '\')" style="flex:1;min-width:120px;padding:10px;background:var(--green-dark);color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">Send to Client</button>';
    html += '<button onclick="BeforeAfter.showSliderFullscreen(\'' + pairId + '\')" style="flex:1;min-width:120px;padding:10px;background:#333;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">Full Screen</button>';
    html += '</div>';

    // Edit / delete row
    html += '<div style="display:flex;gap:8px;margin-top:8px;">';
    html += '<button onclick="BeforeAfter.editCaption(\'' + pairId + '\')" style="flex:1;padding:8px;background:none;border:1px solid var(--border);border-radius:8px;font-size:13px;cursor:pointer;">Edit Caption</button>';
    html += '<button onclick="BeforeAfter.deletePair(\'' + pairId + '\')" style="flex:1;padding:8px;background:none;border:1px solid #ffcdd2;color:#c62828;border-radius:8px;font-size:13px;cursor:pointer;">Delete Pair</button>';
    html += '</div>';

    UI.showModal('Before / After', html, { wide: true });

    // Init slider drag after modal renders
    if (pair.beforeImg && pair.afterImg) {
      setTimeout(function() { BeforeAfter._initSlider(containerId); }, 100);
    }
  },

  showSliderFullscreen: function(pairId) {
    var pair = BeforeAfter.getById(pairId);
    if (!pair || !pair.beforeImg || !pair.afterImg) {
      UI.toast('Need both before and after photos for full screen', 'error');
      return;
    }

    // Close existing modal first
    UI.closeModal();

    var containerId = 'ba-fs-slider-' + Date.now();

    // Create fullscreen overlay
    var overlay = document.createElement('div');
    overlay.id = 'ba-fullscreen';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:10000;display:flex;flex-direction:column;';

    overlay.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;color:#fff;">'
      + '<div style="font-weight:600;">' + UI.esc(pair.clientName || '') + '</div>'
      + '<button onclick="document.getElementById(\'ba-fullscreen\').remove()" style="background:none;border:none;color:#fff;font-size:28px;cursor:pointer;line-height:1;">&times;</button>'
      + '</div>'
      + '<div id="' + containerId + '" style="flex:1;position:relative;overflow:hidden;cursor:ew-resize;user-select:none;-webkit-user-select:none;touch-action:none;">'
      + '<img src="' + pair.afterImg + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;" draggable="false">'
      + '<div class="ba-before-clip" style="position:absolute;top:0;left:0;width:50%;height:100%;overflow:hidden;">'
      + '<img src="' + pair.beforeImg + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;" draggable="false">'
      + '</div>'
      + '<div class="ba-divider" style="position:absolute;top:0;left:50%;width:4px;height:100%;background:#fff;transform:translateX(-50%);z-index:10;pointer-events:none;">'
      + '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:44px;height:44px;background:#fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;pointer-events:none;">'
      + '<span style="font-size:20px;color:#333;">&#x2194;</span>'
      + '</div></div>'
      + '<span style="position:absolute;top:12px;left:12px;background:rgba(0,0,0,.65);color:#fff;padding:4px 12px;border-radius:4px;font-size:13px;font-weight:700;z-index:5;pointer-events:none;">BEFORE</span>'
      + '<span style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,.65);color:#fff;padding:4px 12px;border-radius:4px;font-size:13px;font-weight:700;z-index:5;pointer-events:none;">AFTER</span>'
      + '</div>';

    document.body.appendChild(overlay);

    setTimeout(function() { BeforeAfter._initSlider(containerId); }, 100);
  },

  // ── Slider Drag Logic (touch + mouse) ──

  _initSlider: function(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var clip = container.querySelector('.ba-before-clip');
    var divider = container.querySelector('.ba-divider');
    if (!clip || !divider) return;

    var isDragging = false;

    function setPosition(clientX) {
      var rect = container.getBoundingClientRect();
      var x = clientX - rect.left;
      var pct = Math.max(0, Math.min(1, x / rect.width));
      var pctStr = (pct * 100) + '%';
      clip.style.width = pctStr;
      divider.style.left = pctStr;

      // Fix before image width so it doesn't squish
      var beforeImg = clip.querySelector('img');
      if (beforeImg) {
        beforeImg.style.width = rect.width + 'px';
      }
    }

    // Fix before image initial width
    var rect = container.getBoundingClientRect();
    var beforeImg = clip.querySelector('img');
    if (beforeImg) {
      beforeImg.style.width = rect.width + 'px';
    }

    // Mouse events
    container.addEventListener('mousedown', function(e) {
      e.preventDefault();
      isDragging = true;
      setPosition(e.clientX);
    });
    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      e.preventDefault();
      setPosition(e.clientX);
    });
    document.addEventListener('mouseup', function() {
      isDragging = false;
    });

    // Touch events
    container.addEventListener('touchstart', function(e) {
      isDragging = true;
      if (e.touches.length > 0) setPosition(e.touches[0].clientX);
    }, { passive: true });
    container.addEventListener('touchmove', function(e) {
      if (!isDragging) return;
      if (e.touches.length > 0) setPosition(e.touches[0].clientX);
    }, { passive: true });
    container.addEventListener('touchend', function() {
      isDragging = false;
    });
  },

  // ── Edit Caption ──

  editCaption: function(pairId) {
    var pair = BeforeAfter.getById(pairId);
    if (!pair) return;

    var html = '<div>'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Caption</label>'
      + '<textarea id="ba-edit-caption" rows="3" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;resize:vertical;box-sizing:border-box;">'
      + UI.esc(pair.caption || '') + '</textarea>'
      + '</div>'
      + '<div style="margin-top:12px;">'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Tags (comma-separated)</label>'
      + '<input type="text" id="ba-edit-tags" value="' + UI.esc((pair.tags || []).join(', ')) + '" '
      + 'style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;">'
      + '</div>';

    UI.showModal('Edit Caption', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button> '
        + '<button class="btn btn-primary" onclick="BeforeAfter._saveCaption(\'' + pairId + '\')">Save</button>'
    });
  },

  _saveCaption: function(pairId) {
    var caption = (document.getElementById('ba-edit-caption') || {}).value || '';
    var tagsRaw = (document.getElementById('ba-edit-tags') || {}).value || '';
    var tags = tagsRaw ? tagsRaw.split(',').map(function(t) { return t.trim(); }).filter(function(t) { return t; }) : [];

    var pairs = BeforeAfter.getAll();
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i].id === pairId) {
        pairs[i].caption = caption;
        pairs[i].tags = tags;
        break;
      }
    }
    BeforeAfter._save(pairs);
    UI.closeModal();
    UI.toast('Caption updated');

    if (typeof loadPage === 'function' && window._currentPage) {
      loadPage(window._currentPage);
    }
  },

  // ── Delete Pair ──

  deletePair: function(pairId) {
    UI.confirm('Delete this before/after pair? This cannot be undone.', function() {
      var pairs = BeforeAfter.getAll();
      pairs = pairs.filter(function(p) { return p.id !== pairId; });
      BeforeAfter._save(pairs);
      UI.toast('Pair deleted');
      if (typeof loadPage === 'function' && window._currentPage) {
        loadPage(window._currentPage);
      }
    });
  },

  // ── Share: Copy for Social ──

  copyForSocial: function(pairId) {
    var pair = BeforeAfter.getById(pairId);
    if (!pair) return;

    var text = 'Check out this transformation! ';
    if (pair.caption) {
      text += pair.caption + ' ';
    }
    text += '\n\nBefore & After by ' + BeforeAfter._co().name;
    text += '\n\n#TreeService #BeforeAndAfter #TreeRemoval #Peekskill #SecondNatureTree';
    if (pair.tags && pair.tags.length) {
      pair.tags.forEach(function(tag) {
        var hashtag = '#' + tag.replace(/\s+/g, '');
        if (text.indexOf(hashtag) === -1) {
          text += ' ' + hashtag;
        }
      });
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        UI.toast('Caption copied to clipboard');
      }, function() {
        BeforeAfter._fallbackCopy(text);
      });
    } else {
      BeforeAfter._fallbackCopy(text);
    }
  },

  _fallbackCopy: function(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      UI.toast('Caption copied to clipboard');
    } catch (e) {
      UI.toast('Could not copy. Check browser permissions.', 'error');
    }
    document.body.removeChild(ta);
  },

  // ── Share: Send to Client ──

  sendToClient: function(pairId) {
    var pair = BeforeAfter.getById(pairId);
    if (!pair) return;

    // Find client email from DB if available
    var email = '';
    if (pair.jobId && typeof DB !== 'undefined' && DB.jobs && DB.jobs.getById) {
      var j = DB.jobs.getById(pair.jobId);
      if (j && j.clientId && DB.clients && DB.clients.getById) {
        var c = DB.clients.getById(j.clientId);
        if (c && c.email) email = c.email;
      }
    }

    var co = BeforeAfter._co();
    var subject = 'Your Project - Before & After Photos | ' + co.name;
    var body = 'Hi ' + (pair.clientName || 'there') + ',\n\n'
      + 'Here are the before and after photos from your recent project'
      + (pair.caption ? ': ' + pair.caption : '') + '.\n\n'
      + 'We hope you love the results! If you have a moment, we would really appreciate a Google review:\n'
      + 'https://share.google/mLwSzzZXwc5fuFRU4\n\n'
      + 'Thank you for choosing ' + co.name + '!\n\n'
      + 'Best regards,\n'
      + CompanyInfo.get('ownerName') + '\n'
      + co.name + '\n'
      + co.phone + '\n'
      + co.email;

    var mailtoUrl = 'mailto:' + encodeURIComponent(email)
      + '?subject=' + encodeURIComponent(subject)
      + '&body=' + encodeURIComponent(body);

    window.open(mailtoUrl, '_blank');
    UI.toast('Opening email client...');
  },

  // ── Compact Widget (for dashboard or sidebar) ──

  renderWidget: function() {
    var pairs = BeforeAfter.getAll();
    var recent = pairs.slice().sort(function(a, b) {
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    }).slice(0, 3);

    var html = '<div style="background:var(--white);border-radius:12px;padding:16px;border:1px solid var(--border);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      + '<h4 style="font-size:14px;margin:0;">Recent Before/After</h4>'
      + '<a href="#" onclick="loadPage(\'beforeafter\');return false;" style="font-size:12px;color:var(--green-dark);text-decoration:none;">View All (' + pairs.length + ')</a>'
      + '</div>';

    if (recent.length === 0) {
      html += '<div style="text-align:center;padding:12px;color:var(--text-light);font-size:13px;">'
        + '📷 No before/after photos yet'
        + '</div>';
    } else {
      html += '<div style="display:flex;gap:8px;overflow-x:auto;">';
      recent.forEach(function(pair) {
        var img = pair.afterImg || pair.beforeImg;
        html += '<div style="flex:0 0 100px;cursor:pointer;" onclick="BeforeAfter.showSlider(\'' + pair.id + '\')">'
          + '<div style="width:100px;height:70px;border-radius:6px;overflow:hidden;background:#f5f5f5;">';
        if (img) {
          html += '<img src="' + img + '" style="width:100%;height:100%;object-fit:cover;">';
        }
        html += '</div>'
          + '<div style="font-size:11px;color:var(--text-light);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
          + UI.esc(pair.clientName || 'Unknown') + '</div>'
          + '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }
};
