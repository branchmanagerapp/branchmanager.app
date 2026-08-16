/* Second Nature shared nav v3 — traditional top bar + dropdowns (desktop), hamburger drawer (mobile). */
(function () {
  if (window.__sntNav) return; window.__sntNav = 3;
  var SECTIONS = [
    ["🎯 Daily", [
      ["🛰 Ground Control", "ground-control-7c3f9a.html"],
      ["🏛 Bid Command Center", "bids-snt-4e7b2c.html"],
      ["🧭 The Plan", "plan-snt-8c31d7.html"],
      ["📋 Go-live queue", "accountability-a1f7.html"],
      ["📄 Today sheet", "today-snt-9d4b1e.html"],
      ["🚚 Run schedule", "schedule-snt-c47a2e.html"],
      ["💰 Estimates board", "estimates-snt-4b8e2f.html"],
      ["🗺 Estimates map", "estimates-map-3f9c21.html"],
      ["🕊 Enough", "enough-snt-7b7e05.html"]
    ]],
    ["🏛 Bids", [
      ["🏛 Bid Command Center", "bids-snt-4e7b2c.html"],
      ["🤝 Bid partners", "bids-partners-4e7a91.html"],
      ["🔨 Brink jobs", "brink-jobs-9e4c17.html"],
      ["⚡ Line clearance & rates", "line-clearance-9f3a72.html"],
      ["🌩 Storm work", "storm-work-4e7a21.html"]
    ]],
    ["🌳 Money", [
      ["📊 Fleet & budget", "fleet-budget-b1e454.html"],
      ["🚛 Fleet detail", "fleet-full-5e88b2.html"],
      ["🏦 Tree cash 0606", "tree-cash-0606-9f2c.html"],
      ["🚜 Giant loader", "giant-loader-8fd740.html"],
      ["🧾 Payroll status", "payroll-status-6d92c4.html"],
      ["🏗 Operating architecture", "operating-architecture.html"],
      ["📚 Recovery plan", "snt-plan.html"]
    ]],
    ["🌱 SmartLawn", [
      ["🗺 Plan", "smartlawn-plan-9e8220.html"],
      ["🤖 Fleet app", "smartlawn-fleet.html"],
      ["🏷 Navimow promos", "navimow-promos-8a3f.html"],
      ["📞 Follow-ups", "smartlawn-followups-8d42c7.html"]
    ]],
    ["💡 Ideas", [
      ["💡 Business Ideas", "ideas-snt-6b3d91.html"],
      ["🐐 Goat land clearing", "goat-clearing-9a4e17.html"],
      ["🤝 SNT × BrinkStar options", "snt-brinkstar-7e4a2c.html"],
      ["🚜 Northeast Intrepid", "northeast-intrepid-c83567.html"]
    ]],
    ["🔗 Sites", [
      ["🌿 Branch Manager app", "https://branchmanager.app/"],
      ["🌲 peekskilltree.com", "https://peekskilltree.com"],
      ["🛼 skateOS /j2", "https://skateos.com/j2"],
      ["📣 Marketing hub", "marketing-hub.html"]
    ]],
    ["🗂 Index", [
      ["🗂 Full Index (all pages)", "hub-570301.html"]
    ]]
  ];
  var css = ''
    + '#snt-top{position:fixed;top:0;left:0;right:0;z-index:2147483000;background:#131b16;border-bottom:1px solid #26312a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.35)}'
    + '#snt-top .in{max-width:1100px;margin:0 auto;display:flex;align-items:center;gap:2px;height:48px;padding:0 10px}'
    + '#snt-brand{color:#e8eee9;font-weight:800;font-size:15px;text-decoration:none;margin-right:10px;white-space:nowrap}'
    + '.snt-mi{position:relative}'
    + '.snt-mi>button{background:none;border:none;color:#cdd8d0;font-size:13.5px;font-weight:600;padding:8px 10px;border-radius:8px;cursor:pointer;white-space:nowrap}'
    + '.snt-mi>button:hover,.snt-mi.open>button{background:#1e2a22;color:#fff}'
    + '.snt-dd{display:none;position:absolute;top:100%;left:0;min-width:230px;background:#18211b;border:1px solid #2a362e;border-radius:12px;padding:6px;box-shadow:0 10px 30px rgba(0,0,0,.5)}'
    + '.snt-mi.open .snt-dd{display:block}'
    + '.snt-dd a{display:block;color:#dfe8e1;text-decoration:none;font-size:13.5px;padding:9px 10px;border-radius:8px;white-space:nowrap}'
    + '.snt-dd a:hover,.snt-dd a.here{background:#22302a}'
    + '.snt-dd a.here{color:#4fc47f}'
    + '#snt-burger{display:none;margin-left:auto;background:none;border:none;color:#e8eee9;font-size:22px;cursor:pointer;padding:6px 10px}'
    + '@media(max-width:767px){.snt-mi{display:none}#snt-burger{display:block}}'
    + '#snt-nav-ovl{position:fixed;inset:0;z-index:2147483001;background:rgba(10,16,12,.97);overflow-y:auto;display:none;-webkit-overflow-scrolling:touch;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'
    + '#snt-nav-ovl.open{display:block}'
    + '.snt-nav-in{max-width:560px;margin:0 auto;padding:18px 16px 60px}'
    + '.snt-nav-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}'
    + '.snt-nav-top b{color:#e8eee9;font-size:17px}'
    + '#snt-nav-x{background:none;border:none;color:#93a096;font-size:26px;cursor:pointer;padding:6px}'
    + '.snt-nav-h{color:#e8b64c;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;font-weight:800;margin:16px 0 4px}'
    + '.snt-nav-a{display:block;color:#e8eee9;text-decoration:none;font-size:16px;padding:10px 8px;border-radius:9px}'
    + '.snt-nav-a:active,.snt-nav-a.here{background:#1c2620}'
    + '.snt-nav-a.here{color:#4fc47f}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var here = location.pathname.split('/').pop();
  function linkHtml(it, cls) {
    var href = it[1], abs = /^https?:/i.test(href) ? href : '/' + href;
    var isHere = !/^https?:/i.test(href) && href === here;
    return '<a class="' + cls + (isHere ? ' here' : '') + '" href="' + abs + '">' + it[0] + '</a>';
  }

  // ── Top bar ──
  var bar = document.createElement('nav'); bar.id = 'snt-top';
  var h = '<div class="in"><a id="snt-brand" href="/ground-control-7c3f9a.html">🌳 Second Nature</a>';
  SECTIONS.forEach(function (sec, i) {
    h += '<div class="snt-mi" data-i="' + i + '"><button type="button">' + sec[0] + ' ▾</button><div class="snt-dd">';
    sec[1].forEach(function (it) { h += linkHtml(it, ''); });
    h += '</div></div>';
  });
  h += '<button id="snt-burger" type="button" title="Menu">☰</button></div>';
  bar.innerHTML = h;
  document.body.appendChild(bar);
  // push page content below the fixed bar
  var curPad = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
  document.body.style.paddingTop = (curPad + 52) + 'px';

  // dropdown toggling (click; one open at a time; outside click closes)
  bar.addEventListener('click', function (e) {
    var mi = e.target.closest('.snt-mi');
    if (mi && e.target.tagName === 'BUTTON') {
      var was = mi.classList.contains('open');
      bar.querySelectorAll('.snt-mi.open').forEach(function (m) { m.classList.remove('open'); });
      if (!was) mi.classList.add('open');
    }
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#snt-top')) bar.querySelectorAll('.snt-mi.open').forEach(function (m) { m.classList.remove('open'); });
  });

  // ── Mobile drawer (hamburger) ──
  var ovl = document.createElement('div'); ovl.id = 'snt-nav-ovl';
  var oh = '<div class="snt-nav-in"><div class="snt-nav-top"><b>🌳 Second Nature — navigate</b><button id="snt-nav-x" type="button">✕</button></div>';
  SECTIONS.forEach(function (sec) {
    oh += '<div class="snt-nav-h">' + sec[0] + '</div>';
    sec[1].forEach(function (it) { oh += linkHtml(it, 'snt-nav-a'); });
  });
  oh += '</div>';
  ovl.innerHTML = oh;
  document.body.appendChild(ovl);
  document.getElementById('snt-burger').addEventListener('click', function () { ovl.classList.add('open'); });
  ovl.addEventListener('click', function (e) { if (e.target.id === 'snt-nav-x') ovl.classList.remove('open'); });
})();

