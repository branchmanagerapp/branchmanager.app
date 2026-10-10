// Unified Archive page — surfaces archived records across all 5 core tables
// (clients/quotes/jobs/invoices/requests). Restore or permanently delete from here.
var ArchivePage = {
  _open: { clients: true, quotes: true, jobs: true, invoices: true, requests: true },

  render: function() {
    var self = ArchivePage;
    var clients = DB.clients.getAll().filter(function(c) { return c.archived === true; });
    var quotes = DB.quotes.getAll().filter(function(q) { return q.status === 'archived'; });
    var jobs = DB.jobs.getAll().filter(function(j) { return j.status === 'archived'; });
    var invoices = DB.invoices.getAll().filter(function(i) { return i.status === 'archived'; });
    var requests = DB.requests.getAll().filter(function(r) { return r.status === 'archived'; });

    var totalCount = clients.length + quotes.length + jobs.length + invoices.length + requests.length;
    var html = '<div style="max-width:960px;margin:0 auto;">'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">'
      +   '<div>'
      +     '<h2 style="margin:0 0 4px;font-size:20px;font-weight:700;">Archive <span style="font-size:13px;font-weight:500;color:var(--text-light);">· ' + totalCount + ' total</span></h2>'
      +     '<div style="font-size:13px;color:var(--text-light);">Records hidden from default lists. Restore or delete permanently.</div>'
      +   '</div>'
      +   (totalCount > 0
          ? '<button onclick="ArchivePage._deleteAll()" style="background:#dc3545;color:#fff;border:none;padding:9px 16px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;">Delete all archived</button>'
          : '')
      + '</div>';

    html += self._section('clients', 'Clients', clients, function(c) {
      var name = UI.esc(c.name || '—');
      var sub = UI.esc(c.email || c.phone || c.address || '');
      return { label: name, sub: sub, openFn: 'ClientsPage.showDetail(\'' + c.id + '\')' };
    });
    html += self._section('quotes', 'Quotes', quotes, function(q) {
      return {
        label: 'Quote #' + (q.quoteNumber || '—') + ' — ' + UI.esc(q.clientName || '—'),
        sub: (q.total != null ? UI.money(q.total) : '') + (q.createdAt ? ' · ' + UI.dateShort(q.createdAt) : ''),
        openFn: 'QuotesPage.showDetail(\'' + q.id + '\')'
      };
    });
    html += self._section('jobs', 'Jobs', jobs, function(j) {
      return {
        label: 'Job #' + (j.jobNumber || '—') + ' — ' + UI.esc(j.clientName || '—'),
        sub: (j.scheduledDate ? UI.dateShort(j.scheduledDate) : '') + (j.total != null ? ' · ' + UI.money(j.total) : ''),
        openFn: 'JobsPage.showDetail(\'' + j.id + '\')'
      };
    });
    html += self._section('invoices', 'Invoices', invoices, function(i) {
      return {
        label: 'Invoice #' + (i.invoiceNumber || '—') + ' — ' + UI.esc(i.clientName || '—'),
        sub: (i.total != null ? UI.money(i.total) : '') + (i.dueDate ? ' · due ' + UI.dateShort(i.dueDate) : ''),
        openFn: 'InvoicesPage.showDetail(\'' + i.id + '\')'
      };
    });
    html += self._section('requests', 'Requests', requests, function(r) {
      return {
        label: UI.esc(r.clientName || '—') + (r.service ? ' — ' + UI.esc(r.service) : ''),
        sub: (r.createdAt ? UI.dateShort(r.createdAt) : '') + (r.source ? ' · ' + UI.esc(r.source) : ''),
        openFn: 'RequestsPage.showDetail(\'' + r.id + '\')'
      };
    });

    html += '</div>';
    setTimeout(function() { if (window.lucide) window.lucide.createIcons(); }, 0);
    return html;
  },

  _section: function(kind, title, items, mapFn) {
    var open = ArchivePage._open[kind];
    var caret = open ? '▾' : '▸';
    var body = '';
    if (open) {
      if (items.length === 0) {
        body = '<div style="padding:14px 16px;font-size:13px;color:var(--text-light);font-style:italic;">No archived ' + title.toLowerCase() + '.</div>';
      } else {
        body = '<div>';
        for (var n = 0; n < items.length; n++) {
          var it = items[n];
          var m = mapFn(it);
          body += '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid var(--border);">'
            + '<div style="flex:1;min-width:0;cursor:pointer;" onclick="' + m.openFn + '">'
            +   '<div style="font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + m.label + '</div>'
            +   (m.sub ? '<div style="font-size:11px;color:var(--text-light);">' + m.sub + '</div>' : '')
            + '</div>'
            + '<button class="btn btn-outline" style="font-size:12px;padding:6px 12px;" onclick="ArchivePage._restore(\'' + kind + '\',\'' + it.id + '\')">Restore</button>'
            + '<button class="btn btn-outline" style="font-size:12px;padding:6px 12px;color:#dc3545;border-color:#f5c2c7;" onclick="ArchivePage._deletePerm(\'' + kind + '\',\'' + it.id + '\')">Delete</button>'
            + '</div>';
        }
        body += '</div>';
      }
    }
    return '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin-bottom:14px;overflow:hidden;">'
      + '<div onclick="ArchivePage._toggle(\'' + kind + '\')" style="padding:14px 16px;display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;">'
      +   '<span style="font-size:14px;color:var(--text-light);width:14px;">' + caret + '</span>'
      +   '<span style="font-size:15px;font-weight:700;">' + title + '</span>'
      +   '<span style="background:var(--bg);border-radius:10px;padding:2px 10px;font-size:12px;color:var(--text-light);font-weight:600;">' + items.length + '</span>'
      + '</div>'
      + body
      + '</div>';
  },

  _toggle: function(kind) {
    ArchivePage._open[kind] = !ArchivePage._open[kind];
    loadPage('archive');
  },

  _restore: function(kind, id) {
    if (kind === 'clients') {
      DB.clients.update(id, { archived: false });
    } else if (kind === 'quotes') {
      DB.quotes.update(id, { status: 'draft' });
    } else if (kind === 'jobs') {
      DB.jobs.update(id, { status: 'draft' });
    } else if (kind === 'invoices') {
      DB.invoices.update(id, { status: 'draft' });
    } else if (kind === 'requests') {
      DB.requests.update(id, { status: 'new' });
    }
    UI.toast('Restored');
    loadPage('archive');
  },

  _deletePerm: function(kind, id) {
    if (!confirm('Delete permanently? This cannot be undone.')) return;
    if (kind === 'clients') DB.clients.remove(id);
    else if (kind === 'quotes') DB.quotes.remove(id);
    else if (kind === 'jobs') DB.jobs.remove(id);
    else if (kind === 'invoices') DB.invoices.remove(id);
    else if (kind === 'requests') DB.requests.remove(id);
    UI.toast('Deleted');
    loadPage('archive');
  },

  // Bulk wipe — only operates on rows already flagged archived. Two-confirm
  // gate so a stray click can't nuke the entire archive.
  _deleteAll: function() {
    var clients  = DB.clients.getAll().filter(function(c){ return c.archived === true; });
    var quotes   = DB.quotes.getAll().filter(function(q){ return q.status === 'archived'; });
    var jobs     = DB.jobs.getAll().filter(function(j){ return j.status === 'archived'; });
    var invoices = DB.invoices.getAll().filter(function(i){ return i.status === 'archived'; });
    var requests = DB.requests.getAll().filter(function(r){ return r.status === 'archived'; });
    var total = clients.length + quotes.length + jobs.length + invoices.length + requests.length;
    if (total === 0) { UI.toast('Nothing archived to delete'); return; }
    if (!confirm('Permanently delete ALL ' + total + ' archived records?\n\n  · ' + clients.length + ' clients\n  · ' + quotes.length + ' quotes\n  · ' + jobs.length + ' jobs\n  · ' + invoices.length + ' invoices\n  · ' + requests.length + ' requests\n\nThis cannot be undone.')) return;
    if (!confirm('Final confirmation: DELETE ' + total + ' records permanently?')) return;
    clients.forEach(function(c){ DB.clients.remove(c.id); });
    quotes.forEach(function(q){ DB.quotes.remove(q.id); });
    jobs.forEach(function(j){ DB.jobs.remove(j.id); });
    invoices.forEach(function(i){ DB.invoices.remove(i.id); });
    requests.forEach(function(r){ DB.requests.remove(r.id); });
    UI.toast(total + ' archived records deleted', 'success');
    loadPage('archive');
  }
};
