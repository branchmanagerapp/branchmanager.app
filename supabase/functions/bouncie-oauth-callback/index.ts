// v741: bouncie-oauth-callback — one-time OAuth2 authorization_code
// handler for Bouncie. Bouncie's REST API requires a real OAuth access
// token; client_credentials grant isn't supported, so we have to do
// the user-flow exactly once per tenant to bootstrap.
//
// FLOW
// 1. Register a redirect URI in your Bouncie developer console:
//      https://ltpivkqahvplapyagljt.supabase.co/functions/v1/bouncie-oauth-callback
// 2. Visit (in your browser, logged into the right Bouncie account):
//      https://auth.bouncie.com/dialog/authorize?client_id=$BOUNCIE_CLIENT_ID&redirect_uri=https://ltpivkqahvplapyagljt.supabase.co/functions/v1/bouncie-oauth-callback&response_type=code&state=$TENANT_ID
// 3. Approve. Bouncie redirects back to this endpoint with ?code=... &state=$TENANT_ID
// 4. This function exchanges code → access_token + refresh_token, then
//    writes them into tenants.config.bouncie for the tenant in `state`.
// 5. From then on, bouncie-rest-sync reads the token from that jsonb and
//    auto-refreshes on 401 using refresh_token + client_id/secret.
//
// Deploy:
//   SUPABASE_ACCESS_TOKEN=... npx supabase functions deploy bouncie-oauth-callback \
//     --project-ref ltpivkqahvplapyagljt
//
// Must run with verify_jwt = false (Bouncie redirects browsers here, no Supabase JWT).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLIENT_ID = Deno.env.get("BOUNCIE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("BOUNCIE_CLIENT_SECRET") ?? "";
const REDIRECT_URI = Deno.env.get("BOUNCIE_REDIRECT_URI")
  ?? "https://ltpivkqahvplapyagljt.supabase.co/functions/v1/bouncie-oauth-callback";
const TOKEN_URL = Deno.env.get("BOUNCIE_TOKEN_URL") ?? "https://auth.bouncie.com/oauth/token";

function htmlResp(status: number, body: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Bouncie OAuth</title>` +
      `<style>body{font:14px/1.5 -apple-system,system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#1f2937}` +
      `h1{font-size:18px;margin:0 0 12px;color:${status === 200 ? "#065f46" : "#991b1b"}}` +
      `pre{background:#f3f4f6;padding:12px;border-radius:6px;overflow:auto;font-size:12px}</style>` +
      body,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // tenant_id
  const err = url.searchParams.get("error");

  if (err) {
    return htmlResp(400, `<h1>Bouncie rejected the request</h1><pre>${err}\n${url.searchParams.get("error_description") ?? ""}</pre>`);
  }
  if (!code) {
    return htmlResp(400, `<h1>Missing ?code from Bouncie</h1><p>This URL is the OAuth callback — visit the authorize URL instead. See function header for steps.</p>`);
  }
  if (!state) {
    return htmlResp(400, `<h1>Missing ?state</h1><p>Re-launch the authorize URL with <code>state=&lt;tenant_id&gt;</code> so we know where to store the token.</p>`);
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return htmlResp(500, `<h1>Server misconfigured</h1><p>BOUNCIE_CLIENT_ID / BOUNCIE_CLIENT_SECRET are not set in Supabase secrets.</p>`);
  }

  // Exchange code → tokens
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
  });
  const tr = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const text = await tr.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    return htmlResp(502, `<h1>Bouncie returned non-JSON</h1><pre>${tr.status} ${text.slice(0, 800).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] ?? c))}</pre>`);
  }

  if (!tr.ok || !parsed.access_token) {
    return htmlResp(tr.status || 502, `<h1>Token exchange failed</h1><pre>${JSON.stringify(parsed, null, 2)}</pre>`);
  }

  const accessToken = parsed.access_token as string;
  const refreshToken = (parsed.refresh_token as string) ?? null;
  const expiresIn = (parsed.expires_in as number) ?? 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const scope = (parsed.scope as string) ?? "";

  // Store on tenants.config.bouncie (merging into existing jsonb)
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: tenant } = await sb.from("tenants").select("config").eq("id", state).maybeSingle();
  const nextConfig = { ...(tenant?.config ?? {}) };
  nextConfig.bouncie = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    scope,
    obtained_at: new Date().toISOString(),
  };
  const { error: updErr } = await sb.from("tenants").update({ config: nextConfig }).eq("id", state);
  if (updErr) {
    return htmlResp(500, `<h1>Got token but couldn't save it</h1><pre>${updErr.message}</pre>`);
  }

  return htmlResp(
    200,
    `<h1>Bouncie connected ✓</h1>` +
      `<p>Access token stored on tenants.config.bouncie. <code>bouncie-rest-sync</code> can now pull positions for this tenant.</p>` +
      `<p>Expires: ${expiresAt}<br>Has refresh token: ${refreshToken ? "yes" : "no"}<br>Scope: ${scope || "(none)"}</p>` +
      `<p>You can close this tab.</p>`,
  );
});
