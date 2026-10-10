// social-connect — native network connections for SocialBranch (v1221).
//
// One function, four jobs (all keyed by ?tenant=<uuid>):
//   GET  ?net=meta&tenant=…&return=<url>     → 302 to Facebook Login (Pages + Instagram)
//   GET  ?net=google&tenant=…&return=<url>   → 302 to Google OAuth (Business Profile)
//   GET  ?cb=meta|google&code=…&state=…      → OAuth callback: exchange, discover accounts,
//                                              save into tenants.config.social, 302 back
//   GET  ?status=1&tenant=…                  → JSON { facebook, instagram, gmb } (names only)
//   POST { tenant, action:"disconnect", network }  → removes that network's tokens
//
// Secrets (npx supabase secrets set … --project-ref ltpivkqahvplapyagljt):
//   META_APP_ID, META_APP_SECRET            — Meta developer app (Facebook Login for Business)
//   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET — Google Cloud OAuth web client
//   SOCIAL_STATE_SECRET                     — any random string; signs the OAuth state
//
// Redirect URIs to register with each provider (exactly):
//   https://ltpivkqahvplapyagljt.supabase.co/functions/v1/social-connect?cb=meta
//   https://ltpivkqahvplapyagljt.supabase.co/functions/v1/social-connect?cb=google
//
// Deploy: npx supabase functions deploy social-connect --no-verify-jwt --project-ref ltpivkqahvplapyagljt
// (no-verify-jwt: providers redirect browsers here without a Supabase JWT).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GRAPH, loadSocialConfig, saveSocialConfig, socialStatus } from "../_shared/social.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const SELF = `${SUPABASE_URL}/functions/v1/social-connect`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_RETURN = "https://branchmanager.app/#socialbranch";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const redirect = (url: string) => new Response(null, { status: 302, headers: { Location: url, ...CORS } });

// ── signed state (tenant + return url + nonce) ─────────────────────────────
const enc = new TextEncoder();
function b64u(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64u(s: string) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return new Uint8Array(atob(s).split("").map((c) => c.charCodeAt(0))); }
async function hmac(data: string) {
  const secret = Deno.env.get("SOCIAL_STATE_SECRET") || Deno.env.get("META_APP_SECRET") || "bm-social";
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}
async function mintState(tenant: string, ret: string) {
  const payload = b64u(enc.encode(JSON.stringify({ t: tenant, r: ret, n: crypto.randomUUID(), e: Date.now() + 15 * 60_000 })));
  return `${payload}.${await hmac(payload)}`;
}
async function readState(state: string): Promise<{ t: string; r: string } | null> {
  const [payload, sig] = state.split(".");
  if (!payload || !sig || sig !== await hmac(payload)) return null;
  try {
    const o = JSON.parse(new TextDecoder().decode(unb64u(payload)));
    if (!UUID_RE.test(o.t) || o.e < Date.now()) return null;
    return { t: o.t, r: o.r || DEFAULT_RETURN };
  } catch { return null; }
}
function backTo(ret: string, params: Record<string, string>) {
  // Keep the app's hash route; put status in the query so the client can toast it.
  const [base, hash] = ret.split("#");
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString() + (hash ? "#" + hash : "");
}

// ── Meta ───────────────────────────────────────────────────────────────────
const META_SCOPES = [
  "pages_show_list", "pages_read_engagement", "pages_manage_posts",
  "instagram_basic", "instagram_content_publish", "business_management",
].join(",");

async function metaStart(tenant: string, ret: string) {
  const appId = Deno.env.get("META_APP_ID") || "";
  if (!appId) return json(500, { error: "META_APP_ID not set" });
  const state = await mintState(tenant, ret);
  const u = new URL("https://www.facebook.com/v25.0/dialog/oauth");
  u.searchParams.set("client_id", appId);
  u.searchParams.set("redirect_uri", `${SELF}?cb=meta`);
  u.searchParams.set("scope", META_SCOPES);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return redirect(u.toString());
}

async function metaCallback(url: URL) {
  const st = await readState(url.searchParams.get("state") || "");
  if (!st) return json(400, { error: "bad or expired state" });
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (err) return redirect(backTo(st.r, { social: "meta", ok: "0", msg: err }));
  const code = url.searchParams.get("code") || "";
  const appId = Deno.env.get("META_APP_ID") || "";
  const appSecret = Deno.env.get("META_APP_SECRET") || "";
  try {
    // 1. code → short-lived user token
    const t1 = await (await fetch(`${GRAPH}/oauth/access_token?` + new URLSearchParams({
      client_id: appId, client_secret: appSecret, redirect_uri: `${SELF}?cb=meta`, code,
    }))).json();
    if (!t1.access_token) throw new Error(t1.error?.message || "code exchange failed");
    // 2. short → long-lived user token (~60 days); page tokens derived from it don't expire
    const t2 = await (await fetch(`${GRAPH}/oauth/access_token?` + new URLSearchParams({
      grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: t1.access_token,
    }))).json();
    const userToken = String(t2.access_token || t1.access_token);
    // 3. pages this user manages (+ linked Instagram business account)
    const pages = await (await fetch(`${GRAPH}/me/accounts?` + new URLSearchParams({
      fields: "id,name,access_token,instagram_business_account{id,username}", limit: "50", access_token: userToken,
    }))).json();
    const list: Array<Record<string, any>> = pages.data || [];
    if (!list.length) throw new Error("No Facebook Pages found on this login. Log in with the account that admins the Second Nature Tree page.");
    // Prefer a page whose name mentions "Second Nature"; else the first page.
    const page = list.find((p) => /second nature/i.test(p.name || "")) || list[0];
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      meta_user: { user_token: userToken, expires_at: t2.expires_in ? new Date(Date.now() + t2.expires_in * 1000).toISOString() : null },
      facebook: { page_id: page.id, page_name: page.name, page_token: page.access_token, connected_at: now },
    };
    const remove: string[] = [];
    if (page.instagram_business_account?.id) {
      patch.instagram = { ig_user_id: page.instagram_business_account.id, username: page.instagram_business_account.username, page_token: page.access_token, connected_at: now };
    } else {
      remove.push("instagram");
    }
    await saveSocialConfig(sb, st.t, patch, remove);
    const msg = `Facebook: ${page.name}` + (page.instagram_business_account ? ` · Instagram: @${page.instagram_business_account.username}` : " · Instagram: no professional account linked to this Page");
    return redirect(backTo(st.r, { social: "meta", ok: "1", msg }));
  } catch (e) {
    return redirect(backTo(st.r, { social: "meta", ok: "0", msg: String((e as Error).message || e) }));
  }
}

