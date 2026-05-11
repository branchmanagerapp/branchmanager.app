/**
 * TenantSetup — first-time onboarding checklist for new tenants.
 *
 * Renders at the top of the Settings page. Lists every integration BM
 * supports, probes each one to see if it's wired, and surfaces a
 * progress bar + per-item action button to wire whatever's missing.
 *
 * Auto-collapses once 100% complete (and stays collapsed in localStorage
 * unless the user re-expands). Replaces the v674-deprecated "Quick Setup"
 * checklist with honest probes instead of stale flags.
 *
 * v769.
 */
var TenantSetup = {
  // Each entry: probe() → boolean, action() → navigate.
  // criticality: 1 = required, 2 = revenue path, 3 = comms, 4 = nice-to-have
  ITEMS: [
    {
      key: 'company_name',
      label: 'Company name',
      hint: 'Used on every email, invoice, and customer page.',
      criticality: 1,
      probe: function() {
        try { return !!(typeof CompanyInfo !== 'undefined' && CompanyInfo.get('name')); } catch(e) { return false; }
      },
      action: function() { loadPage('settings'); }
    },
    {
      key: 'company_phone',
      label: 'Phone number',
      hint: 'Appears on every email signature + customer reply path.',
      criticality: 1,
      probe: function() {
        try { return !!(typeof CompanyInfo !== 'undefined' && CompanyInfo.get('phone')); } catch(e) { return false; }
      },
      action: function() { loadPage('settings'); }
    },
    {
      key: 'company_email',
      label: 'Reply-to email',
      hint: 'Where customer responses to your outbound emails land.',
      criticality: 1,
      probe: function() {
        try { return !!(typeof CompanyInfo !== 'undefined' && CompanyInfo.get('email')); } catch(e) { return false; }
      },
      action: function() { loadPage('settings'); }
    },
    {
      key: 'logo',
      label: 'Logo URL',
      hint: 'Shown on the customer portal, emails, and onboarding pages.',
      criticality: 4,
      probe: function() {
        try { return !!(typeof CompanyInfo !== 'undefined' && CompanyInfo.get('logo_url')); } catch(e) { return false; }
      },
      action: function() { loadPage('settings'); }
    },
    {
      key: 'tax_rate',
      label: 'Default tax rate',
      hint: 'Pre-fills the tax field on every new quote and invoice.',
      criticality: 1,
      probe: function() {
        try {
          var v = parseFloat(localStorage.getItem('bm-tax-rate'));
          return !isNaN(v) && v > 0;
        } catch(e) { return false; }
      },
      action: function() { loadPage('settings'); }
    },
    {
      key: 'team_member',
      label: 'At least one crew member',
      hint: 'Required for time-tracking, payroll, and per-job profitability.',
      criticality: 1,
      probe: function() {
        try {
          if (typeof DB !== 'undefined' && DB.team && DB.team.getAll) {
            return DB.team.getAll().length > 0;
          }
          return (JSON.parse(localStorage.getItem('bm-team') || '[]')).length > 0;
        } catch(e) { return false; }
      },
      action: function() { window._payrollTab = 'payroll'; loadPage('payroll'); }
    },
    {
      key: 'stripe',
      label: 'Stripe — accept card payments',
      hint: 'Lets customers pay invoices online + powers "Pay All Outstanding."',
      criticality: 2,
      probe: function() {
        try {
          var v = localStorage.getItem('bm-stripe-base-link');
          if (v && v.length > 8) return true;
        } catch(e) {}
        // Server-side key check is on the tenants.config — async, skipped here.
        return false;
      },
      action: function() { loadPage('settings'); }
    },
    {
      key: 'dialpad',
      label: 'Dialpad — outbound SMS + calls',
      hint: 'Sends ETA texts, quote follow-ups, overdue reminders.',
      criticality: 3,
      probe: function() {
        try { return !!(localStorage.getItem('bm-dialpad-key') || '').trim(); } catch(e) { return false; }
      },
      action: function() { loadPage('receptionist'); }
    },
    {
      key: 'resend',
      label: 'Email — Resend domain verified',
      hint: 'Tenant-specific From address (instead of onboarding@resend.dev).',
      criticality: 3,
      probe: function() {
        // Best-effort: presence of a custom from-address in localStorage.
        try { return !!(localStorage.getItem('bm-resend-verified') === '1'); } catch(e) { return false; }
      },
      action: function() { loadPage('settings'); }
    },
    {
      key: 'ai_receptionist',
      label: 'AI Receptionist — Twilio number',
      hint: 'Auto-answers inbound calls + qualifies leads. Optional.',
      criticality: 4,
      probe: function() {
        // tenants.config.receptionist.twilio_to + enabled — read via
        // window._receptionistCfg cache populated by the Receptionist page
        var cfg = window._receptionistCfg;
        return !!(cfg && cfg.enabled && cfg.twilio_to);
      },
      action: function() { Receptionist._tab = 'ai'; loadPage('receptionist'); }
    },
    {
      key: 'bouncie',
      label: 'Bouncie — truck GPS',
      hint: 'Auto-tracks vehicle hours for the Truck Hours timesheet.',
      criticality: 4,
      probe: function() {
        // tenants.config.bouncie.access_token — pull via async probe (cached)
        return TenantSetup._cache.bouncie === true;
      },
      action: function() { loadPage('operations'); window._opsTab = 'gear'; setTimeout(function() { if (typeof FleetPage !== 'undefined' && FleetPage.connectBouncie) FleetPage.connectBouncie(); }, 80); }
    },
    {
      key: 'vehicle',
      label: 'At least one vehicle in Fleet',
      hint: 'Required for Bouncie sync + per-vehicle docs (registration, inspection).',
      criticality: 4,
      probe: function() {
        return TenantSetup._cache.vehicleCount > 0;
      },
      action: function() { window._opsTab = 'gear'; loadPage('operations'); }
    }
  ],

  // Lazy-loaded cache for items that need async probes (Bouncie, vehicle count).
  _cache: { bouncie: null, vehicleCount: null },
  _loaded: false,

  _loadAsyncCache: function() {
    if (TenantSetup._loaded) return;
    TenantSetup._loaded = true;
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    var tenantId = (typeof window !== 'undefined' && window.resolveTenantId) ? window.resolveTenantId() : null;
    if (!sb || !tenantId) {
      TenantSetup._cache.bouncie = false;
      TenantSetup._cache.vehicleCount = 0;
      return;
    }
    // Bouncie OAuth status
    sb.from('tenants').select('config').eq('id', tenantId).maybeSingle().then(function(r) {
      var cfg = r && r.data && r.data.config && r.data.config.bouncie;
      TenantSetup._cache.bouncie = !!(cfg && cfg.access_token);
      if (window._currentPage === 'settings') loadPage('settings');
    });
    // Vehicle count
    sb.from('vehicles').select('id', { count: 'exact', head: true }).then(function(r) {
      TenantSetup._cache.vehicleCount = (r && r.count) || 0;
      if (window._currentPage === 'settings') loadPage('settings');
    });
  },

  _isCollapsed: function() {
    try { return localStorage.getItem('bm-setup-collapsed') === '1'; } catch(e) { return false; }
  },
  _setCollapsed: function(v) {
    try { localStorage.setItem('bm-setup-collapsed', v ? '1' : '0'); } catch(e) {}
  },
  toggle: function() {
    TenantSetup._setCollapsed(!TenantSetup._isCollapsed());
    loadPage(window._currentPage || 'settings');
  },

  // Public — used by Settings render and (optionally) by Dashboard.
  renderChecklist: function() {
    TenantSetup._loadAsyncCache();
    var results = TenantSetup.ITEMS.map(function(item) {
      var ok = false;
      try { ok = !!item.probe(); } catch(e) { ok = false; }
      return Object.assign({}, item, { ok: ok });
    });
    var totalCritical = results.filter(function(r) { return r.criticality === 1; }).length;
    var okCritical = results.filter(function(r) { return r.criticality === 1 && r.ok; }).length;
    var totalAll = results.length;
    var okAll = results.filter(function(r) { return r.ok; }).length;
    var pct = totalAll > 0 ? Math.round((okAll / totalAll) * 100) : 0;
    var allCriticalDone = okCritical === totalCritical;
    var allDone = okAll === totalAll;

    // Collapsed state — render compact summary bar only.
    var collapsed = TenantSetup._isCollapsed();
    if (allDone && !collapsed) {
      // Auto-collapse once 100% done. Subsequent renders honor user's
      // toggle if they expand again to inspect.
      TenantSetup._setCollapsed(true);
      collapsed = true;
    }

    if (collapsed) {
      return '<div style="background:' + (allDone ? '#f0fdf4' : '#fffbeb') + ';border:1px solid ' + (allDone ? '#86efac' : '#fde68a') + ';border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">'
        + '<div style="font-size:20px;">' + (allDone ? '✅' : '🛠️') + '</div>'
        + '<div style="flex:1;min-width:200px;font-size:13px;color:' + (allDone ? '#065f46' : '#92400e') + ';">'
        +   '<b>Setup checklist</b>: ' + okAll + '/' + totalAll + ' ' + (allDone ? '— everything wired' : '· ' + (totalCritical - okCritical) + ' critical item' + (totalCritical - okCritical === 1 ? '' : 's') + ' left')
        + '</div>'
        + '<button onclick="TenantSetup.toggle()" style="font-size:12px;padding:5px 12px;background:var(--white);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-weight:600;">' + (allDone ? 'Show details' : 'Expand') + '</button>'
        + '</div>';
    }

    // Full view — grouped by criticality.
    var GROUP_LABELS = { 1: 'Required to operate', 2: 'Revenue path', 3: 'Communications', 4: 'Optional' };
    var GROUP_COLORS = { 1: '#dc2626', 2: '#16a34a', 3: '#2563eb', 4: '#737373' };

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">'
      +   '<div>'
      +     '<h3 style="margin:0;font-size:15px;">🛠️ Setup checklist</h3>'
      +     '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">' + okAll + '/' + totalAll + ' complete · ' + (allCriticalDone ? 'all critical items done ✓' : (totalCritical - okCritical) + ' critical item' + (totalCritical - okCritical === 1 ? '' : 's') + ' left') + '</div>'
      +   '</div>'
      +   '<button onclick="TenantSetup.toggle()" style="font-size:11px;padding:5px 10px;background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;color:var(--text-light);">Hide</button>'
      + '</div>'
      // Progress bar
      + '<div style="height:6px;border-radius:3px;background:var(--bg);overflow:hidden;margin-bottom:14px;">'
      +   '<div style="width:' + pct + '%;height:100%;background:' + (allCriticalDone ? '#16a34a' : '#dc2626') + ';transition:width .3s;"></div>'
      + '</div>';

    [1, 2, 3, 4].forEach(function(crit) {
      var items = results.filter(function(r) { return r.criticality === crit; });
      if (!items.length) return;
      html += '<div style="margin-bottom:10px;">'
        + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:' + GROUP_COLORS[crit] + ';margin-bottom:6px;">' + GROUP_LABELS[crit] + '</div>';
      items.forEach(function(r) {
        var icon = r.ok ? '✅' : (crit === 1 ? '⛔' : '⚪');
        html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid ' + (r.ok ? 'var(--border)' : '#fef3c7') + ';background:' + (r.ok ? 'var(--bg)' : '#fffbeb') + ';border-radius:8px;margin-bottom:5px;">'
          + '<div style="font-size:16px;">' + icon + '</div>'
          + '<div style="flex:1;min-width:0;">'
          +   '<div style="font-size:13px;font-weight:' + (r.ok ? '500' : '700') + ';color:' + (r.ok ? 'var(--text-light)' : 'var(--text)') + ';' + (r.ok ? 'text-decoration:line-through;' : '') + '">' + r.label + '</div>'
          +   (r.ok ? '' : '<div style="font-size:11px;color:var(--text-light);margin-top:1px;">' + r.hint + '</div>')
          + '</div>'
          + (r.ok ? '' : '<button onclick="TenantSetup._fire(\'' + r.key + '\')" style="font-size:11px;padding:4px 10px;background:var(--green-dark);color:#fff;border:none;border-radius:5px;font-weight:600;cursor:pointer;white-space:nowrap;">Set up →</button>')
          + '</div>';
      });
      html += '</div>';
    });

    html += '</div>';
    return html;
  },

  _fire: function(key) {
    var item = TenantSetup.ITEMS.find(function(i) { return i.key === key; });
    if (item && item.action) item.action();
  }
};
