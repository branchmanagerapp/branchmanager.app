// work-days — drafts for the approve page (key-gated) + public feed of approved work days.
//
//   GET  /work-days                      → public feed: approved rows, safe fields only (no names, no
//                                          addresses, coords rounded to ~150 m), 5-min cache, CORS *.
//   GET  /work-days?key=K&status=draft   → owner view: full rows + 1-hour signed URLs for the private
//                                          work-drafts bucket (status = draft | approved | skipped).
//   POST /work-days {key, id, action}    → action = approve | skip | unskip, optional cover (path).
//                                          approve: copy files work-drafts → job-photos/work/<id>/,
//                                          insert `photos` rows, set status=approved, approved_at=now().
//
// Secrets: WORK_KEY (owner key), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injected).
// Deploy: supabase functions deploy work-days --no-verify-jwt --project-ref ltpivkqahvplapyagljt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WORK_KEY = Deno.env.get("WORK_KEY") ?? "";
const TENANT = "93af4348-8bba-4045-ac3e-5e71ec1cc8c5";
const PUBLIC_BASE = SUPABASE_URL + "/storage/v1/object/public/job-photos/";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(status: number, obj: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });
}
const round = (n: number) => Math.round(n * 700) / 700; // ~150 m grid

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);

  if (req.method === "GET") {
    const key = url.searchParams.get("key") ?? "";
    if (key && WORK_KEY && key === WORK_KEY) {
      const status = url.searchParams.get("status") ?? "draft";
      const { data, error } = await sb.from("work_days").select("*").eq("tenant_id", TENANT).eq("status", status).order("work_date", { ascending: false }).limit(200);
      if (error) return json(500, { ok: false, error: error.message });
      const out = [];
      for (const w of data ?? []) {
        const photos = [];
        for (const p of (w.photos ?? [])) {
          const { data: s } = await sb.storage.from("work-drafts").createSignedUrl(p.path, 3600);
          photos.push({ ...p, url: s?.signedUrl ?? null, public_url: w.status === "approved" ? PUBLIC_BASE + "work/" + w.id + "/" + p.path.split("/").pop() : null });
        }
        out.push({ ...w, photos });
      }
      return json(200, { ok: true, rows: out }, { "Cache-Control": "no-store" });
    }
    // public feed
    const { data, error } = await sb.from("work_days").select("id,town,work_date,lat,lng,service,title,blurb,photos,cover_path,approved_at").eq("tenant_id", TENANT).eq("status", "approved").order("work_date", { ascending: false }).limit(300);
    if (error) return json(500, { ok: false, error: error.message });
    const rows = (data ?? []).map((w: any) => ({
      id: w.id, town: w.town, date: w.work_date, service: w.service, title: w.title, blurb: w.blurb,
      lat: round(w.lat), lng: round(w.lng),
      cover: PUBLIC_BASE + "work/" + w.id + "/" + String(w.cover_path).split("/").pop(),
      media: (w.photos ?? []).map((p: any) => ({ kind: p.kind, url: PUBLIC_BASE + "work/" + w.id + "/" + String(p.path).split("/").pop() })),
    }));
    return json(200, { ok: true, generated: new Date().toISOString(), rows }, { "Cache-Control": "public, max-age=300" });
  }

  if (req.method === "POST") {
    let body: any = {};
    try { body = await req.json(); } catch { return json(400, { ok: false, error: "bad json" }); }
    if (!WORK_KEY || body.key !== WORK_KEY) return json(401, { ok: false, error: "no" });
    const id = String(body.id ?? ""); const action = String(body.action ?? "");
    const { data: w, error } = await sb.from("work_days").select("*").eq("id", id).eq("tenant_id", TENANT).single();
    if (error || !w) return json(404, { ok: false, error: "not found" });
    if (action === "skip") { await sb.from("work_days").update({ status: "skipped" }).eq("id", id); return json(200, { ok: true, status: "skipped" }); }
    if (action === "unskip") { await sb.from("work_days").update({ status: "draft" }).eq("id", id); return json(200, { ok: true, status: "draft" }); }
    if (action === "cover") { await sb.from("work_days").update({ cover_path: body.cover }).eq("id", id); return json(200, { ok: true }); }
    if (action === "approve") {
      const keep: string[] = Array.isArray(body.keep) ? body.keep : (w.photos ?? []).map((p: any) => p.path);
      const kept = (w.photos ?? []).filter((p: any) => keep.includes(p.path));
      if (!kept.length) return json(400, { ok: false, error: "nothing kept" });
      for (const p of kept) {
        const { data: file, error: dErr } = await sb.storage.from("work-drafts").download(p.path);
        if (dErr || !file) return json(500, { ok: false, error: "download " + p.path + ": " + (dErr?.message ?? "") });
        const dest = "work/" + w.id + "/" + p.path.split("/").pop();
        const { error: uErr } = await sb.storage.from("job-photos").upload(dest, file, { upsert: true, contentType: p.kind === "video" ? "video/mp4" : "image/jpeg" });
        if (uErr) return json(500, { ok: false, error: "upload " + dest + ": " + uErr.message });
        await sb.from("photos").insert({ tenant_id: TENANT, record_type: "work_day", record_id: w.id, url: PUBLIC_BASE + dest, storage_path: dest, name: dest.split("/").pop(), label: w.title, taken_at: p.taken_at, gps_lat: p.lat, gps_lng: p.lng, taken_by: "Doug Brown", tags: ["work-day", w.town].filter(Boolean) });
      }
      const cover = body.cover && keep.includes(body.cover) ? body.cover : (kept.find((p: any) => p.kind === "photo")?.path ?? kept[0].path);
      await sb.from("work_days").update({ status: "approved", approved_at: new Date().toISOString(), photos: kept, photo_count: kept.length, cover_path: cover, service: body.service ?? w.service, blurb: body.blurb ?? w.blurb }).eq("id", id);
      return json(200, { ok: true, status: "approved", kept: kept.length });
    }
    return json(400, { ok: false, error: "unknown action" });
  }
  return json(405, { ok: false, error: "method" });
});