/* ── Per-page "How this works" tutorial footer ── */
(function () {
  if (window.__sntHelp) return; window.__sntHelp = 1;
  var HELP = {
    "ground-control-7c3f9a.html": "This is the front door. The calendar up top: swipe or use arrows to change month, tap any day to see that day's agenda, toggle Month/Agenda view. Below it: what needs doing right now, then money items, then everything else. Claude keeps the events and lists current — if something's wrong here, say so in chat and it gets fixed at the source.",
    "bids-snt-4e7b2c.html": "The whole government-bid push on one page. Deadlines at top (red = hard). The checkboxes are yours — tap as you finish; they save on this phone only. Arborist bench has the call list and the exact pitch to read. Links at bottom jump to BidNet, the BPCA addendum page, and related research.",
    "plan-snt-8c31d7.html": "The master priority page. ONE thing under Right Now — do that first. This Week holds four max, in order. Parked-on-purpose is stuff deliberately let go — no guilt. When priorities shift, tell Claude and this page is updated, not your memory.",
    "accountability-a1f7.html": "The master work queue. Claude pulls from the top and does one item to completion before the next. To add work, say it in chat — it lands here. To reprioritize, say which item goes first.",
    "today-snt-9d4b1e.html": "Printable one-pager for the day. Tap ⎙ to print. Say 'today sheet' any morning and it regenerates from the current plan and estimate board at this same address.",
    "schedule-snt-c47a2e.html": "The crew run plan — jobs in drive order with times and links that open the actual Branch Manager records.",
    "estimates-snt-4b8e2f.html": "Every open quote, freshest revenue first. Each row carries a date and age chip so old leads never masquerade as urgent. When a quote's status changes, tell Claude — the board updates, not your memory.",
    "estimates-map-3f9c21.html": "Open quotes and jobs on a map. Green = quote, blue = sent, gray = done. Ask Claude to re-generate after estimates change.",
    "workflow-snt-e82c4b.html": "How Doug, Catherine and Claude work together — the status words, who does what, field rules. Read once, reference forever.",
    "enough-snt-7b7e05.html": "The breathe page. Read top to bottom when everything feels like too much. It points at the real lists so you don't have to hold anything in your head.",
    "fleet-budget-b1e454.html": "The live operating numbers — fleet, monthly burn, budget. Tell Claude when a cost changes and this page follows.",
    "tree-cash-0606-9f2c.html": "Snapshot of the M&T 0606 checking picture as of the last books sync.",
    "snt-plan.html": "The 8-chapter recovery plan. Read in order: numbers → cashflow → fleet → trucks → employees → fix → decision → action. Each chapter links to the next.",
    "hub-570301.html": "Every page ever built, organized. Type in the filter box to find anything instantly. The Archive at the bottom holds older iterations — nothing is deleted.",
    "line-clearance-9f3a72.html": "Market research: what crews bill by certification, who the Northeast primes are (Clearway is the realistic one to approach), and the qualification path into utility line-clearance work.",
    "payroll-status-6d92c4.html": "Where payroll stands right now — who's on it, what's synced between phone and desktop.",
    "payroll-quarterly-guide-3a7f.html": "Step-by-step for the quarterly filings (941s, NYS-45). Follow it top to bottom each quarter.",
    "giant-loader-8fd740.html": "The Giant D254 decision page — repair vs replace math. Current call: ~$1,500 head-gasket fix, keep as backup.",
    "operating-architecture.html": "The three-storefronts-one-back-office model: how Tree, SmartLawn and Skate share one engine without mixing brands.",
    "smartlawn-plan-9e8220.html": "The SmartLawn dealer business plan — positioning, service plans, trade-ins.",
    "smartlawn-fleet.html": "The Navimow fleet-app playbook: customers are operators, migrate per-mower with map retained, invites from the SmartLawn inbox.",
    "navimow-promos-8a3f.html": "Current Navimow promos and real mower costs — pricing source for any mower quote.",
    "catherine-start-b7d3f2.html": "Catherine's page — her links, schedule and agreements in one place.",
    "portfolio-7e21a9.html": "Robinhood snapshot — read-only, refreshed when Doug asks.",
    "networth-4a91c7.html": "The full balance-sheet picture across everything."
  };
  var here = location.pathname.split('/').pop();
  var txt = HELP[here] || "Internal Second Nature page. Use the top menu (or ☰ on your phone) to jump anywhere; the Full Index lists every page ever built. Content on these pages is maintained by Claude — if something looks stale or wrong, say so in chat and it gets fixed.";
  var d = document.createElement('details');
  d.style.cssText = 'max-width:640px;margin:34px auto 70px;padding:0 16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  d.innerHTML = '<summary style="cursor:pointer;color:#8a948f;font-size:13px;padding:8px 0">❓ How this page works</summary>'
    + '<div style="color:#9aa69e;font-size:13.5px;line-height:1.6;background:rgba(127,127,127,.08);border:1px solid rgba(127,127,127,.2);border-radius:12px;padding:12px 14px;margin-top:6px">' + txt + '</div>';
  document.body.appendChild(d);
})();
