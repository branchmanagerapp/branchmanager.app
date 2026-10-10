// jobber-oauth-callback — one-time OAuth2 authorization_code handler for
// Jobber (mirrors bouncie-oauth-callback). Jobber's API is OAuth2 auth-code;
// you create a developer app at developer.getjobber.com to get a client_id +
// secret, register this URL as the redirect URI, then authorize your own
// Jobber account once to bootstrap tokens.
//
// FLOW
// 1. Register redirect URI in the Jobber developer app:
//      https://ltpivkqahvplapyagljt.supabase.co/functions/v1/jobber-oauth-callback
// 2. Set Supabase secrets: JOBBER_CLIENT_ID, JOBBER_CLIENT_SECRET.
// 3. Visit (logged into the right Jobber account):
//      https://api.getjobber.com/api/oauth/authorize?client_id=$JOBBER_CLIENT_ID&redirect_uri=<this fn>&response_type=code&state=$TENANT_ID
//    (The BM "Connect Jobber" button builds this URL for you.)
// 4. Approve → Jobber redirects here with ?code=...&state=$TENANT_ID.
// 5. This exchanges code → access_token + refresh_token, stores them on
//    tenants.config.jobber. jobber-sync then reads + auto-refreshes them.
//
// Deploy with verify_jwt = false (Jobber redirects a browser here, no JWT).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLIENT_ID     = Deno.env.get("JOBBER_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("JOBBER_CLIENT_SECRET") ?? "";
const REDIRECT_URI  = Deno.env.get("JOBBER_REDIRECT_URI")
  ?? "https://ltpivkqahvplapyagljt.supabase.co/functions/v1/jobber-oauth-callback";
const TOKEN_URL     = Deno.env.get("JOBBER_TOKEN_URL") ?? "https://api.getjobber.com/api/oauth/token";

function htmlResp(status: number, body: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Jobber OAuth</title>` +
      `<style>body{font:14px/1.5 -apple-system,system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#1f2937}` +
      `h1{font-size:18px;margin:0 0 12px;color:${status === 200 ? "#065f46" : "#991b1b"}}` +
      `pre{background:#f3f4f6;padding:12px;border-radius:6px;overflow:auto;font-size:12px}</style>` + body,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // tenant_id
  const err = url.searchParams.get("error");

  if (err) return htmlResp(400, `<h1>Jobber rejected the request</h1><pre>${err}\n${url.searchParams.get("error_description") ?? ""}</pre>`);
  if (!code) return htmlResp(400, `<h1>Missing ?code from Jobber</h1><p>This is the OAuth callback — start from the authorize URL (use the Connect Jobber button in BM).</p>`);
  if (!state) return htmlResp(400, `<h1>Missing ?state</h1><p>Re-launch authorize with <code>state=&lt;tenant_id&gt;</code>.</p>`);
  if (!CLIENT_ID || !CLIENT_SECRET) return htmlResp(500, `<h1>Server misconfigured</h1><p>JOBBER_CLIENT_ID / JOBBER_CLIENT_SECRET are not set in Supabase secrets.</p>`);

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
  try { parsed = JSON.parse(text); }
  catch { return htmlResp(502, `<h1>Jobber returned non-JSON</h1><pre>${tr.status} ${text.slice(0, 800).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] ?? c))}</pre>`); }

  if (!tr.ok || !parsed.access_token) return htmlResp(tr.status || 502, `<h1>Token exchange failed</h1><pre>${JSON.stringify(parsed, null, 2)}</pre>`);

  const accessToken = parsed.access_token as string;
  const refreshToken = (parsed.refresh_token as string) ?? null;
  const expiresIn = (parsed.expires_in as number) ?? 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: tenant } = await sb.from("tenants").select("config").eq("id", state).maybeSingle();
  const nextConfig = { ...(tenant?.config ?? {}) };
  nextConfig.jobber = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    connected: true,
    obtained_at: new Date().toISOString(),
  };
  const { error: updErr } = await sb.from("tenants").update({ config: nextConfig }).eq("id", state);
  if (updErr) return htmlResp(500, `<h1>Got token but couldn't save it</h1><pre>${updErr.message}</pre>`);

  return htmlResp(200,
    `<h1>Jobber connected ✓</h1>` +
      `<p>Token stored on tenants.config.jobber. <code>jobber-sync</code> will now pull revenue for this tenant, and the Weekly P&amp;L report will use live Jobber revenue.</p>` +
      `<p>Expires: ${expiresAt}<br>Has refresh token: ${refreshToken ? "yes" : "no"}</p><p>You can close this tab.</p>`);
});
