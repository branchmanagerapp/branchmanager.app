/**
 * Branch Manager — Jobs Page
 */
var JobsPage = {
  _page: 0, _perPage: 50, _search: '', _filter: 'all', _sortCol: 'jobNumber', _sortDir: 'desc',
  _activeTab: 'jobs',

  // v735: right-click context menu on job rows
  _rowContextMenu: function(event, jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j) return;
    var items = [
      { label: '👁  Open job',         fn: function() { JobsPage.showDetail(jobId); } },
      { label: '✏️  Edit',              fn: function() { JobsPage.showForm(jobId); } }
    ];
    if (j.status !== 'completed') {
      items.push({ label: '✓  Mark complete', fn: function() {
        DB.jobs.update(jobId, { status: 'completed', completedAt: new Date().toISOString() });
        UI.toast('Job #' + (j.jobNumber || '') + ' marked complete');
        loadPage('jobs');
      }});
    }
    if (j.status === 'completed' && !j.invoiceId) {
      items.push({ label: '+  Create invoice', fn: function() {
        if (typeof Workflow !== 'undefined' && Workflow.jobToInvoice) Workflow.jobToInvoice(jobId);
      }});
    }
    if (j.clientId) {
      items.push('-');
      items.push({ label: '👤  Open client', fn: function() { ClientsPage.showDetail(j.clientId); } });
    }
    items.push('-');
    items.push({ label: '🗑  Delete', danger: true, fn: function() {
      UI.confirm('Delete job #' + (j.jobNumber || '') + '?', function() {
        DB.jobs.remove(jobId);
        UI.toast('Job deleted');
        loadPage('jobs');
      });
    }});
    UI.contextMenu(event, items);
  },

  switchTab: function(tab) {
    JobsPage._activeTab = tab;
    loadPage('jobs');
  },

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
    var self = JobsPage;
    if (self._pendingDetail) {
      var _pid = self._pendingDetail;
      self._pendingDetail = null;
      setTimeout(function() { JobsPage.showDetail(_pid); }, 50);
    }
    var activeTab = self._activeTab || 'jobs';
    // (Pre-trip inspection moved to its own Pre-Trip sidebar page in v287)

    // Tab bar
    var html = '<div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:16px;">'
      + '<button onclick="JobsPage.switchTab(\'jobs\')" style="padding:10px 20px;font-size:14px;font-weight:' + (activeTab==='jobs'?'700':'500') + ';border:none;background:none;cursor:pointer;color:' + (activeTab==='jobs'?'var(--accent)':'var(--text-light)') + ';border-bottom:2px solid ' + (activeTab==='jobs'?'var(--accent)':'transparent') + ';margin-bottom:-2px;">Jobs</button>'
      + '<button onclick="JobsPage.switchTab(\'visits\')" style="padding:10px 20px;font-size:14px;font-weight:' + (activeTab==='visits'?'700':'500') + ';border:none;background:none;cursor:pointer;color:' + (activeTab==='visits'?'var(--accent)':'var(--text-light)') + ';border-bottom:2px solid ' + (activeTab==='visits'?'var(--accent)':'transparent') + ';margin-bottom:-2px;">Visits</button>'
      + '</div>';

    if (activeTab === 'visits') {
      return html + Visits.render();
    }

    var all = DB.jobs.getAll();
    var late = all.filter(function(j) { return j.status === 'late'; }).length;
    var scheduled = all.filter(function(j) { return j.status === 'scheduled'; }).length;
    var inProgress = all.filter(function(j) { return j.status === 'in_progress'; }).length;
    var completed = all.filter(function(j) { return j.status === 'completed'; }).length;

    // previous system-style stat cards row
    var activeJobs = all.filter(function(j) { return j.status === 'in_progress' || j.status === 'scheduled'; });
    var cutoff60 = new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0];
    var cutoff7 = new Date(Date.now() - 7 * 86400000).toISOString();
    // Recent = jobs with scheduledDate in last 60 days (excludes old previous system imports)
    var recentNeedsInvoicing = all.filter(function(j) {
      return j.status === 'completed' && !j.invoiceId
        && ((j.scheduledDate && j.scheduledDate >= cutoff60)
        || (!j.scheduledDate && (j.createdAt || '') > cutoff7));
    });
    var legacyNeedsInvoicing = all.filter(function(j) {
      return j.status === 'completed' && !j.invoiceId
        && !(j.scheduledDate && j.scheduledDate >= cutoff60)
        && !(!j.scheduledDate && (j.createdAt || '') > cutoff7);
    });
    var needsInvoicing = recentNeedsInvoicing; // used for Overview stat
    var actionReq = all.filter(function(j) { return j.status === 'action_required'; });
    var unscheduled = all.filter(function(j) { return !j.scheduledDate; });
    var recentVisits = all.filter(function(j) { var d = new Date(j.scheduledDate); var ago = new Date(); ago.setDate(ago.getDate()-30); return d >= ago && d <= new Date(); });
    var upcomingVisits = all.filter(function(j) { var d = new Date(j.scheduledDate); var ahead = new Date(); ahead.setDate(ahead.getDate()+30); return d > new Date() && d <= ahead; });
    var activeTotal = activeJobs.reduce(function(s,j){return s+(j.total||0);},0);
    var upcomingTotal = upcomingVisits.reduce(function(s,j){return s+(j.total||0);},0);

    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px;background:var(--white);" class="stat-row">'
      // Overview — each row filters to its category
      + '<div style="padding:14px 16px;border-right:1px solid var(--border);">'
      + '<div style="font-size:14px;font-weight:700;margin-bottom:8px;cursor:pointer;" onclick="JobsPage._setFilter(\'all\')">Overview</div>'
      + '<div style="font-size:12px;padding:2px 0;cursor:pointer;" onclick="JobsPage._setFilter(\'ending_soon\')"><span style="color:#e6a817;">●</span> Ending within 30 days (' + upcomingVisits.length + ')</div>'
      + '<div style="font-size:12px;padding:2px 0;cursor:pointer;" onclick="JobsPage._setFilter(\'late\')"><span style="color:#dc3545;">●</span> Late (' + late + ')</div>'
      + '<div style="font-size:12px;padding:2px 0;cursor:pointer;" onclick="JobsPage._setFilter(\'requires_invoicing\')"><span style="color:#e6a817;">●</span> Requires Invoicing (' + needsInvoicing.length + ')</div>'
      + '<div style="font-size:12px;padding:2px 0;cursor:pointer;" onclick="JobsPage._setFilter(\'action_required\')"><span style="color:#fd7e14;">●</span> Action Required (' + actionReq.length + ')</div>'
      + '<div style="font-size:12px;padding:2px 0;cursor:pointer;" onclick="JobsPage._setFilter(\'unscheduled\')"><span style="color:#6c757d;">●</span> Unscheduled (' + unscheduled.length + ')</div>'
      + '</div>'
      // Recent visits
      + '<div style="padding:14px 16px;border-right:1px solid var(--border);">'
      + '<div style="font-size:14px;font-weight:700;">Recent visits</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Past 30 days</div>'
      + '<div style="font-size:28px;font-weight:700;margin-top:4px;">' + recentVisits.length + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">' + UI.moneyInt(activeTotal) + '</div>'
      + '</div>'
      // Visits scheduled
      + '<div style="padding:14px 16px;border-right:1px solid var(--border);">'
      + '<div style="font-size:14px;font-weight:700;">Visits scheduled</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Next 30 days</div>'
      + '<div style="font-size:28px;font-weight:700;margin-top:4px;">' + upcomingVisits.length + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">' + UI.moneyInt(upcomingTotal) + '</div>'
      + '</div>'
      // 4th card
      + '<div style="padding:14px 16px;">'
      + '<div style="font-size:14px;font-weight:700;">Total jobs</div>'
      + '<div style="font-size:28px;font-weight:700;margin-top:12px;">' + all.length + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">All time</div>'
      + '</div>'
      + '</div>';

    // Batch invoice banner — recent jobs only (actionable)
    if (recentNeedsInvoicing.length > 0) {
      var needsTotal = recentNeedsInvoicing.reduce(function(s, j) { return s + (j.total || 0); }, 0);
      html += '<div id="batch-invoice-banner" style="background:linear-gradient(135deg,#2e7d32,#43a047);color:#fff;padding:14px 20px;border-radius:10px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;box-shadow:0 2px 8px rgba(46,125,50,.3);">'
        + '<div style="display:flex;align-items:center;gap:10px;">'
        + '<span style="font-size:22px;">💰</span>'
        + '<div><div style="font-size:14px;font-weight:600;">' + recentNeedsInvoicing.length + ' recent completed job' + (recentNeedsInvoicing.length !== 1 ? 's' : '') + ' need invoicing &mdash; ' + UI.money(needsTotal) + '</div>'
        + '<div style="font-size:12px;opacity:.85;margin-top:2px;">Jobs completed in the last 60 days without an invoice.</div></div>'
        + '</div>'
        + '<button onclick="JobsPage._batchInvoiceAll()" style="background:#fff;color:#2e7d32;border:none;padding:8px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.15);">Create Invoices</button>'
        + '</div>';
    }
    // (Legacy previous system jobs banner removed — was cluttering the page)

    var filtered = self._getFiltered();
    var page = self._showAll ? filtered : filtered.slice(self._page * self._perPage, (self._page + 1) * self._perPage);

    // previous system-style header + filter chips + search
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">'
      + '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">'
      + '<h3 style="font-size:16px;font-weight:700;margin:0;">All jobs</h3>'
      + '<span style="font-size:13px;color:var(--text-light);">(' + filtered.length + ' results)</span>'
      + (function() {
        var chips = [['all','All'],['ending_soon','Ending within 30 days'],['late','Late'],['requires_invoicing','Requires Invoicing'],['action_required','Action Required'],['unscheduled','Unscheduled']];
        var out = '';
        for (var ci = 0; ci < chips.length; ci++) {
          var val = chips[ci][0], label = chips[ci][1];
          var isActive = self._filter === val;
          out += '<button onclick="JobsPage._setFilter(\'' + val + '\')" style="font-size:12px;padding:5px 14px;border-radius:20px;border:1px solid ' + (isActive ? '#2e7d32' : 'var(--border)') + ';background:' + (isActive ? '#2e7d32' : 'var(--white)') + ';color:' + (isActive ? '#fff' : 'var(--text)') + ';cursor:pointer;font-weight:' + (isActive ? '600' : '500') + ';">' + label + '</button>';
        }
        return out;
      })()
      + '</div>'
      + '<div class="search-box" style="min-width:200px;max-width:280px;">'
      + '<span style="color:var(--text-light);">🔍</span>'
      + '<input type="text" placeholder="Search jobs..." value="' + UI.esc(self._search) + '" oninput="JobsPage._search=this.value;JobsPage._page=0;loadPage(\'jobs\')">'
      + '</div></div>';

    // Bulk close-out banner for "unscheduled" filter — legacy system-imported jobs
    // often have status='scheduled' but no scheduledDate (effectively orphaned)
    if (self._filter === 'unscheduled' && filtered.length > 0) {
      html += '<div style="background:#fff3e0;border:1px solid #ffcc80;border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">'
        + '<div style="font-size:13px;color:#e65100;">'
        +   '<strong>' + filtered.length + ' orphaned jobs</strong> — no scheduled date set. If these are old/finished, close them all out in one tap.'
        + '</div>'
        + '<button class="btn btn-primary" style="font-size:12px;background:#e65100;border:none;" onclick="JobsPage._bulkCloseUnscheduled()">Mark all ' + filtered.length + ' as completed</button>'
        + '</div>';
    }

    // Floating batch action bar (fixed to bottom)
    html += '<div id="job-bulk-bar" style="display:none;position:fixed;bottom:0;left:var(--sidebar-w,0);right:0;z-index:500;background:#1a1a2e;color:#fff;padding:12px 24px;padding-bottom:max(12px,env(safe-area-inset-bottom));align-items:center;justify-content:space-between;box-shadow:0 -4px 20px rgba(0,0,0,.3);animation:batchSlideUp .25s ease-out;">'
      + '<span id="job-bulk-count" style="font-weight:700;font-size:14px;">0 selected</span>'
      + '<div style="display:flex;gap:8px;align-items:center;">'
      + '<button onclick="JobsPage._batchComplete()" style="background:#2e7d32;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">✓ Complete</button>'
      + '<button onclick="JobsPage._batchAssignCrew()" style="background:#2e7d32;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">👷 Crew</button>'
      + '<button onclick="JobsPage._batchReschedule()" style="background:#455a64;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">📅 Reschedule</button>'
      + '<button onclick="JobsPage._batchUnschedule()" style="background:#e65100;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Unschedule</button>'
      + '<button onclick="JobsPage._batchExport()" style="background:#455a64;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">📥 Export</button>'
      + '<button onclick="JobsPage._batchDelete()" style="background:#c62828;color:#fff;border:none;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">🗑 Delete</button>'
      + '<button onclick="JobsPage._selectAll(false)" style="background:none;color:rgba(255,255,255,.7);border:none;padding:8px 12px;font-size:16px;cursor:pointer;">&#10005;</button>'
      + '</div></div>'
      + '<style>@keyframes batchSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}</style>';

    // ── DESKTOP table ──
    html += '<div class="q-desktop-only" style="background:var(--white);border-radius:12px;border:1px solid var(--border);overflow:hidden;">'
      + '<table class="data-table"><thead><tr>'
      + '<th style="width:32px;"><input type="checkbox" onchange="JobsPage._selectAll(this.checked)" title="Select all"></th>'
      + self._sortTh('Client', 'clientName') + self._sortTh('Job number', 'jobNumber') + '<th>Property</th>' + self._sortTh('Schedule', 'scheduledDate') + self._sortTh('Status', 'status') + self._sortTh('Total', 'total', 'text-align:right;')
      + '</tr></thead><tbody>';

    if (page.length === 0) {
      html += '<tr><td colspan="9">' + (self._search ? '<div style="text-align:center;padding:24px;color:var(--text-light);">No jobs match "' + self._search + '"</div>' : UI.emptyState('🔧', 'No jobs yet', 'Create a job from an approved quote.', '+ New Job', 'JobsPage.showForm()')) + '</td></tr>';
    } else {
      page.forEach(function(j) {
        html += '<tr style="cursor:pointer;" onclick="JobsPage.showDetail(\'' + j.id + '\')" oncontextmenu="JobsPage._rowContextMenu(event,\'' + j.id + '\')">'
          + '<td onclick="event.stopPropagation()"><input type="checkbox" class="job-check" value="' + j.id + '" onchange="JobsPage._updateBulk()" style="width:16px;height:16px;"></td>'
          + '<td><strong>' + UI.esc(j.clientName || '—') + '</strong></td>'
          + '<td>#' + (j.jobNumber || '') + '</td>'
          + '<td style="font-size:13px;color:var(--text-light);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + UI.esc(j.property || j.description || '') + '">' + UI.esc(j.property || j.description || '—') + '</td>'
          + '<td style="white-space:nowrap;">' + UI.dateShort(j.scheduledDate || j.completedAt || j.createdAt) + '</td>'
          + '<td>' + UI.statusBadge(j.status) + '</td>'
          + '<td style="text-align:right;font-weight:600;">' + UI.money(j.total)
          + (j.satisfaction && j.satisfaction.rating ? '<div style="font-size:10px;color:#ffc107;margin-top:2px;">' + Array(j.satisfaction.rating + 1).join('⭐') + '</div>' : '')
          + '</td>'
          + '</tr>';
      });
    }
    html += '</tbody></table></div>';

    // ── MOBILE card layout ──
    if (page.length > 0) {
      html += '<div class="q-mobile-only" style="display:none;">';
      page.forEach(function(j) {
        var relSched = j.scheduledDate ? UI.dateShort(j.scheduledDate)
                      : j.completedAt ? UI.dateShort(j.completedAt)
                      : j.createdAt ? UI.dateShort(j.createdAt)
                      : 'Unscheduled';
        html += '<div data-jid="' + j.id + '" class="job-card" style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:8px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.04);-webkit-tap-highlight-color:transparent;">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">'
          +   '<div onclick="event.stopPropagation()" style="flex-shrink:0;padding-top:2px;"><input type="checkbox" class="job-check" value="' + j.id + '" onchange="JobsPage._updateBulk()" style="width:18px;height:18px;"></div>'
          +   '<div style="flex:1;min-width:0;">'
          +     '<div style="font-size:15px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(j.clientName || '—') + '</div>'
          +     (j.property ? '<div style="font-size:12px;color:var(--text-light);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📍 ' + UI.esc(j.property) + '</div>' : '')
          +   '</div>'
          +   '<div style="font-size:17px;font-weight:800;color:var(--text);flex-shrink:0;">' + UI.money(j.total) + '</div>'
          + '</div>'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:8px;flex-wrap:wrap;">'
          +   '<div>' + UI.statusBadge(j.status) + '</div>'
          +   '<div style="font-size:11px;color:var(--text-light);">'
          +     relSched + ' · #' + (j.jobNumber || '')
          +   '</div>'
          + '</div>'
          + '</div>';
      });
      html += '</div>';

      // Mobile card tap handlers (scroll-safe)
      setTimeout(function() {
        document.querySelectorAll('.job-card').forEach(function(card) {
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
            var jid = this.getAttribute('data-jid');
            if (jid) JobsPage.showDetail(jid);
          });
        });
      }, 0);
    }

    // Pagination (hidden when Show All is active)
    var totalPages = Math.ceil(filtered.length / self._perPage);
    if (totalPages > 1 || self._showAll) {
      html += '<div style="display:flex;justify-content:center;align-items:center;gap:4px;margin-top:12px;flex-wrap:wrap;">';
      if (!self._showAll) {
        html += '<button class="btn btn-outline" onclick="JobsPage._goPage(' + (self._page - 1) + ')" style="font-size:12px;padding:5px 10px;"' + (self._page === 0 ? ' disabled' : '') + '>‹</button>';
        for (var p = Math.max(0, self._page - 2); p <= Math.min(totalPages - 1, self._page + 2); p++) {
          html += '<button class="btn ' + (p === self._page ? 'btn-primary' : 'btn-outline') + '" onclick="JobsPage._goPage(' + p + ')" style="font-size:12px;padding:5px 10px;min-width:32px;">' + (p + 1) + '</button>';
        }
        html += '<button class="btn btn-outline" onclick="JobsPage._goPage(' + (self._page + 1) + ')" style="font-size:12px;padding:5px 10px;"' + (self._page >= totalPages - 1 ? ' disabled' : '') + '>›</button>';
      }
      html += '<button class="btn btn-outline" onclick="JobsPage._toggleShowAll()" style="font-size:12px;padding:5px 12px;margin-left:8px;">'
        + (self._showAll ? 'Paginate (' + self._perPage + '/page)' : 'Show all ' + filtered.length)
        + '</button>';
      html += '</div>';
    }
    return html;
  },

  _getFiltered: function() {
    var self = JobsPage;
    var all = DB.jobs.getAll();
    // Hide archived from default list view
    all = all.filter(function(j) { return j.status !== 'archived'; });
    if (self._filter === 'requires_invoicing') {
      var cutoff60 = new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0];
      var cutoff7 = new Date(Date.now() - 7 * 86400000).toISOString();
      all = all.filter(function(j) {
        return j.status === 'completed' && !j.invoiceId
          && ((j.scheduledDate && j.scheduledDate >= cutoff60)
          || (!j.scheduledDate && (j.createdAt || '') > cutoff7));
      });
    } else if (self._filter === 'ending_soon') {
      var now = new Date(); var end30 = new Date(Date.now() + 30 * 86400000);
      all = all.filter(function(j) { var d = j.scheduledDate ? new Date(j.scheduledDate) : null; return d && d > now && d <= end30 && j.status !== 'completed' && j.status !== 'cancelled'; });
    } else if (self._filter === 'unscheduled') {
      all = all.filter(function(j) { return !j.scheduledDate && j.status !== 'completed' && j.status !== 'cancelled'; });
    } else if (self._filter !== 'all') {
      all = all.filter(function(j) { return j.status === self._filter; });
    }
    if (self._search && self._search.length >= 2) {
      var s = self._search.toLowerCase();
      all = all.filter(function(j) { return (j.clientName||'').toLowerCase().indexOf(s) >= 0 || (j.description||'').toLowerCase().indexOf(s) >= 0 || (j.property||'').toLowerCase().indexOf(s) >= 0 || String(j.jobNumber).indexOf(s) >= 0; });
    }
    var col = self._sortCol;
    var dir = self._sortDir === 'asc' ? 1 : -1;
    all.sort(function(a, b) {
      var va = a[col], vb = b[col];
      if (col === 'jobNumber' || col === 'total') return ((va || 0) - (vb || 0)) * dir;
      if (col === 'scheduledDate') return ((new Date(va || 0)).getTime() - (new Date(vb || 0)).getTime()) * dir;
      va = (va || '').toString().toLowerCase(); vb = (vb || '').toString().toLowerCase();
      return va < vb ? -1 * dir : va > vb ? 1 * dir : 0;
    });
    return all;
  },
  _sortTh: function(label, col, extraStyle) {
    var self = JobsPage;
    var arrow = self._sortCol === col ? (self._sortDir === 'asc' ? ' &#9650;' : ' &#9660;') : '';
    return '<th onclick="JobsPage._setSort(\'' + col + '\')" style="cursor:pointer;user-select:none;' + (extraStyle || '') + '"' + (self._sortCol === col ? ' class="sort-active"' : '') + '>' + label + arrow + '</th>';
  },
  _setSort: function(col) {
    if (JobsPage._sortCol === col) { JobsPage._sortDir = JobsPage._sortDir === 'asc' ? 'desc' : 'asc'; }
    else { JobsPage._sortCol = col; JobsPage._sortDir = 'asc'; }
    JobsPage._page = 0; loadPage('jobs');
  },
  _setFilter: function(f) { JobsPage._filter = f; JobsPage._page = 0; loadPage('jobs'); },

  _bulkCloseUnscheduled: function() {
    var all = DB.jobs.getAll().filter(function(j) { return !j.scheduledDate && j.status !== 'completed' && j.status !== 'cancelled'; });
    if (!all.length) { UI.toast('Nothing to close', 'error'); return; }
    if (!confirm('Mark ' + all.length + ' orphaned jobs as completed?\n\nThis cannot be undone individually (but you can reopen each job.)')) return;
    var draftedCount = 0;
    all.forEach(function(j) {
      var r = (typeof Workflow !== 'undefined' && Workflow.completeAndDraft)
        ? Workflow.completeAndDraft(j.id, { silent: true })
        : { invoice: null };
      if (r.invoice) draftedCount++;
    });
    var msg = '✓ ' + all.length + ' jobs marked completed';
    if (draftedCount > 0) msg += ' · ' + draftedCount + ' invoice draft' + (draftedCount > 1 ? 's' : '') + ' created';
    UI.toast(msg);
    loadPage('jobs');
  },
  _goPage: function(p) { var t = Math.ceil(JobsPage._getFiltered().length / JobsPage._perPage); JobsPage._page = Math.max(0, Math.min(p, t - 1)); loadPage('jobs'); },
  _toggleShowAll: function() { JobsPage._showAll = !JobsPage._showAll; JobsPage._page = 0; loadPage('jobs'); },

  // Batch actions
  _selectAll: function(checked) {
    document.querySelectorAll('.job-check').forEach(function(cb) { cb.checked = checked; });
    var headerCheck = document.querySelector('th input[type="checkbox"]');
    if (headerCheck) headerCheck.checked = checked;
    JobsPage._updateBulk();
  },
  _updateBulk: function() {
    var selected = document.querySelectorAll('.job-check:checked');
    var bar = document.getElementById('job-bulk-bar');
    var count = document.getElementById('job-bulk-count');
    if (bar) bar.style.display = selected.length > 0 ? 'flex' : 'none';
    if (count) count.textContent = selected.length + ' selected';
  },
  _textCrew: function(id) {
    var j = DB.jobs.getById(id);
    if (!j || !j.crew || !j.crew.length) return;

    // Look up crew phone numbers from team_members
    var team = JSON.parse(localStorage.getItem('bm-team') || '[]');
    var phones = [];
    j.crew.forEach(function(name) {
      var member = team.find(function(t) { return t.name === name; });
      if (member && member.phone) phones.push(member.phone.replace(/\D/g, ''));
    });

    // Build the message with job details + clickable address
    var addr = j.property || '';
    var mapLink = addr ? 'https://maps.apple.com/?daddr=' + encodeURIComponent(addr) : '';
    var jobLink = 'https://branchmanager.app/#jobs';

    var msg = 'Job #' + (j.jobNumber || '') + ' — ' + (j.clientName || '') + '\n'
      + (j.description ? j.description + '\n' : '')
      + (addr ? '\n📍 ' + addr + '\n' + mapLink + '\n' : '')
      + '\nOpen in Branch Manager: ' + jobLink;

    if (phones.length > 0) {
      // Multi-recipient SMS
      window.open('sms:' + phones.join(',') + '?&body=' + encodeURIComponent(msg));
    } else {
      // No phone numbers found — show the message to copy
      UI.showModal('Text Crew', '<div style="padding:4px;">'
        + '<p style="font-size:13px;color:var(--text-light);margin-bottom:12px;">No phone numbers found for crew. Copy this message and send manually:</p>'
        + '<textarea id="crew-msg" rows="8" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;">' + UI.esc(msg) + '</textarea>'
        + '<div style="display:flex;gap:8px;margin-top:8px;">'
        + '<strong>Crew:</strong> ' + j.crew.join(', ')
        + '</div></div>', {
        footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
          + ' <button class="btn btn-primary" onclick="navigator.clipboard.writeText(document.getElementById(\'crew-msg\').value);UI.toast(\'Copied!\')">Copy Message</button>'
      });
    }
  },

  // v751: "ETA to Client" — sends a heads-up SMS to the customer with
  // crew ETA + tracking link. Common request because clients want to
  // know when the crew is actually rolling. Routes through Dialpad if
  // available (logs to communications + threads in Messaging) and
  // falls back to a native sms: link otherwise.
  // v768: Per-job profitability card — labor + materials + expenses
  // vs revenue. Shows on every job detail. Reuses
  // JobCosting.getJobStats so the math stays consistent with the
  // Reports → Job Costing tab.
  // v774: scan the job's line items for material rows whose unit cost has
  // risen materially since the quote was sent. Uses v771 Materials price
  // history. Returns an array of { name, oldRate, newRate, deltaPct } —
  // empty when nothing's drifted enough to care about.
  _materialPriceDrift: function(j) {
    if (!Array.isArray(j.lineItems) || !j.lineItems.length) return [];
    if (typeof Materials === 'undefined' || !Materials._getCatalog || !Materials._getPriceHistory) return [];
    // Use the job's createdAt as the reference timestamp (when it was quoted)
    var ref = j.createdAt ? new Date(j.createdAt).getTime() : null;
    if (!ref) return [];
    var catalog = Materials._getCatalog();
    var byName = {};
    catalog.forEach(function(m) { byName[(m.name || '').toLowerCase()] = m; });
    var drifts = [];
    j.lineItems.forEach(function(li) {
      if (!li || (li.kind !== 'material' && li.type !== 'material')) return;
      var label = (li.service || li.description || '').toLowerCase();
      if (!label) return;
      // Match catalog entry by name substring (some line items append units)
      var mat = byName[label] || Object.values(byName).find(function(m) {
        var n = (m.name || '').toLowerCase();
        return n && (label.indexOf(n) >= 0 || n.indexOf(label) >= 0);
      });
      if (!mat) return;
      // Find the price at-or-before the job's createdAt
      var hist = Materials._getPriceHistory(mat.id);
      if (!hist || hist.length < 1) return;
      var thenPrice = null;
      for (var i = 0; i < hist.length; i++) {
        var ts = new Date(hist[i].changedAt).getTime();
        if (ts <= ref) thenPrice = hist[i].to;
        else break;
      }
      if (thenPrice == null) thenPrice = hist[0].to; // job pre-dates history; use earliest
      var nowPrice = Number(mat.unitCost) || 0;
      if (thenPrice <= 0 || nowPrice <= 0) return;
      var deltaPct = Math.round(((nowPrice - thenPrice) / thenPrice) * 1000) / 10;
      if (deltaPct >= 10) {
        drifts.push({
          name: mat.name,
          oldRate: thenPrice,
          newRate: nowPrice,
          deltaPct: deltaPct,
          qty: Number(li.qty) || 1
        });
      }
    });
    return drifts;
  },

  _renderMarginErosionAlert: function(j) {
    // Only show on open jobs — once invoiced, the price is locked.
    if (!j || j.status === 'invoiced' || j.status === 'cancelled') return '';
    var drifts = JobsPage._materialPriceDrift(j);
    if (!drifts.length) return '';
    var maxDelta = drifts.reduce(function(m, d){ return d.deltaPct > m ? d.deltaPct : m; }, 0);
    var costImpact = drifts.reduce(function(s, d){ return s + (d.newRate - d.oldRate) * d.qty; }, 0);
    var rows = drifts.map(function(d) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:12px;color:#92400e;">'
        + '<span><b>' + UI.esc(d.name) + '</b> (' + d.qty + ')</span>'
        + '<span><span style="color:var(--text-light);">' + UI.money(d.oldRate) + '</span> → <b>' + UI.money(d.newRate) + '</b> <span style="background:#c2410c15;color:#c2410c;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700;margin-left:4px;">↑ +' + d.deltaPct + '%</span></span>'
        + '</div>';
    }).join('');
    return '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;margin-bottom:14px;">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;">'
      +   '<div style="font-size:20px;">⚠</div>'
      +   '<div style="flex:1;min-width:200px;">'
      +     '<div style="font-size:13px;font-weight:700;color:#92400e;">Material costs have risen since this job was quoted</div>'
      +     '<div style="font-size:12px;color:#92400e;margin-top:2px;">' + drifts.length + ' line item' + (drifts.length === 1 ? '' : 's') + ' · up to <b>+' + maxDelta + '%</b> · approx <b>+' + UI.money(costImpact) + '</b> in hidden cost vs the quote.</div>'
      +   '</div>'
      +   (j.quoteId ? '<button onclick="QuotesPage.showDetail(\'' + j.quoteId + '\')" style="font-size:12px;font-weight:700;padding:6px 12px;background:#92400e;color:#fff;border:none;border-radius:6px;cursor:pointer;">Open quote → re-price</button>' : '')
      + '</div>'
      + '<div style="padding-top:8px;border-top:1px dashed #fde68a;">' + rows + '</div>'
      + '</div>';
  },

  _renderProfitCard: function(j, timeEntries) {
    if (typeof JobCosting === 'undefined' || !JobCosting.getJobStats) return '';
    var s = JobCosting.getJobStats(j, timeEntries);
    var marginColor = s.margin >= 40 ? '#2e7d32' : s.margin >= 20 ? '#e65100' : s.margin >= 0 ? '#c62828' : '#7f1d1d';
    var marginBg    = s.margin >= 40 ? '#e8f5e9' : s.margin >= 20 ? '#fff3e0' : s.margin >= 0 ? '#ffebee' : '#fce4ec';
    var marginLabel = s.margin >= 40 ? 'Excellent' : s.margin >= 20 ? 'OK' : s.margin >= 0 ? 'Below target' : 'Losing money';
    // Layout: 4 numbers + margin pill + bar
    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">'
      +   '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin:0;">💰 Profitability</h4>'
      +   '<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;background:' + marginBg + ';color:' + marginColor + ';">' + s.margin + '% · ' + marginLabel + '</span>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px;">'
      +   '<div><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;">Revenue</div><div style="font-size:18px;font-weight:800;color:var(--text);">' + UI.money(s.revenue) + '</div></div>'
      +   '<div><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;">Labor</div><div style="font-size:18px;font-weight:800;color:var(--text);">' + UI.money(s.laborCost) + '</div><div style="font-size:11px;color:var(--text-light);">' + s.hours.toFixed(1) + 'h × $' + s.hourlyRate.toFixed(0) + '</div></div>'
      +   '<div><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;">Materials + Expenses</div><div style="font-size:18px;font-weight:800;color:var(--text);">' + UI.money(s.materialsAndExpenses) + '</div></div>'
      +   '<div><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;">Profit</div><div style="font-size:18px;font-weight:800;color:' + marginColor + ';">' + UI.money(s.profit) + '</div></div>'
      + '</div>'
      // Stacked bar visualization (revenue baseline)
      + '<div style="position:relative;height:8px;border-radius:4px;background:var(--bg);overflow:hidden;display:flex;">';
    if (s.revenue > 0) {
      var laborPct  = Math.min(100, (s.laborCost / s.revenue) * 100);
      var matlPct   = Math.min(100 - laborPct, (s.materialsAndExpenses / s.revenue) * 100);
      var profitPct = Math.max(0, 100 - laborPct - matlPct);
      html += '<div style="width:' + laborPct.toFixed(1) + '%;background:#1565c0;" title="Labor ' + UI.money(s.laborCost) + '"></div>'
        + '<div style="width:' + matlPct.toFixed(1) + '%;background:#e65100;" title="Materials + Expenses ' + UI.money(s.materialsAndExpenses) + '"></div>'
        + '<div style="width:' + profitPct.toFixed(1) + '%;background:' + (s.profit >= 0 ? '#2e7d32' : '#7f1d1d') + ';" title="Profit ' + UI.money(s.profit) + '"></div>';
    }
    html += '</div>'
      + '<div style="display:flex;gap:12px;margin-top:8px;font-size:11px;color:var(--text-light);">'
      +   '<span><span style="display:inline-block;width:10px;height:10px;background:#1565c0;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>Labor</span>'
      +   '<span><span style="display:inline-block;width:10px;height:10px;background:#e65100;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>Materials + Expenses</span>'
      +   '<span><span style="display:inline-block;width:10px;height:10px;background:' + (s.profit >= 0 ? '#2e7d32' : '#7f1d1d') + ';border-radius:2px;vertical-align:middle;margin-right:4px;"></span>Profit</span>'
      + '</div>'
      + (s.expenseCount > 0 ? '<div style="margin-top:8px;font-size:11px;color:var(--text-light);">📒 ' + s.expenseCount + ' expense row' + (s.expenseCount === 1 ? '' : 's') + ' logged · <a onclick="window._reportsTab=\'jobcosting\';loadPage(\'reports\')" style="color:var(--accent);cursor:pointer;">edit on Job Costing →</a></div>' : '<div style="margin-top:8px;font-size:11px;color:var(--text-light);">No expenses logged yet · <a onclick="window._reportsTab=\'jobcosting\';loadPage(\'reports\')" style="color:var(--accent);cursor:pointer;">add on Job Costing →</a></div>')
      + '</div>';
    return html;
  },

  _etaToClient: function(id) {
    var j = DB.jobs.getById(id);
    if (!j) return;
    var client = j.clientId ? DB.clients.getById(j.clientId) : null;
    var phone = j.clientPhone || (client && client.phone) || '';
    if (!phone) { UI.toast('No client phone on file', 'error'); return; }
    var firstName = (j.clientName || '').split(' ')[0] || 'there';
    var minsDefault = 30;
    var mins = prompt('ETA in minutes?', String(minsDefault));
    if (mins === null) return;
    var n = parseInt(mins, 10);
    if (isNaN(n) || n < 0 || n > 600) { UI.toast('Enter a number 0–600', 'error'); return; }
    var co = (JobsPage._co && JobsPage._co()) || { name: 'the crew' };
    var msg;
    if (n === 0) msg = 'Hi ' + firstName + '! ' + co.name + ' is on-site now to work on Job #' + (j.jobNumber || '') + '. Let us know if you need anything.';
    else msg = 'Hi ' + firstName + '! Heads-up — ' + co.name + ' is heading to ' + (j.property ? j.property + ' ' : '') + 'for Job #' + (j.jobNumber || '') + '. ETA about ' + n + ' min. We\'ll text again when on-site.';

    // Prefer Dialpad (logs to communications, threads in Messaging)
    if (typeof Dialpad !== 'undefined' && Dialpad.sendSMS) {
      Dialpad.sendSMS(phone, msg, j.clientId || null);
      UI.toast('ETA sent to ' + firstName);
      return;
    }
    // Fallback: native sms: link
    var digits = phone.replace(/\D/g, '');
    window.open('sms:' + digits + '?&body=' + encodeURIComponent(msg));
  },

  _requestReview: function(id) {
    var j = DB.jobs.getById(id);
    if (!j) return;
    var client = j.clientId ? DB.clients.getById(j.clientId) : null;
    var phone = j.clientPhone || (client && client.phone) || '';
    var email = j.clientEmail || (client && client.email) || '';
    var firstName = (j.clientName || '').split(' ')[0] || 'there';
    var reviewLink = (function(){ try { return CompanyInfo.own('googleReviewUrl') || ''; } catch(e) { return ''; } })();
    if (!reviewLink) {
      UI.toast('Add your Google review link in Settings before requesting reviews');
      try { TenantSetup._jumpToSettings('business', 'sr-review'); } catch (e) {}
      return;
    }
    var _sig = CompanyInfo.get('ownerName') || JobsPage._co().name || 'the team';

    var smsMsg = 'Hi ' + firstName + '! It was great working with you. If you have a moment, we\'d really appreciate a quick Google review — it helps us a lot:\n' + reviewLink + '\nThank you! — ' + _sig;
    var emailSubject = 'Quick favor — leave us a review?';
    var emailBody = 'Hi ' + firstName + ',\n\nThank you for choosing ' + JobsPage._co().name + '! We hope you\'re happy with the work.\n\nIf you have a moment, a Google review would mean the world to us:\n' + reviewLink + '\n\nIt only takes 30 seconds and helps us reach more homeowners in the area.\n\nThank you!\n— ' + CompanyInfo.get('ownerName') + '\n' + JobsPage._co().name + '\n' + JobsPage._co().phone + ' · ' + JobsPage._co().website;

    var html = '<div style="margin-bottom:12px;background:var(--green-bg);border-radius:8px;padding:10px 14px;font-size:13px;">'
      + '⭐ Requesting a review for <strong>' + UI.esc(j.clientName) + '</strong> · Job #' + (j.jobNumber || '') + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;" class="detail-grid">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">SMS to client</label>'
      + '<textarea id="rv-sms" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:13px;min-height:100px;font-family:inherit;resize:vertical;">' + UI.esc(smsMsg) + '</textarea>'
      + (phone ? '<div style="font-size:12px;color:var(--text-light);margin-top:4px;">📞 ' + UI.phone(phone) + '</div>' : '<div style="font-size:12px;color:var(--red);margin-top:4px;">No phone on file</div>')
      + '</div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Email to client</label>'
      + '<textarea id="rv-email" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:13px;min-height:100px;font-family:inherit;resize:vertical;">' + UI.esc(emailBody) + '</textarea>'
      + (email ? '<div style="font-size:12px;color:var(--text-light);margin-top:4px;">✉️ ' + email + '</div>' : '<div style="font-size:12px;color:var(--red);margin-top:4px;">No email on file</div>')
      + '</div></div>'
      + '<div style="font-size:12px;color:var(--text-light);">Review link: <a href="' + reviewLink + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">' + reviewLink + '</a></div>';

    // Stash review context — onclick only passes the job id
    JobsPage._reviewCtx = { jobId: id, phone: phone, email: email, emailSubject: emailSubject };

    UI.showModal('⭐ Request Google Review', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + (phone ? ' <button class="btn btn-outline" onclick="JobsPage._sendReviewSMS()">📱 Send SMS</button>' : '')
        + (email ? ' <button class="btn btn-primary" onclick="JobsPage._sendReviewEmail()">📧 Send Email</button>' : '')
    });
  },

  _showPropertyMap: function(jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j) return;
    if (typeof PropertyMap !== 'undefined' && PropertyMap.show) PropertyMap.show(j.property || '');
    else UI.toast('Property map not available', 'error');
  },

  _sendReviewSMS: function() {
    var ctx = JobsPage._reviewCtx;
    if (!ctx) return;
    var msg = (document.getElementById('rv-sms') || {}).value || '';
    var phoneClean = (ctx.phone || '').replace(/\D/g, '');
    if (typeof Dialpad !== 'undefined' && Dialpad.showTextModal) {
      Dialpad.showTextModal(phoneClean, msg);
    } else {
      window.open('sms:' + phoneClean + '?body=' + encodeURIComponent(msg));
    }
    DB.jobs.update(ctx.jobId, { reviewRequestedAt: new Date().toISOString() });
    UI.closeModal();
    UI.toast('Review request sent via SMS ✅');
  },

  _sendReviewEmail: function() {
    var ctx = JobsPage._reviewCtx;
    if (!ctx) return;
    var body = (document.getElementById('rv-email') || {}).value || '';
    if (typeof Email !== 'undefined' && Email.isConfigured && Email.isConfigured()) {
      Email.send(ctx.email, ctx.emailSubject, body);
    } else {
      window.open('mailto:' + encodeURIComponent(ctx.email) + '?subject=' + encodeURIComponent(ctx.emailSubject) + '&body=' + encodeURIComponent(body));
    }
    DB.jobs.update(ctx.jobId, { reviewRequestedAt: new Date().toISOString() });
    UI.closeModal();
    UI.toast('Review request sent via email ✅');
  },

  _quickComplete: function(id) {
    var j = DB.jobs.getById(id);
    if (!j) return;
    DB.jobs.update(id, { status: 'completed', completedAt: new Date().toISOString() });
    if (typeof SendJim !== 'undefined') SendJim.afterJobComplete(j);

    // Solo path: prompt to create invoice (Option C — preserves the decision).
    // Batch/crew/system flows auto-draft via Workflow.completeAndDraft.
    if (!j.invoiceId && j.total > 0) {
      UI.confirm('Job #' + j.jobNumber + ' complete! Create invoice for ' + UI.money(j.total) + '?', function() {
        if (typeof Workflow !== 'undefined') {
          var inv = Workflow.jobToInvoice(id);
          if (inv) { UI.toast('✅ Invoice #' + inv.invoiceNumber + ' created'); loadPage('invoices'); return; }
        }
        loadPage('jobs');
      }, function() { UI.toast('Job completed'); loadPage('jobs'); });
    } else {
      UI.toast('Job #' + j.jobNumber + ' marked complete');
      loadPage('jobs');
    }
  },
  _batchComplete: function() {
    var ids = Array.from(document.querySelectorAll('.job-check:checked')).map(function(cb) { return cb.value; });
    if (ids.length === 0) return;
    UI.confirm('Mark ' + ids.length + ' job' + (ids.length > 1 ? 's' : '') + ' as completed?', function() {
      // v460: silently auto-draft each job's invoice (only when no invoice yet
      // and total > 0). Bulk completion previously left every job's invoice
      // unmade — biggest source of "completed but uninvoiced" jobs.
      var draftedCount = 0;
      ids.forEach(function(id) {
        var r = (typeof Workflow !== 'undefined' && Workflow.completeAndDraft)
          ? Workflow.completeAndDraft(id, { silent: true })
          : { invoice: null };
        if (r.invoice) draftedCount++;
      });
      var msg = ids.length + ' job' + (ids.length > 1 ? 's' : '') + ' marked complete';
      if (draftedCount > 0) msg += ' · ' + draftedCount + ' invoice draft' + (draftedCount > 1 ? 's' : '') + ' created';
      UI.toast(msg);
      loadPage('jobs');
    });
  },

  _batchDelete: function() {
    var ids = Array.from(document.querySelectorAll('.job-check:checked')).map(function(cb) { return cb.value; });
    if (ids.length === 0) return;
    if (!confirm('Delete ' + ids.length + ' job' + (ids.length > 1 ? 's' : '') + '? This cannot be undone.')) return;
    ids.forEach(function(id) { DB.jobs.remove(id); });
    UI.toast(ids.length + ' job' + (ids.length > 1 ? 's' : '') + ' deleted');
    loadPage('jobs');
  },

  _batchUnschedule: function() {
    var ids = Array.from(document.querySelectorAll('.job-check:checked')).map(function(cb) { return cb.value; });
    if (ids.length === 0) return;
    ids.forEach(function(id) { DB.jobs.update(id, { scheduledDate: null, startTime: null }); });
    UI.toast(ids.length + ' job' + (ids.length > 1 ? 's' : '') + ' unscheduled');
    loadPage('jobs');
  },

  _batchReschedule: function() {
    var ids = Array.from(document.querySelectorAll('.job-check:checked')).map(function(cb) { return cb.value; });
    if (ids.length === 0) return;
    var date = prompt('Reschedule to date (YYYY-MM-DD):', new Date().toISOString().substring(0, 10));
    if (!date) return;
    ids.forEach(function(id) { DB.jobs.update(id, { scheduledDate: date }); });
    UI.toast(ids.length + ' job' + (ids.length > 1 ? 's' : '') + ' rescheduled to ' + date);
    loadPage('jobs');
  },
  _batchInvoice: function() {
    var ids = Array.from(document.querySelectorAll('.job-check:checked')).map(function(cb) { return cb.value; });
    if (ids.length === 0) return;
    var created = 0;
    ids.forEach(function(id) {
      var job = DB.jobs.getById(id);
      if (job && !job.invoiceId && (job.status === 'completed' || job.total > 0)) {
        if (typeof Workflow !== 'undefined') { Workflow.jobToInvoice(id); } else { DB.jobs.update(id, { invoiceId: 'pending' }); }
        created++;
      }
    });
    UI.toast(created + ' invoice' + (created !== 1 ? 's' : '') + ' created!');
    loadPage('invoices');
  },
  _markAllLegacyInvoiced: function() {
    var needsInvoicing = DB.jobs.getAll().filter(function(j) { return j.status === 'completed' && !j.invoiceId; });
    UI.confirm('Mark all ' + needsInvoicing.length + ' completed jobs as already invoiced in previous system? This clears the banner — no new invoices will be created.', function() {
      needsInvoicing.forEach(function(j) { DB.jobs.update(j.id, { invoiceId: 'legacy' }); });
      UI.toast(needsInvoicing.length + ' jobs marked as legacy-invoiced');
      loadPage('jobs');
    });
  },

  _batchInvoiceAll: function() {
    var all = DB.jobs.getAll();
    var needsInvoicing = all.filter(function(j) { return j.status === 'completed' && !j.invoiceId; });
    if (needsInvoicing.length === 0) { UI.toast('No jobs need invoicing'); return; }

    var totalAmount = needsInvoicing.reduce(function(s, j) { return s + (j.total || 0); }, 0);

    // Build confirmation modal listing all jobs
    var listHtml = '<div style="margin-bottom:12px;font-size:14px;">The following <strong>' + needsInvoicing.length + '</strong> job' + (needsInvoicing.length !== 1 ? 's' : '') + ' will be invoiced:</div>'
      + '<div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;margin-bottom:16px;">'
      + '<table style="width:100%;font-size:13px;border-collapse:collapse;">'
      + '<thead><tr style="background:var(--bg);position:sticky;top:0;">'
      + '<th style="text-align:left;padding:8px 12px;font-weight:600;">Client</th>'
      + '<th style="text-align:left;padding:8px 12px;font-weight:600;">Job #</th>'
      + '<th style="text-align:right;padding:8px 12px;font-weight:600;">Total</th>'
      + '</tr></thead><tbody>';
    for (var i = 0; i < needsInvoicing.length; i++) {
      var nj = needsInvoicing[i];
      listHtml += '<tr style="border-top:1px solid var(--border);">'
        + '<td style="padding:8px 12px;">' + UI.esc(nj.clientName || '—') + '</td>'
        + '<td style="padding:8px 12px;">#' + (nj.jobNumber || '') + '</td>'
        + '<td style="padding:8px 12px;text-align:right;font-weight:600;">' + UI.money(nj.total) + '</td>'
        + '</tr>';
    }
    listHtml += '</tbody></table></div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-top:2px solid var(--border);">'
      + '<span style="font-size:15px;font-weight:700;">Total</span>'
      + '<span style="font-size:18px;font-weight:800;color:#2e7d32;">' + UI.money(totalAmount) + '</span>'
      + '</div>';

    UI.showModal('Batch Create Invoices', listHtml, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="JobsPage._batchInvoiceConfirm()" style="background:#2e7d32;">Create ' + needsInvoicing.length + ' Invoice' + (needsInvoicing.length !== 1 ? 's' : '') + '</button>'
    });
  },
  _batchInvoiceConfirm: function() {
    var all = DB.jobs.getAll();
    var needsInvoicing = all.filter(function(j) { return j.status === 'completed' && !j.invoiceId; });
    var today = new Date().toISOString().split('T')[0];
    var dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    var created = 0;
    var totalAmount = 0;

    for (var i = 0; i < needsInvoicing.length; i++) {
      var job = needsInvoicing[i];
      var inv = DB.invoices.create({
        clientId: job.clientId,
        clientName: job.clientName,
        jobId: job.id,
        subject: 'For Services Rendered',
        lineItems: job.lineItems,
        total: job.total || 0,
        balance: job.total || 0,
        status: 'draft',
        issuedDate: today,
        dueDate: dueDate
      });
      DB.jobs.update(job.id, { invoiceId: inv.id });
      totalAmount += (job.total || 0);
      created++;
    }

    UI.closeModal();
    UI.toast('Created ' + created + ' invoice' + (created !== 1 ? 's' : '') + ' totaling ' + UI.money(totalAmount));
    loadPage('jobs');
  },
  _batchAssignCrew: function() {
    var ids = Array.from(document.querySelectorAll('.job-check:checked')).map(function(cb) { return cb.value; });
    if (ids.length === 0) return;
    var team = [];
    try { team = JSON.parse(localStorage.getItem('bm-team') || '[]'); } catch(e) {}
    var options = '';
    team.forEach(function(t) {
      options += '<option value="' + UI.esc(t.name) + '">' + UI.esc(t.name) + '</option>';
    });
    var html = '<div style="padding:8px 0;">'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Select crew member to assign to ' + ids.length + ' job' + (ids.length > 1 ? 's' : '') + ':</label>'
      + '<select id="batch-crew-select" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;">'
      + '<option value="">-- Select --</option>'
      + options
      + '</select>'
      + '<div style="margin-top:8px;"><input type="text" id="batch-crew-other" placeholder="Or type a name..." style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '</div>';
    UI.showModal('Assign Crew', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="JobsPage._batchAssignCrewConfirm()">Assign</button>'
    });
  },
  _batchAssignCrewConfirm: function() {
    var ids = Array.from(document.querySelectorAll('.job-check:checked')).map(function(cb) { return cb.value; });
    var sel = document.getElementById('batch-crew-select');
    var other = document.getElementById('batch-crew-other');
    var name = (sel && sel.value) ? sel.value : (other ? other.value.trim() : '');
    if (!name) { UI.toast('Please select or enter a crew member'); return; }
    ids.forEach(function(id) {
      var job = DB.jobs.getById(id);
      var crew = (job && job.crew) ? job.crew.slice() : [];
      if (crew.indexOf(name) < 0) { crew.push(name); }
      DB.jobs.update(id, { crew: crew });
    });
    UI.toast(ids.length + ' job' + (ids.length > 1 ? 's' : '') + ' assigned to ' + name);
    UI.closeModal();
    loadPage('jobs');
  },
  _batchExport: function() {
    var ids = Array.from(document.querySelectorAll('.job-check:checked')).map(function(cb) { return cb.value; });
    if (ids.length === 0) return;
    var rows = ['Job #,Client,Property,Scheduled,Status,Crew,Total'];
    ids.forEach(function(id) {
      var j = DB.jobs.getById(id);
      if (!j) return;
      var crew = (j.crew && j.crew.length) ? j.crew.join('; ') : '';
      rows.push(
        '"' + (j.jobNumber || '') + '",'
        + '"' + (j.clientName || '').replace(/"/g, '""') + '",'
        + '"' + (j.property || '').replace(/"/g, '""') + '",'
        + '"' + (j.scheduledDate || '') + '",'
        + '"' + (j.status || '') + '",'
        + '"' + crew.replace(/"/g, '""') + '",'
        + '"' + (j.total || 0) + '"'
      );
    });
    var csv = rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'jobs-export-' + new Date().toISOString().split('T')[0] + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.toast(ids.length + ' job' + (ids.length > 1 ? 's' : '') + ' exported');
  },

  showForm: function(jobId, opts) {
    var j = jobId ? DB.jobs.getById(jobId) : {};
    // Backwards-compat: opts used to be passed as a clientId string
    if (typeof opts === 'string') opts = { clientId: opts };
    opts = opts || {};
    // Get clients synchronously from localStorage
    var allClients = [];
    try { allClients = JSON.parse(localStorage.getItem('bm-clients') || '[]'); } catch(e) {}
    var clientOptions = allClients.map(function(c) { return { value: c.id, label: c.name }; });

    // Get team members for crew assignment
    var team = [];
    try { team = JSON.parse(localStorage.getItem('bm-team') || '[]'); } catch(e) {}

    // Time slots (previous system style - 30 min increments)
    var timeSlots = [];
    for (var h = 6; h <= 18; h++) {
      for (var m = 0; m < 60; m += 30) {
        var hour = h > 12 ? h - 12 : h;
        var ampm = h >= 12 ? 'PM' : 'AM';
        var display = hour + ':' + String(m).padStart(2, '0') + ' ' + ampm;
        var value = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
        timeSlots.push({ value: value, label: display });
      }
    }

    var html = '<form id="job-form" onsubmit="JobsPage.save(event, \'' + (jobId || '') + '\')">'
      + UI.formField('Client *', 'select', 'j-clientId', j.clientId || opts.clientId || '', { options: [{ value: '', label: 'Select a client...' }].concat(clientOptions) })
      + UI.formField('Property Address', 'text', 'j-property', j.property, { placeholder: 'Job site address' })
      + UI.formField('Description', 'text', 'j-description', j.description, { placeholder: 'e.g., Remove 2 dead oaks' })

      // Date + Time (previous system style)
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">'
      + UI.formField('Date *', 'date', 'j-date', (j.scheduledDate ? j.scheduledDate.split('T')[0] : '') || opts.date || '')
      + UI.formField('Start Time', 'select', 'j-starttime', j.startTime || '08:00', { options: [{ value: '', label: 'Anytime' }].concat(timeSlots) })
      + UI.formField('End Time', 'select', 'j-endtime', j.endTime || '', { options: [{ value: '', label: 'Open' }].concat(timeSlots) })
      + '</div>'

      // Arrival window (previous system style)
      + '<div style="margin-bottom:12px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Arrival Window</label>'
      + '<div style="display:flex;gap:4px;flex-wrap:wrap;">'
      + '<button type="button" class="btn btn-outline arr-btn" onclick="JobsPage._setArrival(this,\'anytime\')" style="font-size:12px;padding:5px 10px;">Anytime</button>'
      + '<button type="button" class="btn btn-primary arr-btn" onclick="JobsPage._setArrival(this,\'morning\')" style="font-size:12px;padding:5px 10px;">Morning (8-12)</button>'
      + '<button type="button" class="btn btn-outline arr-btn" onclick="JobsPage._setArrival(this,\'afternoon\')" style="font-size:12px;padding:5px 10px;">Afternoon (12-5)</button>'
      + '<button type="button" class="btn btn-outline arr-btn" onclick="JobsPage._setArrival(this,\'specific\')" style="font-size:12px;padding:5px 10px;">Specific Time</button>'
      + '</div><input type="hidden" id="j-arrival" value="' + (j.arrivalWindow || 'morning') + '">'
      + '</div>'

      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
      + UI.formField('Total ($)', 'number', 'j-total', j.total, { placeholder: '0.00' })
      + UI.formField('Status', 'select', 'j-status', j.status || 'scheduled', { options: ['scheduled', 'in_progress', 'completed', 'late', 'cancelled'] })
      + '</div>'

      // Crew assignment (checkboxes for team members)
      + '<div style="margin-bottom:12px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:6px;">Assign Crew</label>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
    var currentCrew = j.crew || [];
    if (team.length) {
      team.forEach(function(t) {
        var checked = currentCrew.indexOf(t.name) >= 0;
        html += '<label style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:' + (checked ? 'var(--green-bg)' : 'var(--bg)') + ';border:1px solid ' + (checked ? '#c8e6c9' : 'var(--border)') + ';border-radius:6px;cursor:pointer;font-size:13px;">'
          + '<input type="checkbox" class="j-crew-check" value="' + t.name + '"' + (checked ? ' checked' : '') + ' style="width:16px;height:16px;">'
          + '👷 ' + t.name + '</label>';
      });
    }
    html += '<input type="text" id="j-crew-other" placeholder="+ Add name" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;width:120px;">'
      + '</div></div>'

      + UI.formField('Notes', 'textarea', 'j-notes', j.notes, { placeholder: 'Job notes, special instructions...' })
      + '</form>';

    // Render as full page (not modal)
    var pageHtml = '<div style="max-width:680px;margin:0 auto;padding-bottom:80px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">'
      + '<button class="btn btn-outline" onclick="loadPage(\'jobs\')" style="font-size:13px;">\u2190 Back to Jobs</button>'
      + '<button class="btn btn-primary" onclick="document.getElementById(\'job-form\').requestSubmit()">Save Job</button>'
      + '</div>'
      + '<h2 style="font-size:20px;margin-bottom:16px;">' + (jobId ? 'Edit Job #' + j.jobNumber : 'New Job') + '</h2>'
      + html
      + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;padding-top:16px;border-top:1px solid var(--border);">'
      + '<button class="btn btn-outline" onclick="loadPage(\'jobs\')">Cancel</button>'
      + '<button class="btn btn-primary" onclick="document.getElementById(\'job-form\').requestSubmit()">Save Job</button>'
      + '</div></div>';

    var content = document.getElementById('pageContent');
    if (content) content.innerHTML = pageHtml;
  },

  _setArrival: function(btn, arrival) {
    document.querySelectorAll('.arr-btn').forEach(function(b) {
      b.classList.remove('btn-primary'); b.classList.add('btn-outline');
    });
    btn.classList.remove('btn-outline'); btn.classList.add('btn-primary');
    document.getElementById('j-arrival').value = arrival;
  },

  save: function(e, jobId) {
    e.preventDefault();
    var clientId = document.getElementById('j-clientId').value;
    if (!clientId) { UI.toast('Select a client', 'error'); return; }
    // Get client from localStorage directly
    var allClients = [];
    try { allClients = JSON.parse(localStorage.getItem('bm-clients') || '[]'); } catch(e) {}
    var client = allClients.find(function(c) { return c.id === clientId; });

    // Collect crew from checkboxes
    var crew = [];
    document.querySelectorAll('.j-crew-check:checked').forEach(function(cb) { crew.push(cb.value); });
    var otherCrew = document.getElementById('j-crew-other').value.trim();
    if (otherCrew) crew.push(otherCrew);

    var data = {
      clientId: clientId,
      clientName: client ? client.name : '',
      clientPhone: client ? client.phone : '',
      clientEmail: client ? client.email : '',
      property: document.getElementById('j-property').value.trim(),
      description: document.getElementById('j-description').value.trim(),
      scheduledDate: document.getElementById('j-date').value,
      startTime: document.getElementById('j-starttime').value,
      endTime: document.getElementById('j-endtime').value,
      arrivalWindow: document.getElementById('j-arrival').value,
      total: parseFloat(document.getElementById('j-total').value) || 0,
      status: document.getElementById('j-status').value,
      crew: crew,
      notes: document.getElementById('j-notes').value.trim()
    };

    // Optimistic — toast first, write locally, one navigation, Supabase sync in bg
    UI.toast(jobId ? 'Job updated ✓' : 'Job created ✓');
    if (jobId) DB.jobs.update(jobId, data);
    else DB.jobs.create(data);
    loadPage('jobs');
  },

  showDetail: function(id) {
    var j = DB.jobs.getById(id);
    if (!j) return;
    if (window.bmRememberDetail) window.bmRememberDetail('jobs', id);

    var timeEntries = DB.timeEntries ? DB.timeEntries.getAll().filter(function(te) { return te.jobId === id; }) : [];
    var totalHours = timeEntries.reduce(function(s, te) { return s + (te.hours || 0); }, 0);

    // previous system-style job detail
    var statusColors = {scheduled:'#1565c0',in_progress:'#e07c24',completed:'#2e7d32',invoiced:'#2e7d32',late:'#dc3545',cancelled:'#6c757d'};
    var statusColor = statusColors[j.status] || '#2e7d32';
    var client = j.clientId ? DB.clients.getById(j.clientId) : null;

    var html = '<div style="max-width:960px;margin:0 auto;">'
      // Top bar: back + actions
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">'
      + '<button class="btn btn-outline" onclick="loadPage(\'jobs\')" style="padding:6px 12px;font-size:12px;">← Back to Jobs</button>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">'
      + (function() {
        var phone = j.clientPhone || (client && client.phone) || '';
        return phone ? '<a href="tel:' + phone.replace(/\D/g,'') + '" class="btn btn-outline" style="font-size:12px;">📞 Call</a>'
          + '<a href="sms:' + phone.replace(/\D/g,'') + '" class="btn btn-outline" style="font-size:12px;">💬 Text</a>' : '';
      })()
      + (j.crew && j.crew.length > 0 ? '<button class="btn btn-outline" style="font-size:12px;" onclick="JobsPage._textCrew(\'' + id + '\')">📲 Text Crew</button>' : '')
      + (j.status === 'scheduled' || j.status === 'in_progress' ? '<button class="btn btn-outline" style="font-size:12px;" onclick="JobsPage._etaToClient(\'' + id + '\')" title="Send ETA SMS to client">⏱ ETA to Client</button>' : '')
      + (j.property ? '<button class="btn btn-outline" style="font-size:12px;" onclick="PermitsPage.startFromJob(\'' + id + '\', decodeURIComponent(\'' + encodeURIComponent(j.property) + '\'))" title="Look up permit + link to this job">🏛 Pull Permit</button>' : '')
      + (j.status === 'completed' ? '<button class="btn btn-outline" style="font-size:12px;color:#f9a825;border-color:#f9a825;" onclick="JobsPage._requestReview(\'' + id + '\')">⭐ Request Review</button>' : '')
      + (j.status === 'scheduled' || j.status === 'in_progress' ? '<button class="btn btn-outline" style="font-size:12px;" onclick="JobsPage._markComplete(\'' + id + '\')">✓ Mark Complete</button>' : '')
      + (j.status === 'completed' && !j.invoiceId ? '<button class="btn btn-primary" style="font-size:12px;" onclick="(function(){var inv=Workflow.jobToInvoice(\'' + id + '\');loadPage(\'invoices\');if(inv)setTimeout(function(){InvoicesPage.showDetail(inv.id);},100);})()">💰 Create Invoice</button>' : '')
      + (j.status !== 'completed' || j.invoiceId ? '<button class="btn btn-outline" style="font-size:12px;" onclick="PDF.generateJobSheet(\'' + id + '\')">📄 Job Sheet</button>' : '')
      + '<button class="btn btn-outline" style="font-size:12px;" onclick="JobsPage.showForm(\'' + id + '\')">✏️ Edit</button>'
      + '<div style="position:relative;display:inline-block;">'
      + '<button onclick="var d=this.nextElementSibling;document.querySelectorAll(\'.more-dd\').forEach(function(x){x.style.display=\'none\'});d.style.display=d.style.display===\'block\'?\'none\':\'block\';" class="btn btn-outline" style="font-size:13px;padding:6px 10px;">•••</button>'
      + '<div class="more-dd" style="display:none;position:absolute;right:0;top:calc(100% + 4px);background:#fff;border:1px solid var(--border);border-radius:8px;padding:4px 0;z-index:200;min-width:180px;box-shadow:0 4px 16px rgba(0,0,0,.12);">'
      + '<button onclick="JobsPage.showForm(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">✏️ Edit Job</button>'
      + '<button onclick="PDF.generateJobSheet(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">📄 Job Sheet PDF</button>'
      + (j.property ? '<a href="https://maps.apple.com/?daddr=' + encodeURIComponent(j.property) + '" target="_blank" rel="noopener noreferrer" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);text-decoration:none;">🗺 Navigate to Property</a>' : '')
      + (j.status === 'scheduled' || j.status === 'in_progress' ? '<button onclick="JobsPage._etaToClient(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">⏱ ETA to Client</button>' : '')
      + (j.status !== 'completed' ? '<button onclick="JobsPage._markComplete(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">✓ Mark Complete</button>' : '')
      + (j.status === 'completed' && !j.invoiceId ? '<button onclick="(function(){var inv=Workflow.jobToInvoice(\'' + id + '\');loadPage(\'invoices\');if(inv)setTimeout(function(){InvoicesPage.showDetail(inv.id);},100);})()" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">💰 Create Invoice</button>' : '')
      + '<button onclick="JobsPage._requestReview(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">⭐ Request Review</button>'
      + '<div style="height:1px;background:var(--border);margin:4px 0;"></div>'
      + '<button onclick="JobsPage._archiveJob(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:var(--text);">Archive</button>'
      + '<button onclick="JobsPage.setStatus(\'' + id + '\',\'cancelled\')" style="display:block;width:100%;text-align:left;padding:8px 14px;font-size:13px;background:none;border:none;cursor:pointer;color:#dc3545;">✗ Cancel Job</button>'
      + '</div></div>'
      + '</div></div>'

      // Header card
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:16px;">'
      + '<div style="height:4px;background:' + statusColor + ';"></div>'
      + '<div style="padding:20px 24px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">'
      + '<div>'
      + '<h2 style="font-size:22px;font-weight:700;margin:0 0 4px;">Job #' + (j.jobNumber||'') + ' — '
      + (j.clientId
          ? '<a onclick="ClientsPage.showDetail(\'' + j.clientId + '\')" style="color:inherit;text-decoration:none;border-bottom:1px dashed var(--text-light);cursor:pointer;">' + UI.esc(j.clientName || '—') + '</a>'
          : UI.esc(j.clientName || '—'))
      + (j.clientId ? ' <button onclick="event.stopPropagation();ClientsPage.showForm(\'' + j.clientId + '\')" title="Edit client details" style="background:none;border:none;cursor:pointer;font-size:13px;padding:0 4px;color:var(--text-light);vertical-align:middle;">✏️</button>' : '')
      + '</h2>'
      + '<div style="font-size:13px;color:var(--text-light);">'
      + (j.scheduledDate ? UI.dateShort(j.scheduledDate) + (j.startTime ? ' at ' + j.startTime : '') : 'Not scheduled')
      + '</div>'
      + (j.property ? '<a href="https://maps.apple.com/?daddr=' + encodeURIComponent(j.property) + '" target="_blank" rel="noopener noreferrer" style="display:block;font-size:13px;color:var(--accent);margin-top:2px;text-decoration:none;">📍 ' + UI.esc(j.property) + ' →</a>' : '')
      + '</div>'
      + '<div style="text-align:right;">' + UI.statusBadge(j.status) + '<div style="font-size:24px;font-weight:800;color:var(--accent);margin-top:6px;">' + UI.money(j.total) + '</div></div>'
      + '</div></div>'

      // Two-column: Client card (left) + metadata (right)
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:16px;" class="detail-grid">'

      // Client contact card
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;">'
      + '<div style="font-size:12px;color:var(--text-light);font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Client</div>'
      + '<div style="font-size:16px;font-weight:700;margin-bottom:4px;">' + UI.esc(j.clientName || '—') + '</div>'
      + (j.property ? '<a href="https://maps.apple.com/?daddr=' + encodeURIComponent(j.property) + '" target="_blank" rel="noopener noreferrer" style="display:block;font-size:13px;color:var(--accent);margin-bottom:8px;text-decoration:none;">📍 ' + UI.esc(j.property) + ' →</a>' : '')
      + (j.clientPhone || (client && client.phone) ? '<a href="tel:' + (j.clientPhone || (client && client.phone)||'').replace(/\D/g,'') + '" style="display:block;font-size:13px;color:var(--accent);margin-bottom:4px;text-decoration:none;">📞 ' + (j.clientPhone || (client && client.phone)) + '</a>' : '')
      + (j.clientEmail || (client && client.email) ? '<a href="mailto:' + (j.clientEmail || (client && client.email) || '') + '" style="font-size:13px;color:#1565c0;text-decoration:none;">✉️ ' + (j.clientEmail || (client && client.email) || '') + '</a>' : '')
      + '</div>'

      // Job metadata table
      + '<div>'
      + '<table style="width:100%;font-size:14px;border-collapse:collapse;">'
      + '<tr><td style="padding:8px 0;color:var(--text-light);width:130px;">Job #</td><td style="padding:8px 0;font-weight:500;">' + (j.jobNumber || '') + '</td></tr>'
      + '<tr><td style="padding:8px 0;color:var(--text-light);">Scheduled</td><td style="padding:8px 0;">' + UI.dateShort(j.scheduledDate) + (j.startTime ? ' at ' + j.startTime : '') + '</td></tr>'
      + '<tr><td style="padding:8px 0;color:var(--text-light);">Total</td><td style="padding:8px 0;font-weight:700;font-size:16px;">' + UI.money(j.total) + '</td></tr>'
      + '<tr><td style="padding:8px 0;color:var(--text-light);">Time Tracked</td><td style="padding:8px 0;">' + totalHours.toFixed(1) + ' hrs (' + timeEntries.length + ' entries)</td></tr>'
      + '<tr><td style="padding:8px 0;color:var(--text-light);">Crew</td><td style="padding:8px 0;">' + (j.crew && j.crew.length ? j.crew.join(', ') : 'Unassigned') + '</td></tr>'
      + '</table></div>'
      + '</div>'

      // Workflow progress bar
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">';
    var jStages = ['scheduled','in_progress','completed','invoiced'];
    var jLabels = {scheduled:'Scheduled',in_progress:'In Progress',completed:'Completed',invoiced:'Invoiced'};
    var jIdx = jStages.indexOf(j.status);
    if (jIdx < 0) jIdx = 0;
    if (j.invoiceId) jIdx = 3;
    html += '<div style="display:flex;align-items:center;margin-bottom:14px;">';
    jStages.forEach(function(s, i) {
      var done = i <= jIdx;
      var active = i === jIdx;
      html += '<div style="flex:1;text-align:center;position:relative;">'
        + '<div style="width:28px;height:28px;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;'
        + (done ? 'background:var(--accent);color:#fff;' : 'background:var(--bg);color:var(--text-light);border:2px solid var(--border);') + '">'
        + (done && !active ? '✓' : (i + 1)) + '</div>'
        + '<div style="font-size:11px;font-weight:' + (active ? '700' : '500') + ';color:' + (done ? 'var(--accent)' : 'var(--text-light)') + ';margin-top:4px;">' + jLabels[s] + '</div>'
        + '</div>';
      if (i < jStages.length - 1) {
        html += '<div style="flex:0 0 40px;height:2px;background:' + (i < jIdx ? 'var(--accent)' : 'var(--border)') + ';margin-top:-16px;"></div>';
      }
    });
    html += '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    var statusBtns = [['scheduled','Scheduled'],['in_progress','In Progress'],['completed','Completed'],['late','Late'],['action_required','Action Required'],['cancelled','Cancelled']];
    statusBtns.forEach(function(sb) {
      var isActive = j.status === sb[0];
      html += '<button onclick="JobsPage.' + (sb[0] === 'completed' ? '_markComplete(\'' + id + '\')' : 'setStatus(\'' + id + '\',\'' + sb[0] + '\')') + '" style="font-size:11px;padding:5px 12px;border-radius:6px;border:1px solid '
        + (isActive ? '#2e7d32' : 'var(--border)') + ';background:' + (isActive ? '#2e7d32' : 'var(--white)') + ';color:' + (isActive ? '#fff' : 'var(--text)') + ';cursor:pointer;font-weight:' + (isActive ? '700' : '500') + ';">'
        + sb[1] + '</button>';
    });
    html += '</div></div>'

      // v774: Margin-erosion alert — only renders when materials on the
      // job have risen >=10% since the quote was sent. Sits above the
      // profit card so the action is visible before the math.
      + JobsPage._renderMarginErosionAlert(j)

      // v768: Per-job profitability card — labor (time × rate) + expenses
      // + materials vs revenue. Visible on every job detail.
      + (typeof JobCosting !== 'undefined' && JobCosting.getJobStats
          ? JobsPage._renderProfitCard(j, timeEntries)
          : '')

      // Description
      + (j.description ? '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">'
        + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Description</h4>'
        + '<p style="font-size:14px;line-height:1.6;margin:0;">' + UI.esc(j.description) + '</p></div>' : '')

      // Line items
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px;">'
      + '<div style="padding:12px 16px;border-bottom:1px solid var(--border);"><h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin:0;">Line Items</h4></div>';
    if (j.lineItems && j.lineItems.length) {
      html += '<table class="data-table" style="border:none;border-radius:0;"><thead><tr><th>Service</th><th>Description</th><th>Qty</th><th style="text-align:right;">Rate</th><th style="text-align:right;">Amount</th></tr></thead><tbody>';
      j.lineItems.forEach(function(item) {
        html += '<tr><td>' + (item.service || 'Custom') + '</td><td style="color:var(--text-light);">' + (item.description || '') + '</td><td>' + item.qty + '</td><td style="text-align:right;">' + UI.money(item.rate) + '</td><td style="text-align:right;font-weight:600;">' + UI.money(item.amount || item.qty * item.rate) + '</td></tr>';
      });
      html += '<tr style="background:var(--green-bg);"><td colspan="4" style="text-align:right;font-weight:700;">Total</td><td style="text-align:right;font-weight:800;font-size:15px;color:var(--accent);">' + UI.money(j.total) + '</td></tr>';
      html += '</tbody></table>';
    } else {
      html += '<div style="padding:20px;text-align:center;color:var(--text-light);font-size:13px;">No line items</div>';
    }
    html += '</div>'

    // Client satisfaction
    if (typeof Satisfaction !== 'undefined') {
      html += Satisfaction.renderForJob(id);
    }

    // Custom fields
    if (typeof CustomFields !== 'undefined') {
      html += CustomFields.renderDisplay('job', id);
    }

    // Job Checklist
    if (typeof Checklists !== 'undefined') {
      html += Checklists.renderForJob(id);
    }

    // Visits (multi-visit)
    if (typeof Visits !== 'undefined') {
      html += Visits.renderForJob(id);
    }

    // Materials used
    if (typeof Materials !== 'undefined') {
      html += Materials.renderForJob(id);
    }

    // Before/After photos
    if (typeof BeforeAfter !== 'undefined') {
      html += BeforeAfter.renderForJob(id);
    }

      // Project Diary (chronological multi-day timeline)
    if (typeof Photos !== 'undefined' && Photos.renderDiary) {
      html += Photos.renderDiary('job', id);
    }

      // Photos gallery
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">Photos</h4>';
    if (typeof Photos !== 'undefined') {
      html += Photos.renderGallery('job', id);
    } else {
      html += '<div style="color:var(--text-light);font-size:13px;">No photos</div>';
    }
    html += '</div></div>'

      // Right sidebar — crew, time, notes, actions
      + '<div>'

      // Crew
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">Crew</h4>';
    if (j.crew && j.crew.length) {
      j.crew.forEach(function(name) {
        html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--bg);">'
          + '<div style="width:32px;height:32px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">' + name.split(' ').map(function(n){return n[0];}).join('') + '</div>'
          + '<span style="font-size:13px;font-weight:600;">' + name + '</span></div>';
      });
    } else {
      html += '<div style="color:var(--text-light);font-size:13px;">No crew assigned</div>';
    }
    html += '</div>'

      // Time tracking
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">Time Tracked</h4>';
    if (timeEntries.length) {
      html += '<div style="font-size:24px;font-weight:800;color:var(--accent);margin-bottom:10px;">' + totalHours.toFixed(1) + ' hrs</div>';
      timeEntries.forEach(function(te) {
        html += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid var(--bg);">'
          + '<span>' + (te.user || 'Crew') + '</span>'
          + '<span style="font-weight:600;">' + (te.hours || 0).toFixed(1) + 'h</span></div>';
      });
    } else {
      html += '<div style="color:var(--text-light);font-size:13px;">No time logged</div>';
    }
    html += '</div>'

      // Notes — inline editable + v789 voice memo
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin:0;">Notes</h4>'
      + '<div style="display:flex;gap:8px;">'
      +   '<button id="job-mic-btn-' + id + '" onclick="JobsPage._toggleVoiceMemo(\'' + id + '\')" title="Voice memo — speech-to-text, appends to notes" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--accent);">🎤</button>'
      +   '<button onclick="JobsPage._editNote(\'' + id + '\')" style="background:none;border:none;cursor:pointer;font-size:12px;color:var(--accent);font-weight:600;">✏️ Edit</button>'
      + '</div>'
      + '</div>'
      + '<div id="job-note-view-' + id + '" style="font-size:13px;color:' + (j.notes ? 'var(--text)' : 'var(--text-light)') + ';line-height:1.6;min-height:32px;">' + (j.notes ? UI.esc(j.notes) : 'No notes. Tap Edit to add.') + '</div>'
      + '<div id="job-note-edit-' + id + '" style="display:none;">'
      + '<textarea id="job-note-ta-' + id + '" style="width:100%;height:80px;border:2px solid var(--accent);border-radius:6px;padding:8px;font-size:13px;resize:vertical;">' + UI.esc(j.notes || '') + '</textarea>'
      + '<div style="display:flex;gap:6px;margin-top:6px;">'
      + '<button onclick="JobsPage._saveNote(\'' + id + '\')" style="background:var(--green-dark);color:#fff;border:none;padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Save</button>'
      + '<button onclick="JobsPage._cancelNote(\'' + id + '\')" style="background:none;border:1px solid var(--border);padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;">Cancel</button>'
      + '</div></div>'
      + '</div>'

      // Quick actions
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">Quick Actions</h4>'
      + (j.clientPhone ? '<a href="tel:' + j.clientPhone + '" class="btn btn-outline" style="width:100%;justify-content:center;margin-bottom:6px;font-size:12px;">📞 Call Client</a>' : '')
      + (j.clientPhone ? '<button class="btn btn-outline" style="width:100%;justify-content:center;margin-bottom:6px;font-size:12px;" onclick="if(typeof Dialpad!==\'undefined\'){var fn=\'' + UI.esc((j.clientName||'').split(' ')[0]||'there') + '\';var msg=\'Hi \'+fn+\', this is Doug from \'+JobsPage._co().name+\'.' + (j.scheduledDate ? ' Your job is scheduled for ' + UI.dateShort(j.scheduledDate) + '.' : '') + ' Let us know if you have any questions! \'+JobsPage._co().phone;Dialpad.showTextModal(\'' + (j.clientPhone||'').replace(/\D/g,'') + '\',msg);}">📱 Text Client</button>' : '')
      + (j.property ? '<a href="https://maps.apple.com/?daddr=' + encodeURIComponent(j.property) + '" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="width:100%;justify-content:center;margin-bottom:6px;font-size:12px;">🗺 Navigate</a>' : '')
      + '<button class="btn btn-outline" style="width:100%;justify-content:center;margin-bottom:6px;font-size:12px;" onclick="JobsPage._showPropertyMap(\'' + id + '\')">📐 Equipment Layout</button>'
      // v802: NPS survey link — only after the job is completed
      + (j.status === 'completed' ? '<button class="btn btn-outline" style="width:100%;justify-content:center;margin-bottom:6px;font-size:12px;" onclick="JobsPage._copyNPSLink(\'' + id + '\')">📊 Copy NPS survey link</button>' : '')
      + '</div>'

      // Activity timeline
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">Activity</h4>'
      + '<div style="border-left:2px solid var(--border);padding-left:16px;margin-left:8px;">';
    // Build timeline from available data
    var timeline = [];
    if (j.createdAt) timeline.push({ date: j.createdAt, text: 'Job created', icon: '📋' });
    if (j.scheduledDate) timeline.push({ date: j.scheduledDate, text: 'Scheduled for ' + UI.dateShort(j.scheduledDate), icon: '📅' });
    timeEntries.forEach(function(te) { timeline.push({ date: te.date, text: (te.user || 'Crew') + ' logged ' + (te.hours||0).toFixed(1) + 'h', icon: '⏱' }); });
    if (j.status === 'completed') timeline.push({ date: j.completedAt || j.scheduledDate, text: 'Job completed', icon: '✅' });
    if (j.invoiceId) timeline.push({ date: j.completedAt || '', text: 'Invoice created', icon: '💰' });
    timeline.sort(function(a,b) { return (a.date||'').localeCompare(b.date||''); });
    if (timeline.length) {
      timeline.forEach(function(t) {
        html += '<div style="position:relative;padding-bottom:14px;">'
          + '<div style="position:absolute;left:-22px;top:2px;width:12px;height:12px;background:var(--accent);border-radius:50%;border:2px solid var(--white);"></div>'
          + '<div style="font-size:12px;color:var(--text-light);">' + (t.date ? UI.dateShort(t.date) : '') + '</div>'
          + '<div style="font-size:13px;">' + t.icon + ' ' + t.text + '</div></div>';
      });
    } else {
      html += '<div style="font-size:13px;color:var(--text-light);">No activity yet</div>';
    }
    html += '</div></div></div></div></div>'; // close sidebar col, grid, main col, grid, max-width wrapper

    // Render as full page
    document.getElementById('pageTitle').textContent = 'Job #' + j.jobNumber;
    document.getElementById('pageContent').innerHTML = html;
    document.getElementById('pageAction').style.display = 'none';
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  },

  // Inline note editing
  _editNote: function(jobId) {
    var v = document.getElementById('job-note-view-' + jobId);
    var e = document.getElementById('job-note-edit-' + jobId);
    if (v) v.style.display = 'none';
    if (e) e.style.display = 'block';
    var ta = document.getElementById('job-note-ta-' + jobId);
    if (ta) ta.focus();
  },
  _cancelNote: function(jobId) {
    var v = document.getElementById('job-note-view-' + jobId);
    var e = document.getElementById('job-note-edit-' + jobId);
    if (v) v.style.display = 'block';
    if (e) e.style.display = 'none';
  },
  // v802: compute the NPS survey token (matches edge fn's
  // sha256(jobId + ":" + NPS_TOKEN_SALT).slice(0,12)) and copy a
  // shareable sat.html?job=ID&token=T&label=... URL to the clipboard.
  // Default salt must match the edge fn's default — Doug can override
  // both via the Supabase secret when ready.
  _NPS_SALT: 'default-bm-salt-2026',
  _copyNPSLink: function(jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j) { UI.toast('Job not found', 'error'); return; }
    var text = jobId + ':' + JobsPage._NPS_SALT;
    var encoder = new TextEncoder();
    crypto.subtle.digest('SHA-256', encoder.encode(text)).then(function(buf) {
      var hex = Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
      var token = hex.slice(0, 12);
      var labelStr = (j.clientName || 'Job') + (j.description ? ' — ' + j.description.slice(0, 40) : '');
      var url = 'https://branchmanager.app/sat.html?job=' + encodeURIComponent(jobId) + '&token=' + token + '&label=' + encodeURIComponent(labelStr);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function() {
          UI.toast('📋 NPS survey link copied — paste into a text or email to the client');
        });
      } else {
        // Fallback: show in a modal so user can copy manually
        UI.showModal('NPS survey link', '<div style="font-size:13px;line-height:1.6;">'
          + '<div style="color:var(--text-light);margin-bottom:8px;">Copy this link and send it to the client. They can rate the work 0–10 + leave a comment.</div>'
          + '<input type="text" value="' + UI.esc(url) + '" readonly onclick="this.select();document.execCommand(\'copy\');" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-family:monospace;font-size:11px;">'
          + '<div style="font-size:11px;color:var(--text-light);margin-top:8px;">Tap the field to select &amp; copy.</div>'
          + '</div>', {
          footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
        });
      }
    }).catch(function(err) {
      UI.toast('Token generation failed: ' + err.message, 'error');
    });
  },

  _saveNote: function(jobId) {
    var ta = document.getElementById('job-note-ta-' + jobId);
    if (!ta) return;
    var notes = ta.value.trim();
    DB.jobs.update(jobId, { notes: notes });
    var v = document.getElementById('job-note-view-' + jobId);
    if (v) {
      v.textContent = notes || 'No notes. Tap Edit to add.';
      v.style.color = notes ? 'var(--text)' : 'var(--text-light)';
      v.style.display = 'block';
    }
    var e = document.getElementById('job-note-edit-' + jobId);
    if (e) e.style.display = 'none';
    UI.toast('Notes saved');
  },

  // v789: Voice memo on job notes. Uses browser SpeechRecognition (free,
  // no API roundtrip) to live-transcribe and append to job.notes with a
  // timestamp prefix. Tap once to start, tap again to stop + save.
  _voiceMemoState: null,
  _toggleVoiceMemo: function(jobId) {
    var btn = document.getElementById('job-mic-btn-' + jobId);
    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) {
      UI.toast('Voice memo not supported in this browser', 'error');
      return;
    }
    // Already recording? Stop.
    if (JobsPage._voiceMemoState && JobsPage._voiceMemoState.recog) {
      try { JobsPage._voiceMemoState.recog.stop(); } catch(e) {}
      return;
    }
    var recog = new Rec();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = 'en-US';
    JobsPage._voiceMemoState = { recog: recog, jobId: jobId, finalText: '', interim: '' };

    // Live preview overlay
    var preview = document.createElement('div');
    preview.id = 'job-mic-preview-' + jobId;
    preview.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1f2937;color:#fff;padding:14px 18px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.3);font-size:14px;line-height:1.5;max-width:min(90vw,520px);z-index:9999;';
    preview.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:50%;animation:pulse 1.2s infinite;"></span><b>🎤 Recording…</b> <span style="color:#9ca3af;font-size:12px;margin-left:auto;">tap mic to stop</span></div><div id="job-mic-text-' + jobId + '" style="color:#e5e7eb;min-height:24px;">Listening…</div>';
    document.body.appendChild(preview);
    // Pulse keyframe (one-shot inject)
    if (!document.getElementById('job-mic-pulse-style')) {
      var st = document.createElement('style');
      st.id = 'job-mic-pulse-style';
      st.textContent = '@keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.3;}}';
      document.head.appendChild(st);
    }

    recog.onresult = function(ev) {
      var state = JobsPage._voiceMemoState;
      if (!state) return;
      var interim = '';
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) {
          state.finalText += (state.finalText ? ' ' : '') + t.trim();
        } else {
          interim += t;
        }
      }
      state.interim = interim;
      var liveEl = document.getElementById('job-mic-text-' + state.jobId);
      if (liveEl) {
        liveEl.innerHTML = '<span>' + UI.esc(state.finalText) + '</span><span style="color:#6b7280;"> ' + UI.esc(interim) + '</span>';
      }
    };
    recog.onerror = function(ev) {
      console.warn('[Jobs] voice memo error', ev);
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        UI.toast('Mic permission denied — enable in browser settings', 'error');
      }
    };
    recog.onend = function() {
      var state = JobsPage._voiceMemoState;
      JobsPage._voiceMemoState = null;
      var prv = document.getElementById('job-mic-preview-' + jobId);
      if (prv) prv.remove();
      var btnEl = document.getElementById('job-mic-btn-' + jobId);
      if (btnEl) { btnEl.style.background = 'none'; btnEl.style.color = 'var(--accent)'; btnEl.textContent = '🎤'; }
      if (!state || !state.finalText.trim()) {
        UI.toast('Nothing recorded');
        return;
      }
      // Append to job notes with timestamp prefix
      var j = DB.jobs.getById(jobId);
      if (!j) return;
      var now = new Date();
      var stamp = (now.getMonth() + 1) + '/' + now.getDate() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      var memoLine = '[🎤 ' + stamp + '] ' + state.finalText.trim();
      var newNotes = ((j.notes || '').trim() + '\n\n' + memoLine).trim();
      DB.jobs.update(jobId, { notes: newNotes });
      UI.toast('🎤 Memo saved — ' + state.finalText.trim().split(/\s+/).length + ' words');
      // Refresh the notes view
      var v = document.getElementById('job-note-view-' + jobId);
      if (v) {
        v.textContent = newNotes;
        v.style.color = 'var(--text)';
      }
    };

    try {
      recog.start();
      if (btn) { btn.style.background = '#ef4444'; btn.style.color = '#fff'; btn.textContent = '■'; }
      UI.toast('🎤 Recording — tap to stop');
    } catch(e) {
      UI.toast('Could not start mic: ' + e.message, 'error');
      JobsPage._voiceMemoState = null;
      var prv2 = document.getElementById('job-mic-preview-' + jobId);
      if (prv2) prv2.remove();
    }
  },

  // Legacy modal (not used)
  _showDetailModal: function(id) {
    UI.showModal('Job', '<p>Use full-page view.</p>', {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
    });
  },

  _getSignature: function(id, callback) {
    var html = '<div style="text-align:center;">'
      + '<p style="font-size:14px;color:var(--text-light);margin-bottom:12px;">Client signature confirms work is complete and satisfactory.</p>'
      + '<canvas id="job-sig-canvas" width="600" height="180" style="border:2px solid var(--border);border-radius:8px;width:100%;touch-action:none;cursor:crosshair;background:#fff;"></canvas>'
      + '<div style="display:flex;gap:8px;margin-top:8px;">'
      + '<button type="button" class="btn btn-outline" style="flex:1;font-size:12px;" onclick="var c=document.getElementById(\'job-sig-canvas\');if(c){c.getContext(\'2d\').clearRect(0,0,c.width,c.height);}">Clear</button>'
      + '</div>'
      + '<div style="margin-top:12px;">'
      + '<input type="text" id="job-sig-name" placeholder="Client name (print)" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:15px;text-align:center;">'
      + '</div>'
      + '</div>';

    UI.showModal('Client Sign-Off', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal();JobsPage._markComplete(\'' + id + '\')">Skip Signature</button>'
        + ' <button class="btn btn-primary" onclick="JobsPage._saveSignature(\'' + id + '\')">Save & Complete</button>'
    });

    // Setup canvas drawing
    setTimeout(function() {
      var canvas = document.getElementById('job-sig-canvas');
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      var drawing = false;
      var rect = canvas.getBoundingClientRect();
      function getPos(e) {
        var t = e.touches ? e.touches[0] : e;
        return { x: (t.clientX - rect.left) * (canvas.width / rect.width), y: (t.clientY - rect.top) * (canvas.height / rect.height) };
      }
      function start(e) { e.preventDefault(); drawing = true; ctx.beginPath(); var p = getPos(e); ctx.moveTo(p.x, p.y); }
      function draw(e) { if (!drawing) return; e.preventDefault(); var p = getPos(e); ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.lineTo(p.x, p.y); ctx.stroke(); }
      function stop() { drawing = false; }
      canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', stop); canvas.addEventListener('mouseleave', stop);
      canvas.addEventListener('touchstart', start, { passive: false }); canvas.addEventListener('touchmove', draw, { passive: false }); canvas.addEventListener('touchend', stop);
    }, 100);
  },

  _saveSignature: function(id) {
    var canvas = document.getElementById('job-sig-canvas');
    var nameEl = document.getElementById('job-sig-name');
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) { alert('Client must print their name.'); return; }
    var sigData = canvas ? canvas.toDataURL('image/png') : '';
    DB.jobs.update(id, { clientSignature: sigData, signedBy: name, signedAt: new Date().toISOString() });
    UI.closeModal();
    JobsPage._markComplete(id);
  },

  _markComplete: function(id) {
    var j = DB.jobs.getById(id);
    if (!j) return;
    DB.jobs.update(id, { status: 'completed', completedAt: new Date().toISOString() });
    UI.closeModal();

    // Silently trigger review request email in background (2s delay so modal renders first)
    setTimeout(function() {
      if (typeof AutomationsPage !== 'undefined') {
        var config = AutomationsPage.getConfig();
        if (config.reviewRequest && config.reviewRequest.enabled) {
          var origToast = UI.toast;
          UI.toast = function(){};
          try { AutomationsPage.runReviewRequests(); } finally {
            setTimeout(function() { UI.toast = origToast; }, 100);
          }
        }
      }
    }, 2000);

    // Build modal footer — include review request button if email is configured
    var reviewBtn = (typeof Email !== 'undefined' && Email.isConfigured())
      ? ' <button class="btn btn-outline" onclick="UI.closeModal();AutomationsPage.runReviewRequests();">📧 Send Review Request</button>'
      : '';

    // Solo path keeps the prompt (Option C). On Yes → invoice is created and
    // user lands on invoice detail. On Not Yet → job completes, no invoice.
    // Batch/crew/system flows auto-draft via Workflow.completeAndDraft.
    if (!j.invoiceId) {
      // v795: cross-sell suggestions from the client's TreeInventory
      var crossSellHtml = JobsPage._renderCrossSellSuggestions(j);
      var modal = '<div style="text-align:center;padding:8px 0;">'
        + '<div style="font-size:48px;margin-bottom:12px;">💰</div>'
        + '<h3 style="font-size:18px;margin-bottom:8px;">Job Complete!</h3>'
        + '<p style="color:var(--text-light);font-size:14px;margin-bottom:20px;">Ready to invoice ' + UI.esc(j.clientName || 'the client') + ' for ' + UI.money(j.total) + '?</p>'
        + '<div style="display:flex;gap:8px;justify-content:center;">'
        + '<button class="btn btn-outline" onclick="UI.closeModal();loadPage(\'jobs\');">Not Yet</button>'
        + '<button class="btn btn-primary" onclick="UI.closeModal();JobsPage.createInvoice(\'' + id + '\');loadPage(\'invoices\');">Create Invoice Now</button>'
        + '</div>'
        + crossSellHtml
        + '</div>';
      UI.showModal('Job Completed', modal, {
        footer: '<button class="btn btn-outline" onclick="UI.closeModal();loadPage(\'jobs\');">Close</button>' + reviewBtn
      });
    } else {
      UI.toast('Job marked complete');
      loadPage('jobs');
    }
  },

  // v795: Cross-sell suggestion block — surfaces other trees on this client's
  // property that have flagged condition (Hazard / Poor) or pending workNeeded.
  // Rendered inside the Job Complete modal as a CTA to create a follow-up
  // quote while the crew + client are still mentally in tree-work mode.
  _renderCrossSellSuggestions: function(j) {
    if (!j || !j.clientId || typeof TreeInventory === 'undefined') return '';
    var trees = TreeInventory.getForClient(j.clientId);
    if (!trees || !trees.length) return '';

    // Exclude trees that look like THIS job — match by species in the
    // description or line items so we don't suggest the tree we just did.
    var jobText = ((j.description || '') + ' ' + (j.lineItems || []).map(function(li){ return (li.service || '') + ' ' + (li.description || '') + ' ' + (li.species || ''); }).join(' ')).toLowerCase();
    var opportunities = trees.filter(function(t) {
      if (!t.species) return false;
      // Skip if this tree's species appears in the just-finished job's text
      // AND its location does too (rough heuristic — same tree on same spot)
      var sLower = (t.species || '').toLowerCase();
      var lLower = (t.location || '').toLowerCase();
      if (sLower && jobText.indexOf(sLower) >= 0 && lLower && jobText.indexOf(lLower) >= 0) return false;
      // Opportunities = explicit workNeeded set, OR condition = Hazard / Poor
      if (t.workNeeded && String(t.workNeeded).trim()) return true;
      if (t.condition === 'Hazard' || t.condition === 'Poor') return true;
      return false;
    });
    if (!opportunities.length) return '';

    // Cap to top 4 (Hazard first, then Poor, then others)
    var rank = { 'Hazard': 0, 'Poor': 1, 'Fair': 2, 'Good': 3, 'Excellent': 4 };
    opportunities.sort(function(a, b) {
      return (rank[a.condition] || 99) - (rank[b.condition] || 99);
    });
    var top = opportunities.slice(0, 4);

    var rowsHtml = top.map(function(t) {
      var condColor = t.condition === 'Hazard' ? '#991b1b' : t.condition === 'Poor' ? '#c2410c' : 'var(--text-light)';
      var condPill = t.condition
        ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:' + condColor + '20;color:' + condColor + ';font-weight:700;text-transform:uppercase;">' + UI.esc(t.condition) + '</span>'
        : '';
      var work = t.workNeeded ? '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">' + UI.esc(t.workNeeded) + '</div>' : '';
      return '<div style="text-align:left;padding:8px 0;border-top:1px solid var(--border);">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'
        +   '<div style="font-size:13px;font-weight:600;">' + UI.esc(t.species || '') + (t.location ? ' <span style="color:var(--text-light);font-weight:400;">· ' + UI.esc(t.location) + '</span>' : '') + '</div>'
        +   condPill
        + '</div>'
        + work
        + '</div>';
    }).join('');

    var label = opportunities.length === 1
      ? '1 other tree on this property needs work'
      : opportunities.length + ' other trees on this property need work';

    return '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin-top:18px;text-align:left;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px;">'
      +   '<div style="font-size:13px;font-weight:700;color:#92400e;">🌳 ' + label + (opportunities.length > top.length ? ' (showing top ' + top.length + ')' : '') + '</div>'
      +   '<button onclick="UI.closeModal();JobsPage._followUpQuoteFromTrees(\'' + j.clientId + '\')" style="background:#92400e;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">+ Follow-up quote</button>'
      + '</div>'
      + '<div style="font-size:12px;color:#92400e;margin-bottom:4px;">Strike while the crew is still on-site and the client\'s mind is on trees.</div>'
      + rowsHtml
      + '</div>';
  },

  // v795: Spin up a new quote pre-filled with this client + a description
  // listing the flagged trees. Doug lands on the quote form ready to edit.
  _followUpQuoteFromTrees: function(clientId) {
    var c = DB.clients.getById(clientId);
    if (!c) { UI.toast('Client not found', 'error'); return; }
    var trees = (typeof TreeInventory !== 'undefined') ? TreeInventory.getForClient(clientId) : [];
    var opportunities = trees.filter(function(t) {
      if (!t.species) return false;
      if (t.workNeeded && String(t.workNeeded).trim()) return true;
      if (t.condition === 'Hazard' || t.condition === 'Poor') return true;
      return false;
    });
    var lineItems = opportunities.map(function(t) {
      return {
        service: t.workNeeded || 'Assess/quote',
        description: (t.species || 'Tree') + (t.location ? ' · ' + t.location : '') + (t.condition ? ' (' + t.condition + ')' : ''),
        species: t.species || '',
        location: t.location || '',
        qty: 1,
        rate: 0
      };
    });
    var desc = 'Follow-up assessment for the ' + opportunities.length + ' tree' + (opportunities.length === 1 ? '' : 's') + ' flagged on this property.';
    var newQuote = DB.quotes.create({
      clientId: clientId,
      clientName: c.name,
      clientEmail: c.email || '',
      clientPhone: c.phone || '',
      property: c.address || '',
      description: desc,
      lineItems: lineItems,
      status: 'draft',
      source: 'cross-sell from completed job'
    });
    if (!newQuote || !newQuote.id) { UI.toast('Could not create quote', 'error'); return; }
    UI.toast('Draft quote #' + newQuote.quoteNumber + ' created — edit & send');
    setTimeout(function() {
      if (typeof QuotesPage !== 'undefined' && QuotesPage.showForm) {
        loadPage('quotes');
        setTimeout(function() { QuotesPage.showForm(newQuote.id); }, 80);
      }
    }, 100);
  },

  setStatus: function(id, status) {
    DB.jobs.update(id, { status: status });
    UI.toast('Job status: ' + status.replace(/_/g, ' '));
    UI.closeModal();
    loadPage('jobs');
  },

  _archiveJob: function(id) {
    if (!confirm('Archive this job? You can restore it from the Archive page.')) return;
    DB.jobs.update(id, { status: 'archived' });
    UI.toast('Job archived');
    loadPage('jobs');
  },

  createInvoice: function(jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j) return;
    var inv = DB.invoices.create({
      clientId: j.clientId,
      clientName: j.clientName,
      clientEmail: j.clientEmail || '',
      clientPhone: j.clientPhone || '',
      jobId: jobId,
      subject: j.description || 'For Services Rendered',
      lineItems: j.lineItems,
      total: j.total,
      balance: j.total,
      amountPaid: 0,
      status: 'draft',
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
    });
    // Link invoice back to job so dashboard "needs invoicing" alert clears
    DB.jobs.update(jobId, { invoiceId: inv.id, status: 'completed' });
    UI.toast('Invoice #' + inv.invoiceNumber + ' created');
    UI.closeModal();
    loadPage('invoices');
  }
};
