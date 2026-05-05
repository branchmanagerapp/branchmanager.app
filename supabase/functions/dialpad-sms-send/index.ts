// dialpad-sms-send — secure outbound SMS via Dialpad API
// POST { to, message, clientId? }
// Deploy: supabase functions deploy dialpad-sms-send --no-verify-jwt
//
// Required secrets:
//   supabase secrets set DIALPAD_API_KEY=xxx --project-ref ltpivkqahvplapyagljt
// Optional:
//   supabase secrets set DIALPAD_FROM_NUMBER=+19143915233 --project-ref ltpivkqahvplapyagljt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTenantId } from "../_shared/tenant.ts";

const DIALPAD_API_KEY   = Deno.env.get("DIALPAD_API_KEY") || "";
const DIALPAD_FROM      = Deno.env.get("DIALPAD_FROM_NUMBER") || "";
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  if (!DIALPAD_API_KEY) {
    return cors(JSON.stringify({ error: "DIALPAD_API_KEY not configured" }), 503);
  }

  const tenantId = resolveTenantId(req);

  let body: { to: string; message: string; clientId?: string; system?: boolean };
  try { body = await req.json(); } catch { return cors(JSON.stringify({ error: "Invalid JSON" }), 400); }

  const { to, message, clientId, system } = body;
  if (!to || !message) return cors(JSON.stringify({ error: "to and message required" }), 400);

  const toFormatted = normPhone(to);

  // ── TCPA opt-out check. Lookup recipient by last-10 digits; if they have
  // sms_opt_out=true, refuse with 403. Unknown numbers (no client row) pass
  // through — might be a non-client lead.
  //
  // EXCEPTION: when `system: true`, skip the check. System messages (STOP/START
  // confirmations, HELP responses) are TCPA-required even AFTER the user has
  // opted out, so the carrier expects those to go through.
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

  // Build Dialpad payload
  const dpPayload: Record<string, unknown> = {
    to_numbers: [toFormatted],
    text: message,
    infer_country_code: true,
  };
  if (DIALPAD_FROM) dpPayload.from_number = normPhone(DIALPAD_FROM);

  let dialpadOk = false;
  let dialpadError = "";

  try {
    const r = await fetch("https://dialpad.com/api/v2/sms", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DIALPAD_API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(dpPayload),
    });

    if (r.ok) {
      dialpadOk = true;
    } else {
      dialpadError = await r.text();
      console.error("Dialpad API error:", r.status, dialpadError);
    }
  } catch (e) {
    dialpadError = String(e);
    console.error("Dialpad fetch failed:", e);
  }

  // Log to communications table regardless of Dialpad success
  const commRow = {
    tenant_id: tenantId,
    client_id: clientId || null,
    type: "sms",
    channel: "sms",
    direction: "outbound",
    to_number: toFormatted,
    from_number: DIALPAD_FROM ? normPhone(DIALPAD_FROM) : null,
    body: message,
    status: dialpadOk ? "sent" : "send_failed",
    dialpad_id: "bm-out-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    metadata: {
      sent_via: "dialpad-sms-send",
      dialpad_ok: dialpadOk,
      dialpad_error: dialpadError || null,
      system: !!system,
    },
  };

  const { error: logErr } = await sb.from("communications").insert(commRow);
  if (logErr) console.warn("Failed to log outbound SMS:", logErr.message);

  if (!dialpadOk) {
    return cors(JSON.stringify({ ok: false, error: dialpadError || "Dialpad send failed", logged: true }), 502);
  }

  return cors(JSON.stringify({ ok: true, to: toFormatted }));
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
    console.error("dialpad-sms-send unhandled:", msg);
    return cors(JSON.stringify({ ok: false, error: "unhandled: " + msg }), 500);
  }
});
