// _shared/social.ts — native social publishing for SocialBranch (v1221).
//
// Tokens live in tenants.config.social (same pattern as config.bouncie /
// config.jobber): server-side only, never sent to the browser.
//
//   config.social = {
//     facebook:  { page_id, page_name, page_token, connected_at },
//     instagram: { ig_user_id, username, page_token, connected_at },
//     gmb:       { account_name, location_name, location_title, refresh_token, connected_at },
//     meta_user: { user_token, expires_at }          // long-lived user token (refresh source)
//   }
//
// Publishing (Meta Graph API v25.0, verified from developers.facebook.com Sept 12 2026):
//   Facebook photo post : POST /{page_id}/photos   { url, message }
//   Facebook text post  : POST /{page_id}/feed     { message }
//   Instagram image     : POST /{ig_id}/media { image_url, caption } → POST /{ig_id}/media_publish { creation_id }
//                         (JPEG only, public URL; 100 API posts / 24h)
//   Google Business     : POST https://mybusiness.googleapis.com/v4/{account}/{location}/localPosts
//                         { languageCode, summary, topicType: STANDARD, media:[{mediaFormat:PHOTO, sourceUrl}] }
//
// Every publisher returns { ok, id?, url?, error? } and never throws.

export const GRAPH = "https://graph.facebook.com/v25.0";

export type NetResult = { ok: boolean; id?: string; url?: string; error?: string };

export interface SocialConfig {
  facebook?: { page_id: string; page_name?: string; page_token: string; connected_at?: string };
  instagram?: { ig_user_id: string; username?: string; page_token: string; connected_at?: string };
  gmb?: { account_name: string; location_name: string; location_title?: string; refresh_token: string; connected_at?: string };
  meta_user?: { user_token: string; expires_at?: string };
}

// deno-lint-ignore no-explicit-any
export async function loadSocialConfig(sb: any, tenantId: string): Promise<SocialConfig> {
  const { data } = await sb.from("tenants").select("config").eq("id", tenantId).maybeSingle();
  return (data?.config?.social || {}) as SocialConfig;
}

// deno-lint-ignore no-explicit-any
export async function saveSocialConfig(sb: any, tenantId: string, patch: Partial<SocialConfig>, remove: string[] = []) {
  const { data } = await sb.from("tenants").select("config").eq("id", tenantId).maybeSingle();
  const config = data?.config || {};
  const social = { ...(config.social || {}), ...patch };
  for (const k of remove) delete (social as Record<string, unknown>)[k];
  config.social = social;
  const { error } = await sb.from("tenants").update({ config }).eq("id", tenantId);
  if (error) throw new Error("tenants.config write failed: " + error.message);
}

/** Public, token-free view of what is connected — safe to return to the browser. */
export function socialStatus(cfg: SocialConfig) {
  return {
    facebook:  cfg.facebook  ? { name: cfg.facebook.page_name || cfg.facebook.page_id, since: cfg.facebook.connected_at } : null,
    instagram: cfg.instagram ? { name: cfg.instagram.username ? "@" + cfg.instagram.username : cfg.instagram.ig_user_id, since: cfg.instagram.connected_at } : null,
    gmb:       cfg.gmb       ? { name: cfg.gmb.location_title || cfg.gmb.location_name, since: cfg.gmb.connected_at } : null,
  };
}

function isVideo(url: string) { return /\.(mp4|mov|webm|m4v)($|\?)/i.test(url); }

async function graph(path: string, token: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const form = new URLSearchParams({ ...body, access_token: token });
  const r = await fetch(`${GRAPH}${path}`, { method: "POST", body: form });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    throw new Error(`${e.type || "GraphError"} ${e.code || r.status}: ${e.message || "request failed"}`);
  }
  return j;
}

