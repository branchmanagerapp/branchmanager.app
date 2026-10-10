/**
 * Branch Manager — Client Communication Log
 * Track all calls, texts, emails, and notes per client
 * Integrates with Dialpad API when connected
 */
var CommsLog = {
  // Render comms section for a client detail view
  renderForClient: function(clientId) {
    var comms = CommsLog.getAll(clientId);
    var html = '<div style="margin-top:20px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<h4 style="font-size:15px;">💬 Communication Log (' + comms.length + ')</h4>'
      + '<button onclick="CommsLog.showAddForm(\'' + clientId + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">+ Log</button>'
      + '</div>';

    // Add form (hidden by default)
    html += '<div id="comms-add-form" style="display:none;background:var(--bg);border-radius:10px;padding:16px;margin-bottom:12px;border:1px solid var(--border);">'
      + '<div style="display:grid;grid-template-columns:auto 1fr;gap:8px;margin-bottom:8px;">'
      + '<select id="comms-type" style="padding:8px;border:2px solid var(--border);border-radius:6px;font-size:13px;">'
      + '<option value="call">📞 Call</option><option value="text">💬 Text</option><option value="email">📧 Email</option><option value="note">📌 Note</option><option value="visit">🏠 Site Visit</option><option value="voicemail">📱 Voicemail</option>'
      + '</select>'
      + '<select id="comms-direction" style="padding:8px;border:2px solid var(--border);border-radius:6px;font-size:13px;">'
      + '<option value="outbound">Outbound (you → them)</option><option value="inbound">Inbound (them → you)</option>'
      + '</select></div>'
      + '<textarea id="comms-notes" placeholder="What was discussed? Key details, follow-up needed..." rows="3" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;resize:vertical;font-family:inherit;"></textarea>'
      + '<div style="display:flex;gap:8px;margin-top:8px;">'
      + '<button onclick="CommsLog.save(\'' + clientId + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;">Save</button>'
      + '<button onclick="document.getElementById(\'comms-add-form\').style.display=\'none\'" style="background:var(--bg);color:var(--text);border:2px solid var(--border);padding:8px 16px;border-radius:6px;cursor:pointer;">Cancel</button>'
      + '</div></div>';

    // Communication timeline
    if (comms.length) {
      comms.forEach(function(c) {
        var icons = { call: '📞', text: '💬', email: '📧', note: '📌', visit: '🏠', voicemail: '📱' };
        var icon = icons[c.type] || '📋';
        var dirColor = c.direction === 'inbound' ? '#2980b9' : '#27ae60';
        var dirLabel = c.direction === 'inbound' ? '← In' : '→ Out';

        html += '<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #f0f0f0;">'
          + '<div style="flex-shrink:0;width:36px;height:36px;background:' + (c.type === 'note' ? '#fff3e0' : '#e8f5e9') + ';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;">' + icon + '</div>'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;">'
          + '<span style="font-weight:600;font-size:13px;text-transform:capitalize;">' + c.type + ' <span style="font-size:11px;color:' + dirColor + ';font-weight:400;">' + dirLabel + '</span></span>'
          + '<span style="font-size:11px;color:var(--text-light);">' + UI.dateRelative(c.date) + '</span></div>'
          + '<div style="font-size:13px;color:var(--text-light);margin-top:3px;white-space:pre-wrap;">' + (c.notes || '') + '</div>'
          + '</div></div>';
      });
    } else {
      html += '<div style="text-align:center;padding:20px;color:var(--text-light);font-size:13px;">No communications logged yet.</div>';
    }
    html += '</div>';
    return html;
  },

  showAddForm: function(clientId) {
    var form = document.getElementById('comms-add-form');
    if (form) form.style.display = 'block';
  },

  save: function(clientId) {
    var type = document.getElementById('comms-type').value;
    var direction = document.getElementById('comms-direction').value;
    var notes = document.getElementById('comms-notes').value;
    if (!notes.trim()) { UI.toast('Add some notes', 'error'); return; }

    var entry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      clientId: clientId,
      type: type,
      direction: direction,
      notes: notes,
      date: new Date().toISOString(),
      user: (typeof Auth !== 'undefined' && Auth.user && Auth.user.name) ? Auth.user.name : (localStorage.getItem('bm-co-name') || 'Owner').split(' ')[0]
    };

    var key = 'bm-comms-' + clientId;
    var all = [];
    try { all = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
    all.unshift(entry);
    localStorage.setItem(key, JSON.stringify(all));

    document.getElementById('comms-add-form').style.display = 'none';
    document.getElementById('comms-notes').value = '';
    UI.toast('Communication logged');

    // Refresh client detail
    if (typeof ClientsPage !== 'undefined' && ClientsPage.showDetail) {
      ClientsPage.showDetail(clientId);
    }
  },

  getAll: function(clientId) {
    var key = 'bm-comms-' + clientId;
    var local = [];
    try { local = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
    // Merge Supabase 'communications' rows that the Dialpad webhook populated
    // (inbound SMS, calls, voicemails). Cached in window._bmCommsCache to avoid
    // re-fetching on every render — refreshed by CommsLog.refreshCloud().
    var cloud = (window._bmCommsCache && window._bmCommsCache[clientId]) || [];
    if (!cloud.length) {
      // Kick off a fetch in background; next render will include it.
      CommsLog._refreshCloudFor(clientId);
    }
    var merged = local.concat(cloud);
    // De-dupe in two passes:
    //   1. Primary: by id (catches actual duplicate records).
    //   2. Echo-pair: ONLY when the same outbound message has a local copy
    //      (source=undefined, id=Date.now-base36) AND a cloud copy
    //      (source='dialpad', id=uuid) within the same ~90s bucket — that's
    //      the optimistic-then-echo case. Drop the local; keep the cloud.
    //   Two real outbound messages with identical text within 90s (Doug
    //   genuinely sending "OK" twice) are NOT collapsed because they'd both
    //   be local-source OR both cloud-source within the same bucket.
    var seen = {};
    function bucketKey(c) {
      if (!c) return '';
      var d = c.date || c.created_at || '';
      var t = d ? Math.floor(new Date(d).getTime() / 90000) : 0; // 90s buckets
      return (c.notes || c.body || '').slice(0, 80) + '|' + (c.direction || '') + '|' + t;
    }
    var deduped = [];
    var slots = {}; // bk -> { local: rec, cloud: rec }
    merged.forEach(function(c) {
      if (!c || !c.id || seen[c.id]) return;
      seen[c.id] = 1;
      var bk = bucketKey(c);
      var isOutbound = bk.indexOf('|outbound|') !== -1;
      if (isOutbound) {
        var slot = slots[bk] || { local: null, cloud: null };
        var srcKey = c.source === 'dialpad' ? 'cloud' : 'local';
        if (slot[srcKey]) {
          // Already have a row with this source in this bucket — legitimate
          // duplicate (two real sends with same content). Keep both.
          deduped.push(c);
        } else {
          slot[srcKey] = c;
          slots[bk] = slot;
          // If we now have BOTH local and cloud for same content+bucket, that's
          // the optimistic+echo pair — drop the local that was added earlier,
          // keep the cloud row going forward.
          if (slot.local && slot.cloud) {
            var idx = deduped.indexOf(slot.local);
            if (idx !== -1) deduped.splice(idx, 1);
          }
          deduped.push(c);
        }
      } else {
        deduped.push(c);
      }
    });
    deduped.sort(function(a, b) { return new Date(b.date || b.created_at) - new Date(a.date || a.created_at); });
    return deduped;
  },

  // Lazy-load Dialpad-sourced comms from Supabase, cache by client.
  _refreshCloudFor: function(clientId) {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client) return;
    if (CommsLog._cloudFetchInFlight && CommsLog._cloudFetchInFlight[clientId]) return;
    CommsLog._cloudFetchInFlight = CommsLog._cloudFetchInFlight || {};
    CommsLog._cloudFetchInFlight[clientId] = true;
    SupabaseDB.client.from('communications').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100).then(function(res) {
      delete CommsLog._cloudFetchInFlight[clientId];
      if (res.error || !res.data) return;
      window._bmCommsCache = window._bmCommsCache || {};
      window._bmCommsCache[clientId] = res.data.map(function(r) {
        return {
          id: r.id,
          clientId: r.client_id,
          type: r.channel === 'sms' ? 'text' : (r.channel || 'note'),
          direction: r.direction,
          notes: r.body || (r.channel === 'call' ? '(' + (r.status || 'call') + (r.duration_seconds ? ', ' + r.duration_seconds + 's' : '') + ')' : ''),
          date: r.created_at,
          user: 'Dialpad',
          source: 'dialpad',
          metadata: r.metadata || null
        };
      });
    });
  },

  // Get recent comms across all clients
  getRecent: function(limit) {
    limit = limit || 10;
    var all = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.startsWith('bm-comms-')) {
        try {
          var items = JSON.parse(localStorage.getItem(key)) || [];
          items.forEach(function(item) { all.push(item); });
        } catch(e) {}
      }
    }
    all.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    return all.slice(0, limit);
  },

  // Full page — recent comms feed across all clients
  render: function() {
    var recent = CommsLog.getRecent(50);
    var icons = { call: '📞', text: '💬', email: '📧', note: '📌', visit: '🏠', voicemail: '📱' };

    // Stats
    var calls = recent.filter(function(c) { return c.type === 'call'; }).length;
    var texts = recent.filter(function(c) { return c.type === 'text'; }).length;
    var emails = recent.filter(function(c) { return c.type === 'email'; }).length;
    var notes = recent.filter(function(c) { return c.type === 'note'; }).length;

    var html = '<div style="max-width:720px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      + '<div><h2 style="margin:0;font-size:22px;">Communication Log</h2><p style="margin:4px 0 0;color:var(--text-light);font-size:13px;">All calls, texts, emails, and notes across clients</p></div>'
      + '<button class="btn btn-primary" style="font-size:12px;" onclick="CommsLog.quickLog()">+ Log Communication</button>'
      + '</div>';

    // Stat cards
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:20px;font-weight:800;">' + calls + '</div><div style="font-size:11px;color:var(--text-light);">📞 Calls</div></div>'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:20px;font-weight:800;">' + texts + '</div><div style="font-size:11px;color:var(--text-light);">💬 Texts</div></div>'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:20px;font-weight:800;">' + emails + '</div><div style="font-size:11px;color:var(--text-light);">📧 Emails</div></div>'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;"><div style="font-size:20px;font-weight:800;">' + notes + '</div><div style="font-size:11px;color:var(--text-light);">📌 Notes</div></div>'
      + '</div>';

    if (!recent.length) {
      html += '<div class="empty-state"><div class="empty-icon">💬</div>'
        + '<h3>No communications logged</h3>'
        + '<p>Open a client record to log calls, texts, emails, or notes.</p></div>';
    } else {
      var byDate = {};
      recent.forEach(function(c) {
        var d = c.date ? c.date.split('T')[0] : 'unknown';
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(c);
      });
      Object.keys(byDate).sort(function(a,b) { return b.localeCompare(a); }).forEach(function(date) {
        html += '<div style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin:16px 0 8px;">' + UI.dateShort(date) + '</div>';
        byDate[date].forEach(function(c) {
          var client = c.clientId ? DB.clients.getById(c.clientId) : null;
          var clientName = client ? client.name : (c.clientId ? 'Unknown Client' : '');
          var icon = icons[c.type] || '📋';
          var dirColor = c.direction === 'inbound' ? '#2980b9' : '#27ae60';
          var dirLabel = c.direction === 'inbound' ? '← In' : '→ Out';
          html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:8px;display:flex;gap:12px;align-items:flex-start;">'
            + '<div style="flex-shrink:0;width:36px;height:36px;background:' + (c.type === 'note' ? '#fff3e0' : '#e8f5e9') + ';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;">' + icon + '</div>'
            + '<div style="flex:1;min-width:0;">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">'
            + '<span style="font-weight:600;font-size:13px;text-transform:capitalize;">' + c.type
            + ' <span style="font-size:11px;color:' + dirColor + ';font-weight:400;">' + dirLabel + '</span>'
            + (clientName ? ' <span style="font-size:12px;color:var(--text-light);font-weight:400;">— <a href="#" onclick="if(typeof ClientsPage!==\'undefined\')ClientsPage.showDetail(\'' + c.clientId + '\');else loadPage(\'clients\');return false;" style="color:var(--accent);text-decoration:none;">' + UI.esc(clientName) + '</a></span>' : '')
            + '</span>'
            + '<span style="font-size:11px;color:var(--text-light);">' + UI.timeAgo(c.date) + '</span>'
            + '</div>'
            + (c.notes ? '<div style="font-size:13px;color:var(--text-light);margin-top:4px;white-space:pre-wrap;">' + UI.esc(c.notes) + '</div>' : '')
            + '</div></div>';
        });
      });
    }
    html += '</div>';
    return html;
  },

  quickLog: function() {
    var clients = DB.clients.getAll().sort(function(a,b) { return (a.name||'').localeCompare(b.name||''); });
    var opts = '<option value="">— Select client —</option>';
    clients.slice(0, 100).forEach(function(c) { opts += '<option value="' + c.id + '">' + UI.esc(c.name) + '</option>'; });

    var html = UI.field('Client', '<select id="ql-client">' + opts + '</select>')
      + UI.field('Type', '<select id="ql-type"><option value="call">📞 Call</option><option value="text">💬 Text</option><option value="email">📧 Email</option><option value="note">📌 Note</option><option value="visit">🏠 Site Visit</option></select>')
      + UI.field('Direction', '<select id="ql-dir"><option value="outbound">→ Outbound</option><option value="inbound">← Inbound</option></select>')
      + UI.field('Notes', '<textarea id="ql-notes" placeholder="What was discussed?" style="min-height:80px;"></textarea>');

    UI.showModal('Log Communication', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="CommsLog._saveQuickLog()">Save</button>'
    });
  },

  _saveQuickLog: function() {
    var clientId = document.getElementById('ql-client').value;
    if (!clientId) { UI.toast('Please select a client', 'error'); return; }
    var type = document.getElementById('ql-type').value;
    var direction = document.getElementById('ql-dir').value;
    var notes = document.getElementById('ql-notes').value;

    var comms = CommsLog.getAll(clientId);
    comms.push({
      type: type,
      direction: direction,
      notes: notes,
      date: new Date().toISOString(),
      clientId: clientId
    });
    CommsLog.save(clientId, comms);
    UI.closeModal();
    UI.toast('Communication logged');
    loadPage('comms');
  }
};
