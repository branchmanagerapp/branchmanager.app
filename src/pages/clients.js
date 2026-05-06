/**
 * Branch Manager — Clients Page
 * Full client list, detail view, add/edit forms
 * v12
 */
var ClientsPage = {
  _page: 0,
  _perPage: 50,
  _filter: 'all',
  _search: '',
  _sort: 'updatedAt',
  _sortDir: -1,
  _tagFilter: '',

  _co: function() {
    return {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      website: CompanyInfo.get('website')
    };
  },

  _pendingDetail: null,

  render: function() {
    var self = ClientsPage;
    // Check if we need to show a detail immediately
    if (self._pendingDetail) {
      var _pid = self._pendingDetail;
      self._pendingDetail = null;
      setTimeout(function() { ClientsPage.showDetail(_pid); }, 50);
    }
    // Click handler with scroll detection — only fires on real taps, not scroll gestures
    setTimeout(function() {
      var cards = document.querySelectorAll('[data-cid]');
      cards.forEach(function(card) {
        if (card._bmHandled) return;
        card._bmHandled = true;
        var startX = 0, startY = 0, moved = false;
        card.addEventListener('touchstart', function(e) {
          var t = e.touches[0];
          startX = t.clientX; startY = t.clientY; moved = false;
        }, { passive: true });
        card.addEventListener('touchmove', function(e) {
          var t = e.touches[0];
          if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) moved = true;
        }, { passive: true });
        card.addEventListener('click', function() {
          if (moved) return; // scroll, not tap
          var cid = this.getAttribute('data-cid');
          if (cid) ClientsPage.showDetail(cid);
        });
      });
    }, 100);
    var stats = DB.dashboard.getStats();
    var clients = self._getFiltered();

    // Stats row — single-pass through all clients (was 6 separate .filter() passes)
    var now = new Date();
    var ago30 = new Date(); ago30.setDate(ago30.getDate()-30);
    var curYear = now.getFullYear();
    var allClients = DB.clients.getAll();
    var activeCount = 0, leadCount = 0, noEmailCount = 0, newLeads30 = 0, newClients30 = 0, ytdClients = 0;
    for (var _si = 0; _si < allClients.length; _si++) {
      var _c = allClients[_si];
      var _st = _c.status; var _ca = _c.createdAt ? new Date(_c.createdAt) : null;
      if (_st === 'active') { activeCount++; if (_ca && _ca >= ago30) newClients30++; }
      else if (_st === 'lead') { leadCount++; if (_ca && _ca >= ago30) newLeads30++; }
      if (_st !== 'archived' && !_c.email) noEmailCount++;
      if (_ca && _ca.getFullYear() === curYear) ytdClients++;
    }

    var html = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px;background:var(--white);" class="stat-row">'
      // Overview — colored-dot mini-rows that filter the list
      + '<div style="padding:14px 16px;border-right:1px solid var(--border);">'
      +   '<div style="font-size:14px;font-weight:700;margin-bottom:8px;">Overview</div>'
      +   '<div onclick="ClientsPage.setFilter(\'active\')" style="display:flex;justify-content:space-between;font-size:12px;cursor:pointer;padding:2px 0;"><span><span style="color:#2e7d32;">●</span> Active</span><span>' + activeCount + '</span></div>'
      +   '<div onclick="ClientsPage.setFilter(\'lead\')" style="display:flex;justify-content:space-between;font-size:12px;cursor:pointer;padding:2px 0;"><span><span style="color:#e07c24;">●</span> Lead</span><span>' + leadCount + '</span></div>'
      +   '<div onclick="ClientsPage.setFilter(\'no-email\')" style="display:flex;justify-content:space-between;font-size:12px;cursor:pointer;padding:2px 0;"><span><span style="color:#9e9e9e;">●</span> Missing email</span><span>' + noEmailCount + '</span></div>'
      + '</div>'
      // New leads (30d)
      + '<div onclick="ClientsPage.setFilter(\'lead\')" style="padding:14px 16px;border-right:1px solid var(--border);cursor:pointer;">'
      +   '<div style="font-size:14px;font-weight:700;">New leads</div>'
      +   '<div style="font-size:12px;color:var(--text-light);">Past 30 days</div>'
      +   '<div style="font-size:28px;font-weight:700;margin-top:4px;">' + newLeads30 + '</div>'
      + '</div>'
      // New clients (30d)
      + '<div onclick="ClientsPage.setFilter(\'active\')" style="padding:14px 16px;border-right:1px solid var(--border);cursor:pointer;">'
      +   '<div style="font-size:14px;font-weight:700;">New clients</div>'
      +   '<div style="font-size:12px;color:var(--text-light);">Past 30 days</div>'
      +   '<div style="font-size:28px;font-weight:700;margin-top:4px;">' + newClients30 + '</div>'
      + '</div>'
      // YTD
      + '<div onclick="ClientsPage.setFilter(\'all\')" style="padding:14px 16px;cursor:pointer;">'
      +   '<div style="font-size:14px;font-weight:700;">Total new clients</div>'
      +   '<div style="font-size:12px;color:var(--text-light);">Year to date</div>'
      +   '<div style="font-size:28px;font-weight:700;margin-top:4px;">' + ytdClients + '</div>'
      + '</div>'
      + '</div>';

    // previous system-style header + filter/search
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
      + '<h3 style="font-size:16px;font-weight:700;margin:0;">Clients</h3>'
      + '<span style="font-size:13px;color:var(--text-light);">(' + clients.length + ' results)</span>'
      + (function() {
        var chips = [['all','All'],['active','Active'],['lead','Lead'],['archived','Archived'],['no-email','📧 Missing email']];
        var out = '';
        for (var ci = 0; ci < chips.length; ci++) {
          var val = chips[ci][0], label = chips[ci][1];
          var isActive = self._filter === val;
          out += '<button onclick="ClientsPage.setFilter(\'' + val + '\')" style="font-size:12px;padding:5px 14px;border-radius:20px;border:1px solid ' + (isActive ? '#2e7d32' : 'var(--border)') + ';background:' + (isActive ? '#2e7d32' : 'var(--white)') + ';color:' + (isActive ? '#fff' : 'var(--text)') + ';cursor:pointer;font-weight:' + (isActive ? '600' : '500') + ';">' + label + '</button>';
        }
        return out;
      })()
      + (self._tagFilter ? '<button onclick="ClientsPage._tagFilter=\'\';ClientsPage._page=0;loadPage(\'clients\')" style="font-size:12px;padding:5px 14px;border-radius:20px;border:1px solid #2e7d32;background:#2e7d32;color:#fff;cursor:pointer;font-weight:600;">Tag: ' + UI.esc(self._tagFilter) + ' ✕</button>' : '<button onclick="ClientsPage.showTagFilter()" style="font-size:12px;padding:5px 14px;border-radius:20px;border:1px solid var(--border);background:var(--white);color:var(--text);cursor:pointer;font-weight:500;">Filter by tag +</button>')
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + '<div class="search-box" style="min-width:200px;max-width:280px;">'
      + '<span style="color:var(--text-light);">🔍</span>'
      + '<input type="text" id="client-search" placeholder="Search clients..." value="' + UI.esc(self._search) + '" oninput="ClientsPage.setSearch(this.value)">'
      + '</div>'
      + '<button onclick="loadPage(\'clientmap\')" style="background:none;border:1px solid var(--border);padding:7px 12px;border-radius:6px;font-size:12px;cursor:pointer;color:var(--accent);white-space:nowrap;" title="View client map">📍 Map</button>'
      + '<button onclick="loadPage(\'messaging\')" style="background:none;border:1px solid var(--border);padding:7px 12px;border-radius:6px;font-size:12px;cursor:pointer;color:var(--accent);white-space:nowrap;" title="Messages inbox">💬 Messages</button>'
      + '</div></div>';
      // + New Client button removed — universal + in topbar handles create

    // Active tag filter banner
    if (self._tagFilter) {
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;background:#e8f5e9;border:1px solid #c8e6c9;border-radius:8px;margin-bottom:12px;font-size:13px;">'
        + '<span style="color:var(--green-dark);font-weight:600;">Showing clients tagged:</span>'
        + '<span style="background:var(--green-dark);color:#fff;padding:3px 12px;border-radius:12px;font-weight:700;font-size:12px;">' + UI.esc(self._tagFilter) + '</span>'
        + '<button onclick="ClientsPage._tagFilter=\'\';ClientsPage._page=0;loadPage(\'clients\')" style="margin-left:auto;background:none;border:none;cursor:pointer;font-size:13px;color:var(--green-dark);font-weight:600;">Clear ✕</button>'
        + '</div>';
    }

    // Floating bulk bar (hidden until ≥1 client checkbox ticked)
    html += '<div id="client-bulk-bar" style="display:none;position:fixed;bottom:0;left:var(--sidebar-w,0);right:0;z-index:500;background:#1a1a2e;color:#fff;padding:12px 24px;padding-bottom:max(12px,env(safe-area-inset-bottom));align-items:center;justify-content:space-between;box-shadow:0 -4px 20px rgba(0,0,0,.3);">'
      + '<span id="client-bulk-count" style="font-weight:700;font-size:14px;">0 selected</span>'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
      +   '<button onclick="ClientsPage._bulkSetStatus(\'active\')" style="background:#2e7d32;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">✓ Active</button>'
      +   '<button onclick="ClientsPage._bulkSetStatus(\'lead\')" style="background:#e6a817;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Lead</button>'
      +   '<button onclick="ClientsPage._bulkSetStatus(\'archived\')" style="background:#455a64;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">📦 Archive</button>'
      +   '<button onclick="ClientsPage._bulkExport()" style="background:#455a64;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">📥 Export</button>'
      +   '<button onclick="ClientsPage._bulkDelete()" style="background:#c62828;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">🗑 Delete</button>'
      +   '<button onclick="ClientsPage._bulkClear()" style="background:none;color:rgba(255,255,255,.7);border:none;padding:8px 12px;font-size:16px;cursor:pointer;">&#10005;</button>'
      + '</div></div>';

    // Paginated slice — skipped when Show All is active
    var pageClients = self._showAll ? clients : clients.slice(self._page * self._perPage, (self._page + 1) * self._perPage);

    // Helper for "last activity" relative label
    function lastActLabel(c) {
      var _lastAct = c.updatedAt || c.createdAt || '';
      if (!_lastAct) return '';
      var d = new Date(_lastAct); var now = new Date();
      var days = Math.floor((now - d) / 86400000);
      if (days === 0) return 'Today';
      if (days === 1) return 'Yesterday';
      if (days < 7) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
      return UI.dateShort(_lastAct);
    }

    // ── DESKTOP table (matches Jobs page shape: data-table + sortable headers) ──
    html += '<div class="q-desktop-only" style="background:var(--white);border-radius:12px;border:1px solid var(--border);overflow:hidden;">'
      + '<table class="data-table"><thead><tr>'
      + '<th style="width:32px;"><input type="checkbox" onchange="document.querySelectorAll(\'.client-check\').forEach(function(cb){cb.checked=event.target.checked;});ClientsPage._updateBulk();" title="Select all"></th>'
      + self._sortHeader('Client', 'name')
      + self._sortHeader('Status', 'status')
      + '<th>Address</th>'
      + self._sortHeader('Last activity', 'updatedAt')
      + '</tr></thead><tbody>';

    if (pageClients.length === 0) {
      html += '<tr><td colspan="5">' + (self._search ? '<div style="text-align:center;padding:24px;color:var(--text-light);">No clients match "' + UI.esc(self._search) + '"</div>' : UI.emptyState('👥', 'No clients yet', 'Add your first client or import.', '+ Add Client', 'ClientsPage.showForm()')) + '</td></tr>';
    } else {
      pageClients.forEach(function(c) {
        html += '<tr style="cursor:pointer;" onclick="ClientsPage.showDetail(\'' + c.id + '\')">'
          + '<td onclick="event.stopPropagation()"><input type="checkbox" class="client-check" value="' + c.id + '" onchange="ClientsPage._updateBulk()" style="width:16px;height:16px;"></td>'
          + '<td><strong>' + UI.esc(c.name || 'Unnamed') + '</strong>'
          + (c.company ? '<div style="font-size:12px;color:var(--text-light);font-weight:400;">' + UI.esc(c.company) + '</div>' : '')
          + (c.tags && c.tags.length ? '<div style="margin-top:3px;display:flex;gap:4px;flex-wrap:wrap;">' + c.tags.slice(0, 3).map(function(t) {
              return '<span style="padding:1px 7px;background:var(--green-bg);border-radius:8px;font-size:10px;font-weight:600;color:var(--green-dark);">' + UI.esc(t) + '</span>';
            }).join('') + (c.tags.length > 3 ? '<span style="font-size:10px;color:var(--text-light);margin-left:4px;">+' + (c.tags.length - 3) + '</span>' : '') + '</div>' : '')
          + '</td>'
          + '<td>' + UI.statusBadge(c.status) + '</td>'
          + '<td style="font-size:13px;color:var(--text-light);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + UI.esc(c.address || '') + '">' + UI.esc(c.address || '—') + '</td>'
          + '<td style="white-space:nowrap;font-size:12px;color:var(--text-light);">' + lastActLabel(c) + '</td>'
          + '</tr>';
      });
    }
    html += '</tbody></table></div>';

    // ── MOBILE cards (kept as avatar/gradient style) ──
    if (pageClients.length > 0) {
      html += '<div class="q-mobile-only" style="display:none;flex-direction:column;gap:10px;">';
      pageClients.forEach(function(c) {
        var initials = (c.name || '')
          .split(/\s+/).filter(Boolean).slice(0, 2)
          .map(function(w) { return w.charAt(0).toUpperCase(); }).join('') || '?';
        var statusColor = c.status === 'active' ? '#2e7d32' : c.status === 'lead' ? '#e07c24' : '#9e9e9e';
        var _lastActLabel = lastActLabel(c);
        html += '<div class="client-card" data-status="' + c.status + '" data-cid="' + c.id + '" '
          + 'style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:14px 16px;cursor:pointer;'
          + 'box-shadow:0 1px 3px rgba(0,0,0,0.04);transition:box-shadow .15s,transform .1s;display:flex;align-items:center;gap:14px;-webkit-tap-highlight-color:transparent;">'
          + '<div onclick="event.stopPropagation()" style="flex-shrink:0;"><input type="checkbox" class="client-check" value="' + c.id + '" onchange="ClientsPage._updateBulk()" style="width:18px;height:18px;"></div>'
          + '<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,' + statusColor + '22,' + statusColor + '44);color:' + statusColor + ';display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0;">' + initials + '</div>'
          + '<div style="flex:1;min-width:0;">'
          +   '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;flex-wrap:wrap;">'
          +     '<strong style="font-size:15px;color:var(--text);">' + UI.esc(c.name || 'Unnamed') + '</strong>'
          +     UI.statusBadge(c.status)
          +   '</div>'
          +   (c.company ? '<div style="font-size:12px;color:var(--text-light);">' + UI.esc(c.company) + '</div>' : '')
          +   (c.address ? '<div style="font-size:13px;color:var(--text-light);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📍 ' + UI.esc(c.address) + '</div>' : '')
          + '</div>'
          + '<div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;gap:2px;">'
          +   (_lastActLabel ? '<div style="font-size:11px;color:var(--text-light);">' + _lastActLabel + '</div>' : '')
          +   '<div style="font-size:18px;color:var(--text-light);">›</div>'
          + '</div>'
          + '</div>';
      });
      html += '</div>';
    }

    // Pagination
    var totalPages = Math.ceil(clients.length / self._perPage);
    if (totalPages > 1 || self._showAll) {
      html += '<div style="display:flex;justify-content:center;align-items:center;gap:4px;margin-top:12px;flex-wrap:wrap;">';
      if (!self._showAll) {
        html += '<button class="btn btn-outline" onclick="ClientsPage.goPage(0)" style="font-size:12px;padding:5px 10px;"' + (self._page === 0 ? ' disabled' : '') + '>«</button>';
        html += '<button class="btn btn-outline" onclick="ClientsPage.goPage(' + (self._page - 1) + ')" style="font-size:12px;padding:5px 10px;"' + (self._page === 0 ? ' disabled' : '') + '>‹</button>';
        var startP = Math.max(0, self._page - 2);
        var endP = Math.min(totalPages - 1, startP + 4);
        for (var p = startP; p <= endP; p++) {
          html += '<button class="btn ' + (p === self._page ? 'btn-primary' : 'btn-outline') + '" onclick="ClientsPage.goPage(' + p + ')" style="font-size:12px;padding:5px 10px;min-width:32px;">' + (p + 1) + '</button>';
        }
        html += '<button class="btn btn-outline" onclick="ClientsPage.goPage(' + (self._page + 1) + ')" style="font-size:12px;padding:5px 10px;"' + (self._page >= totalPages - 1 ? ' disabled' : '') + '>›</button>';
        html += '<button class="btn btn-outline" onclick="ClientsPage.goPage(' + (totalPages - 1) + ')" style="font-size:12px;padding:5px 10px;"' + (self._page >= totalPages - 1 ? ' disabled' : '') + '>»</button>';
      }
      html += '<button class="btn btn-outline" onclick="ClientsPage._toggleShowAll()" style="font-size:12px;padding:5px 12px;margin-left:8px;">'
        + (self._showAll ? 'Paginate (' + self._perPage + '/page)' : 'Show all ' + clients.length)
        + '</button>';
      html += '</div>';
    }

    return html;
  },

  _sortHeader: function(label, field) {
    var arrow = ClientsPage._sort === field ? (ClientsPage._sortDir === 1 ? ' ▲' : ' ▼') : '';
    return '<th onclick="ClientsPage.setSort(\'' + field + '\')" style="cursor:pointer;user-select:none;">' + label + '<span style="font-size:10px;color:var(--text-light);">' + arrow + '</span></th>';
  },

  _getFiltered: function() {
    var self = ClientsPage;
    var clients = DB.clients.getAll();
    // Hide archived from default list view (Archive page surfaces them)
    clients = clients.filter(function(c) { return c.archived !== true; });

    // Filter by status (or special filters)
    if (self._filter === 'no-email') {
      clients = clients.filter(function(c) { return !c.email; });
    } else if (self._filter !== 'all') {
      clients = clients.filter(function(c) { return c.status === self._filter; });
    }

    // Filter by tag
    if (self._tagFilter) {
      var tagQ = self._tagFilter.toLowerCase();
      clients = clients.filter(function(c) {
        return c.tags && c.tags.some(function(t) { return t.toLowerCase() === tagQ; });
      });
    }

    // Search
    if (self._search && self._search.length >= 2) {
      var q = self._search.toLowerCase();
      clients = clients.filter(function(c) {
        return (c.name || '').toLowerCase().indexOf(q) >= 0
          || (c.address || '').toLowerCase().indexOf(q) >= 0
          || (c.phone || '').replace(/\D/g, '').indexOf(q.replace(/\D/g, '')) >= 0
          || (c.email || '').toLowerCase().indexOf(q) >= 0
          || (c.company || '').toLowerCase().indexOf(q) >= 0;
      });
    }

    // Sort
    clients.sort(function(a, b) {
      var va = (a[self._sort] || '').toString().toLowerCase();
      var vb = (b[self._sort] || '').toString().toLowerCase();
      return va < vb ? -self._sortDir : va > vb ? self._sortDir : 0;
    });

    return clients;
  },

  setFilter: function(f) { ClientsPage._filter = f; ClientsPage._page = 0; loadPage('clients'); },
  setSearch: function(q) { ClientsPage._search = q; ClientsPage._page = 0; loadPage('clients'); },
  setSort: function(field) {
    if (ClientsPage._sort === field) { ClientsPage._sortDir *= -1; }
    else { ClientsPage._sort = field; ClientsPage._sortDir = 1; }
    loadPage('clients');
  },
  _toggleShowAll: function() { ClientsPage._showAll = !ClientsPage._showAll; ClientsPage._page = 0; loadPage('clients'); },

  goPage: function(p) {
    var total = Math.ceil(ClientsPage._getFiltered().length / ClientsPage._perPage);
    ClientsPage._page = Math.max(0, Math.min(p, total - 1));
    loadPage('clients');
  },

  filter: function(status, btn) {
    ClientsPage.setFilter(status);
  },

  showTagFilter: function() {
    // If already filtering by tag, clear it
    if (ClientsPage._tagFilter) {
      ClientsPage._tagFilter = '';
      ClientsPage._page = 0;
      loadPage('clients');
      return;
    }
    // Collect all unique tags across all clients
    var allTags = {};
    DB.clients.getAll().forEach(function(c) {
      if (c.tags && c.tags.length) {
        c.tags.forEach(function(t) {
          var key = t.toLowerCase().trim();
          if (key) {
            if (!allTags[key]) allTags[key] = { name: t.trim(), count: 0 };
            allTags[key].count++;
          }
        });
      }
    });
    var tagList = Object.keys(allTags).sort().map(function(k) { return allTags[k]; });

    if (tagList.length === 0) {
      UI.toast('No tags found — add tags to clients first');
      return;
    }

    // Default tags to suggest
    var defaultTags = ['VIP', 'Commercial', 'Residential', 'Repeat', 'Referral', 'Difficult Access', 'HOA', 'Property Manager', 'Emergency', 'Seasonal'];

    var html = '<div style="margin-bottom:16px;">'
      + '<div style="font-size:12px;font-weight:600;text-transform:uppercase;color:var(--text-light);margin-bottom:8px;">Active Tags</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    tagList.forEach(function(t) {
      html += '<button onclick="ClientsPage.setTagFilter(\'' + UI.esc(t.name).replace(/'/g, "\\'") + '\')" style="display:inline-flex;align-items:center;gap:4px;padding:6px 14px;background:var(--green-bg);border:1px solid #c8e6c9;border-radius:20px;font-size:13px;font-weight:600;color:var(--green-dark);cursor:pointer;">'
        + UI.esc(t.name) + ' <span style="background:var(--green-dark);color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700;">' + t.count + '</span></button>';
    });
    html += '</div></div>';

    // Suggested tags section
    var existingKeys = Object.keys(allTags);
    var suggestions = defaultTags.filter(function(t) { return existingKeys.indexOf(t.toLowerCase()) === -1; });
    if (suggestions.length) {
      html += '<div style="font-size:12px;font-weight:600;text-transform:uppercase;color:var(--text-light);margin-bottom:8px;margin-top:8px;">Suggested Tags</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
      suggestions.forEach(function(t) {
        html += '<span style="padding:6px 14px;background:var(--bg);border:1px dashed var(--border);border-radius:20px;font-size:13px;color:var(--text-light);">' + t + '</span>';
      });
      html += '</div>';
    }

    UI.showModal('Filter by Tag', html);
  },

  setTagFilter: function(tag) {
    ClientsPage._tagFilter = tag;
    ClientsPage._page = 0;
    UI.closeModal();
    loadPage('clients');
  },

  addTagToClient: function(clientId, tag) {
    var c = DB.clients.getById(clientId);
    if (!c) return;
    var tags = c.tags || [];
    var tagLower = tag.toLowerCase().trim();
    var exists = tags.some(function(t) { return t.toLowerCase() === tagLower; });
    if (!exists) {
      tags.push(tag.trim());
      DB.clients.update(clientId, { tags: tags });
      UI.toast('Tag added: ' + tag);
    }
  },

  _editNote: function(clientId) {
    var v = document.getElementById('client-note-view-' + clientId);
    var e = document.getElementById('client-note-edit-' + clientId);
    if (v) v.style.display = 'none';
    if (e) e.style.display = 'block';
    var ta = document.getElementById('client-note-ta-' + clientId);
    if (ta) ta.focus();
  },

  _cancelNote: function(clientId) {
    var v = document.getElementById('client-note-view-' + clientId);
    var e = document.getElementById('client-note-edit-' + clientId);
    if (v) v.style.display = 'block';
    if (e) e.style.display = 'none';
  },

  _saveNote: function(clientId) {
    var ta = document.getElementById('client-note-ta-' + clientId);
    if (!ta) return;
    var notes = ta.value.trim();
    DB.clients.update(clientId, { notes: notes });
    var v = document.getElementById('client-note-view-' + clientId);
    if (v) {
      v.textContent = notes || 'No notes yet. Click Edit to add notes.';
      v.style.color = notes ? 'var(--text)' : 'var(--text-light)';
      v.style.display = 'block';
    }
    var e = document.getElementById('client-note-edit-' + clientId);
    if (e) e.style.display = 'none';
    UI.toast('Notes saved');
  },

  _copyPortalLink: function(clientId) {
    var link = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/') + 'client.html?id=' + clientId;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(function() { UI.toast('Portal link copied!'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      UI.toast('Portal link copied!');
    }
  },

  _showContactPicker: function(clientId) {
    var c = DB.clients.getById(clientId);
    if (!c || !c.phone) return;
    var phoneClean = c.phone.replace(/\D/g, '');
    var telHref = 'tel:' + phoneClean;
    var smsHref = 'sms:' + phoneClean;
    var name = (c.name || '').replace(/'/g, "\\'");
    var dialpadConnected = false;
    try { dialpadConnected = !!JSON.parse(localStorage.getItem('bm-receptionist-settings') || '{}').connected; } catch(e) {}

    var html = '<div style="padding:8px 4px;">'
      + '<div style="font-size:22px;font-weight:700;margin-bottom:4px;">' + UI.esc(c.name || 'Contact') + '</div>'
      + '<div style="font-size:15px;color:var(--text-light);margin-bottom:20px;">' + UI.phone(c.phone) + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      // Call
      + '<a href="' + telHref + '" onclick="UI.closeModal();' + (dialpadConnected ? 'Dialpad.call(\'' + phoneClean + '\',\'' + clientId + '\',\'' + name + '\');' : '') + '" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px;background:var(--green-dark);color:#fff;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">'
      + '<span style="font-size:32px;">📞</span><span>Call</span></a>'
      // Text
      + '<a href="' + smsHref + '" onclick="' + (dialpadConnected ? 'event.preventDefault();UI.closeModal();Dialpad.showTextModal(\'' + clientId + '\',\'' + name + '\',\'' + phoneClean + '\');' : 'UI.closeModal();') + '" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px;background:var(--accent);color:#fff;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">'
      + '<span style="font-size:32px;">💬</span><span>Text</span></a>'
      + '</div>'
      + (dialpadConnected ? '<div style="font-size:11px;color:var(--text-light);text-align:center;margin-top:14px;">Dialpad connected — calls & texts will sync to your inbox</div>' : '<div style="font-size:11px;color:var(--text-light);text-align:center;margin-top:14px;">Opens your phone\'s dialer. <a onclick="UI.closeModal();loadPage(\'receptionist\')" style="color:var(--accent);cursor:pointer;">Connect Dialpad</a> to log calls/texts automatically.</div>')
      + '</div>';

    UI.showModal('Contact ' + (c.name || ''), html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
    });
  },

  // Import contact from iPhone — pre-fills the New Client form
  _importVCard: function() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vcf,text/vcard,text/x-vcard';
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        var vcf = ev.target.result;
        var p = ClientsPage._parseVCard(vcf);
        if (!p.name && !p.phones.length && !p.emails.length) {
          UI.toast('Could not parse contact', 'error');
          return;
        }
        // Pre-fill the existing form
        var first = p.firstName || (p.name || '').split(' ')[0] || '';
        var last = p.lastName || (p.name || '').split(' ').slice(1).join(' ') || '';
        var phoneEl = document.getElementById('c-phone');
        var emailEl = document.getElementById('c-email');
        var addrEl = document.getElementById('c-address');
        var coEl = document.getElementById('c-company');
        var firstEl = document.getElementById('c-first');
        var lastEl = document.getElementById('c-last');
        if (firstEl && !firstEl.value) firstEl.value = first;
        if (lastEl && !lastEl.value) lastEl.value = last;
        if (phoneEl && !phoneEl.value && p.phones[0]) phoneEl.value = p.phones[0];
        if (emailEl && !emailEl.value && p.emails[0]) emailEl.value = p.emails[0];
        if (addrEl && !addrEl.value && p.addresses[0]) addrEl.value = p.addresses[0];
        if (coEl && !coEl.value && p.org) coEl.value = p.org;
        UI.toast('Contact imported — review & save');
      };
      reader.readAsText(file);
    };
    input.click();
  },

  _parseVCard: function(text) {
    var lines = text.replace(/\r\n[ \t]/g, '').split(/\r?\n/);
    var d = { name: '', firstName: '', lastName: '', phones: [], emails: [], addresses: [], org: '' };
    lines.forEach(function(line) {
      var m = line.match(/^([A-Z]+)(;[^:]+)?:(.+)$/i);
      if (!m) return;
      var field = m[1].toUpperCase();
      var value = m[3];
      if (field === 'FN') d.name = value.trim();
      else if (field === 'N') {
        var parts = value.split(';');
        d.lastName = (parts[0] || '').trim();
        d.firstName = (parts[1] || '').trim();
      }
      else if (field === 'TEL') d.phones.push(value.replace(/[^\d+]/g, '').replace(/^\+?1/, ''));
      else if (field === 'EMAIL') d.emails.push(value.trim());
      else if (field === 'ADR') {
        var a = value.split(';');
        var addr = [a[2], a[3], a[4], a[5]].filter(Boolean).join(', ');
        if (addr) d.addresses.push(addr);
      }
      else if (field === 'ORG') d.org = value.split(';')[0].trim();
    });
    return d;
  },

  _showPortalMenu: function(clientId) {
    var c = DB.clients.getById(clientId);
    if (!c) return;
    var link = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/') + 'client.html?id=' + clientId;
    var name = c.name || 'your client';
    var smsBody = 'Hi! Here\'s your ' + ClientsPage._co().name + ' portal where you can view quotes, invoices, and appointments: ' + link;
    var emailSubject = 'Your ' + ClientsPage._co().name + ' Portal';
    var emailBody = 'Hi ' + (name.split(' ')[0] || 'there') + ',\n\nHere\'s your client portal link where you can view quotes, approve work, pay invoices, and check appointments:\n\n' + link + '\n\nLet us know if you have any questions.\n\nThanks,\nDoug\n' + ClientsPage._co().name + '\n' + ClientsPage._co().phone;

    var html = '<div style="padding:4px 0;">'
      + '<div style="font-size:13px;color:var(--text-light);margin-bottom:12px;word-break:break-all;background:var(--bg);padding:8px;border-radius:6px;font-size:11px;">' + link + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:8px;">'
      + '<button onclick="navigator.clipboard?navigator.clipboard.writeText(\'' + link.replace(/'/g, "\\'") + '\').then(function(){UI.toast(\'Link copied!\');}):void(0);UI.closeModal();" class="btn btn-outline" style="justify-content:flex-start;">📋 Copy link</button>'
      + (c.phone ? '<a href="sms:' + c.phone.replace(/[^0-9+]/g,'') + '?body=' + encodeURIComponent(smsBody) + '" class="btn" style="background:var(--accent);color:#fff;text-decoration:none;display:flex;align-items:center;">📱 Text to ' + c.phone + '</a>' : '')
      + (c.email ? '<a href="mailto:' + c.email + '?subject=' + encodeURIComponent(emailSubject) + '&body=' + encodeURIComponent(emailBody) + '" class="btn btn-primary" style="text-decoration:none;display:flex;align-items:center;">✉️ Email to ' + c.email + '</a>' : '')
      + '</div></div>';

    UI.modal('Share Client Portal — ' + name, html);
  },

  removeTagFromClient: function(clientId, tag) {
    var c = DB.clients.getById(clientId);
    if (!c) return;
    var tags = (c.tags || []).filter(function(t) { return t.toLowerCase() !== tag.toLowerCase(); });
    DB.clients.update(clientId, { tags: tags });
    UI.toast('Tag removed');
    ClientsPage.showDetail(clientId);
  },

  showAddTagModal: function(clientId) {
    var c = DB.clients.getById(clientId);
    if (!c) return;
    var existing = (c.tags || []).map(function(t) { return t.toLowerCase(); });

    // Collect all tags used across all clients for suggestions
    var allTags = {};
    DB.clients.getAll().forEach(function(cl) {
      if (cl.tags && cl.tags.length) {
        cl.tags.forEach(function(t) {
          var key = t.toLowerCase().trim();
          if (key && existing.indexOf(key) === -1) {
            allTags[key] = t.trim();
          }
        });
      }
    });

    var defaultTags = ['VIP', 'Commercial', 'Residential', 'Repeat', 'Referral', 'Difficult Access', 'HOA', 'Property Manager', 'Emergency', 'Seasonal'];
    var suggestTags = defaultTags.filter(function(t) { return existing.indexOf(t.toLowerCase()) === -1; });
    // Add any custom tags from other clients
    Object.keys(allTags).forEach(function(k) {
      if (suggestTags.map(function(s) { return s.toLowerCase(); }).indexOf(k) === -1) {
        suggestTags.push(allTags[k]);
      }
    });

    var html = '<div style="margin-bottom:16px;">'
      + '<label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">New Tag</label>'
      + '<div style="display:flex;gap:8px;">'
      + '<input type="text" id="new-tag-input" placeholder="Enter tag name..." style="flex:1;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:14px;">'
      + '<button class="btn btn-primary" onclick="var v=document.getElementById(\'new-tag-input\').value.trim();if(v){ClientsPage.addTagToClient(\'' + clientId + '\',v);UI.closeModal();ClientsPage.showDetail(\'' + clientId + '\');}">Add</button>'
      + '</div></div>';

    if (suggestTags.length) {
      html += '<div style="font-size:12px;font-weight:600;text-transform:uppercase;color:var(--text-light);margin-bottom:8px;">Quick Add</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
      suggestTags.forEach(function(t) {
        html += '<button onclick="ClientsPage.addTagToClient(\'' + clientId + '\',\'' + t.replace(/'/g, "\\'") + '\');UI.closeModal();ClientsPage.showDetail(\'' + clientId + '\');" style="padding:6px 14px;background:var(--bg);border:1px solid var(--border);border-radius:20px;font-size:13px;cursor:pointer;font-weight:500;">' + UI.esc(t) + '</button>';
      });
      html += '</div>';
    }

    UI.showModal('Add Tag to ' + UI.esc(c.name), html);
  },

  showForm: function(id) {
    var c = id ? DB.clients.getById(id) : {};
    var title = id ? 'Edit Client' : 'New Client';

    // Split existing name into first/last if present (for edits)
    var _fn = c.firstName || '';
    var _ln = c.lastName || '';
    if (!_fn && !_ln && c.name) {
      var _parts = (c.name || '').trim().split(/\s+/);
      _fn = _parts[0] || '';
      _ln = _parts.slice(1).join(' ') || '';
    }

    var html = '<form id="client-form" onsubmit="ClientsPage.save(event, \'' + (id || '') + '\')">'
      // Light-touch vCard import (only on new clients, no longer a heavy box)
      + (id ? '' : '<div style="margin-bottom:6px;display:flex;align-items:center;justify-content:flex-end;">'
        + '<button type="button" onclick="ClientsPage._importVCard()" style="background:none;border:none;color:var(--accent);font-size:12px;font-weight:600;cursor:pointer;padding:6px 8px;">📇 Import from iPhone Contacts</button>'
        + '</div>')

      + UI.formSection('Identity', { tight: true })
      + UI.formField('First Name *', 'text', 'c-first', _fn, { required: true, placeholder: 'First name' })
      + UI.formField('Last Name', 'text', 'c-last', _ln, { placeholder: 'Last name' })
      + UI.formField('Company', 'text', 'c-company', c.company, { placeholder: 'Company name (optional)' })

      + UI.formSection('Contact')
      + UI.formField('Phone *', 'tel', 'c-phone', c.phone, { required: true, placeholder: '(914) 555-0000' })
      + UI.formField('Email', 'email', 'c-email', c.email, { placeholder: 'email@example.com' })
      + UI.formField('Address', 'text', 'c-address', c.address, { placeholder: 'Street, City, State ZIP' })

      + UI.formSection('Source & status')
      + UI.formField('Status', 'select', 'c-status', c.status || 'lead', { options: [{value:'lead',label:'Lead'},{value:'active',label:'Active'}] })
      + UI.formField('Lead Source', 'select', 'c-source', c.source || '', { options: [
            { value: '',             label: '— Select where they came from —' },
            { value: 'Google',       label: 'Google (search / GBP)' },
            { value: 'Referral',     label: 'Word of mouth / Referral' },
            { value: 'Repeat',       label: 'Repeat customer' },
            { value: 'Yard sign',    label: 'Yard sign / Truck signage' },
            { value: 'Website form', label: 'Website booking form' },
            { value: 'Facebook',     label: 'Facebook' },
            { value: 'Instagram',    label: 'Instagram' },
            { value: 'NextDoor',     label: 'NextDoor' },
            { value: 'Yelp',         label: 'Yelp' },
            { value: 'Angie',        label: 'Angi / HomeAdvisor' },
            { value: 'Thumbtack',    label: 'Thumbtack' },
            { value: 'Drive-by',     label: 'Drive-by (saw us working)' },
            { value: 'Phone',        label: 'Direct call' },
            { value: 'Other',        label: 'Other' }
          ] })

      // Less-used fields tucked behind a disclosure so the form looks shorter on mobile
      + '<details style="margin-top:18px;">'
      +   '<summary style="cursor:pointer;list-style:none;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-light);padding:8px 0;border-top:1px solid var(--border);display:flex;align-items:center;gap:6px;">'
      +     'Tags &amp; Notes <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-light);">— optional</span>'
      +   '</summary>'
      +   UI.formField('Tags', 'text', 'c-tags', (c.tags || []).join(', '), { placeholder: 'residential, commercial (comma separated)' })
      +   UI.formField('Notes', 'textarea', 'c-notes', c.notes, { placeholder: 'Internal notes...' })
      + '</details>'
      + '</form>';

    UI.showModal(title, html, {
      footer: (id ? '<button class="btn" style="background:#c0392b;color:#fff;margin-right:auto;" onclick="ClientsPage.remove(\'' + id + '\')">Delete</button>' : '')
        + '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="document.getElementById(\'client-form\').requestSubmit()">Save Client</button>'
    });
    // v623: Photon address autocomplete on the Address field
    setTimeout(function() {
      if (UI.bindAddressAutocomplete) UI.bindAddressAutocomplete('c-address');
    }, 50);
  },

  save: function(e, id) {
    e.preventDefault();
    var _fn = (document.getElementById('c-first') || {}).value || '';
    var _ln = (document.getElementById('c-last') || {}).value || '';
    _fn = _fn.trim(); _ln = _ln.trim();
    var data = {
      firstName: _fn,
      lastName: _ln,
      name: (_fn + ' ' + _ln).trim(),
      company: document.getElementById('c-company').value.trim(),
      phone: document.getElementById('c-phone').value.trim(),
      email: document.getElementById('c-email').value.trim(),
      address: document.getElementById('c-address').value.trim(),
      status: document.getElementById('c-status').value,
      source: (document.getElementById('c-source') || {}).value || '',
      tags: document.getElementById('c-tags').value.split(',').map(function(t) { return t.trim(); }).filter(Boolean),
      notes: document.getElementById('c-notes').value.trim()
    };
    if (!data.name) { UI.toast('Name is required', 'error'); return; }

    // Optimistic UI — toast first, one page render, Supabase sync in background
    UI.toast(id ? 'Client updated ✓' : 'Client created ✓');
    if (id) {
      DB.clients.update(id, data);
      // Propagate denormalized snapshot fields to related invoices/quotes/jobs
      // so phone/email/name edits don't go stale on already-issued docs.
      ClientsPage._propagate(id, data);
    } else {
      var newClient = DB.clients.create(data);
      if (typeof SendJim !== 'undefined') SendJim.afterNewClient(newClient || data);
    }
    loadPage('clients');
  },

  // Push name/phone/email changes to all invoices, quotes, and jobs that
  // snapshot this client. Without this, editing a client's phone from the
  // invoice page only updates the client record — the invoice keeps the old
  // value baked in. (Address is intentionally NOT propagated: invoice.property
  // is the *job site*, not the billing address — they can legitimately differ.)
  _propagate: function(clientId, data) {
    var snap = { clientName: data.name, clientPhone: data.phone, clientEmail: data.email };
    ['invoices','quotes','jobs'].forEach(function(coll) {
      var rows = DB[coll].getAll().filter(function(r){ return r.clientId === clientId; });
      rows.forEach(function(r){ DB[coll].update(r.id, snap); });
    });
  },

  remove: function(id) {
    UI.confirm('Delete this client? This cannot be undone.', function() {
      DB.clients.remove(id);
      UI.toast('Client deleted');
      UI.closeModal();
      loadPage('clients');
    });
  },

  showDetail: function(id) {
    try { return ClientsPage._showDetailImpl(id); }
    catch(err) {
      console.error('[ClientsPage.showDetail] ERROR:', err);
      alert('Error opening client: ' + (err && err.message ? err.message : err) + '\n\nSee console for details.');
      var pc = document.getElementById('pageContent');
      if (pc) {
        pc.innerHTML = '<div style="padding:20px;"><h2>Error loading client</h2><pre id="cli-err-pre" style="background:#fee;padding:12px;border-radius:8px;overflow:auto;"></pre><button onclick="loadPage(\'clients\')" style="padding:10px 20px;background:#1b5e20;color:#fff;border:none;border-radius:8px;">← Back to Clients</button></div>';
        // Use textContent to avoid injecting stack traces as HTML (XSS via error messages)
        var pre = document.getElementById('cli-err-pre');
        if (pre) pre.textContent = (err && err.stack ? err.stack : String(err)).slice(0, 2000);
      }
    }
  },

  _showDetailImpl: function(id) {
    console.debug('[ClientsPage.showDetail] called with id:', id);
    if (window.bmRememberDetail) window.bmRememberDetail('clients', id);
    var c = DB.clients.getById(id);
    if (!c) {
      console.warn('[ClientsPage] Client not found:', id);
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('Client not found: ' + id, 'error');
      else alert('Client not found: ' + id);
      return;
    }
    // Scroll to top so user sees the detail
    window.scrollTo(0, 0);
    var scrollable = document.querySelector('.content') || document.querySelector('.main');
    if (scrollable) scrollable.scrollTop = 0;

    // Get related records (match by clientId OR clientName since imports may not have IDs linked)
    var cName = (c.name || '').trim().toLowerCase();
    var clientJobs = DB.jobs.getAll().filter(function(j) { return j.clientId === id || (j.clientName || '').trim().toLowerCase() === cName; });
    var clientInvoices = DB.invoices.getAll().filter(function(i) { return i.clientId === id || (i.clientName || '').trim().toLowerCase() === cName; });
    var clientQuotes = DB.quotes.getAll().filter(function(q) { return q.clientId === id || (q.clientName || '').trim().toLowerCase() === cName; });
    var clientPayments = (DB.payments && DB.payments.getByClient) ? DB.payments.getByClient(id, c.name) : [];
    clientPayments.sort(function(a, b){ return (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''); });
    var lifetimePaid = clientPayments.reduce(function(s, p){ return s + (Number(p.amount) || 0); }, 0);
    var totalRevenue = clientInvoices.filter(function(i) { return i.status === 'paid'; }).reduce(function(s, i) { return s + (i.total || 0); }, 0);
    var totalOutstanding = clientInvoices.filter(function(i) { return i.status !== 'paid'; }).reduce(function(s, i) { return s + (i.balance || i.total || 0); }, 0);
    var totalInvoiced = clientInvoices.reduce(function(s, i) { return s + (i.total || 0); }, 0);
    var completedJobs = clientJobs.filter(function(j) { return j.status === 'completed'; });
    var sortedJobsByDate = clientJobs.slice().sort(function(a, b) { return (b.scheduledDate || b.createdAt || '') > (a.scheduledDate || a.createdAt || '') ? 1 : -1; });
    var lastJobDate = sortedJobsByDate.length ? (sortedJobsByDate[0].scheduledDate || sortedJobsByDate[0].createdAt) : null;

    // ── Computed display bits ──
    var addrEsc = c.address ? UI.esc(c.address) : '';
    var phoneEsc = c.phone ? UI.phone(c.phone) : '';
    var phoneTel = c.phone ? c.phone.replace(/[^0-9+]/g, '') : '';
    var nameJs = (c.name || '').replace(/'/g, "\\'");
    var upcoming = clientJobs.filter(function(j){ return j.status === 'scheduled' || j.status === 'in_progress' || j.status === 'late'; })
      .sort(function(a, b){ return (a.scheduledDate || '').localeCompare(b.scheduledDate || ''); });

    // Town from address
    var townOnly = '';
    if (c.address) {
      var parts = c.address.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
      if (parts.length >= 3) townOnly = parts[parts.length - 3];
      else if (parts.length === 2) townOnly = parts[1];
    }

    // previous system-style client detail
    var html = ''
      + '<div style="max-width:960px;margin:0 auto;width:100%;overflow-x:hidden;box-sizing:border-box;">'

      // ── Back link ──
      + '<div style="margin-bottom:10px;">'
      +   '<a onclick="loadPage(\'clients\')" style="font-size:13px;color:var(--text-light);cursor:pointer;text-decoration:none;">← Clients</a>'
      + '</div>'

      // ── Header card ──
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px 20px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      +   '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">'
      +     '<div style="flex:1;min-width:240px;">'
      +       '<h2 style="font-size:26px;font-weight:700;margin:0 0 6px;line-height:1.2;">' + UI.esc(c.name) + '</h2>'
      +       (addrEsc
          ? '<a href="https://maps.apple.com/?daddr=' + encodeURIComponent(c.address) + '" target="_blank" rel="noopener noreferrer" style="font-size:14px;color:var(--accent);text-decoration:none;display:inline-block;margin-bottom:6px;">📍 ' + addrEsc + '</a>'
          : '<div style="font-size:13px;color:var(--text-light);margin-bottom:6px;">No address on file</div>')
      +       '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px;">'
      +         (phoneEsc ? '<a onclick="ClientsPage._showContactPicker(\'' + id + '\')" style="font-size:13px;color:var(--text);background:var(--bg);padding:4px 10px;border-radius:20px;cursor:pointer;text-decoration:none;font-weight:600;">📞 ' + phoneEsc + '</a>' : '')
      +         (c.email ? '<a href="mailto:' + c.email + '" style="font-size:13px;color:var(--text);background:var(--bg);padding:4px 10px;border-radius:20px;text-decoration:none;font-weight:600;">✉️ ' + UI.esc(c.email) + '</a>' : '')
      +         (c.status ? '<span style="font-size:12px;">' + UI.statusBadge(c.status) + '</span>' : '')
      +       '</div>'
      +       ((c.tags && c.tags.length)
          ? (function(){ var seen = {}; var uniq = c.tags.filter(function(t){ var k = (t||'').toLowerCase(); return seen[k] ? false : (seen[k] = true); });
              return '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;">'
                + uniq.map(function(t){ return '<span style="padding:3px 10px;background:var(--green-bg);color:var(--green-dark);border-radius:20px;font-size:11px;font-weight:600;">' + UI.esc(t) + '</span>'; }).join('')
                + '</div>';
            })()
          : '')
      +     '</div>'
      +     '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
      +       '<button class="btn btn-outline" style="font-size:12px;padding:6px 12px;" onclick="ClientsPage.showForm(\'' + id + '\')">Edit</button>'
      +       '<button class="btn btn-outline" style="font-size:12px;padding:6px 12px;" onclick="ClientsPage._showPortalMenu(\'' + id + '\')">🔗 Portal</button>'
      +       '<button class="btn btn-outline" style="font-size:12px;padding:6px 12px;" onclick="ClientsPage.showStatement(\'' + id + '\')">📄 Statement</button>'
      +       '<button class="btn btn-outline" style="font-size:12px;padding:6px 12px;" onclick="ClientsPage._archiveClient(\'' + id + '\')">Archive</button>'
      +     '</div>'
      +   '</div>'
      + '</div>'

      // ── Review banner (only when needs_review flag is set; e.g. after a merge) ──
      + (c.needsReview ? (
          '<div id="review-banner-' + id + '" style="background:#fff8e1;border:1px solid #ffe082;border-radius:10px;padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;">'
          + '<input type="checkbox" id="review-check-' + id + '" onchange="ClientsPage._toggleReview(\'' + id + '\', this.checked)" style="width:18px;height:18px;flex-shrink:0;cursor:pointer;">'
          + '<div style="flex:1;">'
          +   '<strong style="color:#e65100;font-size:13px;display:block;margin-bottom:2px;">Review needed</strong>'
          +   '<div style="font-size:12px;color:#666;">Check the box once you\'ve reviewed the merge notes below.</div>'
          + '</div></div>'
        ) : '')

      // ── Notes (free-form, editable, syncs to Supabase) ──
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:14px;">'
      +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      +     '<strong style="font-size:13px;color:var(--text);">Notes</strong>'
      +     '<span id="notes-status-' + id + '" style="font-size:11px;color:var(--text-light);"></span>'
      +   '</div>'
      +   '<textarea id="client-notes-' + id + '" placeholder="Anything Doug or future-Doug should know about this client. Saves on blur." onblur="ClientsPage._saveNotes(\'' + id + '\', this.value)" rows="' + Math.max(3, ((c.notes || '').match(/\n/g) || []).length + 2) + '" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;line-height:1.5;resize:vertical;box-sizing:border-box;">' + UI.esc(c.notes || '') + '</textarea>'
      + '</div>'

      // ── Primary action row ──
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:14px;">'
      +   (phoneTel ? '<button class="btn" style="background:var(--green-dark);color:#fff;font-size:13px;padding:10px;" onclick="Dialpad.call(\'' + phoneTel + '\',\'' + id + '\',\'' + nameJs + '\')">📞 Call</button>' : '')
      +   (phoneTel ? '<button class="btn" style="background:var(--accent);color:#fff;font-size:13px;padding:10px;" onclick="Dialpad.showTextModal(\'' + id + '\',\'' + nameJs + '\',\'' + phoneTel + '\')">💬 Text</button>' : '')
      +   (c.email ? '<a class="btn btn-primary" style="font-size:13px;padding:10px;text-decoration:none;text-align:center;" href="mailto:' + encodeURIComponent(c.email) + '">✉️ Email</a>' : '')
      +   '<button class="btn btn-primary" style="font-size:13px;padding:10px;" onclick="QuotesPage.showForm(null,\'' + id + '\')">+ Quote</button>'
      +   '<button class="btn btn-primary" style="font-size:13px;padding:10px;" onclick="JobsPage.showForm(null,\'' + id + '\')">+ Job</button>'
      +   '<button class="btn btn-primary" style="font-size:13px;padding:10px;" onclick="InvoicesPage.showForm(null,\'' + id + '\')">+ Invoice</button>'
      +   (c.email ? '<button class="btn" style="background:#7c3aed;color:#fff;font-size:13px;padding:10px;" onclick="ClientsPage._sendPortalInvite(\'' + id + '\')">🔗 Portal Invite</button>' : '')
      + '</div>'

      // ── 3 KPIs ──
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:18px;">'
      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px;">'
      +     '<div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-light);letter-spacing:.05em;">Lifetime Revenue</div>'
      +     '<div style="font-size:22px;font-weight:700;margin-top:4px;color:var(--green-dark);">' + UI.moneyInt(totalRevenue) + '</div>'
      +     '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">' + completedJobs.length + ' completed job' + (completedJobs.length !== 1 ? 's' : '') + '</div>'
      +   '</div>'
      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px;">'
      +     '<div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-light);letter-spacing:.05em;">Balance Due</div>'
      +     '<div style="font-size:22px;font-weight:700;margin-top:4px;' + (totalOutstanding > 0 ? 'color:var(--red);' : 'color:var(--green-dark);') + '">' + UI.moneyInt(totalOutstanding) + '</div>'
      +     '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">' + (totalOutstanding > 0 ? 'Unpaid invoices' : 'All paid up') + '</div>'
      +   '</div>'
      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px;">'
      +     '<div style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-light);letter-spacing:.05em;">Last Visit</div>'
      +     '<div style="font-size:18px;font-weight:700;margin-top:4px;">' + (lastJobDate ? UI.dateShort(lastJobDate) : '<span style="color:var(--text-light);font-size:14px;">—</span>') + '</div>'
      +     '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">' + (upcoming.length > 0 ? upcoming.length + ' upcoming' : 'None scheduled') + '</div>'
      +   '</div>'
      + '</div>'

      // ── Tabs nav ──
      + '<div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:16px;overflow-x:auto;-webkit-overflow-scrolling:touch;">'
      +   '<button class="cd-tab active" onclick="ClientsPage._tab(this,\'cd-overview\')" style="padding:10px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid var(--accent);margin-bottom:-2px;color:var(--accent);white-space:nowrap;">Overview</button>'
      +   '<button class="cd-tab" onclick="ClientsPage._tab(this,\'cd-work\')" style="padding:10px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;color:var(--text-light);white-space:nowrap;">Work (' + (clientQuotes.length + clientJobs.length) + ')</button>'
      +   '<button class="cd-tab" onclick="ClientsPage._tab(this,\'cd-billing\')" style="padding:10px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;color:var(--text-light);white-space:nowrap;">Billing (' + clientInvoices.length + ')</button>'
      +   '<button class="cd-tab" onclick="ClientsPage._tab(this,\'cd-comms\')" style="padding:10px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;color:var(--text-light);white-space:nowrap;">Comms</button>'
      +   '<button class="cd-tab" onclick="ClientsPage._tab(this,\'cd-property\')" style="padding:10px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;color:var(--text-light);white-space:nowrap;">Property</button>'
      +   '<button class="cd-tab" onclick="ClientsPage._tab(this,\'cd-about\')" style="padding:10px 16px;font-size:13px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;color:var(--text-light);white-space:nowrap;">About</button>'
      + '</div>'

      // ══════════════════════════════════════════════════════════
      // OVERVIEW TAB
      // ══════════════════════════════════════════════════════════
      + '<div id="cd-overview" class="cd-panel">'

      //  Upcoming work
      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:14px;">'
      +     '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      +       '<h3 style="font-size:16px;font-weight:700;margin:0;">Upcoming work</h3>'
      +       '<button class="btn btn-outline" style="font-size:12px;padding:5px 12px;" onclick="JobsPage.showForm(null,\'' + id + '\')">+ Schedule</button>'
      +     '</div>';
    if (upcoming.length) {
      upcoming.slice(0, 5).forEach(function(j) {
        var isLate = j.status === 'late';
        html += '<div onclick="JobsPage.showDetail(\'' + j.id + '\')" style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--bg);cursor:pointer;">'
          +   '<div style="flex:1;min-width:0;">'
          +     '<div style="font-size:13px;font-weight:600;color:' + (isLate ? 'var(--red)' : 'var(--text)') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.description || 'Job #' + (j.jobNumber || '—')) + '</div>'
          +     '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">' + (j.scheduledDate ? UI.dateShort(j.scheduledDate) : 'Unscheduled') + (isLate ? ' · OVERDUE' : '') + '</div>'
          +   '</div>'
          +   '<div style="font-size:13px;font-weight:600;color:var(--green-dark);">' + (j.total ? UI.moneyInt(j.total) : '') + '</div>'
          + '</div>';
      });
    } else {
      html += '<div style="font-size:13px;color:var(--text-light);padding:10px 0;">No upcoming work. Tap <strong>+ Schedule</strong> to add a job.</div>';
    }
    html += '</div>'

      //  Recent pricing for this property
      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:14px;">'
      +     '<h3 style="font-size:16px;font-weight:700;margin:0 0 10px;">Recent pricing</h3>';
    var recentLineItems = [];
    clientQuotes.forEach(function(q) {
      if (q.lineItems) q.lineItems.forEach(function(li) {
        recentLineItems.push({ service: li.service, quoted: li.amount || (li.qty * li.rate) });
      });
    });
    if (recentLineItems.length) {
      html += '<table style="width:100%;font-size:13px;border-collapse:collapse;">';
      recentLineItems.slice(0, 5).forEach(function(li) {
        html += '<tr><td style="padding:6px 0;">' + UI.esc(li.service || 'Custom') + '</td><td style="padding:6px 0;text-align:right;font-weight:600;">' + UI.money(li.quoted) + '</td></tr>';
      });
      html += '</table>';
    } else {
      var recentJobsForPricing = clientJobs.filter(function(j){ return j.status === 'completed' && j.total > 0; })
        .sort(function(a, b){ return (b.scheduledDate || b.createdAt || '').localeCompare(a.scheduledDate || a.createdAt || ''); })
        .slice(0, 5);
      if (recentJobsForPricing.length) {
        html += '<table style="width:100%;font-size:13px;border-collapse:collapse;">';
        recentJobsForPricing.forEach(function(j) {
          var dateStr = j.scheduledDate ? new Date(j.scheduledDate).toLocaleDateString('en-US', { month:'short', year:'numeric' }) : '—';
          html += '<tr><td style="padding:5px 0;">' + UI.esc(j.description || 'Job #' + j.jobNumber) + '</td>'
            + '<td style="padding:5px 0;color:var(--text-light);font-size:12px;">' + dateStr + '</td>'
            + '<td style="padding:5px 0;text-align:right;font-weight:600;">' + UI.moneyInt(j.total) + '</td></tr>';
        });
        html += '</table>';
      } else {
        html += '<div style="font-size:13px;color:var(--text-light);">No pricing history yet.</div>';
      }
    }
    html += '</div>';

    //  Trees summary (if any)
    var overviewTrees = TreeInventory.getForClient(id);
    if (overviewTrees.length) {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:14px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;">'
        + '<h3 style="font-size:16px;font-weight:700;margin:0;">🌳 Trees on record</h3>'
        + '<a onclick="ClientsPage._tab(document.querySelector(\'.cd-tab[onclick*=cd-property]\'),\'cd-property\')" style="font-size:12px;color:var(--accent);cursor:pointer;">View all · ' + overviewTrees.length + '</a>'
        + '</div>'
        + '</div>';
    }

    html += '</div>' // close cd-overview

      // ══════════════════════════════════════════════════════════
      // WORK TAB — quotes + jobs
      // ══════════════════════════════════════════════════════════
      + '<div id="cd-work" class="cd-panel" style="display:none;">'
      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:14px;">'
      +     '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      +       '<h3 style="font-size:16px;font-weight:700;margin:0;">Quotes (' + clientQuotes.length + ')</h3>'
      +       '<button class="btn btn-outline" style="font-size:12px;padding:5px 12px;" onclick="QuotesPage.showForm(null,\'' + id + '\')">+ New Quote</button>'
      +     '</div>';
    if (clientQuotes.length) {
      var sortedQ = clientQuotes.slice().sort(function(a, b){ return (b.createdAt || '').localeCompare(a.createdAt || ''); });
      html += '<table class="data-table"><thead><tr><th>#</th><th>Date</th><th>Description</th><th>Status</th><th style="text-align:right;">Total</th></tr></thead><tbody>';
      sortedQ.forEach(function(q) {
        html += '<tr style="cursor:pointer;" onclick="QuotesPage._pendingDetail=\'' + q.id + '\';loadPage(\'quotes\')">'
          + '<td><strong>' + (q.quoteNumber || '—') + '</strong></td>'
          + '<td style="white-space:nowrap;color:var(--text-light);font-size:12px;">' + UI.dateShort(q.createdAt) + '</td>'
          + '<td>' + UI.esc(q.description || '—') + '</td>'
          + '<td>' + UI.statusBadge(q.status) + '</td>'
          + '<td style="text-align:right;font-weight:600;">' + UI.money(q.total) + '</td></tr>';
      });
      html += '</tbody></table>';
    } else {
      html += '<div style="font-size:13px;color:var(--text-light);">No quotes yet.</div>';
    }
    html += '</div>'

      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:18px;">'
      +     '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      +       '<h3 style="font-size:16px;font-weight:700;margin:0;">Jobs (' + clientJobs.length + ')</h3>'
      +       '<button class="btn btn-outline" style="font-size:12px;padding:5px 12px;" onclick="JobsPage.showForm(null,\'' + id + '\')">+ New Job</button>'
      +     '</div>';
    if (clientJobs.length) {
      var sortedJ = clientJobs.slice().sort(function(a, b){ return (b.scheduledDate || b.createdAt || '').localeCompare(a.scheduledDate || a.createdAt || ''); });
      html += '<table class="data-table"><thead><tr><th>Date</th><th>Description</th><th>Status</th><th style="text-align:right;">Value</th></tr></thead><tbody>';
      sortedJ.forEach(function(j) {
        html += '<tr style="cursor:pointer;" onclick="JobsPage.showDetail(\'' + j.id + '\')">'
          + '<td style="white-space:nowrap;color:var(--text-light);font-size:12px;">' + UI.dateShort(j.scheduledDate) + '</td>'
          + '<td>' + UI.esc(j.description || 'Job #' + (j.jobNumber || '—')) + '</td>'
          + '<td>' + UI.statusBadge(j.status) + '</td>'
          + '<td style="text-align:right;font-weight:600;">' + UI.moneyInt(j.total) + '</td></tr>';
      });
      html += '</tbody></table>';
    } else {
      html += '<div style="font-size:13px;color:var(--text-light);">No jobs yet.</div>';
    }
    html += '</div>';

    html += '</div>' // close cd-work

      // ══════════════════════════════════════════════════════════
      // BILLING TAB
      // ══════════════════════════════════════════════════════════
      + '<div id="cd-billing" class="cd-panel" style="display:none;">'
      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:18px;">'
      +     '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      +       '<h3 style="font-size:16px;font-weight:700;margin:0;">Invoices (' + clientInvoices.length + ')</h3>'
      +       '<button class="btn btn-outline" style="font-size:12px;padding:5px 12px;" onclick="InvoicesPage.showForm(null,\'' + id + '\')">+ New Invoice</button>'
      +     '</div>';
    if (clientInvoices.length) {
      var sortedI = clientInvoices.slice().sort(function(a, b){ return (b.issueDate || b.createdAt || '').localeCompare(a.issueDate || a.createdAt || ''); });
      html += '<table class="data-table"><thead><tr><th>#</th><th>Date</th><th>Status</th><th style="text-align:right;">Total</th><th style="text-align:right;">Balance</th></tr></thead><tbody>';
      sortedI.forEach(function(inv) {
        var bal = inv.balance != null ? inv.balance : inv.total;
        html += '<tr style="cursor:pointer;" onclick="InvoicesPage.showDetail(\'' + inv.id + '\')">'
          + '<td><strong>' + (inv.invoiceNumber || '—') + '</strong></td>'
          + '<td style="white-space:nowrap;color:var(--text-light);font-size:12px;">' + UI.dateShort(inv.issueDate || inv.createdAt) + '</td>'
          + '<td>' + UI.statusBadge(inv.status) + '</td>'
          + '<td style="text-align:right;font-weight:600;">' + UI.money(inv.total || 0) + '</td>'
          + '<td style="text-align:right;font-weight:600;' + (bal > 0 ? 'color:var(--red)' : 'color:var(--green-dark)') + ';">' + UI.money(bal || 0) + '</td></tr>';
      });
      html += '</tbody></table>';
    } else {
      html += '<div style="font-size:13px;color:var(--text-light);">No invoices yet.</div>';
    }
    html += '</div>'; // close invoices card

    // ── Payment History card ──
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:18px;margin-top:14px;">'
      +     '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      +       '<h3 style="font-size:16px;font-weight:700;margin:0;">💰 Payment History (' + clientPayments.length + ')</h3>'
      +       (clientPayments.length ? '<div style="font-size:13px;color:var(--text-light);">Lifetime paid: <strong style="color:var(--green-dark);">' + UI.money(lifetimePaid) + '</strong></div>' : '')
      +     '</div>';
    if (clientPayments.length) {
      html += '<table class="data-table"><thead><tr><th>Date</th><th>Method</th><th>Invoice</th><th>Source</th><th style="text-align:right;">Amount</th></tr></thead><tbody>';
      clientPayments.forEach(function(p) {
        var methodIcon = p.method === 'card' ? '💳' : (p.method === 'check' ? '📝' : (p.method === 'cash' ? '💵' : (p.method === 'ach' ? '🏦' : '💰')));
        var methodLabel = (p.method || 'other').toUpperCase();
        var invLabel = p.invoiceNumber ? '#' + p.invoiceNumber : (p.invoiceId ? '—' : '—');
        var sourceLabel = p.source === 'legacy' ? '<span style="font-size:10px;background:#fff3e0;color:#e07c24;padding:2px 6px;border-radius:10px;">JOBBER</span>' :
                          p.source === 'stripe' ? '<span style="font-size:10px;background:#e3f2fd;color:#1976d2;padding:2px 6px;border-radius:10px;">STRIPE</span>' :
                          '<span style="font-size:10px;background:#f5f5f5;color:#666;padding:2px 6px;border-radius:10px;">' + (p.source || 'manual').toUpperCase() + '</span>';
        html += '<tr>'
          + '<td style="white-space:nowrap;color:var(--text-light);font-size:12px;">' + UI.dateShort(p.date || p.createdAt) + '</td>'
          + '<td>' + methodIcon + ' ' + methodLabel + '</td>'
          + '<td>' + (p.invoiceNumber ? '<strong>#' + p.invoiceNumber + '</strong>' : '<span style="color:var(--text-light);">—</span>') + '</td>'
          + '<td>' + sourceLabel + '</td>'
          + '<td style="text-align:right;font-weight:700;color:var(--green-dark);">' + UI.money(p.amount || 0) + '</td>'
          + '</tr>';
      });
      html += '</tbody></table>';
    } else {
      html += '<div style="font-size:13px;color:var(--text-light);">No payments recorded yet.</div>';
    }
    html += '</div></div>' // close payment-history card AND cd-billing

      // ══════════════════════════════════════════════════════════
      // COMMS TAB — activity timeline + CommsLog
      // ══════════════════════════════════════════════════════════
      + '<div id="cd-comms" class="cd-panel" style="display:none;">';
    // (timeline built below)
    html += '<div id="cd-comms-content"></div></div>' // close cd-comms

      // ══════════════════════════════════════════════════════════
      // PROPERTY TAB — address, trees, photos
      // ══════════════════════════════════════════════════════════
      + '<div id="cd-property" class="cd-panel" style="display:none;">'
      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:14px;">'
      +     '<h3 style="font-size:16px;font-weight:700;margin:0 0 10px;">Address</h3>'
      +     (addrEsc
          ? '<a href="https://maps.apple.com/?daddr=' + encodeURIComponent(c.address) + '" target="_blank" rel="noopener noreferrer" style="display:flex;gap:12px;align-items:start;text-decoration:none;color:inherit;">'
            + '<div style="width:36px;height:36px;border-radius:8px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;color:#2e7d32;flex-shrink:0;">📍</div>'
            + '<div style="font-size:14px;line-height:1.6;flex:1;">' + addrEsc.replace(/,/g, '<br>') + '<div style="font-size:11px;color:var(--accent);margin-top:2px;">Open in Maps →</div></div>'
            + '</a>'
          : '<div style="color:var(--text-light);font-size:13px;">No address on file. <a onclick="ClientsPage.showForm(\'' + id + '\')" style="color:var(--accent);cursor:pointer;">Add one →</a></div>')
      +   '</div>'

      //  Trees card
      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:14px;">'
      +     '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      +       '<h3 style="font-size:16px;font-weight:700;margin:0;">🌳 Trees (' + overviewTrees.length + ')</h3>'
      +       '<button class="btn btn-outline" style="font-size:12px;padding:5px 12px;" onclick="TreeInventory.showForm(\'' + id + '\')">+ Add Tree</button>'
      +     '</div>';
    if (overviewTrees.length === 0) {
      html += '<div style="font-size:13px;color:var(--text-light);">No trees logged yet. Useful for risk assessment + recurring work.</div>';
    } else {
      html += '<table class="data-table"><thead><tr><th>Species</th><th>DBH</th><th>Condition</th><th>Work Needed</th></tr></thead><tbody>';
      overviewTrees.forEach(function(t) {
        var condColor = { 'Excellent': '#00836c', 'Good': '#2e7d32', 'Fair': '#e6a817', 'Poor': '#e07c24', 'Hazard': '#dc3545' }[t.condition] || 'var(--text-light)';
        html += '<tr onclick="TreeInventory.showDetail(\'' + t.id + '\')" style="cursor:pointer;">'
          + '<td><strong>' + UI.esc(t.species || 'Unknown') + '</strong>' + (t.location ? '<br><span style="font-size:11px;color:var(--text-light);">📍 ' + UI.esc(t.location) + '</span>' : '') + '</td>'
          + '<td style="font-weight:600;">' + (t.dbh ? t.dbh + '"' : '—') + '</td>'
          + '<td><span style="font-weight:600;color:' + condColor + ';">' + UI.esc(t.condition || '—') + '</span></td>'
          + '<td style="font-size:12px;">' + UI.esc(t.workNeeded || '—') + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>'

      //  Photos
      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:18px;">'
      +     '<h3 style="font-size:16px;font-weight:700;margin:0 0 10px;">📷 Photos</h3>';
    if (typeof Photos !== 'undefined') {
      html += Photos.renderGallery('client', id);
    } else {
      html += '<div style="font-size:13px;color:var(--text-light);">Photo module not loaded.</div>';
    }
    html += '</div>';

    html += '</div>' // close cd-property

      // ══════════════════════════════════════════════════════════
      // ABOUT TAB — tags, notes, custom fields, contact
      // ══════════════════════════════════════════════════════════
      + '<div id="cd-about" class="cd-panel" style="display:none;">'

      //  Contact info
      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:14px;">'
      +     '<h3 style="font-size:16px;font-weight:700;margin:0 0 10px;">Contact info</h3>'
      +     '<table style="width:100%;font-size:14px;border-collapse:collapse;">'
      +       (c.phone ? '<tr><td style="padding:8px 0;color:var(--text-light);width:80px;">Phone</td><td style="padding:8px 0;"><a onclick="ClientsPage._showContactPicker(\'' + id + '\')" style="color:var(--accent);cursor:pointer;text-decoration:none;font-weight:600;">' + UI.phone(c.phone) + '</a></td></tr>' : '')
      +       (c.email ? '<tr><td style="padding:8px 0;color:var(--text-light);">Email</td><td style="padding:8px 0;"><a href="mailto:' + c.email + '" style="color:#1565c0;text-decoration:none;">' + UI.esc(c.email) + '</a></td></tr>' : '')
      +       '<tr><td style="padding:8px 0;color:var(--text-light);">Status</td><td style="padding:8px 0;">' + UI.statusBadge(c.status) + '</td></tr>'
      +       (c.source ? '<tr><td style="padding:8px 0;color:var(--text-light);">Source</td><td style="padding:8px 0;">' + UI.esc(c.source) + '</td></tr>' : '')
      +     '</table>'
      +     '<div style="margin-top:10px;"><button class="btn btn-outline" style="font-size:12px;padding:5px 12px;" onclick="ClientsPage.showForm(\'' + id + '\')">Edit contact info</button></div>'
      +   '</div>'

      //  Tags
      +   '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:14px;">'
      +     '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
      +       '<h3 style="font-size:16px;font-weight:700;margin:0;">Tags</h3>'
      +       '<button class="btn btn-outline" style="font-size:12px;padding:5px 12px;" onclick="ClientsPage.showAddTagModal(\'' + id + '\')">+ Add Tag</button>'
      +     '</div>'
      +     ((c.tags && c.tags.length)
          ? (function(){ var seen = {}; var uniq = c.tags.filter(function(t){ var k = (t||'').toLowerCase(); return seen[k] ? false : (seen[k] = true); });
              return '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
                + uniq.map(function(t){ return '<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px 4px 12px;background:var(--green-bg);border:1px solid #c8e6c9;border-radius:20px;font-size:12px;font-weight:600;color:var(--green-dark);">' + UI.esc(t) + '<button onclick="event.stopPropagation();ClientsPage.removeTagFromClient(\'' + id + '\',\'' + t.replace(/'/g, "\\'") + '\')" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--text-light);padding:0 2px;line-height:1;">×</button></span>'; }).join('')
                + '</div>';
            })()
          : '<div style="font-size:13px;color:var(--text-light);">No tags — add tags to organize clients.</div>')
      +   '</div>';

    // Custom fields
    if (typeof CustomFields !== 'undefined') {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:14px;">'
        + CustomFields.renderDisplay('client', id)
        + '</div>';
    }

    //  Internal notes
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:18px;">'
      +     '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      +       '<h3 style="font-size:16px;font-weight:700;margin:0;">Internal notes</h3>'
      +       '<button onclick="ClientsPage._editNote(\'' + id + '\')" style="background:none;border:none;cursor:pointer;font-size:13px;color:var(--accent);font-weight:600;">✏️ Edit</button>'
      +     '</div>'
      +     '<div style="font-size:11px;color:var(--text-light);margin-bottom:8px;">Only visible to your team.</div>'
      +     '<div id="client-note-view-' + id + '" style="font-size:13px;color:' + (c.notes ? 'var(--text)' : 'var(--text-light)') + ';line-height:1.6;padding:10px;background:var(--bg);border-radius:6px;min-height:40px;white-space:pre-wrap;">' + (c.notes ? UI.esc(c.notes) : 'No notes yet. Click Edit to add.') + '</div>'
      +     '<div id="client-note-edit-' + id + '" style="display:none;">'
      +       '<textarea id="client-note-ta-' + id + '" style="width:100%;height:100px;border:2px solid var(--accent);border-radius:6px;padding:8px;font-size:13px;resize:vertical;box-sizing:border-box;">' + UI.esc(c.notes || '') + '</textarea>'
      +       '<div style="display:flex;gap:6px;margin-top:6px;">'
      +         '<button onclick="ClientsPage._saveNote(\'' + id + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Save</button>'
      +         '<button onclick="ClientsPage._cancelNote(\'' + id + '\')" style="background:none;border:1px solid var(--border);padding:6px 14px;border-radius:6px;font-size:13px;cursor:pointer;">Cancel</button>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      + '</div>' // close cd-about

      + '</div>'; // close max-width wrapper


    // ── Build Comms tab timeline ──
    var timeline = [];
    clientQuotes.forEach(function(q) {
      timeline.push({ date: q.createdAt, icon: '📋', color: '#8b2252',
        title: 'Quote #' + q.quoteNumber + ' created', detail: q.description || '', amount: q.total, status: q.status,
        onclick: "QuotesPage._pendingDetail='" + q.id + "';loadPage('quotes')" });
      if (q.status === 'sent' || q.status === 'awaiting') timeline.push({ date: q.sentAt || q.createdAt, icon: '📤', color: '#1565c0', title: 'Quote #' + q.quoteNumber + ' sent', amount: q.total });
      if (q.status === 'approved') timeline.push({ date: q.approvedAt || q.createdAt, icon: '✅', color: '#2e7d32', title: 'Quote #' + q.quoteNumber + ' approved', amount: q.total });
    });
    clientJobs.forEach(function(j) {
      timeline.push({ date: j.createdAt, icon: '🔧', color: '#2e7d32',
        title: 'Job #' + j.jobNumber + ' created', detail: j.description || '', amount: j.total, status: j.status,
        onclick: "JobsPage.showDetail('" + j.id + "')" });
      if (j.status === 'completed') timeline.push({ date: j.completedAt || j.scheduledDate || j.createdAt, icon: '✅', color: '#2e7d32', title: 'Job #' + j.jobNumber + ' completed' });
    });
    clientInvoices.forEach(function(inv) {
      timeline.push({ date: inv.createdAt, icon: '💰', color: '#1565c0',
        title: 'Invoice #' + inv.invoiceNumber + ' created', amount: inv.total, status: inv.status,
        onclick: "InvoicesPage.showDetail('" + inv.id + "')" });
      if (inv.status === 'paid') timeline.push({ date: inv.paidAt || inv.createdAt, icon: '💵', color: '#2e7d32', title: 'Payment received — Invoice #' + inv.invoiceNumber, amount: inv.total });
    });
    clientJobs.forEach(function(j) {
      if (j.satisfaction && j.satisfaction.rating) {
        var stars = ''; for (var s = 1; s <= 5; s++) stars += s <= j.satisfaction.rating ? '⭐' : '☆';
        timeline.push({ date: j.satisfaction.ratedAt || j.completedAt || j.createdAt, icon: '😊', color: '#ffc107',
          title: 'Client rated Job #' + j.jobNumber + ' — ' + stars, detail: j.satisfaction.comment || '' });
      }
    });
    if (typeof CommsLog !== 'undefined') {
      CommsLog.getAll(id).forEach(function(comm) {
        var icons = { call: '📞', text: '💬', email: '📧', note: '📌', visit: '🏠', voicemail: '📱' };
        timeline.push({ date: comm.date, icon: icons[comm.type] || '📋', color: comm.direction === 'inbound' ? '#2980b9' : '#27ae60',
          title: (comm.type || 'Note').charAt(0).toUpperCase() + (comm.type || 'note').slice(1) + ' ' + (comm.direction === 'inbound' ? '← Inbound' : '→ Outbound'),
          detail: comm.notes || '' });
      });
    }
    timeline.push({ date: c.createdAt, icon: '👋', color: '#999', title: 'Client added', detail: c.source ? 'Source: ' + c.source : '' });
    timeline.sort(function(a, b){ return new Date(b.date) - new Date(a.date); });

    var timelineHtml = '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:18px;">';
    if (timeline.length) {
      timelineHtml += '<div style="position:relative;padding-left:28px;">'
        + '<div style="position:absolute;left:12px;top:8px;bottom:8px;width:2px;background:var(--border);"></div>';
      timeline.forEach(function(ev) {
        timelineHtml += '<div style="position:relative;margin-bottom:14px;' + (ev.onclick ? 'cursor:pointer;' : '') + '"' + (ev.onclick ? ' onclick="' + ev.onclick + '"' : '') + '>'
          + '<div style="position:absolute;left:-24px;top:2px;width:20px;height:20px;border-radius:50%;background:' + ev.color + ';display:flex;align-items:center;justify-content:center;font-size:10px;">' + ev.icon + '</div>'
          + '<div style="font-size:11px;color:var(--text-light);margin-bottom:2px;">' + UI.dateRelative(ev.date) + '</div>'
          + '<div style="font-weight:600;font-size:13px;">' + ev.title
          + (ev.amount ? ' <span style="color:var(--green-dark);">' + UI.moneyInt(ev.amount) + '</span>' : '')
          + (ev.status ? ' ' + UI.statusBadge(ev.status) : '') + '</div>'
          + (ev.detail ? '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">' + UI.esc(ev.detail) + '</div>' : '')
          + '</div>';
      });
      timelineHtml += '</div>';
    } else {
      timelineHtml += '<div style="text-align:center;padding:24px;color:var(--text-light);">No activity yet.</div>';
    }
    timelineHtml += '</div>';

    // Optional CommsLog-rendered block (quick-log form)
    if (typeof CommsLog !== 'undefined' && CommsLog.renderForClient) {
      timelineHtml += '<div style="margin-top:14px;">' + CommsLog.renderForClient(id) + '</div>';
    }

    // Render as full page
    document.getElementById('pageTitle').textContent = c.name;
    document.getElementById('pageContent').innerHTML = html;
    var commsEl = document.getElementById('cd-comms-content');
    if (commsEl) commsEl.innerHTML = timelineHtml;
    document.getElementById('pageAction').style.display = 'none';
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return; // Skip modal below
  },

  _tab: function(btn, panelId) {
    // Deactivate all tabs
    document.querySelectorAll('.cd-tab').forEach(function(t) {
      t.style.borderBottomColor = 'transparent';
      t.style.color = 'var(--text-light)';
      t.classList.remove('active');
    });
    document.querySelectorAll('.cd-panel').forEach(function(p) { p.style.display = 'none'; });
    // Activate clicked
    btn.style.borderBottomColor = 'var(--accent)';
    btn.style.color = 'var(--accent)';
    btn.classList.add('active');
    document.getElementById(panelId).style.display = 'block';
  },

  showStatement: function(clientId) {
    var client = DB.clients.getById(clientId);
    if (!client) return;

    // Gather all transactions for this client
    var invoices = DB.invoices.getAll().filter(function(i){ return i.clientId === clientId || i.clientName === client.name; });
    var quotes = DB.quotes.getAll().filter(function(q){ return q.clientId === clientId || q.clientName === client.name; });
    var jobs = DB.jobs.getAll().filter(function(j){ return j.clientId === clientId || j.clientName === client.name; });

    // Sort invoices by date
    invoices.sort(function(a,b){ return new Date(a.createdAt)-new Date(b.createdAt); });

    var totalBilled = invoices.reduce(function(s,i){return s+(i.total||0);},0);
    var totalPaid = invoices.filter(function(i){return i.status==='paid';}).reduce(function(s,i){return s+(i.total||0);},0);
    var balance = totalBilled - totalPaid;

    var html = '<div style="max-width:600px;font-family:sans-serif;">'
      // Header
      + '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid var(--border);">'
      + '<div><div style="font-size:18px;font-weight:800;color:#1a3c12;">' + ClientsPage._co().name + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">' + UI.esc(CompanyInfo.get('address')) + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">' + ClientsPage._co().phone + ' · ' + ClientsPage._co().website + '</div></div>'
      + '<div style="text-align:right;"><div style="font-size:20px;font-weight:800;">Account Statement</div>'
      + '<div style="font-size:12px;color:var(--text-light);">As of ' + new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) + '</div></div>'
      + '</div>'
      // Client info
      + '<div style="background:var(--bg);border-radius:8px;padding:12px 16px;margin-bottom:16px;">'
      + '<div style="font-weight:700;font-size:15px;">' + UI.esc(client.name) + '</div>'
      + (client.address ? '<div style="font-size:13px;color:var(--text-light);">' + UI.esc(client.address) + '</div>' : '')
      + (client.email ? '<div style="font-size:13px;color:var(--text-light);">' + UI.esc(client.email) + '</div>' : '')
      + '</div>'
      // Summary
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">'
      + '<div style="text-align:center;padding:12px;border:1px solid var(--border);border-radius:8px;"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;font-weight:600;">Total Billed</div><div style="font-size:20px;font-weight:800;">' + UI.moneyInt(totalBilled) + '</div></div>'
      + '<div style="text-align:center;padding:12px;border:1px solid var(--border);border-radius:8px;"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;font-weight:600;">Paid</div><div style="font-size:20px;font-weight:800;color:#2e7d32;">' + UI.moneyInt(totalPaid) + '</div></div>'
      + '<div style="text-align:center;padding:12px;border:1px solid var(--border);border-radius:8px;background:' + (balance>0?'#fff8f0':'#f0faf0') + ';"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;font-weight:600;">Balance Due</div><div style="font-size:20px;font-weight:800;color:' + (balance>0?'#c62828':'#2e7d32') + ';">' + UI.moneyInt(balance) + '</div></div>'
      + '</div>'
      // Invoice table
      + '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px;">'
      + '<thead><tr style="border-bottom:2px solid var(--border);">'
      + '<th style="text-align:left;padding:8px 4px;font-size:11px;color:var(--text-light);text-transform:uppercase;">Date</th>'
      + '<th style="text-align:left;padding:8px 4px;font-size:11px;color:var(--text-light);text-transform:uppercase;">Invoice</th>'
      + '<th style="text-align:left;padding:8px 4px;font-size:11px;color:var(--text-light);text-transform:uppercase;">Description</th>'
      + '<th style="text-align:right;padding:8px 4px;font-size:11px;color:var(--text-light);text-transform:uppercase;">Amount</th>'
      + '<th style="text-align:right;padding:8px 4px;font-size:11px;color:var(--text-light);text-transform:uppercase;">Paid</th>'
      + '<th style="text-align:right;padding:8px 4px;font-size:11px;color:var(--text-light);text-transform:uppercase;">Balance</th>'
      + '</tr></thead><tbody>';

    var runningBalance = 0;
    if (invoices.length === 0) {
      html += '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-light);">No invoices on record</td></tr>';
    } else {
      invoices.forEach(function(inv) {
        var invBalance = (inv.balance !== undefined ? inv.balance : (inv.total - (inv.amountPaid||0)));
        runningBalance += invBalance;
        html += '<tr style="border-bottom:1px solid #f3f4f6;">'
          + '<td style="padding:8px 4px;">' + UI.dateShort(inv.createdAt) + '</td>'
          + '<td style="padding:8px 4px;font-weight:600;">#' + (inv.invoiceNumber||'') + '</td>'
          + '<td style="padding:8px 4px;color:var(--text-light);">' + UI.esc((inv.subject||inv.description||'Tree Service').substring(0,30)) + '</td>'
          + '<td style="padding:8px 4px;text-align:right;">' + UI.money(inv.total) + '</td>'
          + '<td style="padding:8px 4px;text-align:right;color:#2e7d32;">' + (inv.status==='paid'?UI.money(inv.total):inv.amountPaid>0?UI.money(inv.amountPaid):'—') + '</td>'
          + '<td style="padding:8px 4px;text-align:right;font-weight:700;color:' + (invBalance>0?'#c62828':'#2e7d32') + ';">' + UI.money(invBalance) + '</td>'
          + '</tr>';
      });
    }
    html += '</tbody><tfoot><tr style="border-top:2px solid var(--border);font-weight:700;">'
      + '<td colspan="5" style="padding:10px 4px;text-align:right;font-size:14px;">Total Balance Due:</td>'
      + '<td style="padding:10px 4px;text-align:right;font-size:16px;color:' + (balance>0?'#c62828':'#2e7d32') + ';">' + UI.money(balance) + '</td>'
      + '</tr></tfoot></table>'
      + (balance>0 ? '<div style="margin-top:12px;text-align:center;"><a href="https://branchmanager.app/client.html?id=' + clientId + '" style="display:inline-block;background:#1a3c12;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700;">View Online & Pay →</a></div>' : '')
      + '</div>';

    UI.showModal('Account Statement — ' + client.name, html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
        + ' <button class="btn btn-primary" onclick="window.print()">🖨 Print Statement</button>'
    });
  },

  // Legacy modal version (keeping for reference, not used)
  _showDetailModal: function(id) {
    var c = DB.clients.getById(id);
    if (!c) return;
    UI.showModal(c.name, '<p>Use full-page view instead.</p>', {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
        + ' <button class="btn btn-primary" onclick="UI.closeModal();QuotesPage.showForm(null, \'' + id + '\')">Create Quote</button>'
    });
  },

  _updateBulk: function() {
    var bar = document.getElementById('client-bulk-bar');
    var count = document.querySelectorAll('.client-check:checked').length;
    if (!bar) return;
    bar.style.display = count > 0 ? 'flex' : 'none';
    var cntEl = document.getElementById('client-bulk-count');
    if (cntEl) cntEl.textContent = count + ' selected';
  },

  _bulkGetIds: function() {
    return Array.from(document.querySelectorAll('.client-check:checked')).map(function(cb){ return cb.value; });
  },

  _bulkClear: function() {
    document.querySelectorAll('.client-check:checked').forEach(function(cb){ cb.checked = false; });
    ClientsPage._updateBulk();
  },

  _bulkDelete: function() {
    var ids = ClientsPage._bulkGetIds();
    if (!ids.length) return;
    if (!confirm('Delete ' + ids.length + ' client(s)? This cannot be undone.')) return;
    ids.forEach(function(id){ DB.clients.remove(id); });
    UI.toast(ids.length + ' client(s) deleted');
    loadPage('clients');
  },

  _bulkSetStatus: function(status) {
    var ids = ClientsPage._bulkGetIds();
    if (!ids.length) return;
    ids.forEach(function(id){ DB.clients.update(id, { status: status }); });
    UI.toast(ids.length + ' client(s) marked ' + status);
    loadPage('clients');
  },

  // ── Notes + review checkbox (added v371) ────────────────────────────────
  // Both fields live on the clients table (`notes` text + `needs_review` bool)
  // so they sync via SupabaseDB just like every other client field.
  // Send a customer-portal magic-link invite. Uses Supabase Auth signInWithOtp
  // — same mechanism the portal login page uses, just initiated by Doug. Works
  // because anon role is allowed to fire OTP emails for any address (Supabase
  // Auth handles rate limiting + the existing email template re-skinned for BM).
  _sendPortalInvite: function(id) {
    var c = DB.clients.getById(id);
    if (!c || !c.email) { UI.toast('Client has no email on file', 'error'); return; }
    var FN_URL = (window.BM_CONFIG && window.BM_CONFIG.supabaseFunctionsUrl)
      ? window.BM_CONFIG.supabaseFunctionsUrl
      : 'https://ltpivkqahvplapyagljt.supabase.co/functions/v1';
    UI.toast('Sending portal invite to ' + c.email + '…');
    fetch(FN_URL + '/portal-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: c.email })
    })
      .then(function(r) { return r.json().then(function(d){ return { ok: r.ok, body: d }; }); })
      .then(function(res) {
        if (!res.ok || res.body.error) {
          UI.toast('Invite failed: ' + (res.body.error || 'unknown'), 'error');
          return;
        }
        UI.toast('✓ Portal link sent to ' + c.email);
        try {
          var key = 'bm-comms-' + id;
          var all = JSON.parse(localStorage.getItem(key) || '[]');
          all.unshift({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
            clientId: id,
            type: 'email',
            direction: 'outbound',
            notes: 'Portal sign-in link sent (magic link to ' + c.email + ')',
            date: new Date().toISOString(),
            user: 'Doug'
          });
          localStorage.setItem(key, JSON.stringify(all));
        } catch(e) {}
      })
      .catch(function(e) {
        UI.toast('Invite failed: ' + e.message, 'error');
      });
  },

  _saveNotes: function(id, val) {
    var c = DB.clients.getById(id);
    if (!c) return;
    var trimmed = (val || '').replace(/\s+$/g, '');
    if ((c.notes || '') === trimmed) return; // no-op
    DB.clients.update(id, { notes: trimmed });
    var status = document.getElementById('notes-status-' + id);
    if (status) {
      status.textContent = 'Saved';
      setTimeout(function(){ if (status.textContent === 'Saved') status.textContent = ''; }, 1500);
    }
  },

  _archiveClient: function(id) {
    if (!confirm('Archive this client? You can restore it from the Archive page.')) return;
    DB.clients.update(id, { archived: true });
    if (typeof UI !== 'undefined' && UI.toast) UI.toast('Client archived');
    loadPage('clients');
  },

  _toggleReview: function(id, checked) {
    DB.clients.update(id, { needsReview: !checked });
    if (checked) {
      var banner = document.getElementById('review-banner-' + id);
      if (banner) banner.style.display = 'none';
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('Review acknowledged', 'success');
    }
  },

  _bulkExport: function() {
    var ids = ClientsPage._bulkGetIds();
    if (!ids.length) return;
    var rows = ['Name,Email,Phone,Address,Status,Company'];
    ids.forEach(function(id) {
      var c = DB.clients.getById(id); if (!c) return;
      function q(v){ return '"' + ((v||'')+'').replace(/"/g,'""') + '"'; }
      rows.push([q(c.name), q(c.email), q(c.phone), q(c.address), q(c.status), q(c.company)].join(','));
    });
    var blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'clients-' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    UI.toast('Exported ' + ids.length + ' client(s)');
  }
};

/**
 * Tree Inventory — per-client tree records
 * Stored in localStorage as bm-tree-inventory
 */
var TreeInventory = {
  _key: 'bm-tree-inventory',

  getAll: function() {
    try { return JSON.parse(localStorage.getItem(TreeInventory._key) || '[]'); } catch(e) { return []; }
  },

  getForClient: function(clientId) {
    return TreeInventory.getAll().filter(function(t) { return t.clientId === clientId; });
  },

  getById: function(id) {
    return TreeInventory.getAll().find(function(t) { return t.id === id; }) || null;
  },

  save: function(tree) {
    var all = TreeInventory.getAll();
    var idx = all.findIndex(function(t) { return t.id === tree.id; });
    if (idx >= 0) { all[idx] = tree; } else { all.push(tree); }
    localStorage.setItem(TreeInventory._key, JSON.stringify(all));
  },

  remove: function(id) {
    var all = TreeInventory.getAll().filter(function(t) { return t.id !== id; });
    localStorage.setItem(TreeInventory._key, JSON.stringify(all));
  },

  showForm: function(clientId, treeId) {
    var c = DB.clients.getById(clientId);
    var t = treeId ? TreeInventory.getById(treeId) : {};
    if (!t) t = {};
    var title = treeId ? 'Edit Tree' : 'Add Tree to ' + (c ? c.name : 'Client');

    var commonSpecies = [
      '', 'Oak (Red)', 'Oak (White)', 'Oak (Pin)', 'Oak (Scarlet)', 'Maple (Red)', 'Maple (Sugar)',
      'Maple (Silver)', 'Maple (Norway)', 'Ash (White)', 'Ash (Green)', 'Elm (American)', 'Elm (Siberian)',
      'Pine (White)', 'Pine (Red)', 'Spruce (Norway)', 'Spruce (Blue)', 'Fir (Douglas)', 'Hemlock (Eastern)',
      'Cedar (Eastern Red)', 'Birch (White)', 'Birch (River)', 'Poplar', 'Linden', 'Locust (Black)',
      'Locust (Honey)', 'Walnut (Black)', 'Cherry', 'Apple', 'Pear', 'Dogwood', 'Other'
    ];

    var html = '<form id="tree-form" onsubmit="TreeInventory.saveForm(event,\'' + clientId + '\',\'' + (treeId || '') + '\')">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div class="form-group"><label>Species *</label>'
      + '<select id="tree-species-select" onchange="var v=this.value;if(v===\'Other\'){document.getElementById(\'tree-species-custom\').style.display=\'block\';}else{document.getElementById(\'tree-species-custom\').style.display=\'none\';}" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + commonSpecies.map(function(s) { return '<option value="' + UI.esc(s) + '"' + (t.species === s ? ' selected' : '') + '>' + (s || '— Select species —') + '</option>'; }).join('')
      + '</select>'
      + '<input type="text" id="tree-species-custom" placeholder="Enter species name..." value="' + UI.esc(commonSpecies.indexOf(t.species) === -1 ? (t.species || '') : '') + '" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;margin-top:6px;' + (commonSpecies.indexOf(t.species) === -1 && t.species ? '' : 'display:none;') + '">'
      + '</div>'
      + '<div class="form-group"><label>Location on Property</label><input type="text" id="tree-location" value="' + UI.esc(t.location || '') + '" placeholder="e.g. Front yard, back left corner" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">'
      + '<div class="form-group"><label>DBH (inches)</label><input type="number" id="tree-dbh" value="' + (t.dbh || '') + '" placeholder="e.g. 18" min="1" max="300" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;" oninput="TreeInventory._updatePriceHint()"></div>'
      + '<div class="form-group"><label>Est. Height (ft)</label><input type="number" id="tree-height" value="' + (t.height || '') + '" placeholder="e.g. 60" min="1" max="300" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div class="form-group"><label>Condition</label><select id="tree-condition" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + ['', 'Excellent', 'Good', 'Fair', 'Poor', 'Hazard'].map(function(c_) { return '<option value="' + c_ + '"' + (t.condition === c_ ? ' selected' : '') + '>' + (c_ || '— Select —') + '</option>'; }).join('')
      + '</select></div>'
      + '</div>'
      + '<div id="tree-price-hint" style="display:none;background:#e8f5e9;border-radius:8px;padding:8px 12px;margin:-4px 0 12px;font-size:12px;color:#2e7d32;font-weight:600;"></div>'
      + '<div class="form-group"><label>Work Needed</label><input type="text" id="tree-work" value="' + UI.esc(t.workNeeded || '') + '" placeholder="e.g. Remove, Prune crown, Cable, Monitor" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;"></div>'
      + '<div class="form-group"><label>Notes</label><textarea id="tree-notes" placeholder="Hazard notes, access issues, history..." style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;height:72px;resize:vertical;">' + UI.esc(t.notes || '') + '</textarea></div>'
      + '</form>';

    UI.showModal(title, html, {
      footer: (treeId ? '<button class="btn btn-danger" style="margin-right:auto;" onclick="TreeInventory.confirmRemove(\'' + treeId + '\',\'' + clientId + '\')">Remove</button>' : '')
        + '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="document.getElementById(\'tree-form\').requestSubmit()">Save Tree</button>'
    });

    // Set up price hint
    setTimeout(function() { TreeInventory._updatePriceHint(); }, 50);
  },

  _updatePriceHint: function() {
    var dbhEl = document.getElementById('tree-dbh');
    var hintEl = document.getElementById('tree-price-hint');
    if (!dbhEl || !hintEl) return;
    var dbh = parseFloat(dbhEl.value);
    if (dbh > 0) {
      var estimate = Math.round(dbh * 100 / 50) * 50;
      hintEl.style.display = 'block';
      hintEl.textContent = '💡 Estimated removal price: ' + UI.money(estimate) + ' (based on ' + dbh + '" DBH × $100)';
    } else {
      hintEl.style.display = 'none';
    }
  },

  saveForm: function(e, clientId, treeId) {
    e.preventDefault();
    var speciesSel = document.getElementById('tree-species-select').value;
    var speciesCustom = document.getElementById('tree-species-custom').value.trim();
    var species = speciesSel === 'Other' ? speciesCustom : speciesSel;
    if (!species) { UI.toast('Species is required', 'error'); return; }

    var tree = {
      id: treeId || ('tr-' + Date.now().toString(36)),
      clientId: clientId,
      species: species,
      location: document.getElementById('tree-location').value.trim(),
      dbh: parseFloat(document.getElementById('tree-dbh').value) || null,
      height: parseFloat(document.getElementById('tree-height').value) || null,
      condition: document.getElementById('tree-condition').value,
      workNeeded: document.getElementById('tree-work').value.trim(),
      notes: document.getElementById('tree-notes').value.trim(),
      addedAt: treeId ? (TreeInventory.getById(treeId) || {}).addedAt : new Date().toISOString()
    };

    TreeInventory.save(tree);
    UI.toast(treeId ? 'Tree updated' : 'Tree added');
    UI.closeModal();
    ClientsPage.showDetail(clientId);
  },

  showDetail: function(treeId) {
    var t = TreeInventory.getById(treeId);
    if (!t) return;
    var condColor = { 'Excellent': '#00836c', 'Good': '#2e7d32', 'Fair': '#e6a817', 'Poor': '#e07c24', 'Hazard': '#dc3545' }[t.condition] || 'var(--text-light)';
    var estimate = t.dbh ? Math.round(t.dbh * 100 / 50) * 50 : null;

    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">';
    html += TreeInventory._detailRow('Species', t.species || '—');
    html += TreeInventory._detailRow('Location', t.location || '—');
    html += TreeInventory._detailRow('DBH', t.dbh ? t.dbh + '"' : '—');
    html += TreeInventory._detailRow('Est. Height', t.height ? '~' + t.height + ' ft' : '—');
    html += TreeInventory._detailRow('Condition', '<span style="font-weight:700;color:' + condColor + ';">' + (t.condition || '—') + '</span>');
    if (estimate) html += TreeInventory._detailRow('Est. Removal Price', '<span style="font-weight:700;color:var(--green-dark);">' + UI.money(estimate) + '</span>');
    html += '</div>';
    if (t.workNeeded) html += '<div style="margin-top:12px;padding:10px 14px;background:#fff3e0;border-radius:8px;"><strong>Work Needed:</strong> ' + UI.esc(t.workNeeded) + '</div>';
    if (t.notes) html += '<div style="margin-top:10px;padding:10px 14px;background:var(--bg);border-radius:8px;font-size:13px;">' + UI.esc(t.notes) + '</div>';

    var c = DB.clients.getById(t.clientId);
    UI.showModal((t.species || 'Tree') + (t.location ? ' — ' + t.location : ''), html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
        + (c ? ' <button class="btn btn-outline" onclick="UI.closeModal();QuotesPage.showForm(null,\'' + t.clientId + '\')" title="Start a quote using this tree">📋 Quote This Tree</button>' : '')
        + ' <button class="btn btn-primary" onclick="UI.closeModal();TreeInventory.showForm(\'' + t.clientId + '\',\'' + treeId + '\')">Edit</button>'
    });
  },

  _detailRow: function(label, value) {
    return '<div>'
      + '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-light);margin-bottom:4px;">' + label + '</div>'
      + '<div style="font-size:15px;">' + value + '</div>'
      + '</div>';
  },

  confirmRemove: function(treeId, clientId) {
    UI.confirm('Remove this tree from the inventory?', function() {
      TreeInventory.remove(treeId);
      UI.toast('Tree removed');
      UI.closeModal();
      ClientsPage.showDetail(clientId);
    });
  }
};
