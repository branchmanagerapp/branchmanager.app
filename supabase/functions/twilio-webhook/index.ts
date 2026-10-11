// twilio-webhook — inbound SMS from Twilio into `communications`.
//
// WHY THIS EXISTS
// The Dialpad -> Twilio switch was blocked for months on A2P 10DLC, which
// finally VERIFIED on 2026-08-28 (campaign CMHGE0P). Outbound Twilio SMS now
// delivers. But inbound had nowhere to land: the Twilio number's sms_url was
// empty, so Twilio accepted inbound texts and dropped them.
//
// SAFETY: this is wired to the TEST line (+1 914-335-3417) only. The business
// number 914-391-5233 stays on Dialpad until this path is proven, because
// porting before inbound works would silently drop real customer texts.
//
// CONSISTENCY: writes the SAME shape dialpad-webhook writes, so history stays
// continuous across the cutover. `dialpad_id` is already used as a generic
// external-message id (existing rows hold BM-generated ids like
// "bm-out-1777989156973-…"), so the Twilio MessageSid goes there and gives us
// idempotent upserts with NO schema change.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_TOKEN = Deno.env.get("TWILIO_TOKEN") ?? "";
const SNT_TENANT   = "93af4348-8bba-4045-ac3e-5e71ec1cc8c5";

// Twilio signs every request. Verify it so nobody can forge inbound messages
// into the customer record.
async function validSignature(url: string, params: Record<string, string>, sig: string) {
  if (!TWILIO_TOKEN || !sig) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(TWILIO_TOKEN),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === sig;
}

const last10 = (p: string) => (p || "").replace(/\D/g, "").slice(-10);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  // Twilio posts form-encoded, NOT json.
  const raw = await req.text();
  const params: Record<string, string> = {};
  new URLSearchParams(raw).forEach((v, k) => { params[k] = v; });

  const sig = req.headers.get("x-twilio-signature") ?? "";
  const BASE = Deno.env.get("TWILIO_WEBHOOK_URL") ||
              "https://ltpivkqahvplapyagljt.supabase.co/functions/v1/twilio-webhook";
  const qs = new URL(req.url).search;          // Twilio signs the FULL url incl. ?step=
  const url = BASE + qs;
  const step = new URL(req.url).searchParams.get("step") || "";
  const ok = await validSignature(url, params, sig);
  if (!ok && Deno.env.get("TWILIO_SKIP_SIG") !== "1") {
    console.warn("twilio-webhook: bad signature", { from: params.From });
    return new Response("forbidden", { status: 403 });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Voice: anything with a CallSid and no message id.
  if (params.CallSid && !params.MessageSid && !params.SmsSid) {
    params.__qs = qs.replace(/^\?/, "");
    // On a screened leg, From is OUR number calling out; the real caller is
    // looked up from the parent call row inside handleVoice.
    params.__caller = params.From || "";
    return await handleVoice(sb, step, params, BASE);
  }

  const from = params.From || "";
  const body = params.Body || "";
  const sid  = params.MessageSid || params.SmsSid || `tw-${Date.now()}`;

  // Attach to a known client by phone, same as the Dialpad path.
  let clientId: string | null = null;
  const p = last10(from);
  if (p) {
    const { data } = await sb.from("clients")
      .select("id").ilike("phone", `%${p}%`).limit(1);
    if (data && data.length) clientId = data[0].id;
  }

  const row = {
    tenant_id: SNT_TENANT,
    client_id: clientId,
    channel: "sms",
    direction: "inbound",
    from_number: from,
    to_number: params.To || "",
    body,
    status: "received",
    dialpad_id: sid,            // generic external id — see note above
    source: "twilio",
    date: new Date().toISOString(),
    metadata: { provider: "twilio", num_media: params.NumMedia || "0" },
  };

  const { error } = await sb.from("communications")
    .upsert(row, { onConflict: "dialpad_id" });
  if (error) console.error("twilio-webhook upsert failed:", error.message);

  // Tell the office a text came in (internal alert only — never auto-replies
  // to the customer).
  const who = await clientName(sb, clientId);
  await alertOwners(sb, `💬 Text to BM line from ${who || from}: ${body.slice(0, 280)}`);

  // Empty TwiML — no auto-reply. STOP/HELP are handled by the Messaging
  // Service, and Doug's rule is that customer messages are never auto-sent.
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { status: 200, headers: { "content-type": "text/xml" } });
});

