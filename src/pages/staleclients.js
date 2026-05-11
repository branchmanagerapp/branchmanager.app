/**
 * StaleClients — list view of every client meeting the v773 outreach-due
 * criteria (top-25% lifetime revenue AND 90+ days since contact). Lets
 * Doug knock out a batch of check-ins in one sitting instead of clicking
 * through each Client detail.
 *
 * Reachable from: Clients page header button + command palette.
 *
 * v774.
 */
var StaleClients = {
  render: function() {
    var clients = DB.clients.getAll();
    var jobs = DB.jobs.getAll();
    var invoices = DB.invoices.getAll();
    var quotes = DB.quotes.getAll();
    var threshold = (typeof ClientsPage !== 'undefined' && ClientsPage._topQuartileRevenue) ? ClientsPage._topQuartileRevenue() : 0;
    var nowMs = Date.now();
    var snoozes = {};
    try { snoozes = JSON.parse(localStorage.getItem('bm-outreach-snooze') || '{}'); } catch(e) {}

    // Index per-client touches + revenue in one pass each.
    var revByClient = {};
    invoices.forEach(function(i) {
      if (i.status !== 'paid') return;
      var k = i.clientId || (i.clientName || '').toLowerCase();
      if (k) revByClient[k] = (revByClient[k] || 0) + (Number(i.total) || 0);
    });

    var touchesByClient = {};
    function bumpTouch(key, dateStr) {
      if (!key || !dateStr) return;
      var t = new Date(dateStr).getTime();
      if (isNaN(t)) return;
      if (!touchesByClient[key] || t > touchesByClient[key]) touchesByClient[key] = t;
    }
    jobs.forEach(function(j) {
      var k = j.clientId || (j.clientName || '').toLowerCase();
      bumpTouch(k, j.scheduledDate || j.createdAt);
    });
    quotes.forEach(function(q) {
      var k = q.clientId || (q.clientName || '').toLowerCase();
      bumpTouch(k, q.sentAt || q.createdAt);
    });
    invoices.forEach(function(i) {
      var k = i.clientId || (i.clientName || '').toLowerCase();
      bumpTouch(k, i.paidDate || i.createdAt);
    });
    // Comms (per-client; CommsLog is per-id)
    if (typeof CommsLog !== 'undefined' && CommsLog.getAll) {
      clients.forEach(function(c) {
        var comms = CommsLog.getAll(c.id);
        if (comms && comms.length) bumpTouch(c.id, comms[0].date);
      });
    }

    // Build the candidate list
    // v781: dormant clients (Mark unreachable) collected separately so they
    // don't nag forever but stay reversible in their own section.
    var stale = [];
    var dormant = [];
    clients.forEach(function(c) {
      if (!c.id || c.status === 'archived' || c.status === 'inactive') return;
      var k = c.id || (c.name || '').toLowerCase();
      var rev = revByClient[k] || revByClient[(c.name || '').toLowerCase()] || 0;
      if (rev < threshold || threshold <= 0) return;
      var lastTouch = touchesByClient[k] || touchesByClient[(c.name || '').toLowerCase()];
      if (!lastTouch) return;
      var daysQuiet = Math.floor((nowMs - lastTouch) / 86400000);
      if (daysQuiet < 90) return;
      if (c.outreachDormant === true) {
        dormant.push({
          id: c.id, name: c.name, revenue: rev, daysQuiet: daysQuiet,
          lastTouch: lastTouch,
          dormantAt: c.outreachDormantAt || null
        });
        return;
      }
      var snoozedUntil = snoozes[c.id];
      var isSnoozed = snoozedUntil && Number(snoozedUntil) > nowMs;
      stale.push({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        revenue: rev,
        daysQuiet: daysQuiet,
        lastTouch: lastTouch,
        snoozedUntil: isSnoozed ? snoozedUntil : null
      });
    });

    // Default sort: highest revenue first, then quietest
    stale.sort(function(a, b) {
      if (Math.abs(b.revenue - a.revenue) > 0.01) return b.revenue - a.revenue;
      return b.daysQuiet - a.daysQuiet;
    });

    var activeCount = stale.filter(function(s){ return !s.snoozedUntil; }).length;
    var snoozedCount = stale.length - activeCount;
    var totalRevAtRisk = stale.filter(function(s){ return !s.snoozedUntil; }).reduce(function(s,r){ return s + r.revenue; }, 0);

    var html = '<div style="max-width:980px;margin:0 auto;">';

    // Header / stats
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">'
      + '<div>'
      +   '<h2 style="font-size:22px;font-weight:700;margin:0;">📣 Stale clients — outreach due</h2>'
      +   '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">Top-25% revenue clients quiet 90+ days · ' + (threshold > 0 ? 'threshold ' + UI.money(threshold) + ' lifetime' : 'too few peers for quartile') + '</div>'
      + '</div>'
      + '<button onclick="loadPage(\'clients\')" class="btn btn-outline" style="font-size:12px;">← Back to Clients</button>'
      + '</div>';

    if (!stale.length) {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:48px 20px;text-align:center;">'
        + '<div style="font-size:36px;margin-bottom:10px;">✅</div>'
        + '<div style="font-size:15px;font-weight:700;margin-bottom:6px;">Nobody overdue.</div>'
        + '<div style="font-size:13px;color:var(--text-light);max-width:440px;margin:0 auto;">Every top-quartile client has been contacted in the last 90 days, or there aren\'t enough paid-invoice peers yet to compute the threshold.</div>'
        + '</div>'
        + '</div>';
      return html;
    }

    // Stats grid
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">'
      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px;">'
      +     '<div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-light);letter-spacing:.04em;">Outreach due</div>'
      +     '<div style="font-size:24px;font-weight:800;color:#92400e;margin-top:4px;">' + activeCount + '</div>'
      +   '</div>'
      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px;">'
      +     '<div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-light);letter-spacing:.04em;">Lifetime value at risk</div>'
      +     '<div style="font-size:24px;font-weight:800;color:var(--green-dark);margin-top:4px;">' + UI.moneyInt(totalRevAtRisk) + '</div>'
      +   '</div>'
      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px;">'
      +     '<div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-light);letter-spacing:.04em;">Snoozed</div>'
      +     '<div style="font-size:24px;font-weight:800;color:var(--text-light);margin-top:4px;">' + snoozedCount + '</div>'
      +   '</div>'
      + '</div>';

    // Bulk actions
    var smsableActive = stale.filter(function(s){ return !s.snoozedUntil && s.phone && s.phone.replace(/\D/g,'').length >= 10; });
    if (smsableActive.length) {
      html += '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">'
        + '<div style="font-size:13px;color:#065f46;"><b>' + smsableActive.length + '</b> active row' + (smsableActive.length === 1 ? '' : 's') + ' have a phone on file.</div>'
        + '<button onclick="StaleClients._bulkSMS()" style="background:#065f46;color:#fff;font-size:12px;font-weight:700;padding:8px 14px;border:none;border-radius:6px;cursor:pointer;">📲 Send check-in SMS to all ' + smsableActive.length + '</button>'
        + '</div>';
    }

    // Table
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">'
      + '<table class="data-table" style="width:100%;font-size:13px;">'
      + '<thead><tr>'
      +   '<th style="text-align:left;">Client</th>'
      +   '<th style="text-align:right;">Lifetime</th>'
      +   '<th style="text-align:right;">Last touch</th>'
      +   '<th style="text-align:right;">Quiet</th>'
      +   '<th>Status</th>'
      +   '<th>Actions</th>'
      + '</tr></thead><tbody>';
    stale.forEach(function(s) {
      var ageColor = s.daysQuiet >= 365 ? '#7f1d1d' : s.daysQuiet >= 180 ? '#dc2626' : '#c2410c';
      var statusPill = s.snoozedUntil
        ? '<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:var(--bg);color:var(--text-light);">snoozed</span>'
        : '<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#fef3c7;color:#92400e;font-weight:700;">due</span>';
      var canSMS = s.phone && s.phone.replace(/\D/g,'').length >= 10;
      var canEmail = s.email && s.email.indexOf('@') > 0;
      html += '<tr>'
        + '<td><a onclick="ClientsPage.showDetail(\'' + s.id + '\')" style="color:var(--accent);cursor:pointer;font-weight:600;">' + UI.esc(s.name || '—') + '</a></td>'
        + '<td style="text-align:right;font-weight:600;">' + UI.moneyInt(s.revenue) + '</td>'
        + '<td style="text-align:right;color:var(--text-light);">' + UI.dateShort(s.lastTouch) + '</td>'
        + '<td style="text-align:right;font-weight:700;color:' + ageColor + ';">' + s.daysQuiet + 'd</td>'
        + '<td>' + statusPill + '</td>'
        + '<td style="white-space:nowrap;">'
        +   (s.snoozedUntil
            ? '<button onclick="StaleClients._unsnooze(\'' + s.id + '\')" style="font-size:11px;padding:4px 10px;background:none;border:1px solid var(--border);border-radius:5px;cursor:pointer;">Unsnooze</button>'
            : (canSMS ? '<button onclick="ClientsPage._sendOutreachSMS(\'' + s.id + '\');setTimeout(function(){loadPage(\'staleclients\');},400);" title="Send check-in SMS" style="font-size:11px;padding:4px 8px;background:var(--green-bg);border:1px solid var(--border);border-radius:5px;cursor:pointer;margin-right:3px;">📲</button>' : '')
              + (canEmail ? '<button onclick="ClientsPage._sendOutreachEmail(\'' + s.id + '\');setTimeout(function(){loadPage(\'staleclients\');},400);" title="Email" style="font-size:11px;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:5px;cursor:pointer;margin-right:3px;">✉️</button>' : '')
              + '<button onclick="ClientsPage._snoozeOutreach(\'' + s.id + '\', 30);setTimeout(function(){loadPage(\'staleclients\');},400);" style="font-size:11px;padding:4px 8px;background:none;border:1px solid var(--border);border-radius:5px;cursor:pointer;color:var(--text-light);margin-right:3px;">Snooze</button>'
              + '<button onclick="StaleClients._markUnreachable(\'' + s.id + '\')" title="Stop nagging — client never responds" style="font-size:11px;padding:4px 8px;background:none;border:1px solid var(--border);border-radius:5px;cursor:pointer;color:#7f1d1d;">🚫 Unreachable</button>')
        + '</td>'
        + '</tr>';
    });
    html += '</tbody></table></div>';

    // v781: Dormant (Marked unreachable) section — kept reversible so a
    // mistaken click stays fixable, and so revenue context is visible.
    if (dormant.length) {
      html += '<div style="margin-top:18px;background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">'
        + '<div style="padding:10px 14px;font-size:12px;font-weight:700;background:var(--bg);border-bottom:1px solid var(--border);color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;">🚫 Dormant — marked unreachable (' + dormant.length + ')</div>'
        + '<table class="data-table" style="width:100%;font-size:13px;">'
        + '<thead><tr>'
        +   '<th style="text-align:left;">Client</th>'
        +   '<th style="text-align:right;">Lifetime</th>'
        +   '<th style="text-align:right;">Last touch</th>'
        +   '<th style="text-align:right;">Quiet</th>'
        +   '<th>Marked</th>'
        +   '<th>Actions</th>'
        + '</tr></thead><tbody>';
      dormant.forEach(function(d) {
        html += '<tr>'
          + '<td><a onclick="ClientsPage.showDetail(\'' + d.id + '\')" style="color:var(--accent);cursor:pointer;font-weight:600;">' + UI.esc(d.name || '—') + '</a></td>'
          + '<td style="text-align:right;font-weight:600;">' + UI.moneyInt(d.revenue) + '</td>'
          + '<td style="text-align:right;color:var(--text-light);">' + UI.dateShort(d.lastTouch) + '</td>'
          + '<td style="text-align:right;color:var(--text-light);">' + d.daysQuiet + 'd</td>'
          + '<td style="font-size:11px;color:var(--text-light);">' + (d.dormantAt ? UI.dateShort(d.dormantAt) : '—') + '</td>'
          + '<td style="white-space:nowrap;"><button onclick="StaleClients._undoUnreachable(\'' + d.id + '\')" style="font-size:11px;padding:4px 10px;background:none;border:1px solid var(--border);border-radius:5px;cursor:pointer;">↩ Undo dormant</button></td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';
    }

    html += '</div>';
    return html;
  },

  // v781: Stop nagging. Clients who never respond after 2 outreach attempts
  // can be flipped to "dormant" so they leave the outreach-due list AND the
  // per-client banner. Reversible from the Dormant section below the table.
  _markUnreachable: function(clientId) {
    var c = DB.clients.getById(clientId);
    if (!c) { UI.toast('Client not found', 'error'); return; }
    if (!confirm('Mark "' + (c.name || 'this client') + '" as unreachable?\n\nThey\'ll stop appearing in outreach-due and the per-client banner. You can undo this from the Dormant section below the table.')) return;
    DB.clients.update(clientId, {
      outreachDormant: true,
      outreachDormantAt: new Date().toISOString()
    });
    UI.toast('Marked dormant — won\'t nag again');
    loadPage('staleclients');
  },

  _undoUnreachable: function(clientId) {
    var c = DB.clients.getById(clientId);
    if (!c) return;
    DB.clients.update(clientId, {
      outreachDormant: false,
      outreachDormantAt: null
    });
    UI.toast('Restored — back in outreach pool');
    loadPage('staleclients');
  },

  _bulkSMS: function() {
    var clients = DB.clients.getAll();
    var snoozes = {};
    try { snoozes = JSON.parse(localStorage.getItem('bm-outreach-snooze') || '{}'); } catch(e) {}
    var threshold = (typeof ClientsPage !== 'undefined' && ClientsPage._topQuartileRevenue) ? ClientsPage._topQuartileRevenue() : 0;
    var jobs = DB.jobs.getAll();
    var invoices = DB.invoices.getAll();
    var quotes = DB.quotes.getAll();
    var nowMs = Date.now();
    // Reuse the same eligibility logic as render — keep this DRY-ish by
    // inlining; the math is small.
    var revByClient = {};
    invoices.forEach(function(i) {
      if (i.status !== 'paid') return;
      var k = i.clientId || (i.clientName || '').toLowerCase();
      if (k) revByClient[k] = (revByClient[k] || 0) + (Number(i.total) || 0);
    });
    var touchesByClient = {};
    function bumpTouch(k, d) { if (!k || !d) return; var t = new Date(d).getTime(); if (isNaN(t)) return; if (!touchesByClient[k] || t > touchesByClient[k]) touchesByClient[k] = t; }
    jobs.forEach(function(j) { bumpTouch(j.clientId || (j.clientName || '').toLowerCase(), j.scheduledDate || j.createdAt); });
    quotes.forEach(function(q) { bumpTouch(q.clientId || (q.clientName || '').toLowerCase(), q.sentAt || q.createdAt); });
    invoices.forEach(function(i) { bumpTouch(i.clientId || (i.clientName || '').toLowerCase(), i.paidDate || i.createdAt); });
    if (typeof CommsLog !== 'undefined' && CommsLog.getAll) {
      clients.forEach(function(c) {
        var comms = CommsLog.getAll(c.id);
        if (comms && comms.length) bumpTouch(c.id, comms[0].date);
      });
    }
    var sendList = clients.filter(function(c) {
      if (!c.id || c.status === 'archived' || c.status === 'inactive') return false;
      if (c.outreachDormant === true) return false; // v781: dormant = never auto-text
      if (snoozes[c.id] && Number(snoozes[c.id]) > nowMs) return false;
      var rev = revByClient[c.id] || revByClient[(c.name || '').toLowerCase()] || 0;
      if (rev < threshold || threshold <= 0) return false;
      var last = touchesByClient[c.id] || touchesByClient[(c.name || '').toLowerCase()];
      if (!last) return false;
      if (Math.floor((nowMs - last) / 86400000) < 90) return false;
      var p = (c.phone || '').replace(/\D/g, '');
      return p.length >= 10;
    });
    if (!sendList.length) { UI.toast('No eligible recipients', 'error'); return; }
    if (!confirm('Send a personalized check-in SMS to ' + sendList.length + ' top-25% client' + (sendList.length === 1 ? '' : 's') + ' who\'ve been quiet 90+ days?\n\nReal SMS to real customers — no un-send. Each gets a 60-day snooze afterward so we don\'t ping them again.')) return;
    var sent = 0, i = 0;
    function next() {
      if (i >= sendList.length) {
        UI.toast('Sent ' + sent + ' check-in SMS');
        loadPage('staleclients');
        return;
      }
      var c = sendList[i++];
      var firstName = (c.name || '').split(' ')[0] || 'there';
      var coName = (typeof CompanyInfo !== 'undefined' && CompanyInfo.get('name')) || 'us';
      var msg = 'Hi ' + firstName + ', it\'s ' + coName + ' — just checking in. It\'s been a while since we worked on your trees. With spring coming, want me to swing by for a free walk-around? No obligation. Reply YES and I\'ll text some times.';
      if (typeof Dialpad !== 'undefined' && Dialpad.sendSMS) {
        Dialpad.sendSMS(c.phone, msg, c.id);
      }
      if (typeof ClientsPage !== 'undefined' && ClientsPage._snoozeOutreach) {
        ClientsPage._snoozeOutreach(c.id, 60, true);
      }
      sent++;
      // 1s stagger so we don't slam Dialpad
      setTimeout(next, 1000);
    }
    next();
  },

  _unsnooze: function(clientId) {
    try {
      var snoozes = JSON.parse(localStorage.getItem('bm-outreach-snooze') || '{}');
      delete snoozes[clientId];
      localStorage.setItem('bm-outreach-snooze', JSON.stringify(snoozes));
      UI.toast('Unsnoozed');
      loadPage('staleclients');
    } catch(e) {}
  }
};
