/**
 * Branch Manager — Media Center
 * CompanyCam-style photo/video system for Second Nature Tree Service.
 * Crew uploads job site photos/videos; admin reviews and exports to SocialPilot.
 */
var MediaCenter = {

  _storageKey: 'bm-media',
  _selectedIds: [],
  _currentFilter: 'all',
  _currentDays: 30,
  _jobSearch: '',

  // ── Data Access ──

  getAll: function() {
    try { return JSON.parse(localStorage.getItem(MediaCenter._storageKey)) || []; }
    catch(e) { return []; }
  },

  _save: function(items) {
    try { localStorage.setItem(MediaCenter._storageKey, JSON.stringify(items)); }
    catch(e) { UI.toast('Storage full — delete some photos to free space.'); }
  },

  getUnreviewedCount: function() {
    return MediaCenter.getAll().filter(function(m) { return !m.reviewed; }).length;
  },

  _getFiltered: function() {
    var all = MediaCenter.getAll();
    var now = new Date();
    var cutoff = new Date(now.getTime() - MediaCenter._currentDays * 86400000);

    return all.filter(function(item) {
      // Date range
      if (item.date && new Date(item.date) < cutoff) return false;
      // Type filter
      if (MediaCenter._currentFilter === 'photos' && item.type !== 'photo') return false;
      if (MediaCenter._currentFilter === 'videos' && item.type !== 'video') return false;
      if (MediaCenter._currentFilter === 'unreviewed' && item.reviewed) return false;
      // Job search
      if (MediaCenter._jobSearch) {
        var q = MediaCenter._jobSearch.toLowerCase();
        var hay = ((item.clientName || '') + ' ' + (item.jobNumber || '') + ' ' + (item.caption || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  },

  // ── Main Render ──

  render: function() {
    var all = MediaCenter.getAll();
    var now = new Date();
    var weekAgo = new Date(now.getTime() - 7 * 86400000);
    var thisWeekCount = all.filter(function(m) { return m.date && new Date(m.date) >= weekAgo; }).length;
    var unreviewedCount = MediaCenter.getUnreviewedCount();
    var exportedCount = all.filter(function(m) { return m.exported; }).length;

    var html = '';

    // Header
    html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;">'
      + '<h2 style="font-size:24px;font-weight:700;margin:0;">&#128247; Media Center</h2>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + (MediaCenter._selectedIds.length > 0 ? '<button onclick="MediaCenter.bulkMarkReviewed()" style="background:#e8f5e9;color:var(--green-dark);border:1px solid #c8e6c9;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">&#10003; Mark Reviewed (' + MediaCenter._selectedIds.length + ')</button>' : '')
      + (MediaCenter._selectedIds.length > 0 ? '<button onclick="MediaCenter.bulkDelete()" style="background:#fff5f5;color:#dc3545;border:1px solid #fca5a5;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">&#128465; Delete (' + MediaCenter._selectedIds.length + ')</button>' : '')
      + '<button onclick="loadPage(\'photomap\')" style="background:none;border:1px solid var(--border);padding:8px 14px;border-radius:8px;font-size:13px;cursor:pointer;color:var(--accent);">📍 Photo Map</button>'
      + '<button class="btn btn-primary" onclick="MediaCenter.showUploadForm()">+ Upload Photos</button>'
      + '</div>'
      + '</div>';

    // Stats row
    html += '<div class="stat-grid" style="margin-bottom:16px;">'
      + UI.statCard('Total Media', all.length.toString(), 'photos & videos', '', '')
      + UI.statCard('This Week', thisWeekCount.toString(), 'new uploads', thisWeekCount > 0 ? 'up' : '', '')
      + UI.statCard('Unreviewed', unreviewedCount.toString(), 'awaiting review', unreviewedCount > 0 ? 'down' : '', '')
      + UI.statCard('Exported', exportedCount.toString(), 'used in posts', '', '')
      + '</div>';

    // Storage usage indicator
    var storageBytes = (localStorage.getItem(MediaCenter._storageKey) || '').length;
    var storageMB = (storageBytes / 1048576).toFixed(1);
    var storageLimit = 5; // MB (localStorage limit ~5-10MB)
    var storagePct = Math.min(100, storageBytes / (storageLimit * 1048576) * 100);
    var storageColor = storagePct > 80 ? '#dc3545' : storagePct > 60 ? '#e65100' : 'var(--green-dark)';
    html += '<div style="background:var(--white);border-radius:12px;padding:10px 16px;border:1px solid var(--border);margin-bottom:16px;display:flex;align-items:center;gap:12px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<span style="font-size:12px;color:var(--text-light);white-space:nowrap;">&#128190; Storage: <strong style="color:' + storageColor + ';">' + storageMB + ' MB</strong> / ~5 MB available</span>'
      + '<div style="flex:1;height:6px;background:var(--bg);border-radius:3px;overflow:hidden;">'
      + '<div style="height:100%;width:' + storagePct.toFixed(1) + '%;background:' + storageColor + ';border-radius:3px;transition:width 0.3s;"></div>'
      + '</div>'
      + '<span style="font-size:11px;color:var(--text-light);white-space:nowrap;">' + storagePct.toFixed(0) + '%</span>'
      + '</div>';

    // Filter bar
    html += '<div style="background:var(--white);border-radius:12px;padding:14px 16px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">'
      // Type filter pills
      + '<div style="display:flex;gap:6px;">';
    ['all','photos','videos','unreviewed'].forEach(function(f) {
      var label = f.charAt(0).toUpperCase() + f.slice(1);
      var active = MediaCenter._currentFilter === f;
      html += '<button onclick="MediaCenter._setFilter(\'' + f + '\')" style="padding:6px 14px;border-radius:20px;border:1px solid ' + (active ? 'var(--green-dark)' : 'var(--border)') + ';background:' + (active ? 'var(--green-dark)' : 'var(--white)') + ';color:' + (active ? '#fff' : 'var(--text-light)') + ';font-size:13px;cursor:pointer;font-weight:' + (active ? '600' : '400') + ';">' + label + '</button>';
    });
    html += '</div>';
    // Date range
    html += '<select onchange="MediaCenter._setDays(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--white);">'
      + '<option value="7"' + (MediaCenter._currentDays === 7 ? ' selected' : '') + '>Last 7 days</option>'
      + '<option value="30"' + (MediaCenter._currentDays === 30 ? ' selected' : '') + '>Last 30 days</option>'
      + '<option value="90"' + (MediaCenter._currentDays === 90 ? ' selected' : '') + '>Last 90 days</option>'
      + '<option value="365"' + (MediaCenter._currentDays === 365 ? ' selected' : '') + '>Last year</option>'
      + '<option value="9999"' + (MediaCenter._currentDays === 9999 ? ' selected' : '') + '>All time</option>'
      + '</select>';
    // Job search
    html += '<input type="text" placeholder="Search by client or job..." '
      + 'value="' + UI.esc(MediaCenter._jobSearch) + '" '
      + 'oninput="MediaCenter._setJobSearch(this.value)" '
      + 'style="flex:1;min-width:180px;padding:6px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;">';
    html += '</div></div>';

    // Photo grid
    var filtered = MediaCenter._getFiltered();
    html += '<div id="mc-grid">' + MediaCenter._renderGrid(filtered) + '</div>';

    return html;
  },

  _renderGrid: function(items) {
    if (items.length === 0) {
      return '<div style="text-align:center;padding:60px 20px;background:var(--white);border-radius:12px;border:1px solid var(--border);">'
        + '<div style="font-size:48px;margin-bottom:12px;">&#127795;</div>'
        + '<div style="font-size:16px;font-weight:600;margin-bottom:8px;">No media yet</div>'
        + '<div style="color:var(--text-light);font-size:14px;margin-bottom:20px;">Tap Upload to add the first job photo.</div>'
        + '<button class="btn btn-primary" onclick="MediaCenter.showUploadForm()">+ Upload Photos</button>'
        + '</div>';
    }

    var html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;" id="mc-photo-grid">';
    items.forEach(function(item) {
      html += MediaCenter._renderCard(item);
    });
    html += '</div>';
    return html;
  },

  _renderCard: function(item) {
    var isSelected = MediaCenter._selectedIds.indexOf(item.id) >= 0;
    var imgSrc = item.thumbnail || item.data || '';

    var tagColors = {
      before: '#e3f2fd', after: '#e8f5e9', progress: '#fff8e1',
      crew: '#f3e5f5', equipment: '#fce4ec', stump: '#efebe9', aerial: '#e8eaf6'
    };

    var tagHtml = '';
    if (item.tags && item.tags.length) {
      item.tags.slice(0, 3).forEach(function(t) {
        var bg = tagColors[t] || '#f5f5f5';
        tagHtml += '<span style="padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;background:' + bg + ';color:#333;">' + UI.esc(t) + '</span>';
      });
    }

    var initial = item.employeeName ? item.employeeName.charAt(0).toUpperCase() : '?';

    return '<div id="mc-card-' + item.id + '" style="position:relative;background:var(--white);border-radius:12px;border:2px solid ' + (isSelected ? 'var(--green-dark)' : 'var(--border)') + ';overflow:hidden;cursor:pointer;" onclick="MediaCenter._toggleSelect(\'' + item.id + '\')">'
      // Checkbox overlay
      + '<div style="position:absolute;top:8px;left:8px;z-index:2;">'
      + '<div style="width:22px;height:22px;border-radius:6px;border:2px solid ' + (isSelected ? 'var(--green-dark)' : 'rgba(255,255,255,0.8)') + ';background:' + (isSelected ? 'var(--green-dark)' : 'rgba(255,255,255,0.6)') + ';display:flex;align-items:center;justify-content:center;">'
      + (isSelected ? '<span style="color:#fff;font-size:13px;font-weight:700;">&#10003;</span>' : '')
      + '</div></div>'
      // Reviewed badge
      + (item.reviewed ? '<div style="position:absolute;top:8px;right:8px;z-index:2;background:var(--green-dark);color:#fff;font-size:10px;padding:2px 7px;border-radius:10px;font-weight:600;">&#10003; Reviewed</div>' : '')
      // Thumbnail
      + '<div style="aspect-ratio:4/3;background:#f0f0f0;overflow:hidden;">'
      + (item.type === 'video'
        ? '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#1a1a2e;">'
          + '<span style="font-size:36px;">&#9654;</span>'
          + (imgSrc ? '<img src="' + imgSrc + '" style="position:absolute;width:100%;height:100%;object-fit:cover;opacity:0.5;" loading="lazy">' : '')
          + '</div>'
        : (imgSrc ? '<img src="' + imgSrc + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.style.display=\'none\'">' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:36px;">&#127757;</div>'))
      + '</div>'
      // Bottom bar
      + '<div style="padding:10px 12px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">'
      + '<div style="font-size:12px;font-weight:600;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">' + UI.esc(item.clientName || 'No client') + '</div>'
      + '<div style="width:24px;height:24px;border-radius:50%;background:var(--green-dark);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;" title="' + UI.esc(item.employeeName || '') + '">' + initial + '</div>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);margin-bottom:6px;">' + UI.dateRelative(item.date) + (item.caption ? ' · ' + UI.esc(item.caption.substring(0, 30)) + (item.caption.length > 30 ? '…' : '') : '') + '</div>'
      + '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">' + tagHtml + '</div>'
      // Action buttons
      + '<div style="display:flex;gap:6px;" onclick="event.stopPropagation();">'
      + '<button onclick="MediaCenter.showDetail(\'' + item.id + '\')" style="flex:1;padding:5px 0;border:1px solid var(--border);border-radius:6px;background:var(--white);font-size:12px;cursor:pointer;" title="View">&#128065; View</button>'
      + (!item.reviewed ? '<button onclick="MediaCenter.markReviewed(\'' + item.id + '\')" style="flex:1;padding:5px 0;border:1px solid var(--green-dark);border-radius:6px;background:var(--white);color:var(--green-dark);font-size:12px;cursor:pointer;" title="Mark reviewed">&#10003; Review</button>' : '')
      + '<button onclick="MediaCenter.deleteMedia(\'' + item.id + '\')" style="padding:5px 8px;border:1px solid #fca5a5;border-radius:6px;background:var(--white);color:#dc2626;font-size:12px;cursor:pointer;" title="Delete">&#128465;</button>'
      + '</div>'
      + '</div>'
      + '</div>';
  },

  // ── Filter Helpers ──

  _setFilter: function(f) {
    MediaCenter._currentFilter = f;
    MediaCenter._selectedIds = [];
    var el = document.getElementById('mc-grid');
    if (el) el.innerHTML = MediaCenter._renderGrid(MediaCenter._getFiltered());
    // Re-render to update pill styles
    var container = document.getElementById('page-content');
    if (container) container.innerHTML = MediaCenter.render();
  },

  _setDays: function(d) {
    MediaCenter._currentDays = parseInt(d, 10);
    MediaCenter._selectedIds = [];
    var container = document.getElementById('page-content');
    if (container) container.innerHTML = MediaCenter.render();
  },

  _setJobSearch: function(q) {
    MediaCenter._jobSearch = q;
    var el = document.getElementById('mc-grid');
    if (el) el.innerHTML = MediaCenter._renderGrid(MediaCenter._getFiltered());
  },

  // ── Selection ──

  _toggleSelect: function(id) {
    var idx = MediaCenter._selectedIds.indexOf(id);
    if (idx >= 0) {
      MediaCenter._selectedIds.splice(idx, 1);
    } else {
      MediaCenter._selectedIds.push(id);
    }
    // Update card border
    var card = document.getElementById('mc-card-' + id);
    if (card) {
      var selected = MediaCenter._selectedIds.indexOf(id) >= 0;
      card.style.borderColor = selected ? 'var(--green-dark)' : 'var(--border)';
      var cb = card.querySelector('div > div');
      if (cb) {
        cb.style.borderColor = selected ? 'var(--green-dark)' : 'rgba(255,255,255,0.8)';
        cb.style.background = selected ? 'var(--green-dark)' : 'rgba(255,255,255,0.6)';
        cb.innerHTML = selected ? '<span style="color:#fff;font-size:13px;font-weight:700;">&#10003;</span>' : '';
      }
    }
    // Update export button
    var exportBtn = document.getElementById('mc-export-btn');
    if (exportBtn) {
      var count = MediaCenter._selectedIds.length;
      exportBtn.disabled = count === 0;
      exportBtn.style.opacity = count === 0 ? '0.5' : '1';
      exportBtn.style.cursor = count === 0 ? 'not-allowed' : 'pointer';
    }
  },

  _selectAll: function() {
    var filtered = MediaCenter._getFiltered();
    MediaCenter._selectedIds = filtered.map(function(m) { return m.id; });
    var el = document.getElementById('mc-grid');
    if (el) el.innerHTML = MediaCenter._renderGrid(filtered);
    var exportBtn = document.getElementById('mc-export-btn');
    if (exportBtn) {
      exportBtn.disabled = false;
      exportBtn.style.opacity = '1';
      exportBtn.style.cursor = 'pointer';
    }
  },

  // ── Upload Form ──

  showUploadForm: function() {
    var defaultEmployee = (typeof Auth !== 'undefined' && Auth.user && Auth.user.name) ? Auth.user.name : '';

    var modalContent = '<div style="display:flex;flex-direction:column;gap:14px;">'
      // File input
      + '<div>'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Photos / Videos</label>'
      + '<div style="border:2px dashed var(--border);border-radius:10px;padding:24px;text-align:center;cursor:pointer;background:var(--bg);" onclick="document.getElementById(\'mc-file-input\').click()">'
      + '<div style="font-size:32px;margin-bottom:8px;">&#128247;</div>'
      + '<div style="font-size:14px;color:var(--text-light);">Tap to choose photos or videos</div>'
      + '<div style="font-size:12px;color:var(--text-light);margin-top:4px;">JPG, PNG, HEIC, MP4, MOV · Multiple files OK</div>'
      + '<input type="file" id="mc-file-input" accept="image/*,video/*" multiple style="display:none;" onchange="MediaCenter._previewFiles(this.files)">'
      + '</div>'
      + '<div id="mc-preview-row" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;"></div>'
      + '</div>'
      // Job search
      + '<div>'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Link to Job (optional)</label>'
      + '<input type="text" id="mc-job-search" placeholder="Search by client name or job #..." oninput="MediaCenter._searchJobs(this.value)" '
      + 'style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;box-sizing:border-box;">'
      + '<div id="mc-job-results" style="display:none;background:var(--white);border:1px solid var(--border);border-radius:8px;max-height:160px;overflow-y:auto;margin-top:4px;"></div>'
      + '<input type="hidden" id="mc-job-id" value="">'
      + '<input type="hidden" id="mc-job-number" value="">'
      + '<input type="hidden" id="mc-client-name" value="">'
      + '</div>'
      // Employee
      + '<div>'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Employee</label>'
      + '<input type="text" id="mc-employee" value="' + UI.esc(defaultEmployee) + '" placeholder="Your name" '
      + 'style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;box-sizing:border-box;">'
      + '</div>'
      // Tags
      + '<div>'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:8px;">Tags</label>'
      + '<div style="display:flex;flex-wrap:wrap;gap:8px;">';

    var tagDefs = [
      { val: 'before', label: '&#128344; Before', bg: '#e3f2fd' },
      { val: 'after', label: '&#10003; After', bg: '#e8f5e9' },
      { val: 'progress', label: '&#128295; Progress', bg: '#fff8e1' },
      { val: 'crew', label: '&#128119; Crew', bg: '#f3e5f5' },
      { val: 'equipment', label: '&#128663; Equipment', bg: '#fce4ec' },
      { val: 'stump', label: '&#127795; Stump', bg: '#efebe9' },
      { val: 'aerial', label: '&#128760; Aerial', bg: '#e8eaf6' }
    ];
    tagDefs.forEach(function(t) {
      modalContent += '<label style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;border:1px solid var(--border);cursor:pointer;font-size:13px;background:var(--white);">'
        + '<input type="checkbox" name="mc-tag" value="' + t.val + '" style="accent-color:var(--green-dark);">'
        + t.label + '</label>';
    });

    modalContent += '</div></div>'
      // Caption
      + '<div>'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Caption / Notes</label>'
      + '<textarea id="mc-caption" rows="2" placeholder="What happened on this job? (optional)" '
      + 'style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;"></textarea>'
      + '</div>'
      + '</div>';

    var footer = '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
      + '<button class="btn btn-primary" id="mc-upload-btn" onclick="MediaCenter._submitUpload()">&#128247; Upload</button>';

    UI.showModal('Upload Job Photos', modalContent, { footer: footer });
  },

  _previewFiles: function(files) {
    var row = document.getElementById('mc-preview-row');
    var btn = document.getElementById('mc-upload-btn');
    if (!row || !files || !files.length) return;
    row.innerHTML = '';
    for (var i = 0; i < Math.min(files.length, 12); i++) {
      (function(file) {
        var thumb = document.createElement('div');
        thumb.style.cssText = 'width:64px;height:64px;border-radius:8px;overflow:hidden;background:#f0f0f0;flex-shrink:0;';
        if (file.type.startsWith('image/')) {
          var img = document.createElement('img');
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
          var reader = new FileReader();
          reader.onload = function(e) { img.src = e.target.result; };
          reader.readAsDataURL(file);
          thumb.appendChild(img);
        } else {
          thumb.style.background = '#1a1a2e';
          thumb.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;">&#9654;</div>';
        }
        row.appendChild(thumb);
      })(files[i]);
    }
    if (files.length > 12) {
      var more = document.createElement('div');
      more.style.cssText = 'width:64px;height:64px;border-radius:8px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--text-light);flex-shrink:0;';
      more.textContent = '+' + (files.length - 12) + ' more';
      row.appendChild(more);
    }
    if (btn) btn.textContent = '&#128247; Upload ' + files.length + ' File' + (files.length !== 1 ? 's' : '');
  },

  _searchJobs: function(q) {
    var resultsEl = document.getElementById('mc-job-results');
    if (!resultsEl) return;
    if (!q || q.length < 2) { resultsEl.style.display = 'none'; return; }

    var jobs = [];
    try { jobs = DB.jobs.getAll(); } catch(e) {
      try { jobs = JSON.parse(localStorage.getItem('bm-jobs') || '[]'); } catch(e2) { jobs = []; }
    }
    var ql = q.toLowerCase();
    var matches = jobs.filter(function(j) {
      return ((j.clientName || '') + ' ' + (j.jobNumber || '') + ' ' + (j.title || '')).toLowerCase().indexOf(ql) >= 0;
    }).slice(0, 6);

    if (matches.length === 0) { resultsEl.style.display = 'none'; return; }

    resultsEl.style.display = 'block';
    resultsEl.innerHTML = matches.map(function(j) {
      return '<div onclick="MediaCenter._selectJob(' + JSON.stringify({id: j.id, jobNumber: j.jobNumber || '', clientName: j.clientName || ''}) + ')" '
        + 'style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);" '
        + 'onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\';">'
        + '<strong>' + UI.esc(j.clientName || 'Unknown') + '</strong>'
        + (j.jobNumber ? ' <span style="color:var(--text-light);">#' + UI.esc(j.jobNumber) + '</span>' : '')
        + (j.title ? '<div style="font-size:11px;color:var(--text-light);">' + UI.esc(j.title) + '</div>' : '')
        + '</div>';
    }).join('');
  },

  _selectJob: function(job) {
    var searchEl = document.getElementById('mc-job-search');
    var idEl = document.getElementById('mc-job-id');
    var numEl = document.getElementById('mc-job-number');
    var clientEl = document.getElementById('mc-client-name');
    var resultsEl = document.getElementById('mc-job-results');
    if (searchEl) searchEl.value = (job.clientName || '') + (job.jobNumber ? ' #' + job.jobNumber : '');
    if (idEl) idEl.value = job.id || '';
    if (numEl) numEl.value = job.jobNumber || '';
    if (clientEl) clientEl.value = job.clientName || '';
    if (resultsEl) resultsEl.style.display = 'none';
  },

  _submitUpload: function() {
    var fileInput = document.getElementById('mc-file-input');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      UI.toast('Please select at least one photo or video.'); return;
    }

    var tags = [];
    var checkboxes = document.querySelectorAll('input[name="mc-tag"]:checked');
    checkboxes.forEach(function(cb) { tags.push(cb.value); });

    var meta = {
      jobId: (document.getElementById('mc-job-id') || {}).value || '',
      jobNumber: (document.getElementById('mc-job-number') || {}).value || '',
      clientName: (document.getElementById('mc-client-name') || {}).value || '',
      employeeName: (document.getElementById('mc-employee') || {}).value || '',
      caption: (document.getElementById('mc-caption') || {}).value || '',
      tags: tags
    };

    var btn = document.getElementById('mc-upload-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }

    MediaCenter._processUpload(fileInput.files, meta, function() {
      UI.closeModal();
      UI.toast(fileInput.files.length + ' file' + (fileInput.files.length !== 1 ? 's' : '') + ' uploaded successfully!');
      var container = document.getElementById('page-content');
      if (container) container.innerHTML = MediaCenter.render();
    });
  },

  // ── Process Upload ──

  _processUpload: function(files, meta, callback) {
    var items = MediaCenter.getAll();
    var remaining = files.length;

    if (remaining === 0) { callback && callback(); return; }

    for (var i = 0; i < files.length; i++) {
      (function(file) {
        var isVideo = file.type.startsWith('video/');
        var record = {
          id: 'mc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          type: isVideo ? 'video' : 'photo',
          jobId: meta.jobId || '',
          jobNumber: meta.jobNumber || '',
          clientName: meta.clientName || '',
          employeeName: meta.employeeName || '',
          caption: meta.caption || '',
          notes: '',
          date: new Date().toISOString(),
          tags: meta.tags || [],
          data: '',
          thumbnail: '',
          reviewed: false,
          exported: false,
          width: 0,
          height: 0
        };

        if (isVideo) {
          MediaCenter._processVideo(file, record, function(r) {
            items.unshift(r);
            remaining--;
            if (remaining === 0) {
              MediaCenter._save(items);
              callback && callback();
            }
          });
        } else {
          MediaCenter._processImage(file, record, function(r) {
            items.unshift(r);
            remaining--;
            if (remaining === 0) {
              MediaCenter._save(items);
              callback && callback();
            }
          });
        }
      })(files[i]);
    }
  },

  _processImage: function(file, record, callback) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var dataUrl = e.target.result;
      var img = new Image();
      img.onload = function() {
        record.width = img.width;
        record.height = img.height;

        // Full res (max 1200px wide)
        var fullCanvas = document.createElement('canvas');
        var maxW = 1200;
        var scale = img.width > maxW ? maxW / img.width : 1;
        fullCanvas.width = Math.round(img.width * scale);
        fullCanvas.height = Math.round(img.height * scale);
        fullCanvas.getContext('2d').drawImage(img, 0, 0, fullCanvas.width, fullCanvas.height);
        record.data = fullCanvas.toDataURL('image/jpeg', 0.82);

        // Thumbnail (max 400px wide)
        var thumbCanvas = document.createElement('canvas');
        var tScale = img.width > 400 ? 400 / img.width : 1;
        thumbCanvas.width = Math.round(img.width * tScale);
        thumbCanvas.height = Math.round(img.height * tScale);
        thumbCanvas.getContext('2d').drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
        record.thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.72);

        callback(record);
      };
      img.onerror = function() {
        // Fallback: store raw
        record.data = dataUrl;
        record.thumbnail = dataUrl;
        callback(record);
      };
      img.src = dataUrl;
    };
    reader.onerror = function() { callback(record); };
    reader.readAsDataURL(file);
  },

  _processVideo: function(file, record, callback) {
    var url = URL.createObjectURL(file);
    var video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = function() {
      video.currentTime = 0;
    };

    video.onseeked = function() {
      // Capture first frame as thumbnail
      try {
        var canvas = document.createElement('canvas');
        var maxW = 400;
        var scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1;
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        record.thumbnail = canvas.toDataURL('image/jpeg', 0.72);
        record.width = video.videoWidth;
        record.height = video.videoHeight;
      } catch(e) {}
      URL.revokeObjectURL(url);
      callback(record);
    };

    video.onerror = function() {
      URL.revokeObjectURL(url);
      callback(record);
    };

    // Timeout fallback in case onseeked never fires
    var done = false;
    setTimeout(function() {
      if (!done) { done = true; URL.revokeObjectURL(url); callback(record); }
    }, 6000);

    video.addEventListener('seeked', function() { if (!done) { done = true; } });
    video.src = url;
  },

  // ── Detail View ──

  showDetail: function(id) {
    var item = null;
    var all = MediaCenter.getAll();
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) { item = all[i]; break; }
    }
    if (!item) return;

    var tagHtml = (item.tags || []).map(function(t) {
      return '<span style="padding:4px 10px;border-radius:12px;font-size:12px;background:#f0f0f0;color:#333;">' + UI.esc(t) + '</span>';
    }).join(' ');

    var content = '<div style="text-align:center;margin-bottom:16px;">'
      + (item.type === 'video'
        ? '<video src="' + (item.data || '') + '" controls style="max-width:100%;max-height:400px;border-radius:10px;background:#000;"></video>'
        : '<img src="' + (item.data || item.thumbnail || '') + '" style="max-width:100%;max-height:400px;border-radius:10px;object-fit:contain;" onerror="this.style.display=\'none\'">'
      )
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;margin-bottom:12px;">'
      + '<div><div style="color:var(--text-light);font-size:11px;font-weight:600;margin-bottom:2px;">CLIENT</div><div>' + UI.esc(item.clientName || '—') + '</div></div>'
      + '<div><div style="color:var(--text-light);font-size:11px;font-weight:600;margin-bottom:2px;">EMPLOYEE</div><div>' + UI.esc(item.employeeName || '—') + '</div></div>'
      + '<div><div style="color:var(--text-light);font-size:11px;font-weight:600;margin-bottom:2px;">JOB #</div><div>' + UI.esc(item.jobNumber || '—') + '</div></div>'
      + '<div><div style="color:var(--text-light);font-size:11px;font-weight:600;margin-bottom:2px;">DATE</div><div>' + UI.dateRelative(item.date) + '</div></div>'
      + '</div>'
      + (item.caption ? '<div style="font-size:13px;color:#555;margin-bottom:12px;padding:10px 12px;background:var(--bg);border-radius:8px;">' + UI.esc(item.caption) + '</div>' : '')
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;">' + tagHtml + '</div>'
      + '<div style="margin-top:4px;">'
      + (item.reviewed ? '<span style="font-size:12px;color:var(--green-dark);font-weight:600;">&#10003; Reviewed</span>' : '<span style="font-size:12px;color:var(--text-light);">Not reviewed</span>')
      + (item.exported ? ' &nbsp; <span style="font-size:12px;color:var(--accent);font-weight:600;">&#128228; Exported</span>' : '')
      + '</div>';

    var footer = (!item.reviewed ? '<button class="btn btn-outline" onclick="MediaCenter.markReviewed(\'' + id + '\');UI.closeModal();">&#10003; Mark Reviewed</button>' : '')
      + '<button class="btn btn-outline" style="color:#dc2626;border-color:#fca5a5;" onclick="MediaCenter.deleteMedia(\'' + id + '\');UI.closeModal();">&#128465; Delete</button>'
      + '<button class="btn btn-primary" onclick="UI.closeModal()">Done</button>';

    UI.showModal('Photo Detail', content, { footer: footer, wide: true });
  },

  // ── Mark Reviewed ──

  markReviewed: function(id) {
    var items = MediaCenter.getAll();
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) { items[i].reviewed = true; break; }
    }
    MediaCenter._save(items);
    UI.toast('Marked as reviewed.');
    var container = document.getElementById('page-content');
    if (container) container.innerHTML = MediaCenter.render();
  },

  bulkMarkReviewed: function() {
    var ids = MediaCenter._selectedIds.slice();
    if (!ids.length) return;
    var all = MediaCenter.getAll();
    ids.forEach(function(id) {
      var item = all.find(function(m) { return m.id === id; });
      if (item) item.reviewed = true;
    });
    MediaCenter._save(all);
    MediaCenter._selectedIds = [];
    UI.toast(ids.length + ' item' + (ids.length !== 1 ? 's' : '') + ' marked reviewed!');
    var container = document.getElementById('page-content');
    if (container) container.innerHTML = MediaCenter.render();
  },

  // ── Delete ──

  deleteMedia: function(id) {
    if (!confirm('Delete this photo/video? This cannot be undone.')) return;
    var items = MediaCenter.getAll().filter(function(m) { return m.id !== id; });
    MediaCenter._save(items);
    // Remove from selection if present
    var selIdx = MediaCenter._selectedIds.indexOf(id);
    if (selIdx >= 0) MediaCenter._selectedIds.splice(selIdx, 1);
    UI.toast('Media deleted.');
    var container = document.getElementById('page-content');
    if (container) container.innerHTML = MediaCenter.render();
  },

  bulkDelete: function() {
    var ids = MediaCenter._selectedIds.slice();
    if (!ids.length || !confirm('Delete ' + ids.length + ' item' + (ids.length !== 1 ? 's' : '') + '?')) return;
    var all = MediaCenter.getAll().filter(function(m) { return ids.indexOf(m.id) < 0; });
    MediaCenter._save(all);
    MediaCenter._selectedIds = [];
    UI.toast(ids.length + ' item' + (ids.length !== 1 ? 's' : '') + ' deleted');
    var container = document.getElementById('page-content');
    if (container) container.innerHTML = MediaCenter.render();
  },

  _copyCaptionFromModal: function() {
    var el = document.getElementById('mc-export-caption');
    if (!el) return;
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(el.value).then(function() { UI.toast('Caption copied!'); });
      } else {
        el.select();
        document.execCommand('copy');
        UI.toast('Caption copied!');
      }
    } catch(e) { UI.toast('Could not copy — select and copy manually.'); }
  },

  _markExported: function(ids) {
    var items = MediaCenter.getAll();
    items.forEach(function(m) {
      if (ids.indexOf(m.id) >= 0) { m.exported = true; m.reviewed = true; }
    });
    MediaCenter._save(items);
    MediaCenter._selectedIds = [];
    UI.toast(ids.length + ' item' + (ids.length !== 1 ? 's' : '') + ' marked as exported.');
    var container = document.getElementById('page-content');
    if (container) container.innerHTML = MediaCenter.render();
  },

  // ── Dashboard Widget ──

  getWeeklyReminderHtml: function() {
    var all = MediaCenter.getAll();
    var now = new Date();
    var weekAgo = new Date(now.getTime() - 7 * 86400000);
    var thisWeek = all.filter(function(m) { return m.date && new Date(m.date) >= weekAgo; });
    var unreviewed = all.filter(function(m) { return !m.reviewed; });

    if (thisWeek.length === 0 && unreviewed.length === 0) return '';

    return '<div style="background:var(--white);border-radius:12px;padding:16px;border:1px solid var(--border);border-left:4px solid var(--green-dark);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">'
      + '<div>'
      + '<div style="font-size:14px;font-weight:700;">&#128247; Media Reminder</div>'
      + '<div style="font-size:13px;color:var(--text-light);margin-top:3px;">Check this week\'s uploads &amp; schedule social posts</div>'
      + '<div style="display:flex;gap:12px;margin-top:8px;">'
      + '<span style="font-size:12px;background:#e8f5e9;color:var(--green-dark);padding:3px 10px;border-radius:10px;font-weight:600;">' + thisWeek.length + ' photo' + (thisWeek.length !== 1 ? 's' : '') + ' this week</span>'
      + (unreviewed.length > 0 ? '<span style="font-size:12px;background:#fff3e0;color:#e65100;padding:3px 10px;border-radius:10px;font-weight:600;">' + unreviewed.length + ' unreviewed</span>' : '')
      + '</div>'
      + '</div>'
      + '<button class="btn btn-outline" onclick="loadPage(\'mediacenter\')" style="white-space:nowrap;">Review &amp; Export &#8594;</button>'
      + '</div>';
  }

};
