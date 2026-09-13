// social-post-runner — fires Doug-scheduled social posts server-side.
//
// v1091: Zapier/Make webhook backend.
// v1221: NATIVE backend first (Facebook / Instagram / Google Business via
//        tokens in tenants.config.social, see _shared/social.ts); the webhook
//        is only used for networks that have no native connection.
//
// Runs on an hourly pg_cron. Reads social_posts rows with status='scheduled'
// whose scheduled_at has passed and marks them posted/failed.
//
// GUARANTEES:
//   - Never composes or schedules anything itself: only posts a human
//     scheduled in the app ever fire. Scheduling in BM = the approval.
//   - No native connection AND no webhook → posts stay 'scheduled' untouched
//     (the daily digest flags them), nothing fires.
//   - Media that exists only on the phone (data-URLs never uploaded) →
//     marked 'failed' with a clear note instead of posting captionless.
//
// Deploy: npx supabase functions deploy social-post-runner --no-verify-jwt --project-ref ltpivkqahvplapyagljt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { publishNative } from "../_shared/social.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

function detectType(url: string): string {
  if (/\.(mp4|mov|webm|m4v)($|\?)/i.test(url)) return "video";
  return "image";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method === "GET" || req.method === "HEAD") {
    return new Response("social-post-runner ok", { status: 200 });
  }

  const now = new Date().toISOString();
  const { data: due, error } = await sb
    .from("social_posts")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", now)
    .limit(25);
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }
  if (!due || !due.length) {
    return new Response(JSON.stringify({ ok: true, fired: 0 }), { status: 200 });
  }

  const webhookCache: Record<string, string> = {};
  const summary: Record<string, unknown>[] = [];

  for (const post of due) {
    const tid = post.tenant_id as string;
    const media: string[] = Array.isArray(post.media_urls) ? post.media_urls : [];
    if (post.has_local_media && !media.length) {
      await sb.from("social_posts").update({
        status: "failed",
        results: { backend: "runner", error: "Media exists only on the device it was composed on — open Branch Manager there and re-schedule so the photo uploads." },
        updated_at: now,
      }).eq("id", post.id);
      summary.push({ id: post.id, action: "failed_local_media" });
      continue;
    }

    // 1) Native connections first.
    const native = await publishNative(sb, tid, { caption: post.caption || "", networks: post.networks || [], media_urls: media });
    const results: Record<string, unknown> = { ...native.results };
    let remaining = native.unhandled;

    // 2) Webhook for whatever isn't natively connected.
    if (remaining.length) {
      if (!(tid in webhookCache)) {
        const { data: rows } = await sb
          .from("tenant_settings")
          .select("value")
          .eq("tenant_id", tid)
          .eq("key", "bm-socialpilot-webhook")
          .limit(1);
        webhookCache[tid] = (rows && rows[0]?.value) || "";
      }
      const webhook = webhookCache[tid];
      if (webhook && webhook.length >= 10) {
        const mediaType = media.length ? detectType(media[0]) : "none";
        const payload = {
          id: post.id,
          caption: post.caption || "",
          imageUrl: mediaType === "image" ? (media[0] || "") : "",
          videoUrl: mediaType === "video" ? (media[0] || "") : "",
          mediaUrl: media[0] || "",
          mediaType,
          media,
          platforms: remaining,
          scheduledAt: post.scheduled_at || "",
          youtubeTitle: (post.caption || "").substring(0, 100),
        };
        try {
          const r = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          results.webhook = { ok: r.ok, httpStatus: r.status, platforms: remaining };
        } catch (e) {
          results.webhook = { ok: false, error: String((e as Error).message || e), platforms: remaining };
        }
        remaining = [];
      }
    }

    const outcomes = Object.values(results) as Array<{ ok?: boolean }>;
    if (!outcomes.length) {
      // Nothing connected at all — leave scheduled; the digest surfaces it.
      summary.push({ id: post.id, action: "skipped_no_backend", networks: post.networks });
      continue;
    }
    const okCount = outcomes.filter((o) => o.ok).length;
    const status = okCount > 0 ? "posted" : "failed";
    await sb.from("social_posts").update({
      status,
      posted_at: okCount > 0 ? now : null,
      results: { backend: "runner", results, unhandled: remaining, at: now },
      updated_at: now,
    }).eq("id", post.id);
    summary.push({ id: post.id, action: status, ok: okCount, total: outcomes.length });
  }

  return new Response(JSON.stringify({ ok: true, fired: summary.length, summary }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
