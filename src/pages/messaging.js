/**
 * Branch Manager — Messaging Center
 * Send/view SMS and email conversations per client
 * Ready for Dialpad API when SMS is registered
 */
var MessagingPage = {
  _selected: null,        // clientId | 'phone:<last10>' | null
  _msgType: 'text',
  _unmatchedLoaded: false,

  _co: function() {
    return {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      website: CompanyInfo.get('website')
    };
  },

  // ── Unmatched-phone helpers ─────────────────────────────
  // Inbound SMS from numbers not in the clients table land in `communications`
  // with client_id=null. We surface these as pseudo-contacts at the top of the
  // list so leads aren't lost.
  _last10: function(phone) {
    if (!phone) return '';
    return String(phone).replace(/\D/g, '').slice(-10);
  },
  _fmtPhone: function(last10) {
    if (!last10 || last10.length !== 10) return last10 || '';
    return '(' + last10.slice(0,3) + ') ' + last10.slice(3,6) + '-' + last10.slice(6);
  },
  _loadUnmatchedSms: function() {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client) return;
    if (MessagingPage._unmatchedFetchInFlight) return;
    MessagingPage._unmatchedFetchInFlight = true;
    var since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    SupabaseDB.client
      .from('communications')
      .select('id, channel, direction, from_number, to_number, body, created_at, status')
      .is('client_id', null)
      .eq('channel', 'sms')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(function(res) {
        MessagingPage._unmatchedFetchInFlight = false;
        if (res.error || !res.data) return;
        // v746: merge rather than replace so any ad-hoc-created bucket
        // (from "Text any number" in New Message) survives the fetch.
        var buckets = window._bmUnmatchedSmsCache || {};
        res.data.forEach(function(r) {
          var phone = r.direction === 'inbound' ? r.from_number : r.to_number;
          var k = MessagingPage._last10(phone);
          if (k.length !== 10) return;
          if (!buckets[k]) buckets[k] = { last10: k, messages: [], latest: r.created_at };
          // Avoid duplicate inserts on refetch
          if (!buckets[k].messages.some(function(m) { return m.id === r.id; })) {
            buckets[k].messages.push(r);
          }
        });
        // Re-sort each bucket and recompute latest
        Object.keys(buckets).forEach(function(k) {
          buckets[k].messages.sort(function(a, b) {
            return new Date(b.created_at) - new Date(a.created_at);
          });
          if (buckets[k].messages.length) buckets[k].latest = buckets[k].messages[0].created_at;
        });
        window._bmUnmatchedSmsCache = buckets;
        MessagingPage._unmatchedLoaded = true;
        if (window._currentPage === 'messaging' && typeof loadPage === 'function') {
          // Preserve in-progress compose so the re-render doesn't wipe it.
          var saved = null;
          try {
            var inputEl = document.getElementById('msg-input');
            if (inputEl) saved = { value: inputEl.value || '', selStart: inputEl.selectionStart, selEnd: inputEl.selectionEnd };
          } catch (e) {}
          loadPage('messaging');
          if (saved) {
            setTimeout(function() {
              var newInput = document.getElementById('msg-input');
              if (newInput) {
                newInput.value = saved.value;
                try { newInput.setSelectionRange(saved.selStart, saved.selEnd); } catch (e) {}
              }
            }, 0);
          }
        }
      });
  },

  render: function() {
    var clients = DB.clients.getAll().filter(function(c) { return c.phone || c.email; }).slice(0, 50);
    var selectedId = MessagingPage._selected || null;
    var isPhoneBucket = typeof selectedId === 'string' && selectedId.indexOf('phone:') === 0;

    // Lazy-load unmatched SMS buckets on first render. v746: check
    // _unmatchedLoaded only — an empty ad-hoc bucket could otherwise
    // satisfy the truthy-cache check and skip the real fetch.
    if (!MessagingPage._unmatchedLoaded) {
      MessagingPage._loadUnmatchedSms();
    }
    var unmatched = window._bmUnmatchedSmsCache || {};

    // Read unread counts
    var unread = {};
    try { unread = JSON.parse(localStorage.getItem('bm-msg-unread') || '{}'); } catch(e) {}

    // Stats bar
    var allClients = DB.clients.getAll();
    var weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    var msgsThisWeek = 0;
    var openConvos = 0;
    allClients.forEach(function(c) {
      var comms = CommsLog ? CommsLog.getAll(c.id) : [];
      var recent = comms.filter(function(m) { return new Date(m.date) >= weekAgo; });
      if (recent.length) {
        msgsThisWeek += recent.length;
        openConvos++;
      }
    });

    var html = '<div style="background:var(--white);border-radius:10px;border:1px solid var(--border);padding:10px 16px;margin-bottom:12px;display:flex;gap:24px;align-items:center;">'
      + '<div style="font-size:13px;"><span style="font-weight:700;color:var(--green-dark);">' + allClients.length + '</span> <span style="color:var(--text-light);">Total Clients</span></div>'
      + '<div style="font-size:13px;"><span style="font-weight:700;color:var(--green-dark);">' + msgsThisWeek + '</span> <span style="color:var(--text-light);">Messages This Week</span></div>'
      + '<div style="font-size:13px;"><span style="font-weight:700;color:var(--green-dark);">' + openConvos + '</span> <span style="color:var(--text-light);">Active Conversations</span></div>'
      + '</div>';

    html += '<div style="display:grid;grid-template-columns:280px 1fr;gap:0;height:calc(100vh - 200px);background:var(--white);border-radius:12px;border:1px solid var(--border);overflow:hidden;">';

    // Left: Contact list
    html += '<div style="border-right:1px solid var(--border);overflow-y:auto;display:flex;flex-direction:column;">'
      + '<div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;gap:6px;align-items:center;">'
      + '<input type="text" placeholder="Search contacts..." oninput="MessagingPage.filterContacts(this.value)" style="flex:1;padding:8px 10px;border:2px solid var(--border);border-radius:8px;font-size:13px;">'
      + '<button onclick="MessagingPage.newMessage()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 10px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">+ New</button>'
      + '</div><div id="msg-contacts" style="flex:1;overflow-y:auto;">';

    // Unmatched-phone buckets at the top
    var unmatchedKeys = Object.keys(unmatched).sort(function(a, b) {
      return new Date(unmatched[b].latest) - new Date(unmatched[a].latest);
    });
    if (unmatchedKeys.length) {
      html += '<div style="padding:6px 12px;background:#fff8e1;border-bottom:1px solid #f0e0a8;font-size:10px;font-weight:700;color:#b58105;text-transform:uppercase;letter-spacing:.05em;">📵 Unknown Numbers</div>';
      unmatchedKeys.forEach(function(k) {
        var b = unmatched[k];
        var key = 'phone:' + k;
        var isActive = selectedId === key;
        var last = b.messages[0] || {};
        var preview = (last.body || '').substring(0, 40) + (last.body && last.body.length > 40 ? '...' : '');
        var time = last.created_at ? UI.dateRelative(last.created_at) : '';
        var unreadCount = unread[key] || 0;
        html += '<div onclick="MessagingPage.selectPhone(\'' + k + '\')" style="padding:12px;border-bottom:1px solid #f0f0f0;cursor:pointer;background:' + (isActive ? 'var(--green-bg)' : '#fffdf6') + ';">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;">'
          + '<strong style="font-size:13px;">📵 ' + MessagingPage._fmtPhone(k) + '</strong>'
          + '<div style="display:flex;gap:5px;align-items:center;">'
          + (unreadCount > 0 ? '<span style="background:var(--red);color:#fff;border-radius:10px;font-size:10px;padding:2px 6px;font-weight:700;">' + unreadCount + '</span>' : '')
          + '<span style="font-size:10px;color:var(--text-light);">' + time + '</span>'
          + '</div></div>'
          + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(preview || 'No preview') + '</div>'
          + '</div>';
      });
    }

    clients.forEach(function(c) {
      var isActive = c.id === selectedId;
      var lastComm = CommsLog ? CommsLog.getAll(c.id)[0] : null;
      var preview = lastComm ? lastComm.notes.substring(0, 40) + '...' : 'No messages';
      var time = lastComm ? UI.dateRelative(lastComm.date) : '';
      var unreadCount = unread[c.id] || 0;

      html += '<div onclick="MessagingPage.selectClient(\'' + c.id + '\')" style="padding:12px;border-bottom:1px solid #f0f0f0;cursor:pointer;background:' + (isActive ? 'var(--green-bg)' : 'var(--white)') + ';transition:background .1s;" onmouseover="this.style.background=\'' + (isActive ? 'var(--green-bg)' : '#fafafa') + '\'" onmouseout="this.style.background=\'' + (isActive ? 'var(--green-bg)' : 'var(--white)') + '\'">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;">'
        + '<strong style="font-size:13px;">' + c.name + '</strong>'
        + '<div style="display:flex;gap:5px;align-items:center;">'
        + (unreadCount > 0 ? '<span style="background:var(--red);color:#fff;border-radius:10px;font-size:10px;padding:2px 6px;font-weight:700;">' + unreadCount + '</span>' : '')
        + '<span style="font-size:10px;color:var(--text-light);">' + time + '</span>'
        + '</div></div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + preview + '</div>'
        + '</div>';
    });
    html += '</div></div>';

    // Right: Conversation
    html += '<div style="display:flex;flex-direction:column;">';
    if (selectedId) {
      var client = null;
      var comms = [];
      var headerName = '';
      var headerSub = '';

      if (isPhoneBucket) {
        var last10 = selectedId.replace('phone:', '');
        var bucket = unmatched[last10] || { messages: [] };
        headerName = '📵 ' + MessagingPage._fmtPhone(last10);
        headerSub = 'Unknown number — not yet a client';
        // Map bucket rows to thread shape
        comms = bucket.messages.slice().map(function(r) {
          return {
            id: r.id,
            type: 'text',
            direction: r.direction,
            notes: r.body || '',
            date: r.created_at
          };
        });
      } else {
        client = DB.clients.getById(selectedId);
        comms = CommsLog ? CommsLog.getAll(selectedId) : [];
        headerName = client ? client.name : '';
        headerSub = client ? (client.phone || client.email || '') : '';
      }

      // Header
      var headerActions = '';
      if (isPhoneBucket) {
        var l10 = selectedId.replace('phone:', '');
        headerActions = '<button onclick="MessagingPage.convertPhoneToClient(\'' + l10 + '\')" style="background:var(--green-dark);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:700;">+ Convert to Client</button>'
          + '<button onclick="Dialpad.call(\'' + l10 + '\',null,\'' + MessagingPage._fmtPhone(l10) + '\')" style="background:var(--green-bg);border:1px solid #c8e6c9;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;font-weight:600;color:var(--green-dark);">📞 Call</button>';
      } else {
        headerActions = '<button onclick="Dialpad.call(\'' + (client ? (client.phone || '') : '') + '\',\'' + selectedId + '\',\'' + (client ? (client.name || '').replace(/'/g, "\\'") : '') + '\')" style="background:var(--green-bg);border:1px solid #c8e6c9;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;font-weight:600;color:var(--green-dark);">📞 Call</button>'
          + '<button onclick="Dialpad.showTextModal(\'' + selectedId + '\',\'' + (client ? (client.name || '').replace(/'/g, "\\'") : '') + '\',\'' + (client ? (client.phone || '') : '') + '\')" style="background:#e8f5e9;border:1px solid #c8e6c9;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;font-weight:600;color:var(--green-dark);">💬 Text</button>'
          + '<button onclick="MessagingPage.showTemplates(\'' + selectedId + '\')" style="background:#e3f2fd;border:1px solid #bbdefb;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;font-weight:600;color:#1565c0;">📋 Templates</button>';
      }
      html += '<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">'
        + '<div><strong style="font-size:15px;">' + UI.esc(headerName) + '</strong>'
        + '<div style="font-size:12px;color:var(--text-light);">' + UI.esc(headerSub) + '</div></div>'
        + '<div style="display:flex;gap:6px;">' + headerActions + '</div></div>';

      // Context strip — show latest quote/invoice/job for known clients so
      // Doug can answer "is your quote ready" / "what's my balance" without
      // leaving the thread. Hidden for unmatched-phone buckets (no client_id).
      if (!isPhoneBucket && client) {
        html += MessagingPage._renderContextStrip(client.id);
      }

      // Messages
      html += '<div id="msg-thread" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;">';
      if (comms.length) {
        comms.slice().reverse().forEach(function(m) {
          var isOutbound = m.direction === 'outbound';
          var icons = { call: '📞', text: '💬', email: '📧', note: '📌', visit: '🏠', voicemail: '📱' };
          html += '<div style="display:flex;justify-content:' + (isOutbound ? 'flex-end' : 'flex-start') + ';">'
            + '<div style="max-width:75%;padding:10px 14px;border-radius:' + (isOutbound ? '16px 16px 4px 16px' : '16px 16px 16px 4px') + ';background:' + (isOutbound ? 'var(--green-dark)' : 'var(--bg)') + ';color:' + (isOutbound ? '#fff' : 'var(--text)') + ';font-size:14px;">'
            + '<div>' + (icons[m.type] || '') + ' ' + (m.notes || '') + '</div>'
            + '<div style="font-size:10px;opacity:.6;margin-top:4px;text-align:right;">' + UI.dateRelative(m.date) + ' · ' + m.type + '</div>'
            + MessagingPage._renderActionChip(m)
            + '</div></div>';
        });
      } else {
        html += '<div style="text-align:center;padding:40px;color:var(--text-light);font-size:13px;">No messages yet. Send the first one below.</div>';
      }
      html += '</div>';

      // Compose — pill type selector
      var msgType = MessagingPage._msgType || 'text';
      var pills = [
        { val: 'text', label: '💬 Text' },
        { val: 'email', label: '📧 Email' },
        { val: 'call', label: '📞 Call Note' },
        { val: 'note', label: '📌 Note' }
      ];
      var pillHtml = pills.map(function(p) {
        var active = msgType === p.val;
        return '<button onclick="MessagingPage._msgType=\'' + p.val + '\';MessagingPage._refreshCompose();" style="padding:6px 10px;border-radius:20px;border:1px solid ' + (active ? 'var(--green-dark)' : 'var(--border)') + ';background:' + (active ? 'var(--green-dark)' : 'var(--white)') + ';color:' + (active ? '#fff' : 'var(--text)') + ';font-size:12px;font-weight:' + (active ? '700' : '500') + ';cursor:pointer;white-space:nowrap;">' + p.label + '</button>';
      }).join('');

      html += '<div style="padding:10px 12px;border-top:1px solid var(--border);">'
        + '<div id="msg-type-pills" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">' + pillHtml + '</div>'
        + '<div style="display:flex;gap:8px;">'
        + '<input type="text" id="msg-input" placeholder="Type a message..." style="flex:1;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;" onkeydown="if(event.key===\'Enter\')MessagingPage.send(\'' + selectedId + '\')">'
        + '<button onclick="MessagingPage.send(\'' + selectedId + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:10px 16px;border-radius:8px;font-weight:700;cursor:pointer;">Send</button>'
        + '</div></div>';
    } else {
      html += '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-light);">'
        + '<div style="text-align:center;"><div style="font-size:48px;margin-bottom:8px;">💬</div>'
        + '<h3 style="font-size:16px;color:var(--text);">Messages</h3>'
        + '<p style="font-size:13px;">Select a contact or click <strong>+ New</strong> to start a conversation</p></div></div>';
    }
    html += '</div></div>';

    return html;
  },

  selectClient: function(clientId) {
    // Clear unread count for this client
    var unread = {};
    try { unread = JSON.parse(localStorage.getItem('bm-msg-unread') || '{}'); } catch(e) {}
    delete unread[clientId];
    localStorage.setItem('bm-msg-unread', JSON.stringify(unread));

    MessagingPage._selected = clientId;
    loadPage('messaging');
    setTimeout(function() {
      var thread = document.getElementById('msg-thread');
      if (thread) thread.scrollTop = thread.scrollHeight;
    }, 100);
  },

  selectPhone: function(last10) {
    var key = 'phone:' + last10;
    var unread = {};
    try { unread = JSON.parse(localStorage.getItem('bm-msg-unread') || '{}'); } catch(e) {}
    delete unread[key];
    localStorage.setItem('bm-msg-unread', JSON.stringify(unread));
    MessagingPage._selected = key;
    loadPage('messaging');
    setTimeout(function() {
      var thread = document.getElementById('msg-thread');
      if (thread) thread.scrollTop = thread.scrollHeight;
    }, 100);
  },

  convertPhoneToClient: function(last10) {
    var fmt = MessagingPage._fmtPhone(last10);
    UI.showModal('Convert to Client',
      UI.field('Name', '<input type="text" id="conv-name" placeholder="e.g. Jane Smith" autofocus>')
      + UI.field('Phone', '<input type="text" id="conv-phone" value="' + fmt + '" readonly style="background:#f5f5f5;">')
      + UI.field('Notes (optional)', '<textarea id="conv-notes" placeholder="How did they reach out?" style="min-height:60px;"></textarea>'),
      {
        footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
          + ' <button class="btn btn-primary" onclick="MessagingPage._doConvert(\'' + last10 + '\')">Create Client & Link Messages</button>'
      });
    setTimeout(function() {
      var n = document.getElementById('conv-name');
      if (n) n.focus();
    }, 50);
  },

  _doConvert: async function(last10) {
    var name = (document.getElementById('conv-name') || {}).value || '';
    name = name.trim();
    if (!name) { UI.toast('Name is required', 'error'); return; }
    var notes = (document.getElementById('conv-notes') || {}).value || '';

    var client = {
      id: (typeof SupabaseDB !== 'undefined' && SupabaseDB._uuid) ? SupabaseDB._uuid() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
      name: name,
      phone: MessagingPage._fmtPhone(last10),
      notes: notes,
      created_at: new Date().toISOString()
    };

    try {
      DB.clients.create(client);
    } catch (e) { console.warn('local client create failed', e); }

    if (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) {
      try {
        var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
        var row = { id: client.id, name: name, phone: client.phone, notes: notes };
        if (tid) row.tenant_id = tid;
        await SupabaseDB.client.from('clients').insert(row);

        // Link existing communications rows for this phone to the new client
        await SupabaseDB.client
          .from('communications')
          .update({ client_id: client.id })
          .is('client_id', null)
          .eq('channel', 'sms')
          .or('from_number.ilike.%' + last10 + '%,to_number.ilike.%' + last10 + '%');
      } catch (e) {
        console.warn('cloud convert failed:', e);
      }
    }

    // Drop bucket from cache, clear unread, switch selection to the new client
    if (window._bmUnmatchedSmsCache) delete window._bmUnmatchedSmsCache[last10];
    if (window._bmCommsCache) delete window._bmCommsCache[client.id];
    var unread = {};
    try { unread = JSON.parse(localStorage.getItem('bm-msg-unread') || '{}'); } catch(e) {}
    delete unread['phone:' + last10];
    localStorage.setItem('bm-msg-unread', JSON.stringify(unread));

    UI.closeModal();
    UI.toast('Client created');
    MessagingPage._selected = client.id;
    loadPage('messaging');
  },

  send: function(target) {
    var input = document.getElementById('msg-input');
    if (!input || !input.value.trim()) return;

    var type = MessagingPage._msgType || 'text';
    var notes = input.value.trim();
    var isPhoneBucket = typeof target === 'string' && target.indexOf('phone:') === 0;

    if (isPhoneBucket) {
      // Unmatched-phone outbound: SMS only, no client_id
      if (type !== 'text') { UI.toast('Only text supported for unknown numbers — convert to client first', 'error'); return; }
      var last10 = target.replace('phone:', '');
      // Optimistic: prepend to bucket cache so it appears immediately
      if (window._bmUnmatchedSmsCache && window._bmUnmatchedSmsCache[last10]) {
        window._bmUnmatchedSmsCache[last10].messages.unshift({
          id: 'optimistic-' + Date.now(),
          channel: 'sms',
          direction: 'outbound',
          to_number: '+1' + last10,
          body: notes,
          created_at: new Date().toISOString()
        });
        window._bmUnmatchedSmsCache[last10].latest = new Date().toISOString();
      }
      Dialpad.sendSMS(last10, notes, null);
      // Re-fetch in 2s to pick up the real cloud row + dedupe via id
      setTimeout(function() {
        MessagingPage._unmatchedLoaded = false;
        MessagingPage._loadUnmatchedSms();
      }, 2000);
      input.value = '';
      loadPage('messaging');
      return;
    }

    var clientId = target;
    var client = DB.clients.getById(clientId);

    if (type === 'text' && typeof Dialpad !== 'undefined') {
      var phone = client ? client.phone : '';
      // Optimistic: log locally so the bubble shows up before the cloud roundtrip
      Dialpad._logComm(clientId, 'text', 'outbound', notes);
      Dialpad.sendSMS(phone, notes, clientId);
      // Bust cache + re-render so the cloud-logged row replaces the optimistic one
      setTimeout(function() {
        if (window._bmCommsCache) delete window._bmCommsCache[clientId];
        if (window._currentPage === 'messaging') loadPage('messaging');
      }, 2000);
    } else if (type === 'email' && typeof Email !== 'undefined' && client && client.email) {
      Email.send(client.email, 'Message from ' + MessagingPage._co().name, notes);
      Dialpad._logComm(clientId, 'email', 'outbound', notes);
    } else {
      var key = 'bm-comms-' + clientId;
      var all = [];
      try { all = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
      all.unshift({
        id: Date.now().toString(36),
        clientId: clientId,
        type: type,
        direction: 'outbound',
        notes: notes,
        date: new Date().toISOString(),
        user: 'Doug'
      });
      localStorage.setItem(key, JSON.stringify(all));
      UI.toast(type === 'call' ? 'Call note saved' : 'Note saved');
    }

    input.value = '';
    MessagingPage.selectClient(clientId);
  },

  // v746: New-message modal now supports two paths:
  //   1. Search the existing client list (typing filters live).
  //   2. Text any 10-digit number directly — lands in the phone-bucket
  //      flow so the thread + reply already work; "+ Convert to Client"
  //      remains available once a conversation forms.
  newMessage: function() {
    var clients = DB.clients.getAll().filter(function(c) { return c.phone || c.email; });
    var options = clients.map(function(c) {
      var contact = c.phone ? UI.phone(c.phone) : c.email;
      return '<div data-search="' + UI.esc(((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.email || '')).toLowerCase()) + '" '
        + 'onclick="MessagingPage.selectClient(\'' + c.id + '\');UI.closeModal();" '
        + 'style="padding:10px;cursor:pointer;border-bottom:1px solid var(--border);font-size:14px;" '
        + 'onmouseover="this.style.background=\'var(--green-bg)\'" onmouseout="this.style.background=\'\'">'
        + '<strong>' + UI.esc(c.name || '') + '</strong><span style="color:var(--text-light);font-size:12px;margin-left:8px;">' + UI.esc(contact || '') + '</span></div>';
    }).join('');
    var html = '<div style="margin-bottom:12px;">'
      +   '<div style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">Text any number</div>'
      +   '<div style="display:flex;gap:6px;">'
      +     '<input id="new-msg-phone" type="tel" inputmode="tel" placeholder="(914) 555-1234" '
      +       'style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;" '
      +       'onkeydown="if(event.key===\'Enter\')MessagingPage._openAdhocPhone()">'
      +     '<button onclick="MessagingPage._openAdhocPhone()" class="btn btn-primary" style="font-size:13px;">Open thread →</button>'
      +   '</div>'
      + '</div>'
      + '<div style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">Or pick a client</div>'
      + '<input id="new-msg-search" type="search" placeholder="Search clients…" '
      +   'style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-bottom:8px;" '
      +   'oninput="MessagingPage._filterNewMsgList(this.value)">'
      + '<div id="new-msg-clients" style="max-height:340px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;">' + options + '</div>';
    UI.showModal('New Message', html);
    setTimeout(function() { var n = document.getElementById('new-msg-phone'); if (n) n.focus(); }, 50);
  },

  _filterNewMsgList: function(q) {
    var qLower = (q || '').toLowerCase().trim();
    var list = document.getElementById('new-msg-clients');
    if (!list) return;
    Array.prototype.forEach.call(list.children, function(el) {
      var hay = el.getAttribute('data-search') || '';
      el.style.display = (!qLower || hay.indexOf(qLower) >= 0) ? '' : 'none';
    });
  },

  _openAdhocPhone: function() {
    var raw = (document.getElementById('new-msg-phone') || {}).value || '';
    var digits = raw.replace(/\D/g, '');
    if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.substring(1);
    if (digits.length !== 10) { UI.toast('Enter a 10-digit US number', 'error'); return; }
    // Reuse the phone-bucket flow — selectPhone bridges into the
    // unmatched-phone thread, which already supports send + Convert.
    UI.closeModal();
    // First check if this number already matches an existing client by phone.
    // If yes, jump straight to that client's thread.
    var existingClient = DB.clients.getAll().find(function(c) {
      var d = (c.phone || '').replace(/\D/g, '');
      if (d.length === 11 && d[0] === '1') d = d.slice(1);
      return d === digits;
    });
    if (existingClient) {
      MessagingPage.selectClient(existingClient.id);
      return;
    }
    // Ensure the bucket cache has at least an empty row so the thread
    // header doesn't error when looking up a brand-new number. Keep
    // _unmatchedLoaded as-is so the next render still fetches real rows
    // if it hasn't yet.
    if (!window._bmUnmatchedSmsCache) window._bmUnmatchedSmsCache = {};
    if (!window._bmUnmatchedSmsCache[digits]) {
      window._bmUnmatchedSmsCache[digits] = { last10: digits, messages: [], latest: new Date().toISOString() };
    }
    MessagingPage.selectPhone(digits);
  },

  showTemplates: function(clientId) {
    var client = DB.clients.getById(clientId);
    if (!client || !Templates) return;

    var html = '<div style="display:grid;gap:8px;">';
    var quickTemplates = ['request_received_sms', 'quote_sent_sms', 'booking_confirm_sms', 'visit_reminder_sms', 'review_request_sms'];
    quickTemplates.forEach(function(key) {
      var t = Templates.library[key];
      if (!t) return;
      var filled = Templates.fill(t.body, { name: client.name, address: client.address });
      html += '<div onclick="document.getElementById(\'msg-input\').value=\'' + filled.replace(/'/g, "\\'").replace(/\n/g, ' ') + '\';UI.closeModal();" style="padding:10px;background:var(--bg);border-radius:8px;cursor:pointer;font-size:13px;border:1px solid var(--border);transition:background .1s;" onmouseover="this.style.background=\'var(--green-bg)\'" onmouseout="this.style.background=\'var(--bg)\'">'
        + '<strong style="font-size:12px;color:var(--green-dark);">' + t.name + '</strong>'
        + '<div style="color:var(--text-light);margin-top:2px;">' + filled.substring(0, 80) + '...</div>'
        + '</div>';
    });
    html += '</div>';
    UI.showModal('Quick Templates', html);
  },

  filterContacts: function(query) {
    var q = query.toLowerCase();
    var contacts = document.getElementById('msg-contacts');
    if (!contacts) return;
    Array.from(contacts.children).forEach(function(el) {
      var name = el.innerText.toLowerCase();
      el.style.display = name.includes(q) ? '' : 'none';
    });
  },

  // Show the client's most recent quote / invoice / job as quick-reference chips
  // above the thread so Doug can respond to "what's my balance" / "is the quote
  // ready" without navigating away. Each chip taps through to the source record.
  _renderContextStrip: function(clientId) {
    var quotes  = (typeof DB !== 'undefined' && DB.quotes && DB.quotes.getAll)   ? DB.quotes.getAll().filter(function(q){return q.clientId === clientId;})   : [];
    var jobs    = (typeof DB !== 'undefined' && DB.jobs && DB.jobs.getAll)       ? DB.jobs.getAll().filter(function(j){return j.clientId === clientId;})       : [];
    var invoices= (typeof DB !== 'undefined' && DB.invoices && DB.invoices.getAll)? DB.invoices.getAll().filter(function(i){return i.clientId === clientId;}) : [];

    function pickLatest(arr, dateField) {
      var sorted = arr.slice().sort(function(a, b) { return new Date(b[dateField] || b.createdAt || 0) - new Date(a[dateField] || a.createdAt || 0); });
      return sorted[0] || null;
    }
    var latestQuote   = pickLatest(quotes, 'createdAt');
    var latestInvoice = pickLatest(invoices, 'createdAt');
    var latestJob     = pickLatest(jobs, 'scheduledDate');
    if (!latestQuote && !latestInvoice && !latestJob) return '';

    var chips = [];
    if (latestQuote) {
      var qStatus = latestQuote.status || 'draft';
      var qColor = qStatus === 'approved' ? '#2e7d32' : (qStatus === 'declined' ? '#c62828' : '#e65100');
      chips.push('<button onclick="QuotesPage.showDetail(\'' + latestQuote.id + '\')" '
        + 'style="display:flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;color:var(--text);">'
        + '<span>📋</span>'
        + '<div style="text-align:left;line-height:1.2;">'
        +   '<div style="font-weight:600;">Quote #' + UI.esc(String(latestQuote.quoteNumber || '?')) + ' &middot; ' + UI.moneyInt(latestQuote.total || 0) + '</div>'
        +   '<div style="font-size:10px;color:' + qColor + ';font-weight:700;text-transform:uppercase;">' + UI.esc(qStatus) + '</div>'
        + '</div></button>');
    }
    if (latestInvoice) {
      var iBalance = parseFloat(latestInvoice.balance || latestInvoice.total || 0);
      var iStatus = latestInvoice.status || 'sent';
      var iColor = iBalance > 0 ? '#c62828' : '#2e7d32';
      var iLabel = iBalance > 0 ? UI.moneyInt(iBalance) + ' due' : 'paid';
      chips.push('<button onclick="InvoicesPage.showDetail(\'' + latestInvoice.id + '\')" '
        + 'style="display:flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;color:var(--text);">'
        + '<span>💵</span>'
        + '<div style="text-align:left;line-height:1.2;">'
        +   '<div style="font-weight:600;">Invoice #' + UI.esc(String(latestInvoice.invoiceNumber || '?')) + '</div>'
        +   '<div style="font-size:10px;color:' + iColor + ';font-weight:700;text-transform:uppercase;">' + iLabel + '</div>'
        + '</div></button>');
    }
    if (latestJob) {
      var jStatus = latestJob.status || 'scheduled';
      var jColor = jStatus === 'completed' ? '#2e7d32' : (jStatus === 'late' ? '#c62828' : '#1565c0');
      var jDate = latestJob.scheduledDate ? UI.dateShort(latestJob.scheduledDate) : '—';
      chips.push('<button onclick="JobsPage.showDetail(\'' + latestJob.id + '\')" '
        + 'style="display:flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--border);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;color:var(--text);">'
        + '<span>🚛</span>'
        + '<div style="text-align:left;line-height:1.2;">'
        +   '<div style="font-weight:600;">Job #' + UI.esc(String(latestJob.jobNumber || '?')) + ' &middot; ' + jDate + '</div>'
        +   '<div style="font-size:10px;color:' + jColor + ';font-weight:700;text-transform:uppercase;">' + UI.esc(jStatus) + '</div>'
        + '</div></button>');
    }

    return '<div style="padding:8px 12px;background:#fafafa;border-bottom:1px solid var(--border);display:flex;gap:6px;flex-wrap:wrap;overflow-x:auto;">' + chips.join('') + '</div>';
  },

  // Render an inline action chip on inbound SMS bubbles whose communications row
  // has metadata.suggested_action set (stamped by the dialpad-webhook quote-reply
  // detection). Tapping the chip flips the quote status without leaving the
  // thread. Reschedule chips just open the requests page.
  _renderActionChip: function(m) {
    var meta = m && m.metadata;
    if (!meta || !meta.suggested_action) return '';
    if (m.direction !== 'inbound') return '';
    var action = meta.suggested_action;
    var qid = meta.suggested_quote_id || '';
    var qnum = meta.suggested_quote_number || '';
    var label = '';
    var bg = '#fff';
    var color = '#333';
    if (action === 'approve') {
      label = qnum ? '✅ Mark Quote #' + qnum + ' Accepted' : '✅ Find quote & accept';
      bg = '#e8f5e9'; color = '#1b5e20';
    } else if (action === 'decline') {
      label = qnum ? '❌ Mark Quote #' + qnum + ' Declined' : '❌ Find quote & decline';
      bg = '#ffebee'; color = '#b71c1c';
    } else if (action === 'reschedule') {
      label = '📅 Open scheduling';
      bg = '#fff3e0'; color = '#e65100';
    } else {
      return '';
    }
    return '<button onclick="MessagingPage._applyAction(\'' + (m.id || '').replace(/[^a-zA-Z0-9-]/g,'') + '\',\'' + action + '\',\'' + qid + '\')" '
      + 'style="margin-top:8px;background:' + bg + ';color:' + color + ';border:1px solid ' + color + ';border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;width:100%;">'
      + label + '</button>';
  },

  _applyAction: function(commId, action, quoteId) {
    if (action === 'approve' || action === 'decline') {
      if (!quoteId) {
        UI.toast('No quote linked — open the quote manually', 'error');
        loadPage('quotes');
        return;
      }
      var newStatus = action === 'approve' ? 'accepted' : 'declined';
      // Snapshot the prior status so we can roll back if the cloud update
      // rejects (e.g. RLS / network failure). Without rollback, the local
      // store and cloud diverge silently and the next CloudSync.pull would
      // overwrite the local change anyway — but the user would see "accepted"
      // for a few minutes that wasn't real.
      var existing = null;
      try { existing = DB.quotes.getById(quoteId); } catch(e) {}
      var priorStatus = existing && existing.status;
      try {
        DB.quotes.update(quoteId, { status: newStatus, statusUpdatedAt: new Date().toISOString() });
      } catch (e) { console.warn('local quote update failed', e); }
      if (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) {
        SupabaseDB.client.from('quotes').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', quoteId)
          .then(function(res) {
            if (res.error) {
              console.warn('cloud quote update failed:', res.error.message);
              // Roll back local
              try {
                if (priorStatus) DB.quotes.update(quoteId, { status: priorStatus, statusUpdatedAt: existing && existing.statusUpdatedAt });
              } catch(e2) {}
              UI.toast('Couldn\'t save quote ' + newStatus + ' — ' + (res.error.message || 'cloud error') + '. Reverted.', 'error');
              if (window._currentPage === 'messaging') loadPage('messaging');
            }
          });
      }
      UI.toast('Quote marked ' + newStatus);
    } else if (action === 'reschedule') {
      loadPage('requests');
      return;
    }

    // Mark linked task complete + clear the suggested_action stamp so the chip disappears
    if (typeof SupabaseDB !== 'undefined' && SupabaseDB.client && commId) {
      // The webhook stamped task_id into metadata.task_id — use that to complete
      // the corresponding task. Best-effort: even without task_id we still flip the quote.
      var meta = null;
      try {
        var key = MessagingPage._selected;
        if (key && key.indexOf('phone:') !== 0) {
          var cache = (window._bmCommsCache && window._bmCommsCache[key]) || [];
          var match = cache.find(function(c) { return c.id === commId; });
          if (match) meta = match.metadata;
        }
      } catch(e) {}

      if (meta && meta.task_id) {
        SupabaseDB.client.from('tasks')
          .update({ completed: true, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', meta.task_id)
          .then(function() { /* refresh local cache too */
            try {
              var local = JSON.parse(localStorage.getItem('bm-tasks') || '[]');
              for (var i = 0; i < local.length; i++) {
                if (local[i].id === meta.task_id) {
                  local[i].completed = true;
                  local[i].completedAt = new Date().toISOString();
                  local[i].updatedAt = new Date().toISOString();
                  break;
                }
              }
              localStorage.setItem('bm-tasks', JSON.stringify(local));
            } catch (e) {}
          });
      }

      // Clear the suggested_action so the chip doesn't reappear after refresh
      SupabaseDB.client.from('communications')
        .update({ metadata: Object.assign({}, meta || {}, { suggested_action: null, applied_at: new Date().toISOString(), applied_action: action }) })
        .eq('id', commId)
        .then(function() {
          if (window._bmCommsCache) {
            // Bust caches so next render reflects the cleared chip
            Object.keys(window._bmCommsCache).forEach(function(k) { delete window._bmCommsCache[k]; });
          }
          if (window._currentPage === 'messaging') loadPage('messaging');
        });
    }
  },

  // Re-render just the pill buttons when type changes (avoids full page reload)
  _refreshCompose: function() {
    var msgType = MessagingPage._msgType || 'text';
    var pills = [
      { val: 'text', label: '💬 Text' },
      { val: 'email', label: '📧 Email' },
      { val: 'call', label: '📞 Call Note' },
      { val: 'note', label: '📌 Note' }
    ];
    var container = document.getElementById('msg-type-pills');
    if (!container) return;
    container.innerHTML = pills.map(function(p) {
      var active = msgType === p.val;
      return '<button onclick="MessagingPage._msgType=\'' + p.val + '\';MessagingPage._refreshCompose();" style="padding:6px 10px;border-radius:20px;border:1px solid ' + (active ? 'var(--green-dark)' : 'var(--border)') + ';background:' + (active ? 'var(--green-dark)' : 'var(--white)') + ';color:' + (active ? '#fff' : 'var(--text)') + ';font-size:12px;font-weight:' + (active ? '700' : '500') + ';cursor:pointer;white-space:nowrap;">' + p.label + '</button>';
    }).join('');
  }
};
