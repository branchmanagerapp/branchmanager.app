/**
 * Branch Manager — Automations Configuration v10
 * Set up email/SMS triggers for:
 * - Quote follow-ups (5 + 10 days)
 * - Invoice follow-ups (1 + 4 days overdue)
 * - Visit reminders (1hr text + 1 day email)
 * - Review requests (after job completion)
 * - Request received confirmation
 * - Booking confirmation
 *
 * When Supabase is connected, these run as Edge Functions on cron.
 * For now, they show the configuration UI and can trigger manually.
 */
var AutomationsPage = {
  _co: function() {
    return {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      website: CompanyInfo.get('website')
    };
  },
  _defaults: {
    quoteFollowup1: { enabled: true, days: 5, channel: 'email', label: 'Quote follow-up #1' },
    quoteFollowup2: { enabled: true, days: 10, channel: 'email', label: 'Quote follow-up #2' },
    invoiceFollowup1: { enabled: true, days: 1, channel: 'email', label: 'Invoice follow-up #1' },
    invoiceFollowup2: { enabled: true, days: 4, channel: 'email', label: 'Invoice follow-up #2' },
    visitReminderText: { enabled: true, hours: 1, channel: 'sms', label: 'Visit reminder (text)' },
    visitReminderEmail: { enabled: true, hours: 24, channel: 'email', label: 'Visit reminder (email)' },
    reviewRequest: { enabled: true, days: 3, channel: 'email', label: 'Review request' },
    requestConfirm: { enabled: true, channel: 'email', label: 'Request received confirmation' },
    bookingConfirm: { enabled: true, channel: 'email', label: 'Booking confirmation' }
  },

  getConfig: function() {
    var stored = localStorage.getItem('bm-automations');
    return stored ? JSON.parse(stored) : AutomationsPage._defaults;
  },

  saveConfig: function(config) {
    localStorage.setItem('bm-automations', JSON.stringify(config));
  },

  render: function() {
    var config = AutomationsPage.getConfig();
    var connected = !!localStorage.getItem('bm-supabase-url');

    var html = '';

    if (!connected) {
      html += '<div style="padding:16px;background:#fff3e0;border-radius:10px;border-left:4px solid #e65100;margin-bottom:16px;font-size:13px;">'
        + '<strong style="color:#e65100;">⚠️ Supabase not connected</strong> — Automations are configured but won\'t run automatically until you connect Supabase in Settings. You can still trigger them manually.'
        + '</div>';
    }

    // Status bar — v372: Resend is server-keyed, so email is always available.
    var sgOk = true;
    var lastRun = localStorage.getItem('bm-automations-last-run');
    var today = new Date().toISOString().split('T')[0];
    var yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    var lastRunLabel = !lastRun ? 'Never run' : lastRun === today ? 'Today' : lastRun === yesterday ? 'Yesterday' : lastRun;

    html += '<div style="background:var(--white);border-radius:12px;padding:16px 20px;border:1px solid var(--border);margin-bottom:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">'
      + '<div style="flex:1;min-width:180px;">'
      + '<div style="font-size:13px;margin-bottom:4px;">'
      + '<span style="color:var(--green-dark);font-weight:600;">Email connected (Resend)</span>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Last auto-run: ' + lastRunLabel + ' &bull; Runs daily when app is open</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;">'
      + '<button class="btn btn-outline" onclick="AutomationsPage.preview()" style="font-size:13px;">🔍 Preview</button>'
      + '<button class="btn btn-primary" onclick="AutomationsPage.runAll()" style="font-size:13px;">▶ Run All Now</button>'
      + '</div>'
      + '</div>';

    // ── Server-side Automations (runs on Supabase cron, independent of browser) ──
    html += AutomationsPage._renderServerSection();

    // Quotes section
    html += AutomationsPage._section('Quotes', [
      AutomationsPage._rule('quoteFollowup1', config),
      AutomationsPage._rule('quoteFollowup2', config)
    ], 'Automatically follow up with clients who haven\'t responded to quotes.');

    // Invoices section
    html += AutomationsPage._section('Invoices', [
      AutomationsPage._rule('invoiceFollowup1', config),
      AutomationsPage._rule('invoiceFollowup2', config)
    ], 'Remind clients about unpaid invoices.');

    // Jobs section
    html += AutomationsPage._section('Jobs', [
      AutomationsPage._rule('visitReminderText', config),
      AutomationsPage._rule('visitReminderEmail', config),
      AutomationsPage._rule('bookingConfirm', config)
    ], 'Send visit reminders and booking confirmations.');

    // Reviews
    html += AutomationsPage._section('Reviews', [
      AutomationsPage._rule('reviewRequest', config)
    ], 'Request Google reviews after job completion.');

    // Requests
    html += AutomationsPage._section('Requests', [
      AutomationsPage._rule('requestConfirm', config)
    ], 'Confirm receipt of new service requests.');

    // Email/SMS Templates
    if (typeof Templates !== 'undefined') {
      html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-top:16px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;cursor:pointer;" onclick="var el=document.getElementById(\'template-editor\');el.style.display=el.style.display===\'none\'?\'block\':\'none\';">'
        + '<h3>📝 Email & SMS Templates</h3><span style="color:var(--text-light);">▶</span></div>'
        + '<p style="font-size:13px;color:var(--text-light);margin-bottom:12px;">Customize the messages sent to clients. Use variables like {{name}}, {{amount}}, {{date}}.</p>'
        + '<div id="template-editor" style="display:none;">';
      Object.keys(Templates.library).forEach(function(key) {
        html += Templates.renderEditor(key);
      });
      html += '</div></div>';
    }

    // Manual triggers
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-top:16px;">'
      + '<h3 style="margin-bottom:12px;">Manual Triggers</h3>'
      + '<p style="font-size:13px;color:var(--text-light);margin-bottom:12px;">Run automations manually for testing or catch-up. Results depend on client email addresses being on file.</p>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button class="btn btn-outline" onclick="AutomationsPage.preview()" style="font-size:13px;">🔍 Preview</button>'
      + '<button class="btn btn-primary" onclick="AutomationsPage.runAll()" style="font-size:13px;">✅ Run All</button>'
      + '<button class="btn btn-outline" onclick="AutomationsPage.runQuoteFollowups()">📋 Quote Follow-ups</button>'
      + '<button class="btn btn-outline" onclick="AutomationsPage.runInvoiceFollowups()">💰 Invoice Reminders</button>'
      + '<button class="btn btn-outline" onclick="AutomationsPage.runVisitReminders()">📅 Visit Reminders</button>'
      + '<button class="btn btn-outline" onclick="AutomationsPage.runReviewRequests()">⭐ Review Requests</button>'
      + '</div>'
      + AutomationsPage._automationLog()
      + '</div>';

    return html;
  },

  // ── Server-side section ────────────────────────────────────────────────────

  EDGE_URL: 'https://ltpivkqahvplapyagljt.supabase.co/functions/v1/marketing-automation',

  _renderServerSection: function() {
    var lastResult = null;
    try { lastResult = JSON.parse(localStorage.getItem('bm-server-auto-last') || 'null'); } catch(e) {}
    var lastLabel = lastResult ? new Date(lastResult.ran_at).toLocaleString() : 'Never';

    // Per-trigger toggles stored in localStorage
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('bm-server-auto-cfg') || '{}'); } catch(e) {}
    function isOn(key) { return cfg[key] !== false; }
    function toggle(key) {
      return 'AutomationsPage._toggleServerTrigger(\'' + key + '\')';
    }
    function onOff(key, label, desc) {
      var on = isOn(key);
      return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">'
        + '<button onclick="' + toggle(key) + '" style="position:relative;width:36px;height:20px;border-radius:10px;border:none;cursor:pointer;background:' + (on ? 'var(--green-dark)' : '#ccc') + ';flex-shrink:0;">'
        + '<span style="position:absolute;top:2px;' + (on ? 'left:18px' : 'left:2px') + ';width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s;"></span></button>'
        + '<div><div style="font-size:13px;font-weight:600;">' + label + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);">' + desc + '</div></div>'
        + '</div>';
    }

    var resultHtml = '';
    if (lastResult) {
      var r = lastResult;
      resultHtml = '<div style="font-size:12px;color:var(--text-light);margin-top:8px;display:flex;gap:16px;flex-wrap:wrap;">'
        + '<span>Reviews: <b>' + r.review_requests.sent + '</b> sent, ' + r.review_requests.skipped + ' skip</span>'
        + '<span>Follow-ups: <b>' + r.quote_followups.sent + '</b> sent, ' + r.quote_followups.skipped + ' skip</span>'
        + '<span>Upsells: <b>' + r.upsells.sent + '</b> sent, ' + r.upsells.skipped + ' skip</span>'
        + '<span style="color:' + (r.total_sent > 0 ? 'var(--green-dark)' : 'var(--text-light)') + ';">Total: <b>' + r.total_sent + '</b></span>'
        + '</div>';
    }

    var cronSql = "select cron.schedule('marketing-automation', '0 */4 * * *', $$select net.http_post('https://ltpivkqahvplapyagljt.supabase.co/functions/v1/marketing-automation','{}','application/json')$$);";

    return '<div style="background:var(--white);border-radius:12px;padding:20px;border:2px solid var(--green-light);margin-bottom:16px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">'
      + '<h3 style="margin:0;font-size:15px;">⚡ Server Automations <span style="font-size:11px;font-weight:400;color:var(--text-light);margin-left:6px;">runs on Supabase cron, works even when app is closed</span></h3>'
      + '<button id="server-auto-run-btn" onclick="AutomationsPage.runServerAutomations()" style="background:var(--green-dark);color:#fff;border:none;padding:7px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">▶ Run Now</button>'
      + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);margin-bottom:12px;">Last run: ' + lastLabel + resultHtml + '</div>'
      + onOff('review', '⭐ Review Request (24h after job completes)', 'Sends "how did we do?" email with Google review link')
      + onOff('quote_followup', '📋 Quote Follow-up (7 days no response)', 'Sends follow-up email on open sent quotes')
      + onOff('upsell', '💬 Upsell (30 days after invoice paid)', 'Sends "ready for more?" email to happy customers')
      + '<details style="margin-top:12px;"><summary style="font-size:12px;color:var(--text-light);cursor:pointer;">▸ pg_cron setup (run once in Supabase SQL editor)</summary>'
      + '<textarea onclick="this.select()" readonly style="width:100%;margin-top:8px;font-size:11px;font-family:monospace;padding:8px;border:1px solid var(--border);border-radius:6px;box-sizing:border-box;color:var(--text);background:var(--bg);resize:none;" rows="3">' + cronSql + '</textarea>'
      + '<div style="font-size:11px;color:var(--text-light);margin-top:4px;">Runs every 4 hours. Requires pg_net extension enabled (Dashboard → Database → Extensions).</div>'
      + '</details>'
      + '</div>';
  },

  _toggleServerTrigger: function(key) {
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('bm-server-auto-cfg') || '{}'); } catch(e) {}
    cfg[key] = cfg[key] === false ? true : false; // toggle (default=on)
    localStorage.setItem('bm-server-auto-cfg', JSON.stringify(cfg));
    // Re-render just the server section
    loadPage('automations');
  },

  runServerAutomations: function() {
    var btn = document.getElementById('server-auto-run-btn');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    fetch(AutomationsPage.EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      localStorage.setItem('bm-server-auto-last', JSON.stringify(result));
      if (btn) { btn.disabled = false; btn.textContent = '▶ Run Now'; }
      var msg = 'Server automations: ' + result.total_sent + ' email' + (result.total_sent !== 1 ? 's' : '') + ' sent';
      UI.toast(msg, result.total_sent > 0 ? 'success' : '');
      // Refresh the section
      loadPage('automations');
    })
    .catch(function(err) {
      if (btn) { btn.disabled = false; btn.textContent = '▶ Run Now'; }
      UI.toast('Server automation error: ' + (err.message || 'check console'), 'error');
      console.error('marketing-automation error:', err);
    });
  },

  _section: function(title, rules, description) {
    return '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<h3 style="margin-bottom:4px;">' + title + '</h3>'
      + '<p style="font-size:13px;color:var(--text-light);margin-bottom:16px;">' + description + '</p>'
      + rules.join('')
      + '</div>';
  },

  _rule: function(key, config) {
    var rule = config[key] || AutomationsPage._defaults[key];
    var channelIcon = rule.channel === 'sms' ? '📱' : '✉️';
    // v396: timing is inline-editable. Each rule has either `days` (after-event)
    // or `hours` (before-event); render a number input + unit label, save on
    // change. Rules with neither (immediate) render no editor.
    var timingEditor = '';
    if (typeof rule.days === 'number') {
      timingEditor = '<input type="number" min="0" max="180" value="' + rule.days
        + '" onchange="AutomationsPage.setTiming(\'' + key + '\', \'days\', parseInt(this.value,10))" '
        + 'style="width:54px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;font-size:12px;text-align:center;"> '
        + '<span style="font-size:11px;color:var(--text-light);">day' + (rule.days !== 1 ? 's' : '') + ' after</span>';
    } else if (typeof rule.hours === 'number') {
      timingEditor = '<input type="number" min="0" max="168" value="' + rule.hours
        + '" onchange="AutomationsPage.setTiming(\'' + key + '\', \'hours\', parseInt(this.value,10))" '
        + 'style="width:54px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;font-size:12px;text-align:center;"> '
        + '<span style="font-size:11px;color:var(--text-light);">hour' + (rule.hours !== 1 ? 's' : '') + ' before</span>';
    } else {
      timingEditor = '<span style="font-size:12px;color:var(--text-light);">Immediate</span>';
    }

    return '<div style="display:flex;align-items:center;gap:12px;padding:12px;background:' + (rule.enabled ? 'var(--green-bg)' : 'var(--bg)') + ';border-radius:8px;margin-bottom:8px;border-left:3px solid ' + (rule.enabled ? 'var(--green-dark)' : 'var(--border)') + ';flex-wrap:wrap;">'
      + '<label style="display:flex;align-items:center;cursor:pointer;"><input type="checkbox" ' + (rule.enabled ? 'checked' : '') + ' onchange="AutomationsPage.toggle(\'' + key + '\', this.checked)" style="width:20px;height:20px;"></label>'
      + '<span style="font-size:18px;">' + channelIcon + '</span>'
      + '<div style="flex:1;min-width:160px;">'
      + '<div style="font-weight:600;font-size:14px;">' + rule.label + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">via ' + rule.channel + '</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:6px;">' + timingEditor + '</div>'
      + '<span style="font-size:12px;color:' + (rule.enabled ? 'var(--green-dark)' : 'var(--text-light)') + ';font-weight:600;min-width:32px;text-align:right;">' + (rule.enabled ? 'ON' : 'OFF') + '</span>'
      + '</div>';
  },

  // v396: persist a single rule's timing change without re-rendering the page
  setTiming: function(key, field, value) {
    if (!isFinite(value) || value < 0) { UI.toast('Value must be 0 or higher', 'error'); return; }
    var config = AutomationsPage.getConfig();
    if (!config[key]) config[key] = Object.assign({}, AutomationsPage._defaults[key]);
    config[key][field] = value;
    localStorage.setItem('bm-automations', JSON.stringify(config));
    UI.toast('Timing saved');
  },

  toggle: function(key, enabled) {
    var config = AutomationsPage.getConfig();
    if (!config[key]) config[key] = Object.assign({}, AutomationsPage._defaults[key]);
    config[key].enabled = enabled;
    AutomationsPage.saveConfig(config);
    UI.toast(config[key].label + (enabled ? ' enabled' : ' disabled'));
  },

  // Manual triggers — actually sends emails
  runQuoteFollowups: function() {
    var config = AutomationsPage.getConfig();
    var quotes = DB.quotes.getAll().filter(function(q) { return q.status === 'sent' || q.status === 'awaiting'; });
    var now = Date.now();
    var sent = 0, skipped = 0;
    quotes.forEach(function(q) {
      var daysSince = Math.floor((now - new Date(q.sentAt || q.createdAt).getTime()) / 86400000);
      var client = q.clientId ? DB.clients.getById(q.clientId) : null;
      var email = q.sentTo || (client && client.email) || '';
      if (!email) { skipped++; return; }
      var firstName = (q.clientName || '').split(' ')[0] || 'there';
      var approvalLink = 'https://branchmanager.app/approve.html?id=' + q.id;

      // Followup #1 — day 5-9
      if (config.quoteFollowup1 && config.quoteFollowup1.enabled
          && daysSince >= (config.quoteFollowup1.days || 5)
          && daysSince < (config.quoteFollowup2 ? (config.quoteFollowup2.days || 10) : 999)
          && !q.followup1SentAt) {
        var sub1 = 'Following up — Quote #' + q.quoteNumber + ' for ' + UI.money(q.total);
        var body1 = 'Hi ' + firstName + ',\n\nJust checking in on your quote for work at ' + (q.property || 'your property') + '.\n\n'
          + '📋 Quote #' + q.quoteNumber + ' — ' + UI.money(q.total) + '\n\n'
          + '👉 View & approve online:\n' + approvalLink + '\n\n'
          + 'Happy to answer any questions — just reply or call ' + AutomationsPage._co().phone + '.\n\n'
          + 'Thanks,\n' + CompanyInfo.get('ownerName') + '\n' + AutomationsPage._co().name;
        if (typeof Email !== 'undefined') Email.send(email, sub1, body1, { silent: !!AutomationsPage._silentMode });
        DB.quotes.update(q.id, { followup1SentAt: new Date().toISOString(), status: 'awaiting' });
        sent++;
      }
      // Followup #2 — day 10+
      else if (config.quoteFollowup2 && config.quoteFollowup2.enabled
          && daysSince >= (config.quoteFollowup2.days || 10)
          && !q.followup2SentAt) {
        var sub2 = 'Last reminder — Quote #' + q.quoteNumber + ' from ' + AutomationsPage._co().name;
        var body2 = 'Hi ' + firstName + ',\n\nOne last follow-up on your quote for ' + UI.money(q.total) + '.\n\n'
          + '👉 ' + approvalLink + '\n\n'
          + 'If the timing isn\'t right, no worries at all — we\'ll be here when you need us.\n\n'
          + 'Thanks,\n' + CompanyInfo.get('ownerName') + '\n' + AutomationsPage._co().name + '\n' + AutomationsPage._co().phone;
        if (typeof Email !== 'undefined') Email.send(email, sub2, body2, { silent: !!AutomationsPage._silentMode });
        DB.quotes.update(q.id, { followup2SentAt: new Date().toISOString() });
        sent++;
      }
    });
    var qMsg = sent > 0 ? 'Sent ' + sent + ' quote follow-up' + (sent !== 1 ? 's' : '') : skipped > 0 ? skipped + ' quotes missing email' : 'No quotes need follow-up';
    AutomationsPage._logActivity(qMsg);
    UI.toast(sent > 0 ? 'Sent ' + sent + ' follow-up email' + (sent !== 1 ? 's' : '') : skipped > 0 ? 'No emails — ' + skipped + ' quotes missing client email' : 'No quotes need follow-up right now');
  },

  runInvoiceFollowups: function() {
    var config = AutomationsPage.getConfig();
    var now = new Date();
    var invoices = DB.invoices.getAll().filter(function(i) { return (i.status === 'sent' || i.status === 'overdue' || i.status === 'partial') && (i.balance || 0) > 0; });
    var sent = 0, skipped = 0;
    invoices.forEach(function(inv) {
      if (!inv.dueDate) return;
      var daysOverdue = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
      if (daysOverdue < 1) return;
      var client = inv.clientId ? DB.clients.getById(inv.clientId) : null;
      var email = inv.clientEmail || (client && client.email) || '';
      if (!email) { skipped++; return; }
      var firstName = (inv.clientName || '').split(' ')[0] || 'there';
      var payLink = 'https://branchmanager.app/pay.html?id=' + inv.id;

      // Followup #1 — 1-3 days overdue
      if (config.invoiceFollowup1 && config.invoiceFollowup1.enabled
          && daysOverdue >= (config.invoiceFollowup1.days || 1)
          && daysOverdue < (config.invoiceFollowup2 ? (config.invoiceFollowup2.days || 4) : 999)
          && !inv.followup1SentAt) {
        var sub1 = 'Invoice #' + inv.invoiceNumber + ' is past due — ' + UI.money(inv.balance || inv.total);
        var body1 = 'Hi ' + firstName + ',\n\nThis is a friendly reminder that Invoice #' + inv.invoiceNumber + ' for ' + UI.money(inv.balance || inv.total) + ' was due on ' + UI.dateShort(inv.dueDate) + '.\n\n'
          + '👉 Pay online:\n' + payLink + '\n\n'
          + 'We accept credit card, check, or cash. If you have any questions, please call ' + AutomationsPage._co().phone + '.\n\n'
          + 'Thanks,\n' + CompanyInfo.get('ownerName') + '\n' + AutomationsPage._co().name;
        if (typeof Email !== 'undefined') Email.send(email, sub1, body1, { silent: !!AutomationsPage._silentMode });
        DB.invoices.update(inv.id, { followup1SentAt: new Date().toISOString(), status: 'overdue' });
        sent++;
      }
      // Followup #2 — 4+ days overdue
      else if (config.invoiceFollowup2 && config.invoiceFollowup2.enabled
          && daysOverdue >= (config.invoiceFollowup2.days || 4)
          && !inv.followup2SentAt) {
        var sub2 = 'Second notice — Invoice #' + inv.invoiceNumber + ' overdue ' + daysOverdue + ' days';
        var body2 = 'Hi ' + firstName + ',\n\nInvoice #' + inv.invoiceNumber + ' for ' + UI.money(inv.balance || inv.total) + ' is now ' + daysOverdue + ' days past due.\n\n'
          + '👉 ' + payLink + '\n\n'
          + 'Please reach out if there\'s an issue — ' + AutomationsPage._co().phone + ' or reply to this email.\n\n'
          + 'Thanks,\n' + CompanyInfo.get('ownerName') + '\n' + AutomationsPage._co().name;
        if (typeof Email !== 'undefined') Email.send(email, sub2, body2, { silent: !!AutomationsPage._silentMode });
        DB.invoices.update(inv.id, { followup2SentAt: new Date().toISOString() });
        sent++;
      }
    });
    var iMsg = sent > 0 ? 'Sent ' + sent + ' invoice reminder' + (sent !== 1 ? 's' : '') : skipped > 0 ? skipped + ' invoices missing email' : 'No overdue invoices need reminders';
    AutomationsPage._logActivity(iMsg);
    UI.toast(sent > 0 ? 'Sent ' + sent + ' invoice reminder' + (sent !== 1 ? 's' : '') : skipped > 0 ? 'No emails — ' + skipped + ' invoices missing client email' : 'No overdue invoices need reminders right now');
  },

  _automationLog: function() {
    var log = [];
    try { log = JSON.parse(localStorage.getItem('bm-automation-log') || '[]'); } catch(e) {}
    if (!log.length) return '<div id="automation-log-container"></div>';
    var recent = log.slice(0, 8);
    return '<div id="automation-log-container" style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px;">'
      + '<div style="font-size:12px;font-weight:700;color:var(--text-light);margin-bottom:8px;text-transform:uppercase;">Recent Activity'
      + '<button onclick="AutomationsPage.clearLog()" style="font-size:11px;color:var(--text-light);background:none;border:none;cursor:pointer;float:right;">Clear</button>'
      + '</div>'
      + recent.map(function(entry) {
          return '<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;">'
            + '<span>' + UI.esc(entry.message) + '</span>'
            + '<span style="color:var(--text-light);">' + UI.dateShort(entry.at) + '</span>'
            + '</div>';
        }).join('')
      + '</div>';
  },

  _logActivity: function(message) {
    var log = [];
    try { log = JSON.parse(localStorage.getItem('bm-automation-log') || '[]'); } catch(e) {}
    log.unshift({ message: message, at: new Date().toISOString() });
    if (log.length > 50) log = log.slice(0, 50);
    localStorage.setItem('bm-automation-log', JSON.stringify(log));
  },

  runVisitReminders: function() {
    var config = AutomationsPage.getConfig();
    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    var tomorrowStr = tomorrow.toISOString().split('T')[0];
    var jobs = DB.jobs.getAll().filter(function(j) {
      return j.scheduledDate && j.scheduledDate.substring(0, 10) === tomorrowStr
        && j.status !== 'completed' && j.status !== 'cancelled';
    });
    var sent = 0, skipped = 0;
    jobs.forEach(function(job) {
      if (job.reminderSentAt && job.reminderSentAt.substring(0, 10) === new Date().toISOString().split('T')[0]) return;
      var client = job.clientId ? DB.clients.getById(job.clientId) : null;
      var email = job.clientEmail || (client && client.email) || '';
      if (!email) { skipped++; return; }
      var firstName = (job.clientName || '').split(' ')[0] || 'there';
      var timeLabel = job.startTime ? ' at ' + job.startTime : (job.arrivalWindow === 'morning' ? ' in the morning (8am–12pm)' : job.arrivalWindow === 'afternoon' ? ' in the afternoon (12pm–5pm)' : '');
      var subject = 'Reminder: ' + AutomationsPage._co().name + ' tomorrow' + timeLabel;
      var body = 'Hi ' + firstName + ',\n\nThis is a friendly reminder that your tree service is scheduled for tomorrow, ' + tomorrowStr + timeLabel + '.\n\n'
        + '📍 ' + (job.property || 'Your property') + '\n'
        + (job.description ? '📋 ' + job.description + '\n' : '')
        + (job.crew && job.crew.length ? '👷 Crew: ' + job.crew.join(', ') + '\n' : '')
        + '\nIf you need to reschedule, please call ' + AutomationsPage._co().phone + ' as soon as possible.\n\n'
        + 'Thank you,\n' + CompanyInfo.get('ownerName') + '\n' + AutomationsPage._co().name + '\n' + AutomationsPage._co().phone;
      if (typeof Email !== 'undefined') Email.send(email, subject, body, { silent: !!AutomationsPage._silentMode });
      DB.jobs.update(job.id, { reminderSentAt: new Date().toISOString() });
      sent++;
    });
    var msg = sent > 0
      ? 'Sent ' + sent + ' visit reminder' + (sent !== 1 ? 's' : '') + ' for tomorrow'
      : jobs.length === 0 ? 'No jobs scheduled for tomorrow' : skipped > 0 ? skipped + ' jobs missing client email' : 'All reminders already sent today';
    AutomationsPage._logActivity(msg);
    UI.toast(msg);
  },

  // App startup — delegates daily run to _autoRun, sets up hourly re-check
  init: function() {
    // Run daily automations after a short delay to let the app fully initialize
    setTimeout(function() { AutomationsPage._autoRun(); }, 5000);
    // Re-check every hour (catches the midnight rollover)
    setInterval(function() {
      var nowDay = new Date().toISOString().split('T')[0];
      if (localStorage.getItem('bm-automations-last-run') !== nowDay) {
        AutomationsPage._autoRun();
      }
    }, 3600000);
  },

  runReviewRequests: function() {
    var config = AutomationsPage.getConfig();
    if (!config.reviewRequest || !config.reviewRequest.enabled) {
      UI.toast('Review requests are disabled — enable in Automations settings', 'warning');
      return;
    }
    var cutoff = Date.now() - (config.reviewRequest.days || 3) * 86400000;
    var jobs = DB.jobs.getAll().filter(function(j) {
      return j.status === 'completed' && !j.reviewSentAt && new Date(j.completedAt || j.updatedAt || j.createdAt).getTime() <= cutoff;
    });
    var sent = 0, skipped = 0;
    jobs.forEach(function(job) {
      var client = job.clientId ? DB.clients.getById(job.clientId) : null;
      var email = job.clientEmail || (client && client.email) || '';
      if (!email) { skipped++; return; }
      var firstName = (job.clientName || '').split(' ')[0] || 'there';
      var subject = 'How did we do? — ' + AutomationsPage._co().name;
      var reviewLink = 'https://g.page/r/CcVkZHV_EKlEEBM/review';
      var body = 'Hi ' + firstName + ',\n\nThank you so much for choosing ' + AutomationsPage._co().name + '! We hope everything turned out exactly how you imagined.\n\n'
        + 'If you have a moment, we\'d love to hear about your experience. Leaving a quick Google review helps other homeowners in the area find trusted tree care:\n\n'
        + '⭐ Leave a Review: ' + reviewLink + '\n\n'
        + 'It takes less than a minute and means the world to our small business.\n\n'
        + 'Thank you for your support,\n' + CompanyInfo.get('ownerName') + '\n' + AutomationsPage._co().name + '\n' + AutomationsPage._co().phone + '\n' + AutomationsPage._co().website;
      if (typeof Email !== 'undefined') Email.send(email, subject, body, { silent: !!AutomationsPage._silentMode });
      DB.jobs.update(job.id, { reviewSentAt: new Date().toISOString() });
      sent++;
    });
    var rMsg = sent > 0 ? 'Sent ' + sent + ' review request' + (sent !== 1 ? 's' : '') : skipped > 0 ? skipped + ' jobs missing client email' : 'No completed jobs ready for review requests';
    AutomationsPage._logActivity(rMsg);
    if (sent > 0) {
      UI.toast('Sent ' + sent + ' review request' + (sent !== 1 ? 's' : ''));
    } else if (skipped > 0) {
      UI.toast(skipped + ' job' + (skipped !== 1 ? 's' : '') + ' missing client email — add email to client record');
    } else {
      UI.toast('No completed jobs ready for review requests');
    }
  },

  runAll: function() {
    // v372: email is always available (Resend server-keyed). Run all 4 automations.
    var results = [];
    // Temporarily intercept UI.toast to collect results
    var origToast = UI.toast;
    UI.toast = function(msg) { results.push(msg); };
    try {
      AutomationsPage.runQuoteFollowups();
      AutomationsPage.runInvoiceFollowups();
      AutomationsPage.runVisitReminders();
      AutomationsPage.runReviewRequests();
    } finally {
      UI.toast = origToast;
    }
    var html = '<div style="font-size:14px;line-height:2;">'
      + results.map(function(r) { return '<div style="padding:6px 0;border-bottom:1px solid var(--border);">• ' + UI.esc(r) + '</div>'; }).join('')
      + '</div>';
    UI.showModal('Automation Results', html);
    AutomationsPage._logActivity('Run All completed — ' + results.length + ' automation' + (results.length !== 1 ? 's' : '') + ' checked');
    // Refresh log if on automations page
    var logEl = document.querySelector('#automation-log-container');
    if (logEl) logEl.innerHTML = AutomationsPage._automationLog();
  },

  preview: function() {
    // Show a dry-run preview of what would be sent without actually sending
    var now = Date.now();
    var config = AutomationsPage.getConfig();
    var lines = [];

    // Quote follow-ups
    var quotes = DB.quotes.getAll().filter(function(q) { return q.status === 'sent' || q.status === 'awaiting'; });
    var qf1 = 0, qf2 = 0, qSkip = 0;
    quotes.forEach(function(q) {
      var daysSince = Math.floor((now - new Date(q.sentAt || q.createdAt).getTime()) / 86400000);
      var client = q.clientId ? DB.clients.getById(q.clientId) : null;
      var email = q.sentTo || (client && client.email) || '';
      if (!email) { qSkip++; return; }
      if (config.quoteFollowup1 && config.quoteFollowup1.enabled && daysSince >= (config.quoteFollowup1.days || 5) && daysSince < (config.quoteFollowup2 ? (config.quoteFollowup2.days || 10) : 999) && !q.followup1SentAt) qf1++;
      else if (config.quoteFollowup2 && config.quoteFollowup2.enabled && daysSince >= (config.quoteFollowup2.days || 10) && !q.followup2SentAt) qf2++;
    });
    lines.push({ icon: '📋', label: 'Quote follow-up #1', count: qf1, color: qf1 > 0 ? 'var(--green-dark)' : 'var(--text-light)' });
    lines.push({ icon: '📋', label: 'Quote follow-up #2', count: qf2, color: qf2 > 0 ? 'var(--green-dark)' : 'var(--text-light)' });
    if (qSkip > 0) lines.push({ icon: '⚠️', label: 'Quotes missing email', count: qSkip, color: '#e07c24' });

    // Invoice follow-ups
    var nowDate = new Date();
    var invoices = DB.invoices.getAll().filter(function(i) { return (i.status === 'sent' || i.status === 'overdue' || i.status === 'partial') && (i.balance || 0) > 0; });
    var if1 = 0, if2 = 0, iSkip = 0;
    invoices.forEach(function(inv) {
      if (!inv.dueDate) return;
      var daysOverdue = Math.floor((nowDate.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
      if (daysOverdue < 1) return;
      var client = inv.clientId ? DB.clients.getById(inv.clientId) : null;
      var email = inv.clientEmail || (client && client.email) || '';
      if (!email) { iSkip++; return; }
      if (config.invoiceFollowup1 && config.invoiceFollowup1.enabled && daysOverdue >= (config.invoiceFollowup1.days || 1) && daysOverdue < (config.invoiceFollowup2 ? (config.invoiceFollowup2.days || 4) : 999) && !inv.followup1SentAt) if1++;
      else if (config.invoiceFollowup2 && config.invoiceFollowup2.enabled && daysOverdue >= (config.invoiceFollowup2.days || 4) && !inv.followup2SentAt) if2++;
    });
    lines.push({ icon: '💰', label: 'Invoice reminder #1', count: if1, color: if1 > 0 ? 'var(--green-dark)' : 'var(--text-light)' });
    lines.push({ icon: '💰', label: 'Invoice reminder #2', count: if2, color: if2 > 0 ? 'var(--green-dark)' : 'var(--text-light)' });
    if (iSkip > 0) lines.push({ icon: '⚠️', label: 'Invoices missing email', count: iSkip, color: '#e07c24' });

    // Visit reminders (tomorrow)
    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    var tomorrowStr = tomorrow.toISOString().split('T')[0];
    var tJobs = DB.jobs.getAll().filter(function(j) { return j.scheduledDate && j.scheduledDate.substring(0, 10) === tomorrowStr && j.status !== 'completed' && j.status !== 'cancelled'; });
    var vrCount = 0, vrSkip = 0;
    tJobs.forEach(function(job) {
      if (job.reminderSentAt && job.reminderSentAt.substring(0, 10) === new Date().toISOString().split('T')[0]) return;
      var client = job.clientId ? DB.clients.getById(job.clientId) : null;
      var email = job.clientEmail || (client && client.email) || '';
      if (!email) { vrSkip++; return; }
      vrCount++;
    });
    lines.push({ icon: '📅', label: 'Visit reminders (tomorrow)', count: vrCount, color: vrCount > 0 ? 'var(--green-dark)' : 'var(--text-light)' });
    if (vrSkip > 0) lines.push({ icon: '⚠️', label: 'Jobs missing email', count: vrSkip, color: '#e07c24' });

    // Review requests
    var cutoff = now - (config.reviewRequest && config.reviewRequest.days ? config.reviewRequest.days : 3) * 86400000;
    var rrJobs = DB.jobs.getAll().filter(function(j) { return j.status === 'completed' && !j.reviewSentAt && new Date(j.completedAt || j.updatedAt || j.createdAt).getTime() <= cutoff; });
    var rrCount = 0, rrSkip = 0;
    rrJobs.forEach(function(job) {
      var client = job.clientId ? DB.clients.getById(job.clientId) : null;
      var email = job.clientEmail || (client && client.email) || '';
      if (!email) { rrSkip++; return; }
      rrCount++;
    });
    lines.push({ icon: '⭐', label: 'Review requests ready', count: rrCount, color: rrCount > 0 ? 'var(--green-dark)' : 'var(--text-light)' });
    if (rrSkip > 0) lines.push({ icon: '⚠️', label: 'Jobs missing email (reviews)', count: rrSkip, color: '#e07c24' });

    var totalToSend = qf1 + qf2 + if1 + if2 + vrCount + rrCount;

    var html = '<div style="padding:10px 14px;background:#e8f5e9;border-radius:8px;margin-bottom:16px;font-size:13px;color:var(--green-dark);font-weight:600;">Email ready (Resend) — ' + totalToSend + ' email' + (totalToSend !== 1 ? 's' : '') + ' would be sent now</div>'
      + '<div style="font-size:13px;">'
      + lines.map(function(l) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">'
            + '<span>' + l.icon + ' ' + l.label + '</span>'
            + '<span style="font-weight:700;color:' + l.color + ';">' + l.count + '</span>'
            + '</div>';
        }).join('')
      + '</div>';
    UI.showModal('Automation Preview (Dry Run)', html);
  },

  clearLog: function() {
    localStorage.removeItem('bm-automation-log');
    UI.toast('Activity log cleared');
    // Refresh
    var logEl = document.querySelector('#automation-log-container');
    if (logEl) logEl.innerHTML = '';
  },

  // Called on app startup — run automations once per day (silently)
  _autoRun: function() {
    var today = new Date().toISOString().split('T')[0];
    var lastRun = localStorage.getItem('bm-automations-last-run');
    if (lastRun === today) return; // Already ran today

    // v372: Resend is server-keyed, always available — proceed.
    localStorage.setItem('bm-automations-last-run', today);
    AutomationsPage._logActivity('Auto-run started — ' + today);

    // Run silently (no toasts) using a quiet flag.
    // The UI.toast override below catches sync toasts. Email.send is async —
    // by the time fetches resolve, finally has restored UI.toast — so
    // _silentMode is read by Email.send itself to suppress its own toasts +
    // mailto fallback. Without it, a broken Resend key produced 21+ stacked
    // toasts and 21+ mailto: popups on app startup.
    AutomationsPage._silentMode = true;
    var origToast = UI.toast;
    var origModal = UI.showModal;
    UI.toast = function() {};
    UI.showModal = function() {};
    try {
      AutomationsPage.runQuoteFollowups();
      AutomationsPage.runInvoiceFollowups();
      AutomationsPage.runVisitReminders();
      AutomationsPage.runReviewRequests();
      AutomationsPage._checkRecurringJobs(true);
    } finally {
      UI.toast = origToast;
      UI.showModal = origModal;
      // Keep _silentMode = true for ~10s to cover async fetch resolutions,
      // then clear so manual user-initiated sends toast normally again.
      setTimeout(function() { AutomationsPage._silentMode = false; }, 10000);
    }
    AutomationsPage._logActivity('Auto-run complete — ' + today);
    console.debug('[Automations] Daily run complete:', today);
  },

  // Poll Supabase for new quote approvals (every 5 min while app is open)
  startApprovalPolling: function() {
    if (!window._approvalPollStarted) {
      window._approvalPollStarted = true;
      setInterval(AutomationsPage._checkQuoteApprovals, 5 * 60 * 1000);
    }
  },

  _checkRecurringJobs: function(suppressToast) {
    if (typeof RecurringJobs === 'undefined') return;
    var recs = [];
    try { recs = JSON.parse(localStorage.getItem('bm-recurring') || '[]'); } catch(e) {}
    var tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    var generated = 0;
    recs.forEach(function(rec) {
      if (!rec.active) return;
      // Calculate next due date from lastGenerated or startDate
      var base = rec.lastGenerated || rec.startDate;
      if (!base) return;
      var nextDate;
      try {
        nextDate = (typeof RecurringJobs !== 'undefined') ? RecurringJobs._getNextDate(base, rec.frequency) : null;
      } catch(e) { return; }
      if (!nextDate) return;
      var nextMs = new Date(nextDate).getTime();
      if (nextMs <= tomorrow) {
        try {
          if (typeof RecurringJobs !== 'undefined') { RecurringJobs.generateJob(rec.id); generated++; }
        } catch(e) {}
      }
    });
    if (generated > 0) {
      AutomationsPage._logActivity('Auto-created ' + generated + ' recurring job' + (generated !== 1 ? 's' : ''));
      if (!suppressToast && typeof UI !== 'undefined') {
        UI.toast('Auto-created ' + generated + ' recurring job' + (generated !== 1 ? 's' : ''));
      }
    }
  },

  _checkQuoteApprovals: function() {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.ready || !SupabaseDB.client) return;
    var since = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // last 5 min
    SupabaseDB.client
      .from('quotes')
      .select('id, quote_number, client_name, total, status, updated_at')
      .eq('status', 'approved')
      .gte('updated_at', since)
      .then(function(result) {
        var data = result.data;
        var error = result.error;
        if (error || !data || !data.length) return;

        // Check which are new locally
        var localQuotes = [];
        try { localQuotes = JSON.parse(localStorage.getItem('bm-quotes') || '[]'); } catch(e) {}
        data.forEach(function(remote) {
          var local = localQuotes.find(function(q) { return q.id === remote.id; });
          if (local && local.status !== 'approved') {
            local.status = 'approved';
            if (typeof UI !== 'undefined') UI.toast('Quote #' + remote.quote_number + ' approved by ' + (remote.client_name || 'client') + '!', 'success');
          }
        });
        localStorage.setItem('bm-quotes', JSON.stringify(localQuotes));
      }).catch(function() {
        // Silent
      });
  }
};
