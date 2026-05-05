/**
 * Branch Manager — Settings Page
 * Company info, Supabase config, previous system CSV import, data management
 */
var SettingsPage = {
  render: function() {
    var stats = DB.dashboard.getStats();

    // Auto-collapse every settings card (v351) — remembers per-card state in localStorage
    setTimeout(SettingsPage._initCollapse, 60);

    var html = '<div style="max-width:700px;">';

    // Expand-all / Collapse-all toolbar
    html += '<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px;">'
      +   '<button onclick="SettingsPage._collapseAll(true)" style="background:var(--white);border:1px solid var(--border);padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;color:var(--text-light);">Collapse all</button>'
      +   '<button onclick="SettingsPage._collapseAll(false)" style="background:var(--white);border:1px solid var(--border);padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;color:var(--text-light);">Expand all</button>'
      + '</div>';

    // === ONE-TIME SETUP CHECKLIST ===
    var sgOk2 = true; // v372: Resend lives server-side; treat email as always configured
    var stripeOk = !!(localStorage.getItem('bm-stripe-base-link'));
    var supabaseOk = (typeof SupabaseDB !== 'undefined' && SupabaseDB.ready) || stats.totalClients > 100;
    var allDone = sgOk2 && stripeOk && supabaseOk;
    if (!allDone) {
      html += '<div style="background:linear-gradient(135deg,#1a3c12 0%,#00836c 100%);border-radius:12px;padding:20px;margin-bottom:16px;color:#fff;">'
        + '<div style="font-size:16px;font-weight:800;margin-bottom:12px;">🚀 Quick Setup</div>'
        + '<div style="display:flex;flex-direction:column;gap:8px;font-size:13px;">'
        + '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:16px;">' + (supabaseOk ? '✅' : '⬜') + '</span><span' + (supabaseOk ? ' style="text-decoration:line-through;opacity:.7;"' : '') + '>Supabase connected — your data is live</span></div>'
        + '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:16px;">' + (sgOk2 ? '✅' : '⬜') + '</span><span' + (sgOk2 ? ' style="text-decoration:line-through;opacity:.7;"' : '') + '>Resend email (server-keyed) — automated emails active</span></div>'
        + '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:16px;">' + (stripeOk ? '✅' : '⬜') + '</span><span' + (stripeOk ? ' style="text-decoration:line-through;opacity:.7;"' : '') + '>Stripe payment link — accept online payments</span></div>'
        + '</div>'
        + '<details style="margin-top:10px;">'
        +   '<summary style="cursor:pointer;font-size:12px;color:#a5f3e8;font-weight:600;list-style:none;opacity:.8;">Advanced: Edge Function deploy + Stripe webhook setup ▾</summary>'
        +   '<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;font-size:13px;">'
        +     '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:16px;">⬜</span><span>Deploy Edge Functions (one-time terminal commands):</span></div>'
        +     '<div style="background:rgba(0,0,0,.3);border-radius:8px;padding:10px 12px;font-family:monospace;font-size:11px;line-height:1.8;margin-left:26px;">'
        +       'supabase functions deploy stripe-webhook --no-verify-jwt<br>'
        +       'supabase functions deploy request-notify --no-verify-jwt<br>'
        +       'supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...<br>'
        +       'supabase secrets set SENDGRID_API_KEY=SG...<br>'
        +       'supabase secrets set SUPABASE_SERVICE_ROLE_KEY=ey...'
        +     '</div>'
        +     '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:16px;">⬜</span><span><a href="https://dashboard.stripe.com/webhooks/create" target="_blank" rel="noopener noreferrer" style="color:#a5f3e8;">Stripe → Webhooks → Add endpoint</a> → <code style="background:rgba(0,0,0,.3);padding:1px 6px;border-radius:4px;">https://ltpivkqahvplapyagljt.supabase.co/functions/v1/stripe-webhook</code></span></div>'
        +     '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:16px;">⬜</span><span>Stripe → Payment Link → After payment → Redirect to <code style="background:rgba(0,0,0,.3);padding:1px 6px;border-radius:4px;">https://branchmanager.app/paid.html</code></span></div>'
        +   '</div>'
        + '</details>'
        + '</div>';
    }

    // ════════════════════════════════════════════════════════════════════════
    // META-GROUP HELPERS (v393) — wrap the existing inner-GROUP collapsibles
    // into 4 top-level banners: USER / BUSINESS / INTEGRATIONS / ADVANCED.
    // ════════════════════════════════════════════════════════════════════════
    function groupOpen(label, defaultOpen) {
      return '<details ' + (defaultOpen ? 'open' : '') + ' class="setting-group" style="margin:18px 0 14px;border:none;background:none;">'
        +   '<summary style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-light);padding:6px 0;cursor:pointer;list-style:none;border-bottom:1px solid var(--border);margin-bottom:14px;">'
        +     label + ' <span style="float:right;font-weight:500;">▾</span>'
        +   '</summary>';
    }
    function groupClose() { return '</details>'; }

    // v413: cardOpen/cardClose — collapsible white card inside a meta-group.
    // Replaces ~7 hand-rolled <details> blocks with the same shell + chevron.
    // Pass {open:true} to default-expand; otherwise it opens on click.
    function cardOpen(title, opts) {
      opts = opts || {};
      var open = opts.open;
      var iconHtml = opts.icon
        ? '<i data-lucide="' + opts.icon + '" class="li li-hdr" style="margin-right:8px;vertical-align:-3px;"></i>'
        : '';
      return '<details ' + (open ? 'open' : '') + ' style="background:var(--white);border-radius:12px;padding:0;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">'
        +   '<summary style="padding:14px 18px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;font-size:15px;font-weight:700;">'
        +     '<span>' + iconHtml + title + '</span>'
        +     '<span style="font-size:11px;color:var(--text-light);font-weight:500;">▾</span>'
        +   '</summary>'
        +   '<div style="padding:0 18px 18px;">';
    }
    function cardClose() { return '</div></details>'; }

    // v414: apiKeyHeader — common shell for the 8 API-key cards in the
    // Integrations meta-group (AI / Resend / Stripe / Dialpad / Gusto / PlantNet
    // / SocialPilot / GMB). Each card has its own unique body (input + buttons
    // + help text) but the outer card-open + icon + title + status badge is
    // identical. Replaces ~6 lines per card with a single function call.
    //
    // Pair with `</div>` at the end of each card to close the wrapper.
    //
    // opts:
    //   ok       — boolean, drives green-vs-orange border + status color
    //   title    — h3 text
    //   emoji    — emoji char (rendered at 22px), OR pass `icon` for custom HTML
    //   icon     — optional full inner HTML for the icon square (overrides emoji)
    //   iconBg   — CSS `background` value for the 40×40 icon square
    //   okText   — status line shown when ok=true
    //   warnText — status line shown when ok=false (optional for always-on cards)
    function apiKeyHeader(opts) {
      var color = opts.ok ? 'var(--green-dark)' : '#e07c24';
      var border = opts.ok ? 'var(--green-light)' : 'var(--border)';
      var iconHTML = opts.icon || ('<span style="font-size:22px;">' + opts.emoji + '</span>');
      var status = opts.ok ? opts.okText : (opts.warnText || opts.okText);
      return '<div style="background:var(--white);border-radius:12px;padding:20px;border:2px solid ' + border + ';margin-bottom:16px;">'
        + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">'
        +   '<div style="width:40px;height:40px;background:' + opts.iconBg + ';border-radius:8px;display:flex;align-items:center;justify-content:center;">' + iconHTML + '</div>'
        +   '<div><h3 style="margin:0;">' + opts.title + '</h3>'
        +     '<div style="font-size:12px;color:' + color + ';font-weight:600;">' + status + '</div>'
        +   '</div>'
        + '</div>';
    }

    // ════════════════════════════════════════════════════════════════════════
    // META-GROUP 1 / 4: USER (per-device, this user only) — default OPEN
    // ════════════════════════════════════════════════════════════════════════
    html += groupOpen('User', false);

    // ── Notification Preferences — instant emails TO Doug.
    // Distinct from Business → Emails & Text Messages, which is the
    // customer-facing template editor.
    var notif = {
      quoteApproved:   localStorage.getItem('bm-notif-quote-approved') !== 'false',
      paymentReceived: localStorage.getItem('bm-notif-payment') !== 'false',
      newRequest:      localStorage.getItem('bm-notif-new-request') !== 'false',
      overdueInvoice:  localStorage.getItem('bm-notif-overdue') !== 'false',
      dailySummary:    localStorage.getItem('bm-notif-daily-summary') === 'true',
      jobCompleted:    localStorage.getItem('bm-notif-job-completed') !== 'false'
    };
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
      + '<h3 style="margin:0;">Notifications <span style="font-size:11px;font-weight:500;color:var(--text-light);">(emails to you, instant)</span></h3>'
      + '<div style="margin-right:0;text-align:right;"><button onclick="SettingsPage._saveNotifSettings()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;margin-right:0;">Save</button></div>'
      + '</div>'
      + '<p style="font-size:11px;color:var(--text-light);margin:0 0 14px;">Alerts BM sends you when something happens. <em>Customer-facing email/SMS templates live under <strong>Business &rarr; Emails &amp; Text Messages</strong>.</em></p>'
      + '<div style="display:flex;flex-direction:column;gap:8px;">';
    [
      ['notif-quote-approved', notif.quoteApproved, 'Quote Approved', 'When a client approves a quote'],
      ['notif-payment',        notif.paymentReceived, 'Payment Received', 'When a client pays an invoice'],
      ['notif-new-request',    notif.newRequest, 'New Request', 'When a new booking request comes in'],
      ['notif-overdue',        notif.overdueInvoice, 'Overdue Invoice', 'When an invoice becomes overdue'],
      ['notif-job-completed',  notif.jobCompleted, 'Job Completed', 'When crew marks a job complete'],
      ['notif-daily-summary',  notif.dailySummary, 'Daily Summary', 'Morning email with today\'s schedule + action items']
    ].forEach(function(n) {
      html += '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:6px 0;">'
        + '<input type="checkbox" id="' + n[0] + '" style="width:18px;height:18px;flex-shrink:0;"' + (n[1] ? ' checked' : '') + '>'
        + '<div><strong style="font-size:13px;">' + n[2] + '</strong>'
        +   '<div style="font-size:11px;color:var(--text-light);">' + n[3] + '</div></div></label>';
    });
    html += '</div></div>';

    // ── Dark Mode (moved from below Database & Storage group) ──
    var _dark = (document.documentElement.getAttribute('data-theme') === 'dark') || localStorage.getItem('bm-dark-mode') === 'dark';
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">'
      +   '<div>'
      +     '<div style="font-size:14px;font-weight:700;color:var(--text);">🌓 Dark Mode</div>'
      +     '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">Toggle dark theme app-wide.</div>'
      +   '</div>'
      +   '<label style="position:relative;display:inline-block;width:48px;height:26px;cursor:pointer;flex-shrink:0;">'
      +     '<input type="checkbox" onchange="toggleDarkMode()"' + (_dark ? ' checked' : '') + ' style="opacity:0;width:0;height:0;">'
      +     '<span style="position:absolute;inset:0;background:' + (_dark ? 'var(--green-dark)' : '#cbd5e1') + ';border-radius:26px;transition:.2s;"></span>'
      +     '<span style="position:absolute;top:3px;left:' + (_dark ? '25px' : '3px') + ';width:20px;height:20px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2);"></span>'
      +   '</label>'
      + '</div>';

    // ── Navigation Style (moved from below Database & Storage group) ──
    var _pwaNav = localStorage.getItem('bm-pwa-nav') || 'top';
    var _appNav = localStorage.getItem('bm-app-nav') || 'top';
    var _pillBase = 'flex:1;padding:8px 0;border:none;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;';
    var _pillOn = 'background:var(--green-dark);color:#fff;';
    var _pillOff = 'background:transparent;color:var(--text-light);';
    function _navRow(label, sub, currentVal, handlerName) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--green-light);">'
        +   '<div style="flex:1;min-width:180px;">'
        +     '<div style="font-size:13px;font-weight:700;color:var(--text);">' + label + '</div>'
        +     '<div style="font-size:11px;color:var(--text-light);margin-top:1px;">' + sub + '</div>'
        +   '</div>'
        +   '<div style="display:inline-flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;min-width:220px;background:var(--white);">'
        +     '<button onclick="SettingsPage.' + handlerName + '(\'top\')" style="' + _pillBase + (currentVal === 'top' ? _pillOn : _pillOff) + '">Top</button>'
        +     '<button onclick="SettingsPage.' + handlerName + '(\'bottom\')" style="' + _pillBase + (currentVal === 'bottom' ? _pillOn : _pillOff) + '">Bottom</button>'
        +     '<button onclick="SettingsPage.' + handlerName + '(\'both\')" style="' + _pillBase + (currentVal === 'both' ? _pillOn : _pillOff) + '">Both</button>'
        +   '</div>'
        + '</div>';
    }
    html += '<div style="background:var(--green-bg);border:2px solid var(--green-light);border-radius:12px;padding:14px 18px 8px;margin-bottom:16px;">'
      +   '<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:2px;">📱 Navigation Style</div>'
      +   '<div style="font-size:11px;color:var(--text-light);margin-bottom:6px;">Pick how the nav bar shows. You can set PWA and the native App independently.</div>'
      +   _navRow('PWA (home-screen install)', 'Safari → Add to Home Screen', _pwaNav, '_setPwaNav')
      +   _navRow('App (iOS / Android build)', 'Capacitor-wrapped native app', _appNav, '_setAppNav')
      + '</div>';

    // v404: PlantNet moved back to Advanced → API Keys & Integrations
    // (it's an API key, lives with the other integrations).

    html += groupClose();

    // ════════════════════════════════════════════════════════════════════════
    // META-GROUP 2 / 4: BUSINESS (company-wide, syncs across devices) — OPEN
    // ════════════════════════════════════════════════════════════════════════
    html += groupOpen('Business', false);

    // Company Info — editable, saved to localStorage
    var co = {
      name: CompanyInfo.get('name'),
      phone: CompanyInfo.get('phone'),
      email: CompanyInfo.get('email'),
      address: localStorage.getItem('bm-co-address') || (typeof BM_CONFIG !== 'undefined' ? BM_CONFIG.address : ''),
      licenses: CompanyInfo.get('licenses'),
      website: CompanyInfo.get('website'),
      taxRate: localStorage.getItem('bm-tax-rate') || '8.375',
      logo: CompanyInfo.get('logo')
    };
    // ═══ GROUP: Business Info (collapsible) ═══
    html += '<details style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">'
      + '<summary style="padding:14px 18px;cursor:pointer;font-size:15px;font-weight:700;color:var(--text);list-style:none;display:flex;justify-content:space-between;align-items:center;">'
      +   '<span><i data-lucide="building-2" class="li li-hdr"></i> Business Info</span>'
      +   '<span style="font-size:11px;color:var(--text-light);font-weight:500;">tap to expand</span>'
      + '</summary>'
      + '<div style="padding:16px 20px;border-top:1px solid var(--border);">';

    html += cardOpen('Company Info')
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Company Name</label><input id="co-name" value="' + UI.esc(co.name) + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Phone</label><input id="co-phone" value="' + UI.esc(co.phone) + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Email</label><input id="co-email" type="email" value="' + UI.esc(co.email) + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Website</label><input id="co-website" value="' + UI.esc(co.website) + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div style="grid-column:1/-1;"><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Address</label><input id="co-address" value="' + UI.esc(co.address) + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Licenses</label><input id="co-licenses" value="' + UI.esc(co.licenses) + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div style="grid-column:1/-1;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Logo URL <span style="font-weight:400;color:var(--text-light);font-size:11px;">(used on quotes, invoices &amp; emails)</span></label>'
      + '<div style="display:flex;gap:10px;align-items:center;">'
      + '<input id="co-logo" type="url" value="' + UI.esc(co.logo) + '" placeholder="https://..." style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;" oninput="SettingsPage._previewLogo(this.value)">'
      + (co.logo ? '<img id="co-logo-preview" src="' + UI.esc(co.logo) + '" style="width:40px;height:40px;object-fit:contain;border-radius:8px;border:1px solid var(--border);background:#f9fafb;" onerror="this.style.display=\'none\'">' : '<div id="co-logo-preview" style="width:40px;height:40px;border-radius:8px;border:1px solid var(--border);background:#f9fafb;display:flex;align-items:center;justify-content:center;font-size:20px;">🌳</div>')
      + '</div>'
      + '<div style="font-size:11px;color:var(--text-light);margin-top:3px;">Paste a hosted image URL (Dropbox, Google Drive public link, Imgur, etc.)</div>'
      + '</div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Default Tax Rate (%)</label>'
      + '<input id="co-tax-rate" type="number" value="' + co.taxRate + '" step="0.001" min="0" max="100" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;">'
      + '<div style="font-size:11px;color:var(--text-light);margin-top:3px;">Applied to new quotes & invoices (e.g. 8.375 for NYS)</div>'
      + '</div>'
      + '</div>'
      + '<div style="margin-top:14px;text-align:right;"><button onclick="SettingsPage.saveCompany()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;">Save</button></div>'
      + '</div></details>';

    // ─── 🆔 Business Registration & Compliance ───
    // Stores business identifiers Doug needs to reference frequently:
    // DOT, EIN, SUI, WC, PC, TCIA, ISA, DOS, Disability policy.
    // Sensitive fields (DOT PIN, EIN) are password-masked with show/hide toggle.
    var compliance = {
      dotNum:        localStorage.getItem('bm-co-dot-num') || '',
      dotPin:        localStorage.getItem('bm-co-dot-pin') || '',
      ein:           localStorage.getItem('bm-co-ein') || '',
      sui:           localStorage.getItem('bm-co-sui') || '',
      wcNum:         localStorage.getItem('bm-co-wc-num') || '',
      wcPolicy:      localStorage.getItem('bm-co-wc-policy') || '',
      pcNum:         localStorage.getItem('bm-co-pc-num') || '',
      tciaId:        localStorage.getItem('bm-co-tcia-id') || '',
      isaId:         localStorage.getItem('bm-co-isa-id') || '',
      disabilityPol: localStorage.getItem('bm-co-disability-policy') || '',
      dosCurrent:    localStorage.getItem('bm-co-dos-current') || '',
      dosPrior:      localStorage.getItem('bm-co-dos-prior') || ''
    };
    var maskField = function(id, val, label, hint) {
      return '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">' + label + (hint ? ' <span style="font-weight:400;font-size:10px;color:var(--text-light);">· ' + hint + '</span>' : '') + '</label>'
        + '<div style="display:flex;gap:6px;">'
        +   '<input id="' + id + '" type="password" value="' + UI.esc(val) + '" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:ui-monospace,monospace;box-sizing:border-box;">'
        +   '<button type="button" onclick="(function(b){var i=b.previousElementSibling;i.type=i.type===\'password\'?\'text\':\'password\';b.textContent=i.type===\'password\'?\'👁\':\'🔒\';})(this)" style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:0 10px;cursor:pointer;font-size:14px;">👁</button>'
        + '</div></div>';
    };
    var plainField = function(id, val, label, hint) {
      return '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">' + label + (hint ? ' <span style="font-weight:400;font-size:10px;color:var(--text-light);">· ' + hint + '</span>' : '') + '</label>'
        + '<input id="' + id + '" value="' + UI.esc(val) + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:ui-monospace,monospace;box-sizing:border-box;"></div>';
    };
    html += cardOpen('🆔 Business Registration &amp; Compliance')
      + '<div style="font-size:12px;color:var(--text-light);margin-bottom:10px;line-height:1.5;">Public IDs and registration #s. Sensitive fields (DOT PIN, EIN) are masked — tap 👁 to reveal. <strong>Never store passwords here</strong> — use Apple Keychain or 1Password.</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      +   plainField('cmp-dot',         compliance.dotNum,        'US DOT Number',        'public, FMCSA-searchable')
      +   maskField('cmp-dotpin',      compliance.dotPin,        'DOT PIN',              'sensitive · masks FMCSA writes')
      +   plainField('cmp-dos-current', compliance.dosCurrent,    'NY DOS # (current)',   'Department of State entity #')
      +   plainField('cmp-dos-prior',   compliance.dosPrior,      'NY DOS # (prior entity)', 'historical reference')
      +   maskField('cmp-ein',         compliance.ein,           'EIN',                  'tax ID, sensitive')
      +   plainField('cmp-sui',         compliance.sui,           'NYS SUI #',            'unemployment insurance')
      +   plainField('cmp-wc-num',      compliance.wcNum,         'Workers Comp #',       'NYSIF account #')
      +   plainField('cmp-wc-policy',   compliance.wcPolicy,      'WC Policy #',          'NYSIF policy ID')
      +   plainField('cmp-disability',  compliance.disabilityPol, 'Disability Policy #',  'ShelterPoint')
      +   plainField('cmp-pc',          compliance.pcNum,         'Pesticide Cert (PC) #', 'NY DEC')
      +   plainField('cmp-tcia',        compliance.tciaId,        'TCIA Member ID',       'Tree Care Industry Assoc.')
      +   plainField('cmp-isa',         compliance.isaId,         'ISA Member ID',        'Intl. Society of Arboriculture')
      + '</div>'
      + '<div style="margin-top:14px;text-align:right;"><button onclick="SettingsPage.saveCompliance()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;">Save</button></div>'
      + '</div></details>';

    // ─── 🎨 White-label Branding (tenants.config) ───
    // v600: edits go DIRECTLY to tenants.config in Supabase. The templating
    // in /branding.js + edge functions reads from this row, so changes here
    // immediately affect onboarding pages, customer portal, quote-notify,
    // request-notify, portal-auth, dialpad-webhook auto-replies, stripe
    // receipts, etc.
    //
    // Loaded async (renders skeleton, fills in once Supabase responds).
    html += cardOpen('🎨 White-label Branding <span style="font-weight:400;color:var(--text-light);font-size:12px;margin-left:6px;">tenants.config — affects emails, portal, onboarding</span>')
      + '<div style="font-size:12px;color:var(--text-light);margin-bottom:12px;line-height:1.5;">These values populate every customer-facing email signature, the onboarding flow, the customer portal header, and the legal docs new hires sign. <strong>Edits here go live immediately</strong> — no redeploy needed.</div>'
      + '<div id="wl-branding-form" style="position:relative;min-height:200px;">'
      +   '<div style="text-align:center;padding:40px 0;color:var(--text-light);">⏳ Loading tenant config…</div>'
      + '</div>'
      + '<div style="margin-top:14px;text-align:right;"><button onclick="SettingsPage.saveBranding()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;" id="wl-save-btn" disabled>Save</button></div>'
      + '</div></details>';

    // Kick off async load of the tenant config + render the form
    setTimeout(function(){ if (typeof SettingsPage._loadBrandingForm === 'function') SettingsPage._loadBrandingForm(); }, 80);

    // ─── 🔗 Vendor & Utility Logins ───
    // Stores URL + username + account # for each site Doug uses. Passwords are
    // EXPLICITLY NOT STORED — guidance points to Apple Keychain / 1Password.
    var logins = JSON.parse(localStorage.getItem('bm-co-vendor-logins') || '[]');
    html += cardOpen('🔗 Vendor &amp; Utility Logins')
      + '<div style="background:#fff3e0;border:1px solid #ffcc80;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:#7e2d10;line-height:1.5;">'
      +   '<strong>⚠ No passwords here.</strong> This list stores URLs + usernames only. Passwords belong in Apple Keychain (Settings → Passwords on iPhone/Mac) or a password manager like 1Password. If a password gets pasted here it will be ignored.'
      + '</div>'
      + '<div id="vendor-logins-list">';
    if (logins.length === 0) {
      html += '<div style="font-size:13px;color:var(--text-light);padding:6px 0;">No logins saved yet.</div>';
    } else {
      logins.forEach(function(v, i) {
        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px;padding:8px;background:#f8f9fa;border:1px solid var(--border);border-radius:8px;">'
          +   '<div><label style="font-size:11px;color:var(--text-light);">Label</label><input data-vl-i="' + i + '" data-vl-k="label" value="' + UI.esc(v.label || '') + '" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:5px;font-size:12px;box-sizing:border-box;"></div>'
          +   '<div><label style="font-size:11px;color:var(--text-light);">URL</label><input data-vl-i="' + i + '" data-vl-k="url" value="' + UI.esc(v.url || '') + '" placeholder="https://..." style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:5px;font-size:12px;box-sizing:border-box;"></div>'
          +   '<div><label style="font-size:11px;color:var(--text-light);">Username</label><input data-vl-i="' + i + '" data-vl-k="username" value="' + UI.esc(v.username || '') + '" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:ui-monospace,monospace;box-sizing:border-box;"></div>'
          +   '<div><label style="font-size:11px;color:var(--text-light);">Account #</label><input data-vl-i="' + i + '" data-vl-k="account" value="' + UI.esc(v.account || '') + '" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:ui-monospace,monospace;box-sizing:border-box;"></div>'
          +   '<div style="display:flex;gap:4px;">'
          +     (v.url ? '<a href="' + UI.esc(v.url) + '" target="_blank" rel="noopener" style="background:#1565c0;color:#fff;text-decoration:none;font-size:11px;font-weight:700;padding:6px 10px;border-radius:5px;">Open</a>' : '')
          +     '<button onclick="SettingsPage.removeVendorLogin(' + i + ')" style="background:#dc3545;color:#fff;border:none;padding:6px 10px;border-radius:5px;font-size:11px;cursor:pointer;">✕</button>'
          +   '</div>'
          + '</div>';
      });
    }
    html += '</div>'
      + '<div style="margin-top:10px;display:flex;gap:8px;">'
      +   '<button onclick="SettingsPage.addVendorLogin()" style="background:var(--bg);border:1px solid var(--border);color:var(--text);font-size:12px;font-weight:600;padding:8px 14px;border-radius:6px;cursor:pointer;">+ Add Login</button>'
      +   '<button onclick="SettingsPage.saveVendorLogins()" style="background:var(--green-dark);color:#fff;border:none;font-size:12px;font-weight:700;padding:8px 14px;border-radius:6px;cursor:pointer;">Save All</button>'
      + '</div>'
      + '</div></details>';

    // ── Social & Reviews ──
    var sr = {
      googleReview: CompanyInfo.get('googleReviewUrl'),
      facebook:     CompanyInfo.get('facebookUrl'),
      instagram:    CompanyInfo.get('instagramUrl'),
      yelp:         CompanyInfo.get('yelpUrl'),
      nextdoor:     CompanyInfo.get('nextdoorUrl')
    };
    html += '<details style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">'
      + '<summary style="padding:14px 18px;cursor:pointer;font-size:15px;font-weight:700;color:var(--text);list-style:none;display:flex;justify-content:space-between;align-items:center;">'
      + '<span><i data-lucide="star" class="li li-hdr"></i> Social &amp; Reviews</span>'
      + '<span style="font-size:11px;color:var(--text-light);font-weight:500;">tap to expand</span>'
      + '</summary>'
      + '<div style="padding:16px 20px;border-top:1px solid var(--border);">'
      + '<p style="font-size:12px;color:var(--text-light);margin-bottom:14px;">These links appear in quote &amp; invoice emails sent to customers.</p>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div style="grid-column:1/-1;"><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">⭐ Google Review Link</label><input id="sr-review" type="url" value="' + UI.esc(sr.googleReview) + '" placeholder="https://g.page/r/..." style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Facebook</label><input id="sr-facebook" type="url" value="' + UI.esc(sr.facebook) + '" placeholder="https://facebook.com/..." style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Instagram</label><input id="sr-instagram" type="url" value="' + UI.esc(sr.instagram) + '" placeholder="https://instagram.com/..." style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Yelp</label><input id="sr-yelp" type="url" value="' + UI.esc(sr.yelp) + '" placeholder="https://yelp.com/biz/..." style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Nextdoor</label><input id="sr-nextdoor" type="url" value="' + UI.esc(sr.nextdoor) + '" placeholder="https://nextdoor.com/..." style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '</div>'
      + '<div style="margin-top:14px;text-align:right;"><button onclick="SettingsPage.saveSocialLinks()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;">Save</button></div>'
      + '</div></details>';

    // ── Work Settings ──
    var ws = {
      defaultStart: localStorage.getItem('bm-work-start') || '07:00',
      defaultEnd: localStorage.getItem('bm-work-end') || '15:30',
      overtimeThreshold: localStorage.getItem('bm-ot-threshold') || '40',
      payPeriod: localStorage.getItem('bm-pay-period') || 'biweekly',
      arrivalWindows: localStorage.getItem('bm-arrival-windows') || 'morning,afternoon,all-day',
      minJobDuration: localStorage.getItem('bm-min-job-hrs') || '2',
      crewSeeClientInfo: localStorage.getItem('bm-crew-see-client') !== 'false'
    };
    html += cardOpen('Work Settings')
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Default Start Time</label>'
      + '<input type="time" id="ws-start" value="' + ws.defaultStart + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Default End Time</label>'
      + '<input type="time" id="ws-end" value="' + ws.defaultEnd + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;"></div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Overtime After (hrs/week)</label>'
      + '<input type="number" id="ws-ot" value="' + ws.overtimeThreshold + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Pay Period</label>'
      + '<select id="ws-pay" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;">'
      + '<option value="weekly"' + (ws.payPeriod === 'weekly' ? ' selected' : '') + '>Weekly</option>'
      + '<option value="biweekly"' + (ws.payPeriod === 'biweekly' ? ' selected' : '') + '>Bi-weekly</option>'
      + '<option value="semimonthly"' + (ws.payPeriod === 'semimonthly' ? ' selected' : '') + '>Semi-monthly</option>'
      + '<option value="monthly"' + (ws.payPeriod === 'monthly' ? ' selected' : '') + '>Monthly</option>'
      + '</select></div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Min Job Duration (hrs)</label>'
      + '<input type="number" id="ws-min-job" value="' + ws.minJobDuration + '" step="0.5" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;"></div>'
      + '<div style="display:flex;align-items:center;gap:8px;padding-top:20px;">'
      + '<input type="checkbox" id="ws-crew-client" style="width:18px;height:18px;"' + (ws.crewSeeClientInfo ? ' checked' : '') + '>'
      + '<label style="font-size:13px;">Crew can see client phone/email</label>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '<div style="margin-top:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:8px;">Business Hours</label>';
    var bhDays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var bhDefaults = {Sunday:'9:00 AM – 1:00 PM',Monday:'8:00 AM – 6:00 PM',Tuesday:'8:00 AM – 6:00 PM',Wednesday:'8:00 AM – 6:00 PM',Thursday:'8:00 AM – 6:00 PM',Friday:'8:00 AM – 6:00 PM',Saturday:'9:00 AM – 3:00 PM'};
    bhDays.forEach(function(day) {
      var stored = localStorage.getItem('bm-bh-' + day.toLowerCase()) || bhDefaults[day];
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #f5f5f5;">'
        + '<span style="font-size:13px;font-weight:600;width:90px;">' + day + '</span>'
        + '<input type="text" id="bh-' + day.toLowerCase() + '" value="' + UI.esc(stored) + '" style="flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:13px;text-align:center;" placeholder="Closed">'
        + '</div>';
    });
    html += '<div style="font-size:11px;color:var(--text-light);margin-top:6px;">Displayed on booking form and client communications. Type "Closed" for days off.</div>'
      + '</div>'
      + '<div style="margin-top:14px;text-align:right;"><button onclick="SettingsPage._saveWorkSettings()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;">Save</button></div>'
      + '</div></details>';

    // ── Location Services ──
    var locTrack = localStorage.getItem('bm-gps-tracking') !== 'false';
    var locWorkOnly = localStorage.getItem('bm-gps-work-only') !== 'false';
    var locGeofence = localStorage.getItem('bm-geofence') === 'true';
    html += cardOpen('Location Services')
      + '<div style="display:flex;flex-direction:column;gap:12px;">'
      + '<label style="display:flex;align-items:center;gap:10px;font-size:14px;cursor:pointer;">'
      + '<input type="checkbox" id="loc-tracking" style="width:18px;height:18px;"' + (locTrack ? ' checked' : '') + '>'
      + '<div><strong>GPS Tracking</strong><div style="font-size:12px;color:var(--text-light);">Track crew locations on the dispatch map</div></div></label>'
      + '<label style="display:flex;align-items:center;gap:10px;font-size:14px;cursor:pointer;">'
      + '<input type="checkbox" id="loc-work-only" style="width:18px;height:18px;"' + (locWorkOnly ? ' checked' : '') + '>'
      + '<div><strong>Work Hours Only</strong><div style="font-size:12px;color:var(--text-light);">Only track during scheduled work hours (privacy)</div></div></label>'
      + '<label style="display:flex;align-items:center;gap:10px;font-size:14px;cursor:pointer;">'
      + '<input type="checkbox" id="loc-geofence" style="width:18px;height:18px;"' + (locGeofence ? ' checked' : '') + '>'
      + '<div><strong>Geofence Auto Clock-In</strong><div style="font-size:12px;color:var(--text-light);">Automatically clock crew in when they arrive at a job site</div></div></label>'
      + '</div>';

    // ── Passive Location Tracking (BETA, owner-only for now) ──
    var passiveOn   = localStorage.getItem('bm-passive-track') === 'true';
    var passiveInt  = parseInt(localStorage.getItem('bm-passive-interval') || '60', 10);     // seconds between pings
    var dwellRad    = parseInt(localStorage.getItem('bm-passive-dwell-radius') || '50', 10); // meters
    var dwellMin    = parseInt(localStorage.getItem('bm-passive-dwell-minutes') || '60', 10); // minutes
    html += '<div style="margin-top:16px;background:' + (passiveOn ? 'var(--green-bg)' : 'var(--bg)') + ';border:2px solid ' + (passiveOn ? 'var(--green-light)' : 'var(--border)') + ';border-radius:12px;padding:16px 18px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:10px;">'
      +   '<div style="flex:1;min-width:220px;">'
      +     '<div style="font-size:14px;font-weight:800;color:var(--text);">🛰 Passive Location Tracking <span style="background:var(--accent);color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;vertical-align:middle;">BETA</span></div>'
      +     '<div style="font-size:12px;color:var(--text-light);margin-top:3px;">Captures your location in the background while BM is open. When you\'ve been somewhere a while, BM asks if it\'s a job site — one tap tags it. Owner-only for now; crew will be invited later.</div>'
      +   '</div>'
      +   '<label style="position:relative;display:inline-block;width:48px;height:26px;cursor:pointer;flex-shrink:0;">'
      +     '<input type="checkbox" id="passive-track-toggle" onchange="SettingsPage._togglePassiveTracking(this.checked)"' + (passiveOn ? ' checked' : '') + ' style="opacity:0;width:0;height:0;">'
      +     '<span style="position:absolute;inset:0;background:' + (passiveOn ? 'var(--green-dark)' : '#cbd5e1') + ';border-radius:26px;transition:.2s;"></span>'
      +     '<span style="position:absolute;top:3px;left:' + (passiveOn ? '25px' : '3px') + ';width:20px;height:20px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2);"></span>'
      +   '</label>'
      + '</div>'

      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:10px;' + (passiveOn ? '' : 'opacity:0.5;pointer-events:none;') + '">'
      +   '<div><label style="font-size:11px;font-weight:600;color:var(--text-light);display:block;margin-bottom:2px;">Ping every (sec)</label>'
      +     '<input type="number" id="passive-interval" value="' + passiveInt + '" min="30" max="600" step="30" onchange="SettingsPage._savePassiveSettings()" style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box;"></div>'
      +   '<div><label style="font-size:11px;font-weight:600;color:var(--text-light);display:block;margin-bottom:2px;">Dwell radius (m)</label>'
      +     '<input type="number" id="passive-dwell-radius" value="' + dwellRad + '" min="20" max="200" step="10" onchange="SettingsPage._savePassiveSettings()" style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box;"></div>'
      +   '<div><label style="font-size:11px;font-weight:600;color:var(--text-light);display:block;margin-bottom:2px;">Dwell time (min)</label>'
      +     '<input type="number" id="passive-dwell-minutes" value="' + dwellMin + '" min="15" max="240" step="5" onchange="SettingsPage._savePassiveSettings()" style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box;"></div>'
      + '</div>'

      + '<div id="passive-status" style="font-size:11px;color:var(--text-light);margin-top:10px;">' + (passiveOn ? '✓ Tracking active — pings every ' + passiveInt + 's. Grant location when iOS prompts.' : 'Off. Enable to start capturing pings.') + '</div>'

      + '<div style="margin-top:10px;"><button class="btn btn-outline" style="font-size:12px;padding:6px 12px;" onclick="loadPage(\'tracking\')">🛰 Review detected places →</button></div>'

      + '<details style="margin-top:10px;">'
      +   '<summary style="cursor:pointer;font-size:11px;color:var(--text-light);font-weight:600;">Privacy + data details ▾</summary>'
      +   '<div style="font-size:11px;color:var(--text-light);margin-top:6px;line-height:1.6;padding-left:6px;border-left:2px solid var(--border);">'
      +     '• Pings are stored in your <em>own</em> tenant in Supabase (RLS-scoped).<br>'
      +     '• Raw pings auto-prune after 30 days. Tagged job locations stay.<br>'
      +     '• Tracking <strong>only runs while BM is the active tab/app</strong> — closing or backgrounding stops capture. (Background tracking would need a native wrapper.)<br>'
      +     '• Web Push notifications ask iOS permission the first time a dwell is detected.<br>'
      +     '• Toggle off any time → existing data stays unless you delete it from Review page (coming next).'
      +   '</div>'
      + '</details>'
      + '</div>';

    // ── Time Tracking Enhancements (the shortlist from the review — stubs for now, wired as we build) ──
    var autoClockIn     = localStorage.getItem('bm-auto-clock-in') === 'true';
    var breakTracking   = localStorage.getItem('bm-break-tracking') === 'true';
    var overtimeShield  = localStorage.getItem('bm-ot-shield') !== 'false'; // default ON
    var otThresholdHrs  = parseInt(localStorage.getItem('bm-ot-threshold') || '40', 10);
    var whoOnClockBadge = localStorage.getItem('bm-who-on-clock-badge') !== 'false'; // default ON
    html += '<div style="margin-top:16px;background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:4px;">⏱ Time Tracking Enhancements</div>'
      + '<div style="font-size:12px;color:var(--text-light);margin-bottom:12px;">The shortlist from the review — toggles are here; each feature ships one at a time.</div>'

      // A — Auto clock-in/out from detected job sites (links passive tracking to timesheets)
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:10px 0;border-top:1px solid var(--border);">'
      +   '<div style="flex:1;min-width:200px;">'
      +     '<div style="font-size:13px;font-weight:700;">A. Auto clock-in / clock-out at tagged jobs</div>'
      +     '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">When you arrive at a detected_location tagged with a job, clock in automatically. Leave → clock out.</div>'
      +   '</div>'
      +   '<label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;margin-top:2px;">'
      +     '<input type="checkbox" onchange="localStorage.setItem(\'bm-auto-clock-in\', this.checked ? \'true\' : \'false\');UI.toast(\'Auto clock-in: \' + (this.checked ? \'ON\' : \'OFF\'));"' + (autoClockIn ? ' checked' : '') + ' style="opacity:0;width:0;height:0;">'
      +     '<span style="position:absolute;inset:0;background:' + (autoClockIn ? 'var(--green-dark)' : '#cbd5e1') + ';border-radius:24px;transition:.2s;"></span>'
      +     '<span style="position:absolute;top:3px;left:' + (autoClockIn ? '23px' : '3px') + ';width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2);"></span>'
      +   '</label>'
      + '</div>'

      // B — Who's on the clock (dashboard widget)
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:10px 0;border-top:1px solid var(--border);">'
      +   '<div style="flex:1;min-width:200px;">'
      +     '<div style="font-size:13px;font-weight:700;">B. "Who\'s on the clock" dashboard widget</div>'
      +     '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">Live roster of everyone currently clocked in — name, job, elapsed, GPS status. Flags stuck sessions (>10hr).</div>'
      +   '</div>'
      +   '<label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;margin-top:2px;">'
      +     '<input type="checkbox" onchange="localStorage.setItem(\'bm-who-on-clock-badge\', this.checked ? \'true\' : \'false\');UI.toast(\'Dashboard widget: \' + (this.checked ? \'ON\' : \'OFF\'));"' + (whoOnClockBadge ? ' checked' : '') + ' style="opacity:0;width:0;height:0;">'
      +     '<span style="position:absolute;inset:0;background:' + (whoOnClockBadge ? 'var(--green-dark)' : '#cbd5e1') + ';border-radius:24px;transition:.2s;"></span>'
      +     '<span style="position:absolute;top:3px;left:' + (whoOnClockBadge ? '23px' : '3px') + ';width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2);"></span>'
      +   '</label>'
      + '</div>'

      // C — Break tracking + OT shield
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:10px 0;border-top:1px solid var(--border);">'
      +   '<div style="flex:1;min-width:200px;">'
      +     '<div style="font-size:13px;font-weight:700;">C. Break tracking</div>'
      +     '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">Start/End Break button in the clock-in widget. Required for NY labor compliance on shifts &gt; 6 hours.</div>'
      +   '</div>'
      +   '<label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;margin-top:2px;">'
      +     '<input type="checkbox" onchange="localStorage.setItem(\'bm-break-tracking\', this.checked ? \'true\' : \'false\');UI.toast(\'Break tracking: \' + (this.checked ? \'ON\' : \'OFF\'));"' + (breakTracking ? ' checked' : '') + ' style="opacity:0;width:0;height:0;">'
      +     '<span style="position:absolute;inset:0;background:' + (breakTracking ? 'var(--green-dark)' : '#cbd5e1') + ';border-radius:24px;transition:.2s;"></span>'
      +     '<span style="position:absolute;top:3px;left:' + (breakTracking ? '23px' : '3px') + ';width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2);"></span>'
      +   '</label>'
      + '</div>'

      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0 2px;border-top:1px solid var(--border);">'
      +   '<div style="flex:1;min-width:200px;">'
      +     '<div style="font-size:13px;font-weight:700;">Overtime shield</div>'
      +     '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">Warn crew + owner when someone\'s within 4hr of weekly OT. Current threshold: '
      +       '<input type="number" value="' + otThresholdHrs + '" min="30" max="60" step="1" onchange="localStorage.setItem(\'bm-ot-threshold\', this.value);UI.toast(\'OT threshold: \'+this.value+\'hr/week\');" style="width:44px;padding:1px 4px;border:1px solid var(--border);border-radius:4px;font-size:11px;text-align:center;"> hr/week</div>'
      +   '</div>'
      +   '<label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;">'
      +     '<input type="checkbox" onchange="localStorage.setItem(\'bm-ot-shield\', this.checked ? \'true\' : \'false\');UI.toast(\'OT shield: \' + (this.checked ? \'ON\' : \'OFF\'));"' + (overtimeShield ? ' checked' : '') + ' style="opacity:0;width:0;height:0;">'
      +     '<span style="position:absolute;inset:0;background:' + (overtimeShield ? 'var(--green-dark)' : '#cbd5e1') + ';border-radius:24px;transition:.2s;"></span>'
      +     '<span style="position:absolute;top:3px;left:' + (overtimeShield ? '23px' : '3px') + ';width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2);"></span>'
      +   '</label>'
      + '</div>'

      + '</div>'

      + '<div style="margin-top:14px;text-align:right;"><button onclick="SettingsPage._saveLocationSettings()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;">Save</button></div>'

      + '</div></details>';

    // (Removed orphan </div></details> from old "Business Info" inner wrapper —
    // it was closing the BUSINESS meta-group prematurely after the v446 refactor.)

    // ═══ Quote & Invoice Defaults (collapsible — uses cardOpen for visual parity) ═══
    html += cardOpen('Quote & Invoice Defaults', { icon: 'file-text' });

    // ── Notifications moved to USER meta-group (top of page) ──

    // ── Default Quote & Invoice Settings ──
    var qd = {
      paymentTerms: localStorage.getItem('bm-payment-terms') || 'net30',
      defaultDeposit: localStorage.getItem('bm-default-deposit') || '50',
      quoteValidity: localStorage.getItem('bm-quote-validity') || '30',
      showLineItemPrices: localStorage.getItem('bm-show-line-prices') !== 'false',
      companyLogo: localStorage.getItem('bm-company-logo') || ''
    };
    html += cardOpen('Default Quote & Invoice Settings', { open: true })
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Payment Terms</label>'
      + '<select id="qd-terms" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;">'
      + '<option value="due-on-completion"' + (qd.paymentTerms === 'due-on-completion' ? ' selected' : '') + '>Due on completion</option>'
      + '<option value="net15"' + (qd.paymentTerms === 'net15' ? ' selected' : '') + '>Net 15</option>'
      + '<option value="net30"' + (qd.paymentTerms === 'net30' ? ' selected' : '') + '>Net 30</option>'
      + '<option value="net60"' + (qd.paymentTerms === 'net60' ? ' selected' : '') + '>Net 60</option>'
      + '</select></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Default Deposit %</label>'
      + '<input type="number" id="qd-deposit" value="' + qd.defaultDeposit + '" min="0" max="100" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;"></div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Quote Valid (days)</label>'
      + '<input type="number" id="qd-validity" value="' + qd.quoteValidity + '" min="1" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;"></div>'
      + '<div style="display:flex;align-items:center;gap:8px;padding-top:20px;">'
      + '<input type="checkbox" id="qd-show-prices" style="width:18px;height:18px;"' + (qd.showLineItemPrices ? ' checked' : '') + '>'
      + '<label style="font-size:13px;">Show line item prices to client</label>'
      + '</div>'
      + '</div>'
      + '<div style="margin-top:14px;text-align:right;margin-right:0;"><button onclick="SettingsPage._saveQuoteDefaults()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;margin-right:0;">Save</button></div>'
      + '</div>'
      + '</details>';

    // ── Client-Facing Options ──
    var cf = {
      quoteTerm:        localStorage.getItem('bm-quote-term') || 'quote',
      requireSig:       localStorage.getItem('bm-require-quote-sig') === 'true',
      tipsEnabled:      localStorage.getItem('bm-tips-enabled') !== 'false',
      autoReceipt:      localStorage.getItem('bm-auto-receipt') !== 'false',
      tcUrl:            localStorage.getItem('bm-tc-url') || '',
      showQty:          localStorage.getItem('bm-pdf-show-qty') === 'true',
      showUnitPrice:    localStorage.getItem('bm-pdf-show-unit-price') === 'true'
    };
    html += cardOpen('Client-Facing Options')
      + '<div style="display:flex;flex-direction:column;gap:14px;">'

      // Quote term rename
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">'
      + '<div><div style="font-size:13px;font-weight:700;">Call quotes "Estimates"</div><div style="font-size:11px;color:var(--text-light);margin-top:1px;">Changes label on PDFs, emails, and client-facing pages</div></div>'
      + '<label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;">'
      + '<input type="checkbox" id="cf-quote-term" style="opacity:0;width:0;height:0;"' + (cf.quoteTerm === 'estimate' ? ' checked' : '') + '>'
      + '<span style="position:absolute;inset:0;background:' + (cf.quoteTerm === 'estimate' ? 'var(--green-dark)' : '#cbd5e1') + ';border-radius:24px;transition:.2s;" id="cf-quote-term-track"></span>'
      + '<span style="position:absolute;top:3px;left:' + (cf.quoteTerm === 'estimate' ? '23px' : '3px') + ';width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2);" id="cf-quote-term-knob"></span>'
      + '</label></div>'

      // Require signature
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">'
      + '<div><div style="font-size:13px;font-weight:700;">Require client signature to approve</div><div style="font-size:11px;color:var(--text-light);margin-top:1px;">Signature field appears on approve.html before approval is recorded</div></div>'
      + '<label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;">'
      + '<input type="checkbox" id="cf-require-sig" style="opacity:0;width:0;height:0;"' + (cf.requireSig ? ' checked' : '') + '>'
      + '<span style="position:absolute;inset:0;background:' + (cf.requireSig ? 'var(--green-dark)' : '#cbd5e1') + ';border-radius:24px;transition:.2s;"></span>'
      + '<span style="position:absolute;top:3px;left:' + (cf.requireSig ? '23px' : '3px') + ';width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2);"></span>'
      + '</label></div>'

      // Tips on payment page
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">'
      + '<div><div style="font-size:13px;font-weight:700;">Show gratuity option on payment page</div><div style="font-size:11px;color:var(--text-light);margin-top:1px;">Customers can add a tip when paying online via pay.html</div></div>'
      + '<label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;">'
      + '<input type="checkbox" id="cf-tips" style="opacity:0;width:0;height:0;"' + (cf.tipsEnabled ? ' checked' : '') + '>'
      + '<span style="position:absolute;inset:0;background:' + (cf.tipsEnabled ? 'var(--green-dark)' : '#cbd5e1') + ';border-radius:24px;transition:.2s;"></span>'
      + '<span style="position:absolute;top:3px;left:' + (cf.tipsEnabled ? '23px' : '3px') + ';width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2);"></span>'
      + '</label></div>'

      // Auto-receipt
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">'
      + '<div><div style="font-size:13px;font-weight:700;">Auto-send receipt on payment</div><div style="font-size:11px;color:var(--text-light);margin-top:1px;">Email receipt to client automatically when Stripe payment completes</div></div>'
      + '<label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;">'
      + '<input type="checkbox" id="cf-auto-receipt" style="opacity:0;width:0;height:0;"' + (cf.autoReceipt ? ' checked' : '') + '>'
      + '<span style="position:absolute;inset:0;background:' + (cf.autoReceipt ? 'var(--green-dark)' : '#cbd5e1') + ';border-radius:24px;transition:.2s;"></span>'
      + '<span style="position:absolute;top:3px;left:' + (cf.autoReceipt ? '23px' : '3px') + ';width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2);"></span>'
      + '</label></div>'

      // Show Qty / Unit Price on PDF/email
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="cf-show-qty" style="width:16px;height:16px;"' + (cf.showQty ? ' checked' : '') + '><span style="font-size:13px;">Show Qty column on PDF/email</span></label>'
      + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="cf-show-unit-price" style="width:16px;height:16px;"' + (cf.showUnitPrice ? ' checked' : '') + '><span style="font-size:13px;">Show Unit Price column on PDF/email</span></label>'
      + '</div>'

      // T&C URL
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Terms &amp; Conditions URL <span style="font-weight:400;">(optional — linked from client-facing emails)</span></label>'
      + '<input type="url" id="cf-tc-url" value="' + UI.esc(cf.tcUrl) + '" placeholder="https://peekskilltree.com/terms-of-service.html" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'

      + '</div>'
      + '<div style="margin-top:14px;text-align:right;"><button onclick="SettingsPage._saveClientFacing()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;">Save</button></div>'
      + '</div></details>';

    // ── Booking Form Settings ──
    var bf = {
      enabled: localStorage.getItem('bm-booking-enabled') !== 'false',
      autoResponse: localStorage.getItem('bm-booking-auto-response') !== 'false',
      requirePhone: localStorage.getItem('bm-booking-require-phone') !== 'false',
      requireAddress: localStorage.getItem('bm-booking-require-address') !== 'false',
      showServices: localStorage.getItem('bm-booking-show-services') !== 'false'
    };
    html += cardOpen('Online Booking')
      + '<div style="display:flex;flex-direction:column;gap:10px;">'
      + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;">'
      + '<input type="checkbox" id="bf-enabled" style="width:18px;height:18px;"' + (bf.enabled ? ' checked' : '') + '>'
      + '<div><strong style="font-size:13px;">Online Booking Enabled</strong><div style="font-size:11px;color:var(--text-light);">Show booking form at branchmanager.app/book.html</div></div></label>'
      + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;">'
      + '<input type="checkbox" id="bf-auto-response" style="width:18px;height:18px;"' + (bf.autoResponse ? ' checked' : '') + '>'
      + '<div><strong style="font-size:13px;">Auto-Response Email</strong><div style="font-size:11px;color:var(--text-light);">Send confirmation email when request is received</div></div></label>'
      + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;">'
      + '<input type="checkbox" id="bf-require-phone" style="width:18px;height:18px;"' + (bf.requirePhone ? ' checked' : '') + '>'
      + '<div><strong style="font-size:13px;">Require Phone Number</strong></div></label>'
      + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;">'
      + '<input type="checkbox" id="bf-require-address" style="width:18px;height:18px;"' + (bf.requireAddress ? ' checked' : '') + '>'
      + '<div><strong style="font-size:13px;">Require Property Address</strong></div></label>'
      + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;">'
      + '<input type="checkbox" id="bf-show-services" style="width:18px;height:18px;"' + (bf.showServices ? ' checked' : '') + '>'
      + '<div><strong style="font-size:13px;">Show Service Picker</strong><div style="font-size:11px;color:var(--text-light);">Let clients select the type of service they need</div></div></label>'
      + '</div>'
      + '<div style="margin-top:14px;text-align:right;margin-right:0;"><button onclick="SettingsPage._saveBookingSettings()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;margin-right:0;">Save</button></div>'
      + '</div></details>';

    // ── Review Settings ──
    var rev = {
      googleUrl: localStorage.getItem('bm-review-google-url') || 'https://g.page/r/CfY_something/review',
      sendAfter: localStorage.getItem('bm-review-send-after') || 'completion',
      delayDays: localStorage.getItem('bm-review-delay') || '1',
      autoSend: localStorage.getItem('bm-review-auto') === 'true'
    };
    html += cardOpen('Review Requests')
      + '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Google Review Link</label>'
      + '<input type="url" id="rev-google-url" value="' + UI.esc(rev.googleUrl) + '" placeholder="https://g.page/r/your-business/review" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;">'
      + '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">Get this from Google Business Profile → Share review link</div></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Send After</label>'
      + '<select id="rev-send-after" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;">'
      + '<option value="completion"' + (rev.sendAfter === 'completion' ? ' selected' : '') + '>Job Completed</option>'
      + '<option value="payment"' + (rev.sendAfter === 'payment' ? ' selected' : '') + '>Payment Received</option>'
      + '</select></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Delay (days)</label>'
      + '<input type="number" id="rev-delay" value="' + rev.delayDays + '" min="0" max="14" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;"></div>'
      + '</div>'
      + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;">'
      + '<input type="checkbox" id="rev-auto" style="width:18px;height:18px;"' + (rev.autoSend ? ' checked' : '') + '>'
      + '<div><strong style="font-size:13px;">Auto-Send Review Requests</strong><div style="font-size:11px;color:var(--text-light);">Automatically email clients after job/payment (uses Resend)</div></div></label>'
      + '<div style="margin-top:14px;text-align:right;margin-right:0;"><button onclick="SettingsPage._saveReviewSettings()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;margin-right:0;">Save</button></div>'
      + '</div></details>';

    // ── Email & SMS Templates ────────────────────────────────────────────────
    // Lets Doug customize the *content* of automated customer comms without
    // editing code. Stored in localStorage as `bm-comm-templates` (JSON).
    // Supported tokens in bodies: {firstName} {name} {service} {address}
    // {phone} {quoteTotal} {invoiceTotal} {jobDate} {reviewUrl}
    var _tpl = (function(){
      try { return JSON.parse(localStorage.getItem('bm-comm-templates') || '{}') || {}; } catch(e){ return {}; }
    })();
    var _defaultTpl = {
      bookingConfirm_email_subject:   'We got your request — {company}',
      bookingConfirm_email_body:      'Hi {firstName},\n\nThanks for reaching out! We got your request for {service} at {address}.\n\nWe\'ll reach out at {phone} within 2 business hours to schedule a free estimate.\n\n— Doug & Catherine\n{company}',
      bookingConfirm_sms:             'Hi {firstName}, got your request for {service}. We\'ll text/call at {phone} within 2 business hours. — {company}',
      visitReminder_sms_1hr:          'Hi {firstName}, {company} is heading to {address} in about an hour for your {service}. Call/text (914) 391-5233 with any questions.',
      visitReminder_email_1day:       'Hi {firstName},\n\nReminder: we\'re scheduled at {address} tomorrow for {service}. Please clear any fragile items and ensure access.\n\n— {company}',
      quoteFollowUp_5day:             'Hi {firstName}, just checking in on the {service} quote we sent. Any questions? Happy to walk through it. — {company}',
      quoteFollowUp_10day:            'Hi {firstName}, your quote expires soon. Give us a shout if you want to move forward or have questions. — {company}',
      invoiceReminder_1day_overdue:   'Hi {firstName}, friendly reminder that invoice #{invoiceNum} for {invoiceTotal} is past due. Pay online: {payUrl}. Thanks! — {company}',
      invoiceReminder_4day_overdue:   'Hi {firstName}, invoice #{invoiceNum} is 4 days overdue. Please pay at {payUrl} or reach out if there\'s an issue. — {company}',
      reviewRequest_email:            'Hi {firstName},\n\nThanks for trusting us with your {service}! If you were happy with our work, a Google review would mean the world: {reviewUrl}\n\n— Doug & Catherine\n{company}'
    };
    function _tpv(k){ return (_tpl[k] != null) ? _tpl[k] : _defaultTpl[k]; }
    html += cardOpen('Emails & Text Messages')
      + '<p style="font-size:12px;color:var(--text-light);margin:0 0 14px;">Edit the automated messages customers receive. Tokens like <code>{firstName}</code>, <code>{service}</code>, <code>{address}</code>, <code>{phone}</code>, <code>{invoiceTotal}</code>, <code>{reviewUrl}</code>, <code>{company}</code> are filled at send time.</p>';
    [
      ['bookingConfirm_email_subject', 'Booking confirmation — email subject', 'input'],
      ['bookingConfirm_email_body',    'Booking confirmation — email body',    'textarea'],
      ['bookingConfirm_sms',           'Booking confirmation — SMS',           'textarea'],
      ['visitReminder_sms_1hr',        'Visit reminder — SMS (1 hour before)', 'textarea'],
      ['visitReminder_email_1day',     'Visit reminder — email (1 day before)','textarea'],
      ['quoteFollowUp_5day',           'Quote follow-up — 5 days after sent',  'textarea'],
      ['quoteFollowUp_10day',          'Quote follow-up — 10 days after sent', 'textarea'],
      ['invoiceReminder_1day_overdue', 'Invoice reminder — 1 day past due',    'textarea'],
      ['invoiceReminder_4day_overdue', 'Invoice reminder — 4 days past due',   'textarea'],
      ['reviewRequest_email',          'Review request — email',               'textarea']
    ].forEach(function(t){
      var id = 'tpl-' + t[0];
      var val = _tpv(t[0]);
      html += '<div style="margin-bottom:12px;">'
        +   '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">' + t[1] + '</label>'
        +   (t[2] === 'textarea'
              ? '<textarea id="' + id + '" rows="' + Math.max(3, (val.match(/\n/g)||[]).length + 2) + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box;resize:vertical;">' + UI.esc(val) + '</textarea>'
              : '<input type="text" id="' + id + '" value="' + UI.esc(val) + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;">')
        + '</div>';
    });
    html += '<div style="font-size:11px;color:var(--text-light);margin-top:8px;">Leave a field blank to fall back to the built-in default. Automation engines (request-notify, visit-reminders, review-send) read from these at send time.</div>'
      + '<div style="margin-top:14px;text-align:right;margin-right:0;"><button onclick="SettingsPage._saveCommTemplates()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;margin-right:0;">Save</button></div>'
      + '</div></details>';

    // ── Client Hub — portal branding ───────────────────────────────────────
    var _hub = (function(){ try { return JSON.parse(localStorage.getItem('bm-client-hub') || '{}') || {}; } catch(e){ return {}; } })();
    html += cardOpen('Client Hub')
      + '<p style="font-size:12px;color:var(--text-light);margin:0 0 14px;">Branding + copy for the public client portal at <code>client.html?id=CLIENT_UUID</code>.</p>'
      + '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Welcome Headline</label>'
      +   '<input type="text" id="hub-headline" value="' + UI.esc(_hub.headline || 'Hello, {firstName}!') + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Subheading</label>'
      +   '<input type="text" id="hub-sub" value="' + UI.esc(_hub.sub || 'Your client portal — quotes, appointments & invoices') + '" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">'
      + [['showQuotes', 'Show Pending Quotes'], ['showInvoices', 'Show Invoices Due'], ['showUpcoming', 'Show Upcoming Appointments'], ['showHistory', 'Show Service History'], ['showPhotos', 'Show Property Photos'], ['showDocs', 'Show Documents'], ['showContact', 'Show Contact Card']].map(function(x){
          var on = _hub[x[0]] !== false;
          return '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">'
            + '<input type="checkbox" id="hub-' + x[0] + '"' + (on ? ' checked' : '') + '> ' + x[1] + '</label>';
        }).join('')
      + '</div>'
      + '<div style="margin-top:14px;text-align:right;margin-right:0;"><button onclick="SettingsPage._saveClientHub()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;margin-right:0;">Save</button></div>'
      + '</div></details>';

    // ── Regional Settings ──
    var _zip = localStorage.getItem('bm-zip') || '10566';
    html += cardOpen('Regional Settings')
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Country</label>'
      + '<div style="padding:8px 12px;background:var(--bg);border-radius:6px;font-size:14px;">United States</div></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Timezone</label>'
      + '<div style="padding:8px 12px;background:var(--bg);border-radius:6px;font-size:14px;">(GMT-05:00) America/New_York</div></div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Default ZIP <span style="font-weight:400;">(species &amp; pricing region)</span></label>'
      + '<input type="text" id="reg-zip" maxlength="5" value="' + _zip + '" onchange="localStorage.setItem(\'bm-zip\',this.value);UI.toast(\'Default ZIP saved\');" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;">'
      + '</div>'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Date Format</label>'
      + '<div style="padding:8px 12px;background:var(--bg);border-radius:6px;font-size:14px;">Jan 31, 2026</div></div>'
      + '</div></div></details>';

    // — T&M Pricing Rates (moved here from standalone section at the bottom) —
    var _tmRates = (typeof QuotesPage !== 'undefined' && QuotesPage.getTMRates) ? QuotesPage.getTMRates() : {};
    html += cardOpen('🛠 T&M Pricing Rates')
      + '<p style="font-size:12px;color:var(--text-light);margin-bottom:14px;">Used by the Price Check on every quote. Override per your crew + equipment costs.</p>'
      + '<div style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Crew (hourly)</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:14px;">'
      +   SettingsPage._rateInput('Climber', 'climber', _tmRates.climber)
      +   SettingsPage._rateInput('Groundsman', 'ground', _tmRates.ground)
      +   SettingsPage._rateInput('Foreman', 'foreman', _tmRates.foreman)
      + '</div>'
      + '<div style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Equipment (hourly)</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:14px;">'
      +   SettingsPage._rateInput('Bucket truck', 'bucket', _tmRates.bucket)
      +   SettingsPage._rateInput('Chipper', 'chipper', _tmRates.chipper)
      +   SettingsPage._rateInput('Crane', 'crane', _tmRates.crane)
      +   SettingsPage._rateInput('Stump grinder', 'stumpGrinder', _tmRates.stumpGrinder)
      +   SettingsPage._rateInput('Mini-skid', 'miniSkid', _tmRates.miniSkid)
      +   SettingsPage._rateInput('Dump truck', 'dumpTruck', _tmRates.dumpTruck)
      +   SettingsPage._rateInput('Man lift / ladder', 'liftLadder', _tmRates.liftLadder)
      +   SettingsPage._rateInput('Trailer', 'trailer', _tmRates.trailer)
      + '</div>'
      + '<div style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Markup + Overhead</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">'
      +   '<div><label style="font-size:11px;color:var(--text-light);display:block;">Insurance/overhead %</label>'
      +     '<input type="number" id="tm-rate-insurance" value="' + Math.round((_tmRates.insurance || 0.31) * 100) + '" step="1" min="0" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;"></div>'
      +   '<div><label style="font-size:11px;color:var(--text-light);display:block;">Markup multiplier (×)</label>'
      +     '<input type="number" id="tm-rate-markup" value="' + (_tmRates.markup || 1.5) + '" step="0.05" min="1" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;"></div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;">'
      +   '<button onclick="SettingsPage._saveTMRates()" style="background:var(--green-dark);color:#fff;border:none;padding:10px 18px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;">Save Rates</button>'
      +   '<button onclick="if(confirm(\'Reset all T&amp;M rates to defaults?\')){localStorage.removeItem(\'bm-tm-rates\');loadPage(\'settings\');UI.toast(\'Rates reset to defaults\');}" style="background:#fff;color:var(--text);border:1px solid var(--border);padding:10px 18px;border-radius:6px;font-weight:600;font-size:13px;cursor:pointer;">Reset to Defaults</button>'
      + '</div>'
      + '</div></details>';

    // ═══ /Quote & Invoice Defaults ═══
    html += cardClose();

    // ═══ Services & Products (collapsible — uses cardOpen for visual parity) ═══
    html += cardOpen('Services & Products', { icon: 'wrench' });

    // Connected Apps status removed — duplicated the "🔌 API Keys & Integrations" section below.

    // Products & Services Catalog
    var allServices = DB.services.getAll();
    html += cardOpen('Products & Services')
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<div style="font-size:12px;color:var(--text-light);">' + allServices.length + ' items — used in quotes and invoices</div>'
      + '<button onclick="SettingsPage.addService()" style="background:var(--green-dark);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;">+ Add Item</button>'
      + '</div>'
      + '<div id="services-list">';
    allServices.forEach(function(svc) {
      html += '<div style="display:grid;grid-template-columns:2fr 3fr 80px 80px 36px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">'
        + '<div style="font-size:13px;font-weight:600;">' + UI.esc(svc.name) + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);">' + UI.esc(svc.description || '') + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);">' + (svc.type || 'service') + '</div>'
        + '<div style="font-size:13px;font-weight:600;">' + (svc.price ? UI.money(svc.price) : '—') + '</div>'
        + '<button onclick="SettingsPage.editService(\'' + svc.id + '\')" style="background:none;border:1px solid var(--border);padding:4px 8px;border-radius:4px;font-size:12px;cursor:pointer;">Edit</button>'
        + '</div>';
    });
    html += '</div></div></details>';

    // Data Summary
    html += cardOpen('Data Summary')
      + '<div class="stat-grid" style="margin-bottom:0;">'
      + '<div class="stat-card"><div class="stat-label">Clients</div><div class="stat-value">' + stats.totalClients + '</div></div>'
      + '<div class="stat-card"><div class="stat-label">Jobs</div><div class="stat-value">' + DB.jobs.count() + '</div></div>'
      + '<div class="stat-card"><div class="stat-label">Invoices</div><div class="stat-value">' + DB.invoices.count() + '</div></div>'
      + '<div class="stat-card"><div class="stat-label">Quotes</div><div class="stat-value">' + DB.quotes.count() + '</div></div>'
      + '</div></div></details>';

    // ═══ /Services & Products ═══
    html += cardClose();

    // ═══ Templates & Automation (collapsible — uses cardOpen for visual parity) ═══
    html += cardOpen('Templates & Automation', { icon: 'file-edit' });

    var _taRows = [
      { page: 'onlinebooking',   icon: '🌐', title: 'Online Booking',    desc: 'Configure your public booking form and widget' },
      { page: 'automations',     icon: '⚡', title: 'Automations',       desc: 'Rules for quote/invoice follow-ups and reminders' },
      { page: 'checklists',      icon: '✅', title: 'Job Checklists',    desc: 'Reusable checklist templates for crews' },
      { page: 'formbuilder',     icon: '🧩', title: 'Forms Builder',     desc: 'Build custom intake and inspection forms' },
      { page: 'emailtemplates',  icon: '📧', title: 'Email Templates',   desc: 'Edit templates for quote / invoice / follow-up emails' },
      { page: 'receptionist',    icon: '📞', title: 'AI Receptionist',   desc: 'Configure after-hours call answering and routing' }
    ];
    _taRows.forEach(function(r) {
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:#fafafa;">'
        + '<div>'
        +   '<div style="font-size:13px;font-weight:600;">' + r.icon + ' ' + r.title + '</div>'
        +   '<div style="font-size:11px;color:var(--text-light);">' + r.desc + '</div>'
        + '</div>'
        + '<button class="btn btn-outline" onclick="loadPage(\'' + r.page + '\')" style="font-size:12px;">Open →</button>'
        + '</div>';
    });

    // ═══ /Templates & Automation ═══
    html += cardClose();

    // Customer Portal management — bulk send invites + per-client status
    var _allClientsForPortal = DB.clients.getAll();
    var _withEmail = _allClientsForPortal.filter(function(c){ return c.email && c.email.indexOf('@') > 0; });
    var _autoInvite = localStorage.getItem('bm-portal-auto-invite') === '1';
    html += cardOpen('Customer Portal', { icon: 'lock' })
      +   '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">'
      +     '<div style="background:var(--bg);border-radius:8px;padding:12px;text-align:center;"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;font-weight:600;">Total Clients</div><div style="font-size:18px;font-weight:800;margin-top:3px;">' + _allClientsForPortal.length + '</div></div>'
      +     '<div style="background:var(--bg);border-radius:8px;padding:12px;text-align:center;"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;font-weight:600;">With Email</div><div style="font-size:18px;font-weight:800;margin-top:3px;color:var(--green-dark);">' + _withEmail.length + '</div></div>'
      +     '<div style="background:var(--bg);border-radius:8px;padding:12px;text-align:center;"><div style="font-size:11px;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;font-weight:600;">Missing Email</div><div style="font-size:18px;font-weight:800;margin-top:3px;color:' + (_allClientsForPortal.length - _withEmail.length > 0 ? '#dc2626' : 'var(--text-light)') + ';">' + (_allClientsForPortal.length - _withEmail.length) + '</div></div>'
      +   '</div>'
      +   '<div style="font-size:13px;color:var(--text-light);margin-bottom:12px;line-height:1.5;">Customers sign in passwordless at <strong style="color:var(--accent);">branchmanager.app/portal/</strong> to view their invoices, quotes, jobs, and photos. They get a one-tap email magic link \u2014 no password.</div>'
      +   '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">'
      +     '<a href="https://branchmanager.app/portal/" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="font-size:12px;">\ud83d\udd17 Open portal in new tab \u2192</a>'
      +     '<button onclick="SettingsPage._copyPortalLink()" class="btn btn-outline" style="font-size:12px;">\ud83d\udccb Copy portal link</button>'
      +   '</div>'
      +   '<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:12px;color:var(--text-light);font-weight:600;">\u26a1 Bulk-send portal invites \u25be</summary>'
      +     '<div style="margin-top:10px;padding:12px;background:#f3f0ff;border:1px solid #d6cbff;border-radius:8px;">'
      +       '<div style="font-size:12px;color:var(--text-light);margin-bottom:10px;line-height:1.5;">Email a magic-link invite to <strong>all ' + _withEmail.length + ' clients</strong> with an email on file. Each gets a one-time sign-in link valid for 1 hour. Throttled at 1 per second so Supabase doesn\'t rate-limit.</div>'
      +       '<button onclick="SettingsPage._bulkSendInvites()" style="background:#7c3aed;color:#fff;border:none;padding:9px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">Send invites to all ' + _withEmail.length + ' clients</button>'
      +     '</div>'
      +   '</details>'
      + cardClose();

    // Crew Performance \u2014 uses cardOpen with icon for visual parity
    html += cardOpen('Crew Performance', { icon: 'users' })
      +   '<div style="font-size:13px;color:var(--text-light);margin-bottom:10px;">View crew leaderboards, productivity stats, and time-on-job metrics. Same data as the standalone /#crewperformance page.</div>'
      +   '<button onclick="loadPage(\'crewperformance\');" class="btn btn-primary" style="font-size:12px;">Open Dashboard &rarr;</button>'
      + cardClose();

    html += groupClose();

    // ════════════════════════════════════════════════════════════════════════
    // META-GROUP 3 / 3: ADVANCED (wraps Integrations + DB + admin) — closed
    // v398: Integrations was its own meta-group; folded under Advanced now.
    // ════════════════════════════════════════════════════════════════════════
    html += groupOpen('Advanced', false);

    // ═══ API Keys & Integrations (collapsible group) ═══
    // Wraps SendGrid, AI, Stripe, Dialpad, Gusto, PlantNet in one foldable section
    // so the Settings page doesn't feel like a mile of cards.
    // Resend is always connected (server-side key) so count it as +1 from the start
    var _intCount = 1 + ['bm-claude-key','bm-stripe-base-link','bm-dialpad-key','bm-gusto-api-key','bm-plantnet-key']
      .filter(function(k){ return (localStorage.getItem(k) || '').length > 5; }).length;
    html += '<details style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<summary style="padding:16px 20px;cursor:pointer;font-size:15px;font-weight:700;color:var(--text);list-style:none;display:flex;justify-content:space-between;align-items:center;">'
      +   '<span><i data-lucide="plug" class="li li-hdr"></i> API Keys &amp; Integrations</span>'
      +   '<span style="font-size:12px;color:var(--text-light);font-weight:500;">' + _intCount + ' / 6 connected · tap to expand</span>'
      + '</summary>'
      + '<div style="padding:0 20px 16px;border-top:1px solid var(--border);margin-top:0;">';

    // Email (Resend) — server-keyed, no client config. v372 migrated off SendGrid.
    html += apiKeyHeader({
        ok: true,
        title: 'Resend Email',
        icon: '<span style="color:#fff;font-weight:800;font-size:13px;">RS</span>',
        iconBg: '#000',
        okText: 'Connected (server-side key) — automated emails active'
      })
      + '<p style="font-size:13px;color:var(--text-light);margin-bottom:12px;">Outbound email goes through Resend via the <code>send-email</code> Supabase edge function. Free at our volume. Migrated off SendGrid in v372 ahead of trial expiry.</p>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button onclick="if(typeof Email!==\'undefined\'){Email.send(\'info@peekskilltree.com\',\'Branch Manager Test\',\'Resend is connected and working!\').then(function(){UI.toast(\'Test sent! Check info@peekskilltree.com\');}).catch(function(e){UI.toast(\'Failed: \'+e.message,\'error\');});}else{UI.toast(\'Email module not loaded\',\'error\');}" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:14px;cursor:pointer;">Send Test Email</button>'
      + '</div>'
      + '<p style="font-size:11px;color:var(--text-light);margin-top:8px;">From: <code>onboarding@resend.dev</code> until DNS verification on peekskilltree.com is complete. To switch to <code>info@peekskilltree.com</code>, add Resend\'s DKIM/SPF records in the Wix DNS panel and ping me.</p>'
      + '</div>';

    // AI Assistant
    var aiKey = localStorage.getItem('bm-claude-key') || '';
    var aiServerManaged = AIConfig.serverManaged();
    var aiOk = aiServerManaged || aiKey.length > 10;
    html += apiKeyHeader({
        ok: aiOk,
        title: 'AI Assistant',
        emoji: '🤖',
        iconBg: 'linear-gradient(135deg,#D4A574,#C4956A)',
        okText: aiServerManaged
          ? '🔒 Server-managed key (secure — never leaves Supabase)'
          : '✅ Connected — key stored on this device',
        warnText: '⚠️ Not connected — choose a mode below'
      })
      // Mode picker
      + '<div style="display:flex;gap:6px;margin-bottom:12px;background:var(--bg);border-radius:8px;padding:4px;">'
      +   '<button onclick="localStorage.setItem(\'bm-claude-server-managed\',\'true\');UI.toast(\'Switched to server-managed key\');loadPage(\'settings\');" style="flex:1;padding:8px;border:none;background:' + (aiServerManaged ? 'var(--green-dark)' : 'transparent') + ';color:' + (aiServerManaged ? '#fff' : 'var(--text)') + ';border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">🔒 Server-managed <span style="font-weight:400;opacity:.8;">(recommended)</span></button>'
      +   '<button onclick="localStorage.setItem(\'bm-claude-server-managed\',\'false\');UI.toast(\'Switched to device key\');loadPage(\'settings\');" style="flex:1;padding:8px;border:none;background:' + (!aiServerManaged ? 'var(--green-dark)' : 'transparent') + ';color:' + (!aiServerManaged ? '#fff' : 'var(--text)') + ';border-radius:6px;cursor:pointer;font-size:12px;font-weight:700;">📱 Device key</button>'
      + '</div>';

    if (aiServerManaged) {
      html += '<div style="background:var(--green-bg);border:1px solid var(--green-light);border-radius:8px;padding:12px;font-size:12px;color:var(--text);">'
        +   '<div style="font-weight:700;margin-bottom:4px;">🔒 Key lives only on Supabase</div>'
        +   'BM calls Claude through the <code>ai-chat</code> edge function, which reads <code>ANTHROPIC_API_KEY</code> from its own secrets store. Your key is never in localStorage, never in JS, never on any device.<br><br>'
        +   '<strong>One-time setup (in Terminal):</strong>'
        +   '<pre style="background:#1a1a1a;color:#e8e8e8;padding:10px;border-radius:6px;margin-top:8px;font-size:11px;overflow-x:auto;white-space:pre-wrap;">supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...\nsupabase functions deploy ai-chat --no-verify-jwt</pre>'
        +   'After that, every device signed in sees ✅ — nobody has to paste a key anywhere.'
        + '</div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">'
        +   '<button onclick="SettingsPage._testClaudeKey()" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:14px;cursor:pointer;">🧪 Test server key</button>'
        + '</div>'
        + '<div id="claude-test-result" style="margin-top:10px;font-size:12px;"></div>';
    } else {
      html += '<div style="margin-bottom:8px;"><input type="password" id="claude-ai-key" value="' + aiKey + '" placeholder="sk-ant-api03-..." style="width:100%;padding:10px;border:2px solid ' + (aiOk ? 'var(--green-light)' : 'var(--border)') + ';border-radius:8px;font-size:14px;box-sizing:border-box;"></div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
        + '<button onclick="var k=document.getElementById(\'claude-ai-key\').value.trim();if(!k){UI.toast(\'Paste your key first\',\'error\');return;}localStorage.setItem(\'bm-claude-key\',k);if(typeof AI!==\'undefined\'){AI._apiKey=k;}UI.toast(\'AI Assistant connected! ✅\');loadPage(\'settings\');" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:14px;cursor:pointer;">Save Key</button>'
        + '<button onclick="SettingsPage._testClaudeKey()" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:14px;cursor:pointer;">🧪 Test</button>'
        + (aiOk ? '<button onclick="SettingsPage._removeKey(\'bm-claude-key\',\'AI Assistant\')" style="background:none;border:1px solid var(--border);padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer;">Remove</button>' : '')
        + '</div>'
        + '<div id="claude-test-result" style="margin-top:10px;font-size:12px;"></div>'
        + '<p style="font-size:11px;color:var(--text-light);margin-top:8px;">Get your key at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">console.anthropic.com</a> → API Keys → Create Key</p>';
    }
    html += '</div>';

    // ── Stripe Payment Link ──
    var stripeLink = localStorage.getItem('bm-stripe-base-link') || '';
    var stripeOkNow = stripeLink.length > 20;
    html += apiKeyHeader({
        ok: stripeOkNow,
        title: 'Stripe Payments',
        emoji: '💳',
        iconBg: '#635BFF',
        okText: '✅ Connected — clients can pay invoices online',
        warnText: '⚠️ Not connected — create a Payment Link below'
      });
    if (stripeOkNow) {
      html += '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;margin-bottom:8px;">'
        + '<div style="font-size:11px;color:#166534;font-weight:700;margin-bottom:3px;">Active Payment Link</div>'
        + '<div style="font-size:11px;color:var(--text-light);word-break:break-all;font-family:monospace;">' + stripeLink + '</div>'
        + '</div>'
        + '<button onclick="SettingsPage._removeKey(\'bm-stripe-base-link\',\'Stripe\')" style="background:none;border:1px solid var(--border);padding:8px 16px;border-radius:6px;font-size:13px;cursor:pointer;">Remove & re-create</button>'
        // Embedded payments — save secret key separately for inline card form
        + '<details style="margin-top:14px;"><summary style="cursor:pointer;font-size:12px;color:var(--text-light);font-weight:600;">⚡ Enable embedded card payments (Collect Payment page) ▾</summary>'
        + '<div style="margin-top:10px;padding:12px;background:#f3f0ff;border:1px solid #d6cbff;border-radius:8px;">'
        +   '<div style="font-size:12px;color:var(--text-light);margin-bottom:8px;line-height:1.5;">For the in-app Collect Payment page (Stripe Elements), paste your Stripe <strong>secret key</strong> once. Stored encrypted at rest in Supabase, never exposed to clients.</div>'
        +   '<input type="password" id="stripe-sk-save" placeholder="sk_live_..." autocomplete="off" style="width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:monospace;margin-bottom:6px;box-sizing:border-box;">'
        +   '<button onclick="Stripe.saveSecretKey()" style="background:#635bff;color:#fff;border:none;padding:9px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;width:100%;">Save & verify with Stripe</button>'
        + '</div></details>';
    } else {
      // Auto-create — preferred path
      html += '<div style="background:#f3f0ff;border:1px solid #d6cbff;border-radius:8px;padding:14px 16px;margin-bottom:10px;">'
        + '<div style="font-size:13px;font-weight:700;color:#4c1d95;margin-bottom:4px;">⚡ Auto-create (recommended)</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-bottom:10px;line-height:1.5;">Paste your Stripe <strong>secret key</strong> once — BM creates the Payment Link via Stripe API. Key is used for one call, never stored.</div>'
        + '<input type="password" id="stripe-sk" placeholder="sk_live_..." autocomplete="off" style="width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:monospace;margin-bottom:6px;box-sizing:border-box;">'
        + '<div style="font-size:11px;color:var(--text-light);margin-bottom:10px;">Get it: <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">dashboard.stripe.com/apikeys</a> → reveal "Secret key"</div>'
        + '<button onclick="Stripe.autoCreateLink()" style="background:#635bff;color:#fff;border:none;padding:10px 16px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;width:100%;">Create Payment Link automatically</button>'
        + '</div>'
        + '<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:12px;color:var(--text-light);">Or paste an existing link manually ▾</summary>'
        + '<div style="margin-top:8px;display:flex;gap:8px;">'
        + '<input type="text" id="stripe-base-link" placeholder="https://buy.stripe.com/..." style="flex:1;padding:9px;border:1px solid var(--border);border-radius:6px;font-size:13px;">'
        + '<button onclick="var k=document.getElementById(\'stripe-base-link\').value.trim();if(!k){UI.toast(\'Paste a link first\',\'error\');return;}if(!/^https:\\/\\/buy\\.stripe\\.com\\//.test(k)){UI.toast(\'Must be a buy.stripe.com link\',\'error\');return;}localStorage.setItem(\'bm-stripe-base-link\',k);if(typeof Stripe!==\'undefined\'&&Stripe._pushBaseLinkToTenant)Stripe._pushBaseLinkToTenant(k);UI.toast(\'Stripe connected ✅\');loadPage(\'settings\');" style="background:var(--green-dark);color:#fff;border:none;padding:9px 16px;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer;">Save</button>'
        + '</div></details>';
    }
    html += '</div>';

    // ── Dialpad ──
    var dialpadKey = localStorage.getItem('bm-dialpad-key') || '';
    var dialpadOk = dialpadKey.length > 10;
    html += apiKeyHeader({
        ok: dialpadOk,
        title: 'Dialpad Phone / SMS',
        emoji: '📞',
        iconBg: '#7A49D6',
        okText: '✅ Connected — calls & texts log automatically',
        warnText: '⚠️ Not connected — paste your Dialpad API token'
      })
      + '<div style="margin-bottom:8px;"><input type="password" id="dialpad-key" value="' + dialpadKey + '" placeholder="dp_api_xxxxxxxxxxxx" style="width:100%;padding:10px;border:2px solid ' + (dialpadOk ? 'var(--green-light)' : 'var(--border)') + ';border-radius:8px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button onclick="var k=document.getElementById(\'dialpad-key\').value.trim();if(!k){UI.toast(\'Paste your token first\',\'error\');return;}localStorage.setItem(\'bm-dialpad-key\',k);localStorage.setItem(\'bm-receptionist-settings\',JSON.stringify({connected:true}));if(typeof Dialpad!==\'undefined\'){Dialpad.apiKey=k;}UI.toast(\'Dialpad connected! ✅\');loadPage(\'settings\');" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:14px;cursor:pointer;">Save Token</button>'
      + '<button onclick="SettingsPage._testDialpad()" style="background:#fff;color:var(--text);border:1px solid var(--border);padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px;cursor:pointer;">🔌 Test Connection</button>'
      + (dialpadOk ? '<button onclick="SettingsPage._removeKey(\'bm-dialpad-key\',\'Dialpad\')" style="background:none;border:1px solid var(--border);padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer;">Remove</button>' : '')
      + '</div>'
      + '<div id="dialpad-test-result" style="margin-top:10px;font-size:13px;"></div>'
      + '<p style="font-size:11px;color:var(--text-light);margin-top:8px;">Get token at <a href="https://dialpad.com/accounts/api/keys" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">dialpad.com → API Keys</a>. Also register a 10DLC number for SMS compliance.</p>'
      + '<div style="margin-top:12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;">'
      + '<div style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">Inbound SMS + Call Webhook</div>'
      + '<div style="font-size:12px;color:var(--text-light);margin-bottom:8px;">Add this URL in Dialpad Admin → Automations → Webhooks. Events: <code>sms.received</code>, <code>call.ringing</code>, <code>call.completed</code>, <code>voicemail.created</code>.</div>'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + '<code style="flex:1;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:11px;word-break:break-all;">https://ltpivkqahvplapyagljt.supabase.co/functions/v1/dialpad-webhook</code>'
      + '<button onclick="navigator.clipboard.writeText(\'https://ltpivkqahvplapyagljt.supabase.co/functions/v1/dialpad-webhook\').then(function(){UI.toast(\'Copied!\');}).catch(function(){});" style="padding:6px 12px;background:var(--accent);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">Copy</button>'
      + '</div>'
      + '</div>'
      + '</div>';

    // ── Gusto ──
    var gustoKey = localStorage.getItem('bm-gusto-api-key') || '';
    var gustoOk = gustoKey.length > 10;
    html += apiKeyHeader({
        ok: gustoOk,
        title: 'Gusto Payroll',
        emoji: '💼',
        iconBg: '#F45D22',
        okText: '✅ Connected — payroll export enabled',
        warnText: '⚠️ Not connected — API token optional, CSV export works without it'
      })
      + '<div style="margin-bottom:8px;"><input type="password" id="gusto-key" value="' + gustoKey + '" placeholder="gst_access_token_xxxxxxx (optional)" style="width:100%;padding:10px;border:2px solid ' + (gustoOk ? 'var(--green-light)' : 'var(--border)') + ';border-radius:8px;font-size:14px;box-sizing:border-box;"></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button onclick="var k=document.getElementById(\'gusto-key\').value.trim();if(!k){UI.toast(\'Paste your token first\',\'error\');return;}localStorage.setItem(\'bm-gusto-api-key\',k);UI.toast(\'Gusto connected! ✅\');loadPage(\'settings\');" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:14px;cursor:pointer;">Save Token</button>'
      + '<button onclick="loadPage(\'payroll\');" style="background:none;border:1px solid var(--border);padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer;">Open Payroll</button>'
      + (gustoOk ? '<button onclick="SettingsPage._removeKey(\'bm-gusto-api-key\',\'Gusto\')" style="background:none;border:1px solid var(--border);padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer;">Remove</button>' : '')
      + '</div>'
      + '<p style="font-size:11px;color:var(--text-light);margin-top:8px;">Sign up at <a href="https://gusto.com" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">gusto.com</a> ($40/mo + $6/employee). API token is optional — BM Payroll page exports CSV you upload to Gusto manually each pay period. Get token from Gusto Dev Portal.</p>'
      + '</div>';

    // ── PlantNet / AI Tree ID — API key, lives with other integrations ──
    var _pnKey = localStorage.getItem('bm-plantnet-key') || '';
    var _pnOk = _pnKey.length > 10;
    html += apiKeyHeader({
        ok: _pnOk,
        title: 'PlantNet (AI Tree ID)',
        emoji: '🌿',
        iconBg: '#15803d',
        okText: '✅ Connected — 2nd Opinion button uses this',
        warnText: '⚠️ Not connected — add a key for AI tree ID 2nd Opinion'
      })
      + '<input type="text" id="plantnet-key-input" value="' + UI.esc(_pnKey) + '" placeholder="2b10..." style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;margin-bottom:8px;">'
      + '<div style="display:flex;gap:8px;">'
      + '<button onclick="var v=document.getElementById(\'plantnet-key-input\').value.trim();localStorage.setItem(\'bm-plantnet-key\',v);UI.toast(\'PlantNet key saved ✓\');loadPage(\'settings\');" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:14px;cursor:pointer;">Save Key</button>'
      + (_pnOk ? '<button onclick="SettingsPage._removeKey(\'bm-plantnet-key\',\'PlantNet\')" style="background:none;border:1px solid var(--border);padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer;">Remove</button>' : '')
      + '</div>'
      + '<p style="font-size:11px;color:var(--text-light);margin-top:8px;">Free tier: 500 IDs/day. Sign up at <a href="https://my.plantnet.org/account/doApiKey" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">my.plantnet.org</a>.</p>'
      + '</div>';

    // ── SocialPilot (Webhook OR direct API key) ──
    var spWebhook = localStorage.getItem('bm-socialpilot-webhook') || '';
    var spApiKey = localStorage.getItem('bm-socialpilot-key') || '';
    var spOk = spWebhook.length > 10 || spApiKey.length > 10;
    html += apiKeyHeader({
        ok: spOk,
        title: 'SocialPilot (Social Posting)',
        emoji: '📢',
        iconBg: '#FF6B35',
        okText: '✅ Connected — Media Center can push to social',
        warnText: '⚠️ Not connected — add webhook or API key below'
      })
      + '<div style="font-size:12px;font-weight:600;color:var(--text-light);margin-bottom:4px;">Option A — Zapier / Make Webhook URL <span style="color:var(--green-dark);">(works on any paid SocialPilot plan)</span></div>'
      + '<input type="text" id="sp-webhook" value="' + UI.esc(spWebhook) + '" placeholder="https://hooks.zapier.com/hooks/catch/..." style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box;margin-bottom:10px;">'
      + '<div style="font-size:12px;font-weight:600;color:var(--text-light);margin-bottom:4px;">Option B — SocialPilot API Key <span style="color:var(--text-light);font-weight:400;">(Agency plan only)</span></div>'
      + '<input type="password" id="sp-key" value="' + spApiKey + '" placeholder="sp_xxxxxxxxxxxx" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box;margin-bottom:10px;">'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button onclick="var w=document.getElementById(\'sp-webhook\').value.trim();var k=document.getElementById(\'sp-key\').value.trim();localStorage.setItem(\'bm-socialpilot-webhook\',w);localStorage.setItem(\'bm-socialpilot-key\',k);UI.toast(\'SocialPilot saved ✅\');loadPage(\'settings\');" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:14px;cursor:pointer;">Save</button>'
      + '<button onclick="SettingsPage._testSocialPilot()" style="background:#fff;color:var(--text);border:1px solid var(--border);padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px;cursor:pointer;">🔌 Test</button>'
      + (spOk ? '<button onclick="if(confirm(\'Remove SocialPilot?\')){localStorage.removeItem(\'bm-socialpilot-webhook\');localStorage.removeItem(\'bm-socialpilot-key\');loadPage(\'settings\');}" style="background:none;border:1px solid var(--border);padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer;">Remove</button>' : '')
      + '</div>'
      + '<div id="sp-test-result" style="margin-top:10px;font-size:13px;"></div>'
      + '<p style="font-size:11px;color:var(--text-light);margin-top:8px;">No API tab in SocialPilot? Use Option A: create a free <a href="https://zapier.com/apps/webhook/integrations" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">Zapier Webhook → SocialPilot</a> Zap. Paste the "Catch Hook" URL above. POST payload: <code style="background:var(--bg);padding:1px 4px;border-radius:3px;">{caption, imageUrl, platforms}</code>.</p>'
      + '</div>';

    // ── Google Business Profile (GMB) ──
    var gmbClientId = localStorage.getItem('bm-gmb-client-id') || '';
    var gmbToken = localStorage.getItem('bm-gmb-access-token') || '';
    var gmbOk = gmbToken.length > 20;
    html += apiKeyHeader({
        ok: gmbOk,
        title: 'Google Business Profile',
        emoji: '🔵',
        iconBg: '#4285F4',
        okText: '✅ Connected — reviews, posts, hours can sync',
        warnText: '⚠️ Not connected — needs OAuth setup'
      })
      + '<div style="background:#f0f7ff;border-left:3px solid #4285F4;padding:10px 12px;border-radius:0 6px 6px 0;font-size:12px;color:#1e3a5f;margin-bottom:12px;line-height:1.5;">'
      + '<strong>One-time Google Cloud setup (≈10 min):</strong><br>'
      + '1. Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style="color:#4285F4;font-weight:600;">Google Cloud → Credentials</a><br>'
      + '2. Enable "Business Profile API" (may require Google approval, 2–7 days)<br>'
      + '3. Create OAuth 2.0 Client (Web) — add redirect: <code style="background:#fff;padding:1px 4px;border-radius:3px;font-size:11px;">https://branchmanager.app/</code><br>'
      + '4. Paste the Client ID below'
      + '</div>'
      + '<div style="font-size:12px;font-weight:600;color:var(--text-light);margin-bottom:4px;">OAuth Client ID</div>'
      + '<input type="text" id="gmb-client-id" value="' + UI.esc(gmbClientId) + '" placeholder="xxxxx.apps.googleusercontent.com" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box;margin-bottom:10px;">'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button onclick="var c=document.getElementById(\'gmb-client-id\').value.trim();localStorage.setItem(\'bm-gmb-client-id\',c);UI.toast(\'Client ID saved ✓\');loadPage(\'settings\');" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:14px;cursor:pointer;">Save Client ID</button>'
      + '<button onclick="SettingsPage._gmbConnect()" ' + (gmbClientId ? '' : 'disabled') + ' style="background:' + (gmbClientId ? '#4285F4' : '#ccc') + ';color:#fff;border:none;padding:10px 20px;border-radius:6px;font-weight:700;font-size:14px;cursor:' + (gmbClientId ? 'pointer' : 'not-allowed') + ';">🔗 Connect Google</button>'
      + (gmbOk ? '<button onclick="if(confirm(\'Disconnect Google Business?\')){localStorage.removeItem(\'bm-gmb-access-token\');localStorage.removeItem(\'bm-gmb-refresh-token\');loadPage(\'settings\');}" style="background:none;border:1px solid var(--border);padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer;">Disconnect</button>' : '')
      + '</div>'
      + '<p style="font-size:11px;color:var(--text-light);margin-top:8px;">Once connected, BM will auto-request review responses, sync business hours, and post job photos to your GMB feed.</p>'
      + '</div>';

    // ── SendJim — Direct Mail ──
    html += '<div style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px;">'
      + (typeof SendJim !== 'undefined' ? SendJim.renderSettings() : '<p style="font-size:13px;color:var(--text-light);">SendJim module not loaded.</p>')
      + '</div>';

    // ═══ close API Keys collapsible ═══
    html += '</div></details>';

    // v398: Integrations content (above) flows directly into Advanced now —
    // no separate meta-group close. The line below opens Advanced.

    // (Advanced is already open from above — this is the second cluster.)

    // v395: Archive entry — moved here from sidebar. Click to open the
    // archived-records page (clients/quotes/jobs/invoices/requests).
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">'
      +   '<div>'
      +     '<div style="font-size:14px;font-weight:700;color:var(--text);">Archive</div>'
      +     '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">Browse archived records (clients, quotes, jobs, invoices, requests). Restore or delete permanently.</div>'
      +   '</div>'
      +   '<button onclick="loadPage(\'archive\')" class="btn btn-outline" style="font-size:12px;flex-shrink:0;">Open Archive &rarr;</button>'
      + '</div>';

    // ═══ GROUP: Database & Storage (collapsible) ═══
    html += '<details style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">'
      + '<summary style="padding:14px 18px;cursor:pointer;font-size:15px;font-weight:700;color:var(--text);list-style:none;display:flex;justify-content:space-between;align-items:center;">'
      +   '<span><i data-lucide="database" class="li li-hdr"></i> Database & Storage</span>'
      +   '<span style="font-size:11px;color:var(--text-light);font-weight:500;">tap to expand</span>'
      + '</summary>'
      + '<div style="padding:16px 20px;border-top:1px solid var(--border);">';

    // Photo Storage info + migration tool
    var localPhotoStats = (function() {
      var total = 0, base64 = 0;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf('bm-photos-') !== 0) continue;
        try {
          var arr = JSON.parse(localStorage.getItem(k)) || [];
          arr.forEach(function(p) {
            total++;
            if (p.url && p.url.indexOf('data:') === 0) base64++;
          });
        } catch(e) {}
      }
      return { total: total, base64: base64 };
    })();
    html += '<div style="background:#f0f7ff;border-radius:12px;padding:14px 18px;border:1px solid #b3d4f5;margin-bottom:16px;">'
      + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">'
      + '<span style="font-size:22px;">📸</span>'
      + '<div style="font-size:13px;color:#1a5276;">'
      + '<strong>Photo Storage</strong> — Bucket <code style="background:#d6eaf8;padding:1px 5px;border-radius:4px;">job-photos</code>. New photos sync across devices automatically.'
      + '</div></div>'
      + '<div style="font-size:12px;color:#1a5276;margin-bottom:10px;">'
      + 'Local photos: <strong>' + localPhotoStats.total + '</strong> total, <strong>' + localPhotoStats.base64 + '</strong> still base64 (device-only).'
      + '</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:8px;">'
      + '<button class="btn btn-primary" onclick="SettingsPage._migratePhotos()" ' + (localPhotoStats.base64 === 0 ? 'disabled' : '') + ' style="font-size:13px;">'
      + (localPhotoStats.base64 === 0 ? '✓ All local photos synced' : '⬆ Upload ' + localPhotoStats.base64 + ' local photos')
      + '</button>'
      + '<button class="btn btn-outline" onclick="SettingsPage._migrateJobberPhotos()" style="font-size:13px;">⬆ Move Jobber quote photos to bucket</button>'
      + '</div>'
      + '<div style="font-size:11px;color:#1a5276;margin-top:8px;font-style:italic;">Jobber import stored ~612 photos as base64 inside quote line items. Moving them to the bucket shrinks the DB and speeds up quote loads.</div>'
      + '</div>';

    // Stripe / Dialpad / SendJim cards removed from Database & Storage —
    // already live in the 🔌 API Keys & Integrations collapsible at top of Settings.
    // CustomFields / Checklists / EmailTemplates also removed — redundant with
    // the Templates & Automation collapsible further down.

    // Crew Performance link moved to USER meta-group (top of page).

    // Sync from Cloud
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;">'
      + '<div><h3 style="margin-bottom:4px;">Cloud Sync</h3>'
      + '<p style="font-size:13px;color:var(--text-light);margin:0;">Pull latest data from Supabase to this device</p></div>'
      + '<button class="btn btn-primary" onclick="SettingsPage.syncNow(this)">Sync Now</button>'
      + '</div></div>';

    // Supabase Connection
    var isConnected = (typeof SupabaseDB !== 'undefined' && SupabaseDB.ready) || stats.totalClients > 100;
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="margin-bottom:8px;">Database Connection</h3>';
    if (isConnected) {
      html += '<div style="display:inline-block;padding:6px 12px;background:#e8f5e9;border-radius:8px;font-size:13px;font-weight:600;color:#2e7d32;margin-bottom:12px;">Connected to Supabase</div>'
        + '<p style="font-size:13px;color:var(--text-light);margin-bottom:12px;">Project: ltpivkqahvplapyagljt (West US Oregon)</p>'
        + '<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--green-dark);margin-bottom:8px;">🔒 Client-facing RLS Policies (required for approve.html &amp; pay.html)</summary>'
        + '<p style="font-size:12px;color:var(--text-light);margin-bottom:8px;">Run this SQL once in your <a href="https://supabase.com/dashboard/project/ltpivkqahvplapyagljt/sql" target="_blank" rel="noopener noreferrer" style="color:var(--green-dark);">Supabase SQL Editor</a> to allow clients to view &amp; approve quotes and pay invoices:</p>'
        + '<pre style="background:#1e2128;color:#a8d8a8;padding:14px;border-radius:8px;font-size:11px;overflow:auto;white-space:pre;line-height:1.6;">'
        + '-- Safe to re-run: drops existing policies first\n'
        + 'DROP POLICY IF EXISTS "Anon read quotes" ON quotes;\n'
        + 'DROP POLICY IF EXISTS "Anon update quote status" ON quotes;\n'
        + 'DROP POLICY IF EXISTS "Anon read invoices" ON invoices;\n'
        + 'DROP POLICY IF EXISTS "Anon read clients" ON clients;\n'
        + 'DROP POLICY IF EXISTS "Anon insert requests" ON requests;\n\n'
        + '-- Allow anonymous clients to read non-draft quotes (for approve.html)\n'
        + 'CREATE POLICY "Anon read quotes"\n'
        + '  ON quotes FOR SELECT TO anon\n'
        + '  USING (status &lt;&gt; \'draft\');\n\n'
        + '-- Allow anonymous clients to approve/request changes on sent quotes\n'
        + 'CREATE POLICY "Anon update quote status"\n'
        + '  ON quotes FOR UPDATE TO anon\n'
        + '  USING (status IN (\'sent\', \'awaiting\'))\n'
        + '  WITH CHECK (status IN (\'approved\', \'awaiting\'));\n\n'
        + '-- Allow anonymous clients to read non-draft invoices (for pay.html)\n'
        + 'CREATE POLICY "Anon read invoices"\n'
        + '  ON invoices FOR SELECT TO anon\n'
        + '  USING (status &lt;&gt; \'draft\');\n\n'
        + '-- Allow anonymous clients to read client portal data (for client.html)\n'
        + 'CREATE POLICY "Anon read clients"\n'
        + '  ON clients FOR SELECT TO anon\n'
        + '  USING (true);\n\n'
        + '-- Allow anonymous form submissions (for book.html)\n'
        + 'CREATE POLICY "Anon insert requests"\n'
        + '  ON requests FOR INSERT TO anon\n'
        + '  WITH CHECK (true);\n\n'
        + '-- Storage bucket for job photos\n'
        + 'INSERT INTO storage.buckets (id, name, public)\n'
        + 'VALUES (\'job-photos\', \'job-photos\', true)\n'
        + 'ON CONFLICT (id) DO NOTHING;\n\n'
        + '-- Allow public read of job photos\n'
        + 'DROP POLICY IF EXISTS "Public read job photos" ON storage.objects;\n'
        + 'CREATE POLICY "Public read job photos" ON storage.objects\n'
        + '  FOR SELECT USING (bucket_id = \'job-photos\');\n\n'
        + '-- Allow authenticated/anon insert to job-photos\n'
        + 'DROP POLICY IF EXISTS "Anon upload job photos" ON storage.objects;\n'
        + 'CREATE POLICY "Anon upload job photos" ON storage.objects\n'
        + '  FOR INSERT WITH CHECK (bucket_id = \'job-photos\');\n\n'
        + '-- Allow delete own photos\n'
        + 'DROP POLICY IF EXISTS "Anon delete job photos" ON storage.objects;\n'
        + 'CREATE POLICY "Anon delete job photos" ON storage.objects\n'
        + '  FOR DELETE USING (bucket_id = \'job-photos\');</pre>'
        + '<button onclick="SettingsPage._copyRlsSql()" style="margin-top:8px;padding:6px 14px;background:var(--green-dark);color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;">Copy SQL</button>'
        + '</details>'
        + '<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--green-dark);margin-bottom:8px;">🗄️ Add Missing Columns (run once on live DB)</summary>'
        + '<p style="font-size:12px;color:var(--text-light);margin-bottom:8px;">If your Supabase tables were created before these columns were added, run this SQL to add them (safe — IF NOT EXISTS means it won\'t fail if already present):</p>'
        + '<pre style="background:#1e2128;color:#a8d8a8;padding:14px;border-radius:8px;font-size:11px;overflow:auto;white-space:pre;line-height:1.6;">'
        + '-- Invoices\n'
        + 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_email TEXT;\n'
        + 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_phone TEXT;\n'
        + 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2) DEFAULT 0;\n'
        + 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS issued_date DATE;\n'
        + 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_payment_url TEXT;\n'
        + 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_link_sent TIMESTAMPTZ;\n'
        + 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_link_email TEXT;\n'
        + 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;\n\n'
        + '-- Jobs\n'
        + 'ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_email TEXT;\n'
        + 'ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_phone TEXT;\n'
        + 'ALTER TABLE jobs ADD COLUMN IF NOT EXISTS invoice_id TEXT;\n'
        + 'ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_date DATE;\n\n'
        + '-- Quotes\n'
        + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_email TEXT;\n'
        + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_phone TEXT;\n'
        + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS expires_at DATE;\n'
        + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_required BOOLEAN DEFAULT false;\n'
        + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_due DECIMAL(10,2) DEFAULT 0;\n'
        + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN DEFAULT false;\n'
        + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;\n'
        + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_changes TEXT;</pre>'
        + '<button onclick="SettingsPage._copyColumnSql()" style="margin-top:8px;padding:6px 14px;background:var(--green-dark);color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;">Copy SQL</button>'
        + '</details>'
        + '<details style="margin-top:8px;"><summary style="cursor:pointer;font-size:13px;font-weight:600;color:var(--green-dark);margin-bottom:8px;">💸 Create Expenses Table (run once)</summary>'
        + '<p style="font-size:12px;color:var(--text-light);margin-bottom:8px;">If you haven\'t run the full schema yet, run this to create the expenses table and enable cloud sync for expenses:</p>'
        + '<pre id="expenses-sql-block" style="background:#1e2128;color:#a8d8a8;padding:14px;border-radius:8px;font-size:11px;overflow:auto;white-space:pre;line-height:1.6;">'
        + 'CREATE TABLE IF NOT EXISTS expenses (\n'
        + '  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n'
        + '  date TIMESTAMPTZ DEFAULT now(),\n'
        + '  amount NUMERIC(10,2) DEFAULT 0,\n'
        + '  category TEXT,\n'
        + '  description TEXT,\n'
        + '  vendor TEXT,\n'
        + '  job TEXT,\n'
        + '  job_id TEXT,\n'
        + '  receipt_url TEXT,\n'
        + '  notes TEXT,\n'
        + '  employee TEXT,\n'
        + '  created_at TIMESTAMPTZ DEFAULT now(),\n'
        + '  updated_at TIMESTAMPTZ DEFAULT now()\n'
        + ');\n\n'
        + 'ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;\n\n'
        + 'DROP POLICY IF EXISTS "Allow all for authenticated" ON expenses;\n'
        + 'CREATE POLICY "Allow all for authenticated"\n'
        + '  ON expenses FOR ALL\n'
        + '  USING (true);\n\n'
        + 'CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);\n'
        + 'CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);</pre>'
        + '<button onclick="SettingsPage._copyExpensesSql()" style="margin-top:8px;padding:6px 14px;background:var(--green-dark);color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;">Copy SQL</button>'
        + '</details>';
    } else {
      html += '<p style="font-size:13px;color:var(--text-light);margin-bottom:16px;">Connect to Supabase for cloud sync, multi-device access, and team features.</p>'
        + '<div style="display:inline-block;padding:6px 12px;background:#fff3e0;border-radius:8px;font-size:13px;font-weight:600;color:#e65100;margin-bottom:12px;">Local Storage Mode — data lives on this device only</div>'
        + UI.formField('Supabase URL', 'text', 'sb-url', '', { placeholder: 'https://your-project.supabase.co' })
        + UI.formField('Supabase Anon Key', 'text', 'sb-key', '', { placeholder: 'eyJhbGciOiJIUzI1NiIs...' })
        + '<button class="btn btn-primary" onclick="SettingsPage.connectSupabase()">Connect to Supabase</button>';
    }
    html += '</div>';

    // ═══ /GROUP: Database & Storage ═══
    html += '</div></details>';

    // === AI ASSISTANT TOGGLE ===
    // Turn off auto-AI tree ID (for poor service or preference). When off, photo upload still
    // works but the 🤖 Run AI button on each tree is the only way to fire the call.
    var _aiOn = localStorage.getItem('bm-ai-enabled') !== '0';
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      +   '<div>'
      +     '<div style="font-size:14px;font-weight:700;color:var(--text);">🤖 AI Tree Identification</div>'
      +     '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">Auto-fill species, DBH, condition when you upload a tree photo. Turn off if offline or if you\'d rather enter manually. You can still tap 🤖 Run AI on any tree to fire it on-demand.</div>'
      +   '</div>'
      +   '<label style="position:relative;display:inline-block;width:48px;height:26px;cursor:pointer;flex-shrink:0;">'
      +     '<input type="checkbox" onchange="localStorage.setItem(\'bm-ai-enabled\',this.checked?\'1\':\'0\');UI.toast(this.checked?\'AI ON\':\'AI OFF\');loadPage(\'settings\')"' + (_aiOn ? ' checked' : '') + ' style="opacity:0;width:0;height:0;">'
      +     '<span style="position:absolute;inset:0;background:' + (_aiOn ? 'var(--green-dark)' : '#cbd5e1') + ';border-radius:26px;transition:.2s;"></span>'
      +     '<span style="position:absolute;top:3px;left:' + (_aiOn ? '25px' : '3px') + ';width:20px;height:20px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.2);"></span>'
      +   '</label>'
      + '</div>';

    // T&M Pricing Rates moved into the Quote & Invoice Defaults section above.

    // v391: Cloud sync runs automatically on every localStorage write of a
    // TRACKED key + every app load (CloudKeys._wrap + realtime listener).
    // The previous big card with Export/Import was legacy from before cloud
    // sync existed — replaced with a quiet status row that only appears if
    // sync is OFF (e.g. tenant_settings table missing).
    var ckOn = typeof CloudKeys !== 'undefined' && CloudKeys.ready;
    if (!ckOn) {
      html += '<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#92400e;">'
        +   '<strong>Settings sync is off.</strong> Cloud sync requires Supabase + the <code>tenant_settings</code> table. Until it\'s on, settings stay on this device only.'
        + '</div>';
    }

    // Dark Mode + Navigation Style moved to USER meta-group (top of page).

    // ═══ GROUP: Data Import / Export / Backup (collapsible) ═══
    html += '<details style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">'
      + '<summary style="padding:14px 18px;cursor:pointer;font-size:15px;font-weight:700;color:var(--text);list-style:none;display:flex;justify-content:space-between;align-items:center;">'
      +   '<span><i data-lucide="download" class="li li-hdr"></i> Data Import / Export / Backup</span>'
      +   '<span style="font-size:11px;color:var(--text-light);font-weight:500;">tap to expand</span>'
      + '</summary>'
      + '<div style="padding:16px 20px;border-top:1px solid var(--border);">';

    // Import from previous system
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="margin-bottom:8px;">Import from previous system</h3>'
      + '<p style="font-size:13px;color:var(--text-light);margin-bottom:16px;">Export CSVs from previous system (Clients → More Actions → Export) and import them here.</p>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div>'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Clients CSV</label>'
      + '<input type="file" id="import-clients" accept=".csv" onchange="SettingsPage.importFile(\'clients\', this)">'
      + '</div>'
      + '<div>'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Jobs CSV</label>'
      + '<input type="file" id="import-jobs" accept=".csv" onchange="SettingsPage.importFile(\'jobs\', this)">'
      + '</div>'
      + '<div>'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Invoices CSV</label>'
      + '<input type="file" id="import-invoices" accept=".csv" onchange="SettingsPage.importFile(\'invoices\', this)">'
      + '</div>'
      + '<div>'
      + '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Quotes CSV</label>'
      + '<input type="file" id="import-quotes" accept=".csv" onchange="SettingsPage.importFile(\'quotes\', this)">'
      + '</div>'
      + '</div>'
      + '<div id="import-status" style="margin-top:12px;font-size:13px;color:var(--green-dark);"></div>'
      + '</div>';

    // Data Management
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid #ffcdd2;margin-bottom:16px;">'
      + '<h3 style="color:var(--red);margin-bottom:8px;">Data Management</h3>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">'
      + '<button class="btn btn-outline" onclick="SettingsPage.deduplicateTags()">Fix Duplicate Tags</button>'
      + '<button class="btn btn-outline" onclick="SettingsPage.reconcileOrphans()">🔗 Reconcile Orphan Records</button>'
      + '<button class="btn btn-outline" onclick="SettingsPage.auditAIData()">🔍 Audit AI-Created Data</button>'
      + '<button class="btn" style="background:var(--red);color:#fff;" onclick="SettingsPage.clearAll()">Clear All Data</button>'
      + '</div>'
      + '<div id="audit-result" style="font-size:12px;color:var(--text-light);">"Audit AI-Created Data" lists every row any Claude session has added to your DB — clients/quotes/jobs/invoices — so you can spot-check and delete fakes.</div>'
      + '</div>';

    // ═══ /GROUP: Data Import / Export / Backup ═══
    html += '</div></details>';

    // ═══ GROUP: Security + Admin (collapsible) ═══
    html += '<details style="background:var(--white);border:1px solid var(--border);border-radius:12px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">'
      + '<summary style="padding:14px 18px;cursor:pointer;font-size:15px;font-weight:700;color:var(--text);list-style:none;display:flex;justify-content:space-between;align-items:center;">'
      +   '<span><i data-lucide="lock" class="li li-hdr"></i> Security + Admin</span>'
      +   '<span style="font-size:11px;color:var(--text-light);font-weight:500;">tap to expand</span>'
      + '</summary>'
      + '<div style="padding:16px 20px;border-top:1px solid var(--border);">';

    // Security
    var _bioSupported = typeof Biometric !== 'undefined' && Biometric.isSupported();
    var _bioOn = typeof Biometric !== 'undefined' && Biometric.isEnabled();
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="margin-bottom:12px;">🔒 Security</h3>'
      + '<div style="display:grid;gap:12px;">'
      // Biometric lock (Face ID / Touch ID)
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:8px;gap:10px;">'
      +   '<div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13px;">🔐 Face ID / Touch ID Lock</div>'
      +   '<div style="font-size:12px;color:var(--text-light);">' + (_bioSupported ? 'Require biometric auth when opening the app' : 'Not supported on this browser/device') + '</div></div>'
      +   (_bioSupported
          ? (_bioOn
              ? '<button class="btn btn-outline" style="font-size:12px;" onclick="if(confirm(\'Disable biometric lock?\')){Biometric.disable();loadPage(\'settings\');}">Disable</button>'
              : '<button class="btn btn-primary" style="font-size:12px;" onclick="Biometric.register().then(function(ok){if(ok)loadPage(\'settings\');});">Enable</button>')
          : '<span style="color:var(--text-light);font-size:12px;">Unavailable</span>')
      + '</div>'
      // Session timeout
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:8px;">'
      + '<div><div style="font-weight:600;font-size:13px;">Session Timeout</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Auto-logout after 30 days of inactivity</div></div>'
      + '<span style="color:var(--green-dark);font-weight:700;font-size:13px;">✓ Active</span></div>'
      // Audit logging
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:8px;">'
      + '<div><div style="font-weight:600;font-size:13px;">Audit Logging</div>'
      + '<div style="font-size:12px;color:var(--text-light);">All data changes are logged with user, timestamp, and action</div></div>'
      + '<button class="btn btn-outline" style="font-size:12px;" onclick="SettingsPage.showAuditLog()">View Log</button></div>'
      // Secure logout
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:8px;">'
      + '<div><div style="font-weight:600;font-size:13px;">Secure Logout</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Clears cached data and service worker on logout</div></div>'
      + '<span style="color:var(--green-dark);font-weight:700;font-size:13px;">✓ Active</span></div>'
      // Change password
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:8px;">'
      + '<div><div style="font-weight:600;font-size:13px;">Change Password</div>'
      + '<div style="font-size:12px;color:var(--text-light);">Update login password for local auth</div></div>'
      + '<button class="btn btn-outline" style="font-size:12px;" onclick="SettingsPage.changePassword()">Change</button></div>'
      // RLS status
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#fff3e0;border-radius:8px;border:1px solid #ffe0b2;">'
      + '<div><div style="font-weight:600;font-size:13px;color:#e65100;">⚠️ Database RLS Policies</div>'
      + '<div style="font-size:12px;color:#bf360c;">Run <code>migrate-rls.sql</code> in Supabase SQL Editor to restrict anon key access</div></div>'
      + '<a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="font-size:12px;">Open Supabase</a></div>'
      // 2FA
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#fff3e0;border-radius:8px;border:1px solid #ffe0b2;">'
      + '<div><div style="font-weight:600;font-size:13px;color:#e65100;">⚠️ Two-Factor Authentication</div>'
      + '<div style="font-size:12px;color:#bf360c;">Enable 2FA in Supabase Auth settings for extra protection</div></div>'
      + '<a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="font-size:12px;">Enable</a></div>'
      + '</div></div>';

    // Admin Tools
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">'
      + '<h3 style="margin-bottom:14px;">Admin Tools</h3>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
      + '<button onclick="loadPage(\'permissions\')" style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;cursor:pointer;text-align:left;font-size:13px;font-weight:600;color:var(--text);"><span style="font-size:18px;">🛡</span><div>Permissions & Roles<div style="font-size:11px;font-weight:400;color:var(--text-light);margin-top:2px;">RBAC roles, 25 permissions</div></div></button>'
      + '<button onclick="loadPage(\'customfields\')" style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;cursor:pointer;text-align:left;font-size:13px;font-weight:600;color:var(--text);"><span style="font-size:18px;">🔧</span><div>Custom Fields<div style="font-size:11px;font-weight:400;color:var(--text-light);margin-top:2px;">Add fields to clients, jobs, quotes</div></div></button>'
      + '<button onclick="loadPage(\'backup\')" style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;cursor:pointer;text-align:left;font-size:13px;font-weight:600;color:var(--text);"><span style="font-size:18px;">💾</span><div>Backup & Restore<div style="font-size:11px;font-weight:400;color:var(--text-light);margin-top:2px;">Export/import all data</div></div></button>'
      + '<button onclick="loadPage(\'import\')" style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--bg);border:1px solid var(--border);border-radius:10px;cursor:pointer;text-align:left;font-size:13px;font-weight:600;color:var(--text);"><span style="font-size:18px;">📥</span><div>Import Data<div style="font-size:11px;font-weight:400;color:var(--text-light);margin-top:2px;">CSV, Jobber, bulk import</div></div></button>'
      + '</div></div>';

    // ═══ /GROUP: Security + Admin ═══
    html += '</div></details>';

    // Templates & Automation moved up into the BUSINESS meta-group.

    // ─── Cloud Health (v550, Apr 30) ─────────────────────────────────────
    // Built after the "fleet stuck" + quote #496 silent-cloud-failure
    // incidents. One-click diagnostic for: Supabase auth state, per-table
    // read counts, queued writes. Anything red here = something is broken.
    html += cardOpen('Cloud Health', { icon: 'activity' })
      +     '<div id="cloud-health-out" style="font-size:13px;color:var(--text-light);padding:6px 0 12px;">Click "Run diagnostic" below.</div>'
      +     '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      +       '<button onclick="SettingsPage._runCloudHealth()" class="btn btn-primary" style="font-size:12px;">Run diagnostic</button>'
      +       '<button onclick="if(typeof CloudSync!==\'undefined\'&&CloudSync.refresh)CloudSync.refresh()" class="btn btn-outline" style="font-size:12px;">Force re-sync</button>'
      +       '<button onclick="if(confirm(\'Sign out and re-sign in to restore cloud sync? Local data preserved.\'))Auth.logout()" class="btn btn-outline" style="font-size:12px;">Re-sign in</button>'
      +     '</div>'
      + cardClose();

    // ═══ close ADVANCED meta-group ═══
    html += groupClose();

    // About — uses cardOpen for visual parity with the rest
    html += cardOpen('About Branch Manager', { icon: 'info' })
      +   '<div style="font-size:13px;color:var(--text-light);line-height:1.8;">'
      +     '<div><strong>Version:</strong> v' + (typeof BUNDLED_VERSION !== 'undefined' ? BUNDLED_VERSION : '?') + '</div>'
      +     '<div><strong>Stack:</strong> Vanilla JS + Supabase + Stripe + MapLibre</div>'
      +     '<div><strong>Storage:</strong> localStorage + Supabase cloud sync</div>'
      +     '<div><strong>PWA:</strong> Installable, offline capable</div>'
      +     '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">'
      +       '<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px;">Support</div>'
      +       '<div><a href="tel:9146477276" style="color:var(--accent);text-decoration:none;">(914) 647-7276</a></div>'
      +       '<div><a href="mailto:branchmanagerapp@gmail.com" style="color:var(--accent);text-decoration:none;">branchmanagerapp@gmail.com</a></div>'
      +     '</div>'
      +     '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:12px;">Built for ' + BM_CONFIG.companyName + '. Replaces previous system ($50-130/mo) with a $0/mo custom solution.</div>'
      +   '</div>'
      + cardClose();

    html += '</div>';
    return html;
  },

  // Cloud Health diagnostic — renders SettingsPage's #cloud-health-out box
  // with the result of CloudSync.diagnose(). One row per check, traffic-light
  // colored. Built to surface "fleet stuck"-style silent failures in one click.
  _runCloudHealth: function() {
    var out = document.getElementById('cloud-health-out');
    if (!out) return;
    if (typeof CloudSync === 'undefined' || !CloudSync.diagnose) {
      out.innerHTML = '<span style="color:#c62828;">CloudSync not loaded.</span>';
      return;
    }
    out.innerHTML = '<em>Probing cloud…</em>';
    CloudSync.diagnose().then(function(s) {
      function row(label, val, color) {
        return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">'
          + '<span style="color:var(--text-light);">' + label + '</span>'
          + '<span style="color:' + (color || 'var(--text)') + ';font-weight:600;text-align:right;max-width:60%;word-break:break-word;">' + val + '</span>'
          + '</div>';
      }
      var html = '';
      // Auth state — most important, top
      html += '<div style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Auth state</div>';
      var sess = s.supabaseSession;
      if (sess) {
        var expColor = sess.expiresInMin == null ? 'var(--text)' : (sess.expiresInMin > 60 ? '#2e7d32' : (sess.expiresInMin > 0 ? '#a37200' : '#c62828'));
        html += row('Supabase session', '✅ ' + (sess.email || sess.userId), '#2e7d32');
        if (sess.expiresInMin != null) html += row('Session expires in', sess.expiresInMin + ' min', expColor);
      } else {
        html += row('Supabase session', '❌ none — writes will be RLS-rejected', '#c62828');
      }
      html += row('BM session (local)', s.bmUser ? (s.bmUser.email + ' · ' + (s.bmUser.role || 'owner')) : '(none)', s.bmUser ? 'var(--text)' : '#a37200');
      html += row('Tenant id', s.tenantId || '(none)', s.tenantId ? 'var(--text)' : '#a37200');

      // Per-table reads
      html += '<div style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;margin:14px 0 6px;">Cloud reads (rows visible to this session)</div>';
      Object.keys(s.tableCounts).forEach(function(t) {
        var c = s.tableCounts[t];
        var col = c.error ? '#c62828' : (c.count === 0 ? '#a37200' : '#2e7d32');
        var val = c.error ? '⚠ ' + c.error.slice(0, 48) : (c.count + ' rows');
        html += row(t, val, col);
      });

      // Queue
      html += '<div style="font-size:11px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.06em;margin:14px 0 6px;">Pending writes</div>';
      var qCol = s.queueDepth === 0 ? '#2e7d32' : (s.queueDepth > 5 ? '#c62828' : '#a37200');
      html += row('Queue depth', s.queueDepth + ' op' + (s.queueDepth === 1 ? '' : 's'), qCol);
      if (s.queueSample.length) {
        s.queueSample.forEach(function(op) {
          html += row(op.method + ' ' + op.table, '#' + (op.id||'').slice(-6) + ' · status ' + (op.status||'?'), '#a37200');
        });
      }
      if (s.errors.length) {
        html += '<div style="margin-top:14px;padding:8px 12px;background:#fef2f2;border-radius:6px;color:#991b1b;font-size:12px;">' + s.errors.join('<br>') + '</div>';
      }
      html += '<div style="margin-top:12px;font-size:11px;color:var(--text-light);">Probed at ' + new Date(s.checkedAt).toLocaleTimeString() + '</div>';
      out.innerHTML = html;
    }).catch(function(e) {
      out.innerHTML = '<span style="color:#c62828;">Diagnostic error: ' + (e && e.message) + '</span>';
    });
  },

  // Make every settings card collapsible — idempotent, runs after render.
  _initCollapse: function() {
    var content = document.querySelector('.content') || document.getElementById('content');
    if (!content) return;
    var cards = content.querySelectorAll('div[style*="background:var(--white)"]');
    Array.prototype.forEach.call(cards, function(card) {
      if (card.dataset.bmColl) return;
      var h3 = card.querySelector(':scope > h3, :scope > div > h3');
      if (!h3) return;
      card.dataset.bmColl = '1';
      var label = h3.textContent.trim().substring(0, 40);
      var key = 'bm-settings-coll-' + label.replace(/[^a-z0-9]/gi, '_').toLowerCase();

      // Arrow indicator
      var arrow = document.createElement('span');
      arrow.className = 'bm-coll-arrow';
      arrow.style.cssText = 'margin-left:auto;transition:transform .2s;display:inline-block;font-size:14px;color:var(--text-light);padding-left:8px;';
      arrow.textContent = '▾';

      // The clickable header is either h3 itself or its parent (flex row w/ Save button)
      var header = (h3.parentElement && h3.parentElement !== card && h3.parentElement.children.length > 1)
        ? h3.parentElement
        : h3;
      header.appendChild(arrow);
      header.style.cursor = 'pointer';
      header.style.userSelect = 'none';

      // Body = all card children after the header element
      var idx = Array.prototype.indexOf.call(card.children, header);
      var body = Array.prototype.slice.call(card.children, idx + 1);

      var collapsed = localStorage.getItem(key) === '1';
      function apply() {
        body.forEach(function(el) { el.style.display = collapsed ? 'none' : ''; });
        arrow.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
      }
      apply();

      header.addEventListener('click', function(e) {
        // Don't toggle if the click target is a Save button / input / link
        var tag = (e.target.tagName || '').toUpperCase();
        if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'A' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        collapsed = !collapsed;
        localStorage.setItem(key, collapsed ? '1' : '0');
        apply();
      });
    });
  },

  _testSocialPilot: function() {
    var webhook = localStorage.getItem('bm-socialpilot-webhook') || '';
    var apiKey = localStorage.getItem('bm-socialpilot-key') || '';
    var result = document.getElementById('sp-test-result');
    if (!webhook && !apiKey) { result.innerHTML = '<span style="color:var(--red);">Save a webhook or key first.</span>'; return; }
    result.innerHTML = '<span style="color:var(--text-light);">Testing…</span>';
    var payload = { caption: 'Branch Manager connection test — ignore', imageUrl: '', platforms: ['test'], test: true };
    var url = webhook || 'https://panel.socialpilot.co/api/v1/ping';
    var headers = { 'Content-Type': 'application/json' };
    if (!webhook && apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload) })
      .then(function(r) { result.innerHTML = r.ok ? '<span style="color:var(--green-dark);">✅ Reached endpoint (status ' + r.status + ')</span>' : '<span style="color:#e07c24;">⚠️ Status ' + r.status + ' — check your webhook/key.</span>'; })
      .catch(function(e) { result.innerHTML = '<span style="color:var(--red);">Network error: ' + UI.esc(String(e.message || e)) + '</span>'; });
  },

  _gmbConnect: function() {
    var clientId = localStorage.getItem('bm-gmb-client-id') || '';
    if (!clientId) { UI.toast('Save your Client ID first', 'error'); return; }
    var redirect = window.location.origin + window.location.pathname;
    var scope = encodeURIComponent('https://www.googleapis.com/auth/business.manage');
    var state = Math.random().toString(36).slice(2);
    localStorage.setItem('bm-gmb-oauth-state', state);
    var url = 'https://accounts.google.com/o/oauth2/v2/auth'
      + '?client_id=' + encodeURIComponent(clientId)
      + '&redirect_uri=' + encodeURIComponent(redirect)
      + '&response_type=token'
      + '&scope=' + scope
      + '&state=' + state
      + '&prompt=consent';
    window.location.href = url;
  },

  // GMB OAuth callback handler — runs on page load if access_token is in URL hash
  _gmbCheckCallback: function() {
    if (!window.location.hash || window.location.hash.indexOf('access_token=') < 0) return;
    try {
      var params = {};
      window.location.hash.substring(1).split('&').forEach(function(kv) {
        var p = kv.split('='); params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
      if (params.access_token) {
        localStorage.setItem('bm-gmb-access-token', params.access_token);
        localStorage.setItem('bm-gmb-token-expires', String(Date.now() + (parseInt(params.expires_in || '3600') * 1000)));
        history.replaceState({}, '', window.location.pathname);
        if (typeof UI !== 'undefined' && UI.toast) UI.toast('✅ Google Business connected');
      }
    } catch (e) { console.warn('GMB OAuth callback parse failed', e); }
  },

  _collapseAll: function(collapse) {
    // v426: rewrote to operate on <details> directly (no localStorage round-trip).
    // Target every <details> on the Settings page that's NOT inside a meta-group
    // header (those are the section accordions we want to leave alone).
    var content = document.querySelector('.content') || document.getElementById('content');
    if (!content) return;
    var detailsList = content.querySelectorAll('details');
    Array.prototype.forEach.call(detailsList, function(d) {
      if (collapse) d.removeAttribute('open');
      else d.setAttribute('open', '');
    });
  },

  connectSupabase: function() {
    var url = document.getElementById('sb-url').value.trim();
    var key = document.getElementById('sb-key').value.trim();
    if (!url || !key) { UI.toast('Enter both Supabase URL and Key', 'error'); return; }
    // Save config
    localStorage.setItem('bm-supabase-url', url);
    localStorage.setItem('bm-supabase-key', key);
    UI.toast('Supabase config saved. Reload to connect.');
  },

  importFile: function(type, input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
      var csv = e.target.result;
      var count = 0;
      var statusEl = document.getElementById('import-status');

      if (type === 'clients') {
        count = DB.importCSV(DB.KEYS.clients, csv, function(row) {
          return {
            name: (row['First name'] || row['Name'] || '') + (row['Last name'] ? ' ' + row['Last name'] : ''),
            company: row['Company name'] || row['Company'] || '',
            phone: row['Phone number'] || row['Phone'] || '',
            email: row['Email'] || row['Email address'] || '',
            address: [row['Street 1'] || row['Street'] || '', row['City'] || '', row['State'] || row['Province'] || '', row['Zip code'] || row['Postal code'] || ''].filter(Boolean).join(', '),
            status: (row['Status'] || 'active').toLowerCase(),
            tags: row['Tags'] ? row['Tags'].split(',').map(function(t){return t.trim();}) : []
          };
        });
      } else if (type === 'jobs') {
        count = DB.importCSV(DB.KEYS.jobs, csv, function(row) {
          return {
            clientName: row['Client name'] || row['Client'] || '',
            jobNumber: parseInt(row['Job number'] || row['#'] || 0),
            property: row['Property'] || row['Address'] || '',
            description: row['Title'] || row['Description'] || '',
            scheduledDate: row['Start date'] || row['Schedule'] || '',
            status: (row['Status'] || 'scheduled').toLowerCase(),
            total: parseFloat(row['Total'] || 0)
          };
        });
      } else if (type === 'invoices') {
        count = DB.importCSV(DB.KEYS.invoices, csv, function(row) {
          return {
            clientName: row['Client name'] || row['Client'] || '',
            invoiceNumber: parseInt(row['Invoice number'] || row['#'] || 0),
            subject: row['Subject'] || 'For Services Rendered',
            dueDate: row['Due date'] || '',
            status: (row['Status'] || 'draft').toLowerCase(),
            total: parseFloat(row['Total'] || 0),
            balance: parseFloat(row['Balance'] || row['Amount owing'] || 0)
          };
        });
      } else if (type === 'quotes') {
        count = DB.importCSV(DB.KEYS.quotes, csv, function(row) {
          return {
            clientName: row['Client name'] || row['Client'] || '',
            quoteNumber: parseInt(row['Quote number'] || row['#'] || 0),
            property: row['Property'] || row['Address'] || '',
            status: (row['Status'] || 'draft').toLowerCase(),
            total: parseFloat(row['Total'] || 0)
          };
        });
      }

      if (statusEl) statusEl.textContent = 'Imported ' + count + ' ' + type + ' from CSV.';
      UI.toast(count + ' ' + type + ' imported');
      loadPage('settings');
    };
    reader.readAsText(file);
  },

  // resetDemo REMOVED v594. Demo seeding caused 3 fabricate-data incidents
  // (Apr 23 / Apr 30 / May 5). Permanently disabled. Use Clear All Data if
  // you actually want to wipe and start fresh.

  clearAll: function() {
    // Two-stage confirm — must type exactly "DELETE" to proceed.
    // Counts the damage so the user sees what's about to go.
    var counts = {};
    try { counts.clients  = JSON.parse(localStorage.getItem('bm-clients')  || '[]').length; } catch(e) { counts.clients  = '?'; }
    try { counts.quotes   = JSON.parse(localStorage.getItem('bm-quotes')   || '[]').length; } catch(e) { counts.quotes   = '?'; }
    try { counts.jobs     = JSON.parse(localStorage.getItem('bm-jobs')     || '[]').length; } catch(e) { counts.jobs     = '?'; }
    try { counts.invoices = JSON.parse(localStorage.getItem('bm-invoices') || '[]').length; } catch(e) { counts.invoices = '?'; }

    var typed = prompt(
      '⚠️ DANGER — Local data will be permanently deleted from THIS device:\n\n' +
      '  • ' + counts.clients  + ' clients\n' +
      '  • ' + counts.quotes   + ' quotes\n' +
      '  • ' + counts.jobs     + ' jobs\n' +
      '  • ' + counts.invoices + ' invoices\n' +
      '  • All time entries, expenses, photos, settings\n\n' +
      'Cloud (Supabase) data is NOT touched — it will re-sync on next login.\n\n' +
      'Type DELETE (all caps) to proceed, or Cancel to keep data.'
    );
    if (typed !== 'DELETE') {
      UI.toast(typed == null ? 'Cancelled' : 'Confirmation text did not match — nothing deleted', 'error');
      return;
    }
    // Save a rollback snapshot so the user can recover from `?restore=rollback` URL param
    try {
      var snapshot = {};
      Object.values(DB.KEYS).forEach(function(k) { snapshot[k] = localStorage.getItem(k); });
      localStorage.setItem('bm-rollback-' + Date.now(), JSON.stringify(snapshot));
    } catch(e) {}
    Object.values(DB.KEYS).forEach(function(k) { localStorage.removeItem(k); });
    UI.toast('Local data cleared — rollback snapshot saved');
    loadPage('settings');
  },

  syncNow: function(btn) {
    if (btn) { btn.textContent = 'Syncing...'; btn.disabled = true; }
    function done() {
      if (btn) { btn.textContent = 'Sync Now'; btn.disabled = false; }
      loadPage('settings');
    }
    if (typeof DashboardPage !== 'undefined' && DashboardPage.syncNow) {
      try {
        var result = DashboardPage.syncNow();
        if (result && typeof result.then === 'function') { result.then(done).catch(done); } else { done(); }
      } catch(e) { done(); }
    } else if (typeof CloudSync !== 'undefined' && CloudSync.init) {
      // CloudSync.init() is the canonical full-pull from Supabase — use it as the fallback
      CloudSync.init().then(done).catch(done);
    } else if (typeof SupabaseDB !== 'undefined' && SupabaseDB.resync) {
      try {
        var r = SupabaseDB.resync();
        if (r && typeof r.then === 'function') { r.then(done).catch(done); } else { done(); }
      } catch(e) { done(); }
    } else {
      UI.toast('Sync module not loaded — reload the page', 'error');
      done();
    }
  },

  auditAIData: function() {
    var host = document.getElementById('audit-result');
    if (host) host.innerHTML = '<span style="color:var(--text-light);">Running audit…</span>';
    // Use SupabaseDB.client when available (production path — URL/key are hardcoded in source, not localStorage)
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.ready && SupabaseDB.client) ? SupabaseDB.client : null;
    if (!sb) { if (host) host.innerHTML = '<span style="color:var(--red);">Supabase not connected.</span>'; return; }
    var tables = ['clients', 'quotes', 'jobs', 'invoices'];
    Promise.all(tables.map(function(t) {
      return sb.from(t).select('*').not('created_by_agent', 'is', null).order('created_at', { ascending: false }).limit(50)
        .then(function(r) { return (r && r.data) ? r.data : []; });
    })).then(function(results) {
      var total = results.reduce(function(s, r) { return s + (r ? r.length : 0); }, 0);
      if (total === 0) {
        host.innerHTML = '<span style="color:var(--green-dark);font-weight:600;">✅ Clean — no AI-created rows in clients/quotes/jobs/invoices. All data came from you, your customers, or legitimate imports (with import_source set).</span>';
        return;
      }
      var out = '<div style="color:var(--red);font-weight:700;margin-bottom:8px;">⚠️ Found ' + total + ' AI-created row(s). Review and delete any that look wrong.</div>';
      tables.forEach(function(tbl, i) {
        var rows = results[i] || [];
        if (!rows.length) return;
        out += '<div style="margin-top:10px;font-weight:700;">' + tbl + ' (' + rows.length + ')</div><ul style="margin:4px 0 0 18px;">';
        rows.slice(0, 20).forEach(function(r) {
          // clientName/first_name/name varies by table
          var label = r.name || (r.first_name ? (r.first_name + ' ' + (r.last_name || '')) : '') || r.client_name || r.id || '';
          out += '<li style="font-size:11px;margin-bottom:3px;"><strong>' + UI.esc(label.trim()) + '</strong> — created ' + (r.created_at || '').slice(0, 10) + ' by <code>' + UI.esc(r.created_by_agent || 'unknown') + '</code>' + (r.import_source ? ' · source=' + UI.esc(r.import_source) : '') + '</li>';
        });
        if (rows.length > 20) out += '<li style="font-size:11px;color:var(--text-light);">… and ' + (rows.length - 20) + ' more</li>';
        out += '</ul>';
      });
      host.innerHTML = out;
    }).catch(function(e) {
      host.innerHTML = '<span style="color:var(--red);">Audit failed: ' + UI.esc(String(e.message || e)) + '</span>';
    });
  },

  reconcileOrphans: function() {
    // First pass — dry run, show preview
    var dry = DB.reconcileOrphans(false);
    var total = dry.backfilled + dry.stillOrphan;
    if (total === 0) { UI.toast('✓ No orphan records — every quote/job/invoice is linked to a client'); return; }
    var msg = 'Found ' + total + ' orphan record(s) (have clientName, no clientId):\n\n'
      + '  • ' + dry.backfilled + ' can be auto-linked by name match\n'
      + '  • ' + dry.stillOrphan + ' have no matching client — will need a client created manually\n\n';
    if (dry.stillOrphan > 0 && dry.orphans.length) {
      msg += 'Unmatched clientNames (first 5):\n';
      dry.orphans.slice(0, 5).forEach(function(o) {
        msg += '  — ' + o.table + ' #' + (o.num || '') + ': "' + o.name + '"\n';
      });
      msg += '\n';
    }
    msg += 'Run the ' + dry.backfilled + ' auto-matches now?';
    if (!confirm(msg)) return;
    var real = DB.reconcileOrphans(true);
    UI.toast('✓ Backfilled ' + real.backfilled + ' records' + (real.stillOrphan ? ' · ' + real.stillOrphan + ' still orphan' : ''));
  },

  deduplicateTags: function() {
    var clients = JSON.parse(localStorage.getItem('bm-clients') || '[]');
    var fixed = 0;
    clients.forEach(function(c) {
      if (!c.tags || !c.tags.length) return;
      var seen = {};
      var uniq = c.tags.filter(function(t) {
        var k = (t || '').toLowerCase();
        return k && (seen[k] ? false : (seen[k] = true));
      });
      if (uniq.length < c.tags.length) { c.tags = uniq; fixed++; }
    });
    localStorage.setItem('bm-clients', JSON.stringify(clients));
    UI.toast('Fixed ' + fixed + ' client' + (fixed !== 1 ? 's' : '') + ' with duplicate tags');
    loadPage('settings');
  },

  _copyRlsSql: function() {
    var sql = '-- Safe to re-run: drops existing policies first\n'
      + 'DROP POLICY IF EXISTS "Anon read quotes" ON quotes;\n'
      + 'DROP POLICY IF EXISTS "Anon update quote status" ON quotes;\n'
      + 'DROP POLICY IF EXISTS "Anon read invoices" ON invoices;\n'
      + 'DROP POLICY IF EXISTS "Anon read clients" ON clients;\n'
      + 'DROP POLICY IF EXISTS "Anon insert requests" ON requests;\n\n'
      + 'CREATE POLICY "Anon read quotes" ON quotes FOR SELECT TO anon USING (status <> \'draft\');\n\n'
      + 'CREATE POLICY "Anon update quote status" ON quotes FOR UPDATE TO anon USING (status IN (\'sent\', \'awaiting\')) WITH CHECK (status IN (\'approved\', \'awaiting\'));\n\n'
      + 'CREATE POLICY "Anon read invoices" ON invoices FOR SELECT TO anon USING (status <> \'draft\');\n\n'
      + 'CREATE POLICY "Anon read clients" ON clients FOR SELECT TO anon USING (true);\n\n'
      + 'CREATE POLICY "Anon insert requests" ON requests FOR INSERT TO anon WITH CHECK (true);\n\n'
      + '-- Storage bucket for job photos\n'
      + 'INSERT INTO storage.buckets (id, name, public)\n'
      + 'VALUES (\'job-photos\', \'job-photos\', true)\n'
      + 'ON CONFLICT (id) DO NOTHING;\n\n'
      + '-- Allow public read of job photos\n'
      + 'DROP POLICY IF EXISTS "Public read job photos" ON storage.objects;\n'
      + 'CREATE POLICY "Public read job photos" ON storage.objects\n'
      + '  FOR SELECT USING (bucket_id = \'job-photos\');\n\n'
      + '-- Allow authenticated/anon insert to job-photos\n'
      + 'DROP POLICY IF EXISTS "Anon upload job photos" ON storage.objects;\n'
      + 'CREATE POLICY "Anon upload job photos" ON storage.objects\n'
      + '  FOR INSERT WITH CHECK (bucket_id = \'job-photos\');\n\n'
      + '-- Allow delete own photos\n'
      + 'DROP POLICY IF EXISTS "Anon delete job photos" ON storage.objects;\n'
      + 'CREATE POLICY "Anon delete job photos" ON storage.objects\n'
      + '  FOR DELETE USING (bucket_id = \'job-photos\');';
    navigator.clipboard.writeText(sql).then(function() { UI.toast('RLS SQL copied!'); });
  },

  _copyColumnSql: function() {
    var sql = 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_email TEXT;\n'
      + 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_phone TEXT;\n'
      + 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2) DEFAULT 0;\n'
      + 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS issued_date DATE;\n'
      + 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_payment_url TEXT;\n'
      + 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_link_sent TIMESTAMPTZ;\n'
      + 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_link_email TEXT;\n'
      + 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;\n'
      + 'ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_email TEXT;\n'
      + 'ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_phone TEXT;\n'
      + 'ALTER TABLE jobs ADD COLUMN IF NOT EXISTS invoice_id TEXT;\n'
      + 'ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_date DATE;\n'
      + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_email TEXT;\n'
      + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_phone TEXT;\n'
      + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS expires_at DATE;\n'
      + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_required BOOLEAN DEFAULT false;\n'
      + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_due DECIMAL(10,2) DEFAULT 0;\n'
      + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN DEFAULT false;\n'
      + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;\n'
      + 'ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_changes TEXT;';
    navigator.clipboard.writeText(sql).then(function() { UI.toast('Column SQL copied!'); });
  },

  _copyExpensesSql: function() {
    var el = document.getElementById('expenses-sql-block');
    var sql = el ? el.textContent : '';
    navigator.clipboard.writeText(sql).then(function() { UI.toast('Expenses SQL copied — paste into Supabase SQL Editor!'); });
  },

  _testDialpad: function() {
    var key = (document.getElementById('dialpad-key') || {}).value;
    if (!key) key = localStorage.getItem('bm-dialpad-key') || '';
    key = (key || '').trim();
    var out = document.getElementById('dialpad-test-result');
    if (!key) {
      if (out) out.innerHTML = '<span style="color:#e07c24;">⚠️ Paste your Dialpad API token first.</span>';
      return;
    }
    if (out) out.innerHTML = '<span style="color:var(--text-light);">Pinging Dialpad…</span>';
    // Dialpad API: GET /api/v2/users/me — lightweight auth check
    fetch('https://dialpad.com/api/v2/users/me', {
      headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' }
    }).then(function(r) {
      if (r.status === 401 || r.status === 403) {
        if (out) out.innerHTML = '<span style="color:#c0392b;">❌ Invalid token (401/403). Regenerate at dialpad.com → API Keys.</span>';
        return null;
      }
      if (!r.ok) {
        if (out) out.innerHTML = '<span style="color:#c0392b;">❌ Dialpad returned ' + r.status + '. Check token + account status.</span>';
        return null;
      }
      return r.json();
    }).then(function(data) {
      if (!data) return;
      var name = (data.display_name || data.email || 'Dialpad user');
      if (out) out.innerHTML = '<span style="color:var(--green-dark);font-weight:600;">✅ Connected as ' + UI.esc(name) + '</span>';
    }).catch(function(e) {
      // Most common failure: CORS — Dialpad API doesn't allow browser calls from arbitrary origins.
      if (out) out.innerHTML = '<span style="color:#c0392b;">❌ ' + (e.message || 'Network error') + '<br><span style="font-size:11px;color:var(--text-light);">If this says "CORS" or "Failed to fetch", the call is blocked by Dialpad\'s browser policy. The token can still work from our server-side webhook — click Save Token and continue.</span></span>';
    });
  },

  // Small hourly-rate input for T&M pricing settings
  _rateInput: function(label, key, value) {
    return '<div><label style="font-size:11px;color:var(--text-light);display:block;">' + label + ' $/hr</label>'
      + '<input type="number" id="tm-rate-' + key + '" value="' + (value || 0) + '" step="1" min="0" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:14px;">'
      + '</div>';
  },

  // Build a base64 code of all relevant bm-* localStorage keys
  _exportKeys: function() {
    var KEYS = ['bm-claude-key','bm-stripe-base-link','bm-dialpad-key',
                'bm-gusto-api-key','bm-plantnet-key','bm-tm-rates','bm-ai-enabled',
                'bm-dark-mode','bm-co-name','bm-co-phone','bm-co-email','bm-co-address',
                'bm-co-website','bm-tax-rate','bm-zip','bm-revenue-goals','bm-receptionist-settings'];
    var bag = {};
    KEYS.forEach(function(k) {
      var v = localStorage.getItem(k);
      if (v !== null && v !== '') bag[k] = v;
    });
    if (Object.keys(bag).length === 0) { UI.toast('Nothing to export yet', 'error'); return; }
    try {
      var code = btoa(JSON.stringify(bag));
      var ta = document.getElementById('sync-code-output');
      if (ta) { ta.value = code; ta.select(); }
      if (navigator.clipboard) navigator.clipboard.writeText(code);
      UI.toast('✓ ' + Object.keys(bag).length + ' settings exported + copied to clipboard');
    } catch(e) { UI.toast('Export failed: ' + e.message, 'error'); }
  },

  _importKeys: function() {
    var code = prompt('Paste your sync code:');
    if (!code) return;
    try {
      var bag = JSON.parse(atob(code.trim()));
      var n = 0;
      Object.keys(bag).forEach(function(k) {
        if (k.indexOf('bm-') === 0) { localStorage.setItem(k, bag[k]); n++; }
      });
      UI.toast('✓ ' + n + ' settings imported — reloading');
      setTimeout(function() { location.reload(); }, 600);
    } catch(e) { UI.toast('Bad code — make sure you copied the whole thing', 'error'); }
  },

  _saveTMRates: function() {
    var keys = ['climber','ground','foreman','bucket','chipper','crane','stumpGrinder','miniSkid','dumpTruck','liftLadder','trailer'];
    var rates = {};
    keys.forEach(function(k) {
      var el = document.getElementById('tm-rate-' + k);
      if (el) rates[k] = parseFloat(el.value) || 0;
    });
    var ins = document.getElementById('tm-rate-insurance');
    if (ins) rates.insurance = (parseFloat(ins.value) || 0) / 100; // store as decimal
    var mk = document.getElementById('tm-rate-markup');
    if (mk) rates.markup = parseFloat(mk.value) || 1.5;
    localStorage.setItem('bm-tm-rates', JSON.stringify(rates));
    UI.toast('T&M rates saved ✓');
  },

  _setPwaNav: function(mode) {
    if (mode !== 'top' && mode !== 'bottom' && mode !== 'both') return;
    var current = localStorage.getItem('bm-pwa-nav') || 'top';
    if (current === mode) return;
    localStorage.setItem('bm-pwa-nav', mode);
    var label = mode === 'bottom' ? 'Bottom tab bar' : (mode === 'both' ? 'Top + Bottom' : 'Top sidebar');
    UI.toast('PWA nav: ' + label + ' ✓');
    setTimeout(function() { location.reload(); }, 400);
  },

  _setAppNav: function(mode) {
    if (mode !== 'top' && mode !== 'bottom' && mode !== 'both') return;
    var current = localStorage.getItem('bm-app-nav') || 'top';
    if (current === mode) return;
    localStorage.setItem('bm-app-nav', mode);
    var label = mode === 'bottom' ? 'Bottom tab bar' : (mode === 'both' ? 'Top + Bottom' : 'Top sidebar');
    UI.toast('App nav: ' + label + ' ✓');
    setTimeout(function() { location.reload(); }, 400);
  },

  _migratePhotos: async function() {
    if (!SupabaseDB || !SupabaseDB.ready) { UI.toast('Supabase not connected', 'error'); return; }
    if (!confirm('Upload all device-only photos to the cloud?\n\nThis may take a minute for large libraries.')) return;
    var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    var uploaded = 0, failed = 0, scanned = 0;
    UI.toast('Migrating photos...');
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('bm-photos-') === 0) keys.push(k);
    }
    for (var ki = 0; ki < keys.length; ki++) {
      var key = keys[ki];
      var parts = key.replace('bm-photos-', '').split('-');
      // record_type is first segment, record_id is the rest joined back
      var recordType = parts.shift();
      var recordId = parts.join('-');
      var arr = [];
      try { arr = JSON.parse(localStorage.getItem(key)) || []; } catch(e) { continue; }
      var changed = false;
      for (var pi = 0; pi < arr.length; pi++) {
        var p = arr[pi];
        scanned++;
        if (!p.url || p.url.indexOf('data:') !== 0) continue; // already a URL
        try {
          var blob = await (await fetch(p.url)).blob();
          var ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
          var path = recordType + '/' + recordId + '/' + Date.now() + '_' + pi + '.' + ext;
          var up = await SupabaseDB.client.storage.from('job-photos').upload(path, blob, { contentType: blob.type });
          if (up.error) throw up.error;
          var pub = SupabaseDB.client.storage.from('job-photos').getPublicUrl(path);
          var meta = { record_type: recordType, record_id: recordId, url: pub.data.publicUrl, storage_path: path, name: p.name || 'photo.' + ext, label: p.label || '', taken_at: p.date || new Date().toISOString() };
          if (tid) meta.tenant_id = tid;
          var ins = await SupabaseDB.client.from('photos').insert(meta).select().single();
          arr[pi] = { id: (ins.data && ins.data.id) || null, url: pub.data.publicUrl, storage_path: path, name: meta.name, label: meta.label, date: meta.taken_at };
          changed = true;
          uploaded++;
        } catch (e) {
          console.warn('Migrate photo failed:', e);
          failed++;
        }
      }
      if (changed) localStorage.setItem(key, JSON.stringify(arr));
    }
    UI.toast('Migrated ' + uploaded + ' / ' + scanned + ' photos' + (failed ? ' (' + failed + ' failed)' : ' ✓'));
    loadPage('settings');
  },

  _migrateJobberPhotos: async function() {
    if (!SupabaseDB || !SupabaseDB.ready) { UI.toast('Supabase not connected', 'error'); return; }
    if (!confirm('Move all base64 photos out of quote line_items into the storage bucket?\n\nThis can take several minutes for hundreds of photos. Safe to interrupt and re-run — already-migrated photos are skipped.')) return;

    var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    UI.toast('Scanning all quotes (ignoring tenant to catch legacy Jobber imports)...');
    // IMPORTANT: fetch ALL quotes, not filtered by tenant. Jobber imports
    // often have tenant_id=NULL which .eq('tenant_id', tid) would skip.
    var { data: quotes, error } = await SupabaseDB.client.from('quotes').select('id, tenant_id, line_items');
    if (error) { UI.toast('Fetch failed: ' + error.message, 'error'); return; }
    if (!quotes || !quotes.length) { UI.toast('No quotes returned from Supabase — check RLS', 'error'); return; }
    console.debug('[MigrateJobber] Fetched ' + quotes.length + ' quotes');
    var withPhotos = quotes.filter(function(q) {
      if (!q.line_items || !q.line_items.length) return false;
      return q.line_items.some(function(it) {
        var ps = (it && it.photos) || (it && it.photo ? [it.photo] : []);
        return ps.some(function(p) { return typeof p === 'string' && p.indexOf('data:') === 0; });
      });
    });
    UI.toast('Found ' + withPhotos.length + ' quote(s) with base64 photos to migrate');
    console.debug('[MigrateJobber] ' + withPhotos.length + ' quotes have base64 photos');
    if (!withPhotos.length) { UI.toast('Nothing to migrate — all photos already URLs ✓'); return; }

    var quotesTouched = 0, photosMigrated = 0, photosFailed = 0;

    for (var qi = 0; qi < quotes.length; qi++) {
      var quote = quotes[qi];
      var items = quote.line_items;
      if (!items || !items.length) continue;
      var changed = false;

      for (var li = 0; li < items.length; li++) {
        var item = items[li];
        if (!item) continue;
        var photos = item.photos || (item.photo ? [item.photo] : []);
        if (!photos.length) continue;
        var newPhotos = [];

        for (var pi = 0; pi < photos.length; pi++) {
          var p = photos[pi];
          if (!p || typeof p !== 'string') continue;
          if (p.indexOf('data:') !== 0) { newPhotos.push(p); continue; } // already URL

          try {
            var blob = await (await fetch(p)).blob();
            var ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
            var path = 'quote/' + quote.id + '/' + Date.now() + '_' + li + '_' + pi + '.' + ext;
            var up = await SupabaseDB.client.storage.from('job-photos').upload(path, blob, { contentType: blob.type });
            if (up.error) throw up.error;
            var pub = SupabaseDB.client.storage.from('job-photos').getPublicUrl(path);
            newPhotos.push(pub.data.publicUrl);

            // Also write a metadata row so it shows up in galleries
            var meta = { record_type: 'quote', record_id: quote.id, url: pub.data.publicUrl, storage_path: path, name: 'jobber_' + li + '_' + pi + '.' + ext, label: item.species || item.service || '', taken_at: new Date().toISOString() };
            if (quote.tenant_id) meta.tenant_id = quote.tenant_id;
            else if (tid) meta.tenant_id = tid;
            await SupabaseDB.client.from('photos').insert(meta);

            photosMigrated++;
            if (photosMigrated % 10 === 0) UI.toast('Migrated ' + photosMigrated + ' photos...');
          } catch (e) {
            console.warn('Quote photo migrate fail (quote ' + quote.id + ', li ' + li + ', pi ' + pi + '):', e);
            newPhotos.push(p); // keep original on failure
            photosFailed++;
          }
        }

        if (JSON.stringify(newPhotos) !== JSON.stringify(photos)) {
          item.photos = newPhotos;
          item.photo = newPhotos[0] || '';
          changed = true;
        }
      }

      if (changed) {
        var upd = await SupabaseDB.client.from('quotes').update({ line_items: items }).eq('id', quote.id);
        if (upd.error) console.warn('Quote update fail:', upd.error.message);
        else quotesTouched++;
      }
    }

    UI.toast('Done — ' + photosMigrated + ' photos moved across ' + quotesTouched + ' quotes' + (photosFailed ? ' (' + photosFailed + ' failed)' : ' ✓'));
  },

  _testClaudeKey: function() {
    var keyEl = document.getElementById('claude-ai-key');
    var resultEl = document.getElementById('claude-test-result');
    var serverManaged = AIConfig.serverManaged();
    var key = (keyEl && keyEl.value.trim()) || localStorage.getItem('bm-claude-key') || '';
    if (!serverManaged && !key) {
      if (resultEl) resultEl.innerHTML = '<span style="color:#dc3545;">⚠️ Paste a key first, or switch to Server-managed mode.</span>';
      return;
    }
    if (resultEl) resultEl.innerHTML = '<span style="color:var(--text-light);">Testing…</span>';
    fetch('https://ltpivkqahvplapyagljt.supabase.co/functions/v1/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: serverManaged ? '' : key,
        model: 'claude-haiku-4-5',
        max_tokens: 40,
        system: 'You are a test. Reply with exactly: OK',
        messages: [{ role: 'user', content: 'ping' }]
      })
    }).then(function(res) {
      return res.json().then(function(body){ return { ok: res.ok, status: res.status, body: body }; });
    }).then(function(r) {
      if (r.ok && r.body && r.body.content && r.body.content[0]) {
        if (resultEl) resultEl.innerHTML = '<span style="color:var(--green-dark);font-weight:600;">✅ Connected — Claude replied: "' + (r.body.content[0].text || '').trim().slice(0, 40) + '"</span>';
      } else {
        var msg = (r.body && (r.body.error && (r.body.error.message || r.body.error)) || r.body && r.body.message) || ('HTTP ' + r.status);
        if (resultEl) resultEl.innerHTML = '<span style="color:#dc3545;font-weight:600;">❌ Failed: ' + UI.esc(String(msg)) + '</span>';
      }
    }).catch(function(err) {
      if (resultEl) resultEl.innerHTML = '<span style="color:#dc3545;font-weight:600;">❌ Network error: ' + UI.esc(err.message || String(err)) + '</span>';
    });
  },

  _copyPortalLink: function() {
    var url = 'https://branchmanager.app/portal/';
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function() { UI.toast('Portal link copied'); });
    } else {
      prompt('Copy this:', url);
    }
  },

  _bulkSendInvites: function() {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client) { UI.toast('Supabase not ready', 'error'); return; }
    var clients = DB.clients.getAll().filter(function(c) { return c.email && /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(c.email); });
    if (!clients.length) { UI.toast('No clients with email on file', 'error'); return; }
    if (!confirm('Send portal sign-in links to ' + clients.length + ' clients? They\'ll each get an email with a one-tap link to view their account.')) return;
    UI.toast('Sending — this will take ~' + clients.length + ' seconds…');
    var sent = 0, failed = 0, idx = 0;
    function next() {
      if (idx >= clients.length) {
        UI.toast('Done — sent ' + sent + ', failed ' + failed);
        return;
      }
      var c = clients[idx++];
      SupabaseDB.client.auth.signInWithOtp({
        email: c.email,
        options: { emailRedirectTo: 'https://branchmanager.app/portal/dashboard.html' }
      }).then(function(res) {
        if (res.error) failed++; else sent++;
        // Throttle ~1 sec between to dodge Supabase auth rate limit
        setTimeout(next, 1100);
      }).catch(function() { failed++; setTimeout(next, 1100); });
    }
    next();
  },

  _removeKey: function(storageKey, label) {
    var existing = localStorage.getItem(storageKey);
    if (!existing) {
      UI.toast(label + ' key was not set', 'error');
      return;
    }
    if (!confirm('Remove your ' + label + ' API key?\n\nYou can re-add it anytime.')) return;
    localStorage.removeItem(storageKey);
    // Also clear in-memory reference on the module
    if (storageKey === 'bm-claude-key' && typeof AI !== 'undefined') AI._apiKey = null;
    UI.toast(label + ' key removed ✓');
    loadPage('settings');
  },

  saveCompany: function() {
    var fields = ['name','phone','email','address','licenses','website','logo'];
    fields.forEach(function(f) {
      var el = document.getElementById('co-' + f);
      if (el) localStorage.setItem('bm-co-' + f, el.value.trim());
    });
    var taxEl = document.getElementById('co-tax-rate');
    if (taxEl) localStorage.setItem('bm-tax-rate', parseFloat(taxEl.value) || 0);
    UI.toast('Company info saved ✅');
  },

  saveCompliance: function() {
    var map = {
      'cmp-dot':         'bm-co-dot-num',
      'cmp-dotpin':      'bm-co-dot-pin',
      'cmp-ein':         'bm-co-ein',
      'cmp-sui':         'bm-co-sui',
      'cmp-wc-num':      'bm-co-wc-num',
      'cmp-wc-policy':   'bm-co-wc-policy',
      'cmp-pc':          'bm-co-pc-num',
      'cmp-tcia':        'bm-co-tcia-id',
      'cmp-isa':         'bm-co-isa-id',
      'cmp-disability':  'bm-co-disability-policy',
      'cmp-dos-current': 'bm-co-dos-current',
      'cmp-dos-prior':   'bm-co-dos-prior'
    };
    Object.keys(map).forEach(function(id) {
      var el = document.getElementById(id);
      if (el) localStorage.setItem(map[id], el.value.trim());
    });
    UI.toast('Compliance info saved ✅');
  },

  // Vendor logins are URL+username+account only — the form has no password
  // input, and any password-shaped string typed into the username field gets
  // stripped before save (defense against accidental paste of a password).
  addVendorLogin: function() {
    var list = JSON.parse(localStorage.getItem('bm-co-vendor-logins') || '[]');
    list.push({ label: '', url: '', username: '', account: '' });
    localStorage.setItem('bm-co-vendor-logins', JSON.stringify(list));
    loadPage('settings');
  },
  removeVendorLogin: function(index) {
    var list = JSON.parse(localStorage.getItem('bm-co-vendor-logins') || '[]');
    list.splice(index, 1);
    localStorage.setItem('bm-co-vendor-logins', JSON.stringify(list));
    loadPage('settings');
  },
  saveVendorLogins: function() {
    var list = JSON.parse(localStorage.getItem('bm-co-vendor-logins') || '[]');
    var inputs = document.querySelectorAll('[data-vl-i]');
    inputs.forEach(function(input) {
      var i = parseInt(input.getAttribute('data-vl-i'), 10);
      var k = input.getAttribute('data-vl-k');
      if (!list[i]) list[i] = {};
      list[i][k] = (input.value || '').trim();
    });
    // Defensive scrub: if anything looks like a password (≥10 chars w/ digit+special),
    // refuse to save it in the username field. Pasted passwords get rejected.
    var looksLikePassword = function(s) {
      return /^.{10,}$/.test(s) && /\d/.test(s) && /[!@#$%^&*()]/.test(s) && !/@/.test(s);
    };
    var scrubbed = false;
    list.forEach(function(v) {
      if (looksLikePassword(v.username || '')) { v.username = ''; scrubbed = true; }
      if (looksLikePassword(v.account || ''))  { v.account = '';  scrubbed = true; }
    });
    localStorage.setItem('bm-co-vendor-logins', JSON.stringify(list));
    UI.toast(scrubbed ? '⚠ Removed something that looked like a password — never paste passwords here' : 'Logins saved ✅', scrubbed ? 'error' : 'success');
  },

  _previewLogo: function(url) {
    var el = document.getElementById('co-logo-preview');
    if (!el) return;
    if (!url) { el.outerHTML = '<div id="co-logo-preview" style="width:40px;height:40px;border-radius:8px;border:1px solid var(--border);background:#f9fafb;display:flex;align-items:center;justify-content:center;font-size:20px;">🌳</div>'; return; }
    el.outerHTML = '<img id="co-logo-preview" src="' + url.replace(/"/g,'&quot;') + '" style="width:40px;height:40px;object-fit:contain;border-radius:8px;border:1px solid var(--border);background:#f9fafb;" onerror="this.style.display=\'none\'">';
  },

  // ── White-label Branding (tenants.config) ─────────────────────────────────
  // Loads the current tenant's row, renders a form, lets Doug edit + save.
  // Saves go to tenants.config in Supabase. The /branding.js bootstrap +
  // every edge fn read from this row, so changes appear immediately on next
  // page load / next email send. No redeploy needed.
  _loadBrandingForm: function() {
    var box = document.getElementById('wl-branding-form');
    if (!box) return;
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    var tid = (DB && DB.getTenantId) ? DB.getTenantId() : null;
    if (!sb || !tid) {
      box.innerHTML = '<div style="background:#fff3cd;border:1px solid #ffe082;border-radius:8px;padding:12px;color:#7e2d10;font-size:13px;">⚠ Cloud sync required to edit white-label branding. Sign in to Supabase first.</div>';
      return;
    }
    sb.from('tenants').select('id, name, config').eq('id', tid).single().then(function(res) {
      if (res.error || !res.data) {
        box.innerHTML = '<div style="background:#ffebee;border:1px solid #ef9a9a;border-radius:8px;padding:12px;color:#c62828;font-size:13px;">Failed to load tenant: ' + UI.esc(String(res.error && res.error.message || 'no row')) + '</div>';
        return;
      }
      var c = res.data.config || {};
      var f = function(id, label, val, hint, type) {
        type = type || 'text';
        return '<div style="margin-bottom:10px;">'
          + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">' + UI.esc(label) + (hint ? ' <span style="font-weight:400;color:var(--text-light);font-size:11px;">· ' + UI.esc(hint) + '</span>' : '') + '</label>'
          + '<input id="wl-' + id + '" type="' + type + '" value="' + UI.esc(val == null ? '' : String(val)) + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;">'
          + '</div>';
      };
      var html = ''
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">'
        + '<div>'
        +   '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-light);margin-bottom:8px;">Names</div>'
        +   f('company_name', 'Display name', c.company_name, 'used in headers, subject lines')
        +   f('legal_name', 'Legal name', c.legal_name, 'with LLC/Inc — used in legal docs')
        +   f('business_short_name', 'Short name', c.business_short_name, 'for casual references')
        +   f('owner_name', 'Owner name', c.owner_name, 'used in handbook/signature blocks')
        + '</div>'
        + '<div>'
        +   '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-light);margin-bottom:8px;">Contact</div>'
        +   f('company_phone', 'Phone', c.company_phone, '(XXX) XXX-XXXX')
        +   f('company_email', 'Email', c.company_email, '', 'email')
        +   f('company_website', 'Website', c.company_website, 'with https://', 'url')
        +   f('sms_from_number', 'SMS from number', c.sms_from_number, '+1 E.164 format')
        + '</div>'
        + '</div>'
        + '<div style="margin-top:14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-light);margin-bottom:8px;">Address</div>'
        + '<div style="display:grid;grid-template-columns:2fr 1fr;gap:14px;">'
        +   f('address_line1', 'Street', c.address_line1)
        +   f('address_line2', 'Suite / floor', c.address_line2, 'optional')
        + '</div>'
        + '<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:14px;">'
        +   f('city', 'City', c.city)
        +   f('state', 'State', c.state, '2-letter')
        +   f('state_full', 'State (full)', c.state_full, 'New York')
        +   f('zip', 'ZIP', c.zip)
        + '</div>'
        + '<div style="margin-top:14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-light);margin-bottom:8px;">Branding</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">'
        +   '<div style="margin-bottom:10px;"><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Brand color <span style="font-weight:400;color:var(--text-light);font-size:11px;">· hex</span></label>'
        +     '<div style="display:flex;gap:8px;align-items:center;">'
        +     '<input id="wl-brand_color" type="color" value="' + UI.esc(c.brand_color || '#1a3c12') + '" style="width:40px;height:36px;border:1px solid var(--border);border-radius:6px;padding:0;cursor:pointer;">'
        +     '<input id="wl-brand_color_text" value="' + UI.esc(c.brand_color || '#1a3c12') + '" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:ui-monospace,monospace;box-sizing:border-box;">'
        +     '</div></div>'
        +   f('logo_url', 'Logo URL', c.logo_url, 'public image URL', 'url')
        +   '<div style="margin-bottom:10px;"><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Vertical</label>'
        +     '<select id="wl-vertical" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;box-sizing:border-box;">'
        +     ['tree_service','lawn_care','snow_removal','plumbing','hvac','electrical','cleaning','handyman','other'].map(function(v){
              return '<option value="' + v + '"' + (c.vertical === v ? ' selected' : '') + '>' + v.replace(/_/g,' ') + '</option>';
            }).join('')
        +     '</select></div>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">'
        +   f('effective_date', 'Handbook effective date', c.effective_date, 'e.g. April 2026')
        +   f('license_text', 'License footer text', c.license_text, 'shown in email footers')
        + '</div>'

        + '<details style="margin-top:18px;background:#f0f7f0;border:1px solid #c8e6c9;border-radius:8px;padding:0;overflow:hidden;">'
        + '<summary style="padding:10px 14px;cursor:pointer;font-size:12px;font-weight:700;color:#1b5e20;list-style:none;">📧 Preview email signature</summary>'
        + '<div id="wl-preview" style="padding:14px;background:#fff;font-size:13px;color:#444;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,sans-serif;border-top:1px solid #c8e6c9;"></div>'
        + '</details>';
      box.innerHTML = html;
      var btn = document.getElementById('wl-save-btn'); if (btn) btn.disabled = false;

      // Color picker sync
      var picker = document.getElementById('wl-brand_color');
      var hex = document.getElementById('wl-brand_color_text');
      if (picker && hex) {
        picker.oninput = function() { hex.value = picker.value; SettingsPage._renderBrandingPreview(); };
        hex.oninput = function() { if (/^#[0-9a-f]{6}$/i.test(hex.value)) { picker.value = hex.value; SettingsPage._renderBrandingPreview(); } };
      }
      // Live preview as the user edits any field
      ['wl-company_name','wl-owner_name','wl-company_phone','wl-company_email','wl-company_website','wl-address_line1','wl-city','wl-state','wl-zip','wl-license_text'].forEach(function(id){
        var el = document.getElementById(id);
        if (el) el.oninput = SettingsPage._renderBrandingPreview;
      });
      SettingsPage._renderBrandingPreview();
    });
  },

  _renderBrandingPreview: function() {
    var box = document.getElementById('wl-preview');
    if (!box) return;
    var v = function(id, fb) { var el = document.getElementById('wl-' + id); return (el && el.value) ? el.value : (fb || ''); };
    var name = v('company_name', 'Your Business');
    var owner = v('owner_name', 'Owner');
    var phone = v('company_phone', '(555) 555-0100');
    var email = v('company_email', 'hello@example.com');
    var website = v('company_website', 'https://example.com');
    var addr = [v('address_line1'), v('address_line2'), v('city') + ', ' + v('state') + ' ' + v('zip')].filter(Boolean).join(', ');
    var color = v('brand_color', '#1a3c12');
    var license = v('license_text', 'Licensed & Fully Insured');
    var websiteDisplay = String(website).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    box.innerHTML = '<div>Hi <strong>Customer</strong>,</div>'
      + '<div style="margin-top:10px;">Thanks for approving your quote — we\'ll be in touch shortly.</div>'
      + '<div style="margin-top:14px;">— ' + UI.esc(owner) + '</div>'
      + '<div><strong>' + UI.esc(name) + '</strong></div>'
      + '<div>' + UI.esc(phone) + ' · <a href="mailto:' + UI.esc(email) + '" style="color:' + UI.esc(color) + ';">' + UI.esc(email) + '</a></div>'
      + '<div><a href="' + UI.esc(website) + '" style="color:' + UI.esc(color) + ';">' + UI.esc(websiteDisplay) + '</a></div>'
      + '<div style="font-size:11px;color:#888;margin-top:12px;border-top:1px solid #eee;padding-top:8px;">' + UI.esc(name) + ' · ' + UI.esc(addr) + ' · ' + UI.esc(license) + '</div>';
  },

  saveBranding: function() {
    var sb = (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) ? SupabaseDB.client : null;
    var tid = (DB && DB.getTenantId) ? DB.getTenantId() : null;
    if (!sb || !tid) { UI.toast('Cloud sync required', 'error'); return; }
    var keys = ['company_name','legal_name','business_short_name','owner_name',
                'company_phone','company_email','company_website','sms_from_number',
                'address_line1','address_line2','city','state','state_full','zip',
                'logo_url','vertical','effective_date','license_text'];
    var patch = {};
    keys.forEach(function(k){
      var el = document.getElementById('wl-' + k);
      if (el) patch[k] = el.value.trim();
    });
    // brand_color from text input (synced with picker)
    var bc = document.getElementById('wl-brand_color_text');
    if (bc && /^#[0-9a-f]{6}$/i.test(bc.value)) patch.brand_color = bc.value;

    var btn = document.getElementById('wl-save-btn'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    sb.from('tenants').select('config').eq('id', tid).single().then(function(res) {
      if (res.error) { if (btn) { btn.disabled = false; btn.textContent = 'Save'; } UI.toast('Load failed', 'error'); return; }
      var merged = Object.assign({}, res.data.config || {}, patch);
      sb.from('tenants').update({ config: merged }).eq('id', tid).then(function(r2) {
        if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
        if (r2.error) { UI.toast('Save failed: ' + r2.error.message, 'error'); return; }
        UI.toast('Branding saved ✅ — affects emails, portal, onboarding immediately');
      });
    });
  },

  saveSocialLinks: function() {
    var map = { review: 'bm-co-review', facebook: 'bm-co-facebook', instagram: 'bm-co-instagram', yelp: 'bm-co-yelp', nextdoor: 'bm-co-nextdoor' };
    Object.keys(map).forEach(function(k) {
      var el = document.getElementById('sr-' + k);
      if (el) localStorage.setItem(map[k], el.value.trim());
    });
    UI.toast('Social links saved ✅');
  },

  addService: function() {
    UI.showModal('Add Service / Product', '<form id="svc-form" onsubmit="SettingsPage._saveService(event, null)">'
      + UI.formField('Name *', 'text', 'svc-name', '', { placeholder: 'e.g. Tree Removal' })
      + UI.formField('Description', 'textarea', 'svc-desc', '', { placeholder: 'Short description shown on quotes' })
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Type</label>'
      + '<select id="svc-type" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;">'
      + '<option value="service">Service</option><option value="product">Product</option></select></div>'
      + UI.formField('Default Price ($)', 'number', 'svc-price', '', { placeholder: '0.00' })
      + '</div></form>', {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="SettingsPage._saveService(null, null)">Add</button>'
    });
  },

  editService: function(id) {
    var svc = DB.services.getAll().find(function(s) { return s.id === id; });
    if (!svc) return;
    UI.showModal('Edit Service', '<form id="svc-form">'
      + UI.formField('Name *', 'text', 'svc-name', svc.name)
      + UI.formField('Description', 'textarea', 'svc-desc', svc.description || '')
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Type</label>'
      + '<select id="svc-type" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;">'
      + '<option value="service"' + (svc.type !== 'product' ? ' selected' : '') + '>Service</option>'
      + '<option value="product"' + (svc.type === 'product' ? ' selected' : '') + '>Product</option></select></div>'
      + UI.formField('Default Price ($)', 'number', 'svc-price', svc.price || '')
      + '</div></form>', {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn" style="background:var(--red);color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;" onclick="DB.services.remove(\'' + id + '\');UI.closeModal();loadPage(\'settings\');">Delete</button>'
        + ' <button class="btn btn-primary" onclick="SettingsPage._saveService(null, \'' + id + '\')">Save</button>'
    });
  },

  _saveService: function(e, id) {
    if (e) e.preventDefault();
    var name = (document.getElementById('svc-name') || {}).value;
    if (!name || !name.trim()) { UI.toast('Name is required', 'error'); return; }
    var data = {
      name: name.trim(),
      description: ((document.getElementById('svc-desc') || {}).value || '').trim(),
      type: ((document.getElementById('svc-type') || {}).value) || 'service',
      price: parseFloat(((document.getElementById('svc-price') || {}).value) || 0) || 0
    };
    if (id) { DB.services.update(id, data); UI.toast('Service updated'); }
    else { DB.services.create(data); UI.toast('Service added'); }
    UI.closeModal();
    loadPage('settings');
  },

  showAuditLog: function() {
    var logs = DB.auditLog ? DB.auditLog.getRecent(50) : [];
    var html = '';
    if (logs.length === 0) {
      html = '<div style="text-align:center;padding:20px;color:var(--text-light);">No audit entries yet. Changes will be logged as you use the app.</div>';
    } else {
      html = '<div style="max-height:400px;overflow-y:auto;">'
        + '<table class="data-table" style="width:100%;font-size:12px;"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Table</th><th>Details</th></tr></thead><tbody>';
      logs.forEach(function(l) {
        var actionColor = l.action === 'create' ? '#16a34a' : l.action === 'delete' ? '#dc3545' : '#2563eb';
        html += '<tr>'
          + '<td style="white-space:nowrap;">' + new Date(l.ts).toLocaleString() + '</td>'
          + '<td>' + UI.esc(l.user || '—') + '</td>'
          + '<td><span style="color:' + actionColor + ';font-weight:600;">' + l.action + '</span></td>'
          + '<td>' + UI.esc(l.table || '') + '</td>'
          + '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(l.details || '') + '</td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';
    }
    UI.showModal('Audit Log (last 50)', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
        + (logs.length > 0 ? ' <button class="btn" style="background:var(--red);color:#fff;" onclick="if(confirm(\'Clear audit log?\')){DB.auditLog.clear();UI.closeModal();UI.toast(\'Audit log cleared\');}">Clear Log</button>' : '')
    });
  },

  changePassword: function() {
    var html = UI.field('Current Password', '<input type="password" id="pw-current" placeholder="Enter current password">')
      + UI.field('New Password', '<input type="password" id="pw-new" placeholder="Enter new password (8+ characters)">')
      + UI.field('Confirm New Password', '<input type="password" id="pw-confirm" placeholder="Confirm new password">');
    UI.showModal('Change Password', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
        + ' <button class="btn btn-primary" onclick="SettingsPage._savePassword()">Update Password</button>'
    });
  },

  _savePassword: function() {
    var current = document.getElementById('pw-current').value;
    var newPw = document.getElementById('pw-new').value;
    var confirmPw = document.getElementById('pw-confirm').value;
    if (!current) { UI.toast('Enter your current password', 'error'); return; }
    if (newPw.length < 8) { UI.toast('Password must be at least 8 characters', 'error'); return; }
    if (newPw !== confirmPw) { UI.toast('Passwords do not match', 'error'); return; }

    // Verify current password
    var email = Auth.user ? Auth.user.email : '';
    var hashes = {};
    try { hashes = JSON.parse(localStorage.getItem('bm-auth-hashes') || '{}'); } catch(e) {}
    var storedHash = hashes[email.toLowerCase()];
    // Default users are a first-install fallback only; real accounts use hashes stored in localStorage.
    var defaultUsers = {};
    if (typeof BM_CONFIG !== 'undefined' && BM_CONFIG.email) {
      defaultUsers[BM_CONFIG.email.toLowerCase()] = '28006cfd';
    }
    var expectedHash = storedHash || defaultUsers[email.toLowerCase()];
    if (expectedHash && Auth._hash(current) !== expectedHash) {
      UI.toast('Current password is incorrect', 'error');
      return;
    }

    hashes[email.toLowerCase()] = Auth._hash(newPw);
    localStorage.setItem('bm-auth-hashes', JSON.stringify(hashes));
    UI.closeModal();
    UI.toast('Password updated!');
  },

  _saveWorkSettings: function() {
    localStorage.setItem('bm-work-start', document.getElementById('ws-start').value);
    localStorage.setItem('bm-work-end', document.getElementById('ws-end').value);
    localStorage.setItem('bm-ot-threshold', document.getElementById('ws-ot').value);
    localStorage.setItem('bm-pay-period', document.getElementById('ws-pay').value);
    localStorage.setItem('bm-min-job-hrs', document.getElementById('ws-min-job').value);
    localStorage.setItem('bm-crew-see-client', document.getElementById('ws-crew-client').checked ? 'true' : 'false');
    // Save per-day business hours
    ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].forEach(function(day) {
      var el = document.getElementById('bh-' + day);
      if (el) localStorage.setItem('bm-bh-' + day, el.value.trim());
    });
    UI.toast('Work settings saved');
  },

  _saveNotifSettings: function() {
    ['notif-quote-approved','notif-payment','notif-new-request','notif-overdue','notif-job-completed','notif-daily-summary'].forEach(function(id) {
      localStorage.setItem('bm-' + id, document.getElementById(id).checked ? 'true' : 'false');
    });
    UI.toast('Notification preferences saved');
  },

  _saveQuoteDefaults: function() {
    localStorage.setItem('bm-payment-terms', document.getElementById('qd-terms').value);
    localStorage.setItem('bm-default-deposit', document.getElementById('qd-deposit').value);
    localStorage.setItem('bm-quote-validity', document.getElementById('qd-validity').value);
    localStorage.setItem('bm-show-line-prices', document.getElementById('qd-show-prices').checked ? 'true' : 'false');
    UI.toast('Quote & invoice defaults saved');
  },

  _saveClientFacing: function() {
    var termEl = document.getElementById('cf-quote-term');
    if (termEl) localStorage.setItem('bm-quote-term', termEl.checked ? 'estimate' : 'quote');
    var sigEl = document.getElementById('cf-require-sig');
    if (sigEl) localStorage.setItem('bm-require-quote-sig', sigEl.checked ? 'true' : 'false');
    var tipsEl = document.getElementById('cf-tips');
    if (tipsEl) localStorage.setItem('bm-tips-enabled', tipsEl.checked ? 'true' : 'false');
    var receiptEl = document.getElementById('cf-auto-receipt');
    if (receiptEl) localStorage.setItem('bm-auto-receipt', receiptEl.checked ? 'true' : 'false');
    var qtyEl = document.getElementById('cf-show-qty');
    if (qtyEl) localStorage.setItem('bm-pdf-show-qty', qtyEl.checked ? 'true' : 'false');
    var upEl = document.getElementById('cf-show-unit-price');
    if (upEl) localStorage.setItem('bm-pdf-show-unit-price', upEl.checked ? 'true' : 'false');
    var tcEl = document.getElementById('cf-tc-url');
    if (tcEl) localStorage.setItem('bm-tc-url', tcEl.value.trim());
    UI.toast('Client-facing options saved ✅');
  },

  _saveCommTemplates: function() {
    var keys = ['bookingConfirm_email_subject','bookingConfirm_email_body','bookingConfirm_sms','visitReminder_sms_1hr','visitReminder_email_1day','quoteFollowUp_5day','quoteFollowUp_10day','invoiceReminder_1day_overdue','invoiceReminder_4day_overdue','reviewRequest_email'];
    var out = {};
    keys.forEach(function(k){
      var el = document.getElementById('tpl-' + k);
      if (el && el.value.trim()) out[k] = el.value;
    });
    localStorage.setItem('bm-comm-templates', JSON.stringify(out));
    UI.toast('Message templates saved');
  },

  _saveClientHub: function() {
    var out = {
      headline: (document.getElementById('hub-headline').value || '').trim(),
      sub:      (document.getElementById('hub-sub').value || '').trim()
    };
    ['showQuotes','showInvoices','showUpcoming','showHistory','showPhotos','showDocs','showContact'].forEach(function(k){
      var el = document.getElementById('hub-' + k);
      out[k] = el ? !!el.checked : true;
    });
    localStorage.setItem('bm-client-hub', JSON.stringify(out));
    UI.toast('Client Hub settings saved');
  },

  _saveBookingSettings: function() {
    ['bf-enabled','bf-auto-response','bf-require-phone','bf-require-address','bf-show-services'].forEach(function(id) {
      localStorage.setItem('bm-booking-' + id.replace('bf-',''), document.getElementById(id).checked ? 'true' : 'false');
    });
    UI.toast('Booking settings saved');
  },

  _saveReviewSettings: function() {
    localStorage.setItem('bm-review-google-url', document.getElementById('rev-google-url').value.trim());
    localStorage.setItem('bm-review-send-after', document.getElementById('rev-send-after').value);
    localStorage.setItem('bm-review-delay', document.getElementById('rev-delay').value);
    localStorage.setItem('bm-review-auto', document.getElementById('rev-auto').checked ? 'true' : 'false');
    UI.toast('Review settings saved');
  },

  _saveLocationSettings: function() {
    localStorage.setItem('bm-gps-tracking', document.getElementById('loc-tracking').checked ? 'true' : 'false');
    localStorage.setItem('bm-gps-work-only', document.getElementById('loc-work-only').checked ? 'true' : 'false');
    localStorage.setItem('bm-geofence', document.getElementById('loc-geofence').checked ? 'true' : 'false');
    UI.toast('Location settings saved');
  },

  // ── Passive Location Tracking (BETA) ──
  _togglePassiveTracking: function(on) {
    localStorage.setItem('bm-passive-track', on ? 'true' : 'false');
    if (on) {
      // Ask for permission up front so the real start doesn't fail silently
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(function(res) {
          if (res.state === 'denied') {
            UI.toast('Location permission denied — enable in browser settings', 'error');
          }
        }).catch(function(){});
      }
      if (typeof PassiveTracker !== 'undefined' && PassiveTracker.start) {
        PassiveTracker.start();
      }
      UI.toast('Passive tracking ON');
    } else {
      if (typeof PassiveTracker !== 'undefined' && PassiveTracker.stop) {
        PassiveTracker.stop();
      }
      UI.toast('Passive tracking OFF');
    }
    // Re-render so the inputs enable/disable correctly
    setTimeout(function(){ loadPage('settings'); }, 300);
  },

  _savePassiveSettings: function() {
    var intEl = document.getElementById('passive-interval');
    var radEl = document.getElementById('passive-dwell-radius');
    var minEl = document.getElementById('passive-dwell-minutes');
    var clamp = function(v, lo, hi) { v = parseInt(v, 10); if (isNaN(v)) return lo; return Math.max(lo, Math.min(hi, v)); };
    if (intEl) localStorage.setItem('bm-passive-interval', String(clamp(intEl.value, 30, 600)));
    if (radEl) localStorage.setItem('bm-passive-dwell-radius', String(clamp(radEl.value, 20, 200)));
    if (minEl) localStorage.setItem('bm-passive-dwell-minutes', String(clamp(minEl.value, 15, 240)));
    // Tell the tracker to pick up new settings if it's running
    if (typeof PassiveTracker !== 'undefined' && PassiveTracker.applySettings) {
      PassiveTracker.applySettings();
    }
    UI.toast('Saved');
  }
};
