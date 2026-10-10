// Resend webhook receiver — flips clients.email_status on bounce/complaint.
//
// Deploy:
//   supabase functions deploy resend-webhook --no-verify-jwt --project-ref ltpivkqahvplapyagljt
// Set secret:
//   supabase secrets set RESEND_WEBHOOK_SECRET=whsec_... --project-ref ltpivkqahvplapyagljt
// Register webhook in Resend dashboard at:
//   https://resend.com/webhooks → Add Endpoint
//   URL: https://ltpivkqahvplapyagljt.supabase.co/functions/v1/resend-webhook
//   Events: email.bounced, email.complained, email.delivered (optional)
//
// Schema: see migrate-resend-events.sql in project root.
//
// SECURITY POLICY — fail CLOSED if RESEND_WEBHOOK_SECRET is unset.
// Audit finding 2026-04-29: dialpad-webhook + bouncie-webhook fail OPEN
// (no secret == accept anything). That's a hole — any attacker who learns
// the public function URL can spam events. We do NOT repeat that mistake
// here: missing secret => 503 reject every request. This is intentional.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTenantFromEvent, SNT_TENANT_ID_CONST } from "../_shared/tenant.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET") || "";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Phase 2 — match Resend payload's `from` (sender domain) against
// tenants.config.from_email. Falls back to SNT.
async function tenantForResend(payload: { data?: { from?: string } }): Promise<string> {
  const from = String(payload?.data?.from || "").trim().toLowerCase();
  if (!from) return SNT_TENANT_ID_CONST;
  // Extract email from "Name <email>" format
  const m = from.match(/<([^>]+)>/);
  const email = (m ? m[1] : from).trim();
  return await resolveTenantFromEvent(sb, "from_email" as never, email);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, svix-id, svix-timestamp, svix-signature",
};

