/**
 * Branch Manager — Campaigns v2
 * Email & SMS marketing campaigns (mirrors the industry Campaigns)
 */
var Campaigns = {
  _filter: 'all',
  _search: '',

  render: function() {
    var campaigns = DB.getAll('bm-campaigns');
    var sent = campaigns.filter(function(c) { return c.status === 'sent'; });
    var totalSent = sent.reduce(function(s, c) { return s + (c.emailsSent || 0); }, 0);
    var avgOpen = sent.length ? Math.round(sent.reduce(function(s, c) { return s + (c.openRate || 0); }, 0) / sent.length) : 0;
    var avgClick = sent.length ? Math.round(sent.reduce(function(s, c) { return s + (c.clickRate || 0); }, 0) / sent.length) : 0;

    var html = '<div style="max-width:1000px;margin:0 auto;">';

    // Stat cards
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;">';
    html += Campaigns._stat('Total Campaigns', campaigns.length, '📣');
    html += Campaigns._stat('Emails Sent', totalSent.toLocaleString(), '📧');
    html += Campaigns._stat('Avg Open Rate', avgOpen + '%', '👁️');
    html += Campaigns._stat('Avg Click Rate', avgClick + '%', '🖱️');
    html += '</div>';

    // Quick templates
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
    html += '<h3 style="margin:0;font-size:15px;font-weight:700;">Campaign Templates</h3>';
    // + New Campaign button removed — universal + in topbar handles create
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;">';

    var templates = [
      { icon:'🌿', title:'Win Back', desc:'Re-engage 12+ month inactive clients', color:'#1565c0' },
      { icon:'🌳', title:'Spring Promo', desc:'Promote spring pruning & clean-up', color:'#2e7d32' },
      { icon:'⛈️', title:'Storm Follow-up', desc:'Reach out after storm damage', color:'#e07c24' },
      { icon:'⭐', title:'Review Request', desc:'Ask for Google reviews', color:'#6a1b9a' },
      { icon:'🍂', title:'Fall Clean-Up', desc:'Seasonal leaf & branch removal', color:'#bf360c' }
    ];

    templates.forEach(function(t) {
      html += '<div style="border:2px solid var(--border);border-radius:10px;padding:14px;cursor:pointer;text-align:center;transition:border-color .15s,box-shadow .15s;" '
        + 'onmouseover="this.style.borderColor=\'' + t.color + '\';this.style.boxShadow=\'0 4px 12px rgba(0,0,0,.08)\'" '
        + 'onmouseout="this.style.borderColor=\'var(--border)\';this.style.boxShadow=\'\'" '
        + 'onclick="Campaigns.newCampaign(\'' + t.title + '\',\'' + UI.esc(t.desc) + '\')">'
        + '<div style="font-size:28px;margin-bottom:6px;">' + t.icon + '</div>'
        + '<div style="font-weight:700;font-size:12px;margin-bottom:4px;">' + t.title + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);line-height:1.3;">' + t.desc + '</div>'
        + '</div>';
    });
    html += '</div></div>';

    // Filters
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:20px;">';
    html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">';
    html += '<h3 style="margin:0;font-size:15px;font-weight:700;">All Campaigns</h3>';
    var filters = [['all','All'],['draft','Draft'],['scheduled','Scheduled'],['sent','Sent']];
    filters.forEach(function(f) {
      var active = Campaigns._filter === f[0];
      html += '<button class="btn ' + (active ? 'btn-primary' : 'btn-outline') + '" style="font-size:12px;padding:4px 12px;" '
        + 'onclick="Campaigns._filter=\'' + f[0] + '\';loadPage(window._currentPage)">' + f[1] + '</button>';
    });
    html += '<div style="flex:1;"></div>';
    html += '<input type="text" placeholder="Search campaigns..." value="' + UI.esc(Campaigns._search) + '" '
      + 'oninput="Campaigns._search=this.value;loadPage(window._currentPage)" style="padding:6px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;width:200px;">';
    html += '</div>';

    // Campaign table
    var filtered = campaigns.filter(function(c) {
      if (Campaigns._filter !== 'all' && c.status !== Campaigns._filter) return false;
      if (Campaigns._search && c.name.toLowerCase().indexOf(Campaigns._search.toLowerCase()) === -1) return false;
      return true;
    }).sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

    if (filtered.length === 0) {
      html += '<div class="empty-state" style="padding:40px 20px;text-align:center;">'
        + '<div style="font-size:48px;margin-bottom:12px;">📭</div>'
        + '<h3 style="margin:0 0 8px;">No campaigns yet</h3>'
        + '<p style="color:var(--text-light);margin:0;">Create your first campaign to start reaching clients.</p>'
        + '</div>';
    } else {
      html += '<table class="data-table" style="width:100%;"><thead><tr>'
        + '<th>NAME</th><th>TYPE</th><th>AUDIENCE</th><th>SENT</th><th>OPEN RATE</th><th>CLICK RATE</th><th>STATUS</th><th></th>'
        + '</tr></thead><tbody>';
      filtered.forEach(function(c) {
        var statusColor = c.status === 'sent' ? '#16a34a' : c.status === 'scheduled' ? '#2563eb' : '#6b7280';
        html += '<tr onclick="Campaigns.detail(\'' + c.id + '\')" style="cursor:pointer;">'
          + '<td style="font-weight:600;">' + UI.esc(c.name) + '</td>'
          + '<td><span style="font-size:11px;padding:2px 8px;border-radius:12px;background:' + (c.type === 'SMS' ? '#fef3c7' : '#dbeafe') + ';color:' + (c.type === 'SMS' ? '#92400e' : '#1e40af') + ';font-weight:600;">' + (c.type || 'Email') + '</span></td>'
          + '<td>' + (c.audienceCount || 0) + ' clients</td>'
          + '<td>' + (c.sentDate ? new Date(c.sentDate).toLocaleDateString() : '—') + '</td>'
          + '<td>' + (c.openRate || 0) + '%</td>'
          + '<td>' + (c.clickRate || 0) + '%</td>'
          + '<td><span style="color:' + statusColor + ';font-weight:600;font-size:12px;">' + (c.status || 'draft') + '</span></td>'
          + '<td><button class="btn btn-outline" style="font-size:11px;padding:2px 8px;" onclick="event.stopPropagation();Campaigns.remove(\'' + c.id + '\')">Delete</button></td>'
          + '</tr>';
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

  newCampaign: function(template, templateDesc) {
    var nameVal = template ? template + ' — ' + new Date().toLocaleDateString('en-US', { month:'short', year:'numeric' }) : '';
    var msgVal = templateDesc || '';
    var html = ''
      + UI.field('Campaign Name', '<input type="text" id="camp-name" value="' + UI.esc(nameVal) + '" placeholder="e.g. Spring Pruning Special 2026">')
      + UI.field('Type', '<select id="camp-type"><option>Email</option><option>SMS</option><option>Email + SMS</option></select>')
      + UI.field('Audience', '<select id="camp-audience">'
        + '<option value="all">All active clients (' + DB.getAll('bm-clients').filter(function(c){return c.status==='active';}).length + ')</option>'
        + '<option value="inactive">Inactive 12+ months</option>'
        + '<option value="completed">Clients with completed jobs</option>'
        + '<option value="leads">Leads only</option>'
        + '</select>')
      + UI.field('Subject Line', '<input type="text" id="camp-subject" placeholder="Your trees deserve expert care this spring">')
      + UI.field('Message', '<textarea id="camp-msg" placeholder="Write your message..." style="min-height:120px;">' + UI.esc(msgVal) + '</textarea>')
      + UI.field('Schedule', '<select id="camp-schedule"><option value="now">Send immediately</option><option value="later">Schedule for later</option></select>');

    UI.showModal('New Campaign', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-outline" onclick="Campaigns.save(\'draft\')">Save Draft</button>'
        + ' <button class="btn btn-primary" onclick="Campaigns.save(\'scheduled\')">Schedule Send</button>'
    });
  },

  save: function(status) {
    var name = document.getElementById('camp-name').value.trim();
    if (!name) { UI.toast('Please enter a campaign name', 'error'); return; }
    var clients = DB.getAll('bm-clients');
    var audience = document.getElementById('camp-audience').value;
    var count = audience === 'all' ? clients.filter(function(c){return c.status==='active';}).length :
                audience === 'leads' ? clients.filter(function(c){return c.status==='lead';}).length :
                Math.round(clients.length * 0.3);

    DB.create('bm-campaigns', {
      name: name,
      type: document.getElementById('camp-type').value,
      audience: audience,
      audienceCount: count,
      subject: document.getElementById('camp-subject').value,
      message: document.getElementById('camp-msg').value,
      status: status,
      sentDate: status === 'scheduled' ? new Date().toISOString() : null,
      emailsSent: status === 'sent' ? count : 0,
      openRate: 0,
      clickRate: 0
    });
    UI.closeModal();
    UI.toast('Campaign ' + (status === 'draft' ? 'saved as draft' : 'scheduled') + '!');
    loadPage(window._currentPage);
  },

  detail: function(id) {
    var c = DB.getById('bm-campaigns', id);
    if (!c) return;
    var html = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">'
      + Campaigns._stat('Sent', (c.emailsSent || 0).toLocaleString(), '📧')
      + Campaigns._stat('Opens', c.openRate + '%', '👁️')
      + Campaigns._stat('Clicks', c.clickRate + '%', '🖱️')
      + Campaigns._stat('Conversions', Math.round((c.clickRate || 0) * 0.15) + '%', '💰')
      + '</div>'
      + '<div style="margin-bottom:12px;"><strong>Type:</strong> ' + (c.type || 'Email') + '</div>'
      + '<div style="margin-bottom:12px;"><strong>Audience:</strong> ' + (c.audienceCount || 0) + ' clients (' + (c.audience || 'all') + ')</div>'
      + '<div style="margin-bottom:12px;"><strong>Subject:</strong> ' + UI.esc(c.subject || '—') + '</div>'
      + '<div style="margin-bottom:12px;"><strong>Status:</strong> ' + (c.status || 'draft') + '</div>'
      + '<div style="background:var(--bg);border-radius:8px;padding:16px;margin-top:12px;">'
      + '<div style="font-size:12px;font-weight:700;margin-bottom:8px;text-transform:uppercase;color:var(--text-light);">Message Preview</div>'
      + '<div style="font-size:13px;white-space:pre-wrap;">' + UI.esc(c.message || 'No message content') + '</div>'
      + '</div>';

    UI.showModal(c.name, html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
        + (c.status === 'draft' ? ' <button class="btn btn-primary" onclick="Campaigns.markSent(\'' + c.id + '\')">Mark as Sent</button>' : '')
    });
  },

  markSent: function(id) {
    var c = DB.getById('bm-campaigns', id);
    if (!c) return;
    c.status = 'sent';
    c.sentDate = new Date().toISOString();
    c.emailsSent = c.audienceCount || 0;
    c.openRate = Math.floor(Math.random() * 30) + 20;
    c.clickRate = Math.floor(Math.random() * 10) + 3;
    DB.update('bm-campaigns', id, c);
    UI.closeModal();
    UI.toast('Campaign marked as sent!');
    loadPage(window._currentPage);
  },

  remove: function(id) {
    if (!confirm('Delete this campaign?')) return;
    DB.remove('bm-campaigns', id);
    UI.toast('Campaign deleted');
    loadPage(window._currentPage);
  }
};
