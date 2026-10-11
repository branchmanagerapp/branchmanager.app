// bm-ai-receptionist — live AI phone receptionist (Twilio ConversationRelay ↔ Claude).
//
// WHY THIS EXISTS
// Doug, Oct 11 2026: build our own (better) version of Jobber's AI Receptionist.
// When nobody picks up the Twilio line, twilio-webhook hands the call to
// Twilio ConversationRelay, which does speech-to-text / text-to-speech and
// talks to THIS function over a WebSocket. We stream Claude's reply back token
// by token so it sounds like a person, not a phone tree.
//
// Replaces the June 7 bm-receptionist (Gather/Say loop, robot voice, a pause
// after every sentence).
//
// FLOW
//   setup  → remember the call (CallSid, caller number, BM client name if known)
//   prompt → caller finished a sentence → ask Claude → stream the words back
//   Claude calls end_call / transfer_to_owner → say goodbye, then hand control
//   back to twilio-webhook (?step=aidone) with handoffData
//   socket closes (any reason, incl. caller hang-up) → finalize(): transcript
//   into communications, and a real lead goes through request-notify (BM
//   request + owner text + Jobber client/request/draft quote — same path as
//   website leads, approved by Doug Oct 10).
//
// TEST MODE (tenants.config.ai_receptionist.mode = "test"): only callers in
// test_callers reach the AI; their leads are NOT sent to Jobber or Catherine —
// Doug just gets a summary text.
//
// SAFETY: the AI never texts or emails the caller. Internal alerts only.
//
// Deploy: supabase functions deploy bm-ai-receptionist --no-verify-jwt
//   (Twilio can't send a Supabase JWT; the ?k= relay key is checked instead.)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC    = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const RELAY_KEY    = Deno.env.get("AI_RELAY_KEY") ?? "";
const TW_SID       = Deno.env.get("TWILIO_SID") ?? "";
const TW_TOKEN     = Deno.env.get("TWILIO_TOKEN") ?? "";
const TW_FROM      = Deno.env.get("TWILIO_FROM_NUMBER") ?? "";
const SNT_TENANT   = "93af4348-8bba-4045-ac3e-5e71ec1cc8c5";
const MODEL        = "claude-haiku-5-5";   // fastest model — phone replies must start in well under a second

const SYSTEM = `You are the phone assistant for Second Nature Tree Service, a family-run tree company in Peekskill, New York. The owners, Doug and Catherine, are out on a job and couldn't get to the phone, so the call came to you. You already told the caller you are the virtual assistant.

Your job: take down a new customer's request so Doug can call back and set up a free estimate.

Get these, ONE question at a time, in a natural order:
1. Their name.
2. The property address, including the town. Read the address back to confirm it.
3. What they need: tree removal, pruning or trimming, stump grinding, storm cleanup, or something else. Ask roughly how many trees and how big.
4. Whether any tree is touching or leaning on the house, power lines, or the road.
5. How soon they need it: emergency, this week, this month, or flexible.
6. Whether this number is the best one to call back. Ask for an email only if they offer one.

How to talk:
- This is a phone call. One or two short sentences per reply, under 30 words. No lists, no symbols, no emoji, no brackets or notes; everything you write is read aloud.
- Sound like a friendly, competent person from the office. Use their first name once you have it.
- The caller already called our number. Never tell them to call or text us; anything that needs Doug or Catherine (insurance certificates, payment questions, paperwork) becomes a message you take for them.
- Never give prices or quotes. If asked: "Doug gives every estimate in person, and it's free. He'll call you back to set a time."
- Never promise a specific time or date. Say Doug will call back as soon as he's off the job.
- Answer company questions ONLY from the COMPANY FACTS below. If something isn't there (hours, exact availability, prices, anything else), say Doug will go over it when he calls back. Never guess.

Emergencies: if a tree or large limb has fallen on a house, car, or person, is blocking a road or driveway, or is on or tangled in power lines, it is an emergency. If wires are involved, tell them to stay well away and call the utility, and 911 if anyone is in danger. Then use transfer_to_owner right away; don't finish the questions.

Other calls:
- An existing customer asking about their job, invoice, or payment: get their name and question, then end_call with disposition "message".
- Sales pitches, robocalls, wrong numbers: be polite and brief, then end_call with disposition "junk".
- If they ask for a person: offer to take their details so Doug calls back. If they insist or it's urgent, use transfer_to_owner.

Existing customers: if CALLER RECORD below lists their quotes, jobs, or invoices, you may tell them the STATUS (for example "your quote was sent on September 13th" or "that invoice shows as paid"). Never read out dollar amounts, addresses, or anything else from the record; caller ID can be faked. For anything more, take a message.

When you have at least the name, address, and what they need, confirm in one sentence, say Doug will call them back, say goodbye, and use end_call with disposition "lead". Always say your goodbye in the same reply where you use a tool.`;

