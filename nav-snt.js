/* Second Nature shared nav — injected on internal pages only. One source of truth for structure. */
(function () {
  if (window.__sntNav) return; window.__sntNav = 1;
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
    ["🏛 Bids & growth", [
      ["🤝 Bid partners", "bids-partners-4e7a91.html"],
      ["🔨 Brink jobs", "brink-jobs-9e4c17.html"],
      ["⚡ Line clearance & rates", "line-clearance-9f3a72.html"],
      ["🌩 Storm work", "storm-work-4e7a21.html"]
    ]],
    ["🌳 Money & fleet", [
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
    ["🔗 Other sites", [
      ["🌿 Branch Manager app", "https://branchmanager.app/"],
      ["🌲 peekskilltree.com", "https://peekskilltree.com"],
      ["🛼 skateOS /j2", "https://skateos.com/j2"],
      ["📣 Marketing hub", "marketing-hub.html"]
    ]],
    ["🗂 Everything", [
      ["🗂 Full Index (all 148 pages)", "hub-570301.html"]
    ]]
  ];
  var css = '#snt-nav-btn{position:fixed;right:14px;bottom:14px;z-index:2147483000;width:48px;height:48px;border-radius:50%;background:#1f7a43;color:#fff;border:none;font-size:22px;box-shadow:0 4px 14px rgba(0,0,0,.4);cursor:pointer}'
    + '#snt-nav-ovl{position:fixed;inset:0;z-index:2147483001;background:rgba(10,16,12,.96);overflow-y:auto;display:none;-webkit-overflow-scrolling:touch;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'
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
  var btn = document.createElement('button'); btn.id = 'snt-nav-btn'; btn.type = 'button'; btn.title = 'Site navigation'; btn.textContent = '🗂';
  var ovl = document.createElement('div'); ovl.id = 'snt-nav-ovl';
  var here = location.pathname.split('/').pop();
  var h = '<div class="snt-nav-in"><div class="snt-nav-top"><b>🌳 Second Nature — navigate</b><button id="snt-nav-x" type="button">✕</button></div>';
  SECTIONS.forEach(function (sec) {
    h += '<div class="snt-nav-h">' + sec[0] + '</div>';
    sec[1].forEach(function (it) {
      var href = it[1], abs = /^https?:/i.test(href) ? href : '/' + href;
      var cls = (!/^https?:/i.test(href) && href === here) ? 'snt-nav-a here' : 'snt-nav-a';
      h += '<a class="' + cls + '" href="' + abs + '">' + it[0] + '</a>';
    });
  });
  h += '</div>';
  ovl.innerHTML = h;
  document.body.appendChild(btn); document.body.appendChild(ovl);
  btn.addEventListener('click', function () { ovl.classList.add('open'); });
  ovl.addEventListener('click', function (e) { if (e.target.id === 'snt-nav-x') ovl.classList.remove('open'); });
})();
