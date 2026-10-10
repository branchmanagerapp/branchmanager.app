// jobber-sync — pulls revenue from Jobber via GraphQL and writes weekly totals
// into jobber_weekly_revenue, which weekly-pnl-report reads. Mirrors
// bouncie-rest-sync: loops tenants that have config.jobber.access_token,
// auto-refreshes the token when expiring/401, writes results back.
//
// Bootstrap the token once per tenant via jobber-oauth-callback. Then schedule
// this (e.g. every 6h) so the weekly P&L revenue stays current.
//
// NOTE on the GraphQL query: field names follow Jobber's documented schema
// (invoices connection → nodes { issuedDate, amounts { total } }). If Jobber's
// live schema differs for this account, the first real run will surface it in
// the returned `error`/`raw` — adjust REVENUE_QUERY then. OAuth + refresh +
// weekly upsert below are schema-independent.
//
// Deploy with verify_jwt = false (cron-invoked via net.http_post).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLIENT_ID     = Deno.env.get("JOBBER_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("JOBBER_CLIENT_SECRET") ?? "";
const TOKEN_URL     = Deno.env.get("JOBBER_TOKEN_URL") ?? "https://api.getjobber.com/api/oauth/token";
const GRAPHQL_URL   = Deno.env.get("JOBBER_GRAPHQL_URL") ?? "https://api.getjobber.com/api/graphql";
const GQL_VERSION   = Deno.env.get("JOBBER_GRAPHQL_VERSION") ?? "2023-11-15";
const WEEKS_BACK    = Number(Deno.env.get("JOBBER_WEEKS_BACK") ?? "8"); // how many recent weeks to (re)sync

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...CORS, "content-type": "application/json" } }); }

// Monday 00:00 of the ISO week containing `d`, as YYYY-MM-DD
function weekStartOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // 0=Mon
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}

async function refreshToken(refresh: string): Promise<{ access_token: string; refresh_token: string; expires_at: string } | null> {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return null;
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? refresh,
    expires_at: new Date(Date.now() + ((j.expires_in ?? 3600) * 1000)).toISOString(),
  };
}

const REVENUE_QUERY = `query BMRevenue($after: String) {
  invoices(first: 100, after: $after) {
    nodes { id issuedDate createdAt amounts { total } }
    pageInfo { hasNextPage endCursor }
  }
}`;

async function gql(token: string, after: string | null) {
  const r = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "X-JOBBER-GRAPHQL-VERSION": GQL_VERSION },
    body: JSON.stringify({ query: REVENUE_QUERY, variables: { after } }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

async function syncTenant(t: any) {
  const tid = t.id;
  const cfg = t.config?.jobber;
  if (!cfg?.access_token) return { tenant: tid, skipped: "not-connected" };
  if (!CLIENT_ID || !CLIENT_SECRET) return { tenant: tid, skipped: "no-jobber-client-secrets" };

  let token = cfg.access_token as string;
  // pre-refresh if expiring within 5 min
  if (cfg.expires_at && Date.parse(cfg.expires_at) - Date.now() < 5 * 60 * 1000 && cfg.refresh_token) {
    const ref = await refreshToken(cfg.refresh_token);
    if (ref) {
      token = ref.access_token;
      const next = { ...(t.config ?? {}) };
      next.jobber = { ...cfg, ...ref };
      await sb.from("tenants").update({ config: next }).eq("id", tid);
    }
  }

  // page through invoices; one 401-retry after refresh
  const byWeek: Record<string, { amount: number; count: number }> = {};
  let after: string | null = null, pages = 0, refreshedOnce = false;
  const cutoff = Date.now() - WEEKS_BACK * 7 * 86400 * 1000;
  while (pages < 50) {
    let { status, body } = await gql(token, after);
    if (status === 401 && cfg.refresh_token && !refreshedOnce) {
      refreshedOnce = true;
      const ref = await refreshToken(cfg.refresh_token);
      if (!ref) return { tenant: tid, error: "token-refresh-failed" };
      token = ref.access_token;
      const next = { ...(t.config ?? {}) }; next.jobber = { ...cfg, ...ref };
      await sb.from("tenants").update({ config: next }).eq("id", tid);
      ({ status, body } = await gql(token, after));
    }
    if (body.errors) return { tenant: tid, error: "graphql", detail: JSON.stringify(body.errors).slice(0, 400) };
    const conn = body?.data?.invoices;
    if (!conn) return { tenant: tid, error: "unexpected-shape", raw: JSON.stringify(body).slice(0, 400) };
    for (const n of (conn.nodes || [])) {
      const dateStr = n.issuedDate || n.createdAt;
      if (!dateStr) continue;
      const ts = Date.parse(dateStr);
      if (isNaN(ts) || ts < cutoff) continue;
      const amt = Number(n.amounts?.total ?? n.total ?? 0) || 0;
      const wk = weekStartOf(new Date(ts));
      (byWeek[wk] ||= { amount: 0, count: 0 });
      byWeek[wk].amount += amt; byWeek[wk].count += 1;
    }
    pages++;
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }

  // upsert each week
  const rows = Object.entries(byWeek).map(([week_start, v]) => ({
    tenant_id: tid, week_start, amount: v.amount, invoice_count: v.count, source: "jobber", synced_at: new Date().toISOString(),
  }));
  if (rows.length) {
    const { error } = await sb.from("jobber_weekly_revenue").upsert(rows, { onConflict: "tenant_id,week_start" });
    if (error) return { tenant: tid, error: "upsert", detail: error.message };
  }
  return { tenant: tid, synced: true, weeks: rows.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const onlyTenant = url.searchParams.get("tenant");
  let q = sb.from("tenants").select("id,name,config");
  if (onlyTenant) q = q.eq("id", onlyTenant);
  const { data: tenants, error } = await q;
  if (error) return json({ error: error.message }, 500);
  const results = [];
  for (const t of (tenants || [])) {
    try { results.push(await syncTenant(t)); }
    catch (e) { results.push({ tenant: t.id, error: (e as Error).message }); }
  }
  return json({ ok: true, results });
});