// Resend uses Svix for webhook signing.
// Signature header format: "v1,<base64-hmac-sha256(svix_id.svix_timestamp.body)>"
// Multiple sigs may be space-separated; any match passes.
// Secret format from Resend: "whsec_<base64>". The base64 portion is the HMAC key.
async function verifySvix(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  body: string,
): Promise<boolean> {
  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false;

  // Reject replays older than 5 min (matches Svix default)
  const tsNum = Number(svixTimestamp);
  if (!Number.isFinite(tsNum)) return false;
  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
  if (ageSec > 300) return false;

  // Strip whsec_ prefix if present, then base64-decode the secret
  const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = Uint8Array.from(atob(rawSecret), (c) => c.charCodeAt(0));
  } catch {
    // Not base64 — treat as raw utf-8 (some users paste the raw key)
    keyBytes = new TextEncoder().encode(rawSecret);
  }

  const signedPayload = `${svixId}.${svixTimestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  // Header may have multiple sigs space-separated, each prefixed with "v1,"
  for (const sig of svixSignature.split(" ")) {
    const trimmed = sig.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(",");
    if (parts.length !== 2) continue;
    const [version, b64] = parts;
    if (version !== "v1") continue;
    // Constant-time compare
    if (b64.length === expected.length) {
      let diff = 0;
      for (let i = 0; i < b64.length; i++) diff |= b64.charCodeAt(i) ^ expected.charCodeAt(i);
      if (diff === 0) return true;
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  // Verify probes (UptimeRobot HEAD, Resend preflight, etc.) get 200
  if (req.method === "GET" || req.method === "HEAD") {
    return new Response("resend-webhook ok", { status: 200, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  // Fail CLOSED — no secret configured == reject everything.
  // (See SECURITY POLICY note above. Do not change to fail-open.)
  if (!WEBHOOK_SECRET) {
    console.error("resend-webhook: RESEND_WEBHOOK_SECRET not set — rejecting");
    return new Response(
      JSON.stringify({ ok: false, error: "Webhook secret not configured" }),
      { status: 503, headers: { ...CORS, "content-type": "application/json" } },
    );
  }

  const rawBody = await req.text();
  const svixId = req.headers.get("svix-id") || "";
  const svixTimestamp = req.headers.get("svix-timestamp") || "";
  const svixSignature = req.headers.get("svix-signature") || "";

  const ok = await verifySvix(WEBHOOK_SECRET, svixId, svixTimestamp, svixSignature, rawBody);
  if (!ok) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid signature" }), {
      status: 401,
      headers: { ...CORS, "content-type": "application/json" },
    });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400, headers: CORS });
  }

  const type: string = payload.type || "";
  const data = payload.data || {};
  const recipientList: string[] = Array.isArray(data.to) ? data.to : (data.to ? [data.to] : []);
  const recipient = (recipientList[0] || "").toLowerCase().trim();

  // Phase 2 — resolve tenant from sender email (data.from). Falls back to SNT.
  const TENANT_ID = await tenantForResend(payload);

  // Normalize action label for the response
  let action: "bounce" | "complaint" | "delivered" | "ignored" = "ignored";

  if (type === "email.delivered") {
    // High-volume, low-value. Skip per spec.
    action = "delivered";
    return new Response(JSON.stringify({ ok: true, action }), {
      headers: { ...CORS, "content-type": "application/json" },
    });
  }

  if (!recipient) {
    return new Response(JSON.stringify({ ok: true, action, note: "no recipient" }), {
      headers: { ...CORS, "content-type": "application/json" },
    });
  }

  const bounceType: string | undefined = data?.bounce?.type; // "hard" | "soft" | undefined
  const bounceReason: string | undefined = data?.bounce?.reason;

  // Look up the matching client (case-insensitive, scoped to tenant) so we can
  // attach client_id to the comms row even on soft bounces.
  let clientId: string | null = null;
  try {
    const { data: rows } = await sb
      .from("clients")
      .select("id")
      .eq("tenant_id", TENANT_ID)
      .ilike("email", recipient)
      .limit(1);
    if (rows && rows.length) clientId = rows[0].id;
  } catch (e) {
    console.warn("client lookup failed:", e);
  }

  if (type === "email.bounced") {
    const isHard = (bounceType || "").toLowerCase() === "hard";
    action = "bounce";
    if (isHard) {
      // Flip email_status on every matching client (case-insensitive, tenant-scoped)
      const { error: patchErr } = await sb
        .from("clients")
        .update({ email_status: "bounced", email_status_at: new Date().toISOString() })
        .eq("tenant_id", TENANT_ID)
        .ilike("email", recipient);
      if (patchErr) console.warn("hard-bounce patch failed:", patchErr.message);
    }
    // Always log (hard and soft). The communications schema has a CHECK on
    // channel IN (call,sms,voicemail,email) and no `type`/`notes` columns —
    // we stuff bounce metadata into status + metadata.kind instead.
    const { error: commErr } = await sb.from("communications").insert({
      tenant_id: TENANT_ID,
      client_id: clientId,
      type: "email",
      channel: "email",
      direction: "inbound",
      from_number: null,
      to_number: null,
      body: `${isHard ? "Hard" : "Soft"} bounce → ${recipient}`,
      status: isHard ? "hard_bounce" : "soft_bounce",
      metadata: { kind: "email_bounce", reason: bounceReason || "", payload },
    });
    if (commErr) console.warn("bounce comms log failed:", commErr.message);
  } else if (type === "email.complained") {
    action = "complaint";
    const { error: patchErr } = await sb
      .from("clients")
      .update({ email_status: "complained", email_status_at: new Date().toISOString() })
      .eq("tenant_id", TENANT_ID)
      .ilike("email", recipient);
    if (patchErr) console.warn("complaint patch failed:", patchErr.message);

    const { error: commErr } = await sb.from("communications").insert({
      tenant_id: TENANT_ID,
      client_id: clientId,
      type: "email",
      channel: "email",
      direction: "inbound",
      body: `Spam complaint → ${recipient}`,
      status: "complained",
      metadata: { kind: "email_complaint", reason: bounceReason || "", payload },
    });
    if (commErr) console.warn("complaint comms log failed:", commErr.message);
  } else {
    // Unknown / unhandled event type — ack so Resend doesn't retry forever.
    action = "ignored";
  }

  return new Response(JSON.stringify({ ok: true, action }), {
    headers: { ...CORS, "content-type": "application/json" },
  });
});
