// social-publish — publish one SocialBranch post NOW through the native
// connections (Facebook / Instagram / Google Business) stored in
// tenants.config.social. Called by the BM client when Doug taps
// "Publish / Schedule" with no date, and usable by the runner.
//
//   POST { tenant, post: { id, caption, networks, media_urls } }
//   → { ok, results: { facebook:{ok,id,url,error}, … }, unhandled:[…] }
//
// It also upserts the social_posts row with the outcome so the calendar,
// the digest, and other devices see it.
//
// Deploy: npx supabase functions deploy social-publish --no-verify-jwt --project-ref ltpivkqahvplapyagljt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { publishNative } from "../_shared/social.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json(400, { error: "bad json" }); }

  const tenant = String(body.tenant || req.headers.get("x-tenant-id") || "").toLowerCase();
  if (!UUID_RE.test(tenant)) return json(400, { error: "tenant required" });
  const post = body.post || {};
  const id = String(post.id || "");
  if (!id) return json(400, { error: "post.id required" });
  const networks: string[] = Array.isArray(post.networks) ? post.networks : [];
  const media: string[] = (Array.isArray(post.media_urls) ? post.media_urls : []).filter((m: string) => /^https?:\/\//i.test(m));
  if (!networks.length) return json(400, { error: "no networks" });

  const now = new Date().toISOString();
  const { results, unhandled, anyConnected } = await publishNative(sb, tenant, { caption: post.caption || "", networks, media_urls: media });
  const okCount = Object.values(results).filter((r) => r.ok).length;
  const failCount = Object.values(results).filter((r) => !r.ok).length;
  const status = okCount && !failCount && !unhandled.length ? "posted" : okCount ? "posted" : anyConnected ? "failed" : "draft";

  await sb.from("social_posts").upsert({
    id, tenant_id: tenant,
    caption: String(post.caption || "").slice(0, 4000),
    networks, media_urls: media, has_local_media: false,
    scheduled_at: post.scheduled_at || null,
    status, posted_at: okCount ? now : null,
    results: { backend: "native", results, unhandled, at: now },
    updated_at: now,
  });

  return json(200, { ok: okCount > 0, status, results, unhandled, anyConnected });
});
