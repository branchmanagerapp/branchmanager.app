/**
 * Branch Manager — Dashboard Page
 */
var DashboardPage = {
  render: function() {
    // One-time fix: mark legacy system-migrated completed jobs as already invoiced
    if (!localStorage.getItem('bm-legacy-jobs-fixed')) {
      DB.jobs.getAll().forEach(function(j) {
        if (j.status === 'completed' && !j.invoiceId) DB.jobs.update(j.id, { invoiceId: 'legacy' });
      });
      localStorage.setItem('bm-legacy-jobs-fixed', '1');
    }
    // Auto-expire quotes past their expiry date
    var today = new Date().toISOString().split('T')[0];
    DB.quotes.getAll().forEach(function(q) {
      if (q.expiresAt && q.expiresAt < today && (q.status === 'sent' || q.status === 'awaiting')) {
        DB.quotes.update(q.id, { status: 'expired' });
      }
    });

    var unpaidInvoices = DB.invoices.getAll().filter(function(i) { return i.status !== 'paid' && i.balance > 0; });

    // Show sync banner if no local data but Supabase is connected
    var localClients = JSON.parse(localStorage.getItem('bm-clients') || '[]');
    var html = '';

    // === GREETING (show first on mobile) ===
    var now = new Date();
    var dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var monthFull = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var hour = now.getHours();
    var greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    // Prefer Auth.user.name; fall back to email local-part; then saved company ownerName; final 'there'
    var userName = 'there';
    if (typeof Auth !== 'undefined' && Auth.user) {
      if (Auth.user.name) userName = Auth.user.name;
      else if (Auth.user.email) {
        var lp = Auth.user.email.split('@')[0].replace(/[._-]+/g, ' ').trim();
        userName = lp.charAt(0).toUpperCase() + lp.slice(1);
      }
    }
    if (userName === 'there' && typeof BM_CONFIG !== 'undefined' && BM_CONFIG.ownerName) {
      userName = BM_CONFIG.ownerName;
    }
    // Also backfill Auth.user.name so future loads show it without refreshing the session
    if (typeof Auth !== 'undefined' && Auth.user && !Auth.user.name && userName !== 'there') {
      Auth.user.name = userName;
      try { localStorage.setItem('bm-session', JSON.stringify(Auth.user)); } catch(e){}
    }
    // Greeting + monthly goal progress inline
    var allInvoicesEarly = DB.invoices.getAll();
    var _goalData = JSON.parse(localStorage.getItem('bm-revenue-goals') || '{"annual":300000,"monthly":25000}');
    var _monthRevenue = allInvoicesEarly.filter(function(i) {
      var d = new Date(i.createdAt || i.issuedDate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && (i.status === 'paid' || i.status === 'collected');
    }).reduce(function(s, i) { return s + Number(i.total || 0);}, 0);
    var _monthPct = _goalData.monthly > 0 ? Math.min(Math.round((_monthRevenue / _goalData.monthly) * 100), 100) : 0;

    html += '<div style="margin-bottom:16px;">'
      + '<div style="font-size:13px;color:var(--text-light);display:flex;align-items:center;gap:10px;">'
      + '<span>' + dayNames[now.getDay()] + ', ' + monthFull[now.getMonth()] + ' ' + now.getDate() + '</span>'
      + '<span id="dash-date-weather"></span>'
      + '</div>'
      + '<h2 style="font-size:28px;font-weight:700;margin-top:2px;">' + greeting + ', ' + userName.split(' ')[0] + '</h2>'
      + '</div>';

    // Branch Cam widget removed from dashboard per user request — still accessible via Tools → Branch Cam.

    // Money-on-the-Table widget was permanently removed Apr 19, 2026 — same signals
    // are surfaced in the Smart Daily Briefing + Ready-to-Invoice cards below.

    if (localClients.length === 0 && typeof SupabaseDB !== 'undefined' && SupabaseDB && SupabaseDB.DEFAULT_URL) {
      html += '<div style="padding:16px;background:#e3f2fd;border-radius:10px;border-left:4px solid #1976d2;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">'
        + '<div><strong style="color:#1565c0;">Your data is in the cloud</strong>'
        + '<div style="font-size:13px;color:#555;margin-top:4px;">535 clients, 433 quotes, 259 jobs, 348 invoices ready to sync.</div></div>'
        + '<button class="btn btn-primary" onclick="DashboardPage.syncNow()" id="sync-btn" style="white-space:nowrap;">Sync Now</button>'
        + '</div>';
    }
    // Pre-compute data needed for both action alerts and revenue chart
    var allInvoices = DB.invoices.getAll();
    var allQuotes = DB.quotes.getAll();
    var allJobs = DB.jobs.getAll();
    var now = new Date();
    var sixMonthsAgo = new Date(now.getTime() - 180 * 86400000);

    // Greeting moved to top of page (above MOTT)

    // Smart Daily Briefing — built early but rendered LATER, after Today's Jobs.
    // Per Doug's request: only show when no jobs today OR all today's jobs done,
    // and each insight individually dismissible via per-item X. Dismissed IDs
    // live in localStorage keyed by date so they reset at midnight rollover.
    var briefingDateStr = now.getFullYear() + '-' + (now.getMonth() + 1 < 10 ? '0' : '') + (now.getMonth() + 1) + '-' + (now.getDate() < 10 ? '0' : '') + now.getDate();
    var briefingInsights = [];
    {
      var bOverdue = allInvoices.filter(function(i) { return i.status !== 'paid' && i.balance > 0 && i.dueDate && new Date(i.dueDate) < now; });
      var bOverdueTotal = bOverdue.reduce(function(s, i) { return s + Number(i.balance || 0);}, 0);
      if (bOverdue.length > 0) {
        briefingInsights.push({
          icon: '🔴',
          text: 'You have ' + bOverdue.length + ' overdue invoice' + (bOverdue.length > 1 ? 's' : '') + ' worth ' + UI.money(bOverdueTotal) + ' — follow up today',
          action: 'InvoicesPage._setFilter(\'overdue\');loadPage(\'invoices\');'
        });
      }
      var bSevenAgo = new Date(now.getTime() - 7 * 86400000);
      var b180Ago = new Date(now.getTime() - 180 * 86400000);
      var bStaleQuotes = allQuotes.filter(function(q) {
        return q.status === 'sent' && q.createdAt
          && new Date(q.createdAt) < bSevenAgo
          && new Date(q.createdAt) > b180Ago; // only last 6 months
      });
      if (bStaleQuotes.length > 0) {
        briefingInsights.push({
          icon: '⏳',
          text: bStaleQuotes.length + ' quote' + (bStaleQuotes.length > 1 ? 's' : '') + ' sent 7+ days ago need follow-up',
          action: 'loadPage(\'quotes\');'
        });
      }
      var cutoff60str = new Date(now.getTime() - 60 * 86400000).toISOString().split('T')[0];
      var cutoff7str = new Date(now.getTime() - 7 * 86400000).toISOString();
      var bNeedsInvoicing = allJobs.filter(function(j) {
        if (j.status !== 'completed' || j.invoiceId) return false;
        return (j.scheduledDate && j.scheduledDate >= cutoff60str)
            || (!j.scheduledDate && (j.createdAt || '') > cutoff7str);
      });
      var bNeedsInvTotal = bNeedsInvoicing.reduce(function(s, j) { return s + (j.total || 0); }, 0);
      if (bNeedsInvoicing.length > 0) {
        briefingInsights.push({
          icon: '💵',
          text: bNeedsInvoicing.length + ' recent completed job' + (bNeedsInvoicing.length > 1 ? 's' : '') + ' haven\'t been invoiced — ' + UI.money(bNeedsInvTotal) + ' waiting',
          action: 'loadPage(\'jobs\');'
        });
      }
      var bTodayStr = briefingDateStr;
      var bTodayJobs = allJobs.filter(function(j) { return j.scheduledDate && j.scheduledDate.substring(0, 10) === bTodayStr && j.status !== 'completed'; });
      if (bTodayJobs.length === 0) {
        briefingInsights.push({
          icon: '🌤',
          text: 'No jobs scheduled today — good day for estimates',
          action: 'loadPage(\'schedule\');'
        });
      } else {
        briefingInsights.push({
          icon: '📋',
          text: bTodayJobs.length + ' job' + (bTodayJobs.length > 1 ? 's' : '') + ' on the schedule today — let\'s get after it',
          action: 'loadPage(\'schedule\');'
        });
      }
      var bNewRequests = DB.requests.getAll().filter(function(r) { return r.status === 'new'; });
      if (bNewRequests.length > 0) {
        briefingInsights.push({
          icon: '📥',
          text: bNewRequests.length + ' new request' + (bNewRequests.length > 1 ? 's' : '') + ' came in — respond within 2 hours for best conversion',
          action: 'loadPage(\'requests\');'
        });
      }
      var bThisMonth = allInvoices.filter(function(i) {
        var d = new Date(i.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && (i.status === 'paid' || i.status === 'collected');
      }).reduce(function(s, i) { return s + Number(i.total || 0);}, 0);
      var bLastMonth = allInvoices.filter(function(i) {
        var lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        var ly = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        var d = new Date(i.createdAt);
        return d.getMonth() === lm && d.getFullYear() === ly && (i.status === 'paid' || i.status === 'collected');
      }).reduce(function(s, i) { return s + Number(i.total || 0);}, 0);
      if (bThisMonth > 0 || bLastMonth > 0) {
        var bAhead = bThisMonth >= bLastMonth;
        briefingInsights.push({
          icon: bAhead ? '📈' : '📉',
          text: 'This month\'s revenue (' + UI.money(bThisMonth) + ') is ' + (bAhead ? 'ahead of' : 'behind') + ' last month (' + UI.money(bLastMonth) + ')',
          action: 'loadPage(\'profitloss\');'
        });
      }

      // Stable per-insight IDs (hash of icon + text). Used to track which
      // individual insights are dismissed for today.
      briefingInsights.forEach(function(b) {
        var key = (b.icon || '') + '|' + (b.text || '');
        var h = 0; for (var i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
        b.id = 'bf' + Math.abs(h).toString(36);
      });
      // Filter against per-item dismissals stored as { "YYYY-MM-DD": ["bfABC", ...] }
      var dismissedMap = {};
      try { dismissedMap = JSON.parse(localStorage.getItem('bm-briefing-dismissed-items') || '{}'); } catch(e) {}
      var dismissedToday = dismissedMap[briefingDateStr] || [];
      briefingInsights = briefingInsights.filter(function(b) { return dismissedToday.indexOf(b.id) === -1; });
      // Cap at 5
      briefingInsights = briefingInsights.slice(0, 5);
    }

    // Expose insights to TaskReminders.getDashboardWidget (reads window.__bmBriefingInsights)
    window.__bmBriefingInsights = briefingInsights;

    // legacy system-style Workflow cards (2x2 grid)
    var overdueInvoices = unpaidInvoices.filter(function(i) { return i.dueDate && new Date(i.dueDate) < now; });
    var unapprovedQuotes = allQuotes.filter(function(q) { return q.status === 'sent' || q.status === 'awaiting'; });
    var draftQuotes = allQuotes.filter(function(q) { return q.status === 'draft'; });
    var changesQuotes = allQuotes.filter(function(q) { return q.status === 'changes_requested'; });
    var approvedQuotes = allQuotes.filter(function(q) { return q.status === 'approved'; });
    var lateJobs = allJobs.filter(function(j) { return j.status === 'late'; });
    var activeJobs = allJobs.filter(function(j) { return j.status === 'in_progress' || j.status === 'scheduled'; });
    var ago90dash = new Date(now.getTime() - 90 * 86400000);
    var needsInvoicing = allJobs.filter(function(j) {
      if (j.status !== 'completed' || j.invoiceId) return false;
      return j.createdAt && new Date(j.createdAt) > ago90dash;
    });
    var actionJobs = allJobs.filter(function(j) { return j.status === 'action_required'; });
    var sentInvoices = allInvoices.filter(function(i) { return i.status === 'sent' && (!i.dueDate || new Date(i.dueDate) >= now); });
    var draftInvoices = allInvoices.filter(function(i) { return i.status === 'draft'; });

    var reqTotal = allQuotes.filter(function(q){return q.status==='approved'||q.status==='converted';}).reduce(function(s,q){return s+(q.total||0);},0);
    var activeJobTotal = activeJobs.reduce(function(s,j){return s+(j.total||0);},0);
    var draftInvTotal = draftInvoices.reduce(function(s,i){return s+Number(i.total||0);},0);
    var overdueTotal = overdueInvoices.reduce(function(s,i){return s+Number(i.balance||0);},0);

    // ── Call Center snapshot (async-filled after render) ──
    var _ccCollapsed = localStorage.getItem('bm-dash-cc-collapsed') === '1';
    html += '<div id="dash-callcenter-widget" style="background:var(--white);border-radius:12px;padding:12px 16px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:' + (_ccCollapsed ? '0' : '12px') + ';">'
      + '<div><h3 style="font-size:16px;font-weight:700;margin:0;">Leads Center</h3>'
      + '<div id="dash-cc-badge" style="font-size:12px;color:var(--text-light);margin-top:2px;">Loading…</div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;align-items:center;">'
      + '<button onclick="loadPage(\'callcenter\')" style="background:none;border:1px solid var(--border);height:32px;padding:0 14px;border-radius:6px;font-size:13px;cursor:pointer;color:var(--accent);">Open →</button>'
      + '<button id="dash-cc-collapse-btn" onclick="DashboardPage._toggleCCCollapse()" title="Collapse" style="background:none;border:1px solid var(--border);height:32px;width:32px;border-radius:6px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;">' + (_ccCollapsed ? '▾' : '▴') + '</button>'
      + '</div>'
      + '</div>'
      + '<div id="dash-cc-items" style="' + (_ccCollapsed ? 'display:none;' : '') + '"></div>'
      + '</div>';
    setTimeout(function() { if (typeof DashboardPage !== 'undefined') DashboardPage._fillCallCenterWidget(); }, 80);
    setTimeout(function() { if (typeof DashboardPage !== 'undefined') DashboardPage._fillDateWeather(); }, 120);

    // ── Today's Jobs (v419: hoisted to top; collapses to compact pill when empty) ──
    var __td = now.getFullYear() + '-' + (now.getMonth()+1<10?'0':'') + (now.getMonth()+1) + '-' + (now.getDate()<10?'0':'') + now.getDate();
    var __todayJobs = allJobs.filter(function(j) { return j.scheduledDate && j.scheduledDate.substring(0,10) === __td; });
    var __todayDone = __todayJobs.filter(function(j) { return j.status === 'completed'; }).length;
    if (__todayJobs.length === 0) {
      html += '<div onclick="loadPage(\'schedule\')" style="background:var(--white);border-radius:10px;padding:10px 16px;border:1px solid var(--border);margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-size:13px;color:var(--text-light);">'
        + '<span><strong style="color:var(--text);">Jobs</strong> · No jobs scheduled today</span>'
        + '<span style="color:var(--accent);font-size:12px;">Open Schedule →</span>'
        + '</div>';
    } else {
      html += '<div style="background:var(--white);border-radius:12px;padding:18px 20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
        + '<div><h3 style="font-size:16px;font-weight:700;margin:0;">Jobs</h3>'
        + '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">' + __todayDone + ' of ' + __todayJobs.length + ' complete</div>'
        + '</div>'
        + '<button onclick="event.stopPropagation();loadPage(\'schedule\')" style="background:none;border:1px solid var(--border);padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;color:var(--accent);">View Schedule →</button>'
        + '</div>';
      __todayJobs.forEach(function(j) {
        var sc = j.status === 'completed' ? '#2e7d32' : j.status === 'in_progress' ? '#e07c24' : '#1565c0';
        var sb = j.status === 'completed' ? '#e8f5e9' : j.status === 'in_progress' ? '#fff3e0' : '#e3f2fd';
        html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="loadPage(\'jobs\');setTimeout(function(){JobsPage.showDetail(\'' + j.id + '\');},100);">'
          + '<div style="width:8px;height:8px;border-radius:50%;background:' + sc + ';flex-shrink:0;"></div>'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-size:14px;font-weight:600;">' + UI.esc(j.clientName || '—') + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(j.description || j.property || '') + '</div>'
          + '</div>'
          + (j.startTime ? '<div style="font-size:12px;color:var(--text-light);flex-shrink:0;">' + j.startTime + '</div>' : '')
          + '<span style="background:' + sb + ';color:' + sc + ';padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;flex-shrink:0;">' + (j.status||'').replace('_',' ').replace(/\b\w/g,function(c){return c.toUpperCase();}) + '</span>'
          + '<div style="font-size:13px;font-weight:700;flex-shrink:0;">' + UI.money(j.total||0) + '</div>'
          + '</div>';
      });
      html += '</div>';
    }

    // ── Tasks for Today widget (replaces old briefing card) ──
    // Shows manual tasks from TaskReminders + AI suggestions in one card.
    // Always visible; AI suggestions shown at the bottom so real tasks stay primary.
    if (typeof TaskReminders !== 'undefined') {
      html += TaskReminders.getDashboardWidget();
    }

    // v619: 2-column dashboard layout — main (workflow + lead sources) /
    // rail (receivables, inbox, action alerts). Single column on mobile.
    html += '<style>'
      + '.dash-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:18px;align-items:start;}'
      + '.dash-main,.dash-rail{min-width:0;}'
      + '@media(max-width:900px){.dash-grid{grid-template-columns:1fr;}}'
      + '</style>';
    html += '<div class="dash-grid"><div class="dash-main">';

    html += '<h3 style="font-size:18px;font-weight:700;margin-bottom:12px;">Workflow</h3>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px;background:var(--white);box-shadow:0 1px 3px rgba(0,0,0,0.04);">';

    // Requests card
    var allRequests = DB.requests.getAll();
    var newRequests = allRequests.filter(function(r) { return r.status === 'new'; });
    var assessedRequests = allRequests.filter(function(r) { return r.status === 'assessment_complete'; });
    var overdueRequests = allRequests.filter(function(r) {
      if (r.status === 'converted' || r.status === 'quoted' || r.status === 'archived') return false;
      return (Date.now() - new Date(r.createdAt || 0)) / 86400000 > 3;
    });
    html += '<div onclick="loadPage(\'requests\')" style="padding:16px 20px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);cursor:pointer;position:relative;">'
      + '<div style="position:absolute;top:0;left:0;right:0;height:4px;background:#e07c24;"></div>'
      + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;color:var(--text-light);font-size:12px;font-weight:600;"><i data-lucide="inbox" style="width:14px;height:14px;vertical-align:middle;"></i> Requests</div>'
      + '<div style="font-size:32px;font-weight:700;">' + newRequests.length + '</div>'
      + '<div style="font-size:14px;font-weight:600;">New</div>'
      + '<div style="font-size:12px;color:var(--text-light);margin-top:6px;">Assessments complete (' + assessedRequests.length + ')</div>'
      + '<div style="font-size:12px;color:' + (overdueRequests.length > 0 ? 'var(--red)' : 'var(--text-light)') + ';">Overdue (' + overdueRequests.length + ')</div>'
      + '</div>';

    // Quotes card
    var awaitingQuotes = allQuotes.filter(function(q) { return q.status === 'sent' || q.status === 'awaiting'; });
    html += '<div onclick="loadPage(\'quotes\')" style="padding:16px 20px;border-bottom:1px solid var(--border);cursor:pointer;position:relative;">'
      + '<div style="position:absolute;top:0;left:0;right:0;height:4px;background:#8b2252;"></div>'
      + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;color:var(--text-light);font-size:12px;font-weight:600;"><i data-lucide="file-text" style="width:14px;height:14px;vertical-align:middle;"></i> Quotes</div>'
      + '<div style="font-size:32px;font-weight:700;display:inline;">' + approvedQuotes.length + '</div>'
      + '<span style="font-size:14px;color:var(--text-light);margin-left:6px;">' + UI.moneyInt(reqTotal) + '</span>'
      + '<div style="font-size:14px;font-weight:600;">Approved</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-light);margin-top:6px;"><span>Draft (' + draftQuotes.length + ')</span><span>' + UI.moneyInt(draftQuotes.reduce(function(s,q){return s+(q.total||0);},0)) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-light);"><span>Changes requested (' + changesQuotes.length + ')</span><span>' + UI.moneyInt(changesQuotes.reduce(function(s,q){return s+(q.total||0);},0)) + '</span></div>'
      + '</div>';

    // Jobs card
    html += '<div onclick="loadPage(\'jobs\')" style="padding:16px 20px;border-right:1px solid var(--border);cursor:pointer;position:relative;">'
      + '<div style="position:absolute;top:0;left:0;right:0;height:4px;background:#2e7d32;"></div>'
      + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;color:var(--text-light);font-size:12px;font-weight:600;"><i data-lucide="wrench" style="width:14px;height:14px;vertical-align:middle;"></i> Jobs</div>'
      + '<div style="font-size:32px;font-weight:700;">' + needsInvoicing.length + '</div>'
      + '<div style="font-size:14px;font-weight:600;">Requires invoicing</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-light);margin-top:6px;"><span>Active (' + activeJobs.length + ')</span><span>' + UI.moneyInt(activeJobTotal) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-light);"><span>Action required (' + (actionJobs.length + lateJobs.length) + ')</span><span>' + UI.moneyInt(lateJobs.reduce(function(s,j){return s+(j.total||0);},0)) + '</span></div>'
      + '</div>';

    // Invoices card
    html += '<div onclick="loadPage(\'invoices\')" style="padding:16px 20px;cursor:pointer;position:relative;">'
      + '<div style="position:absolute;top:0;left:0;right:0;height:4px;background:#1565c0;"></div>'
      + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;color:var(--text-light);font-size:12px;font-weight:600;"><i data-lucide="receipt" style="width:14px;height:14px;vertical-align:middle;"></i> Invoices</div>'
      + '<div style="font-size:32px;font-weight:700;display:inline;">' + unpaidInvoices.length + '</div>'
      + '<span style="font-size:14px;color:var(--text-light);margin-left:6px;">' + UI.moneyInt(unpaidInvoices.reduce(function(s,i){return s+Number(i.balance||0);},0)) + '</span>'
      + '<div style="font-size:14px;font-weight:600;">Awaiting payment</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-light);margin-top:6px;"><span>Draft (' + draftInvoices.length + ')</span><span>' + UI.moneyInt(draftInvTotal) + '</span></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;color:' + (overdueInvoices.length ? 'var(--red)' : 'var(--text-light)') + ';"><span>Past due (' + overdueInvoices.length + ')</span><span>' + UI.moneyInt(overdueTotal) + '</span></div>'
      + '</div>';

    html += '</div>';

    // v619: workflow grid lives in main column; everything below moves to
    // the right rail (Receivables first, then Inbox, then action alerts).
    html += '</div><div class="dash-rail">';

    // v620: rail cards — collapsible <details> with colored top bar matching
    // the workflow card colors (Requests=orange, Quotes=purple, Jobs=green,
    // Invoices=blue). Receivables open by default; rest collapsed since their
    // counts already appear in the Workflow grid above.
    var railCard = function(opts) {
      // opts: { color, title, count, total, totalColor, body, open }
      return '<details ' + (opts.open ? 'open' : '') + ' style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin-bottom:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
        +   '<div style="height:3px;background:' + opts.color + ';"></div>'
        +   '<summary style="padding:12px 18px;list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">'
        +     '<span style="font-size:14px;font-weight:700;">' + opts.title + '</span>'
        +     '<span style="display:flex;align-items:center;gap:10px;">'
        +       (opts.count != null ? '<span style="font-size:11px;color:var(--text-light);">' + opts.count + '</span>' : '')
        +       '<span style="font-size:15px;font-weight:800;color:' + (opts.totalColor || opts.color) + ';">' + opts.total + '</span>'
        +       '<span style="font-size:11px;color:var(--text-light);">▾</span>'
        +     '</span>'
        +   '</summary>'
        +   '<div style="padding:4px 18px 14px;">' + opts.body + '</div>'
        + '</details>';
    };

    // Receivables panel — top of rail, OPEN by default
    var rcvUnpaid = DB.invoices.getAll().filter(function(i) { return (i.status === 'sent' || i.status === 'overdue' || i.status === 'partial') && (i.balance || i.total || 0) > 0; });
    var rcvTotalOwed = rcvUnpaid.reduce(function(s, i) { return s + (Number(i.balance) || Number(i.total) || 0);}, 0);
    if (rcvUnpaid.length > 0) {
      rcvUnpaid.sort(function(a, b) { return (b.balance || b.total || 0) - (a.balance || a.total || 0); });
      // v636: roll the Overdue Invoices count into the Receivables card so
      // the dropped collapsed card's info isn't lost.
      var rcvOverdueTotal = overdueInvoices.reduce(function(s, i) { return s + (Number(i.balance) || Number(i.total) || 0);}, 0);
      var rcvBody = '';
      rcvUnpaid.slice(0, 6).forEach(function(inv) {
        var daysLate = inv.dueDate ? Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000) : 0;
        var lateColor = daysLate > 30 ? '#dc3545' : daysLate > 0 ? '#e65100' : 'var(--text-light)';
        rcvBody += '<div onclick="InvoicesPage.showDetail(\'' + inv.id + '\')" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;">'
          + '<span style="font-size:14px;font-weight:600;">' + UI.esc(inv.clientName || '') + '</span>'
          + '<div style="text-align:right;">'
          + '<span style="font-weight:700;">' + UI.money(inv.balance || inv.total) + '</span>'
          + (daysLate > 0 ? '<span style="font-size:11px;color:' + lateColor + ';margin-left:8px;">' + daysLate + 'd late</span>' : '')
          + '</div></div>';
      });
      // Prepend an overdue-summary line to the body when applicable
      if (overdueInvoices.length > 0) {
        rcvBody = '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;margin-bottom:8px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;">'
          + '<span style="font-size:12px;font-weight:600;color:#991b1b;">⚠ ' + overdueInvoices.length + ' invoice' + (overdueInvoices.length !== 1 ? 's' : '') + ' overdue</span>'
          + '<span style="font-size:13px;font-weight:800;color:#991b1b;">' + UI.moneyInt(rcvOverdueTotal) + '</span>'
          + '</div>'
          + rcvBody;
      }
      html += railCard({
        color: '#1565c0',
        title: 'Receivables',
        count: rcvUnpaid.length + ' client' + (rcvUnpaid.length !== 1 ? 's' : ''),
        total: UI.moneyInt(rcvTotalOwed),
        totalColor: 'var(--green-dark)',
        body: rcvBody,
        open: true
      });
    }

    // ── Inbox — unified "what needs your attention" surface ────────────────
    // Replaces the old two-card Ready-to-Convert / Ready-to-Invoice strip
    // with one richer feed. Pulls from quotes, jobs, invoices, requests,
    // clients (needs_review), and chat unread (if available).
    var inboxItems = [];
    var cutoff60dash = new Date(now.getTime() - 60 * 86400000).toISOString().split('T')[0];
    var cutoff7dash  = new Date(now.getTime() - 7  * 86400000).toISOString();
    var cutoff5dash  = new Date(now.getTime() - 5  * 86400000).toISOString();
    var todayStrIb   = now.toISOString().substring(0, 10);

    // 1. Approved quotes ready to convert to jobs
    allQuotes.filter(function(q) { return q.status === 'approved' && !q.convertedJobId; })
      .forEach(function(q) {
        inboxItems.push({
          icon: 'check-circle', tone: 'green',
          label: 'Approved quote — ' + (q.clientName || 'client'),
          sub: UI.money(q.total) + ' · ready to schedule',
          actionLabel: '+ Job',
          onclick: 'var j=Workflow.quoteToJob(\'' + q.id + '\');if(j){loadPage(\'dashboard\');}'
        });
      });

    // 2. Completed jobs without an invoice
    allJobs.filter(function(j) {
      if (j.status !== 'completed' || j.invoiceId) return false;
      return (j.scheduledDate && j.scheduledDate >= cutoff60dash)
          || (!j.scheduledDate && (j.createdAt || '') > cutoff7dash);
    }).forEach(function(j) {
      inboxItems.push({
        icon: 'receipt', tone: 'amber',
        label: 'Bill the job — ' + (j.clientName || 'client'),
        sub: UI.money(j.total) + ' · ' + (j.scheduledDate || 'recent'),
        actionLabel: '+ Invoice',
        onclick: 'var inv=Workflow.jobToInvoice(\'' + j.id + '\');if(inv){loadPage(\'dashboard\');}'
      });
    });

    // 3. Clients flagged needs_review (manual merges, etc.)
    (typeof DB !== 'undefined' && DB.clients ? DB.clients.getAll() : []).filter(function(c) {
      return c.needsReview === true;
    }).forEach(function(c) {
      inboxItems.push({
        icon: 'user-search', tone: 'amber',
        label: 'Review client — ' + (c.name || c.firstName || 'unnamed'),
        sub: 'Open the client to confirm the merge notes',
        actionLabel: 'Review',
        onclick: 'ClientsPage.showDetail(\'' + c.id + '\')'
      });
    });

    // 4. New requests (last 7 days, status='new')
    var allReqs = (typeof DB !== 'undefined' && DB.requests ? DB.requests.getAll() : []);
    allReqs.filter(function(r) {
      return r.status === 'new' && r.createdAt && r.createdAt > cutoff7dash;
    }).slice(0, 5).forEach(function(r) {
      inboxItems.push({
        icon: 'inbox', tone: 'blue',
        label: 'New request — ' + (r.clientName || r.client_name || r.email || r.phone || 'website'),
        sub: (r.title || r.service || 'Service request') + ' · ' + (r.property || ''),
        actionLabel: 'Open',
        onclick: 'loadPage(\'requests\')'
      });
    });

    // 5. Overdue invoices
    allInvoices.filter(function(i) {
      return i.status !== 'paid' && i.status !== 'draft' && i.dueDate && i.dueDate < todayStrIb && (i.balance || i.total) > 0;
    }).slice(0, 5).forEach(function(i) {
      inboxItems.push({
        icon: 'alert-circle', tone: 'red',
        label: 'Overdue — ' + (i.clientName || 'client'),
        sub: UI.money(i.balance || i.total) + ' · due ' + (i.dueDate || ''),
        actionLabel: 'Open',
        onclick: 'InvoicesPage.showDetail(\'' + i.id + '\')'
      });
    });

    // 6. Quotes sent 5+ days ago with no response
    allQuotes.filter(function(q) {
      return q.status === 'sent' && q.sentAt && q.sentAt < cutoff5dash;
    }).slice(0, 5).forEach(function(q) {
      inboxItems.push({
        icon: 'mail-question', tone: 'amber',
        label: 'Stale quote — ' + (q.clientName || 'client'),
        sub: UI.money(q.total) + ' · sent ' + (q.sentAt || '').substring(0, 10),
        actionLabel: 'Follow up',
        onclick: 'QuotesPage.showDetail(\'' + q.id + '\')'
      });
    });

    // 7. Jobs stuck `scheduled` with no date (fell off the calendar)
    // v416: surfaces clients like Greg Ellson #279 / Denise Weber #175 — work
    // marked scheduled but never assigned a date. Either work happened off-the-
    // books OR customer ghosted; either way Doug needs to reconcile.
    allJobs.filter(function(j) {
      return j.status === 'scheduled' && !j.scheduledDate;
    }).slice(0, 5).forEach(function(j) {
      inboxItems.push({
        icon: 'calendar-x', tone: 'amber',
        label: 'Unscheduled job — ' + (j.clientName || 'client'),
        sub: UI.money(j.total) + ' · #' + (j.jobNumber || j.id.substring(0,8)) + ' · status:scheduled, no date',
        actionLabel: 'Open',
        onclick: 'JobsPage.showDetail(\'' + j.id + '\')'
      });
    });

    // 8. Jobs marked `late` with scheduled_date 30+ days past
    var cutoff30dash = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
    allJobs.filter(function(j) {
      return j.status === 'late' && j.scheduledDate && j.scheduledDate < cutoff30dash;
    }).slice(0, 5).forEach(function(j) {
      var monthsAgo = Math.round((now.getTime() - new Date(j.scheduledDate).getTime()) / (30 * 86400000));
      inboxItems.push({
        icon: 'clock-alert', tone: 'red',
        label: 'Stale-late job — ' + (j.clientName || 'client'),
        sub: UI.money(j.total) + ' · #' + (j.jobNumber || j.id.substring(0,8)) + ' · ' + monthsAgo + ' month' + (monthsAgo === 1 ? '' : 's') + ' overdue',
        actionLabel: 'Open',
        onclick: 'JobsPage.showDetail(\'' + j.id + '\')'
      });
    });

    if (inboxItems.length > 0) {
      html += '<div style="background:var(--white);border-radius:12px;padding:18px 20px;border:1px solid #c8e6c9;box-shadow:0 1px 3px rgba(0,0,0,0.04);margin-bottom:16px;">'
        +   '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'
        +     '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="inbox" style="width:18px;height:18px;color:var(--green-dark);"></i><strong style="font-size:15px;color:var(--green-dark);">Needs your attention</strong>'
        +     '<span style="font-size:12px;font-weight:600;background:var(--green-bg);color:var(--green-dark);padding:2px 8px;border-radius:999px;">' + inboxItems.length + '</span></div>'
        +   '</div>';
      var TONE = { green:'var(--green-dark)', amber:'#e65100', blue:'#1565c0', red:'#c62828' };
      // v417: sort by urgency before slicing — red first, then amber, blue, green.
      // Stops urgent items (overdue invoices, stale-late jobs) from being hidden
      // behind the 8-item cap when an inbox is full.
      var TONE_PRIORITY = { red: 0, amber: 1, blue: 2, green: 3 };
      inboxItems.sort(function(a, b) {
        return (TONE_PRIORITY[a.tone] || 99) - (TONE_PRIORITY[b.tone] || 99);
      });
      inboxItems.slice(0, 8).forEach(function(it) {
        var color = TONE[it.tone] || 'var(--text)';
        html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--bg);">'
          +     '<i data-lucide="' + it.icon + '" style="width:18px;height:18px;color:' + color + ';flex-shrink:0;"></i>'
          +     '<div style="min-width:0;flex:1;">'
          +       '<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(it.label) + '</div>'
          +       '<div style="font-size:11px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(it.sub) + '</div>'
          +     '</div>'
          +     '<button onclick="' + it.onclick + '" style="background:' + color + ';color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;">' + it.actionLabel + '</button>'
          +   '</div>';
      });
      if (inboxItems.length > 8) {
        html += '<div style="font-size:12px;color:var(--text-light);margin-top:8px;text-align:center;">+ ' + (inboxItems.length - 8) + ' more</div>';
      }
      html += '</div>';
    }

    // Daily Vehicle Inspection widget moved to Jobs + Crew View (Apr 19 2026).
    // If you miss it here, call DailyInspection.render() and paste.

    // (v419: Today's Jobs hoisted to top of dashboard. See block ~line 215.)

    // Action Items section
    var overdueInvCount = overdueInvoices.length;
    var overdueInvTotal = overdueTotal;
    var sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    var expiringQuotes = allQuotes.filter(function(q) {
      return q.status === 'sent' && q.createdAt
        && new Date(q.createdAt) < sevenDaysAgo
        && new Date(q.createdAt) > sixMonthsAgo;
    });
    var unscheduledJobs = allJobs.filter(function(j) {
      return (j.status === 'in_progress' || j.status === 'scheduled') && !j.scheduledDate;
    });
    var unsignedQuotes = allQuotes.filter(function(q) {
      if (q.status !== 'sent' && q.status !== 'awaiting') return false;
      return !q.createdAt || new Date(q.createdAt) > sixMonthsAgo;
    });

    // v636: Removed the 3 collapsed rail cards (Overdue Invoices, Quotes
    // Need Follow-up, Needs Scheduling) — every item they listed already
    // surfaces in the "Needs your attention" feed above. Doug confirmed
    // they were redundant noise. The data prep blocks above
    // (overdueInvCount, expiringQuotes, unscheduledJobs) stay in case
    // future logic needs them.

    // v619: Receivables moved up to top of rail; close rail + grid before
    // the Lead Sources chart (which renders full-width below).
    html += '</div></div>'; // close .dash-rail + .dash-grid

    // Lead Sources — small widget showing where new clients have been coming from (last 90 days)
    try {
      var _90ago = Date.now() - 90 * 86400000;
      var _recentClients = DB.clients.getAll().filter(function(c) {
        return c.createdAt && new Date(c.createdAt).getTime() >= _90ago;
      });
      if (_recentClients.length > 0) {
        var _srcMap = {};
        _recentClients.forEach(function(c) {
          var s = (c.source && c.source.trim()) || '(unknown)';
          _srcMap[s] = (_srcMap[s] || 0) + 1;
        });
        var _sorted = Object.keys(_srcMap).sort(function(a, b) { return _srcMap[b] - _srcMap[a]; });
        var _max = _srcMap[_sorted[0]] || 1;
        html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:18px;margin-bottom:16px;">'
          +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
          +     '<h3 style="margin:0;font-size:16px;">📍 Lead Sources — last 90 days</h3>'
          +     '<span style="font-size:12px;color:var(--text-light);">' + _recentClients.length + ' new client' + (_recentClients.length !== 1 ? 's' : '') + '</span>'
          +   '</div>';
        _sorted.slice(0, 8).forEach(function(src) {
          var cnt = _srcMap[src];
          var pct = Math.round((cnt / _max) * 100);
          var isUnknown = src === '(unknown)';
          html += '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:13px;">'
            + '<div style="flex:0 0 140px;' + (isUnknown ? 'color:var(--text-light);font-style:italic;' : '') + '">' + UI.esc(src) + '</div>'
            + '<div style="flex:1;background:var(--bg);height:8px;border-radius:4px;overflow:hidden;"><div style="height:100%;background:' + (isUnknown ? '#cbd5e1' : 'var(--green-dark)') + ';width:' + pct + '%;"></div></div>'
            + '<div style="flex:0 0 32px;text-align:right;font-weight:700;">' + cnt + '</div>'
            + '</div>';
        });
        if (_srcMap['(unknown)']) {
          html += '<div style="font-size:11px;color:var(--text-light);margin-top:8px;font-style:italic;">💡 ' + _srcMap['(unknown)'] + ' new client' + (_srcMap['(unknown)'] !== 1 ? 's are' : ' is') + ' missing a Lead Source. Open the client and tag them to improve this chart.</div>';
        }
        html += '</div>';
      }
    } catch(e) { /* optional widget */ }

    return html;
  },

  _toggleCCCollapse: function() {
    var collapsed = localStorage.getItem('bm-dash-cc-collapsed') === '1';
    collapsed = !collapsed;
    localStorage.setItem('bm-dash-cc-collapsed', collapsed ? '1' : '0');
    var items = document.getElementById('dash-cc-items');
    var btn = document.getElementById('dash-cc-collapse-btn');
    var header = items && items.previousElementSibling;
    if (items) items.style.display = collapsed ? 'none' : '';
    if (btn) btn.textContent = collapsed ? '▾' : '▴';
    if (header) header.style.marginBottom = collapsed ? '0' : '12px';
  },

  _fillDateWeather: function() {
    var el = document.getElementById('dash-date-weather');
    if (!el || typeof Weather === 'undefined') return;
    var todayStr = new Date().toISOString().split('T')[0];
    function _applyWeather() {
      var el2 = document.getElementById('dash-date-weather');
      if (!el2 || !Weather.cache || !Weather.cache.daily) return;
      var days = Weather.cache.daily;
      for (var i = 0; i < days.time.length; i++) {
        if (days.time[i] === todayStr) {
          var hi = Math.round(days.temperature_2m_max[i]);
          var lo = Math.round(days.temperature_2m_min[i]);
          var icon = Weather._icon(days.weathercode[i]);
          var rain = days.precipitation_probability_max ? days.precipitation_probability_max[i] : 0;
          var rainStr = rain > 20 ? ' <span style="color:' + (rain > 60 ? '#e65100' : '#1976d2') + ';">· ' + rain + '% rain</span>' : '';
          el2.innerHTML = '<span onclick="Weather.showModal()" style="font-size:13px;cursor:pointer;text-decoration:none;border-bottom:1px dotted var(--text-light);">' + icon + ' ' + hi + '°/' + lo + '°' + rainStr + '</span>';
          return;
        }
      }
    }
    if (Weather.cache) {
      _applyWeather();
    } else {
      Weather.fetch();
      setTimeout(_applyWeather, 2500);
    }
  },

  _fillCallCenterWidget: async function() {
    var el = document.getElementById('dash-cc-items');
    if (!el) return;
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) {
      el.innerHTML = '<div style="font-size:13px;color:var(--text-light);padding:4px 0;">Supabase not connected.</div>';
      return;
    }
    try {
      var cutoff = new Date(Date.now() - 72 * 3600000).toISOString();
      var { data, error } = await sb.from('communications')
        .select('id,channel,direction,from_number,to_number,body,created_at,metadata')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;

      var badge = document.getElementById('dash-cc-badge');
      var widget = document.getElementById('dash-callcenter-widget');

      if (!data || data.length === 0) {
        if (widget) {
          widget.style.cssText = 'background:var(--white);border-radius:10px;padding:10px 16px;border:1px solid var(--border);margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-size:13px;color:var(--text-light);';
          widget.onclick = function() { loadPage('callcenter'); };
          widget.innerHTML = '<span><strong style="color:var(--text);">Leads Center</strong> · No recent activity</span>'
            + '<span style="color:var(--accent);font-size:12px;">Open →</span>';
        }
        return;
      }

      var clients = typeof DB !== 'undefined' ? DB.clients.getAll() : [];
      var _fp = function(p) { var d=(p||'').replace(/\D/g,''); if(d.length===10) return '('+d.slice(0,3)+') '+d.slice(3,6)+'-'+d.slice(6); if(d.length===11&&d[0]==='1') return '('+d.slice(1,4)+') '+d.slice(4,7)+'-'+d.slice(7); return p||'—'; };
      var _ago = function(d) { var s=Math.floor((Date.now()-new Date(d))/1000); if(s<60) return s+'s'; if(s<3600) return Math.floor(s/60)+'m'; if(s<86400) return Math.floor(s/3600)+'h'; return Math.floor(s/86400)+'d'; };
      var _name = function(c) {
        var phone = c.direction==='inbound' ? c.from_number : c.to_number;
        var match = clients.find(function(cl) { var p=(cl.phone||'').replace(/\D/g,''),q=(phone||'').replace(/\D/g,''); return p.length>=7&&q.length>=7&&(p===q||p.endsWith(q)||q.endsWith(p)); });
        return match ? (match.name||match.firstName+' '+(match.lastName||'')).trim() : _fp(phone);
      };

      // Separate into 3 buckets
      var texts = data.filter(function(c) { return c.channel === 'sms'; }).slice(0, 4);
      var calls = data.filter(function(c) { return c.channel === 'call' || c.channel === 'voicemail'; }).slice(0, 4);
      var emails = data.filter(function(c) { return c.channel === 'email'; }).slice(0, 4);

      var totalCount = texts.length + calls.length + emails.length;
      if (badge) badge.textContent = totalCount + ' recent';

      var _renderSection = function(key, label, icon, items, dot) {
        if (items.length === 0) return '';
        var collapsed = localStorage.getItem('bm-lc-' + key + '-collapsed') === '1';
        var rows = '';
        items.forEach(function(c, idx) {
          var name = _name(c);
          var preview = c.channel === 'sms' ? (c.body || '').substring(0, 45)
            : c.channel === 'voicemail' ? 'Voicemail'
            : (c.direction === 'inbound' ? 'Inbound call' : 'Outbound call');
          var isLast = idx === items.length - 1;
          rows += '<div style="display:flex;align-items:center;gap:10px;padding:5px 0;' + (isLast ? '' : 'border-bottom:1px solid var(--border);') + 'cursor:pointer;" onclick="loadPage(\'callcenter\')">'
            + '<div style="width:8px;height:8px;border-radius:50%;background:' + (c.direction==='inbound'?'#2e7d32':'#1565c0') + ';flex-shrink:0;"></div>'
            + '<div style="font-size:13px;font-weight:600;flex-shrink:0;white-space:nowrap;">' + UI.esc(name) + '</div>'
            + '<div style="flex:1;min-width:0;font-size:12px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(preview) + '</div>'
            + '<span style="font-size:11px;color:var(--text-light);flex-shrink:0;">' + _ago(c.created_at) + '</span>'
            + '</div>';
        });
        return '<div style="margin-top:8px;">'
          + '<div onclick="DashboardPage._toggleLeadSection(\'' + key + '\')" style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:3px 0;user-select:none;">'
          + '<span style="font-size:12px;">' + icon + '</span>'
          + '<span style="font-size:12px;font-weight:700;color:var(--text);">' + label + '</span>'
          + '<span style="font-size:11px;color:var(--text-light);margin-left:2px;">(' + items.length + ')</span>'
          + '<span style="font-size:11px;color:var(--text-light);margin-left:auto;">' + (collapsed ? '▾' : '▴') + '</span>'
          + '</div>'
          + '<div id="bm-lc-' + key + '-rows" style="' + (collapsed ? 'display:none;' : '') + '">' + rows + '</div>'
          + '</div>';
      };

      el.innerHTML = _renderSection('texts', 'Texts', '💬', texts)
        + _renderSection('calls', 'Calls', '📞', calls)
        + _renderSection('emails', 'Email', '✉️', emails);

    } catch(e) {
      el.innerHTML = '<div style="font-size:13px;color:var(--text-light);">Could not load activity.</div>';
    }
  },

  _toggleLeadSection: function(key) {
    var collapsed = localStorage.getItem('bm-lc-' + key + '-collapsed') === '1';
    collapsed = !collapsed;
    localStorage.setItem('bm-lc-' + key + '-collapsed', collapsed ? '1' : '0');
    var rows = document.getElementById('bm-lc-' + key + '-rows');
    if (rows) rows.style.display = collapsed ? 'none' : '';
    // Update chevron
    if (rows && rows.previousElementSibling) {
      var chevron = rows.previousElementSibling.querySelector('span:last-child');
      if (chevron) chevron.textContent = collapsed ? '▾' : '▴';
    }
  },

  syncNow: function() {
    var btn = document.getElementById('sync-btn');
    if (btn) { btn.textContent = 'Syncing...'; btn.disabled = true; }
    if (typeof SupabaseDB !== 'undefined' && SupabaseDB.ready) {
      SupabaseDB._pullFromCloud().then(function() {
        loadPage('dashboard');
      }).catch(function(e) {
        console.warn('Sync error:', e);
        loadPage('dashboard');
      });
    } else {
      // Direct fetch if SupabaseDB not initialized yet
      var url = 'https://ltpivkqahvplapyagljt.supabase.co';
      var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI';
      var tables = [
        { local: 'bm-clients', remote: 'clients' },
        { local: 'bm-requests', remote: 'requests' },
        { local: 'bm-quotes', remote: 'quotes' },
        { local: 'bm-jobs', remote: 'jobs' },
        { local: 'bm-invoices', remote: 'invoices' },
        { local: 'bm-services', remote: 'services' },
        { local: 'bm-team', remote: 'team_members' }
      ];
      var total = 0;
      var idx = 0;
      function fetchNext() {
        if (idx >= tables.length) {
          if (typeof UI !== 'undefined') UI.toast(total + ' records synced from cloud!');
          loadPage('dashboard');
          return;
        }
        var t = tables[idx++];
        var _tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
        var _tfilter = _tid ? '&tenant_id=eq.' + encodeURIComponent(_tid) : '';
        fetch(url + '/rest/v1/' + t.remote + '?select=*&limit=5000&order=created_at.desc' + _tfilter, {
          headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
        }).then(function(resp) {
          return resp.json();
        }).then(function(data) {
          if (data && data.length > 0) {
            // Convert snake_case to camelCase
            var converted = data.map(function(row) {
              var newRow = {};
              Object.keys(row).forEach(function(k) {
                var camel = k.replace(/_([a-z])/g, function(m, p1) { return p1.toUpperCase(); });
                newRow[camel] = row[k];
              });
              return newRow;
            });
            localStorage.setItem(t.local, JSON.stringify(converted));
            total += converted.length;
          }
          fetchNext();
        }).catch(function(e) {
          console.warn('Sync error:', t.remote, e);
          fetchNext();
        });
      }
      fetchNext();
    }
  },

  // ── Briefing task dismissal ──
  // Per-day map keyed by date so dismissals reset at midnight rollover.
  // Storage shape: { "2026-04-28": ["bfABC", "bfXYZ"] }
  _briefingDateStr: function() {
    var n = new Date();
    return n.getFullYear() + '-' + (n.getMonth() + 1 < 10 ? '0' : '') + (n.getMonth() + 1) + '-' + (n.getDate() < 10 ? '0' : '') + n.getDate();
  },
  _readDismissed: function() {
    try { return JSON.parse(localStorage.getItem('bm-briefing-dismissed-items') || '{}'); } catch(e) { return {}; }
  },
  _writeDismissed: function(map) {
    try { localStorage.setItem('bm-briefing-dismissed-items', JSON.stringify(map)); } catch(e) {}
  },

  // Dismiss one task by ID — slides the row out, then collapses the whole
  // briefing if no rows remain.
  dismissInsight: function(id) {
    var dateKey = DashboardPage._briefingDateStr();
    var map = DashboardPage._readDismissed();
    if (!map[dateKey]) map[dateKey] = [];
    if (map[dateKey].indexOf(id) === -1) map[dateKey].push(id);
    DashboardPage._writeDismissed(map);
    var row = document.querySelector('[data-bf-id="' + id + '"]');
    if (row) row.remove();
    var briefing = document.getElementById('daily-briefing');
    if (briefing && !briefing.querySelector('[data-bf-id]')) briefing.remove();
  },

  // Dismiss every visible task in one shot.
  dismissAllInsights: function() {
    var dateKey = DashboardPage._briefingDateStr();
    var map = DashboardPage._readDismissed();
    var rows = document.querySelectorAll('#daily-briefing [data-bf-id]');
    if (!map[dateKey]) map[dateKey] = [];
    rows.forEach(function(r) {
      var id = r.getAttribute('data-bf-id');
      if (id && map[dateKey].indexOf(id) === -1) map[dateKey].push(id);
    });
    DashboardPage._writeDismissed(map);
    var el = document.getElementById('daily-briefing');
    if (el) el.remove();
  },

  // Legacy alias — earlier inline onclicks in older bundle versions called
  // DashboardPage.dismissBriefing(). Keep it working for backward compat.
  dismissBriefing: function() { DashboardPage.dismissAllInsights(); },

  // Vehicle Inspection
  _toggleInspection: function() {
    var body = document.getElementById('insp-body');
    var btn = document.getElementById('insp-toggle-btn');
    if (body.style.display === 'none') {
      body.style.display = 'block';
      btn.textContent = 'Hide ▴';
      // Pre-fill driver name
      var user = (typeof Auth !== 'undefined' && Auth.user) ? Auth.user.name : '';
      var driverEl = document.getElementById('insp-driver');
      if (driverEl && !driverEl.value && user) driverEl.value = user;
    } else {
      body.style.display = 'none';
      btn.textContent = 'Start ▾';
    }
  },

  _inspCount: function() {
    var checks = document.querySelectorAll('.insp-check');
    var done = Array.from(checks).filter(function(c) { return c.checked; }).length;
    var el = document.getElementById('insp-count');
    if (el) el.textContent = done + ' / ' + checks.length + ' checked';
  },

  _completeInspection: function() {
    var checks = document.querySelectorAll('.insp-check');
    var done = Array.from(checks).filter(function(c) { return c.checked; }).length;
    if (done < checks.length) {
      if (!confirm(done + ' of ' + checks.length + ' items checked. Complete anyway with defects noted?')) return;
    }
    var driver = (document.getElementById('insp-driver') || {}).value || '';
    var vehicle = (document.getElementById('insp-vehicle') || {}).value || '';
    if (!driver) { alert('Enter driver name'); return; }

    var today = new Date().toISOString().split('T')[0];
    var record = {
      date: today,
      driver: driver,
      vehicle: vehicle,
      checked: done,
      total: checks.length,
      pass: done === checks.length,
      completedAt: new Date().toISOString()
    };

    // Save to daily key
    localStorage.setItem('bm-inspection-' + today, JSON.stringify(record));

    // Save to history
    var history = [];
    try { history = JSON.parse(localStorage.getItem('bm-inspection-history') || '[]'); } catch(e) {}
    history.unshift(record);
    if (history.length > 90) history = history.slice(0, 90);
    localStorage.setItem('bm-inspection-history', JSON.stringify(history));

    UI.toast('Vehicle inspection complete — ' + (record.pass ? 'all clear' : done + '/' + checks.length + ' passed'));
    var el = document.getElementById('daily-inspection');
    if (el) el.remove();
  },

  _branchCamWidget: function() {
    // Aggregate every Branch Cam photo + bucket by day in last 7 days
    var photos = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || k.indexOf('bm-photos-') !== 0) continue;
      try {
        var arr = JSON.parse(localStorage.getItem(k)) || [];
        photos = photos.concat(arr);
      } catch(e) {}
    }
    if (!photos.length) {
      return '<div style="background:linear-gradient(135deg,#1a3c12,#2e7d32);color:#fff;border-radius:14px;padding:18px 20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="loadPage(\'tools\')">'
        + '<div><div style="font-size:11px;opacity:0.8;letter-spacing:0.1em;text-transform:uppercase;">📸 Branch Cam</div>'
        + '<div style="font-size:16px;font-weight:700;margin-top:4px;">No photos yet — start documenting jobs</div></div>'
        + '<div style="font-size:24px;opacity:0.6;">→</div></div>';
    }

    var now = Date.now();
    var weekAgo = now - 7 * 86400000;
    var thisWeek = photos.filter(function(p) { return p.date && new Date(p.date).getTime() >= weekAgo; });
    var today0 = new Date(); today0.setHours(0,0,0,0);
    var todayCount = photos.filter(function(p) { return p.date && new Date(p.date) >= today0; }).length;

    // Tag tally
    var tagCounts = {};
    photos.forEach(function(p) {
      var tags = Array.isArray(p.tags) ? p.tags : (p.label ? p.label.split(',').map(function(s){return s.trim();}).filter(Boolean) : []);
      tags.forEach(function(t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    });
    var topTags = Object.keys(tagCounts).sort(function(a,b){ return tagCounts[b] - tagCounts[a]; }).slice(0, 3);

    // Last 4 thumbnail strip
    var recent = photos.filter(function(p){ return p.url; }).sort(function(a,b){ return (b.date || '').localeCompare(a.date || ''); }).slice(0, 4);

    var html = '<div style="background:#fff;border:1px solid var(--border);border-radius:14px;padding:16px 18px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<div><div style="font-size:11px;color:#2e7d32;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;">📸 Branch Cam</div>'
      + '<div style="font-size:18px;font-weight:700;margin-top:2px;">' + photos.length + ' photos · ' + todayCount + ' today · ' + thisWeek.length + ' this week</div></div>'
      + '<button class="btn btn-outline" onclick="loadPage(\'branchcam\')" style="font-size:12px;padding:6px 12px;">Library →</button>'
      + '</div>';

    // Recent thumb strip
    if (recent.length) {
      html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px;">';
      recent.forEach(function(p) {
        html += '<div style="aspect-ratio:1;background-image:url(\'' + p.url + '\');background-size:cover;background-position:center;border-radius:6px;"></div>';
      });
      html += '</div>';
    }

    // Top tags
    if (topTags.length) {
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
      topTags.forEach(function(t) {
        html += '<span style="background:#e8f5e9;color:#1a3c12;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600;">' + t + ' (' + tagCounts[t] + ')</span>';
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }
};
