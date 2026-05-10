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

  // v736: match the v724-v732 Activity Feed flyout — bold title + amount,
  // sub-line (ref# · description), small dim client line, timestamp
  // right-aligned at top. Inline action buttons preserved on rows that
  // need them.
  _renderActivity: function(a) {
    var icons = { request: '📥', quote: '📤', quoteApproved: '✅', quoteDeclined: '✗',
                  job: '🌳', invoice: '⚠', payment: '💰', client: '👤', note: '📌' };
    var icon = a.icon || icons[a.type] || '📋';
    var iconBg = a.iconBg || (a.type === 'payment' ? '#e8f5e9' :
                              a.type === 'invoice' ? '#fce4ec' :
                              a.type === 'request' ? '#e8f5e9' :
                              a.type === 'job' ? '#fff3e0' :
                              a.type === 'quote' ? '#e3f2fd' : 'var(--bg)');
    var timeAgo = UI.dateRelative ? UI.dateRelative(a.date) : a.date;

    // Action buttons — kept inline for invoice nudges
    var actions = '';
    if (a.type === 'invoice' && a.unread) {
      actions += '<button class="btn btn-outline" style="font-size:11px;padding:3px 10px;border-color:#ff9800;color:#e07c24;" onclick="event.stopPropagation();NotificationsPage._sendInvoiceReminder(\'' + (a.refId||'') + '\')">📧 Send Reminder</button>';
    }

    // Clickable row navigates to the underlying record's page
    var clickTarget = { request: 'requests', quote: 'quotes', job: 'jobs', invoice: 'invoices', payment: 'invoices' }[a.type] || '';
    var clickHandler = clickTarget ? 'onclick="loadPage(\'' + clickTarget + '\')"' : '';
    var esc = function(s) { return UI.esc ? UI.esc(String(s||'')) : String(s||'').replace(/[<>&]/g, ''); };

    return '<div ' + clickHandler + ' style="background:var(--white);border-radius:12px;padding:14px 18px;border:1px solid var(--border);display:flex;gap:14px;align-items:flex-start;box-shadow:0 1px 3px rgba(0,0,0,0.04);transition:box-shadow .12s;'
      + (a.unread ? 'border-left:3px solid ' + (a.type === 'invoice' ? '#ff9800' : 'var(--green-light)') + ';' : '')
      + (clickTarget ? 'cursor:pointer;' : '')
      + '" '
      + (clickTarget ? 'onmouseover="this.style.boxShadow=\'0 2px 8px rgba(0,0,0,.1)\'" onmouseout="this.style.boxShadow=\'0 1px 3px rgba(0,0,0,.04)\'"' : '')
      + '>'
      // Circular tinted icon
      + '<div style="width:32px;height:32px;border-radius:50%;background:' + iconBg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px;margin-top:1px;">' + icon + '</div>'
      // Body: title row (bold + time-right), sub-line, client line, actions
      + '<div style="flex:1;min-width:0;">'
      +   '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;">'
      +     '<div style="font-size:14px;font-weight:700;color:var(--text);line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;">' + esc(a.title || '') + '</div>'
      +     '<div style="font-size:11px;color:var(--text-light);flex-shrink:0;white-space:nowrap;">' + timeAgo + '</div>'
      +   '</div>'
      +   (a.sub ? '<div style="font-size:12px;color:var(--text-light);line-height:1.35;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(a.sub) + '</div>' : '')
      +   (a.client ? '<div style="font-size:11px;color:var(--text-light);line-height:1.35;margin-top:2px;font-weight:600;">' + esc(a.client) + '</div>' : '')
      +   (actions ? '<div style="display:flex;gap:6px;align-items:center;margin-top:8px;">' + actions + '</div>' : '')
      + '</div>'
      + '</div>';
  },

  _hiddenOldCount: 0,

  _buildFeed: function(filterType) {
    var self = NotificationsPage;
    var feed = [];
    var ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
    function isImportArtifact(d) {
      if (!d) return false;
      var day = d.substring(0, 10);
      return day === '2026-03-21' || day === '2026-03-22';
    }
    var allCount = 0;
    var moneyFn = UI.moneyInt || function(n) { return '$' + (n || 0); };

    // v736: accuracy guards mirroring the v720/v724 flyout — skip events
    // where the client has clearly moved on (job exists / paid invoice
    // exists). Prevents stale "Quote sent" / "Invoice overdue" entries
    // for clients whose work already shipped.
    var clientHasJob = {};
    var clientHasPaid = {};
    DB.jobs.getAll().forEach(function(j) { if (j.clientId) clientHasJob[j.clientId] = 1; });
    DB.invoices.getAll().forEach(function(i) {
      if (!i.clientId) return;
      var paid = (i.status === 'paid') || i.paidAt || i.paidDate || (typeof i.balance === 'number' && i.balance <= 0);
      if (paid) clientHasPaid[i.clientId] = 1;
    });

    // Requests (last 90 days only)
    DB.requests.getAll().forEach(function(r) {
      allCount++;
      if (r.createdAt && r.createdAt < ninetyDaysAgo) return;
      var cn = (r.clientName || '').trim();
      if (cn.toLowerCase() === 'unknown') cn = '';
      var reqWho = cn || r.phone || r.email || 'New Contact';
      feed.push({
        type: 'request', refId: r.id,
        title: 'New request',
        sub: r.property || r.service || r.notes || '',
        client: reqWho,
        date: r.createdAt, unread: r.status === 'new'
      });
    });

    // Quotes — surface on each status's own event timestamp (v725 pattern)
    DB.quotes.getAll().forEach(function(q) {
      var num = q.quoteNumber || (q.id || '').substring(0, 6);
      var amt = q.total ? ' — ' + moneyFn(q.total) : '';
      var desc = q.description || '';
      var who = q.clientName || '';
      // SENT
      if (q.status === 'sent' && !clientHasJob[q.clientId] && q.sentAt && q.sentAt >= ninetyDaysAgo && !isImportArtifact(q.sentAt)) {
        allCount++;
        feed.push({ type: 'quote', refId: q.id, icon: '📤',
          title: 'Quote sent' + amt,
          sub: 'Quote #' + num + (desc ? ' · ' + desc : ''),
          client: who, date: q.sentAt });
      }
      // APPROVED
      if (q.status === 'approved' && !clientHasPaid[q.clientId] && q.approvedAt && q.approvedAt >= ninetyDaysAgo && !isImportArtifact(q.approvedAt)) {
        allCount++;
        feed.push({ type: 'quote', refId: q.id, icon: '✅',
          title: 'Quote approved' + amt,
          sub: 'Quote #' + num + (desc ? ' · ' + desc : ''),
          client: who, date: q.approvedAt });
      }
      // CHANGES REQUESTED / AWAITING — no dedicated stamp, use updatedAt
      if ((q.status === 'awaiting' || q.status === 'changes_requested') && q.updatedAt && q.updatedAt >= ninetyDaysAgo && !isImportArtifact(q.updatedAt)) {
        allCount++;
        feed.push({ type: 'quote', refId: q.id, icon: '💬',
          title: 'Client requested changes',
          sub: 'Quote #' + num + (desc ? ' · ' + desc : ''),
          client: who, date: q.updatedAt });
      }
      // DECLINED
      if (q.status === 'declined' && q.declinedAt && q.declinedAt >= ninetyDaysAgo && !isImportArtifact(q.declinedAt)) {
        allCount++;
        feed.push({ type: 'quote', refId: q.id, icon: '✗',
          title: 'Quote declined' + amt,
          sub: 'Quote #' + num + (desc ? ' · ' + desc : ''),
          client: who, date: q.declinedAt });
      }
      // CONVERTED — leave to job-completed entry so we don't double-count
    });

    // Jobs completed (last 90 days)
    DB.jobs.getAll().forEach(function(j) {
      if (j.status !== 'completed') return;
      allCount++;
      var actDate = j.completedAt || j.completedDate || j.scheduledDate || j.createdAt;
      if (!actDate || actDate < ninetyDaysAgo) return;
      if (isImportArtifact(actDate)) return;
      var num = j.jobNumber || (j.id || '').substring(0, 6);
      var amt = j.total ? ' — ' + moneyFn(j.total) : '';
      feed.push({
        type: 'job', refId: j.id,
        title: 'Job completed' + amt,
        sub: 'Job #' + num + (j.description ? ' · ' + j.description : (j.property ? ' · ' + j.property : '')),
        client: j.clientName || '',
        date: actDate
      });
    });

    // Invoices — paid (recent) + overdue (always while not paid via another path)
    var now = new Date();
    DB.invoices.getAll().forEach(function(inv) {
      var num = inv.invoiceNumber || (inv.id || '').substring(0, 6);
      var who = inv.clientName || '';
      var paidTs = inv.paidDate || inv.paidAt;
      if (inv.status === 'paid' && paidTs && paidTs >= ninetyDaysAgo && !isImportArtifact(paidTs)) {
        allCount++;
        feed.push({
          type: 'payment', refId: inv.id,
          title: 'Payment received' + (inv.total ? ' — ' + moneyFn(inv.total) : ''),
          sub: 'Invoice #' + num,
          client: who, date: paidTs
        });
      }
      if (inv.status !== 'paid' && inv.status !== 'draft' && inv.status !== 'cancelled' && inv.dueDate) {
        var due = new Date(inv.dueDate);
        if (due < now && !clientHasPaid[inv.clientId]) {
          allCount++;
          var bal = (typeof inv.balance === 'number') ? inv.balance : inv.total;
          feed.push({
            type: 'invoice', refId: inv.id,
            title: 'Invoice past due — ' + moneyFn(bal),
            sub: 'Invoice #' + num,
            client: who, date: inv.dueDate, unread: true
          });
        }
      }
    });

    feed.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    self._hiddenOldCount = Math.max(0, allCount - feed.length);

    // Filter
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
