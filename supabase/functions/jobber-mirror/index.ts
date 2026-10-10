// jobber-mirror — hourly read-only copy of Jobber quotes / jobs / invoices / requests into
// jobber_* tables so the Estimate board can live inside Branch Manager (Sept 19 2026).
// Token lives ONLY in tenants.config.jobber (rotating refresh token persisted here).
// Deploy: supabase functions deploy jobber-mirror --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLIENT_ID    = Deno.env.get("JOBBER_CLIENT_ID") ?? "";
const CLIENT_SECRET= Deno.env.get("JOBBER_CLIENT_SECRET") ?? "";
const GQL_VERSION  = Deno.env.get("JOBBER_GRAPHQL_VERSION") ?? "2026-07-27";
const TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
const GRAPHQL_URL = "https://api.getjobber.com/api/graphql";
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function refresh(rt: string) {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return null;
  return { access_token: j.access_token as string, refresh_token: (j.refresh_token ?? rt) as string, expires_at: new Date(Date.now() + (Number(j.expires_in ?? 3600) - 60) * 1000).toISOString() };
}
async function gql(token: string, query: string) {
  const r = await fetch(GRAPHQL_URL, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-JOBBER-GRAPHQL-VERSION": GQL_VERSION }, body: JSON.stringify({ query }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const Q = {
  quotes: `{ quotes(first:100, sort:{key:CREATED_AT, direction:DESCENDING}) { nodes { id quoteNumber title quoteStatus amounts{subtotal total} createdAt updatedAt sentAt client{id name phones{number} emails{address}} property{address{street city province postalCode}} } } }`,
  jobs: `{ jobs(first:50, sort:{key:UPDATED_AT, direction:DESCENDING}) { nodes { id jobNumber title jobStatus total startAt endAt updatedAt client{name} property{address{street city postalCode}} } } }`,
  invoices: `{ invoices(first:50, sort:{key:UPDATED_AT, direction:DESCENDING}) { nodes { id invoiceNumber subject invoiceStatus amounts{total invoiceBalance} issuedDate dueDate updatedAt client{name} } } }`,
  requests: `{ requests(first:25, sort:{key:REQUESTED_AT, direction:DESCENDING}) { nodes { id title requestStatus createdAt client{name} property{address{street city}} } } }`,
};
async function syncTenant(t: { id: string; config: any }) {
  const cfg = t.config?.jobber; if (!cfg?.refresh_token) return { tenant: t.id, skipped: "not-connected" };
  let token = cfg.access_token as string;
  const stale = !cfg.expires_at || Date.parse(cfg.expires_at) - Date.now() < 5 * 60 * 1000;
  async function doRefresh() {
    const ref = await refresh(cfg.refresh_token); if (!ref) return false;
    token = ref.access_token; Object.assign(cfg, ref);
    await sb.from("tenants").update({ config: { ...(t.config ?? {}), jobber: { ...cfg, ...ref } } }).eq("id", t.id);
    return true;
  }
  if (stale && !(await doRefresh())) return { tenant: t.id, error: "token-refresh-failed" };
  const out: Record<string, number | string> = {};
  for (const [k, query] of Object.entries(Q)) {
    let r = await gql(token, query);
    if (r.status === 401) { if (!(await doRefresh())) return { tenant: t.id, error: "token-refresh-failed" }; r = await gql(token, query); }
    if (r.body?.errors) { out[k] = "graphql:" + JSON.stringify(r.body.errors).slice(0, 200); continue; }
    const nodes = r.body?.data?.[k]?.nodes ?? [];
    const now = new Date().toISOString(); let rows: any[] = [];
    if (k === "quotes") rows = nodes.map((q: any) => ({ id: q.id, tenant_id: t.id, quote_number: q.quoteNumber, title: q.title, status: q.quoteStatus, total: q.amounts?.total, subtotal: q.amounts?.subtotal, client_id: q.client?.id, client_name: q.client?.name, client_phone: q.client?.phones?.[0]?.number ?? null, client_email: q.client?.emails?.[0]?.address ?? null, street: q.property?.address?.street, city: q.property?.address?.city, province: q.property?.address?.province, postal_code: q.property?.address?.postalCode, created_at: q.createdAt, sent_at: q.sentAt, updated_at: q.updatedAt, synced_at: now }));
    if (k === "jobs") rows = nodes.map((j: any) => ({ id: j.id, tenant_id: t.id, job_number: j.jobNumber, title: j.title, status: j.jobStatus, total: j.total, client_name: j.client?.name, street: j.property?.address?.street, city: j.property?.address?.city, postal_code: j.property?.address?.postalCode, start_at: j.startAt, end_at: j.endAt, updated_at: j.updatedAt, synced_at: now }));
    if (k === "invoices") rows = nodes.map((i: any) => ({ id: i.id, tenant_id: t.id, invoice_number: i.invoiceNumber, subject: i.subject, status: i.invoiceStatus, total: i.amounts?.total, balance: i.amounts?.invoiceBalance, client_name: i.client?.name, issued_date: i.issuedDate, due_date: i.dueDate, updated_at: i.updatedAt, synced_at: now }));
    if (k === "requests") rows = nodes.map((r2: any) => ({ id: r2.id, tenant_id: t.id, title: r2.title, status: r2.requestStatus, client_name: r2.client?.name, street: r2.property?.address?.street, city: r2.property?.address?.city, created_at: r2.createdAt, synced_at: now }));
    if (rows.length) { const { error } = await sb.from("jobber_" + k).upsert(rows, { onConflict: "id" }); out[k] = error ? "upsert:" + error.message : rows.length; } else out[k] = 0;
  }
  return { tenant: t.id, ...out };
}
Deno.serve(async () => {
  const { data: tenants, error } = await sb.from("tenants").select("id,config");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const results = []; for (const t of tenants ?? []) results.push(await syncTenant(t));
  return new Response(JSON.stringify({ ok: true, results }), { headers: { "Content-Type": "application/json" } });
});
