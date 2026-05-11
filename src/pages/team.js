/**
 * Branch Manager — Team / Crew profile module
 * v741: standalone Team page tab dropped (was redundant with Payroll grid).
 * This module remains because the Payroll grid uses TeamPage.getMembers /
 * showDetail / showForm / saveMember / _createLogin for crew CRUD, profile
 * view, and login provisioning. The `render()` method is no longer wired
 * to a tab; it's kept as a safety fallback for legacy deep links into the
 * unused "team" route (which now just redirects to Payroll).
 */
var TeamPage = {
  render: function() {
    var members = TeamPage.getMembers();

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:14px;font-size:13px;color:var(--text-light);">'
      + 'The dedicated Team tab moved into the Payroll grid — click any employee row there to open their profile.'
      + '</div>';

    html += '<div class="stat-grid">'
      + UI.statCard('Team Size', members.filter(function(m){return m.active;}).length.toString(), 'Active members', '', '')
      + UI.statCard('Hours This Week', TeamPage.weekHours().toFixed(1), 'All members', '', '')
      + '</div>';

    // Team table
    html += '<div style="background:var(--white);border-radius:12px;border:1px solid var(--border);overflow:hidden;">'
      + '<table class="data-table"><thead><tr>'
      + '<th>Name</th><th>Role</th><th>Phone</th><th>Hours (Week)</th><th>Status</th>'
      + '</tr></thead><tbody>';

    if (members.length === 0) {
      html += '<tr><td colspan="6">' + UI.emptyState('👷', 'No team members', 'Add your crew to start tracking time.', '+ Add Member', 'TeamPage.showForm()') + '</td></tr>';
    } else {
      members.forEach(function(m) {
        var weekHrs = TeamPage.memberWeekHours(m.name);
        html += '<tr onclick="TeamPage.showDetail(\'' + m.id + '\')">'
          + '<td><strong>' + m.name + '</strong></td>'
          + '<td>' + UI.statusBadge(m.role) + '</td>'
          + '<td>' + UI.phone(m.phone) + '</td>'
          + '<td style="font-weight:600;">' + weekHrs.toFixed(1) + ' hrs</td>'
          + '<td>' + (m.active ? '<span style="color:var(--green-dark);">Active</span>' : '<span style="color:var(--text-light);">Inactive</span>') + '</td>'
          + '</tr>';
      });
    }
    html += '</tbody></table></div>';

    return html;
  },

  _certLabel: function(type) {
    var labels = {
      'isa_arborist': 'ISA Certified Arborist',
      'isa_bcma': 'ISA Board Certified Master Arborist',
      'isa_mu': 'ISA Municipal Specialist',
      'isa_uu': 'ISA Utility Specialist',
      'tcia': 'TCIA Accredited',
      'other': 'Certified'
    };
    return labels[type] || type || 'Certified';
  },

  _certBadge: function(m) {
    if (!m.isaCertNumber) {
      return '<span style="font-size:12px;color:var(--text-light);">—</span>';
    }
    var now = new Date().toISOString().split('T')[0];
    var in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    var isExpired = m.isaCertExpiry && m.isaCertExpiry < now;
    var isExpiringSoon = !isExpired && m.isaCertExpiry && m.isaCertExpiry <= in30;

    var label = TeamPage._certLabel(m.isaCertType);
    var shortLabel = label.replace('ISA ', '').replace('Board Certified ', '');
    if (isExpired) {
      return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:#fde8e8;color:#842029;border-radius:10px;font-size:11px;font-weight:600;">🚨 ' + shortLabel + ' — Expired</span>';
    } else if (isExpiringSoon) {
      return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:#fff3cd;color:#664d03;border-radius:10px;font-size:11px;font-weight:600;">⏰ ' + shortLabel + ' — Expiring Soon</span>';
    } else {
      return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:#e6f9f2;color:#00836c;border-radius:10px;font-size:11px;font-weight:600;">✓ ' + shortLabel + '</span>';
    }
  },

  getMembers: function() {
    var stored = JSON.parse(localStorage.getItem('bm-team') || '[]');
    if (stored.length === 0) {
      stored = [
        { id: 'owner', name: BM_CONFIG.ownerName, role: 'owner', phone: BM_CONFIG.phone, email: BM_CONFIG.email, active: true },
        { id: 'ryan', name: 'Ryan Knapp', role: 'crew_lead', phone: '', email: '', active: true },
        { id: 'anthony', name: 'Anthony Turner', role: 'crew_member', phone: '', email: '', active: true },
        { id: 'catherine', name: 'Catherine Conway', role: 'crew_member', phone: '', email: '', active: true }
      ];
      localStorage.setItem('bm-team', JSON.stringify(stored));
    }
    return stored;
  },

  saveMember: function(member) {
    // Write to localStorage + kick Supabase sync via DB.team.
    // Defensive: the seed members (ryan, anthony, catherine, owner) were historically
    // written straight to localStorage without going through DB.create — so
    // DB.team.update(id, …) might return null even though they're listed by getMembers().
    // Fall back to localStorage merge in that case so edits stick.
    try {
      if (typeof DB !== 'undefined' && DB.team) {
        var existing = DB.team.getById(member.id);
        if (existing) {
          var res = DB.team.update(member.id, member);
          if (res) return res;
        } else {
          var created = DB.team.create(member);
          if (created) return created;
        }
      }
    } catch(e) { console.warn('DB.team write failed, falling back to localStorage:', e); }

    // Fallback / legacy path
    var members = [];
    try { members = JSON.parse(localStorage.getItem('bm-team') || '[]'); } catch(e){}
    var idx = members.findIndex(function(m) { return m.id === member.id; });
    if (idx >= 0) members[idx] = Object.assign({}, members[idx], member);
    else { member.id = member.id || Date.now().toString(36); members.push(member); }
    localStorage.setItem('bm-team', JSON.stringify(members));
    return member;
  },

  removeMember: function(id) {
    if (typeof DB !== 'undefined' && DB.team) {
      DB.team.remove(id);
    } else {
      var members = TeamPage.getMembers().filter(function(m) { return m.id !== id; });
      localStorage.setItem('bm-team', JSON.stringify(members));
    }
  },

  weekHours: function() {
    var now = new Date();
    var weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    var startStr = weekStart.toISOString().split('T')[0];
    return DB.timeEntries.getAll().filter(function(t) { return t.date >= startStr; })
      .reduce(function(sum, t) { return sum + (t.hours || 0); }, 0);
  },

  memberWeekHours: function(name) {
    var now = new Date();
    var weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    var startStr = weekStart.toISOString().split('T')[0];
    return DB.timeEntries.getAll().filter(function(t) { return (t.user === name || t.userId === name) && t.date >= startStr; })
      .reduce(function(sum, t) { return sum + (t.hours || 0); }, 0);
  },

  showForm: function(id) {
    var m = id ? TeamPage.getMembers().find(function(mem) { return mem.id === id; }) : {};
    if (!m) m = {};
    var title = id ? 'Edit Team Member' : 'Add Team Member';

    var html = '<form id="team-form" onsubmit="TeamPage.save(event, \'' + (id || '') + '\')">'
      + UI.formField('Name *', 'text', 'tm-name', m.name, { required: true, placeholder: 'Full name' })
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + UI.formField('Phone', 'tel', 'tm-phone', m.phone, { placeholder: '(914) 555-0000' })
      + UI.formField('Email', 'email', 'tm-email', m.email, { placeholder: 'email@example.com' })
      + '</div>'
      + UI.formField('Role', 'select', 'tm-role', m.role || 'crew_member', { options: [
          { value: 'owner', label: 'Owner — Full access' },
          { value: 'crew_lead', label: 'Crew Lead — Jobs, schedule, clients' },
          { value: 'crew_member', label: 'Crew Member — Clock in/out, today\'s jobs' }
        ]})

      // ISA Certification section removed per user request — data still preserved on existing members,
      // just no UI to edit it. If you want it back, this block was here.
      + '</form>';

    // If editing an existing member w/ email — show "Create / Reset Login" option
    if (id && m.email) {
      var hashes = {};
      try { hashes = JSON.parse(localStorage.getItem('bm-auth-hashes') || '{}'); } catch(e){}
      var hasLogin = !!hashes[m.email.toLowerCase()];
      html += '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">'
        + '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px;">🔐 App Login</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-bottom:10px;">'
        +   (hasLogin ? '✅ ' + UI.esc(m.email) + ' has a login. Reset to generate a new temp password.' : '⚠️ No login yet. Create one to let this person sign in.')
        + '</div>'
        + '<button type="button" class="btn btn-outline" style="font-size:13px;" onclick="TeamPage._createLogin(\'' + id + '\')">' + (hasLogin ? 'Reset Password' : 'Create Login') + '</button>'
        + '</div>';
    }

    UI.showModal(title, html, {
      footer: (id && id !== 'owner' ? '<button class="btn" style="background:var(--red);color:#fff;margin-right:auto;" onclick="TeamPage.remove(\'' + id + '\')">Remove</button>' : '')
        + '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="document.getElementById(\'team-form\').requestSubmit()">Save</button>'
    });
  },

  // v753: edit a crew member's photo. Supports both file upload (writes
  // to the job-photos bucket under crew/<id>/) and URL paste (point at
  // any hosted image). Reuses the existing Photos.BUCKET so no new
  // storage commitment.
  _editPhoto: function(id) {
    var m = TeamPage.getMembers().find(function(x){ return x.id === id; });
    if (!m) return;
    var current = m.photo_url || '';
    var preview = current
      ? '<img src="' + UI.esc(current) + '" alt="" style="width:80px;height:80px;border-radius:50%;object-fit:cover;background:#f3f4f6;display:block;margin:0 auto 12px;">'
      : '<div style="width:80px;height:80px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 12px;">👷</div>';
    var html = preview
      + '<div style="font-size:13px;font-weight:700;text-transform:uppercase;color:var(--text-light);letter-spacing:.4px;margin-bottom:6px;">Upload from your device</div>'
      + '<input type="file" id="tm-photo-file" accept="image/*" '
      +   'onchange="TeamPage._uploadPhotoFile(\'' + id + '\', this.files[0])" '
      +   'style="display:block;width:100%;margin-bottom:14px;font-size:13px;">'
      + '<div style="font-size:13px;font-weight:700;text-transform:uppercase;color:var(--text-light);letter-spacing:.4px;margin-bottom:6px;">…or paste an image URL</div>'
      + '<input type="url" id="tm-photo-url" value="' + UI.esc(current) + '" placeholder="https://…" '
      +   'style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:13px;margin-bottom:4px;">'
      + '<div id="tm-photo-status" style="font-size:11px;color:var(--text-light);min-height:16px;margin-top:8px;"></div>';
    UI.showModal('Photo — ' + UI.esc(m.name || ''), html, {
      footer: '<button class="btn btn-outline" style="color:#c62828;margin-right:auto;" onclick="TeamPage._savePhotoUrl(\'' + id + '\', \'\')">Remove photo</button>'
        + '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="TeamPage._savePhotoUrl(\'' + id + '\', document.getElementById(\'tm-photo-url\').value)">Save URL</button>'
    });
  },

  _savePhotoUrl: function(id, url) {
    var m = TeamPage.getMembers().find(function(x){ return x.id === id; });
    if (!m) return;
    var clean = (url || '').trim();
    TeamPage.saveMember(Object.assign({}, m, { photo_url: clean || null }));
    UI.closeModal();
    UI.toast(clean ? 'Photo updated' : 'Photo cleared');
    TeamPage.showDetail(id);
  },

  _uploadPhotoFile: async function(id, file) {
    if (!file) return;
    var status = document.getElementById('tm-photo-status');
    if (status) status.textContent = 'Uploading…';
    var m = TeamPage.getMembers().find(function(x){ return x.id === id; });
    if (!m) return;
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client || !SupabaseDB.ready) {
      if (status) status.textContent = 'Supabase not connected — paste a URL instead.';
      return;
    }
    var BUCKET = (typeof Photos !== 'undefined' && Photos.BUCKET) ? Photos.BUCKET : 'job-photos';
    try {
      var safeName = (file.name || 'avatar.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '.jpg');
      var path = 'crew/' + id + '/' + Date.now() + '_' + safeName;
      var up = await SupabaseDB.client.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg' });
      if (up.error) throw up.error;
      var pub = SupabaseDB.client.storage.from(BUCKET).getPublicUrl(path);
      var url = pub && pub.data && pub.data.publicUrl;
      if (!url) throw new Error('No public URL returned');
      // Reflect in the URL field for visibility, then save
      var urlEl = document.getElementById('tm-photo-url');
      if (urlEl) urlEl.value = url;
      TeamPage._savePhotoUrl(id, url);
    } catch (e) {
      console.error('photo upload failed:', e);
      if (status) status.textContent = 'Upload failed: ' + (e.message || 'unknown error');
    }
  },

  // v743: edit hourly rate inline from the profile (same data lane as
  // PayrollPage.editRate). Provided here so the profile is self-sufficient.
  _editRate: function(id) {
    var m = TeamPage.getMembers().find(function(x){ return x.id === id; });
    if (!m) return;
    var cur = Number(m.rate || m.payRate || 0);
    var val = prompt('Hourly rate for ' + (m.name || '') + ' ($/hr):', cur.toString());
    if (val === null) return;
    var n = parseFloat(val);
    if (isNaN(n) || n < 0) { UI.toast('Invalid rate', 'error'); return; }
    TeamPage.saveMember(Object.assign({}, m, { rate: n }));
    UI.toast('Rate set: $' + n.toFixed(2) + '/hr');
    TeamPage.showDetail(id);
  },

  _createLogin: function(id) {
    var m = TeamPage.getMembers().find(function(x){ return x.id === id; });
    if (!m || !m.email) { UI.toast('Save the member with an email first', 'error'); return; }
    // Generate a readable 10-char temp password: 3 letter words + 2 digits
    var words = ['tree','oak','pine','leaf','bark','climb','sap','limb','trunk','grove'];
    var pass = words[Math.floor(Math.random()*words.length)] + words[Math.floor(Math.random()*words.length)] + Math.floor(10 + Math.random()*89);
    var hashes = {};
    try { hashes = JSON.parse(localStorage.getItem('bm-auth-hashes') || '{}'); } catch(e){}
    hashes[m.email.toLowerCase()] = Auth._hash(pass);
    localStorage.setItem('bm-auth-hashes', JSON.stringify(hashes));

    var loginUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
    var shareText = 'You have access to Branch Manager.\n\n'
      + 'URL: ' + loginUrl + '\n'
      + 'Email: ' + m.email + '\n'
      + 'Temporary password: ' + pass + '\n\n'
      + 'Please change your password after first login (Settings → Change Password).';

    var msgHtml = '<div>'
      + '<h3 style="margin-bottom:6px;">🔐 Login Ready for ' + UI.esc(m.name || m.email) + '</h3>'
      + '<p style="font-size:12px;color:var(--text-light);margin-bottom:12px;">Send this to them. They can change the password after first login.</p>'
      + '<textarea id="bm-login-text" readonly style="width:100%;height:170px;font-family:monospace;font-size:12px;padding:10px;border:1px solid var(--border);border-radius:8px;box-sizing:border-box;">' + shareText.replace(/</g,'&lt;') + '</textarea>'
      + '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">'
      +   '<button class="btn btn-primary" style="flex:1;min-width:140px;" onclick="(function(){var t=document.getElementById(\'bm-login-text\');t.select();document.execCommand(\'copy\');UI.toast(\'Copied ✓\');})()">📋 Copy</button>'
      +   '<button class="btn btn-outline" style="flex:1;min-width:140px;" onclick="window.open(\'sms:' + (m.phone || '').replace(/\D/g,'') + '?&body=\' + encodeURIComponent(document.getElementById(\'bm-login-text\').value))">💬 SMS ' + UI.esc((m.name||'').split(' ')[0]) + '</button>'
      +   '<button class="btn btn-outline" style="flex:1;min-width:140px;" onclick="window.location.href=\'mailto:' + encodeURIComponent(m.email) + '?subject=\' + encodeURIComponent(\'Branch Manager login\') + \'&body=\' + encodeURIComponent(document.getElementById(\'bm-login-text\').value)">✉️ Email</button>'
      + '</div>'
      + '</div>';
    UI.showModal('Login Created', msgHtml, { size: 'md' });
  },

  save: function(e, id) {
    e.preventDefault();
    // Safely pull form values — some fields (cert*) are no longer rendered
    function v(el) { var n = document.getElementById(el); return n ? (n.value || '').trim() : ''; }
    var data = {
      id: id || Date.now().toString(36),
      name: v('tm-name'),
      phone: v('tm-phone'),
      email: v('tm-email'),
      role: v('tm-role') || 'crew_member',
      active: true
    };
    if (!data.name) { UI.toast('Name is required', 'error'); return; }
    if (id) {
      var existing = TeamPage.getMembers().find(function(m) { return m.id === id; });
      if (existing) {
        data.active = existing.active;
        // Preserve any cert data that's still on the record, just not surfaced
        if (existing.isaCertType)   data.isaCertType = existing.isaCertType;
        if (existing.isaCertNumber) data.isaCertNumber = existing.isaCertNumber;
        if (existing.isaCertExpiry) data.isaCertExpiry = existing.isaCertExpiry;
      }
    }
    // ── Optimistic UI ──
    // 1. Toast instantly so the user feels confirmation
    UI.toast(id ? 'Member updated ✓' : 'Member added ✓');
    // 2. localStorage write + kick async Supabase sync (runs in background)
    TeamPage.saveMember(data);
    // 3. Jump straight to the Team list. closeModal no longer needed — loadPage
    //    replaces pageContent outright, killing the form page.
    loadPage('team');
  },

  remove: function(id) {
    UI.confirm('Remove this team member?', function() {
      UI.toast('Member removed ✓');
      TeamPage.removeMember(id);
      window._payrollTab = 'payroll';
      loadPage('payroll');
    });
  },

  showDetail: function(id) {
    var m = TeamPage.getMembers().find(function(mem) { return mem.id === id; });
    if (!m) return;

    // v743: header now shows photo (if set), rate, and an inline rate editor.
    var rate = Number(m.rate || m.payRate || 0);
    var weekHrs = TeamPage.memberWeekHours(m.name);
    var avatarHtml = m.photo_url
      ? '<img src="' + UI.esc(m.photo_url) + '" alt="" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid var(--border);background:#f3f4f6;">'
      : '<div style="width:96px;height:96px;border-radius:50%;background:var(--accent);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:38px;font-weight:700;">' + (m.name || '?').charAt(0).toUpperCase() + '</div>';
    var html = '<div style="text-align:center;margin-bottom:20px;">'
      + '<div style="position:relative;display:inline-block;margin-bottom:8px;">' + avatarHtml
      +   '<button onclick="TeamPage._editPhoto(\'' + id + '\')" title="Edit photo" '
      +     'style="position:absolute;bottom:0;right:0;width:28px;height:28px;border-radius:50%;border:2px solid #fff;background:var(--accent);color:#fff;cursor:pointer;font-size:13px;line-height:1;">📷</button>'
      + '</div>'
      + '<h2 style="margin:0;">' + UI.esc(m.name) + '</h2>'
      + '<div>' + UI.statusBadge(m.role) + '</div>'
      + '</div>'
      + '<div style="font-size:14px;line-height:2;">'
      + (m.phone ? '<div>📞 ' + UI.phone(m.phone) + '</div>' : '')
      + (m.email ? '<div>✉️ ' + UI.esc(m.email) + '</div>' : '')
      + '<div>💵 Rate: <strong>' + (rate ? '$' + rate.toFixed(2) + '/hr' : '<span style="color:var(--text-light);">unset</span>') + '</strong>'
      +   ' <button onclick="TeamPage._editRate(\'' + id + '\')" style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--text-light);padding:0 4px;">✏️</button></div>'
      + '<div>⏱️ Hours this week: <strong>' + weekHrs.toFixed(1) + '</strong>' + (rate ? ' · ~$' + (weekHrs * rate).toFixed(0) + ' so far' : '') + '</div>'
      + '</div>';

    // ── App Login section (Create / Reset) ──
    if (m.email) {
      var _hashes = {};
      try { _hashes = JSON.parse(localStorage.getItem('bm-auth-hashes') || '{}'); } catch(e){}
      var _hasLogin = !!_hashes[m.email.toLowerCase()];
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-top:16px;margin-bottom:16px;">'
        + '<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-light);margin-bottom:8px;">🔐 App Login</div>'
        + '<div style="font-size:13px;color:var(--text-light);margin-bottom:12px;">'
        +   (_hasLogin ? '✅ <strong style="color:var(--green-dark);">' + UI.esc(m.email) + '</strong> has a login. Reset to generate a new temp password.' : '⚠️ No login yet. Create one so ' + UI.esc((m.name||'').split(' ')[0] || 'they') + ' can sign in.')
        + '</div>'
        + '<button type="button" class="btn btn-primary" style="width:100%;padding:12px;font-weight:700;" onclick="TeamPage._createLogin(\'' + id + '\')">' + (_hasLogin ? '🔄 Reset Password + Re-send' : '✨ Create Login + Send to ' + UI.esc((m.name||'').split(' ')[0] || 'Them')) + '</button>'
        + '</div>';
    } else {
      html += '<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:14px;margin-top:16px;margin-bottom:16px;font-size:13px;color:#92400e;">'
        + '⚠️ Add an email address (click Edit below) to enable login creation.'
        + '</div>';
    }

    // v743: Performance section — folded in from the retired
    // CrewPerformance page so all crew analytics live on the profile.
    if (typeof CrewPerformance !== 'undefined' && CrewPerformance._getCrewStats) {
      try {
        var stats = CrewPerformance._getCrewStats(m.id, 'month', DB.jobs.getAll(), DB.timeEntries.getAll(), m.name);
        html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-top:16px;">'
          + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-light);margin-bottom:10px;">📊 Performance · last 30 days</div>'
          + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">'
          +   '<div style="text-align:center;padding:8px;background:var(--bg);border-radius:8px;"><div style="font-size:18px;font-weight:800;">' + UI.moneyInt(stats.revenue || 0) + '</div><div style="font-size:10px;color:var(--text-light);">Revenue</div></div>'
          +   '<div style="text-align:center;padding:8px;background:var(--bg);border-radius:8px;"><div style="font-size:18px;font-weight:800;">' + (stats.jobsCompleted || 0) + '</div><div style="font-size:10px;color:var(--text-light);">Jobs done</div></div>'
          +   '<div style="text-align:center;padding:8px;background:var(--bg);border-radius:8px;"><div style="font-size:18px;font-weight:800;">' + (stats.hoursWorked || 0).toFixed(0) + '</div><div style="font-size:10px;color:var(--text-light);">Hours</div></div>'
          +   '<div style="text-align:center;padding:8px;background:var(--bg);border-radius:8px;"><div style="font-size:18px;font-weight:800;">' + (stats.avgRating > 0 ? stats.avgRating.toFixed(1) + '★' : '—') + '</div><div style="font-size:10px;color:var(--text-light);">Rating</div></div>'
          + '</div>'
          + '</div>';
      } catch(e) { /* swallow — stats helper is best-effort */ }
    }

    // Recent time entries
    var entries = DB.timeEntries.getAll().filter(function(t) { return t.user === m.name || t.userId === m.name; }).slice(0, 10);
    if (entries.length > 0) {
      html += '<h4 style="margin-top:4px;margin-bottom:8px;">Recent Time Entries</h4>';
      entries.forEach(function(t) {
        var job = t.jobId ? DB.jobs.getById(t.jobId) : null;
        html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">'
          + '<span>' + UI.dateShort(t.date) + ' — ' + (job ? job.clientName : 'General') + '</span>'
          + '<span style="font-weight:600;">' + (t.hours || 0).toFixed(1) + ' hrs</span>'
          + '</div>';
      });
    }

    // Render as full page (not a modal popup)
    var pageHtml = '<div style="max-width:760px;margin:0 auto;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">'
      +   '<button class="btn btn-outline" onclick="window._payrollTab=\'payroll\';loadPage(\'payroll\')" style="padding:6px 12px;font-size:12px;">← Back to Payroll</button>'
      +   '<button class="btn btn-primary" onclick="TeamPage.showForm(\'' + id + '\')">Edit</button>'
      + '</div>'
      + html
      + '</div>';
    document.getElementById('pageTitle').textContent = m.name;
    document.getElementById('pageContent').innerHTML = pageHtml;
    document.getElementById('pageAction').style.display = 'none';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
};
