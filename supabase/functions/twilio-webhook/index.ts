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
  const url = Deno.env.get("TWILIO_WEBHOOK_URL") ||
              "https://ltpivkqahvplapyagljt.supabase.co/functions/v1/twilio-webhook";
  const ok = await validSignature(url, params, sig);
  if (!ok && Deno.env.get("TWILIO_SKIP_SIG") !== "1") {
    console.warn("twilio-webhook: bad signature", { from: params.From });
    return new Response("forbidden", { status: 403 });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
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

  // Empty TwiML — no auto-reply. STOP/HELP are handled by the Messaging
  // Service, and Doug's rule is that customer messages are never auto-sent.
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { status: 200, headers: { "content-type": "text/xml" } });
});
