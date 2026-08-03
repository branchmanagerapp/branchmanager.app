// twilio-sms-send — outbound SMS via Twilio (Dialpad replacement, Aug 2026)
// POST { to, message, clientId?, system? } — same interface as dialpad-sms-send
// so the BM client can switch transports with a URL change.
//
// Deploy: supabase functions deploy twilio-sms-send --no-verify-jwt
// Secrets: TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM_NUMBER
// NOTE: US sends fail with error 30034 until the A2P 10DLC campaign is
// approved — those failures land in communications as send_failed, never
// silently. Keep Dialpad live until this path is proven.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTenantId } from "../_shared/tenant.ts";

const TWILIO_SID = Deno.env.get("TWILIO_SID") || "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_TOKEN") || "";
const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE);

function cors(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
    },
  });
}

function normPhone(n: string): string {
  const d = n.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  return "+" + d;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return cors("", 200);
    if (req.method !== "POST") return cors(JSON.stringify({ error: "POST only" }), 405);
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      return cors(JSON.stringify({ error: "Twilio not configured" }), 503);
    }

    const tenantId = resolveTenantId(req);

    let body: { to: string; message: string; clientId?: string; system?: boolean };
    try { body = await req.json(); } catch { return cors(JSON.stringify({ error: "Invalid JSON" }), 400); }

    const { to, message, clientId, system } = body;
    if (!to || !message) return cors(JSON.stringify({ error: "to and message required" }), 400);

    const toFormatted = normPhone(to);

    // TCPA opt-out check — same semantics as dialpad-sms-send: known
    // opted-out clients are refused; system messages (STOP/HELP replies)
    // bypass because carriers require them even after opt-out.
    const last10 = to.replace(/\D/g, "").slice(-10);
    if (!system && last10.length >= 10) {
      const { data: optData } = await sb
        .from("clients")
        .select("id, name, sms_opt_out")
        .ilike("phone", `%${last10}%`)
        .eq("tenant_id", tenantId)
        .limit(1);
      if (optData && optData.length && optData[0].sms_opt_out === true) {
        return cors(JSON.stringify({
          ok: false,
          error: "Recipient has opted out of SMS",
          client_name: optData[0].name || null,
        }), 403);
      }
    }

    let twilioOk = false;
    let twilioError = "";
    let messageSid = "";

    try {
      const form = new URLSearchParams({
        To: toFormatted,
        From: normPhone(TWILIO_FROM),
        Body: message,
      });
      const r = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Authorization": "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
        },
      );
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.sid) {
        twilioOk = true;
        messageSid = d.sid;
      } else {
        twilioError = JSON.stringify(d).slice(0, 500);
        console.error("Twilio API error:", r.status, twilioError);
      }
    } catch (e) {
      twilioError = String(e);
      console.error("Twilio fetch failed:", e);
    }

    const { error: logErr } = await sb.from("communications").insert({
      tenant_id: tenantId,
      client_id: clientId || null,
      type: "sms",
      channel: "sms",
      direction: "outbound",
      to_number: toFormatted,
      from_number: normPhone(TWILIO_FROM),
      body: message,
      status: twilioOk ? "sent" : "send_failed",
      dialpad_id: "tw-out-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      metadata: {
        sent_via: "twilio-sms-send",
        twilio_ok: twilioOk,
        twilio_sid: messageSid || null,
        twilio_error: twilioError || null,
        system: !!system,
      },
    });
    if (logErr) console.warn("Failed to log outbound SMS:", logErr.message);

    if (!twilioOk) {
      return cors(JSON.stringify({ ok: false, error: twilioError || "Twilio send failed", logged: true }), 502);
    }
    return cors(JSON.stringify({ ok: true, to: toFormatted, sid: messageSid }));
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    console.error("twilio-sms-send unhandled:", msg);
    return cors(JSON.stringify({ ok: false, error: "unhandled: " + msg }), 500);
  }
});