// ── Shared helpers ────────────────────────────────────────────────────────
const TW_SID  = Deno.env.get("TWILIO_SID") ?? "";
const TW_FROM = Deno.env.get("TWILIO_FROM_NUMBER") ?? "";
const xml = (s: string) => new Response('<?xml version="1.0" encoding="UTF-8"?><Response>' + s + '</Response>',
  { status: 200, headers: { "content-type": "text/xml" } });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function tenantCfg(sb: any) {
  const { data } = await sb.from("tenants").select("config").eq("id", SNT_TENANT).limit(1);
  return (data && data[0] && data[0].config) || {};
}

async function clientName(sb: any, clientId: string | null) {
  if (!clientId) return "";
  const { data } = await sb.from("clients").select("name").eq("id", clientId).limit(1);
  return (data && data[0] && data[0].name) || "";
}

async function findClient(sb: any, phone: string) {
  const p = last10(phone);
  if (!p) return null;
  const { data } = await sb.from("clients").select("id").ilike("phone", `%${p}%`).limit(1);
  return data && data.length ? data[0].id : null;
}

// Text Doug + Catherine (tenants.config.owner_alert_phones). Internal only.
async function alertOwners(sb: any, text: string) {
  try {
    const cfg = await tenantCfg(sb);
    const phones: string[] = cfg.owner_alert_phones || [];
    for (const to of phones) {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, {
        method: "POST",
        headers: { "Authorization": "Basic " + btoa(`${TW_SID}:${TWILIO_TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: TW_FROM, Body: text }).toString(),
      });
      if (!r.ok) console.error("alertOwners failed", to, r.status, (await r.text()).slice(0, 300));
    }
  } catch (e) { console.error("alertOwners error", e); }
}

// ── Voice: ring Catherine, then Doug, then voicemail ─────────────────────
// Doug, Oct 10 2026: "rings Catherine first for four to six rings and then it
// rings me and goes to voicemail." Order + seconds live in
// tenants.config.call_routing = { ring: [E.164...], ring_seconds: 20 } so they
// can change without a deploy. 20s ≈ 4 rings; kept under the ~25-30s at which
// most cell carriers hand off to their OWN voicemail (which would swallow the call).
async function handleVoice(sb: any, step: string, p: Record<string, string>, BASE: string) {
  const cfg = await tenantCfg(sb);
  const route = cfg.call_routing || {};
  const ring: string[] = route.ring || cfg.owner_alert_phones || [];
  const secs = route.ring_seconds || 20;
  const caller = p.From || "";
  const at = (s: string) => esc(BASE + "?step=" + s);

  // "Press 1 to answer" screening on every leg: a cell's own voicemail can't
  // press 1, so it can no longer swallow the call (tested Oct 10: Doug's carrier
  // voicemail answered and kept the caller). Acceptance is recorded on the
  // parent call row, so we don't depend on how Twilio reports a declined leg.
  const parent = p.CallSid || "";
  const dial = (i: number) =>
    `<Dial timeout="${secs}" answerOnBridge="true" callerId="${esc(caller)}" action="${at("next" + (i + 1))}">` +
    `<Number url="${at("screen&p=" + encodeURIComponent(parent))}">${esc(ring[i])}</Number></Dial>`;

  const record = () =>
    `<Say voice="Polly.Matthew-Neural">Thanks for calling Second Nature Tree Service. We can't get to the phone right now. Please leave your name, address, and what you need, and we'll call you back.</Say>` +
    `<Record maxLength="180" playBeep="true" action="${at("vmdone")}" recordingStatusCallback="${at("vmsaved")}" />`;

  // AI receptionist (Oct 11 2026) — answers instead of voicemail when nobody picks up.
  // tenants.config.ai_receptionist = { mode: "off" | "test" | "on", test_callers: [E.164], transfer_to: E.164 }
  // "test": only test_callers reach the AI (and skip the ringing, so Catherine isn't rung during tests).
  const ai = cfg.ai_receptionist || {};
  const isTestCaller = (ai.test_callers || []).some((n: string) => last10(n) === last10(caller));
  const aiOn = ai.mode === "on" || (ai.mode === "test" && isTestCaller);
  const relayKey = Deno.env.get("AI_RELAY_KEY") || "";
  const aiConnect = async () => {
    const who = await clientName(sb, await findClient(sb, caller));
    const greeting = "Thanks for calling Second Nature Tree Service. Doug and Catherine are out on a job, so you've got the virtual assistant. I can take down what you need and have Doug call you back. Who am I speaking with?";
    const wss = SUPABASE_URL.replace(/^https:/, "wss:") + "/functions/v1/bm-ai-receptionist?k=" + encodeURIComponent(relayKey);
    return `<Connect action="${at("aidone")}"><ConversationRelay url="${esc(wss)}" welcomeGreeting="${esc(greeting)}" ` +
      // Oct 11 test: the AI kept getting cut off by short words/background noise.
      `interruptible="speech" interruptSensitivity="low" ignoreBackchannel="true" hints="Peekskill,Cortlandt,Yorktown,Croton,Putnam Valley,Garrison,Cold Spring,Mohegan Lake,stump grinding,arborist,oak,maple,ash,pine">` +
      `<Parameter name="greeting" value="${esc(greeting)}"/>` +
      `<Parameter name="client" value="${esc(who)}"/>` +
      `<Parameter name="test" value="${isTestCaller && ai.mode === "test" ? "1" : "0"}"/>` +
      `</ConversationRelay></Connect>`;
  };
  const voicemail = async () => (aiOn && relayKey ? await aiConnect() : record());

  if (step === "" ) {
    const clientId = await findClient(sb, caller);
    await sb.from("communications").upsert({
      tenant_id: SNT_TENANT, client_id: clientId, channel: "call", direction: "inbound",
      from_number: caller, to_number: p.To || "", body: "Incoming call", status: "ringing",
      dialpad_id: p.CallSid, source: "twilio", date: new Date().toISOString(),
      metadata: { provider: "twilio" },
    }, { onConflict: "dialpad_id" });
    if (ai.mode === "test" && isTestCaller && relayKey) return xml(await aiConnect());
    return xml(ring.length ? dial(0) : await voicemail());
  }

  // ConversationRelay finished. HandoffData is set only when the AI ended the session itself.
  if (step === "aidone") {
    let h: any = {};
    try { h = JSON.parse(p.HandoffData || "{}"); } catch { /* none */ }
    if (h.action === "transfer") {
      const to = ai.transfer_to || ring[ring.length - 1];
      if (to) {
        return xml(`<Dial timeout="${secs}" answerOnBridge="true" callerId="${esc(caller)}" action="${at("aivm")}">` +
          `<Number url="${at("screen&p=" + encodeURIComponent(p.CallSid || ""))}">${esc(to)}</Number></Dial>`);
      }
    }
    if (p.SessionStatus === "failed") {
      console.error("ConversationRelay failed", p.ErrorCode, p.ErrorMessage);
      return xml(record());                 // AI broke → never lose the caller; take a voicemail
    }
    return xml("<Hangup/>");
  }

  // After an AI transfer: Doug answered → done; no answer → regular voicemail.
  if (step === "aivm") {
    const { data: row } = await sb.from("communications").select("status").eq("dialpad_id", p.CallSid).limit(1);
    if (row && row[0] && row[0].status === "answered") return xml("<Hangup/>");
    return xml(record());
  }

  // Per-call answer digit (2-9). A fixed "1" got falsely triggered by a cell
  // voicemail beep in testing (Oct 10), bridging the caller into Doug's voicemail.
  const answerDigit = (sid: string) => String(2 + ([...sid].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 8));

  if (step === "screen") {
    const par = new URL("http://x/?" + (p.__qs || "")).searchParams.get("p") || "";
    const { data: c } = await sb.from("communications").select("client_id").eq("dialpad_id", par).limit(1);
    const who = (await clientName(sb, c && c[0] && c[0].client_id)) || "";
    const num = (p.__caller || "").replace(/\D/g, "").slice(-10).split("").join(" ");
    return xml(`<Gather numDigits="1" timeout="8" action="${at("accept&p=" + encodeURIComponent(par))}">` +
      `<Say voice="Polly.Matthew-Neural">Branch Manager call${who ? " from " + esc(who) : num ? " from " + num : ""}. Press ${answerDigit(par)} to answer.</Say><Pause length="1"/><Say voice="Polly.Matthew-Neural">Press ${answerDigit(par)} to answer.</Say></Gather><Hangup/>`);
  }

  if (step === "accept") {
    const par = new URL("http://x/?" + (p.__qs || "")).searchParams.get("p") || "";
    if (p.Digits === answerDigit(par)) {
      await sb.from("communications").update({ status: "answered", body: "Call answered" }).eq("dialpad_id", par);
      return xml("");               // empty = connect the caller
    }
    return xml("<Hangup/>");
  }

  const m = step.match(/^next(\d+)$/);
  if (m) {
    const i = +m[1];
    const { data: row } = await sb.from("communications").select("status").eq("dialpad_id", p.CallSid).limit(1);
    if (row && row[0] && row[0].status === "answered") return xml("<Hangup/>");
    return xml(i < ring.length ? dial(i) : await voicemail());
  }

  if (step === "vmdone") return xml(`<Say voice="Polly.Matthew-Neural">Thank you. Goodbye.</Say><Hangup/>`);

  if (step === "vmsaved") {
    // The recording-status callback doesn't carry From — get it from the call row.
    let from = caller;
    if (!from) {
      const { data: c } = await sb.from("communications").select("from_number").eq("dialpad_id", p.CallSid).limit(1);
      from = (c && c[0] && c[0].from_number) || "";
    }
    // Twilio recording URLs need our login, so copy the mp3 into a private
    // bucket and text a signed link that plays straight from the phone.
    let rec = "";
    try {
      const r = await fetch(p.RecordingUrl + ".mp3", { headers: { "Authorization": "Basic " + btoa(`${TW_SID}:${TWILIO_TOKEN}`) } });
      if (r.ok) {
        const path = `${p.RecordingSid || p.CallSid}.mp3`;
        await sb.storage.from("voicemails").upload(path, new Uint8Array(await r.arrayBuffer()), { contentType: "audio/mpeg", upsert: true });
        const { data: s } = await sb.storage.from("voicemails").createSignedUrl(path, 60 * 60 * 24 * 30);
        rec = (s && s.signedUrl) || "";
      }
    } catch (e) { console.error("voicemail copy failed", e); }
    const clientId = await findClient(sb, from);
    const who = (await clientName(sb, clientId)) || from || "unknown caller";
    await sb.from("communications").upsert({
      tenant_id: SNT_TENANT, client_id: clientId, channel: "voicemail", direction: "inbound",
      from_number: from, to_number: p.To || "", body: `Voicemail (${p.RecordingDuration || "?"}s)`,
      status: "received", dialpad_id: "vm-" + (p.RecordingSid || p.CallSid), source: "twilio",
      date: new Date().toISOString(), metadata: { provider: "twilio", recording_url: rec, twilio_recording_sid: p.RecordingSid, call_sid: p.CallSid },
    }, { onConflict: "dialpad_id" });
    await sb.from("communications").update({ status: "voicemail", body: "Missed call — left voicemail" }).eq("dialpad_id", p.CallSid);
    await alertOwners(sb, `📞 Voicemail on BM line from ${who} (${p.RecordingDuration || "?"}s): ${rec}`);
    return new Response("ok");
  }

  return xml("<Hangup/>");
}
