/**
 * Branch Manager — Pipeline (Kanban Board)
 * Visual drag-and-drop board tracking leads through stages
 * Like legacy system's Pipeline feature
 */
var PipelinePage = {
  stages: [
    { id: 'new_lead', label: 'New Lead', color: '#2196f3', icon: '📥' },
    { id: 'assessment', label: 'Assessment', color: '#9c27b0', icon: '🔍' },
    { id: 'quote_sent', label: 'Quote Sent', color: '#ff9800', icon: '📋' },
    { id: 'follow_up', label: 'Follow Up', color: '#e91e63', icon: '📞' },
    { id: 'won', label: 'Won', color: '#4caf50', icon: '✅' },
    { id: 'lost', label: 'Lost', color: '#9e9e9e', icon: '❌' }
  ],

  _filterRecent: true,

  _co: function() {
    return {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      website: CompanyInfo.get('website')
    };
  },

  // v712: helper — returns the next upcoming reminder for a given quote/invoice id.
  // Walks SchedulePage._getReminderIndex() honoring the global cache + comm-settings.
  _nextReminderForId: function(id) {
    if (!id || typeof SchedulePage === 'undefined' || !SchedulePage._getReminderIndex) return null;
    var idx = SchedulePage._getReminderIndex();
    var todayStr = (function(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })();
    var hits = [];
    Object.keys(idx).forEach(function(dateStr) {
      if (dateStr < todayStr) return;
      idx[dateStr].forEach(function(r) {
        if (r.id === id) hits.push({ date: dateStr, stage: r.stage, kind: r.kind });
      });
    });
    hits.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
    return hits[0] || null;
  },

  // v713: resolve a deal's true state by chasing the quote → job → invoice
  // links. Pipeline deal.jobId is only set when conversion happened via
  // PipelinePage.convertToJob; quotes converted directly through the Quote
  // detail page leave the deal "naked" — this helper finds them anyway.
  // Returns one of:
  //   { kind: 'paid',              jobId, invoiceId, amount }
  //   { kind: 'invoiced_unpaid',   jobId, invoiceId, balance, dueDate }
  //   { kind: 'job_done_no_invoice', jobId }
  //   { kind: 'job_in_progress',   jobId, status }
  //   { kind: 'no_job' }
  _resolveDealStatus: function(deal) {
    if (!deal) return { kind: 'no_job' };
    var job = null;
    if (deal.jobId && DB.jobs && DB.jobs.getById) job = DB.jobs.getById(deal.jobId);
    // Quote-linked discovery
    if (!job && deal.quoteId && DB.quotes && DB.quotes.getById) {
      var q = DB.quotes.getById(deal.quoteId);
      if (q && q.jobId && DB.jobs && DB.jobs.getById) job = DB.jobs.getById(q.jobId);
      if (!job && DB.jobs && DB.jobs.getAll) {
        var byQ = DB.jobs.getAll().filter(function(j) { return j.quoteId === deal.quoteId; });
        if (byQ.length) job = byQ[0];
      }
    }
    // deal.id == quote.id fallback (pipeline imports preserve id)
    if (!job && DB.jobs && DB.jobs.getAll) {
      var byId = DB.jobs.getAll().filter(function(j) { return j.quoteId === deal.id; });
      if (byId.length) job = byId[0];
    }
    if (!job) return { kind: 'no_job' };

    // Found a job — backfill deal.jobId for next time
    if (deal.jobId !== job.id) {
      try { deal.jobId = job.id; PipelinePage.saveDeals(PipelinePage.getDeals()); } catch(e){}
    }

    var invoice = null;
    if (DB.invoices && DB.invoices.getAll) {
      var invs = DB.invoices.getAll().filter(function(i) { return i.jobId === job.id; });
      if (invs.length) {
        // Prefer paid > sent > draft if multiple
        invs.sort(function(a, b) {
          var rank = function(s) { return s === 'paid' ? 0 : (s === 'sent' || s === 'overdue') ? 1 : 2; };
          return rank((a.status || '').toLowerCase()) - rank((b.status || '').toLowerCase());
        });
        invoice = invs[0];
      }
    }

    if (invoice) {
      var st = (invoice.status || '').toLowerCase();
      var paid = st === 'paid' || invoice.paidAt || (typeof invoice.balance === 'number' && invoice.balance <= 0);
      if (paid) return { kind: 'paid', jobId: job.id, invoiceId: invoice.id, amount: invoice.total || job.total || 0 };
      return { kind: 'invoiced_unpaid', jobId: job.id, invoiceId: invoice.id,
        balance: (invoice.balance != null ? invoice.balance : invoice.total) || 0,
        dueDate: invoice.dueDate };
    }

    if ((job.status || '').toLowerCase() === 'completed') {
      return { kind: 'job_done_no_invoice', jobId: job.id };
    }
    return { kind: 'job_in_progress', jobId: job.id, status: job.status || 'scheduled' };
  },

  _statsCollapsed: function() { return localStorage.getItem('bm-pipeline-stats') === 'collapsed'; },
  _toggleStats: function() {
    localStorage.setItem('bm-pipeline-stats', PipelinePage._statsCollapsed() ? 'shown' : 'collapsed');
    loadPage('pipeline');
  },

  render: function() {
    var allDeals = PipelinePage._filterRawFromCached(PipelinePage.getDeals());
    var untriagedCount = PipelinePage._untriagedLeadCount();
    var sixMonthsAgo = new Date(Date.now() - 180 * 86400000);

    // Filter: when recent mode, hide old assessment/quote_sent deals (import noise)
    var deals = PipelinePage._filterRecent
      ? allDeals.filter(function(d) {
          if (d.stage === 'won' || d.stage === 'lost' || d.stage === 'new_lead' || d.stage === 'follow_up') return true;
          return !d.createdAt || new Date(d.createdAt) > sixMonthsAgo;
        })
      : allDeals;

    var stageStats = {};
    PipelinePage.stages.forEach(function(s) { stageStats[s.id] = { count: 0, value: 0 }; });
    deals.forEach(function(d) {
      if (stageStats[d.stage]) {
        stageStats[d.stage].count++;
        stageStats[d.stage].value += d.value || 0;
      }
    });

    var totalValue = deals.reduce(function(s, d) { return s + (d.value || 0); }, 0);
    var wonValue = deals.filter(function(d) { return d.stage === 'won'; }).reduce(function(s, d) { return s + (d.value || 0); }, 0);
    var winRate = deals.length > 0 ? Math.round((stageStats.won.count / deals.length) * 100) : 0;

    // Won This Month stat
    var now2 = new Date();
    var monthStart = new Date(now2.getFullYear(), now2.getMonth(), 1);
    var wonThisMonth = deals.filter(function(d) {
      if (d.stage !== 'won') return false;
      var moved = d.movedAt || d.createdAt;
      return moved && new Date(moved) >= monthStart;
    }).reduce(function(s, d) { return s + (d.value || 0); }, 0);

    // legacy system-style stat cards
    var activeDeals = deals.filter(function(d) { return d.stage !== 'won' && d.stage !== 'lost'; });
    var activeValue = activeDeals.reduce(function(s,d){ return s + (d.value||0); }, 0);
    var lostCount = stageStats.lost ? stageStats.lost.count : 0;
    var hiddenOld = allDeals.length - deals.length;

    // Unconfirmed open quotes not yet in pipeline
    var existingIds = new Set(allDeals.map(function(d){ return d.id; }));
    var openQuotes = DB.quotes.getAll().filter(function(q){
      return !existingIds.has(q.id) && (q.status === 'sent' || q.status === 'awaiting' || q.status === 'draft');
    });

    // Conversion funnel percentages (new_lead → assessment → quote_sent → follow_up → won)
    var funnelStages = ['new_lead','assessment','quote_sent','follow_up','won'];
    var funnelCounts = funnelStages.map(function(s){ return stageStats[s] ? stageStats[s].count : 0; });
    var funnelTotal  = funnelCounts.reduce(function(a,b){ return a+b; }, 0) || 1;

    var statsCollapsed = PipelinePage._statsCollapsed();
    var html = '<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">'
      + '<button onclick="PipelinePage._toggleStats()" style="background:none;border:none;color:var(--text-light);font-size:12px;font-weight:600;cursor:pointer;padding:4px 8px;">' + (statsCollapsed ? '▾ Show stats' : '▴ Hide stats') + '</button>'
      + '</div>';
    if (statsCollapsed) {
      html += '';
    } else {
    html += '<div class="stat-row" style="display:grid;grid-template-columns:repeat(5,1fr);gap:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px;background:var(--white);">'
      + '<div style="padding:14px 16px;border-right:1px solid var(--border);">'
      + '<div style="font-size:14px;font-weight:700;margin-bottom:8px;">Overview</div>'
      + '<div style="font-size:12px;margin-bottom:2px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#2196f3;margin-right:6px;"></span>New (' + (stageStats.new_lead?stageStats.new_lead.count:0) + ')</div>'
      + '<div style="font-size:12px;margin-bottom:2px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff9800;margin-right:6px;"></span>Quote sent (' + (stageStats.quote_sent?stageStats.quote_sent.count:0) + ')</div>'
      + '<div style="font-size:12px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#4caf50;margin-right:6px;"></span>Won (' + (stageStats.won?stageStats.won.count:0) + ')</div>'
      + '</div>'
      + '<div style="padding:14px 16px;border-right:1px solid var(--border);">'
      + '<div style="font-size:14px;font-weight:700;">Pipeline value</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Active deals</div>'
      + '<div style="font-size:28px;font-weight:800;margin-top:8px;">' + UI.moneyInt(activeValue) + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">' + activeDeals.length + ' deal' + (activeDeals.length !== 1 ? 's' : '') + '</div>'
      + '</div>'
      + '<div style="padding:14px 16px;border-right:1px solid var(--border);">'
      + '<div style="font-size:14px;font-weight:700;">Won</div>'
      + '<div style="font-size:12px;color:var(--text-light);">All time</div>'
      + '<div style="font-size:28px;font-weight:800;margin-top:8px;color:var(--green-dark);">' + UI.moneyInt(wonValue) + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">' + (stageStats.won?stageStats.won.count:0) + ' deal' + ((stageStats.won?stageStats.won.count:0) !== 1 ? 's' : '') + '</div>'
      + '</div>'
      + '<div style="padding:14px 16px;border-right:1px solid var(--border);">'
      + '<div style="font-size:14px;font-weight:700;">Won This Month</div>'
      + '<div style="font-size:12px;color:var(--text-light);">' + (now2.toLocaleString('default',{month:'long'})) + '</div>'
      + '<div style="font-size:28px;font-weight:800;margin-top:8px;color:var(--green-dark);">' + UI.moneyInt(wonThisMonth) + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">revenue closed</div>'
      + '</div>'
      + '<div style="padding:14px 16px;">'
      + '<div style="font-size:14px;font-weight:700;">Win rate</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Conversion</div>'
      + '<div style="font-size:28px;font-weight:800;margin-top:8px;color:' + (winRate >= 50 ? 'var(--green-dark)' : '#e07c24') + ';">' + winRate + '%</div>'
      + '<div style="font-size:12px;color:var(--text-light);">' + lostCount + ' lost</div>'
      + '</div></div>';

    // Conversion funnel bar
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:12px;">'
      + '<div style="font-size:13px;font-weight:700;margin-bottom:10px;">Conversion Funnel</div>'
      + '<div style="display:flex;align-items:center;gap:0;">';
    var funnelColors = ['#2196f3','#9c27b0','#ff9800','#e91e63','#4caf50'];
    var funnelLabels = ['New Lead','Assessment','Quote Sent','Follow Up','Won'];
    funnelCounts.forEach(function(cnt, i) {
      var pct = Math.round((cnt / funnelTotal) * 100);
      var convPct = i === 0 ? 100 : (funnelCounts[0] > 0 ? Math.round((cnt / funnelCounts[0]) * 100) : 0);
      html += '<div style="flex:1;text-align:center;">'
        + '<div style="font-size:11px;color:var(--text-light);margin-bottom:4px;">' + funnelLabels[i] + '</div>'
        + '<div style="height:28px;background:' + funnelColors[i] + ';opacity:' + (0.4 + 0.6 * pct / 100) + ';border-radius:4px;display:flex;align-items:center;justify-content:center;">'
        + '<span style="font-size:12px;font-weight:700;color:#fff;">' + cnt + '</span></div>'
        + '<div style="font-size:10px;color:var(--text-light);margin-top:3px;">' + (i === 0 ? '100%' : convPct + '% of leads') + '</div>'
        + '</div>'
        + (i < funnelCounts.length - 1 ? '<div style="font-size:16px;color:var(--border);padding:0 2px;margin-top:8px;">&#8250;</div>' : '');
    });
    html += '</div></div>';
    } // end stats collapsed-else

    // Filter bar + Import from Quotes button + untriaged-leads pointer
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">'
      + '<button class="btn ' + (PipelinePage._filterRecent ? 'btn-primary' : 'btn-outline') + '" style="font-size:12px;padding:5px 14px;" onclick="PipelinePage._filterRecent=true;loadPage(\'pipeline\')">6 Months</button>'
      + '<button class="btn ' + (!PipelinePage._filterRecent ? 'btn-primary' : 'btn-outline') + '" style="font-size:12px;padding:5px 14px;" onclick="PipelinePage._filterRecent=false;loadPage(\'pipeline\')">All Time</button>'
      + (hiddenOld > 0 ? '<span style="font-size:12px;color:var(--text-light);">' + hiddenOld + ' older deals hidden</span>' : '')
      + (untriagedCount > 0
          ? '<button onclick="loadPage(\'callcenter\')" style="font-size:12px;padding:5px 12px;background:#fff3e0;color:#92400e;border:1px solid #f59e0b;border-radius:6px;cursor:pointer;font-weight:600;">📞 ' + untriagedCount + ' untriaged lead' + (untriagedCount !== 1 ? 's' : '') + ' → Leads Center</button>'
          : '')
      + (openQuotes.length > 0 ? '<div style="margin-left:auto;"><button class="btn btn-outline" style="font-size:12px;padding:5px 14px;" onclick="PipelinePage.importFromQuotes()">📋 Import ' + openQuotes.length + ' Quote' + (openQuotes.length !== 1 ? 's' : '') + '</button></div>' : '')
      + '</div>';

    // Kanban board
    html += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:16px;">'
      + '<div style="display:flex;gap:12px;min-width:' + (PipelinePage.stages.length * 240) + 'px;">';

    var now = Date.now();

    PipelinePage.stages.forEach(function(stage) {
      var stageDeals = deals.filter(function(d) { return d.stage === stage.id; });

      html += '<div class="pipeline-column" data-stage="' + stage.id + '" style="flex:1;min-width:220px;background:var(--bg);border-radius:12px;padding:12px;"'
        + ' ondragover="event.preventDefault();this.style.background=\'#e8f5e9\'" ondragleave="this.style.background=\'var(--bg)\'" ondrop="PipelinePage.drop(event, \'' + stage.id + '\')">';

      // Column header
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:3px solid ' + stage.color + ';">'
        + '<div style="font-weight:700;font-size:13px;">' + stage.icon + ' ' + stage.label + '</div>'
        + '<div style="display:flex;align-items:center;gap:6px;">'
        + '<span style="background:' + stage.color + ';color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;">' + stageStats[stage.id].count + '</span>'
        + '<span style="font-size:11px;color:var(--text-light);">' + UI.moneyInt(stageStats[stage.id].value) + '</span>'
        + '</div></div>';

      // Deal cards (limit to 15 per column for performance)
      var maxShow = 15;
      if (stageDeals.length === 0) {
        html += '<div style="text-align:center;padding:20px;font-size:12px;color:#ccc;border:2px dashed #e0e0e0;border-radius:8px;">Drop here</div>';
      } else {
        stageDeals.slice(0, maxShow).forEach(function(deal) {
          // Age urgency for non-terminal stages
          var ageDays = deal.createdAt ? Math.floor((now - new Date(deal.createdAt).getTime()) / 86400000) : 0;
          var isStale = (stage.id === 'follow_up' || stage.id === 'assessment') && ageDays > 14;
          var isAging = (stage.id === 'follow_up' || stage.id === 'assessment') && ageDays > 7 && !isStale;
          var cardBorder = isStale ? 'border-left:3px solid #dc3545;' : isAging ? 'border-left:3px solid #ff9800;' : '';

          html += '<div class="pipeline-card" draggable="true" ondragstart="PipelinePage.dragStart(event, \'' + deal.id + '\')" onclick="PipelinePage.showDeal(\'' + deal.id + '\')"'
            + ' style="background:var(--white);border-radius:8px;padding:12px;margin-bottom:8px;border:1px solid var(--border);' + cardBorder + 'cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:box-shadow .15s;"'
            + ' onmouseover="this.style.boxShadow=\'0 4px 12px rgba(0,0,0,.12)\'" onmouseout="this.style.boxShadow=\'0 1px 3px rgba(0,0,0,.06)\'">'
            + '<div style="font-weight:700;font-size:14px;margin-bottom:4px;">' + (deal.clientName || 'Unknown') + '</div>'
            + '<div style="font-size:12px;color:var(--text-light);margin-bottom:6px;">' + (deal.description || '') + '</div>'
            + '<div style="display:flex;justify-content:space-between;align-items:center;">'
            + '<span style="font-size:1rem;font-weight:800;color:var(--green-dark);">' + UI.moneyInt(deal.value) + '</span>'
            + '<span style="font-size:11px;color:' + (isStale ? '#dc3545' : isAging ? '#ff9800' : 'var(--text-light)') + ';">' + UI.dateRelative(deal.createdAt) + '</span>'
            + '</div>'
            + (deal.source ? '<div style="font-size:10px;color:var(--text-light);margin-top:4px;">via ' + deal.source + '</div>' : '')
            + (deal.notes ? '<div style="font-size:11px;color:var(--text-light);margin-top:5px;padding-top:5px;border-top:1px solid var(--border);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📌 ' + deal.notes + '</div>' : '');

          // v712/v714: reminder-status footer — only meaningful on Quote Sent
          // stage (that's where the follow-up timer actually exists). New Lead
          // / Assessment / Follow Up cards don't have quote-follow-up reminders
          // tied to them, so the footer was just noise there.
          if (stage.id === 'quote_sent') {
            var nextR = PipelinePage._nextReminderForId(deal.id);
            var rText = nextR ? '⏰ Next reminder ' + UI.dateShort(nextR.date) + (nextR.stage === 2 ? ' (2nd)' : '')
                              : '✓ No upcoming reminders';
            var rColor = nextR ? '#92400e' : 'var(--text-light)';
            html += '<div style="font-size:10px;color:' + rColor + ';margin-top:6px;padding-top:5px;border-top:1px solid var(--border);">' + rText + '</div>';
          }

          // Quick-action buttons — Won/Lost removed (auto-tracked by stage column).
          // Drag a card between columns to change its stage.
          // v713: Won-stage card resolves the deal's true state via the
          // quote → job → invoice chain. Pipeline.deal.jobId only gets set
          // when conversion happened through PipelinePage.convertToJob —
          // quotes converted via the Quote detail page leave the deal naked
          // and used to show "Convert to Job" forever even though work was
          // already done and invoiced.
          if (stage.id === 'won') {
            var st = PipelinePage._resolveDealStatus(deal);
            html += '<div style="display:flex;gap:5px;margin-top:8px;" onclick="event.stopPropagation()">';
            if (st.kind === 'paid') {
              html += '<button onclick="InvoicesPage.showDetail(\'' + st.invoiceId + '\')" style="width:100%;padding:10px 0;font-size:12px;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:6px;cursor:pointer;font-weight:700;min-height:38px;">💰 Paid · ' + UI.moneyInt(st.amount) + '</button>';
            } else if (st.kind === 'invoiced_unpaid') {
              html += '<button onclick="InvoicesPage.showDetail(\'' + st.invoiceId + '\')" style="width:100%;padding:10px 0;font-size:12px;background:#fff3e0;color:#92400e;border:1px solid #f59e0b;border-radius:6px;cursor:pointer;font-weight:700;min-height:38px;">📨 Invoice ' + UI.moneyInt(st.balance) + ' due</button>';
            } else if (st.kind === 'job_done_no_invoice') {
              html += '<button onclick="JobsPage.showDetail(\'' + st.jobId + '\')" style="width:100%;padding:10px 0;font-size:12px;background:#e3f2fd;color:#1565c0;border:1px solid #90caf9;border-radius:6px;cursor:pointer;font-weight:700;min-height:38px;">✅ Job done · invoice it</button>';
            } else if (st.kind === 'job_in_progress') {
              html += '<button onclick="JobsPage.showDetail(\'' + st.jobId + '\')" style="width:100%;padding:10px 0;font-size:12px;background:#e3f2fd;color:#1565c0;border:1px solid #90caf9;border-radius:6px;cursor:pointer;font-weight:700;min-height:38px;">🔨 Job ' + UI.esc(st.status || 'scheduled') + '</button>';
            } else {
              // no_job — original Convert to Job action
              html += '<button onclick="PipelinePage.convertToJob(\'' + deal.id + '\')" style="width:100%;padding:10px 0;font-size:12px;background:#1565c0;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;min-height:38px;">🔨 Convert to Job</button>';
            }
            html += '</div>';
          }

          html += '</div>';
        });
      }

      // Show more button if truncated
      if (stageDeals.length > maxShow) {
        html += '<div style="text-align:center;padding:8px;font-size:12px;color:var(--accent);font-weight:600;">+ ' + (stageDeals.length - maxShow) + ' more</div>';
      }

      // Add deal button
      if (stage.id !== 'won' && stage.id !== 'lost') {
        html += '<button style="width:100%;padding:8px;background:none;border:2px dashed var(--border);border-radius:8px;color:var(--text-light);font-size:12px;cursor:pointer;margin-top:4px;" '
          + 'onclick="PipelinePage.addDeal(\'' + stage.id + '\')">+ Add</button>';
      }

      html += '</div>';
    });

    html += '</div></div>';

    return html;
  },

  // Data management
  // v714: a request is "raw / untriaged" if it auto-fired from an inbound
  // channel (Dialpad call, SMS, web webhook) and hasn't been enriched —
  // no real client name, generic placeholder name, or marked spam.
  // Those belong in the Leads Center until Doug triages them.
  _isRawLead: function(r) {
    if (!r) return false;
    if (r.spam === true) return true;
    if (r.triaged === true || r.promotedAt) return false;
    var name = (r.clientName || '').trim();
    var generic = !name || /^(Phone caller|SMS sender|Web form|Unknown caller|Inbound)$/i.test(name);
    var autoSource = /Phone|Dialpad|SMS|Webhook|Web form/i.test(r.source || '');
    return generic && autoSource;
  },

  getDeals: function() {
    var stored = localStorage.getItem('bm-pipeline');
    if (stored) { try { return JSON.parse(stored) || []; } catch(e) { return []; } }

    // Seed from existing requests/quotes
    var deals = [];
    DB.requests.getAll().forEach(function(r) {
      if (r.status !== 'new') return;
      if (PipelinePage._isRawLead(r)) return;  // stays in Leads Center
      deals.push({ id: r.id, clientName: r.clientName, clientId: r.clientId, description: r.property || '', value: 0, stage: 'new_lead', source: r.source, createdAt: r.createdAt });
    });
    DB.quotes.getAll().forEach(function(q) {
      var stage = q.status === 'approved' || q.status === 'converted' ? 'won' : q.status === 'declined' ? 'lost' : q.status === 'sent' || q.status === 'awaiting' ? 'quote_sent' : 'assessment';
      deals.push({ id: q.id, clientName: q.clientName, clientId: q.clientId, description: q.description || '', value: q.total || 0, stage: stage, quoteId: q.id, createdAt: q.createdAt });
    });
    PipelinePage.saveDeals(deals);
    return deals;
  },

  // Also filter the cached deals on every read so localStorage-stored raw
  // leads (from a previous boot before this filter existed) drop out.
  _filterRawFromCached: function(deals) {
    if (!Array.isArray(deals)) return deals;
    var requests = (DB.requests && DB.requests.getAll) ? DB.requests.getAll() : [];
    var rawIds = {};
    requests.forEach(function(r) { if (PipelinePage._isRawLead(r)) rawIds[r.id] = 1; });
    return deals.filter(function(d) { return !rawIds[d.id]; });
  },

  // Count of untriaged auto-leads sitting in DB.requests (for the header link)
  _untriagedLeadCount: function() {
    if (!DB.requests || !DB.requests.getAll) return 0;
    return DB.requests.getAll().filter(function(r) {
      return r.status === 'new' && PipelinePage._isRawLead(r);
    }).length;
  },

  saveDeals: function(deals) {
    localStorage.setItem('bm-pipeline', JSON.stringify(deals));
  },

  // Import open quotes not yet in pipeline
  importFromQuotes: function() {
    var allDeals = PipelinePage.getDeals();
    var existingIds = new Set(allDeals.map(function(d){ return d.id; }));
    var openQuotes = DB.quotes.getAll().filter(function(q){
      return !existingIds.has(q.id) && (q.status === 'sent' || q.status === 'awaiting' || q.status === 'draft');
    });
    if (!openQuotes.length) { UI.toast('No open quotes to import'); return; }

    var html = '<p style="margin-bottom:12px;font-size:13px;color:var(--text-light);">These open quotes will be added to the pipeline as deals:</p>'
      + '<div style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;">';
    openQuotes.forEach(function(q) {
      var stageLabel = q.status === 'sent' || q.status === 'awaiting' ? 'Quote Sent' : 'Assessment';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg);border-radius:6px;font-size:13px;">'
        + '<div><strong>' + q.clientName + '</strong><div style="font-size:11px;color:var(--text-light);">' + (q.description || 'No description') + '</div></div>'
        + '<div style="text-align:right;"><span style="font-weight:700;color:var(--green-dark);">' + UI.moneyInt(q.total) + '</span>'
        + '<div style="font-size:10px;color:var(--text-light);">' + stageLabel + '</div></div>'
        + '</div>';
    });
    html += '</div>';

    UI.showModal('Import ' + openQuotes.length + ' Quote' + (openQuotes.length !== 1 ? 's' : '') + ' to Pipeline', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="PipelinePage._doImportQuotes()">Import All</button>'
    });
  },

  _doImportQuotes: function() {
    var allDeals = PipelinePage.getDeals();
    var existingIds = new Set(allDeals.map(function(d){ return d.id; }));
    var openQuotes = DB.quotes.getAll().filter(function(q){
      return !existingIds.has(q.id) && (q.status === 'sent' || q.status === 'awaiting' || q.status === 'draft');
    });
    openQuotes.forEach(function(q) {
      var stage = q.status === 'sent' || q.status === 'awaiting' ? 'quote_sent' : 'assessment';
      allDeals.push({ id: q.id, clientName: q.clientName, clientId: q.clientId, description: q.description || '', value: q.total || 0, stage: stage, quoteId: q.id, createdAt: q.createdAt });
    });
    PipelinePage.saveDeals(allDeals);
    UI.toast(openQuotes.length + ' quote' + (openQuotes.length !== 1 ? 's' : '') + ' imported to pipeline');
    UI.closeModal();
    loadPage('pipeline');
  },

  // Quick move without opening modal
  quickMove: function(dealId, newStage) {
    var deals = PipelinePage.getDeals();
    var deal = deals.find(function(d) { return d.id === dealId; });
    if (!deal) return;
    var oldStage = deal.stage;
    deal.stage = newStage;
    deal.movedAt = new Date().toISOString();
    PipelinePage.saveDeals(deals);

    if (newStage === 'won' && deal.quoteId) {
      DB.quotes.update(deal.quoteId, { status: 'approved' });
    } else if (newStage === 'lost' && deal.quoteId) {
      DB.quotes.update(deal.quoteId, { status: 'declined' });
    }

    var stageLabel = PipelinePage.stages.find(function(s) { return s.id === newStage; }).label;
    UI.toast((deal.clientName || 'Deal') + ' moved to ' + stageLabel);
    loadPage('pipeline');
  },

  // Drag and drop
  _dragId: null,

  dragStart: function(e, dealId) {
    PipelinePage._dragId = dealId;
    e.dataTransfer.effectAllowed = 'move';
    e.target.style.opacity = '0.5';
    setTimeout(function() { e.target.style.opacity = '1'; }, 0);
  },

  drop: function(e, newStage) {
    e.preventDefault();
    e.currentTarget.style.background = 'var(--bg)';
    if (!PipelinePage._dragId) return;

    var deals = PipelinePage.getDeals();
    var deal = deals.find(function(d) { return d.id === PipelinePage._dragId; });
    if (deal) {
      var oldStage = deal.stage;
      deal.stage = newStage;
      deal.movedAt = new Date().toISOString();
      PipelinePage.saveDeals(deals);

      // Update linked records
      if (newStage === 'won' && deal.quoteId) {
        DB.quotes.update(deal.quoteId, { status: 'approved' });
      } else if (newStage === 'lost' && deal.quoteId) {
        DB.quotes.update(deal.quoteId, { status: 'declined' });
      }

      UI.toast('Moved to ' + PipelinePage.stages.find(function(s) { return s.id === newStage; }).label);
      loadPage('pipeline');
    }
    PipelinePage._dragId = null;
  },

  addDeal: function(stage) {
    var clientOptions = DB.clients.getAll().map(function(c) { return { value: c.id, label: c.name }; });

    var html = '<form id="deal-form" onsubmit="PipelinePage.saveDeal(event, \'' + stage + '\')">'
      + UI.formField('Client', 'select', 'd-client', '', { options: [{ value: '', label: 'Select or type new...' }].concat(clientOptions) })
      + UI.formField('Or New Client Name', 'text', 'd-newclient', '', { placeholder: 'New client name' })
      + UI.formField('Description', 'text', 'd-desc', '', { placeholder: 'e.g., 3 oak removals, backyard' })
      + UI.formField('Estimated Value ($)', 'number', 'd-value', '', { placeholder: '2500' })
      + UI.formField('Source', 'select', 'd-source', '', { options: ['', 'Google Search', 'Facebook', 'Instagram', 'Nextdoor', 'Friend/Referral', 'Yelp', 'Angi', 'Drive-by', 'Repeat Client', 'Other'] })
      + UI.formField('Notes', 'textarea', 'd-notes', '', { placeholder: 'Internal notes about this deal...' })
      + '</form>';

    UI.showModal('Add Deal', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="document.getElementById(\'deal-form\').requestSubmit()">Add Deal</button>'
    });
  },

  saveDeal: function(e, stage) {
    e.preventDefault();
    var clientId = document.getElementById('d-client').value;
    var newName = document.getElementById('d-newclient').value.trim();
    var clientName = '';

    if (clientId) {
      var client = DB.clients.getById(clientId);
      clientName = client ? client.name : '';
    } else if (newName) {
      var newClient = DB.clients.create({ name: newName, status: 'lead' });
      clientId = newClient.id;
      clientName = newName;
    } else {
      UI.toast('Select or enter a client', 'error');
      return;
    }

    var deals = PipelinePage.getDeals();
    deals.push({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      clientId: clientId,
      clientName: clientName,
      description: document.getElementById('d-desc').value.trim(),
      value: parseFloat(document.getElementById('d-value').value) || 0,
      source: document.getElementById('d-source').value,
      notes: (document.getElementById('d-notes') ? document.getElementById('d-notes').value.trim() : ''),
      stage: stage,
      createdAt: new Date().toISOString()
    });
    PipelinePage.saveDeals(deals);

    UI.toast('Deal added to pipeline');
    UI.closeModal();
    loadPage('pipeline');
  },

  showDeal: function(dealId) {
    var deals = PipelinePage.getDeals();
    var deal = deals.find(function(d) { return d.id === dealId; });
    if (!deal) return;

    var stage = PipelinePage.stages.find(function(s) { return s.id === deal.stage; });

    // Look up client phone for text button
    var client = deal.clientId ? DB.clients.getById(deal.clientId) : null;
    var clientPhone = client ? (client.phone || '') : '';
    var cleanPhone = clientPhone.replace(/\D/g, '');
    var firstName = (deal.clientName || '').split(' ')[0];

    var html = '<div style="margin-bottom:12px;"><button onclick="loadPage(\'pipeline\')" style="background:none;border:1px solid var(--border);padding:6px 12px;border-radius:6px;font-size:13px;color:var(--accent);cursor:pointer;">← Back to Pipeline</button></div>'
      + '<div style="margin-bottom:16px;">'
      + '<h2 style="margin-bottom:4px;">' + deal.clientName + '</h2>'
      + '<div style="color:var(--text-light);">' + (deal.description || '') + '</div>'
      + '<div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
      + '<span style="background:' + stage.color + ';color:#fff;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:700;">' + stage.icon + ' ' + stage.label + '</span>'
      + '<span style="font-size:1.5rem;font-weight:800;color:var(--green-dark);">' + UI.moneyInt(deal.value) + '</span>'
      + (clientPhone ? '<a href="tel:' + cleanPhone + '" style="font-size:12px;color:var(--accent);">📞 ' + clientPhone + '</a>' : '')
      + '</div>'
      + (deal.source ? '<div style="font-size:13px;color:var(--text-light);margin-top:8px;">Source: ' + deal.source + '</div>' : '')
      + '<div style="font-size:13px;color:var(--text-light);">Created: ' + UI.dateRelative(deal.createdAt) + '</div>'
      + '</div>';

    // Action buttons row
    html += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">'
      + (deal.stage !== 'won' && deal.stage !== 'lost' ? '<button class="btn btn-outline" style="font-size:12px;" onclick="PipelinePage.sendFollowUp(\'' + dealId + '\')">📧 Send Follow-up</button>' : '')
      + (clientPhone ? '<button class="btn btn-outline" style="font-size:12px;" onclick="if(typeof Dialpad!==\'undefined\'){var co=PipelinePage._co();Dialpad.showTextModal(\'' + cleanPhone + '\',\'Hi ' + firstName + ', this is Doug from \'+co.name+\'. Just following up on your estimate. Any questions? — Doug \'+co.phone);}">📱 Text</button>' : '')
      + (deal.stage !== 'won' ? '<button class="btn btn-outline" style="font-size:12px;" onclick="UI.closeModal();QuotesPage.showForm(null,\'' + deal.clientId + '\')">📋 Create Quote</button>' : '')
      + (deal.stage === 'won' ? '<button class="btn btn-primary" style="font-size:12px;background:#2e7d32;" onclick="PipelinePage.convertToJob(\'' + dealId + '\')">🔨 Convert to Job</button>' : '')
      + '</div>';

    // Move to stage buttons
    html += '<div style="font-weight:700;font-size:13px;margin-bottom:8px;">Move to:</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">';
    PipelinePage.stages.forEach(function(s) {
      html += '<button class="btn ' + (deal.stage === s.id ? 'btn-primary' : 'btn-outline') + '" style="font-size:12px;" onclick="PipelinePage.moveDeal(\'' + dealId + '\',\'' + s.id + '\')">' + s.icon + ' ' + s.label + '</button>';
    });
    html += '</div>';

    // Value + Notes edit
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">'
      + '<div>' + UI.formField('Deal Value ($)', 'number', 'deal-value', deal.value, { placeholder: '0' })
      + '<button class="btn btn-outline" style="font-size:12px;" onclick="PipelinePage.updateValue(\'' + dealId + '\')">Update Value</button>'
      + '</div>'
      + '<div>' + UI.formField('Notes', 'textarea', 'deal-notes', deal.notes || '', { placeholder: 'Internal notes...' })
      + '<button class="btn btn-outline" style="font-size:12px;" onclick="PipelinePage.updateNotes(\'' + dealId + '\')">Save Notes</button>'
      + '</div>'
      + '</div>';

    UI.showModal(deal.clientName, html, {
      footer: '<button class="btn" style="background:var(--red);color:#fff;margin-right:auto;" onclick="PipelinePage.removeDeal(\'' + dealId + '\')">Delete</button>'
        + '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
    });
  },

  sendFollowUp: function(dealId) {
    var deals = PipelinePage.getDeals();
    var deal = deals.find(function(d) { return d.id === dealId; });
    if (!deal) return;

    var client = deal.clientId ? DB.clients.getById(deal.clientId) : null;
    var email = client ? (client.email || '') : '';
    var firstName = (deal.clientName || '').split(' ')[0];

    if (!email) {
      UI.toast('No email address for this client', 'error');
      return;
    }

    var co = PipelinePage._co();
    var subject = 'Following up on your estimate — ' + co.name;
    var body = 'Hi ' + firstName + ',\n\nI wanted to follow up on the estimate we discussed' + (deal.description ? ' for ' + deal.description : '') + '. Have you had a chance to review it?\n\nWe have availability coming up and would love to get your project scheduled. Feel free to reply to this email or call/text me at ' + co.phone + '.\n\nBest,\nDoug\n' + co.name + '\n' + co.phone + '\n' + co.website;

    if (typeof Email !== 'undefined' && Email.send) {
      Email.send({
        to: email,
        subject: subject,
        body: body
      }).then(function(result) {
        if (result.ok) {
          UI.toast('Follow-up email sent to ' + email);
          // Update deal movedAt so it resets the aging clock
          deal.movedAt = new Date().toISOString();
          PipelinePage.saveDeals(deals);
        } else {
          UI.toast('Email failed: ' + (result.error || 'unknown error'), 'error');
        }
      });
    } else {
      window.location.href = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }
  },

  moveDeal: function(dealId, newStage) {
    var deals = PipelinePage.getDeals();
    var deal = deals.find(function(d) { return d.id === dealId; });
    if (deal) {
      deal.stage = newStage;
      deal.movedAt = new Date().toISOString();
      PipelinePage.saveDeals(deals);
      UI.toast('Moved to ' + PipelinePage.stages.find(function(s) { return s.id === newStage; }).label);
      UI.closeModal();
      loadPage('pipeline');
    }
  },

  updateValue: function(dealId) {
    var val = parseFloat(document.getElementById('deal-value').value) || 0;
    var deals = PipelinePage.getDeals();
    var deal = deals.find(function(d) { return d.id === dealId; });
    if (deal) {
      deal.value = val;
      PipelinePage.saveDeals(deals);
      UI.toast('Value updated to ' + UI.moneyInt(val));
    }
  },

  updateNotes: function(dealId) {
    var notes = document.getElementById('deal-notes') ? document.getElementById('deal-notes').value.trim() : '';
    var deals = PipelinePage.getDeals();
    var deal = deals.find(function(d) { return d.id === dealId; });
    if (deal) {
      deal.notes = notes;
      PipelinePage.saveDeals(deals);
      UI.toast('Notes saved');
    }
  },

  convertToJob: function(dealId) {
    var deals = PipelinePage.getDeals();
    var deal = deals.find(function(d) { return d.id === dealId; });
    if (!deal) return;

    if (deal.jobId) {
      UI.toast('Job already created for this deal');
      UI.closeModal();
      loadPage('jobs');
      return;
    }

    var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    var jobDate = deal.scheduledDate || tomorrow.toISOString().split('T')[0];

    var job = DB.jobs.create({
      clientId: deal.clientId,
      clientName: deal.clientName,
      description: deal.description || '',
      total: deal.value || 0,
      status: 'scheduled',
      scheduledDate: jobDate,
      source: deal.source || '',
      notes: deal.notes || '',
      quoteId: deal.quoteId || null,
      createdAt: new Date().toISOString()
    });

    // Mark deal as having a linked job
    deal.jobId = job.id;
    PipelinePage.saveDeals(deals);

    UI.toast('Job created for ' + (deal.clientName || 'client') + ' — ' + UI.moneyInt(deal.value));
    UI.closeModal();
    loadPage('jobs');
  },

  removeDeal: function(dealId) {
    UI.confirm('Delete this deal from the pipeline?', function() {
      var deals = PipelinePage.getDeals().filter(function(d) { return d.id !== dealId; });
      PipelinePage.saveDeals(deals);
      UI.toast('Deal removed');
      UI.closeModal();
      loadPage('pipeline');
    });
  }
};
