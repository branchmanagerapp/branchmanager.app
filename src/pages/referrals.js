/**
 * Branch Manager — Referrals v2
 * Track referral sources, manage rewards, generate referral links
 */
var Referrals = {
  _filter: 'all',
  _search: '',

  _co: function() {
    return {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      website: CompanyInfo.get('website')
    };
  },

  render: function() {
    var referrals = DB.getAll('bm-referrals');
    var clients = DB.clients ? DB.clients.getAll() : DB.getAll('bm-clients');
    var converted = referrals.filter(function(r) { return r.status === 'converted'; });
    var revenue = converted.reduce(function(s, r) { return s + (r.value || 0); }, 0);
    var convRate = referrals.length ? Math.round((converted.length / referrals.length) * 100) : 0;

    // Also count clients tagged with referral source
    var referredClients = clients.filter(function(c) { return c.source && c.source.toLowerCase().indexOf('referral') !== -1; });

    // Find top referrer
    var referrerCounts = {};
    referrals.forEach(function(r) {
      var name = r.referrerName || 'Unknown';
      referrerCounts[name] = (referrerCounts[name] || 0) + 1;
    });
    var topReferrer = '—';
    var topCount = 0;
    Object.keys(referrerCounts).forEach(function(k) {
      if (referrerCounts[k] > topCount) { topCount = referrerCounts[k]; topReferrer = k; }
    });

    var html = '<div style="max-width:1000px;margin:0 auto;">';

    // Stat cards
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px;">';
    html += Referrals._stat('Total Referrals', referrals.length + referredClients.length, '🤝');
    html += Referrals._stat('Conversion Rate', convRate + '%', '📈');
    html += Referrals._stat('Revenue', '$' + revenue.toLocaleString(), '💰');
    html += Referrals._stat('Top Referrer', topReferrer, '⭐');
    html += '</div>';

    // Referral link card
    html += '<div style="background:linear-gradient(135deg,#065f46,#16a34a);border-radius:12px;padding:24px;margin-bottom:20px;color:#fff;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;">'
      + '<div>'
      + '<h3 style="margin:0 0 6px;font-size:16px;">Share Your Referral Link</h3>'
      + '<p style="margin:0;font-size:13px;opacity:.85;">Send this to happy clients — when they refer someone, you both benefit.</p>'
      + '</div>'
      + '<button class="btn" style="background:#fff;color:#065f46;font-weight:700;" onclick="Referrals.copyLink()">Copy Link</button>'
      + '</div>'
      + '<div style="margin-top:12px;background:rgba(255,255,255,.15);border-radius:8px;padding:10px;font-family:monospace;font-size:12px;" id="ref-link">'
      + 'https://peekskilltree.com/refer?src=client'
      + '</div></div>';

    // Actions row
    html += '<div style="display:flex;gap:12px;margin-bottom:20px;">';
    html += '<button class="btn btn-primary" onclick="Referrals.newReferral()">+ New Referral</button>';
    html += '<button class="btn btn-outline" onclick="Referrals.sendRequest()">📤 Send Referral Request</button>';
    html += '<button class="btn btn-outline" onclick="Referrals.programSettings()">⚙️ Program Settings</button>';
    html += '</div>';

    // Filters + table
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:20px;">';
    html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">';
    html += '<h3 style="margin:0;font-size:15px;font-weight:700;">All Referrals</h3>';
    var filters = [['all','All'],['pending','Pending'],['contacted','Contacted'],['converted','Converted'],['expired','Expired']];
    filters.forEach(function(f) {
      var active = Referrals._filter === f[0];
      html += '<button class="btn ' + (active ? 'btn-primary' : 'btn-outline') + '" style="font-size:12px;padding:4px 12px;" '
        + 'onclick="Referrals._filter=\'' + f[0] + '\';loadPage(window._currentPage)">' + f[1] + '</button>';
    });
    html += '<div style="flex:1;"></div>';
    html += '<input type="text" placeholder="Search..." value="' + UI.esc(Referrals._search) + '" '
      + 'oninput="Referrals._search=this.value;loadPage(window._currentPage)" style="padding:6px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;width:180px;">';
    html += '</div>';

    var filtered = referrals.filter(function(r) {
      if (Referrals._filter !== 'all' && r.status !== Referrals._filter) return false;
      if (Referrals._search) {
        var s = Referrals._search.toLowerCase();
        return (r.referrerName || '').toLowerCase().indexOf(s) !== -1 || (r.referredName || '').toLowerCase().indexOf(s) !== -1;
      }
      return true;
    }).sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    if (filtered.length === 0) {
      html += '<div style="text-align:center;padding:40px;color:var(--text-light);">'
        + '<div style="font-size:48px;margin-bottom:12px;">🤝</div>'
        + '<h3>No referrals yet</h3><p>Start your referral program to grow through word of mouth.</p></div>';
    } else {
      html += '<table class="data-table" style="width:100%;"><thead><tr>'
        + '<th>REFERRER</th><th>REFERRED CLIENT</th><th>DATE</th><th>VALUE</th><th>REWARD</th><th>STATUS</th><th></th>'
        + '</tr></thead><tbody>';
      filtered.forEach(function(r) {
        var statusColors = { pending:'#f59e0b', contacted:'#2563eb', converted:'#16a34a', expired:'#6b7280' };
        html += '<tr>'
          + '<td style="font-weight:600;">' + UI.esc(r.referrerName || '—') + '</td>'
          + '<td>' + UI.esc(r.referredName || '—') + '</td>'
          + '<td>' + (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—') + '</td>'
          + '<td>' + (r.value ? '$' + r.value.toLocaleString() : '—') + '</td>'
          + '<td>' + (r.rewardAmount ? '$' + r.rewardAmount : '—') + '</td>'
          + '<td><span style="color:' + (statusColors[r.status] || '#6b7280') + ';font-weight:600;font-size:12px;">' + (r.status || 'pending') + '</span></td>'
          + '<td style="display:flex;gap:4px;">'
          + '<button class="btn btn-outline" style="font-size:11px;padding:2px 8px;" onclick="Referrals.edit(\'' + r.id + '\')">Edit</button>'
          + '<button class="btn btn-outline" style="font-size:11px;padding:2px 6px;" onclick="Referrals.remove(\'' + r.id + '\')">×</button>'
          + '</td></tr>';
      });
      html += '</tbody></table>';
    }

    html += '</div></div>';
    return html;
  },

  _stat: function(label, value, icon) {
    return '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;text-align:center;">'
      + '<div style="font-size:24px;margin-bottom:4px;">' + icon + '</div>'
      + '<div style="font-size:22px;font-weight:800;">' + value + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;">' + label + '</div>'
      + '</div>';
  },

  newReferral: function() {
    var clients = DB.clients ? DB.clients.getAll() : DB.getAll('bm-clients');
    var opts = '<option value="">— Select client —</option>';
    clients.forEach(function(c) { opts += '<option value="' + UI.esc(c.name) + '">' + UI.esc(c.name) + '</option>'; });

    var html = UI.field('Referrer (who referred)', '<select id="ref-referrer">' + opts + '</select>')
      + UI.field('Referred Client Name', '<input type="text" id="ref-name" placeholder="New client name">')
      + UI.field('Phone', '<input type="text" id="ref-phone" placeholder="(914) 555-0123">')
      + UI.field('Email', '<input type="email" id="ref-email" placeholder="email@example.com">')
      + UI.field('Service Needed', '<input type="text" id="ref-service" placeholder="e.g. Tree removal, pruning">')
      + UI.field('Estimated Value', '<input type="number" id="ref-value" placeholder="0">')
      + UI.field('Notes', '<textarea id="ref-notes" placeholder="Any additional notes..."></textarea>');

    UI.showModal('New Referral', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="Referrals.save()">Save Referral</button>'
    });
  },

  save: function() {
    var name = document.getElementById('ref-name').value.trim();
    if (!name) { UI.toast('Please enter the referred client name', 'error'); return; }

    var progSettings = JSON.parse(localStorage.getItem('bm-referral-program') || '{}');
    DB.create('bm-referrals', {
      referrerName: document.getElementById('ref-referrer').value,
      referredName: name,
      phone: document.getElementById('ref-phone').value,
      email: document.getElementById('ref-email').value,
      service: document.getElementById('ref-service').value,
      value: parseFloat(document.getElementById('ref-value').value) || 0,
      rewardAmount: progSettings.rewardAmount || 50,
      rewardType: progSettings.rewardType || 'credit',
      status: 'pending',
      notes: document.getElementById('ref-notes').value
    });
    UI.closeModal();
    UI.toast('Referral saved!');
    loadPage(window._currentPage);
  },

  edit: function(id) {
    var r = DB.getById('bm-referrals', id);
    if (!r) return;
    var html = UI.field('Referrer', '<input type="text" id="ref-e-referrer" value="' + UI.esc(r.referrerName || '') + '">')
      + UI.field('Referred Client', '<input type="text" id="ref-e-name" value="' + UI.esc(r.referredName || '') + '">')
      + UI.field('Value ($)', '<input type="number" id="ref-e-value" value="' + (r.value || 0) + '">')
      + UI.field('Reward ($)', '<input type="number" id="ref-e-reward" value="' + (r.rewardAmount || 0) + '">')
      + UI.field('Status', '<select id="ref-e-status">'
        + '<option' + (r.status==='pending'?' selected':'') + '>pending</option>'
        + '<option' + (r.status==='contacted'?' selected':'') + '>contacted</option>'
        + '<option' + (r.status==='converted'?' selected':'') + '>converted</option>'
        + '<option' + (r.status==='expired'?' selected':'') + '>expired</option>'
        + '</select>')
      + UI.field('Notes', '<textarea id="ref-e-notes">' + UI.esc(r.notes || '') + '</textarea>');

    UI.showModal('Edit Referral', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="Referrals.update(\'' + id + '\')">Save</button>'
    });
  },

  update: function(id) {
    DB.update('bm-referrals', id, {
      referrerName: document.getElementById('ref-e-referrer').value,
      referredName: document.getElementById('ref-e-name').value,
      value: parseFloat(document.getElementById('ref-e-value').value) || 0,
      rewardAmount: parseFloat(document.getElementById('ref-e-reward').value) || 0,
      status: document.getElementById('ref-e-status').value,
      notes: document.getElementById('ref-e-notes').value
    });
    UI.closeModal();
    UI.toast('Referral updated');
    loadPage(window._currentPage);
  },

  remove: function(id) {
    if (!confirm('Delete this referral?')) return;
    DB.remove('bm-referrals', id);
    UI.toast('Referral deleted');
    loadPage(window._currentPage);
  },

  copyLink: function() {
    var link = document.getElementById('ref-link');
    if (link) {
      navigator.clipboard.writeText(link.textContent).then(function() {
        UI.toast('Referral link copied! 📋');
      });
    }
  },

  sendRequest: function() {
    var co = Referrals._co();
    var html = '<p style="margin:0 0 16px;font-size:13px;color:var(--text-light);">Send a referral request to your best clients asking them to refer friends and family.</p>'
      + UI.field('Send to', '<select id="ref-send-to">'
        + '<option value="recent">Recent clients with completed jobs</option>'
        + '<option value="all">All active clients with email</option>'
        + '<option value="top">Top 10 clients by revenue</option>'
        + '</select>')
      + UI.field('Message', '<textarea id="ref-send-msg" style="min-height:100px;">Hi! Thanks for choosing ' + UI.esc(co.name) + '. If you know anyone who needs tree care, we\'d love a referral. As a thank you, you\'ll receive a $50 credit on your next service! — Doug, ' + UI.esc(co.name) + '</textarea>');

    UI.showModal('Send Referral Request', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="UI.toast(\'Referral requests sent! 📧\');UI.closeModal();">Send via SMS</button>'
        + ' <button class="btn btn-primary" style="background:#1565c0;" onclick="UI.toast(\'Referral requests sent! 📧\');UI.closeModal();">Send via Email</button>'
    });
  },

  programSettings: function() {
    var settings = JSON.parse(localStorage.getItem('bm-referral-program') || '{}');
    var html = UI.field('Reward Amount ($)', '<input type="number" id="prog-amount" value="' + (settings.rewardAmount || 50) + '">')
      + UI.field('Reward Type', '<select id="prog-type">'
        + '<option' + (settings.rewardType === 'credit' ? ' selected' : '') + ' value="credit">Account Credit</option>'
        + '<option' + (settings.rewardType === 'cash' ? ' selected' : '') + ' value="cash">Cash</option>'
        + '<option' + (settings.rewardType === 'discount' ? ' selected' : '') + ' value="discount">% Discount on Next Job</option>'
        + '</select>')
      + UI.field('Expiry (days)', '<input type="number" id="prog-expiry" value="' + (settings.expiryDays || 90) + '">')
      + UI.field('Terms', '<textarea id="prog-terms" style="min-height:80px;">' + UI.esc(settings.terms || 'Referral reward is issued after the referred client completes their first paid job. Rewards expire after 90 days.') + '</textarea>');

    UI.showModal('Referral Program Settings', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="Referrals.saveProgram()">Save Settings</button>'
    });
  },

  saveProgram: function() {
    var settings = {
      rewardAmount: parseFloat(document.getElementById('prog-amount').value) || 50,
      rewardType: document.getElementById('prog-type').value,
      expiryDays: parseInt(document.getElementById('prog-expiry').value) || 90,
      terms: document.getElementById('prog-terms').value
    };
    localStorage.setItem('bm-referral-program', JSON.stringify(settings));
    UI.closeModal();
    UI.toast('Referral program settings saved!');
  }
};
