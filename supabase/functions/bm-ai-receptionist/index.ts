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
- This is a phone call. One or two short sentences per reply. No lists, no symbols, no emoji.
- Sound like a friendly, competent person from the office. Use their first name once you have it.
- Never give prices or quotes. If asked: "Doug gives every estimate in person, and it's free. He'll call you back to set a time."
- Never promise a specific time or date. Say Doug will call back as soon as he's off the job.
- Don't make up facts about the company (towns served, insurance, licenses, hours). If asked, say Doug will go over that when he calls.

Emergencies: if a tree or large limb has fallen on a house, car, or person, is blocking a road or driveway, or is on or tangled in power lines, it is an emergency. If wires are involved, tell them to stay well away and call the utility, and 911 if anyone is in danger. Then use transfer_to_owner right away; don't finish the questions.

Other calls:
- An existing customer asking about their job, invoice, or payment: get their name and question, then end_call with disposition "message".
- Sales pitches, robocalls, wrong numbers: be polite and brief, then end_call with disposition "junk".
- If they ask for a person: offer to take their details so Doug calls back. If they insist or it's urgent, use transfer_to_owner.

When you have at least the name, address, and what they need, confirm in one sentence, say Doug will call them back, say goodbye, and use end_call with disposition "lead". Always say your goodbye in the same reply where you use a tool.`;

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
    callSid: "", from: "", to: "", test: false, clientName: "",
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
      call.clientName = m.customParameters?.client || "";
      const greet = m.customParameters?.greeting || "";
      if (greet) call.transcript.push(`AI: ${greet}`);
      if (greet) call.history.push({ role: "assistant", content: greet });
      return;
    }

    if (m.type === "interrupt") {
      // Caller talked over us: keep only what they actually heard.
      gen++;
      const last = call.history[call.history.length - 1];
      if (last && last.role === "assistant" && m.utteranceUntilInterrupt) {
        last.content = m.utteranceUntilInterrupt;
        call.transcript[call.transcript.length - 1] = `AI: ${m.utteranceUntilInterrupt} [cut off]`;
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

  async function reply(myGen: number) {
    const ctx = call.clientName ? `\n\nCaller ID matches an existing customer: ${call.clientName}.` : "";
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
          } else if (e.type === "content_block_delta") {
            if (e.delta?.type === "text_delta") {
              text += e.delta.text;
              if (myGen === gen) send({ type: "text", token: e.delta.text, last: false });
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
    send({ type: "text", token: "", last: true });
    if (text.trim()) {
      call.history.push({ role: "assistant", content: text.trim() });
      call.transcript.push(`AI: ${text.trim()}`);
    }

    const t = Object.values(tools)[0];
    if (!t) return;
    let input: any = {};
    try { input = JSON.parse(t.json || "{}"); } catch { /* keep {} */ }
    call.outcome = { kind: t.name === "transfer_to_owner" ? "transfer" : "end", input };
    // Let the goodbye finish playing before handing the call back (~2.6 words/sec).
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    await new Promise((r) => setTimeout(r, Math.min(12000, 800 + words * 380)));
    send({ type: "end", handoffData: JSON.stringify({ action: call.outcome.kind, reason: input.reason || "" }) });
    await finalize("tool");
  }

  async function finalize(_why: string) {
    if (finalized || !call.callSid) return;
    finalized = true;
    const o = call.outcome;
    const input = o?.input || {};
    const lead = input.lead || {};
    const disposition = o?.kind === "transfer" ? "transfer" : (input.disposition || "hung_up");
    const summary = input.summary || (call.transcript.length > 1 ? "Caller hung up before finishing." : "Caller hung up right away.");
    const transcript = call.transcript.join("\n");
    const secs = Math.round((Date.now() - call.startedAt) / 1000);

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
