/**
 * Branch Manager — Quotes Page
 * Quote list, builder with line items, status management
 */
var QuotesPage = {
  _page: 0, _perPage: 50, _search: '', _filter: 'all', _sortCol: 'quoteNumber', _sortDir: 'desc',

  _co: function() {
    return {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      website: CompanyInfo.get('website'),
      licenses: CompanyInfo.get('licenses'),
      logo: CompanyInfo.get('logo'),
      googleReview: CompanyInfo.get('googleReviewUrl'),
      facebook: CompanyInfo.get('facebookUrl'),
      instagram: CompanyInfo.get('instagramUrl'),
      yelp: CompanyInfo.get('yelpUrl'),
      nextdoor: CompanyInfo.get('nextdoorUrl')
    };
  },

  // Returns "Quote" or "Estimate" based on Settings → Client-Facing Options
  _term: function(cap) {
    var t = (localStorage.getItem('bm-quote-term') || 'quote') === 'estimate' ? 'estimate' : 'quote';
    return cap ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  },
  // Settings → Show Qty column on quotes/email
  _showQty: function() { return localStorage.getItem('bm-pdf-show-qty') === 'true'; },
  // Settings → Show Unit Price column on quotes/email
  _showUnitPrice: function() { return localStorage.getItem('bm-pdf-show-unit-price') === 'true'; },
  // Settings → T&C URL (shown in quote email footer if set)
  _tcUrl: function() { return localStorage.getItem('bm-tc-url') || ''; },

  _pendingDetail: null,

  render: function() {
    var self = QuotesPage;
    if (self._pendingDetail) {
      var _pid = self._pendingDetail;
      self._pendingDetail = null;
      setTimeout(function() { QuotesPage.showDetail(_pid); }, 50);
    }
    var all = DB.quotes.getAll();
    var now7ago = new Date(Date.now() - 7 * 86400000);

    // ── 3 clean KPI cards ──
    var active = all.filter(function(q) { return q.status === 'sent' || q.status === 'awaiting' || q.status === 'changes_requested'; });
    var activeTotal = active.reduce(function(s,q){return s+(q.total||0);},0);
    var closed = all.filter(function(q) { return q.status === 'converted' || q.status === 'approved'; });
    var convRate = all.length > 0 ? Math.round(closed.length / all.length * 100) : 0;
    var stale = active.filter(function(q) { return q.createdAt && new Date(q.createdAt) < now7ago; });
    var convColor = convRate >= 40 ? '#059669' : convRate >= 25 ? '#d97706' : '#dc2626';

    var html = '<div class="stat-row" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 18px;">'
      +   '<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;">Active Pipeline</div>'
      +   '<div style="font-size:24px;font-weight:800;color:var(--text);margin-top:4px;">' + UI.moneyInt(activeTotal) + '</div>'
      +   '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">' + active.length + ' awaiting</div>'
      + '</div>'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 18px;">'
      +   '<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;">Conversion</div>'
      +   '<div style="font-size:24px;font-weight:800;color:' + convColor + ';margin-top:4px;">' + convRate + '%</div>'
      +   '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">' + closed.length + ' of ' + all.length + '</div>'
      + '</div>'
      + '<div style="background:' + (stale.length > 0 ? '#fffbeb' : 'var(--white)') + ';border:1px solid ' + (stale.length > 0 ? '#fcd34d' : 'var(--border)') + ';border-radius:12px;padding:16px 18px;cursor:pointer;" onclick="QuotesPage._setFilter(\'stale\')">'
      +   '<div style="font-size:11px;font-weight:600;color:' + (stale.length > 0 ? '#92400e' : 'var(--text-light)') + ';text-transform:uppercase;letter-spacing:.04em;">Stale · 7d+</div>'
      +   '<div style="font-size:24px;font-weight:800;color:' + (stale.length > 0 ? '#b45309' : 'var(--text)') + ';margin-top:4px;">' + stale.length + '</div>'
      +   '<div style="font-size:12px;color:' + (stale.length > 0 ? '#92400e' : 'var(--text-light)') + ';margin-top:2px;">' + (stale.length > 0 ? 'Follow up →' : 'All caught up ✓') + '</div>'
      + '</div>'
      + '</div>';

    var filtered = self._getFiltered();
    var page = self._showAll ? filtered : filtered.slice(self._page * self._perPage, (self._page + 1) * self._perPage);

    // ── Header: title + chip filters + search ──
    var chipDefs = [['all','All'],['draft','Draft'],['awaiting','Awaiting'],['stale','Stale 7d+'],['changes_requested','Changes Req.'],['approved','Approved'],['converted','Converted']];
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">'
      + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'
      +   '<h3 style="font-size:16px;font-weight:700;margin:0;">Quotes</h3>'
      +   '<span style="font-size:13px;color:var(--text-light);">(' + filtered.length + ')</span>'
      + '</div>'
      + '<div class="search-box" style="min-width:200px;max-width:280px;">'
      +   '<span style="color:var(--text-light);">🔍</span>'
      +   '<input type="text" placeholder="Search quotes..." value="' + UI.esc(self._search) + '" oninput="QuotesPage._search=this.value;QuotesPage._page=0;loadPage(\'quotes\')">'
      + '</div></div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;overflow-x:auto;-webkit-overflow-scrolling:touch;">';
    for (var ci = 0; ci < chipDefs.length; ci++) {
      var val = chipDefs[ci][0], label = chipDefs[ci][1];
      var isActive = self._filter === val;
      html += '<button onclick="QuotesPage._setFilter(\'' + val + '\')" style="font-size:12px;padding:6px 14px;border-radius:20px;border:1px solid ' + (isActive ? '#2e7d32' : 'var(--border)') + ';background:' + (isActive ? '#2e7d32' : 'var(--white)') + ';color:' + (isActive ? '#fff' : 'var(--text)') + ';cursor:pointer;font-weight:' + (isActive ? '600' : '500') + ';white-space:nowrap;">' + label + '</button>';
    }
    html += '</div>';

    // ── Batch action bar ──
    html += '<div id="q-batch-bar" class="bm-batch-bar" style="display:none;position:fixed;bottom:0;left:var(--sidebar-w,0);right:0;z-index:500;background:#1a1a2e;color:#fff;padding:12px 24px;padding-bottom:max(12px,env(safe-area-inset-bottom));align-items:center;justify-content:space-between;box-shadow:0 -4px 20px rgba(0,0,0,.3);">'
      + '<span id="q-batch-count" style="font-weight:700;font-size:14px;">0 selected</span>'
      + '<div style="display:flex;gap:8px;align-items:center;">'
      +   '<button onclick="QuotesPage._batchFollowUp()" style="background:#e6a817;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">📬 Follow-up</button>'
      +   '<button onclick="QuotesPage._batchDecline()" style="background:#dc3545;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">✗ Decline</button>'
      +   '<button onclick="QuotesPage._batchDelete && QuotesPage._batchDelete()" style="background:#c62828;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">🗑 Delete</button>'
      +   '<button onclick="QuotesPage._batchClear()" style="background:none;color:rgba(255,255,255,.7);border:none;padding:8px 12px;font-size:16px;cursor:pointer;">&#10005;</button>'
      + '</div></div>';

    // ── Empty state with "Clear filter" affordance ──
    if (page.length === 0) {
      if (self._search || self._filter !== 'all') {
        html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:40px 20px;text-align:center;color:var(--text-light);">'
          +   '<div style="font-size:36px;margin-bottom:10px;">📋</div>'
          +   '<div style="font-size:15px;font-weight:600;margin-bottom:4px;color:var(--text);">No quotes match this view</div>'
          +   '<div style="font-size:13px;margin-bottom:14px;">' + (self._search ? 'Search: "' + UI.esc(self._search) + '"' : 'Filter: ' + self._filter) + '</div>'
          +   '<button class="btn btn-outline" onclick="QuotesPage._search=\'\';QuotesPage._filter=\'all\';QuotesPage._page=0;loadPage(\'quotes\')" style="font-size:13px;">Clear filters</button>'
          + '</div>';
      } else {
        html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:24px;">'
          + UI.emptyState('📋', 'No quotes yet', 'Create your first quote.', '+ New Quote', 'QuotesPage.showForm()')
          + '</div>';
      }
    } else {
      // ── DESKTOP: table (column order: Client → Total → Status → Date → Quote#) ──
      html += '<div class="q-desktop-only" style="background:var(--white);border-radius:12px;border:1px solid var(--border);overflow:hidden;">'
        + '<table class="data-table"><thead><tr>'
        +   '<th style="width:32px;"><input type="checkbox" onchange="QuotesPage._selectAll(this.checked)" style="width:16px;height:16px;"></th>'
        +   self._sortTh('Client', 'clientName')
        +   self._sortTh('Total', 'total', 'text-align:right;')
        +   self._sortTh('Status', 'status')
        +   self._sortTh('Created', 'createdAt')
        +   self._sortTh('Quote #', 'quoteNumber')
        + '</tr></thead><tbody>';
      page.forEach(function(q) {
        var isStale = (q.status === 'sent' || q.status === 'awaiting') && q.createdAt && new Date(q.createdAt) < now7ago;
        var staleDot = isStale ? '<span title="Stale — sent 7+ days ago, needs follow-up" style="display:inline-block;width:8px;height:8px;background:#f59e0b;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>' : '';
        html += '<tr onclick="QuotesPage.showForm(\'' + q.id + '\')" style="cursor:pointer;">'
          + '<td onclick="event.stopPropagation()"><input type="checkbox" class="q-check" value="' + q.id + '" onchange="QuotesPage._updateBulk()" style="width:16px;height:16px;"></td>'
          + '<td>' + staleDot + '<strong>' + UI.esc(q.clientName || '—') + '</strong>'
          +   (q.property ? '<div style="font-size:11px;color:var(--text-light);margin-top:2px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(q.property) + '</div>' : '') + '</td>'
          + '<td style="text-align:right;font-weight:700;font-size:14px;">' + UI.money(q.total) + '</td>'
          + '<td>' + UI.statusBadge(q.status) + '</td>'
          + '<td style="font-size:13px;color:var(--text-light);">' + UI.dateShort(q.createdAt) + '</td>'
          + '<td style="font-size:12px;color:var(--text-light);">#' + (q.quoteNumber || '') + '</td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';

      // ── MOBILE: card layout ──
      html += '<div class="q-mobile-only" style="display:none;">';
      page.forEach(function(q) {
        var isStale = (q.status === 'sent' || q.status === 'awaiting') && q.createdAt && new Date(q.createdAt) < now7ago;
        var staleBar = isStale ? 'border-left:3px solid #f59e0b;' : 'border-left:3px solid transparent;';
        html += '<div data-qid="' + q.id + '" class="quote-card" style="background:var(--white);border:1px solid var(--border);' + staleBar + 'border-radius:12px;padding:14px 16px;margin-bottom:8px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.04);-webkit-tap-highlight-color:transparent;">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">'
          +   '<div style="flex:1;min-width:0;">'
          +     '<div style="font-size:15px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(q.clientName || '—') + '</div>'
          +     (q.property ? '<div style="font-size:12px;color:var(--text-light);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📍 ' + UI.esc(q.property) + '</div>' : '')
          +   '</div>'
          +   '<div style="font-size:17px;font-weight:800;color:var(--text);flex-shrink:0;">' + UI.money(q.total) + '</div>'
          + '</div>'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:8px;flex-wrap:wrap;">'
          +   '<div>' + UI.statusBadge(q.status) + '</div>'
          +   '<div style="font-size:11px;color:var(--text-light);">'
          +     (isStale ? '<span style="color:#b45309;font-weight:600;">Stale · </span>' : '')
          +     UI.dateShort(q.createdAt) + ' · #' + (q.quoteNumber || '')
          +   '</div>'
          + '</div>'
          + '</div>';
      });
      html += '</div>';
    }

    // Pagination
    var totalPages = Math.ceil(filtered.length / self._perPage);
    if (totalPages > 1 || self._showAll) {
      html += '<div style="display:flex;justify-content:center;align-items:center;gap:4px;margin-top:12px;flex-wrap:wrap;">';
      if (!self._showAll) {
        html += '<button class="btn btn-outline" onclick="QuotesPage._goPage(' + (self._page - 1) + ')" style="font-size:12px;padding:5px 10px;"' + (self._page === 0 ? ' disabled' : '') + '>‹</button>';
        for (var p = Math.max(0, self._page - 2); p <= Math.min(totalPages - 1, self._page + 2); p++) {
          html += '<button class="btn ' + (p === self._page ? 'btn-primary' : 'btn-outline') + '" onclick="QuotesPage._goPage(' + p + ')" style="font-size:12px;padding:5px 10px;min-width:32px;">' + (p + 1) + '</button>';
        }
        html += '<button class="btn btn-outline" onclick="QuotesPage._goPage(' + (self._page + 1) + ')" style="font-size:12px;padding:5px 10px;"' + (self._page >= totalPages - 1 ? ' disabled' : '') + '>›</button>';
      }
      html += '<button class="btn btn-outline" onclick="QuotesPage._toggleShowAll()" style="font-size:12px;padding:5px 12px;margin-left:8px;">'
        + (self._showAll ? 'Paginate (' + self._perPage + '/page)' : 'Show all ' + filtered.length)
        + '</button>';
      html += '</div>';
    }

    // Mobile card tap handlers (scroll-safe — same pattern as clients page)
    setTimeout(function() {
      document.querySelectorAll('.quote-card').forEach(function(card) {
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
          var qid = this.getAttribute('data-qid');
          if (qid) QuotesPage.showForm(qid);
        });
      });
    }, 0);

    return html;
  },

  _getFiltered: function() {
    var self = QuotesPage;
    var all = DB.quotes.getAll();
    // Default view hides archived quotes (status='archived' is reserved for
    // bulk-cleaned old drafts that never converted). Explicit filter to
    // 'archived' shows them again.
    if (self._filter === 'all') {
      all = all.filter(function(q) { return q.status !== 'archived'; });
    } else {
      if (self._filter === 'stale') {
        var sevenAgo = new Date(Date.now() - 7 * 86400000);
        all = all.filter(function(q) {
          return (q.status === 'sent' || q.status === 'awaiting') && q.createdAt && new Date(q.createdAt) < sevenAgo;
        });
      } else {
        all = all.filter(function(q) {
          if (self._filter === 'awaiting' || self._filter === 'sent') return q.status === 'sent' || q.status === 'awaiting';
          return q.status === self._filter;
        });
      }
    }
    if (self._search && self._search.length >= 2) {
      var s = self._search.toLowerCase();
      all = all.filter(function(q) {
        return (q.clientName || '').toLowerCase().indexOf(s) >= 0 || (q.description || '').toLowerCase().indexOf(s) >= 0 || (q.property || '').toLowerCase().indexOf(s) >= 0 || String(q.quoteNumber).indexOf(s) >= 0;
      });
    }
    var col = self._sortCol;
    var dir = self._sortDir === 'asc' ? 1 : -1;
    all.sort(function(a, b) {
      var va = a[col], vb = b[col];
      if (col === 'quoteNumber' || col === 'total') return ((va || 0) - (vb || 0)) * dir;
      if (col === 'createdAt') return ((new Date(va || 0)).getTime() - (new Date(vb || 0)).getTime()) * dir;
      va = (va || '').toString().toLowerCase(); vb = (vb || '').toString().toLowerCase();
      return va < vb ? -1 * dir : va > vb ? 1 * dir : 0;
    });
    return all;
  },
  _sortTh: function(label, col, extraStyle) {
    var self = QuotesPage;
    var arrow = self._sortCol === col ? (self._sortDir === 'asc' ? ' &#9650;' : ' &#9660;') : '';
    return '<th onclick="QuotesPage._setSort(\'' + col + '\')" style="cursor:pointer;user-select:none;' + (extraStyle || '') + '"' + (self._sortCol === col ? ' class="sort-active"' : '') + '>' + label + arrow + '</th>';
  },
  _setSort: function(col) {
    if (QuotesPage._sortCol === col) { QuotesPage._sortDir = QuotesPage._sortDir === 'asc' ? 'desc' : 'asc'; }
    else { QuotesPage._sortCol = col; QuotesPage._sortDir = 'asc'; }
    QuotesPage._page = 0; loadPage('quotes');
  },
  _setFilter: function(f) { QuotesPage._filter = f; QuotesPage._page = 0; loadPage('quotes'); },
  _goPage: function(p) { var t = Math.ceil(QuotesPage._getFiltered().length / QuotesPage._perPage); QuotesPage._page = Math.max(0, Math.min(p, t - 1)); loadPage('quotes'); },
  _toggleShowAll: function() { QuotesPage._showAll = !QuotesPage._showAll; QuotesPage._page = 0; loadPage('quotes'); },

  _selectAll: function(checked) {
    document.querySelectorAll('.q-check').forEach(function(cb) { cb.checked = checked; });
    QuotesPage._updateBatchBar();
  },
  _updateBulk: function() { QuotesPage._updateBatchBar(); },
  _updateBatchBar: function() {
    var selected = document.querySelectorAll('.q-check:checked');
    var bar = document.getElementById('q-batch-bar');
    var count = document.getElementById('q-batch-count');
    if (bar) bar.style.display = selected.length > 0 ? 'flex' : 'none';
    if (count) count.textContent = selected.length + ' selected';
  },
  _getSelected: function() {
    return Array.from(document.querySelectorAll('.q-check:checked')).map(function(cb) { return cb.value; });
  },
  _batchClear: function() {
    document.querySelectorAll('.q-check').forEach(function(cb) { cb.checked = false; });
    var bar = document.getElementById('q-batch-bar'); if (bar) bar.style.display = 'none';
  },
  _quickFollowUp: function(id) {
    var q = DB.quotes.getById(id);
    if (!q) return;
    DB.quotes.update(id, { lastFollowUp: new Date().toISOString() });

    // Try to send email if Email module is available and client has email
    var client = q.clientId ? DB.clients.getById(q.clientId) : null;
    var email = q.clientEmail || (client && client.email) || '';
    if (email && typeof Email !== 'undefined') {
      var firstName = (q.clientName || '').split(' ')[0] || 'there';
      var _co2 = QuotesPage._co();
      var _ft = QuotesPage._term(false);
      var subject = 'Following up on your ' + _ft + ' from ' + _co2.name;
      var body = 'Hi ' + firstName + ',\n\n'
        + 'I wanted to follow up on the ' + _ft + ' I sent over for ' + (q.description || 'tree services') + '.\n\n'
        + 'Quote #' + q.quoteNumber + ' — ' + UI.money(q.total) + '\n\n'
        + 'Do you have any questions or would you like to move forward? Just reply to this email or give me a call at ' + _co2.phone + '.\n\n'
        + 'Thanks,\n' + CompanyInfo.get('ownerName') + '\n' + _co2.name + '\n' + _co2.phone + '\n' + _co2.website;
      Email.send(email, subject, body).then(function(r) {
        if (r && r.success) UI.toast('Follow-up sent to ' + email);
        else UI.toast('Follow-up logged — email failed (' + ((r && r.hint) || 'check Resend key in Supabase secrets') + ')');
      }).catch(function() {
        UI.toast('Follow-up logged (network error — try again)');
      });
    } else {
      UI.toast('Follow-up logged for ' + UI.esc(q.clientName || 'client') + (email ? '' : ' — no email on file'));
    }
  },
  _batchFollowUp: function() {
    var ids = QuotesPage._getSelected();
    if (ids.length === 0) return;
    ids.forEach(function(id) {
      DB.quotes.update(id, { lastFollowUp: new Date().toISOString() });
    });
    UI.toast(ids.length + ' follow-up' + (ids.length > 1 ? 's' : '') + ' logged');
    QuotesPage._batchClear();
    loadPage('quotes');
  },
  _batchDecline: function() {
    var ids = QuotesPage._getSelected();
    if (ids.length === 0) return;
    UI.confirm('Mark ' + ids.length + ' quote' + (ids.length > 1 ? 's' : '') + ' as declined?', function() {
      ids.forEach(function(id) { DB.quotes.update(id, { status: 'declined' }); });
      UI.toast(ids.length + ' quote' + (ids.length > 1 ? 's' : '') + ' marked declined');
      loadPage('quotes');
    });
  },

  _batchDelete: function() {
    var ids = QuotesPage._getSelected();
    if (ids.length === 0) return;
    if (!confirm('Delete ' + ids.length + ' quote' + (ids.length > 1 ? 's' : '') + '? This cannot be undone.')) return;
    ids.forEach(function(id) { DB.quotes.remove(id); });
    UI.toast(ids.length + ' quote' + (ids.length > 1 ? 's' : '') + ' deleted');
    loadPage('quotes');
  },

  showForm: function(quoteId, clientId, requestId) {
    var q = quoteId ? DB.quotes.getById(quoteId) : {};
    var client = clientId ? DB.clients.getById(clientId) : (q.clientId ? DB.clients.getById(q.clientId) : null);
    // Start empty — no auto-populated blank row. User explicitly taps "Add Tree" to begin.
    // Also filter out any ghost/empty items that might have crept in from old saves.
    var items = (q.lineItems || []).filter(function(it) {
      return it && (it.service || it.description || it.rate || (it.photos && it.photos.length) || it.photo);
    });
    // Stash requestId so save() captures it as origin
    QuotesPage._originRequestId = requestId || q.requestId || null;

    // Check for tree measurement data
    var treeMeasure = null;
    try { treeMeasure = JSON.parse(localStorage.getItem('bm-tree-measure')); localStorage.removeItem('bm-tree-measure'); } catch(e) {}
    if (treeMeasure && !quoteId) {
      var desc = 'Tree removal';
      if (treeMeasure.dbh) desc += ' — ' + treeMeasure.dbh + '" DBH';
      if (treeMeasure.height) desc += ', ~' + treeMeasure.height + ' ft';
      if (treeMeasure.complexity) desc += ' (' + treeMeasure.complexity + ')';
      var price = treeMeasure.dbh ? Math.round(treeMeasure.dbh * 100 / 50) * 50 : 0;
      items = [{ service: 'Tree Removal', description: desc, qty: 1, rate: price }];
      q.description = desc;
    }

    // Check for voice-quote AI draft
    var voiceDraft = null;
    try { voiceDraft = JSON.parse(localStorage.getItem('bm-voice-quote-draft')); localStorage.removeItem('bm-voice-quote-draft'); } catch(e) {}
    if (voiceDraft && !quoteId) {
      if (Array.isArray(voiceDraft.lineItems) && voiceDraft.lineItems.length) {
        items = voiceDraft.lineItems.map(function(li) {
          return {
            service: li.service || 'Custom',
            description: li.description || '',
            qty: li.qty != null ? li.qty : 1,
            rate: li.rate != null ? li.rate : (li.amount || 0)
          };
        });
      }
      if (voiceDraft.description) q.description = voiceDraft.description;
      if (voiceDraft.scope) q.scope = voiceDraft.scope;
      if (voiceDraft.notes) q.internalNotes = voiceDraft.notes;
      UI.toast('🎙️ AI draft loaded — review & adjust before sending');
    }

    // Check for AI-Tree-ID / Video-Walkthrough pending items (different writers,
    // same handoff target). Both videoquote.js and aitreeid.js stash here when
    // the user taps "+ Add to New Quote" or "Create Quote" — pre-this-fix the
    // items were orphaned because nothing read this key into the form.
    var aiItems = null;
    try { aiItems = JSON.parse(localStorage.getItem('bm-ai-pending-items') || 'null'); } catch(e) {}
    if (aiItems && Array.isArray(aiItems) && aiItems.length && !quoteId) {
      var existing = items || [];
      // Drop the placeholder default item ("Tree Removal") if it's the only thing
      var hasOnlyDefault = existing.length === 1 && existing[0] && (existing[0].service === 'Tree Removal' || existing[0].service === 'Custom');
      var base = hasOnlyDefault ? [] : existing.slice();
      items = base.concat(aiItems.map(function(li) {
        return {
          service: li.service || 'Tree Service',
          description: li.description || '',
          qty: li.qty != null ? li.qty : 1,
          rate: li.rate != null ? li.rate : 0
        };
      }));
      try { localStorage.removeItem('bm-ai-pending-items'); } catch(e) {}
      UI.toast('🌳 ' + aiItems.length + ' AI-detected tree' + (aiItems.length === 1 ? '' : 's') + ' added — review & adjust before sending');
    }
    var services = DB.services.getAll();

    // Get clients synchronously from localStorage
    var allClients = [];
    try { allClients = JSON.parse(localStorage.getItem('bm-clients') || '[]'); } catch(e) {}

    var html = '<form id="quote-form" onsubmit="QuotesPage.save(event, \'' + (quoteId || '') + '\')">';

    // Client + property + description (minimal, auto-filled)
    var _qProperty = q.property || (client ? client.address : '') || '';
    var _qDesc = q.description || '';

    // Auto-fill description from request notes if creating from a request
    if (!_qDesc && !quoteId) {
      // Check if there's a recently converted request with notes
      var recentReqs = DB.requests.getAll().filter(function(r) {
        return r.status === 'converted' && r.clientName === (client ? client.name : '');
      });
      if (recentReqs.length > 0 && recentReqs[0].notes) _qDesc = recentReqs[0].notes;
      if (!_qDesc && recentReqs.length > 0 && recentReqs[0].service) _qDesc = recentReqs[0].service;
    }

    // Client section as a collapsible box (collapsed by default if client already selected, expanded if new)
    // For EXISTING quotes: use q.clientName as fallback when DB.clients.getById couldn't find the record
    // (client may have been removed locally but the quote still has the name/id).
    var hasResolvedClient = !!(client || q.clientId || q.clientName);
    var clientExpanded = !hasResolvedClient; // if no client info, start open
    var clientSummaryName = client ? UI.esc(client.name) : (q.clientName ? UI.esc(q.clientName) : 'Pick a client');
    // Extract town from property address: "123 Main St, Peekskill, NY 10566" -> "Peekskill"
    var _townName = '';
    if (_qProperty) {
      var _parts = _qProperty.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
      if (_parts.length >= 3) _townName = _parts[_parts.length - 3]; // before state/zip
      else if (_parts.length === 2) _townName = _parts[1];
    }
    var clientSummaryLine = clientSummaryName + (_townName ? ' · ' + UI.esc(_townName) : '');
    html += '<div class="q-client-box" style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin-bottom:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      // Summary header (always visible)
      + '<div onclick="QuotesPage._toggleClientBox(this)" style="display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer;">'
      +   '<div style="flex:1;min-width:0;">'
      +     '<div style="font-size:15px;font-weight:700;color:' + (client ? 'var(--text)' : 'var(--text-light)') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" class="q-client-summary-name">' + clientSummaryLine + '</div>'
      +   '</div>'
      +   '<div class="q-client-chevron" style="font-size:16px;color:var(--text-light);transition:transform .2s;' + (clientExpanded ? '' : 'transform:rotate(-90deg);') + '">▾</div>'
      + '</div>'
      // Body (collapsible)
      + '<div class="q-client-body" style="padding:0 14px 14px 14px;' + (clientExpanded ? '' : 'display:none;') + '">';

    // Treat as "resolved" if we have EITHER a fresh client obj OR stored clientId/clientName on the quote.
    // Keeps the Line Items section visible on existing quotes even when the local client was never seeded.
    if (client || q.clientName || q.clientId) {
      var _cid = (client && client.id) || q.clientId || '';
      var _cname = (client && client.name) || q.clientName || '';
      var _cphone = (client && (client.phone || client.phoneNumber)) || '';
      var _cphoneTel = _cphone.replace(/[^0-9+]/g, '');
      html += '<input type="hidden" id="q-clientId" value="' + _cid + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">'
        +   (_cid
            ? '<a onclick="ClientsPage.showDetail(\'' + _cid + '\')" style="font-size:15px;font-weight:700;color:var(--text);cursor:pointer;text-decoration:none;border-bottom:1px dashed var(--text-light);">' + UI.esc(_cname) + ' →</a>'
            : '<span style="font-size:15px;font-weight:700;color:var(--text);">' + UI.esc(_cname) + '</span>')
        + '</div>'
        + (_qProperty ? '<div style="margin-top:6px;"><a href="https://maps.apple.com/?daddr=' + encodeURIComponent(_qProperty) + '" target="_blank" rel="noopener noreferrer" style="font-size:13px;color:var(--accent);text-decoration:none;" onclick="event.stopPropagation();">📍 ' + UI.esc(_qProperty) + ' →</a></div>' : '')
        + (_cphone ? '<div style="margin-top:4px;"><a href="tel:' + _cphoneTel + '" style="font-size:13px;color:var(--accent);text-decoration:none;" onclick="event.stopPropagation();">📞 ' + UI.esc(_cphone) + '</a></div>' : '')
        + '<input type="hidden" id="q-property" value="' + UI.esc(_qProperty) + '">';
    } else {
      html += '<input type="hidden" id="q-clientId" value="">'
        + '<input type="hidden" id="q-property" value="">'
        + '<input type="text" id="q-client-search" placeholder="Search client, or type a new name…" autocomplete="off" '
        +   'oninput="QuotesPage._searchClient(this.value)" onfocus="QuotesPage._searchClient(this.value)" '
        +   'style="width:100%;padding:12px 14px;border:2px solid var(--green-dark);border-radius:10px;font-size:15px;box-sizing:border-box;">'
        + '<div id="q-client-results" style="display:none;position:relative;z-index:10;margin-top:8px;"></div>';
    }

    // Description lives inside the client box
    html += '<div class="form-group" style="margin-top:12px;margin-bottom:0;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Description (for client-facing quote)</label>'
      + '<textarea id="q-description" rows="2" placeholder="e.g., Tree removal - 2 oaks" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;">' + UI.esc(_qDesc) + '</textarea>'
      + (_qDesc ? '<div style="font-size:11px;color:var(--text-light);margin-top:3px;">Auto-filled from request</div>' : '')
      + '</div>'
    + '</div>' // close q-client-body
    + '</div>'; // close q-client-box

    // ═══ STEP 1: Per Tree/Task ═══
    var tmData = q.timeMaterial || {};

    // Progressive disclosure: for NEW quotes, hide line items until client is picked.
    // Existing quotes skip the gate (they already have a client).
    var hasClient = !!(q && q.id) || (client && client.id);
    var gateDisplay = hasClient ? 'block' : 'none';
    // Dotted "Pick or create a client" box removed per user request —
    // the empty state is implied (tree list hidden until client picked).

    // v633: Line items section — service picker + photo button at top.
    // Pick a service from the dropdown → adds line item pre-filled with that
    // service and auto-expands the details. Photo button triggers photo-first
    // AI path. Both produce a new line item; existing items stack below.
    var svcOptionsHtml = '<option value="">+ Add line item — pick service…</option>'
      + (services || []).map(function(s){ var n = (typeof s === 'string' ? s : s.name); return '<option value="' + UI.esc(n) + '">' + UI.esc(n) + '</option>'; }).join('')
      + '<option value="__custom__">… or custom (manual entry)</option>';

    html += '<div id="q-items-section" style="margin:24px 0;display:' + gateDisplay + ';">'
      + '<div style="font-size:17px;font-weight:700;padding-bottom:12px;border-bottom:1px solid var(--border);margin-bottom:14px;">Line items</div>'
      + '<div style="display:flex;gap:10px;align-items:center;margin-bottom:18px;">'
      +   '<select id="q-service-picker" onchange="QuotesPage._addItemFromPicker(this)" style="flex:1;padding:14px 14px;border:1px solid var(--border);border-radius:10px;font-size:15px;background:var(--white);">'
      +     svcOptionsHtml
      +   '</select>'
      +   '<button type="button" onclick="QuotesPage._addPhotoFirst()" title="Add tree (photo + AI)" style="width:54px;height:54px;border-radius:10px;background:var(--green-dark);color:#fff;border:none;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">📷</button>'
      + '</div>';

    // Line items list — newly-added items render expanded so user can fill in immediately.
    html += '<div id="q-items">';
    items.forEach(function(item, i) {
      html += QuotesPage._itemRow(i, item, services, /*expanded=*/ false);
    });
    html += '</div>'
      + '<div id="q-pertree-total" style="margin-top:14px;text-align:right;font-size:15px;font-weight:700;color:var(--green-dark);"></div>'
      + '</div>';

    // Equipment block rendered below (after Internal Notes) — build string now, inject later
    // Equipment card: large Map button on top, checkbox list below.
    // Removed crane / stump grinder / man lift per user (not used by Second Nature).
    var _equipCatalog = [
      { key: 'bucket',    label: 'Bucket Truck', rate: 75, icon: '🚛' },
      { key: 'chipper',   label: 'Chipper',      rate: 44, icon: '🪵' },
      { key: 'dumpTruck', label: 'Dump Truck',   rate: 40, icon: '🚚' },
      { key: 'miniSkid',  label: 'Mini-skid',    rate: 60, icon: '🚜' },
      { key: 'trailer',   label: 'Trailer',      rate: 25, icon: '🚗' }
    ];
    var _rates = QuotesPage.getTMRates();
    var _pickedKeys = _equipCatalog.filter(function(e){ return tmData[e.key]; });
    var _totalRate = _pickedKeys.reduce(function(s,e){ return s + (_rates[e.key] || e.rate); }, 0);

    var _equipChecks = _equipCatalog.map(function(e) {
      var on = !!tmData[e.key];
      var r = _rates[e.key] || e.rate;
      return '<label style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid ' + (on ? '#1a3c12' : 'var(--border)') + ';background:' + (on ? '#f0f5ed' : 'var(--white)') + ';border-radius:8px;cursor:pointer;font-size:14px;">'
        + '<input type="checkbox"' + (on ? ' checked' : '') + ' data-key="' + e.key + '" data-rate="' + r + '" '
        +   'onchange="QuotesPage._toggleEquipCheckbox(this)" style="width:20px;height:20px;cursor:pointer;accent-color:#1a3c12;">'
        + '<span style="font-size:20px;">' + e.icon + '</span>'
        + '<span style="flex:1;font-weight:600;">' + e.label + '</span>'
        + '<span style="color:var(--text-light);font-size:12px;font-weight:500;">$' + r + '/hr</span>'
        + '</label>';
    }).join('');

    // v641: Equipment box now a collapsible <details> (Doug ask). Summary
    // shows count + running $/hr total even when collapsed.
    var _equipSummaryText = _pickedKeys.length
      ? _pickedKeys.length + ' piece(s) · $' + _totalRate + '/hr'
      : 'None selected';
    var _equipHtml = '<details style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin-top:14px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">'
      + '<summary style="padding:14px 16px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:12px;">'
      +   '<span style="font-size:14px;font-weight:800;">🛠 Equipment on this job</span>'
      +   '<span style="display:flex;align-items:center;gap:10px;">'
      +     '<span style="font-size:12px;color:var(--text-light);" id="q-equip-summary-collapsed">' + _equipSummaryText + '</span>'
      +     '<span style="font-size:12px;color:var(--text-light);">▾</span>'
      +   '</span>'
      + '</summary>'
      + '<div style="padding:0 16px 16px;">'
      + '<div style="font-size:12px;color:var(--text-light);margin-bottom:12px;">Plan your job site on the satellite map — placed equipment auto-counts into the T&M total.</div>'
      + '<button type="button" onclick="QuotesPage._openEquipmentMap()" style="background:var(--green-dark);color:#fff;border:none;padding:10px 18px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;margin-bottom:12px;">🗺 Open Equipment Map →</button>'
      // Select-all shortcut
      + '<div style="display:flex;justify-content:flex-end;margin-bottom:6px;">'
      +   '<button type="button" onclick="QuotesPage._selectAllEquip(this)" style="background:none;border:none;color:var(--accent);font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline;padding:4px 8px;">Select all</button>'
      + '</div>'
      // Equipment checklist (5 items)
      + '<div id="q-equip-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:6px;margin-bottom:10px;">' + _equipChecks + '</div>'
      // Summary line with running total
      + '<div id="q-equip-summary" style="font-size:13px;color:var(--text);padding:10px 12px;background:var(--bg);border-radius:8px;display:flex;justify-content:space-between;align-items:center;">'
      +   '<span id="q-equip-count-text">' + (_pickedKeys.length ? '✓ ' + _pickedKeys.length + ' piece(s) planned' : 'No equipment yet — check any above.') + '</span>'
      +   '<span id="q-equip-total-text" style="font-weight:700;color:var(--green-dark);">' + (_totalRate > 0 ? '$' + _totalRate + '/hr' : '') + '</span>'
      + '</div>'
      // Hidden T&M checkboxes — source of truth for _calcTM
      + '<div style="display:none;">'
      +   QuotesPage._tmEquipPill('bucket', 'Bucket truck', 75, tmData)
      +   QuotesPage._tmEquipPill('chipper', 'Chipper', 44, tmData)
      +   QuotesPage._tmEquipPill('dumpTruck', 'Dump truck', 40, tmData)
      +   QuotesPage._tmEquipPill('miniSkid', 'Mini-skid', 60, tmData)
      +   QuotesPage._tmEquipPill('trailer', 'Trailer', 25, tmData)
      + '</div>'
      + '</div>'
      + '</details>';

    // Total display with tax breakdown (legacy system style)
    var _qSubtotal = 0;
    (q.lineItems || []).forEach(function(it) { _qSubtotal += (it.qty || 1) * (it.rate || 0); });
    var _qTaxRate = (q.taxRate !== undefined ? q.taxRate : (parseFloat(localStorage.getItem('bm-tax-rate')) || 8.375));
    var _qTaxAmt = Math.round(_qSubtotal * _qTaxRate / 100 * 100) / 100;
    var _qGrandTotal = _qSubtotal + _qTaxAmt;
    html += '<div style="margin-top:16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;overflow:hidden;">'
      + '<div style="padding:10px 16px;display:flex;justify-content:space-between;align-items:center;font-size:13px;border-bottom:1px solid var(--border);">'
      + '<span style="color:var(--text-light);">Subtotal</span><span id="q-subtotal-display" style="font-weight:600;">' + UI.money(_qSubtotal) + '</span>'
      + '</div>'
      + '<div style="padding:10px 16px;display:flex;justify-content:space-between;align-items:center;font-size:13px;border-bottom:1px solid var(--border);">'
      + '<span style="color:var(--text-light);display:inline-flex;align-items:center;gap:4px;">'
      +   '<span id="q-tax-label">Tax (<span id="q-tax-rate-display">' + _qTaxRate + '</span>%)</span>'
      +   '<a onclick="var e=document.getElementById(\'q-tax-edit\');var l=document.getElementById(\'q-tax-label\');e.style.display=\'inline-flex\';l.style.display=\'none\';e.querySelector(\'input\').focus();e.querySelector(\'input\').select();" style="font-size:11px;color:var(--accent);cursor:pointer;text-decoration:underline;">(edit)</a>'
      +   '<span id="q-tax-edit" style="display:none;align-items:center;gap:4px;">'
      +     '<input type="number" id="q-tax-rate" value="' + _qTaxRate + '" step="0.001" min="0" max="100" onblur="document.getElementById(\'q-tax-rate-display\').textContent=this.value;document.getElementById(\'q-tax-edit\').style.display=\'none\';document.getElementById(\'q-tax-label\').style.display=\'inline\';" oninput="QuotesPage.calcTotal()" style="width:58px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;text-align:right;">'
      +     '<span>%</span>'
      +   '</span>'
      + '</span>'
      + '<span id="q-tax-display" style="font-weight:600;">' + UI.money(_qTaxAmt) + '</span>'
      + '</div>'
      + '<div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;background:var(--green-dark);color:var(--white);">'
      + '<span style="font-weight:600;">Total</span>'
      + '<span id="q-total-display" style="font-size:1.5rem;font-weight:800;">' + UI.money(_qGrandTotal) + '</span>'
      + '</div>'
      // Est. Profit Margin row removed — T&M price check already shows cost vs line-item spread
      + '</div>';

    // Property Map moved to Step 2

    html += UI.formField('Internal Notes', 'textarea', 'q-notes', q.notes, { placeholder: 'Notes (not shown to client)' });

    // Equipment block (moved to after Internal Notes per user request)
    html += _equipHtml;

    // Expiry
    html += '<div style="margin-bottom:16px;">'
      + '<input type="hidden" id="q-expires" value="' + (q.expiresAt ? q.expiresAt.substring(0,10) : new Date(Date.now() + 30*86400000).toISOString().substring(0,10)) + '">'
      + '<div style="font-size:11px;color:var(--text-light);">' + QuotesPage._term(true) + ' valid for 30 days.</div>'
      + '</div>';

    // ═══ Labor Estimate (renamed from Production Estimate / T&M) ═══
    // v633: collapsed by default — secondary section, not needed for every quote.
    // Click the summary to expand crew + equipment + hours pricing check.
    html += '<details id="q-mode-tm" style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin:24px 0 12px;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">'
      + '<summary style="padding:16px 18px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;">'
      +   '<span style="font-size:15px;font-weight:800;">Labor estimate <span style="font-weight:400;color:var(--text-light);font-size:12px;margin-left:6px;">— optional sanity check</span></span>'
      +   '<span style="font-size:12px;color:var(--text-light);font-weight:500;">▾</span>'
      + '</summary>'
      + '<div style="padding:0 18px 18px;">'
      + '<p style="font-size:12px;color:var(--text-light);margin-bottom:16px;">Check crew members going + enter total hours. Compare against line-item total as a sanity check.</p>'

      // ═══ STEP 1 — Crew (one line per role, full-width checkboxes) ═══
      + '<div style="background:var(--bg);border-radius:10px;padding:14px;margin-bottom:14px;">'
      +   '<label style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:8px;">Step 1 — Crew needed</label>'
      +   '<div style="display:flex;flex-direction:column;gap:6px;">'
      +     '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--white);border:2px solid ' + (((tmData.climberCount|0) > 0) ? 'var(--green-dark)' : 'var(--border)') + ';border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">'
      +       '<input type="checkbox" id="q-tm-climber-chk"' + (((tmData.climberCount|0) > 0) ? ' checked' : '') + ' onchange="document.getElementById(\'q-tm-climber-count\').value=this.checked?1:0;this.parentElement.style.borderColor=this.checked?\'var(--green-dark)\':\'var(--border)\';QuotesPage._calcTM();" style="width:18px;height:18px;">'
      +       '<span style="flex:1;">Climber</span><span style="color:var(--text-light);font-size:11px;font-weight:500;">$175/hr</span>'
      +     '</label>'
      +     '<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--white);border:2px solid ' + (((tmData.groundCount|0) > 0) ? 'var(--green-dark)' : 'var(--border)') + ';border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">'
      +       '<input type="checkbox" id="q-tm-ground-chk"' + (((tmData.groundCount|0) > 0) ? ' checked' : '') + ' onchange="document.getElementById(\'q-tm-ground-count\').value=this.checked?1:0;this.parentElement.style.borderColor=this.checked?\'var(--green-dark)\':\'var(--border)\';QuotesPage._calcTM();" style="width:18px;height:18px;">'
      +       '<span style="flex:1;">Groundsman</span><span style="color:var(--text-light);font-size:11px;font-weight:500;">$125/hr</span>'
      +     '</label>'
      // v641: Foreman role removed per Doug
      +   '</div>'
      +   '<input type="hidden" id="q-tm-climber-count" value="' + (tmData.climberCount || '') + '">'
      +   '<input type="hidden" id="q-tm-ground-count" value="' + (tmData.groundCount || '') + '">'
      +   '<input type="hidden" id="q-tm-foreman-count" value="0">'
      + '</div>'

      // ═══ STEP 2 — Hours (label left, input right — on same row) ═══
      + '<div style="background:var(--bg);border-radius:10px;padding:14px;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">'
      +   '<label style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.04em;flex-shrink:0;min-width:120px;">Step 2 — Hours</label>'
      +   '<input type="number" id="q-tm-total-hrs" value="' + (tmData.totalHrs || '') + '" placeholder="Total hours on job" min="0" step="0.5" oninput="QuotesPage._calcTM()" style="flex:1;min-width:140px;padding:10px;border:2px solid var(--border);border-radius:6px;font-size:15px;font-weight:700;text-align:center;">'
      +   '<input type="hidden" id="q-tm-yard-hrs" value="0">'
      +   '<input type="hidden" id="q-tm-drive-hrs" value="0">'
      + '</div>'

      // ═══ STEP 3 — Dump / disposal (fits in its row) ═══
      + '<div style="background:var(--bg);border-radius:10px;padding:14px;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">'
      +   '<label style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.04em;flex-shrink:0;min-width:120px;">Step 3 — Dump fee</label>'
      +   '<div style="flex:1;min-width:140px;display:flex;align-items:center;gap:6px;">'
      +     '<span style="font-size:14px;color:var(--text-light);">$</span>'
      +     '<input type="number" id="q-tm-disposal" value="' + (tmData.disposal || '') + '" placeholder="0" min="0" oninput="QuotesPage._calcTM()" style="flex:1;min-width:0;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:14px;">'
      +   '</div>'
      + '</div>'

      // T&M Total
      + '<div id="q-tm-breakdown" style="background:var(--bg);border-radius:8px;padding:12px;font-size:13px;"></div>'
      + '<div id="q-tm-total" style="margin-top:8px;text-align:right;font-size:15px;font-weight:700;color:var(--accent);"></div>'
      + '</div>'

      // Compare button + panel
      + '<button type="button" id="q-compare-btn" onclick="QuotesPage._showPriceComparison()" style="display:none;margin-top:12px;width:100%;padding:14px;background:var(--green-dark);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">📊 Compare Pricing Methods</button>'
      + '<div id="q-comparison" style="display:none;margin-top:12px;background:var(--green-bg);border:2px solid var(--green-light);border-radius:10px;padding:16px;"></div>'
      + '</div>' // close <details> body wrapper (v633)
      + '</details>' // close Labor Estimate <details> (v633)

      + '</form>';

    // v646: Jobber-style top bar — round X (left), centered title (no h2),
    // round ✨ AI (right). Tighter, more focused first impression on mobile.
    // Sticky bottom action bar (v622) preserved.
    var quoteTitle = quoteId
      ? 'Edit ' + QuotesPage._term(true) + ' #' + q.quoteNumber
      : 'New ' + QuotesPage._term(true).toLowerCase();
    var pageHtml = '<div style="max-width:680px;margin:0 auto;padding:0 0 96px;">'
      // Top bar: X / centered title / ✨
      + '<div style="display:grid;grid-template-columns:40px 1fr 40px;align-items:center;gap:8px;margin-bottom:6px;padding-top:4px;">'
      +   '<button type="button" title="Close" onclick="QuotesPage._clearAutoSave();loadPage(\'quotes\')" style="background:#fff;border:1px solid var(--border);border-radius:50%;width:36px;height:36px;cursor:pointer;font-size:18px;color:var(--text-light);display:flex;align-items:center;justify-content:center;line-height:1;padding:0;">×</button>'
      +   '<div style="text-align:center;font-size:18px;font-weight:800;color:var(--text);">' + quoteTitle + '</div>'
      +   '<button type="button" title="AI assist" onclick="QuotesPage._showAIDraftPicker && QuotesPage._showAIDraftPicker()" style="background:#fff;border:1px solid var(--border);border-radius:50%;width:36px;height:36px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;padding:0;">✨</button>'
      + '</div>'
      + '<div id="q-save-status" style="font-size:11px;color:var(--text-light);margin-bottom:14px;font-style:italic;text-align:center;">Not saved yet — start typing to auto-save.</div>'
      + html
      // STICKY BOTTOM ACTION BAR — fixed at viewport bottom, full-width, white bg
      + '<div style="position:fixed;bottom:0;left:0;right:0;background:var(--white);border-top:1px solid var(--border);box-shadow:0 -2px 8px rgba(0,0,0,.06);padding:10px 14px;display:flex;gap:8px;justify-content:flex-end;align-items:center;z-index:50;">'
      +   '<button class="btn btn-outline" onclick="QuotesPage._clearAutoSave();loadPage(\'quotes\')" style="font-size:13px;">Cancel</button>'
      +   '<button class="btn btn-outline" onclick="QuotesPage.saveAs(\'draft\')" style="font-size:13px;">Save Draft</button>'
      +   '<button class="btn btn-primary" onclick="QuotesPage.saveAs(\'sent\')" style="flex:0 1 auto;min-width:140px;">Save &amp; Send</button>'
      + '</div>'
      + '</div>';

    var content = document.getElementById('pageContent');
    if (content) content.innerHTML = pageHtml;

    // ── AUTO-SAVE FAILSAFE ──
    // Save form state every 15 seconds + on every input change
    // Restores if app crashes, loses service, or accidentally navigates away
    QuotesPage._autoSaveKey = 'bm-quote-autosave-' + (quoteId || 'new');
    QuotesPage._autoSaveTimer = setInterval(function() { QuotesPage._autoSave(); }, 15000);

    // Save on any input change — tighter debounce (500ms) so typed data
    // persists quickly before navigation
    var form = document.getElementById('quote-form');
    if (form) {
      form.addEventListener('input', function() {
        clearTimeout(QuotesPage._autoSaveDebounce);
        QuotesPage._autoSaveDebounce = setTimeout(function() { QuotesPage._autoSave(); }, 500);
      });
      // Immediate save on any field blur (user moved focus elsewhere)
      form.addEventListener('blur', function() { QuotesPage._autoSave(); }, true);
      // Immediate save when user is about to leave the page / switch tabs
      document.addEventListener('visibilitychange', QuotesPage._saveOnHide);
    }

    // Warn before leaving page with unsaved changes
    window._quoteFormDirty = false;
    if (form) form.addEventListener('input', function() { window._quoteFormDirty = true; });
    window.addEventListener('beforeunload', QuotesPage._beforeUnload);
    // pagehide fires reliably on iOS Safari when navigating away
    window.addEventListener('pagehide', QuotesPage._saveOnHide);

    // Flush save whenever a sidebar nav item is tapped (in-app nav) — capture
    // phase so we save BEFORE loadPage tears down the form.
    QuotesPage._navFlushHandler = function(e) {
      var nav = e.target && e.target.closest && e.target.closest('.nav-item, [data-page], .bm-bottom-nav a');
      if (nav) QuotesPage._saveOnHide();
    };
    document.addEventListener('click', QuotesPage._navFlushHandler, true);

    // Check for recovered draft
    var recovered = localStorage.getItem(QuotesPage._autoSaveKey);
    if (recovered && !quoteId) {
      try {
        var rd = JSON.parse(recovered);
        if (rd.clientName || (rd.lineItems && rd.lineItems.length > 0)) {
          // Snapshot into memory AND into a dedicated recovery key so the
          // live autosave can't overwrite it. Autosave stays running normally.
          QuotesPage._pendingRestore = rd;
          try { localStorage.setItem(QuotesPage._autoSaveKey + '-recovery', JSON.stringify(rd)); } catch(e) {}
          var liCount = (rd.lineItems && rd.lineItems.length) || 0;
          var banner = document.createElement('div');
          banner.id = 'q-recovery-banner';
          banner.style.cssText = 'background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:12px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;';
          banner.innerHTML = '<div><strong style="color:#e65100;">📋 Recovered draft</strong><span style="font-size:13px;color:var(--text-light);margin-left:8px;">' + UI.esc(rd.clientName || 'Unsaved quote') + ' — ' + liCount + ' line item' + (liCount === 1 ? '' : 's') + ' — ' + new Date(rd.savedAt).toLocaleTimeString() + '</span></div>'
            + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
            + '<button onclick="QuotesPage._restoreAutoSave()" class="btn btn-primary" style="font-size:12px;padding:4px 12px;">Restore</button>'
            + '<button onclick="this.parentElement.parentElement.remove();localStorage.removeItem(\'' + QuotesPage._autoSaveKey + '\');localStorage.removeItem(\'' + QuotesPage._autoSaveKey + '-recovery\');QuotesPage._pendingRestore=null;" class="btn btn-outline" style="font-size:12px;padding:4px 12px;">Discard</button>'
            + '</div>';
          var formEl = document.getElementById('quote-form');
          if (formEl) formEl.parentElement.insertBefore(banner, formEl);
        }
      } catch(e) {}
    }
  },

  _autoSave: function() {
    var form = document.getElementById('quote-form');
    if (!form) return;
    // Client name comes from the search box (while picking) OR the summary
    // label inside the collapsible client box (after picking).
    var cid = (document.getElementById('q-clientId') || {}).value || '';
    var cname = (document.getElementById('q-client-search') || {}).value || '';
    if (!cname && cid) {
      var sumEl = document.querySelector('.q-client-summary-name');
      if (sumEl) cname = sumEl.textContent || '';
      if (!cname && typeof DB !== 'undefined' && DB.clients) {
        var cc = DB.clients.getById(cid);
        if (cc) cname = cc.name || '';
      }
    }
    var data = {
      savedAt: new Date().toISOString(),
      clientId: cid,
      clientName: cname,
      property: (document.getElementById('q-property') || {}).value || '',
      description: (document.getElementById('q-description') || {}).value || '',
      notes: (document.getElementById('q-notes') || {}).value || '',
      lineItems: []
    };
    document.querySelectorAll('.q-item-wrap').forEach(function(wrap) {
      var photoRow = wrap.querySelector('.quote-item-row');
      var photos = [];
      if (photoRow && photoRow.dataset.photos) { try { photos = JSON.parse(photoRow.dataset.photos); } catch(e){} }
      else if (photoRow && photoRow.dataset.photo) { photos = [photoRow.dataset.photo]; }
      data.lineItems.push({
        species: (wrap.querySelector('.q-item-species') || {}).value || '',
        location: (wrap.querySelector('.q-item-location') || {}).value || '',
        service: (wrap.querySelector('.q-item-service') || {}).value || '',
        description: (wrap.querySelector('.q-item-desc') || {}).value || '',
        qty: (wrap.querySelector('.q-item-qty') || {}).value || '1',
        rate: (wrap.querySelector('.q-item-rate') || {}).value || '',
        photos: photos,
        photo: photos[0] || ''
      });
    });
    try {
      localStorage.setItem(QuotesPage._autoSaveKey, JSON.stringify(data));
      console.debug('[autoSave] ' + data.lineItems.length + ' line items saved, key=' + QuotesPage._autoSaveKey);
      // Live status line so user can SEE that saves are happening
      var statusEl = document.getElementById('q-save-status');
      if (statusEl) {
        var now = new Date();
        var hh = now.getHours(), mm = String(now.getMinutes()).padStart(2, '0');
        var hr12 = ((hh + 11) % 12) + 1;
        statusEl.textContent = '💾 Saved: ' + data.lineItems.length + ' line item' + (data.lineItems.length === 1 ? '' : 's')
          + (data.clientName ? ' · ' + data.clientName : '')
          + ' · ' + hr12 + ':' + mm + (hh >= 12 ? 'p' : 'a');
      }
    } catch(e) { console.warn('[autoSave] failed:', e); }
  },

  _restoreAutoSave: function() {
    // Remove the banner FIRST so it's gone no matter what happens below
    var banner = document.getElementById('q-recovery-banner');
    if (banner) banner.remove();
    try {
      // Prefer the in-memory snapshot or the dedicated recovery key.
      // Never read from the live autosave key — it may be empty by now.
      var data = QuotesPage._pendingRestore || null;
      if (!data) {
        var raw = localStorage.getItem(QuotesPage._autoSaveKey + '-recovery');
        data = raw ? JSON.parse(raw) : null;
      }
      if (!data) { UI.toast('Nothing to restore', 'error'); return; }
      var liCount = (data.lineItems && data.lineItems.length) || 0;
      console.debug('[restore] saved data has ' + liCount + ' line items', data.lineItems);
      UI.toast('Restoring ' + liCount + ' line item(s)...');

      // If a client was previously picked, trigger the full _selectClient flow so
      // the gate lifts and the Line Items section appears. Otherwise just fill the
      // search field so the user can re-pick.
      if (data.clientId) {
        QuotesPage._selectClient(data.clientId, data.clientName || '');
      } else if (data.clientName) {
        var cs = document.getElementById('q-client-search');
        if (cs) cs.value = data.clientName;
      }
      var prop = document.getElementById('q-property');
      if (prop && data.property) prop.value = data.property;
      var desc = document.getElementById('q-description');
      if (desc && data.description) desc.value = data.description;
      var notes = document.getElementById('q-notes');
      if (notes && data.notes) notes.value = data.notes;

      // Line items — defer slightly so _selectClient's DOM reveal finishes first.
      // Without this the #q-items container was sometimes not yet visible/queryable
      // on slow devices, and the restore silently no-op'd.
      if (data.lineItems && data.lineItems.length > 0) {
        setTimeout(function() {
          try {
            var container = document.getElementById('q-items');
            if (!container) {
              UI.toast('⚠ Cannot restore — q-items container missing', 'error');
              return;
            }
            container.innerHTML = '';
            var services = (typeof DB !== 'undefined' && DB.services) ? DB.services.getAll() : [];
            var appended = 0;
            data.lineItems.forEach(function(li, i) {
              var tmp = document.createElement('div');
              try {
                tmp.innerHTML = QuotesPage._itemRow(i, li || {}, services, /*expanded=*/ i === data.lineItems.length - 1);
              } catch (rowErr) {
                console.error('[restore] _itemRow threw for item ' + i, rowErr, li);
                UI.toast('Item ' + (i+1) + ' render error: ' + rowErr.message, 'error');
                return; // skip this item
              }
              var newWrap = tmp.firstElementChild;
              if (!newWrap) {
                console.warn('[restore] no element after innerHTML for item ' + i, tmp.innerHTML.slice(0, 200));
                return;
              }
              container.appendChild(newWrap);
              appended++;
              var row = newWrap.querySelector('.quote-item-row');
              if (row) {
                if (li && li.photos && li.photos.length) row.dataset.photos = JSON.stringify(li.photos);
                if (li && li.photo) row.dataset.photo = li.photo;
              }
            });
            QuotesPage.calcTotal();
            UI.toast('✅ Restored ' + appended + ' of ' + data.lineItems.length + ' line items');
          } catch (loopErr) {
            console.error('[restore] loop crashed', loopErr);
            UI.toast('Restore loop crashed: ' + loopErr.message, 'error');
          }
        }, 250);
      } else {
        UI.toast('No line items in saved draft', 'error');
      }

      // Remove recovery banner — try class first, then text fallback
      var banner = document.getElementById('q-recovery-banner');
      if (banner) banner.remove();
      document.querySelectorAll('div').forEach(function(b) {
        if (b.textContent && b.textContent.indexOf('Recovered draft') >= 0 && b.querySelector('button[onclick*="_restoreAutoSave"]')) {
          b.remove();
        }
      });
      UI.toast('Draft restored ✅');
    } catch(e) {
      console.error('restore error', e);
      UI.toast('Could not restore draft: ' + (e.message || e), 'error');
    }
  },

  // Flush save immediately on visibility/pagehide — no debounce
  _saveOnHide: function() {
    if (QuotesPage._autoSaveDebounce) { clearTimeout(QuotesPage._autoSaveDebounce); QuotesPage._autoSaveDebounce = null; }
    QuotesPage._autoSave();
  },

  _beforeUnload: function(e) {
    if (window._quoteFormDirty) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes on this quote. Are you sure you want to leave?';
    }
  },

  _clearAutoSave: function() {
    if (QuotesPage._autoSaveTimer) clearInterval(QuotesPage._autoSaveTimer);
    if (QuotesPage._autoSaveKey) {
      localStorage.removeItem(QuotesPage._autoSaveKey);
      localStorage.removeItem(QuotesPage._autoSaveKey + '-recovery');
    }
    QuotesPage._pendingRestore = null;
    window._quoteFormDirty = false;
    window.removeEventListener('beforeunload', QuotesPage._beforeUnload);
    window.removeEventListener('pagehide', QuotesPage._saveOnHide);
    document.removeEventListener('visibilitychange', QuotesPage._saveOnHide);
    if (QuotesPage._navFlushHandler) {
      document.removeEventListener('click', QuotesPage._navFlushHandler, true);
      QuotesPage._navFlushHandler = null;
    }
  },

  // Default rates for common services (editable in settings)
  _defaultRates: {
    'Tree Removal': 0, 'Tree Pruning': 0, 'Stump Removal': 150, 'Bucket Truck': 600,
    'Cabling': 300, 'Land Clearing': 0, 'Snow Removal': 0, 'Chipping Brush': 350,
    'Haul Debris': 250, 'Labor': 400, 'Gutter Clean Out': 150, 'Arborist Letter': 350,
    'Firewood Cord': 400, 'Firewood Bundle': 10, 'Free Woodchips': 0, 'Free Estimate': 0
  },

  _itemRow: function(index, item, services, expanded) {
    QuotesPage._dataListOnce(services);
    var lineTotal = ((item.qty || 1) * (item.rate || 0));
    if (typeof expanded === 'undefined') expanded = true;
    var photos = Array.isArray(item.photos) ? item.photos : (item.photo ? [item.photo] : []);
    var photoStr = photos.length ? ' data-photos=\'' + JSON.stringify(photos).replace(/'/g,'&#39;') + '\'' : '';
    var hasContent = !!(item.service || item.description || item.rate);

    // Photo grid (shown in both collapsed + expanded modes)
    var photoHtml = '';
    if (photos.length) {
      photoHtml = '<div class="q-photo-grid" style="display:grid;grid-template-columns:repeat(' + Math.min(photos.length, 3) + ',1fr);gap:4px;margin-bottom:10px;">';
      photos.forEach(function(p, pi) {
        photoHtml += '<img src="' + p + '" onclick="event.stopPropagation();QuotesPage._openLightbox(' + JSON.stringify(photos).replace(/"/g, '&quot;') + ',' + pi + ',' + index + ')" style="width:100%;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;">';
      });
      if (photos.length > 3) photoHtml += '<div style="grid-column:1/-1;font-size:11px;color:var(--text-light);text-align:center;">+' + (photos.length - 3) + ' more — tap any photo to view</div>';
      photoHtml += '</div>';
    }

    // Summary strip: service · species · location · price (NO emojis).
    // Hidden mini thumbnail stays so other code hooks (headerThumb selectors) keep working,
    // but it's zero-width/zero-height — invisible to the user.
    var summaryThumb = '<img class="q-item-header-thumb" src="' + (photos[0] || '') + '" style="display:none;">';
    var parts = [];
    if (item.service)  parts.push(UI.esc(item.service));
    if (item.species)  parts.push(UI.esc(item.species));
    else if (item.description && item.description.indexOf(' — ') > 0) parts.push(UI.esc(item.description.split(' — ')[0]));
    if (item.location) parts.push(UI.esc(item.location));
    var titleText = parts.length ? parts.join(' · ') : (hasContent ? UI.esc(item.description || 'Line item') : 'New line item — fill below');
    var summary = '<div class="q-item-header" onclick="QuotesPage._toggleItem(this)" style="display:flex;align-items:center;gap:10px;cursor:pointer;">'
      + summaryThumb
      + '<div class="q-item-summary-title" style="flex:1;min-width:0;font-size:14px;font-weight:600;color:' + (hasContent ? 'var(--text)' : 'var(--text-light)') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + titleText + '</div>'
      + '<div class="q-item-summary-total" style="font-size:15px;font-weight:700;color:var(--green-dark);flex-shrink:0;">' + UI.money(lineTotal) + '</div>'
      + '<div class="q-item-chevron" style="font-size:16px;color:var(--text-light);transition:transform .2s;' + (expanded ? '' : 'transform:rotate(-90deg);') + '">▾</div>'
      + '</div>';

    // Pricing formula hint — shows under rate if the service has a known formula
    // Computed client-side from description (DBH auto-extraction) when possible
    var formulaHint = '<div class="q-item-formula" style="font-size:11px;color:var(--text-light);margin-top:4px;"></div>';

    // Expanded form body (hidden when collapsed)
    // v629 order: Service → Species → Location → Description → Qty → Rate →
    // photo grid + AI buttons LAST (Jobber pattern: enter the line first,
    // then optionally enrich with photo/AI).
    var body = '<div class="q-item-body" style="margin-top:12px;' + (expanded ? '' : 'display:none;') + '">'
      // Row 1: Service (full width, dropdown)
      + '<div class="form-group" style="margin:0 0 8px;"><label style="font-size:11px;font-weight:600;">Service</label>'
      +   '<input class="q-item-service" list="q-svc-datalist" value="' + UI.esc(item.service || '') + '" placeholder="Type or pick…" onchange="QuotesPage._onServiceChange(this)" oninput="QuotesPage._syncSummary(this)" style="font-size:13px;width:100%;box-sizing:border-box;">'
      + '</div>'
      // Row 2: Species + Location (half each)
      + '<div class="quote-item-row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;"' + photoStr + '>'
      +   '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Species</label><input class="q-item-species" value="' + UI.esc(item.species || '') + '" placeholder="e.g. White Oak" oninput="QuotesPage._syncSummary(this)" style="font-size:13px;"></div>'
      +   '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Location on property</label><input class="q-item-location" value="' + UI.esc(item.location || '') + '" placeholder="e.g. back yard near pool" oninput="QuotesPage._syncSummary(this)" style="font-size:13px;"></div>'
      + '</div>'
      // Row 3: Description (full width)
      + '<div class="form-group" style="margin:0 0 8px;"><label style="font-size:11px;font-weight:600;">Description</label><input class="q-item-desc" value="' + UI.esc(item.description || '') + '" placeholder="Work details..." oninput="QuotesPage._syncSummary(this);QuotesPage._updateFormula(this)" style="font-size:13px;width:100%;box-sizing:border-box;"></div>'
      // Row 4: Qty + Rate + Amount + Delete
      + '<div style="display:grid;grid-template-columns:80px 1fr 1fr 36px;gap:8px;align-items:end;">'
      +   '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Qty</label><input type="number" class="q-item-qty" value="' + (item.qty || 1) + '" min="1" oninput="QuotesPage.calcTotal();QuotesPage._syncSummary(this)" style="font-size:13px;text-align:center;"></div>'
      +   '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Rate ($)</label><input type="number" class="q-item-rate" value="' + (item.rate || '') + '" step="0.01" placeholder="0.00" oninput="QuotesPage.calcTotal();QuotesPage._syncSummary(this)" style="font-size:13px;">'
      +     formulaHint + '</div>'
      +   '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Amount</label><div class="q-item-amount" style="font-size:14px;font-weight:700;color:var(--green-dark);padding:8px 0;">' + UI.money(lineTotal) + '</div></div>'
      +   '<button type="button" style="background:none;border:none;font-size:20px;color:var(--red);cursor:pointer;padding-bottom:8px;opacity:.6;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.6" onclick="this.closest(\'.q-item-wrap\').remove();QuotesPage.calcTotal();">✕</button>'
      + '</div>'
      // v629: photo grid lives below the form fields now (above the photo/AI
      // action buttons) — line entry first, then optional enrichment.
      + (photoHtml ? '<div style="margin-top:14px;">' + photoHtml + '</div>' : '')
      + '<div style="margin-top:14px;padding-top:14px;border-top:1px dashed var(--border);">'
      +   '<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-light);margin-bottom:8px;">Photo &amp; AI</div>'
      +   '<div style="display:flex;gap:6px;justify-content:flex-start;flex-wrap:wrap;">'
      +     '<button type="button" onclick="QuotesPage._addMorePhotos(this)" style="padding:8px 12px;background:#fff;color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">📷 Add Photos</button>'
      +     '<button type="button" onclick="QuotesPage._runAIOnRow(this)" style="padding:8px 12px;background:#fff;color:var(--accent);border:1px solid var(--green-light);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;" title="Let AI fill species, DBH, condition, rate">🤖 Run AI</button>'
      +     '<button type="button" onclick="QuotesPage._plantNetSecondOpinion(this)" style="padding:8px 12px;background:#fff;color:#15803d;border:1px solid #bbf7d0;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;" title="Verify species with PlantNet (second opinion)">🌿 2nd</button>'
      +     '<button type="button" onclick="QuotesPage._collapseRow(this)" style="padding:8px 14px;background:var(--green-dark);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;margin-left:auto;">✓ Done</button>'
      +   '</div>'
      + '</div>'  // close Photo & AI wrapper
      + '</div>'; // close .q-item-body

    return '<div class="q-item-wrap" data-index="' + index + '" style="margin-bottom:10px;padding:12px 14px;background:var(--white);border-radius:12px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + summary
      + body
      + '</div>';
  },

  // Toggle expand/collapse on a line item when user taps the summary header
  _toggleItem: function(headerEl) {
    var wrap = headerEl.closest('.q-item-wrap');
    var body = wrap.querySelector('.q-item-body');
    var chev = wrap.querySelector('.q-item-chevron');
    if (!body) return;
    var collapsed = body.style.display === 'none';
    body.style.display = collapsed ? 'block' : 'none';
    if (chev) chev.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
  },

  // Programmatically collapse the current row (called by "Done with this tree" button)
  _collapseRow: function(btn) {
    var wrap = btn.closest('.q-item-wrap');
    var body = wrap.querySelector('.q-item-body');
    var chev = wrap.querySelector('.q-item-chevron');
    if (body) body.style.display = 'none';
    if (chev) chev.style.transform = 'rotate(-90deg)';
    // Flash confirmation
    wrap.style.transition = 'background .25s'; wrap.style.background = '#dcfce7';
    setTimeout(function() { wrap.style.background = 'var(--bg)'; }, 400);
  },

  // Sync the compact summary text when inputs change (live feedback)
  _syncSummary: function(input) {
    var wrap = input.closest('.q-item-wrap'); if (!wrap) return;
    var species = (wrap.querySelector('.q-item-species') || {}).value || '';
    var location = (wrap.querySelector('.q-item-location') || {}).value || '';
    var svc = (wrap.querySelector('.q-item-service') || {}).value || '';
    var desc = (wrap.querySelector('.q-item-desc') || {}).value || '';
    var qty = parseFloat((wrap.querySelector('.q-item-qty') || {}).value) || 1;
    var rate = parseFloat((wrap.querySelector('.q-item-rate') || {}).value) || 0;
    var title = wrap.querySelector('.q-item-summary-title');
    var total = wrap.querySelector('.q-item-summary-total');
    if (title) {
      // Species · location  (fall back to service/description if species not set yet)
      var left = species || (desc && desc.indexOf(' — ') > 0 ? desc.split(' — ')[0] : '') || svc || 'Tree';
      title.innerHTML = '<span>' + UI.esc(left) + '</span>' + (location ? '<span style="color:var(--text-light);font-weight:500;"> · ' + UI.esc(location) + '</span>' : '');
      title.style.color = 'var(--text)';
    }
    if (total) total.textContent = UI.money(qty * rate);
  },

  // Show a formula hint under the rate input when description mentions DBH inches
  _updateFormula: function(descInput) {
    var wrap = descInput.closest('.q-item-wrap'); if (!wrap) return;
    var hint = wrap.querySelector('.q-item-formula');
    var svc = (wrap.querySelector('.q-item-service') || {}).value || '';
    var desc = descInput.value || '';
    var dbhMatch = desc.match(/(\d+(?:\.\d+)?)\s*["']?\s*DBH/i) || desc.match(/(\d+(?:\.\d+)?)\s*["']\s*/);
    if (!hint) return;
    if (dbhMatch && /removal/i.test(svc)) {
      var dbh = parseFloat(dbhMatch[1]);
      var suggested = Math.round(dbh * 100 / 50) * 50;
      hint.innerHTML = '💡 ' + dbh + '" × $100 = <strong>$' + suggested + '</strong> — <a onclick="event.preventDefault();var r=this.closest(\'.quote-item-row\').querySelector(\'.q-item-rate\');r.value=' + suggested + ';QuotesPage.calcTotal();QuotesPage._syncSummary(r);" style="color:var(--accent);cursor:pointer;text-decoration:underline;" href="#">use</a>';
    } else {
      hint.innerHTML = '';
    }
  },

  // Fullscreen photo lightbox with swipe between images
  _openLightbox: function(photos, startIdx, wrapIndex) {
    var idx = startIdx || 0;
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;touch-action:pan-y;';
    overlay.innerHTML = '<img id="lb-img" src="' + photos[idx] + '" style="max-width:96vw;max-height:80vh;object-fit:contain;border-radius:8px;">'
      + '<div style="position:absolute;top:20px;right:20px;font-size:28px;color:#fff;cursor:pointer;padding:6px 14px;" onclick="this.parentElement.remove()">×</div>'
      + (typeof wrapIndex === 'number' ? '<button id="lb-del" style="position:absolute;bottom:70px;left:50%;transform:translateX(-50%);background:#c0392b;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">🗑 Delete this photo</button>' : '')
      + (photos.length > 1 ? '<div id="lb-count" style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);color:#fff;font-size:13px;background:rgba(0,0,0,.5);padding:6px 14px;border-radius:12px;">' + (idx+1) + ' / ' + photos.length + '</div>' : '');
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    // Wire delete
    setTimeout(function() {
      var del = document.getElementById('lb-del');
      if (del) del.onclick = function(e) {
        e.stopPropagation();
        if (!confirm('Delete this photo?')) return;
        QuotesPage._deleteQuotePhoto(wrapIndex, idx);
        overlay.remove();
      };
    }, 0);
    // Swipe left/right
    var startX = 0;
    overlay.addEventListener('touchstart', function(e) { startX = e.touches[0].clientX; }, { passive: true });
    overlay.addEventListener('touchend', function(e) {
      var dx = (e.changedTouches[0].clientX - startX);
      if (Math.abs(dx) < 40) return;
      if (dx < 0 && idx < photos.length - 1) idx++;
      else if (dx > 0 && idx > 0) idx--;
      document.getElementById('lb-img').src = photos[idx];
      var c = document.getElementById('lb-count'); if (c) c.textContent = (idx+1) + ' / ' + photos.length;
    });
    document.body.appendChild(overlay);
  },

  // Remove a single photo from a quote line item (by wrap index + photo index)
  _deleteQuotePhoto: function(wrapIndex, photoIndex) {
    var wraps = document.querySelectorAll('.q-item-wrap');
    var wrap = wraps[wrapIndex];
    if (!wrap) return;
    var row = wrap.querySelector('.quote-item-row');
    if (!row) return;
    var photos = [];
    try { photos = JSON.parse(row.dataset.photos || '[]'); } catch(e) {}
    if (!photos.length && row.dataset.photo) photos = [row.dataset.photo];
    photos.splice(photoIndex, 1);
    row.dataset.photos = JSON.stringify(photos);
    row.dataset.photo = photos[0] || '';
    // Re-render the grid
    var body = wrap.querySelector('.q-item-body');
    var existingGrid = body ? body.querySelector('.q-photo-grid') : null;
    if (existingGrid) existingGrid.remove();
    if (photos.length && body) {
      var grid = document.createElement('div');
      grid.className = 'q-photo-grid';
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(' + Math.min(photos.length, 3) + ',1fr);gap:4px;margin-bottom:10px;';
      grid.innerHTML = photos.map(function(u, pi) {
        return '<img src="' + u + '" onclick="event.stopPropagation();QuotesPage._openLightbox(' + JSON.stringify(photos).replace(/"/g,'&quot;') + ',' + pi + ',' + wrapIndex + ')" style="width:100%;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;">';
      }).join('');
      body.insertBefore(grid, body.firstChild);
    }
    // Update header thumb
    var headerThumb = wrap.querySelector('.q-item-header img');
    if (headerThumb) {
      if (photos[0]) headerThumb.src = photos[0];
      else {
        var placeholder = document.createElement('div');
        placeholder.style.cssText = 'width:44px;height:44px;border:1px dashed var(--border);border-radius:6px;flex-shrink:0;';
        headerThumb.replaceWith(placeholder);
      }
    }
    UI.toast('Photo deleted');
    QuotesPage._autoSave();
  },

  // Manually trigger AI on an already-uploaded tree row (works even when auto-AI is off,
  // useful after a failed attempt or when service is bad)
  _runAIOnRow: function(btn) {
    var wrap = btn.closest('.q-item-wrap');
    if (!wrap) return;
    var row = wrap.querySelector('.quote-item-row');
    var photos = [];
    if (row && row.dataset.photos) { try { photos = JSON.parse(row.dataset.photos); } catch(e){} }
    else if (row && row.dataset.photo) { photos = [row.dataset.photo]; }
    if (!photos.length) { UI.toast('Upload a photo first, then tap 🤖 Run AI', 'error'); return; }
    var rows = document.querySelectorAll('.quote-item-row');
    var idx = Array.prototype.indexOf.call(rows, row);
    QuotesPage._identifyTree(photos, idx);
  },

  // Tap the tree thumbnail → upload a photo to THIS row. Replaces the placeholder
  // for the header thumb + prepends the photo grid in the body.
  _uploadPhotoToRow: function(thumbEl) {
    var wrap = thumbEl.closest('.q-item-wrap');
    if (!wrap) return;
    var row = wrap.querySelector('.quote-item-row');
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = function(e) {
      var files = Array.from(e.target.files || []);
      if (!files.length) return;
      Promise.all(files.map(function(f) {
        return new Promise(function(resolve) {
          var r = new FileReader();
          r.onload = function(ev) { resolve(ev.target.result); };
          r.readAsDataURL(f);
        });
      })).then(function(newUrls) {
        var existing = [];
        if (row.dataset.photos) { try { existing = JSON.parse(row.dataset.photos); } catch(e){} }
        else if (row.dataset.photo) { existing = [row.dataset.photo]; }
        var all = existing.concat(newUrls).slice(0, 5);
        row.dataset.photos = JSON.stringify(all);
        row.dataset.photo = all[0];
        // Swap header thumb to the new photo
        var newThumb = document.createElement('img');
        newThumb.src = all[0];
        newThumb.style.cssText = 'width:40px;height:40px;object-fit:cover;border-radius:6px;flex-shrink:0;cursor:pointer;';
        newThumb.onclick = function(ev) { ev.stopPropagation(); QuotesPage._uploadPhotoToRow(newThumb); };
        thumbEl.replaceWith(newThumb);
        // Refresh the body photo grid
        var allWraps = document.querySelectorAll('.q-item-wrap');
        var wrapIdx = Array.prototype.indexOf.call(allWraps, wrap);
        var body = wrap.querySelector('.q-item-body');
        var existingGrid = body ? body.querySelector('.q-photo-grid') : null;
        if (existingGrid) existingGrid.remove();
        var grid = document.createElement('div');
        grid.className = 'q-photo-grid';
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(' + Math.min(all.length, 3) + ',1fr);gap:4px;margin-bottom:10px;';
        grid.innerHTML = all.map(function(u, pi) {
          return '<img src="' + u + '" onclick="event.stopPropagation();QuotesPage._openLightbox(' + JSON.stringify(all).replace(/"/g,'&quot;') + ',' + pi + ',' + wrapIdx + ')" style="width:100%;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;">';
        }).join('') + (all.length > 1 ? '<div style="grid-column:1/-1;font-size:11px;color:var(--text-light);text-align:center;">' + all.length + ' photos</div>' : '');
        if (body) body.insertBefore(grid, body.firstChild);
        UI.toast('📷 ' + newUrls.length + ' photo(s) added');
        QuotesPage._autoSave();
        // Optional auto-AI if enabled + key present
        var aiOn = localStorage.getItem('bm-ai-enabled') !== '0';
        var rowIdx = Array.prototype.indexOf.call(document.querySelectorAll('.quote-item-row'), row);
        if (aiOn && localStorage.getItem('bm-claude-key')) {
          QuotesPage._identifyTree(all, rowIdx);
        }
      });
    };
    input.click();
  },

  // Add more photos to an existing line item (appends to dataset.photos array)
  _addMorePhotos: function(btn) {
    var wrap = btn.closest('.q-item-wrap');
    if (!wrap) return;
    var allWraps = document.querySelectorAll('.q-item-wrap');
    var wrapIdx = Array.prototype.indexOf.call(allWraps, wrap);
    var row = wrap.querySelector('.quote-item-row');
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = function(e) {
      var files = Array.from(e.target.files || []);
      if (!files.length) return;
      Promise.all(files.map(function(f) {
        return new Promise(function(resolve) {
          var r = new FileReader();
          r.onload = function(ev) { resolve(ev.target.result); };
          r.readAsDataURL(f);
        });
      })).then(function(newUrls) {
        var existing = [];
        if (row.dataset.photos) { try { existing = JSON.parse(row.dataset.photos); } catch(e){} }
        else if (row.dataset.photo) { existing = [row.dataset.photo]; }
        var all = existing.concat(newUrls).slice(0, 5); // cap at 5
        row.dataset.photos = JSON.stringify(all);
        row.dataset.photo = all[0];
        // Re-render the photo grid in the body
        var body = wrap.querySelector('.q-item-body');
        var existingGrid = body ? body.querySelector('.q-photo-grid') : null;
        if (existingGrid) existingGrid.remove();
        var grid = document.createElement('div');
        grid.className = 'q-photo-grid';
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(' + Math.min(all.length, 3) + ',1fr);gap:4px;margin-bottom:10px;';
        grid.innerHTML = all.map(function(u, pi) {
          return '<img src="' + u + '" onclick="event.stopPropagation();QuotesPage._openLightbox(' + JSON.stringify(all).replace(/"/g,'&quot;') + ',' + pi + ',' + wrapIdx + ')" style="width:100%;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;">';
        }).join('') + (all.length > 1 ? '<div style="grid-column:1/-1;font-size:11px;color:var(--text-light);text-align:center;">' + all.length + ' photos</div>' : '');
        if (body) body.insertBefore(grid, body.firstChild);
        UI.toast('📷 ' + newUrls.length + ' more photo(s) added — tap 🤖 Run AI to analyze');
        QuotesPage._autoSave();
      });
    };
    input.click();
  },

  // Open Property Map in equipment-planning mode; on close, sync placed equipment
  // to the hidden T&M checkboxes so the T&M cost picks up whatever was dropped.
  // Toggle all equipment checkboxes on/off
  _selectAllEquip: function(btn) {
    var checks = document.querySelectorAll('#q-equip-list input[type=checkbox]');
    var allOn = Array.from(checks).every(function(c) { return c.checked; });
    checks.forEach(function(c) {
      if (c.checked === !allOn) return; // already desired state
      c.checked = !allOn;
      c.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (btn) btn.textContent = allOn ? 'Select all' : 'Deselect all';
  },

  // New checkbox-list handler (v279+)
  _toggleEquipCheckbox: function(cb) {
    var key = cb.dataset.key;
    var on = cb.checked;
    // Mirror to hidden T&M checkbox
    var hidden = document.getElementById('q-tm-' + key.toLowerCase());
    if (hidden) hidden.checked = on;
    // Restyle the label parent
    var label = cb.closest('label');
    if (label) {
      label.style.borderColor = on ? '#1a3c12' : 'var(--border)';
      label.style.background = on ? '#f0f5ed' : 'var(--white)';
    }
    // Recompute count + total
    var checks = document.querySelectorAll('#q-equip-list input[type=checkbox]');
    var count = 0, total = 0;
    checks.forEach(function(c) {
      if (c.checked) { count++; total += parseFloat(c.dataset.rate) || 0; }
    });
    var cntEl = document.getElementById('q-equip-count-text');
    var totEl = document.getElementById('q-equip-total-text');
    if (cntEl) cntEl.textContent = count ? '✓ ' + count + ' piece(s) planned' : 'No equipment yet — check any above.';
    if (totEl) totEl.textContent = total > 0 ? '$' + total + '/hr' : '';
    if (QuotesPage._calcTM) QuotesPage._calcTM();
    QuotesPage._autoSave();
  },

  // Legacy pill handler — kept for back-compat with any stale DOM
  _toggleEquip: function(key, btn) {
    var cb = document.getElementById('q-tm-' + key.toLowerCase());
    if (!cb) return;
    cb.checked = !cb.checked;
    var on = cb.checked;
    if (btn) {
      btn.style.background = on ? '#1a3c12' : 'var(--white)';
      btn.style.color = on ? '#fff' : 'var(--text)';
      btn.style.border = '1px solid ' + (on ? '#1a3c12' : 'var(--border)');
    }
    // Recompute running totals on the summary line
    var pills = document.querySelectorAll('#q-equip-pills button[data-key]');
    var count = 0, total = 0;
    pills.forEach(function(p) {
      var k = p.getAttribute('data-key');
      var r = parseFloat(p.getAttribute('data-rate')) || 0;
      var c = document.getElementById('q-tm-' + k.toLowerCase());
      if (c && c.checked) { count++; total += r; }
    });
    var cntEl = document.getElementById('q-equip-count-text');
    var totEl = document.getElementById('q-equip-total-text');
    if (cntEl) cntEl.textContent = count ? '✓ ' + count + ' piece(s) planned' : 'No equipment yet — tap a pill above.';
    if (totEl) totEl.textContent = total > 0 ? '$' + total + '/hr' : '';
    // Re-run T&M calc so the T&M block reflects the new pick
    if (QuotesPage._calcTM) QuotesPage._calcTM();
    QuotesPage._autoSave();
  },

  _openEquipmentMap: function() {
    var address = (document.getElementById('q-property') || {}).value || '';
    if (!address) {
      var clientId = (document.getElementById('q-clientId') || {}).value;
      var c = clientId ? DB.clients.getById(clientId) : null;
      if (c && c.address) address = c.address;
    }
    if (!address) { UI.toast('Add a client + property first so the map knows where to show', 'error'); return; }

    // Load any previously-saved equipment layout for THIS address
    var storageKey = 'bm-equip-map-' + address.trim().toLowerCase();
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch(e) {}

    // Register a hook so PropertyMap calls us when its markers array changes/closes.
    // Also persists to localStorage so layout survives leaving & returning.
    window._bmEquipmentMapHook = function(markers) {
      QuotesPage._syncEquipmentFromMap(markers || []);
      try { localStorage.setItem(storageKey, JSON.stringify(markers || [])); } catch(e) {}
    };

    if (typeof PropertyMap !== 'undefined' && PropertyMap.show) {
      PropertyMap.show(address, saved);
    } else {
      UI.toast('Property map unavailable', 'error');
    }
  },

  // Map the PropertyMap pin IDs onto our T&M equipment checkbox IDs.
  // PropertyMap uses: bucket, chipper, crane, truck, ram, loader, trailer, climber, ground, dropzone, hazard, powerline
  // Our T&M uses:     bucket, chipper, crane, stumpGrinder, miniSkid, dumpTruck, liftLadder, trailer
  _mapMarkerToEquip: {
    'bucket':       'bucket',
    'chipper':      'chipper',
    'crane':        'crane',
    'truck':        'dumpTruck',
    'loader':       'miniSkid',
    'ram':          'dumpTruck',
    'trailer':      'trailer'
    // climber/ground = crew; dropzone/hazard/powerline = markers, no equipment cost
  },

  _syncEquipmentFromMap: function(markers) {
    // Count pins per equipment TYPE (so 4 chippers = 4 units)
    var counts = {};
    (markers || []).forEach(function(m) {
      var equipKey = QuotesPage._mapMarkerToEquip[m.type || m.id];
      if (equipKey) counts[equipKey] = (counts[equipKey] || 0) + 1;
    });
    // Stash counts globally so _calcTM can scale cost by pin count
    window._bmEquipCounts = counts;

    var rates = QuotesPage.getTMRates();
    var labels = {
      bucket: 'Bucket truck', chipper: 'Chipper', crane: 'Crane',
      stumpGrinder: 'Stump grinder', miniSkid: 'Mini-skid / loader',
      dumpTruck: 'Dump truck', liftLadder: 'Man lift / ladder', trailer: 'Trailer'
    };

    // Tick checkboxes for types present (T&M reads them)
    Object.keys(labels).forEach(function(k) {
      var cb = document.getElementById('q-tm-' + k.toLowerCase());
      if (cb) cb.checked = (counts[k] || 0) > 0;
    });

    // Build a nice summary: one line per equipment with count × rate = hourly cost
    var summary = document.getElementById('q-equip-summary');
    var types = Object.keys(counts).filter(function(k){ return counts[k] > 0; });
    if (summary) {
      if (!types.length) {
        summary.innerHTML = 'No equipment planned yet. Open the map to drag what you\'ll bring.';
      } else {
        var totalHourly = 0;
        var lines = types.map(function(k) {
          var cnt = counts[k] || 0;
          var rate = rates[k] || 0;
          var hourly = cnt * rate;
          totalHourly += hourly;
          return '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;">'
            + '<span>' + (labels[k] || k) + ' <strong>×' + cnt + '</strong> <span style="color:var(--text-light);">@ $' + rate + '/hr</span></span>'
            + '<span style="font-weight:700;color:var(--green-dark);">$' + hourly + '/hr</span>'
            + '</div>';
        });
        summary.innerHTML = lines.join('')
          + '<div style="display:flex;justify-content:space-between;padding:6px 0 2px;border-top:1px solid var(--border);margin-top:4px;font-size:13px;font-weight:700;">'
          +   '<span>Equipment hourly</span><span style="color:var(--green-dark);">$' + totalHourly + '/hr</span>'
          + '</div>';
      }
    }
    QuotesPage._calcTM();
  },

  // PlantNet second-opinion — sends the line item's photos to PlantNet API
  // for a pure species ID. Overwrites/suggests species if different from what
  // AI picked. Key from Settings: bm-plantnet-key. Sign up: my.plantnet.org
  _plantNetSecondOpinion: function(btn) {
    var wrap = btn.closest('.q-item-wrap');
    if (!wrap) return;
    var row = wrap.querySelector('.quote-item-row');
    var photos = [];
    if (row && row.dataset.photos) { try { photos = JSON.parse(row.dataset.photos); } catch(e){} }
    else if (row && row.dataset.photo) { photos = [row.dataset.photo]; }
    if (!photos.length) { UI.toast('Upload a photo first before asking for a 2nd opinion', 'error'); return; }

    var key = localStorage.getItem('bm-plantnet-key') || '';
    if (!key) {
      key = prompt('Paste your PlantNet API key (free at my.plantnet.org):');
      if (!key) return;
      localStorage.setItem('bm-plantnet-key', key.trim());
    }

    UI.toast('🌿 Getting 2nd opinion from PlantNet…');

    // PlantNet wants multipart/form-data with image files, not base64 JSON.
    // Convert each data URL to a Blob and build FormData.
    var form = new FormData();
    photos.slice(0, 5).forEach(function(dataUrl, i) {
      var parts = dataUrl.split(',');
      var mime = (parts[0].match(/:(.*?);/) || [,'image/jpeg'])[1];
      var bin = atob(parts[1]);
      var buf = new Uint8Array(bin.length);
      for (var j = 0; j < bin.length; j++) buf[j] = bin.charCodeAt(j);
      form.append('images', new Blob([buf], { type: mime }), 'tree' + i + '.jpg');
      form.append('organs', 'auto');
    });

    fetch('https://my-api.plantnet.org/v2/identify/all?api-key=' + encodeURIComponent(key) + '&nb-results=3', {
      method: 'POST',
      body: form
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.statusCode === 404 || data.error) {
        UI.toast('PlantNet: ' + (data.message || data.error || 'no match'), 'error');
        return;
      }
      var results = data.results || [];
      if (!results.length) { UI.toast('PlantNet: no species matched'); return; }
      var top = results[0];
      var common = (top.species && top.species.commonNames && top.species.commonNames[0]) || '';
      var scientific = (top.species && top.species.scientificNameWithoutAuthor) || '';
      var pct = Math.round((top.score || 0) * 100);

      // Build a small popup to confirm replacement — user sees top 3 matches
      var choices = results.slice(0, 3).map(function(res, i) {
        var c = (res.species && res.species.commonNames && res.species.commonNames[0]) || res.species.scientificNameWithoutAuthor || 'Unknown';
        var s = res.species.scientificNameWithoutAuthor || '';
        var p = Math.round((res.score || 0) * 100);
        return '<button type="button" onclick="QuotesPage._applyPlantNetPick(this,\'' + c.replace(/'/g, "\\'") + '\')" style="display:block;width:100%;text-align:left;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;margin-bottom:6px;font-size:13px;">'
          + '<strong>' + UI.esc(c) + '</strong> <span style="color:var(--text-light);font-size:11px;">(' + p + '% match)</span>'
          + (s ? '<div style="font-size:11px;color:var(--text-light);font-style:italic;">' + UI.esc(s) + '</div>' : '')
          + '</button>';
      }).join('');

      var modal = document.createElement('div');
      modal.id = 'plantnet-popup';
      modal.dataset.wrapId = wrap.dataset.index || '';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
      modal.innerHTML = '<div style="background:#fff;border-radius:12px;padding:20px;max-width:420px;width:100%;" onclick="event.stopPropagation();">'
        + '<h3 style="margin:0 0 8px;">🌿 PlantNet 2nd Opinion</h3>'
        + '<div style="font-size:13px;color:var(--text-light);margin-bottom:12px;">Tap a match to use it as the species.</div>'
        + choices
        + '<button type="button" onclick="document.getElementById(\'plantnet-popup\').remove();" style="width:100%;margin-top:8px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:13px;cursor:pointer;">Cancel</button>'
        + '</div>';
      modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
      // Keep reference to wrap so _applyPlantNetPick can find its species input
      modal._targetWrap = wrap;
      document.body.appendChild(modal);
    })
    .catch(function(e) {
      UI.toast('PlantNet error: ' + (e.message || 'network'), 'error');
    });
  },

  _applyPlantNetPick: function(btn, commonName) {
    var modal = document.getElementById('plantnet-popup');
    var wrap = modal && modal._targetWrap;
    if (!wrap) { if (modal) modal.remove(); return; }
    var speciesEl = wrap.querySelector('.q-item-species');
    if (speciesEl) { speciesEl.value = commonName; QuotesPage._syncSummary(speciesEl); }
    if (modal) modal.remove();
    UI.toast('Species updated to ' + commonName);
  },

  // Tree-measure modal: opens TreeMeasure in an iframe-less inline container + writes back to current row's DBH
  _openMeasureModal: function(btn) {
    var wrap = btn.closest('.q-item-wrap');
    if (!wrap) return;
    // Simple prompt fallback — TreeMeasure page is a full page; embedding it requires refactor
    var current = (wrap.querySelector('.q-item-desc') || {}).value || '';
    var dbh = prompt('DBH (diameter at breast height, inches):', (current.match(/(\d+)\s*["\']?\s*DBH/i) || [,''])[1]);
    if (!dbh || isNaN(parseFloat(dbh))) return;
    var descEl = wrap.querySelector('.q-item-desc');
    var rateEl = wrap.querySelector('.q-item-rate');
    var svc = (wrap.querySelector('.q-item-service') || {}).value || '';
    if (descEl) {
      if (/DBH/i.test(descEl.value)) descEl.value = descEl.value.replace(/\d+\s*["']?\s*DBH/i, dbh + '" DBH');
      else descEl.value = dbh + '" DBH' + (descEl.value ? ' — ' + descEl.value : '');
    }
    // Auto-suggest rate for removal
    if (/removal/i.test(svc) && rateEl && !rateEl.value) {
      rateEl.value = Math.round(parseFloat(dbh) * 100 / 50) * 50;
    }
    QuotesPage.calcTotal();
    QuotesPage._syncSummary(wrap.querySelector('.q-item-desc'));
    QuotesPage._updateFormula(wrap.querySelector('.q-item-desc'));
    UI.toast('DBH set to ' + dbh + '"');
  },

  // Service-specific measurement prompts → auto-price
  _servicePricing: {
    'Tree Removal': { prompt: 'DBH (inches):', unit: 'inch', rate: 100, desc: function(v) { return v + '" DBH tree removal'; } },
    'Stump Removal': { prompt: 'Total stump radius (inches):', unit: 'inch', rate: 10, desc: function(v) { return v + '" radius stump grinding'; } },
    'Cabling': { prompt: 'Cable length (feet):', unit: 'foot', rate: 10, desc: function(v) { return v + '\' cable installation'; } }
  },

  _onServiceChange: function(sel) {
    // v642: was closest('.quote-item-row') — but the service input lives in its
    // own .form-group OUTSIDE that row (the row only holds Species + Location).
    // Sentry caught the resulting null deref. Use .q-item-wrap which contains
    // the whole line item.
    var wrap = sel && sel.closest && sel.closest('.q-item-wrap');
    if (!wrap) return;
    var svc = sel.value;
    var rateInput = wrap.querySelector('.q-item-rate');
    var descInput = wrap.querySelector('.q-item-desc');
    if (!rateInput || !descInput) return;

    var pricing = QuotesPage._servicePricing[svc];
    if (pricing) {
      var measurement = prompt(pricing.prompt);
      if (measurement && !isNaN(parseFloat(measurement))) {
        var m = parseFloat(measurement);
        rateInput.value = Math.round(m * pricing.rate);
        if (!descInput.value) descInput.value = pricing.desc(m);
      }
    } else {
      var rate = QuotesPage._defaultRates[svc];
      if (rate && rate > 0) rateInput.value = rate;
    }

    if (!descInput.value) {
      var services = DB.services.getAll();
      var match = services.find(function(s) { return s.name === svc; });
      if (match && match.description) descInput.value = match.description;
    }
    QuotesPage.calcTotal();
  },

  addItem: function(prefillService) {
    var container = document.getElementById('q-items');
    var index = container.children.length;
    var services = DB.services.getAll();
    // Auto-collapse any previously-added trees so user can focus on the new one
    container.querySelectorAll('.q-item-wrap .q-item-body').forEach(function(b) { b.style.display = 'none'; });
    container.querySelectorAll('.q-item-wrap .q-item-chevron').forEach(function(c) { c.style.transform = 'rotate(-90deg)'; });
    var seed = prefillService ? { service: prefillService } : {};
    var div = document.createElement('div');
    div.innerHTML = QuotesPage._itemRow(index, seed, services);
    container.appendChild(div.firstChild);
    // Focus the service input (or description if service was pre-filled)
    var newWrap = container.lastElementChild;
    if (newWrap) {
      var focusSel = prefillService
        ? newWrap.querySelector('.q-item-desc')
        : newWrap.querySelector('.q-item-service');
      if (focusSel) setTimeout(function(){ focusSel.focus(); }, 50);
      newWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Trigger service-change formula calculation if pre-filled
      if (prefillService) {
        var svcInput = newWrap.querySelector('.q-item-service');
        if (svcInput && QuotesPage._onServiceChange) QuotesPage._onServiceChange(svcInput);
      }
    }
    // Immediately persist — button-driven row adds don't fire form input events
    QuotesPage._autoSave();
  },

  // v633: handler for the service picker dropdown above the line items
  _addItemFromPicker: function(selectEl) {
    if (!selectEl || !selectEl.value) return;
    var v = selectEl.value;
    selectEl.value = ''; // reset picker for next pick
    if (v === '__custom__') {
      QuotesPage.addItem(); // blank line item, user types service manually
    } else {
      QuotesPage.addItem(v); // pre-fill chosen service, focus moves to description
    }
  },

  _toggleDeposit: function(checked) {
    var fields = document.getElementById('q-deposit-fields');
    var preview = document.getElementById('q-deposit-preview');
    var label = document.querySelector('#q-deposit-req + span');
    if (fields) fields.style.display = checked ? 'grid' : 'none';
    if (preview) preview.style.display = checked ? 'block' : 'none';
    if (label) label.textContent = checked ? 'On' : 'Off';
    if (checked) QuotesPage._calcDeposit();
  },

  _calcDeposit: function() {
    var totalEl = document.getElementById('q-total-display');
    var depTypeEl = document.getElementById('q-deposit-type');
    var depAmtEl = document.getElementById('q-deposit-amount');
    var preview = document.getElementById('q-deposit-preview');
    if (!preview) return;
    var total = parseFloat((totalEl ? totalEl.textContent : '0').replace(/[^0-9.]/g,'')) || 0;
    var type = depTypeEl ? depTypeEl.value : 'percent';
    var amount = depAmtEl ? parseFloat(depAmtEl.value) || 0 : 0;
    var due = type === 'percent' ? (total * amount / 100) : amount;
    preview.textContent = 'Deposit due: ' + (type === 'percent' ? amount + '% = ' : '') + '$' + due.toFixed(2) + (total > 0 ? ' of $' + total.toFixed(2) + ' total' : '');
  },

  calcTotal: function() {
    var subtotal = 0;
    document.querySelectorAll('.q-item-wrap').forEach(function(wrap) {
      var qtyEl = wrap.querySelector('.q-item-qty');
      var rateEl = wrap.querySelector('.q-item-rate');
      if (!qtyEl || !rateEl) return;
      var qty = parseFloat(qtyEl.value) || 0;
      var rate = parseFloat(rateEl.value) || 0;
      var lineTotal = qty * rate;
      subtotal += lineTotal;
      var amountEl = wrap.querySelector('.q-item-amount');
      if (amountEl) amountEl.textContent = UI.money(lineTotal);
    });
    var taxRateEl = document.getElementById('q-tax-rate');
    var taxRate = taxRateEl ? (parseFloat(taxRateEl.value) || 0) : 0;
    var taxAmt = Math.round(subtotal * taxRate / 100 * 100) / 100;
    var total = subtotal + taxAmt;
    var subEl = document.getElementById('q-subtotal-display');
    var taxEl = document.getElementById('q-tax-display');
    var totEl = document.getElementById('q-total-display');
    if (subEl) subEl.textContent = UI.money(subtotal);
    if (taxEl) taxEl.textContent = UI.money(taxAmt);
    if (totEl) totEl.textContent = UI.money(total);
  },

  saveAs: function(status) {
    var form = document.getElementById('quote-form');
    if (!form) return;
    // Store desired status, trigger save
    form.dataset.saveStatus = status;
    form.requestSubmit();
  },

  save: function(e, quoteId) {
    e.preventDefault();
    try { return QuotesPage._saveImpl(e, quoteId); }
    catch(err) {
      console.error('[QuotesPage.save] ERROR:', err);
      QuotesPage._saving = false;
      var f = e.target;
      if (f) f.querySelectorAll('button').forEach(function(b) { b.disabled = false; b.style.opacity = ''; b.style.cursor = ''; });
      UI.toast('Save failed: ' + (err && err.message ? err.message : err), 'error');
    }
  },

  _saveImpl: function(e, quoteId) {
    if (QuotesPage._saving) return;
    var form = e.target;
    var _disableButtons = function() {
      QuotesPage._saving = true;
      if (form) form.querySelectorAll('button[type=submit], button[onclick*="requestSubmit"], button[onclick*="saveAs"]').forEach(function(b) {
        b.disabled = true; b.style.opacity = '0.5'; b.style.cursor = 'wait';
      });
    };
    var _unsave = function() {
      QuotesPage._saving = false;
      if (form) form.querySelectorAll('button').forEach(function(b) {
        b.disabled = false; b.style.opacity = ''; b.style.cursor = '';
      });
    };

    var clientIdEl = document.getElementById('q-clientId');
    var clientId = clientIdEl ? clientIdEl.value : '';
    if (!clientId) {
      UI.toast('Client required — pick or create one before saving', 'error');
      var clientArea = document.getElementById('q-client-search') || document.getElementById('q-client-block') || clientIdEl;
      if (clientArea && clientArea.scrollIntoView) clientArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (clientArea) {
        var orig = clientArea.style.boxShadow;
        clientArea.style.boxShadow = '0 0 0 3px #dc3545';
        clientArea.style.transition = 'box-shadow .3s';
        setTimeout(function() { if (document.contains(clientArea)) clientArea.style.boxShadow = orig || ''; }, 2500);
      }
      return; // Don't disable — let user retry after picking client
    }
    var client = DB.clients.getById(clientId);
    if (!client) {
      UI.toast('Selected client no longer exists — pick another', 'error');
      return;
    }

    // Passed validation — NOW disable buttons to prevent double-submit
    _disableButtons();

    var items = [];
    var subtotal = 0;
    document.querySelectorAll('.q-item-wrap').forEach(function(wrap) {
      var serviceEl = wrap.querySelector('.q-item-service');
      var descEl = wrap.querySelector('.q-item-desc');
      var qtyEl = wrap.querySelector('.q-item-qty');
      var rateEl = wrap.querySelector('.q-item-rate');
      if (!qtyEl || !rateEl) return;
      var service = serviceEl ? serviceEl.value : '';
      var desc = descEl ? descEl.value : '';
      var qty = parseFloat(qtyEl.value) || 0;
      var rate = parseFloat(rateEl.value) || 0;
      if (service || desc || rate) {
        var photoRow = wrap.querySelector('.quote-item-row');
        var photos = [];
        if (photoRow && photoRow.dataset.photos) { try { photos = JSON.parse(photoRow.dataset.photos); } catch(e){} }
        else if (photoRow && photoRow.dataset.photo) { photos = [photoRow.dataset.photo]; }
        var species = (wrap.querySelector('.q-item-species') || {}).value || '';
        var location = (wrap.querySelector('.q-item-location') || {}).value || '';
        items.push({ species: species, location: location, service: service, description: desc, qty: qty, rate: rate, amount: qty * rate, photos: photos, photo: photos[0] || '' });
        subtotal += qty * rate;
      }
    });
    var taxRateVal = document.getElementById('q-tax-rate');
    var taxRate = taxRateVal ? (parseFloat(taxRateVal.value) || 0) : (parseFloat(localStorage.getItem('bm-tax-rate')) || 8.375);
    var taxAmount = Math.round(subtotal * taxRate / 100 * 100) / 100;
    var total = subtotal + taxAmount;

    // Deposit handled in settings/PDF, not on quote form
    var depositRequired = false;
    var depositType = 'percent';
    var depositAmount = 0;
    var depositDue = 0;
    var expiresEl = document.getElementById('q-expires');
    var expiresAt = expiresEl ? expiresEl.value : new Date(Date.now() + 30*86400000).toISOString().split('T')[0];

    var existingQ = quoteId ? DB.quotes.getById(quoteId) : {};
    var data = {
      clientId: clientId,
      clientName: client ? client.name : '',
      clientEmail: (client && client.email) || '',
      clientPhone: (client && client.phone) || '',
      property: document.getElementById('q-property').value.trim() || (client && client.address) || '',
      description: document.getElementById('q-description').value.trim(),
      lineItems: items,
      subtotal: subtotal,
      taxRate: taxRate,
      taxAmount: taxAmount,
      total: total,
      notes: document.getElementById('q-notes').value.trim(),
      // Field removed from form; preserve existing value if editing, else default true
      showEquipMapToClient: (existingQ && existingQ.showEquipMapToClient !== undefined) ? existingQ.showEquipMapToClient : true,
      status: form.dataset.saveStatus || 'draft',
      // Preserve origin request link (don't lose on edit)
      requestId: QuotesPage._originRequestId || existingQ.requestId || null,
      depositRequired: depositRequired,
      depositType: depositType,
      depositAmount: depositAmount,
      depositDue: depositDue,
      expiresAt: expiresAt,
      timeMaterial: (function() {
        function n(id) { var e = document.getElementById(id); return e ? (parseFloat(e.value) || 0) : 0; }
        function c(id) { var e = document.getElementById(id); return !!(e && e.checked); }
        var climberCount = n('q-tm-climber-count');
        var groundCount  = n('q-tm-ground-count');
        var foremanCount = n('q-tm-foreman-count');
        var onSite       = n('q-tm-total-hrs');
        var yardHrs      = n('q-tm-yard-hrs');
        var driveHrs     = n('q-tm-drive-hrs');
        var disposal     = n('q-tm-disposal');
        if (!onSite && !climberCount && !groundCount && !foremanCount) return null;
        return {
          climberCount: climberCount, groundCount: groundCount, foremanCount: foremanCount,
          totalHrs: onSite, yardHrs: yardHrs, driveHrs: driveHrs,
          disposal: disposal,
          bucket: c('q-tm-bucket'), chipper: c('q-tm-chipper'), crane: c('q-tm-crane'),
          stumpGrinder: c('q-tm-stumpgrinder'), miniSkid: c('q-tm-miniskid'),
          dumpTruck: c('q-tm-dumptruck'), liftLadder: c('q-tm-liftladder'),
          trailer: c('q-tm-trailer'),
          equipCounts: window._bmEquipCounts || {},
          tmTotal: QuotesPage._calcTM()
        };
      })()
    };

    var savedId;
    if (quoteId) {
      DB.quotes.update(quoteId, data);
      UI.toast(QuotesPage._term(true) + ' updated');
      savedId = quoteId;
    } else {
      var newQ = DB.quotes.create(data);
      UI.toast(QuotesPage._term(true) + ' created');
      savedId = newQ.id;
    }

    QuotesPage._clearAutoSave();
    if (client && client.status === 'lead') DB.clients.update(clientId, { status: 'active' });
    _unsave();
    if (document.querySelector('.modal-overlay')) UI.closeModal();

    if (data.status === 'sent' && savedId) {
      QuotesPage._sendQuote(savedId);
    } else {
      loadPage('quotes');
    }
  },

  showDetail: function(id) {
    var q = DB.quotes.getById(id);
    if (!q) return;
    if (window.bmRememberDetail) window.bmRememberDetail('quotes', id);

    // legacy system-style quote detail
    var statusColors = {draft:'#6c757d',sent:'#e07c24',awaiting:'#e07c24',approved:'#2e7d32',converted:'#2e7d32',declined:'#dc3545'};
    var statusColor = statusColors[q.status] || '#8b2252';
    var client = q.clientId ? DB.clients.getById(q.clientId) : null;

    var html = '<div style="max-width:960px;margin:0 auto;">'
      // Top bar: back + actions
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">'
      + '<button class="btn btn-outline" onclick="loadPage(\'quotes\')" style="padding:6px 12px;font-size:12px;">← Back to Quotes</button>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">'
      // v461: stale follow-up CTA — surface when quote has been awaiting 5+ days
      // and either no follow-up sent yet OR last follow-up > 3 days ago.
      // Was buried in the kebab menu; per funnel audit this is the biggest
      // pipeline-unlocker (44 stale quotes worth of money sitting).
      + (function(){
          if (q.status !== 'sent' && q.status !== 'awaiting') return '';
          var sentTs = q.sentAt ? new Date(q.sentAt).getTime() : (q.createdAt ? new Date(q.createdAt).getTime() : 0);
          if (!sentTs) return '';
          var daysSince = Math.floor((Date.now() - sentTs) / 86400000);
          if (daysSince < 5) return '';
          var fuTs = q.lastFollowUp ? new Date(q.lastFollowUp).getTime() : 0;
          var daysSinceFu = fuTs ? Math.floor((Date.now() - fuTs) / 86400000) : 999;
          if (daysSinceFu < 3) return ''; // Don't pester
          var label = fuTs ? 'Send Another Follow-Up · ' + daysSince + 'd' : 'Send Follow-Up · ' + daysSince + 'd';
          return '<button onclick="QuotesPage._quickFollowUp(\'' + id + '\')" '
            +    'style="background:#f59e0b;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;" '
            +    'title="Quote sent ' + daysSince + ' days ago — nudge the client">'
            +  '📧 ' + label
            + '</button>';
        })()
      + '<button class="btn btn-outline" onclick="QuotesPage._copyApprovalLink(\'' + id + '\')" style="font-size:12px;">Copy Link</button>'
      + (q.status !== 'converted' && q.status !== 'declined'
          ? '<button class="btn btn-outline" onclick="QuotesPage._sendQuote(\'' + id + '\')" style="font-size:12px;">Send Quote</button>' : '')
      + (q.status === 'approved' || q.status === 'converted'
          ? '<button class="btn btn-primary" onclick="if(typeof Workflow!==\'undefined\')Workflow.quoteToJob(\'' + id + '\');loadPage(\'jobs\');" style="font-size:12px;">Convert to Job</button>'
          : '<button class="btn btn-primary" onclick="QuotesPage.showForm(\'' + id + '\')" style="font-size:12px;">Edit Quote</button>')
      + '<div style="position:relative;display:inline-block;">'
      + '<button onclick="var d=this.nextElementSibling;document.querySelectorAll(\'.more-dd\').forEach(function(x){x.style.display=\'none\'});d.style.display=d.style.display===\'block\'?\'none\':\'block\';" class="btn btn-outline" style="font-size:13px;padding:6px 10px;">•••</button>'
      + '<div class="more-dd" style="display:none;position:absolute;right:0;top:calc(100% + 4px);background:#fff;border:1px solid var(--border);border-radius:8px;padding:4px 0;z-index:200;min-width:180px;box-shadow:0 4px 16px rgba(0,0,0,.12);">'
      + '<button onclick="QuotesPage.showForm(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">Edit Quote</button>'
      + '<button onclick="QuotesPage._sendQuote(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">Send to Client</button>'
      + (q.clientId ? '<button onclick="ClientsPage._sendPortalInvite(\'' + q.clientId + '\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">🔗 Send portal invite</button>' : '')
      + '<button onclick="QuotesPage._copyApprovalLink(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">Copy Approval Link</button>'
      + '<button onclick="PDF.generateQuote(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">Download PDF</button>'
      + '<button onclick="QuotesPage._quickFollowUp(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">Send Follow-up</button>'
      + '<div style="height:1px;background:var(--border);margin:4px 0;"></div>'
      + '<button onclick="QuotesPage.setStatus(\'' + id + '\',\'declined\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:#dc3545;">Mark Declined</button>'
      + '<button onclick="QuotesPage._archiveQuote(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text-light);">Archive</button>'
      + '<button onclick="QuotesPage._deleteQuote(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:#dc3545;">Delete Quote</button>'
      + '</div></div>'
      + '</div></div>'

      // Single header card — no duplication
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:16px;">'
      + '<div style="height:4px;background:' + statusColor + ';"></div>'
      + '<div style="padding:20px 24px;">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px;">'
      + '<div>'
      + '<h2 style="font-size:22px;font-weight:700;margin:0 0 4px;">' + QuotesPage._term(true) + ' #' + (q.quoteNumber||'') + ' — ' + UI.esc(q.clientName || '—') + '</h2>'
      + '<div style="font-size:13px;color:var(--text-light);">' + UI.dateShort(q.createdAt) + (q.sentAt ? ' · Sent ' + UI.dateShort(q.sentAt) : '') + '</div>'
      + (q.property ? '<a href="https://maps.apple.com/?daddr=' + encodeURIComponent(q.property) + '" target="_blank" rel="noopener noreferrer" style="display:block;font-size:13px;color:var(--accent);margin-top:2px;text-decoration:none;">📍 ' + UI.esc(q.property) + ' →</a>' : '')
      + '</div>'
      + '<div style="text-align:right;">' + UI.statusBadge(q.status) + '<div style="font-size:24px;font-weight:800;color:var(--accent);margin-top:6px;">' + UI.money(q.total) + '</div></div>'
      + '</div>'
      // Contact + details in one row
      + '<div style="display:flex;gap:24px;flex-wrap:wrap;font-size:13px;color:var(--text-light);border-top:1px solid var(--border);padding-top:12px;">'
      + (q.clientPhone || (client && client.phone) ? '<a href="tel:' + (q.clientPhone || client.phone).replace(/\D/g,'') + '" style="color:var(--accent);">📞 ' + (q.clientPhone || client.phone) + '</a>' : '')
      + (q.clientEmail || (client && client.email) ? '<a href="mailto:' + (q.clientEmail || client.email) + '" style="color:var(--accent);">✉️ ' + (q.clientEmail || client.email) + '</a>' : '')
      + (q.expiresAt ? (function() {
          var exp = new Date(q.expiresAt); var now = new Date();
          var days = Math.ceil((exp - now) / 86400000);
          var color = days < 0 ? '#dc3545' : days <= 5 ? '#e6a817' : 'var(--text-light)';
          var label = days < 0 ? 'Expired ' + Math.abs(days) + 'd ago' : days === 0 ? 'Expires today' : 'Valid ' + days + 'd';
          return '<span style="color:' + color + ';">⏱ ' + label + '</span>';
        })() : '')
      + (q.depositRequired ? '<span>' + (q.depositPaid ? '✅ Deposit paid' : '⚠️ Deposit due: ' + UI.money(q.depositDue)) + '</span>' : '')
      + (q.source ? '<span>📣 ' + UI.esc(q.source) + '</span>' : '')
      + (q.requestId ? '<a onclick="RequestsPage._pendingDetail=\'' + q.requestId + '\';loadPage(\'requests\');" style="color:var(--accent);cursor:pointer;">📥 From Request</a>' : '')
      + '</div>'
      + '</div></div>'

      // Description
      + (q.description ? '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">'
        + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Description</h4>'
        + '<p style="font-size:14px;line-height:1.6;margin:0;word-wrap:break-word;overflow-wrap:break-word;white-space:pre-wrap;">' + UI.esc(q.description) + '</p></div>' : '')

      // Line items (Product / Service) — inline editor
      + QuotesPage.renderLineItems(q, id)

      // Video walkthrough (full width, above photos)
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">Video Walkthrough</h4>'
      + (q.videoUrl
        ? '<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;margin-bottom:8px;">'
          + '<iframe src="' + q.videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/') + '" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen></iframe></div>'
          + '<div style="display:flex;gap:6px;">'
          + '<button class="btn btn-outline" style="font-size:11px;" onclick="navigator.clipboard.writeText(\'' + UI.esc(q.videoUrl) + '\');UI.toast(\'Video link copied!\')">🔗 Copy Link</button>'
          + '<button class="btn btn-outline" style="font-size:11px;" onclick="QuotesPage._removeVideo(\'' + id + '\')">🗑 Remove</button>'
          + '</div>'
        : '<div style="text-align:center;padding:16px;background:var(--bg);border-radius:8px;">'
          + '<div style="font-size:24px;margin-bottom:8px;">🎥</div>'
          + '<div style="font-size:13px;color:var(--text-light);margin-bottom:8px;">Record a property walkthrough and attach it to this quote</div>'
          + '<button class="btn btn-primary" style="font-size:12px;" onclick="QuotesPage._addVideo(\'' + id + '\')">+ Add Video</button>'
          + '</div>')
      + '</div>'

      // Photos + Notes + Actions in bottom section
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;" class="detail-grid">'

      // Photos
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">Photos</h4>';
    if (typeof Photos !== 'undefined') { html += Photos.renderGallery('quote', id); }
    else { html += '<div style="color:var(--text-light);font-size:13px;">No photos</div>'; }
    html += '</div>'

      // Notes + Status + Actions
      + '<div>'
      // Internal notes — editable textarea, autosaves on blur (parity with invoice detail)
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;">'
      + '<h4 style="font-size:12px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px;font-weight:700;">Internal Notes</h4>'
      + '<textarea id="quote-notes-' + id + '" placeholder="Notes only you see\u2026" style="width:100%;min-height:90px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;" onblur="QuotesPage._saveNotes(\'' + id + '\',this.value)">' + UI.esc(q.notes || '') + '</textarea>'
      + '</div>'
      // Update Status chips (parity with invoice detail)
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;">'
      + '<h4 style="font-size:12px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px;font-weight:700;">Update Status</h4>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
      + (function() {
          var statusBtns = [['draft','Draft'],['sent','Sent'],['awaiting','Awaiting'],['approved','Approved'],['converted','Converted'],['declined','Declined']];
          return statusBtns.map(function(sb) {
            var isActive = q.status === sb[0];
            return '<button onclick="QuotesPage.setStatus(\'' + id + '\',\'' + sb[0] + '\')" style="font-size:11px;padding:5px 12px;border-radius:6px;border:1px solid '
              + (isActive ? '#2e7d32' : 'var(--border)') + ';background:' + (isActive ? '#2e7d32' : 'var(--white)') + ';color:' + (isActive ? '#fff' : 'var(--text)') + ';cursor:pointer;font-weight:' + (isActive ? '700' : '500') + ';">'
              + sb[1] + '</button>';
          }).join('');
        })()
      + '</div></div>'
      // Action buttons
      + '<div style="display:flex;flex-direction:column;gap:6px;">'
      + '<button class="btn btn-outline" style="width:100%;justify-content:center;font-size:12px;" onclick="PDF.generateQuote(\'' + id + '\')">📄 Download PDF</button>'
      + (q.property ? '<button class="btn btn-outline" style="width:100%;justify-content:center;font-size:12px;" onclick="PropertyMap.show(\'' + (q.property || '').replace(/'/g, "\\'") + '\')">📐 Equipment Layout</button>' : '')
      + (q.status !== 'converted' ? '<button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="if(typeof Workflow!==\'undefined\')Workflow.quoteToJob(\'' + id + '\');loadPage(\'jobs\');">✅ Convert to Job</button>' : '')
      + '</div></div>'

      + '</div>'
      + '</div>'; // close max-width wrapper

    // Render full page
    document.getElementById('pageTitle').textContent = QuotesPage._term(true) + ' #' + q.quoteNumber;
    document.getElementById('pageContent').innerHTML = html;
    document.getElementById('pageAction').style.display = 'none';
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  },

  _getApprovalLink: function(id) {
    // Token-gated approval link — required by quote-fetch / quote-update
    // edge fns. Old code generated 16-char tokens (~64 bits, brute-forceable).
    // Now: 32-char tokens (~128 bits) and existing too-short tokens get
    // upgraded transparently on next link generation.
    var q = DB.quotes.getById(id);
    var token = q && q.approvalToken;
    if (!token || token.length < 24) {
      token = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '').slice(0, 32)
        : (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 32);
      DB.quotes.update(id, { approvalToken: token });
    }
    var url = 'https://branchmanager.app/approve.html?id=' + id + '&token=' + token;
    // Pass client-facing settings so approve.html (runs in customer's browser) can respect them
    var requireSig = localStorage.getItem('bm-require-quote-sig') !== 'false';
    var tcUrl = localStorage.getItem('bm-tc-url') || '';
    var term = localStorage.getItem('bm-quote-term') || 'quote';
    if (!requireSig) url += '&nosig=1';
    if (tcUrl)       url += '&tc=' + encodeURIComponent(tcUrl);
    if (term === 'estimate') url += '&term=estimate';
    return url;
  },

  _copyApprovalLink: function(id) {
    var link = QuotesPage._getApprovalLink(id);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(function() { UI.toast('Approval link copied!'); }).catch(function() { UI.toast('Could not copy — use Ctrl+C', 'error'); });
    } else {
      var el = document.getElementById('approval-link-input');
      if (el) { el.select(); document.execCommand('copy'); UI.toast('Approval link copied!'); }
    }
  },

  _sendQuote: function(id) {
    var q = DB.quotes.getById(id);
    if (!q) return;

    var client = q.clientId ? DB.clients.getById(q.clientId) : null;
    var email = (client && client.email) || q.clientEmail || '';
    var phone = (client && client.phone) || q.clientPhone || '';
    var firstName = (q.clientName || '').split(' ')[0] || 'there';
    var approvalLink = QuotesPage._getApprovalLink(id);

    var hasEmail = !!email;
    var hasPhone = !!phone;

    var _co = QuotesPage._co();
    var _term = QuotesPage._term(true);
    var _terml = QuotesPage._term(false);

    // Defaults — both editable in the panels below.
    var defaultSubject = _term + ' #' + q.quoteNumber + ' from ' + _co.name + ' — ' + UI.money(q.total);
    var defaultEmailNote = 'Hi ' + firstName + ',\n\n'
      + 'Thanks for reaching out to ' + _co.name + '! Here\'s your ' + _terml + ' for the work we discussed. '
      + 'Click the green button at the bottom to view, approve, or request changes — no login required.\n\n'
      + 'This ' + _terml + ' is valid for 30 days.\n\n'
      + 'Questions? Reply to this email or call ' + _co.phone + '.\n\n'
      + 'Thanks,\n' + CompanyInfo.get('ownerName') + '\n' + _co.name;
    var defaultSms = QuotesPage._buildSmsBody(id);

    var emailDisabledAttr = hasEmail ? '' : 'disabled';
    var phoneDisabledAttr = hasPhone ? '' : 'disabled';
    var emailPanelStyle = hasEmail ? '' : 'opacity:.5;';
    var smsPanelStyle   = hasPhone ? '' : 'opacity:.5;';

    var html = '<div style="padding:16px;max-width:780px;margin:0 auto;">'

      // Quote header strip
      + '<div style="background:var(--bg);border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;">'
      +   '<div style="min-width:0;">'
      +     '<div style="font-size:11px;font-weight:700;color:var(--text-light);letter-spacing:.06em;text-transform:uppercase;">' + _term + ' #' + q.quoteNumber + '</div>'
      +     '<div style="font-size:14px;font-weight:600;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(q.clientName || '') + (q.property ? ' · ' + UI.esc(q.property) : '') + '</div>'
      +   '</div>'
      +   '<div style="font-size:22px;font-weight:800;color:var(--green-dark);white-space:nowrap;">' + UI.money(q.total) + '</div>'
      + '</div>'

      // EMAIL panel — editable subject + personal note
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px;' + emailPanelStyle + '">'
      +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap;">'
      +     '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:15px;font-weight:700;">'
      +       '<input type="checkbox" id="send-via-email" ' + (hasEmail ? 'checked' : 'disabled') + ' style="width:18px;height:18px;cursor:pointer;">'
      +       '📧 Send Email'
      +     '</label>'
      +     '<button type="button" onclick="QuotesPage._previewRenderedEmail(\'' + id + '\')" ' + emailDisabledAttr + ' style="background:none;border:1px solid var(--border);padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;">👁 View rendered</button>'
      +   '</div>'
      +   '<div style="font-size:11px;color:var(--text-light);margin-bottom:6px;">To: <strong style="color:var(--text);">' + UI.esc(email || '(no email on file)') + '</strong></div>'
      +   '<input type="text" id="send-subject" value="' + UI.esc(defaultSubject) + '" placeholder="Subject" ' + emailDisabledAttr + ' style="width:100%;padding:9px 11px;font-size:13px;border:1px solid var(--border);border-radius:6px;margin-bottom:8px;box-sizing:border-box;">'
      +   '<textarea id="send-email-note" rows="9" placeholder="Personal note to client" ' + emailDisabledAttr + ' style="width:100%;padding:10px 12px;font-size:13px;border:1px solid var(--border);border-radius:6px;font-family:inherit;line-height:1.5;resize:vertical;box-sizing:border-box;">' + UI.esc(defaultEmailNote) + '</textarea>'
      +   '<div style="font-size:11px;color:var(--text-light);margin-top:6px;">The rendered ' + _terml + ' (line items, totals, big green Approve button) is attached below your note automatically.</div>'
      + '</div>'

      // SMS panel — editable body
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px;' + smsPanelStyle + '">'
      +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap;">'
      +     '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:15px;font-weight:700;">'
      +       '<input type="checkbox" id="send-via-sms" ' + (hasPhone ? 'checked' : 'disabled') + ' style="width:18px;height:18px;cursor:pointer;">'
      +       '💬 Send Text'
      +     '</label>'
      +     '<span id="sms-char-count" style="font-size:11px;color:var(--text-light);"></span>'
      +   '</div>'
      +   '<div style="font-size:11px;color:var(--text-light);margin-bottom:6px;">To: <strong style="color:var(--text);">' + UI.esc(phone || '(no phone on file)') + '</strong></div>'
      +   '<textarea id="send-sms-body" rows="6" oninput="QuotesPage._smsCharCount()" ' + phoneDisabledAttr + ' style="width:100%;padding:10px 12px;font-size:13px;border:1px solid var(--border);border-radius:6px;font-family:inherit;line-height:1.5;resize:vertical;box-sizing:border-box;">' + UI.esc(defaultSms) + '</textarea>'
      +   '<div style="font-size:11px;color:var(--text-light);margin-top:6px;">Approval link is included automatically; edit the rest as needed.</div>'
      + '</div>'

      // Approval link box (read-only, copy)
      + '<div style="background:#e8f5e9;border-radius:8px;padding:10px 14px;margin-bottom:14px;border-left:3px solid var(--green-dark);">'
      +   '<div style="font-size:11px;font-weight:700;color:var(--green-dark);margin-bottom:4px;">Approval link (already inside both messages)</div>'
      +   '<div style="display:flex;gap:6px;align-items:center;">'
      +     '<input id="approval-link-input" type="text" readonly value="' + approvalLink + '" style="flex:1;font-size:11px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:#fff;color:#333;">'
      +     '<button onclick="QuotesPage._copyApprovalLink(\'' + id + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Copy</button>'
      +   '</div>'
      + '</div>'

      + '</div>';

    UI.showModal('Send ' + _term + ' #' + q.quoteNumber, html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" id="send-quote-btn" onclick="QuotesPage._confirmSend(\'' + id + '\')">Send →</button>'
    });

    setTimeout(function() { QuotesPage._smsCharCount(); }, 0);
  },

  _smsCharCount: function() {
    var ta = document.getElementById('send-sms-body');
    var lbl = document.getElementById('sms-char-count');
    if (!ta || !lbl) return;
    var len = (ta.value || '').length;
    var segs = len === 0 ? 0 : Math.ceil(len / 160);
    lbl.textContent = len + ' chars · ' + segs + ' SMS';
  },

  _previewRenderedEmail: function(id) {
    // Use the CURRENT (possibly edited) note from the textarea so preview reflects edits live.
    var noteEl = document.getElementById('send-email-note');
    var note = noteEl ? noteEl.value : '';
    var htmlBody = QuotesPage._buildEmailHtml(id, note);
    var old = document.getElementById('bm-email-preview-overlay');
    if (old) old.remove();
    var overlay = document.createElement('div');
    overlay.id = 'bm-email-preview-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:10000;display:flex;flex-direction:column;';
    overlay.innerHTML = '<div style="background:#1a1a2e;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">'
      + '<span style="color:#fff;font-weight:700;font-size:14px;">Rendered Email Preview</span>'
      + '<button onclick="document.getElementById(\'bm-email-preview-overlay\').remove()" style="background:none;border:none;color:rgba(255,255,255,.7);font-size:24px;cursor:pointer;line-height:1;">×</button>'
      + '</div>'
      + '<iframe id="bm-email-preview-frame" style="flex:1;border:none;background:#f5f6f8;" sandbox="allow-same-origin"></iframe>';
    document.body.appendChild(overlay);
    var frame = document.getElementById('bm-email-preview-frame');
    if (frame) frame.srcdoc = htmlBody;
  },

  _buildSmsBody: function(id) {
    var q = DB.quotes.getById(id);
    if (!q) return '';
    var _co = QuotesPage._co();
    var _terml = QuotesPage._term(false);
    var firstName = (q.clientName || '').split(' ')[0] || 'there';
    var approvalLink = QuotesPage._getApprovalLink(id);
    return 'Hi ' + firstName + ' — your ' + _terml + ' #' + q.quoteNumber
      + ' from ' + _co.name + ' is ready (' + UI.money(q.total) + '). View & approve: '
      + approvalLink;
  },

  _buildEmailHtml: function(id, personalNote) {
    var q = DB.quotes.getById(id);
    if (!q) return '';
    var _co       = QuotesPage._co();
    var _term     = QuotesPage._term(true);    // "Quote" or "Estimate"
    var _terml    = QuotesPage._term(false);   // lowercase
    var _showQty  = QuotesPage._showQty();
    var _showUnit = QuotesPage._showUnitPrice();
    var _tcUrl    = QuotesPage._tcUrl();
    var approvalLink = QuotesPage._getApprovalLink(id);
    function fmt(n) { n = parseFloat(n)||0; return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','); }
    function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    var issuedDate = q.createdAt ? new Date(q.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    var validUntil = q.expiresAt ? new Date(q.expiresAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : new Date(Date.now()+30*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    var subtotal = parseFloat(q.subtotal||q.total||0);
    var taxRate  = parseFloat(q.taxRate||0);
    var taxAmt   = parseFloat(q.taxAmount||0);
    var total    = parseFloat(q.total||0);

    // ── Line item rows ────────────────────────────────────────────────────
    var liRows = '';
    if (q.lineItems && q.lineItems.length) {
      q.lineItems.forEach(function(item, i) {
        var bg  = i%2===0 ? '#ffffff' : '#f8fafc';
        var qty = parseFloat(item.qty||1);
        var rate= parseFloat(item.rate||0);
        var amt = parseFloat(item.amount||(qty*rate));
        liRows += '<tr style="background:' + bg + ';">'
          + '<td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#111;font-size:13px;">'     + esc(item.service||'Tree Service') + '</td>'
          + '<td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;color:#4b5563;font-size:13px;">'                 + esc(item.description||'') + '</td>'
          + (_showQty  ? '<td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;text-align:center;color:#111;font-size:13px;">'  + qty + '</td>' : '')
          + (_showUnit ? '<td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;text-align:right;color:#111;font-size:13px;">'   + fmt(rate) + '</td>' : '')
          + '<td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:#111;font-size:13px;">' + fmt(amt) + '</td>'
          + '</tr>';
      });
    }
    // ── Totals rows ───────────────────────────────────────────────────────
    var totalsRows = '<tr><td style="padding:7px 16px 7px 0;color:#4b5563;font-size:13px;text-align:right;">Subtotal</td>'
      + '<td style="padding:7px 16px;color:#111;font-size:13px;text-align:right;font-weight:600;min-width:100px;">' + fmt(subtotal) + '</td></tr>';
    if (taxRate > 0) {
      totalsRows += '<tr><td style="padding:4px 16px 4px 0;color:#4b5563;font-size:13px;text-align:right;">Tax (' + taxRate + '%)</td>'
        + '<td style="padding:4px 16px;color:#111;font-size:13px;text-align:right;">' + fmt(taxAmt) + '</td></tr>';
    }
    totalsRows += '<tr style="background:#374151;"><td style="padding:10px 16px 10px 0;color:#fff;font-size:14px;font-weight:700;text-align:right;">Total</td>'
      + '<td style="padding:10px 16px;color:#fff;font-size:15px;font-weight:900;text-align:right;">' + fmt(total) + '</td></tr>';

    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
      + '<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;">'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 0;">'
      + '<tr><td align="center">'
      + '<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:8px;box-shadow:0 2px 16px rgba(0,0,0,.10);overflow:hidden;">'

      // ── Header: logo + company ─────────────────────────────────────────
      + '<tr><td style="padding:20px 26px 18px;border-bottom:3px solid #1a3c12;">'
      + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
      + '<td width="58" style="vertical-align:middle;">'
      + (_co.logo
          ? '<img src="' + _co.logo + '" style="width:48px;height:48px;object-fit:contain;border-radius:10px;display:block;" alt="' + esc(_co.name) + '">'
          : '<div style="background:#1a3c12;border-radius:10px;width:48px;height:48px;text-align:center;line-height:48px;font-size:24px;">🌳</div>')
      + '</td>'
      + '<td style="vertical-align:middle;padding-left:12px;">'
      + '<div style="font-size:17px;font-weight:800;color:#1a3c12;line-height:1.2;">' + esc(_co.name) + '</div>'
      + '<div style="font-size:12px;color:#718096;margin-top:3px;">' + esc(_co.phone||'') + ' &nbsp;·&nbsp; ' + esc(_co.email||'') + '</div>'
      + '</td>'
      + '<td align="right" style="vertical-align:middle;font-size:11px;color:#a0aec0;white-space:nowrap;">' + esc(_co.website||'') + '</td>'
      + '</tr></table>'
      + '</td></tr>'

      // ── Two-column: Bill To / Quote meta ──────────────────────────────
      + '<tr><td style="padding:0;">'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">'
      + '<tr>'
      + '<td style="padding:18px 26px;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;vertical-align:top;width:55%;">'
      + '<div style="font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:.08em;text-transform:uppercase;margin-bottom:7px;">BILL TO</div>'
      + '<div style="font-size:15px;font-weight:700;color:#111;margin-bottom:4px;">' + esc(q.clientName||'') + '</div>'
      + (q.property    ? '<div style="font-size:13px;color:#4b5563;margin-bottom:2px;">' + esc(q.property)    + '</div>' : '')
      + (q.clientPhone ? '<div style="font-size:13px;color:#4b5563;margin-bottom:2px;">' + esc(q.clientPhone) + '</div>' : '')
      + (q.clientEmail ? '<div style="font-size:13px;color:#00836c;">'                   + esc(q.clientEmail) + '</div>' : '')
      + '</td>'
      + '<td style="background:#1a3c12;padding:18px 22px;vertical-align:top;width:45%;">'
      + '<div style="font-size:12px;font-weight:800;color:#fff;letter-spacing:.05em;text-transform:uppercase;margin-bottom:12px;">' + _term + ' #' + esc(String(q.quoteNumber||'')) + '</div>'
      + '<table width="100%" cellpadding="0" cellspacing="0">'
      + '<tr><td style="font-size:12px;color:rgba(255,255,255,.65);padding-bottom:5px;">Issued</td><td align="right" style="font-size:12px;color:#fff;font-weight:600;padding-bottom:5px;">'     + issuedDate  + '</td></tr>'
      + '<tr><td style="font-size:12px;color:rgba(255,255,255,.65);">Valid Until</td><td align="right" style="font-size:12px;color:#fff;font-weight:600;">' + validUntil  + '</td></tr>'
      + '</table>'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-top:1px solid rgba(255,255,255,.2);padding-top:12px;">'
      + '<tr><td style="padding-top:10px;font-size:13px;color:rgba(255,255,255,.8);font-weight:600;">Total</td>'
      + '<td align="right" style="padding-top:10px;font-size:17px;color:#fff;font-weight:900;">' + fmt(total) + '</td></tr>'
      + '</table>'
      + '</td>'
      + '</tr></table>'
      + '</td></tr>'

      // ── Personal note (editable on send page; falls back to nothing if blank) ──
      + ((personalNote && String(personalNote).trim())
          ? '<tr><td style="padding:18px 26px 6px;font-size:14px;color:#111;line-height:1.55;white-space:pre-wrap;">' + esc(String(personalNote).trim()) + '</td></tr>'
          : '')

      // ── Service title ─────────────────────────────────────────────────
      + (q.subject ? '<tr><td style="padding:12px 26px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:700;color:#374151;">' + esc(q.subject) + '</td></tr>' : '')
      + (q.description && !q.subject ? '<tr><td style="padding:12px 26px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;font-style:italic;">' + esc(q.description) + '</td></tr>' : '')

      // ── Line items ────────────────────────────────────────────────────
      + (liRows ? '<tr><td style="padding:0;"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">'
        + '<thead><tr style="background:#374151;">'
        + '<th style="padding:9px 14px;color:#fff;font-size:11px;font-weight:600;text-align:left;letter-spacing:.05em;text-transform:uppercase;width:26%;">Service</th>'
        + '<th style="padding:9px 14px;color:#fff;font-size:11px;font-weight:600;text-align:left;letter-spacing:.05em;text-transform:uppercase;">Description</th>'
        + (_showQty  ? '<th style="padding:9px 14px;color:#fff;font-size:11px;font-weight:600;text-align:center;letter-spacing:.05em;text-transform:uppercase;width:7%;">Qty</th>' : '')
        + (_showUnit ? '<th style="padding:9px 14px;color:#fff;font-size:11px;font-weight:600;text-align:right;letter-spacing:.05em;text-transform:uppercase;width:14%;">Unit Price</th>' : '')
        + '<th style="padding:9px 14px;color:#fff;font-size:11px;font-weight:600;text-align:right;letter-spacing:.05em;text-transform:uppercase;width:14%;">Total</th>'
        + '</tr></thead><tbody>' + liRows + '</tbody>'
        + '</table></td></tr>' : '')

      // ── Totals (right-aligned) ────────────────────────────────────────
      + '<tr><td style="padding:0;border-top:2px solid #e5e7eb;">'
      + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
      + '<td></td>'
      + '<td style="border-left:1px solid #e5e7eb;" width="280">'
      + '<table width="100%" cellpadding="0" cellspacing="0">' + totalsRows + '</table>'
      + '</td></tr></table>'
      + '</td></tr>'

      // ── CTA ───────────────────────────────────────────────────────────
      + '<tr><td style="padding:28px 26px;text-align:center;background:#f9fafb;border-top:1px solid #e5e7eb;">'
      + '<p style="font-size:14px;color:#4b5563;margin:0 0 20px 0;line-height:1.5;">Review your ' + _terml + ' and approve it online — no login required.</p>'
      + '<a href="' + approvalLink + '" style="display:inline-block;background:#1a3c12;color:#fff;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:800;text-decoration:none;">'
      + '&#10003;&nbsp; View &amp; Approve ' + _term + '</a>'
      + '<p style="font-size:12px;color:#9ca3af;margin:14px 0 0;line-height:1.4;">This ' + _terml + ' is valid for 30 days. You can approve, request changes, or ask questions by replying to this email.</p>'
      + (_tcUrl ? '<p style="font-size:11px;color:#9ca3af;margin:8px 0 0;"><a href="' + _tcUrl + '" style="color:#6b7280;text-decoration:underline;">Terms &amp; Conditions</a></p>' : '')
      + '</td></tr>'

      // ── Footer ────────────────────────────────────────────────────────
      + '<tr><td style="padding:14px 26px;border-top:1px solid #e5e7eb;">'
      + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
      + '<td style="font-size:12px;color:#6b7280;">Questions? Call or text <strong style="color:#374151;">' + esc(_co.phone||'') + '</strong></td>'
      + '<td align="right" style="font-size:11px;color:#d1d5db;">Licensed &amp; Insured' + (_co.licenses ? ' &nbsp;·&nbsp; ' + esc(_co.licenses) : '') + '</td>'
      + '</tr></table>'
      + '<div style="margin-top:8px;font-size:11px;color:#9ca3af;">Want to see all your quotes, invoices &amp; job history any time? <a href="https://branchmanager.app/portal.html" style="color:#1a3c12;text-decoration:underline;">Get your portal link &rarr;</a></div>'
      + '</td></tr>'

      // ── Social + Review bar ───────────────────────────────────────────
      + (function() {
          var links = [];
          if (_co.googleReview) links.push('<a href="' + _co.googleReview + '" style="color:#1a3c12;text-decoration:none;font-weight:700;font-size:12px;white-space:nowrap;">⭐ Leave a Review</a>');
          if (_co.facebook)     links.push('<a href="' + _co.facebook     + '" style="color:#1877f2;text-decoration:none;font-size:12px;white-space:nowrap;">&#9633; Facebook</a>');
          if (_co.instagram)    links.push('<a href="' + _co.instagram    + '" style="color:#e1306c;text-decoration:none;font-size:12px;white-space:nowrap;">&#9650; Instagram</a>');
          if (_co.yelp)         links.push('<a href="' + _co.yelp         + '" style="color:#d32323;text-decoration:none;font-size:12px;white-space:nowrap;">&#9670; Yelp</a>');
          if (_co.nextdoor)     links.push('<a href="' + _co.nextdoor     + '" style="color:#00b246;text-decoration:none;font-size:12px;white-space:nowrap;">&#9632; Nextdoor</a>');
          if (!links.length) return '';
          return '<tr><td style="padding:10px 26px 16px;border-top:1px solid #f3f4f6;text-align:center;">'
            + links.join('<span style="color:#e5e7eb;margin:0 8px;">|</span>')
            + '</td></tr>';
        })()

      + '</table>' // main card
      + '</td></tr></table>' // outer wrapper
      + '</body></html>';
  },

  _confirmSend: function(id) {
    var emailChk = document.getElementById('send-via-email');
    var smsChk   = document.getElementById('send-via-sms');
    var doEmail  = !!(emailChk && emailChk.checked && !emailChk.disabled);
    var doSms    = !!(smsChk   && smsChk.checked   && !smsChk.disabled);

    if (!doEmail && !doSms) { UI.toast('Pick at least one channel (email or text)', 'error'); return; }

    // .trim() is critical — Email._isValidEmail rejects on any whitespace, and a
    // trailing space silently caused the v531 "Failed to send" regression.
    var subject   = ((document.getElementById('send-subject')    || {}).value || '').trim();
    var emailNote = ((document.getElementById('send-email-note') || {}).value || '');
    var smsBody   = ((document.getElementById('send-sms-body')   || {}).value || '').trim();

    var q = DB.quotes.getById(id);
    if (!q) return;
    var client = q.clientId ? DB.clients.getById(q.clientId) : null;
    var to    = (((client && client.email) || q.clientEmail || '') + '').trim();
    var phone = (((client && client.phone) || q.clientPhone || '') + '').trim();

    if (doEmail && !to)    { UI.toast('No email on file', 'error'); return; }
    if (doSms   && !phone) { UI.toast('No phone on file', 'error'); return; }
    if (doEmail && !subject) { UI.toast('Email subject is empty', 'error'); return; }
    if (doSms   && !smsBody) { UI.toast('Text message is empty', 'error'); return; }

    var sendBtn = document.getElementById('send-quote-btn');
    if (sendBtn) { sendBtn.textContent = 'Sending...'; sendBtn.disabled = true; }
    UI.closeModal();

    var jobs = [];
    var sentVia = [];

    if (doEmail && typeof Email !== 'undefined') {
      var htmlBody = QuotesPage._buildEmailHtml(id, emailNote);
      // silent:true suppresses Email.send's own toasts so we can show one
      // aggregate toast — but we capture r.hint / r.error so the aggregate
      // toast reports the REAL reason (Resend 422, rate limit, bad sender, etc.)
      // rather than a generic "Failed to send".
      jobs.push(Email.send(to, subject, emailNote, { htmlBody: htmlBody, silent: true })
        .then(function(r) {
          var ok = r && (r.success || r.ok);
          if (ok) sentVia.push('email');
          return { kind: 'email', ok: ok, status: r && r.status, hint: r && (r.hint || r.error) };
        })
        .catch(function(e) { return { kind: 'email', ok: false, hint: 'exception: ' + (e && e.message) }; }));
    }

    if (doSms && typeof Dialpad !== 'undefined') {
      jobs.push(Dialpad.sendSMS(phone, smsBody, q.clientId)
        .then(function(r) {
          // sendSMS returns { success, method } — counts sms_app fallback as ok too
          var ok = r && (r.success || r.method === 'sms_app');
          if (ok) sentVia.push('text');
          return { kind: 'sms', ok: ok, hint: r && (r.error || r.hint) };
        })
        .catch(function(e) { return { kind: 'sms', ok: false, hint: 'exception: ' + (e && e.message) }; }));
    }

    Promise.all(jobs).then(function(results) {
      var failed = results.filter(function(r) { return !r.ok; });
      var failBlurb = failed.map(function(r) {
        return r.kind + (r.status ? ' ' + r.status : '') + (r.hint ? ': ' + r.hint : '');
      }).join(' · ');

      if (!failed.length && sentVia.length) {
        UI.toast(QuotesPage._term(true) + ' sent via ' + sentVia.join(' + ') + ' ✓');
      } else if (sentVia.length) {
        UI.toast(QuotesPage._term(true) + ' partly sent (' + sentVia.join(', ') + ') — ' + failBlurb, 'warning');
      } else {
        // Surface the real reason. Was previously a generic "Failed to send".
        UI.toast('Send failed — ' + (failBlurb || 'no channel succeeded'), 'error');
        console.warn('[Quote send] all channels failed:', results);
      }

      // Mark as sent only when at least one channel succeeded
      if (sentVia.length) {
        var dest = [];
        if (sentVia.indexOf('email') !== -1) dest.push(to);
        if (sentVia.indexOf('text')  !== -1) dest.push(phone);
        DB.quotes.update(id, {
          status: 'sent',
          sentAt: new Date().toISOString(),
          sentTo: dest.join(' / '),
          sentChannel: sentVia.join('+')
        });
      }
      QuotesPage.showDetail(id);
    });
  },

  setStatus: function(id, status) {
    DB.quotes.update(id, { status: status });

    // Auto-convert approved quotes to jobs (legacy system-style pipeline)
    if (status === 'approved') {
      var q = DB.quotes.getById(id);
      if (q && !q.convertedJobId) {
        UI.confirm(QuotesPage._term(true) + ' approved! Create a job from this ' + QuotesPage._term(false) + '?', function() {
          if (typeof Workflow !== 'undefined') {
            var job = Workflow.quoteToJob(id);
            if (job) { UI.toast('✅ Job #' + job.jobNumber + ' created'); loadPage('jobs'); return; }
          }
          QuotesPage.showDetail(id);
        }, function() { UI.toast(QuotesPage._term(true) + ' approved'); QuotesPage.showDetail(id); });
        return;
      }
    }
    UI.toast(QuotesPage._term(true) + ' status: ' + status);
    QuotesPage.showDetail(id);
  },

  // Injects a shared <datalist> with all service suggestions. The line-item
  // service input is an <input list="q-svc-datalist"> so users can type or pick.
  _dataListOnce: function(services) {
    if (document.getElementById('q-svc-datalist')) return;
    setTimeout(function() {
      if (document.getElementById('q-svc-datalist')) return;
      var dl = document.createElement('datalist');
      dl.id = 'q-svc-datalist';
      (services || []).forEach(function(s) {
        var opt = document.createElement('option');
        opt.value = s.name;
        dl.appendChild(opt);
      });
      // Fallback defaults if services list is empty
      if (!services || !services.length) {
        ['Tree Removal','Tree Pruning','Stump Grinding','Cabling','Clean Up','Arborist Letter','Other']
          .forEach(function(n) { var o = document.createElement('option'); o.value = n; dl.appendChild(o); });
      }
      document.body.appendChild(dl);
    }, 0);
  },

  // ── Photo-first flow — focused one-tree-at-a-time with MULTIPLE photos for AI ──
  _addPhotoFirst: function() {
    QuotesPage._pendingService = ''; // let AI choose the service itself
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true; // ← allow multi-select (trunk + crown + whole tree) for better AI accuracy
    input.onchange = function(e) {
      var files = Array.from(e.target.files || []);
      if (!files.length) return;
      // Only create the line item AFTER photos are picked (avoids empty rows if user cancels)
      QuotesPage.addItem();
      // Hard cap at 5 to keep payload reasonable
      if (files.length > 5) { UI.toast('Max 5 photos per tree — using first 5'); files = files.slice(0, 5); }
      Promise.all(files.map(function(f) {
        return new Promise(function(resolve) {
          var r = new FileReader();
          r.onload = function(ev) { resolve(ev.target.result); };
          r.readAsDataURL(f);
        });
      })).then(function(dataUrls) {
        var wraps = document.querySelectorAll('.q-item-wrap');
        var lastWrap = wraps[wraps.length - 1];
        var lastRow = lastWrap ? lastWrap.querySelector('.quote-item-row') : null;
        if (lastWrap && lastRow) {
          // Store photos on both the row (for save()) and the wrap (for display persistence)
          lastRow.dataset.photos = JSON.stringify(dataUrls);
          lastRow.dataset.photo = dataUrls[0];
          // Replace any existing photo grid, then prepend a fresh one inside q-item-body
          var body = lastWrap.querySelector('.q-item-body');
          var existingGrid = body ? body.querySelector('.q-photo-grid') : null;
          if (existingGrid) existingGrid.remove();
          var grid = document.createElement('div');
          grid.className = 'q-photo-grid';
          grid.style.cssText = 'display:grid;grid-template-columns:repeat(' + Math.min(dataUrls.length, 3) + ',1fr);gap:4px;margin-bottom:10px;';
          var lastIdx = wraps.length - 1;
          grid.innerHTML = dataUrls.map(function(u, pi) {
            return '<img src="' + u + '" onclick="event.stopPropagation();QuotesPage._openLightbox(' + JSON.stringify(dataUrls).replace(/"/g,'&quot;') + ',' + pi + ',' + lastIdx + ')" style="width:100%;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;">';
          }).join('') + (dataUrls.length > 1 ? '<div style="grid-column:1/-1;font-size:11px;color:var(--text-light);text-align:center;margin-top:2px;">' + dataUrls.length + ' photos — AI analyzing all</div>' : '');
          body.insertBefore(grid, body.firstChild);
          // Update header thumb
          var headerThumb = lastWrap.querySelector('.q-item-header img, .q-item-header div[style*="dashed"]');
          if (headerThumb) {
            var newThumb = document.createElement('img');
            newThumb.src = dataUrls[0];
            newThumb.style.cssText = 'width:44px;height:44px;object-fit:cover;border-radius:6px;flex-shrink:0;';
            headerThumb.replaceWith(newThumb);
          }
        }
        // Respect global AI toggle — if user turned off AI, skip the call entirely.
        // They can manually trigger it later via the 🤖 Run AI button on the row.
        var aiOn = localStorage.getItem('bm-ai-enabled') !== '0';
        if (aiOn) {
          QuotesPage._identifyTree(dataUrls, document.querySelectorAll('.quote-item-row').length - 1);
        } else {
          UI.toast('Photo added — AI off, fill details manually or tap 🤖 Run AI');
        }
        // Persist the row with its photos immediately so restore doesn't miss them
        QuotesPage._autoSave();
      });
    };
    input.click();
  },

  _openTreeMeasure: function() {
    // Open the standalone Tree Measure page in a new tab so user can use the camera-ruler tool.
    // (Keeping the quote form state intact — tab-out is safer than modal injection.)
    if (typeof loadPage !== 'function') { UI.toast('Tree Measure page not loaded'); return; }
    window.open(window.location.pathname + '#treemeasure', '_blank');
  },

  // ── Service-first then photo (legacy path, kept for backwards compat) ──
  _addWithServiceAndPhoto: function() {
    var sel = document.getElementById('q-add-service');
    var svc = sel ? sel.value : '';
    if (!svc) { UI.toast('Select a service first'); return; }

    // Prompt for measurement based on service
    var pricing = QuotesPage._servicePricing[svc];
    var measurement = null;
    var rate = 0;
    var desc = '';
    if (pricing) {
      measurement = prompt(pricing.prompt);
      if (!measurement || isNaN(parseFloat(measurement))) { measurement = null; }
      else {
        var m = parseFloat(measurement);
        rate = Math.round(m * pricing.rate);
        desc = pricing.desc(m);
      }
    }

    // Add line item with service pre-filled
    QuotesPage.addItem();
    var rows = document.querySelectorAll('.quote-item-row');
    var lastRow = rows[rows.length - 1];
    if (lastRow) {
      var svcEl = lastRow.querySelector('.q-item-service');
      if (svcEl) svcEl.value = svc;
      if (desc) { var descEl = lastRow.querySelector('.q-item-desc'); if (descEl) descEl.value = desc; }
      if (rate) { var rateEl = lastRow.querySelector('.q-item-rate'); if (rateEl) rateEl.value = rate; }
      QuotesPage.calcTotal();
    }

    // Store selected service for AI context
    QuotesPage._pendingService = svc;

    // Now open camera
    QuotesPage._addTreePhoto();
  },

  _addTreePhoto: function() {
    // Use camera or file input — no `capture` attr so iOS/Android show the
    // native picker (Take Photo / Photo Library / Browse) instead of forcing camera.
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        var dataUrl = ev.target.result;
        // Use existing last row (already added by _addWithServiceAndPhoto) or add new
        var rows = document.querySelectorAll('.quote-item-row');
        if (!rows.length || QuotesPage._pendingService) {
          // Row already added by _addWithServiceAndPhoto, use last one
        } else {
          QuotesPage.addItem();
          rows = document.querySelectorAll('.quote-item-row');
        }
        var lastRow = rows[rows.length - 1];
        if (lastRow) {
          // Store photo on the row
          lastRow.dataset.photo = dataUrl;
          // Add photo thumbnail before the row content
          var thumb = document.createElement('div');
          thumb.style.cssText = 'margin-bottom:8px;';
          thumb.innerHTML = '<img src="' + dataUrl + '" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;border:1px solid var(--border);">';
          lastRow.insertBefore(thumb, lastRow.firstChild);
        }

        // Try AI identification
        QuotesPage._identifyTree(dataUrl, rows.length - 1);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  },

  _identifyTree: function(images, rowIndex) {
    // the AI is primary (rich DBH+price+condition). PlantNet lives on as an
    // optional 2nd Opinion button on the row.
    var imgArr = Array.isArray(images) ? images : [images];

    if (QuotesPage._identifying) {
      UI.toast('Already identifying a tree, please wait...', 'error');
      return;
    }

    var claudeKey = localStorage.getItem('bm-claude-key') || '';
    if (!claudeKey) {
      UI.toast('Photo saved. Add AI API key in Settings for auto tree ID.');
      return;
    }

    QuotesPage._identifyTreeAI(imgArr, rowIndex);
    return;

    // --- PlantNet path kept below for reference; never reached ---
    var plantNetKey = localStorage.getItem('bm-plantnet-key') || '';

    QuotesPage._identifying = true;
    UI.toast(imgArr.length > 1 ? '🌿 Identifying with PlantNet (' + imgArr.length + ' photos)…' : '🌿 Identifying with PlantNet…');

    var form = new FormData();
    imgArr.slice(0, 5).forEach(function(dataUrl, i) {
      var parts = dataUrl.split(',');
      var mime = (parts[0].match(/:(.*?);/) || [,'image/jpeg'])[1];
      var bin = atob(parts[1]);
      var buf = new Uint8Array(bin.length);
      for (var j = 0; j < bin.length; j++) buf[j] = bin.charCodeAt(j);
      form.append('images', new Blob([buf], { type: mime }), 'tree' + i + '.jpg');
      form.append('organs', 'auto');
    });

    fetch('https://my-api.plantnet.org/v2/identify/all?api-key=' + encodeURIComponent(plantNetKey) + '&nb-results=3', {
      method: 'POST',
      body: form
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      // PlantNet failed → try AI if we have a key
      if (data.statusCode === 404 || data.error) {
        QuotesPage._identifying = false;
        if (claudeKey) {
          UI.toast('PlantNet miss — trying AI…');
          QuotesPage._identifyTreeAI(imgArr, rowIndex);
        } else {
          UI.toast('PlantNet: ' + (data.message || data.error || 'no match'), 'error');
        }
        return;
      }
      var results = data.results || [];
      if (!results.length) {
        QuotesPage._identifying = false;
        if (claudeKey) {
          UI.toast('No species match — trying AI…');
          QuotesPage._identifyTreeAI(imgArr, rowIndex);
        } else {
          UI.toast('PlantNet: no species matched — fill in manually');
        }
        return;
      }

      var top = results[0];
      var species = (top.species && top.species.commonNames && top.species.commonNames[0])
        || (top.species && top.species.scientificNameWithoutAuthor) || 'Tree';
      var pct = Math.round((top.score || 0) * 100);

      // Sane defaults — user can override
      var defaultDbh = 18; // tree-service average
      var defaultService = QuotesPage._pendingService || 'Tree Removal';
      var suggestedPrice = Math.round(defaultDbh * 100 / 50) * 50;

      var rows = document.querySelectorAll('.quote-item-row');
      var row = rows[rowIndex];
      if (row) {
        var serviceEl = row.querySelector('.q-item-service');
        var descEl = row.querySelector('.q-item-desc');
        var rateEl = row.querySelector('.q-item-rate');
        var qtyEl = row.querySelector('.q-item-qty');

        if (serviceEl) serviceEl.value = defaultService;
        var wrapEl = row.closest('.q-item-wrap');
        var speciesEl = wrapEl ? wrapEl.querySelector('.q-item-species') : null;
        if (speciesEl) speciesEl.value = species;
        if (descEl) descEl.value = defaultDbh + '" DBH (estimate — adjust)';
        if (qtyEl) qtyEl.value = '1';
        if (rateEl) rateEl.value = suggestedPrice;

        QuotesPage.calcTotal();
        UI.toast('🌳 ' + species + ' (' + pct + '% match) — verify DBH + price');
        if (descEl) {
          QuotesPage._syncSummary(descEl);
          QuotesPage._updateFormula(descEl);
        }
        var wrap = row.closest('.q-item-wrap');
        if (wrap) {
          var wb = wrap.querySelector('.q-item-body');
          if (wb) wb.style.display = 'block';
          var wc = wrap.querySelector('.q-item-chevron');
          if (wc) wc.style.transform = 'rotate(0deg)';
          wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
      QuotesPage._identifying = false;
    })
    .catch(function(e) {
      console.warn('PlantNet error:', e);
      QuotesPage._identifying = false;
      if (claudeKey) {
        UI.toast('PlantNet unreachable — trying AI…');
        QuotesPage._identifyTreeAI(imgArr, rowIndex);
      } else {
        UI.toast('PlantNet unavailable — fill in manually', 'error');
      }
    });
  },

  // AI-based tree ID (richer than PlantNet — gets DBH + condition + price suggestion)
  _identifyTreeAI: function(imgArr, rowIndex) {
    if (QuotesPage._identifying) return;
    var aiKey = localStorage.getItem('bm-claude-key');
    if (!aiKey) { UI.toast('No AI key configured', 'error'); return; }

    QuotesPage._identifying = true;
    UI.toast(imgArr.length > 1 ? '🤖 AI analyzing ' + imgArr.length + ' photos…' : '🤖 AI identifying tree…');

    var content = imgArr.map(function(dataUrl) {
      return { type: 'image', source: { type: 'base64', media_type: dataUrl.split(';')[0].split(':')[1], data: dataUrl.split(',')[1] } };
    });
    content.push({
      type: 'text',
      text: 'You are a certified arborist in ZIP ' + (localStorage.getItem('bm-zip') || '10566') + '. '
        + (imgArr.length > 1 ? 'Multiple photos of the SAME tree. ' : '')
        + (QuotesPage._pendingService ? 'Service: ' + QuotesPage._pendingService + '. ' : 'Pick most likely service (Tree Removal/Pruning/Stump Grinding/Cabling/Clean Up). ')
        + 'Respond ONLY JSON: {"species":"Common","dbh":"inches as number","heightFt":"feet as number","condition":"good/fair/poor/dead","notes":"1 sentence","suggestedService":"name","diseases":"top risk"}'
    });

    fetch('https://ltpivkqahvplapyagljt.supabase.co/functions/v1/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: (window.bmAIKey ? window.bmAIKey() : aiKey) || aiKey, model: 'claude-haiku-4-5', max_tokens: 400, messages: [{ role: 'user', content: content }] })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) { UI.toast('AI error: ' + (data.error.message || data.error.type || 'unknown'), 'error'); QuotesPage._identifying = false; return; }
      var text = data.content && data.content[0] ? data.content[0].text : '';
      if (!text) { UI.toast('AI empty — check key', 'error'); QuotesPage._identifying = false; return; }
      try {
        var match = text.match(/\{[\s\S]*\}/);
        var tree = JSON.parse(match[0]);
        var rows = document.querySelectorAll('.quote-item-row');
        var row = rows[rowIndex];
        if (row) {
          var serviceEl = row.querySelector('.q-item-service');
          var descEl = row.querySelector('.q-item-desc');
          var rateEl = row.querySelector('.q-item-rate');
          var qtyEl = row.querySelector('.q-item-qty');
          if (serviceEl) serviceEl.value = tree.suggestedService || 'Tree Removal';
          var wrapEl = row.closest('.q-item-wrap');
          var speciesEl = wrapEl ? wrapEl.querySelector('.q-item-species') : null;
          if (speciesEl) speciesEl.value = tree.species || '';
          var heightStr = tree.heightFt ? ' — ' + tree.heightFt + "' tall" : '';
          if (descEl) descEl.value = (tree.dbh || '?') + '" DBH' + heightStr + ' — ' + (tree.condition || '') + (tree.notes ? ' — ' + tree.notes : '');
          if (qtyEl) qtyEl.value = '1';
          var dbh = parseInt(tree.dbh) || 18;
          var suggestedPrice = Math.round(dbh * 100 / 50) * 50;
          if (rateEl) rateEl.value = suggestedPrice;
          QuotesPage.calcTotal();
          UI.toast('🌳 ' + tree.species + ' · ' + tree.dbh + '" DBH · $' + suggestedPrice);
          if (descEl) { QuotesPage._syncSummary(descEl); QuotesPage._updateFormula(descEl); }
          var wrap = row.closest('.q-item-wrap');
          if (wrap) {
            var wb = wrap.querySelector('.q-item-body'); if (wb) wb.style.display = 'block';
            var wc = wrap.querySelector('.q-item-chevron'); if (wc) wc.style.transform = 'rotate(0deg)';
            wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      } catch(e) { UI.toast('Could not parse AI response — fill in manually'); }
      QuotesPage._identifying = false;
    })
    .catch(function() { UI.toast('AI unavailable — fill in manually'); QuotesPage._identifying = false; });
  },

  // ── Dual Pricing (removed tabs — now sequential) ──
  // ── T&M + pricing comparison + margin moved to quotes-tm.js ──

  // Prompt for a new client inline without losing the quote form state
  _promptNewClient: function() {
    var name = prompt('New client name:');
    if (!name || !name.trim()) return;
    var newClient = DB.clients.create({
      name: name.trim(),
      status: 'lead',
      createdAt: new Date().toISOString()
    });
    QuotesPage._selectClient(newClient.id, newClient.name);
  },

  // Show the 8 most recent clients when the search field is focused but empty.
  // (Different from the "Recent" pill row, which is the 5 most recently-quoted.)
  _showRecentClients: function() {
    var input = document.getElementById('q-client-search');
    if (!input || input.value.length >= 2) return;
    var results = document.getElementById('q-client-results');
    if (!results) return;
    var allClients = [];
    try { allClients = JSON.parse(localStorage.getItem('bm-clients') || '[]'); } catch(e) {}
    var recent = allClients.slice().sort(function(a,b){
      return (b.createdAt||'').localeCompare(a.createdAt||'');
    }).slice(0, 8);
    if (!recent.length) return;
    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;max-height:260px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.1);">';
    recent.forEach(function(c) {
      html += '<div onclick="QuotesPage._selectClient(\'' + c.id + '\',\'' + UI.esc(c.name).replace(/'/g,"\\'") + '\')" style="padding:12px 14px;cursor:pointer;border-bottom:1px solid #f5f5f5;font-size:14px;" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">'
        + '<strong>' + UI.esc(c.name) + '</strong>'
        + (c.address ? '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">' + UI.esc(c.address) + '</div>' : '')
        + '</div>';
    });
    html += '</div>';
    results.innerHTML = html;
    results.style.display = 'block';
  },

  _clientSearchTimeout: null,
  _searchClient: function(query) {
    clearTimeout(QuotesPage._clientSearchTimeout);
    var results = document.getElementById('q-client-results');
    if (!results) return;
    QuotesPage._clientSearchTimeout = setTimeout(function() {
      var allClients = [];
      try { allClients = JSON.parse(localStorage.getItem('bm-clients') || '[]'); } catch(e) {}

      var q = (query || '').trim().toLowerCase();
      var matches;
      if (!q) {
        // Empty query: show 8 most-recent clients so you can quick-pick
        matches = allClients.slice().sort(function(a,b){ return (b.createdAt||'').localeCompare(a.createdAt||''); }).slice(0, 8);
      } else {
        matches = allClients.filter(function(c) {
          return (c.name || '').toLowerCase().indexOf(q) >= 0
            || (c.address || '').toLowerCase().indexOf(q) >= 0
            || (c.phone || '').indexOf(q) >= 0;
        }).slice(0, 8);
      }

      var rows = '';
      matches.forEach(function(c) {
        rows += '<div onclick="QuotesPage._selectClient(\'' + c.id + '\',\'' + UI.esc(c.name).replace(/'/g,"\\'") + '\')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f5f5f5;font-size:14px;" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">'
          + '<strong>' + UI.esc(c.name) + '</strong>'
          + (c.address ? '<div style="font-size:12px;color:var(--text-light);margin-top:1px;">' + UI.esc(c.address) + '</div>' : '')
          + '</div>';
      });

      // Always offer "Create new" when user has typed something
      if (q) {
        rows += '<div onclick="QuotesPage._newClientInline()" style="padding:10px 14px;cursor:pointer;font-size:14px;color:var(--green-dark);font-weight:600;background:var(--green-bg);" onmouseover="this.style.filter=\'brightness(0.95)\'" onmouseout="this.style.filter=\'\'">+ Create new client: <em style="font-style:normal;">' + UI.esc(query) + '</em></div>';
      }

      if (!rows) { results.style.display = 'none'; return; }
      results.innerHTML = '<div style="background:var(--white);border:1px solid var(--border);border-radius:8px;max-height:280px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.1);">' + rows + '</div>';
      results.style.display = 'block';
    }, 150);
  },

  _selectClient: function(id, name) {
    document.getElementById('q-clientId').value = id;
    document.getElementById('q-client-search').value = name;
    document.getElementById('q-client-results').style.display = 'none';
    var client = DB.clients.getById(id);
    if (client && client.address) {
      var prop = document.getElementById('q-property');
      if (prop && !prop.value) prop.value = client.address;
    }
    // Update the collapsible client box summary
    var box = document.querySelector('.q-client-box');
    if (box) {
      var nameEl = box.querySelector('.q-client-summary-name');
      var addrEl = box.querySelector('.q-client-summary-addr');
      if (nameEl) { nameEl.textContent = name; nameEl.style.color = 'var(--text)'; }
      if (addrEl && client && client.address) addrEl.textContent = '📍 ' + client.address;
    }
    // Progressive disclosure: reveal line items
    var gate = document.getElementById('q-pick-client-first');
    var section = document.getElementById('q-items-section');
    if (gate) gate.style.display = 'none';
    if (section) {
      section.style.display = 'block';
      setTimeout(function() { section.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
    }
    // Auto-collapse the client box now that it's picked
    QuotesPage._collapseClientBox();
  },

  // Toggle collapse/expand on the Client section
  _toggleClientBox: function(headerEl) {
    var box = headerEl.closest('.q-client-box');
    if (!box) return;
    var body = box.querySelector('.q-client-body');
    var chev = box.querySelector('.q-client-chevron');
    if (!body) return;
    var collapsed = body.style.display === 'none';
    body.style.display = collapsed ? 'block' : 'none';
    if (chev) chev.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
  },
  _collapseClientBox: function() {
    var box = document.querySelector('.q-client-box');
    if (!box) return;
    var body = box.querySelector('.q-client-body');
    var chev = box.querySelector('.q-client-chevron');
    if (body) body.style.display = 'none';
    if (chev) chev.style.transform = 'rotate(-90deg)';
  },

  _newClientInline: function() {
    var name = document.getElementById('q-client-search').value.trim();
    if (!name) return;
    var newClient = DB.clients.create({ name: name, status: 'lead' });
    QuotesPage._selectClient(newClient.id, newClient.name);
    UI.toast('Client "' + name + '" created');
  },

  _applyEstimator: function() {
    var calc = (typeof Estimator !== 'undefined') ? Estimator._lastCalc : null;
    if (!calc) { UI.toast('Calculate a price first', 'error'); return; }

    var items = calc.lineItems.map(function(li) {
      return { service: li.service, description: li.description, qty: li.qty, rate: li.rate, amount: li.amount };
    });
    if (calc.insurance > 0) {
      items.push({ service: 'Insurance & Compliance', description: 'WC, GL, Disability, Payroll, Auto', qty: 1, rate: calc.insurance, amount: calc.insurance });
    }
    if (calc.markup > 0) {
      items.push({ service: 'Service Fee', description: 'Coordination & management', qty: 1, rate: calc.markup, amount: calc.markup });
    }
    QuotesPage._fillFromEstimator(items, calc.total);

    // Collapse the estimator
    var estEl = document.getElementById('inline-estimator');
    if (estEl) estEl.style.display = 'none';

    UI.toast('Calculator applied — ' + items.length + ' line items, ' + UI.money(calc.total));
  },

  _fillFromEstimator: function(items, total) {
    // Clear existing line items
    var container = document.getElementById('q-items');
    if (!container) return;
    container.innerHTML = '';
    var services = DB.services.getAll();

    // Add each item from estimator
    items.forEach(function(item) {
      var div = document.createElement('div');
      div.innerHTML = QuotesPage._itemRow(container.children.length, item, services);
      container.appendChild(div.firstChild);
    });

    // Update total display
    var totalEl = document.getElementById('q-total-display');
    if (totalEl) totalEl.textContent = UI.money(total);

    UI.toast('Estimate applied — ' + items.length + ' line items, ' + UI.money(total));
  },

  // --- Inline Line Item Editor for Detail View ---

  renderLineItems: function(q, id) {
    var services = DB.services.getAll();
    var items = q.lineItems || [];
    var subtotal = 0;
    items.forEach(function(item) { subtotal += (item.qty || 0) * (item.rate || 0); });
    var discount = q.discount || 0;
    var grandTotal = subtotal - discount;

    var html = '<div id="li-section" style="background:var(--white);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border);">'
      + '<h4 style="font-size:15px;font-weight:700;margin:0;">Product / Service</h4>'
      + '<div style="display:flex;gap:6px;">'
      + '<button class="btn btn-primary" style="font-size:12px;padding:5px 12px;" onclick="QuotesPage.addLineItem(\'' + id + '\')">+ Add Line Item</button>'
      + '<button class="btn btn-outline" style="font-size:12px;padding:5px 12px;" onclick="QuotesPage.addLineItem(\'' + id + '\', true)">+ Custom Item</button>'
      + '</div></div>';

    if (items.length > 0) {
      html += '<table class="data-table" style="border:none;border-radius:0;"><thead><tr>'
        + '<th>Service / Description</th><th style="width:70px;">Qty</th>'
        + '<th style="text-align:right;width:100px;">Unit Price</th>'
        + '<th style="text-align:right;width:90px;">Total</th>'
        + '<th style="width:40px;"></th>'
        + '</tr></thead><tbody id="li-tbody">';
      items.forEach(function(item, idx) {
        var lineTotal = (item.qty || 0) * (item.rate || 0);
        html += '<tr id="li-row-' + idx + '">'
          + '<td>'
          + '<strong class="li-name" onclick="QuotesPage.editLineItem(\'' + id + '\',' + idx + ')" style="cursor:pointer;" title="Click to edit">' + UI.esc(item.service || item.name || 'Custom') + '</strong>'
          + (item.description ? '<br><span style="color:var(--text-light);font-size:12px;">' + UI.esc(item.description) + '</span>' : '')
          + '</td>'
          + '<td><input type="number" class="li-qty-input" value="' + (item.qty || 1) + '" min="0" step="1" style="width:60px;text-align:center;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:13px;" onblur="QuotesPage.updateLineItemField(\'' + id + '\',' + idx + ',\'qty\',this.value)" onkeydown="if(event.key===\'Enter\'){this.blur();}"></td>'
          + '<td style="text-align:right;"><input type="number" class="li-rate-input" value="' + (item.rate || 0) + '" min="0" step="0.01" style="width:90px;text-align:right;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:13px;" onblur="QuotesPage.updateLineItemField(\'' + id + '\',' + idx + ',\'rate\',this.value)" onkeydown="if(event.key===\'Enter\'){this.blur();}"></td>'
          + '<td style="text-align:right;font-weight:600;" id="li-total-' + idx + '">' + UI.money(lineTotal) + '</td>'
          + '<td style="text-align:center;"><button onclick="QuotesPage.removeLineItem(\'' + id + '\',' + idx + ')" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--red);opacity:.6;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.6" title="Delete line item">🗑️</button></td>'
          + '</tr>';
      });
      html += '</tbody></table>';

      // Subtotal / Discount / Grand Total
      var taxRateDisplay = q.taxRate !== undefined ? q.taxRate : (parseFloat(localStorage.getItem('bm-tax-rate')) || 8.375);
      var taxAmtDisplay = Math.round(grandTotal * taxRateDisplay / 100 * 100) / 100;
      var totalWithTax = grandTotal + taxAmtDisplay;
      html += '<div style="padding:12px 16px;border-top:1px solid var(--border);">'
        + '<div style="display:flex;justify-content:flex-end;">'
        + '<table style="font-size:14px;min-width:260px;">'
        + '<tr><td style="padding:4px 16px 4px 0;text-align:right;color:var(--text-light);">Subtotal</td><td style="padding:4px 0;text-align:right;font-weight:600;">' + UI.money(subtotal) + '</td></tr>';
      html += '<tr><td style="padding:4px 16px 4px 0;text-align:right;color:var(--text-light);">Discount</td>'
        + '<td style="padding:4px 0;text-align:right;">'
        + '<input type="number" id="li-discount" value="' + discount + '" min="0" step="0.01" style="width:90px;text-align:right;font-size:13px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;" onchange="QuotesPage.updateDiscount(\'' + id + '\',this.value)">'
        + '</td></tr>';
      html += '<tr><td style="padding:4px 16px 4px 0;text-align:right;color:var(--text-light);">Tax (' + taxRateDisplay + '%)</td><td style="padding:4px 0;text-align:right;font-weight:600;">' + UI.money(taxAmtDisplay) + '</td></tr>';
      html += '<tr style="border-top:2px solid var(--border);"><td style="padding:8px 16px 4px 0;text-align:right;font-weight:700;font-size:15px;">Total</td>'
        + '<td style="padding:8px 0 4px;text-align:right;font-weight:800;font-size:16px;color:var(--accent);">' + UI.money(totalWithTax) + '</td></tr>';
      html += '</table></div></div>';
    } else {
      // No line items — check if services exist
      if (services.length === 0) {
        html += '<div style="padding:24px;text-align:center;color:var(--text-light);font-size:13px;">'
          + '<div style="font-size:24px;margin-bottom:8px;">📦</div>'
          + 'No services in catalog. Add services in <strong>Settings → Products & Services</strong>'
          + '</div>';
      } else {
        html += '<div style="padding:24px;text-align:center;color:var(--text-light);font-size:13px;">'
          + '<div style="font-size:24px;margin-bottom:8px;">📋</div>'
          + 'No line items yet. Click <strong>+ Add Line Item</strong> to get started.'
          + '</div>';
      }
    }

    // Add-row area (hidden by default, shown when adding)
    html += '<div id="li-add-row" style="display:none;"></div>';
    html += '</div>';
    return html;
  },

  addLineItem: function(quoteId, isCustom) {
    var services = DB.services.getAll();
    var container = document.getElementById('li-add-row');
    if (!container) return;

    // Build category-grouped options
    var optionsHtml = '<option value="">-- Select a service --</option>';
    if (!isCustom && services.length > 0) {
      var categories = {};
      services.forEach(function(s) {
        var cat = s.category || 'Other';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(s);
      });
      var catKeys = Object.keys(categories).sort();
      catKeys.forEach(function(cat) {
        optionsHtml += '<optgroup label="' + UI.esc(cat) + '">';
        categories[cat].forEach(function(s) {
          optionsHtml += '<option value="' + s.id + '" data-name="' + UI.esc(s.name) + '" data-desc="' + UI.esc(s.description || '') + '" data-price="' + (s.unitPrice || 0) + '">' + UI.esc(s.name) + (s.unitPrice ? ' — ' + UI.money(s.unitPrice) : '') + '</option>';
        });
        optionsHtml += '</optgroup>';
      });
    }

    var rowHtml = '<div style="padding:12px 16px;border-top:1px solid var(--border);background:#f9fafb;">'
      + '<div style="font-size:13px;font-weight:700;margin-bottom:8px;">' + (isCustom ? 'Add Custom Item' : 'Add Service from Catalog') + '</div>'
      + '<div style="display:grid;grid-template-columns:2fr 2fr 70px 100px 90px;gap:8px;align-items:end;">';

    if (isCustom) {
      rowHtml += '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Name</label>'
        + '<input type="text" id="li-new-name" placeholder="Item name..." style="font-size:13px;"></div>';
    } else {
      rowHtml += '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Service</label>'
        + '<select id="li-new-service" onchange="QuotesPage._onNewServiceSelect()" style="font-size:13px;">' + optionsHtml + '</select></div>';
    }

    rowHtml += '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Description</label>'
      + '<input type="text" id="li-new-desc" placeholder="Work details..." style="font-size:13px;"></div>'
      + '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Qty</label>'
      + '<input type="number" id="li-new-qty" value="1" min="1" style="font-size:13px;text-align:center;" oninput="QuotesPage._calcNewLineTotal()"></div>'
      + '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Unit Price ($)</label>'
      + '<input type="number" id="li-new-rate" value="" step="0.01" placeholder="0.00" style="font-size:13px;" oninput="QuotesPage._calcNewLineTotal()"></div>'
      + '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Total</label>'
      + '<div id="li-new-total" style="font-size:14px;font-weight:700;color:var(--green-dark);padding:8px 0;">$0.00</div></div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;margin-top:10px;">'
      + '<button class="btn btn-primary" style="font-size:12px;padding:5px 14px;" onclick="QuotesPage.saveLineItem(\'' + quoteId + '\',' + (isCustom ? 'true' : 'false') + ')">Save</button>'
      + '<button class="btn btn-outline" style="font-size:12px;padding:5px 14px;" onclick="document.getElementById(\'li-add-row\').style.display=\'none\';">Cancel</button>'
      + '</div></div>';

    container.innerHTML = rowHtml;
    container.style.display = 'block';

    // Focus the first input
    setTimeout(function() {
      var el = document.getElementById(isCustom ? 'li-new-name' : 'li-new-service');
      if (el) el.focus();
    }, 50);
  },

  _onNewServiceSelect: function() {
    var sel = document.getElementById('li-new-service');
    if (!sel) return;
    var opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) return;
    var descEl = document.getElementById('li-new-desc');
    var rateEl = document.getElementById('li-new-rate');
    if (descEl && opt.dataset.desc) descEl.value = opt.dataset.desc;
    if (rateEl && opt.dataset.price) rateEl.value = opt.dataset.price;
    QuotesPage._calcNewLineTotal();
  },

  _calcNewLineTotal: function() {
    var qty = parseFloat((document.getElementById('li-new-qty') || {}).value) || 0;
    var rate = parseFloat((document.getElementById('li-new-rate') || {}).value) || 0;
    var el = document.getElementById('li-new-total');
    if (el) el.textContent = UI.money(qty * rate);
  },

  saveLineItem: function(quoteId, isCustom) {
    var q = DB.quotes.getById(quoteId);
    if (!q) return;
    var items = q.lineItems ? q.lineItems.slice() : [];

    var name, description, qty, rate, serviceId;
    if (isCustom) {
      name = (document.getElementById('li-new-name') || {}).value || '';
      if (!name.trim()) { UI.toast('Enter an item name', 'error'); return; }
    } else {
      var sel = document.getElementById('li-new-service');
      if (!sel || !sel.value) { UI.toast('Select a service', 'error'); return; }
      var opt = sel.options[sel.selectedIndex];
      serviceId = sel.value;
      name = opt.dataset.name || opt.textContent;
    }
    description = (document.getElementById('li-new-desc') || {}).value || '';
    qty = parseFloat((document.getElementById('li-new-qty') || {}).value) || 1;
    rate = parseFloat((document.getElementById('li-new-rate') || {}).value) || 0;

    var newItem = {
      id: 'li-' + Date.now(),
      serviceId: serviceId || null,
      service: name,
      name: name,
      description: description,
      qty: qty,
      rate: rate,
      amount: qty * rate
    };
    items.push(newItem);

    var total = 0;
    items.forEach(function(it) { total += (it.qty || 0) * (it.rate || 0); });
    total = total - (q.discount || 0);

    DB.quotes.update(quoteId, { lineItems: items, total: total });
    UI.toast('Line item added');
    QuotesPage.showDetail(quoteId);
  },

  editLineItem: function(quoteId, itemIdx) {
    var q = DB.quotes.getById(quoteId);
    if (!q || !q.lineItems || !q.lineItems[itemIdx]) return;
    var item = q.lineItems[itemIdx];
    var services = DB.services.getAll();

    // Build category-grouped options
    var optionsHtml = '<option value="">-- Select or keep current --</option>';
    var categories = {};
    services.forEach(function(s) {
      var cat = s.category || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(s);
    });
    var catKeys = Object.keys(categories).sort();
    catKeys.forEach(function(cat) {
      optionsHtml += '<optgroup label="' + UI.esc(cat) + '">';
      categories[cat].forEach(function(s) {
        var selected = (item.serviceId === s.id || item.service === s.name) ? ' selected' : '';
        optionsHtml += '<option value="' + s.id + '" data-name="' + UI.esc(s.name) + '" data-desc="' + UI.esc(s.description || '') + '" data-price="' + (s.unitPrice || 0) + '"' + selected + '>' + UI.esc(s.name) + '</option>';
      });
      optionsHtml += '</optgroup>';
    });

    var lineTotal = (item.qty || 0) * (item.rate || 0);

    var rowHtml = '<tr id="li-edit-row" style="background:#fffde7;">'
      + '<td><select id="li-edit-service" style="font-size:13px;margin-bottom:4px;width:100%;" onchange="QuotesPage._onEditServiceSelect()">' + optionsHtml + '</select>'
      + '<input type="text" id="li-edit-name" value="' + UI.esc(item.service || item.name || '') + '" placeholder="Item name" style="font-size:12px;margin-bottom:4px;width:100%;">'
      + '<input type="text" id="li-edit-desc" value="' + UI.esc(item.description || '') + '" placeholder="Description" style="font-size:12px;width:100%;"></td>'
      + '<td><input type="number" id="li-edit-qty" value="' + (item.qty || 1) + '" min="1" style="font-size:13px;text-align:center;width:55px;" oninput="QuotesPage._calcEditLineTotal()"></td>'
      + '<td style="text-align:right;"><input type="number" id="li-edit-rate" value="' + (item.rate || 0) + '" step="0.01" style="font-size:13px;text-align:right;width:85px;" oninput="QuotesPage._calcEditLineTotal()"></td>'
      + '<td style="text-align:right;font-weight:600;" id="li-edit-total">' + UI.money(lineTotal) + '</td>'
      + '<td style="text-align:center;">'
      + '<button class="btn btn-primary" style="font-size:11px;padding:3px 8px;margin-bottom:2px;display:block;width:100%;" onclick="QuotesPage._saveEditedItem(\'' + quoteId + '\',' + itemIdx + ')">Save</button>'
      + '<button class="btn btn-outline" style="font-size:11px;padding:3px 8px;display:block;width:100%;" onclick="QuotesPage.showDetail(\'' + quoteId + '\')">Cancel</button>'
      + '</td></tr>';

    // Replace the row
    var existingRow = document.getElementById('li-row-' + itemIdx);
    if (existingRow) {
      existingRow.outerHTML = rowHtml;
    }
  },

  _onEditServiceSelect: function() {
    var sel = document.getElementById('li-edit-service');
    if (!sel) return;
    var opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) return;
    var nameEl = document.getElementById('li-edit-name');
    var descEl = document.getElementById('li-edit-desc');
    var rateEl = document.getElementById('li-edit-rate');
    if (nameEl && opt.dataset.name) nameEl.value = opt.dataset.name;
    if (descEl && opt.dataset.desc) descEl.value = opt.dataset.desc;
    if (rateEl && opt.dataset.price && parseFloat(opt.dataset.price) > 0) rateEl.value = opt.dataset.price;
    QuotesPage._calcEditLineTotal();
  },

  _calcEditLineTotal: function() {
    var qty = parseFloat((document.getElementById('li-edit-qty') || {}).value) || 0;
    var rate = parseFloat((document.getElementById('li-edit-rate') || {}).value) || 0;
    var el = document.getElementById('li-edit-total');
    if (el) el.textContent = UI.money(qty * rate);
  },

  _saveEditedItem: function(quoteId, itemIdx) {
    var q = DB.quotes.getById(quoteId);
    if (!q || !q.lineItems || !q.lineItems[itemIdx]) return;
    var items = q.lineItems.slice();

    var sel = document.getElementById('li-edit-service');
    var serviceId = sel ? sel.value : null;
    var name = (document.getElementById('li-edit-name') || {}).value || '';
    var description = (document.getElementById('li-edit-desc') || {}).value || '';
    var qty = parseFloat((document.getElementById('li-edit-qty') || {}).value) || 1;
    var rate = parseFloat((document.getElementById('li-edit-rate') || {}).value) || 0;

    items[itemIdx] = {
      id: items[itemIdx].id || ('li-' + Date.now()),
      serviceId: serviceId || items[itemIdx].serviceId || null,
      service: name,
      name: name,
      description: description,
      qty: qty,
      rate: rate,
      amount: qty * rate
    };

    var total = 0;
    items.forEach(function(it) { total += (it.qty || 0) * (it.rate || 0); });
    total = total - (q.discount || 0);

    DB.quotes.update(quoteId, { lineItems: items, total: total });
    UI.toast('Line item updated');
    QuotesPage.showDetail(quoteId);
  },

  // On-the-fly single-field update (qty or rate) — no modal
  updateLineItemField: function(quoteId, itemIdx, field, value) {
    var q = DB.quotes.getById(quoteId);
    if (!q || !q.lineItems || !q.lineItems[itemIdx]) return;
    var items = q.lineItems.slice();
    var newVal = parseFloat(value) || 0;
    if (items[itemIdx][field] === newVal) return; // no change
    items[itemIdx][field] = newVal;
    items[itemIdx].amount = (items[itemIdx].qty || 0) * (items[itemIdx].rate || 0);

    var subtotal = 0;
    items.forEach(function(it) { subtotal += (it.qty || 0) * (it.rate || 0); });
    var discount = q.discount || 0;
    var afterDiscount = subtotal - discount;
    var taxRate = q.taxRate !== undefined ? q.taxRate : (parseFloat(localStorage.getItem('bm-tax-rate')) || 8.375);
    var tax = Math.round(afterDiscount * taxRate / 100 * 100) / 100;
    var total = afterDiscount + tax;

    DB.quotes.update(quoteId, { lineItems: items, total: total });
    QuotesPage.showDetail(quoteId);
  },

  removeLineItem: function(quoteId, itemIdx) {
    UI.confirm('Delete this line item?', function() {
      var q = DB.quotes.getById(quoteId);
      if (!q || !q.lineItems) return;
      var items = q.lineItems.slice();
      items.splice(itemIdx, 1);

      var total = 0;
      items.forEach(function(it) { total += (it.qty || 0) * (it.rate || 0); });
      total = total - (q.discount || 0);

      DB.quotes.update(quoteId, { lineItems: items, total: total });
      UI.toast('Line item removed');
      QuotesPage.showDetail(quoteId);
    });
  },

  updateDiscount: function(quoteId, val) {
    var q = DB.quotes.getById(quoteId);
    if (!q) return;
    var discount = parseFloat(val) || 0;
    var subtotal = 0;
    (q.lineItems || []).forEach(function(it) { subtotal += (it.qty || 0) * (it.rate || 0); });
    var afterDiscount = subtotal - discount;
    if (afterDiscount < 0) afterDiscount = 0;
    var taxRate = q.taxRate !== undefined ? q.taxRate : 8.375;
    var taxAmount = Math.round(afterDiscount * taxRate / 100 * 100) / 100;
    var total = afterDiscount + taxAmount;
    DB.quotes.update(quoteId, { discount: discount, subtotal: subtotal, taxAmount: taxAmount, total: total });
    QuotesPage.showDetail(quoteId);
  },

  convertToJob: function(quoteId) {
    var q = DB.quotes.getById(quoteId);
    if (!q) return;
    var job = DB.jobs.create({
      clientId: q.clientId,
      clientName: q.clientName,
      property: q.property,
      description: q.description,
      lineItems: q.lineItems,
      total: q.total,
      quoteId: quoteId,
      status: 'scheduled',
      scheduledDate: null
    });
    DB.quotes.update(quoteId, { status: 'converted', jobId: job.id });
    if (q.clientId) DB.clients.update(q.clientId, { status: 'active' });
    UI.toast('Job #' + job.jobNumber + ' created from quote');
    UI.closeModal();
    loadPage('jobs');
  },

  // ── Video Walkthrough ──
  _addVideo: function(quoteId) {
    var html = '<div style="text-align:center;margin-bottom:16px;">'
      + '<div style="font-size:48px;margin-bottom:8px;">🎥</div>'
      + '<p style="font-size:13px;color:var(--text-light);">Record a walkthrough of the property on your phone, upload it to YouTube as Unlisted, then paste the link below.</p>'
      + '</div>'
      + '<div style="background:var(--bg);border-radius:8px;padding:12px;margin-bottom:12px;">'
      + '<div style="font-size:12px;font-weight:700;margin-bottom:8px;">Quick steps:</div>'
      + '<div style="font-size:12px;color:var(--text-light);line-height:1.6;">'
      + '1. Open Camera app \u2192 Record video walking the property<br>'
      + '2. Open YouTube app \u2192 Tap + \u2192 Upload \u2192 Select video<br>'
      + '3. Set visibility to <strong>Unlisted</strong><br>'
      + '4. Copy the link \u2192 Paste below'
      + '</div></div>'
      + UI.field('YouTube Link', '<input type="url" id="vw-url" placeholder="https://youtu.be/... or https://youtube.com/watch?v=...">')
      + '<div style="font-size:11px;color:var(--text-light);margin-top:4px;">Unlisted = only people with the link can see it. Not public, not searchable.</div>';

    UI.showModal('Add Video Walkthrough', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="QuotesPage._saveVideo(\'' + quoteId + '\')">Save Video</button>'
    });
  },

  _saveVideo: function(quoteId) {
    var url = document.getElementById('vw-url').value.trim();
    if (!url) { UI.toast('Paste a YouTube link', 'error'); return; }
    if (url.indexOf('youtu') === -1 && url.indexOf('youtube') === -1) {
      UI.toast('Please use a YouTube link', 'error'); return;
    }
    DB.quotes.update(quoteId, { videoUrl: url });
    UI.closeModal();
    UI.toast('Video walkthrough added! \uD83C\uDFAC');
    QuotesPage.showDetail(quoteId);
  },

  _removeVideo: function(quoteId) {
    if (!confirm('Remove video from this quote?')) return;
    DB.quotes.update(quoteId, { videoUrl: null });
    UI.toast('Video removed');
    QuotesPage.showDetail(quoteId);
  },

  _saveNotes: function(id, val) {
    var trimmed = (val || '').trim();
    DB.quotes.update(id, { notes: trimmed });
    UI.toast('Notes saved');
  },

  _archiveQuote: function(quoteId) {
    if (!confirm('Archive this quote? It will be hidden from the main list.')) return;
    DB.quotes.update(quoteId, { status: 'archived' });
    UI.toast(QuotesPage._term(true) + ' archived');
    loadPage('quotes');
  },

  _deleteQuote: function(quoteId) {
    if (!confirm('Delete this quote permanently? This cannot be undone.')) return;
    DB.quotes.delete(quoteId);
    UI.toast(QuotesPage._term(true) + ' deleted');
    loadPage('quotes');
  }
};
