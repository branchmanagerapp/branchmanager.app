/**
 * Branch Manager — Video Walkthrough to AI Quote
 * Record/upload a property walkthrough video, extract frames,
 * AI identifies trees in each frame, deduplicate, auto-generate line items.
 */
var VideoQuote = {

  // State
  _frames: [],        // Array of {time, dataUrl}
  _results: [],       // Array of {species, dbh, condition, service, price, notes, frameIndex}
  _deduped: [],       // Deduplicated tree results
  _processing: false,
  _currentFrame: 0,
  _totalFrames: 0,
  _videoFile: null,

  render: function() {
    var html = '<div style="max-width:700px;margin:0 auto;">';

    // Header
    html += '<div style="text-align:center;padding:20px 0;">'
      + '<div style="font-size:48px;margin-bottom:8px;">🎬</div>'
      + '<h2 style="font-size:22px;margin-bottom:4px;">Video Walkthrough Quote</h2>'
      + '<p style="color:var(--text-light);font-size:14px;margin-bottom:4px;">Record a walkthrough of the property — AI identifies every tree and builds your quote</p>'
      + '<span style="background:var(--accent);color:#fff;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;">BETA</span>'
      + '</div>';

    // Record / Upload buttons
    html += '<div style="display:flex;gap:12px;margin-bottom:16px;">'
      + '<button onclick="VideoQuote._recordVideo()" style="flex:1;padding:18px;background:var(--green-dark);color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">'
      + '<span style="font-size:22px;">📹</span> Record Video</button>'
      + '<button onclick="VideoQuote._uploadVideo()" style="flex:1;padding:18px;background:var(--white);color:var(--text);border:2px solid var(--border);border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">'
      + '<span style="font-size:22px;">📁</span> Upload Video</button>'
      + '</div>';

    // Tips
    html += '<div style="background:var(--bg);border-radius:10px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:var(--text-light);">'
      + '<div style="font-weight:700;color:var(--text);margin-bottom:6px;">Tips for best results:</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">'
      + '<div>&#x2022; Walk slowly around the property</div>'
      + '<div>&#x2022; Keep camera steady, landscape mode</div>'
      + '<div>&#x2022; Pause 2-3 seconds at each tree</div>'
      + '<div>&#x2022; Show the full trunk and canopy</div>'
      + '<div>&#x2022; Max 60 seconds per video</div>'
      + '<div>&#x2022; Good lighting, avoid backlighting</div>'
      + '</div></div>';

    // v402: ZIP input removed — uses default ZIP from Settings → Regional.
    // Same Westchester/Putnam region every time, no per-walkthrough override.

    // v401: Narration — what Doug says while walking. Optional but very
    // useful for the AI prompt (catches details the camera can\'t show:
    // "the leaning oak is dead", "owner wants this one removed", etc.).
    // Web Speech Recognition for hands-free dictation, plain typing also fine.
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:20px;">'
      +   '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">'
      +     '<div><strong style="font-size:13px;">Narration notes <span style="font-weight:400;color:var(--text-light);">(optional)</span></strong>'
      +       '<div style="font-size:11px;color:var(--text-light);">Describe what you see — AI reads this with the frames.</div></div>'
      +     '<button onclick="VideoQuote._toggleDictate()" id="vq-mic-btn" type="button" style="background:var(--white);color:var(--text);border:1px solid var(--border);padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;flex-shrink:0;">'
      +       '<i data-lucide="mic" style="width:14px;height:14px;"></i><span>Dictate</span></button>'
      +   '</div>'
      +   '<textarea id="vq-narration" rows="3" onblur="try{localStorage.setItem(\'bm-vq-last-narration\',this.value);}catch(e){}" placeholder="e.g. The big white oak by the driveway has a cavity at the base, owner wants it removed. Two dead pines at the back fence." style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;line-height:1.5;resize:vertical;box-sizing:border-box;">' + (localStorage.getItem('bm-vq-last-narration') || '') + '</textarea>'
      + '</div>';

    // Processing area (hidden until video selected)
    html += '<div id="vq-processing" style="display:none;"></div>';

    // Frame thumbnails strip
    html += '<div id="vq-frames" style="display:none;margin-bottom:20px;">'
      + '<div style="font-weight:700;font-size:14px;margin-bottom:8px;">Extracted Frames</div>'
      + '<div id="vq-frame-strip" style="display:flex;gap:6px;overflow-x:auto;padding-bottom:8px;"></div>'
      + '</div>';

    // Progress bar
    html += '<div id="vq-progress-wrap" style="display:none;margin-bottom:20px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
      + '<span id="vq-progress-label" style="font-size:14px;font-weight:600;">Analyzing frames...</span>'
      + '<span id="vq-progress-count" style="font-size:13px;color:var(--text-light);">0 / 0</span>'
      + '</div>'
      + '<div style="background:var(--bg);border-radius:8px;height:8px;overflow:hidden;">'
      + '<div id="vq-progress-bar" style="height:100%;background:var(--accent);border-radius:8px;width:0%;transition:width 0.4s ease;"></div>'
      + '</div>'
      + '</div>';

    // Results area
    html += '<div id="vq-results"></div>';

    // API key warning — only if user has explicitly opted out of server-managed AI
    if (!AIConfig.available()) {
      html += '<div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:10px;padding:14px;margin-top:16px;text-align:center;">'
        + '<div style="font-size:14px;font-weight:600;color:#e65100;">AI Key Required</div>'
        + '<div style="font-size:13px;color:var(--text-light);margin-top:4px;">Go to Settings → Integrations → paste your AI API key</div>'
        + '<button onclick="loadPage(\'settings\')" class="btn btn-outline" style="margin-top:8px;font-size:12px;">Open Settings</button>'
        + '</div>';
    }

    html += '</div>';
    return html;
  },

  // ── Record video (rear camera) ──
  _recordVideo: function() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,video/quicktime,video/mp4,.mov,.mp4,.m4v,.webm';
    input.setAttribute('capture', 'environment');
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (file) VideoQuote._handleVideo(file);
    };
    input.click();
  },

  // ── Upload existing video ──
  _uploadVideo: function() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,video/quicktime,video/mp4,.mov,.mp4,.m4v,.webm,.avi,.mkv';
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (file) VideoQuote._handleVideo(file);
    };
    input.click();
  },

  // ── Handle selected video file ──
  _handleVideo: function(file) {
    // Reset state
    VideoQuote._frames = [];
    VideoQuote._results = [];
    VideoQuote._deduped = [];
    VideoQuote._processing = false;
    VideoQuote._currentFrame = 0;
    VideoQuote._lastFile = file; // v717: keep for "save anyway" fallback

    // Check file size (500MB max — iPhone 4K .mov can easily exceed 100MB)
    if (file.size > 500 * 1024 * 1024) {
      UI.toast('Video too large (' + Math.round(file.size / 1024 / 1024) + 'MB). Please keep under 500MB or trim the clip.', 'error');
      return;
    }

    var procEl = document.getElementById('vq-processing');
    if (procEl) {
      procEl.style.display = 'block';
      procEl.innerHTML = '<div style="text-align:center;padding:24px;background:var(--white);border:1px solid var(--border);border-radius:12px;">'
        + '<div style="font-size:32px;margin-bottom:8px;">🎞️</div>'
        + '<div style="font-size:15px;font-weight:600;">Loading video...</div>'
        + '<div style="font-size:13px;color:var(--text-light);margin-top:4px;">Extracting frames every 3 seconds</div>'
        + '</div>';
    }

    var url = URL.createObjectURL(file);
    var video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = function() {
      var duration = Math.min(video.duration, 60); // cap at 60s
      var interval = 3;
      var times = [];
      for (var t = 0; t < duration; t += interval) {
        times.push(t);
      }
      // Always grab the last second if we haven't
      if (times[times.length - 1] < duration - 1) {
        times.push(Math.floor(duration - 0.5));
      }

      VideoQuote._totalFrames = times.length;

      if (procEl) {
        procEl.innerHTML = '<div style="text-align:center;padding:24px;background:var(--white);border:1px solid var(--border);border-radius:12px;">'
          + '<div style="font-size:32px;margin-bottom:8px;">🎞️</div>'
          + '<div style="font-size:15px;font-weight:600;">Extracting ' + times.length + ' frames from ' + Math.round(duration) + 's video...</div>'
          + '<div id="vq-extract-count" style="font-size:13px;color:var(--text-light);margin-top:4px;">Frame 0 of ' + times.length + '</div>'
          + '</div>';
      }

      // Extract frames sequentially
      VideoQuote._extractAllFrames(video, times, 0, function(frames) {
        URL.revokeObjectURL(url);
        VideoQuote._frames = frames;

        if (procEl) procEl.style.display = 'none';

        // Show frame strip
        VideoQuote._showFrameStrip(frames);

        // Start AI analysis
        VideoQuote._analyzeAllFrames(frames);
      });
    };

    video.onerror = function() {
      URL.revokeObjectURL(url);
      VideoQuote._showCodecFallback(file, 'video');
    };

    video.src = url;
  },

  // v717: rich fallback when the browser can't decode the uploaded video.
  // Almost always HEVC iPhone .mov on Chrome/Firefox/non-Apple browsers.
  // Offers: open in new tab (Safari handles HEVC), AirDrop instructions,
  // download the raw file for external conversion, or attach the file as
  // a generic asset on the quote so a Safari-using teammate can review.
  _showCodecFallback: function(file, _ctx) {
    var procEl = document.getElementById('vq-processing');
    var ext = (file.name || '').split('.').pop().toLowerCase();
    var isMov = ext === 'mov' || /quicktime/i.test(file.type || '');
    var isUserAgentApple = /Safari/i.test(navigator.userAgent) && !/Chrome|Edg/i.test(navigator.userAgent);

    var url = URL.createObjectURL(file);

    var html = '<div style="background:#fff7ed;border:1px solid #fdba74;border-radius:12px;padding:18px;">'
      + '<div style="font-size:15px;font-weight:700;color:#9a3412;margin-bottom:6px;">⚠️ This browser can\'t decode the video</div>'
      + '<div style="font-size:12px;color:var(--text-light);margin-bottom:12px;line-height:1.45;">'
      +   (isMov && !isUserAgentApple
            ? 'iPhone <strong>.mov</strong> files are usually HEVC-encoded. Safari + iOS handle them natively, Chrome/Firefox on Windows often don\'t. Quickest fixes:'
            : 'The codec inside <strong>' + UI.esc(file.name) + '</strong> isn\'t supported here. Quickest fixes:')
      + '</div>'
      + '<ol style="font-size:13px;line-height:1.6;color:var(--text);padding-left:20px;margin:0 0 12px;">'
      +   '<li>On iPhone: <strong>Settings → Camera → Formats → Most Compatible</strong> then re-record (gives you H.264 .mov that every browser plays).</li>'
      +   (isUserAgentApple ? '' : '<li>Open this file in <strong>Safari</strong> — Safari decodes HEVC natively even on macOS/iOS.</li>')
      +   '<li>Or use Photos / iMovie on Mac to <strong>Export &rarr; H.264 MP4</strong>, then upload that.</li>'
      + '</ol>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      +   '<a href="' + url + '" download="' + UI.esc(file.name) + '" style="background:var(--white);border:1px solid var(--border);padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;color:var(--text);">⬇ Save raw file</a>'
      +   '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="background:var(--white);border:1px solid var(--border);padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;color:var(--text);">↗ Open in new tab (try Safari)</a>'
      +   '<button onclick="VideoQuote._uploadVideo()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">Try a different file</button>'
      + '</div>'
      + '</div>';

    if (procEl) {
      procEl.style.display = 'block';
      procEl.innerHTML = html;
    }
    UI.toast('Video codec not supported — see fallback options', 'error');
  },

  // ── Extract frames one at a time ──
  _extractAllFrames: function(video, times, index, callback) {
    if (index >= times.length) {
      callback(VideoQuote._frames);
      return;
    }

    var countEl = document.getElementById('vq-extract-count');
    if (countEl) countEl.textContent = 'Frame ' + (index + 1) + ' of ' + times.length;

    VideoQuote._extractFrame(video, times[index]).then(function(dataUrl) {
      VideoQuote._frames.push({ time: times[index], dataUrl: dataUrl });
      VideoQuote._extractAllFrames(video, times, index + 1, callback);
    });
  },

  // ── Extract single frame at given time ──
  _extractFrame: function(video, timeSeconds) {
    return new Promise(function(resolve) {
      video.currentTime = timeSeconds;
      video.onseeked = function() {
        var canvas = document.createElement('canvas');
        // Scale to reasonable size for API
        var scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    });
  },

  // ── Show frame thumbnails ──
  _showFrameStrip: function(frames) {
    var wrapEl = document.getElementById('vq-frames');
    var stripEl = document.getElementById('vq-frame-strip');
    if (!wrapEl || !stripEl) return;

    wrapEl.style.display = 'block';
    var html = '';
    for (var i = 0; i < frames.length; i++) {
      html += '<div id="vq-thumb-' + i + '" style="flex-shrink:0;position:relative;border-radius:8px;overflow:hidden;border:2px solid var(--border);width:100px;height:75px;">'
        + '<img src="' + frames[i].dataUrl + '" style="width:100%;height:100%;object-fit:cover;">'
        + '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.6);color:#fff;font-size:10px;padding:2px 6px;text-align:center;">'
        + Math.round(frames[i].time) + 's</div>'
        + '<div id="vq-thumb-status-' + i + '" style="position:absolute;top:4px;right:4px;width:16px;height:16px;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:10px;">⏳</div>'
        + '</div>';
    }
    stripEl.innerHTML = html;
  },

  // ── Analyze all frames via AI ──
  _analyzeAllFrames: function(frames) {
    var aiKey = localStorage.getItem('bm-claude-key');
    if (!aiKey) {
      UI.toast('Add your AI key in Settings first', 'error');
      return;
    }

    VideoQuote._processing = true;
    VideoQuote._currentFrame = 0;
    VideoQuote._results = [];

    // Show progress
    var progWrap = document.getElementById('vq-progress-wrap');
    if (progWrap) progWrap.style.display = 'block';
    VideoQuote._updateProgress(0, frames.length);

    // Process frames sequentially to avoid rate limits
    VideoQuote._analyzeNextFrame(frames, 0);
  },

  _analyzeNextFrame: function(frames, index) {
    if (index >= frames.length) {
      // All done
      VideoQuote._processing = false;
      var label = document.getElementById('vq-progress-label');
      if (label) label.textContent = 'Analysis complete!';
      VideoQuote._deduplicateAndShow();
      return;
    }

    VideoQuote._currentFrame = index;
    VideoQuote._updateProgress(index, frames.length);

    // Mark thumbnail as processing
    var statusEl = document.getElementById('vq-thumb-status-' + index);
    if (statusEl) statusEl.innerHTML = '<div style="width:12px;height:12px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></div>';

    // Mark thumbnail border
    var thumbEl = document.getElementById('vq-thumb-' + index);
    if (thumbEl) thumbEl.style.borderColor = 'var(--accent)';

    VideoQuote._analyzeFrame(frames[index].dataUrl, index + 1, frames[index].time).then(function(trees) {
      // Mark thumbnail complete
      if (statusEl) statusEl.innerHTML = trees.length > 0 ? '🌳' : '✓';
      if (thumbEl) thumbEl.style.borderColor = trees.length > 0 ? 'var(--green-dark)' : 'var(--border)';

      // Store results with frame reference
      for (var i = 0; i < trees.length; i++) {
        trees[i].frameIndex = index;
        trees[i].frameTime = frames[index].time;
        trees[i].frameThumb = frames[index].dataUrl;
        VideoQuote._results.push(trees[i]);
      }

      // Show running count
      VideoQuote._updateResultsCount();

      // Small delay to avoid rate limiting
      setTimeout(function() {
        VideoQuote._analyzeNextFrame(frames, index + 1);
      }, 500);
    });
  },

  _updateProgress: function(current, total) {
    var label = document.getElementById('vq-progress-label');
    var count = document.getElementById('vq-progress-count');
    var bar = document.getElementById('vq-progress-bar');

    if (label) label.textContent = 'Analyzing frame ' + (current + 1) + ' of ' + total + '...';
    if (count) count.textContent = (current + 1) + ' / ' + total;
    if (bar) bar.style.width = Math.round(((current + 1) / total) * 100) + '%';
  },

  _updateResultsCount: function() {
    var resultsEl = document.getElementById('vq-results');
    if (!resultsEl || !VideoQuote._processing) return;

    var count = VideoQuote._results.length;
    if (count > 0) {
      resultsEl.innerHTML = '<div style="text-align:center;padding:12px;font-size:14px;color:var(--text-light);">'
        + '<span style="font-size:20px;">🌳</span> Found <strong>' + count + '</strong> tree identification' + (count !== 1 ? 's' : '') + ' so far...'
        + '</div>';
    }
  },

  // ── Analyze a single frame ──
  _analyzeFrame: function(imageDataUrl, frameNumber, timeSeconds) {
    var aiKey = localStorage.getItem('bm-claude-key');
    if (!aiKey) return Promise.resolve([]);

    var base64 = imageDataUrl.split(',')[1];
    var mediaType = 'image/jpeg';
    var zip = localStorage.getItem('bm-zip') || '10566';

    // v401: pull narration from the textarea (or remembered fallback) so
    // every frame's prompt has Doug's spoken context alongside the image.
    var narrationEl = document.getElementById('vq-narration');
    var narration = (narrationEl ? narrationEl.value : (localStorage.getItem('bm-vq-last-narration') || '')).trim();
    var narrationLine = narration
      ? '\n\nThe operator narrated this walkthrough as follows — use it to disambiguate species, condition, and what work the owner wants:\n"""\n' + narration + '\n"""\n'
      : '';

    return fetch('https://ltpivkqahvplapyagljt.supabase.co/functions/v1/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: (window.bmAIKey ? window.bmAIKey() : aiKey) || aiKey,
        model: 'claude-sonnet-4-5',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'You are an ISA certified arborist. This is frame ' + frameNumber + ' (at ' + Math.round(timeSeconds) + 's) from a property walkthrough video in ZIP ' + zip + '.' + narrationLine + '\n\nIdentify ALL trees visible in this frame. For each tree provide:\n- species: common name\n- dbh: estimated diameter at breast height in inches\n- condition: good, fair, poor, dead, or hazardous\n- service: one of "Tree Removal", "Tree Pruning", "Stump Removal", "Dead Wood Removal", "Crown Reduction", "Cabling", "Hazard Assessment"\n- price: suggested price in dollars (Westchester NY market rates, consider DBH x $100 for removals, radius x $10 for pruning)\n- notes: brief note about access, hazards, equipment needed\n\nRespond with ONLY a JSON array. Example:\n[{"species":"Red Oak","dbh":"24","condition":"fair","service":"Tree Pruning","price":800,"notes":"Near power lines, bucket truck needed"}]\n\nIf no trees are visible, respond with: []' }
          ]
        }]
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var text = data.content && data.content[0] ? data.content[0].text : '[]';
      try {
        var match = text.match(/\[[\s\S]*\]/);
        return match ? JSON.parse(match[0]) : [];
      } catch(e) {
        console.warn('VideoQuote parse error frame ' + frameNumber + ':', e);
        return [];
      }
    })
    .catch(function(e) {
      console.warn('VideoQuote API error frame ' + frameNumber + ':', e);
      return [];
    });
  },

  // ── Deduplicate trees across frames ──
  _deduplicateAndShow: function() {
    var raw = VideoQuote._results;
    if (raw.length === 0) {
      VideoQuote._showNoResults();
      return;
    }

    // Group by species + similar DBH (within 4 inches = likely same tree)
    var groups = [];
    for (var i = 0; i < raw.length; i++) {
      var tree = raw[i];
      var species = (tree.species || '').toLowerCase().trim();
      var dbh = parseInt(tree.dbh) || 0;
      var matched = false;

      for (var g = 0; g < groups.length; g++) {
        var grpSpecies = (groups[g].species || '').toLowerCase().trim();
        var grpDbh = parseInt(groups[g].dbh) || 0;

        // Same species and DBH within 4 inches = same tree
        if (species === grpSpecies && Math.abs(dbh - grpDbh) <= 4) {
          groups[g].sightings.push(tree);
          // Use highest confidence data (most frames = more reliable)
          if (tree.price > groups[g].price) {
            groups[g].price = tree.price;
          }
          matched = true;
          break;
        }
      }

      if (!matched) {
        groups.push({
          species: tree.species || 'Unknown',
          dbh: tree.dbh || '?',
          condition: tree.condition || 'fair',
          service: tree.service || 'Tree Pruning',
          price: tree.price || 0,
          notes: tree.notes || '',
          frameThumb: tree.frameThumb,
          frameTime: tree.frameTime,
          sightings: [tree]
        });
      }
    }

    VideoQuote._deduped = groups;
    VideoQuote._showResults(groups);
  },

  _showNoResults: function() {
    var resultsEl = document.getElementById('vq-results');
    if (!resultsEl) return;

    resultsEl.innerHTML = '<div style="text-align:center;padding:32px;background:var(--white);border:1px solid var(--border);border-radius:12px;">'
      + '<div style="font-size:48px;margin-bottom:12px;">🔍</div>'
      + '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">No trees detected</div>'
      + '<div style="font-size:13px;color:var(--text-light);">Try recording again with clearer shots of the trees. Walk slowly and pause at each tree.</div>'
      + '</div>';
  },

  // ── Show deduplicated results ──
  _showResults: function(groups) {
    var resultsEl = document.getElementById('vq-results');
    if (!resultsEl) return;

    var totalPrice = 0;
    for (var i = 0; i < groups.length; i++) {
      totalPrice += (groups[i].price || 0);
    }

    var html = '';

    // Summary bar
    html += '<div style="background:var(--green-dark);color:#fff;border-radius:12px;padding:16px 20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">'
      + '<div>'
      + '<div style="font-size:18px;font-weight:800;">' + groups.length + ' Tree' + (groups.length !== 1 ? 's' : '') + ' Identified</div>'
      + '<div style="font-size:13px;opacity:.8;">From ' + VideoQuote._frames.length + ' frames analyzed</div>'
      + '</div>'
      + '<div style="text-align:right;">'
      + '<div style="font-size:22px;font-weight:800;">' + UI.money(totalPrice) + '</div>'
      + '<div style="font-size:12px;opacity:.8;">Estimated total</div>'
      + '</div></div>';

    // Tree cards
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var condColor = g.condition === 'good' ? '#2e7d32' : g.condition === 'fair' ? '#e6a817' : g.condition === 'poor' ? '#e65100' : g.condition === 'dead' || g.condition === 'hazardous' ? '#c62828' : '#6c757d';

      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:12px;">'
        + '<div style="display:flex;gap:0;">';

      // Thumbnail
      if (g.frameThumb) {
        html += '<div style="width:120px;flex-shrink:0;position:relative;">'
          + '<img src="' + g.frameThumb + '" style="width:100%;height:100%;object-fit:cover;min-height:140px;">'
          + '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.6);color:#fff;font-size:10px;padding:3px 6px;text-align:center;">@ ' + Math.round(g.frameTime) + 's</div>'
          + '</div>';
      }

      // Details
      html += '<div style="flex:1;padding:14px 16px;min-width:0;">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">'
        + '<div style="min-width:0;">'
        + '<div style="font-size:16px;font-weight:800;">🌳 ' + g.species + '</div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">'
        + '<span style="font-size:12px;background:var(--bg);padding:2px 8px;border-radius:6px;">' + g.dbh + '" DBH</span>'
        + '<span style="font-size:12px;background:' + condColor + '20;color:' + condColor + ';padding:2px 8px;border-radius:6px;font-weight:600;text-transform:capitalize;">' + g.condition + '</span>'
        + '<span style="font-size:12px;background:#e3f2fd;color:#1565c0;padding:2px 8px;border-radius:6px;">Seen ' + g.sightings.length + 'x</span>'
        + '</div></div>'
        + '<div style="text-align:right;flex-shrink:0;">'
        + '<div style="font-size:18px;font-weight:800;color:var(--green-dark);">' + UI.money(g.price) + '</div>'
        + '</div></div>';

      // Service + notes
      html += '<div style="margin-top:8px;font-size:13px;">'
        + '<span style="font-weight:600;color:var(--accent);">' + g.service + '</span>';
      if (g.notes) {
        html += ' <span style="color:var(--text-light);">— ' + g.notes + '</span>';
      }
      html += '</div>';

      // Inline price edit
      html += '<div style="display:flex;align-items:center;gap:8px;margin-top:10px;">'
        + '<label style="font-size:12px;color:var(--text-light);white-space:nowrap;">Adjust price:</label>'
        + '<input type="number" id="vq-price-' + i + '" value="' + (g.price || 0) + '" min="0" step="50" style="width:100px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-weight:600;" onchange="VideoQuote._updatePrice(' + i + ',this.value)">'
        + '<button onclick="VideoQuote._removeTree(' + i + ')" style="background:none;border:none;cursor:pointer;color:#dc3545;font-size:18px;padding:4px;" title="Remove this tree">&#x2715;</button>'
        + '</div>';

      html += '</div></div></div>';
    }

    // Total + Create Quote button
    html += '<div style="background:var(--white);border:2px solid var(--accent);border-radius:12px;padding:20px;text-align:center;margin-top:8px;">'
      + '<div id="vq-total-line" style="font-size:14px;color:var(--text-light);margin-bottom:8px;">'
      + groups.length + ' line item' + (groups.length !== 1 ? 's' : '') + ' totaling <strong style="font-size:18px;color:var(--text);">' + UI.money(totalPrice) + '</strong>'
      + '</div>'
      + '<button onclick="VideoQuote._createQuote()" style="width:100%;padding:16px;background:var(--accent);color:#fff;border:none;border-radius:10px;font-size:17px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">'
      + '<span style="font-size:20px;">📋</span> Create Quote from Results</button>'
      + '<div style="font-size:12px;color:var(--text-light);margin-top:8px;">Items will be added to a new quote — you can edit before sending</div>'
      + '</div>';

    // Try again
    html += '<div style="text-align:center;margin-top:16px;">'
      + '<button onclick="VideoQuote._reset()" class="btn btn-outline" style="font-size:13px;">🎬 Record Another Video</button>'
      + '</div>';

    resultsEl.innerHTML = html;
  },

  // ── Update price inline ──
  _updatePrice: function(index, newPrice) {
    if (VideoQuote._deduped[index]) {
      VideoQuote._deduped[index].price = parseFloat(newPrice) || 0;
      VideoQuote._refreshTotal();
    }
  },

  // ── Remove tree from results ──
  _removeTree: function(index) {
    VideoQuote._deduped.splice(index, 1);
    if (VideoQuote._deduped.length === 0) {
      VideoQuote._showNoResults();
    } else {
      VideoQuote._showResults(VideoQuote._deduped);
    }
  },

  // ── Refresh total display ──
  _refreshTotal: function() {
    var total = 0;
    for (var i = 0; i < VideoQuote._deduped.length; i++) {
      total += (VideoQuote._deduped[i].price || 0);
    }
    var totalLine = document.getElementById('vq-total-line');
    if (totalLine) {
      totalLine.innerHTML = VideoQuote._deduped.length + ' line item' + (VideoQuote._deduped.length !== 1 ? 's' : '') + ' totaling <strong style="font-size:18px;color:var(--text);">' + UI.money(total) + '</strong>';
    }
  },

  // ── Create quote from results ──
  _createQuote: function() {
    var items = [];
    for (var i = 0; i < VideoQuote._deduped.length; i++) {
      var g = VideoQuote._deduped[i];
      items.push({
        service: g.service || 'Tree Service',
        description: (g.species || 'Tree') + ' — ' + (g.dbh || '?') + '" DBH — ' + (g.condition || '') + (g.notes ? ' — ' + g.notes : ''),
        qty: 1,
        rate: g.price || 0
      });
    }

    // Store items for the quote form to pick up. Both videoquote and aitreeid
    // write here; QuotesPage.showForm reads + clears it (added v547).
    localStorage.setItem('bm-ai-pending-items', JSON.stringify(items));
    UI.toast(items.length + ' tree' + (items.length === 1 ? '' : 's') + ' detected — opening quote', 'success');

    // Open the new-quote form directly so the shim consumes the items.
    // Old behavior loaded the quotes LIST, leaving the items orphaned in
    // localStorage and forcing the user to manually click "+ New Quote".
    setTimeout(function() {
      if (typeof QuotesPage !== 'undefined' && QuotesPage.showForm) {
        QuotesPage.showForm(null, null);
      } else {
        loadPage('quotes');
      }
    }, 800);
  },

  // ── Reset for another video ──
  // v401: hands-free narration via Web Speech Recognition. Free, browser-built-in,
  // works on Chrome + Safari (iOS 14.5+ and macOS). No external transcription
  // service or API key needed. Final transcripts get appended to the textarea
  // as the user dictates so they can edit before generating quotes.
  _recog: null,
  _toggleDictate: function() {
    var btn = document.getElementById('vq-mic-btn');
    var ta  = document.getElementById('vq-narration');
    if (!ta) return;

    // Currently recording → stop
    if (VideoQuote._recog) {
      try { VideoQuote._recog.stop(); } catch(e){}
      VideoQuote._recog = null;
      if (btn) {
        btn.style.background = 'var(--white)';
        btn.style.color = 'var(--text)';
        btn.querySelector('span').textContent = 'Dictate';
      }
      return;
    }

    // Browser support check
    var Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recog) {
      UI.toast('Dictation not supported in this browser. Type your notes instead, or use your phone keyboard\'s mic button.', 'error');
      return;
    }

    var r = new Recog();
    r.lang = 'en-US';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = function(ev) {
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) {
          var t = ev.results[i][0].transcript.trim();
          if (t) {
            ta.value = (ta.value ? ta.value + ' ' : '') + t;
            // Persist as we go so a refresh doesn\'t lose the dictation
            try { localStorage.setItem('bm-vq-last-narration', ta.value); } catch(e){}
          }
        }
      }
    };
    r.onerror = function(ev) {
      if (ev.error !== 'no-speech') UI.toast('Dictation error: ' + ev.error, 'error');
    };
    r.onend = function() {
      // Auto-clean state if the engine stops unexpectedly
      if (VideoQuote._recog) {
        VideoQuote._recog = null;
        if (btn) {
          btn.style.background = 'var(--white)';
          btn.style.color = 'var(--text)';
          btn.querySelector('span').textContent = 'Dictate';
        }
      }
    };
    try { r.start(); } catch(e) { UI.toast('Could not start dictation: ' + e.message, 'error'); return; }
    VideoQuote._recog = r;
    if (btn) {
      btn.style.background = '#dc2626';
      btn.style.color = '#fff';
      btn.querySelector('span').textContent = 'Stop';
    }
  },

  _reset: function() {
    VideoQuote._frames = [];
    VideoQuote._results = [];
    VideoQuote._deduped = [];
    VideoQuote._processing = false;
    VideoQuote._currentFrame = 0;
    VideoQuote._totalFrames = 0;
    loadPage('videoquote');
  }
};
