// jobber-oauth — exchanges a Jobber OAuth authorization code for tokens and
// stores them on the tenant (config.jobber). Server-side only: client_secret
// never reaches the browser. STAGED Aug 13 2026 — deploy once JOBBER_CLIENT_ID
// / JOBBER_CLIENT_SECRET secrets are set:
//   npx supabase secrets set JOBBER_CLIENT_ID=... JOBBER_CLIENT_SECRET=... --project-ref ltpivkqahvplapyagljt
//   npx supabase functions deploy jobber-oauth --project-ref ltpivkqahvplapyagljt --no-verify-jwt
//
// Jobber token endpoint (verified from developer.getjobber.com): POST
// https://api.getjobber.com/api/oauth/token with client_id, client_secret,
// grant_type, code, redirect_uri.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Default tenant = Second Nature Tree (single-tenant for now). When a second
// tenant connects Jobber, thread the tenant id through `state` and resolve here.
const SNT_TENANT = "93af4348-8bba-4045-ac3e-5e71ec1cc8c5";
const JOBBER_TOKEN_URL = "https://api.getjobber.com/api/oauth/token";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j(405, { error: "POST only" });

  const clientId = Deno.env.get("JOBBER_CLIENT_ID");
  const clientSecret = Deno.env.get("JOBBER_CLIENT_SECRET");
  if (!clientId || !clientSecret) return j(500, { error: "JOBBER_CLIENT_ID / JOBBER_CLIENT_SECRET not set on the function" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return j(400, { error: "bad json" }); }
  const code = String(body.code || "");
  const redirectUri = String(body.redirect_uri || "");
  if (!code) return j(400, { error: "missing code" });

  // Exchange the authorization code for tokens.
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const tokRes = await fetch(JOBBER_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const tok = await tokRes.json().catch(() => ({}));
  if (!tokRes.ok || !tok.access_token) {
    return j(400, { error: "jobber_token_exchange_failed", status: tokRes.status, detail: tok });
  }

  // Persist tokens on the tenant (service role — bypasses RLS).
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: tenant } = await admin.from("tenants").select("config").eq("id", SNT_TENANT).single();
  const config = (tenant?.config as Record<string, unknown>) || {};
  config.jobber = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Date.now() + (Number(tok.expires_in || 3600) * 1000),
    obtained_at: Date.now(),
    scope: tok.scope || null,
  };
  const { error: upErr } = await admin.from("tenants").update({ config }).eq("id", SNT_TENANT);
  if (upErr) return j(500, { error: "store_failed", detail: upErr.message });

  return j(200, { connected: true });
});
