// BM Receptionist — Twilio inbound webhook handler.
//
// Flow:
//   1. Twilio receives an inbound call to the BM-owned number.
//   2. Twilio fires this webhook with form-encoded body containing
//      CallSid, From, To, etc. The To number identifies which tenant
//      receives the call (tenants.config.receptionist.twilio_to).
//   3. We respond with TwiML that:
//        a) plays a tenant-customizable greeting
//        b) opens a Gather→Speech loop that calls /functions/v1/bm-receptionist?action=turn
//           on each caller utterance, letting Claude respond
//      until the AI flags the conversation as terminal (qualified/junk/transfer).
//   4. The /turn endpoint reads the running call state from
//      receptionist_calls, asks Claude what to do next, returns more TwiML.
//   5. When the AI emits {"done": true, "disposition": "..."}, we
//      insert the appropriate `requests` or `communications` row and
//      end the call with a closing TwiML <Say>.
//
// SECRETS REQUIRED (Supabase Edge Function secrets):
//   - ANTHROPIC_API_KEY  — Claude API key
//   - TWILIO_AUTH_TOKEN  — to validate inbound webhook signatures
//
// Per-tenant config (tenants.config.receptionist):
//   {
//     enabled: boolean,
//     twilio_to: string,            // E.164 number that maps to this tenant
//     greeting: string,             // played at call start
//     business_hours: string,       // freeform; included in Claude prompt
//     services: string[],           // list of services offered
//     service_areas: string[],      // ZIPs or town names
//     transfer_number: string|null  // E.164 for "I need to speak to a human"
//   }
//
// Deploy:
//   SUPABASE_ACCESS_TOKEN=... npx supabase functions deploy bm-receptionist \
//     --project-ref ltpivkqahvplapyagljt
//
// Twilio webhook URL to register against the BM phone number:
//   https://ltpivkqahvplapyagljt.supabase.co/functions/v1/bm-receptionist

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

interface TenantReceptionistConfig {
  enabled?: boolean;
  twilio_to?: string;
  greeting?: string;
  business_hours?: string;
  services?: string[];
  service_areas?: string[];
  transfer_number?: string | null;
  voice?: string; // Twilio voice name, defaults to "Polly.Joanna-Neural"
}

interface CallState {
  id: string;
  tenant_id: string;
  call_sid: string;
  from_number: string;
  to_number: string;
  turns: Array<{ role: "caller" | "ai"; text: string; ts: string }>;
  config: TenantReceptionistConfig;
  tenant_name: string;
}

function twimlResponse(body: string, status = 200): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Resolve the tenant for an incoming call by matching the To number
// against tenants.config.receptionist.twilio_to.
async function resolveTenantByTo(sb: any, toNumber: string): Promise<
  { id: string; name: string; config: TenantReceptionistConfig } | null
> {
  const { data } = await sb.from("tenants").select("id, name, config");
  if (!data) return null;
  for (const t of data) {
    const cfg = (t.config?.receptionist ?? {}) as TenantReceptionistConfig;
    if (cfg.enabled && cfg.twilio_to && normalizePhone(cfg.twilio_to) === normalizePhone(toNumber)) {
      return { id: t.id, name: t.name, config: cfg };
    }
  }
  return null;
}

function normalizePhone(s: string): string {
  return (s || "").replace(/[^\d]/g, "").replace(/^1/, "");
}

