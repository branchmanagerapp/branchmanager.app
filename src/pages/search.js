/**
 * Branch Manager — Global Search
 * Search across clients, jobs, invoices, quotes, requests
 * v2 — recent searches, category filters, result counts, better cards,
 *       quick actions, keyboard hint, text highlight, improved empty state
 */
var SearchPage = {
  _activeCategory: 'all',
  _RECENT_KEY: 'bm-recent-searches',
  _MAX_RECENT: 5,

  // ── Recent Searches ────────────────────────────────────────────
  _getRecent: function() {
    try { return JSON.parse(localStorage.getItem(SearchPage._RECENT_KEY) || '[]'); } catch(e) { return []; }
  },

  _saveRecent: function(query) {
    if (!query || query.trim().length < 2) return;
    var q = query.trim();
    var list = SearchPage._getRecent().filter(function(r) { return r !== q; });
    list.unshift(q);
    list = list.slice(0, SearchPage._MAX_RECENT);
    try { localStorage.setItem(SearchPage._RECENT_KEY, JSON.stringify(list)); } catch(e) {}
  },

  _clearRecent: function() {
    try { localStorage.removeItem(SearchPage._RECENT_KEY); } catch(e) {}
    loadPage('search');
  },

  // ── Text Highlight ─────────────────────────────────────────────
  _highlight: function(text, query) {
    if (!text || !query) return UI.esc(text || '');
    var escaped = UI.esc(text);
    var escapedQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(new RegExp('(' + escapedQ + ')', 'gi'),
      '<mark style="background:#fff176;padding:0 2px;border-radius:2px;">$1</mark>');
  },

  // ── Category selector ──────────────────────────────────────────
  _setCategory: function(cat) {
    SearchPage._activeCategory = cat;
    var searchEl = document.getElementById('search-page-input') || document.getElementById('global-search-input');
    var q = searchEl ? searchEl.value.trim() : '';
    var content = document.getElementById('search-results-area');
    if (content) content.innerHTML = SearchPage._renderResults(q);
  },

  // ── Main render ────────────────────────────────────────────────
  render: function(query) {
    var self = SearchPage;
    self._activeCategory = 'all';

    // Search input bar (always visible on the search page)
    var html = '<div style="position:relative;margin-bottom:16px;">'
      + '<input type="text" id="search-page-input" placeholder="Search clients, jobs, quotes, invoices..." '
      + 'value="' + UI.esc(query || '') + '" '
      + 'oninput="SearchPage._onPageSearch(this.value)" '
      + 'autocomplete="off" autocorrect="off" autocapitalize="off" '
      + 'style="width:100%;padding:12px 16px 12px 40px;border:2px solid var(--border);border-radius:12px;font-size:15px;background:var(--white);outline:none;-webkit-appearance:none;" '
      + 'onfocus="this.style.borderColor=\'var(--accent)\'" onblur="this.style.borderColor=\'var(--border)\'">'
      + '<span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none;">🔍</span>'
      + '</div>';

    // Category filter tabs
    var cats = ['all', 'clients', 'jobs', 'invoices', 'quotes', 'requests'];
    html += '<div id="search-cat-tabs" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:16px;overflow-x:auto;-webkit-overflow-scrolling:touch;">';
    cats.forEach(function(cat) {
      var active = self._activeCategory === cat;
      html += '<button onclick="SearchPage._setCategory(\'' + cat + '\')" id="search-tab-' + cat + '" style="'
        + 'padding:6px 14px;border-radius:20px;border:1px solid var(--border);font-size:13px;cursor:pointer;font-weight:600;white-space:nowrap;'
        + (active ? 'background:var(--green-dark);color:#fff;border-color:var(--green-dark);' : 'background:var(--white);color:var(--text-light);')
        + '">' + cat.charAt(0).toUpperCase() + cat.slice(1) + '</button>';
    });
    html += '</div>';

    // Results area (populated by _renderResults)
    html += '<div id="search-results-area">' + self._renderResults(query) + '</div>';

    return html;
  },

  // ── Live search from the page input ───────────────────────────
  _pageSearchTimeout: null,
  _onPageSearch: function(q) {
    clearTimeout(SearchPage._pageSearchTimeout);
    SearchPage._pageSearchTimeout = setTimeout(function() {
      var content = document.getElementById('search-results-area');
      if (content) content.innerHTML = SearchPage._renderResults(q);
    }, 200);
  },

  // ── Build result list HTML ─────────────────────────────────────
  _renderResults: function(query) {
    var self = SearchPage;
    var cat = self._activeCategory;

    // Update tab styles
    setTimeout(function() {
      ['all','clients','jobs','invoices','quotes','requests'].forEach(function(c) {
        var btn = document.getElementById('search-tab-' + c);
        if (!btn) return;
        if (c === cat) {
          btn.style.background = 'var(--green-dark)';
          btn.style.color = '#fff';
          btn.style.borderColor = 'var(--green-dark)';
        } else {
          btn.style.background = 'var(--white)';
          btn.style.color = 'var(--text-light)';
          btn.style.borderColor = 'var(--border)';
        }
      });
    }, 0);

    // Gather results — if no query, show ALL by most recent (legacy system-style)
    var isSearch = query && query.trim().length >= 2;
    var q = isSearch ? query.trim().toLowerCase() : '';

    if (isSearch) self._saveRecent(query.trim());

    var byType = { clients: [], jobs: [], invoices: [], quotes: [], requests: [] };

    if (isSearch) {
      byType.clients = DB.clients.search(q);
      byType.jobs = DB.jobs.search(q);
      byType.invoices = DB.invoices.search(q);
      byType.quotes = DB.quotes.search(q);
      byType.requests = DB.requests.search(q);
    } else {
      // No query — show all records sorted by most recent (updatedAt or createdAt)
      var sortRecent = function(a, b) { return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''); };
      byType.clients = DB.clients.getAll().sort(sortRecent);
      byType.jobs = DB.jobs.getAll().sort(sortRecent);
      byType.invoices = DB.invoices.getAll().sort(sortRecent);
      byType.quotes = DB.quotes.getAll().sort(sortRecent);
      byType.requests = DB.requests.getAll().sort(sortRecent);
    }

    var totalClients   = byType.clients.length;
    var totalJobs      = byType.jobs.length;
    var totalInvoices  = byType.invoices.length;
    var totalQuotes    = byType.quotes.length;
    var totalRequests  = byType.requests.length;
    var grandTotal     = totalClients + totalJobs + totalInvoices + totalQuotes + totalRequests;

    if (grandTotal === 0 && isSearch) {
      return '<div class="empty-state" style="text-align:center;padding:40px 20px;">'
        + '<div style="font-size:48px;margin-bottom:12px;">🔍</div>'
        + '<h3 style="margin-bottom:8px;">No results for &ldquo;' + UI.esc(query) + '&rdquo;</h3>'
        + '<p style="color:var(--text-light);">Try searching for a client name, address, phone number, or invoice #.</p>'
        + '</div>';
    }
    if (grandTotal === 0) {
      return '<div class="empty-state" style="text-align:center;padding:40px 20px;">'
        + '<div style="font-size:48px;margin-bottom:12px;">📂</div>'
        + '<h3 style="margin-bottom:8px;">No records yet</h3>'
        + '<p style="color:var(--text-light);">Add clients, jobs, quotes, or invoices to see them here.</p>'
        + '</div>';
    }

    // v648: Jobber-style "Recently active" section header when no query.
    // For active searches, keep the count summary line.
    var html = '';
    if (isSearch) {
      var parts = [];
      if (totalClients)  parts.push(totalClients + ' client' + (totalClients !== 1 ? 's' : ''));
      if (totalJobs)     parts.push(totalJobs + ' job' + (totalJobs !== 1 ? 's' : ''));
      if (totalInvoices) parts.push(totalInvoices + ' invoice' + (totalInvoices !== 1 ? 's' : ''));
      if (totalQuotes)   parts.push(totalQuotes + ' quote' + (totalQuotes !== 1 ? 's' : ''));
      if (totalRequests) parts.push(totalRequests + ' request' + (totalRequests !== 1 ? 's' : ''));
      html += '<div style="font-size:13px;color:var(--text-light);margin-bottom:16px;">'
        + parts.join(' &bull; ')
        + ' for &ldquo;' + UI.esc(query) + '&rdquo;'
        + '</div>';
    } else {
      html += '<h3 style="font-size:18px;font-weight:700;margin:4px 0 12px;color:var(--text);">Recently active</h3>';
    }

    // Helper: render a section
    var PAGE_SIZE = cat === 'all' ? 15 : 100;
    function renderSection(title, icon, items, renderFn) {
      if (!items.length) return '';
      if (cat !== 'all' && cat !== title.toLowerCase()) return '';
      var sectionId = 'search-section-' + title.toLowerCase();
      var showing = Math.min(items.length, PAGE_SIZE);
      var out = '<div style="margin-bottom:20px;" id="' + sectionId + '">'
        + '<div style="font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">'
        + icon + ' ' + title + ' <span style="font-weight:400;">(' + items.length + ')</span></div>'
        + '<div style="background:var(--white);border-radius:12px;border:1px solid var(--border);overflow:hidden;">';
      items.slice(0, PAGE_SIZE).forEach(function(item, idx) {
        out += renderFn(item, idx === showing - 1 && items.length <= PAGE_SIZE);
      });
      if (items.length > PAGE_SIZE) {
        out += '<div style="padding:10px 16px;text-align:center;border-top:1px solid #f0f0f0;">'
          + '<button onclick="SearchPage._showMore(\'' + sectionId + '\',\'' + title.toLowerCase() + '\')" style="background:none;border:none;color:var(--accent);font-weight:700;font-size:13px;cursor:pointer;">Show all ' + items.length + ' ' + title.toLowerCase() + ' ↓</button>'
          + '</div>';
      }
      out += '</div></div>';
      return out;
    }

    function row(onclick, left, right, last) {
      return '<div onclick="' + onclick + '" style="display:flex;align-items:center;gap:12px;padding:14px 16px;'
        + (last ? '' : 'border-bottom:1px solid #f0f0f0;')
        + 'cursor:pointer;transition:background .1s;" onmouseover="this.style.background=\'#fafafa\'" onmouseout="this.style.background=\'\'"><div style="flex:1;min-width:0;">'
        + left + '</div>' + right + '</div>';
    }

    // Clients
    html += renderSection('Clients', '👥', byType.clients, function(c, last) {
      var allInv = DB.invoices.getAll().filter(function(i) { return i.clientId === c.id; });
      var balDue = allInv.reduce(function(s, i) { return s + (i.status !== 'paid' ? (i.balance || 0) : 0); }, 0);
      var left = '<div style="font-weight:600;font-size:14px;">' + self._highlight(c.name, query) + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">'
        + (c.address ? self._highlight(c.address, query) + (c.phone ? ' &bull; ' : '') : '')
        + (c.phone ? self._highlight(c.phone, query) : '')
        + '</div>';
      var right = '<div style="text-align:right;flex-shrink:0;">'
        + UI.statusBadge(c.status)
        + (balDue > 0 ? '<div style="font-size:12px;color:var(--red);font-weight:600;margin-top:4px;">' + UI.money(balDue) + ' due</div>' : '')
        + '</div>';
      return row("ClientsPage._pendingDetail='" + c.id + "';loadPage('clients')", left, right, last);
    });

    // Jobs
    html += renderSection('Jobs', '🔧', byType.jobs, function(j, last) {
      var left = '<div style="font-weight:600;font-size:14px;">#' + j.jobNumber + ' — ' + self._highlight(j.clientName || '', query) + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">'
        + (j.description ? self._highlight(j.description, query) : '')
        + (j.scheduledDate ? ' &bull; ' + UI.dateShort(j.scheduledDate) : '')
        + '</div>';
      var right = '<div style="text-align:right;flex-shrink:0;">'
        + UI.statusBadge(j.status)
        + (j.total ? '<div style="font-size:12px;font-weight:600;margin-top:4px;">' + UI.money(j.total) + '</div>' : '')
        + '</div>';
      return row("JobsPage._pendingDetail='" + j.id + "';loadPage('jobs')", left, right, last);
    });

    // Invoices
    html += renderSection('Invoices', '💰', byType.invoices, function(i, last) {
      var left = '<div style="font-weight:600;font-size:14px;">Invoice #' + i.invoiceNumber + ' — ' + self._highlight(i.clientName || '', query) + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">'
        + (i.subject ? self._highlight(i.subject, query) + (i.dueDate ? ' &bull; ' : '') : '')
        + (i.dueDate ? 'Due ' + UI.dateShort(i.dueDate) : '')
        + '</div>';
      var right = '<div style="text-align:right;flex-shrink:0;">'
        + UI.statusBadge(i.status)
        + (i.balance > 0 ? '<div style="font-size:12px;color:var(--red);font-weight:600;margin-top:4px;">' + UI.money(i.balance) + ' due</div>'
          : (i.total ? '<div style="font-size:12px;font-weight:600;color:var(--green-dark);margin-top:4px;">' + UI.money(i.total) + ' paid</div>' : ''))
        + '</div>';
      return row("InvoicesPage._pendingDetail='" + i.id + "';loadPage('invoices')", left, right, last);
    });

    // Quotes
    html += renderSection('Quotes', '📋', byType.quotes, function(qr, last) {
      var left = '<div style="font-weight:600;font-size:14px;">Quote #' + qr.quoteNumber + ' — ' + self._highlight(qr.clientName || '', query) + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">'
        + (qr.description ? self._highlight(qr.description, query) : '')
        + '</div>';
      var right = '<div style="text-align:right;flex-shrink:0;">'
        + UI.statusBadge(qr.status)
        + (qr.total ? '<div style="font-size:12px;font-weight:600;margin-top:4px;">' + UI.money(qr.total) + '</div>' : '')
        + '</div>';
      return row("QuotesPage._pendingDetail='" + qr.id + "';loadPage('quotes')", left, right, last);
    });

    // Requests
    html += renderSection('Requests', '📥', byType.requests, function(r, last) {
      var left = '<div style="font-weight:600;font-size:14px;">' + self._highlight(r.clientName || '', query) + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">'
        + (r.property ? self._highlight(r.property, query) : '')
        + (r.source ? ' &bull; ' + UI.esc(r.source) : '')
        + '</div>';
      var right = UI.statusBadge(r.status);
      return row("RequestsPage._pendingDetail='" + r.id + "';loadPage('requests')", left, right, last);
    });

    return html;
  },

  // Re-run a recent search by populating the search bar + re-rendering
  _showMore: function(sectionId, type) {
    // Switch to that category tab which shows ALL items (no pagination for filtered view)
    SearchPage._activeCategory = type;
    var searchEl = document.getElementById('search-page-input');
    var q = searchEl ? searchEl.value.trim() : '';
    var content = document.getElementById('search-results-area');
    if (content) content.innerHTML = SearchPage._renderResults(q);
  },

  _runRecent: function(query) {
    var searchEl = document.getElementById('search-page-input') || document.getElementById('globalSearch');
    if (searchEl) {
      searchEl.value = query;
      searchEl.dispatchEvent(new Event('input'));
    }
    // Also update results area directly
    var content = document.getElementById('search-results-area');
    if (content) content.innerHTML = SearchPage._renderResults(query);
  }
};
