/**
 * Branch Manager — AI Tree ID (Beta)
 * Take a photo of a tree → AI vision identifies species, DBH, condition
 * Returns a line-item-ready result with suggested service + price
 */
var AITreeID = {
  render: function() {
    var html = '<div style="max-width:600px;margin:0 auto;">'
      + '<div style="text-align:center;padding:20px 0;">'
      + '<div style="font-size:48px;margin-bottom:8px;">🌳</div>'
      + '<h2 style="font-size:22px;margin-bottom:4px;">AI Tree Identification</h2>'
      + '<p style="color:var(--text-light);font-size:14px;margin-bottom:4px;">Take a photo → AI identifies species, size & condition → instant line item</p>'
      + '<span style="background:var(--accent);color:#fff;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:700;">BETA</span>'
      + '</div>';

    // Camera button
    html += '<button onclick="AITreeID.takePhoto()" style="width:100%;padding:18px;background:var(--green-dark);color:#fff;border:none;border-radius:12px;font-size:17px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:16px;">'
      + '<span style="font-size:24px;">📷</span> Take Photo of Tree</button>';

    // Or upload
    html += '<button onclick="AITreeID.uploadPhoto()" style="width:100%;padding:14px;background:var(--white);color:var(--text);border:2px solid var(--border);border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:24px;">'
      + '📁 Upload from Gallery</button>';

    // Zip code setting
    var zip = localStorage.getItem('bm-zip') || '10566';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:13px;color:var(--text-light);">'
      + '<span>📍 ZIP:</span>'
      + '<input type="text" id="ai-zip" value="' + zip + '" maxlength="5" style="width:60px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:13px;text-align:center;" onchange="localStorage.setItem(\'bm-zip\',this.value)">'
      + '<span style="font-size:11px;">(for species/disease info)</span>'
      + '</div>';

    // Results area
    html += '<div id="ai-tree-results"></div>';

    // History
    var history = AITreeID._getHistory();
    if (history.length) {
      html += '<div style="margin-top:24px;border-top:1px solid var(--border);padding-top:16px;">'
        + '<h3 style="font-size:16px;margin-bottom:12px;">Recent Identifications</h3>';
      history.slice(0, 10).forEach(function(h) {
        html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;display:flex;gap:12px;align-items:center;">'
          + (h.photo ? '<img src="' + h.photo + '" style="width:60px;height:60px;object-fit:cover;border-radius:8px;flex-shrink:0;">' : '')
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-weight:700;font-size:14px;">' + (h.species || 'Unknown') + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);">' + (h.dbh || '?') + '" DBH · ' + (h.condition || '?') + ' · ' + (h.suggestedService || '') + '</div>'
          + '<div style="font-size:13px;font-weight:700;color:var(--green-dark);margin-top:2px;">Suggested: ' + UI.money(h.suggestedPrice || 0) + '</div>'
          + '</div>'
          + '<button onclick="AITreeID._addToQuote(' + JSON.stringify(h).replace(/"/g, '&quot;') + ')" style="background:var(--accent);color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">+ Add to Quote</button>'
          + '</div>';
      });
      html += '</div>';
    }

    // API key notice — only when AI is genuinely unreachable (server-managed = default-on)
    if (!AIConfig.available()) {
      html += '<div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:10px;padding:14px;margin-top:16px;text-align:center;">'
        + '<div style="font-size:14px;font-weight:600;color:#e65100;">⚠️ AI Key Required</div>'
        + '<div style="font-size:13px;color:var(--text-light);margin-top:4px;">Go to Settings → Integrations → paste your AI API key</div>'
        + '<button onclick="loadPage(\'settings\')" class="btn btn-outline" style="margin-top:8px;font-size:12px;">Open Settings</button>'
        + '</div>';
    }

    html += '</div>';
    return html;
  },

  takePhoto: function() {
    AITreeID._openCamera('environment'); // rear camera
  },

  uploadPhoto: function() {
    AITreeID._openCamera(null); // file picker
  },

  _openCamera: function(capture) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.capture = capture;
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;

      var resultsEl = document.getElementById('ai-tree-results');
      if (resultsEl) {
        resultsEl.innerHTML = '<div style="text-align:center;padding:24px;">'
          + '<div style="font-size:32px;margin-bottom:8px;">🔍</div>'
          + '<div style="font-size:15px;font-weight:600;">Analyzing tree...</div>'
          + '<div style="font-size:13px;color:var(--text-light);margin-top:4px;">AI is identifying species, size, and condition</div>'
          + '</div>';
      }

      var reader = new FileReader();
      reader.onload = function(ev) {
        var dataUrl = ev.target.result;
        AITreeID._identify(dataUrl);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  },

  _identify: function(imageDataUrl) {
    var aiKey = localStorage.getItem('bm-claude-key');
    if (!aiKey) {
      UI.toast('Add AI key in Settings first', 'error');
      return;
    }

    var base64 = imageDataUrl.split(',')[1];
    var mediaType = imageDataUrl.split(';')[0].split(':')[1];

    fetch('https://ltpivkqahvplapyagljt.supabase.co/functions/v1/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: (window.bmAIKey ? window.bmAIKey() : aiKey) || aiKey,
        model: 'claude-haiku-4-5',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'You are a certified arborist (ISA) with 20 years experience. Location: ZIP ' + (localStorage.getItem('bm-zip') || '10566') + '. Analyze this tree photo and provide:\n\n1. Species (common name and scientific name)\n2. Estimated DBH (diameter at breast height in inches)\n3. Condition (excellent/good/fair/poor/dead/hazardous)\n4. Height estimate (feet)\n5. Hazards (power lines, structures, lean, decay, dead limbs)\n6. Recommended service (Tree Removal, Tree Pruning, Cabling, Stump Removal, Dead Wood Removal, Crown Reduction, or Hazard Assessment)\n7. Suggested price range based on size and complexity (Westchester NY market rates)\n8. Notes for the crew (access concerns, equipment needed)\n9. Is this species native or invasive to this ZIP code region?\n10. Top 3 common diseases/pests for this species in the Northeast US\n11. USDA hardiness zone for this ZIP\n\nRespond in ONLY this JSON format:\n{"species":"Common Name","scientific":"Scientific Name","dbh":"estimated inches","height":"estimated feet","condition":"good/fair/poor/dead/hazardous","hazards":"description or none","suggestedService":"service name","priceMin":0,"priceMax":0,"suggestedPrice":0,"equipmentNeeded":"bucket truck, chipper, etc","crewNotes":"access notes, special concerns","native":true,"invasive":false,"diseases":["Disease 1","Disease 2","Disease 3"],"hardinessZone":"6b"}' }
          ]
        }]
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var text = data.content && data.content[0] ? data.content[0].text : '';
      try {
        var match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('No JSON');
        var tree = JSON.parse(match[0]);
        tree.photo = imageDataUrl.substring(0, 200) + '...'; // truncate for storage
        tree.photoFull = imageDataUrl;
        tree.timestamp = new Date().toISOString();
        AITreeID._showResult(tree, imageDataUrl);
        AITreeID._saveToHistory(tree);
      } catch(e) {
        console.warn('AI Tree ID parse error:', e, text);
        var resultsEl = document.getElementById('ai-tree-results');
        if (resultsEl) {
          resultsEl.innerHTML = '<div style="background:#ffebee;border-radius:10px;padding:16px;text-align:center;">'
            + '<div style="font-size:14px;font-weight:600;color:#c62828;">Could not identify tree</div>'
            + '<div style="font-size:12px;color:var(--text-light);margin-top:4px;">Try a clearer photo showing the full trunk and canopy</div>'
            + '<pre style="text-align:left;font-size:11px;margin-top:8px;max-height:100px;overflow:auto;background:#fff;padding:8px;border-radius:6px;">' + text.substring(0, 300) + '</pre>'
            + '</div>';
        }
      }
    })
    .catch(function(e) {
      var resultsEl = document.getElementById('ai-tree-results');
      if (resultsEl) {
        resultsEl.innerHTML = '<div style="background:#ffebee;border-radius:10px;padding:16px;text-align:center;">'
          + '<div style="font-size:14px;font-weight:600;color:#c62828;">AI unavailable</div>'
          + '<div style="font-size:12px;color:var(--text-light);margin-top:4px;">' + e.message + '</div></div>';
      }
    });
  },

  _showResult: function(tree, imageDataUrl) {
    var resultsEl = document.getElementById('ai-tree-results');
    if (!resultsEl) return;

    resultsEl.innerHTML = '<div style="background:var(--white);border:2px solid var(--accent);border-radius:12px;overflow:hidden;">'
      // Photo
      + '<img src="' + imageDataUrl + '" style="width:100%;max-height:250px;object-fit:cover;">'
      // Species header
      + '<div style="padding:16px 20px;border-bottom:1px solid var(--border);">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
      + '<div>'
      + '<div style="font-size:20px;font-weight:800;">🌳 ' + (tree.species || 'Unknown Species') + '</div>'
      + (tree.scientific ? '<div style="font-size:13px;color:var(--text-light);font-style:italic;">' + tree.scientific + '</div>' : '')
      + '</div>'
      + '<div style="text-align:right;">'
      + '<div style="font-size:24px;font-weight:800;color:var(--green-dark);">' + UI.money(tree.suggestedPrice || 0) + '</div>'
      + (tree.priceMin && tree.priceMax ? '<div style="font-size:11px;color:var(--text-light);">Range: ' + UI.money(tree.priceMin) + ' – ' + UI.money(tree.priceMax) + '</div>' : '')
      + '</div></div></div>'
      // Details grid
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--border);">'
      + '<div style="background:var(--white);padding:12px;text-align:center;"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;">DBH</div><div style="font-size:18px;font-weight:700;">' + (tree.dbh || '?') + '"</div></div>'
      + '<div style="background:var(--white);padding:12px;text-align:center;"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Height</div><div style="font-size:18px;font-weight:700;">' + (tree.height || '?') + '\'</div></div>'
      + '<div style="background:var(--white);padding:12px;text-align:center;"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Condition</div><div style="font-size:18px;font-weight:700;color:' + (tree.condition === 'good' || tree.condition === 'excellent' ? 'var(--green-dark)' : tree.condition === 'fair' ? '#e07c24' : '#dc3545') + ';">' + (tree.condition || '?') + '</div></div>'
      + '</div>'
      // Service + equipment
      + '<div style="padding:14px 20px;">'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">'
      + '<span style="background:#e8f5e9;color:#2e7d32;padding:4px 12px;border-radius:8px;font-size:13px;font-weight:600;">' + (tree.suggestedService || 'Tree Service') + '</span>'
      + (tree.equipmentNeeded ? '<span style="background:#e3f2fd;color:#1565c0;padding:4px 12px;border-radius:8px;font-size:13px;">' + tree.equipmentNeeded + '</span>' : '')
      + '</div>'
      + (tree.native === false || tree.invasive ? '<span style="background:#ffebee;color:#c62828;padding:4px 12px;border-radius:8px;font-size:13px;font-weight:600;">⚠️ Invasive</span>' : tree.native ? '<span style="background:#e8f5e9;color:#2e7d32;padding:4px 12px;border-radius:8px;font-size:13px;">🌿 Native</span>' : '')
      + (tree.hardinessZone ? '<span style="background:var(--bg);padding:4px 12px;border-radius:8px;font-size:12px;color:var(--text-light);">Zone ' + tree.hardinessZone + '</span>' : '')
      + '</div>'
      + (tree.hazards && tree.hazards !== 'none' ? '<div style="background:#fff3e0;padding:8px 12px;border-radius:8px;font-size:13px;color:#e65100;margin-bottom:8px;">⚠️ ' + tree.hazards + '</div>' : '')
      + (tree.diseases && tree.diseases.length ? '<div style="background:#fce4ec;padding:10px 12px;border-radius:8px;font-size:13px;margin-bottom:8px;"><strong style="color:#c62828;">🦠 Common diseases:</strong><ul style="margin:4px 0 0 16px;padding:0;">' + tree.diseases.map(function(d) { return '<li style="margin-bottom:2px;">' + d + '</li>'; }).join('') + '</ul></div>' : '')
      + (tree.crewNotes ? '<div style="font-size:13px;color:var(--text-light);">📋 ' + tree.crewNotes + '</div>' : '')
      + '</div>'
      // Actions
      + '<div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;">'
      + '<button onclick="AITreeID._addToQuote(' + JSON.stringify({species:tree.species,dbh:tree.dbh,condition:tree.condition,suggestedService:tree.suggestedService,suggestedPrice:tree.suggestedPrice,crewNotes:tree.crewNotes}).replace(/"/g, '&quot;') + ')" class="btn btn-primary" style="flex:1;">+ Add to New Quote</button>'
      + '<button onclick="AITreeID.takePhoto()" class="btn btn-outline" style="flex:1;">📷 Next Tree</button>'
      + '</div></div>';
  },

  _addToQuote: function(tree) {
    // Store tree data for the quote form to pick up
    var pending = JSON.parse(localStorage.getItem('bm-ai-pending-items') || '[]');
    pending.push({
      service: tree.suggestedService || 'Tree Service',
      description: (tree.species || 'Tree') + ' — ' + (tree.dbh || '?') + '" DBH — ' + (tree.condition || '') + (tree.crewNotes ? ' — ' + tree.crewNotes : ''),
      qty: 1,
      rate: tree.suggestedPrice || 0
    });
    localStorage.setItem('bm-ai-pending-items', JSON.stringify(pending));
    UI.toast('Added to quote! ' + pending.length + ' item(s) ready — go to New Quote to use them.');
  },

  _getHistory: function() {
    try {
      return JSON.parse(localStorage.getItem('bm-ai-tree-history') || '[]');
    } catch(e) { return []; }
  },

  _saveToHistory: function(tree) {
    var history = AITreeID._getHistory();
    // Don't store full image in history (too large for localStorage)
    var slim = Object.assign({}, tree);
    delete slim.photoFull;
    slim.photo = tree.photoFull ? tree.photoFull.substring(0, 100) : '';
    history.unshift(slim);
    if (history.length > 20) history = history.slice(0, 20);
    try {
      localStorage.setItem('bm-ai-tree-history', JSON.stringify(history));
    } catch(e) {
      // localStorage full — trim more aggressively
      history = history.slice(0, 5);
      localStorage.setItem('bm-ai-tree-history', JSON.stringify(history));
    }
  }
};
