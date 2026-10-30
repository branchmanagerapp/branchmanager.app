/* KM100 Tele service book — crew page (Oct 27 2026).
 * Talks only to the equipment-log edge function; the link's ?k= key gates it.
 * Checklists come from the Intrepid user manual (2019-04 rev) + parts book rev B (06/2025). */
(() => {
  const API = "https://ltpivkqahvplapyagljt.supabase.co/functions/v1/equipment-log";
  const UNIT = "km100";

  // ---------- static checklists ----------
  const DAILY = [
    {g:"Engine off · walk-around"},
    {k:"damage", t:"Look over the whole machine for damage", d:"Boom, cylinders, hoses, guards, ROPS."},
    {k:"leaks", t:"No leaks", d:"Hydraulic fluid, fuel, coolant, battery acid. Never feel for a hydraulic leak with your hand."},
    {k:"tires", t:"Tires — no cuts or sharp objects; pressure right", d:"Pressure is on the sticker on the machine."},
    {k:"belt", t:"Fan belt play ¼–⅜″", d:"Push with your thumb at the longest span."},
    {k:"oil", t:"Engine oil between MIN and MAX", d:"Engine cold. Dipstick is next to the exhaust."},
    {k:"coolant", t:"Coolant between LOW and FULL", d:"Reservoir in engine bay. Never open the radiator hot."},
    {k:"hyd", t:"Hydraulic fluid at the bottom red mark", d:"Sight glass. Too high → call the dealer."},
    {k:"prefilter", t:"Cyclone pre-filter clean", d:"At the back. Empty and wipe if dusty."},
    {k:"grease", t:"Grease hinge points & mounting plate pins", d:"Until grease comes out. NLGI 2."},
    {k:"brake", t:"Park brake holds", d:"Brake fully on, try to drive forward and back — it must not move."},
    {g:"Engine running"},
    {k:"dash", t:"All dash lights come on, then go out", d:"Engine temp light stays off — that's normal."},
    {k:"lights", t:"Work lights work", d:"If fitted."},
    {k:"controls", t:"Levers, steering and pedals all work", d:""},
    {k:"boom", t:"Tele boom slides out and in smoothly", d:""},
    {k:"attach", t:"Attachment works", d:"Bucket, forks, grapple — whatever is on."}
  ];
  const T = {
    oil50:{t:"Change engine oil (break-in)", d:"Drain warm. 15W-40 or 10W-30, API CD+. Fill to dipstick. Ask Miniloaders if they want the filter done too."},
    oil:{t:"Change engine oil", d:"Drain warm. 15W-40 or 10W-30, API CD+."},
    oilf:{t:"Replace engine oil filter", d:"Intrepid 42011739. Oil the new gasket; hand-tight + ¾ turn."},
    air:{t:"Replace air filter — outer and inner", d:"Intrepid 42001570 + 42001571."},
    lube:{t:"Grease the other lube points", d:"Manual p.40 diagram (below)."},
    cooler:{t:"Clean engine oil cooler / radiator fins", d:"Blow out from the engine side."},
    fwater:{t:"Drain water from fuel filter", d:""},
    tank:{t:"Check fuel tank for rust or damage", d:"Inside and outside."},
    fuelf:{t:"Replace fuel filter + pre-filter", d:"Intrepid 42021572 + 42021580. Bleed air after."},
    hydf:{t:"Replace hydraulic filter", d:"Intrepid 42031582. Pre-fill with oil first. Top up at sight glass."},
    stickers:{t:"Replace any hard-to-read safety stickers", d:""},
    hydfluid:{t:"Drain and replace hydraulic fluid", d:"Total Azolla ZS 46. Fill to bottom red mark at ~68 °F."},
    daily:{t:"Do the full daily check too", d:"Today tab."}
  };
  function tasksFor(m){
    if (m === 50) return ["oil50","daily"];
    const out = ["oil","oilf","air","lube","cooler","fwater","tank"];
    if (m % 300 === 0) out.push("fuelf","hydf");
    if (m % 1200 === 0) out.push("hydfluid");
    if (m === 600 || (m > 600 && (m - 600) % 1200 === 0)) out.push("stickers");
    out.push("daily");
    return out;
  }
  function svcName(m){
    if (m === 50) return "50-hour first service";
    let n = m + "-hour service";
    if (m % 1200 === 0) n += " (incl. hydraulic fluid)";
    else if (m % 300 === 0) n += " (incl. fuel + hyd. filters)";
    return n;
  }
  const MILESTONES = [50]; for (let m = 150; m <= 6000; m += 150) MILESTONES.push(m);
  const SLOTS = [
    {k:"serial", t:"Serial plate", d:"Machine ID plate on the frame"},
    {k:"engine", t:"Engine tag", d:"Kubota label on the engine block"},
    {k:"oilfilter", t:"Oil filter on machine", d:"Get the printed number in frame"},
    {k:"airfilter", t:"Air filter", d:"Label on the element"},
    {k:"fuelfilter", t:"Fuel filter", d:""},
    {k:"hydfilter", t:"Hydraulic filter", d:""},
    {k:"hourmeter", t:"Hour meter", d:"Dash, with date"},
    {k:"tirepsi", t:"Tire pressure sticker", d:""},
    {k:"other", t:"Other", d:"Damage, leaks, receipts"}
  ];

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const today = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const fmtDate = iso => { if (!iso) return ""; const [y,m,d] = String(iso).slice(0,10).split("-").map(Number); return new Date(y,m-1,d).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}); };
  const fmtH = h => (h == null || isNaN(h)) ? "----.-" : Number(h).toFixed(1);
  const ls = { get(k,f){ try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch { return f; } }, set(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  let toastT; function toast(msg){ const el = $("#toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 3500); }

  // ---------- access key: from the link, remembered on this phone ----------
  // Remembered only after the server accepts it, so a mistyped link can't wipe a good saved key.
  let KEY = new URLSearchParams(location.search).get("k") || ls.get("km100.k", "");
  async function api(action, body = {}){
    const r = await fetch(API, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({k: KEY, unit: UNIT, action, ...body}) });
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) throw Object.assign(new Error(j.error || ("HTTP " + r.status)), {status: r.status});
    return j;
  }

  // ---------- state ----------
  const S = { hours: [], daily: [], services: [], photos: [], machine: {}, files: {}, online: false };
  async function load(){
    if (!KEY){ $("#keyNote").hidden = false; return; }
    try {
      const j = await api("state");
      S.hours = (j.hours || []).map(r => ({h: Number(r.hours), date: r.reading_date, at: r.created_at}));
      const checks = j.checks || [];
      S.daily = checks.filter(c => c.kind === "daily").map(c => ({date: c.check_date, name: c.done_by, missed: c.skipped || [], note: c.notes, hours: c.hours == null ? null : Number(c.hours)}));
      S.services = checks.filter(c => c.kind === "service").map(c => ({milestone: c.milestone, label: c.label, hours: c.hours == null ? null : Number(c.hours), date: c.check_date, at: c.updated_at, name: c.done_by, done: c.done || [], skipped: c.skipped || [], note: c.notes}));
      S.photos = j.photos || [];
      S.machine = j.info || {};
      S.files = j.files || {};
      ls.set("km100.k", KEY);
      S.online = true; $("#offlineNote").hidden = true; $("#keyNote").hidden = true;
      wireFiles(); renderAll();
    } catch (e){
      if (e.status === 403){ $("#keyNote").hidden = false; $("#keyNote").textContent = "This link's access key isn't valid any more. Ask Doug for the current KM100 link."; }
      else $("#offlineNote").hidden = false;
      renderAll();
    }
  }
  function wireFiles(){
    document.querySelectorAll("img[data-file]").forEach(img => { const u = S.files[img.dataset.file]; if (u && img.src !== u) img.src = u; });
    document.querySelectorAll("a[data-file]").forEach(a => { const u = S.files[a.dataset.file]; if (u){ a.href = u + (a.dataset.frag || ""); a.target = "_blank"; a.rel = "noopener"; } });
  }
  document.addEventListener("click", e => { const a = e.target.closest("a[data-file]"); if (a && !S.files[a.dataset.file]){ e.preventDefault(); toast("Manual still loading — check signal and try again."); } });

  function currentHours(){
    let best = null;
    for (const h of S.hours) if (best == null || h.h > best.h) best = h;
    for (const s of S.services) if (s.hours != null && (best == null || s.hours > best.h)) best = {h: s.hours, date: s.date};
    return best;
  }
  const doneMilestones = () => new Set(S.services.map(s => s.milestone));
  function nextMilestone(){
    const done = doneMilestones();
    const max = Math.max(0, ...done);
    return MILESTONES.find(m => m > max && !done.has(m)) ?? MILESTONES[MILESTONES.length-1];
  }
  function dueState(m){
    const cur = currentHours();
    if (!cur) return {cls:"unknown", rem:null};
    const rem = m - cur.h;
    if (rem < 0) return {cls:"over", rem};
    if (rem <= 15) return {cls:"soon", rem};
    return {cls:"ok", rem};
  }

  // ---------- tabs ----------
  const TABS = ["today","service","parts","manuals"];
  function showTab(name){
    if (!TABS.includes(name)) name = "today";
    for (const t of TABS) $("#tab-"+t).hidden = t !== name;
    document.querySelectorAll("nav.tabs a").forEach(a => { if (a.dataset.go === name) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current"); });
    ls.set("km100.tab", name);
  }
  document.querySelectorAll("nav.tabs a").forEach(a => a.addEventListener("click", e => { e.preventDefault(); showTab(a.dataset.go); try { history.replaceState(null, "", location.pathname + location.search + "#" + a.dataset.go); } catch {} window.scrollTo({top:0}); }));
  showTab((location.hash || "").slice(1) || ls.get("km100.tab","today"));

  // ---------- meter + due ----------
  function renderMeter(){
    const cur = currentHours();
    $("#meterDigits").textContent = fmtH(cur?.h);
    $("#meterWhen").textContent = cur ? "hours · " + fmtDate(cur.date) : "hours · not entered";
    const m = nextMilestone(), st = dueState(m);
    $("#dueCard").className = "due " + st.cls;
    $("#dueBig").textContent = m === 50 ? "First service · 50 hrs" : m + "-hr service";
    $("#dueSub").textContent =
      st.rem == null ? "Enter the hour meter reading above to see how close you are." :
      st.rem < 0 ? "Overdue by " + Math.abs(st.rem).toFixed(1) + " hrs. Do it before the next job — Service tab." :
      st.rem <= 15 ? st.rem.toFixed(1) + " hrs left. Get parts and schedule it — Service tab." :
      st.rem.toFixed(1) + " hrs to go.";
  }

  // ---------- daily ----------
  let dailyDraft = ls.get("km100.daily.draft", {});
  if (dailyDraft.date !== today()) dailyDraft = {date: today(), ok:{}};
  function renderDaily(){
    let html = '<div class="list">';
    for (const it of DAILY){
      if (it.g){ html += '<div class="group-h">'+esc(it.g)+'</div>'; continue; }
      html += '<label class="tick"><input type="checkbox" id="d-'+it.k+'" data-k="'+it.k+'"'+(dailyDraft.ok[it.k]?" checked":"")+'><span><span class="t">'+esc(it.t)+'</span>'+(it.d?'<span class="d">'+esc(it.d)+'</span>':'')+'</span></label>';
    }
    $("#dailyList").innerHTML = html + "</div>";
    $("#dailyList").querySelectorAll("input").forEach(i => i.addEventListener("change", () => { dailyDraft.ok[i.dataset.k] = i.checked; ls.set("km100.daily.draft", dailyDraft); dailyProgress(); }));
    dailyProgress();
  }
  function dailyProgress(){
    const items = DAILY.filter(i => i.k), n = items.filter(i => dailyDraft.ok[i.k]).length;
    $("#dailyBar").style.width = (100*n/items.length) + "%";
    const done = S.daily.find(d => d.date === today()), p = $("#dailyStatus");
    if (done){ const iss = done.missed.length || done.note; p.className = "pill " + (iss ? "soon" : "ok"); p.textContent = iss ? "Done · issues noted" : "Done today"; }
    else { p.className = "pill"; p.textContent = n + " / " + items.length; }
  }
  $("#dailyName").value = ls.get("km100.name","");
  $("#svcWho").value = ls.get("km100.name","");
  function busy(btn, on, label){ btn.disabled = on; if (label) btn.textContent = label; }
  $("#dailySave").addEventListener("click", async () => {
    const btn = $("#dailySave");
    const items = DAILY.filter(i => i.k);
    const note = $("#dailyNote").value.trim(), name = $("#dailyName").value.trim();
    if (!name){ toast("Add your name so we know who checked it."); $("#dailyName").focus(); return; }
    ls.set("km100.name", name);
    const done = items.filter(i => dailyDraft.ok[i.k]).map(i => i.t), skipped = items.filter(i => !dailyDraft.ok[i.k]).map(i => i.t);
    busy(btn, true, "Saving…");
    try {
      await api("daily", {date: today(), name, done, skipped, note, hours: currentHours()?.h ?? null});
      toast(skipped.length ? "Saved — " + skipped.length + " item(s) left unticked." : "Daily check saved.");
      $("#dailyNote").value = ""; await load();
    } catch (e){ toast(e.status === 403 ? "Link key not valid — ask Doug for the current link." : "Couldn't save — check signal and try again. Your ticks are kept."); }
    busy(btn, false, "Save today's check");
  });

  // ---------- service ----------
  let svcSel = null, svcDraft = {};
  function buildSvcPick(){
    const next = nextMilestone(), done = doneMilestones();
    const opts = MILESTONES.filter(m => m <= Math.max(next + 600, 600));
    const keep = svcSel ?? next;
    $("#svcPick").innerHTML = opts.map(m => '<option value="'+m+'"'+(m===keep?" selected":"")+'>'+esc(svcName(m))+(done.has(m)?" ✓ done":m===next?" ← next":"")+'</option>').join("");
    svcSel = Number($("#svcPick").value);
  }
  $("#svcPick").addEventListener("change", e => { svcSel = Number(e.target.value); svcDraft = {}; renderSvc(); });
  function renderSvc(){
    buildSvcPick();
    const m = svcSel, st = dueState(m), done = doneMilestones().has(m);
    $("#svcTitle").textContent = (m === nextMilestone() ? "Next: " : "") + svcName(m);
    const pill = $("#svcPill");
    if (done){ pill.className = "pill ok"; pill.textContent = "Done"; }
    else { pill.className = "pill " + (st.cls === "unknown" ? "" : st.cls); pill.textContent = st.rem == null ? "Hours?" : st.rem < 0 ? "Overdue " + Math.abs(st.rem).toFixed(0) + " h" : st.rem <= 15 ? "Due now" : "In " + st.rem.toFixed(0) + " h"; }
    let html = '<div class="list">';
    for (const k of tasksFor(m)){ const t = T[k]; html += '<label class="tick"><input type="checkbox" id="s-'+k+'" data-k="'+k+'"'+(svcDraft[k]?" checked":"")+'><span><span class="t">'+esc(t.t)+'</span>'+(t.d?'<span class="d">'+esc(t.d)+'</span>':'')+'</span></label>'; }
    $("#svcList").innerHTML = html + "</div>";
    $("#svcList").querySelectorAll("input").forEach(i => i.addEventListener("change", () => { svcDraft[i.dataset.k] = i.checked; svcProg(); }));
    svcProg();
    const cur = currentHours();
    if (!$("#svcHours").value && cur) $("#svcHours").value = cur.h;
    if (!$("#svcDate").value) $("#svcDate").value = today();
  }
  function svcProg(){ const keys = tasksFor(svcSel); $("#svcBar").style.width = (100*keys.filter(k => svcDraft[k]).length/keys.length) + "%"; }
  $("#svcSave").addEventListener("click", async () => {
    const btn = $("#svcSave");
    const hrs = parseFloat($("#svcHours").value), who = $("#svcWho").value.trim(), date = $("#svcDate").value || today();
    if (isNaN(hrs)){ toast("Enter the hour meter reading when the service was done."); $("#svcHours").focus(); return; }
    if (!who){ toast("Add who did it."); $("#svcWho").focus(); return; }
    ls.set("km100.name", who);
    const keys = tasksFor(svcSel), label = svcName(svcSel);
    busy(btn, true, "Saving…");
    try {
      await api("service", {milestone: svcSel, label, hours: hrs, date, name: who,
        done: keys.filter(k => svcDraft[k]).map(k => T[k].t), skipped: keys.filter(k => !svcDraft[k]).map(k => T[k].t), note: $("#svcNote").value.trim()});
      svcDraft = {}; svcSel = null; $("#svcNote").value = ""; $("#svcHours").value = "";
      toast(label + " logged at " + hrs + " h."); await load();
    } catch (e){ toast("Couldn't save — check signal and try again."); }
    busy(btn, false, "Mark this service done");
  });

  // ---------- hours ----------
  $("#meterBtn").addEventListener("click", () => { const c = $("#meterEdit"); c.hidden = !c.hidden; if (!c.hidden){ const cur = currentHours(); $("#meterInput").value = cur ? cur.h : ""; $("#meterInput").focus(); } });
  $("#meterSave").addEventListener("click", async () => {
    const h = parseFloat($("#meterInput").value);
    if (isNaN(h) || h < 0){ toast("Enter the number on the hour meter."); return; }
    const cur = currentHours();
    if (cur && h < cur.h - 0.05){ toast("That's lower than the last reading (" + fmtH(cur.h) + "). Check the meter."); return; }
    const btn = $("#meterSave"); busy(btn, true, "Saving…");
    try { await api("hours", {h, date: today(), name: ls.get("km100.name","")}); $("#meterEdit").hidden = true; toast("Hours saved: " + fmtH(h)); await load(); }
    catch { toast("Couldn't save — check signal and try again."); }
    busy(btn, false, "Save hours");
  });

  // ---------- history ----------
  function renderHist(){
    const items = [
      ...S.services.map(s => ({at: s.date, kind:"svc", s})),
      ...S.daily.map(d => ({at: d.date, kind:"daily", d}))
    ].sort((a,b) => String(b.at||"").localeCompare(String(a.at||""))).slice(0, 25);
    $("#histList").innerHTML = !items.length ? '<div class="empty">No checks or services saved yet. Today\'s check will show up here once saved.</div>' :
      items.map(i => {
        if (i.kind === "svc"){ const s = i.s; return '<div class="h"><span class="when">'+esc(fmtDate(s.date))+'</span><span class="what">🔧 '+esc(s.label)+' · '+esc(fmtH(s.hours))+' h<small>'+esc(s.name||"")+(s.skipped.length? ' · skipped: '+esc(s.skipped.join(", ")):'')+(s.note? ' · '+esc(s.note):'')+'</small></span></div>'; }
        const d = i.d, issues = (d.missed.length ? d.missed.length + " unticked" : "") + (d.note ? (d.missed.length ? " · " : "") + d.note : "");
        return '<div class="h"><span class="when">'+esc(fmtDate(d.date))+'</span><span class="what">'+(issues ? "⚠️ " : "✅ ")+'Daily check'+(d.hours!=null? ' · '+esc(fmtH(d.hours))+' h':'')+'<small>'+esc(d.name||"")+(issues? ' — '+esc(issues):' — all good')+'</small></span></div>';
      }).join("");
    const sh = S.services.slice().sort((a,b) => (b.milestone||0)-(a.milestone||0));
    $("#svcHist").innerHTML = sh.length ? sh.map(s => '<div class="h"><span class="when">'+esc(fmtDate(s.date))+'</span><span class="what">'+esc(s.label)+' · '+esc(fmtH(s.hours))+' h<small>'+esc(s.name||"")+(s.done.length? ' · done: '+esc(s.done.join(", ")):'')+(s.skipped.length? ' · <b>skipped:</b> '+esc(s.skipped.join(", ")):'')+(s.note? ' · '+esc(s.note):'')+'</small></span></div>').join("") : '<div class="empty">No services logged yet. If Miniloaders or anyone else already did one, log it above with the hours it was done at.</div>';
  }

  // ---------- machine info ----------
  function renderMachine(){
    const m = S.machine || {};
    for (const [id,k] of [["mSerial","serial"],["mYear","year"],["mEngine","engineSerial"],["mStartHrs","startHours"]]){
      const el = $("#"+id); if (document.activeElement !== el) el.value = m[k] ?? "";
    }
  }
  $("#mSave").addEventListener("click", async () => {
    const btn = $("#mSave"); busy(btn, true, "Saving…");
    try {
      await api("info", {data: {serial: $("#mSerial").value, year: $("#mYear").value, engineSerial: $("#mEngine").value, startHours: $("#mStartHrs").value === "" ? null : $("#mStartHrs").value}});
      toast("Machine info saved."); await load();
    } catch { toast("Couldn't save — check signal and try again."); }
    busy(btn, false, "Save machine info");
  });

  // ---------- photos ----------
  function renderSlots(){
    const by = {}; for (const p of S.photos) (by[p.slot] ||= []).push(p);
    $("#slots").innerHTML = SLOTS.map(s => {
      const ps = (by[s.k] || []).filter(p => p.url), top = ps[0];
      return '<div class="slot"><div class="ph">'+(top ? '<a href="'+esc(top.url)+'" target="_blank" rel="noopener"><img src="'+esc(top.url)+'" alt="'+esc(s.t)+' photo" loading="lazy"></a>' : 'No photo yet')+'</div>'+
        '<div class="cap"><b>'+esc(s.t)+'</b>'+(s.d?'<span>'+esc(s.d)+'</span>':'')+(top?'<span>'+esc(fmtDate(top.at))+(top.by?' · '+esc(top.by):'')+(ps.length>1?' · '+ps.length+' photos':'')+'</span>':'')+
        (ps.length>1 ? '<div class="thumbs">'+ps.slice(1,6).map(p => '<a href="'+esc(p.url)+'" target="_blank" rel="noopener"><img src="'+esc(p.url)+'" alt="Earlier '+esc(s.t)+' photo" loading="lazy"></a>').join("")+'</div>' : '')+
        (S.online ? '<label class="upl" for="up-'+s.k+'">'+(top?'Add another':'Add photo')+'<input type="file" id="up-'+s.k+'" accept="image/*" data-slot="'+s.k+'"></label>' : '')+
        '</div></div>';
    }).join("");
    $("#photoNote").hidden = S.online;
    $("#slots").querySelectorAll("input[type=file]").forEach(inp => inp.addEventListener("change", () => { const f = inp.files?.[0]; if (f) uploadPhoto(inp.dataset.slot, f, inp); }));
  }
  async function toJpeg(file){
    try {
      const bmp = await createImageBitmap(file);
      const sc = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width*sc); c.height = Math.round(bmp.height*sc);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      return await new Promise(r => c.toBlob(b => r(b), "image/jpeg", 0.85));
    } catch { return file.type === "image/jpeg" ? file : null; }
  }
  async function uploadPhoto(slot, file, inp){
    const lbl = inp.closest("label"), old = lbl.firstChild.textContent;
    lbl.firstChild.textContent = "Uploading…";
    try {
      const blob = await toJpeg(file);
      if (!blob) throw new Error("type");
      const {path, uploadUrl} = await api("photoUrl", {slot});
      const put = await fetch(uploadUrl, {method:"PUT", headers:{"Content-Type":"image/jpeg"}, body: blob});
      if (!put.ok) throw new Error("upload " + put.status);
      await api("photoAdd", {slot, path, name: ls.get("km100.name","")});
      toast("Photo saved."); await load();
    } catch (e){
      toast(e.message === "type" ? "That file won't open — use a regular photo." : "Upload failed — check signal and try again.");
      lbl.firstChild.textContent = old;
    }
    inp.value = "";
  }

  function renderAll(){ renderMeter(); dailyProgress(); renderSvc(); renderHist(); renderMachine(); renderSlots(); }
  renderDaily(); renderAll(); load();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && KEY) load(); });
})();
