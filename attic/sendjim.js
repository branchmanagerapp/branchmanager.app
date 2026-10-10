/**
 * Branch Manager — SendJim Integration
 * Direct mail automation: postcards, handwritten cards, gift mailers
 * API proxied through sendjim-send edge function (credentials stay server-side)
 *
 * Setup:
 *   1. supabase secrets set SENDJIM_CLIENT_KEY=xxx SENDJIM_CLIENT_SECRET=yyy
 *   2. In SendJim UI, create QuickSend templates and note their IDs
 *   3. Enter QuickSend IDs in BM Settings → Integrations → SendJim
 */
var SendJim = (function() {

  var FN_URL = (window.BM_CONFIG && window.BM_CONFIG.supabaseFunctionsUrl)
    ? window.BM_CONFIG.supabaseFunctionsUrl
    : 'https://ltpivkqahvplapyagljt.supabase.co/functions/v1';

  // ── Config stored in localStorage ────────────────────────────────────────
  function getConfig() {
    try { return JSON.parse(localStorage.getItem('bm-sendjim-config') || '{}'); } catch(e) { return {}; }
  }
  function saveConfig(cfg) {
    localStorage.setItem('bm-sendjim-config', JSON.stringify(cfg));
  }

  // ── Core API call via edge function ───────────────────────────────────────
  function call(action, payload) {
    return fetch(FN_URL + '/sendjim-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, payload: payload || {} })
    }).then(function(r) { return r.json(); });
  }

  // ── Send a single mail piece ──────────────────────────────────────────────
  function sendMail(quickSendId, client) {
    if (!quickSendId) return Promise.reject(new Error('No QuickSend ID configured'));
    var nameParts = (client.name || '').trim().split(/\s+/);
    return call('send', {
      quickSendId: parseInt(quickSendId, 10),
      contact: {
        firstName: nameParts[0] || '',
        lastName:  nameParts.slice(1).join(' ') || '',
        address:   client.address || client.street || '',
        city:      client.city  || '',
        state:     client.state || 'NY',
        zip:       client.zip   || client.postal || '',
        email:     client.email || '',
        phone:     client.phone || ''
      }
    });
  }

  // ── Automation triggers (call from jobs.js / clients.js etc.) ────────────

  function afterJobComplete(job) {
    var cfg = getConfig();
    if (!cfg.auto_job_complete) return;
    var qid = cfg.qid_job_complete;
    if (!qid) return;
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) return;
    // Delay 3 days — store a scheduled flag to avoid double-firing
    var key = 'sj-jc-' + job.id;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    // Fetch client address
    sb.from('clients').select('name,email,phone,address,city,state,zip').eq('id', job.client_id).maybeSingle()
      .then(function(r) {
        if (!r.data) return;
        // Real send happens via a 3-day delayed edge function call — for now fire immediately
        // TODO: swap for a pg_cron-scheduled row in a sendjim_queue table
        sendMail(qid, r.data).then(function(res) {
          if (res.Code === 0) {
            UI.toast('📬 Thank-you postcard queued for ' + (r.data.name || 'client'));
          } else {
            console.warn('[SendJim] afterJobComplete error:', res);
          }
        }).catch(function(e) { console.warn('[SendJim]', e); });
      });
  }

  function afterNewClient(client) {
    var cfg = getConfig();
    if (!cfg.auto_new_client) return;
    var qid = cfg.qid_new_client;
    if (!qid || !client.address) return;
    sendMail(qid, client).then(function(res) {
      if (res.Code === 0) UI.toast('📬 Welcome postcard queued for ' + (client.name || 'client'));
      else console.warn('[SendJim] afterNewClient error:', res);
    }).catch(function(e) { console.warn('[SendJim]', e); });
  }

  // ── Settings UI ───────────────────────────────────────────────────────────
  function renderSettings() {
    var cfg = getConfig();

    var automations = [
      { id: 'job_complete', label: 'Thank-You After Job', desc: 'Postcard 3 days after job marked complete', qidKey: 'qid_job_complete', autoKey: 'auto_job_complete' },
      { id: 'new_client',   label: 'New Client Welcome',  desc: 'Postcard when a new client is created',    qidKey: 'qid_new_client',   autoKey: 'auto_new_client' },
      { id: 'winback',      label: 'Win-Back (90 days)',  desc: 'Postcard to clients inactive 90+ days',    qidKey: 'qid_winback',      autoKey: 'auto_winback' },
      { id: 'seasonal',     label: 'Spring Campaign',     desc: 'Annual spring mailer to all past clients', qidKey: 'qid_seasonal',     autoKey: 'auto_seasonal' },
      { id: 'review_thank', label: 'Review Thank-You',    desc: 'Handwritten card after client leaves a Google review', qidKey: 'qid_review_thank', autoKey: 'auto_review_thank' }
    ];

    var html = '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">'
      + '<div style="width:40px;height:40px;background:#ff6b35;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px;flex-shrink:0;">SJ</div>'
      + '<div><h3 style="margin:0;font-size:15px;">SendJim — Direct Mail</h3>'
      + '<div id="sj-status" style="font-size:12px;color:var(--text-light);">Checking connection…</div></div>'
      + '<button onclick="SendJim.checkBalance()" style="margin-left:auto;background:none;border:1px solid var(--border);padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;">Check Balance</button>'
      + '</div>'
      + '<p style="font-size:13px;color:var(--text-light);margin-bottom:16px;line-height:1.6;">Physical postcards and handwritten cards sent automatically. Credentials are stored securely on the server — add them via Supabase secrets, not here.</p>'
      + '<div style="background:var(--bg);border-radius:8px;padding:12px;font-size:12px;color:var(--text-light);margin-bottom:12px;font-family:monospace;line-height:1.8;">'
      + 'supabase secrets set SENDJIM_CLIENT_KEY=your_key SENDJIM_CLIENT_SECRET=your_secret<br>'
      + '--project-ref ltpivkqahvplapyagljt'
      + '</div>'
      + '</div>';

    // QuickSend IDs + automations
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">'
      + '<h3 style="font-size:15px;margin:0;">Automations</h3>'
      + '<button onclick="SendJim.loadQuickSends()" style="background:none;border:1px solid var(--border);padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;">↻ Load QuickSend IDs</button>'
      + '</div>'
      + '<p style="font-size:12px;color:var(--text-light);margin-bottom:16px;">Create templates in SendJim UI → get the numeric ID → enter it here.</p>'
      + '<div id="sj-quicksends-list" style="margin-bottom:12px;font-size:12px;color:var(--text-light);">Click "Load QuickSend IDs" to fetch your templates.</div>';

    automations.forEach(function(a) {
      var on  = !!cfg[a.autoKey];
      var qid = cfg[a.qidKey] || '';
      html += '<div style="display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">'
        + '<input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="SendJim.toggleAuto(\'' + a.autoKey + '\',this.checked)" style="width:18px;height:18px;cursor:pointer;">'
        + '<div>'
        + '<div style="font-weight:600;font-size:13px;">' + a.label + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);">' + a.desc + '</div>'
        + '</div>'
        + '<input type="number" placeholder="QuickSend ID" value="' + UI.esc(qid) + '" onchange="SendJim.setQid(\'' + a.qidKey + '\',this.value)" style="width:110px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;">'
        + '</div>';
    });
    html += '</div>';

    // Manual send
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);">'
      + '<h3 style="font-size:15px;margin-bottom:8px;">Manual Campaigns</h3>'
      + '<p style="font-size:12px;color:var(--text-light);margin-bottom:12px;">Pick a QuickSend ID and target — sends to matching clients immediately.</p>'
      + '<div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;">'
      + '<input type="number" id="sj-manual-qid" placeholder="QuickSend ID" style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;">'
      + '<select id="sj-manual-target" style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;">'
      + '<option value="all_active">All active clients</option>'
      + '<option value="inactive_90">Inactive 90+ days</option>'
      + '<option value="recent_complete">Recent completed jobs (30d)</option>'
      + '</select>'
      + '<button onclick="SendJim.runManual()" class="btn btn-primary" style="font-size:13px;white-space:nowrap;">Send</button>'
      + '</div>'
      + '<div id="sj-manual-result" style="margin-top:8px;font-size:12px;color:var(--text-light);"></div>'
      + '</div>';

    // Auto-check balance
    setTimeout(function() { SendJim.checkBalance(true); }, 300);
    return html;
  }

  function checkBalance(silent) {
    call('balance').then(function(res) {
      var el = document.getElementById('sj-status');
      if (!el) return;
      if (res.error) {
        el.textContent = '⚠ ' + res.error;
        el.style.color = '#c62828';
      } else {
        var credits = res.NumberOfCredits != null ? res.NumberOfCredits : '?';
        el.textContent = '✅ Connected · ' + credits + ' credits remaining';
        el.style.color = 'var(--green-dark)';
      }
    }).catch(function() {
      var el = document.getElementById('sj-status');
      if (el) { el.textContent = 'Could not reach SendJim'; el.style.color = 'var(--text-light)'; }
    });
  }

  function loadQuickSends() {
    var el = document.getElementById('sj-quicksends-list');
    if (el) el.textContent = 'Loading…';
    call('quicksends').then(function(res) {
      if (!el) return;
      var items = Array.isArray(res) ? res : (res.QuickSends || res.quickSends || []);
      if (!items.length) { el.textContent = 'No QuickSends found. Create templates in the SendJim UI first.'; return; }
      var html = '<div style="display:grid;gap:4px;">';
      items.forEach(function(q) {
        html += '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--bg);border-radius:6px;">'
          + '<code style="font-size:11px;font-weight:700;color:var(--accent);">' + (q.QuickSendID || q.Id || q.id) + '</code>'
          + '<span style="font-size:12px;">' + UI.esc(q.Name || q.name || 'Untitled') + '</span>'
          + '<span style="font-size:11px;color:var(--text-light);margin-left:auto;">' + UI.esc(q.MailType || q.Type || '') + '</span>'
          + '</div>';
      });
      html += '</div>';
      el.innerHTML = html;
    }).catch(function() {
      if (el) el.textContent = 'Failed to load — check credentials.';
    });
  }

  function toggleAuto(key, val) {
    var cfg = getConfig();
    cfg[key] = val;
    saveConfig(cfg);
    UI.toast(val ? 'Automation enabled' : 'Automation disabled');
  }

  function setQid(key, val) {
    var cfg = getConfig();
    cfg[key] = val.trim();
    saveConfig(cfg);
  }

  function runManual() {
    var qid = parseInt((document.getElementById('sj-manual-qid') || {}).value || '0', 10);
    var target = (document.getElementById('sj-manual-target') || {}).value || 'all_active';
    var resultEl = document.getElementById('sj-manual-result');
    if (!qid) { if (resultEl) resultEl.textContent = 'Enter a QuickSend ID first.'; return; }

    var clients = [];
    var now = Date.now();
    if (typeof DB !== 'undefined') {
      var all = DB.clients.getAll().filter(function(c) { return c.address && c.city; });
      if (target === 'all_active') {
        clients = all.filter(function(c) { return c.status !== 'archived'; });
      } else if (target === 'inactive_90') {
        var cutoff = now - 90 * 86400000;
        clients = all.filter(function(c) {
          var last = new Date(c.lastJobDate || c.updated_at || 0).getTime();
          return last < cutoff;
        });
      } else if (target === 'recent_complete') {
        var cutoff30 = now - 30 * 86400000;
        var jobs = DB.jobs.getAll().filter(function(j) {
          return j.status === 'completed' && new Date(j.completedDate || j.completed_at || 0).getTime() > cutoff30;
        });
        var cids = {};
        jobs.forEach(function(j) { if (j.clientId) cids[j.clientId] = true; });
        clients = all.filter(function(c) { return cids[c.id]; });
      }
    }

    if (!clients.length) { if (resultEl) resultEl.textContent = 'No matching clients found.'; return; }
    if (resultEl) resultEl.textContent = 'Sending to ' + clients.length + ' clients…';

    var sent = 0; var failed = 0;
    var promises = clients.slice(0, 50).map(function(c) { // cap at 50 per manual run
      return sendMail(qid, c).then(function(res) {
        if (res.Code === 0) sent++;
        else { failed++; console.warn('[SendJim] manual send fail:', c.name, res); }
      }).catch(function() { failed++; });
    });

    Promise.all(promises).then(function() {
      if (resultEl) resultEl.textContent = '✅ ' + sent + ' sent' + (failed ? ' · ' + failed + ' failed' : '') + '.';
      UI.toast('📬 SendJim: ' + sent + ' mailers sent');
    });
  }

  return {
    renderSettings:   renderSettings,
    checkBalance:     checkBalance,
    loadQuickSends:   loadQuickSends,
    toggleAuto:       toggleAuto,
    setQid:           setQid,
    runManual:        runManual,
    // Hooks called by other modules
    afterJobComplete: afterJobComplete,
    afterNewClient:   afterNewClient
  };
})();
