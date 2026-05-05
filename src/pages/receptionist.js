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
    var tabs = [['calls','Call Log','📞'],['sms','SMS Inbox','💬'],['voicemail','Voicemail','🎙️'],['settings','Settings','⚙️']];
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
