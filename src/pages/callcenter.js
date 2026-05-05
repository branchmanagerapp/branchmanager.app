/**
 * Branch Manager — Call Center
 * Full-page layout matching Requests. Dial pad lives in a modal.
 */
var CallCenter = {
  _activeTab: 'missed',  // 'missed' | 'threads' | 'activity'
  _activeThread: null,
  _realtimeSub: null,

  render: function() {
    var html = '<div style="max-width:960px;margin:0 auto;">';

    // ── Header ──────────────────────────────────────────────────
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px;">'
      + '<div>'
      + '<h2 style="font-size:22px;font-weight:700;margin:0 0 2px 0;">📞 Leads Center</h2>'
      + '<div style="font-size:12px;color:var(--text-light);">Inbound calls, SMS threads, voicemails &amp; bid emails</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;">'
      + '<button onclick="CallCenter._openDialModal(\'call\')" style="padding:7px 14px;background:none;color:var(--text);border:1px solid var(--border);border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">📞 Call</button>'
      + '<button onclick="CallCenter._openDialModal(\'sms\')"  style="padding:7px 14px;background:none;color:var(--text);border:1px solid var(--border);border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">💬 SMS</button>'
      + '</div>'
      + '</div>';

    // ── Tab bar ─────────────────────────────────────────────────
    var _tabs = [['missed','📵 Missed'],['threads','💬 Messages'],['emails','📧 Emails'],['activity','📋 All Activity']];
    html += '<div style="display:flex;border-bottom:2px solid var(--border);margin-bottom:0;gap:0;">';
    _tabs.forEach(function(t) {
      var active = CallCenter._activeTab === t[0];
      html += '<button id="cc-tab-' + t[0] + '" onclick="CallCenter._switchTab(\'' + t[0] + '\')"'
        + ' style="padding:10px 20px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;'
        + 'color:' + (active ? 'var(--accent)' : 'var(--text-light)') + ';'
        + 'border-bottom:2px solid ' + (active ? 'var(--accent)' : 'transparent') + ';margin-bottom:-2px;">'
        + t[1] + '</button>';
    });
    html += '</div>';

    // ── Panel ────────────────────────────────────────────────────
    html += '<div id="cc-panel" style="min-height:400px;">'
      + '<div style="text-align:center;padding:60px;color:var(--text-light);font-size:13px;">Loading…</div>'
      + '</div>';

    html += '</div>'; // outer

    setTimeout(function() {
      if (typeof lucide !== 'undefined') lucide.createIcons();
      CallCenter._loadPanel();
    }, 0);

    return html;
  },

  // ── Tab switching ────────────────────────────────────────────

  _switchTab: function(tab) {
    // Clean up realtime sub when leaving SMS threads
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (sb && CallCenter._realtimeSub && tab !== 'threads') {
      try { sb.removeChannel(CallCenter._realtimeSub); } catch(e) {}
      CallCenter._realtimeSub = null;
    }
    CallCenter._activeTab = tab;
    CallCenter._activeThread = null;
    ['missed','emails','threads','activity'].forEach(function(t) {
      var btn = document.getElementById('cc-tab-' + t);
      if (!btn) return;
      var active = t === tab;
      btn.style.color = active ? 'var(--accent)' : 'var(--text-light)';
      btn.style.borderBottom = '2px solid ' + (active ? 'var(--accent)' : 'transparent');
    });
    CallCenter._loadPanel();
  },

  _loadPanel: function() {
    if (CallCenter._activeTab === 'threads') CallCenter._loadThreads();
    else if (CallCenter._activeTab === 'missed') CallCenter._loadMissed();
    else if (CallCenter._activeTab === 'emails') CallCenter._loadEmails();
    else CallCenter._loadActivity();
  },

  // ── Dial Modal ───────────────────────────────────────────────

  _number: '',
  _clientId: null,
  _clientName: null,
  _dialMode: 'call',

  _openDialModal: function(mode) {
    CallCenter._dialMode = mode || 'call';
    CallCenter._number = '';
    CallCenter._clientId = null;
    CallCenter._clientName = null;

    var title = mode === 'sms' ? '💬 New SMS' : '📞 New Call';

    var body = '<div style="min-width:280px;">'
      // Client search
      + '<div style="position:relative;margin-bottom:10px;">'
      + '<input type="text" id="cc-search" placeholder="Search clients…" autocomplete="off"'
      + '  onkeyup="CallCenter._onSearch(this.value)"'
      + '  style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;box-sizing:border-box;background:var(--bg);color:var(--text);">'
      + '<div id="cc-search-results" style="display:none;position:absolute;left:0;right:0;z-index:99;background:var(--bg);border:1px solid var(--border);border-radius:8px;margin-top:2px;max-height:160px;overflow-y:auto;box-shadow:0 4px 16px rgba(0,0,0,.14);"></div>'
      + '</div>'

      // Number display
      + '<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:10px;">'
      + '<div id="cc-client-label" style="font-size:11px;color:var(--accent);min-height:14px;margin-bottom:2px;font-weight:700;letter-spacing:.3px;"></div>'
      + '<div style="display:flex;align-items:center;gap:6px;">'
      + '<div id="cc-display" style="flex:1;font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:1px;min-height:28px;color:var(--text);">—</div>'
      + '<button onclick="CallCenter._backspace()" title="Backspace" style="background:none;border:none;font-size:18px;cursor:pointer;padding:4px;color:var(--text-light);">⌫</button>'
      + '</div>'
      + '<input type="tel" id="cc-raw-input" placeholder="or type a number…" autocomplete="off"'
      + '  oninput="CallCenter._onRawInput(this.value)"'
      + '  style="width:100%;margin-top:6px;padding:7px 10px;border:1px solid var(--border);border-radius:7px;font-size:14px;box-sizing:border-box;background:var(--bg);color:var(--text);">'
      + '</div>'

      // Dial pad
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:10px;">';

    ['1','2','3','4','5','6','7','8','9','*','0','#'].forEach(function(k) {
      body += '<button onclick="CallCenter._press(\'' + k + '\')"'
        + ' style="padding:11px 0;font-size:17px;font-weight:600;background:var(--surface);border:1px solid var(--border);border-radius:8px;cursor:pointer;"'
        + ' onmousedown="this.style.background=\'var(--border)\'" onmouseup="this.style.background=\'var(--surface)\'">'
        + k + '</button>';
    });

    body += '</div>'

      // Action button
      + '<button onclick="CallCenter._dialGo()" style="width:100%;padding:13px;background:' + (mode==='sms'?'var(--green-dark)':'#1a7a3c') + ';color:#fff;border:none;border-radius:9px;font-size:15px;font-weight:700;cursor:pointer;">'
      + (mode === 'sms' ? '💬 Send SMS' : '📞 Make Call')
      + '</button></div>';

    UI.showModal(title, body, { keepModal: true });

    setTimeout(function() {
      if (typeof lucide !== 'undefined') lucide.createIcons();
      var inp = document.getElementById('cc-raw-input');
      if (inp) {
        inp.focus();
        inp.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') CallCenter._dialGo();
          if (e.key === 'Escape') UI.closeModal();
        });
      }
    }, 50);
  },

  _dialGo: function() {
    var num = CallCenter._number.replace(/\D/g, '');
    if (!num) { UI.toast('Enter a phone number first', 'error'); return; }
    UI.closeModal();
    if (CallCenter._dialMode === 'sms') {
      CallCenter._activeTab = 'threads';
      CallCenter._switchTab('threads');
      CallCenter._openThread({ phone: num, clientId: CallCenter._clientId, name: CallCenter._clientName || CallCenter._fmtPhone(num) });
    } else {
      if (typeof Dialpad !== 'undefined') Dialpad.call(num, CallCenter._clientId, CallCenter._clientName);
      else window.open('tel:' + num);
    }
  },

  // ── Dial pad helpers ─────────────────────────────────────────

  _press: function(key) {
    CallCenter._number += key;
    CallCenter._refreshDisplay();
    var inp = document.getElementById('cc-raw-input');
    if (inp) inp.value = CallCenter._number;
  },

  _backspace: function() {
    CallCenter._number = CallCenter._number.slice(0, -1);
    CallCenter._refreshDisplay();
    var inp = document.getElementById('cc-raw-input');
    if (inp) inp.value = CallCenter._number;
  },

  _onRawInput: function(val) {
    CallCenter._number = val.replace(/[^\d\+\*\#]/g, '');
    CallCenter._refreshDisplay();
    CallCenter._clientId = null;
    CallCenter._clientName = null;
    var lbl = document.getElementById('cc-client-label');
    if (lbl) lbl.textContent = '';
  },

  _refreshDisplay: function() {
    var disp = document.getElementById('cc-display');
    if (!disp) return;
    if (!CallCenter._number) { disp.textContent = '—'; return; }
    var d = CallCenter._number.replace(/\D/g, '');
    var formatted = CallCenter._number;
    if (d.length === 10) formatted = '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
    else if (d.length === 11 && d[0] === '1') formatted = '+1 (' + d.slice(1,4) + ') ' + d.slice(4,7) + '-' + d.slice(7);
    disp.textContent = formatted;
  },

  _onSearch: function(q) {
    var res = document.getElementById('cc-search-results');
    if (!res) return;
    q = q.trim().toLowerCase();
    if (!q) { res.style.display = 'none'; res.innerHTML = ''; return; }
    var clients = (typeof ClientsPage !== 'undefined' && ClientsPage._cache) ? ClientsPage._cache : [];
    var matches = clients.filter(function(c) {
      return (c.name || '').toLowerCase().includes(q) && c.phone;
    }).slice(0, 8);
    if (!matches.length) {
      res.innerHTML = '<div style="padding:10px 14px;color:var(--text-light);font-size:13px;">No clients found</div>';
    } else {
      res.innerHTML = matches.map(function(c) {
        var safeName  = (c.name  || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        var safePhone = (c.phone || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        return '<div onclick="CallCenter._selectClient(\'' + (c.id||'') + '\',\'' + safeName + '\',\'' + safePhone + '\')"'
          + ' style="padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;"'
          + ' onmouseover="this.style.background=\'var(--surface)\'" onmouseout="this.style.background=\'\';">'
          + '<div style="font-weight:600;">' + (c.name || '') + '</div>'
          + '<div style="color:var(--text-light);font-size:12px;">' + (c.phone || '') + '</div>'
          + '</div>';
      }).join('');
    }
    res.style.display = 'block';
  },

  _selectClient: function(id, name, phone) {
    CallCenter._clientId   = id || null;
    CallCenter._clientName = name || null;
    CallCenter._number     = phone.replace(/\D/g, '');
    var inp = document.getElementById('cc-raw-input');
    if (inp) inp.value = phone;
    CallCenter._refreshDisplay();
    var lbl = document.getElementById('cc-client-label');
    if (lbl) lbl.textContent = name;
    var srch = document.getElementById('cc-search');
    if (srch) srch.value = '';
    var res = document.getElementById('cc-search-results');
    if (res) { res.style.display = 'none'; res.innerHTML = ''; }
  },

  // ── Missed Calls / Voicemails ────────────────────────────────

  _loadMissed: async function() {
    var el = document.getElementById('cc-panel');
    if (!el) return;
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) { el.innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-light);">Sign in to view missed calls.</div>'; return; }

    try {
      var { data, error } = await sb.from('communications')
        .select('id,client_id,channel,direction,body,from_number,to_number,status,duration_seconds,recording_url,created_at,metadata')
        .eq('direction', 'inbound')
        .in('channel', ['call', 'voicemail', 'sms'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      var rows = data || [];

      var clients = (typeof ClientsPage !== 'undefined' && ClientsPage._cache) ? ClientsPage._cache : [];
      var clientMap = {};
      clients.forEach(function(c) { if (c.id) clientMap[c.id] = c; });

      if (!rows.length) {
        el.innerHTML = '<div style="padding:80px 24px;text-align:center;color:var(--text-light);">'
          + '<div style="font-size:40px;margin-bottom:12px;">📵</div>'
          + '<div style="font-size:15px;font-weight:600;margin-bottom:6px;">No communications yet</div>'
          + '<div style="font-size:13px;">Missed calls, voicemails, SMS, and bid emails will appear here.</div>'
          + '</div>';
        return;
      }

      var html = '<div style="border:1.5px solid var(--border);border-radius:10px;overflow:hidden;margin-top:16px;">';

      rows.forEach(function(c, idx) {
        var cl = c.client_id ? clientMap[c.client_id] : null;
        var meta = c.metadata && typeof c.metadata === 'object' ? c.metadata : {};
        var isEmail = c.channel === 'email';
        var isVM   = c.channel === 'voicemail';
        var isSMS  = c.channel === 'sms';
        var isMissed = c.status === 'missed' || c.status === 'no-answer' || c.status === 'no_answer';
        var phone = isEmail ? '' : (c.from_number || '');
        var digits = phone.replace(/\D/g, '');

        // ── Email / BidNet row ───────────────────────────────────
        if (isEmail) {
          var bidType  = meta.email_type || meta.bidnet_type || 'new_solicitation';
          var bidIcon  = bidType === 'award' ? '🏆' : bidType === 'addendum' ? '📎' : '📋';
          var bidLabel = bidType === 'award' ? 'Award Notice' : bidType === 'addendum' ? 'Addendum' : 'New Solicitation';
          var bidColor = bidType === 'award' ? '#92400e' : bidType === 'addendum' ? '#6a1b9a' : '#1565c0';
          var bidBg    = bidType === 'award' ? '#fef3c7' : bidType === 'addendum' ? '#f3e8ff' : '#eff6ff';
          var bidBorder= bidType === 'award' ? '#fde68a' : bidType === 'addendum' ? '#d8b4fe' : '#bfdbfe';
          var agency   = meta.agency || c.from_number || 'Unknown Agency';
          var solNum   = meta.sol_number || meta.solicitation_number || '';
          var solTitle = meta.sol_title || c.body || '';
          var gmailUrl = meta.thread_id ? 'https://mail.google.com/mail/u/0/#inbox/' + meta.thread_id : '';
          var ts = typeof UI !== 'undefined' && UI.dateRelative ? UI.dateRelative(c.created_at) : (c.created_at||'').slice(0,10);
          var isLast = idx === rows.length - 1;
          var safeId = JSON.stringify(c.id);
          // Push to email cache so modal can find it
          if (!CallCenter._emailRows) CallCenter._emailRows = [];
          if (!CallCenter._emailRows.find(function(r){ return r.id === c.id; })) CallCenter._emailRows.push(c);
          html += '<div onclick="CallCenter._openEmailModal(' + safeId + ')" style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;' + (isLast ? '' : 'border-bottom:1px solid var(--border);') + '" onmouseover="this.style.background=\'var(--surface)\'" onmouseout="this.style.background=\'\'">'
            + '<div style="flex-shrink:0;width:34px;height:34px;background:' + bidBg + ';border:1px solid ' + bidBorder + ';border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:15px;">' + bidIcon + '</div>'
            + '<div style="flex:1;min-width:0;">'
            + '<div style="font-size:13px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(agency) + '</div>'
            + '<div style="font-size:11px;font-weight:700;color:' + bidColor + ';margin-top:2px;">' + bidLabel + (solNum ? ' · ' + solNum : '') + '</div>'
            + (solTitle ? '<div style="font-size:12px;color:var(--text-light);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(solTitle) + '</div>' : '')
            + '</div>'
            + '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">'
            + '<span style="font-size:11px;color:var(--text-light);">' + ts + '</span>'
            + (gmailUrl ? '<a href="' + gmailUrl + '" target="_blank" onclick="event.stopPropagation()" title="Open Gmail" style="width:28px;height:28px;background:none;border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:13px;">✉️</a>' : '')
            + '</div>'
            + '</div>';
          return;
        }

        // ── Call / SMS / Voicemail row ───────────────────────────
        var name = (cl && cl.name) || meta.name || CallCenter._fmtPhone(phone) || 'Unknown';
        var icon  = isVM ? '📭' : (isSMS ? '💬' : (isMissed ? '📵' : '📞'));
        var label = isVM ? 'Voicemail' : (isSMS ? 'SMS' : (isMissed ? 'Missed call' : 'Inbound call'));
        var labelColor = isVM ? '#7b1fa2' : (isSMS ? '#1565c0' : (isMissed ? '#c62828' : '#2e7d32'));
        var ts = typeof UI !== 'undefined' && UI.dateRelative ? UI.dateRelative(c.created_at) : (c.created_at||'').slice(0,16).replace('T',' ');
        var dur = c.duration_seconds ? Math.floor(c.duration_seconds/60) + ':' + String(c.duration_seconds%60).padStart(2,'0') : '';
        var service = meta.service_wanted || '';
        var safePhone = digits.replace(/'/g,"\\'");
        var safeName  = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        var safeId    = (c.client_id||'').replace(/'/g,"\\'");
        var isLast = idx === rows.length - 1;

        html += '<div style="display:flex;align-items:center;gap:12px;padding:12px 18px;' + (isLast ? '' : 'border-bottom:1px solid var(--border);') + '">'
          + '<div style="flex-shrink:0;width:32px;height:32px;background:var(--surface);border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;">' + icon + '</div>'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + name + '</div>'
          + '<div style="font-size:12px;color:' + labelColor + ';font-weight:600;margin-top:1px;">'
          + label + (dur ? ' · ' + dur : '') + (phone ? ' · ' + CallCenter._fmtPhone(phone) : '')
          + '</div>'
          + (c.body ? '<div style="font-size:12px;color:var(--text-light);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + c.body.slice(0, 90) + (c.body.length > 90 ? '…' : '') + '</div>' : '')
          + (service ? '<div style="font-size:11px;color:var(--text-light);margin-top:1px;">Wants: ' + service + '</div>' : '')
          + '</div>'
          + '<div style="font-size:11px;color:var(--text-light);white-space:nowrap;flex-shrink:0;">' + ts + '</div>'
          + (digits ? '<div style="display:flex;gap:4px;flex-shrink:0;">'
            + '<button onclick="CallCenter._dialFrom(\'' + safeId + '\',\'' + safeName + '\',\'' + safePhone + '\',\'call\')" title="Call back" style="width:30px;height:30px;background:none;border:1px solid var(--border);border-radius:7px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">📞</button>'
            + '<button onclick="CallCenter._dialFrom(\'' + safeId + '\',\'' + safeName + '\',\'' + safePhone + '\',\'sms\')" title="Text back" style="width:30px;height:30px;background:none;border:1px solid var(--border);border-radius:7px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;">💬</button>'
            + (c.recording_url ? '<a href="' + c.recording_url + '" target="_blank" rel="noopener noreferrer" title="Listen" style="width:30px;height:30px;background:none;border:1px solid var(--border);border-radius:7px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;text-decoration:none;">▶</a>' : '')
            + '</div>' : '')
          + '</div>';
      });

      html += '</div>';
      el.innerHTML = html;
    } catch(e) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-light);">Failed to load. ' + e.message + '</div>';
    }
  },

  // ── Email Leads ──────────────────────────────────────────────

  _loadEmails: async function() {
    var el = document.getElementById('cc-panel');
    if (!el) return;
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) { el.innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-light);">Sign in to view emails.</div>'; return; }

    try {
      var { data, error } = await sb.from('communications')
        .select('id,client_id,channel,direction,body,from_number,to_number,status,created_at,metadata')
        .eq('channel', 'email')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      var rows = data || [];

      if (!rows.length) {
        el.innerHTML = '<div style="padding:60px 24px;text-align:center;color:var(--text-light);">'
          + '<div style="font-size:40px;margin-bottom:12px;">📧</div>'
          + '<div style="font-size:15px;font-weight:600;margin-bottom:6px;">No emails yet</div>'
          + '<div style="font-size:13px;margin-bottom:20px;">BidNet solicitations will appear here automatically.</div>'
          + '<a href="https://www.bidnetdirect.com" target="_blank" style="display:inline-block;padding:10px 22px;background:#1a3c12;color:#fff;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">🔗 Open BidNet Direct</a>'
          + '</div>';
        return;
      }

      // Header with BidNet shortcut
      var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'
        + '<div style="font-size:13px;color:var(--text-light);">' + rows.length + ' bid email' + (rows.length !== 1 ? 's' : '') + '</div>'
        + '<a href="https://www.bidnetdirect.com" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;background:#1a3c12;color:#fff;border-radius:7px;font-size:12px;font-weight:700;text-decoration:none;">🔗 BidNet Direct</a>'
        + '</div>';

      html += '<div style="border:1.5px solid var(--border);border-radius:10px;overflow:hidden;">';
      rows.forEach(function(c, idx) {
        var meta = c.metadata && typeof c.metadata === 'object' ? c.metadata : {};
        // Support both field name conventions
        var bidType  = meta.email_type || meta.bidnet_type || 'new_solicitation';
        var bidIcon  = bidType === 'award' ? '🏆' : bidType === 'addendum' ? '📎' : '📋';
        var bidLabel = bidType === 'award' ? 'Award Notice' : bidType === 'addendum' ? 'Addendum' : 'New Solicitation';
        var bidColor = bidType === 'award' ? '#92400e' : bidType === 'addendum' ? '#6a1b9a' : '#1565c0';
        var bidBg    = bidType === 'award' ? '#fef3c7' : bidType === 'addendum' ? '#f3e8ff' : '#eff6ff';
        var bidBorder= bidType === 'award' ? '#fde68a' : bidType === 'addendum' ? '#d8b4fe' : '#bfdbfe';
        var agency   = meta.agency || c.from_number || 'Unknown Agency';
        var solNum   = meta.sol_number || meta.solicitation_number || '';
        var solTitle = meta.sol_title || c.body || '';
        // Gmail deep-link if thread_id present, else BidNet search
        var gmailUrl = meta.thread_id ? 'https://mail.google.com/mail/u/0/#inbox/' + meta.thread_id : '';
        var ts = typeof UI !== 'undefined' && UI.dateRelative ? UI.dateRelative(c.created_at) : (c.created_at||'').slice(0,10);
        var isLast = idx === rows.length - 1;
        var safeId = JSON.stringify(c.id);

        html += '<div onclick="CallCenter._openEmailModal(' + safeId + ')" style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;' + (isLast ? '' : 'border-bottom:1px solid var(--border);') + '" onmouseover="this.style.background=\'var(--surface)\'" onmouseout="this.style.background=\'\'">'
          + '<div style="flex-shrink:0;width:34px;height:34px;background:' + bidBg + ';border:1px solid ' + bidBorder + ';border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:15px;">' + bidIcon + '</div>'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-size:13px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(agency) + '</div>'
          + '<div style="font-size:11px;font-weight:700;color:' + bidColor + ';margin-top:2px;">' + bidLabel + (solNum ? ' · ' + solNum : '') + '</div>'
          + (solTitle ? '<div style="font-size:12px;color:var(--text-light);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(solTitle) + '</div>' : '')
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">'
          + '<span style="font-size:11px;color:var(--text-light);white-space:nowrap;">' + ts + '</span>'
          + (gmailUrl ? '<a href="' + gmailUrl + '" target="_blank" onclick="event.stopPropagation()" title="Open in Gmail" style="width:28px;height:28px;background:none;border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:13px;flex-shrink:0;">✉️</a>' : '')
          + '</div>'
          + '</div>';
      });
      html += '</div>';
      el.innerHTML = html;

      // Store rows for modal lookup
      CallCenter._emailRows = rows;
    } catch(e) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-light);">Failed to load emails. ' + e.message + '</div>';
    }
  },

  _emailRows: [],

  _openEmailModal: function(id) {
    var c = (CallCenter._emailRows || []).find(function(r) { return r.id === id; });
    if (!c) return;
    var meta = c.metadata && typeof c.metadata === 'object' ? c.metadata : {};
    var bidType  = meta.email_type || meta.bidnet_type || 'new_solicitation';
    var bidIcon  = bidType === 'award' ? '🏆' : bidType === 'addendum' ? '📎' : '📋';
    var bidLabel = bidType === 'award' ? 'Award Notice' : bidType === 'addendum' ? 'Addendum' : 'New Solicitation';
    var bidColor = bidType === 'award' ? '#92400e' : bidType === 'addendum' ? '#6a1b9a' : '#1565c0';
    var agency   = meta.agency || c.from_number || 'Unknown Agency';
    var solNum   = meta.sol_number || meta.solicitation_number || '';
    var solTitle = meta.sol_title || c.body || '';
    var gmailUrl = meta.thread_id ? 'https://mail.google.com/mail/u/0/#inbox/' + meta.thread_id : '';
    var ts = typeof UI !== 'undefined' && UI.dateRelative ? UI.dateRelative(c.created_at) : c.created_at;

    var html = '<div style="padding:4px 0;">'
      // Type badge + agency
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">'
      + '<div style="font-size:28px;">' + bidIcon + '</div>'
      + '<div>'
      + '<div style="font-size:16px;font-weight:800;color:var(--text);">' + UI.esc(agency) + '</div>'
      + '<div style="font-size:12px;font-weight:700;color:' + bidColor + ';margin-top:2px;">' + bidLabel + '</div>'
      + '</div>'
      + '</div>'
      // Details grid
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">'
      + (solNum   ? '<div style="background:var(--surface);border-radius:8px;padding:10px 12px;"><div style="font-size:10px;font-weight:700;color:var(--text-light);text-transform:uppercase;margin-bottom:3px;">Solicitation #</div><div style="font-size:13px;font-weight:600;">' + UI.esc(solNum) + '</div></div>' : '')
      + '<div style="background:var(--surface);border-radius:8px;padding:10px 12px;"><div style="font-size:10px;font-weight:700;color:var(--text-light);text-transform:uppercase;margin-bottom:3px;">Received</div><div style="font-size:13px;font-weight:600;">' + UI.esc(ts) + '</div></div>'
      + (meta.source ? '<div style="background:var(--surface);border-radius:8px;padding:10px 12px;"><div style="font-size:10px;font-weight:700;color:var(--text-light);text-transform:uppercase;margin-bottom:3px;">Source</div><div style="font-size:13px;font-weight:600;">' + UI.esc(meta.source) + '</div></div>' : '')
      + '</div>'
      // Title/subject
      + (solTitle ? '<div style="background:var(--surface);border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:var(--text);line-height:1.5;">' + UI.esc(solTitle) + '</div>' : '')
      // Action buttons
      + '<div style="display:flex;flex-direction:column;gap:8px;">'
      + (gmailUrl ? '<a href="' + gmailUrl + '" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:11px 0;background:#1a3c12;color:#fff;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">✉️ Open in Gmail</a>' : '')
      + '<a href="https://www.bidnetdirect.com" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:11px 0;background:none;color:var(--text);border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">🔗 Open BidNet Direct</a>'
      + '<button onclick="UI.closeModal();QuotesPage.showForm(null,{description:' + JSON.stringify(UI.esc(solTitle)) + ',source:\'bidnet\'})" style="padding:11px 0;background:none;color:var(--accent);border:1.5px solid var(--accent);border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">📋 Create Quote from This Bid</button>'
      + '</div>'
      + '</div>';

    UI.showModal(bidIcon + ' ' + UI.esc(agency), html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
    });
  },

  // ── SMS Threads ──────────────────────────────────────────────

  _loadThreads: async function() {
    var el = document.getElementById('cc-panel');
    if (!el) return;
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) { el.innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-light);">Sign in to view messages.</div>'; return; }

    try {
      var { data, error } = await sb.from('communications')
        .select('id,client_id,channel,direction,body,from_number,to_number,created_at,metadata')
        .eq('channel', 'sms')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      var threadMap = {};
      (data || []).forEach(function(row) {
        var phone = (row.direction === 'inbound' ? row.from_number : row.to_number) || '';
        phone = phone.replace(/\D/g, '');
        if (!phone) return;
        if (!threadMap[phone]) threadMap[phone] = { phone: phone, clientId: row.client_id, msgs: [], lastTs: row.created_at };
        threadMap[phone].msgs.push(row);
        if (row.created_at > threadMap[phone].lastTs) threadMap[phone].lastTs = row.created_at;
      });

      var threads = Object.values(threadMap).sort(function(a, b) { return b.lastTs > a.lastTs ? 1 : -1; });

      if (!threads.length) {
        el.innerHTML = '<div style="padding:80px 24px;text-align:center;color:var(--text-light);">'
          + '<div style="font-size:40px;margin-bottom:12px;">💬</div>'
          + '<div style="font-size:15px;font-weight:600;margin-bottom:6px;">No messages yet</div>'
          + '<div style="font-size:13px;">Use <strong>New SMS</strong> to start a thread.</div>'
          + '</div>';
        return;
      }

      var clients = (typeof ClientsPage !== 'undefined' && ClientsPage._cache) ? ClientsPage._cache : [];
      var clientMap = {};
      clients.forEach(function(c) { if (c.id) clientMap[c.id] = c.name; });

      var html = '<div style="border:1.5px solid var(--border);border-radius:10px;overflow:hidden;margin-top:16px;">';
      threads.forEach(function(thr, idx) {
        var last = thr.msgs[0];
        var meta = last.metadata && typeof last.metadata === 'object' ? last.metadata : {};
        var name = (thr.clientId && clientMap[thr.clientId]) || meta.name || CallCenter._fmtPhone(thr.phone);
        var preview = (last.body || '').slice(0, 70) || '—';
        var ts = UI.dateRelative(thr.lastTs);
        var isIn = last.direction === 'inbound';
        var unread = thr.msgs.filter(function(m) { return m.direction === 'inbound'; }).length;
        var safePhone = thr.phone.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        var safeName  = name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        var safeId    = (thr.clientId||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        var isLast = idx === threads.length - 1;

        html += '<div onclick="CallCenter._openThread({phone:\'' + safePhone + '\',clientId:\'' + safeId + '\',name:\'' + safeName + '\'})"'
          + ' style="display:flex;gap:12px;padding:12px 18px;' + (isLast ? '' : 'border-bottom:1px solid var(--border);') + 'cursor:pointer;align-items:center;"'
          + ' onmouseover="this.style.background=\'var(--surface)\'" onmouseout="this.style.background=\'\';">'
          + '<div style="flex-shrink:0;width:32px;height:32px;background:var(--surface);border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;">💬</div>'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + name + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
          + (isIn ? '' : 'You: ') + preview + '</div>'
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">'
          + '<span style="font-size:11px;color:var(--text-light);white-space:nowrap;">' + ts + '</span>'
          + (unread > 0 && isIn ? '<div style="width:20px;height:20px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:700;">' + Math.min(unread,9) + '</div>' : '')
          + '</div>'
          + '</div>';
      });
      html += '</div>';
      el.innerHTML = html;

      // Realtime: refresh thread list when a new inbound SMS arrives
      CallCenter._subscribeRealtime(sb, null);

    } catch(e) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-light);">Failed to load messages.</div>';
    }
  },

  _subscribeRealtime: function(sb, activePhone) {
    // Unsubscribe any existing channel
    if (CallCenter._realtimeSub) {
      try { sb.removeChannel(CallCenter._realtimeSub); } catch(e) {}
      CallCenter._realtimeSub = null;
    }
    if (!sb || !sb.channel) return;
    CallCenter._realtimeSub = sb.channel('cc-sms-' + Date.now())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'communications', filter: 'channel=eq.sms' }, function(payload) {
        var row = payload.new || {};
        if (activePhone) {
          // Inside a thread — append if matching phone
          var fromPhone = (row.from_number || '').replace(/\D/g, '').slice(-10);
          var toPhone   = (row.to_number   || '').replace(/\D/g, '').slice(-10);
          var thrPhone  = (activePhone || '').replace(/\D/g, '').slice(-10);
          if (fromPhone === thrPhone || toPhone === thrPhone) {
            CallCenter._appendThreadMsg(row);
          }
        } else {
          // Thread list — re-render
          if (CallCenter._activeTab === 'threads' && !CallCenter._activeThread) {
            CallCenter._loadThreads();
          }
        }
      })
      .subscribe();
  },

  _appendThreadMsg: function(row) {
    var msgsEl = document.getElementById('cc-thread-msgs');
    if (!msgsEl) return;
    var out = row.direction === 'outbound';
    var ts = row.created_at ? new Date(row.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) + ' · ' + new Date(row.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : 'now';
    var div = document.createElement('div');
    div.style.cssText = 'display:flex;flex-direction:column;align-items:' + (out?'flex-end':'flex-start') + ';';
    div.innerHTML = '<div style="max-width:72%;padding:9px 13px;border-radius:' + (out?'14px 14px 4px 14px':'14px 14px 14px 4px') + ';background:' + (out?'var(--green-dark)':'var(--surface)') + ';color:' + (out?'#fff':'var(--text)') + ';font-size:13px;line-height:1.45;border:' + (out?'none':'1px solid var(--border)') + ';">' + (row.body||'') + '</div>'
      + '<div style="font-size:10px;color:var(--text-light);margin-top:2px;padding:0 2px;">' + ts + '</div>';
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  },

  _openThread: async function(thr) {
    CallCenter._activeThread = thr;
    var el = document.getElementById('cc-panel');
    if (!el) return;

    el.innerHTML = '<div style="border:1.5px solid var(--border);border-radius:10px;overflow:hidden;margin-top:16px;display:flex;flex-direction:column;">'
      // Thread header
      + '<div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:var(--surface);border-bottom:1px solid var(--border);">'
      + '<button onclick="CallCenter._switchTab(\'threads\')" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--text-light);padding:0;line-height:1;margin-right:4px;">‹</button>'
      + '<div style="width:38px;height:38px;background:var(--green-dark);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;">' + (thr.name||'?').charAt(0).toUpperCase() + '</div>'
      + '<div style="flex:1;">'
      + '<div style="font-weight:700;font-size:14px;">' + (thr.name || CallCenter._fmtPhone(thr.phone)) + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">' + CallCenter._fmtPhone(thr.phone) + '</div>'
      + '</div>'
      + '<button onclick="CallCenter._dialFrom(\'' + (thr.clientId||'').replace(/'/g,"\\'") + '\',\'' + (thr.name||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\',\'' + thr.phone.replace(/'/g,"\\'") + '\',\'call\')" style="padding:7px 14px;background:#1a7a3c;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;">📞 Call</button>'
      + '</div>'
      // Messages area
      + '<div id="cc-thread-msgs" style="flex:1;padding:16px;display:flex;flex-direction:column;gap:10px;min-height:280px;max-height:450px;overflow-y:auto;">'
      + '<div style="text-align:center;font-size:12px;color:var(--text-light);">Loading…</div>'
      + '</div>'
      // Reply box
      + '<div style="padding:12px;border-top:1px solid var(--border);background:var(--surface);display:flex;gap:8px;align-items:flex-end;">'
      + '<textarea id="cc-reply-input" rows="2" placeholder="Type a message…"'
      + ' onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();CallCenter._sendReply();}"'
      + ' style="flex:1;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;resize:none;font-family:inherit;background:var(--bg);color:var(--text);"></textarea>'
      + '<button onclick="CallCenter._sendReply()" style="padding:9px 20px;background:var(--green-dark);color:#fff;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;">Send ↑</button>'
      + '</div>'
      + '</div>';

    // Load messages
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) return;
    try {
      var { data, error } = await sb.from('communications')
        .select('id,direction,body,from_number,to_number,created_at,status')
        .eq('channel', 'sms')
        .or('from_number.eq.+' + thr.phone + ',to_number.eq.+' + thr.phone + ',from_number.eq.' + thr.phone + ',to_number.eq.' + thr.phone)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      var msgs = data || [];
      var msgsEl = document.getElementById('cc-thread-msgs');
      if (!msgsEl) return;
      if (!msgs.length) { msgsEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-light);font-size:13px;">No messages yet — start the conversation!</div>'; return; }
      msgsEl.innerHTML = msgs.map(function(m) {
        var out = m.direction === 'outbound';
        var ts = m.created_at ? new Date(m.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) + ' · ' + new Date(m.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
        return '<div style="display:flex;flex-direction:column;align-items:' + (out?'flex-end':'flex-start') + ';">'
          + '<div style="max-width:72%;padding:9px 13px;border-radius:' + (out?'14px 14px 4px 14px':'14px 14px 14px 4px') + ';background:' + (out?'var(--green-dark)':'var(--surface)') + ';color:' + (out?'#fff':'var(--text)') + ';font-size:13px;line-height:1.45;border:' + (out?'none':'1px solid var(--border)') + ';">' + (m.body||'') + '</div>'
          + '<div style="font-size:10px;color:var(--text-light);margin-top:2px;padding:0 2px;">' + ts + '</div>'
          + '</div>';
      }).join('');
      msgsEl.scrollTop = msgsEl.scrollHeight;
      setTimeout(function() { msgsEl.scrollTop = msgsEl.scrollHeight; }, 50);
      var ri = document.getElementById('cc-reply-input');
      if (ri) ri.focus();
      // Realtime: append new messages to this thread as they arrive
      CallCenter._subscribeRealtime(sb, thr.phone);
    } catch(e) { console.warn('Thread load failed:', e); }
  },

  _sendReply: async function() {
    var thr = CallCenter._activeThread;
    if (!thr) return;
    var inp = document.getElementById('cc-reply-input');
    var msg = inp ? inp.value.trim() : '';
    if (!msg) return;
    if (inp) { inp.value = ''; inp.disabled = true; }

    var msgsEl = document.getElementById('cc-thread-msgs');
    if (msgsEl) {
      var div = document.createElement('div');
      div.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;';
      div.innerHTML = '<div style="max-width:72%;padding:9px 13px;border-radius:14px 14px 4px 14px;background:var(--green-dark);color:#fff;font-size:13px;line-height:1.45;">' + msg + '</div>'
        + '<div style="font-size:10px;color:var(--text-light);margin-top:2px;">Sending…</div>';
      msgsEl.appendChild(div);
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    var sent = false;
    if (typeof Dialpad !== 'undefined') {
      var result = await Dialpad.sendSMS(thr.phone, msg, thr.clientId);
      sent = result && result.success;
    }
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (sb) {
      await sb.from('communications').insert({
        client_id: thr.clientId || null, type: 'sms', channel: 'sms', direction: 'outbound',
        status: sent ? 'sent' : 'sent_fallback', body: msg,
        to_number: '+' + thr.phone, from_number: null,
        dialpad_id: 'bm-out-' + Date.now(),
        metadata: { sent_from: 'callcenter', method: sent ? 'dialpad' : 'fallback' }
      }).catch(function(){});
    }
    if (inp) { inp.disabled = false; inp.focus(); }
    if (msgsEl) {
      var rows = msgsEl.querySelectorAll('div[style*="flex-end"]');
      var last = rows[rows.length - 1];
      if (last) { var tsEl = last.querySelector('div:last-child'); if (tsEl) tsEl.textContent = new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) + (sent ? '' : ' · fallback'); }
    }
  },

  // ── All Activity ─────────────────────────────────────────────

  _loadActivity: async function() {
    var el = document.getElementById('cc-panel');
    if (!el) return;
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) { el.innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-light);">Sign in to view activity.</div>'; return; }

    try {
      var { data, error } = await sb.from('communications')
        .select('id,client_id,channel,direction,body,from_number,to_number,status,created_at,metadata')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      var comms = data || [];

      if (!comms.length) {
        el.innerHTML = '<div style="padding:80px 24px;text-align:center;color:var(--text-light);"><div style="font-size:40px;margin-bottom:12px;">📋</div><div style="font-size:15px;font-weight:600;">No activity yet</div></div>';
        return;
      }

      var clients = (typeof ClientsPage !== 'undefined' && ClientsPage._cache) ? ClientsPage._cache : [];
      var clientMap = {};
      clients.forEach(function(c) { if (c.id) clientMap[c.id] = c; });

      var html = '<div style="border:1.5px solid var(--border);border-radius:10px;overflow:hidden;margin-top:16px;">';
      comms.forEach(function(c, idx) {
        var isIn = c.direction === 'inbound';
        var isEmail = c.channel === 'email';
        var icon = c.channel === 'call' ? '📞' : c.channel === 'sms' ? '💬' : c.channel === 'voicemail' ? '📭' : '📧';
        var cl = c.client_id ? clientMap[c.client_id] : null;
        var meta = c.metadata && typeof c.metadata === 'object' ? c.metadata : {};
        var ts = UI.dateRelative(c.created_at);
        var isLast = idx === comms.length - 1;

        if (isEmail) {
          var bidType = meta.bidnet_type || 'new_solicitation';
          var bidIcon = bidType === 'award' ? '🏆' : bidType === 'addendum' ? '📎' : '📧';
          var bidLabel = bidType === 'award' ? 'Award' : bidType === 'addendum' ? 'Addendum' : 'New Bid';
          var agency = meta.agency || c.from_number || 'BidNet';
          var solNum  = meta.solicitation_number || '';
          var bidUrl  = meta.bidnet_url || '';
          html += '<div style="display:flex;gap:12px;padding:13px 18px;' + (isLast ? '' : 'border-bottom:1px solid var(--border);') + '">'
            + '<div style="flex-shrink:0;width:38px;height:38px;background:#e3f2fd;border:1.5px solid #90caf9;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;">' + bidIcon + '</div>'
            + '<div style="flex:1;min-width:0;">'
            + '<div style="display:flex;justify-content:space-between;align-items:baseline;">'
            + '<span style="font-weight:600;font-size:13px;">' + agency + '</span>'
            + '<span style="font-size:11px;color:var(--text-light);">' + ts + '</span>'
            + '</div>'
            + '<div style="font-size:11px;color:#1565c0;font-weight:600;margin-top:1px;">' + bidLabel + (solNum ? ' · ' + solNum : '') + '</div>'
            + (c.body ? '<div style="font-size:12px;color:var(--text-light);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + c.body + '</div>' : '')
            + (bidUrl ? '<a href="' + bidUrl + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:4px;font-size:11px;color:#1565c0;font-weight:600;text-decoration:none;">🔗 View Bid</a>' : '')
            + '</div>'
            + '</div>';
          return;
        }

        var dirColor = isIn ? '#1565c0' : '#2e7d32';
        var who = (cl && cl.name) || meta.name || (isIn ? CallCenter._fmtPhone(c.from_number) : CallCenter._fmtPhone(c.to_number)) || 'Unknown';
        var phone = (isIn ? c.from_number : c.to_number) || '';
        var safePhone = phone.replace(/\D/g,'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        var safeWho = who.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        var safeId = (c.client_id||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");

        html += '<div ' + (safePhone ? 'onclick="CallCenter._dialFrom(\'' + safeId + '\',\'' + safeWho + '\',\'' + safePhone + '\',\'sms\')"' : '') + ' style="display:flex;gap:12px;padding:13px 18px;' + (isLast ? '' : 'border-bottom:1px solid var(--border);') + (safePhone?'cursor:pointer;':'') + '"'
          + (safePhone ? ' onmouseover="this.style.background=\'var(--surface)\'" onmouseout="this.style.background=\'\';"' : '') + '>'
          + '<div style="flex-shrink:0;width:38px;height:38px;background:var(--surface);border:1.5px solid var(--border);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;">' + icon + '</div>'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="display:flex;justify-content:space-between;align-items:baseline;">'
          + '<span style="font-weight:600;font-size:13px;">' + who + '</span>'
          + '<span style="font-size:11px;color:var(--text-light);">' + ts + '</span>'
          + '</div>'
          + '<div style="font-size:11px;color:' + dirColor + ';font-weight:600;margin-top:1px;">' + (isIn ? '← Inbound' : '→ Outbound') + ' ' + c.channel + (phone ? ' · ' + CallCenter._fmtPhone(phone) : '') + '</div>'
          + (c.body ? '<div style="font-size:12px;color:var(--text-light);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + c.body + '</div>' : '')
          + '</div>'
          + '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
    } catch(e) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-light);">Failed to load activity.</div>';
    }
  },

  // ── Helpers ──────────────────────────────────────────────────

  _dialFrom: function(clientId, name, phone, mode) {
    CallCenter._clientId = clientId || null;
    CallCenter._clientName = name || null;
    CallCenter._number = phone;
    CallCenter._dialMode = mode || 'call';
    if (mode === 'sms') {
      CallCenter._activeTab = 'threads';
      CallCenter._switchTab('threads');
      CallCenter._openThread({ phone: phone, clientId: clientId, name: name || CallCenter._fmtPhone(phone) });
    } else {
      if (typeof Dialpad !== 'undefined') Dialpad.call(phone, clientId, name);
      else window.open('tel:' + phone);
    }
  },

  _fmtPhone: function(p) {
    var d = (p || '').replace(/\D/g,'');
    if (d.length === 10) return '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
    if (d.length === 11 && d[0]==='1') return '+1 (' + d.slice(1,4) + ') ' + d.slice(4,7) + '-' + d.slice(7);
    return p || '';
  }
};
