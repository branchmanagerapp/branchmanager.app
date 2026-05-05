/**
 * Branch Manager — Requests Page v3
 * Matches Jobber: filter chips, stat cards, row actions, detail view
 */
var RequestsPage = {

  // Look up existing client by phone (last-10-digits match) or email (case-insensitive).
  // Returns the client object, or null. If found, also auto-backfills missing phone/email
  // on the client record so we accumulate contact methods over time.
  _matchClient: function(phone, email, name) {
    var phoneDigits = (phone || '').replace(/\D/g, '').slice(-10);
    var emailNorm = (email || '').trim().toLowerCase();
    if (!phoneDigits && !emailNorm) return null;
    var clients = [];
    try { clients = JSON.parse(localStorage.getItem('bm-clients') || '[]'); } catch(e) {}
    var match = null;
    for (var i = 0; i < clients.length; i++) {
      var c = clients[i];
      var cPhone = (c.phone || '').replace(/\D/g, '').slice(-10);
      var cEmail = (c.email || '').trim().toLowerCase();
      if (phoneDigits && cPhone && cPhone === phoneDigits) { match = c; break; }
      if (emailNorm && cEmail && cEmail === emailNorm) { match = c; break; }
    }
    if (!match) return null;
    // Backfill missing contact on matched client
    var patch = {};
    if (phoneDigits && !(match.phone || '').replace(/\D/g, '').length) patch.phone = phone;
    if (emailNorm && !(match.email || '').trim()) patch.email = email;
    if (Object.keys(patch).length) {
      try { DB.clients.update(match.id, patch); Object.assign(match, patch); } catch(e){}
    }
    return match;
  },

  _co: function() {
    return {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      website: CompanyInfo.get('website')
    };
  },

  _search: '', _filter: 'all',
  _sortCol: 'createdAt', _sortDir: 'desc',
  _page: 0, _perPage: 50, _showAll: false,

  _sortTh: function(label, col, extraStyle) {
    var self = RequestsPage;
    var arrow = self._sortCol === col ? (self._sortDir === 'asc' ? ' &#9650;' : ' &#9660;') : '';
    return '<th onclick="RequestsPage._setSort(\'' + col + '\')" style="cursor:pointer;user-select:none;' + (extraStyle || '') + '"' + (self._sortCol === col ? ' class="sort-active"' : '') + '>' + label + arrow + '</th>';
  },
  _setSort: function(col) {
    if (RequestsPage._sortCol === col) { RequestsPage._sortDir = RequestsPage._sortDir === 'asc' ? 'desc' : 'asc'; }
    else { RequestsPage._sortCol = col; RequestsPage._sortDir = 'asc'; }
    RequestsPage._page = 0; loadPage('requests');
  },
  _goPage: function(p) { var t = Math.ceil(RequestsPage._getFiltered().length / RequestsPage._perPage); RequestsPage._page = Math.max(0, Math.min(p, t - 1)); loadPage('requests'); },
  _toggleShowAll: function() { RequestsPage._showAll = !RequestsPage._showAll; RequestsPage._page = 0; loadPage('requests'); },

  // ── Helpers ──────────────────────────────────────────────────────────────
  _isOverdue: function(r) {
    if (r.status === 'converted' || r.status === 'quoted' || r.status === 'archived') return false;
    var age = (Date.now() - new Date(r.createdAt || 0)) / 86400000;
    return age > 3;
  },

  _statusLabel: function(s) {
    var map = { new:'New', assessment_scheduled:'Assessment Scheduled', assessment_complete:'Assessment Complete',
      converted:'Converted', quoted:'Quoted', overdue:'Overdue', archived:'Archived', unscheduled:'Unscheduled' };
    return map[s] || s;
  },

  // ── Background Supabase sync ──────────────────────────────────────────────
  _autoSync: function() {
    var SUPABASE_URL = 'https://ltpivkqahvplapyagljt.supabase.co';
    var SUPABASE_KEY = (typeof SupabaseDB !== 'undefined' && SupabaseDB.ANON_KEY) || '';
    var _tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    var _tfilter = _tid ? '&tenant_id=eq.' + encodeURIComponent(_tid) : '';
    fetch(SUPABASE_URL + '/rest/v1/requests?select=*&order=created_at.desc&limit=50' + _tfilter, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    })
    .then(function(r) { return r.json(); })
    .then(function(rows) {
      if (!Array.isArray(rows)) return;
      var existing = DB.requests.getAll();
      var added = 0;
      rows.forEach(function(row) {
        var dup = existing.find(function(e) {
          return (e.id && e.id === row.id) ||
                 (e.clientName && row.client_name && e.clientName.toLowerCase() === row.client_name.toLowerCase() &&
                  e.property && row.property && e.property.substring(0,8) === row.property.substring(0,8));
        });
        if (!dup) {
          var matched = RequestsPage._matchClient(row.phone, row.email, row.client_name);
          DB.requests.create({
            id: row.id,
            clientId: matched ? matched.id : undefined,
            clientName: (matched && matched.name) || row.client_name || '',
            email: row.email || (matched && matched.email) || '',
            phone: row.phone || (matched && matched.phone) || '',
            property: row.property || (matched && matched.address) || '',
            source: row.source || 'Online Form',
            notes: row.notes || '',
            status: row.status || 'new',
            createdAt: row.created_at
          });
          added++;
        }
      });
      localStorage.setItem('bm-req-last-sync', new Date().toISOString());
      if (added > 0) {
        UI.toast('📥 ' + added + ' new online request' + (added > 1 ? 's' : '') + ' pulled in!');
        loadPage('requests');
      }
    })
    .catch(function() {});
  },

  syncFromSupabase: function() {
    var SUPABASE_URL = 'https://ltpivkqahvplapyagljt.supabase.co';
    var SUPABASE_KEY = (typeof SupabaseDB !== 'undefined' && SupabaseDB.ANON_KEY) || '';
    var btn = document.getElementById('req-sync-btn');
    if (btn) { btn.textContent = '⏳ Syncing...'; btn.disabled = true; }
    var _tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    var _tfilter = _tid ? '&tenant_id=eq.' + encodeURIComponent(_tid) : '';
    fetch(SUPABASE_URL + '/rest/v1/requests?select=*&order=created_at.desc&limit=50' + _tfilter, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    })
    .then(function(r) { return r.json(); })
    .then(function(rows) {
      if (!Array.isArray(rows)) return;
      var existing = DB.requests.getAll();
      var added = 0;
      rows.forEach(function(row) {
        var dup = existing.find(function(e) {
          return (e.id && e.id === row.id) ||
                 (e.clientName && row.client_name && e.clientName.toLowerCase() === row.client_name.toLowerCase() &&
                  e.property && row.property && e.property.substring(0,8) === row.property.substring(0,8));
        });
        if (!dup) {
          var matched = RequestsPage._matchClient(row.phone, row.email, row.client_name);
          DB.requests.create({
            id: row.id,
            clientId: matched ? matched.id : undefined,
            clientName: (matched && matched.name) || row.client_name || '',
            email: row.email || (matched && matched.email) || '',
            phone: row.phone || (matched && matched.phone) || '',
            property: row.property || (matched && matched.address) || '',
            source: row.source || 'Online Form',
            notes: row.notes || '',
            status: row.status || 'new',
            createdAt: row.created_at
          });
          added++;
        }
      });
      localStorage.setItem('bm-req-last-sync', new Date().toISOString());
      UI.toast(added > 0 ? '✅ Synced ' + added + ' new request' + (added>1?'s':'') + ' from website' : '✅ Already up to date');
      if (btn) { btn.textContent = '🔄 Sync'; btn.disabled = false; }
      loadPage('requests');
    })
    .catch(function() {
      UI.toast('⚠️ Sync failed — check connection');
      if (btn) { btn.textContent = '🔄 Sync'; btn.disabled = false; }
    });
  },

  _pendingDetail: null,

  // ── List render ───────────────────────────────────────────────────────────
  render: function() {
    if (RequestsPage._pendingDetail) {
      var _pid = RequestsPage._pendingDetail;
      RequestsPage._pendingDetail = null;
      setTimeout(function() { RequestsPage.showDetail(_pid); }, 50);
    }
    var lastSync = localStorage.getItem('bm-req-last-sync');
    var fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    if (!lastSync || lastSync < fiveMinAgo) RequestsPage._autoSync();

    var self = RequestsPage;
    var allRequests = DB.requests.getAll();

    // ── Auto-link unlinked requests to existing clients ──
    var allClients = DB.clients.getAll();
    allRequests.forEach(function(r) {
      if (r.clientId) return;
      var match = null;
      if (r.phone) {
        var ph = r.phone.replace(/\D/g,'');
        if (ph.length >= 7) match = allClients.find(function(c) { return c.phone && c.phone.replace(/\D/g,'') === ph; });
      }
      if (!match && r.email) {
        var em = r.email.toLowerCase();
        match = allClients.find(function(c) { return c.email && c.email.toLowerCase() === em; });
      }
      if (!match && r.clientName) {
        var nm = r.clientName.toLowerCase().trim();
        match = allClients.find(function(c) { return c.name && c.name.toLowerCase().trim() === nm; });
      }
      if (match) {
        DB.requests.update(r.id, { clientId: match.id });
        r.clientId = match.id;
      }
    });

    // ── Counts ──
    var newCount   = allRequests.filter(function(r){ return r.status === 'new'; }).length;
    var quotedCount = allRequests.filter(function(r){ return r.status === 'quoted'; }).length;
    var overdueCount = allRequests.filter(function(r){ return self._isOverdue(r); }).length;
    var convertedCount = allRequests.filter(function(r){ return r.status === 'converted' || r.status === 'quoted'; }).length;
    var thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    var recentNew = allRequests.filter(function(r) {
      return new Date(r.createdAt) >= thirtyAgo;
    });
    var recentNewCount = recentNew.filter(function(r){ return r.status === 'new'; }).length;
    var recentConverted = recentNew.filter(function(r){ return r.status === 'converted' || r.status === 'quoted'; }).length;
    var convRate = recentNew.length > 0 ? Math.round(recentConverted / recentNew.length * 100) : 0;

    // ── New request alert cards at top ──
    var newRequests = allRequests.filter(function(r){ return r.status === 'new'; });
    newRequests.sort(function(a,b){ return new Date(b.createdAt||0) - new Date(a.createdAt||0); });

    var html = '';
    // v379: yellow "New Request" cards strip removed — was redundant with the
    // table below. Rows in the main list now get a subtle highlight when they
    // need attention (status=new or overdue) so it's all in one place.

    // ── Stats row (4-cell bordered grid — matches Jobs page shape) ──
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px;background:var(--white);" class="stat-row">'
      // Overview — clickable mini-rows that filter the list
      + '<div style="padding:14px 16px;border-right:1px solid var(--border);">'
      +   '<div style="font-size:14px;font-weight:700;margin-bottom:8px;">Overview</div>'
      +   '<div onclick="RequestsPage._setFilter(\'new\')" style="display:flex;justify-content:space-between;font-size:12px;cursor:pointer;padding:2px 0;"><span><span style="color:#1565c0;">●</span> New</span><span>' + newCount + '</span></div>'
      +   '<div onclick="RequestsPage._setFilter(\'quoted\')" style="display:flex;justify-content:space-between;font-size:12px;cursor:pointer;padding:2px 0;"><span><span style="color:#7b1fa2;">●</span> Quoted</span><span>' + quotedCount + '</span></div>'
      +   '<div onclick="RequestsPage._setFilter(\'overdue\')" style="display:flex;justify-content:space-between;font-size:12px;cursor:pointer;padding:2px 0;"><span><span style="color:#c62828;">●</span> Overdue</span><span>' + overdueCount + '</span></div>'
      + '</div>'
      // New requests (past 30d)
      + '<div style="padding:14px 16px;border-right:1px solid var(--border);">'
      +   '<div style="font-size:14px;font-weight:700;">New requests</div>'
      +   '<div style="font-size:12px;color:var(--text-light);">Past 30 days</div>'
      +   '<div style="font-size:28px;font-weight:700;margin-top:4px;">' + recentNewCount + '</div>'
      + '</div>'
      // Converted (past 30d)
      + '<div style="padding:14px 16px;border-right:1px solid var(--border);">'
      +   '<div style="font-size:14px;font-weight:700;">Converted</div>'
      +   '<div style="font-size:12px;color:var(--text-light);">Past 30 days</div>'
      +   '<div style="font-size:28px;font-weight:700;margin-top:4px;">' + recentConverted + '</div>'
      + '</div>'
      // Conversion rate
      + '<div style="padding:14px 16px;">'
      +   '<div style="font-size:14px;font-weight:700;">Conversion rate</div>'
      +   '<div style="font-size:12px;color:var(--text-light);">Past 30 days</div>'
      +   '<div style="font-size:28px;font-weight:700;margin-top:4px;color:' + (convRate >= 50 ? 'var(--green-dark)' : convRate >= 25 ? '#e07c24' : '#c62828') + ';">' + convRate + '%</div>'
      + '</div>'
      + '</div>';

    var filtered = self._getFiltered();

    // ── Header: title + count + chips on left, search on right ──
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">'
      + '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">'
      +   '<h3 style="font-size:16px;font-weight:700;margin:0;">Requests</h3>'
      +   '<span style="font-size:13px;color:var(--text-light);">(' + filtered.length + ' results)</span>';

    var filters = [['all','All'],['new','New'],['quoted','Quoted'],['converted','Converted'],['archived','Archived']];
    filters.forEach(function(f) {
      var isActive = self._filter === f[0];
      html += '<button onclick="RequestsPage._setFilter(\'' + f[0] + '\')" style="font-size:12px;padding:5px 14px;border-radius:20px;border:1px solid '
        + (isActive ? '#2e7d32' : 'var(--border)') + ';background:' + (isActive ? '#2e7d32' : 'var(--white)') + ';color:'
        + (isActive ? '#fff' : 'var(--text)') + ';cursor:pointer;font-weight:' + (isActive ? '600' : '500') + ';">' + f[1] + '</button>';
    });

    html += '</div>'
      + '<div class="search-box" style="min-width:200px;max-width:280px;">'
      +   '<span style="color:var(--text-light);">🔍</span>'
      +   '<input type="text" placeholder="Search requests..." value="' + UI.esc(self._search) + '" oninput="RequestsPage._search=this.value;RequestsPage._page=0;loadPage(\'requests\')">'
      + '</div>'
      + '</div>';

    var page = self._showAll ? filtered : filtered.slice(self._page * self._perPage, (self._page + 1) * self._perPage);

    // Floating bulk bar (always rendered — hidden via display:none until selection)
    html += '<div id="req-bulk-bar" style="display:none;position:fixed;bottom:0;left:var(--sidebar-w,0);right:0;z-index:500;background:#1a1a2e;color:#fff;padding:12px 24px;padding-bottom:max(12px,env(safe-area-inset-bottom));align-items:center;justify-content:space-between;box-shadow:0 -4px 20px rgba(0,0,0,.3);">'
      + '<span id="req-bulk-count" style="font-weight:700;font-size:14px;">0 selected</span>'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
      +   '<button onclick="RequestsPage._bulkConvert()" style="background:#2e7d32;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">➜ Convert to Quote</button>'
      +   '<button onclick="RequestsPage._bulkIgnore()" style="background:#455a64;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">🙈 Ignore</button>'
      +   '<button onclick="RequestsPage._bulkDelete()" style="background:#c62828;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">🗑 Delete</button>'
      +   '<button onclick="RequestsPage._bulkClear()" style="background:none;color:rgba(255,255,255,.7);border:none;padding:8px 12px;font-size:16px;cursor:pointer;">&#10005;</button>'
      + '</div></div>';

    // ── DESKTOP table (matches Jobs page shape: data-table + sortable headers) ──
    html += '<div class="q-desktop-only" style="background:var(--white);border-radius:12px;border:1px solid var(--border);overflow:hidden;">'
      + '<table class="data-table"><thead><tr>'
      + '<th style="width:32px;"><input type="checkbox" onchange="document.querySelectorAll(\'.req-check\').forEach(function(cb){cb.checked=event.target.checked;});RequestsPage._updateBulk();" title="Select all"></th>'
      + self._sortTh('Client', 'clientName')
      + '<th>Phone</th>'
      + self._sortTh('Description', 'service')
      + self._sortTh('Property', 'property')
      + self._sortTh('Requested', 'createdAt')
      + self._sortTh('Status', 'status')
      + '</tr></thead><tbody>';

    if (page.length === 0) {
      html += '<tr><td colspan="7">' + (self._search ? '<div style="text-align:center;padding:24px;color:var(--text-light);">No requests match "' + self._search + '"</div>' : UI.emptyState('&#128229;', 'No requests yet', 'New requests from your website form will appear here.')) + '</td></tr>';
    } else {
      page.forEach(function(r) {
        var isOverdue = self._isOverdue(r);
        var displayStatus = isOverdue && r.status === 'new' ? 'overdue' : r.status;
        // Highlight rows that need attention. Overdue → red-tinted, plain new → yellow-tinted.
        var rowBg = isOverdue && r.status === 'new' ? 'background:#fff5f5;'
                  : r.status === 'new' ? 'background:#fffde7;'
                  : '';
        var desc = r.service || r.notes || '';
        var prop = r.property || '';

        // Phone display: format as (XXX) XXX-XXXX, link as tel:.
        // Fall back to the linked client's phone when the request itself doesn't carry one.
        var phRaw = (r.phone || '').replace(/\D/g, '');
        if (phRaw.length < 10 && r.clientId) {
          var linked = DB.clients.getById(r.clientId);
          if (linked && linked.phone) phRaw = linked.phone.replace(/\D/g, '');
        }
        var phCell = '<span style="color:var(--text-light);">—</span>';
        if (phRaw.length >= 10) {
          var p10 = phRaw.slice(-10);
          var phFmt = '(' + p10.slice(0,3) + ') ' + p10.slice(3,6) + '-' + p10.slice(6);
          phCell = '<a href="tel:+1' + p10 + '" onclick="event.stopPropagation()" style="color:var(--accent);text-decoration:none;font-size:13px;white-space:nowrap;">' + phFmt + '</a>';
        }

        // Property cell: clickable to Maps if present
        var propCell = '<span style="color:var(--text-light);">—</span>';
        if (prop) {
          propCell = '<a href="https://maps.apple.com/?daddr=' + encodeURIComponent(prop) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:var(--accent);text-decoration:none;display:block;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + UI.esc(prop) + '">📍 ' + UI.esc(prop) + '</a>';
        }

        html += '<tr style="cursor:pointer;' + rowBg + '" onclick="RequestsPage.showDetail(\'' + r.id + '\')">'
          + '<td onclick="event.stopPropagation()"><input type="checkbox" class="req-check" value="' + r.id + '" onchange="RequestsPage._updateBulk()" style="width:16px;height:16px;"></td>'
          + '<td><strong>' + UI.esc(r.clientName || 'Unknown') + '</strong></td>'
          + '<td>' + phCell + '</td>'
          + '<td style="font-size:13px;color:var(--text-light);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + UI.esc(desc) + '">' + UI.esc(desc || '—') + '</td>'
          + '<td style="font-size:13px;">' + propCell + '</td>'
          + '<td style="white-space:nowrap;">' + UI.dateShort(r.createdAt) + '</td>'
          + '<td>' + UI.statusBadge(displayStatus) + '</td>'
          + '</tr>';
      });
    }
    html += '</tbody></table></div>';

    if (page.length > 0) {
      // ── MOBILE cards ──
      html += '<div class="q-mobile-only" style="display:none;">';
      page.forEach(function(r) {
        var isOverdue = self._isOverdue(r);
        var displayStatus = isOverdue && r.status === 'new' ? 'overdue' : r.status;
        var cardBg = isOverdue && r.status === 'new' ? '#fff5f5'
                   : r.status === 'new' ? '#fffde7'
                   : 'var(--white)';
        var cardBorder = isOverdue && r.status === 'new' ? '#fca5a5'
                       : r.status === 'new' ? '#ffe082'
                       : 'var(--border)';
        var desc = r.service || r.notes || '';
        if (desc.length > 60) desc = desc.substring(0, 60) + '...';
        var returning = r.clientId ? '<span style="display:inline-block;font-size:10px;padding:1px 6px;border-radius:8px;background:#e8f0fe;color:#2b6cb0;margin-left:6px;font-weight:600;">Returning</span>' : '';

        // Mobile phone link (with fallback to linked client's phone)
        var mPhRaw = (r.phone || '').replace(/\D/g, '');
        if (mPhRaw.length < 10 && r.clientId) {
          var mLinked = DB.clients.getById(r.clientId);
          if (mLinked && mLinked.phone) mPhRaw = mLinked.phone.replace(/\D/g, '');
        }
        var mPhHtml = '';
        if (mPhRaw.length >= 10) {
          var mp10 = mPhRaw.slice(-10);
          var mPhFmt = '(' + mp10.slice(0,3) + ') ' + mp10.slice(3,6) + '-' + mp10.slice(6);
          mPhHtml = '<a href="tel:+1' + mp10 + '" onclick="event.stopPropagation()" style="font-size:12px;color:var(--accent);text-decoration:none;font-weight:600;display:inline-block;margin-top:2px;">📞 ' + mPhFmt + '</a>';
        }
        // Mobile property → Maps link
        var mPropHtml = '';
        if (r.property) {
          mPropHtml = '<a href="https://maps.apple.com/?daddr=' + encodeURIComponent(r.property) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:12px;color:var(--accent);text-decoration:none;display:block;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📍 ' + UI.esc(r.property) + '</a>';
        }

        html += '<div data-rid="' + r.id + '" class="request-card" style="background:' + cardBg + ';border:1px solid ' + cardBorder + ';border-radius:12px;padding:14px 16px;margin-bottom:8px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.04);-webkit-tap-highlight-color:transparent;display:flex;align-items:flex-start;gap:10px;">'
          + '<div onclick="event.stopPropagation()" style="flex-shrink:0;padding-top:2px;"><input type="checkbox" class="req-check" value="' + r.id + '" onchange="RequestsPage._updateBulk()" style="width:18px;height:18px;"></div>'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">'
          +   '<div style="flex:1;min-width:0;">'
          +     '<div style="font-size:15px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(r.clientName || 'Unknown') + returning + '</div>'
          +     (desc ? '<div style="font-size:13px;color:var(--text);margin-top:4px;">' + UI.esc(desc) + '</div>' : '')
          +     mPhHtml
          +     mPropHtml
          +   '</div>'
          +   '<div style="flex-shrink:0;">' + UI.statusBadge(displayStatus) + '</div>'
          + '</div>'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:8px;flex-wrap:wrap;">'
          +   '<div style="font-size:11px;color:var(--text-light);">' + UI.esc(r.source || 'website') + '</div>'
          +   '<div style="font-size:11px;color:var(--text-light);">' + UI.dateShort(r.createdAt) + '</div>'
          + '</div>'
          + '</div>' // close request-card flex wrap
          + '</div>';
      });
      html += '</div>';

      // Mobile tap handlers
      setTimeout(function() {
        document.querySelectorAll('.request-card').forEach(function(card) {
          var startX, startY, moved;
          card.addEventListener('touchstart', function(e) {
            var t = e.touches[0]; startX = t.clientX; startY = t.clientY; moved = false;
          }, { passive: true });
          card.addEventListener('touchmove', function(e) {
            var t = e.touches[0];
            if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) moved = true;
          }, { passive: true });
          card.addEventListener('click', function() {
            if (moved) return;
            var rid = this.getAttribute('data-rid');
            if (rid) RequestsPage.showDetail(rid);
          });
        });
      }, 0);
    }

    // Pagination (matches Jobs page shape)
    var totalPages = Math.ceil(filtered.length / self._perPage);
    if (totalPages > 1 || self._showAll) {
      html += '<div style="display:flex;justify-content:center;align-items:center;gap:4px;margin-top:12px;flex-wrap:wrap;">';
      if (!self._showAll) {
        html += '<button class="btn btn-outline" onclick="RequestsPage._goPage(' + (self._page - 1) + ')" style="font-size:12px;padding:5px 10px;"' + (self._page === 0 ? ' disabled' : '') + '>‹</button>';
        for (var p = Math.max(0, self._page - 2); p <= Math.min(totalPages - 1, self._page + 2); p++) {
          html += '<button class="btn ' + (p === self._page ? 'btn-primary' : 'btn-outline') + '" onclick="RequestsPage._goPage(' + p + ')" style="font-size:12px;padding:5px 10px;min-width:32px;">' + (p + 1) + '</button>';
        }
        html += '<button class="btn btn-outline" onclick="RequestsPage._goPage(' + (self._page + 1) + ')" style="font-size:12px;padding:5px 10px;"' + (self._page >= totalPages - 1 ? ' disabled' : '') + '>›</button>';
      }
      html += '<button class="btn btn-outline" onclick="RequestsPage._toggleShowAll()" style="font-size:12px;padding:5px 12px;margin-left:8px;">'
        + (self._showAll ? 'Paginate (' + self._perPage + '/page)' : 'Show all ' + filtered.length)
        + '</button>';
      html += '</div>';
    }

    return html;
  },

  // ── Filtering ─────────────────────────────────────────────────────────────
  _getFiltered: function() {
    var self = RequestsPage;
    var all = DB.requests.getAll();
    // Default: hide converted and archived (they're done — show in Clients page)
    if (self._filter === 'all') {
      all = all.filter(function(r) { return r.status !== 'converted' && r.status !== 'quoted' && r.status !== 'archived'; });
    } else if (self._filter === 'converted') {
      all = all.filter(function(r) { return r.status === 'converted' || r.status === 'quoted'; });
    } else if (self._filter === 'overdue') {
      all = all.filter(function(r) { return self._isOverdue(r); });
    } else if (self._filter === 'unscheduled') {
      all = all.filter(function(r) { return !r.assessmentDate && (r.status === 'new' || r.status === 'assessment_complete'); });
    } else if (self._filter !== 'all') {
      all = all.filter(function(r) { return r.status === self._filter; });
    }
    if (self._search && self._search.length >= 2) {
      var s = self._search.toLowerCase();
      all = all.filter(function(r) {
        return (r.clientName||'').toLowerCase().indexOf(s) >= 0
          || (r.property||'').toLowerCase().indexOf(s) >= 0
          || (r.phone||'').indexOf(s) >= 0
          || (r.email||'').toLowerCase().indexOf(s) >= 0
          || (r.notes||'').toLowerCase().indexOf(s) >= 0
          || (r.service||'').toLowerCase().indexOf(s) >= 0
          || (r.source||'').toLowerCase().indexOf(s) >= 0;
      });
    }
    // Sort by current column / direction
    var col = self._sortCol || 'createdAt';
    var dir = self._sortDir === 'asc' ? 1 : -1;
    all.sort(function(a, b) {
      var va = a[col], vb = b[col];
      if (col === 'createdAt') return ((new Date(va || 0)).getTime() - (new Date(vb || 0)).getTime()) * dir;
      va = (va || '').toString().toLowerCase(); vb = (vb || '').toString().toLowerCase();
      return va < vb ? -1 * dir : va > vb ? 1 * dir : 0;
    });
    return all;
  },
  _setFilter: function(f) { RequestsPage._filter = f; loadPage('requests'); },

  // ── New Request form ──────────────────────────────────────────────────────
  showForm: function(editId) {
    var r = editId ? DB.requests.getById(editId) : null;
    var allClients = [];
    try { allClients = JSON.parse(localStorage.getItem('bm-clients') || '[]'); } catch(e) {}
    var clientOptions = [{ value: '', label: '— New client (fill in below) —' }]
      .concat(allClients.map(function(c) { return { value: c.id, label: c.name + (c.address ? ' · ' + c.address.split(',')[0] : '') }; }));

    var services = ['','Tree Removal','Tree Pruning','Stump Grinding','Emergency Tree Work','Tree Assessment','Cabling & Bracing',
      'Chipping / Brush Removal','Lot Clearing','Firewood','Gutter Cleaning','Spring Clean Up','Snow Removal','Other'];

    var html = '<form id="req-form" onsubmit="RequestsPage.save(event,\'' + (editId||'') + '\')">'
      + (r ? '' : UI.formField('Existing Client', 'select', 'r-clientId', '', { options: clientOptions }))
      + '<div id="r-newclient-fields"' + (r ? '' : '') + '>'
      + UI.formField('Client Name', 'text', 'r-name', r ? r.clientName : '', { placeholder: 'Full name' })
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + UI.formField('Phone', 'tel', 'r-phone', r ? r.phone : '', { placeholder: '(914) 555-0000' })
      + UI.formField('Email', 'email', 'r-email', r ? r.email : '', { placeholder: 'email@example.com' })
      + '</div></div>'
      + UI.formField('Property Address', 'text', 'r-property', r ? r.property : '', { placeholder: 'Street, City, State ZIP' })
      + UI.formField('Service Requested', 'select', 'r-service', r ? r.service : '', { options: services })
      + UI.formField('How did they hear about us?', 'select', 'r-source', r ? r.source : '', { options: ['','Google Search','Facebook','Instagram','Nextdoor','Friend / Referral','Yelp','Angi','Thumbtack','Drive-by','Repeat Client','Other'] })
      + UI.formField('Details / Notes', 'textarea', 'r-notes', r ? r.notes : '', { placeholder: 'What do they need? Any specifics about the property or job.' })
      + '</form>'
      + '<script>var _rci=document.getElementById("r-clientId");if(_rci)_rci.addEventListener("change",function(){'
      + 'var nf=document.getElementById("r-newclient-fields");nf.style.display=this.value?"none":"block";'
      + 'if(this.value){var cl=JSON.parse(localStorage.getItem("bm-clients")||"[]");'
      + 'var c=cl.find(function(x){return x.id===_rci.value;});'
      + 'if(c){if(document.getElementById("r-name"))document.getElementById("r-name").value=c.name||"";'
      + 'if(document.getElementById("r-phone"))document.getElementById("r-phone").value=c.phone||"";'
      + 'if(document.getElementById("r-email"))document.getElementById("r-email").value=c.email||"";'
      + 'if(!document.getElementById("r-property").value)document.getElementById("r-property").value=c.address||"";}}'
      + '});<\/script>';

    UI.showModal(r ? 'Edit Request' : 'New Request', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="document.getElementById(\'req-form\').requestSubmit()">'
        + (r ? 'Save Changes' : 'Save Request') + '</button>'
    });
  },

  save: function(e, editId) {
    e.preventDefault();
    var service  = (document.getElementById('r-service')||{}).value || '';
    var property = (document.getElementById('r-property')||{}).value.trim();
    var source   = (document.getElementById('r-source')||{}).value || '';
    var notes    = (document.getElementById('r-notes')||{}).value.trim();

    if (editId) {
      var phone = (document.getElementById('r-phone')||{}).value.trim();
      var email = (document.getElementById('r-email')||{}).value.trim();
      var name  = (document.getElementById('r-name')||{}).value.trim();
      UI.toast('Request updated ✓'); // optimistic first
      DB.requests.update(editId, { clientName: name, phone: phone, email: email, property: property, service: service, source: source, notes: notes });
      RequestsPage.showDetail(editId);
      return;
    }

    var existingClientId = (document.getElementById('r-clientId')||{}).value;
    var allClients = [];
    try { allClients = JSON.parse(localStorage.getItem('bm-clients') || '[]'); } catch(ex) {}
    var client;

    if (existingClientId) {
      client = allClients.find(function(c) { return c.id === existingClientId; });
      if (!client) { UI.toast('Client not found', 'error'); return; }
    } else {
      var name = (document.getElementById('r-name')||{}).value.trim();
      var rphone = (document.getElementById('r-phone')||{}).value.trim();
      var remail = (document.getElementById('r-email')||{}).value.trim();
      if (!name) { UI.toast('Enter a client name or select an existing client', 'error'); return; }
      // Auto-match to an existing client by phone/email to avoid duplicate records.
      client = RequestsPage._matchClient(rphone, remail, name);
      if (client) {
        UI.toast('Matched existing client: ' + client.name + ' ✓');
      } else {
        client = DB.clients.create({
          name: name,
          phone: rphone,
          email: remail,
          address: property,
          status: 'lead'
        });
      }
    }

    DB.requests.create({
      clientId: client.id,
      clientName: client.name,
      property: property || client.address || '',
      phone: client.phone || '',
      email: client.email || '',
      service: service,
      source: source,
      notes: notes,
      status: 'new'
    });

    UI.toast('Request created ✓');
    loadPage('requests');
  },

  // ── Detail view ───────────────────────────────────────────────────────────
  showDetail: function(id) {
    var r = DB.requests.getById(id);
    if (!r) return;
    if (window.bmRememberDetail) window.bmRememberDetail('requests', id);
    var self = RequestsPage;

    var statusColor = { new:'#1565c0', assessment_scheduled:'#e07c24', assessment_complete:'#2e7d32',
      converted:'#2e7d32', quoted:'#8b2252', overdue:'#dc3545', archived:'#9e9e9e' }[r.status] || '#1565c0';

    // Find linked quotes
    var linkedQuotes = DB.quotes.getAll().filter(function(q) {
      return q.requestId === r.id || (q.clientName && r.clientName && q.clientName === r.clientName && q.clientId === r.clientId);
    }).slice(0, 3);

    var html = '<div style="max-width:960px;margin:0 auto;">'

    // Top action bar
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">'
      + '<button class="btn btn-outline" onclick="loadPage(\'requests\')" style="padding:6px 12px;font-size:12px;">← Back to Requests</button>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
      + '<button class="btn btn-primary" onclick="RequestsPage._fastCreateQuote(\'' + r.id + '\')" style="font-size:12px;background:#16a34a;border:none;">⚡ Fast Quote</button>'
      + '<button class="btn btn-outline" onclick="RequestsPage._createQuote(\'' + r.id + '\',\'' + (r.clientId||'') + '\',\'' + UI.esc(r.clientName||'') + '\')" style="font-size:12px;">📝 Build Quote</button>'
      + '<button class="btn btn-outline" onclick="RequestsPage._archiveRequest(\'' + r.id + '\')" style="font-size:12px;padding:6px 12px;">Archive</button>'
      + '</div></div>'

    // Header card
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:16px;">'
      + '<div style="height:4px;background:' + statusColor + ';"></div>'
      + '<div style="padding:20px 24px;">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">'
      + '<div>'
      + '<h2 style="font-size:22px;font-weight:700;margin:0 0 4px;">'
      + UI.esc(r.clientName || 'Unknown')
      + (r.clientId ? ' <a onclick="ClientsPage.showDetail(\'' + r.clientId + '\')" style="font-size:12px;color:var(--accent);cursor:pointer;font-weight:500;margin-left:6px;">Edit Client →</a>' : '')
      + '</h2>'
      + '<div style="font-size:13px;color:var(--text-light);">'
      + UI.dateRelative(r.createdAt)
      + (r.source ? ' · via ' + r.source : '')
      + (self._isOverdue(r) ? ' · <span style="color:#c62828;font-weight:600;">Overdue</span>' : '')
      + '</div>'
      + (r.property ? '<div style="font-size:13px;color:var(--text-light);margin-top:4px;">📍 ' + UI.esc(r.property) + '</div>' : '')
      + '</div>'
      + UI.statusBadge(r.status)
      + '</div></div></div>'

    // Two-column layout: main + sidebar
      + '<div style="display:grid;grid-template-columns:1fr 300px;gap:16px;" class="detail-grid">'

    // ── Main column ──
      + '<div>'

    // Request details card
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:14px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px;">Request Details</h4>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;" class="detail-grid">'
      + '<div><div style="font-size:11px;color:var(--text-light);font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">Service</div>'
      + '<div style="font-size:14px;font-weight:600;">' + UI.esc(r.service || '—') + '</div></div>'
      + '<div><div style="font-size:11px;color:var(--text-light);font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">Source</div>'
      + '<div style="font-size:14px;">' + UI.esc(r.source || '—') + '</div></div>'
      + '<div><div style="font-size:11px;color:var(--text-light);font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">Received</div>'
      + '<div style="font-size:14px;">' + UI.dateShort(r.createdAt) + '</div></div>'
      + '<div><div style="font-size:11px;color:var(--text-light);font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">Assessment</div>'
      + '<div style="font-size:14px;">' + (r.assessmentDate ? UI.dateShort(r.assessmentDate) : '<span style="color:var(--text-light);">Not scheduled</span>') + '</div></div>'
      + '</div>'
      + (r.notes ? '<div style="font-size:13px;line-height:1.7;color:var(--text);background:var(--bg);border-radius:8px;padding:12px;">' + UI.esc(r.notes).replace(/\n/g,'<br>') + '</div>' : '<div style="font-size:13px;color:var(--text-light);font-style:italic;">No details provided</div>')
      + '</div>'

    // Status workflow card
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:14px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">Update Status</h4>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    [['new','New'],['assessment_scheduled','Assessment Scheduled'],['assessment_complete','Assessment Complete'],['converted','Converted'],['archived','Archived']].forEach(function(s) {
      var isActive = r.status === s[0];
      html += '<button onclick="RequestsPage.setStatus(\'' + r.id + '\',\'' + s[0] + '\')" style="font-size:12px;padding:6px 14px;border-radius:6px;border:1px solid '
        + (isActive ? '#1565c0' : 'var(--border)') + ';background:' + (isActive ? '#1565c0' : 'var(--white)') + ';color:'
        + (isActive ? '#fff' : 'var(--text)') + ';cursor:pointer;font-weight:' + (isActive ? '700' : '500') + ';">' + s[1] + '</button>';
    });
    html += '</div></div>'

    // Linked quotes
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:20px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin:0;">Quotes</h4>'
      + '<button onclick="RequestsPage._createQuote(\'' + r.id + '\',\'' + (r.clientId||'') + '\',\'' + UI.esc(r.clientName||'') + '\')" class="btn btn-outline" style="font-size:12px;">+ Create Quote</button>'
      + '</div>';
    if (linkedQuotes.length > 0) {
      linkedQuotes.forEach(function(q) {
        html += '<div onclick="QuotesPage.showDetail(\'' + q.id + '\')" style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg);border-radius:8px;margin-bottom:6px;cursor:pointer;">'
          + '<div><div style="font-size:13px;font-weight:600;">' + 'Quote #' + (q.quoteNumber||'') + '</div>'
          + '<div style="font-size:11px;color:var(--text-light);">' + UI.dateShort(q.createdAt) + '</div></div>'
          + '<div style="display:flex;align-items:center;gap:8px;">' + UI.statusBadge(q.status) + '<span style="font-size:13px;font-weight:700;">' + UI.money(q.total) + '</span></div>'
          + '</div>';
      });
    } else {
      html += '<div style="font-size:13px;color:var(--text-light);text-align:center;padding:12px;">No quotes yet</div>';
    }
    html += '</div></div>'

    // ── Right sidebar ──
      + '<div>'

    // Auto-match client by phone/email/name
    var matchedClient = null;
    if (r.clientId) {
      matchedClient = DB.clients.getById(r.clientId);
    }
    if (!matchedClient && r.phone) {
      var ph = r.phone.replace(/\D/g,'');
      matchedClient = DB.clients.getAll().find(function(c) { return c.phone && c.phone.replace(/\D/g,'') === ph; });
    }
    if (!matchedClient && r.email) {
      var em = r.email.toLowerCase();
      matchedClient = DB.clients.getAll().find(function(c) { return c.email && c.email.toLowerCase() === em; });
    }
    if (!matchedClient && r.clientName) {
      matchedClient = DB.clients.getAll().find(function(c) { return c.name && c.name.toLowerCase() === r.clientName.toLowerCase(); });
    }
    // Auto-link if found but not linked
    if (matchedClient && !r.clientId) {
      DB.requests.update(r.id, { clientId: matchedClient.id });
      r.clientId = matchedClient.id;
    }

    // Client history
    var clientQuotes = matchedClient ? DB.quotes.getAll().filter(function(q) { return q.clientId === matchedClient.id; }) : [];
    var clientJobs = matchedClient ? DB.jobs.getAll().filter(function(j) { return j.clientId === matchedClient.id; }) : [];
    var clientInvoices = matchedClient ? DB.invoices.getAll().filter(function(i) { return i.clientId === matchedClient.id; }) : [];
    var clientRevenue = clientInvoices.filter(function(i) { return i.status === 'paid'; }).reduce(function(s,i) { return s + (i.total||0); }, 0);

    html
    // Contact card with client history
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;">Client</h4>'
      + '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">' + UI.esc(r.clientName || '—')
      + (matchedClient ? ' <span style="font-size:11px;color:var(--green-dark);font-weight:600;">● Existing</span>' : ' <span style="font-size:11px;color:#e07c24;font-weight:600;">● New Lead</span>')
      + '</div>'
      + (r.property ? '<a href="https://maps.apple.com/?daddr=' + encodeURIComponent(r.property) + '" target="_blank" rel="noopener noreferrer" style="display:block;font-size:13px;color:var(--accent);margin-bottom:8px;text-decoration:none;">📍 ' + UI.esc(r.property) + ' →</a>' : '')
      + (r.phone ? '<a href="tel:' + r.phone.replace(/\D/g,'') + '" class="btn btn-outline" style="width:100%;justify-content:center;margin-bottom:6px;font-size:13px;">📞 ' + UI.phone(r.phone) + '</a>' : '')
      + (r.phone ? '<button class="btn btn-outline" style="width:100%;justify-content:center;margin-bottom:6px;font-size:13px;" onclick="if(typeof Dialpad!==\'undefined\'){Dialpad.showTextModal(\'' + r.phone.replace(/\D/g,'') + '\',\'Hi ' + UI.esc((r.clientName||'').split(' ')[0]||'there') + ', thanks for reaching out to \' + RequestsPage._co().name + \'! We received your request and will follow up shortly. Questions? Call \' + RequestsPage._co().phone + \'.\');}else{window.location=\'sms:' + r.phone.replace(/\D/g,'') + '\';}">💬 Text</button>' : '')
      + (r.email ? '<a href="mailto:' + r.email + '" class="btn btn-outline" style="width:100%;justify-content:center;margin-bottom:6px;font-size:13px;">✉️ ' + UI.esc(r.email) + '</a>' : '')
      + (r.property ? '<a href="https://maps.apple.com/?daddr=' + encodeURIComponent(r.property) + '" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="width:100%;justify-content:center;font-size:13px;">🗺 Directions</a>' : '')
      + (matchedClient ? '<div style="border-top:1px solid var(--border);margin-top:12px;padding-top:12px;">'
        + '<div style="font-size:12px;color:var(--text-light);margin-bottom:6px;">CLIENT HISTORY</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px;">'
        + '<div style="background:var(--bg);padding:6px 8px;border-radius:6px;text-align:center;"><div style="font-weight:700;">' + clientQuotes.length + '</div><div style="font-size:11px;color:var(--text-light);">quotes</div></div>'
        + '<div style="background:var(--bg);padding:6px 8px;border-radius:6px;text-align:center;"><div style="font-weight:700;">' + clientJobs.length + '</div><div style="font-size:11px;color:var(--text-light);">jobs</div></div>'
        + '<div style="background:var(--bg);padding:6px 8px;border-radius:6px;text-align:center;"><div style="font-weight:700;">' + clientInvoices.length + '</div><div style="font-size:11px;color:var(--text-light);">invoices</div></div>'
        + '<div style="background:var(--bg);padding:6px 8px;border-radius:6px;text-align:center;"><div style="font-weight:700;color:var(--green-dark);">' + UI.moneyInt(clientRevenue) + '</div><div style="font-size:11px;color:var(--text-light);">revenue</div></div>'
        + '</div>'
        + '<a onclick="ClientsPage.showDetail(\'' + matchedClient.id + '\')" style="display:block;text-align:center;font-size:12px;color:var(--accent);margin-top:8px;cursor:pointer;">View Full Client Profile →</a>'
        + '</div>' : '')
      + '</div>'

    // Assessment date card
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">Assessment Date</h4>'
      + '<input type="date" id="req-assess-date" value="' + (r.assessmentDate || '') + '" style="width:100%;padding:8px 10px;border:2px solid var(--border);border-radius:8px;font-size:13px;margin-bottom:8px;">'
      + '<button onclick="RequestsPage._saveAssessmentDate(\'' + r.id + '\')" class="btn btn-primary" style="width:100%;font-size:13px;">Save Date</button>'
      + '</div>'

    // Assessment photos
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">Assessment Photos</h4>';
    if (typeof Photos !== 'undefined') { html += Photos.renderGallery('request', r.id); }
    else { html += '<div style="color:var(--text-light);font-size:13px;">No photos yet</div>'; }
    html += '</div>'

    // Quick info
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">Details</h4>'
      + '<table style="width:100%;font-size:12px;border-collapse:collapse;">'
      + '<tr><td style="padding:4px 0;color:var(--text-light);">Request #</td><td style="padding:4px 0;text-align:right;font-weight:600;">' + (r.requestNumber ? 'R' + r.requestNumber : (r.id||'').slice(-6).toUpperCase()) + '</td></tr>'
      + '<tr><td style="padding:4px 0;color:var(--text-light);">Received</td><td style="padding:4px 0;text-align:right;">' + UI.dateShort(r.createdAt) + '</td></tr>'
      + '<tr><td style="padding:4px 0;color:var(--text-light);">Source</td><td style="padding:4px 0;text-align:right;font-weight:600;">' + (r.source || '—') + '</td></tr>'
      + (r.confirmationSentAt ? '<tr><td style="padding:4px 0;color:var(--text-light);">Confirmed</td><td style="padding:4px 0;text-align:right;">' + UI.dateShort(r.confirmationSentAt) + '</td></tr>' : '')
      + '</table>'
      + '</div>'

      + '</div></div></div>';

    document.getElementById('pageTitle').textContent = 'Request — ' + (r.clientName || '');
    document.getElementById('pageContent').innerHTML = html;
    document.getElementById('pageAction').style.display = 'none';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  _saveAssessmentDate: function(id) {
    var val = (document.getElementById('req-assess-date')||{}).value;
    DB.requests.update(id, { assessmentDate: val, status: val ? 'assessment_scheduled' : 'new' });
    UI.toast(val ? 'Assessment scheduled for ' + UI.dateShort(val) : 'Assessment date cleared');
    RequestsPage.showDetail(id);
  },

  setStatus: function(id, status) {
    DB.requests.update(id, { status: status });
    UI.toast('Status updated to ' + RequestsPage._statusLabel(status));
    RequestsPage.showDetail(id);
  },

  _archiveRequest: function(id) {
    if (!confirm('Archive this request? You can restore it from the Archive page.')) return;
    DB.requests.update(id, { status: 'archived' });
    UI.toast('Request archived');
    loadPage('requests');
  },

  _updateStatus: function(id, status) {
    DB.requests.update(id, { status: status });
    UI.toast(status === 'archived' ? 'Request archived' : 'Status updated to ' + RequestsPage._statusLabel(status));
    loadPage('requests');
  },

  _createQuote: function(requestId, clientId, clientName) {
    DB.requests.update(requestId, { status: 'converted' });
    UI.toast('Request marked as converted');
    var resolvedId = clientId;
    if (clientId && !DB.clients.getById(clientId) && clientName) {
      var allClients = JSON.parse(localStorage.getItem('bm-clients') || '[]');
      var match = allClients.find(function(c) { return c.name === clientName; });
      if (match) resolvedId = match.id;
    }
    // Pass requestId so the new quote is back-linked to its originating request
    QuotesPage.showForm(null, resolvedId, requestId);
  },

  // v461 Fast Quote — one-click request → draft quote with all known fields
  // pre-filled from the request, no modal form. Lands on the new quote's
  // detail so the user can edit line items if needed. Solves the funnel-audit
  // finding "Request → Quote takes 3 clicks." Now it's 1.
  _fastCreateQuote: function(requestId) {
    var r = DB.requests.getById(requestId);
    if (!r) { UI.toast('Request not found', 'error'); return; }

    // Resolve client (might be missing from old requests; create-or-match)
    var clientId = r.clientId || '';
    if (clientId && !DB.clients.getById(clientId)) clientId = '';
    if (!clientId && r.clientName) {
      var allClients = DB.clients.getAll();
      var match = allClients.find(function(c) { return (c.name || '').toLowerCase() === r.clientName.toLowerCase(); });
      if (match) clientId = match.id;
    }
    // Last resort: spin up a client record from the request data so the quote
    // doesn't end up orphaned. Mirrors the auto-create on the manual flow.
    if (!clientId && r.clientName) {
      var newClient = DB.clients.create({
        name: r.clientName,
        phone: r.phone || '',
        email: r.email || '',
        address: r.property || '',
        status: 'lead',
        source: r.source || 'request',
        notes: r.notes || ''
      });
      clientId = newClient.id;
    }

    var client = clientId ? DB.clients.getById(clientId) : null;
    var quote = DB.quotes.create({
      clientId: clientId,
      clientName: r.clientName || (client && client.name) || '',
      clientEmail: r.email || (client && client.email) || '',
      clientPhone: r.phone || (client && client.phone) || '',
      property: r.property || (client && client.address) || '',
      description: r.notes || '',
      lineItems: [],
      total: 0,
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      status: 'draft',
      requestId: requestId,
      photos: r.photos || [],
      photo: (r.photos && r.photos[0]) || ''
    });

    DB.requests.update(requestId, { status: 'converted', quoteId: quote.id });
    UI.toast('⚡ Fast Quote draft #' + (quote.quoteNumber || '?') + ' created');
    loadPage('quotes');
    setTimeout(function() {
      if (typeof QuotesPage !== 'undefined' && QuotesPage.showDetail) QuotesPage.showDetail(quote.id);
    }, 100);
  },

  _sendConfirmation: function(id) {
    var r = DB.requests.getById(id);
    if (!r || !r.email) { UI.toast('No email on file for this request', 'error'); return; }
    var firstName = (r.clientName || '').split(' ')[0] || 'there';
    var co = RequestsPage._co();
    var subject = 'We received your request — ' + co.name;
    var body = 'Hi ' + firstName + ',\n\n'
      + 'Thanks for reaching out to ' + co.name + '! We\'ve received your request and will be in touch within 1 business day to schedule a free assessment.\n\n'
      + (r.service ? '🌳 Service: ' + r.service + '\n' : '')
      + (r.notes ? '📋 Details: ' + r.notes + '\n' : '')
      + (r.property ? '📍 Property: ' + r.property + '\n' : '')
      + '\nFeel free to call or text us at ' + co.phone + ' with any questions.\n\n'
      + CompanyInfo.get('ownerName') + '\n' + co.name + '\n' + co.phone + '\n' + co.email + '\nLicensed & Fully Insured';

    var html = '<div style="padding:4px;">'
      + '<div style="background:#e8f5e9;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#1a3c12;">📧 Sending to <strong>' + r.email + '</strong></div>'
      + '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Subject</label>'
      + '<input type="text" id="rc-subject" value="' + UI.esc(subject) + '" style="width:100%;padding:8px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Message</label>'
      + '<textarea id="rc-body" rows="12" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:13px;line-height:1.6;font-family:inherit;resize:vertical;">' + body + '</textarea></div>'
      + '</div>';

    UI.showModal('Send Request Confirmation', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="RequestsPage._confirmSendConfirmation(\'' + id + '\')">📧 Send Now</button>'
    });
  },

  _confirmSendConfirmation: function(id) {
    var r = DB.requests.getById(id);
    if (!r) return;
    var subject = (document.getElementById('rc-subject')||{}).value;
    var body = (document.getElementById('rc-body')||{}).value;
    if (typeof Email !== 'undefined' && Email.isConfigured()) {
      Email.send(r.email, subject, body);
    } else {
      window.open('mailto:' + r.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body), '_blank');
    }
    DB.requests.update(id, { confirmationSentAt: new Date().toISOString(), status: 'assessment_scheduled' });
    UI.closeModal();
    UI.toast('Confirmation sent to ' + r.email + ' ✅');
    RequestsPage.showDetail(id);
  },

  _updateBulk: function() {
    var bar = document.getElementById('req-bulk-bar');
    var count = document.querySelectorAll('.req-check:checked').length;
    if (!bar) return;
    bar.style.display = count > 0 ? 'flex' : 'none';
    var cntEl = document.getElementById('req-bulk-count');
    if (cntEl) cntEl.textContent = count + ' selected';
  },
  _bulkIds: function() { return Array.from(document.querySelectorAll('.req-check:checked')).map(function(cb){ return cb.value; }); },
  _bulkClear: function() { document.querySelectorAll('.req-check:checked').forEach(function(cb){ cb.checked = false; }); RequestsPage._updateBulk(); },
  _bulkDelete: function() {
    var ids = RequestsPage._bulkIds();
    if (!ids.length) return;
    if (!confirm('Delete ' + ids.length + ' request(s)?')) return;
    ids.forEach(function(id){ DB.requests.remove(id); });
    UI.toast(ids.length + ' request(s) deleted');
    loadPage('requests');
  },
  _bulkIgnore: function() {
    var ids = RequestsPage._bulkIds();
    if (!ids.length) return;
    ids.forEach(function(id){ DB.requests.update(id, { status: 'ignored' }); });
    UI.toast(ids.length + ' request(s) marked ignored');
    loadPage('requests');
  },
  _bulkConvert: function() {
    var ids = RequestsPage._bulkIds();
    if (!ids.length) return;
    if (!confirm('Create quotes from ' + ids.length + ' request(s)?')) return;
    var made = 0;
    ids.forEach(function(id) {
      var r = DB.requests.getById(id);
      if (!r) return;
      DB.quotes.create({
        clientId: r.clientId || null,
        clientName: r.clientName || '',
        property: r.property || '',
        description: r.description || r.title || '',
        lineItems: [],
        subtotal: 0, taxRate: 8.375, taxAmount: 0, total: 0,
        status: 'draft',
        requestId: r.id,
        createdAt: new Date().toISOString()
      });
      DB.requests.update(r.id, { status: 'converted' });
      made++;
    });
    UI.toast(made + ' quote(s) created');
    loadPage('quotes');
  }
};
