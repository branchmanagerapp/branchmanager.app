/**
 * Branch Manager — Help & Onboarding
 * Quick-start checklist, feature overview, FAQ, and shortcuts
 */
var HelpPage = {

  render: function() {
    var checks = HelpPage._getChecks();
    var done   = checks.filter(function(c) { return c.ok; }).length;
    var pct    = Math.round(done / checks.length * 100);
    var color  = pct === 100 ? '#059669' : pct >= 60 ? '#d97706' : '#dc2626';

    var html = '<div style="max-width:860px;margin:0 auto;padding:0 0 40px;">';

    // ── Setup progress banner ────────────────────────────────────────────
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:14px;padding:22px 24px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.05);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'
      + '<div>'
      + '<div style="font-size:17px;font-weight:800;color:var(--text);">🚀 Setup Progress</div>'
      + '<div style="font-size:13px;color:var(--text-light);margin-top:3px;">' + done + ' of ' + checks.length + ' steps complete</div>'
      + '</div>'
      + '<div style="font-size:28px;font-weight:900;color:' + color + ';">' + pct + '%</div>'
      + '</div>'
      + '<div style="background:#f1f5f9;border-radius:8px;height:8px;overflow:hidden;">'
      + '<div style="background:' + color + ';height:100%;width:' + pct + '%;border-radius:8px;transition:width .4s;"></div>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin-top:16px;">'
      + checks.map(function(c) {
          return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;background:' + (c.ok ? '#f0fdf4' : '#fafafa') + ';border:1px solid ' + (c.ok ? '#bbf7d0' : 'var(--border)') + ';">'
            + '<span style="font-size:16px;flex-shrink:0;">' + (c.ok ? '✅' : '⬜') + '</span>'
            + '<div>'
            + '<div style="font-size:13px;font-weight:' + (c.ok ? '600' : '500') + ';color:' + (c.ok ? '#166534' : 'var(--text)') + ';">' + c.label + '</div>'
            + (!c.ok && c.action ? '<a onclick="' + c.action + '" style="font-size:11px;color:var(--accent);cursor:pointer;text-decoration:underline;">' + c.cta + '</a>' : '')
            + '</div>'
            + '</div>';
        }).join('')
      + '</div>'
      + '</div>';

    // ── Module overview grid ────────────────────────────────────────────
    html += '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:12px;">📦 What\'s in Branch Manager</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-bottom:24px;">';
    HelpPage._modules().forEach(function(m) {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:16px 18px;cursor:pointer;" onclick="loadPage(\'' + m.page + '\')">'
        + '<div style="font-size:20px;margin-bottom:6px;">' + m.icon + '</div>'
        + '<div style="font-size:13px;font-weight:700;color:var(--text);">' + m.name + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-top:3px;line-height:1.4;">' + m.desc + '</div>'
        + '</div>';
    });
    html += '</div>';

    // ── FAQ ─────────────────────────────────────────────────────────────
    html += '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:12px;">❓ Frequently Asked Questions</div>';
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:24px;">';
    HelpPage._faqs().forEach(function(faq, i) {
      html += '<details style="border-bottom:1px solid var(--border);">'
        + '<summary style="padding:14px 18px;cursor:pointer;font-size:13px;font-weight:700;color:var(--text);list-style:none;display:flex;justify-content:space-between;align-items:center;">'
        + '<span>' + faq.q + '</span>'
        + '<span style="color:var(--text-light);font-size:18px;line-height:1;">+</span>'
        + '</summary>'
        + '<div style="padding:0 18px 14px;font-size:13px;color:var(--text-light);line-height:1.6;">' + faq.a + '</div>'
        + '</details>';
    });
    html += '</div>';

    // ── Quick tips ──────────────────────────────────────────────────────
    html += '<div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:12px;">⚡ Quick Tips</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-bottom:24px;">';
    HelpPage._tips().forEach(function(tip) {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">'
        + '<div style="font-size:12px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">' + tip.tag + '</div>'
        + '<div style="font-size:13px;color:var(--text);line-height:1.5;">' + tip.text + '</div>'
        + '</div>';
    });
    html += '</div>';

    // ── Contact / support ────────────────────────────────────────────────
    html += '<div style="background:linear-gradient(135deg,#1a3c12,#00836c);border-radius:14px;padding:24px 28px;color:#fff;text-align:center;">'
      + '<div style="font-size:22px;font-weight:900;margin-bottom:8px;">Need help?</div>'
      + '<div style="font-size:14px;opacity:.85;margin-bottom:18px;">Branch Manager is built by ' + UI.esc(CompanyInfo.get('name')) + '. Have a question or found a bug?</div>'
      + '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">'
      + '<a href="mailto:' + UI.esc(CompanyInfo.get('email')) + '" style="background:rgba(255,255,255,.15);color:#fff;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;border:1px solid rgba(255,255,255,.3);">📧 Email Us</a>'
      + '<a href="tel:9143915233" style="background:#fff;color:#1a3c12;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">📞 (914) 391-5233</a>'
      + '</div>'
      + '</div>';

    html += '</div>';
    return html;
  },

  _getChecks: function() {
    var co = typeof CompanyInfo !== 'undefined' ? CompanyInfo : { get: function() { return ''; } };
    var clients = typeof DB !== 'undefined' ? DB.clients.getAll() : [];
    var quotes  = typeof DB !== 'undefined' ? DB.quotes.getAll()  : [];
    var jobs    = typeof DB !== 'undefined' ? DB.jobs.getAll()    : [];
    var stripeOk = !!(localStorage.getItem('bm-stripe-base-link'));
    var notifOk  = !!(localStorage.getItem('bm-push-registered') || Notification.permission === 'granted');

    return [
      {
        label:  'Company name & phone',
        ok:     !!(co.get('name') && co.get('phone')),
        action: 'loadPage(\'settings\')',
        cta:    'Go to Settings →'
      },
      {
        label:  'Logo uploaded',
        ok:     !!(co.get('logo')),
        action: 'loadPage(\'settings\')',
        cta:    'Add logo →'
      },
      {
        label:  'Google Review link set',
        ok:     !!(co.get('googleReviewUrl')),
        action: 'loadPage(\'settings\')',
        cta:    'Add review link →'
      },
      {
        label:  'Stripe payment link',
        ok:     stripeOk,
        action: 'loadPage(\'settings\')',
        cta:    'Configure in Settings →'
      },
      {
        label:  'Tax rate configured',
        ok:     !!(co.get('taxRate') && parseFloat(co.get('taxRate')) > 0),
        action: 'loadPage(\'settings\')',
        cta:    'Set tax rate →'
      },
      {
        label:  'First client added',
        ok:     clients.length > 0,
        action: 'loadPage(\'clients\')',
        cta:    'Add first client →'
      },
      {
        label:  'First quote sent',
        ok:     quotes.some(function(q) { return q.status === 'sent' || q.status === 'approved' || q.status === 'converted'; }),
        action: 'loadPage(\'quotes\')',
        cta:    'Create a quote →'
      },
      {
        label:  'First job scheduled',
        ok:     jobs.length > 0,
        action: 'loadPage(\'jobs\')',
        cta:    'Schedule a job →'
      },
      {
        label:  'Push notifications on',
        ok:     notifOk,
        action: 'loadPage(\'settings\')',
        cta:    'Enable notifications →'
      }
    ];
  },

  _modules: function() {
    return [
      { icon: '👥', name: 'Clients',        page: 'clients',      desc: 'Client list, property details, notes, and history.' },
      { icon: '📋', name: 'Quotes',          page: 'quotes',       desc: 'Build and send professional quotes. Customers approve online.' },
      { icon: '🔨', name: 'Jobs',            page: 'jobs',         desc: 'Schedule and track jobs. Assign crew, add notes, close out.' },
      { icon: '🧾', name: 'Invoices',        page: 'invoices',     desc: 'Create invoices, send online payment links, track balances.' },
      { icon: '📅', name: 'Schedule',        page: 'schedule',     desc: 'Day-by-day view of all scheduled jobs and crew.' },
      { icon: '🚚', name: 'Dispatch',        page: 'dispatch',     desc: 'Map-based dispatch. Drag-drop routes, real-time truck positions.' },
      { icon: '💰', name: 'Payments',        page: 'payments',     desc: 'Payment history across all invoices. Stripe sync.' },
      { icon: '📣', name: 'Requests',        page: 'requests',     desc: 'Inbound leads from book.html and Dialpad. One-click quote.' },
      { icon: '📞', name: 'Leads Center',    page: 'callcenter',   desc: 'Missed calls, voicemails, emails, and message threads.' },
      { icon: '✅', name: 'Tasks',           page: 'taskreminders', desc: 'Internal task list with categories, due dates, and bulk-complete.' },
      { icon: '🌿', name: 'Marketing',       page: 'marketing',    desc: 'Automated review requests, quote follow-ups, and upsell emails.' },
      { icon: '🚛', name: 'Fleet',           page: 'operations',   desc: 'Truck tracking via Bouncie OBD-II. Live positions + trip history.' },
      { icon: '🛠️', name: 'Equipment',       page: 'equipment',    desc: 'Equipment list with manuals, maintenance records, and parts.' },
      { icon: '📊', name: 'Reports',         page: 'reports',      desc: 'Revenue, P&L, crew performance, job costing.' },
      { icon: '⚙️', name: 'Settings',        page: 'settings',     desc: 'Company info, logo, social links, integrations, and defaults.' },
      { icon: '🤖', name: 'AI Assistant',    page: 'ai',           desc: 'Ask anything — quote help, client notes, compliance questions.' }
    ];
  },

  _faqs: function() {
    return [
      {
        q: 'How do I send a quote to a customer?',
        a: 'Go to <strong>Quotes → New Quote</strong>, pick the client, add line items, then click <strong>Send Quote</strong>. The customer gets an email with a "View & Approve Quote" button. They approve online — no login needed. Once approved, BM auto-prompts you to convert it to a job.'
      },
      {
        q: 'How does online payment work?',
        a: 'Set up your Stripe Payment Link in <strong>Settings → Integrations → Stripe</strong>. When you send an invoice, the customer opens <strong>pay.html</strong> and pays with a card. Stripe processes it and the stripe-webhook marks the invoice paid in BM automatically.'
      },
      {
        q: 'Where do I set up the Google Review link?',
        a: 'Settings → Social & Reviews → Google Review Link. Paste your <code>g.page/r/...</code> URL. It appears automatically in every quote and invoice email you send.'
      },
      {
        q: 'How do I add my logo to quotes and invoices?',
        a: 'Settings → Company Info → Logo URL. Paste a hosted image URL (Dropbox public link, Imgur, Google Drive share link, etc.). It replaces the 🌳 icon on email headers and the pay page.'
      },
      {
        q: 'How do customers pay online?',
        a: 'Every invoice gets a <code>pay.html?id=INVOICE_ID</code> link. The customer sees the invoice details, an optional tip selector, and a "Pay with Card" button. Stripe handles the payment securely.'
      },
      {
        q: 'What does the fleet tracking do?',
        a: 'Once Bouncie OBD-II dongles are plugged into your trucks, live positions appear on the Dispatch map as green dots. The bouncie-webhook edge function receives trip data and stores it in Supabase.'
      },
      {
        q: 'How does the marketing automation work?',
        a: 'A Supabase cron job runs every 4 hours and checks for: (1) completed jobs without a review request → sends one, (2) sent quotes with no response after 7 days → sends a follow-up, (3) paid invoices after 30 days → sends an upsell email. All idempotent — customers never get duplicates.'
      },
      {
        q: 'How do I add inbound phone leads automatically?',
        a: 'Plug the Dialpad webhook URL into <strong>Dialpad Admin → Automations → Webhooks</strong>: <code>https://ltpivkqahvplapyagljt.supabase.co/functions/v1/dialpad-webhook</code>. Missed calls and voicemails auto-create rows in the Requests page.'
      },
      {
        q: 'Can I use Branch Manager on my phone?',
        a: 'Yes — it\'s a PWA. On iPhone, open <strong>branchmanager.app</strong> in Safari and tap <strong>Share → Add to Home Screen</strong>. It runs full-screen like a native app with offline caching.'
      },
      {
        q: 'How do I force-refresh to get the latest version?',
        a: 'Pull down to refresh. If the version badge in the top-right doesn\'t update, go to Settings → scroll to the bottom → Clear Cache & Reload. The SW cache is flushed and the latest version loads.'
      }
    ];
  },

  _tips: function() {
    return [
      { tag: 'Quotes',    text: 'Use the "👁 Preview Email" button before sending — see exactly what the customer sees.' },
      { tag: 'Quotes',    text: 'Approve a quote and BM asks you to convert it to a job automatically.' },
      { tag: 'Invoices',  text: 'Send pay.html links directly from the Invoice detail — no manual copy-paste.' },
      { tag: 'Schedule',  text: 'Tap any day on the calendar to jump to that date\'s schedule.' },
      { tag: 'Dispatch',  text: 'Long-press a job pin on the map to reassign it to a different crew.' },
      { tag: 'Requests',  text: 'One-tap "Convert to Quote" on any inbound request creates a pre-filled draft.' },
      { tag: 'Fleet',     text: 'Bouncie updates every 15 seconds while a truck is moving.' },
      { tag: 'Marketing', text: 'Review request emails fire ~22 hours after a job is marked complete.' },
      { tag: 'Settings',  text: 'Set your tax rate once in Settings — it auto-applies to every new quote.' },
      { tag: 'AI',        text: 'Ask the AI Assistant to draft a client note, scope description, or follow-up email.' }
    ];
  }

};
