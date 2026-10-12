// Read-only Jobber schedule for the AI receptionist (Doug, Oct 12 2026: "the schedule lives in Jobber").
// Token handling is the same as jobber-push: tenants.config.jobber, refreshed only when expired,
// rotated refresh token written straight back (Jobber rotates it on every refresh).
// Callers only ever hear day-level busyness, never other customers' names or addresses.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID     = Deno.env.get("JOBBER_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("JOBBER_CLIENT_SECRET") ?? "";
const GQL_VERSION   = Deno.env.get("JOBBER_GRAPHQL_VERSION") ?? "2026-07-27";

async function getToken(sb: any, tenantId: string, force = false): Promise<string | null> {
  const { data } = await sb.from("tenants").select("config").eq("id", tenantId).maybeSingle();
  const cfg = data?.config?.jobber; if (!cfg?.refresh_token) return null;
  const fresh = cfg.access_token && cfg.expires_at && Date.parse(cfg.expires_at) > Date.now() + 60_000;
  if (fresh && !force) return cfg.access_token;
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: cfg.refresh_token, client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
  const r = await fetch("https://api.getjobber.com/api/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return null;
  const ref = { access_token: j.access_token, refresh_token: j.refresh_token ?? cfg.refresh_token, expires_at: new Date(Date.now() + (Number(j.expires_in ?? 3600) - 60) * 1000).toISOString() };
  const { data: again } = await sb.from("tenants").select("config").eq("id", tenantId).maybeSingle();
  await sb.from("tenants").update({ config: { ...(again?.config ?? {}), jobber: { ...(again?.config?.jobber ?? cfg), ...ref } } }).eq("id", tenantId);
  return ref.access_token;
}

async function gql(sb: any, tenantId: string, query: string) {
  let token = await getToken(sb, tenantId); if (!token) throw new Error("Jobber not connected");
  const call = (t: string) => fetch("https://api.getjobber.com/api/graphql", { method: "POST", signal: AbortSignal.timeout(4000),
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", "X-JOBBER-GRAPHQL-VERSION": GQL_VERSION }, body: JSON.stringify({ query }) });
  let r = await call(token);
  if (r.status === 401) { token = await getToken(sb, tenantId, true); if (!token) throw new Error("Jobber refresh failed"); r = await call(token); }
  const b = await r.json().catch(() => ({}));
  if (b.errors) throw new Error("Jobber: " + JSON.stringify(b.errors).slice(0, 300));
  return b.data;
}

const NY = "America/New_York";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: NY });        // 2026-10-14
const dayName = (key: string) => new Date(key + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

let cache = { at: 0, text: "", raw: null as any };

// Returns a short plain-English summary for the next 14 days, or "" if Jobber can't be read.
export async function scheduleSummary(tenantId: string): Promise<{ text: string; raw: any }> {
  if (cache.text && Date.now() - cache.at < 20 * 60 * 1000) return cache;
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const now = Date.now(), end = now + 14 * 86400_000;
  const todayKey = dayKey(new Date(now).toISOString());   // all-day items sit at midnight; count all of today
  const jobs: Record<string, number> = {}, ests: Record<string, string[]> = {};
  let visitsOk = false, estOk = false, latestVisit = "", latestEst = "";
  try {
    const d = await gql(sb, tenantId, `{ visits(first: 60, sort: {key: START_AT, direction: DESCENDING}) { nodes { startAt endAt visitStatus } } }`);
    latestVisit = (d?.visits?.nodes || []).map((v: any) => v.startAt).filter(Boolean).sort().slice(-3).join(", ");
    for (const v of d?.visits?.nodes || []) {
      if (!v.startAt) continue;
      const t = Date.parse(v.startAt);
      if (dayKey(new Date(t).toISOString()) >= todayKey && t <= end) { const k = dayKey(v.startAt); jobs[k] = (jobs[k] || 0) + 1; }
    }
    visitsOk = true;
  } catch (e) { console.error("schedule visits failed", e); }
  try {
    const d = await gql(sb, tenantId, `{ requests(first: 40, sort: {key: REQUESTED_AT, direction: DESCENDING}) { nodes { assessment { startAt } } } }`);
    latestEst = (d?.requests?.nodes || []).map((q: any) => q?.assessment?.startAt).filter(Boolean).sort().slice(-3).join(", ");
    for (const q of d?.requests?.nodes || []) {
      const s = q?.assessment?.startAt; if (!s) continue;
      const t = Date.parse(s);
      if (dayKey(new Date(t).toISOString()) >= todayKey && t <= end) {
        const k = dayKey(s);
        const tm = new Date(s).toLocaleTimeString("en-US", { timeZone: NY, hour: "numeric", minute: "2-digit" });
        (ests[k] ||= []).push(tm === "12:00 AM" ? "a time to be set" : tm);   // midnight = all-day item in Jobber
      }
    }
    estOk = true;
  } catch (e) { console.error("schedule assessments failed", e); }
  if (!visitsOk && !estOk) return { text: "", raw: null };

  const lines: string[] = [];
  for (let i = 0; i < 14; i++) {
    const k = dayKey(new Date(now + i * 86400_000).toISOString());
    const j = jobs[k] || 0, e = ests[k] || [];
    const parts = [];
    if (j) parts.push(`${j} job visit${j > 1 ? "s" : ""} booked`);
    if (e.length) parts.push(`estimate appointment${e.length > 1 ? "s" : ""} at ${e.join(", ")}`);
    lines.push(`${dayName(k)}: ${parts.length ? parts.join("; ") : "nothing booked yet"}`);
  }
  const text = `SCHEDULE FROM JOBBER (next 14 days, read live${visitsOk && estOk ? "" : "; partial"}):\n` + lines.join("\n");
  cache = { at: Date.now(), text, raw: { jobs, ests, latestVisit, latestEst } };
  return cache;
}
