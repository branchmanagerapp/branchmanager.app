/**
 * Branch Manager — Voice-to-Quote
 *
 * Tap Record, walk the property, describe what you see ("big oak out back needs
 * full removal, DBH about 30 inches, power lines nearby, crane access from
 * driveway"). When you stop, the AI converts the transcript into a structured
 * draft — line items priced against your services catalog + T&M rates — and
 * opens the quote form pre-filled.
 *
 * Requires:
 *   - bm-claude-key set in Settings
 *   - Web Speech API (Chrome, Safari 14.1+, Edge)
 *   - QuotesPage.showForm reads localStorage.bm-voice-quote-draft
 */
var VoiceQuote = {
  _recog: null,
  _recording: false,
  _transcript: '',
  _interim: '',
  _startedAt: 0,
  _timerInt: null,

  render: function() {
    var supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    var apiKeyOk = AIConfig.available();

    var html = '<div style="max-width:680px;margin:0 auto;padding-bottom:80px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">'
      +   '<button class="btn btn-outline" onclick="loadPage(\'quotes\')" style="font-size:13px;">← Back</button>'
      +   '<span style="background:var(--accent);color:#fff;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700;">BETA</span>'
      + '</div>'
      + '<div style="text-align:center;padding:8px 0 20px;">'
      +   '<div style="font-size:40px;margin-bottom:6px;">🎙️</div>'
      +   '<h2 style="font-size:22px;margin:0 0 4px;">Voice-to-Quote</h2>'
      +   '<p style="color:var(--text-light);font-size:13px;margin:0;">Walk the job, describe what you see — AI builds the quote.</p>'
      + '</div>';

    if (!supported) {
      html += '<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:14px;margin-bottom:16px;font-size:13px;">'
        + '⚠️ Speech recognition is not supported in this browser. Open this page in Safari or Chrome on your phone.'
        + '</div>';
    }
    if (!apiKeyOk) {
      html += '<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:14px;margin-bottom:16px;font-size:13px;">'
        + '⚠️ No AI API key set. Go to <a onclick="loadPage(\'settings\')" style="color:var(--accent);cursor:pointer;font-weight:600;">Settings → AI Assistant</a> to add one.'
        + '</div>';
    }

    // Client picker (optional — if they know who it's for)
    var clients = [];
    try { clients = JSON.parse(localStorage.getItem('bm-clients') || '[]'); } catch(e) {}
    clients.sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); });
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px;">'
      + '<label style="font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px;">Client (optional)</label>'
      + '<input type="text" id="vq-client-search" placeholder="Search existing client, or leave blank" oninput="VoiceQuote._searchClients(this.value)" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;">'
      + '<input type="hidden" id="vq-client-id" value="">'
      + '<div id="vq-client-results" style="display:none;margin-top:6px;"></div>'
      + '</div>';

    // Record button + timer
    html += '<div style="background:var(--white);border:2px solid var(--border);border-radius:14px;padding:24px;text-align:center;margin-bottom:14px;">'
      +   '<button id="vq-record-btn" onclick="VoiceQuote.toggleRecord()" ' + (!supported || !apiKeyOk ? 'disabled' : '') + ' style="width:110px;height:110px;border-radius:50%;background:' + (supported && apiKeyOk ? '#dc2626' : '#9ca3af') + ';color:#fff;border:none;font-size:38px;cursor:' + (supported && apiKeyOk ? 'pointer' : 'not-allowed') + ';box-shadow:0 4px 16px rgba(220,38,38,0.3);transition:transform .1s;">🎙️</button>'
      +   '<div id="vq-status" style="margin-top:14px;font-size:14px;font-weight:700;color:var(--text-light);">Tap to start recording</div>'
      +   '<div id="vq-timer" style="font-size:28px;font-weight:700;font-variant-numeric:tabular-nums;margin-top:4px;display:none;">0:00</div>'
      + '</div>'

      // Live transcript
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px;">'
      +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      +     '<label style="font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;">Transcript</label>'
      +     '<button onclick="VoiceQuote._clearTranscript()" style="background:none;border:none;color:var(--text-light);font-size:12px;cursor:pointer;text-decoration:underline;">Clear</button>'
      +   '</div>'
      +   '<textarea id="vq-transcript" placeholder="Your dictation appears here. You can also edit or paste text before generating." style="width:100%;min-height:140px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;box-sizing:border-box;"></textarea>'
      +   '<div id="vq-interim" style="font-size:13px;color:var(--text-light);font-style:italic;margin-top:4px;min-height:18px;"></div>'
      + '</div>'

      // Generate button
      + '<button id="vq-gen-btn" onclick="VoiceQuote.generate()" ' + (!apiKeyOk ? 'disabled' : '') + ' style="width:100%;padding:16px;background:var(--green-dark);color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:' + (apiKeyOk ? 'pointer' : 'not-allowed') + ';opacity:' + (apiKeyOk ? '1' : '0.5') + ';">✨ Generate Quote Draft</button>'
      + '<div id="vq-gen-status" style="margin-top:10px;font-size:13px;text-align:center;color:var(--text-light);"></div>'

      // Tips
      + '<div style="background:var(--bg);border-radius:10px;padding:14px;margin-top:20px;font-size:13px;color:var(--text-light);">'
      +   '<div style="font-weight:700;color:var(--text);margin-bottom:6px;">What to say:</div>'
      +   'Describe each tree/task — species, rough DBH, height, condition, complexity (power lines, near house, crane access, etc.), work needed. Mention equipment you\'ll use and total crew hours if you know. Example: <em>"Big dead oak out back, about 30 inch DBH, 60 feet tall, near power lines. Full removal with crane. Two smaller maples — pruning only. Grind one stump. Half day with full crew."</em>'
      + '</div>'

      + '</div>';

    document.getElementById('pageContent').innerHTML = html;
    document.getElementById('pageTitle').textContent = 'Voice-to-Quote';
    document.getElementById('pageAction').style.display = 'none';
  },

  _searchClients: function(q) {
    q = (q || '').trim().toLowerCase();
    var resultsEl = document.getElementById('vq-client-results');
    var hiddenEl = document.getElementById('vq-client-id');
    if (!q) { resultsEl.style.display = 'none'; hiddenEl.value = ''; return; }
    var clients = [];
    try { clients = JSON.parse(localStorage.getItem('bm-clients') || '[]'); } catch(e) {}
    var matches = clients.filter(function(c){
      return (c.name || '').toLowerCase().indexOf(q) !== -1 || (c.address || '').toLowerCase().indexOf(q) !== -1 || (c.phone || '').indexOf(q) !== -1;
    }).slice(0, 6);
    if (!matches.length) { resultsEl.innerHTML = '<div style="padding:8px;color:var(--text-light);font-size:12px;">No match — leave blank to create quote without client</div>'; resultsEl.style.display = 'block'; return; }
    resultsEl.innerHTML = matches.map(function(c){
      return '<div onclick="VoiceQuote._pickClient(\'' + c.id + '\',\'' + (c.name||'').replace(/\\'/g,"\\\\'") + '\')" style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;cursor:pointer;font-size:13px;">'
        + '<strong>' + UI.esc(c.name || 'Unnamed') + '</strong>'
        + (c.address ? ' · <span style="color:var(--text-light);">' + UI.esc(c.address) + '</span>' : '')
        + '</div>';
    }).join('');
    resultsEl.style.display = 'block';
  },

  _pickClient: function(id, name) {
    document.getElementById('vq-client-id').value = id;
    document.getElementById('vq-client-search').value = name;
    document.getElementById('vq-client-results').style.display = 'none';
  },

  _clearTranscript: function() {
    document.getElementById('vq-transcript').value = '';
    document.getElementById('vq-interim').textContent = '';
    VoiceQuote._transcript = '';
    VoiceQuote._interim = '';
  },

  toggleRecord: function() {
    if (VoiceQuote._recording) VoiceQuote.stop();
    else VoiceQuote.start();
  },

  start: function() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { UI.toast('Speech recognition not supported', 'error'); return; }

    var recog = new SR();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = 'en-US';

    // Preserve anything the user already typed / previous runs appended
    VoiceQuote._transcript = document.getElementById('vq-transcript').value;

    recog.onresult = function(e) {
      var finalChunk = '';
      var interimChunk = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) finalChunk += r[0].transcript;
        else interimChunk += r[0].transcript;
      }
      if (finalChunk) {
        VoiceQuote._transcript = (VoiceQuote._transcript + ' ' + finalChunk).trim();
        document.getElementById('vq-transcript').value = VoiceQuote._transcript;
      }
      document.getElementById('vq-interim').textContent = interimChunk;
    };

    recog.onerror = function(e) {
      console.warn('SpeechRecognition error:', e.error);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        UI.toast('Mic permission denied — allow it in browser settings', 'error');
        VoiceQuote.stop();
      } else if (e.error === 'no-speech') {
        // benign, just keep listening
      } else if (e.error === 'aborted') {
        // user stopped
      } else {
        UI.toast('Speech error: ' + e.error, 'error');
      }
    };

    recog.onend = function() {
      // Chrome stops after ~60s of silence. Auto-restart while recording.
      if (VoiceQuote._recording) {
        try { recog.start(); } catch(err) { VoiceQuote._setIdleUI(); }
      }
    };

    try {
      recog.start();
    } catch(err) {
      UI.toast('Could not start recording: ' + err.message, 'error');
      return;
    }
    VoiceQuote._recog = recog;
    VoiceQuote._recording = true;
    VoiceQuote._startedAt = Date.now();

    // UI — recording state
    var btn = document.getElementById('vq-record-btn');
    btn.style.background = '#dc2626';
    btn.innerHTML = '■';
    btn.style.animation = 'pulse 1.2s infinite';
    document.getElementById('vq-status').textContent = 'Recording… tap to stop';
    document.getElementById('vq-status').style.color = '#dc2626';
    document.getElementById('vq-timer').style.display = 'block';

    VoiceQuote._timerInt = setInterval(function() {
      var s = Math.floor((Date.now() - VoiceQuote._startedAt) / 1000);
      var m = Math.floor(s / 60), sec = s % 60;
      document.getElementById('vq-timer').textContent = m + ':' + (sec < 10 ? '0' : '') + sec;
    }, 500);
  },

  stop: function() {
    VoiceQuote._recording = false;
    if (VoiceQuote._recog) {
      try { VoiceQuote._recog.stop(); } catch(e) {}
      VoiceQuote._recog = null;
    }
    if (VoiceQuote._timerInt) { clearInterval(VoiceQuote._timerInt); VoiceQuote._timerInt = null; }
    VoiceQuote._setIdleUI();
  },

  _setIdleUI: function() {
    var btn = document.getElementById('vq-record-btn');
    if (btn) { btn.style.animation = ''; btn.innerHTML = '🎙️'; btn.style.background = '#dc2626'; }
    var st = document.getElementById('vq-status');
    if (st) { st.textContent = 'Tap to start recording'; st.style.color = 'var(--text-light)'; }
    var interim = document.getElementById('vq-interim');
    if (interim) interim.textContent = '';
  },

  generate: function() {
    // Stop recording if still going
    if (VoiceQuote._recording) VoiceQuote.stop();

    var transcript = (document.getElementById('vq-transcript').value || '').trim();
    if (!transcript) { UI.toast('Record or type a description first', 'error'); return; }

    var apiKey = localStorage.getItem('bm-claude-key') || '';
    if (!apiKey) { UI.toast('Add AI API key in Settings first', 'error'); return; }

    var genBtn = document.getElementById('vq-gen-btn');
    var statusEl = document.getElementById('vq-gen-status');
    genBtn.disabled = true;
    genBtn.style.opacity = '0.6';
    genBtn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;vertical-align:middle;"></span> AI is thinking…';
    statusEl.textContent = '';

    // Build catalog + rate context
    var services = [];
    try { services = DB.services.getAll(); } catch(e) {}
    var catalogStr = services.slice(0, 30).map(function(s){ return '- ' + s.name + ' ($' + (s.defaultRate || 0) + '/' + (s.unit || 'ea') + ')'; }).join('\n');
    var tmRates = {};
    try { tmRates = (typeof QuotesPage !== 'undefined' && QuotesPage.getTMRates) ? QuotesPage.getTMRates() : {}; } catch(e) {}

    var _vqCo = (function(){ try { return CompanyInfo.get('name'); } catch(e) { return ''; } })() || 'a tree service company';
    var _vqLoc = (function(){ try { return (typeof CompanyInfo.own === 'function' && CompanyInfo.own('address')) || ''; } catch(e) { return ''; } })();
    var system = 'You are an expert tree service estimator for ' + _vqCo + (_vqLoc ? ' (' + _vqLoc + ')' : '') + '. '
      + 'A field tech has dictated a walkaround. Convert it into a structured quote draft.\n\n'
      + 'Services catalog (use these service names when they match):\n' + (catalogStr || '- Tree Removal\n- Tree Pruning\n- Stump Removal\n- Cabling\n- Chipping Brush') + '\n\n'
      + 'Pricing guidance:\n'
      + '- Tree removal: roughly $100/inch DBH, add 30-50% for hazards (power lines, near house, crane access required)\n'
      + '- Pruning: $300-$800 per tree depending on size\n'
      + '- Stump grinding: ~$10/inch diameter, $100 minimum per stump\n'
      + '- Cabling: $10/ft of cable\n'
      + '- T&M rates: climber $' + (tmRates.climber || 175) + '/hr, ground $' + (tmRates.ground || 125) + '/hr, bucket $' + (tmRates.bucket || 75) + '/hr, crane $' + (tmRates.crane || 200) + '/hr\n\n'
      + 'Return ONLY valid JSON matching this schema (no markdown, no prose):\n'
      + '{\n'
      + '  "description": "short 1-line summary of the job",\n'
      + '  "scope": "2-4 sentence scope paragraph for the client",\n'
      + '  "lineItems": [\n'
      + '    { "service": "service name from catalog", "description": "specifics (species, DBH, location, complexity)", "qty": 1, "rate": 1500 }\n'
      + '  ],\n'
      + '  "notes": "internal notes for the crew (optional)",\n'
      + '  "estimatedHours": 6\n'
      + '}\n\n'
      + 'Be realistic — price conservatively if info is vague. If DBH/height is given, use it. Never output anything other than the JSON object.';

    fetch('https://ltpivkqahvplapyagljt.supabase.co/functions/v1/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: (window.bmAIKey ? window.bmAIKey() : apiKey) || apiKey,
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        system: system,
        messages: [{ role: 'user', content: 'Walkaround transcript:\n\n' + transcript }]
      })
    }).then(function(res) {
      return res.json().then(function(body){ return { ok: res.ok, status: res.status, body: body }; });
    }).then(function(r) {
      genBtn.disabled = false;
      genBtn.style.opacity = '1';
      genBtn.textContent = '✨ Generate Quote Draft';

      if (!r.ok || !r.body || !r.body.content || !r.body.content[0]) {
        var msg = (r.body && (r.body.error && (r.body.error.message || r.body.error))) || ('HTTP ' + r.status);
        statusEl.innerHTML = '<span style="color:#dc3545;">❌ ' + UI.esc(String(msg)) + '</span>';
        return;
      }

      var text = r.body.content[0].text || '';
      // Strip markdown fences if the AI wrapped the JSON
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

      var draft;
      try { draft = JSON.parse(text); }
      catch(e) {
        statusEl.innerHTML = '<span style="color:#dc3545;">❌ Could not parse AI\'s response as JSON. Raw:<br><pre style="white-space:pre-wrap;font-size:11px;">' + UI.esc(text.slice(0, 400)) + '</pre></span>';
        return;
      }

      // Stash draft for QuotesPage.showForm to pick up
      try { localStorage.setItem('bm-voice-quote-draft', JSON.stringify(draft)); } catch(e) {}

      statusEl.innerHTML = '<span style="color:var(--green-dark);font-weight:600;">✅ Draft ready — opening quote form…</span>';

      var clientId = (document.getElementById('vq-client-id').value || '').trim() || null;
      setTimeout(function() {
        if (typeof QuotesPage !== 'undefined' && QuotesPage.showForm) {
          QuotesPage.showForm(null, clientId);
        } else {
          loadPage('quotes');
        }
      }, 400);
    }).catch(function(err) {
      genBtn.disabled = false;
      genBtn.style.opacity = '1';
      genBtn.textContent = '✨ Generate Quote Draft';
      statusEl.innerHTML = '<span style="color:#dc3545;">❌ ' + UI.esc(err.message || String(err)) + '</span>';
    });
  }
};

// Pulse keyframes for record button
(function(){
  if (document.getElementById('vq-keyframes')) return;
  var s = document.createElement('style');
  s.id = 'vq-keyframes';
  s.textContent = '@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(220,38,38,0.6); } 70% { box-shadow: 0 0 0 16px rgba(220,38,38,0); } 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); } } @keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(s);
})();
