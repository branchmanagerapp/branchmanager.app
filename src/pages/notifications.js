/**
 * Branch Manager — Notification Center & Activity Feed
 * Clickable items, inline actions, unread badges
 */
var NotificationsPage = {
  _co: function() {
    return {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      website: CompanyInfo.get('website')
    };
  },

  _activeFilter: 'all',

  render: function() {
    var self = NotificationsPage;
    var activities = self._buildFeed();
    var filteredCount = self._hiddenOldCount || 0;
    var unreadCount = activities.filter(function(a){ return a.unread; }).length;

    var html = '<div class="section-header" style="display:flex;align-items:center;justify-content:space-between;">'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<h2 style="margin:0;">Activity Feed</h2>'
      + (unreadCount > 0 ? '<span style="background:var(--red);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">' + unreadCount + ' new</span>' : '')
      + (filteredCount > 0 ? '<span style="font-size:12px;color:var(--text-light);">' + filteredCount + ' older entries hidden</span>' : '')
      + '</div>'
      + (unreadCount > 0 ? '<button class="btn btn-outline" style="font-size:12px;padding:5px 14px;" onclick="NotificationsPage.markAllRead()">Mark All Read</button>' : '')
      + '</div>';

    // Filter tabs
    html += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
    var filters = ['All', 'Requests', 'Quotes', 'Jobs', 'Invoices', 'Payments'];
    filters.forEach(function(f) {
      var isActive = f.toLowerCase() === self._activeFilter;
      var style = isActive ? ' style="background:var(--green-dark);color:#fff;border-color:var(--green-dark);"' : '';
      html += '<button onclick="NotificationsPage.filter(\'' + f.toLowerCase() + '\')" class="filter-btn"' + style + '>' + f + '</button>';
    });
    html += '</div>';

    // Priority alerts banner (overdue invoices, new requests)
    var overdueInvs = DB.invoices.getAll().filter(function(inv){
      return inv.balance > 0 && inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== 'paid' && inv.status !== 'draft' && inv.status !== 'cancelled';
    });
    var newReqs = DB.requests.getAll().filter(function(r){ return r.status === 'new'; });

    if (overdueInvs.length > 0 || newReqs.length > 0) {
      html += '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">';
      if (overdueInvs.length > 0) {
        var overdueTotal = overdueInvs.reduce(function(s,i){ return s + (i.balance||0); }, 0);
        html += '<div style="flex:1;min-width:200px;background:#fff8f0;border:1px solid #ffcc80;border-radius:10px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onclick="loadPage(\'invoices\')">'
          + '<div><div style="font-weight:700;font-size:13px;color:#e65100;">⚠️ ' + overdueInvs.length + ' Overdue Invoice' + (overdueInvs.length !== 1 ? 's' : '') + '</div>'
          + '<div style="font-size:12px;color:#bf360c;">' + UI.money(overdueTotal) + ' outstanding</div></div>'
          + '<span style="font-size:12px;color:var(--accent);font-weight:600;">View →</span>'
          + '</div>';
      }
      if (newReqs.length > 0) {
        html += '<div style="flex:1;min-width:200px;background:#e3f2fd;border:1px solid #90caf9;border-radius:10px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onclick="loadPage(\'requests\')">'
          + '<div><div style="font-weight:700;font-size:13px;color:#0d47a1;">📥 ' + newReqs.length + ' New Request' + (newReqs.length !== 1 ? 's' : '') + '</div>'
          + '<div style="font-size:12px;color:#1565c0;">Needs response</div></div>'
          + '<span style="font-size:12px;color:var(--accent);font-weight:600;">View →</span>'
          + '</div>';
      }
      html += '</div>';
    }

    // Activity list
    html += '<div id="activity-list" style="display:flex;flex-direction:column;gap:8px;">';
    if (activities.length) {
      activities.forEach(function(a) {
        html += NotificationsPage._renderActivity(a);
      });
    } else {
      html += '<div style="text-align:center;padding:40px;color:var(--text-light);">No activity yet. Import your data to see your history.</div>';
    }
    html += '</div>';
    return html;
  },

  _renderActivity: function(a) {
    var icons = { request: '📥', quote: '📝', job: '🌳', invoice: '💰', payment: '💳', client: '👤', note: '📌' };
    var icon = icons[a.type] || '📋';
    var timeAgo = UI.dateRelative ? UI.dateRelative(a.date) : a.date;

    // Build action buttons based on type and status
    var actions = '';
    if (a.type === 'request' && a.unread) {
      actions += '<button class="btn btn-outline" style="font-size:11px;padding:3px 10px;" onclick="event.stopPropagation();loadPage(\'requests\')">Respond →</button>';
    }
    if (a.type === 'invoice' && a.unread) {
      // Overdue invoice — show send reminder button
      actions += '<button class="btn btn-outline" style="font-size:11px;padding:3px 10px;border-color:#ff9800;color:#e07c24;" onclick="event.stopPropagation();NotificationsPage._sendInvoiceReminder(\'' + (a.refId||'') + '\')">'
        + '📧 Send Reminder</button>';
      actions += '<button class="btn btn-outline" style="font-size:11px;padding:3px 10px;" onclick="event.stopPropagation();loadPage(\'invoices\')">View →</button>';
    }
    if (a.type === 'quote') {
      actions += '<button class="btn btn-outline" style="font-size:11px;padding:3px 10px;" onclick="event.stopPropagation();loadPage(\'quotes\')">View →</button>';
    }
    if (a.type === 'job') {
      actions += '<button class="btn btn-outline" style="font-size:11px;padding:3px 10px;" onclick="event.stopPropagation();loadPage(\'jobs\')">View →</button>';
    }
    if (a.type === 'payment') {
      actions += '<span style="font-size:11px;color:#2e7d32;font-weight:700;">✓ Paid</span>';
    }

    // Clickable row — navigate to relevant page
    var clickTarget = { request: 'requests', quote: 'quotes', job: 'jobs', invoice: 'invoices', payment: 'invoices' }[a.type] || '';
    var clickHandler = clickTarget ? 'onclick="loadPage(\'' + clickTarget + '\')"' : '';

    return '<div ' + clickHandler + ' style="background:var(--white);border-radius:12px;padding:14px 16px;border:1px solid var(--border);display:flex;gap:12px;align-items:flex-start;box-shadow:0 1px 3px rgba(0,0,0,0.04);'
      + (a.unread ? 'border-left:3px solid ' + (a.type === 'invoice' ? '#ff9800' : 'var(--green-light)') + ';' : '')
      + (clickTarget ? 'cursor:pointer;' : '')
      + '" '
      + (clickTarget ? 'onmouseover="this.style.boxShadow=\'0 2px 8px rgba(0,0,0,.1)\'" onmouseout="this.style.boxShadow=\'none\'"' : '')
      + '>'
      + '<span style="font-size:20px;flex-shrink:0;">' + icon + '</span>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:14px;"><strong>' + (a.title || '') + '</strong></div>'
      + '<div style="font-size:13px;color:var(--text-light);margin-top:2px;">' + (a.description || '') + '</div>'
      + (actions ? '<div style="display:flex;gap:6px;align-items:center;margin-top:8px;">' + actions + '</div>' : '')
      + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);white-space:nowrap;flex-shrink:0;">' + timeAgo + '</div>'
      + '</div>';
  },

  _hiddenOldCount: 0,

  _buildFeed: function(filterType) {
    var self = NotificationsPage;
    var feed = [];
    var ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
    var thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    function isImportArtifact(d) {
      if (!d) return false;
      var day = d.substring(0, 10);
      return day === '2026-03-21' || day === '2026-03-22';
    }
    var allCount = 0;

    // Requests (last 90 days only)
    var requests = DB.requests.getAll();
    requests.forEach(function(r) {
      allCount++;
      if (r.createdAt && r.createdAt < ninetyDaysAgo) return;
      // Treat literal string 'Unknown' as empty (legacy legacy system-imported requests stored that)
      var cn = (r.clientName || '').trim();
      if (cn.toLowerCase() === 'unknown') cn = '';
      var reqWho = cn || r.phone || r.email || 'New Contact';
      feed.push({ type: 'request', refId: r.id, title: 'New request from ' + reqWho, description: r.property || r.notes || '', date: r.createdAt, unread: r.status === 'new' });
    });

    // Quotes — only meaningful statuses, last 90 days, skip import-date artifacts
    var quotes = DB.quotes.getAll();
    var activeStatuses = { sent: 1, awaiting: 1, approved: 1, declined: 1, converted: 1 };
    quotes.forEach(function(q) {
      if (!activeStatuses[q.status]) return;
      allCount++;
      var actDate = q.updatedAt || q.createdAt;
      if (!actDate || actDate < ninetyDaysAgo) return;
      if (isImportArtifact(actDate)) return;
      var statusLabels = { sent: 'Sent', awaiting: 'Awaiting changes', approved: 'Approved ✓', declined: 'Declined', converted: 'Converted to job' };
      feed.push({ type: 'quote', refId: q.id, title: 'Quote #' + (q.quoteNumber || '') + ' — ' + (q.clientName || ''), description: UI.money(q.total) + ' • ' + (statusLabels[q.status] || q.status), date: actDate });
    });

    // Jobs completed (last 90 days)
    var jobs = DB.jobs.getAll();
    jobs.forEach(function(j) {
      if (j.status !== 'completed') return;
      allCount++;
      var actDate = j.completedDate || j.scheduledDate || j.createdAt;
      if (!actDate || actDate < ninetyDaysAgo) return;
      if (isImportArtifact(actDate)) return;
      feed.push({ type: 'job', refId: j.id, title: 'Job #' + (j.jobNumber || '') + ' completed — ' + (j.clientName || ''), description: j.description || j.property || '', date: actDate });
    });

    // Invoices — paid (last 90 days) + outstanding always shown
    var invoices = DB.invoices.getAll();
    var now = new Date();
    invoices.forEach(function(inv) {
      if (inv.status === 'paid') {
        allCount++;
        var paidDate = inv.paidDate || inv.updatedAt || inv.createdAt;
        if (!paidDate || paidDate < ninetyDaysAgo) return;
        if (isImportArtifact(paidDate)) return;
        feed.push({ type: 'payment', refId: inv.id, title: 'Payment received — ' + (inv.clientName || ''), description: UI.money(inv.total) + ' • Invoice #' + (inv.invoiceNumber || ''), date: paidDate });
      } else if (inv.balance > 0 && inv.status !== 'draft' && inv.status !== 'cancelled') {
        var isOverdue = inv.dueDate && new Date(inv.dueDate) < now;
        feed.push({ type: 'invoice', refId: inv.id, title: 'Invoice #' + (inv.invoiceNumber || '') + (isOverdue ? ' ⚠️ overdue' : ' outstanding'), description: UI.money(inv.balance) + ' remaining • ' + (inv.clientName || ''), date: inv.dueDate || inv.createdAt, unread: isOverdue });
      }
    });

    // Sort by date descending
    feed.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    self._hiddenOldCount = Math.max(0, allCount - feed.length);

    // Apply filter type if provided
    if (filterType && filterType !== 'all') {
      var typeMap = { requests: 'request', quotes: 'quote', jobs: 'job', invoices: 'invoice', payments: 'payment' };
      var ft = typeMap[filterType] || filterType;
      if (filterType === 'invoices') {
        feed = feed.filter(function(a){ return a.type === 'invoice' || a.type === 'payment'; });
      } else {
        feed = feed.filter(function(a){ return a.type === ft; });
      }
    }

    return feed.slice(0, 100);
  },

  _sendInvoiceReminder: function(invId) {
    if (!invId) { loadPage('invoices'); return; }
    var inv = DB.invoices.getById(invId);
    if (!inv) { loadPage('invoices'); return; }
    var client = inv.clientId ? DB.clients.getById(inv.clientId) : null;
    var email = client ? (client.email || '') : '';
    if (!email) { UI.toast('No email on file for this client', 'error'); return; }
    var firstName = (inv.clientName || '').split(' ')[0];
    var subject = 'Invoice #' + (inv.invoiceNumber || '') + ' — Payment Due';
    var co = NotificationsPage._co();
    var body = 'Hi ' + firstName + ',\n\nThis is a friendly reminder that Invoice #' + (inv.invoiceNumber || '') + ' for ' + UI.money(inv.balance) + ' is overdue.\n\nPlease let me know if you have any questions.\n\nThank you,\nDoug\n' + co.name + '\n' + co.phone + '\n' + co.website;
    if (typeof Email !== 'undefined' && Email.send) {
      Email.send({ to: email, subject: subject, body: body }).then(function(r) {
        UI.toast(r.ok ? 'Reminder sent to ' + email : 'Email failed', r.ok ? 'success' : 'error');
      });
    } else {
      window.location.href = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }
  },

  markAllRead: function() {
    // Mark new requests as 'pending' (seen)
    var changed = 0;
    DB.requests.getAll().forEach(function(r) {
      if (r.status === 'new') { DB.requests.update(r.id, { status: 'pending' }); changed++; }
    });
    UI.toast(changed > 0 ? changed + ' item' + (changed !== 1 ? 's' : '') + ' marked as read' : 'All caught up!');
    loadPage('notifications');
  },

  filter: function(type) {
    NotificationsPage._activeFilter = type;
    // Update button active states
    document.querySelectorAll('.filter-btn').forEach(function(btn) {
      var isActive = btn.textContent.toLowerCase() === type;
      btn.style.background = isActive ? 'var(--green-dark)' : '';
      btn.style.color = isActive ? '#fff' : '';
      btn.style.borderColor = isActive ? 'var(--green-dark)' : '';
    });
    // Filter and re-render list
    var activities = NotificationsPage._buildFeed(type);
    var listEl = document.getElementById('activity-list');
    if (listEl) {
      listEl.innerHTML = activities.length
        ? activities.map(function(a) { return NotificationsPage._renderActivity(a); }).join('')
        : '<div style="text-align:center;padding:40px;color:var(--text-light);">No ' + type + ' activity.</div>';
    }
  }
};
