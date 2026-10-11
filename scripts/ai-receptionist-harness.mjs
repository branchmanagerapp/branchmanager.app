// Fake-Twilio test caller for bm-ai-receptionist. Speaks the ConversationRelay
// WebSocket protocol; harness=1 means no DB writes and no texts.
// usage: AI_RELAY_KEY=... node harness.mjs [scenarioName]
const KEY = process.env.AI_RELAY_KEY;
const URL = `wss://ltpivkqahvplapyagljt.supabase.co/functions/v1/bm-ai-receptionist?k=${encodeURIComponent(KEY)}`;
const GREETING = "Thanks for calling Second Nature Tree Service. Doug and Catherine are out on a job, so you've got the virtual assistant. I can take down what you need and have Doug call you back. Who am I speaking with?";

const S = [
  { name: "new-lead", lines: ["Hi, this is Mary Johnson.", "It's 12 Oak Lane in Cortlandt Manor.", "Yes, that's right.", "I have two big oaks I want taken down, maybe sixty feet tall.", "No, they're in the back yard, not near anything.", "Sometime this month would be great.", "Yes, this number is fine."],
    expect: { disposition: "lead", leadName: /mary/i, leadAddr: /oak/i } },
  { name: "emergency-wires", lines: ["A tree just came down on the power lines in front of my house!", "It's on Main Street in Peekskill, my name is Tom."],
    expect: { disposition: "transfer", saysAny: /(stay|away|utility|con ed|nyseg|911)/i } },
  { name: "price-ask", lines: ["How much do you charge to take down a tree?", "Just roughly, ballpark?", "Okay, I'm Steve Rossi, 40 Hill Road, Yorktown Heights. One dead ash near the driveway.", "Not urgent, this month.", "Yep, this number."],
    expect: { disposition: "lead", noDollars: true } },
  { name: "area-and-insurance", lines: ["Do you guys work in Mahopac?", "Are you licensed and insured?", "What about Danbury, Connecticut?", "Okay thanks, I'll call back later. Bye."],
    expect: { saysAny: /mahopac|yes/i, mentions: /WC-?32079|licensed/i } },
  { name: "existing-customer", record: "Existing customer: Jane Testcase. Quote #900: sent, sent September 13, 2026. Invoice #401: paid, paid September 30, 2026.",
    lines: ["Hi, it's Jane Testcase, I'm calling about my quote.", "How much was it again?", "Okay, did you get my payment for the last invoice?", "Great, thanks, have Doug call me."],
    expect: { noDollars: true, saysAny: /september/i } },
  { name: "spam", lines: ["Hi, this is Kevin from Business Funding Partners, we're offering pre-approved lines of credit for your business.", "It only takes five minutes, can I speak to the owner?"],
    expect: { disposition: "junk" } },
  { name: "hangup-mid", lines: ["Hi, I need a tree removed, my name is Bob Kelly."], hangup: true,
    expect: { summaryNonEmpty: true } },
  { name: "wants-person", lines: ["Can I just talk to a real person?", "No, I really need to talk to Doug right now, it's important."],
    expect: { disposition: "transfer" } },
  { name: "hours-question", lines: ["What are your hours?", "Are you open Saturdays?", "Okay, never mind, thanks."],
    expect: { saysAny: /8\s?(AM|a\.m\.)?.{0,12}8\s?(PM|p\.m\.)|eight.{0,12}eight/i, noWrongHours: true } },
  { name: "stump-question", lines: ["How deep do you grind the stumps?", "Do you take the chips away?", "Okay, I'm Lisa Park, 5 River Road, Garrison. Three stumps from trees we had cut last year. No rush.", "Yes, this number is good."],
    expect: { saysAny: /(6|six).{0,15}(12|twelve)/i, disposition: "lead" } },
  { name: "lawn-mowing", lines: ["Do you guys also mow lawns?", "Okay, what about snow plowing?", "Alright, thanks."],
    expect: {} },
  { name: "lawn-care-site", lines: ["Do you do regular lawn care, like mowing?", "Do you take credit cards?", "Can you send a certificate of insurance to my HOA?", "Okay, thanks."],
    expect: { saysAny: /(don't|do not|not something we|isn't something)/i, mentions: /(card|certificate)/i } },
  { name: "tree-on-house", lines: ["Hi, a big limb fell on my roof in the storm last night, it went through the gutter.", "Nobody's hurt. It's Dan Moore, 88 Lakeview Drive, Putnam Valley."],
    expect: { disposition: "transfer" } },
];

