// portal-update — let a customer update their own profile from portal.html.
// POST { token, patch: { email?, phone?, address?, city?, state?, zip?, notes? } }
// Validates the session token against portal_sessions, then updates the
// matching clients row scoped to the session's tenant. Returns the updated
// client row.
//
// Deploy: supabase functions deploy portal-update --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function cors(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
    },
  });
}

// Whitelist the fields a customer is allowed to self-update. Everything else
// (status, tenant_id, internal flags, billing) stays Doug-only.
const ALLOWED_FIELDS = ["email", "phone", "address", "city", "state", "zip", "notes"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors("", 200);
  if (req.method === "GET" || req.method === "HEAD") return cors("portal-update ok", 200);
  if (req.method !== "POST") return cors(JSON.stringify({ error: "Method not allowed" }), 405);

  let token: string;
  let patch: Record<string, unknown>;
  try {
    const body = await req.json();
    token = (body.token || "").trim();
    patch = body.patch || {};
  } catch {
    return cors(JSON.stringify({ error: "Invalid JSON" }), 400);
  }

  if (!token) return cors(JSON.stringify({ error: "Token required" }), 400);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return cors(JSON.stringify({ error: "patch must be an object" }), 400);
  }

  // Validate session
  const { data: session } = await sb
    .from("portal_sessions")
    .select("id, client_id, expires_at")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!session) return cors(JSON.stringify({ error: "Invalid or expired session" }), 401);

  // Touch session
  sb.from("portal_sessions").update({ last_used_at: new Date().toISOString() }).eq("id", session.id).then(() => {});

  // Filter patch to whitelisted fields + sanity-check string values
  const filtered: Record<string, string | null> = {};
  for (const k of ALLOWED_FIELDS) {
    if (k in patch) {
      const v = patch[k];
      if (v === null || v === "") {
        filtered[k] = null;
      } else if (typeof v === "string" && v.length <= 500) {
        filtered[k] = v.trim();
      } else {
        return cors(JSON.stringify({ error: `Invalid value for ${k}` }), 400);
      }
    }
  }

  // Sanity-check email format if present
  if (filtered.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(filtered.email)) {
    return cors(JSON.stringify({ error: "Invalid email format" }), 400);
  }

  if (Object.keys(filtered).length === 0) {
    return cors(JSON.stringify({ error: "No allowed fields in patch" }), 400);
  }

  // Pin tenant via the existing client row so a session can't drift to a
  // different tenant via UUID collision.
  const { data: existing } = await sb
    .from("clients")
    .select("tenant_id")
    .eq("id", session.client_id)
    .maybeSingle();
  if (!existing) return cors(JSON.stringify({ error: "Client not found" }), 404);

  const { data: updated, error: updErr } = await sb
    .from("clients")
    .update(filtered)
    .eq("id", session.client_id)
    .eq("tenant_id", existing.tenant_id)
    .select("id, name, email, phone, address, city, state, zip, notes")
    .maybeSingle();

  if (updErr) {
    console.error("portal-update failed:", updErr.message);
    return cors(JSON.stringify({ error: updErr.message }), 500);
  }

  return cors(JSON.stringify({ ok: true, client: updated }));
});
