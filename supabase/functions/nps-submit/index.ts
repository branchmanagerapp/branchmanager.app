// nps-submit — public endpoint for the customer-facing sat.html page.
// Accepts {jobId, token, score (0-10), verbatim} and writes the NPS
// response onto the job row's satisfaction JSON.
//
// SECURITY:
// - verify_jwt = false so customers without auth can submit.
// - jobId + token MUST match: token = first 12 chars of SHA-256(jobId + NPS_TOKEN_SALT).
//   This prevents random people from spamming arbitrary jobIds.
// - score must be integer 0-10. Verbatim capped at 2000 chars.
// - Per-job dedup: if jobs.satisfaction.nps_score is already set with same
//   submitted_at within 10 min, returns 200 {skipped:'duplicate'} (allows
//   genuine re-submit a few hours later).
//
// Deploy: supabase functions deploy nps-submit --no-verify-jwt
// Set NPS_TOKEN_SALT secret to a random 32-char string.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NPS_TOKEN_SALT   = Deno.env.get("NPS_TOKEN_SALT") || "default-bm-salt-2026";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2),
    { status, headers: { ...CORS, "content-type": "application/json" } });
}

async function expectedToken(jobId: string): Promise<string> {
  const text = jobId + ":" + NPS_TOKEN_SALT;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 12);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const jobId  = (body.jobId  || "").trim();
  const token  = (body.token  || "").trim();
  const score  = Number(body.score);
  const verbatim = String(body.verbatim || "").slice(0, 2000);

  if (!jobId) return json({ error: "jobId required" }, 400);
  if (!Number.isInteger(score) || score < 0 || score > 10) {
    return json({ error: "score must be integer 0-10" }, 400);
  }

  // Token validation
  const expected = await expectedToken(jobId);
  if (token !== expected) {
    return json({ error: "Invalid token" }, 403);
  }

  // Load the job
  const { data: job, error: jobErr } = await sb
    .from("jobs")
    .select("id, satisfaction, client_name, tenant_id")
    .eq("id", jobId)
    .single();
  if (jobErr || !job) return json({ error: "Job not found" }, 404);

  // Dedup: if same score submitted within last 10 min, return ok-skipped
  const existing = job.satisfaction || {};
  if (existing.nps_submitted_at) {
    const lastTs = new Date(existing.nps_submitted_at).getTime();
    if (!isNaN(lastTs) && (Date.now() - lastTs) < 10 * 60 * 1000) {
      return json({ ok: true, skipped: "recent-duplicate" });
    }
  }

  // Categorize for convenience
  const category = score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor";

  const newSatisfaction = {
    ...existing,
    nps_score: score,
    nps_verbatim: verbatim,
    nps_category: category,
    nps_submitted_at: new Date().toISOString(),
    nps_source: "sat.html"
  };

  const { error: updateErr } = await sb
    .from("jobs")
    .update({ satisfaction: newSatisfaction })
    .eq("id", jobId);
  if (updateErr) return json({ error: updateErr.message }, 500);

  // Log to communications for audit (one row per submission)
  await sb.from("communications").insert({
    tenant_id: job.tenant_id,
    type: "note",
    direction: "inbound",
    subject: "NPS response",
    body: `NPS ${score}/10 (${category})${verbatim ? " — " + verbatim.slice(0, 200) : ""}`,
    source: "nps-submit",
    metadata: { kind: "nps_response", job_id: jobId, score, category, verbatim }
  });

  return json({ ok: true, score, category });
});
