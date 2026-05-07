/**
 * Branch Manager — Invoices Page
 */
var InvoicesPage = {
  _co: function() {
    return {
      name:          CompanyInfo.get('name'),
      phone:         CompanyInfo.get('phone'),
      email:         CompanyInfo.get('email'),
      website:       CompanyInfo.get('website'),
      logo:          CompanyInfo.get('logo'),
      googleReview:  CompanyInfo.get('googleReviewUrl'),
      facebook:      CompanyInfo.get('facebookUrl'),
      instagram:     CompanyInfo.get('instagramUrl'),
      yelp:          CompanyInfo.get('yelpUrl'),
      nextdoor:      CompanyInfo.get('nextdoorUrl')
    };
  },

  _page: 0, _perPage: 50, _search: '', _filter: 'all', _sortCol: 'invoiceNumber', _sortDir: 'desc',
  _activeTab: 'invoices',

  switchTab: function(tab) {
    InvoicesPage._activeTab = tab;
    loadPage('invoices');
  },

  _pendingDetail: null,

  render: function() {
    var self = InvoicesPage;
    if (self._pendingDetail) {
      var _pid = self._pendingDetail;
      self._pendingDetail = null;
      setTimeout(function() { InvoicesPage.showDetail(_pid); }, 50);
    }
    var activeTab = self._activeTab || 'invoices';

    // Tab bar + green Collect Payment shortcut on the right
    var html = '<div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:16px;align-items:center;">'
      + '<button onclick="InvoicesPage.switchTab(\'invoices\')" style="padding:10px 20px;font-size:14px;font-weight:' + (activeTab==='invoices'?'700':'500') + ';border:none;background:none;cursor:pointer;color:' + (activeTab==='invoices'?'var(--accent)':'var(--text-light)') + ';border-bottom:2px solid ' + (activeTab==='invoices'?'var(--accent)':'transparent') + ';margin-bottom:-2px;">Invoices</button>'
      + '<button onclick="InvoicesPage.switchTab(\'payments\')" style="padding:10px 20px;font-size:14px;font-weight:' + (activeTab==='payments'?'700':'500') + ';border:none;background:none;cursor:pointer;color:' + (activeTab==='payments'?'var(--accent)':'var(--text-light)') + ';border-bottom:2px solid ' + (activeTab==='payments'?'var(--accent)':'transparent') + ';margin-bottom:-2px;">Payments</button>'
      + '<div style="margin-left:auto;padding-bottom:6px;"><button onclick="loadPage(\'collectpayment\')" style="background:#2e7d32;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">$ Collect Payment</button></div>'
      + '</div>';

    if (activeTab === 'payments') {
      return html + Payments._renderContent();
    }

    var all = DB.invoices.getAll();
    var receivable = DB.invoices.totalReceivable();
    var unpaid = all.filter(function(i) { return i.status !== 'paid'; });
    var draft = all.filter(function(i) { return i.status === 'draft'; }).length;
    var paid = all.filter(function(i) { return i.status === 'paid'; }).length;

    // legacy system-style stat cards row
    var now = new Date();
    var pastDue = all.filter(function(i) { return i.status !== 'paid' && i.dueDate && new Date(i.dueDate) < now; });
    var sentNotDue = all.filter(function(i) { return i.status === 'sent' && (!i.dueDate || new Date(i.dueDate) >= now); });
    // v638: coerce to Number on every reduce — some i.total / i.balance
    // values are stored as strings (cloud round-trip), causing JS string
    // concat in the sum. Doug saw "$740,034348" because three string totals
    // got concatenated into one giant number. Force numeric.
    var pastDueTotal = pastDue.reduce(function(s,i){return s+Number(i.balance||0);},0);
    var sentNotDueTotal = sentNotDue.reduce(function(s,i){return s+Number(i.balance||0);},0);
    var draftTotal = all.filter(function(i){return i.status==='draft';}).reduce(function(s,i){return s+Number(i.total||0);},0);
    var recentIssued = all.filter(function(i) { var d=new Date(i.createdAt); var ago=new Date(); ago.setDate(ago.getDate()-30); return d>=ago; });
    var recentIssuedTotal = recentIssued.reduce(function(s,i){return s+Number(i.total||0);},0);
    var avgInvoice = recentIssued.length > 0 ? Math.round(recentIssuedTotal / recentIssued.length) : 0;

    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px;background:var(--white);" class="stat-row">'
      // Overview
      + '<div onclick="InvoicesPage._setFilter(\'all\')" style="padding:14px 16px;border-right:1px solid var(--border);cursor:pointer;">'
      + '<div style="font-size:14px;font-weight:700;margin-bottom:8px;">Overview</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;"><span><span style="color:#dc3545;">●</span> Past due (' + pastDue.length + ')</span><span>' + UI.moneyInt(pastDueTotal) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;"><span><span style="color:#e6a817;">●</span> Sent but not due (' + sentNotDue.length + ')</span><span>' + UI.moneyInt(sentNotDueTotal) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;"><span><span style="color:#6c757d;">●</span> Draft (' + draft + ')</span><span>' + UI.moneyInt(draftTotal) + '</span></div>'
      + '</div>'
      // Issued
      + '<div style="padding:14px 16px;border-right:1px solid var(--border);">'
      + '<div style="font-size:14px;font-weight:700;">Issued</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Past 30 days</div>'
      + '<div style="font-size:28px;font-weight:700;margin-top:4px;">' + recentIssued.length + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">' + UI.moneyInt(recentIssuedTotal) + '</div>'
      + '</div>'
      // Average invoice
      + '<div style="padding:14px 16px;border-right:1px solid var(--border);">'
      + '<div style="font-size:14px;font-weight:700;">Average invoice</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Past 30 days</div>'
      + '<div style="font-size:28px;font-weight:700;margin-top:4px;">' + UI.moneyInt(avgInvoice) + '</div>'
      + '</div>'
      // Total collected
      + (function() {
        var totalCollected = all.filter(function(i){return i.status==='paid';}).reduce(function(s,i){return s+Number(i.total||0);},0);
        return '<div style="padding:14px 16px;">'
          + '<div style="font-size:14px;font-weight:700;">Total Collected</div>'
          + '<div style="font-size:22px;font-weight:800;margin-top:12px;color:var(--green-dark);">' + UI.moneyInt(totalCollected) + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);">' + paid + ' paid invoices</div>'
          + '</div>';
      })()
      + '</div>';

    var filtered = self._getFiltered();
    var page = self._showAll ? filtered : filtered.slice(self._page * self._perPage, (self._page + 1) * self._perPage);

    // legacy system-style header + filter chips + search
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">'
      + '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">'
      + '<h3 style="font-size:16px;font-weight:700;margin:0;">All invoices</h3>'
      + '<span style="font-size:13px;color:var(--text-light);">(' + filtered.length + ' results)</span>'
      + (function() {
        var chips = [['all','All'],['past_due','Past Due'],['sent_not_due','Sent but not due'],['draft','Draft'],['paid','Paid']];
        var out = '';
        for (var ci = 0; ci < chips.length; ci++) {
          var val = chips[ci][0], label = chips[ci][1];
          var isActive = self._filter === val;
          out += '<button onclick="InvoicesPage._setFilter(\'' + val + '\')" style="font-size:12px;padding:5px 14px;border-radius:20px;border:1px solid ' + (isActive ? '#2e7d32' : 'var(--border)') + ';background:' + (isActive ? '#2e7d32' : 'var(--white)') + ';color:' + (isActive ? '#fff' : 'var(--text)') + ';cursor:pointer;font-weight:' + (isActive ? '600' : '500') + ';">' + label + '</button>';
        }
        return out;
      })()
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      +   '<div class="search-box" style="min-width:200px;max-width:280px;">'
      +     '<span style="color:var(--text-light);">🔍</span>'
      +     '<input type="text" placeholder="Search invoices..." value="' + UI.esc(self._search) + '" oninput="InvoicesPage._search=this.value;InvoicesPage._page=0;loadPage(\'invoices\')">'
      +   '</div>'
      + '</div></div>';

    // Floating batch action bar (fixed to bottom)
    html += '<div id="inv-batch-bar" style="display:none;position:fixed;bottom:0;left:var(--sidebar-w,0);right:0;z-index:500;background:#1a1a2e;color:#fff;padding:12px 24px;padding-bottom:max(12px,env(safe-area-inset-bottom));align-items:center;justify-content:space-between;box-shadow:0 -4px 20px rgba(0,0,0,.3);animation:invBatchSlideUp .25s ease-out;">'
      + '<span id="inv-batch-count" style="font-weight:700;font-size:14px;">0 selected</span>'
      + '<div style="display:flex;gap:8px;align-items:center;">'
      + '<button onclick="InvoicesPage._batchPaid()" style="background:#2e7d32;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">💰 Mark Paid</button>'
      + '<button onclick="InvoicesPage._batchSendAll()" style="background:#2e7d32;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">📧 Send</button>'
      + '<button onclick="InvoicesPage._batchExport()" style="background:#455a64;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">📥 Export</button>'
      + '<button onclick="InvoicesPage._batchDelete()" style="background:#c62828;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">🗑 Delete</button>'
      + '<button onclick="InvoicesPage._batchClear()" style="background:none;color:rgba(255,255,255,.7);border:none;padding:8px 12px;font-size:16px;cursor:pointer;">&#10005;</button>'
      + '</div></div>'
      + '<style>@keyframes invBatchSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}</style>';

    // ── DESKTOP table (matches Jobs page shape: data-table + sortable headers + checkboxes) ──
    html += '<div class="q-desktop-only" style="background:var(--white);border-radius:12px;border:1px solid var(--border);overflow:hidden;">'
      + '<table class="data-table"><thead><tr>'
      + '<th style="width:32px;"><input type="checkbox" onchange="InvoicesPage._selectAll(this.checked)" title="Select all"></th>'
      + self._sortTh('Client', 'clientName')
      + self._sortTh('Invoice #', 'invoiceNumber')
      + self._sortTh('Date', 'createdAt')
      + self._sortTh('Due', 'dueDate')
      + self._sortTh('Status', 'status')
      + self._sortTh('Total', 'total', 'text-align:right;')
      + '</tr></thead><tbody>';

    if (page.length === 0) {
      html += '<tr><td colspan="7">' + (self._search ? '<div style="text-align:center;padding:24px;color:var(--text-light);">No invoices match "' + self._search + '"</div>' : UI.emptyState('💰', 'No invoices yet', 'Complete a job and create an invoice.')) + '</td></tr>';
    } else {
      page.forEach(function(inv) {
        var bal = (inv.balance || 0) > 0;
        var isOverdue = (inv.status === 'overdue' || inv.status === 'past_due');
        html += '<tr style="cursor:pointer;" onclick="InvoicesPage.showDetail(\'' + inv.id + '\')">'
          + '<td onclick="event.stopPropagation()"><input type="checkbox" class="inv-check" value="' + inv.id + '" data-id="' + inv.id + '" onchange="InvoicesPage._updateBulk()" style="width:16px;height:16px;"></td>'
          + '<td><strong>' + UI.esc(inv.clientName || '—') + '</strong>'
          + (inv.subject ? '<div style="font-size:12px;color:var(--text-light);font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px;">' + UI.esc(inv.subject) + '</div>' : '')
          + '</td>'
          + '<td>#' + (inv.invoiceNumber || '') + '</td>'
          + '<td style="white-space:nowrap;">' + UI.dateShort(inv.createdAt || inv.date) + '</td>'
          + '<td style="white-space:nowrap;">' + (inv.dueDate ? UI.dateShort(inv.dueDate) : '—') + '</td>'
          + '<td>' + UI.statusBadge(inv.status) + '</td>'
          + '<td style="text-align:right;font-weight:600;white-space:nowrap;">' + UI.money(inv.total)
          + (bal ? '<div style="font-size:11px;font-weight:500;color:' + (isOverdue ? '#dc3545' : 'var(--text-light)') + ';margin-top:2px;">Bal ' + UI.money(inv.balance) + '</div>' : '')
          + '</td>'
          + '</tr>';
      });
    }
    html += '</tbody></table></div>';

    if (page.length > 0) {

      // ── MOBILE cards ──
      html += '<div class="q-mobile-only" style="display:none;">';
      page.forEach(function(inv) {
        var dueLabel = inv.dueDate ? ('Due ' + UI.dateShort(inv.dueDate)) : UI.dateShort(inv.createdAt || inv.date);
        var bal = (inv.balance || 0) > 0;
        html += '<div data-iid="' + inv.id + '" class="invoice-card" style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:8px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.04);-webkit-tap-highlight-color:transparent;">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">'
          +   '<div style="flex:1;min-width:0;">'
          +     '<div style="font-size:15px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(inv.clientName || '—') + '</div>'
          +     (inv.subject ? '<div style="font-size:12px;color:var(--text-light);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(inv.subject) + '</div>' : '')
          +   '</div>'
          +   '<div style="text-align:right;flex-shrink:0;">'
          +     '<div style="font-size:17px;font-weight:800;color:var(--text);">' + UI.money(inv.total) + '</div>'
          +     (bal ? '<div style="font-size:11px;color:' + ((inv.status === 'overdue' || inv.status === 'past_due') ? '#dc3545' : 'var(--text-light)') + ';margin-top:2px;">Bal ' + UI.money(inv.balance) + '</div>' : '')
          +   '</div>'
          + '</div>'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:8px;flex-wrap:wrap;">'
          +   '<div>' + UI.statusBadge(inv.status) + '</div>'
          +   '<div style="font-size:11px;color:var(--text-light);">' + dueLabel + ' · #' + (inv.invoiceNumber || '') + '</div>'
          + '</div>'
          + '</div>';
      });
      html += '</div>';

      // Mobile tap handlers
      setTimeout(function() {
        document.querySelectorAll('.invoice-card').forEach(function(card) {
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
            var iid = this.getAttribute('data-iid');
            if (iid) InvoicesPage.showDetail(iid);
          });
        });
      }, 0);
    }

    // Pagination
    var totalPages = Math.ceil(filtered.length / self._perPage);
    if (totalPages > 1 || self._showAll) {
      html += '<div style="display:flex;justify-content:center;align-items:center;gap:4px;margin-top:12px;flex-wrap:wrap;">';
      if (!self._showAll) {
        html += '<button class="btn btn-outline" onclick="InvoicesPage._goPage(' + (self._page - 1) + ')" style="font-size:12px;padding:5px 10px;"' + (self._page === 0 ? ' disabled' : '') + '>‹</button>';
        for (var p = Math.max(0, self._page - 2); p <= Math.min(totalPages - 1, self._page + 2); p++) {
          html += '<button class="btn ' + (p === self._page ? 'btn-primary' : 'btn-outline') + '" onclick="InvoicesPage._goPage(' + p + ')" style="font-size:12px;padding:5px 10px;min-width:32px;">' + (p + 1) + '</button>';
        }
        html += '<button class="btn btn-outline" onclick="InvoicesPage._goPage(' + (self._page + 1) + ')" style="font-size:12px;padding:5px 10px;"' + (self._page >= totalPages - 1 ? ' disabled' : '') + '>›</button>';
      }
      html += '<button class="btn btn-outline" onclick="InvoicesPage._toggleShowAll()" style="font-size:12px;padding:5px 12px;margin-left:8px;">'
        + (self._showAll ? 'Paginate (' + self._perPage + '/page)' : 'Show all ' + filtered.length)
        + '</button>';
      html += '</div>';
    }
    return html;
  },

  _getFiltered: function() {
    var self = InvoicesPage;
    var all = DB.invoices.getAll();
    // Hide archived from default list view
    all = all.filter(function(i) { return i.status !== 'archived'; });
    var now = new Date();
    if (self._filter === 'unpaid') all = all.filter(function(i) { return i.status !== 'paid'; });
    else if (self._filter === 'past_due') all = all.filter(function(i) { return i.status !== 'paid' && i.status !== 'cancelled' && (i.status === 'overdue' || (i.dueDate && new Date(i.dueDate) < now)); });
    else if (self._filter === 'sent_not_due') all = all.filter(function(i) { return (i.status === 'sent' || i.status === 'viewed') && (!i.dueDate || new Date(i.dueDate) >= now); });
    else if (self._filter !== 'all') all = all.filter(function(i) { return i.status === self._filter; });
    if (self._search && self._search.length >= 2) {
      var s = self._search.toLowerCase();
      all = all.filter(function(i) { return (i.clientName||'').toLowerCase().indexOf(s) >= 0 || (i.subject||'').toLowerCase().indexOf(s) >= 0 || String(i.invoiceNumber).indexOf(s) >= 0; });
    }
    var col = self._sortCol;
    var dir = self._sortDir === 'asc' ? 1 : -1;
    all.sort(function(a, b) {
      var va = a[col], vb = b[col];
      if (col === 'invoiceNumber' || col === 'total' || col === 'balance') return ((va || 0) - (vb || 0)) * dir;
      if (col === 'dueDate') return ((new Date(va || 0)).getTime() - (new Date(vb || 0)).getTime()) * dir;
      va = (va || '').toString().toLowerCase(); vb = (vb || '').toString().toLowerCase();
      return va < vb ? -1 * dir : va > vb ? 1 * dir : 0;
    });
    return all;
  },
  _sortTh: function(label, col, extraStyle) {
    var self = InvoicesPage;
    var arrow = self._sortCol === col ? (self._sortDir === 'asc' ? ' &#9650;' : ' &#9660;') : '';
    return '<th onclick="InvoicesPage._setSort(\'' + col + '\')" style="cursor:pointer;user-select:none;' + (extraStyle || '') + '"' + (self._sortCol === col ? ' class="sort-active"' : '') + '>' + label + arrow + '</th>';
  },
  _setSort: function(col) {
    if (InvoicesPage._sortCol === col) { InvoicesPage._sortDir = InvoicesPage._sortDir === 'asc' ? 'desc' : 'asc'; }
    else { InvoicesPage._sortCol = col; InvoicesPage._sortDir = 'asc'; }
    InvoicesPage._page = 0; loadPage('invoices');
  },
  _setFilter: function(f) { InvoicesPage._filter = f; InvoicesPage._page = 0; loadPage('invoices'); },
  _goPage: function(p) { var t = Math.ceil(InvoicesPage._getFiltered().length / InvoicesPage._perPage); InvoicesPage._page = Math.max(0, Math.min(p, t - 1)); loadPage('invoices'); },
  _toggleShowAll: function() { InvoicesPage._showAll = !InvoicesPage._showAll; InvoicesPage._page = 0; loadPage('invoices'); },

  _selectAll: function(checked) {
    document.querySelectorAll('.inv-check').forEach(function(cb) { cb.checked = checked; });
    InvoicesPage._updateBatchBar();
  },
  _updateBulk: function() {
    InvoicesPage._updateBatchBar();
  },
  _updateBatchBar: function() {
    var selected = document.querySelectorAll('.inv-check:checked');
    var bar = document.getElementById('inv-batch-bar');
    var count = document.getElementById('inv-batch-count');
    if (bar) bar.style.display = selected.length > 0 ? 'flex' : 'none';
    if (count) count.textContent = selected.length + ' selected';
  },
  _getSelected: function() {
    return Array.from(document.querySelectorAll('.inv-check:checked')).map(function(cb) { return cb.getAttribute('data-id') || cb.value; });
  },
  _toggleAll: function(checked) {
    document.querySelectorAll('.inv-check').forEach(function(cb) { cb.checked = checked; });
    InvoicesPage._updateBatch();
  },
  _updateBatch: function() {
    var selected = InvoicesPage._getSelected();
    var bar = document.getElementById('inv-batch-bar');
    var count = document.getElementById('inv-batch-count');
    if (selected.length > 0) {
      bar.style.display = 'flex';
      count.textContent = selected.length + ' selected';
    } else {
      bar.style.display = 'none';
    }
  },
  _sendInvoice: function(id) {
    var inv = DB.invoices.getById(id);
    if (!inv) return;
    if (typeof Workflow !== 'undefined' && typeof Workflow.sendInvoice === 'function') {
      Workflow.sendInvoice(id);
      UI.toast('Invoice #' + inv.invoiceNumber + ' sent');
    } else {
      DB.invoices.update(id, { status: 'sent' });
      UI.toast('Invoice #' + inv.invoiceNumber + ' marked as sent');
    }
    loadPage('invoices');
  },
  _viewPDF: function(id) {
    var inv = DB.invoices.getById(id);
    if (!inv) return;
    if (typeof PDFGen !== 'undefined' && typeof PDFGen.invoice === 'function') {
      PDFGen.invoice(inv);
    } else {
      // PDFGen is in the bundle so this branch should never fire. Was previously
      // loadPage('pdfgen') which crashes — there's no top-level 'pdfgen' route.
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('PDF module not loaded — refresh BM and try again', 'error');
    }
  },
  _quickPay: function(id) {
    var inv = DB.invoices.getById(id);
    if (!inv) return;
    UI.confirm('Mark invoice #' + inv.invoiceNumber + ' for ' + UI.esc(inv.clientName || '') + ' as paid?', function() {
      if (typeof Workflow !== 'undefined') {
        Workflow.markPaid(id, 'check');
      } else {
        DB.invoices.update(id, { status: 'paid', balance: 0, paidDate: new Date().toISOString() });
      }
      UI.toast('Invoice #' + inv.invoiceNumber + ' marked paid');
      loadPage('invoices');
    });
  },
  _batchPaid: function() {
    var ids = InvoicesPage._getSelected();
    if (ids.length === 0) return;
    UI.confirm('Mark ' + ids.length + ' invoice' + (ids.length > 1 ? 's' : '') + ' as paid?', function() {
      ids.forEach(function(id) {
        if (typeof Workflow !== 'undefined') {
          Workflow.markPaid(id, 'bulk');
        } else {
          DB.invoices.update(id, { status: 'paid', balance: 0, paidDate: new Date().toISOString() });
        }
      });
      UI.toast(ids.length + ' invoice' + (ids.length > 1 ? 's' : '') + ' marked paid');
      loadPage('invoices');
    });
  },
  _batchReminder: function() {
    var ids = InvoicesPage._getSelected();
    if (ids.length === 0) return;
    var sent = 0;
    ids.forEach(function(id) {
      var inv = DB.invoices.getById(id);
      if (inv && inv.status !== 'paid') {
        if (typeof Workflow !== 'undefined') { Workflow.sendInvoice(id); }
        sent++;
      }
    });
    UI.toast('Reminders queued for ' + sent + ' invoice' + (sent !== 1 ? 's' : ''));
    loadPage('invoices');
  },
  _batchSendAll: function() {
    var ids = InvoicesPage._getSelected();
    if (ids.length === 0) return;
    UI.confirm('Mark ' + ids.length + ' invoice' + (ids.length > 1 ? 's' : '') + ' as sent?', function() {
      var count = 0;
      ids.forEach(function(id) {
        var inv = DB.invoices.getById(id);
        if (inv && inv.status !== 'paid') {
          DB.invoices.update(id, { status: 'sent' });
          count++;
        }
      });
      UI.toast(count + ' invoice' + (count > 1 ? 's' : '') + ' marked sent');
      loadPage('invoices');
    });
  },
  _batchDelete: function() {
    var ids = InvoicesPage._getSelected();
    if (ids.length === 0) return;
    if (!confirm('Delete ' + ids.length + ' invoice' + (ids.length > 1 ? 's' : '') + '? This cannot be undone.')) return;
    ids.forEach(function(id) { DB.invoices.remove(id); });
    UI.toast(ids.length + ' invoice' + (ids.length > 1 ? 's' : '') + ' deleted');
    loadPage('invoices');
  },

  _batchExport: function() {
    var ids = InvoicesPage._getSelected();
    if (ids.length === 0) return;
    var rows = ['Invoice #,Client,Subject,Status,Due Date,Total,Balance'];
    ids.forEach(function(id) {
      var inv = DB.invoices.getById(id);
      if (!inv) return;
      rows.push(
        '"' + (inv.invoiceNumber || '') + '",'
        + '"' + (inv.clientName || '').replace(/"/g, '""') + '",'
        + '"' + (inv.subject || '').replace(/"/g, '""') + '",'
        + '"' + (inv.status || '') + '",'
        + '"' + (inv.dueDate || '') + '",'
        + '"' + (inv.total || 0) + '",'
        + '"' + (inv.balance || 0) + '"'
      );
    });
    var csv = rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'invoices-export-' + new Date().toISOString().split('T')[0] + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.toast(ids.length + ' invoice' + (ids.length > 1 ? 's' : '') + ' exported');
  },
  _batchClear: function() {
    document.querySelectorAll('.inv-check').forEach(function(cb) { cb.checked = false; });
    var headerCheck = document.querySelector('th input[type="checkbox"]');
    if (headerCheck) headerCheck.checked = false;
    InvoicesPage._updateBatch();
  },

  _generateFromJobs: function() {
    var allJobs = DB.jobs.getAll();
    var allInvoices = DB.invoices.getAll();
    var invoicedJobIds = allInvoices.map(function(i) { return i.jobId; }).filter(Boolean);
    var uninvoiced = allJobs.filter(function(j) {
      return j.status === 'completed' && invoicedJobIds.indexOf(j.id) === -1;
    });

    if (uninvoiced.length === 0) {
      UI.toast('All completed jobs already have invoices', 'error');
      return;
    }

    var html = '<p style="margin:0 0 16px;font-size:13px;color:var(--text-light);">' + uninvoiced.length + ' completed jobs without invoices. Select which ones to generate:</p>';
    html += '<div style="max-height:350px;overflow-y:auto;">';
    uninvoiced.forEach(function(j) {
      html += '<label style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:8px;margin-bottom:6px;cursor:pointer;">'
        + '<input type="checkbox" checked class="gen-inv-check" data-id="' + j.id + '">'
        + '<div style="flex:1;"><div style="font-weight:600;font-size:13px;">' + UI.esc(j.clientName || '—') + ' — #' + (j.jobNumber || '') + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);">' + UI.esc(j.description || j.property || '') + ' · ' + UI.money(j.total || 0) + '</div></div>'
        + '</label>';
    });
    html += '</div>';

    UI.showModal('Generate Invoices (' + uninvoiced.length + ' jobs)', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="InvoicesPage._doGenerate()">Generate Selected</button>'
    });
  },

  _doGenerate: function() {
    var checks = document.querySelectorAll('.gen-inv-check:checked');
    var count = 0;
    // Cache invoice count ONCE outside the loop (was doing a full getAll() per checkbox)
    var _baseInvCount = DB.invoices.getAll().length;
    checks.forEach(function(cb) {
      var jobId = cb.getAttribute('data-id');
      var j = DB.jobs.getById(jobId);
      if (!j) return;
      var invNum = _baseInvCount + count + 1;
      // Subject = first non-empty of (job description, first line-item service,
      // job number fallback). Replaces the generic "For Services Rendered" so
      // invoice list rows show what the work actually was — e.g. "Tree of
      // Heaven Removal" instead of every row reading the same thing.
      var firstItem = (j.lineItems && j.lineItems[0]) || {};
      var derivedSubject = (j.description && j.description.trim())
        || firstItem.service
        || firstItem.description
        || 'Job #' + (j.jobNumber || '');
      DB.invoices.create({
        invoiceNumber: invNum,
        clientId: j.clientId,
        clientName: j.clientName,
        clientEmail: j.clientEmail,
        clientPhone: j.clientPhone,
        jobId: j.id,
        subject: derivedSubject,
        lineItems: j.lineItems || [],
        total: j.total || 0,
        balance: j.total || 0,
        issuedDate: new Date().toISOString().split('T')[0],
        status: 'draft'
      });
      DB.jobs.update(jobId, { invoiceId: 'generated' });
      count++;
    });
    UI.closeModal();
    UI.toast(count + ' invoice' + (count !== 1 ? 's' : '') + ' generated! 🧾');
    loadPage('invoices');
  },

  _getPayLink: function(id) {
    var inv = DB.invoices.getById(id);
    if (!inv) return 'https://branchmanager.app/pay.html?id=' + id;
    // Lazily generate a 32-char payment_token if not present. This token is
    // required by pay.html (which now POSTs to invoice-fetch edge fn). Old
    // 16-char tokens are too short — use crypto.randomUUID() twice for
    // ~128 bits of entropy. Backfill happens once per invoice on first
    // pay-link generation; subsequent calls reuse the stored token.
    var token = inv.paymentToken;
    if (!token || token.length < 24) {
      var raw = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
        : (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
      token = raw.slice(0, 32);
      DB.invoices.update(id, { paymentToken: token });
    }
    var isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    var lookupId = isUUID ? id : (inv.invoiceNumber || id);
    return 'https://branchmanager.app/pay.html?id=' + encodeURIComponent(lookupId) + '&token=' + token;
  },

  _copyPayLink: function(id) {
    var link = InvoicesPage._getPayLink(id);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(function() { UI.toast('Pay link copied!'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      UI.toast('Pay link copied!');
    }
  },

  _saveStripeUrl: function(id, url) {
    if (url && !url.startsWith('https://')) { UI.toast('Must be a valid https:// URL', 'error'); return; }
    DB.invoices.update(id, { stripePaymentUrl: url || null });
    UI.toast(url ? 'Payment link saved!' : 'Payment link removed');
    InvoicesPage.showDetail(id);
  },

  _copyStripeLink: function(id) {
    var inv = DB.invoices.getById(id);
    if (!inv || !inv.stripePaymentUrl) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(inv.stripePaymentUrl).then(function() { UI.toast('Copied!'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = inv.stripePaymentUrl; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      UI.toast('Copied!');
    }
  },

  // Modal: preview invoice + choose delivery (email / SMS link / copy link / open pay page)
  _showSendChooser: function(id) {
    var inv = DB.invoices.getById(id);
    if (!inv) return;
    var client = inv.clientId ? DB.clients.getById(inv.clientId) : null;
    var email = inv.clientEmail || (client && client.email) || '';
    var phone = inv.clientPhone || (client && client.phone) || '';
    var payLink = InvoicesPage._getPayLink(id);
    var amt = UI.money(inv.balance || inv.total);

    var body = '<div style="max-width:520px;">'
      + '<div style="background:linear-gradient(135deg,#1a3c12,#00836c);color:#fff;padding:16px 18px;border-radius:10px;margin-bottom:14px;">'
      +   '<div style="font-size:12px;opacity:.85;">Invoice #' + inv.invoiceNumber + ' · ' + (inv.clientName||'') + '</div>'
      +   '<div style="font-size:28px;font-weight:800;margin-top:2px;">' + amt + '</div>'
      +   (inv.dueDate ? '<div style="font-size:12px;opacity:.8;margin-top:2px;">Due ' + UI.dateShort(inv.dueDate) + '</div>' : '')
      + '</div>'
      + '<div style="background:var(--bg);border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px;">'
      +   '<div style="font-weight:600;margin-bottom:4px;">Pay link:</div>'
      +   '<div style="font-family:monospace;font-size:11px;word-break:break-all;color:var(--text-light);">' + payLink + '</div>'
      + '</div>'
      + '<div style="display:grid;gap:8px;">'
      +   '<label style="font-size:12px;color:var(--text-light);">Email recipient</label>'
      +   '<input type="email" id="send-email-to" value="' + (email || '').replace(/"/g, '&quot;') + '" placeholder="recipient@example.com" style="padding:9px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;">'
      +   '<button class="btn btn-primary" onclick="InvoicesPage._chooserSendEmail(\'' + id + '\')" style="margin-top:4px;">📧 Send Email</button>'
      +   '<div style="height:1px;background:var(--border);margin:8px 0;"></div>'
      +   '<label style="font-size:12px;color:var(--text-light);">SMS link to ' + (phone ? UI.phone(phone) : 'client phone') + '</label>'
      +   '<button class="btn btn-outline" ' + (!phone ? 'disabled' : '') + ' onclick="InvoicesPage._chooserSendSMS(\'' + id + '\')" style="' + (!phone ? 'opacity:.5;cursor:not-allowed;' : '') + '">📱 Open SMS with pay link</button>'
      +   '<button class="btn btn-outline" onclick="InvoicesPage._chooserCopyLink(\'' + id + '\')">📋 Copy pay link to clipboard</button>'
      +   '<button class="btn btn-outline" onclick="window.open(\'' + payLink + '\', \'_blank\')">🔗 Open pay page in new tab</button>'
      + '</div>'
      + '<div style="margin-top:16px;font-size:11px;color:var(--text-light);text-align:center;">Invoice saved and marked sent — pick any delivery method above.</div>'
      + '</div>';

    UI.showModal('Send Invoice #' + inv.invoiceNumber, body, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal();loadPage(\'invoices\');">Done</button>'
    });
  },

  _chooserSendEmail: function(id) {
    var toEl = document.getElementById('send-email-to');
    if (!toEl) return;
    var email = (toEl.value || '').trim();
    if (!email) { UI.toast('Enter a recipient', 'error'); return; }
    var inv = DB.invoices.getById(id);
    if (inv) { inv.clientEmail = email; DB.invoices.update(id, { clientEmail: email }); }
    InvoicesPage._sendInvoiceEmail(id);
    UI.closeModal();
    loadPage('invoices');
  },

  _chooserSendSMS: function(id) {
    var inv = DB.invoices.getById(id);
    if (!inv) return;
    var client = inv.clientId ? DB.clients.getById(inv.clientId) : null;
    var phone = (inv.clientPhone || (client && client.phone) || '').replace(/\D/g, '');
    if (!phone) { UI.toast('No phone on file', 'error'); return; }
    var payLink = InvoicesPage._getPayLink(id);
    var msg = 'Invoice #' + inv.invoiceNumber + ' from ' + InvoicesPage._co().name + ' — ' + UI.money(inv.balance || inv.total) + '. Pay: ' + payLink;
    window.open('sms:' + phone + '?&body=' + encodeURIComponent(msg));
  },

  _chooserCopyLink: function(id) {
    var link = InvoicesPage._getPayLink(id);
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(function(){ UI.toast('Pay link copied ✓'); });
    else prompt('Copy this link:', link);
  },

  _sendInvoiceEmail: function(id) {
    var inv = DB.invoices.getById(id);
    if (!inv) return;
    var client = inv.clientId ? DB.clients.getById(inv.clientId) : null;
    var email = inv.clientEmail || (client && client.email) || '';
    if (!email) { UI.toast('No email address for this client', 'error'); return; }
    var firstName = (inv.clientName || '').split(' ')[0] || 'there';
    var payLink = InvoicesPage._getPayLink(id);
    var amtDue = UI.money(inv.balance || inv.total);
    var subject = 'Invoice #' + inv.invoiceNumber + ' from ' + InvoicesPage._co().name + ' — ' + amtDue;

    // Plain text fallback
    var body = 'Hi ' + firstName + ',\n\n'
      + 'Thank you for choosing ' + InvoicesPage._co().name + '! Your invoice is ready:\n\n'
      + '  Invoice #' + inv.invoiceNumber + '\n'
      + (inv.subject ? '  Job: ' + inv.subject + '\n' : '')
      + '  Amount Due: ' + amtDue + '\n'
      + (inv.dueDate ? '  Due: ' + UI.dateShort(inv.dueDate) + '\n' : '') + '\n'
      + 'Pay online (card, or tip optional):\n' + payLink + '\n\n'
      + 'Want to see all your invoices, quotes & job history any time? Get a portal link: https://branchmanager.app/portal.html\n\n'
      + 'Questions? Reply to this email or call/text ' + InvoicesPage._co().phone + '.\n\n'
      + 'Thanks,\n' + CompanyInfo.get('ownerName') + '\n' + InvoicesPage._co().name + '\n' + InvoicesPage._co().phone + '\n' + InvoicesPage._co().website;

    // Branded HTML email
    var _c = InvoicesPage._co();
    var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

    // Line items table
    var lineItemsHtml = '';
    if (inv.lineItems && inv.lineItems.length) {
      lineItemsHtml = '<table style="width:100%;border-collapse:collapse;font-size:13px;margin:0;">'
        + '<tr style="background:#374151;">'
        + '<th style="padding:8px 12px;text-align:left;font-size:11px;color:#fff;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">SERVICE</th>'
        + '<th style="padding:8px 12px;text-align:right;font-size:11px;color:#fff;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">AMOUNT</th>'
        + '</tr>';
      inv.lineItems.forEach(function(item, i) {
        var amt = item.amount || ((item.qty||1) * (item.rate||0));
        lineItemsHtml += '<tr style="background:' + (i%2===0?'#fff':'#f9fafb') + ';">'
          + '<td style="padding:9px 12px;border-bottom:1px solid #f3f4f6;color:#374151;">' + esc(item.service||item.description||'Service') + (item.description && item.service && item.description!==item.service ? '<div style="font-size:11px;color:#9ca3af;margin-top:2px;">'+esc(item.description)+'</div>' : '') + '</td>'
          + '<td style="padding:9px 12px;text-align:right;border-bottom:1px solid #f3f4f6;font-weight:600;color:#374151;">' + UI.money(amt) + '</td>'
          + '</tr>';
      });
      // Subtotal / tax / total rows
      var subtotal = inv.subtotal || inv.total;
      var taxAmt   = inv.taxAmount || 0;
      var totalAmt = inv.total || 0;
      if (taxAmt) {
        lineItemsHtml += '<tr><td style="padding:8px 12px 4px;text-align:right;font-size:12px;color:#6b7280;" colspan="1">Subtotal</td><td style="padding:8px 12px 4px;text-align:right;font-size:12px;color:#6b7280;">' + UI.money(subtotal) + '</td></tr>';
        lineItemsHtml += '<tr><td style="padding:4px 12px;text-align:right;font-size:12px;color:#6b7280;" colspan="1">Tax</td><td style="padding:4px 12px;text-align:right;font-size:12px;color:#6b7280;">' + UI.money(taxAmt) + '</td></tr>';
      }
      lineItemsHtml += '<tr style="background:#374151;"><td style="padding:10px 12px;font-weight:700;font-size:14px;color:#fff;">Total</td><td style="padding:10px 12px;text-align:right;font-weight:900;font-size:15px;color:#fff;">' + UI.money(totalAmt) + '</td></tr>';
      lineItemsHtml += '</table>';
    }

    // Social/review footer bar (only renders links that are set)
    var socialLinks = [];
    if (_c.googleReview) socialLinks.push('<a href="' + _c.googleReview + '" style="color:#1a3c12;text-decoration:none;font-weight:700;font-size:12px;white-space:nowrap;">⭐ Leave a Review</a>');
    if (_c.facebook)     socialLinks.push('<a href="' + _c.facebook + '" style="color:#1877f2;text-decoration:none;font-weight:700;font-size:12px;white-space:nowrap;">&#9633; Facebook</a>');
    if (_c.instagram)    socialLinks.push('<a href="' + _c.instagram + '" style="color:#e1306c;text-decoration:none;font-weight:700;font-size:12px;white-space:nowrap;">&#9650; Instagram</a>');
    if (_c.yelp)         socialLinks.push('<a href="' + _c.yelp + '" style="color:#d32323;text-decoration:none;font-weight:700;font-size:12px;white-space:nowrap;">&#9670; Yelp</a>');
    if (_c.nextdoor)     socialLinks.push('<a href="' + _c.nextdoor + '" style="color:#00b246;text-decoration:none;font-weight:700;font-size:12px;white-space:nowrap;">&#9632; Nextdoor</a>');

    var htmlBody = '<div style="background:#f5f6f8;padding:24px 0;">'
      + '<table style="max-width:580px;margin:0 auto;border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">'
      // ── Header: logo + company / invoice meta ──────────────────────────
      + '<tr style="background:#1a3c12;">'
      + '<td style="padding:20px 26px;width:55%;vertical-align:middle;">'
      + (_c.logo
          ? '<img src="' + _c.logo + '" style="width:44px;height:44px;object-fit:contain;border-radius:8px;display:block;margin-bottom:8px;" alt="' + esc(_c.name) + '">'
          : '<div style="background:rgba(255,255,255,.15);border-radius:8px;width:44px;height:44px;text-align:center;line-height:44px;font-size:22px;margin-bottom:8px;">🌳</div>')
      + '<div style="font-size:15px;font-weight:800;color:#fff;">' + esc(_c.name) + '</div>'
      + (_c.phone ? '<div style="font-size:12px;color:rgba(255,255,255,.75);margin-top:2px;">' + esc(_c.phone) + '</div>' : '')
      + (_c.email ? '<div style="font-size:12px;color:rgba(255,255,255,.65);margin-top:1px;">' + esc(_c.email) + '</div>' : '')
      + '</td>'
      + '<td style="padding:20px 26px;vertical-align:middle;text-align:right;background:#163310;">'
      + '<div style="font-size:11px;color:rgba(255,255,255,.65);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Invoice</div>'
      + '<div style="font-size:20px;font-weight:900;color:#fff;letter-spacing:-.5px;">#' + esc(inv.invoiceNumber||'') + '</div>'
      + '<div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-1px;margin:6px 0 4px;">' + amtDue + '</div>'
      + '<div style="font-size:11px;color:rgba(255,255,255,.7);">' + (inv.dueDate ? 'Due ' + UI.dateShort(inv.dueDate) : 'Balance due') + '</div>'
      + '</td>'
      + '</tr>'
      // ── Bill To ──────────────────────────────────────────────────────
      + '<tr style="background:#fff;">'
      + '<td colspan="2" style="padding:16px 26px 0;">'
      + '<div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Bill To</div>'
      + '<div style="font-size:14px;font-weight:700;color:#111827;">' + esc(inv.clientName||'') + '</div>'
      + (inv.property ? '<div style="font-size:12px;color:#6b7280;margin-top:2px;">' + esc(inv.property) + '</div>' : '')
      + (inv.subject ? '<div style="font-size:12px;color:#6b7280;margin-top:6px;padding:6px 10px;background:#f9fafb;border-radius:6px;">📋 ' + esc(inv.subject) + '</div>' : '')
      + '</td>'
      + '</tr>'
      // ── Greeting ──────────────────────────────────────────────────────
      + '<tr style="background:#fff;">'
      + '<td colspan="2" style="padding:16px 26px 8px;">'
      + '<p style="font-size:14px;color:#374151;margin:0 0 10px;">Hi ' + esc(firstName) + ',</p>'
      + '<p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0;">Thank you for choosing <strong>' + esc(_c.name) + '</strong>! Your invoice is ready to view and pay online.</p>'
      + '</td>'
      + '</tr>'
      // ── Line items ────────────────────────────────────────────────────
      + '<tr style="background:#fff;">'
      + '<td colspan="2" style="padding:8px 26px 0;">' + lineItemsHtml + '</td>'
      + '</tr>'
      // ── Pay button ────────────────────────────────────────────────────
      + '<tr style="background:#fff;">'
      + '<td colspan="2" style="padding:20px 26px;text-align:center;">'
      + '<a href="' + payLink + '" style="display:inline-block;background:linear-gradient(135deg,#00836c,#1a3c12);color:#fff;padding:14px 36px;border-radius:10px;font-size:16px;font-weight:800;text-decoration:none;letter-spacing:-0.3px;box-shadow:0 4px 14px rgba(0,131,108,.35);">💳 Pay ' + amtDue + ' Online</a>'
      + '<div style="font-size:11px;color:#9ca3af;margin-top:8px;">Optional gratuity available on the payment page.</div>'
      + '</td>'
      + '</tr>'
      // ── Footer ────────────────────────────────────────────────────────
      + '<tr style="background:#f9fafb;">'
      + '<td colspan="2" style="padding:14px 26px;border-top:1px solid #f3f4f6;">'
      + '<table style="width:100%;border-collapse:collapse;">'
      + '<tr>'
      + '<td style="font-size:12px;color:#6b7280;">Questions? Call/text <strong>' + esc(_c.phone||'') + '</strong> or reply to this email.</td>'
      + (_c.website ? '<td style="text-align:right;font-size:12px;"><a href="' + _c.website + '" style="color:#1a3c12;text-decoration:none;font-weight:600;">' + esc(_c.website.replace(/^https?:\/\//,'')) + '</a></td>' : '<td></td>')
      + '</tr>'
      + '</table>'
      + '<div style="margin-top:8px;font-size:11px;color:#9ca3af;">Want to see all your invoices, quotes &amp; job history any time? <a href="https://branchmanager.app/portal.html" style="color:#1a3c12;text-decoration:underline;">Get your portal link &rarr;</a></div>'
      + '</td>'
      + '</tr>'
      // ── Social / review bar ───────────────────────────────────────────
      + (socialLinks.length ? '<tr style="background:#f9fafb;"><td colspan="2" style="padding:10px 26px 16px;border-top:1px solid #f3f4f6;text-align:center;">' + socialLinks.join('<span style="color:#e5e7eb;margin:0 8px;">|</span>') + '</td></tr>' : '')
      + '</table>'
      + '</div>';

    if (typeof Email !== 'undefined') {
      Email.send(email, subject, body, { htmlBody: htmlBody }).then(function(result) {
        // Email.send returns {success:true,...} on success — Email itself toasts the user
        if (result && result.success) {
          DB.invoices.update(id, { status: 'sent', sentAt: new Date().toISOString() });
        }
        // Email.send already toasts on failure (with hint + mailto fallback) — don't double-toast
        InvoicesPage.showDetail(id);
      });
    } else {
      window.open('mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body), '_blank');
      DB.invoices.update(id, { status: 'sent', sentAt: new Date().toISOString() });
      InvoicesPage.showDetail(id);
    }
  },

  _sendReceiptEmail: function(id) {
    var inv = DB.invoices.getById(id);
    if (!inv) return;
    var client = inv.clientId ? DB.clients.getById(inv.clientId) : null;
    var email = inv.clientEmail || (client && client.email) || '';
    if (!email) return; // no email on file — silent skip
    var _c = InvoicesPage._co();
    var esc = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    var firstName = (inv.clientName || '').split(' ')[0] || 'there';
    var total = UI.money(inv.total || 0);
    var paidDate = inv.paidDate ? new Date(inv.paidDate).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
    var subject = 'Payment Receipt — Invoice #' + inv.invoiceNumber + ' · ' + total + ' · ' + _c.name;

    var body = 'Hi ' + firstName + ',\n\nThank you for your payment of ' + total + '! Your account is paid in full.\n\n'
      + 'Invoice #' + inv.invoiceNumber + '\n'
      + (inv.subject ? 'Job: ' + inv.subject + '\n' : '')
      + 'Amount Paid: ' + total + '\n'
      + 'Date: ' + paidDate + '\n\n'
      + 'It was a pleasure working with you. If you\'re happy with our service, we\'d love a Google review!\n\n'
      + (_c.googleReview ? _c.googleReview + '\n\n' : '')
      + 'Thanks,\n' + CompanyInfo.get('ownerName') + '\n' + _c.name + '\n' + _c.phone;

    // Line items summary
    var liRows = '';
    if (inv.lineItems && inv.lineItems.length) {
      inv.lineItems.forEach(function(item, i) {
        var amt = item.amount || ((item.qty||1) * (item.rate||0));
        liRows += '<tr style="background:' + (i%2===0?'#fff':'#f9fafb') + ';">'
          + '<td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;">' + esc(item.service||item.description||'Service') + '</td>'
          + '<td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f3f4f6;font-weight:600;color:#374151;font-size:13px;">' + UI.money(amt) + '</td>'
          + '</tr>';
      });
    }

    // Social links
    var socialLinks = [];
    if (_c.googleReview) socialLinks.push('<a href="' + _c.googleReview + '" style="color:#1a3c12;text-decoration:none;font-weight:700;font-size:12px;">⭐ Leave a Review</a>');
    if (_c.facebook)     socialLinks.push('<a href="' + _c.facebook + '" style="color:#1877f2;text-decoration:none;font-size:12px;">&#9633; Facebook</a>');
    if (_c.instagram)    socialLinks.push('<a href="' + _c.instagram + '" style="color:#e1306c;text-decoration:none;font-size:12px;">&#9650; Instagram</a>');

    var htmlBody = '<div style="background:#f5f6f8;padding:24px 0;">'
      + '<table style="max-width:560px;margin:0 auto;border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">'
      // Header — green "PAID" bar
      + '<tr style="background:#059669;">'
      + '<td style="padding:20px 26px;width:55%;vertical-align:middle;">'
      + (_c.logo ? '<img src="' + _c.logo + '" style="width:40px;height:40px;object-fit:contain;border-radius:8px;display:block;margin-bottom:8px;" alt="">' : '<div style="background:rgba(255,255,255,.2);border-radius:8px;width:40px;height:40px;text-align:center;line-height:40px;font-size:20px;margin-bottom:8px;">🌳</div>')
      + '<div style="font-size:15px;font-weight:800;color:#fff;">' + esc(_c.name) + '</div>'
      + (_c.phone ? '<div style="font-size:12px;color:rgba(255,255,255,.75);margin-top:2px;">' + esc(_c.phone) + '</div>' : '')
      + '</td>'
      + '<td style="padding:20px 26px;text-align:right;vertical-align:middle;background:#047857;">'
      + '<div style="font-size:11px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Receipt</div>'
      + '<div style="font-size:18px;font-weight:900;color:#fff;">#' + esc(inv.invoiceNumber||'') + '</div>'
      + '<div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-1px;margin:6px 0 4px;">' + total + '</div>'
      + '<div style="font-size:11px;color:rgba(255,255,255,.8);background:rgba(255,255,255,.15);padding:3px 10px;border-radius:20px;display:inline-block;">✓ PAID IN FULL</div>'
      + '</td>'
      + '</tr>'
      // Thank you message
      + '<tr style="background:#fff;">'
      + '<td colspan="2" style="padding:20px 26px;">'
      + '<p style="font-size:15px;font-weight:700;color:#059669;margin:0 0 8px;">Thank you, ' + esc(firstName) + '! 🎉</p>'
      + '<p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0;">Your payment of <strong>' + total + '</strong> was received on ' + paidDate + '. Your account is paid in full. This email is your receipt.</p>'
      + '</td>'
      + '</tr>'
      // Line items
      + (liRows ? '<tr style="background:#fff;"><td colspan="2" style="padding:0 26px 8px;">'
        + '<table style="width:100%;border-collapse:collapse;">'
        + '<tr style="background:#374151;"><th style="padding:7px 12px;text-align:left;font-size:11px;color:#fff;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">Service</th><th style="padding:7px 12px;text-align:right;font-size:11px;color:#fff;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">Amount</th></tr>'
        + liRows
        + '<tr style="background:#f0fdf4;"><td style="padding:9px 12px;font-weight:700;font-size:14px;color:#166534;">Total Paid</td><td style="padding:9px 12px;text-align:right;font-weight:900;font-size:14px;color:#166534;">' + total + '</td></tr>'
        + '</table></td></tr>' : '')
      // Review ask (if Google Review link set)
      + (_c.googleReview ? '<tr style="background:#f0fdf4;"><td colspan="2" style="padding:16px 26px;text-align:center;border-top:1px solid #d1fae5;">'
        + '<p style="font-size:13px;color:#374151;margin:0 0 10px;">Happy with our work? It means the world to us! ⭐</p>'
        + '<a href="' + _c.googleReview + '" style="display:inline-block;background:#1a3c12;color:#fff;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">⭐ Leave Us a Google Review</a>'
        + '</td></tr>' : '')
      // Footer
      + '<tr style="background:#f9fafb;"><td colspan="2" style="padding:14px 26px;border-top:1px solid #f3f4f6;">'
      + '<table style="width:100%;border-collapse:collapse;"><tr>'
      + '<td style="font-size:12px;color:#6b7280;">Questions? Call <strong>' + esc(_c.phone||'') + '</strong></td>'
      + (_c.website ? '<td style="text-align:right;font-size:12px;"><a href="' + _c.website + '" style="color:#1a3c12;text-decoration:none;">' + esc((_c.website||'').replace(/^https?:\/\//,'')) + '</a></td>' : '<td></td>')
      + '</tr></table>'
      + '</td></tr>'
      // Social bar
      + (socialLinks.length ? '<tr style="background:#f9fafb;"><td colspan="2" style="padding:10px 26px 16px;border-top:1px solid #f3f4f6;text-align:center;">' + socialLinks.join('<span style="color:#e5e7eb;margin:0 8px;">|</span>') + '</td></tr>' : '')
      + '</table></div>';

    if (typeof Email !== 'undefined') {
      Email.send(email, subject, body, { htmlBody: htmlBody }).then(function(result) {
        if (result && result.success) UI.toast('Receipt sent to ' + email + ' ✓');
      });
    }
  },

  showDetail: function(id) {
    var inv = DB.invoices.getById(id);
    if (!inv) return;
    if (window.bmRememberDetail) window.bmRememberDetail('invoices', id);

    var statusColors = {draft:'#6c757d',sent:'#1565c0',viewed:'#e07c24',partial:'#e6a817',paid:'#2e7d32',overdue:'#dc3545',cancelled:'#6c757d'};
    var statusColor = statusColors[inv.status] || '#1565c0';

    // Look up client for contact info
    var client = inv.clientId ? DB.clients.getById(inv.clientId) : null;
    var clientPhone = inv.clientPhone || (client ? client.phone : '');
    var clientEmail = inv.clientEmail || (client ? client.email : '');
    var clientAddr = inv.property || (client ? client.address : '');

    // v433: legacy system-style invoice detail — single clean card, status pill, big title,
    // one primary "Collect Payment" CTA, all secondary actions tucked under "More".
    var statusLabel = (inv.status || 'sent').replace(/_/g,' ');
    var isPastDue = inv.status !== 'paid' && inv.status !== 'cancelled' && inv.dueDate && new Date(inv.dueDate) < new Date();
    var displayStatus = isPastDue ? 'Past due' : statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1);
    var displayStatusColor = isPastDue ? '#dc3545' : statusColor;

    var html = ''
      // Top-of-page action bar (back, status pill, more, Collect Payment)
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap;">'
      +   '<div style="display:flex;align-items:center;gap:10px;">'
      +     '<button type="button" class="btn btn-outline" onclick="loadPage(\'invoices\')" style="padding:6px 12px;font-size:13px;">← Invoices</button>'
      +     '<span style="display:inline-flex;align-items:center;gap:6px;background:' + displayStatusColor + '15;color:' + displayStatusColor + ';padding:5px 12px;border-radius:999px;font-size:12px;font-weight:700;">'
      +       '<span style="width:7px;height:7px;border-radius:50%;background:' + displayStatusColor + ';"></span>' + displayStatus
      +     '</span>'
      +   '</div>'
      +   '<div style="display:flex;gap:8px;align-items:center;">'
      +     '<div style="position:relative;display:inline-block;">'
      +       '<button type="button" onclick="var d=this.nextElementSibling;document.querySelectorAll(\'.more-dd\').forEach(function(x){x.style.display=\'none\'});d.style.display=d.style.display===\'block\'?\'none\':\'block\';" class="btn btn-outline" style="font-size:13px;padding:8px 14px;display:flex;align-items:center;gap:6px;">••• More</button>'
      +       '<div class="more-dd" style="display:none;position:absolute;right:0;top:calc(100% + 4px);background:#fff;border:1px solid var(--border);border-radius:10px;padding:4px 0;z-index:200;min-width:200px;box-shadow:0 4px 16px rgba(0,0,0,.12);">'
      +         '<button type="button" onclick="InvoicesPage._sendInvoiceEmail(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:9px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">Send invoice</button>'
      +         (inv.clientId ? '<button type="button" onclick="ClientsPage._sendPortalInvite(\'' + inv.clientId + '\')" style="display:block;width:100%;text-align:left;padding:9px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">🔗 Send portal invite</button>' : '')
      +         '<button type="button" onclick="InvoicesPage._copyPayLink(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:9px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">Copy pay link</button>'
      +         '<button type="button" onclick="PDF.generateInvoice(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:9px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">Download PDF</button>'
      +         '<button type="button" onclick="InvoicesPage.showForm(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:9px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">Edit invoice</button>'
      +         '<div style="height:1px;background:var(--border);margin:4px 0;"></div>'
      +         '<button type="button" onclick="InvoicesPage._archiveInvoice(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:9px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">Archive</button>'
      +         '<button type="button" onclick="InvoicesPage.setStatus(\'' + id + '\',\'cancelled\')" style="display:block;width:100%;text-align:left;padding:9px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:#dc3545;">Cancel invoice</button>'
      +       '</div>'
      +     '</div>'
      +     (inv.status !== 'paid'
        ? '<button type="button" class="btn btn-primary" onclick="if(typeof Workflow!==\'undefined\')Workflow.showMarkPaid(\'' + id + '\');else InvoicesPage._quickPay(\'' + id + '\');" style="font-size:14px;font-weight:700;padding:9px 18px;background:#2e7d32;color:#fff;border:none;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;box-shadow:0 1px 3px rgba(0,0,0,.1);">$ Collect Payment</button>'
        : '<span style="font-size:13px;color:var(--green-dark);font-weight:700;display:inline-flex;align-items:center;gap:6px;background:#e8f5e9;padding:8px 14px;border-radius:8px;">✓ Paid</span>')
      +   '</div>'
      + '</div>'

      // Single big white card — title + body
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:28px 32px;margin-bottom:16px;box-shadow:0 1px 2px rgba(0,0,0,.04);">'
      // Title (subject), like legacy system's "For Services Rendered"
      + '<h1 style="font-size:28px;font-weight:800;margin:0 0 24px;letter-spacing:-0.4px;">' + UI.esc(inv.subject || 'Invoice') + '</h1>'

      // Two-column body: client (left) | metadata (right)
      + '<div style="display:grid;grid-template-columns:1fr 1.2fr;gap:32px;align-items:start;" class="detail-grid">'

      // LEFT: client card
      + (function() {
        var billing = (client && client.address) ? client.address : clientAddr;
        var property = inv.property || '';
        var sameAddr = !property || (billing && property.trim() === (billing||'').trim());
        var cid = inv.clientId || '';
        return '<div style="background:var(--bg);border-radius:10px;padding:20px;position:relative;">'
        +   '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px;">'
        +     '<div style="display:flex;align-items:center;gap:8px;">'
        +       '<span style="font-weight:800;font-size:17px;color:#1a3c12;">' + UI.esc(inv.clientName || '—') + '</span>'
        +       '<span style="width:8px;height:8px;border-radius:50%;background:#2e7d32;"></span>'
        +     '</div>'
        +     (cid
              ? '<div style="position:relative;">'
                + '<button type="button" onclick="var d=this.nextElementSibling;document.querySelectorAll(\'.client-dd\').forEach(function(x){x.style.display=\'none\'});d.style.display=d.style.display===\'block\'?\'none\':\'block\';event.stopPropagation();" style="background:var(--white);border:1px solid var(--border);border-radius:8px;width:36px;height:32px;cursor:pointer;font-size:14px;color:var(--text);display:inline-flex;align-items:center;justify-content:center;">•••</button>'
                + '<div class="client-dd" style="display:none;position:absolute;right:0;top:calc(100% + 4px);background:#fff;border:1px solid var(--border);border-radius:10px;padding:4px 0;z-index:200;min-width:200px;box-shadow:0 4px 16px rgba(0,0,0,.12);">'
                +   '<button type="button" onclick="ClientsPage.showDetail(\'' + cid + '\')" style="display:block;width:100%;text-align:left;padding:10px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">👁  View client profile</button>'
                +   '<button type="button" onclick="ClientsPage.showForm(\'' + cid + '\')" style="display:block;width:100%;text-align:left;padding:10px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">✏️  Edit client details</button>'
                + '</div>'
                + '</div>'
              : '')
        +   '</div>'
        +   (billing
              ? '<div style="margin-bottom:14px;">'
                + '<div style="font-size:12px;color:var(--text-light);margin-bottom:2px;">Billing Address</div>'
                + '<div style="font-size:14px;color:var(--text);line-height:1.5;">' + UI.esc(billing) + '</div>'
                + '</div>'
              : '')
        +   '<div style="margin-bottom:14px;">'
        +     '<div style="font-size:12px;color:var(--text-light);margin-bottom:2px;">Property Address</div>'
        +     '<div style="font-size:14px;color:var(--text);line-height:1.5;">' + (sameAddr ? '<span style="color:var(--text-light);font-style:italic;">(Same as billing address)</span>' : UI.esc(property)) + '</div>'
        +   '</div>'
        +   (clientPhone ? '<div style="margin-bottom:4px;"><a href="tel:' + clientPhone.replace(/\D/g,'') + '" style="font-size:14px;color:var(--text);text-decoration:none;">' + UI.phone(clientPhone) + '</a></div>' : '')
        +   (clientEmail ? '<div><a href="mailto:' + clientEmail + '" style="font-size:14px;color:var(--green-dark);text-decoration:underline;">' + UI.esc(clientEmail) + '</a></div>' : '')
        + '</div>';
      })()

      // RIGHT: metadata key-value
      + '<div>'
      +   '<div style="display:grid;grid-template-columns:140px 1fr;row-gap:14px;column-gap:16px;font-size:14px;">'
      +     '<div style="color:var(--text-light);">Invoice #</div><div style="font-weight:600;">' + (inv.invoiceNumber || '—') + '</div>'
      +     (inv.jobId ? '<div style="color:var(--text-light);">Invoice for</div><div><a href="#" onclick="JobsPage.showDetail(\'' + inv.jobId + '\');return false;" style="color:var(--accent);text-decoration:none;font-weight:600;">Job #' + (inv.jobNumber || '') + '</a></div>' : '')
      +     '<div style="color:var(--text-light);">Issued</div><div>' + UI.dateShort(inv.issuedDate || inv.createdAt) + '</div>'
      +     '<div style="color:var(--text-light);">Due date</div><div>' + (inv.dueDate ? UI.dateShort(inv.dueDate) : 'Due on receipt') + '</div>'
      +     '<div style="color:var(--text-light);">Total</div><div style="font-weight:700;">' + UI.money(inv.total) + '</div>'
      +     '<div style="color:var(--text-light);">Paid</div><div style="font-weight:700;color:var(--green-dark);">' + UI.money((inv.total||0) - (inv.balance||0)) + '</div>'
      +     '<div style="color:var(--text-light);font-weight:700;border-top:1px solid var(--border);padding-top:10px;">Balance</div><div style="font-weight:800;font-size:16px;color:' + (inv.balance > 0 ? '#dc3545' : '#2e7d32') + ';border-top:1px solid var(--border);padding-top:10px;">' + UI.money(inv.balance || 0) + '</div>'
      +   '</div>'
      + '</div>'
      + '</div>' // end two-column
      + '</div>'; // end big card

    // Main content area
    html += '<div style="display:grid;grid-template-columns:1fr 300px;gap:20px;margin-top:20px;" class="detail-grid"><div>';

    // Line items — legacy system-style: clean rows with subtle dividers, right-aligned totals stack
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:20px 24px;margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'
      + '<h4 style="font-size:12px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;margin:0;font-weight:700;">Products / Services</h4>'
      + '<button type="button" onclick="InvoicesPage.showForm(\'' + id + '\')" style="background:none;border:none;color:var(--text-light);cursor:pointer;font-size:13px;padding:4px 8px;display:inline-flex;align-items:center;gap:4px;" title="Edit line items">✏️</button>'
      + '</div>';
    if (inv.lineItems && inv.lineItems.length) {
      // Header row
      html += '<div style="display:grid;grid-template-columns:1.5fr 2fr 60px 90px 90px;gap:12px;padding-bottom:8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;font-weight:600;">'
        + '<div>Service</div><div>Description</div><div>Qty</div><div style="text-align:right;">Rate</div><div style="text-align:right;">Amount</div>'
        + '</div>';
      // Rows
      inv.lineItems.forEach(function(item) {
        var amt = item.amount || (item.qty||1) * item.rate;
        html += '<div style="display:grid;grid-template-columns:1.5fr 2fr 60px 90px 90px;gap:12px;padding:14px 0;border-bottom:1px solid var(--border);font-size:14px;align-items:start;">'
          + '<div style="font-weight:700;color:#1a3c12;">' + UI.esc(item.service || 'Custom') + '</div>'
          + '<div style="color:var(--text-light);line-height:1.5;">' + UI.esc(item.description || '') + '</div>'
          + '<div>' + (item.qty || 1) + '</div>'
          + '<div style="text-align:right;">' + UI.money(item.rate) + '</div>'
          + '<div style="text-align:right;font-weight:600;">' + UI.money(amt) + '</div>'
          + '</div>';
      });
      // Right-aligned totals stack
      var invSubDisplay = inv.subtotal || (inv.total - (inv.taxAmount || 0));
      html += '<div style="display:flex;justify-content:flex-end;margin-top:12px;">'
        + '<div style="min-width:280px;font-size:14px;">'
        + '<div style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-light);"><span>Subtotal</span><span>' + UI.money(invSubDisplay) + '</span></div>'
        + (inv.taxRate ? '<div style="display:flex;justify-content:space-between;padding:6px 0;color:var(--text-light);"><span>Tax (' + inv.taxRate + '%)</span><span>' + UI.money(inv.taxAmount || 0) + '</span></div>' : '')
        + '<div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid var(--border);margin-top:4px;font-weight:800;font-size:16px;color:#1a3c12;"><span>Total</span><span>' + UI.money(inv.total) + '</span></div>'
        + (inv.balance > 0 && inv.balance !== inv.total ? '<div style="display:flex;justify-content:space-between;padding:6px 0;color:#dc3545;font-weight:700;"><span>Balance</span><span>' + UI.money(inv.balance) + '</span></div>' : '')
        + '</div></div>';
    } else {
      html += '<div style="padding:20px;text-align:center;color:var(--text-light);font-size:13px;">No line items</div>';
    }
    html += '</div>';

    // Payment history
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:20px 24px;">'
      + '<h4 style="font-size:12px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;margin:0 0 12px;font-weight:700;">Payment History</h4>';
    if (typeof Payments !== 'undefined') { html += Payments.renderForInvoice(id, { hideHeader: true, hideRecordForm: true }); }
    else { html += '<div style="color:var(--text-light);font-size:13px;">No payments recorded</div>'; }
    html += '</div></div>';

    // Right sidebar — legacy system-style: Online payments + Notes + Status.
    // Payment recording is handled by the green "Collect Payment" button at the top.
    // Stripe link is configured once in Settings (base link), no per-invoice override needed.
    html += '<div>';

    // Online payments info (read-only — links to Settings to change)
    if (typeof Stripe !== 'undefined' && inv.status !== 'paid') {
      var hasBase = !!(Stripe.getBaseLink && Stripe.getBaseLink());
      var stripeOk = !!(Stripe.isConnected && Stripe.isConnected()) && hasBase;
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;">'
        + '<h4 style="font-size:12px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px;font-weight:700;">Online payments</h4>'
        + '<div style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:6px;">'
        +   '<span style="width:8px;height:8px;border-radius:50%;background:' + (stripeOk ? '#2e7d32' : '#9ca3af') + ';"></span>'
        +   '<span style="color:' + (stripeOk ? '#1a3c12' : 'var(--text-light)') + ';font-weight:600;">' + (stripeOk ? 'Card + ACH enabled' : (hasBase ? 'Stripe key missing' : 'Stripe not connected')) + '</span>'
        + '</div>'
        + (stripeOk && inv.balance > 0
            ? (function(){ var f = Stripe.calcFees(inv.balance || inv.total); return '<div style="font-size:11px;color:var(--text-light);margin-top:6px;line-height:1.6;">Card fee: $' + f.card.toFixed(2) + ' &middot; ACH fee: $' + f.ach.toFixed(2) + '</div>'; })()
            : '')
        + '<button type="button" onclick="loadPage(\'settings\')" style="margin-top:10px;background:none;border:none;color:var(--accent);font-size:12px;cursor:pointer;padding:0;text-decoration:underline;">Manage in Settings</button>'
        + '</div>';
    }

    // Notes (internal — not shown to client)
    var notesKey = 'bm-invoice-notes-' + id;
    var savedNotes = '';
    try { savedNotes = localStorage.getItem(notesKey) || ''; } catch(e) {}
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin:0 0 10px;">Internal Notes</h4>'
      + '<textarea id="inv-notes-' + id + '" placeholder="Notes only you see…" style="width:100%;min-height:90px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box;" onblur="try{localStorage.setItem(\'' + notesKey + '\',this.value);UI.toast(\'Notes saved\')}catch(e){}">' + UI.esc(savedNotes) + '</textarea>'
      + '</div>';

    // Status workflow
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin:0 0 10px;">Update Status</h4>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    var invStatusBtns = [['draft','Draft'],['sent','Sent'],['partial','Partial'],['paid','Paid'],['overdue','Overdue'],['cancelled','Cancelled']];
    invStatusBtns.forEach(function(sb) {
      var isActive = inv.status === sb[0];
      html += '<button onclick="InvoicesPage.setStatus(\'' + inv.id + '\',\'' + sb[0] + '\')" style="font-size:11px;padding:5px 12px;border-radius:6px;border:1px solid '
        + (isActive ? '#2e7d32' : 'var(--border)') + ';background:' + (isActive ? '#2e7d32' : 'var(--white)') + ';color:' + (isActive ? '#fff' : 'var(--text)') + ';cursor:pointer;font-weight:' + (isActive ? '700' : '500') + ';">'
        + sb[1] + '</button>';
    });
    html += '</div></div>';

    html += '</div></div>';

    document.getElementById('pageTitle').textContent = 'Invoice #' + inv.invoiceNumber;
    document.getElementById('pageContent').innerHTML = html;
    document.getElementById('pageAction').style.display = 'none';
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  },

  _archiveInvoice: function(id) {
    if (!confirm('Archive this invoice? You can restore it from the Archive page.')) return;
    DB.invoices.update(id, { status: 'archived' });
    UI.toast('Invoice archived');
    loadPage('invoices');
  },

  setStatus: function(id, status) {
    var updates = { status: status };
    if (status === 'paid') {
      updates.balance = 0;
      updates.paidDate = new Date().toISOString();
    }
    DB.invoices.update(id, updates);
    UI.toast('Invoice status: ' + status);
    UI.closeModal();
    // Auto-send receipt if enabled in Settings → Client-Facing Options
    if (status === 'paid' && localStorage.getItem('bm-auto-receipt') !== 'false') {
      InvoicesPage._sendReceiptEmail(id);
    }
    loadPage('invoices');
  },

  markPaid: function(id) {
    InvoicesPage.setStatus(id, 'paid');
  },

  // ── New Invoice Form ──
  showForm: function(invoiceId, clientId) {
    var inv = invoiceId ? DB.invoices.getById(invoiceId) : {};
    // Pre-fill client from parameter (e.g., from client detail page)
    if (!inv.clientId && clientId) {
      var prefillClient = DB.clients.getById(clientId);
      if (prefillClient) {
        inv.clientId = clientId;
        inv.clientName = prefillClient.name;
      }
    }
    var items = inv.lineItems || [{ description: '', qty: 1, rate: 0 }];
    var services = DB.services.getAll();

    var allClients = [];
    try { allClients = JSON.parse(localStorage.getItem('bm-clients') || '[]'); } catch(e) {}

    var today = new Date();
    var todayStr = today.toISOString().split('T')[0];
    // v430: default to "Due on receipt" (issue date = due date). Settings.bm-invoice-default-net-days
    // overrides if user explicitly set net 15 / 30 / etc.
    var netDays = parseInt(localStorage.getItem('bm-invoice-default-net-days') || '0', 10);
    if (isNaN(netDays) || netDays < 0) netDays = 0;
    var due = new Date(today);
    due.setDate(due.getDate() + netDays);
    var dueStr = due.toISOString().split('T')[0];

    var html = '<form id="inv-form" onsubmit="InvoicesPage.save(event, \'' + (invoiceId || '') + '\')">';

    // Client selector
    if (inv.clientId) {
      var client = DB.clients.getById(inv.clientId);
      html += '<input type="hidden" id="inv-clientId" value="' + inv.clientId + '">'
        + '<div class="form-group"><label>Client</label><div style="padding:8px 12px;background:var(--bg);border-radius:8px;font-weight:600;">' + UI.esc(inv.clientName || (client ? client.name : '')) + '</div></div>';
    } else {
      var clientOptions = allClients.map(function(c) { return { value: c.id, label: c.name + (c.address ? ' — ' + c.address : '') }; });
      html += UI.formField('Client *', 'select', 'inv-clientId', '', {
        options: [{ value: '', label: 'Select a client...' }].concat(clientOptions),
        onchange: 'InvoicesPage._autoFillFromClient()'
      });
    }

    html += UI.formField('Property Address', 'text', 'inv-property', inv.property || (inv.clientId && DB.clients.getById(inv.clientId) ? DB.clients.getById(inv.clientId).address : ''), { placeholder: 'Property address' });
    html += UI.formField('Subject', 'text', 'inv-subject', inv.subject || 'For Services Rendered', { placeholder: 'Invoice subject' });

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + UI.formField('Issue Date', 'date', 'inv-issueDate', inv.issuedDate ? inv.issuedDate.split('T')[0] : todayStr)
      + UI.formField('Due Date', 'date', 'inv-dueDate', inv.dueDate ? inv.dueDate.split('T')[0] : dueStr)
      + '</div>';

    // Line items
    html += '<div style="margin:16px 0 8px;font-weight:700;">Line Items</div>'
      + '<div id="inv-items">';
    items.forEach(function(item, i) {
      html += InvoicesPage._itemRow(i, item, services);
    });
    html += '</div>'
      + '<button type="button" class="btn btn-outline" style="margin-top:8px;" onclick="InvoicesPage.addItem()">+ Add Line Item</button>';

    // Total display with tax breakdown (legacy system style)
    var _invSubtotal = 0;
    (inv.lineItems || []).forEach(function(it) { _invSubtotal += (it.qty || 1) * (it.rate || 0); });
    var _invTaxRate = (inv.taxRate !== undefined ? inv.taxRate : (parseFloat(localStorage.getItem('bm-tax-rate')) || 8.375));
    var _invTaxAmt = Math.round(_invSubtotal * _invTaxRate / 100 * 100) / 100;
    var _invGrandTotal = _invSubtotal + _invTaxAmt;
    html += '<div style="margin-top:16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;overflow:hidden;">'
      + '<div style="padding:10px 16px;display:flex;justify-content:space-between;align-items:center;font-size:13px;border-bottom:1px solid var(--border);">'
      + '<span style="color:var(--text-light);">Subtotal</span><span id="inv-subtotal-display" style="font-weight:600;">' + UI.money(_invSubtotal) + '</span>'
      + '</div>'
      + '<div style="padding:10px 16px;display:flex;justify-content:space-between;align-items:center;font-size:13px;border-bottom:1px solid var(--border);">'
      +   '<span style="color:var(--text-light);display:inline-flex;align-items:center;gap:4px;">'
      +     '<span id="inv-tax-label">Tax (<span id="inv-tax-rate-display">' + _invTaxRate + '</span>%)</span>'
      +     '<a onclick="var e=document.getElementById(\'inv-tax-edit\');var l=document.getElementById(\'inv-tax-label\');e.style.display=\'inline-flex\';l.style.display=\'none\';e.querySelector(\'input\').focus();e.querySelector(\'input\').select();" style="font-size:11px;color:var(--accent);cursor:pointer;text-decoration:underline;">(edit)</a>'
      +     '<span id="inv-tax-edit" style="display:none;align-items:center;gap:4px;">'
      +       '<input type="number" id="inv-tax-rate" value="' + _invTaxRate + '" step="0.001" min="0" max="100" onblur="document.getElementById(\'inv-tax-rate-display\').textContent=this.value;document.getElementById(\'inv-tax-edit\').style.display=\'none\';document.getElementById(\'inv-tax-label\').style.display=\'inline\';" oninput="InvoicesPage.calcTotal()" style="width:58px;padding:4px 6px;border:1px solid var(--border);border-radius:4px;font-size:12px;text-align:right;">'
      +       '<span>%</span>'
      +     '</span>'
      +   '</span>'
      +   '<span id="inv-tax-display" style="font-weight:600;">' + UI.money(_invTaxAmt) + '</span>'
      + '</div>'
      + '<div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;background:var(--green-dark);color:var(--white);">'
      + '<span style="font-weight:600;">Total</span>'
      + '<span id="inv-total-display" style="font-size:1.5rem;font-weight:800;">' + UI.money(inv.total || _invGrandTotal) + '</span>'
      + '</div>'
      + '</div>';

    html += UI.formField('Internal Notes', 'textarea', 'inv-notes', inv.notes || '', { placeholder: 'Notes (not shown to client)' })
      + '</form>';

    // Render as full page (not modal)
    var pageHtml = '<div style="max-width:680px;margin:0 auto;padding-bottom:80px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">'
      + '<button type="button" class="btn btn-outline" onclick="loadPage(\'invoices\')" style="font-size:13px;">\u2190 Back to Invoices</button>'
      + '<div style="display:flex;gap:8px;">'
      + '<button type="button" class="btn btn-outline" onclick="InvoicesPage.saveAs(\'draft\')">Save Draft</button>'
      + '<button type="button" class="btn btn-primary" onclick="InvoicesPage.saveAs(\'sent\')">Save & Send</button>'
      + '</div></div>'
      + '<h2 style="font-size:20px;margin-bottom:16px;">' + (invoiceId ? 'Edit Invoice #' + inv.invoiceNumber : 'New Invoice') + '</h2>'
      + html
      + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;padding-top:16px;border-top:1px solid var(--border);">'
      + '<button type="button" class="btn btn-outline" onclick="loadPage(\'invoices\')">Cancel</button>'
      + '<button type="button" class="btn btn-outline" onclick="InvoicesPage.saveAs(\'draft\')">Save Draft</button>'
      + '<button type="button" class="btn btn-primary" onclick="InvoicesPage.saveAs(\'sent\')">Save & Send</button>'
      + '</div></div>';

    var content = document.getElementById('pageContent');
    if (content) content.innerHTML = pageHtml;
  },

  _itemRow: function(index, item, services) {
    var svcOptions = services.map(function(s) {
      return '<option value="' + s.name + '"' + (item.service === s.name ? ' selected' : '') + '>' + s.name + (s.type === 'product' ? ' (product)' : '') + '</option>';
    }).join('');

    var lineTotal = ((item.qty || 1) * (item.rate || 0));

    return '<div class="inv-item-row" style="display:grid;grid-template-columns:2fr 2fr 60px 90px 80px 36px;gap:8px;align-items:end;margin-bottom:8px;padding:10px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border);">'
      + '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Service</label><select class="inv-item-service" onchange="InvoicesPage._onServiceChange(this)" style="font-size:13px;"><option value="">— Select or type custom —</option>' + svcOptions + '</select></div>'
      + '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Description</label><input class="inv-item-desc" value="' + UI.esc(item.description || '') + '" placeholder="Work details..." style="font-size:13px;"></div>'
      + '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Qty</label><input type="number" class="inv-item-qty" value="' + (item.qty || 1) + '" min="1" oninput="InvoicesPage.calcTotal()" style="font-size:13px;text-align:center;"></div>'
      + '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Rate ($)</label><input type="number" class="inv-item-rate" value="' + (item.rate || '') + '" step="0.01" placeholder="0.00" oninput="InvoicesPage.calcTotal()" style="font-size:13px;"></div>'
      + '<div class="form-group" style="margin:0;"><label style="font-size:11px;font-weight:600;">Amount</label><div class="inv-item-amount" style="font-size:14px;font-weight:700;color:var(--green-dark);padding:8px 0;">' + UI.money(lineTotal) + '</div></div>'
      + '<button type="button" style="background:none;border:none;font-size:20px;color:var(--red);cursor:pointer;padding-bottom:8px;opacity:.6;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.6" onclick="this.parentElement.remove();InvoicesPage.calcTotal();">&#10005;</button>'
      + '</div>';
  },

  _onServiceChange: function(sel) {
    var row = sel.closest('.inv-item-row');
    var svc = sel.value;
    var services = DB.services.getAll();
    var match = null;
    for (var i = 0; i < services.length; i++) {
      if (services[i].name === svc) { match = services[i]; break; }
    }
    var descInput = row.querySelector('.inv-item-desc');
    if (match && match.description && !descInput.value) {
      descInput.value = match.description;
    }
    if (match && match.price) {
      row.querySelector('.inv-item-rate').value = match.price;
    }
    InvoicesPage.calcTotal();
  },

  addItem: function() {
    var container = document.getElementById('inv-items');
    var index = container.children.length;
    var services = DB.services.getAll();
    var div = document.createElement('div');
    div.innerHTML = InvoicesPage._itemRow(index, { description: '', qty: 1, rate: 0 }, services);
    container.appendChild(div.firstChild);
  },

  calcTotal: function() {
    var subtotal = 0;
    var rows = document.querySelectorAll('.inv-item-row');
    rows.forEach(function(row) {
      var qty = parseFloat(row.querySelector('.inv-item-qty').value) || 0;
      var rate = parseFloat(row.querySelector('.inv-item-rate').value) || 0;
      var amount = qty * rate;
      subtotal += amount;
      var amountEl = row.querySelector('.inv-item-amount');
      if (amountEl) amountEl.textContent = UI.money(amount);
    });
    var taxRateEl = document.getElementById('inv-tax-rate');
    var taxRate = taxRateEl ? (parseFloat(taxRateEl.value) || 0) : 0;
    var taxAmt = Math.round(subtotal * taxRate / 100 * 100) / 100;
    var total = subtotal + taxAmt;
    var subEl = document.getElementById('inv-subtotal-display');
    var taxEl = document.getElementById('inv-tax-display');
    var totEl = document.getElementById('inv-total-display');
    if (subEl) subEl.textContent = UI.money(subtotal);
    if (taxEl) taxEl.textContent = UI.money(taxAmt);
    if (totEl) totEl.textContent = UI.money(total);
  },

  saveAs: function(status) {
    var form = document.getElementById('inv-form');
    if (!form) return;
    form.dataset.saveStatus = status;
    form.requestSubmit();
  },

  // v430: auto-fill property from client.address when client picker changes
  _autoFillFromClient: function() {
    var sel = document.getElementById('inv-clientId');
    var prop = document.getElementById('inv-property');
    if (!sel || !prop) return;
    var c = DB.clients.getById(sel.value);
    if (!c) return;
    if (!prop.value || prop.value.trim() === '') prop.value = c.address || '';
  },

  save: function(e, invoiceId) {
    e.preventDefault();
    try { return InvoicesPage._saveImpl(e, invoiceId); }
    catch(err) {
      console.error('[InvoicesPage.save] ERROR:', err);
      InvoicesPage._saving = false;
      var f = e.target || document.getElementById('inv-form');
      if (f) f.querySelectorAll('button').forEach(function(b) { b.disabled = false; b.style.opacity = ''; b.style.cursor = ''; });
      UI.toast('Save failed: ' + (err && err.message ? err.message : err), 'error');
    }
  },

  _saveImpl: function(e, invoiceId) {
    // Guard against double-submit (don't disable on validation-only failures)
    if (InvoicesPage._saving) return;
    var form = e.target || document.getElementById('inv-form');
    var _disableButtons = function() {
      InvoicesPage._saving = true;
      if (form) form.querySelectorAll('button[type=submit], button[onclick*="requestSubmit"]').forEach(function(b) {
        b.disabled = true; b.style.opacity = '0.5'; b.style.cursor = 'wait';
      });
    };
    var _unsave = function() {
      InvoicesPage._saving = false;
      if (form) form.querySelectorAll('button').forEach(function(b) {
        b.disabled = false; b.style.opacity = ''; b.style.cursor = '';
      });
    };
    var clientIdEl = document.getElementById('inv-clientId');
    var clientId = clientIdEl ? clientIdEl.value : '';
    if (!clientId) {
      UI.toast('Client required — pick or create one before saving', 'error');
      var clientArea = document.getElementById('inv-client-search') || document.getElementById('inv-client-block') || clientIdEl;
      if (clientArea && clientArea.scrollIntoView) clientArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (clientArea) {
        var orig = clientArea.style.boxShadow;
        clientArea.style.boxShadow = '0 0 0 3px #dc3545';
        clientArea.style.transition = 'box-shadow .3s';
        setTimeout(function() { if (document.contains(clientArea)) clientArea.style.boxShadow = orig || ''; }, 2500);
      }
      // Don't disable buttons — user needs to retry after picking client
      return;
    }
    var client = DB.clients.getById(clientId);
    if (!client) {
      UI.toast('Selected client no longer exists — pick another', 'error');
      return;
    }

    // Passed validation — NOW disable the buttons to prevent double-submit
    _disableButtons();

    var items = [];
    var subtotal = 0;
    document.querySelectorAll('.inv-item-row').forEach(function(row) {
      var service = row.querySelector('.inv-item-service').value;
      var desc = row.querySelector('.inv-item-desc').value;
      var qty = parseFloat(row.querySelector('.inv-item-qty').value) || 0;
      var rate = parseFloat(row.querySelector('.inv-item-rate').value) || 0;
      if (service || desc || rate) {
        items.push({ service: service, description: desc, qty: qty, rate: rate, amount: qty * rate });
        subtotal += qty * rate;
      }
    });
    var invTaxRateEl = document.getElementById('inv-tax-rate');
    var taxRate = invTaxRateEl ? (parseFloat(invTaxRateEl.value) || 0) : (parseFloat(localStorage.getItem('bm-tax-rate')) || 8.375);
    var taxAmount = Math.round(subtotal * taxRate / 100 * 100) / 100;
    var total = subtotal + taxAmount;

    // form already declared at top
    var status = (form && form.dataset.saveStatus) ? form.dataset.saveStatus : 'draft';

    // Preserve jobId/quoteId/property from existing invoice (don't lose on edit)
    var existingInv = invoiceId ? DB.invoices.getById(invoiceId) : {};
    var data = {
      clientId: clientId,
      clientName: client ? client.name : '',
      clientPhone: client ? client.phone : '',
      clientEmail: client ? client.email : '',
      property: (document.getElementById('inv-property') || {}).value || existingInv.property || (client ? client.address : '') || '',
      subject: document.getElementById('inv-subject').value.trim(),
      issuedDate: document.getElementById('inv-issueDate').value,
      dueDate: document.getElementById('inv-dueDate').value,
      lineItems: items,
      subtotal: subtotal,
      taxRate: taxRate,
      taxAmount: taxAmount,
      total: total,
      balance: total,
      notes: document.getElementById('inv-notes').value.trim(),
      jobId: existingInv.jobId || null,
      quoteId: existingInv.quoteId || null,
      status: status
    };

    var savedId;
    if (invoiceId) {
      DB.invoices.update(invoiceId, data);
      savedId = invoiceId;
      UI.toast('Invoice updated');
    } else {
      var newInv = DB.invoices.create(data);
      savedId = newInv && newInv.id;
      UI.toast('Invoice created');
    }

    _unsave();
    if (document.querySelector('.modal-overlay')) UI.closeModal();

    // If user hit "Save & Send" → open the send-chooser modal (preview + delivery options)
    if (status === 'sent' && savedId) {
      setTimeout(function() { InvoicesPage._showSendChooser(savedId); }, 100);
      return;
    }

    loadPage('invoices');
  }
};
