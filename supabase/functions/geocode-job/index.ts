// geocode-job — resolve a job's property address to lat/lng ONCE and cache
// it on jobs.map_data. Called by the crew app at clock-in so GPS can
// auto-pick which job the session belongs to (v1085), and so the
// arrive-at-job geofence has coordinates to work with.
//
// POST { jobId }
// → { ok, lat, lon, cached } | { ok:false, error }
//
// Idempotent: returns stored coords without re-geocoding when present.
// Server-side Nominatim keeps the phone inside the app CSP (connect-src
// allows only supabase) and respects the usage policy with a proper UA.
//
// Deploy: supabase functions deploy geocode-job --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function pg(path: string, init?: RequestInit) {
  return await fetch(SUPABASE_URL + path, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });

  try {
    const { jobId } = await req.json();
    if (!jobId) return json(400, { ok: false, error: "Missing jobId" });

    const r = await pg(`/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}&select=id,property,map_data&limit=1`);
    if (!r.ok) return json(502, { ok: false, error: "job lookup failed " + r.status });
    const rows = await r.json();
    const job = rows && rows[0];
    if (!job) return json(404, { ok: false, error: "Job not found" });

    const md = job.map_data || {};
    if (typeof md.lat === "number" && typeof md.lon === "number") {
      return json(200, { ok: true, lat: md.lat, lon: md.lon, cached: true });
    }

    const prop = (job.property || "").trim();
    if (!prop) return json(200, { ok: false, error: "Job has no property address" });

    const nomUrl = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(prop);
    const nr = await fetch(nomUrl, {
      headers: { "User-Agent": "BranchManager/1.0 (info@branchmanager.app)" },
    });
    if (!nr.ok) return json(502, { ok: false, error: "geocoder " + nr.status });
    const results = await nr.json();
    const hit = Array.isArray(results) && results[0];
    if (!hit) return json(200, { ok: false, error: "Address not found: " + prop.slice(0, 80) });

    const lat = parseFloat(hit.lat);
    const lon = parseFloat(hit.lon);
    const newMd = { ...md, lat, lon, geocoded_from: prop, geocoded_at: new Date().toISOString() };
    const w = await pg(`/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}`, {
      method: "PATCH",
      body: JSON.stringify({ map_data: newMd }),
    });
    if (!w.ok) console.warn("geocode-job: cache write failed", w.status);

    return json(200, { ok: true, lat, lon, cached: false });
  } catch (err) {
    return json(500, { ok: false, error: String((err as Error)?.message || err) });
  }
});
