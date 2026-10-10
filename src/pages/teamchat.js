/**
 * Branch Manager — Team Chat
 * Real-time channels backed by Supabase (team_messages table)
 * Storage bucket: team-photos (public, 10 MB limit)
 * Channels: General, Errands, Maintenance, Jobs
 */
var TeamChat = {
  _channel: 'general',
  _msgCache: {},      // { channel: [ ...rows ] }  — populated by _fetchMessages
  _loading: {},       // { channel: bool }
  _sub: null,         // Supabase real-time channel handle
  _lastRead: {},      // { channel: timestampMs }  — persisted to localStorage
  // Phase 2 — resolved per-call via the central resolver in src/supabase.js.
  get TENANT_ID() { return window.resolveTenantId(); },

  // ── Supabase client shortcut ──────────────────────────────────────────
  _sb: function() {
    return (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
  },

  // ── Bootstrap — called once when BM app starts (or lazily from render) ──
  _init: function() {
    try { TeamChat._lastRead = JSON.parse(localStorage.getItem('bm-chat-read') || '{}'); } catch(e) { TeamChat._lastRead = {}; }
    TeamChat._subscribe();
    TeamChat._fetchMessages(TeamChat._channel);
  },

  // ── Real-time subscription ────────────────────────────────────────────
  _subscribe: function() {
    var sb = TeamChat._sb();
    if (!sb) return;
    if (TeamChat._sub) {
      try { sb.removeChannel(TeamChat._sub); } catch(e) {}
    }
    TeamChat._sub = sb.channel('bm-team-messages')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'team_messages'
      }, function(payload) {
        var msg = payload.new;
        if (!msg) return;
        var ch = msg.channel || 'general';
        if (!TeamChat._msgCache[ch]) TeamChat._msgCache[ch] = [];
        // Avoid duplicates (optimistic insert may have already added it)
        var exists = TeamChat._msgCache[ch].some(function(m) { return m.id === msg.id; });
        if (!exists) TeamChat._msgCache[ch].push(msg);
        if (window._currentPage === 'teamchat' && ch === TeamChat._channel) {
          loadPage('teamchat');
          setTimeout(function() { var el = document.getElementById('chat-messages'); if (el) el.scrollTop = el.scrollHeight; }, 80);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'team_messages'
      }, function(payload) {
        var msg = payload.new;
        if (!msg) return;
        var ch = msg.channel || 'general';
        if (TeamChat._msgCache[ch]) {
          var idx = -1;
          for (var i = 0; i < TeamChat._msgCache[ch].length; i++) {
            if (TeamChat._msgCache[ch][i].id === msg.id) { idx = i; break; }
          }
          if (idx >= 0) TeamChat._msgCache[ch][idx] = msg;
          else TeamChat._msgCache[ch].push(msg);
        }
        if (window._currentPage === 'teamchat' && ch === TeamChat._channel) loadPage('teamchat');
      })
      .subscribe();
  },

  // ── Fetch messages for a channel from Supabase ────────────────────────
  _fetchMessages: function(channel) {
    var sb = TeamChat._sb();
    if (!sb) {
      TeamChat._msgCache[channel] = TeamChat._getLocal(channel);
      return;
    }
    if (TeamChat._loading[channel]) return;
    TeamChat._loading[channel] = true;
    sb.from('team_messages')
      .select('*')
      .eq('channel', channel)
      .order('created_at', { ascending: true })
      .limit(300)
      .then(function(res) {
        TeamChat._loading[channel] = false;
        if (res.error) {
          console.warn('[TeamChat] fetch error:', res.error.message);
          TeamChat._msgCache[channel] = TeamChat._getLocal(channel);
        } else {
          TeamChat._msgCache[channel] = res.data || [];
          TeamChat._migratePending(channel);
        }
        if (window._currentPage === 'teamchat') {
          loadPage('teamchat');
          setTimeout(function() { var el = document.getElementById('chat-messages'); if (el) el.scrollTop = el.scrollHeight; }, 80);
        }
      });
  },

  // ── Migrate any offline-saved localStorage messages to Supabase ───────
  _migratePending: function(channel) {
    var pending = TeamChat._getLocal(channel);
    if (!pending.length) return;
    var sb = TeamChat._sb();
    if (!sb) return;
    var cloudIds = {};
    (TeamChat._msgCache[channel] || []).forEach(function(m) { cloudIds[m.id] = true; });
    var toMigrate = pending.filter(function(m) { return !cloudIds[m.id]; });
    toMigrate.forEach(function(m) {
      sb.from('team_messages').insert({
        id: m.id,
        channel: channel,
        author: m.author || 'Unknown',
        text: m.text || '',
        task: m.task || null,
        task_complete: m.taskComplete || false,
        tenant_id: TeamChat.TENANT_ID,
        created_at: m.timestamp || m.created_at || new Date().toISOString()
      }).then(function() {}).catch(function() {});
    });
    localStorage.removeItem('bm-chat-' + channel);
  },

  _getLocal: function(channel) {
    try { return JSON.parse(localStorage.getItem('bm-chat-' + channel) || '[]'); } catch(e) { return []; }
  },

  // ── Main render ───────────────────────────────────────────────────────
  render: function() {
    // Bootstrap on first visit
    if (TeamChat._msgCache[TeamChat._channel] === undefined) {
      TeamChat._msgCache[TeamChat._channel] = [];
      if (TeamChat._sb()) {
        if (!TeamChat._sub) TeamChat._subscribe();
        TeamChat._fetchMessages(TeamChat._channel);
      } else {
        TeamChat._msgCache[TeamChat._channel] = TeamChat._getLocal(TeamChat._channel);
      }
    }

    // Mark channel as read
    TeamChat._lastRead[TeamChat._channel] = Date.now();
    try { localStorage.setItem('bm-chat-read', JSON.stringify(TeamChat._lastRead)); } catch(e) {}

    var channels = [
      { id: 'general',     label: 'General',     icon: '💬' },
      { id: 'errands',     label: 'Errands',      icon: '🏃' },
      { id: 'maintenance', label: 'Maintenance',  icon: '🔧' },
      { id: 'jobs',        label: 'Jobs',          icon: '🌳' }
    ];

    var html = '<div style="display:grid;grid-template-columns:200px 1fr;height:calc(100vh - 120px);gap:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--white);" class="detail-grid">';

    // ── Sidebar ──────────────────────────────────────────────────────────
    html += '<div style="background:var(--bg);border-right:1px solid var(--border);padding:12px;display:flex;flex-direction:column;">'
      + '<h3 style="font-size:14px;margin:0 0 12px;color:var(--text-light);">Channels</h3>';

    channels.forEach(function(ch) {
      var isActive = TeamChat._channel === ch.id;
      var unread = TeamChat._getUnread(ch.id);
      html += '<button onclick="TeamChat._switchChannel(\'' + ch.id + '\')" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 12px;margin-bottom:4px;border-radius:8px;border:none;cursor:pointer;font-size:14px;font-weight:' + (isActive ? '700' : '500') + ';background:' + (isActive ? 'var(--green-dark)' : 'transparent') + ';color:' + (isActive ? '#fff' : 'var(--text)') + ';">'
        + '<span>' + ch.icon + ' ' + ch.label + '</span>'
        + (unread > 0 ? '<span style="background:#dc3545;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;">' + unread + '</span>' : '')
        + '</button>';
    });

    // Team online list
    var team = TeamChat._getTeam();
    html += '<div style="margin-top:auto;border-top:1px solid var(--border);padding-top:12px;">'
      + '<h4 style="font-size:12px;color:var(--text-light);margin:0 0 8px;">Team</h4>';
    team.forEach(function(m) {
      html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;">'
        + '<span style="width:8px;height:8px;border-radius:50%;background:' + (m.online ? '#2e7d32' : '#bbb') + ';flex-shrink:0;"></span>'
        + UI.esc(m.name) + '</div>';
    });
    html += '</div></div>';

    // ── Chat area ────────────────────────────────────────────────────────
    html += '<div style="display:flex;flex-direction:column;height:100%;min-height:0;">';

    var currentCh = channels.find(function(c) { return c.id === TeamChat._channel; }) || channels[0];
    html += '<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">'
      + '<div><h3 style="font-size:16px;margin:0;">' + currentCh.icon + ' ' + currentCh.label + '</h3>'
      + '<div style="font-size:12px;color:var(--text-light);">Internal team channel</div></div>'
      + '<button onclick="TeamChat._showPinned()" style="background:none;border:1px solid var(--border);padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">📌 Pinned</button>'
      + '</div>';

    // Messages
    html += '<div id="chat-messages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;min-height:0;">';
    var messages = TeamChat._msgCache[TeamChat._channel] || [];

    if (TeamChat._loading[TeamChat._channel]) {
      html += '<div style="text-align:center;padding:40px;color:var(--text-light);font-size:14px;"><div style="font-size:24px;margin-bottom:8px;">⏳</div>Loading messages…</div>';
    } else if (messages.length === 0) {
      html += '<div style="text-align:center;padding:40px;color:var(--text-light);font-size:14px;">No messages yet in #' + currentCh.label.toLowerCase() + '. Start the conversation!</div>';
    } else {
      var lastDate = '';
      var me = TeamChat._getCurrentUser();
      messages.forEach(function(msg) {
        var ts = msg.created_at || msg.timestamp || '';
        var msgDate = ts ? new Date(ts).toLocaleDateString() : '';
        if (msgDate && msgDate !== lastDate) {
          html += '<div style="text-align:center;font-size:11px;color:var(--text-light);margin:8px 0;user-select:none;">— ' + msgDate + ' —</div>';
          lastDate = msgDate;
        }
        var isMe = msg.author === me;
        var taskDone = msg.task_complete;
        var msgId = UI.esc(String(msg.id || ''));
        html += '<div style="display:flex;gap:10px;' + (isMe ? 'flex-direction:row-reverse;' : '') + 'align-items:flex-start;">'
          + '<div style="width:32px;height:32px;border-radius:50%;background:' + (isMe ? 'var(--green-dark)' : 'var(--accent)') + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">'
          + UI.esc((msg.author || 'U').charAt(0).toUpperCase()) + '</div>'
          + '<div style="max-width:70%;' + (isMe ? 'text-align:right;' : '') + '">'
          + '<div style="font-size:11px;color:var(--text-light);margin-bottom:2px;">'
          + UI.esc(msg.author || 'Unknown') + ' · ' + TeamChat._timeAgo(ts)
          + (msg.pinned ? ' <span title="Pinned">📌</span>' : '') + '</div>'
          + '<div style="background:' + (isMe ? 'var(--green-dark)' : 'var(--bg)') + ';color:' + (isMe ? '#fff' : 'var(--text)') + ';padding:10px 14px;border-radius:' + (isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px') + ';font-size:14px;line-height:1.5;word-break:break-word;cursor:default;" ondblclick="TeamChat._togglePin(\'' + msgId + '\')" title="Double-click to pin">'
          + UI.esc(msg.text || '').replace(/\n/g, '<br>') + '</div>';

        if (msg.photo_url) {
          html += '<div style="' + (isMe ? 'text-align:right;' : '') + 'margin-top:4px;">'
            + '<img src="' + UI.esc(msg.photo_url) + '" style="max-width:200px;max-height:200px;border-radius:8px;cursor:pointer;object-fit:cover;" onclick="window.open(\'' + UI.esc(msg.photo_url) + '\')" onerror="this.style.display=\'none\'">'
            + '</div>';
        }

        if (msg.task) {
          html += '<div style="background:#fff3e0;border:1px solid #ffe082;border-radius:8px;padding:8px 12px;margin-top:4px;font-size:13px;">'
            + '<div style="font-weight:600;color:#e65100;margin-bottom:4px;">📋 ' + UI.esc(msg.task) + '</div>'
            + '<button onclick="TeamChat._completeTask(\'' + msgId + '\')" style="background:' + (taskDone ? '#4caf50' : 'var(--green-dark)') + ';color:#fff;border:none;padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;">'
            + (taskDone ? '✓ Done' : 'Mark Complete') + '</button>'
            + '</div>';
        }

        html += '</div></div>';
      });
    }
    html += '</div>';

    // Input bar
    html += '<div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:flex-end;flex-shrink:0;">'
      + '<button onclick="TeamChat._addPhoto()" title="Attach photo" style="background:none;border:1px solid var(--border);width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;flex-shrink:0;">📷</button>'
      + '<button onclick="TeamChat._addTask()" title="Create task" style="background:none;border:1px solid var(--border);width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;flex-shrink:0;">📋</button>'
      + '<textarea id="chat-input" rows="1" placeholder="Message #' + UI.esc(currentCh.label.toLowerCase()) + '…" style="flex:1;padding:10px 14px;border:2px solid var(--border);border-radius:10px;font-size:15px;font-family:inherit;resize:none;max-height:100px;line-height:1.4;outline:none;transition:border-color .15s;" onfocus="this.style.borderColor=\'var(--green-dark)\'" onblur="this.style.borderColor=\'var(--border)\'" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();TeamChat._send();}" oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,100)+\'px\'"></textarea>'
      + '<button onclick="TeamChat._send()" title="Send" style="background:var(--green-dark);color:#fff;border:none;width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;flex-shrink:0;transition:opacity .15s;" onmouseover="this.style.opacity=\'.85\'" onmouseout="this.style.opacity=\'1\'">➤</button>'
      + '</div>';

    html += '</div></div>';

    setTimeout(function() {
      var el = document.getElementById('chat-messages');
      if (el) el.scrollTop = el.scrollHeight;
      var inp = document.getElementById('chat-input');
      if (inp) inp.focus();
    }, 50);

    return html;
  },

  // ── Switch channel ───────────────────────────────────────────────────
  _switchChannel: function(ch) {
    TeamChat._channel = ch;
    if (TeamChat._msgCache[ch] === undefined) {
      TeamChat._msgCache[ch] = [];
      TeamChat._fetchMessages(ch);
    }
    loadPage('teamchat');
    setTimeout(function() { var el = document.getElementById('chat-messages'); if (el) el.scrollTop = el.scrollHeight; }, 80);
  },

  // ── Send message ─────────────────────────────────────────────────────
  _send: function() {
    var input = document.getElementById('chat-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';

    var author = TeamChat._getCurrentUser();
    var now = new Date().toISOString();
    var row = {
      channel: TeamChat._channel,
      author: author,
      text: text,
      tenant_id: TeamChat.TENANT_ID,
      created_at: now
    };

    var sb = TeamChat._sb();
    if (sb) {
      // Optimistic: add temp row so UI feels instant
      var tempId = '_tmp_' + Date.now();
      var tempRow = Object.assign({ id: tempId }, row);
      if (!TeamChat._msgCache[TeamChat._channel]) TeamChat._msgCache[TeamChat._channel] = [];
      TeamChat._msgCache[TeamChat._channel].push(tempRow);
      loadPage('teamchat');
      setTimeout(function() { var el = document.getElementById('chat-messages'); if (el) el.scrollTop = el.scrollHeight; }, 50);

      sb.from('team_messages').insert(row).select('*').single()
        .then(function(res) {
          if (res.error) {
            // Remove temp row, toast error
            TeamChat._msgCache[TeamChat._channel] = (TeamChat._msgCache[TeamChat._channel] || []).filter(function(m) { return m.id !== tempId; });
            UI.toast('Failed to send message', 'error');
            loadPage('teamchat');
            return;
          }
          // Replace temp row with real row
          var cache = TeamChat._msgCache[TeamChat._channel] || [];
          var idx = -1;
          for (var i = 0; i < cache.length; i++) { if (cache[i].id === tempId) { idx = i; break; } }
          if (idx >= 0) cache[idx] = res.data;
          else cache.push(res.data);
          // Real-time will also fire; dedup handled in subscription
        });
    } else {
      // Offline fallback
      row.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var msgs = TeamChat._getLocal(TeamChat._channel);
      msgs.push(row);
      localStorage.setItem('bm-chat-' + TeamChat._channel, JSON.stringify(msgs));
      TeamChat._msgCache[TeamChat._channel] = msgs;
      loadPage('teamchat');
      setTimeout(function() { var el = document.getElementById('chat-messages'); if (el) el.scrollTop = el.scrollHeight; }, 50);
    }
  },

  // ── Photo upload ─────────────────────────────────────────────────────
  _addPhoto: function() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var sb = TeamChat._sb();
      if (sb) {
        var ext = file.name.split('.').pop().toLowerCase() || 'jpg';
        var path = TeamChat._channel + '/' + Date.now() + '.' + ext;
        UI.toast('Uploading photo…');
        sb.storage.from('team-photos').upload(path, file, { upsert: false })
          .then(function(res) {
            if (res.error) { UI.toast('Photo upload failed: ' + res.error.message, 'error'); return; }
            var pub = sb.storage.from('team-photos').getPublicUrl(path);
            var photoUrl = pub.data.publicUrl;
            return sb.from('team_messages').insert({
              channel: TeamChat._channel,
              author: TeamChat._getCurrentUser(),
              text: '📷 Photo',
              photo_url: photoUrl,
              tenant_id: TeamChat.TENANT_ID,
              created_at: new Date().toISOString()
            }).select('*').single();
          })
          .then(function(res) {
            if (!res || res.error) { console.warn('[TeamChat] photo msg insert error'); return; }
            if (!TeamChat._msgCache[TeamChat._channel]) TeamChat._msgCache[TeamChat._channel] = [];
            var exists = TeamChat._msgCache[TeamChat._channel].some(function(m) { return m.id === res.data.id; });
            if (!exists) TeamChat._msgCache[TeamChat._channel].push(res.data);
            loadPage('teamchat');
            setTimeout(function() { var el = document.getElementById('chat-messages'); if (el) el.scrollTop = el.scrollHeight; }, 50);
          });
      } else {
        // Offline: base64 fallback (limited by localStorage size)
        var reader = new FileReader();
        reader.onload = function(ev) {
          var row = { id: Date.now().toString(36), author: TeamChat._getCurrentUser(), text: '📷 Photo', photo_url: ev.target.result, created_at: new Date().toISOString(), channel: TeamChat._channel };
          var msgs = TeamChat._getLocal(TeamChat._channel);
          msgs.push(row);
          localStorage.setItem('bm-chat-' + TeamChat._channel, JSON.stringify(msgs));
          TeamChat._msgCache[TeamChat._channel] = msgs;
          loadPage('teamchat');
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  },

  // ── Create task message ───────────────────────────────────────────────
  _addTask: function() {
    UI.modal('📋 New Task', '<input id="tc-task-input" placeholder="What needs to be done?" style="width:100%;padding:10px 12px;border:2px solid var(--border);border-radius:8px;font-size:15px;font-family:inherit;outline:none;" onfocus="this.style.borderColor=\'var(--green-dark)\'" onblur="this.style.borderColor=\'var(--border)\'" onkeydown="if(event.key===\'Enter\'){TeamChat._submitTask();}">', [{label:'Cancel',fn:'UI.closeModal()'},{label:'Create Task',fn:'TeamChat._submitTask()'}]);
    setTimeout(function(){ var el=document.getElementById('tc-task-input'); if(el) el.focus(); }, 100);
  },

  _submitTask: function() {
    var el = document.getElementById('tc-task-input');
    var task = el ? el.value.trim() : '';
    UI.closeModal();
    if (!task) return;
    var row = {
      channel: TeamChat._channel,
      author: TeamChat._getCurrentUser(),
      text: 'Created a task:',
      task: task.trim(),
      task_complete: false,
      tenant_id: TeamChat.TENANT_ID,
      created_at: new Date().toISOString()
    };
    var sb = TeamChat._sb();
    if (sb) {
      sb.from('team_messages').insert(row).select('*').single()
        .then(function(res) {
          if (res.error) { UI.toast('Failed to create task', 'error'); return; }
          if (!TeamChat._msgCache[TeamChat._channel]) TeamChat._msgCache[TeamChat._channel] = [];
          var exists = TeamChat._msgCache[TeamChat._channel].some(function(m) { return m.id === res.data.id; });
          if (!exists) {
            TeamChat._msgCache[TeamChat._channel].push(res.data);
            loadPage('teamchat');
          }
        });
    } else {
      row.id = Date.now().toString(36);
      var msgs = TeamChat._getLocal(TeamChat._channel);
      msgs.push(row);
      localStorage.setItem('bm-chat-' + TeamChat._channel, JSON.stringify(msgs));
      TeamChat._msgCache[TeamChat._channel] = msgs;
      loadPage('teamchat');
    }
  },

  // ── Toggle task complete ──────────────────────────────────────────────
  _completeTask: function(msgId) {
    var cache = TeamChat._msgCache[TeamChat._channel] || [];
    var msg = null;
    for (var i = 0; i < cache.length; i++) { if (String(cache[i].id) === String(msgId)) { msg = cache[i]; break; } }
    if (!msg) return;
    var newVal = !msg.task_complete;
    msg.task_complete = newVal;
    var sb = TeamChat._sb();
    if (sb) {
      sb.from('team_messages').update({ task_complete: newVal }).eq('id', msgId)
        .then(function(res) { if (res.error) console.warn('[TeamChat] task update error:', res.error.message); });
    }
    loadPage('teamchat');
  },

  // ── Pin / unpin (double-click on bubble) ─────────────────────────────
  _togglePin: function(msgId) {
    var cache = TeamChat._msgCache[TeamChat._channel] || [];
    var msg = null;
    for (var i = 0; i < cache.length; i++) { if (String(cache[i].id) === String(msgId)) { msg = cache[i]; break; } }
    if (!msg || msg.id.toString().startsWith('_tmp_')) return;
    var newVal = !msg.pinned;
    msg.pinned = newVal;
    var sb = TeamChat._sb();
    if (sb) {
      sb.from('team_messages').update({ pinned: newVal }).eq('id', msgId)
        .then(function(res) { if (res.error) console.warn('[TeamChat] pin error:', res.error.message); });
    }
    UI.toast(newVal ? '📌 Pinned' : 'Unpinned');
    loadPage('teamchat');
  },

  // ── Show pinned messages modal ────────────────────────────────────────
  _showPinned: function() {
    var msgs = TeamChat._msgCache[TeamChat._channel] || [];
    var pinned = msgs.filter(function(m) { return m.pinned; });
    if (!pinned.length) { UI.toast('No pinned messages in this channel'); return; }
    var body = '<div style="max-height:60vh;overflow-y:auto;">'
      + pinned.map(function(m) {
          return '<div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;">'
            + '<div style="font-size:11px;color:var(--text-light);margin-bottom:4px;">' + UI.esc(m.author || '') + ' · ' + TeamChat._timeAgo(m.created_at) + '</div>'
            + '<div style="font-size:14px;line-height:1.5;">' + UI.esc(m.text || '').replace(/\n/g,'<br>') + '</div>'
            + '</div>';
        }).join('')
      + '</div>';
    UI.modal('📌 Pinned Messages', body, [{ label: 'Close', fn: 'UI.closeModal()' }]);
  },

  // ── Unread count (messages from others since last visit to channel) ───
  _getUnread: function(channel) {
    var lastRead = TeamChat._lastRead[channel] || 0;
    var msgs = TeamChat._msgCache[channel] || [];
    var me = TeamChat._getCurrentUser();
    var count = 0;
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      if (m.author !== me && new Date(m.created_at || m.timestamp || 0).getTime() > lastRead) count++;
    }
    return count;
  },

  // ── Helpers ───────────────────────────────────────────────────────────
  _getCurrentUser: function() {
    return (typeof Auth !== 'undefined' && Auth.user && Auth.user.name) ? Auth.user.name : 'Owner';
  },

  _getTeam: function() {
    var members = [];
    try {
      var team = JSON.parse(localStorage.getItem('bm-team') || '[]');
      team.forEach(function(t) { members.push({ name: t.name || t.email || 'Team', online: false }); });
    } catch(e) {}
    if (!members.length) members = [{ name: TeamChat._getCurrentUser(), online: true }];
    else members[0].online = true;
    return members;
  },

  _timeAgo: function(ts) {
    if (!ts) return '';
    var diff = Date.now() - new Date(ts).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }
};