// From peekskilltree.com (home, services, service-areas, emergency, contact, stump-grinding pages), read Oct 11 2026.
// Only things the website already tells customers. No prices: rates are internal (Doug's rule).
const FACTS = `COMPANY FACTS (from our website):
- Second Nature Tree Service, based in Peekskill, NY. Locally owned; both owners are on every job. 10+ years in business. Licensed and insured: Westchester license WC-32079, Putnam license PC-50644. Rated 5.0 on Google with 70+ reviews.
- Free estimates, always. Main number (914) 391-5233; customers can call or text it.
- Business hours: 8 AM to 8 PM, seven days a week (Doug, Oct 11 2026). We respond to inquiries within 2 hours during business hours. 24/7 emergency response for storm damage and fallen trees.
- Services: tree removal (any size, residential and commercial, cleanup included); pruning and trimming (crown thinning, crown raising, deadwood removal, structural pruning, vista pruning); stump grinding (6 to 12 inches below grade; chips fill the hole, or we haul chips and backfill with topsoil on request); emergency tree service; land and lot clearing; crane-assisted removal for very large trees or tight access; roof soft washing (low pressure, safe for slate, tile, cedar and asphalt).
- Near power lines we coordinate with the utility company.
- Service area: Northern Westchester, Putnam County and Southern Dutchess County. Westchester: Peekskill, Yorktown and Yorktown Heights, Cortlandt Manor, Croton-on-Hudson, Briarcliff Manor, Chappaqua, Ossining, Buchanan, Mount Kisco, Bedford, Katonah, Somers, Pleasantville, Pound Ridge, Lewisboro, North Salem, Armonk, New Castle, Mohegan Lake, Shrub Oak, Verplanck, Mount Pleasant, Millwood, Lake Peekskill, Hawthorne, Thornwood, Scarborough, Cross River, South Salem, Waccabuc, Goldens Bridge, Croton Falls, Purdys. Putnam: Philipstown, Garrison, Cold Spring, Putnam Valley, Mahopac, Carmel, Brewster, Patterson, Nelsonville. Southern Dutchess: Beacon, Fishkill, East Fishkill, Wappingers Falls, Pawling, Dover. Anywhere else in those counties: "we likely cover you; Doug will confirm."
- Pruning timing (from our pruning page): late winter, January to March, is ideal for most deciduous trees.`;

const LEAD_PROPS = {
  name:     { type: "string" },
  address:  { type: "string", description: "Street and town as confirmed" },
  service:  { type: "string", description: "Short label, e.g. 'Removal - 2 large oaks'" },
  hazard:   { type: "string", description: "House / wires / road / none" },
  urgency:  { type: "string", description: "emergency / this week / this month / flexible" },
  callback: { type: "string", description: "Best callback number if different from caller ID" },
  email:    { type: "string" },
  notes:    { type: "string", description: "Anything else useful for the estimate" },
};
const TOOLS = [
  {
    name: "end_call",
    description: "End the call after saying goodbye. Use when the request is captured, a message was taken, or the call is junk.",
    input_schema: {
      type: "object",
      properties: {
        disposition: { type: "string", enum: ["lead", "message", "junk"] },
        summary: { type: "string", description: "One or two sentences for Doug: who called and what they want." },
        lead: { type: "object", properties: LEAD_PROPS },
      },
      required: ["disposition", "summary"],
    },
  },
  {
    name: "transfer_to_owner",
    description: "Connect the caller to Doug right now. For emergencies, or when the caller insists on a person.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string" },
        summary: { type: "string" },
        lead: { type: "object", properties: LEAD_PROPS },
      },
      required: ["reason", "summary"],
    },
  },
];

const WIRES = /(wire|power line|electric|utility pole|sparking|live line)/i;
const SAFETY = "Please stay well away from any wires, call the utility company, and call 911 if anyone is in danger. ";
const CONNECTING = "Okay, one moment, I'm connecting you to Doug now.";
const GOODBYE = "Thanks for calling Second Nature Tree Service. Doug will get back to you. Goodbye!";