export async function publishFacebook(cfg: SocialConfig, caption: string, media: string[]): Promise<NetResult> {
  const fb = cfg.facebook;
  if (!fb?.page_token) return { ok: false, error: "Facebook not connected" };
  try {
    const img = media.find((m) => !isVideo(m));
    if (img) {
      const j = await graph(`/${fb.page_id}/photos`, fb.page_token, { url: img, message: caption });
      const postId = String(j.post_id || j.id || "");
      return { ok: true, id: postId, url: postId ? `https://www.facebook.com/${postId}` : undefined };
    }
    const j = await graph(`/${fb.page_id}/feed`, fb.page_token, { message: caption });
    return { ok: true, id: String(j.id || ""), url: j.id ? `https://www.facebook.com/${j.id}` : undefined };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

export async function publishInstagram(cfg: SocialConfig, caption: string, media: string[]): Promise<NetResult> {
  const ig = cfg.instagram;
  if (!ig?.page_token) return { ok: false, error: "Instagram not connected" };
  const img = media.find((m) => !isVideo(m));
  if (!img) return { ok: false, error: "Instagram needs a photo (JPEG) — text-only posts aren't supported" };
  if (!/\.(jpe?g)($|\?)/i.test(img)) return { ok: false, error: "Instagram accepts JPEG only — this image is not a .jpg" };
  try {
    const c = await graph(`/${ig.ig_user_id}/media`, ig.page_token, { image_url: img, caption });
    const creationId = String(c.id || "");
    // Container can take a moment to process; retry publish a few times.
    let lastErr = "";
    for (let i = 0; i < 6; i++) {
      try {
        const p = await graph(`/${ig.ig_user_id}/media_publish`, ig.page_token, { creation_id: creationId });
        return { ok: true, id: String(p.id || "") };
      } catch (e) {
        lastErr = String((e as Error).message || e);
        if (!/not ready|9007|2207027|try again/i.test(lastErr)) break;
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    return { ok: false, error: lastErr || "media_publish failed" };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

// ── Google Business Profile ────────────────────────────────────────────────
export async function googleAccessToken(refreshToken: string): Promise<string> {
  const id = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
  const secret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "";
  if (!id || !secret) throw new Error("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not set");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Google token refresh failed: " + (j.error_description || j.error || r.status));
  return String(j.access_token);
}

export async function publishGmb(cfg: SocialConfig, caption: string, media: string[]): Promise<NetResult> {
  const g = cfg.gmb;
  if (!g?.refresh_token) return { ok: false, error: "Google Business not connected" };
  try {
    const token = await googleAccessToken(g.refresh_token);
    const img = media.find((m) => !isVideo(m));
    const body: Record<string, unknown> = {
      languageCode: "en-US",
      summary: caption.slice(0, 1500),
      topicType: "STANDARD",
    };
    if (img) body.media = [{ mediaFormat: "PHOTO", sourceUrl: img }];
    // location_name is "locations/123"; account_name is "accounts/456"
    const r = await fetch(`https://mybusiness.googleapis.com/v4/${g.account_name}/${g.location_name}/localPosts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: `GBP ${r.status}: ${j.error?.message || "localPosts failed"}` };
    return { ok: true, id: String(j.name || ""), url: j.searchUrl ? String(j.searchUrl) : undefined };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

/**
 * Publish one social_posts row to every network it names that is natively
 * connected. Returns per-network results plus the list of networks that had
 * no native connection (caller may fall back to a webhook for those).
 */
// deno-lint-ignore no-explicit-any
export async function publishNative(sb: any, tenantId: string, post: { caption?: string; networks?: string[]; media_urls?: string[] }) {
  const cfg = await loadSocialConfig(sb, tenantId);
  const caption = post.caption || "";
  const media = Array.isArray(post.media_urls) ? post.media_urls : [];
  const results: Record<string, NetResult> = {};
  const unhandled: string[] = [];
  for (const net of post.networks || []) {
    if (net === "facebook" && cfg.facebook) results.facebook = await publishFacebook(cfg, caption, media);
    else if (net === "instagram" && cfg.instagram) results.instagram = await publishInstagram(cfg, caption, media);
    else if (net === "gmb" && cfg.gmb) results.gmb = await publishGmb(cfg, caption, media);
    else unhandled.push(net);
  }
  return { results, unhandled, anyConnected: Object.keys(results).length > 0 };
}
