/**
 * Branch Manager — Dashboard Page
 */
var DashboardPage = {
  // v720: kill switch for the "Needs your attention" inbox card. Persists
  // in localStorage; when hidden the dashboard collapses to just the
  // quick-add bar plus a small "Show" toggle.
  _toggleAttention: function() {
    var hidden = localStorage.getItem('bm-dash-attention-hidden') === 'true';
    localStorage.setItem('bm-dash-attention-hidden', hidden ? 'false' : 'true');
    loadPage('dashboard');
  },

  // v719: Quick-add a task/note from the dashboard input. No due date,
  // no overlay — straight to the TaskReminders store. Doug can promote
  // to a real reminder later by opening the task.
  _quickAddTask: function() {
    var input = document.getElementById('dash-quickadd');
    if (!input) return;
    var raw = (input.value || '').trim();
    if (!raw) { input.focus(); return; }
    if (typeof TaskReminders === 'undefined' || !TaskReminders._getAll) {
      UI.toast('Tasks module not loaded', 'error'); return;
    }
    var tasks = TaskReminders._getAll(true);
    tasks.push({
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: raw,
      description: '',
      assignedTo: '',
      dueDate: '',
      priority: 'normal',
      category: '',
      recurrence: '',
      actionLink: '',
      completed: false,
      completedAt: null,
      notified: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    TaskReminders._saveAll(tasks);
    input.value = '';
    UI.toast('Saved · "' + (raw.length > 32 ? raw.substring(0, 32) + '…' : raw) + '"');
    loadPage('dashboard');
  },

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

    // v760: Sales tax counter banner — shows at the top of the dashboard
    // any time tax is owed for the current/upcoming filing period. Color
    // escalates as the due date approaches; on 1st / 15th / 19th / 20th
    // of the filing month it goes red. Doug sees this every day; he can't
    // forget the quarterly NY return.
    try {
      if (typeof SalesTaxCounter !== 'undefined' && SalesTaxCounter.renderBanner) {
        html += SalesTaxCounter.renderBanner();
      }
    } catch(e) { /* swallow — never block dashboard render */ }

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

    // v689: weather moved to topbar chip (above the line). Doug ask.
    html += '<div style="margin-bottom:16px;">'
      + '<div style="font-size:13px;color:var(--text-light);">'
      + dayNames[now.getDay()] + ', ' + monthFull[now.getMonth()] + ' ' + now.getDate()
      + '</div>'
      + '<h2 style="font-size:28px;font-weight:700;margin-top:2px;">' + greeting + (userName === 'there' ? '' : ', ' + userName.split(' ')[0]) + '</h2>'
      + '</div>';

    // v645: Mobile-focused Home — Jobber-style "Let's get started / Clock In"
    // + First-visit hero card. Mobile only via .dash-mobile-focus class.
    // The heavy desktop widgets below (Leads Center / Workflow grid / Rail)
    // are wrapped in .dash-desktop-only and hidden on mobile so the morning
    // home screen has ONE clear next action.
    // v646: don't hide the heavy widgets on mobile (Doug wants them too).
    // Mobile shows BOTH the new focus block (Clock In + first-visit hero)
    // AND the existing widgets stacked below.
    html += '<style>'
      + '@media (max-width: 768px) {'
      + '  .dash-grid { grid-template-columns: 1fr !important; }'
      + '}'
      + '@media (min-width: 769px) {'
      + '  .dash-mobile-focus { display: none !important; }'
      + '}'
      + '.dash-clock-card { background:var(--white); border:1px solid var(--border); border-radius:14px; padding:16px 18px; margin-bottom:12px; box-shadow:0 1px 3px rgba(0,0,0,0.04); display:flex; align-items:center; justify-content:space-between; gap:12px; }'
      + '.dash-clock-card.live { background:var(--green-bg); border-color:var(--green-light); }'
      + '.dash-clock-btn { background:var(--green-dark); color:#fff; border:none; padding:12px 22px; border-radius:10px; font-weight:700; font-size:15px; cursor:pointer; display:inline-flex; align-items:center; gap:8px; white-space:nowrap; }'
      + '.dash-clock-btn.out { background:#c62828; }'
      + '.dash-visit-card { background:var(--white); border:1px solid var(--border); border-radius:14px; padding:18px; margin-bottom:14px; box-shadow:0 1px 3px rgba(0,0,0,0.04); cursor:pointer; }'
      + '.dash-visit-card .accent { width:4px; background:var(--accent); border-radius:2px; align-self:stretch; flex-shrink:0; }'
      + '</style>';

    var __dashTodayStr = now.getFullYear() + '-' + (now.getMonth()+1<10?'0':'') + (now.getMonth()+1) + '-' + (now.getDate()<10?'0':'') + now.getDate();
    html += DashboardPage._renderMobileFocusBlock(now, __dashTodayStr);

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

    // ── DESKTOP ONLY: 2x2 summary grid (matches the Workflow grid below) ──
    // v670 — was 4 separate stacked widgets (Leads Center / Website Visitors /
    // Today's Jobs / Tasks). Per Doug, condensed into a uniform 2x2 grid that
    // mirrors the Workflow grid: bordered container, internal dividers, full-
    // cell click → page nav. Detail still reachable by clicking through.
    html += '<div class="dash-desktop-only">';

    // Today's jobs counts (sync, used in the Jobs cell)
    var __td = now.getFullYear() + '-' + (now.getMonth()+1<10?'0':'') + (now.getMonth()+1) + '-' + (now.getDate()<10?'0':'') + now.getDate();
    var __todayJobs = allJobs.filter(function(j) { return j.scheduledDate && j.scheduledDate.substring(0,10) === __td; });
    var __todayDone = __todayJobs.filter(function(j) { return j.status === 'completed'; }).length;

    // Active task count (sync, used in the Tasks cell)
    var __activeTasks = 0;
    try {
      if (typeof TaskReminders !== 'undefined' && TaskReminders._getAll) {
        __activeTasks = TaskReminders._getAll().filter(function(t) { return !t.completed && !t.archived; }).length;
      }
    } catch(e) {}

    var jobsLabel = __todayJobs.length === 0
      ? 'No jobs scheduled today'
      : __todayDone + ' of ' + __todayJobs.length + ' complete';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px;background:var(--white);box-shadow:0 1px 3px rgba(0,0,0,0.04);">';

    // Top-left: Leads Center (count async-filled by _fillCallCenterWidget into #dash-cc-badge)
    html += '<div onclick="loadPage(\'callcenter\')" style="padding:16px 20px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);cursor:pointer;position:relative;">'
      +   '<h4 style="font-size:14px;font-weight:700;margin:0 0 4px;color:var(--text-light);">📞 Leads Center</h4>'
      +   '<div id="dash-cc-count" style="font-size:24px;font-weight:800;line-height:1.1;">—</div>'
      +   '<div id="dash-cc-badge" style="font-size:11px;color:#666;margin-top:2px;">Loading…</div>'
      + '</div>';

    // Top-right: Website Visitors (count async-filled by AnalyticsWidget into #dash-aw-mini)
    html += '<div onclick="loadPage(\'socialbranch\')" style="padding:16px 20px;border-bottom:1px solid var(--border);cursor:pointer;position:relative;">'
      +   '<h4 style="font-size:14px;font-weight:700;margin:0 0 4px;color:var(--text-light);">🌐 Website Visitors</h4>'
      +   '<div id="dash-aw-mini" style="font-size:24px;font-weight:800;line-height:1.1;">—</div>'
      +   '<div id="dash-aw-sub" style="font-size:11px;color:#666;margin-top:2px;">Loading…</div>'
      + '</div>';

    // Bottom-left: Today's Jobs
    html += '<div onclick="loadPage(\'schedule\')" style="padding:16px 20px;border-right:1px solid var(--border);cursor:pointer;position:relative;">'
      +   '<h4 style="font-size:14px;font-weight:700;margin:0 0 4px;color:var(--text-light);">📅 Today\'s Jobs</h4>'
      +   '<div style="font-size:24px;font-weight:800;line-height:1.1;">' + __todayJobs.length + '</div>'
      +   '<div style="font-size:11px;color:#666;margin-top:2px;">' + jobsLabel + '</div>'
      + '</div>';

    // Bottom-right: Tasks
    html += '<div onclick="loadPage(\'taskreminders\')" style="padding:16px 20px;cursor:pointer;position:relative;">'
      +   '<h4 style="font-size:14px;font-weight:700;margin:0 0 4px;color:var(--text-light);">✅ Tasks</h4>'
      +   '<div style="font-size:24px;font-weight:800;line-height:1.1;">' + __activeTasks + '</div>'
      +   '<div style="font-size:11px;color:#666;margin-top:2px;">' + (__activeTasks === 0 ? 'All clear' : 'Open' + (__activeTasks === 1 ? '' : ' tasks')) + '</div>'
      + '</div>';

    html += '</div>';

    // Async fills: leads count + analytics widget hookup (kept from legacy widgets)
    setTimeout(function() { if (typeof DashboardPage !== 'undefined') DashboardPage._fillCallCenterWidget(); }, 80);
    // v689: weather inline next to the date is gone; chip in topbar covers it.
    if (typeof AnalyticsWidget !== 'undefined' && AnalyticsWidget.fillSummary) {
      setTimeout(function() { try { AnalyticsWidget.fillSummary('dash-aw-mini', 'dash-aw-sub', 30); } catch(e) {} }, 100);
    }

    // v619: 2-column dashboard layout — main (workflow + lead sources) /
    // rail (receivables, inbox, action alerts). Single column on mobile.
    html += '<style>'
      + '.dash-grid{display:grid;grid-template-columns:1fr;gap:18px;align-items:start;}' /* v651: single column always per Doug — no side-by-side */
      + '.dash-main,.dash-rail{min-width:0;}'
      + '@media(max-width:900px){.dash-grid{grid-template-columns:1fr;}}'
      + '</style>';
    html += '<div class="dash-grid"><div class="dash-main">';

    html += '<h3 style="font-size:18px;font-weight:700;margin-bottom:12px;">Workflow</h3>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:20px;background:var(--white);box-shadow:0 1px 3px rgba(0,0,0,0.04);">'; /* v666: back to 2x2 (was single-col v651) — cards already have 2x2 border pattern */

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
    // v720: kill switch — if user hides the inbox we render only the quick-
    // add bar (or skip entirely with a "show" toggle). Setting persists in
    // localStorage as bm-dash-attention-hidden.
    var attentionHidden = localStorage.getItem('bm-dash-attention-hidden') === 'true';

    // v720: accuracy guard — pre-build a clientId set of "already has work"
    // (any job exists in DB.jobs) so we can skip inbox items where a job
    // is already linked to that client. Prevents stale "ready to convert"
    // / "bill the job" items for clients whose work has been done.
    var clientHasJob = {};
    var clientHasInvoice = {};
    var clientHasPaid = {};
    allJobs.forEach(function(j) {
      if (j.clientId) clientHasJob[j.clientId] = j;
    });
    allInvoices.forEach(function(i) {
      if (i.clientId) {
        clientHasInvoice[i.clientId] = i;
        var paid = (i.status === 'paid') || i.paidAt || i.paidDate || (typeof i.balance === 'number' && i.balance <= 0);
        if (paid) clientHasPaid[i.clientId] = i;
      }
    });

    var inboxItems = [];
    var cutoff60dash = new Date(now.getTime() - 60 * 86400000).toISOString().split('T')[0];
    var cutoff7dash  = new Date(now.getTime() - 7  * 86400000).toISOString();
    var cutoff5dash  = new Date(now.getTime() - 5  * 86400000).toISOString();
    var todayStrIb   = now.toISOString().substring(0, 10);

    // 0. Overdue + due-today tasks (top of inbox — most actionable)
    if (typeof TaskReminders !== 'undefined' && TaskReminders._getAll) {
      var taskList = TaskReminders._getAll();
      var todayBoundary = new Date(); todayBoundary.setHours(23, 59, 59, 999);
      var todayBStart = new Date(); todayBStart.setHours(0, 0, 0, 0);
      taskList.forEach(function(t) {
        if (t.completed || t.archived) return;
        if (!t.dueDate) return; // open tasks without dueDate render via the Tasks page itself
        var due = new Date(t.dueDate);
        if (isNaN(due)) return;
        if (due < todayBStart) {
          // Overdue
          var daysOver = Math.floor((Date.now() - due.getTime()) / 86400000);
          inboxItems.push({
            icon: 'clock-alert', tone: 'red',
            label: 'Task overdue — ' + UI.esc(t.title || ''),
            sub: daysOver + 'd overdue · was due ' + UI.dateShort(t.dueDate),
            actionLabel: 'Done',
            onclick: 'TaskReminders._toggleComplete(\'' + t.id + '\');loadPage(\'dashboard\');'
          });
        } else if (due <= todayBoundary) {
          // Due today
          inboxItems.push({
            icon: 'check-square', tone: 'amber',
            label: 'Due today — ' + UI.esc(t.title || ''),
            sub: 'Tap to mark done',
            actionLabel: 'Done',
            onclick: 'TaskReminders._toggleComplete(\'' + t.id + '\');loadPage(\'dashboard\');'
          });
        }
      });
    }

    // 0b. v746: Unread inbound SMS — surfaces every phone thread (client
    // or unmatched number) with unread inbound messages. Click jumps to
    // the thread, which clears the unread count.
    try {
      var unreadMap = {};
      try { unreadMap = JSON.parse(localStorage.getItem('bm-msg-unread') || '{}'); } catch(e) {}
      Object.keys(unreadMap).forEach(function(key) {
        var n = unreadMap[key] | 0;
        if (n <= 0) return;
        var label, sub, onClick;
        if (key.indexOf('phone:') === 0) {
          var l10 = key.replace('phone:', '');
          var fmt = '(' + l10.substring(0, 3) + ') ' + l10.substring(3, 6) + '-' + l10.substring(6);
          label = 'Unread SMS — ' + fmt;
          sub = n + ' new from unknown number';
          onClick = 'MessagingPage.selectPhone(\'' + l10 + '\')';
        } else {
          var c = DB.clients.getById(key);
          label = 'Unread SMS — ' + (c ? UI.esc(c.name || '') : 'client');
          sub = n + ' new message' + (n === 1 ? '' : 's');
          onClick = 'MessagingPage.selectClient(\'' + key + '\')';
        }
        inboxItems.push({
          icon: 'message-square', tone: 'blue',
          label: label,
          sub: sub,
          actionLabel: 'Open',
          onclick: onClick
        });
      });
    } catch(e) { /* swallow — unread surfacing is best-effort */ }

    // 1. Approved quotes ready to convert to jobs — but skip if the client
    //    already has a job (likely already converted via different path).
    allQuotes.filter(function(q) {
      if (q.status !== 'approved' || q.convertedJobId || q.jobId) return false;
      // v720: if any job for this client exists, this approved quote is
      // probably already actioned. Drop from inbox.
      if (q.clientId && clientHasJob[q.clientId]) return false;
      return true;
    }).forEach(function(q) {
      inboxItems.push({
        icon: 'check-circle', tone: 'green',
        label: 'Approved quote — ' + (q.clientName || 'client'),
        sub: UI.money(q.total) + ' · ready to schedule',
        actionLabel: '+ Job',
        onclick: 'var j=Workflow.quoteToJob(\'' + q.id + '\');if(j){loadPage(\'dashboard\');}'
      });
    });

    // 2. Completed jobs without an invoice — skip if any invoice exists
    //    for this client (probably already billed via a different job link).
    allJobs.filter(function(j) {
      if (j.status !== 'completed' || j.invoiceId) return false;
      if (j.clientId && clientHasInvoice[j.clientId]) return false; // v720
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

    // 6. Quotes sent 5+ days ago with no response — skip if client got a
    //    job or invoice since (the customer responded through another path).
    allQuotes.filter(function(q) {
      if (q.status !== 'sent' || !q.sentAt || q.sentAt >= cutoff5dash) return false;
      if (q.clientId && (clientHasJob[q.clientId] || clientHasInvoice[q.clientId])) return false; // v720
      return true;
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
    // v720: skip if the job has a paid invoice — already done.
    allJobs.filter(function(j) {
      if (j.status !== 'scheduled' || j.scheduledDate) return false;
      if (j.clientId && clientHasPaid[j.clientId]) return false;
      return true;
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

    // v719: quick-add task/note input always shown, even if Inbox is empty.
    var quickAddBlock = '<div style="background:var(--white);border-radius:12px;padding:14px 16px;border:1px solid var(--border);margin-bottom:12px;display:flex;gap:8px;align-items:center;">'
      + '<i data-lucide="check-square" style="width:16px;height:16px;color:var(--text-light);flex-shrink:0;"></i>'
      + '<input id="dash-quickadd" type="text" placeholder="Quick task or note — press Enter" '
      +   'onkeydown="if(event.key===\'Enter\'){event.preventDefault();DashboardPage._quickAddTask();}" '
      +   'style="flex:1;border:none;background:transparent;font-size:14px;outline:none;color:var(--text);">'
      + '<button onclick="DashboardPage._quickAddTask()" style="background:var(--green-dark);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0;">+ Add</button>'
      + '<button onclick="loadPage(\'taskreminders\')" title="Open Tasks" style="background:none;border:1px solid var(--border);padding:6px 10px;border-radius:6px;font-size:12px;cursor:pointer;color:var(--text-light);flex-shrink:0;">All →</button>'
      + '</div>';

    if (attentionHidden) {
      // Kill switch ON — only show quick-add bar plus a Show toggle.
      html += quickAddBlock;
      html += '<div style="text-align:right;margin-bottom:16px;">'
        + '<button onclick="DashboardPage._toggleAttention()" style="background:none;border:none;color:var(--text-light);font-size:11px;cursor:pointer;padding:4px 8px;">▾ Show "Needs your attention"' + (inboxItems.length > 0 ? ' (' + inboxItems.length + ')' : '') + '</button>'
        + '</div>';
    } else if (inboxItems.length > 0) {
      html += quickAddBlock;
      html += '<div style="background:var(--white);border-radius:12px;padding:18px 20px;border:1px solid #c8e6c9;box-shadow:0 1px 3px rgba(0,0,0,0.04);margin-bottom:16px;">'
        +   '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'
        +     '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="inbox" style="width:18px;height:18px;color:var(--green-dark);"></i><strong style="font-size:15px;color:var(--green-dark);">Needs your attention</strong>'
        +     '<span style="font-size:12px;font-weight:600;background:var(--green-bg);color:var(--green-dark);padding:2px 8px;border-radius:999px;">' + inboxItems.length + '</span></div>'
        +     '<button onclick="DashboardPage._toggleAttention()" title="Hide this section" style="background:none;border:none;color:var(--text-light);font-size:11px;cursor:pointer;padding:4px 8px;">▴ Hide</button>'
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
    } else {
      // Empty inbox — still show the quick-add bar so Doug can drop a note
      html += quickAddBlock;
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

    html += '</div></div>'; // close .dash-rail + .dash-grid
    html += '</div>'; // v645: close .dash-desktop-only wrapping all heavy widgets

    // v669: Lead Sources widget removed from dashboard — duplicated by the
    // Marketing › Lead Sources tab, which has the full analytics suite
    // (sources + funnel + tag-untagged + revenue attribution + response time).

    return html;
  },

  // v645: Mobile-focused Home block — Jobber-style "Clock In + first visit" view.
  // Hidden on desktop via .dash-mobile-focus { display:none } media query.
  // Two states:
  //   1. Currently clocked in → live timer + Clock Out button (red)
  //   2. Not clocked in → big green Clock In button + first job hero card
  _renderMobileFocusBlock: function(now, todayStr) {
    var html = '<div class="dash-mobile-focus">';

    // Resolve current user for time clock
    var userName = (typeof Auth !== 'undefined' && Auth.user && Auth.user.name) || 'You';

    // Find the active time entry (today, no clockOut)
    var activeEntry = null;
    try {
      var todayEntries = (DB.timeEntries && DB.timeEntries.getAll ? DB.timeEntries.getAll() : []).filter(function(t) {
        return t.clockIn && t.clockIn.split('T')[0] === todayStr;
      });
      activeEntry = todayEntries.find(function(t) { return !t.clockOut; });
    } catch (e) { /* timeEntries optional */ }

    // Today's jobs in scheduled order
    var todayJobs = DB.jobs.getAll().filter(function(j) {
      return j.scheduledDate && j.scheduledDate.substring(0, 10) === todayStr;
    }).sort(function(a, b) { return (a.startTime || '99:99').localeCompare(b.startTime || '99:99'); });
    var firstUpcoming = todayJobs.find(function(j) { return j.status !== 'completed'; }) || todayJobs[0] || null;

    // ── State 1: clocked in — show live timer ──
    if (activeEntry) {
      var job = activeEntry.jobId ? DB.jobs.getById(activeEntry.jobId) : null;
      var elapsedH = ((Date.now() - new Date(activeEntry.clockIn).getTime()) / 3600000);
      var hh = Math.floor(elapsedH);
      var mm = Math.floor((elapsedH - hh) * 60);
      var elapsedStr = hh + 'h ' + (mm < 10 ? '0' : '') + mm + 'm';

      html += '<div class="dash-clock-card live">'
        +   '<div style="flex:1;min-width:0;">'
        +     '<div style="font-size:11px;font-weight:700;color:var(--green-dark);letter-spacing:.05em;text-transform:uppercase;">⏱ Clocked in</div>'
        +     '<div style="font-size:24px;font-weight:800;color:var(--green-dark);">' + elapsedStr + '</div>'
        +     (job ? '<div style="font-size:13px;color:var(--text);margin-top:2px;">' + UI.esc(job.clientName || '') + ' · #' + (job.jobNumber || '') + '</div>' : '<div style="font-size:13px;color:var(--text-light);">No job</div>')
        +   '</div>'
        +   '<button class="dash-clock-btn out" onclick="if(typeof TimeTrackPage!==\'undefined\'){TimeTrackPage.clockOut(\'' + activeEntry.id + '\');setTimeout(function(){loadPage(\'dashboard\');},150);}">Clock Out</button>'
        + '</div>';
    } else {
      // ── State 2: not clocked in — Clock In CTA ──
      var firstJobId = firstUpcoming ? firstUpcoming.id : null;
      var ctaLabel = firstUpcoming ? "Clock In" : "Clock In";
      var subLabel = firstUpcoming
        ? ('Start the day on ' + (firstUpcoming.clientName || 'this job'))
        : "Let's get started";
      html += '<div class="dash-clock-card">'
        +   '<div style="flex:1;min-width:0;">'
        +     '<div style="font-size:14px;font-weight:700;">' + UI.esc(subLabel) + '</div>'
        +     (firstUpcoming && firstUpcoming.startTime
                ? '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">First visit @ ' + UI.esc(firstUpcoming.startTime) + '</div>'
                : '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">No visits scheduled today</div>')
        +   '</div>'
        +   '<button class="dash-clock-btn" onclick="if(typeof TimeTrackPage!==\'undefined\'){TimeTrackPage.clockIn(' + (firstJobId ? '\'' + firstJobId + '\'' : 'null') + ');setTimeout(function(){loadPage(\'dashboard\');},150);}else{loadPage(\'timetrack\');}">▶ Clock In</button>'
        + '</div>';
    }

    // ── First visit hero card ──
    if (firstUpcoming) {
      var visitTime = firstUpcoming.startTime || 'Anytime';
      var statusLabel = (firstUpcoming.status || 'scheduled').replace('_', ' ');
      var statusColor = firstUpcoming.status === 'in_progress' ? '#e07c24' : firstUpcoming.status === 'completed' ? '#2e7d32' : '#1565c0';
      html += '<div class="dash-visit-card" onclick="loadPage(\'jobs\');setTimeout(function(){if(typeof JobsPage!==\'undefined\'&&JobsPage.showDetail)JobsPage.showDetail(\'' + firstUpcoming.id + '\');},120);">'
        +   '<div style="display:flex;gap:14px;align-items:flex-start;">'
        +     '<div class="accent" style="background:' + statusColor + ';"></div>'
        +     '<div style="flex:1;min-width:0;">'
        +       '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;">'
        +         '<div style="font-size:11px;color:var(--text-light);font-weight:700;letter-spacing:.04em;text-transform:uppercase;">Today · ' + UI.esc(visitTime) + '</div>'
        +         '<div style="font-size:13px;font-weight:700;color:var(--text);">' + UI.money(firstUpcoming.total || 0) + '</div>'
        +       '</div>'
        +       '<div style="font-size:18px;font-weight:700;line-height:1.25;margin-bottom:2px;">' + UI.esc(firstUpcoming.clientName || '—') + '</div>'
        +       (firstUpcoming.property ? '<div style="font-size:13px;color:var(--text-light);">' + UI.esc(firstUpcoming.property) + '</div>' : '')
        +       (firstUpcoming.description ? '<div style="font-size:13px;color:var(--text);margin-top:6px;line-height:1.4;">' + UI.esc(firstUpcoming.description) + '</div>' : '')
        +     '</div>'
        +   '</div>'
        + '</div>';

      if (todayJobs.length > 1) {
        html += '<div onclick="loadPage(\'schedule\')" style="text-align:center;font-size:13px;font-weight:600;color:var(--accent);padding:6px 0 14px;cursor:pointer;">View all ' + todayJobs.length + ' visits today →</div>';
      }
    } else {
      // No jobs today — gentle nudge
      html += '<div onclick="loadPage(\'schedule\')" style="background:var(--white);border:1px dashed var(--border);border-radius:14px;padding:24px 16px;margin-bottom:14px;text-align:center;cursor:pointer;">'
        +   '<div style="font-size:32px;margin-bottom:6px;">📅</div>'
        +   '<div style="font-size:14px;font-weight:600;">No jobs scheduled today</div>'
        +   '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">Tap to open Schedule</div>'
        + '</div>';
    }

    html += '</div>'; // close .dash-mobile-focus
    return html;
  },

  // v655: _fillAnalyticsWidget removed — moved to shared AnalyticsWidget
  // module (src/pages/analytics-widget.js). Single source of truth.

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
          // v663: chip goes to standalone Weather.renderPage() (the hourly
          // forecast view). Was routing through Operations›Weather tab,
          // but that tab was removed in v660 and the chip silently broke.
          el2.innerHTML = '<span onclick="loadPage(\'weather\')" style="font-size:13px;cursor:pointer;text-decoration:none;border-bottom:1px dotted var(--text-light);">' + icon + ' ' + hi + '°/' + lo + '°' + rainStr + '</span>';
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
    // v670: dual layout — supports the new compact stat-card (countEl +
    // badge only) AND the legacy expanded widget (dash-cc-items list). The
    // count + sub-text are filled regardless of which layout is mounted.
    var el = document.getElementById('dash-cc-items');
    var countEl = document.getElementById('dash-cc-count');
    var badge = document.getElementById('dash-cc-badge');
    var compactMode = !el && (countEl || badge);
    if (!el && !compactMode) return;
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) {
      if (compactMode) {
        if (countEl) countEl.textContent = '—';
        if (badge) badge.textContent = 'Supabase not connected';
      } else if (el) {
        el.innerHTML = '<div style="font-size:13px;color:var(--text-light);padding:4px 0;">Supabase not connected.</div>';
      }
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

      var widget = document.getElementById('dash-callcenter-widget');

      if (!data || data.length === 0) {
        if (compactMode) {
          if (countEl) countEl.textContent = '0';
          if (badge) badge.textContent = 'No recent activity';
          return;
        }
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
      if (countEl) countEl.textContent = data.length;
      if (badge) badge.textContent = totalCount + ' recent · last 72h';
      if (compactMode) return;  // v670 — compact stat-card stops here

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

      // v672: only render the lead-list sections in legacy (non-compact) layout.
      // The compact stat-card has already been filled by countEl + badge above.
      if (el) {
        el.innerHTML = _renderSection('texts', 'Texts', '💬', texts)
          + _renderSection('calls', 'Calls', '📞', calls)
          + _renderSection('emails', 'Email', '✉️', emails);
      }

    } catch(e) {
      if (el) el.innerHTML = '<div style="font-size:13px;color:var(--text-light);">Could not load activity.</div>';
      else if (badge) badge.textContent = 'Could not load';
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