function buildSystemPrompt(tenantName: string, cfg: TenantReceptionistConfig): string {
  const services = (cfg.services && cfg.services.length) ? cfg.services.join(", ") : "tree services";
  const areas = (cfg.service_areas && cfg.service_areas.length) ? cfg.service_areas.join(", ") : "the local area";
  const hours = cfg.business_hours || "Monday through Friday, 8am to 6pm Eastern";

  return `You are a friendly, efficient phone receptionist for ${tenantName}, a tree-service company.
Your job: qualify inbound callers — get their name, property address, what they need done, and urgency.

Services offered: ${services}.
Service areas: ${areas}.
Business hours: ${hours}.

GOAL — capture these fields in natural conversation:
- caller_name (full name)
- property_address (street + town if not stated)
- service_wanted (tree removal / pruning / stump grinding / chipper rental / etc.)
- urgency (this week / this month / flexible)
- notes (anything else the caller mentions: tree size, hazard, access)

CONVERSATION RULES:
- Keep replies SHORT (1-2 sentences max). Phone calls feel slow with long monologues.
- One question at a time. Don't ask all four fields in a single sentence.
- Confirm their address back to them naturally ("Got it — 14 Oak Street in Peekskill, right?").
- If the caller asks about pricing: "Our owner gives all estimates in person — it's free, and he'll be in touch within the same business day."
- If the caller is a CURRENT customer asking about an existing job: politely note their name + the question, mark as transfer_needed.
- If the caller is selling something / robocall / wrong number: end the call politely after one polite redirect attempt.

WHEN TO END:
After you have a name + address + service request, say something like "Great — I've got everything I need. The owner will reach out within the business day to set up a free estimate. Have a great day!" and emit the structured result.

OUTPUT FORMAT — every reply must be valid JSON, no surrounding text:
{
  "say": "what to say to the caller (in conversational English)",
  "done": false  // true when conversation should END
  // If done=true, ALSO include:
  // "disposition": "qualified" | "junk" | "transfer" | "voicemail",
  // "qualified_data": { name, address, service, urgency, notes }  // only if disposition=qualified
}

Examples:
{"say": "Hi! Thanks for calling ${tenantName}. Who am I speaking with?", "done": false}
{"say": "Got it — and what's the property address?", "done": false}
{"say": "Thanks. The owner will call you back today to set up a free estimate. Have a great day!", "done": true, "disposition": "qualified", "qualified_data": {"name": "Jane Smith", "address": "14 Oak St, Peekskill NY", "service": "tree removal — large oak hazard near house", "urgency": "this week", "notes": "approximately 60 feet, leaning toward the roof"}}`;
}

