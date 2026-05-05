/**
 * Branch Manager — Insights Page v7
 * Revenue charts, funnel metrics, marketing source breakdown,
 * quick KPI row, revenue goal tracker, revenue forecast,
 * client LTV, invoice collection report, win rate by source, new client growth
 */
var InsightsPage = {
  _year: null, // null = current year

  render: function() {
    var allInvoices = DB.invoices.getAll();
    var allJobs = DB.jobs.getAll();
    var allQuotes = DB.quotes.getAll();
    var allRequests = DB.requests.getAll();
    var allClients = DB.clients.getAll();

    var now = new Date();
    var year = InsightsPage._year || now.getFullYear();

    // Find available years from invoice data
    var yearsSet = {};
    allInvoices.forEach(function(inv) { yearsSet[new Date(inv.createdAt).getFullYear()] = true; });
    var availableYears = Object.keys(yearsSet).map(Number).sort().reverse();
    if (availableYears.indexOf(now.getFullYear()) === -1) availableYears.unshift(now.getFullYear());

    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // Revenue by month (selected year)
    var monthlyRev = [];
    for (var m = 0; m < 12; m++) {
      var rev = allInvoices.filter(function(inv) {
        if (inv.status !== 'paid') return false;
        var d = new Date(inv.paidDate || inv.createdAt);
        return d.getFullYear() === year && d.getMonth() === m;
      }).reduce(function(sum, inv) { return sum + (inv.total || 0); }, 0);
      monthlyRev.push({ month: monthNames[m], revenue: rev });
    }
    var maxRev = Math.max.apply(null, monthlyRev.map(function(m) { return m.revenue; })) || 1;

    // Total revenue
    var totalRevYear = monthlyRev.reduce(function(s, m) { return s + m.revenue; }, 0);
    var totalReceivable = DB.invoices.totalReceivable();

    // Quick KPI: this month vs last month revenue
    var thisMonth = now.getMonth();
    var lastMonth = (thisMonth === 0) ? 11 : thisMonth - 1;
    var lastMonthYear = (thisMonth === 0) ? now.getFullYear() - 1 : now.getFullYear();
    var lastMonthRev = allInvoices.filter(function(i) {
      if (i.status !== 'paid') return false;
      var d = new Date(i.paidDate || i.createdAt);
      return d.getFullYear() === lastMonthYear && d.getMonth() === lastMonth;
    }).reduce(function(s,i){return s+(i.total||0);},0);
    var thisMonthRev = allInvoices.filter(function(i) {
      if (i.status !== 'paid') return false;
      var d = new Date(i.paidDate || i.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).reduce(function(s,i){return s+(i.total||0);},0);
    var momChange = lastMonthRev > 0 ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100) : null;

    // Open pipeline and scheduled revenue
    var openPipeline = allQuotes.filter(function(q){return q.status==='sent'||q.status==='awaiting';}).reduce(function(s,q){return s+(q.total||0);},0);
    var scheduledRevenue = allJobs.filter(function(j){return j.status==='scheduled'||j.status==='in_progress';}).reduce(function(s,j){return s+(j.total||0);},0);

    // Revenue goal tracker variables
    var monthGoal = parseInt(localStorage.getItem('bm-revenue-goal') || '0');
    var currentMonthInvoices = allInvoices.filter(function(inv) {
      if (inv.status !== 'paid') return false;
      var d = new Date(inv.paidDate || inv.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    var currentMonthRev = currentMonthInvoices.reduce(function(s,i){return s+(i.total||0);},0);
    var goalPct = monthGoal > 0 ? Math.min(Math.round((currentMonthRev / monthGoal) * 100), 100) : 0;
    var daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    var dayOfMonth = now.getDate();
    var dayPct = Math.round((dayOfMonth / daysInMonth) * 100);
    var onTrack = monthGoal === 0 || goalPct >= dayPct;

    // Revenue forecast data (last 6 months)
    var monthsData = [];
    for (var mi = 5; mi >= 0; mi--) {
      var mDate = new Date(now.getFullYear(), now.getMonth() - mi, 1);
      var mRev = allInvoices.filter(function(inv) {
        if (inv.status !== 'paid') return false;
        var d = new Date(inv.paidDate || inv.createdAt);
        return d.getFullYear() === mDate.getFullYear() && d.getMonth() === mDate.getMonth();
      }).reduce(function(s,i){return s+(i.total||0);},0);
      monthsData.push({ label: monthNames[mDate.getMonth()] + ' \'' + String(mDate.getFullYear()).slice(2), revenue: mRev, isFuture: false });
    }
    // Simple average-based forecast for next 3 months
    var last3Avg = monthsData.slice(-3).reduce(function(s,m){return s+m.revenue;},0) / 3;
    var trend = (monthsData[5].revenue - monthsData[2].revenue) / 3; // simple slope
    for (var fi = 1; fi <= 3; fi++) {
      var fDate = new Date(now.getFullYear(), now.getMonth() + fi, 1);
      var fRev = Math.max(0, last3Avg + trend * fi * 0.3); // dampened trend
      monthsData.push({ label: monthNames[fDate.getMonth()] + ' \'' + String(fDate.getFullYear()).slice(2), revenue: fRev, isFuture: true });
    }
    var maxForecast = Math.max.apply(null, monthsData.map(function(m){return m.revenue;})) || 1;

    // Marketing source breakdown with auto-categorization
    var SOURCE_MAP = {
      'google': 'Google Search', 'google search': 'Google Search', 'google maps': 'Google Search',
      'gbp': 'Google Search', 'organic': 'Google Search', 'seo': 'Google Search',
      'facebook': 'Facebook', 'fb': 'Facebook', 'facebook ad': 'Facebook',
      'instagram': 'Instagram', 'ig': 'Instagram', 'insta': 'Instagram',
      'nextdoor': 'Nextdoor', 'next door': 'Nextdoor',
      'referral': 'Referral', 'friend': 'Referral', 'friend/referral': 'Referral',
      'word of mouth': 'Referral', 'neighbor': 'Referral', 'family': 'Referral',
      'yelp': 'Yelp', 'angi': 'Angi', 'angies list': 'Angi', 'angie': 'Angi',
      'thumbtack': 'Thumbtack', 'porch': 'Porch', 'homeadvisor': 'HomeAdvisor',
      'drive-by': 'Drive-by', 'driveby': 'Drive-by', 'sign': 'Drive-by', 'truck': 'Drive-by', 'saw truck': 'Drive-by',
      'repeat': 'Repeat Client', 'repeat client': 'Repeat Client', 'existing': 'Repeat Client', 'returning': 'Repeat Client',
      'website': 'Website', 'web': 'Website', 'online': 'Website',
      'flyer': 'Flyer/Mailer', 'mailer': 'Flyer/Mailer', 'postcard': 'Flyer/Mailer', 'door hanger': 'Flyer/Mailer'
    };
    var sources = {};
    allRequests.forEach(function(r) {
      var raw = (r.source || 'Unknown').trim();
      var normalized = SOURCE_MAP[raw.toLowerCase()] || raw;
      sources[normalized] = (sources[normalized] || 0) + 1;
    });
    var sourceList = Object.keys(sources).map(function(k) { return { source: k, count: sources[k] }; })
      .sort(function(a, b) { return b.count - a.count; });

    // Funnel
    var totalLeads = allClients.length;
    var totalRequests = allRequests.length;
    var totalQuotes = allQuotes.length;
    var convertedQuotes = allQuotes.filter(function(q) { return q.status === 'approved' || q.status === 'converted'; }).length;
    var totalJobs = allJobs.length;
    var completedJobs = allJobs.filter(function(j) { return j.status === 'completed'; }).length;

    var html = '';

    // Year picker
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      + '<h2 style="font-size:18px;font-weight:700;">Insights</h2>'
      + '<div style="display:flex;gap:4px;background:var(--bg);border-radius:8px;padding:3px;">';
    availableYears.forEach(function(y) {
      var active = y === year;
      html += '<button onclick="InsightsPage._year=' + y + ';loadPage(\'insights\')" style="border:none;padding:6px 14px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;'
        + (active ? 'background:var(--green-dark);color:#fff;' : 'background:transparent;color:var(--text);') + '">' + y + '</button>';
    });
    html += '</div></div>';

    // Quick KPI row (4 cards)
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;" class="stat-row">'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">' + monthNames[now.getMonth()] + ' Revenue</div>'
      + '<div style="font-size:26px;font-weight:800;color:var(--green-dark);margin:4px 0;">' + UI.moneyInt(thisMonthRev) + '</div>'
      + (momChange !== null ? '<div style="font-size:12px;font-weight:700;color:' + (momChange >= 0 ? '#2e7d32' : '#dc3545') + ';">' + (momChange >= 0 ? '↑' : '↓') + Math.abs(momChange) + '% vs last month</div>' : '<div style="font-size:12px;color:var(--text-light);">vs last month N/A</div>')
      + '</div>'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">Open Pipeline</div>'
      + '<div style="font-size:26px;font-weight:800;color:#1565c0;margin:4px 0;">' + UI.moneyInt(openPipeline) + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Sent quotes awaiting approval</div>'
      + '</div>'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">Scheduled Value</div>'
      + '<div style="font-size:26px;font-weight:800;color:#e65100;margin:4px 0;">' + UI.moneyInt(scheduledRevenue) + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Jobs on the calendar</div>'
      + '</div>'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">Receivables</div>'
      + '<div style="font-size:26px;font-weight:800;color:#c62828;margin:4px 0;">' + UI.moneyInt(totalReceivable) + '</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Outstanding balances</div>'
      + '</div>'
      + '</div>';

    // Revenue stats
    var yearInvoices = allInvoices.filter(function(i) { return new Date(i.createdAt).getFullYear() === year; });
    var yearAvgInv = yearInvoices.length > 0 ? yearInvoices.reduce(function(s,i){return s+i.total;},0) / yearInvoices.length : 0;
    html += '<div class="stat-grid">'
      + UI.statCard('Revenue ' + year, UI.moneyInt(totalRevYear), 'Paid invoices', totalRevYear > 0 ? 'up' : '', '')
      + UI.statCard('Receivables', UI.moneyInt(totalReceivable), 'Outstanding balance', totalReceivable > 0 ? 'down' : '', '')
      + UI.statCard('Jobs', totalJobs.toString(), completedJobs + ' completed', '', '')
      + UI.statCard('Avg Invoice', yearAvgInv > 0 ? UI.moneyInt(yearAvgInv) : '$0', yearInvoices.length + ' invoices ' + year, '', '')
      + '</div>';

    // Revenue bar chart
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="margin-bottom:16px;">Revenue by Month — ' + year + '</h3>'
      + '<div style="display:flex;align-items:flex-end;gap:6px;height:200px;padding-bottom:24px;position:relative;">';

    monthlyRev.forEach(function(m, i) {
      var h = maxRev > 0 ? Math.max((m.revenue / maxRev) * 180, m.revenue > 0 ? 8 : 2) : 2;
      var isCurrentMonth = i === now.getMonth();
      html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;">'
        + (m.revenue > 0 ? '<div style="font-size:10px;font-weight:700;color:var(--green-dark);margin-bottom:2px;">' + UI.moneyInt(m.revenue) + '</div>' : '')
        + '<div style="width:100%;max-width:40px;height:' + h + 'px;background:' + (isCurrentMonth ? 'var(--green-dark)' : 'var(--green-light)') + ';border-radius:4px 4px 0 0;opacity:' + (m.revenue > 0 ? '1' : '.2') + ';"></div>'
        + '<div style="font-size:10px;color:var(--text-light);margin-top:4px;' + (isCurrentMonth ? 'font-weight:700;color:var(--green-dark);' : '') + '">' + m.month + '</div>'
        + '</div>';
    });
    html += '</div></div>';

    // YoY comparison — this year vs last year
    var lastYearNum = year - 1;
    var monthlyRevLastYear = [];
    for (var lm = 0; lm < 12; lm++) {
      var lmRev = allInvoices.filter(function(inv) {
        if (inv.status !== 'paid') return false;
        var d = new Date(inv.paidDate || inv.createdAt);
        return d.getFullYear() === lastYearNum && d.getMonth() === lm;
      }).reduce(function(sum, inv) { return sum + (inv.total || 0); }, 0);
      monthlyRevLastYear.push(lmRev);
    }
    var totalRevLastYear = monthlyRevLastYear.reduce(function(s, v) { return s + v; }, 0);

    // Only show YoY if last year has data
    if (totalRevLastYear > 0) {
      var yoyChange = totalRevLastYear > 0 ? Math.round(((totalRevYear - totalRevLastYear) / totalRevLastYear) * 100) : null;

      html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
        + '<h3 style="margin:0;">Year-over-Year Comparison</h3>'
        + (yoyChange !== null ? '<span style="font-size:14px;font-weight:700;color:' + (yoyChange >= 0 ? '#2e7d32' : '#dc3545') + ';background:' + (yoyChange >= 0 ? '#e8f5e9' : '#ffebee') + ';padding:4px 12px;border-radius:20px;">' + (yoyChange >= 0 ? '↑' : '↓') + Math.abs(yoyChange) + '% vs ' + lastYearNum + '</span>' : '')
        + '</div>'

        // Summary stats
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">'
        + '<div style="padding:12px;background:var(--bg);border-radius:8px;text-align:center;">'
        + '<div style="font-size:11px;color:var(--text-light);text-transform:uppercase;font-weight:600;margin-bottom:4px;">' + year + '</div>'
        + '<div style="font-size:22px;font-weight:800;color:var(--green-dark);">' + UI.moneyInt(totalRevYear) + '</div>'
        + '</div>'
        + '<div style="padding:12px;background:var(--bg);border-radius:8px;text-align:center;">'
        + '<div style="font-size:11px;color:var(--text-light);text-transform:uppercase;font-weight:600;margin-bottom:4px;">' + lastYearNum + '</div>'
        + '<div style="font-size:22px;font-weight:800;color:var(--text-light);">' + UI.moneyInt(totalRevLastYear) + '</div>'
        + '</div>'
        + '<div style="padding:12px;background:' + (yoyChange >= 0 ? '#e8f5e9' : '#ffebee') + ';border-radius:8px;text-align:center;">'
        + '<div style="font-size:11px;color:var(--text-light);text-transform:uppercase;font-weight:600;margin-bottom:4px;">Difference</div>'
        + '<div style="font-size:22px;font-weight:800;color:' + (yoyChange >= 0 ? '#2e7d32' : '#c62828') + ';">' + (yoyChange >= 0 ? '+' : '') + UI.moneyInt(totalRevYear - totalRevLastYear) + '</div>'
        + '</div>'
        + '</div>'

        // Side-by-side monthly bar chart (current year vs last year)
        + '<div style="display:flex;align-items:flex-end;gap:4px;height:120px;padding-bottom:24px;position:relative;">';

      var maxRevCombined = Math.max(
        Math.max.apply(null, monthlyRev.map(function(m) { return m.revenue; })),
        Math.max.apply(null, monthlyRevLastYear)
      ) || 1;

      monthlyRev.forEach(function(m, i) {
        var hCurr = maxRevCombined > 0 ? Math.max((m.revenue / maxRevCombined) * 100, m.revenue > 0 ? 4 : 1) : 1;
        var hLast = maxRevCombined > 0 ? Math.max((monthlyRevLastYear[i] / maxRevCombined) * 100, monthlyRevLastYear[i] > 0 ? 4 : 1) : 1;
        var isCurrentMonth = i === now.getMonth() && year === now.getFullYear();
        html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:1px;">'
          + '<div style="width:100%;display:flex;align-items:flex-end;gap:1px;justify-content:center;">'
          + '<div title="' + year + ': ' + UI.moneyInt(m.revenue) + '" style="flex:1;height:' + hCurr + 'px;background:' + (isCurrentMonth ? 'var(--green-dark)' : 'var(--green-light)') + ';border-radius:2px 2px 0 0;opacity:' + (m.revenue > 0 ? '1' : '.2') + ';"></div>'
          + '<div title="' + lastYearNum + ': ' + UI.moneyInt(monthlyRevLastYear[i]) + '" style="flex:1;height:' + hLast + 'px;background:#b0bec5;border-radius:2px 2px 0 0;opacity:' + (monthlyRevLastYear[i] > 0 ? '1' : '.2') + ';"></div>'
          + '</div>'
          + '<div style="font-size:9px;color:var(--text-light);margin-top:3px;' + (isCurrentMonth ? 'font-weight:700;color:var(--green-dark);' : '') + '">' + m.month + '</div>'
          + '</div>';
      });

      html += '</div>'
        // Legend
        + '<div style="display:flex;gap:16px;font-size:12px;color:var(--text-light);">'
        + '<div style="display:flex;align-items:center;gap:6px;"><div style="width:12px;height:12px;background:var(--green-light);border-radius:2px;"></div>' + year + '</div>'
        + '<div style="display:flex;align-items:center;gap:6px;"><div style="width:12px;height:12px;background:#b0bec5;border-radius:2px;"></div>' + lastYearNum + '</div>'
        + '<div style="margin-left:auto;font-style:italic;">Hover bars for monthly totals</div>'
        + '</div>'
        + '</div>';
    }

    // Funnel + Sources side by side
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">';

    // Funnel
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="margin-bottom:16px;">Pipeline Funnel</h3>';
    var quoteRate = totalLeads > 0 ? Math.round((totalQuotes / totalLeads) * 100) : 0;
    var closeRate = totalQuotes > 0 ? Math.round((convertedQuotes / totalQuotes) * 100) : 0;
    var completeRate = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0;
    var funnelData = [
      { label: 'Clients', count: totalLeads, color: '#2196f3', rate: '' },
      { label: 'Requests', count: totalRequests, color: '#42a5f5', rate: '' },
      { label: 'Quotes Sent', count: totalQuotes, color: '#66bb6a', rate: quoteRate + '% quoted' },
      { label: 'Converted', count: convertedQuotes, color: '#4caf50', rate: closeRate + '% close rate' },
      { label: 'Jobs', count: totalJobs, color: '#2e7d32', rate: '' },
      { label: 'Completed', count: completedJobs, color: '#1b5e20', rate: completeRate + '% complete' }
    ];
    var funnelMax = Math.max.apply(null, funnelData.map(function(f) { return f.count; })) || 1;
    funnelData.forEach(function(f) {
      var pct = Math.round((f.count / funnelMax) * 100);
      html += '<div style="margin-bottom:8px;">'
        + '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:2px;"><span>' + f.label + (f.rate ? ' <span style="font-size:11px;color:var(--text-light);font-weight:400;">(' + f.rate + ')</span>' : '') + '</span><strong>' + f.count + '</strong></div>'
        + '<div style="background:var(--bg);border-radius:4px;height:20px;overflow:hidden;">'
        + '<div style="background:' + f.color + ';height:100%;width:' + pct + '%;border-radius:4px;transition:width .3s;"></div>'
        + '</div></div>';
    });
    html += '</div>';

    // Marketing sources
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="margin-bottom:16px;">Lead Sources</h3>';
    if (sourceList.length === 0) {
      html += '<div style="text-align:center;color:var(--text-light);padding:20px;font-size:14px;">No request data yet</div>';
    } else {
      var sourceColors = ['#4caf50','#2196f3','#ff9800','#9c27b0','#f44336','#00bcd4','#795548','#607d8b'];
      sourceList.forEach(function(s, i) {
        var pct = Math.round((s.count / totalRequests) * 100);
        html += '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f0f0f0;">'
          + '<div style="width:10px;height:10px;border-radius:50%;background:' + (sourceColors[i % sourceColors.length]) + ';flex-shrink:0;"></div>'
          + '<div style="flex:1;font-size:14px;">' + s.source + '</div>'
          + '<div style="font-weight:700;font-size:14px;">' + s.count + '</div>'
          + '<div style="font-size:12px;color:var(--text-light);">' + pct + '%</div>'
          + '</div>';
      });
    }
    html += '</div></div>';

    // Revenue by Service Type (beyond legacy system)
    var serviceRevenue = {};
    allJobs.forEach(function(j) {
      var desc = j.description || j.property || 'Other';
      // Normalize service type from description
      var serviceType = 'Other';
      var descLower = desc.toLowerCase();
      if (descLower.indexOf('removal') !== -1 || descLower.indexOf('remove') !== -1) serviceType = 'Tree Removal';
      else if (descLower.indexOf('prun') !== -1 || descLower.indexOf('trim') !== -1) serviceType = 'Pruning/Trimming';
      else if (descLower.indexOf('stump') !== -1) serviceType = 'Stump Grinding';
      else if (descLower.indexOf('cable') !== -1 || descLower.indexOf('cabling') !== -1) serviceType = 'Cabling';
      else if (descLower.indexOf('snow') !== -1) serviceType = 'Snow Removal';
      else if (descLower.indexOf('clean') !== -1 || descLower.indexOf('debris') !== -1) serviceType = 'Clean Up';
      else if (descLower.indexOf('firewood') !== -1 || descLower.indexOf('wood') !== -1) serviceType = 'Firewood';
      else if (descLower.indexOf('fence') !== -1) serviceType = 'Fence Work';
      else if (descLower.indexOf('consult') !== -1 || descLower.indexOf('assess') !== -1 || descLower.indexOf('arborist') !== -1) serviceType = 'Consultation';
      if (!serviceRevenue[serviceType]) serviceRevenue[serviceType] = { count: 0, revenue: 0 };
      serviceRevenue[serviceType].count++;
      serviceRevenue[serviceType].revenue += (j.total || 0);
    });
    var serviceList = Object.keys(serviceRevenue).map(function(k) {
      return { name: k, count: serviceRevenue[k].count, revenue: serviceRevenue[k].revenue };
    }).sort(function(a, b) { return b.revenue - a.revenue; });
    var maxServiceRev = serviceList.length > 0 ? serviceList[0].revenue : 1;
    var svcColors = ['#2e7d32','#1565c0','#e65100','#6a1b9a','#c62828','#00838f','#4e342e','#37474f','#558b2f','#ad1457'];

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">';

    // Revenue by service type
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="margin-bottom:16px;">Revenue by Service Type</h3>';
    if (serviceList.length === 0) {
      html += '<div style="text-align:center;color:var(--text-light);padding:20px;">No job data yet</div>';
    } else {
      serviceList.slice(0, 8).forEach(function(s, idx) {
        var pct = Math.round((s.revenue / maxServiceRev) * 100);
        html += '<div style="margin-bottom:10px;">'
          + '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px;">'
          + '<span style="font-weight:600;">' + UI.esc(s.name) + ' <span style="font-weight:400;color:var(--text-light);">(' + s.count + ' jobs)</span></span>'
          + '<span style="font-weight:700;">' + UI.moneyInt(s.revenue) + '</span></div>'
          + '<div style="height:8px;background:var(--bg);border-radius:4px;overflow:hidden;">'
          + '<div style="height:100%;width:' + pct + '%;background:' + svcColors[idx % svcColors.length] + ';border-radius:4px;"></div>'
          + '</div></div>';
      });
    }
    html += '</div>';

    // Top clients by revenue
    var clientRevenue = {};
    allJobs.forEach(function(j) {
      var name = j.clientName || 'Unknown';
      if (!clientRevenue[name]) clientRevenue[name] = { count: 0, revenue: 0 };
      clientRevenue[name].count++;
      clientRevenue[name].revenue += (j.total || 0);
    });
    var topClients = Object.keys(clientRevenue).map(function(k) {
      return { name: k, count: clientRevenue[k].count, revenue: clientRevenue[k].revenue };
    }).sort(function(a, b) { return b.revenue - a.revenue; });

    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="margin-bottom:16px;">Top Clients by Revenue</h3>';
    if (topClients.length === 0) {
      html += '<div style="text-align:center;color:var(--text-light);padding:20px;">No client data yet</div>';
    } else {
      topClients.slice(0, 10).forEach(function(c, idx) {
        html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f5f5f5;">'
          + '<div style="width:24px;height:24px;border-radius:50%;background:' + svcColors[idx % svcColors.length] + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">' + (idx + 1) + '</div>'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + UI.esc(c.name) + '</div>'
          + '<div style="font-size:11px;color:var(--text-light);">' + c.count + ' job' + (c.count !== 1 ? 's' : '') + '</div>'
          + '</div>'
          + '<div style="font-weight:700;font-size:14px;">' + UI.moneyInt(c.revenue) + '</div>'
          + '</div>';
      });
    }
    html += '</div></div>';

    // Conversion metrics
    var avgJobValue = completedJobs > 0 ? allJobs.filter(function(j){return j.status==='completed';}).reduce(function(s,j){return s+(j.total||0);},0) / completedJobs : 0;
    var avgQuoteValue = totalQuotes > 0 ? allQuotes.reduce(function(s,q){return s+(q.total||0);},0) / totalQuotes : 0;
    var quotesToJobDays = [];
    allJobs.forEach(function(j) {
      if (j.quoteId) {
        var quote = DB.quotes.getById(j.quoteId);
        if (quote && quote.createdAt && j.createdAt) {
          var days = Math.round((new Date(j.createdAt) - new Date(quote.createdAt)) / 86400000);
          if (days >= 0 && days < 365) quotesToJobDays.push(days);
        }
      }
    });
    var avgConversionDays = quotesToJobDays.length > 0 ? Math.round(quotesToJobDays.reduce(function(s,d){return s+d;},0) / quotesToJobDays.length) : null;

    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px;" class="stat-row">'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">Avg Job Value</div>'
      + '<div style="font-size:24px;font-weight:800;color:var(--green-dark);margin-top:4px;">' + UI.moneyInt(avgJobValue) + '</div></div>'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">Avg Quote Value</div>'
      + '<div style="font-size:24px;font-weight:800;color:#1565c0;margin-top:4px;">' + UI.moneyInt(avgQuoteValue) + '</div></div>'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">Close Rate</div>'
      + '<div style="font-size:24px;font-weight:800;color:#e65100;margin-top:4px;">' + closeRate + '%</div></div>'
      + '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;">Quote → Job</div>'
      + '<div style="font-size:24px;font-weight:800;color:#6a1b9a;margin-top:4px;">' + (avgConversionDays !== null ? avgConversionDays + ' days' : '—') + '</div></div>'
      + '</div>';

    // Revenue Goal Tracker
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-top:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      + '<div><h3 style="margin:0;">Monthly Revenue Goal</h3>'
      + '<p style="font-size:12px;color:var(--text-light);margin:4px 0 0;">' + monthNames[now.getMonth()] + ' ' + now.getFullYear() + ' — ' + dayOfMonth + ' of ' + daysInMonth + ' days</p></div>'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + '<span style="font-size:12px;color:var(--text-light);">Goal: $</span>'
      + '<input type="number" id="revenue-goal-input" value="' + (monthGoal || '') + '" placeholder="e.g. 30000" min="0" step="1000" style="width:110px;padding:6px 10px;border:2px solid var(--border);border-radius:8px;font-size:14px;font-weight:700;" onchange="localStorage.setItem(\'bm-revenue-goal\',this.value||0);loadPage(\'insights\')">'
      + '</div></div>'
      + (monthGoal > 0 ?
        '<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px;"><span>' + UI.moneyInt(currentMonthRev) + ' earned</span><span style="color:var(--text-light);">' + UI.moneyInt(monthGoal) + ' goal</span></div>'
        + '<div style="background:var(--bg);border-radius:8px;height:20px;overflow:hidden;position:relative;">'
        + '<div style="height:100%;width:' + goalPct + '%;background:' + (onTrack ? 'var(--green-dark)' : '#ff9800') + ';border-radius:8px;transition:width .5s;"></div>'
        + (dayPct > 0 && dayPct < 100 ? '<div style="position:absolute;top:0;bottom:0;left:' + dayPct + '%;width:2px;background:rgba(0,0,0,.2);" title="Expected pace"></div>' : '')
        + '</div>'
        + '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-light);margin-top:6px;">'
        + '<span style="color:' + (onTrack ? '#2e7d32' : '#e65100') + ';font-weight:700;">' + (onTrack ? '✅ On track' : '⚠️ Behind pace') + ' — ' + goalPct + '% complete</span>'
        + '<span>' + UI.moneyInt(Math.max(0, monthGoal - currentMonthRev)) + ' remaining</span>'
        + '</div>'
        : '<div style="text-align:center;color:var(--text-light);padding:12px;font-size:13px;">Set a monthly revenue goal above to track your progress</div>'
      )
      + '</div>';

    // Revenue Trend & Forecast
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-top:16px;">'
      + '<h3 style="margin-bottom:4px;">Revenue Trend & Forecast</h3>'
      + '<p style="font-size:12px;color:var(--text-light);margin:0 0 16px;">Last 6 months + 3-month projection based on recent trend</p>'
      + '<div style="display:flex;align-items:flex-end;gap:6px;height:140px;padding-bottom:24px;position:relative;">';
    monthsData.forEach(function(m) {
      var h = maxForecast > 0 ? Math.max((m.revenue / maxForecast) * 120, m.revenue > 0 ? 6 : 2) : 2;
      html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;">'
        + (m.revenue > 0 ? '<div style="font-size:9px;font-weight:700;color:' + (m.isFuture ? '#9ca3af' : 'var(--green-dark)') + ';margin-bottom:2px;">' + UI.moneyInt(m.revenue) + '</div>' : '')
        + '<div style="width:100%;max-width:36px;height:' + h + 'px;background:' + (m.isFuture ? 'repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0 2px,#f1f5f9 2px,#f1f5f9 8px)' : 'var(--green-dark)') + ';border-radius:4px 4px 0 0;border:' + (m.isFuture ? '1px dashed #9ca3af' : 'none') + ';"></div>'
        + '<div style="font-size:9px;color:' + (m.isFuture ? '#9ca3af' : 'var(--text-light)') + ';margin-top:4px;">' + m.label + '</div>'
        + '</div>';
    });
    html += '</div>'
      + '<div style="display:flex;gap:16px;font-size:12px;color:var(--text-light);">'
      + '<div style="display:flex;align-items:center;gap:5px;"><div style="width:12px;height:12px;background:var(--green-dark);border-radius:2px;"></div>Actual</div>'
      + '<div style="display:flex;align-items:center;gap:5px;"><div style="width:12px;height:12px;background:#e2e8f0;border:1px dashed #9ca3af;border-radius:2px;"></div>Projected</div>'
      + '<div style="margin-left:auto;font-style:italic;">Projection = recent trend (not a guarantee)</div>'
      + '</div>'
      + '</div>';

    // Client LTV — total revenue per client across all time
    var clientLTV = {};
    allInvoices.forEach(function(inv) {
      if (inv.status !== 'paid') return;
      var key = inv.clientName || inv.clientId || 'Unknown';
      if (!clientLTV[key]) clientLTV[key] = { name: key, jobs: 0, revenue: 0, firstJob: null, lastJob: null };
      clientLTV[key].revenue += (inv.total || 0);
      clientLTV[key].jobs++;
      var d = inv.paidDate || inv.createdAt;
      if (!clientLTV[key].firstJob || d < clientLTV[key].firstJob) clientLTV[key].firstJob = d;
      if (!clientLTV[key].lastJob || d > clientLTV[key].lastJob) clientLTV[key].lastJob = d;
    });
    var ltvList = Object.values(clientLTV).sort(function(a,b){return b.revenue-a.revenue;}).slice(0,10);
    var totalLTV = ltvList.reduce(function(s,c){return s+c.revenue;},0);

    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-top:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      + '<div><h3 style="margin:0;">Client Lifetime Value — Top 10</h3>'
      + '<p style="font-size:12px;color:var(--text-light);margin:4px 0 0;">Total revenue per client (paid invoices, all time)</p></div>'
      + '<div style="text-align:right;"><div style="font-size:11px;color:var(--text-light);">Combined</div><div style="font-size:20px;font-weight:800;color:var(--green-dark);">' + UI.moneyInt(totalLTV) + '</div></div>'
      + '</div>';
    if (ltvList.length === 0) {
      html += '<div style="text-align:center;padding:20px;color:var(--text-light);">No paid invoices yet.</div>';
    } else {
      var maxLTV = ltvList[0].revenue || 1;
      ltvList.forEach(function(c, i) {
        var pct = Math.round((c.revenue / maxLTV) * 100);
        var yrs = c.firstJob && c.lastJob ? Math.round((new Date(c.lastJob) - new Date(c.firstJob)) / 86400000 / 365 * 10) / 10 : 0;
        html += '<div style="margin-bottom:10px;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;margin-bottom:3px;">'
          + '<div style="display:flex;align-items:center;gap:8px;">'
          + '<span style="width:20px;height:20px;border-radius:50%;background:var(--green-dark);color:#fff;font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">' + (i+1) + '</span>'
          + '<span style="font-weight:600;">' + UI.esc(c.name) + '</span>'
          + '<span style="font-size:11px;color:var(--text-light);">' + c.jobs + ' invoice' + (c.jobs!==1?'s':'') + (yrs > 0 ? ' · ' + yrs + ' yrs' : '') + '</span>'
          + '</div>'
          + '<span style="font-weight:700;">' + UI.moneyInt(c.revenue) + '</span></div>'
          + '<div style="height:6px;background:var(--bg);border-radius:3px;overflow:hidden;">'
          + '<div style="height:100%;width:' + pct + '%;background:var(--green-dark);border-radius:3px;opacity:' + (0.5 + 0.5 * pct/100) + ';"></div>'
          + '</div></div>';
      });
    }
    html += '</div>';

    // Invoice collection report
    var paidInvoices = allInvoices.filter(function(i){return i.status==='paid'&&(i.paidDate||i.updatedAt);});
    var totalInvoiced = allInvoices.filter(function(i){return i.status!=='draft'&&i.status!=='cancelled';}).reduce(function(s,i){return s+(i.total||0);},0);
    var totalPaid = paidInvoices.reduce(function(s,i){return s+(i.total||0);},0);
    var collectionRate = totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0;
    var daysToPayList = paidInvoices.map(function(i) {
      var issued = i.issuedDate || i.createdAt;
      var paid = i.paidDate || i.updatedAt;
      if (!issued || !paid) return null;
      return Math.max(0, Math.round((new Date(paid) - new Date(issued)) / 86400000));
    }).filter(function(d){return d!==null && d<365;});
    var avgDaysToPay = daysToPayList.length > 0 ? Math.round(daysToPayList.reduce(function(s,d){return s+d;},0) / daysToPayList.length) : null;
    var within30 = daysToPayList.filter(function(d){return d<=30;}).length;
    var within30pct = daysToPayList.length > 0 ? Math.round((within30/daysToPayList.length)*100) : 0;

    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-top:16px;">'
      + '<h3 style="margin-bottom:16px;">Invoice Collection Report</h3>'
      + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;" class="stat-row">'
      + '<div style="text-align:center;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;font-weight:600;">Collection Rate</div><div style="font-size:26px;font-weight:800;color:' + (collectionRate>=90?'#2e7d32':collectionRate>=70?'#e65100':'#c62828') + ';">' + collectionRate + '%</div><div style="font-size:11px;color:var(--text-light);">' + paidInvoices.length + ' of ' + allInvoices.filter(function(i){return i.status!=='draft'&&i.status!=='cancelled';}).length + ' paid</div></div>'
      + '<div style="text-align:center;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;font-weight:600;">Avg Days to Pay</div><div style="font-size:26px;font-weight:800;color:' + (avgDaysToPay!==null&&avgDaysToPay<=14?'#2e7d32':avgDaysToPay<=30?'#e65100':'#c62828') + ';">' + (avgDaysToPay!==null?avgDaysToPay+'d':'—') + '</div><div style="font-size:11px;color:var(--text-light);">from issue to payment</div></div>'
      + '<div style="text-align:center;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;font-weight:600;">Paid within 30d</div><div style="font-size:26px;font-weight:800;color:#1565c0;">' + within30pct + '%</div><div style="font-size:11px;color:var(--text-light);">' + within30 + ' invoices</div></div>'
      + '<div style="text-align:center;padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;font-weight:600;">Outstanding</div><div style="font-size:26px;font-weight:800;color:#c62828;">' + UI.moneyInt(totalInvoiced - totalPaid) + '</div><div style="font-size:11px;color:var(--text-light);">uncollected</div></div>'
      + '</div></div>';

    // Win rate by lead source
    var sourceWins = {};
    allRequests.forEach(function(r) {
      var raw = (r.source || 'Unknown').trim();
      var normalized = SOURCE_MAP[raw.toLowerCase()] || raw;
      if (!sourceWins[normalized]) sourceWins[normalized] = { requests: 0, quotes: 0, won: 0 };
      sourceWins[normalized].requests++;
      var q = allQuotes.find(function(q){return q.requestId===r.id || (q.clientId&&q.clientId===r.clientId);});
      if (q) {
        sourceWins[normalized].quotes++;
        if (q.status==='approved'||q.status==='converted') sourceWins[normalized].won++;
      }
    });
    var sourceWinList = Object.keys(sourceWins).map(function(k){
      var s = sourceWins[k];
      return { source: k, requests: s.requests, quotes: s.quotes, won: s.won, winRate: s.quotes>0?Math.round(s.won/s.quotes*100):0 };
    }).filter(function(s){return s.requests>=2;}).sort(function(a,b){return b.requests-a.requests;});

    if (sourceWinList.length > 0) {
      html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-top:16px;">'
        + '<h3 style="margin-bottom:4px;">Win Rate by Lead Source</h3>'
        + '<p style="font-size:12px;color:var(--text-light);margin:0 0 16px;">Which channels convert requests → approved quotes</p>'
        + '<table class="data-table"><thead><tr><th>Source</th><th style="text-align:right;">Requests</th><th style="text-align:right;">Quoted</th><th style="text-align:right;">Won</th><th style="text-align:right;">Win Rate</th></tr></thead><tbody>';
      sourceWinList.slice(0,8).forEach(function(s) {
        var color = s.winRate>=60?'#2e7d32':s.winRate>=30?'#e65100':'#c62828';
        html += '<tr>'
          + '<td><strong>' + UI.esc(s.source) + '</strong></td>'
          + '<td style="text-align:right;">' + s.requests + '</td>'
          + '<td style="text-align:right;">' + s.quotes + '</td>'
          + '<td style="text-align:right;">' + s.won + '</td>'
          + '<td style="text-align:right;"><span style="background:' + (s.winRate>=60?'#e8f5e9':s.winRate>=30?'#fff3e0':'#ffebee') + ';color:' + color + ';padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;">' + s.winRate + '%</span></td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';
    }

    // New client growth chart
    var newClientsByMonth = [];
    for (var ni = 11; ni >= 0; ni--) {
      var nDate = new Date(now.getFullYear(), now.getMonth() - ni, 1);
      var nCount = allClients.filter(function(c) {
        var d = new Date(c.createdAt || c.created_at || '2000-01-01');
        return d.getFullYear()===nDate.getFullYear() && d.getMonth()===nDate.getMonth();
      }).length;
      newClientsByMonth.push({ label: monthNames[nDate.getMonth()], year: nDate.getFullYear(), count: nCount });
    }
    var maxNewClients = Math.max.apply(null, newClientsByMonth.map(function(m){return m.count;})) || 1;
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-top:16px;">'
      + '<h3 style="margin-bottom:4px;">New Clients by Month</h3>'
      + '<p style="font-size:12px;color:var(--text-light);margin:0 0 16px;">Client acquisition rate — past 12 months</p>'
      + '<div style="display:flex;align-items:flex-end;gap:4px;height:120px;padding-bottom:24px;">';
    newClientsByMonth.forEach(function(m, i) {
      var h = maxNewClients > 0 ? Math.max((m.count / maxNewClients) * 100, m.count > 0 ? 4 : 2) : 2;
      var isCurrent = i === 11;
      html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;">'
        + (m.count > 0 ? '<div style="font-size:10px;font-weight:700;color:' + (isCurrent?'var(--green-dark)':'#1565c0') + ';margin-bottom:2px;">' + m.count + '</div>' : '')
        + '<div style="width:100%;max-width:32px;height:' + h + 'px;background:' + (isCurrent?'var(--green-dark)':'#90caf9') + ';border-radius:3px 3px 0 0;opacity:' + (m.count>0?'1':'.3') + ';"></div>'
        + '<div style="font-size:9px;color:var(--text-light);margin-top:3px;">' + m.label + '</div>'
        + '</div>';
    });
    html += '</div></div>';

    return html;
  }
};
