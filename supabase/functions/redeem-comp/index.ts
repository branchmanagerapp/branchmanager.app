// redeem-comp — friend/VIP free-access codes (2026-05-18)
// POST { code }  with caller's Supabase Bearer session.
// Validates code against the COMP_CODES secret (comma-separated), resolves the
// caller's OWN tenant from their JWT tenant_id claim, and stamps
// tenants.config.subscription = { tier:'pro', status:'active', comped:true }.
// status:'active' is what subscription.js already treats as full-access/no-nag,
// so zero client changes needed. Service-role write; code never trusted client-side.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,apikey","Access-Control-Allow-Methods":"POST,OPTIONS" };
const J = (b:unknown,s=200)=> new Response(JSON.stringify(b),{status:s,headers:{...CORS,"content-type":"application/json"}});
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok",{headers:CORS});
  if (req.method !== "POST") return J({error:"POST only"},405);
  let code = "";
  try { code = String((await req.json())?.code || "").trim().toUpperCase(); } catch {}
  if (!code) return J({error:"code required"},400);

  const valid = (Deno.env.get("COMP_CODES") || "").split(",").map(s=>s.trim().toUpperCase()).filter(Boolean);
  if (!valid.includes(code)) return J({ok:false,error:"invalid code"},403);

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return J({error:"auth required"},401);
  const jwt = auth.slice(7).trim();
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data:{ user }, error: uErr } = await asUser.auth.getUser(jwt);
  if (uErr || !user) return J({error:"not signed in",detail:uErr?.message},401);

  // tenant from JWT claim (the access-token hook stamps tenant_id); fall back to user_tenants
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{ persistSession:false } });
  let tenantId = (user as any)?.app_metadata?.tenant_id || null;
  if (!tenantId) {
    const { data: ut } = await svc.from("user_tenants").select("tenant_id").eq("user_id", user.id).limit(1).maybeSingle();
    tenantId = ut?.tenant_id || null;
  }
  if (!tenantId) return J({error:"no tenant for user"},404);

  const { data: t } = await svc.from("tenants").select("config").eq("id", tenantId).maybeSingle();
  const cfg = (t?.config || {}) as Record<string, unknown>;
  cfg.subscription = { tier:"pro", status:"active", comped:true, comped_via:code, comped_at:new Date().toISOString() };
  const { error } = await svc.from("tenants").update({ config: cfg }).eq("id", tenantId);
  if (error) return J({error:"stamp failed",detail:error.message},500);
  return J({ ok:true, tenant_id:tenantId, plan:"pro (comped)" });
});