// The website is the source of truth (Doug, Oct 11): faq.html + llm-info/ are read live
// and cached for an hour, so editing the site updates what the phone AI says.
// FACTS above is only the fallback if the site can't be reached.
let siteCache = { at: 0, text: "" };
async function siteFacts(): Promise<string> {
  if (siteCache.text && Date.now() - siteCache.at < 60 * 60 * 1000) return siteCache.text;
  const grab = async (path: string) => {
    const r = await fetch("https://peekskilltree.com/" + path, { headers: { "User-Agent": "Mozilla/5.0 BM-receptionist" }, signal: AbortSignal.timeout(2500) });
    if (!r.ok) throw new Error(path + " " + r.status);
    let t = await r.text();
    t = t.replace(/<(script|style|nav|head|footer)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;|&quot;/g, '"').replace(/&mdash;|&ndash;/g, "-").replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, " ")
      .replace(/\s+/g, " ");
    const a = t.indexOf("Home »"), b = t.indexOf("Locally owned tree service proudly");
    return t.slice(a > 0 ? a + 6 : 0, b > a ? b : undefined).trim();
  };
  try {
    const [faq, info] = await Promise.all([grab("faq.html"), grab("llm-info/")]);
    siteCache = { at: Date.now(), text: `WEBSITE FAQ (peekskilltree.com/faq):\n${faq}\n\nWEBSITE AI REFERENCE (peekskilltree.com/llm-info):\n${info}` };
  } catch (e) {
    console.error("siteFacts failed, using built-in facts", e);
  }
  return siteCache.text;
}

type Msg = { role: "user" | "assistant"; content: string };