async function askClaude(systemPrompt: string, turns: CallState["turns"]): Promise<{ raw: string; parsed: any }> {
  // Build messages from the turn history. Caller turns are 'user' role,
  // AI turns are 'assistant' role. Claude's response must be JSON.
  const messages = turns.map((t) => ({
    role: t.role === "caller" ? "user" : "assistant",
    content: t.role === "caller" ? t.text : JSON.stringify({ say: t.text, done: false }),
  }));

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages,
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Claude ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  const text = j?.content?.[0]?.text ?? "";

  // Be lenient — sometimes Claude wraps JSON in ```json fences.
  const jsonMatch = text.match(/```json\s*([\s\S]+?)\s*```/) || text.match(/\{[\s\S]+\}/);
  let parsed: any = null;
  if (jsonMatch) {
    try { parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]); } catch { /* fall through */ }
  }
  if (!parsed) {
    parsed = { say: "Sorry, I didn't catch that — could you say it again?", done: false };
  }
  return { raw: text, parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
      },
    });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "start";
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Twilio posts application/x-www-form-urlencoded
  const ct = req.headers.get("content-type") || "";
  let form: Record<string, string> = {};
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    for (const pair of text.split("&")) {
      const [k, v] = pair.split("=");
      if (k) form[decodeURIComponent(k)] = decodeURIComponent((v || "").replace(/\+/g, " "));
    }
  } else if (ct.includes("application/json")) {
    try { form = await req.json(); } catch { /* ignore */ }
  }

  const callSid = form.CallSid || "";
  const fromNumber = form.From || "";
  const toNumber = form.To || "";
  const speech = (form.SpeechResult || "").trim();

  // ── action=start ─────────────────────────────────────────────────────────
  if (action === "start") {
    if (!callSid || !toNumber) {
      return twimlResponse(`<Response><Say>Sorry, we couldn't process that call. Please try again.</Say><Hangup/></Response>`);
    }

    const tenant = await resolveTenantByTo(sb, toNumber);
    if (!tenant) {
      console.warn("BM_RECEPTIONIST no_tenant_for_to:", toNumber);
      return twimlResponse(`<Response><Say>This number is not configured. Please leave a message.</Say><Record maxLength="60" finishOnKey="*"/></Response>`);
    }

    const greeting = tenant.config.greeting
      || `Hi! Thanks for calling ${tenant.name}. How can I help you today?`;

    await sb.from("receptionist_calls").upsert({
      call_sid: callSid,
      tenant_id: tenant.id,
      from_number: fromNumber,
      to_number: toNumber,
      turns: [{ role: "ai", text: greeting, ts: new Date().toISOString() }],
      ai_model: ANTHROPIC_MODEL,
    }, { onConflict: "call_sid" });

    const voice = tenant.config.voice || "Polly.Joanna-Neural";
    const turnUrl = `${url.origin}${url.pathname}?action=turn`;
    return twimlResponse(`<Response>
      <Say voice="${escapeXml(voice)}">${escapeXml(greeting)}</Say>
      <Gather input="speech" action="${escapeXml(turnUrl)}" method="POST" speechTimeout="auto" speechModel="phone_call" language="en-US">
        <Say voice="${escapeXml(voice)}">I'm listening.</Say>
      </Gather>
      <Say voice="${escapeXml(voice)}">I didn't hear anything. Goodbye!</Say>
    </Response>`);
  }

  // ── action=turn ──────────────────────────────────────────────────────────
  if (action === "turn") {
    if (!callSid) return twimlResponse(`<Response><Hangup/></Response>`);
    const { data: row } = await sb
      .from("receptionist_calls")
      .select("*")
      .eq("call_sid", callSid)
      .maybeSingle();
    if (!row) {
      return twimlResponse(`<Response><Say>Sorry, this call expired. Please call back.</Say><Hangup/></Response>`);
    }

    const tenantQ = await sb.from("tenants").select("name, config").eq("id", row.tenant_id).maybeSingle();
    const tenantName = tenantQ?.data?.name || "the tree service";
    const cfg = (tenantQ?.data?.config?.receptionist ?? {}) as TenantReceptionistConfig;

    const turns = (row.turns || []) as CallState["turns"];
    const callerSpeech = speech || "(no speech detected)";
    turns.push({ role: "caller", text: callerSpeech, ts: new Date().toISOString() });

    const systemPrompt = buildSystemPrompt(tenantName, cfg);
    let reply: any;
    try {
      const out = await askClaude(systemPrompt, turns);
      reply = out.parsed;
    } catch (e) {
      console.error("CLAUDE_ERR", e);
      reply = { say: "I'm having trouble hearing you. Let me take a message — please say your name and what you need.", done: false };
    }

    const sayText = reply.say || "Could you repeat that?";
    turns.push({ role: "ai", text: sayText, ts: new Date().toISOString() });

    // Persist turn state
    await sb.from("receptionist_calls").update({ turns, transcript: turns.map((t) => `${t.role.toUpperCase()}: ${t.text}`).join("\n") }).eq("call_sid", callSid);

    const voice = cfg.voice || "Polly.Joanna-Neural";
    const turnUrl = `${url.origin}${url.pathname}?action=turn`;

    if (!reply.done) {
      return twimlResponse(`<Response>
        <Say voice="${escapeXml(voice)}">${escapeXml(sayText)}</Say>
        <Gather input="speech" action="${escapeXml(turnUrl)}" method="POST" speechTimeout="auto" speechModel="phone_call" language="en-US"></Gather>
        <Say voice="${escapeXml(voice)}">I didn't hear anything. Have a great day!</Say>
      </Response>`);
    }

    // ── Terminal turn — record outcome and end the call ────────────────
    const disposition = reply.disposition || "qualified";
    let requestId: string | null = null;
    let communicationId: string | null = null;

    if (disposition === "qualified" && reply.qualified_data) {
      const q = reply.qualified_data;
      const { data: ins } = await sb.from("requests").insert({
        tenant_id: row.tenant_id,
        client_name: q.name || null,
        title: q.service || "Phone inquiry",
        property: q.address || null,
        client_phone: row.from_number,
        notes: (q.notes ? q.notes + "\n\n" : "") + `Captured by BM Receptionist on ${new Date().toLocaleString()}. Urgency: ${q.urgency || "not specified"}.`,
        source: "BM Receptionist (phone)",
        status: "new",
      }).select("id").single();
      requestId = ins?.id || null;
    } else if (disposition === "transfer" && cfg.transfer_number) {
      // Hand off to Doug's mobile. The call doesn't end — Twilio dials transfer_number.
      await sb.from("receptionist_calls").update({
        ended_at: new Date().toISOString(),
        disposition: "transferred",
      }).eq("call_sid", callSid);
      return twimlResponse(`<Response>
        <Say voice="${escapeXml(voice)}">${escapeXml(sayText)}</Say>
        <Dial>${escapeXml(cfg.transfer_number)}</Dial>
      </Response>`);
    } else {
      // borderline / junk / voicemail — log a comms row for triage.
      const { data: cIns } = await sb.from("communications").insert({
        tenant_id: row.tenant_id,
        channel: "call",
        direction: "inbound",
        from_number: row.from_number,
        body: row.transcript,
        status: disposition === "junk" ? "junk" : "answered",
        metadata: { source: "bm_receptionist", call_sid: callSid, junk: disposition === "junk" }
      }).select("id").single();
      communicationId = cIns?.id || null;
    }

    await sb.from("receptionist_calls").update({
      ended_at: new Date().toISOString(),
      disposition,
      qualified_data: reply.qualified_data || null,
      request_id: requestId,
      communication_id: communicationId,
    }).eq("call_sid", callSid);

    return twimlResponse(`<Response>
      <Say voice="${escapeXml(voice)}">${escapeXml(sayText)}</Say>
      <Hangup/>
    </Response>`);
  }

  return new Response("Unknown action", { status: 400 });
});