function run(sc) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    const turns = [];   // {caller, ai, firstTokenMs, totalMs}
    let i = 0, buf = "", t0 = 0, tFirst = 0, ended = false, result = null;
    const timer = setTimeout(() => { try { ws.close(); } catch {} resolve({ sc, turns, result, error: "timeout" }); }, 120000);
    const next = () => {
      if (ended) return;
      if (i >= sc.lines.length) {
        ws.send(JSON.stringify({ type: "harness_hangup" }));
        return;
      }
      if (sc.hangup && i >= sc.lines.length) return;
      const line = sc.lines[i++];
      turns.push({ caller: line, ai: "" });
      buf = ""; t0 = Date.now(); tFirst = 0;
      ws.send(JSON.stringify({ type: "prompt", voicePrompt: line, lang: "en-US", last: true }));
    };
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "setup", callSid: "CAharness" + Date.now(), from: "+15555550123", to: "+19143353417",
        customParameters: { greeting: GREETING, test: "1", harness: "1", client: "", ...(sc.record !== undefined ? { record_override: sc.record } : { record_override: "" }) } }));
      setTimeout(next, 300);
    };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "text") {
        if (m.token && !tFirst) tFirst = Date.now() - t0;
        buf += m.token || "";
        if (m.last) {
          const t = turns[turns.length - 1];
          t.ai = buf.trim(); t.firstTokenMs = tFirst; t.totalMs = Date.now() - t0;
          setTimeout(next, 100);
        }
      } else if (m.type === "end") {
        ended = true;
        try { turns[turns.length - 1].handoff = m.handoffData; } catch {}
      } else if (m.type === "harness_result") {
        result = m; clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve({ sc, turns, result });
      }
    };
    ws.onerror = (e) => { clearTimeout(timer); resolve({ sc, turns, result, error: String(e.message || e.type) }); };
  });
}

function grade(r) {
  const e = r.sc.expect, res = r.result || {}, ai = r.turns.map((t) => t.ai).join(" ");
  const fails = [];
  if (r.error) fails.push("error: " + r.error);
  if (!r.result) fails.push("no result");
  if (e.disposition && res.disposition !== e.disposition) fails.push(`disposition ${res.disposition} != ${e.disposition}`);
  if (e.leadName && !e.leadName.test(res.lead?.name || "")) fails.push("lead name missing");
  if (e.leadAddr && !e.leadAddr.test(res.lead?.address || "")) fails.push("lead address missing");
  if (e.noDollars && /\$\s?\d|\d+\s?dollars/i.test(ai)) fails.push("SAID A PRICE");
  if (e.saysAny && !e.saysAny.test(ai)) fails.push("missing expected words " + e.saysAny);
  if (e.mentions && !e.mentions.test(ai)) fails.push("missing " + e.mentions);
  if (e.summaryNonEmpty && !(res.summary || "").trim()) fails.push("empty summary");
  if (e.noWrongHours && /\b(7|6|9|5|4)\s?(am|pm|a\.m\.|p\.m\.)/i.test(ai)) fails.push("WRONG HOURS");
  if (r.turns.some((t) => !t.ai && !t.handoff)) fails.push("a turn got no reply");
  if (r.turns.some((t) => t.ai.split(/\s+/).length > 45)) fails.push("a reply was too long (>45 words)");
  return fails;
}

const only = process.argv[2];
const list = only ? S.filter((s) => s.name === only) : S;
const results = await Promise.all(list.map(run));
let pass = 0;
for (const r of results) {
  const f = grade(r);
  if (!f.length) pass++;
  console.log(`\n${f.length ? "❌" : "✅"} ${r.sc.name}  ${f.join(" | ")}`);
  for (const t of r.turns) console.log(`  CALLER: ${t.caller}\n  AI (${t.firstTokenMs ?? "-"}ms first word): ${t.ai}${t.handoff ? "  [END " + t.handoff + "]" : ""}`);
  console.log(`  → ${r.result?.disposition} | ${r.result?.summary} | lead=${JSON.stringify(r.result?.lead || {})}`);
}
const lat = results.flatMap((r) => r.turns.map((t) => t.firstTokenMs).filter(Boolean)).sort((a, b) => a - b);
console.log(`\nPASSED ${pass}/${results.length}. First-word latency median ${lat[Math.floor(lat.length / 2)]}ms, worst ${lat[lat.length - 1]}ms`);