// ── Google (Business Profile) ──────────────────────────────────────────────
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/business.manage";

async function googleStart(tenant: string, ret: string) {
  const id = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
  if (!id) return json(500, { error: "GOOGLE_OAUTH_CLIENT_ID not set" });
  const state = await mintState(tenant, ret);
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", `${SELF}?cb=google`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_SCOPES);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("state", state);
  return redirect(u.toString());
}

async function googleCallback(url: URL) {
  const st = await readState(url.searchParams.get("state") || "");
  if (!st) return json(400, { error: "bad or expired state" });
  const err = url.searchParams.get("error");
  if (err) return redirect(backTo(st.r, { social: "google", ok: "0", msg: err }));
  const code = url.searchParams.get("code") || "";
  const id = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
  const secret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "";
  try {
    const tok = await (await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: `${SELF}?cb=google`, grant_type: "authorization_code" }),
    })).json();
    if (!tok.refresh_token) throw new Error(tok.error_description || tok.error || "no refresh_token returned (revoke the app at myaccount.google.com/permissions and reconnect)");
    const bearer = { Authorization: `Bearer ${tok.access_token}` };
    // Accounts → first account's locations (Second Nature Tree has one).
    const acc = await (await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: bearer })).json();
    const accounts: Array<Record<string, any>> = acc.accounts || [];
    if (!accounts.length) throw new Error(acc.error?.message || "No Business Profile accounts on this Google login (or the Business Profile API isn't approved yet — quota 0)");
    let chosen: { account: string; location: string; title: string } | null = null;
    for (const a of accounts) {
      const loc = await (await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title`, { headers: bearer })).json();
      const locs: Array<Record<string, any>> = loc.locations || [];
      const pick = locs.find((l) => /second nature/i.test(l.title || "")) || locs[0];
      if (pick) { chosen = { account: a.name, location: pick.name, title: pick.title }; break; }
    }
    if (!chosen) throw new Error("No locations found under this Google account");
    await saveSocialConfig(sb, st.t, {
      gmb: { account_name: chosen.account, location_name: chosen.location, location_title: chosen.title, refresh_token: tok.refresh_token, connected_at: new Date().toISOString() },
    });
    return redirect(backTo(st.r, { social: "google", ok: "1", msg: `Google Business: ${chosen.title}` }));
  } catch (e) {
    return redirect(backTo(st.r, { social: "google", ok: "0", msg: String((e as Error).message || e) }));
  }
}

// ── router ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);

  if (req.method === "POST") {
    let body: Record<string, string> = {};
    try { body = await req.json(); } catch { return json(400, { error: "bad json" }); }
    const tenant = String(body.tenant || req.headers.get("x-tenant-id") || "").toLowerCase();
    if (!UUID_RE.test(tenant)) return json(400, { error: "tenant required" });
    if (body.action === "disconnect") {
      const net = String(body.network || "");
      const remove = net === "facebook" ? ["facebook", "instagram", "meta_user"] : net === "instagram" ? ["instagram"] : net === "gmb" ? ["gmb"] : [];
      if (!remove.length) return json(400, { error: "unknown network" });
      await saveSocialConfig(sb, tenant, {}, remove);
      return json(200, { ok: true, status: socialStatus(await loadSocialConfig(sb, tenant)) });
    }
    return json(400, { error: "unknown action" });
  }

  const cb = url.searchParams.get("cb");
  if (cb === "meta") return metaCallback(url);
  if (cb === "google") return googleCallback(url);

  const tenant = String(url.searchParams.get("tenant") || req.headers.get("x-tenant-id") || "").toLowerCase();
  if (!UUID_RE.test(tenant)) return json(400, { error: "tenant required" });

  if (url.searchParams.get("status")) {
    const cfg = await loadSocialConfig(sb, tenant);
    return json(200, {
      ok: true,
      status: socialStatus(cfg),
      configured: { meta: !!Deno.env.get("META_APP_ID"), google: !!Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") },
    });
  }

  const ret = url.searchParams.get("return") || DEFAULT_RETURN;
  const net = url.searchParams.get("net");
  if (net === "meta") return metaStart(tenant, ret);
  if (net === "google") return googleStart(tenant, ret);
  return json(400, { error: "net must be meta or google" });
});
