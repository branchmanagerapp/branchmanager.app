/**
 * Branch Manager — AI Assistant
 * Built-in AI Assistant for estimates, client comms, business insights
 */
var AI = {
  // Static prompts — stored here to avoid apostrophe escaping issues in onclick HTML attributes
  _p: {
    upsell: "It is spring in Westchester NY. What tree services should I upsell to existing clients? Think about what homeowners need after winter storms: stump grinding, spring pruning, cabling, etc. Give me a short pitch for each.",
    instagram: "Write a compelling Instagram caption for a recent tree job. Make it engaging, use 3-5 relevant hashtags, keep it under 150 words. Tone: professional but personable, showing craftsmanship and care for the property.",
    referral: "Draft a short, friendly referral request text message I can send to happy clients. Keep it under 3 sentences, do not sound salesy, and make it easy for them to share our info.",
    tip: "Give me one specific, actionable business improvement tip for a tree service company in spring in Westchester NY. Focus on something I can do this week to grow revenue or improve operations."
  },

  render: function() {
    AI.init();
    var containerStyle = 'max-width:700px;height:calc(100vh - 140px);min-height:500px;display:flex;flex-direction:column;background:var(--white);border:1px solid var(--border);border-radius:14px;overflow:hidden;';
    return '<div style="' + containerStyle + '" id="ai-inline-container">' + AI._renderPanelInline() + '</div>';
  },

  _renderPanelInline: function() {
    var html = ''
      + '<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<div style="width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#D4A574 0%,#C4956A 100%);display:flex;align-items:center;justify-content:center;">'
      + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
      + '<div><div style="font-weight:700;font-size:15px;">AI</div>'
      + '<div style="font-size:11px;color:var(--text-light);">Your tree service business assistant</div></div></div>'
      + '<div style="display:flex;gap:4px;">'
      + '<button onclick="AI._copyConversation();" style="background:none;border:none;cursor:pointer;font-size:13px;color:var(--text-light);padding:4px 8px;" title="Copy conversation">📋 Copy</button>'
      + '<button onclick="AI._clearHistory();AI._refreshInline();" style="background:none;border:none;cursor:pointer;font-size:13px;color:var(--text-light);padding:4px 8px;" title="Clear chat">🗑️ Clear</button>'
      + '</div>'
      + '</div>';

    // v412: Use AIConfig.available() directly — no cached _serverManaged field
    // to drift out of sync. Server-managed is default-on per v388 (key lives
    // in Supabase function secret ANTHROPIC_API_KEY, edge fn /ai-chat reads it).
    if (!AIConfig.available()) {
      html += '<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px;">'
        + '<div style="text-align:center;max-width:340px;">'
        + '<div style="font-size:48px;margin-bottom:16px;">🤖</div>'
        + '<h3 style="margin-bottom:8px;">Connect AI Assistant</h3>'
        + '<p style="font-size:13px;color:var(--text-light);margin-bottom:16px;line-height:1.6;">Enter your AI API key to enable AI-powered estimates, client emails, and business insights. Your key is stored locally — never sent to anyone but AI provider.</p>'
        + '<input type="password" id="ai-key-input" placeholder="sk-ant-api03-..." style="width:100%;padding:10px 14px;border:2px solid var(--border);border-radius:8px;font-size:13px;margin-bottom:12px;">'
        + '<button class="btn btn-primary" onclick="AI._saveKey();AI._refreshInline();" style="width:100%;">Connect</button>'
        + '<p style="font-size:11px;color:var(--text-light);margin-top:12px;">Get a key at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">console.anthropic.com</a></p>'
        + '</div></div>';
      return html;
    }

    // Build context-aware quick actions
    var overdueInvs = DB.invoices.getAll().filter(function(i) { return i.status !== 'paid' && i.balance > 0 && i.dueDate && new Date(i.dueDate) < new Date(); });
    var overdueTotal = overdueInvs.reduce(function(s,i){return s+(i.balance||0);},0);
    var staleQuotes = DB.quotes.getAll().filter(function(q){return (q.status==='sent'||q.status==='awaiting') && q.createdAt && (Date.now()-new Date(q.createdAt).getTime()) > 7*86400000;});
    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
    var tomorrowJobs = DB.jobs.getAll().filter(function(j){return j.scheduledDate && j.scheduledDate.substring(0,10)===tomorrow.toISOString().split('T')[0];});
    html += '<div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0;background:var(--bg);">'
      + '<button onclick="AI._inlineAsk(\'Write a professional quote description for a large oak tree removal near power lines\')" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--white);cursor:pointer;">✍️ Quote description</button>'
      + '<button onclick="AI._inlineAsk(\'Draft a friendly follow-up email to a client whose quote has been pending for a week\')" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--white);cursor:pointer;">📧 Follow-up email</button>'
      + '<button onclick="AI._inlineAsk(\'Give me a business summary with total revenue, active jobs, open quotes, and recommendations\')" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--white);cursor:pointer;">📊 Business summary</button>'
      + '<button onclick="AI._inlineAsk(\'What should I charge for removing a 24-inch DBH oak, 60 feet tall, tight backyard, no bucket truck access?\')" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--white);cursor:pointer;">💰 Price estimate</button>'
      + (overdueInvs.length > 0 ? '<button onclick="AI._inlineAsk(\'I have ' + overdueInvs.length + ' overdue invoices totaling $' + Math.round(overdueTotal).toLocaleString() + '. Write me a firm but professional collection email I can send to late-paying clients.\')" style="font-size:11px;padding:5px 10px;border:1px solid #dc3545;border-radius:14px;background:#fff5f5;cursor:pointer;color:#dc3545;">🔴 ' + overdueInvs.length + ' overdue invoices</button>' : '')
      + (staleQuotes.length > 0 ? '<button onclick="AI._inlineAsk(\'I have ' + staleQuotes.length + ' quotes that have been sitting unanswered for over a week. Write a short, friendly nudge text message I can send to get a response.\')" style="font-size:11px;padding:5px 10px;border:1px solid #e6a817;border-radius:14px;background:#fffbf0;cursor:pointer;color:#b8860b;">⏳ ' + staleQuotes.length + ' stale quotes</button>' : '')
      + (tomorrowJobs.length > 0 ? '<button onclick="AI._inlineAsk(\'I have ' + tomorrowJobs.length + ' job' + (tomorrowJobs.length !== 1 ? 's' : '') + ' scheduled for tomorrow. Write a short, friendly reminder text I can send to each client tonight.\')" style="font-size:11px;padding:5px 10px;border:1px solid var(--green-dark);border-radius:14px;background:var(--green-bg);cursor:pointer;color:var(--green-dark);">📅 Tomorrow\'s reminders</button>' : '')
      + '<button onclick="AI._inlineAsk(AI._p.upsell)" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--white);cursor:pointer;">🌲 Upsell ideas</button>'
      + '<button onclick="AI._inlineAsk(AI._p.instagram)" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--white);cursor:pointer;">📱 Instagram caption</button>'
      + '<button onclick="AI._inlineAsk(AI._p.referral)" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--white);cursor:pointer;">🤝 Referral ask</button>'
      + '<button onclick="AI._inlineAsk(AI._p.tip)" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--white);cursor:pointer;">💡 Business tip</button>'
      + '</div>';

    html += '<div id="ai-messages" style="flex:1;overflow-y:auto;padding:16px;">';
    if (AI._messages.length === 0) {
      html += '<div style="text-align:center;padding:40px 20px;color:var(--text-light);">'
        + '<div style="font-size:40px;margin-bottom:12px;">🌳</div>'
        + '<div style="font-size:15px;font-weight:600;margin-bottom:8px;">How can I help?</div>'
        + '<div style="font-size:13px;line-height:1.8;">I can help you:<br>'
        + '• Price jobs & write estimates<br>'
        + '• Draft client emails and texts<br>'
        + '• Summarize your business performance<br>'
        + '• Answer tree care questions<br>'
        + '• Suggest upsells and follow-ups</div></div>';
    } else {
      AI._messages.forEach(function(msg) { html += AI._renderMessage(msg); });
    }
    html += '</div>';

    html += '<div style="padding:12px 16px;border-top:1px solid var(--border);flex-shrink:0;">'
      + '<div style="display:flex;gap:8px;align-items:flex-end;">'
      + '<textarea id="ai-input" rows="1" placeholder="Ask anything about your business..." '
      + 'style="flex:1;padding:10px 14px;border:2px solid var(--border);border-radius:12px;font-size:14px;resize:none;max-height:100px;font-family:inherit;line-height:1.4;" '
      + 'onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();AI._inlineSend();}" '
      + 'oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,100)+\'px\'"></textarea>'
      + '<button onclick="AI._inlineSend()" style="background:linear-gradient(135deg,#D4A574 0%,#C4956A 100%);color:#fff;border:none;border-radius:12px;width:44px;height:44px;cursor:pointer;font-size:18px;flex-shrink:0;">↑</button>'
      + '</div>'
      + '<div style="font-size:10px;color:var(--text-light);text-align:center;margin-top:6px;">Powered by AI</div>'
      + '</div>';
    return html;
  },

  _inlineAsk: function(question) {
    var input = document.getElementById('ai-input');
    if (input) { input.value = question; }
    AI._inlineSend();
  },

  _inlineSend: function() {
    var input = document.getElementById('ai-input');
    if (!input) { AI.send(); return; }
    var text = input.value.trim();
    if (!text || AI._loading) return;
    AI._messages.push({ role: 'user', content: text });
    input.value = ''; input.style.height = 'auto';
    AI._refreshMessages();
    AI._scrollToBottom();
    var context = AI._buildContext();
    AI._loading = true;
    AI._showTyping();
    AI._callAI(context, text).then(function(response) {
      AI._loading = false;
      AI._removeTyping();
      AI._messages.push({ role: 'assistant', content: response });
      AI._refreshMessages();
      AI._scrollToBottom();
      AI._saveHistory();
    }).catch(function(err) {
      AI._loading = false;
      AI._removeTyping();
      AI._messages.push({ role: 'assistant', content: 'Error: ' + (err.message || 'Could not reach the AI. . Check your key in Settings.') });
      AI._refreshMessages();
      AI._scrollToBottom();
    });
  },

  _refreshInline: function() {
    var container = document.getElementById('ai-inline-container');
    if (container) { AI.init(); container.innerHTML = AI._renderPanelInline(); }
  },

  _visible: false,
  _messages: [],
  _apiKey: '',
  _loading: false,

  init: function() {
    AI._apiKey = localStorage.getItem('bm-claude-key') || '';
    AI._loadHistory();
  },

  _loadHistory: function() {
    try { AI._messages = JSON.parse(localStorage.getItem('bm-ai-history') || '[]'); } catch(e) { AI._messages = []; }
  },

  toggle: function() {
    if (AI._visible) { AI.hide(); } else { AI.show(); }
  },

  show: function() {
    AI.init();
    AI._visible = true;

    // Create panel
    var panel = document.createElement('div');
    panel.id = 'ai-panel';
    panel.style.cssText = 'position:fixed;right:0;top:0;bottom:0;width:420px;max-width:90vw;background:var(--white);z-index:9999;box-shadow:-8px 0 30px rgba(0,0,0,.15);display:flex;flex-direction:column;transition:transform .25s ease;';

    // Overlay
    var overlay = document.createElement('div');
    overlay.id = 'ai-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:9998;';
    overlay.onclick = function() { AI.hide(); };

    panel.innerHTML = AI._renderPanel();
    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    // Focus input
    setTimeout(function() {
      var input = document.getElementById('ai-input');
      if (input) input.focus();
    }, 100);

    // Scroll to bottom
    AI._scrollToBottom();
  },

  hide: function() {
    AI._visible = false;
    var panel = document.getElementById('ai-panel');
    var overlay = document.getElementById('ai-overlay');
    if (panel) panel.remove();
    if (overlay) overlay.remove();
  },

  _renderPanel: function() {
    var html = ''
      // Header
      + '<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<div style="width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#D4A574 0%,#C4956A 100%);display:flex;align-items:center;justify-content:center;">'
      + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
      + '<div><div style="font-weight:700;font-size:15px;">AI</div>'
      + '<div style="font-size:11px;color:var(--text-light);">Your tree service assistant</div></div></div>'
      + '<div style="display:flex;gap:4px;">'
      + '<button onclick="AI._copyConversation()" style="background:none;border:none;cursor:pointer;font-size:13px;color:var(--text-light);padding:4px 8px;" title="Copy conversation">📋</button>'
      + '<button onclick="AI._clearHistory()" style="background:none;border:none;cursor:pointer;font-size:13px;color:var(--text-light);padding:4px 8px;" title="Clear chat">🗑️</button>'
      + '<button onclick="AI.hide()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--text-light);padding:4px 8px;">✕</button>'
      + '</div></div>';

    // API key setup — only show if AI is genuinely unreachable
    if (!AIConfig.available()) {
      html += '<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px;">'
        + '<div style="text-align:center;max-width:320px;">'
        + '<div style="font-size:40px;margin-bottom:12px;">🤖</div>'
        + '<h3 style="margin-bottom:8px;">Connect AI Assistant</h3>'
        + '<p style="font-size:13px;color:var(--text-light);margin-bottom:16px;">Enter your AI API key to enable AI-powered estimates, client emails, and business insights.</p>'
        + '<input type="password" id="ai-key-input" placeholder="sk-ant-..." style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-bottom:12px;">'
        + '<button class="btn btn-primary" onclick="AI._saveKey()" style="width:100%;">Connect</button>'
        + '<p style="font-size:11px;color:var(--text-light);margin-top:12px;">Key is stored locally on your device only. Get one at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">console.anthropic.com</a></p>'
        + '</div></div>';
      return html;
    }

    // Quick actions
    html += '<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0;">'
      + '<button class="ai-quick" onclick="AI.ask(\'Write a professional quote description for a large oak tree removal near power lines\')" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--bg);cursor:pointer;color:var(--text);">✍️ Quote description</button>'
      + '<button class="ai-quick" onclick="AI.ask(\'Draft a friendly follow-up email to a client whose quote has been pending for a week\')" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--bg);cursor:pointer;color:var(--text);">📧 Follow-up email</button>'
      + '<button class="ai-quick" onclick="AI.ask(\'Give me a business summary: total revenue, active jobs, open quotes, and any recommendations\')" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--bg);cursor:pointer;color:var(--text);">📊 Business summary</button>'
      + '<button class="ai-quick" onclick="AI.ask(\'What should I charge for removing a 24-inch DBH oak tree, 60 feet tall, in a tight backyard with no bucket truck access?\')" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--bg);cursor:pointer;color:var(--text);">💰 Price estimate</button>'
      + '<button class="ai-quick" onclick="AI.ask(AI._p.upsell)" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--bg);cursor:pointer;color:var(--text);">🌲 Upsell ideas</button>'
      + '<button class="ai-quick" onclick="AI.ask(AI._p.instagram)" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--bg);cursor:pointer;color:var(--text);">📱 Instagram caption</button>'
      + '<button class="ai-quick" onclick="AI.ask(AI._p.referral)" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--bg);cursor:pointer;color:var(--text);">🤝 Referral ask</button>'
      + '<button class="ai-quick" onclick="AI.ask(AI._p.tip)" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:14px;background:var(--bg);cursor:pointer;color:var(--text);">💡 Business tip</button>'
      + '</div>';

    // Messages
    html += '<div id="ai-messages" style="flex:1;overflow-y:auto;padding:16px;">';

    if (AI._messages.length === 0) {
      html += '<div style="text-align:center;padding:40px 20px;color:var(--text-light);">'
        + '<div style="font-size:36px;margin-bottom:12px;">🌳</div>'
        + '<div style="font-size:15px;font-weight:600;margin-bottom:8px;">How can I help?</div>'
        + '<div style="font-size:13px;line-height:1.6;">I can help you with:<br>'
        + '• Estimate job pricing<br>'
        + '• Write quote descriptions<br>'
        + '• Draft client emails & texts<br>'
        + '• Analyze business performance<br>'
        + '• Answer tree care questions</div></div>';
    } else {
      AI._messages.forEach(function(msg) {
        html += AI._renderMessage(msg);
      });
    }
    html += '</div>';

    // Input area (text + voice + send)
    // v639: removed the "🔊 Speak replies" toggle per Doug — TTS was noisy
    // and not wanted. Also force-disable so any leftover stored preference
    // doesn't keep speaking.
    try { localStorage.setItem('bm-ai-speak-replies', 'false'); } catch(e) {}
    html += '<div style="padding:12px 16px;border-top:1px solid var(--border);flex-shrink:0;">'
      + '<div style="display:flex;gap:8px;align-items:flex-end;">'
      +   '<button id="ai-mic-btn" onclick="AI.toggleMic()" title="Dictate with voice" style="background:var(--white);border:1px solid var(--border);border-radius:12px;width:40px;height:40px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;" aria-label="Voice input">🎙️</button>'
      +   '<textarea id="ai-input" rows="1" placeholder="Ask anything… or tap mic to dictate" '
      +     'style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:12px;font-size:14px;resize:none;max-height:100px;font-family:inherit;line-height:1.4;" '
      +     'onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();AI.send();}" '
      +     'oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,100)+\'px\'"></textarea>'
      +   '<button onclick="AI.send()" style="background:linear-gradient(135deg,#D4A574 0%,#C4956A 100%);color:#fff;border:none;border-radius:12px;width:40px;height:40px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;">↑</button>'
      + '</div>'
      + '<div style="display:flex;align-items:center;justify-content:flex-end;font-size:11px;color:var(--text-light);margin-top:6px;">'
      +   '<span>Powered by AI</span>'
      + '</div>'
      + '</div>';

    return html;
  },

  _renderMessage: function(msg) {
    var isUser = msg.role === 'user';
    var msgId = 'ai-msg-' + Math.random().toString(36).slice(2, 8);
    var copyBtn = !isUser
      ? '<button onclick="(function(){var el=document.getElementById(\'' + msgId + '\');if(!el)return;var t=el.innerText;if(navigator.clipboard){navigator.clipboard.writeText(t).then(function(){UI.toast(\'Copied!\');});}else{var ta=document.createElement(\'textarea\');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand(\'copy\');document.body.removeChild(ta);UI.toast(\'Copied!\');}})();" '
        + 'style="background:none;border:1px solid var(--border);border-radius:6px;padding:2px 8px;font-size:10px;color:var(--text-light);cursor:pointer;margin-top:4px;display:inline-block;" title="Copy response">📋 Copy</button>'
      : '';
    return '<div style="display:flex;gap:8px;margin-bottom:16px;' + (isUser ? 'flex-direction:row-reverse;' : '') + '">'
      + '<div style="width:28px;height:28px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px;'
      + (isUser ? 'background:var(--accent);color:#fff;' : 'background:linear-gradient(135deg,#D4A574,#C4956A);color:#fff;') + '">'
      + (isUser ? '👤' : '✦') + '</div>'
      + '<div style="flex:1;max-width:calc(100% - 44px);">'
      + '<div style="font-size:11px;color:var(--text-light);margin-bottom:4px;' + (isUser ? 'text-align:right;' : '') + '">' + (isUser ? 'You' : 'AI') + '</div>'
      + '<div id="' + msgId + '" style="background:' + (isUser ? 'var(--accent)' : 'var(--bg)') + ';color:' + (isUser ? '#fff' : 'var(--text)') + ';padding:10px 14px;border-radius:' + (isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px') + ';font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word;">'
      + AI._formatResponse(msg.content) + '</div>'
      + copyBtn
      + '</div></div>';
  },

  _formatResponse: function(text) {
    // Basic markdown-like formatting
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/`(.*?)`/g, '<code style="background:rgba(0,0,0,.08);padding:1px 4px;border-radius:3px;font-size:12px;">$1</code>');
    // Convert bullet points
    text = text.replace(/^[•·-]\s/gm, '• ');
    return text;
  },

  ask: function(question) {
    var input = document.getElementById('ai-input');
    if (input) input.value = question;
    AI.send();
  },

  send: function() {
    var input = document.getElementById('ai-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text || AI._loading) return;

    // Find + visually disable the send button
    var sendBtn = document.querySelector('button[onclick*="AI.send"]');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.style.opacity = '0.5';
      sendBtn.style.cursor = 'not-allowed';
      sendBtn._origHTML = sendBtn.innerHTML;
      sendBtn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></span>';
    }
    input.disabled = true;

    // Add user message
    AI._messages.push({ role: 'user', content: text });
    input.value = '';
    input.style.height = 'auto';
    AI._refreshMessages();
    AI._scrollToBottom();

    var context = AI._buildContext();
    AI._loading = true;
    AI._showTyping();

    var restoreBtn = function() {
      AI._loading = false;
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.opacity = '';
        sendBtn.style.cursor = '';
        if (sendBtn._origHTML) sendBtn.innerHTML = sendBtn._origHTML;
      }
      if (input) input.disabled = false;
    };

    AI._callAI(context, text).then(function(response) {
      restoreBtn();
      AI._removeTyping();
      AI._messages.push({ role: 'assistant', content: response });
      AI._saveHistory();
      AI._refreshMessages();
      AI._scrollToBottom();
      // v639: TTS speak removed entirely — was unwanted noise.
    }).catch(function(err) {
      restoreBtn();
      AI._removeTyping();
      AI._messages.push({ role: 'assistant', content: '❌ Error: ' + (err.message || 'Could not connect to AI. Check your API key.') });
      AI._refreshMessages();
      AI._scrollToBottom();
    });
  },

  // ── Voice input (Web Speech API) ──
  _recog: null,
  _micOn: false,

  toggleMic: function() {
    if (AI._micOn) { AI.stopMic(); return; }
    AI.startMic();
  },

  startMic: function() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { UI.toast('Voice input not supported in this browser. Try Chrome.', 'error'); return; }

    // Request mic permission explicitly first — avoids silent failures on iOS/Android
    var doStart = function() {
      var recog = new SR();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = 'en-US';
      var input = document.getElementById('ai-input');
      var existing = input ? input.value : '';

      recog.onresult = function(e) {
        var finalChunk = '';
        var interimChunk = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var r = e.results[i];
          if (r.isFinal) finalChunk += r[0].transcript;
          else interimChunk += r[0].transcript;
        }
        if (input) {
          var base = finalChunk ? (existing + (existing ? ' ' : '') + finalChunk).trim() : existing;
          if (finalChunk) existing = base;
          input.value = interimChunk ? base + (base ? ' ' : '') + interimChunk : base;
          input.style.height = 'auto';
          input.style.height = Math.min(input.scrollHeight, 100) + 'px';
        }
      };
      recog.onerror = function(e) {
        if (e.error === 'not-allowed') {
          UI.toast('Microphone permission denied. Enable mic access for this site in your browser settings.', 'error');
          AI._setMicIdle();
          AI._micOn = false;
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
          UI.toast('Mic error: ' + e.error, 'error');
        }
      };
      recog.onend = function() {
        if (AI._micOn) { try { recog.start(); } catch(err) { AI._setMicIdle(); AI._micOn = false; } }
      };

      try { recog.start(); } catch(err) { UI.toast('Could not start mic: ' + err.message, 'error'); return; }
      AI._recog = recog;
      AI._micOn = true;
      var btn = document.getElementById('ai-mic-btn');
      if (btn) { btn.style.background = '#dc2626'; btn.style.color = '#fff'; btn.textContent = '■'; }
    };

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function(stream) {
          stream.getTracks().forEach(function(t) { t.stop(); }); // release immediately, just needed for permission
          doStart();
        })
        .catch(function(err) {
          UI.toast('Mic permission denied: ' + (err.name || err.message) + '. Check browser settings.', 'error');
        });
    } else {
      doStart();
    }
  },

  stopMic: function() {
    AI._micOn = false;
    if (AI._recog) { try { AI._recog.stop(); } catch(e) {} AI._recog = null; }
    AI._setMicIdle();
  },

  _setMicIdle: function() {
    var btn = document.getElementById('ai-mic-btn');
    if (btn) { btn.style.background = 'var(--white)'; btn.style.color = ''; btn.innerHTML = '🎙️'; }
  },

  // ── Voice output (SpeechSynthesis API) ──
  _preferredVoice: null,
  _pickBritishMaleVoice: function() {
    if (!window.speechSynthesis) return null;
    var voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    // Priority: named British males → any en-GB male → any en-GB → any English
    var preferred = ['Daniel', 'Arthur', 'Malcolm', 'Oliver', 'James'];
    for (var i = 0; i < preferred.length; i++) {
      var v = voices.find(function(v) { return v.name === preferred[i]; });
      if (v) return v;
    }
    // Partial match: en-GB male-sounding names
    var gbMale = voices.find(function(v) {
      return v.lang && v.lang.startsWith('en-GB') && /daniel|arthur|george|harry|james|oliver|thomas|william/i.test(v.name);
    });
    if (gbMale) return gbMale;
    // Any en-GB
    var gb = voices.find(function(v) { return v.lang && v.lang.startsWith('en-GB'); });
    if (gb) return gb;
    // Fallback: en-AU (Australian), then any English
    var au = voices.find(function(v) { return v.lang && v.lang.startsWith('en-AU'); });
    if (au) return au;
    return voices.find(function(v) { return v.lang && v.lang.startsWith('en'); }) || null;
  },
  speak: function(text) {
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      var clean = String(text)
        .replace(/```[\s\S]*?```/g, ' code snippet ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[*_~#>]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\n{2,}/g, '. ')
        .replace(/\s+/g, ' ')
        .trim();
      if (clean.length > 1000) clean = clean.slice(0, 1000) + '. Continued in text.';
      var utter = new SpeechSynthesisUtterance(clean);
      utter.rate = 1.0;
      utter.pitch = 0.95;
      // Pick voice — voices may not be loaded yet; retry once after voiceschanged
      var voice = AI._preferredVoice || AI._pickBritishMaleVoice();
      if (voice) {
        AI._preferredVoice = voice;
        utter.voice = voice;
      } else if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = function() {
          window.speechSynthesis.onvoiceschanged = null;
          AI._preferredVoice = AI._pickBritishMaleVoice();
        };
      }
      window.speechSynthesis.speak(utter);
    } catch(e) { /* speech not available */ }
  },

  _buildContext: function() {
    var stats = DB.dashboard.getStats();
    var jobs = DB.jobs.getAll();
    var quotes = DB.quotes.getAll();
    var invoices = DB.invoices.getAll();
    var clients = DB.clients.getAll();

    var activeJobs = jobs.filter(function(j) { return j.status !== 'completed' && j.status !== 'cancelled'; });
    var openQuotes = quotes.filter(function(q) { return q.status === 'draft' || q.status === 'sent' || q.status === 'awaiting'; });
    var unpaidInvoices = invoices.filter(function(i) { return i.status !== 'paid'; });
    var totalRevenue = invoices.filter(function(i) { return i.status === 'paid'; }).reduce(function(s, i) { return s + (i.total || 0); }, 0);
    var avgJobValue = jobs.length > 0 ? jobs.reduce(function(s, j) { return s + (j.total || 0); }, 0) / jobs.length : 0;

    // Recent jobs for pricing context
    var recentJobs = jobs.slice(0, 20).map(function(j) {
      return (j.description || 'Job') + ': $' + (j.total || 0);
    }).join('; ');

    var overdueInvoices = unpaidInvoices.filter(function(i) { return i.dueDate && new Date(i.dueDate) < new Date(); });
    var overdueTotal = overdueInvoices.reduce(function(s,i){return s+(i.balance||0);},0);
    var newRequests = DB.requests.getAll().filter(function(r){return r.status==='new';});
    var staleQuotes = openQuotes.filter(function(q){return q.createdAt && (Date.now()-new Date(q.createdAt).getTime()) > 7*86400000;});
    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
    var tomorrowStr = tomorrow.toISOString().split('T')[0];
    var tomorrowJobs = jobs.filter(function(j){return j.scheduledDate && j.scheduledDate.substring(0,10)===tomorrowStr;});
    var thisYear = new Date().getFullYear();
    var ytdRevenue = invoices.filter(function(i){return i.status==='paid' && new Date(i.paidDate||i.createdAt).getFullYear()===thisYear;}).reduce(function(s,i){return s+(i.total||0);},0);

    var coName = CompanyInfo.get('name');
    var coPhone = CompanyInfo.get('phone');
    var coEmail = CompanyInfo.get('email');
    return 'You are AI, an AI assistant built into Branch Manager — a field service management app for ' + coName + ' in Peekskill, NY.\n\n'
      + 'BUSINESS CONTEXT:\n'
      + '• Company: ' + coName + '\n'
      + '• Location: Peekskill, NY (serves Westchester & Putnam counties)\n'
      + '• Phone: ' + coPhone + ' | Email: ' + coEmail + '\n'
      + '• Owner: ' + CompanyInfo.get('ownerName') + '\n'
      + '• Licenses: WC-32079 (Westchester), PC-50644 (Putnam)\n'
      + '• Services: Tree removal, pruning, stump grinding, cabling, bucket truck work, storm damage, lot clearing, firewood, snow removal\n'
      + '• Reviews: 5.0★ / 100 Google reviews\n\n'
      + 'LIVE BUSINESS DATA (' + new Date().toLocaleDateString() + '):\n'
      + '• Total clients: ' + clients.length + '\n'
      + '• Total jobs: ' + jobs.length + ' (active: ' + activeJobs.length + ')\n'
      + '• Total quotes: ' + quotes.length + ' (open/awaiting: ' + openQuotes.length + ', stale 7+ days: ' + staleQuotes.length + ')\n'
      + '• Unpaid invoices: ' + unpaidInvoices.length + ' (overdue: ' + overdueInvoices.length + ', $' + Math.round(overdueTotal).toLocaleString() + ' past due)\n'
      + '• New service requests: ' + newRequests.length + '\n'
      + '• Tomorrow\'s jobs: ' + tomorrowJobs.length + '\n'
      + '• YTD revenue (' + thisYear + '): $' + Math.round(ytdRevenue).toLocaleString() + '\n'
      + '• All-time revenue (paid invoices): $' + Math.round(totalRevenue).toLocaleString() + '\n'
      + '• Average job value: $' + Math.round(avgJobValue).toLocaleString() + '\n\n'
      + 'RECENT JOB PRICING:\n' + recentJobs + '\n\n'
      + 'INSTRUCTIONS:\n'
      + '• Be concise and professional — responses under 300 words unless detail is requested\n'
      + '• For pricing estimates, use the recent job data and NY/Westchester market rates\n'
      + '• For emails/texts, write them ready to copy-paste — professional but warm\n'
      + '• For business analysis, reference the actual live numbers above\n'
      + '• When writing client communications, sign as ' + CompanyInfo.get('ownerName') + ', ' + coName + '\n'
      + '• Use dollar amounts when discussing pricing\n';
  },

  _callAI: function(systemPrompt, userMessage) {
    return new Promise(function(resolve, reject) {
      // Build messages array with history for context
      var apiMessages = [];
      var recent = AI._messages.slice(-10); // Last 10 messages for context
      recent.forEach(function(m) {
        apiMessages.push({ role: m.role, content: m.content });
      });

      fetch('https://ltpivkqahvplapyagljt.supabase.co/functions/v1/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1024,
          system: systemPrompt,
          messages: apiMessages,
          apiKey: window.bmAIKey() || AI._apiKey
        })
      })
      .then(function(res) {
        if (!res.ok) {
          return res.json().then(function(err) {
            throw new Error(err.error ? err.error.message : 'API error ' + res.status);
          });
        }
        return res.json();
      })
      .then(function(data) {
        if (data.content && data.content[0]) {
          resolve(data.content[0].text);
        } else {
          reject(new Error('No response from AI'));
        }
      })
      .catch(function(err) {
        reject(err);
      });
    });
  },

  _showTyping: function() {
    var container = document.getElementById('ai-messages');
    if (!container) return;
    container.innerHTML += '<div id="ai-typing" style="display:flex;gap:8px;margin-bottom:16px;">'
      + '<div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#D4A574,#C4956A);display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;flex-shrink:0;">✦</div>'
      + '<div><div style="font-size:11px;color:var(--text-light);margin-bottom:4px;">AI</div>'
      + '<div style="background:var(--bg);padding:10px 14px;border-radius:14px 14px 14px 4px;font-size:13px;">'
      + '<span class="typing-dots" style="display:inline-flex;gap:4px;">'
      + '<span style="width:6px;height:6px;border-radius:50%;background:var(--text-light);animation:blink 1.4s infinite both;animation-delay:0s;"></span>'
      + '<span style="width:6px;height:6px;border-radius:50%;background:var(--text-light);animation:blink 1.4s infinite both;animation-delay:.2s;"></span>'
      + '<span style="width:6px;height:6px;border-radius:50%;background:var(--text-light);animation:blink 1.4s infinite both;animation-delay:.4s;"></span>'
      + '</span></div></div></div>';
    AI._scrollToBottom();
  },

  _removeTyping: function() {
    var typing = document.getElementById('ai-typing');
    if (typing) typing.remove();
  },

  _refreshMessages: function() {
    var container = document.getElementById('ai-messages');
    if (!container) return;
    var html = '';
    if (AI._messages.length === 0) {
      html = '<div style="text-align:center;padding:40px 20px;color:var(--text-light);">'
        + '<div style="font-size:36px;margin-bottom:12px;">🌳</div>'
        + '<div style="font-size:15px;font-weight:600;margin-bottom:8px;">How can I help?</div>'
        + '<div style="font-size:13px;">Ask me about pricing, client emails, or business insights.</div></div>';
    } else {
      AI._messages.forEach(function(msg) {
        html += AI._renderMessage(msg);
      });
    }
    container.innerHTML = html;
  },

  _scrollToBottom: function() {
    setTimeout(function() {
      var container = document.getElementById('ai-messages');
      if (container) container.scrollTop = container.scrollHeight;
    }, 50);
  },

  _saveKey: function() {
    var key = document.getElementById('ai-key-input').value.trim();
    if (!key) { UI.toast('Enter your API key', 'error'); return; }
    localStorage.setItem('bm-claude-key', key);
    AI._apiKey = key;
    UI.toast('AI Assistant connected!');
    // Refresh panel
    var panel = document.getElementById('ai-panel');
    if (panel) panel.innerHTML = AI._renderPanel();
    setTimeout(function() {
      var input = document.getElementById('ai-input');
      if (input) input.focus();
    }, 100);
  },

  _saveHistory: function() {
    try { localStorage.setItem('bm-ai-history', JSON.stringify(AI._messages.slice(-20))); } catch(e) {}
  },

  _clearHistory: function() {
    AI._messages = [];
    localStorage.removeItem('bm-ai-history');
    AI._refreshMessages();
    UI.toast('Chat cleared');
  },

  _copyConversation: function() {
    if (AI._messages.length === 0) { UI.toast('No conversation to copy', 'error'); return; }
    var text = AI._messages.map(function(m) {
      return (m.role === 'user' ? 'You' : 'AI') + ':\n' + m.content;
    }).join('\n\n---\n\n');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function() { UI.toast('Conversation copied!'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      UI.toast('Conversation copied!');
    }
  }
};

// Add typing animation CSS
(function() {
  var style = document.createElement('style');
  style.textContent = '@keyframes blink { 0%,80%,100% { opacity:.3; } 40% { opacity:1; } }';
  document.head.appendChild(style);
})();