Deno.serve((req) => {
  if ((req.headers.get("upgrade") || "").toLowerCase() !== "websocket") {
    return new Response("bm-ai-receptionist: websocket only", { status: 426 });
  }
  const k = new URL(req.url).searchParams.get("k") || "";
  if (!RELAY_KEY || k !== RELAY_KEY) return new Response("forbidden", { status: 403 });

  const { socket, response } = Deno.upgradeWebSocket(req);
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const call = {
    callSid: "", from: "", to: "", test: false, harness: false, clientName: "", greeting: "", record: "", site: "",
    history: [] as Msg[],
    transcript: [] as string[],
    outcome: null as null | { kind: "end" | "transfer"; input: any },
    startedAt: Date.now(),
  };
  let gen = 0;            // bumps on every new caller turn; stale streams stop sending
  let finalized = false;
  let closed!: () => void;
  const done = new Promise<void>((r) => (closed = r));
  // Keep the function alive for the whole call, not just the upgrade request.
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(done);

  const send = (o: unknown) => { try { socket.send(JSON.stringify(o)); } catch (_) { /* closed */ } };

  socket.onmessage = async (ev) => {
    let m: any;
    try { m = JSON.parse(String(ev.data)); } catch { return; }

    if (m.type === "setup") {
      call.callSid = m.callSid || "";
      call.from = m.from || "";
      call.to = m.to || "";
      call.test = (m.customParameters?.test || "") === "1";
      call.harness = (m.customParameters?.harness || "") === "1";   // automated test caller: no DB writes, no texts
      call.clientName = m.customParameters?.client || "";
      call.greeting = m.customParameters?.greeting || "";
      if (call.greeting) call.transcript.push(`AI: ${call.greeting}`);
      [call.record, call.site] = await Promise.all([
        m.customParameters?.record_override ?? callerRecord(sb, call.from),
        siteFacts(),
      ]);
      return;
    }

    if (m.type === "harness_hangup" && call.harness) {   // simulate the caller hanging up
      await finalize("hangup");
      return;
    }

    if (m.type === "interrupt") {
      // Caller talked over us: keep only what they actually heard.
      // A reply still streaming hasn't been saved yet (it saves when done), so
      // record what was heard now; otherwise trim the last saved reply.
      gen++;
      const heard = (m.utteranceUntilInterrupt || "").trim();
      const last = call.history[call.history.length - 1];
      if (last && last.role === "assistant") {
        if (heard) { last.content = heard; call.transcript[call.transcript.length - 1] = `AI: ${heard} [cut off]`; }
      } else if (heard) {
        call.history.push({ role: "assistant", content: heard });
        call.transcript.push(`AI: ${heard} [cut off]`);
      }
      return;
    }

    if (m.type === "prompt" && m.last !== false) {
      const said = (m.voicePrompt || "").trim();
      if (!said || call.outcome) return;
      call.transcript.push(`CALLER: ${said}`);
      // Merge back-to-back caller turns (e.g. after an interrupt) so roles alternate.
      const prev = call.history[call.history.length - 1];
      if (prev && prev.role === "user") prev.content += " " + said;
      else call.history.push({ role: "user", content: said });
      await reply(++gen);
      return;
    }

    if (m.type === "error") console.error("relay error:", m.description);
  };

  socket.onclose = async () => {
    await finalize("closed");
    closed();
  };
  socket.onerror = (e) => console.error("socket error", e);

  // Drop bracketed notes like "[End call: lead]" across token boundaries; they'd be read aloud.
  let inBracket = false;
  const spoken = (t: string) => {
    let out = "";
    for (const ch of t) {
      if (ch === "[") inBracket = true;
      else if (ch === "]") inBracket = false;
      else if (!inBracket) out += ch;
    }
    return out;
  };

  async function reply(myGen: number, retry = false) {
    inBracket = false;
    const ctx = `\n\n${call.site ? call.site + "\n\nIf the website pages and the facts below disagree, the website wins. Never read out the EIN, DOT or DOS numbers unless asked for proof of registration.\n\n" : ""}${FACTS}` +
      (call.greeting ? `\n\nYou already greeted the caller with: "${call.greeting}"` : "") +
      `\n\nCALLER RECORD: ${call.record || "No match for this phone number. Treat as a new caller."}` +
      `\n\nToday is ${new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", year: "numeric" })}.`;
    let text = "";
    const tools: Record<number, { name: string; json: string }> = {};
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 400, stream: true, system: SYSTEM + ctx, tools: TOOLS, messages: call.history }),
      });
      if (!r.ok || !r.body) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = block.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const e = JSON.parse(line.slice(6));
          if (e.type === "content_block_start" && e.content_block?.type === "tool_use") {
            tools[e.index] = { name: e.content_block.name, json: "" };
            // Speak the closing line as soon as the model picks a tool, instead of
            // waiting for its JSON to finish (cut emergency silence from ~4s to ~1s).
            if (!text.trim() && myGen === gen) {
              const said = call.history.filter((h) => h.role === "user").map((h) => h.content).join(" ");
              const warn = e.content_block.name === "transfer_to_owner" && WIRES.test(said) ? SAFETY : "";
              const bye = e.content_block.name === "transfer_to_owner" ? CONNECTING : GOODBYE;
              text = warn + bye;
              send({ type: "text", token: text, last: false });
            }
          } else if (e.type === "content_block_delta") {
            if (e.delta?.type === "text_delta") {
              const clean = spoken(e.delta.text);
              text += clean;
              if (clean && myGen === gen) send({ type: "text", token: clean, last: false });
            } else if (e.delta?.type === "input_json_delta" && tools[e.index]) {
              tools[e.index].json += e.delta.partial_json;
            }
          }
        }
      }
    } catch (e) {
      console.error("claude failed", e);
      text = "Sorry, I'm having trouble on my end. Please leave your name and address and Doug will call you back.";
      if (myGen === gen) send({ type: "text", token: text, last: false });
    }
    if (myGen !== gen) return;            // caller interrupted; a newer turn owns the line
    const t0 = Object.values(tools)[0];
    // Tested Oct 11: the model sometimes ends the call silently, or returns nothing at all.
    if (!text.trim() && !t0) {
      if (!retry) return reply(myGen, true);
      text = "Sorry, could you say that one more time?";
      send({ type: "text", token: text, last: false });
    }
    // Safety line is guaranteed, not left to the model (Oct 11 test: it once skipped it).
    const callerSaid = call.history.filter((h) => h.role === "user").map((h) => h.content).join(" ");
    if (t0?.name === "transfer_to_owner" && WIRES.test(callerSaid) && !/(stay|away)/i.test(text)) {
      send({ type: "text", token: " " + SAFETY, last: false });
      text += " " + SAFETY;
    }
    send({ type: "text", token: "", last: true });
    if (text.trim()) {
      call.history.push({ role: "assistant", content: text.trim() });
      call.transcript.push(`AI: ${text.trim()}`);
    }

    const t = t0;
    if (!t) return;
    let input: any = {};
    try { input = JSON.parse(t.json || "{}"); } catch { /* keep {} */ }
    call.outcome = { kind: t.name === "transfer_to_owner" ? "transfer" : "end", input };
    // Let the goodbye finish playing before handing the call back (~2.6 words/sec).
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    if (!call.harness) await new Promise((r) => setTimeout(r, Math.min(12000, 800 + words * 380)));
    send({ type: "end", handoffData: JSON.stringify({ action: call.outcome.kind, reason: input.reason || "" }) });
    await finalize("tool");
  }

  async function finalize(_why: string) {
    if (finalized || !call.callSid) return;
    finalized = true;
    const o = call.outcome;
    const input = o?.input || {};
    const transcript = call.transcript.join("\n");
    // Always read the whole transcript at the end: covers hang-ups, interrupted
    // turns and thin tool inputs (Oct 11 test: transfer arrived with no summary).
    const ex = call.transcript.some((l) => l.startsWith("CALLER:")) ? await extract(transcript) : {};
    const real = ([, v]: [string, any]) => typeof v === "string" && v.trim() && !/^<?\s*(unknown|n\/?a|none given|not (given|provided))\s*>?$/i.test(v.trim());
    const lead = { ...Object.fromEntries(Object.entries(ex.lead || {}).filter(real)), ...Object.fromEntries(Object.entries(input.lead || {}).filter(real)) };
    const disposition = o?.kind === "transfer" ? "transfer" : (input.disposition || ex.disposition || "hung_up");
    const summary = input.summary || ex.summary || (call.transcript.length > 1 ? "Caller hung up before saying much." : "Caller hung up right away.");
    const secs = Math.round((Date.now() - call.startedAt) / 1000);
    if (call.harness) {
      send({ type: "harness_result", disposition, summary, lead, transcript, secs });
      return;
    }

    let clientId: string | null = null;
    const p10 = call.from.replace(/\D/g, "").slice(-10);
    if (p10) {
      const { data } = await sb.from("clients").select("id").ilike("phone", `%${p10}%`).limit(1);
      clientId = data && data.length ? data[0].id : null;
    }

    await sb.from("communications").upsert({
      tenant_id: SNT_TENANT, client_id: clientId, channel: "call", direction: "inbound",
      from_number: call.from, to_number: call.to,
      body: `AI receptionist (${secs}s, ${disposition}): ${summary}\n\n${transcript}`,
      status: disposition, dialpad_id: "ai-" + call.callSid, source: "twilio",
      date: new Date().toISOString(),
      metadata: { provider: "twilio", ai_receptionist: true, call_sid: call.callSid, disposition, lead, test: call.test },
    }, { onConflict: "dialpad_id" });
    await sb.from("communications").update({ status: "ai_answered", body: `AI receptionist: ${summary}` }).eq("dialpad_id", call.callSid);

    const isLead = disposition === "lead" || (disposition === "transfer" && lead.name);
    if (isLead && !call.test) {
      // Same path as a website lead: BM request + owner text + Jobber (client, request, draft quote).
      const details = [
        lead.hazard ? `Hazard: ${lead.hazard}` : "", lead.urgency ? `Urgency: ${lead.urgency}` : "",
        lead.notes || "", lead.callback ? `Call back at: ${lead.callback}` : "",
        lead.email ? `Email (heard on the phone, check spelling): ${lead.email}` : "",
        `Summary: ${summary}`, "", "Phone call transcript (AI receptionist):", transcript,
      ].filter((x) => x !== "").join("\n");
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/request-notify`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY, "Content-Type": "application/json", "X-Tenant-ID": SNT_TENANT },
          // No email field on purpose: request-notify would auto-email the customer, and an
          // address heard over the phone may be wrong. It rides in the details instead.
          body: JSON.stringify({ name: lead.name, phone: lead.callback || call.from, address: lead.address || "", service: lead.service || "Phone request", details, source: "AI receptionist (phone)" }),
        });
        if (!r.ok) console.error("request-notify failed", r.status, (await r.text()).slice(0, 300));
      } catch (e) { console.error("request-notify error", e); }
      return;
    }
    if (disposition === "junk" && !call.test) return;

    // Messages, hang-ups, transfers, and every test call: a summary text to the office.
    const who = lead.name || call.clientName || call.from || "unknown caller";
    const head = call.test ? "🧪 TEST AI call" : disposition === "transfer" ? "🚨 AI transferred a call" : "📞 AI took a call";
    const body = `${head} from ${who} (${disposition}): ${summary}` +
      (lead.address ? `\n📍 ${lead.address}` : "") + (lead.service ? `\n🌳 ${lead.service}` : "");
    await textOwners(body.slice(0, 600), call.test);
  }

  return response;
});

// End-of-call read of the transcript → { summary, disposition, lead }.
async function extract(transcript: string): Promise<any> {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 500,
        system: "You read a phone transcript between a tree service's AI assistant and a caller. Extract only what the CALLER actually said. If a field was not said, omit that key entirely; never write placeholders like unknown.",
        tools: [{
          name: "record_call",
          description: "Record the call outcome.",
          input_schema: {
            type: "object",
            properties: {
              summary: { type: "string", description: "One or two sentences for the owner: who called, what they want, anything urgent." },
              disposition: { type: "string", enum: ["lead", "message", "junk", "hung_up"], description: "lead = new work request with at least a name or address and what they need" },
              lead: { type: "object", properties: LEAD_PROPS },
            },
            required: ["summary", "disposition"],
          },
        }],
        tool_choice: { type: "tool", name: "record_call" },
        messages: [{ role: "user", content: transcript }],
      }),
    });
    if (!r.ok) throw new Error(`Claude ${r.status}`);
    const j = await r.json();
    return (j.content || []).find((b: any) => b.type === "tool_use")?.input || {};
  } catch (e) {
    console.error("extract failed", e);
    return {};
  }
}

// What the AI may say to an existing customer: statuses only, no amounts/addresses.
async function callerRecord(sb: any, from: string): Promise<string> {
  const p10 = (from || "").replace(/\D/g, "").slice(-10);
  if (p10.length < 10) return "";
  try {
    const { data: cl } = await sb.from("clients").select("id,name,first_name").eq("tenant_id", SNT_TENANT)
      .ilike("phone", `%${p10.slice(0, 3)}%${p10.slice(3, 6)}%${p10.slice(6)}%`).limit(2);
    if (!cl || !cl.length) return "";
    const c = cl[0];
    const d = (x: string) => x ? new Date(x).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : "";
    const [{ data: q }, { data: j }, { data: inv }] = await Promise.all([
      sb.from("quotes").select("quote_number,status,sent_at,approved_at,created_at").eq("client_id", c.id).order("created_at", { ascending: false }).limit(3),
      sb.from("jobs").select("job_number,status,scheduled_date,completed_date").eq("client_id", c.id).order("created_at", { ascending: false }).limit(3),
      sb.from("invoices").select("invoice_number,status,issued_date,paid_date").eq("client_id", c.id).order("created_at", { ascending: false }).limit(3),
    ]);
    const lines = [`Existing customer: ${c.name}.`];
    for (const x of q || []) lines.push(`Quote #${x.quote_number}: ${x.status}${x.sent_at ? ", sent " + d(x.sent_at) : ""}${x.approved_at ? ", approved " + d(x.approved_at) : ""}.`);
    for (const x of j || []) lines.push(`Job #${x.job_number}: ${x.status}${x.scheduled_date ? ", scheduled " + d(x.scheduled_date) : ""}${x.completed_date ? ", completed " + d(x.completed_date) : ""}.`);
    for (const x of inv || []) lines.push(`Invoice #${x.invoice_number}: ${x.status}${x.paid_date ? ", paid " + d(x.paid_date) : ""}.`);
    if (cl.length > 1) lines.push("(More than one customer shares this number; confirm their name before giving any status.)");
    return lines.join(" ");
  } catch (e) {
    console.error("callerRecord failed", e);
    return "";
  }
}

async function textOwners(text: string, testOnly: boolean) {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data } = await sb.from("tenants").select("config").eq("id", SNT_TENANT).limit(1);
  const cfg = (data && data[0] && data[0].config) || {};
  const phones: string[] = testOnly ? (cfg.ai_receptionist?.test_callers || []) : (cfg.owner_alert_phones || []);
  for (const to of phones) {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
      method: "POST",
      headers: { "Authorization": "Basic " + btoa(`${TW_SID}:${TW_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: TW_FROM, Body: text }).toString(),
    });
    if (!r.ok) console.error("textOwners failed", to, r.status);
  }
}
