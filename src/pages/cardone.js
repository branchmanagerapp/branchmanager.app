// Grant Cardone / 10X-style business tools for tree-service owners.
// Pure client-side — inputs persist to localStorage so numbers survive reloads.
// Hook into Reports later via CardoneTools.getSummary().

var CardoneTools = {

  // ── storage ──
  _key: 'bm-cardone-inputs',
  _load: function() {
    try { return JSON.parse(localStorage.getItem(this._key) || '{}'); }
    catch(e) { return {}; }
  },
  _save: function(obj) {
    localStorage.setItem(this._key, JSON.stringify(obj || {}));
  },
  _get: function(k, fallback) {
    var v = this._load()[k];
    return (v === undefined || v === null || v === '') ? fallback : v;
  },
  _set: function(k, v) {
    var d = this._load();
    d[k] = v;
    this._save(d);
  },

  // ── number helpers ──
  _money: function(n) {
    n = Number(n) || 0;
    return '$' + Math.round(n).toLocaleString();
  },
  _money2: function(n) {
    n = Number(n) || 0;
    return '$' + n.toFixed(2).toLocaleString();
  },
  _pct: function(n) {
    n = Number(n) || 0;
    return n.toFixed(1) + '%';
  },

  // ── public: summary for Reports integration ──
  getSummary: function() {
    var d = this._load();
    var target = (d.revTarget10x) || ((d.revCurrent || 0) * 10);
    return {
      currentRevenue: d.revCurrent || 0,
      tenXTarget: target,
      rpe: d.employees ? Math.round((d.revCurrent || 0) / d.employees) : 0,
      closeRate: d.estimates ? ((d.closed || 0) / d.estimates * 100) : 0,
      avgTicket: d.closed ? ((d.revCurrent || 0) / d.closed) : 0,
      cac: d.closed ? ((d.marketingSpend || 0) / d.closed) : 0
    };
  },

  render: function() {
    var self = this;
    var d = self._load();

    var html = ''
      + '<div style="max-width:1100px;margin:0 auto;padding:0 4px;">'

      // ── Mentor Tools page header ──
      + '<div style="margin-bottom:18px;">'
      +   '<h2 style="margin:0 0 4px;font-size:22px;font-weight:800;">Mentor Tools</h2>'
      +   '<div style="font-size:13px;color:var(--text-light);">Frameworks from business mentors, applied to a tree-service P&amp;L. Click a mentor to expand their tools.</div>'
      + '</div>'

      // ── Grant Cardone (10X) — collapsed by default ──
      + '<details style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin-bottom:14px;overflow:hidden;">'
      +   '<summary style="padding:16px 20px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);color:#fff;">'
      +     '<div>'
      +       '<div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#f97316;font-weight:700;">Grant Cardone · 10X</div>'
      +       '<div style="font-size:16px;font-weight:800;margin-top:2px;">Don\'t think like a small business. Think 10X.</div>'
      +     '</div>'
      +     '<span style="font-size:14px;opacity:.7;">▾</span>'
      +   '</summary>'
      +   '<div style="padding:18px;">'
      +     '<div style="font-size:13px;color:var(--text-light);max-width:700px;line-height:1.5;margin-bottom:18px;">Whatever goal you think you can hit, multiply it by 10 and work backward. These calculators surface the gap between where you are and where obsession would take you.</div>';

    // ── 1. 10X Revenue Target ──
    var revCurrent = Number(d.revCurrent) || 0;
    var rev10x = revCurrent * 10;
    var gap = rev10x - revCurrent;
    var workingDays = 250; // ~5 days × 50 weeks
    var dailyTarget = rev10x / workingDays;
    html += ''
      + self._card('🎯 10X Revenue Target',
          'Enter your last 12 months of revenue. See what 10X looks like.',
          ''
          + self._row('Current annual revenue', 'revCurrent', 'number', revCurrent, '$')
          + '<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:10px;padding:14px;margin-top:10px;">'
          +   self._stat('10X Target', self._money(rev10x), '#ea580c')
          +   self._stat('Gap to close', self._money(gap), '#92400e')
          +   self._stat('Required per working day', self._money(dailyTarget), '#78350f')
          + '</div>'
          + '<div style="font-size:12px;color:#78350f;margin-top:10px;font-style:italic;">"Average is the enemy of great. 10X is the only way out of average."</div>'
        );

    // ── 2. Revenue Per Employee ──
    var employees = Number(d.employees) || 0;
    var rpe = employees ? (revCurrent / employees) : 0;
    var rpeRating = rpe >= 200000 ? { label: 'ELITE', color: '#059669', desc: 'Top 10% of tree-care companies' }
                  : rpe >= 150000 ? { label: 'STRONG', color: '#0891b2', desc: 'Above industry average' }
                  : rpe >= 100000 ? { label: 'AVERAGE', color: '#d97706', desc: 'Industry average for tree-care' }
                  : rpe >= 50000  ? { label: 'BELOW AVG', color: '#dc2626', desc: 'Either under-priced or over-staffed' }
                  : rpe > 0       ? { label: 'CRITICAL', color: '#991b1b', desc: 'Major efficiency issue — fix ASAP' }
                  :                  { label: '—', color: '#6b7280', desc: 'Enter headcount above' };
    html += ''
      + self._card('👥 Revenue Per Employee (RPE)',
          'How much each person on your team generates. Tree-care industry benchmark: $120K–$180K per employee. Elite shops: $200K+.',
          ''
          + self._row('Total employees (incl. yourself, W-2 + 1099)', 'employees', 'number', employees, '#')
          + '<div style="background:#f0f9ff;border:1px solid #93c5fd;border-radius:10px;padding:14px;margin-top:10px;">'
          +   self._stat('Revenue per employee', self._money(rpe), '#1e40af')
          +   '<div style="display:inline-block;margin-left:12px;padding:4px 12px;background:' + rpeRating.color + ';color:#fff;font-size:11px;font-weight:700;border-radius:12px;letter-spacing:.05em;">' + rpeRating.label + '</div>'
          +   '<div style="font-size:12px;color:#1e3a8a;margin-top:8px;">' + rpeRating.desc + '</div>'
          + '</div>'
        );

    // ── 3. Lead Funnel ──
    var leads = Number(d.leads) || 0;
    var contacted = Number(d.contacted) || 0;
    var estimates = Number(d.estimates) || 0;
    var closed = Number(d.closed) || 0;
    var contactRate = leads ? (contacted / leads * 100) : 0;
    var estRate = contacted ? (estimates / contacted * 100) : 0;
    var closeRate = estimates ? (closed / estimates * 100) : 0;
    var overallRate = leads ? (closed / leads * 100) : 0;
    // Detect bottleneck
    var bn = '—';
    if (leads > 0) {
      if (contactRate < 70) bn = '🔴 Leads aren\'t getting contacted — answer/call back faster';
      else if (estRate < 60) bn = '🟠 Contacts not converting to estimates — improve pitch';
      else if (closeRate < 30) bn = '🟡 Estimates not closing — pricing, follow-up, or proposal quality';
      else bn = '✅ Funnel healthy across the board';
    }
    html += ''
      + self._card('📊 Sales Funnel — Where You\'re Leaking',
          'Last 30 days. Cardone: "You don\'t have a revenue problem, you have an activity problem."',
          ''
          + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">'
          +   self._row('Leads (inbound)', 'leads', 'number', leads, '#')
          +   self._row('Contacted', 'contacted', 'number', contacted, '#')
          +   self._row('Estimates given', 'estimates', 'number', estimates, '#')
          +   self._row('Closed / won', 'closed', 'number', closed, '#')
          + '</div>'
          + '<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:14px;margin-top:10px;">'
          +   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;">'
          +     self._mini('Lead → Contact', self._pct(contactRate), '#334155')
          +     self._mini('Contact → Estimate', self._pct(estRate), '#334155')
          +     self._mini('Estimate → Closed', self._pct(closeRate), '#334155')
          +     self._mini('Overall conversion', self._pct(overallRate), '#0f766e')
          +   '</div>'
          +   '<div style="margin-top:10px;padding:10px;background:#fff;border-radius:8px;font-size:13px;font-weight:600;color:#1e293b;">' + bn + '</div>'
          + '</div>'
        );

    // ── 4. Daily Output / Obsession Scorecard ──
    var dailyGoal = Number(d.revCurrent) ? (Number(d.revCurrent) * 10 / 250) : 0; // 10X divided by working days
    var avgJobSize = closed ? (revCurrent / closed) : (Number(d.avgJobSize) || 1500);
    var jobsNeededDaily = avgJobSize ? (dailyGoal / avgJobSize) : 0;
    var closeR = closeRate > 0 ? closeRate / 100 : 0.35;
    var estimatesDaily = closeR ? (jobsNeededDaily / closeR) : 0;
    var contactsDaily = estRate > 0 ? (estimatesDaily / (estRate/100)) : (estimatesDaily * 1.6);
    var leadsDaily = contactRate > 0 ? (contactsDaily / (contactRate/100)) : (contactsDaily * 1.4);
    html += ''
      + self._card('⚡ Daily Obsession Scorecard',
          'Work backward from 10X. What do you need to DO every day?',
          '<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:10px;padding:14px;">'
          + '<div style="font-size:12px;color:#991b1b;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">To hit 10X annual target</div>'
          + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">'
          +   self._bigStat(Math.ceil(leadsDaily), 'leads/day', '#dc2626')
          +   self._bigStat(Math.ceil(contactsDaily), 'contacts/day', '#ea580c')
          +   self._bigStat(Math.ceil(estimatesDaily), 'estimates/day', '#d97706')
          +   self._bigStat(Math.ceil(jobsNeededDaily * 10) / 10, 'jobs closed/day', '#059669')
          +   self._bigStat(self._money(dailyGoal), 'revenue/day', '#1e40af')
          + '</div>'
          + '<div style="font-size:12px;color:#7f1d1d;margin-top:10px;font-style:italic;">"Be so obsessed with your numbers you check them twice a day."</div>'
          + '</div>'
        );

    // ── 5. Price Increase Impact ──
    var priceHike = Number(d.priceHike) || 10;
    var newRev = revCurrent * (1 + priceHike/100);
    var addlRev = newRev - revCurrent;
    html += ''
      + self._card('💰 Price Increase Impact',
          'Most tree-care companies are under-priced. Raising prices on same volume = pure margin.',
          ''
          + self._row('Price increase %', 'priceHike', 'number', priceHike, '%')
          + '<div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:10px;padding:14px;margin-top:10px;">'
          +   self._stat('New annual revenue', self._money(newRev), '#047857')
          +   self._stat('Additional revenue (pure margin)', self._money(addlRev), '#065f46')
          + '</div>'
          + '<div style="font-size:12px;color:#065f46;margin-top:10px;">💡 If you lose 5% of customers from a 10% hike, you\'re still ahead. Price is permission to deliver value.</div>'
        );

    // ── 6. Lifetime Value (LTV) ──
    var avgTicket = closed ? (revCurrent / closed) : (Number(d.avgTicket) || 1500);
    var repeatsPerYear = Number(d.repeatsPerYear) || 1.2;
    var yearsRetained = Number(d.yearsRetained) || 5;
    var ltv = avgTicket * repeatsPerYear * yearsRetained;
    html += ''
      + self._card('♾️ Client Lifetime Value (LTV)',
          'What\'s one happy client worth over 5 years?',
          ''
          + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">'
          +   self._row('Avg job ticket', 'avgTicket', 'number', avgTicket.toFixed(0), '$')
          +   self._row('Visits / year', 'repeatsPerYear', 'number', repeatsPerYear, '×')
          +   self._row('Avg retention (years)', 'yearsRetained', 'number', yearsRetained, 'yr')
          + '</div>'
          + '<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:10px;padding:14px;margin-top:10px;">'
          +   self._stat('Client LTV', self._money(ltv), '#1e40af')
          + '</div>'
          + '<div style="font-size:12px;color:#1e3a8a;margin-top:10px;">Use LTV as your ceiling on what to spend to acquire a customer.</div>'
        );

    // ── 7. Customer Acquisition Cost (CAC) ──
    var marketingSpend = Number(d.marketingSpend) || 0;
    var cac = closed ? (marketingSpend / closed) : 0;
    var ltvToCac = cac ? (ltv / cac) : 0;
    var cacRating = ltvToCac >= 5 ? { label: 'EXCELLENT', color: '#059669' }
                  : ltvToCac >= 3 ? { label: 'HEALTHY', color: '#0891b2' }
                  : ltvToCac >= 1 ? { label: 'BREAK-EVEN', color: '#d97706' }
                  : ltvToCac > 0  ? { label: 'LOSING MONEY', color: '#dc2626' }
                  :                  { label: '—', color: '#6b7280' };
    html += ''
      + self._card('🎯 Customer Acquisition Cost (CAC)',
          'What it costs you to land each new client. LTV:CAC target ≥ 3:1.',
          ''
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
          +   self._row('Marketing spend (monthly)', 'marketingSpend', 'number', marketingSpend, '$')
          + '</div>'
          + '<div style="background:var(--green-bg);border:1px solid var(--green-light);border-radius:10px;padding:14px;margin-top:10px;">'
          +   self._stat('CAC (cost per new client)', self._money(cac), 'var(--green-dark)')
          +   self._stat('LTV : CAC ratio', ltvToCac.toFixed(1) + ':1', 'var(--green-dark)')
          +   '<div style="display:inline-block;margin-left:12px;padding:4px 12px;background:' + cacRating.color + ';color:#fff;font-size:11px;font-weight:700;border-radius:12px;">' + cacRating.label + '</div>'
          + '</div>'
        );

    // ── 8. Follow-up Frequency ──
    var touches = Number(d.touches) || 2;
    // Baseline close rate multipliers from sales research:
    // 1 touch: 1× (baseline, ~2%)
    // 5 touches: 4×
    // 8-12 touches: 8×
    var mult = touches <= 1 ? 1 : touches <= 4 ? touches : touches <= 8 ? 4 + (touches-4)*0.8 : 7.2 + (touches-8)*0.2;
    var currentClosed = closed;
    var projectedClosed = currentClosed * mult;
    var projectedRev = projectedClosed * (avgTicket || 1500);
    html += ''
      + self._card('📞 Follow-Up Frequency Impact',
          '80% of sales take 5–12 touches. Most salespeople quit after 1–2.',
          ''
          + self._row('Avg touches per prospect', 'touches', 'number', touches, '#')
          + '<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px;margin-top:10px;">'
          +   self._stat('Multiplier vs 1-touch baseline', mult.toFixed(1) + 'x', '#b45309')
          +   self._stat('Projected jobs closed', Math.round(projectedClosed).toLocaleString(), '#92400e')
          +   self._stat('Projected revenue', self._money(projectedRev), '#78350f')
          + '</div>'
          + '<div style="font-size:12px;color:#78350f;margin-top:10px;">💡 Moving from 2 → 8 follow-ups on the same lead volume typically 2–4× closed jobs.</div>'
        );

    // ── 9. Break-Even ──
    var fixedCosts = Number(d.fixedCosts) || 0;
    var grossMargin = Number(d.grossMargin) || 55;
    var breakEven = fixedCosts / (grossMargin/100);
    var breakEvenMonthly = breakEven / 12;
    html += ''
      + self._card('⚖️ Break-Even Calculator',
          'What you must collect to cover fixed overhead at your current margin.',
          ''
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
          +   self._row('Annual fixed costs (rent, insurance, payroll, trucks)', 'fixedCosts', 'number', fixedCosts, '$')
          +   self._row('Gross margin %', 'grossMargin', 'number', grossMargin, '%')
          + '</div>'
          + '<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:14px;margin-top:10px;">'
          +   self._stat('Break-even annual revenue', self._money(breakEven), '#b91c1c')
          +   self._stat('Break-even monthly', self._money(breakEvenMonthly), '#991b1b')
          + '</div>'
        );

    // ── 10. Power Planner — daily activity targets ──
    var targetHours = Number(d.targetHours) || 10;
    var callsPerHour = Number(d.callsPerHour) || 5;
    var dailyCalls = targetHours * callsPerHour;
    var weeklyCalls = dailyCalls * 6;
    var monthlyCalls = dailyCalls * 25;
    var contactPct = Number(d.contactPct) || 30;
    var qualifiedContacts = monthlyCalls * (contactPct/100);
    var monthlyEstimates = qualifiedContacts * 0.4;
    var monthlyCloses = monthlyEstimates * (closeR || 0.35);
    var monthlyRev = monthlyCloses * (avgTicket || 1500);
    html += ''
      + self._card('📋 Power Planner — Hours × Calls × Revenue',
          'Cardone: "Time is the only thing you can\'t manufacture." Map hours → calls → money.',
          ''
          + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">'
          +   self._row('Hours of focused work/day', 'targetHours', 'number', targetHours, 'hr')
          +   self._row('Outbound calls per hour', 'callsPerHour', 'number', callsPerHour, '#')
          +   self._row('Contact rate % (answered)', 'contactPct', 'number', contactPct, '%')
          + '</div>'
          + '<div style="background:#eef2ff;border:1px solid #a5b4fc;border-radius:10px;padding:14px;margin-top:10px;">'
          +   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;">'
          +     self._mini('Calls / day', Math.round(dailyCalls).toLocaleString(), '#4338ca')
          +     self._mini('Calls / week', Math.round(weeklyCalls).toLocaleString(), '#4338ca')
          +     self._mini('Calls / month', Math.round(monthlyCalls).toLocaleString(), '#3730a3')
          +     self._mini('Qual. contacts / mo', Math.round(qualifiedContacts).toLocaleString(), '#6366f1')
          +     self._mini('Est. closes / mo', Math.round(monthlyCloses).toLocaleString(), '#059669')
          +     self._mini('Projected monthly rev', self._money(monthlyRev), '#047857')
          +   '</div>'
          + '</div>'
        );

    // ── 11. Retirement / Freedom Number ──
    var currentAge = Number(d.currentAge) || 40;
    var retireAge = Number(d.retireAge) || 65;
    var monthlyNeeded = Number(d.monthlyNeeded) || 15000;
    var yearsToSave = Math.max(0, retireAge - currentAge);
    // 25× rule — safe withdrawal
    var freedomNumber = monthlyNeeded * 12 * 25;
    var requiredAnnualSavings = yearsToSave > 0 ? (freedomNumber / yearsToSave) : 0; // no growth, worst case
    var pctBusinessNeeded = revCurrent ? (requiredAnnualSavings / revCurrent * 100) : 0;
    html += ''
      + self._card('🏖 Freedom Number — How Much to Retire',
          'Cardone\'s "Financial Freedom" target: 25× annual spending invested = passive income replacement. What does your business need to throw off?',
          ''
          + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;">'
          +   self._row('Your current age', 'currentAge', 'number', currentAge, 'yr')
          +   self._row('Target retire age', 'retireAge', 'number', retireAge, 'yr')
          +   self._row('Monthly income needed (today\'s $)', 'monthlyNeeded', 'number', monthlyNeeded, '$')
          + '</div>'
          + '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px;margin-top:10px;">'
          +   self._stat('Freedom Number (25× rule)', self._money(freedomNumber), '#166534')
          +   self._stat('Save / year to hit it', self._money(requiredAnnualSavings), '#15803d')
          +   self._stat('% of current revenue', pctBusinessNeeded.toFixed(1) + '%', '#166534')
          + '</div>'
          + '<div style="font-size:12px;color:#15803d;margin-top:10px;">💡 If % of revenue is &gt; 30%, you need to either grow rev, cut costs, or extend timeline. This is WHY 10X matters.</div>'
        );

    // ── 12. Crew Utilization ──
    var crewHoursAvail = Number(d.crewHoursAvail) || 40;
    var crewHoursBilled = Number(d.crewHoursBilled) || 24;
    var crewUtil = crewHoursAvail > 0 ? (crewHoursBilled / crewHoursAvail * 100) : 0;
    var utilLabel = crewUtil >= 80 ? { label: 'OPTIMAL', color: '#059669', desc: 'Running tight — watch burnout' }
                  : crewUtil >= 65 ? { label: 'HEALTHY', color: '#0891b2', desc: 'Room to take more jobs' }
                  : crewUtil >= 50 ? { label: 'LOW', color: '#d97706', desc: 'Over-staffed or lead-starved' }
                  : crewUtil > 0   ? { label: 'BLEEDING', color: '#dc2626', desc: 'You\'re paying people to do nothing' }
                  :                   { label: '—', color: '#6b7280', desc: '' };
    var idleCostMonthly = (crewHoursAvail - crewHoursBilled) * 4 * (Number(d.laborCost) || 35) * (employees || 1);
    html += ''
      + self._card('🏗 Crew Utilization — Idle Cost Killer',
          'Billed hours ÷ available hours. Every unbilled hour is payroll you\'re bleeding.',
          ''
          + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;">'
          +   self._row('Crew hours available / week', 'crewHoursAvail', 'number', crewHoursAvail, 'hr')
          +   self._row('Crew hours BILLED / week', 'crewHoursBilled', 'number', crewHoursBilled, 'hr')
          +   self._row('Labor cost / hr (fully loaded)', 'laborCost', 'number', Number(d.laborCost) || 35, '$')
          + '</div>'
          + '<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px;margin-top:10px;">'
          +   self._stat('Utilization', self._pct(crewUtil), utilLabel.color)
          +   '<div style="display:inline-block;margin-left:12px;padding:4px 12px;background:' + utilLabel.color + ';color:#fff;font-size:11px;font-weight:700;border-radius:12px;">' + utilLabel.label + '</div>'
          +   '<div style="font-size:12px;color:#78350f;margin-top:8px;">' + utilLabel.desc + '</div>'
          +   '<div style="margin-top:10px;padding-top:10px;border-top:1px solid #fde68a;">'
          +     self._stat('Monthly idle cost (all crew)', self._money(idleCostMonthly), '#b91c1c')
          +   '</div>'
          + '</div>'
        );

    // ── 13. Commitment Pledge ──
    var pledgeSigned = d.pledgeSigned === '1' || d.pledgeSigned === true;
    var pledgeDate = d.pledgeDate || '';
    html += ''
      + self._card('✍️ 10X Commitment Pledge',
          'Cardone: "Write it down. Sign it. Read it daily." Declarations hold you accountable.',
          '<div style="background:' + (pledgeSigned ? '#ecfdf5' : '#fafaf9') + ';border:2px solid ' + (pledgeSigned ? '#10b981' : '#d6d3d1') + ';border-radius:10px;padding:18px;line-height:1.7;font-size:14px;color:#1f2937;">'
          + '<div style="font-style:italic;">'
          +   '"I will not reduce my target — I will increase my actions.<br>'
          +   'I commit to making more calls, giving more estimates, following up more often, and delivering more value than anyone in my market.<br>'
          +   'My goal is <strong>' + (revCurrent > 0 ? self._money(rev10x) : '10× my current revenue') + '</strong> within 3 years. I will be obsessed with getting there."'
          + '</div>'
          + '<div style="display:flex;gap:10px;align-items:center;margin-top:14px;">'
          +   (pledgeSigned
                ? '<span style="color:#047857;font-weight:700;">✅ Signed ' + (pledgeDate || 'today') + '</span>'
                : '<button onclick="CardoneTools._signPledge()" style="background:#dc2626;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;">I COMMIT — Sign the Pledge</button>')
          +   (pledgeSigned ? ' <button onclick="CardoneTools._unsignPledge()" style="background:none;border:1px solid #d4d4d8;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;color:#71717a;">Reset</button>' : '')
          + '</div>'
          + '</div>'
        );

    // ── Cardone quotes footer ──
    html += ''
      + '<div style="background:#0f172a;color:#cbd5e1;border-radius:14px;padding:28px;margin:20px 0 40px;text-align:center;">'
      +   '<div style="font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#f97316;font-weight:700;margin-bottom:10px;">Cardone Reminders</div>'
      +   '<div style="font-size:15px;line-height:1.7;max-width:620px;margin:0 auto;">'
      +     '• Success is your duty.<br>'
      +     '• Money doesn\'t sleep. Neither should your follow-up.<br>'
      +     '• If you\'re not first, you\'re last.<br>'
      +     '• Don\'t reduce your target — increase your actions.'
      +   '</div>'
      + '</div>'

      + '<div style="text-align:center;padding:14px;color:var(--text-light);font-size:12px;margin-bottom:24px;">'
      +   'All numbers auto-save. We\'ll pipe this into Reports soon so you can track 10X progress over time.'
      + '</div>'

      + '</div>'; // max-width wrapper

    // Mount input listeners after render
    setTimeout(function() {
      var inputs = document.querySelectorAll('[data-ck]');
      for (var i = 0; i < inputs.length; i++) {
        (function(el) {
          el.addEventListener('input', function() {
            CardoneTools._set(el.dataset.ck, el.value);
            CardoneTools._debouncedRerender();
          });
        })(inputs[i]);
      }
    }, 0);

    // close the Cardone <details>
    html += '</div></details>';

    // ── Alex Hormozi — Acquisition / Value Equation ──
    html += '<details style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin-bottom:14px;overflow:hidden;">'
      +   '<summary style="padding:16px 20px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:#fff;">'
      +     '<div>'
      +       '<div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#22d3ee;font-weight:700;">Alex Hormozi · Acquisition</div>'
      +       '<div style="font-size:16px;font-weight:800;margin-top:2px;">Make your offer so good people feel stupid saying no.</div>'
      +     '</div>'
      +     '<span style="font-size:14px;opacity:.7;">▾</span>'
      +   '</summary>'
      +   '<div style="padding:18px;font-size:13px;line-height:1.6;color:var(--text);">'
      +     '<p style="margin:0 0 12px;color:var(--text-light);">The Value Equation:</p>'
      +     '<div style="background:#f8fafc;border-left:3px solid #22d3ee;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:16px;font-family:monospace;font-size:14px;">'
      +       'Value = (Dream Outcome × Perceived Likelihood) / (Time Delay × Effort &amp; Sacrifice)'
      +     '</div>'
      +     '<p style="margin:0 0 8px;"><strong>Apply to a tree quote:</strong></p>'
      +     '<ul style="margin:0 0 16px 18px;padding:0;color:var(--text-light);">'
      +       '<li><strong>Dream Outcome ↑</strong> — paint the result: clean property, no power-line risk, photos before/after.</li>'
      +       '<li><strong>Likelihood ↑</strong> — license/insurance, reviews on the quote PDF, named-guarantee.</li>'
      +       '<li><strong>Time Delay ↓</strong> — "we can be there next Tuesday" beats "in a few weeks."</li>'
      +       '<li><strong>Effort ↓</strong> — they don\'t lift a finger; we handle permits, debris, follow-up.</li>'
      +     '</ul>'
      +     '<p style="margin:0;color:var(--text-light);font-size:12px;font-style:italic;">Calculators coming — score your current quote against the equation. For now, use this lens when you write the description.</p>'
      +   '</div>'
      + '</details>';

    // ── Tony Robbins — Decisions / RPM ──
    html += '<details style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin-bottom:14px;overflow:hidden;">'
      +   '<summary style="padding:16px 20px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,#7c2d12 0%,#9a3412 100%);color:#fff;">'
      +     '<div>'
      +       '<div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#fbbf24;font-weight:700;">Tony Robbins · RPM</div>'
      +       '<div style="font-size:16px;font-weight:800;margin-top:2px;">Result · Purpose · Massive Action.</div>'
      +     '</div>'
      +     '<span style="font-size:14px;opacity:.7;">▾</span>'
      +   '</summary>'
      +   '<div style="padding:18px;font-size:13px;line-height:1.6;color:var(--text);">'
      +     '<p style="margin:0 0 12px;color:var(--text-light);">RPM flips the order most to-do lists use. Don\'t start with the action. Start with the <strong>specific result</strong>, anchor the <strong>purpose</strong> (why it matters), then write a <strong>massive action plan</strong>.</p>'
      +     '<div style="display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:16px;">'
      +       '<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:12px 14px;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#92400e;">Result</div><textarea placeholder="e.g. Hit $750k revenue by Dec 31, 2026 (specific, measurable, dated)" rows="2" style="width:100%;margin-top:6px;padding:8px;border:1px solid #fbbf24;border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box;"></textarea></div>'
      +       '<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:12px 14px;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#92400e;">Purpose</div><textarea placeholder="Why does this result matter? (Bigger reasons → bigger persistence)" rows="2" style="width:100%;margin-top:6px;padding:8px;border:1px solid #fbbf24;border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box;"></textarea></div>'
      +       '<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:12px 14px;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#92400e;">Massive Action Plan</div><textarea placeholder="Top 3-5 actions, in priority order. Schedule them this week." rows="4" style="width:100%;margin-top:6px;padding:8px;border:1px solid #fbbf24;border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box;"></textarea></div>'
      +     '</div>'
      +     '<p style="margin:0;color:var(--text-light);font-size:12px;font-style:italic;">Save-on-blur + history coming. For now, keep this open as a thinking tool.</p>'
      +   '</div>'
      + '</details>';

    return html;
  },

  _signPledge: function() {
    var today = new Date().toLocaleDateString();
    this._set('pledgeSigned', '1');
    this._set('pledgeDate', today);
    if (typeof UI !== 'undefined' && UI.toast) UI.toast('Pledge signed — now go get it. 💪');
    if (window._currentPage === 'cardone') loadPage('cardone');
  },
  _unsignPledge: function() {
    if (!confirm('Reset the pledge?')) return;
    this._set('pledgeSigned', '');
    this._set('pledgeDate', '');
    if (window._currentPage === 'cardone') loadPage('cardone');
  },

  _debouncedRerender: function() {
    clearTimeout(this._rerenderT);
    this._rerenderT = setTimeout(function() {
      if (window._currentPage === 'cardone') loadPage('cardone');
    }, 400);
  },

  // ── building blocks ──
  _card: function(title, subtitle, body) {
    return ''
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:22px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.04);">'
      +   '<h3 style="margin:0 0 4px;font-size:17px;font-weight:700;color:var(--text);">' + title + '</h3>'
      +   '<div style="font-size:13px;color:var(--text-light);margin-bottom:14px;line-height:1.5;">' + subtitle + '</div>'
      +   body
      + '</div>';
  },
  _row: function(label, key, type, value, unit) {
    return ''
      + '<label style="display:block;margin-bottom:8px;">'
      +   '<div style="font-size:12px;color:var(--text-light);margin-bottom:4px;font-weight:600;">' + label + ' <span style="color:#94a3b8;font-weight:400;">(' + (unit||'') + ')</span></div>'
      +   '<input data-ck="' + key + '" type="' + type + '" value="' + (value===0?'':value) + '" style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;" placeholder="0">'
      + '</label>';
  },
  _stat: function(label, value, color) {
    return ''
      + '<div style="display:inline-block;margin-right:18px;vertical-align:top;">'
      +   '<div style="font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">' + label + '</div>'
      +   '<div style="font-size:22px;font-weight:800;color:' + color + ';line-height:1.2;">' + value + '</div>'
      + '</div>';
  },
  _mini: function(label, value, color) {
    return ''
      + '<div style="text-align:center;">'
      +   '<div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;">' + label + '</div>'
      +   '<div style="font-size:18px;font-weight:800;color:' + color + ';">' + value + '</div>'
      + '</div>';
  },
  _bigStat: function(value, label, color) {
    return ''
      + '<div style="text-align:center;padding:10px;background:#fff;border-radius:8px;">'
      +   '<div style="font-size:28px;font-weight:800;color:' + color + ';line-height:1;">' + value + '</div>'
      +   '<div style="font-size:11px;color:#64748b;font-weight:600;margin-top:4px;text-transform:uppercase;letter-spacing:.04em;">' + label + '</div>'
      + '</div>';
  }

};
