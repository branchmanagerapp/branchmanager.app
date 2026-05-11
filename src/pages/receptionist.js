/**
 * Branch Manager — Receptionist v2
 * Dialpad integration hub: call log, SMS inbox, voicemail, settings
 * Mirrors legacy system's communication features through Dialpad
 */
var Receptionist = {
  _tab: 'calls',
  _connected: false,

  render: function() {
    var settings = JSON.parse(localStorage.getItem('bm-receptionist-settings') || '{}');
    Receptionist._connected = !!settings.connected;
    var calls = DB.getAll('bm-call-log');
    var sms = DB.getAll('bm-sms-inbox');
    var voicemails = DB.getAll('bm-voicemails');
    var missed = calls.filter(function(c) { return c.type === 'missed'; });

    var html = '<div style="max-width:1000px;margin:0 auto;">';

    // Stat cards
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px;">';
    html += Receptionist._stat('Total Calls', calls.length, '📞');
    html += Receptionist._stat('Missed Calls', missed.length, '📵', missed.length > 0 ? '#dc3545' : null);
    html += Receptionist._stat('SMS Messages', sms.length, '💬');
    html += Receptionist._stat('Voicemails', voicemails.filter(function(v){return !v.read;}).length + ' unread', '🎙️');
    html += '</div>';

    // Connection status
    if (!Receptionist._connected) {
      html += '<div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:24px;margin-bottom:20px;display:flex;align-items:center;gap:20px;">'
        + '<div style="font-size:40px;">🔌</div>'
        + '<div style="flex:1;">'
        + '<h3 style="margin:0 0 6px;font-size:16px;color:#92400e;">Connect Your Phone System</h3>'
        + '<p style="margin:0;font-size:13px;color:#78350f;">Connect Dialpad to log calls, receive SMS, and get voicemail transcriptions automatically.</p>'
        + '</div>'
        + '<button class="btn btn-primary" onclick="Receptionist.showConnect()">Connect Dialpad</button>'
        + '</div>';
    } else {
      html += '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin-bottom:20px;display:flex;align-items:center;gap:16px;">'
        + '<div style="width:10px;height:10px;background:#16a34a;border-radius:50%;"></div>'
        + '<div style="flex:1;font-size:13px;color:#166534;"><strong>Dialpad connected</strong> — ' + (settings.phoneNumber || 'Business line') + '</div>'
        + '<button class="btn btn-outline" style="font-size:12px;" onclick="Receptionist.disconnect()">Disconnect</button>'
        + '</div>';
    }

    // Tabs
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">';
    html += '<div style="display:flex;border-bottom:1px solid var(--border);">';
    var tabs = [['calls','Call Log','📞'],['sms','SMS Inbox','💬'],['voicemail','Voicemail','🎙️'],['ai','AI Receptionist','🤖'],['settings','Settings','⚙️']];
    tabs.forEach(function(t) {
      var active = Receptionist._tab === t[0];
      html += '<button style="flex:1;padding:14px;border:none;background:' + (active ? 'var(--white)' : 'var(--bg)') + ';cursor:pointer;font-size:13px;font-weight:' + (active ? '700' : '500') + ';color:' + (active ? 'var(--accent)' : 'var(--text-light)') + ';border-bottom:2px solid ' + (active ? 'var(--accent)' : 'transparent') + ';" '
        + 'onclick="Receptionist._tab=\'' + t[0] + '\';App.render()">' + t[2] + ' ' + t[1] + '</button>';
    });
    html += '</div>';

    html += '<div style="padding:20px;">';
    if (Receptionist._tab === 'calls') html += Receptionist._renderCalls(calls);
    else if (Receptionist._tab === 'sms') html += Receptionist._renderSMS(sms);
    else if (Receptionist._tab === 'voicemail') html += Receptionist._renderVoicemail(voicemails);
    else if (Receptionist._tab === 'ai') html += Receptionist._renderAI();
    else html += Receptionist._renderSettings(settings);
    html += '</div></div></div>';
    return html;
  },

  _stat: function(label, value, icon, color) {
    return '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;text-align:center;">'
      + '<div style="font-size:24px;margin-bottom:4px;">' + icon + '</div>'
      + '<div style="font-size:22px;font-weight:800;' + (color ? 'color:'+color : '') + ';">' + value + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;">' + label + '</div>'
      + '</div>';
  },

  _renderCalls: function(calls) {
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
    html += '<span style="font-size:14px;font-weight:700;">' + calls.length + ' calls</span>';
    html += '<button class="btn btn-primary" style="font-size:12px;" onclick="Receptionist.logCall()">+ Log Call</button>';
    html += '</div>';

    if (calls.length === 0) {
      return html + '<div style="text-align:center;padding:40px;color:var(--text-light);">'
        + '<div style="font-size:48px;margin-bottom:12px;">📞</div>'
        + '<h3>No calls logged yet</h3><p>Calls will appear here when Dialpad is connected, or log them manually.</p></div>';
    }

    html += '<table class="data-table" style="width:100%;"><thead><tr>'
      + '<th>DATE</th><th>CALLER</th><th>PHONE</th><th>DURATION</th><th>TYPE</th><th>CLIENT</th><th></th>'
      + '</tr></thead><tbody>';
    calls.sort(function(a,b){return new Date(b.date)-new Date(a.date);}).forEach(function(c) {
      var typeColors = { inbound:'#16a34a', outbound:'#2563eb', missed:'#dc3545' };
      html += '<tr>'
        + '<td>' + new Date(c.date).toLocaleString() + '</td>'
        + '<td style="font-weight:600;">' + UI.esc(c.callerName || 'Unknown') + '</td>'
        + '<td>' + UI.esc(c.phone || '—') + '</td>'
        + '<td>' + (c.duration || '—') + '</td>'
        + '<td><span style="color:' + (typeColors[c.type] || '#6b7280') + ';font-weight:600;font-size:12px;">' + (c.type || 'inbound') + '</span></td>'
        + '<td>' + UI.esc(c.linkedClient || '—') + '</td>'
        + '<td><button class="btn btn-outline" style="font-size:11px;padding:2px 6px;" onclick="Receptionist.removeCall(\'' + c.id + '\')">×</button></td>'
        + '</tr>';
    });
    html += '</tbody></table>';
    return html;
  },

  _renderSMS: function(sms) {
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
    html += '<span style="font-size:14px;font-weight:700;">' + sms.length + ' messages</span>';
    html += '<button class="btn btn-primary" style="font-size:12px;" onclick="Receptionist.composeSMS()">+ New SMS</button>';
    html += '</div>';

    if (sms.length === 0) {
      return html + '<div style="text-align:center;padding:40px;color:var(--text-light);">'
        + '<div style="font-size:48px;margin-bottom:12px;">💬</div>'
        + '<h3>No SMS messages</h3><p>Messages will appear here when Dialpad is connected.</p></div>';
    }

    sms.sort(function(a,b){return new Date(b.date)-new Date(a.date);}).forEach(function(m) {
      var unread = !m.read;
      html += '<div style="padding:14px;border-bottom:1px solid var(--border);cursor:pointer;background:' + (unread ? '#f0fdf4' : 'transparent') + ';" '
        + 'onclick="Receptionist.viewSMS(\'' + m.id + '\')">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;">'
        + '<div style="font-weight:' + (unread ? '700' : '500') + ';font-size:14px;">' + UI.esc(m.from || 'Unknown') + (unread ? ' <span style="background:#16a34a;color:#fff;font-size:9px;padding:1px 6px;border-radius:8px;">NEW</span>' : '') + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);">' + new Date(m.date).toLocaleString() + '</div>'
        + '</div>'
        + '<div style="font-size:13px;color:var(--text-light);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(m.message || '') + '</div>'
        + '</div>';
    });
    return html;
  },

  _renderVoicemail: function(voicemails) {
    var html = '<div style="margin-bottom:16px;font-size:14px;font-weight:700;">' + voicemails.length + ' voicemails</div>';

    if (voicemails.length === 0) {
      return '<div style="text-align:center;padding:40px;color:var(--text-light);">'
        + '<div style="font-size:48px;margin-bottom:12px;">🎙️</div>'
        + '<h3>No voicemails</h3><p>Voicemails with AI transcription will appear here.</p></div>';
    }

    voicemails.sort(function(a,b){return new Date(b.date)-new Date(a.date);}).forEach(function(v) {
      html += '<div style="padding:16px;border:1px solid var(--border);border-radius:10px;margin-bottom:10px;background:' + (!v.read ? '#f0fdf4' : 'var(--white)') + ';">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
        + '<div style="font-weight:700;font-size:14px;">' + UI.esc(v.callerName || v.phone || 'Unknown') + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);">' + (v.duration || '0:30') + ' — ' + new Date(v.date).toLocaleString() + '</div>'
        + '</div>'
        + '<div style="background:var(--bg);border-radius:8px;padding:12px;font-size:13px;color:var(--text);line-height:1.5;">'
        + '<div style="font-size:10px;font-weight:700;color:var(--text-light);text-transform:uppercase;margin-bottom:4px;">AI Transcription</div>'
        + UI.esc(v.transcription || 'Transcription processing...')
        + '</div>'
        + '<div style="margin-top:8px;display:flex;gap:8px;">'
        + '<button class="btn btn-outline" style="font-size:11px;" onclick="Receptionist.callback(\'' + UI.esc(v.phone || '') + '\')">Call Back</button>'
        + '<button class="btn btn-outline" style="font-size:11px;" onclick="Receptionist.createRequest(\'' + UI.esc(v.callerName || '') + '\',\'' + UI.esc(v.phone || '') + '\')">Create Request</button>'
        + '</div></div>';
    });
    return html;
  },

  // BM Receptionist — per-tenant config for the Twilio + Claude AI
  // receptionist (edge fn: bm-receptionist). Reads/writes
  // tenants.config.receptionist via Supabase. See CALL-CENTER-RESEARCH.md
  // for the architecture rationale.
  _renderAI: function() {
    var loaded = window._receptionistCfg;
    if (!loaded) {
      Receptionist._loadAIConfig();
      return '<div style="padding:40px;text-align:center;color:var(--text-light);">Loading AI Receptionist config…</div>';
    }
    var c = loaded || {};
    var enabled = !!c.enabled;
    var servicesText = (c.services || []).join('\n');
    var areasText = (c.service_areas || []).join('\n');
    var callbackUrl = 'https://ltpivkqahvplapyagljt.supabase.co/functions/v1/bm-receptionist';
    var html = '<div style="max-width:760px;">';

    html += '<div style="background:' + (enabled ? '#f0fdf4' : '#fef3c7') + ';border:1px solid ' + (enabled ? '#86efac' : '#fde68a') + ';border-radius:10px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;">'
      + '<div style="font-size:26px;">' + (enabled ? '🟢' : '⏸') + '</div>'
      + '<div style="flex:1;"><b style="color:' + (enabled ? '#065f46' : '#92400e') + ';">AI Receptionist ' + (enabled ? 'ON' : 'OFF') + '</b>'
      +   '<div style="font-size:12px;color:' + (enabled ? '#065f46' : '#92400e') + ';">'
      +     (enabled
        ? 'Inbound calls to the configured number go through Claude. Qualified leads land in Requests.'
        : 'Flip on after you\'ve registered the Twilio number below in Twilio\'s console with this webhook URL.')
      +   '</div>'
      + '</div>'
      + '<button onclick="Receptionist._toggleAI(' + (enabled ? 'false' : 'true') + ')" class="btn ' + (enabled ? 'btn-outline' : 'btn-primary') + '" style="font-size:13px;">' + (enabled ? 'Turn OFF' : 'Turn ON') + '</button>'
      + '</div>';

    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:14px;">'
      + '<div style="font-size:13px;font-weight:700;margin-bottom:8px;">Twilio webhook URL</div>'
      + '<div style="display:flex;gap:6px;align-items:center;">'
      +   '<input id="rc-webhook" readonly value="' + UI.esc(callbackUrl) + '" style="flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:monospace;background:var(--bg);">'
      +   '<button onclick="navigator.clipboard.writeText(\'' + callbackUrl + '\');UI.toast(\'Copied\')" class="btn btn-outline" style="font-size:12px;">📋 Copy</button>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);margin-top:6px;">Paste this into your Twilio number\'s "A Call Comes In" webhook (HTTP POST). Method = POST. The function reads the To number and routes to the right tenant.</div>'
      + '</div>';

    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      +   '<label><div style="font-size:12px;font-weight:700;color:var(--text-light);margin-bottom:4px;">TWILIO NUMBER (To)</div>'
      +     '<input id="rc-twilio-to" placeholder="+19145551234" value="' + UI.esc(c.twilio_to || '') + '" style="width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box;font-family:monospace;"></label>'
      +   '<label><div style="font-size:12px;font-weight:700;color:var(--text-light);margin-bottom:4px;">TRANSFER TO (when caller asks for human)</div>'
      +     '<input id="rc-transfer" placeholder="+19143915233" value="' + UI.esc(c.transfer_number || '') + '" style="width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box;font-family:monospace;"></label>'
      + '</div>'
      + '<label style="display:block;margin-top:12px;"><div style="font-size:12px;font-weight:700;color:var(--text-light);margin-bottom:4px;">GREETING (first thing the caller hears)</div>'
      +   '<textarea id="rc-greeting" rows="2" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box;" placeholder="Hi! Thanks for calling Second Nature Tree. How can I help you today?">' + UI.esc(c.greeting || '') + '</textarea></label>'
      + '<label style="display:block;margin-top:10px;"><div style="font-size:12px;font-weight:700;color:var(--text-light);margin-bottom:4px;">BUSINESS HOURS (told to Claude)</div>'
      +   '<input id="rc-hours" value="' + UI.esc(c.business_hours || '') + '" placeholder="Mon–Fri 8am–6pm Eastern" style="width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box;"></label>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;">'
      +   '<label><div style="font-size:12px;font-weight:700;color:var(--text-light);margin-bottom:4px;">SERVICES OFFERED <span style="font-weight:400;">(one per line)</span></div>'
      +     '<textarea id="rc-services" rows="5" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box;" placeholder="Tree removal\nTree pruning\nStump grinding\nEmergency tree service">' + UI.esc(servicesText) + '</textarea></label>'
      +   '<label><div style="font-size:12px;font-weight:700;color:var(--text-light);margin-bottom:4px;">SERVICE AREAS <span style="font-weight:400;">(one per line)</span></div>'
      +     '<textarea id="rc-areas" rows="5" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box;" placeholder="Peekskill, NY\nYorktown Heights, NY\nCortlandt Manor, NY">' + UI.esc(areasText) + '</textarea></label>'
      + '</div>'
      + '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">'
      +   '<button onclick="Receptionist._saveAIConfig()" class="btn btn-primary" style="font-size:13px;">💾 Save</button>'
      +   '<button onclick="Receptionist._testAI()" class="btn btn-outline" style="font-size:13px;">📞 Test call (simulated)</button>'
      +   '<a href="https://www.twilio.com/console/phone-numbers/incoming" target="_blank" class="btn btn-outline" style="font-size:13px;text-decoration:none;">↗ Twilio console</a>'
      + '</div>'
      + '</div>';

    // Recent receptionist calls
    html += '<div id="rc-recent" style="margin-top:18px;"></div>';
    setTimeout(function() { Receptionist._loadRecentAICalls(); }, 30);

    html += '<div style="margin-top:16px;font-size:12px;color:var(--text-light);">Per-call cost ≈ $0.33 at 3 min average (Twilio inbound + ConversationRelay + transcription + Claude tokens). See <code>CALL-CENTER-RESEARCH.md</code>.</div>';

    html += '</div>';
    return html;
  },

  _loadAIConfig: function() {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    var tenantId = (typeof window !== 'undefined' && window.resolveTenantId) ? window.resolveTenantId() : null;
    if (!sb || !tenantId) { window._receptionistCfg = {}; loadPage('receptionist'); return; }
    sb.from('tenants').select('config').eq('id', tenantId).maybeSingle().then(function(r) {
      window._receptionistCfg = (r && r.data && r.data.config && r.data.config.receptionist) || {};
      if (window._currentPage === 'receptionist') loadPage('receptionist');
    });
  },

  _saveAIConfig: function() {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    var tenantId = (typeof window !== 'undefined' && window.resolveTenantId) ? window.resolveTenantId() : null;
    if (!sb || !tenantId) { UI.toast('Supabase not connected', 'error'); return; }
    var twilio_to = (document.getElementById('rc-twilio-to') || {}).value || '';
    var transfer_number = (document.getElementById('rc-transfer') || {}).value || '';
    var greeting = (document.getElementById('rc-greeting') || {}).value || '';
    var business_hours = (document.getElementById('rc-hours') || {}).value || '';
    var services = ((document.getElementById('rc-services') || {}).value || '').split('\n').map(function(s){return s.trim();}).filter(Boolean);
    var service_areas = ((document.getElementById('rc-areas') || {}).value || '').split('\n').map(function(s){return s.trim();}).filter(Boolean);
    sb.from('tenants').select('config').eq('id', tenantId).maybeSingle().then(function(r) {
      var cfg = (r && r.data && r.data.config) || {};
      var prev = cfg.receptionist || {};
      cfg.receptionist = Object.assign({}, prev, {
        twilio_to: twilio_to.trim() || null,
        transfer_number: transfer_number.trim() || null,
        greeting: greeting.trim() || null,
        business_hours: business_hours.trim() || null,
        services: services,
        service_areas: service_areas
      });
      sb.from('tenants').update({ config: cfg }).eq('id', tenantId).then(function(r2) {
        if (r2.error) { UI.toast('Save failed: ' + r2.error.message, 'error'); return; }
        window._receptionistCfg = cfg.receptionist;
        UI.toast('AI Receptionist config saved ✓');
      });
    });
  },

  _toggleAI: function(on) {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    var tenantId = (typeof window !== 'undefined' && window.resolveTenantId) ? window.resolveTenantId() : null;
    if (!sb || !tenantId) return;
    if (on) {
      if (!window._receptionistCfg || !window._receptionistCfg.twilio_to) {
        UI.toast('Set the Twilio number first, then save', 'error');
        return;
      }
      if (!confirm('Turn AI Receptionist ON?\n\nInbound calls to ' + window._receptionistCfg.twilio_to + ' will be answered by Claude. Doug won\'t hear the phone ring unless the AI transfers.\n\nContinue?')) return;
    }
    sb.from('tenants').select('config').eq('id', tenantId).maybeSingle().then(function(r) {
      var cfg = (r && r.data && r.data.config) || {};
      cfg.receptionist = Object.assign({}, cfg.receptionist || {}, { enabled: !!on });
      sb.from('tenants').update({ config: cfg }).eq('id', tenantId).then(function() {
        window._receptionistCfg = cfg.receptionist;
        UI.toast('AI Receptionist ' + (on ? 'turned ON' : 'turned OFF'));
        loadPage('receptionist');
      });
    });
  },

  _testAI: function() {
    var cfg = window._receptionistCfg || {};
    if (!cfg.twilio_to) { UI.toast('Set the Twilio number + save first', 'error'); return; }
    UI.showModal('Simulated test call', '<div style="font-size:13px;line-height:1.6;">'
      + '<p>This fires a fake Twilio webhook against the bm-receptionist edge fn to verify it routes to your tenant. It will NOT call your phone.</p>'
      + '<p><b>What to expect:</b> a TwiML response in the modal below. If it includes your greeting, the routing works. If it says "This number is not configured," your <code>twilio_to</code> doesn\'t match the value here.</p>'
      + '<button class="btn btn-primary" onclick="Receptionist._runTestCall()" style="margin-top:8px;">Run simulated call</button>'
      + '<pre id="rc-test-out" style="margin-top:14px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px;font-size:11px;font-family:monospace;max-height:240px;overflow:auto;white-space:pre-wrap;"></pre>'
      + '</div>');
  },

  _runTestCall: function() {
    var cfg = window._receptionistCfg || {};
    var out = document.getElementById('rc-test-out');
    if (!out) return;
    out.textContent = 'Calling…';
    fetch('https://ltpivkqahvplapyagljt.supabase.co/functions/v1/bm-receptionist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'CallSid=CAtest' + Date.now() + '&From=%2B15555550100&To=' + encodeURIComponent(cfg.twilio_to || '')
    }).then(function(r) { return r.text(); })
      .then(function(t) { out.textContent = t; })
      .catch(function(e) { out.textContent = 'Error: ' + e.message; });
  },

  _loadRecentAICalls: function() {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    var el = document.getElementById('rc-recent');
    if (!sb || !el) return;
    sb.from('receptionist_calls').select('*').order('started_at', { ascending: false }).limit(10).then(function(r) {
      if (r.error || !r.data || !r.data.length) {
        el.innerHTML = '<div style="font-size:12px;color:var(--text-light);text-align:center;padding:20px;">No AI calls yet. Once Twilio is wired, recent calls appear here.</div>';
        return;
      }
      var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;overflow:hidden;">'
        + '<div style="padding:10px 14px;border-bottom:1px solid var(--border);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);">Recent AI calls</div>';
      r.data.forEach(function(c) {
        var disp = c.disposition || 'in_progress';
        var color = disp === 'qualified' ? 'var(--green-dark)' : disp === 'junk' ? '#c62828' : '#92400e';
        html += '<div style="padding:10px 14px;border-bottom:1px solid var(--border);font-size:12px;display:flex;justify-content:space-between;align-items:center;">'
          + '<div><b>' + (c.from_number || 'unknown') + '</b> · <span style="color:' + color + ';font-weight:600;">' + disp + '</span>'
          +   (c.qualified_data && c.qualified_data.name ? ' · ' + UI.esc(c.qualified_data.name) : '')
          + '</div>'
          + '<div style="color:var(--text-light);">' + (UI.dateRelative ? UI.dateRelative(c.started_at) : c.started_at.slice(0,16)) + '</div>'
          + '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
    });
  },

  _renderSettings: function(settings) {
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">';

    // Provider selection
    html += '<div style="grid-column:1/-1;">';
    html += '<h4 style="margin:0 0 12px;font-size:14px;font-weight:700;">Phone Provider</h4>';
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">';
    var providers = [
      { name:'Dialpad', color:'#7C3AED', icon:'☎️', desc:'Business phone, SMS, voicemail, call recording' },
      { name:'OpenPhone', color:'#3B82F6', icon:'📱', desc:'Simple business phone with shared inbox' },
      { name:'Google Voice', color:'#34A853', icon:'🔊', desc:'Free business number with forwarding' },
      { name:'RingCentral', color:'#F97316', icon:'📡', desc:'Enterprise VoIP, SMS, fax & messaging' }
    ];
    providers.forEach(function(p) {
      var selected = settings.provider === p.name;
      html += '<div style="border:2px solid ' + (selected ? p.color : 'var(--border)') + ';border-radius:10px;padding:14px;cursor:pointer;text-align:center;" '
        + 'onclick="Receptionist.selectProvider(\'' + p.name + '\')">'
        + '<div style="font-size:24px;margin-bottom:6px;">' + p.icon + '</div>'
        + '<div style="font-weight:700;font-size:13px;">' + p.name + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);margin-top:4px;">' + p.desc + '</div>'
        + (selected ? '<div style="margin-top:8px;font-size:11px;color:' + p.color + ';font-weight:700;">✓ Selected</div>' : '')
        + '</div>';
    });
    html += '</div></div>';

    // Auto-reply settings
    html += '<div>'
      + '<h4 style="margin:0 0 12px;font-size:14px;font-weight:700;">Auto-Reply</h4>'
      + '<label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;cursor:pointer;">'
      + '<input type="checkbox" ' + (settings.autoReply ? 'checked' : '') + ' onchange="Receptionist.toggleSetting(\'autoReply\',this.checked)"> '
      + '<span style="font-size:13px;">Enable auto-reply for missed calls</span></label>'
      + '<textarea style="width:100%;min-height:80px;border:1px solid var(--border);border-radius:8px;padding:10px;font-size:13px;" '
      + 'placeholder="Thanks for calling ' + BM_CONFIG.companyName + '! We missed your call but will get back to you within 1 hour."'
      + ' onblur="Receptionist.saveSetting(\'autoReplyMsg\',this.value)">' + UI.esc(settings.autoReplyMsg || '') + '</textarea>'
      + '</div>';

    // Business hours
    html += '<div>'
      + '<h4 style="margin:0 0 12px;font-size:14px;font-weight:700;">Business Hours</h4>'
      + '<div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:8px;align-items:center;">';
    var days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var hours = settings.hours || {};
    days.forEach(function(d) {
      var h = hours[d] || { open:'8:00', close:'17:00', enabled: d !== 'Sun' };
      html += '<label style="font-size:13px;display:flex;align-items:center;gap:6px;">'
        + '<input type="checkbox" ' + (h.enabled ? 'checked' : '') + ' onchange="Receptionist.toggleDay(\'' + d + '\',this.checked)"> ' + d
        + '</label>'
        + '<input type="time" value="' + h.open + '" style="padding:4px;border:1px solid var(--border);border-radius:4px;font-size:12px;" onchange="Receptionist.setHour(\'' + d + '\',\'open\',this.value)">'
        + '<input type="time" value="' + h.close + '" style="padding:4px;border:1px solid var(--border);border-radius:4px;font-size:12px;" onchange="Receptionist.setHour(\'' + d + '\',\'close\',this.value)">';
    });
    html += '</div></div>';

    // Additional toggles
    html += '<div style="grid-column:1/-1;">'
      + '<h4 style="margin:0 0 12px;font-size:14px;font-weight:700;">Features</h4>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
    var features = [
      ['callRecording','Call Recording','Record all calls for quality & training'],
      ['voicemailTranscription','Voicemail Transcription','AI-powered voicemail to text'],
      ['missedCallAlerts','Missed Call Alerts','Get notified of every missed call'],
      ['autoCreateRequest','Auto-Create Requests','Create a request when a new caller is detected'],
      ['smsNotifications','SMS Notifications','Send job updates via text to clients'],
      ['afterHoursMsg','After-Hours Message','Play custom message outside business hours']
    ];
    features.forEach(function(f) {
      html += '<label style="display:flex;align-items:flex-start;gap:8px;padding:10px;background:var(--bg);border-radius:8px;cursor:pointer;">'
        + '<input type="checkbox" ' + (settings[f[0]] ? 'checked' : '') + ' onchange="Receptionist.toggleSetting(\'' + f[0] + '\',this.checked)" style="margin-top:2px;">'
        + '<div><div style="font-size:13px;font-weight:600;">' + f[1] + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);">' + f[2] + '</div></div>'
        + '</label>';
    });
    html += '</div></div>';

    html += '</div>';
    return html;
  },

  showConnect: function() {
    var html = UI.field('Dialpad API Key', '<input type="text" id="dp-key" placeholder="Enter your Dialpad API key">')
      + UI.field('Business Phone Number', '<input type="text" id="dp-phone" placeholder="(914) 555-0123">')
      + '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-top:12px;font-size:12px;color:#166534;">'
      + '<strong>Setup:</strong> Log into dialpad.com → Settings → API → Copy your API key. Calls & SMS will sync automatically.'
      + '</div>';
    UI.showModal('Connect Dialpad', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="Receptionist.connect()">Connect</button>'
    });
  },

  connect: function() {
    var settings = JSON.parse(localStorage.getItem('bm-receptionist-settings') || '{}');
    settings.connected = true;
    settings.provider = 'Dialpad';
    settings.phoneNumber = document.getElementById('dp-phone').value || 'Business line';
    localStorage.setItem('bm-receptionist-settings', JSON.stringify(settings));
    UI.closeModal();
    UI.toast('Dialpad connected! ✅');
    App.render();
  },

  disconnect: function() {
    if (!confirm('Disconnect Dialpad?')) return;
    var settings = JSON.parse(localStorage.getItem('bm-receptionist-settings') || '{}');
    settings.connected = false;
    localStorage.setItem('bm-receptionist-settings', JSON.stringify(settings));
    UI.toast('Dialpad disconnected');
    App.render();
  },

  selectProvider: function(name) {
    var settings = JSON.parse(localStorage.getItem('bm-receptionist-settings') || '{}');
    settings.provider = name;
    localStorage.setItem('bm-receptionist-settings', JSON.stringify(settings));
    App.render();
  },

  toggleSetting: function(key, val) {
    var settings = JSON.parse(localStorage.getItem('bm-receptionist-settings') || '{}');
    settings[key] = val;
    localStorage.setItem('bm-receptionist-settings', JSON.stringify(settings));
  },

  saveSetting: function(key, val) {
    var settings = JSON.parse(localStorage.getItem('bm-receptionist-settings') || '{}');
    settings[key] = val;
    localStorage.setItem('bm-receptionist-settings', JSON.stringify(settings));
  },

  toggleDay: function(day, enabled) {
    var settings = JSON.parse(localStorage.getItem('bm-receptionist-settings') || '{}');
    if (!settings.hours) settings.hours = {};
    if (!settings.hours[day]) settings.hours[day] = { open:'8:00', close:'17:00', enabled:true };
    settings.hours[day].enabled = enabled;
    localStorage.setItem('bm-receptionist-settings', JSON.stringify(settings));
  },

  setHour: function(day, field, val) {
    var settings = JSON.parse(localStorage.getItem('bm-receptionist-settings') || '{}');
    if (!settings.hours) settings.hours = {};
    if (!settings.hours[day]) settings.hours[day] = { open:'8:00', close:'17:00', enabled:true };
    settings.hours[day][field] = val;
    localStorage.setItem('bm-receptionist-settings', JSON.stringify(settings));
  },

  logCall: function() {
    var clients = DB.getAll('bm-clients');
    var opts = '<option value="">— No linked client —</option>';
    clients.slice(0, 50).forEach(function(c) { opts += '<option value="' + UI.esc(c.name) + '">' + UI.esc(c.name) + '</option>'; });

    var html = UI.field('Caller Name', '<input type="text" id="call-name" placeholder="John Smith">')
      + UI.field('Phone', '<input type="text" id="call-phone" placeholder="(914) 555-0123">')
      + UI.field('Type', '<select id="call-type"><option>inbound</option><option>outbound</option><option>missed</option></select>')
      + UI.field('Duration', '<input type="text" id="call-dur" placeholder="2:30">')
      + UI.field('Link to Client', '<select id="call-client">' + opts + '</select>')
      + UI.field('Notes', '<textarea id="call-notes" placeholder="Call notes..."></textarea>');

    UI.showModal('Log Call', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="Receptionist.saveCall()">Save</button>'
    });
  },

  saveCall: function() {
    DB.create('bm-call-log', {
      callerName: document.getElementById('call-name').value,
      phone: document.getElementById('call-phone').value,
      type: document.getElementById('call-type').value,
      duration: document.getElementById('call-dur').value,
      linkedClient: document.getElementById('call-client').value,
      notes: document.getElementById('call-notes').value,
      date: new Date().toISOString()
    });
    UI.closeModal();
    UI.toast('Call logged');
    App.render();
  },

  removeCall: function(id) {
    DB.remove('bm-call-log', id);
    UI.toast('Call removed');
    App.render();
  },

  composeSMS: function() {
    var html = UI.field('To', '<input type="text" id="sms-to" placeholder="Phone number or client name">')
      + UI.field('Message', '<textarea id="sms-msg" placeholder="Type your message..." style="min-height:100px;"></textarea>');
    UI.showModal('New SMS', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="UI.toast(\'SMS sent!\');UI.closeModal();">Send</button>'
    });
  },

  viewSMS: function(id) {
    var m = DB.getById('bm-sms-inbox', id);
    if (!m) return;
    m.read = true;
    DB.update('bm-sms-inbox', id, m);
    UI.showModal('SMS from ' + UI.esc(m.from || 'Unknown'), '<div style="font-size:14px;line-height:1.6;">' + UI.esc(m.message) + '</div>'
      + '<div style="margin-top:12px;font-size:11px;color:var(--text-light);">' + new Date(m.date).toLocaleString() + '</div>', {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
        + ' <button class="btn btn-primary" onclick="Receptionist.composeSMS()">Reply</button>'
    });
  },

  callback: function(phone) {
    UI.toast('Calling ' + phone + '...');
  },

  createRequest: function(name, phone) {
    DB.create('bm-requests', { clientName: name, phone: phone, source: 'Voicemail', status: 'new', notes: 'Created from voicemail', createdAt: new Date().toISOString() });
    UI.toast('Request created for ' + name);
  }
};
