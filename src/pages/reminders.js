/**
 * Branch Manager — Business Reminders / Admin
 * Track licenses, insurance, certs, and other expiring items.
 * Shows a popup on login when anything is due soon or expired.
 */
var Reminders = {
  _key: 'bm-reminders',

  // Default seed data — Second Nature's actual licenses + insurance types
  _defaults: [
    // Licenses
    { id: 'lic-wc', category: 'license', name: 'Arborist License — Westchester County', number: 'WC-32079', expiry: '', notes: 'Westchester County arborist license', renewalUrl: '', alertDays: 60 },
    { id: 'lic-pc', category: 'license', name: 'Arborist License — Putnam County', number: 'PC-50644', expiry: '', notes: 'Putnam County arborist license', renewalUrl: '', alertDays: 60 },
    // Insurance
    { id: 'ins-gl', category: 'insurance', name: 'General Liability Insurance', number: '', expiry: '', notes: 'Required for all commercial jobs', renewalUrl: '', alertDays: 30 },
    { id: 'ins-wc', category: 'insurance', name: 'Workers\' Compensation Insurance', number: '', expiry: '', notes: 'Required for all employees', renewalUrl: '', alertDays: 30 },
    { id: 'ins-auto', category: 'insurance', name: 'Commercial Auto Insurance', number: '', expiry: '', notes: 'Covers all company vehicles', renewalUrl: '', alertDays: 30 },
    { id: 'ins-equip', category: 'insurance', name: 'Inland Marine / Equipment Insurance', number: '', expiry: '', notes: 'Covers equipment and tools', renewalUrl: '', alertDays: 30 },
    // Registration
    { id: 'reg-biz', category: 'registration', name: 'Business Registration / LLC', number: '', expiry: '', notes: 'State business entity renewal', renewalUrl: '', alertDays: 60 },
  ],

  getAll: function() {
    var stored = localStorage.getItem(Reminders._key);
    if (!stored) {
      var defaults = JSON.parse(JSON.stringify(Reminders._defaults));
      localStorage.setItem(Reminders._key, JSON.stringify(defaults));
      return defaults;
    }
    return JSON.parse(stored);
  },

  save: function(reminder) {
    var all = Reminders.getAll();
    var idx = all.findIndex(function(r) { return r.id === reminder.id; });
    if (idx >= 0) { all[idx] = reminder; } else { all.push(reminder); }
    localStorage.setItem(Reminders._key, JSON.stringify(all));
  },

  remove: function(id) {
    var all = Reminders.getAll().filter(function(r) { return r.id !== id; });
    localStorage.setItem(Reminders._key, JSON.stringify(all));
  },

  // Return items that are expired or expiring within their alertDays window
  getAlerts: function() {
    var now = new Date();
    var alerts = [];
    Reminders.getAll().forEach(function(r) {
      if (!r.expiry) return; // no date set, skip
      var exp = new Date(r.expiry + 'T00:00:00');
      var daysUntil = Math.ceil((exp - now) / 86400000);
      var alertDays = r.alertDays || 30;
      if (daysUntil < 0) {
        alerts.push({ reminder: r, daysUntil: daysUntil, status: 'expired' });
      } else if (daysUntil <= alertDays) {
        alerts.push({ reminder: r, daysUntil: daysUntil, status: 'expiring' });
      }
    });
    // Sort: expired first, then soonest expiring
    alerts.sort(function(a, b) { return a.daysUntil - b.daysUntil; });
    return alerts;
  },

  // Show the login popup if there are alerts (once per session)
  checkLoginPopup: function() {
    // Only for owners
    if (typeof Auth !== 'undefined' && Auth.role !== 'owner') return;
    var sessionKey = 'bm-reminder-popup-' + new Date().toISOString().split('T')[0];
    if (localStorage.getItem(sessionKey)) return; // already shown today
    var alerts = Reminders.getAlerts();
    if (alerts.length === 0) return;
    localStorage.setItem(sessionKey, '1');
    Reminders._showPopup(alerts);
  },

  _showPopup: function(alerts) {
    var expired = alerts.filter(function(a) { return a.status === 'expired'; });
    var expiring = alerts.filter(function(a) { return a.status === 'expiring'; });

    var html = '';
    if (expired.length > 0) {
      html += '<div style="background:#fde8e8;border:1px solid #f5c6cb;border-radius:10px;padding:14px 16px;margin-bottom:12px;">'
        + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#842029;margin-bottom:8px;">🚨 Expired — Action Required</div>';
      expired.forEach(function(a) {
        var daysAgo = Math.abs(a.daysUntil);
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(220,53,69,.15);">'
          + '<div><div style="font-weight:600;font-size:13px;color:#842029;">' + UI.esc(a.reminder.name) + '</div>'
          + (a.reminder.number ? '<div style="font-size:12px;color:#6b2430;"># ' + UI.esc(a.reminder.number) + '</div>' : '')
          + '</div>'
          + '<div style="text-align:right;flex-shrink:0;margin-left:12px;">'
          + '<div style="font-size:12px;font-weight:700;color:#842029;">Expired ' + daysAgo + ' day' + (daysAgo !== 1 ? 's' : '') + ' ago</div>'
          + '<div style="font-size:11px;color:#6b2430;">' + UI.dateShort(a.reminder.expiry) + '</div>'
          + '</div></div>';
      });
      html += '</div>';
    }
    if (expiring.length > 0) {
      html += '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:10px;padding:14px 16px;">'
        + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#664d03;margin-bottom:8px;">⏰ Expiring Soon</div>';
      expiring.forEach(function(a) {
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,193,7,.2);">'
          + '<div><div style="font-weight:600;font-size:13px;color:#664d03;">' + UI.esc(a.reminder.name) + '</div>'
          + (a.reminder.number ? '<div style="font-size:12px;color:#664d03;"># ' + UI.esc(a.reminder.number) + '</div>' : '')
          + '</div>'
          + '<div style="text-align:right;flex-shrink:0;margin-left:12px;">'
          + '<div style="font-size:12px;font-weight:700;color:#664d03;">' + (a.daysUntil === 0 ? 'Expires today' : 'In ' + a.daysUntil + ' day' + (a.daysUntil !== 1 ? 's' : '')) + '</div>'
          + '<div style="font-size:11px;color:#664d03;">' + UI.dateShort(a.reminder.expiry) + '</div>'
          + '</div></div>';
      });
      html += '</div>';
    }

    UI.showModal('⚠️ Compliance Reminders', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Dismiss</button>'
        + ' <button class="btn btn-primary" onclick="UI.closeModal();loadPage(\'reminders\')">Manage Reminders →</button>'
    });
  },

  // ── Page renderer ──
  render: function() {
    var all = Reminders.getAll();
    var now = new Date();
    var today = now.toISOString().split('T')[0];
    var alerts = Reminders.getAlerts();

    var expired = alerts.filter(function(a) { return a.status === 'expired'; }).length;
    var expiring = alerts.filter(function(a) { return a.status === 'expiring'; }).length;
    var upToDate = all.filter(function(r) { return r.expiry && r.expiry >= today; }).length - expiring;
    var noDate = all.filter(function(r) { return !r.expiry; }).length;

    var html = '<div style="display:flex;justify-content:flex-end;margin-bottom:12px;">'
      + '<button onclick="Reminders.showForm()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;">+ Add Reminder</button>'
      + '</div>';

    html += '<div class="stat-grid">'
      + (expired > 0 ? '<div class="stat-card" style="border-top:3px solid #dc3545;" onclick="Reminders._filterTo(\'expired\')">'
          + '<div class="stat-label">🚨 Expired</div>'
          + '<div class="stat-value" style="color:#dc3545;">' + expired + '</div>'
          + '<div class="stat-sub">Need immediate action</div></div>'
        : '<div class="stat-card" style="border-top:3px solid #00836c;">'
          + '<div class="stat-label">🚨 Expired</div>'
          + '<div class="stat-value" style="color:#00836c;">0</div>'
          + '<div class="stat-sub">All clear</div></div>')
      + (expiring > 0 ? '<div class="stat-card" style="border-top:3px solid #ffc107;" onclick="Reminders._filterTo(\'expiring\')">'
          + '<div class="stat-label">⏰ Expiring Soon</div>'
          + '<div class="stat-value" style="color:#e6a817;">' + expiring + '</div>'
          + '<div class="stat-sub">Review upcoming renewals</div></div>'
        : '<div class="stat-card" style="border-top:3px solid #00836c;">'
          + '<div class="stat-label">⏰ Expiring Soon</div>'
          + '<div class="stat-value" style="color:#00836c;">0</div>'
          + '<div class="stat-sub">No upcoming renewals</div></div>')
      + '<div class="stat-card" style="border-top:3px solid #00836c;">'
        + '<div class="stat-label">✓ Current</div>'
        + '<div class="stat-value" style="color:#00836c;">' + upToDate + '</div>'
        + '<div class="stat-sub">Valid & up to date</div></div>'
      + '<div class="stat-card">'
        + '<div class="stat-label">📋 No Date Set</div>'
        + '<div class="stat-value">' + noDate + '</div>'
        + '<div class="stat-sub">Add expiry dates</div></div>'
      + '</div>';

    // Categories
    var categories = ['license', 'insurance', 'registration', 'other'];
    var catLabels = { license: '🪪 Licenses', insurance: '🛡️ Insurance', registration: '📄 Registrations', other: '📌 Other' };

    categories.forEach(function(cat) {
      var items = all.filter(function(r) { return r.category === cat; });
      if (items.length === 0) return;

      html += '<div style="background:var(--white);border-radius:12px;border:1px solid var(--border);overflow:hidden;margin-bottom:16px;">'
        + '<div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">'
        + '<h3 style="font-size:15px;font-weight:700;margin:0;">' + catLabels[cat] + '</h3>'
        + '<button class="btn btn-outline" style="font-size:12px;padding:5px 12px;" onclick="Reminders.showForm(\'' + cat + '\')">+ Add</button>'
        + '</div>'
        + '<table class="data-table"><thead><tr>'
        + '<th>Name</th><th>Number / ID</th><th>Expires</th><th>Status</th><th>Alert</th><th style="width:80px;"></th>'
        + '</tr></thead><tbody>';

      items.forEach(function(r) {
        var statusHtml, expiryHtml;
        if (!r.expiry) {
          statusHtml = '<span style="font-size:12px;color:var(--text-light);">No date</span>';
          expiryHtml = '<span style="color:var(--text-light);">—</span>';
        } else {
          var exp = new Date(r.expiry + 'T00:00:00');
          var daysUntil = Math.ceil((exp - now) / 86400000);
          expiryHtml = UI.dateShort(r.expiry);
          if (daysUntil < 0) {
            statusHtml = '<span style="display:inline-block;padding:2px 10px;background:#fde8e8;color:#842029;border-radius:10px;font-size:11px;font-weight:700;">🚨 Expired ' + Math.abs(daysUntil) + 'd ago</span>';
          } else if (daysUntil === 0) {
            statusHtml = '<span style="display:inline-block;padding:2px 10px;background:#fff3cd;color:#664d03;border-radius:10px;font-size:11px;font-weight:700;">⚠️ Expires Today</span>';
          } else if (daysUntil <= (r.alertDays || 30)) {
            statusHtml = '<span style="display:inline-block;padding:2px 10px;background:#fff3cd;color:#664d03;border-radius:10px;font-size:11px;font-weight:700;">⏰ ' + daysUntil + 'd left</span>';
          } else {
            statusHtml = '<span style="display:inline-block;padding:2px 10px;background:#e6f9f2;color:#00836c;border-radius:10px;font-size:11px;font-weight:700;">✓ Valid</span>';
          }
        }

        var rowStatus = !r.expiry ? 'none' : (function() { var exp = new Date(r.expiry + 'T00:00:00'); var d = Math.ceil((exp - now) / 86400000); return d < 0 ? 'expired' : d <= (r.alertDays || 30) ? 'expiring' : 'valid'; })();
        html += '<tr data-status="' + rowStatus + '">'
          + '<td><strong>' + UI.esc(r.name) + '</strong>'
          + (r.notes ? '<div style="font-size:12px;color:var(--text-light);">' + UI.esc(r.notes) + '</div>' : '')
          + '</td>'
          + '<td style="font-size:13px;font-family:monospace;">' + UI.esc(r.number || '—') + '</td>'
          + '<td style="font-weight:' + (r.expiry ? '600' : '400') + ';">' + expiryHtml + '</td>'
          + '<td>' + statusHtml + '</td>'
          + '<td style="font-size:12px;color:var(--text-light);">' + (r.alertDays || 30) + ' days</td>'
          + '<td style="white-space:nowrap;">'
          + '<button onclick="Reminders.showForm(null,\'' + r.id + '\')" style="background:none;border:none;cursor:pointer;font-size:13px;color:var(--accent);font-weight:600;padding:4px 6px;">Edit</button>'
          + '<button onclick="Reminders._confirmRemove(\'' + r.id + '\')" style="background:none;border:none;cursor:pointer;font-size:13px;color:var(--red);padding:4px 6px;">✕</button>'
          + '</td>'
          + '</tr>';
      });

      html += '</tbody></table></div>';
    });

    // Add buttons for any missing categories
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
    categories.forEach(function(cat) {
      html += '<button class="btn btn-outline" style="font-size:12px;" onclick="Reminders.showForm(\'' + cat + '\')">'
        + catLabels[cat] + ' — Add New</button>';
    });
    html += '</div>';

    return html;
  },

  showForm: function(defaultCat, reminderId) {
    var r = reminderId ? Reminders.getAll().find(function(x) { return x.id === reminderId; }) : {};
    if (!r) r = {};
    var title = reminderId ? 'Edit Reminder' : 'Add Reminder';

    var html = '<form id="reminder-form" onsubmit="Reminders.saveForm(event,\'' + (reminderId || '') + '\')">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div class="form-group" style="grid-column:1/-1;"><label>Name *</label>'
      + '<input type="text" id="rm-name" value="' + UI.esc(r.name || '') + '" placeholder="e.g., General Liability Insurance" required style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div class="form-group"><label>Category</label>'
      + '<select id="rm-category" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + ['license','insurance','registration','other'].map(function(c) {
          var labels = { license:'License', insurance:'Insurance', registration:'Registration', other:'Other' };
          return '<option value="' + c + '"' + ((r.category || defaultCat) === c ? ' selected' : '') + '>' + labels[c] + '</option>';
        }).join('')
      + '</select></div>'
      + '<div class="form-group"><label>Policy / License #</label>'
      + '<input type="text" id="rm-number" value="' + UI.esc(r.number || '') + '" placeholder="e.g., WC-32079" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div class="form-group"><label>Expiration Date *</label>'
      + '<input type="date" id="rm-expiry" value="' + (r.expiry || '') + '" required style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div class="form-group"><label>Alert Me (days before)</label>'
      + '<select id="rm-alert" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + [7, 14, 30, 60, 90].map(function(d) { return '<option value="' + d + '"' + ((r.alertDays || 30) === d ? ' selected' : '') + '>' + d + ' days before</option>'; }).join('')
      + '</select></div>'
      + '<div class="form-group" style="grid-column:1/-1;"><label>Notes</label>'
      + '<input type="text" id="rm-notes" value="' + UI.esc(r.notes || '') + '" placeholder="Optional notes" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '</div></form>';

    UI.showModal(title, html, {
      footer: (reminderId ? '<button class="btn btn-danger" style="margin-right:auto;" onclick="Reminders._confirmRemove(\'' + reminderId + '\')">Delete</button>' : '')
        + '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="document.getElementById(\'reminder-form\').requestSubmit()">Save</button>'
    });
  },

  saveForm: function(e, reminderId) {
    e.preventDefault();
    var reminder = {
      id: reminderId || ('rm-' + Date.now().toString(36)),
      category: document.getElementById('rm-category').value,
      name: document.getElementById('rm-name').value.trim(),
      number: document.getElementById('rm-number').value.trim(),
      expiry: document.getElementById('rm-expiry').value,
      alertDays: parseInt(document.getElementById('rm-alert').value),
      notes: document.getElementById('rm-notes').value.trim()
    };
    if (!reminder.name) { UI.toast('Name is required', 'error'); return; }
    Reminders.save(reminder);
    UI.toast(reminderId ? 'Reminder updated' : 'Reminder added');
    UI.closeModal();
    loadPage('reminders');
  },

  _confirmRemove: function(id) {
    UI.confirm('Delete this reminder?', function() {
      Reminders.remove(id);
      UI.toast('Reminder removed');
      UI.closeModal();
      loadPage('reminders');
    });
  },

  _filterTo: function(status) {
    // Highlight rows matching this status by scrolling to the first match
    var rows = document.querySelectorAll('#pageContent tr[data-status]');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].dataset.status === status) {
        rows[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
        rows[i].style.background = 'rgba(220,53,69,0.08)';
        setTimeout(function(r) { r.style.background = ''; }, 2000, rows[i]);
        break;
      }
    }
    // Fallback: scroll to the list section
    var table = document.querySelector('#pageContent .data-table');
    if (table && !rows.length) table.scrollIntoView({ behavior: 'smooth' });
  }
};
