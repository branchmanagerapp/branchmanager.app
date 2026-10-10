// portal-session — validate a portal token and return client data
// POST { token } → validates session → returns { client, invoices, quotes, jobs }
// Deploy: supabase functions deploy portal-session --no-verify-jwt

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors("", 200);
  if (req.method === "GET" || req.method === "HEAD") return cors("portal-session ok", 200);
  if (req.method !== "POST") return cors(JSON.stringify({ error: "Method not allowed" }), 405);

  let token: string;
  try {
    const body = await req.json();
    token = (body.token || "").trim();
  } catch {
    return cors(JSON.stringify({ error: "Invalid JSON" }), 400);
  }

  if (!token) return cors(JSON.stringify({ error: "Token required" }), 400);

  // Validate session
  const { data: session } = await sb
    .from("portal_sessions")
    .select("id, client_id, email, expires_at")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!session) return cors(JSON.stringify({ error: "Invalid or expired session" }), 401);

  // Touch last_used_at
  sb.from("portal_sessions").update({ last_used_at: new Date().toISOString() }).eq("id", session.id).then(() => {});

  const cid = session.client_id;

  // Pin the session's tenant by reading the client row's tenant_id once.
  // Every downstream query is scoped to the same tenant so a UUID collision
  // (extremely unlikely but possible across multi-tenant cohabitation) can't
  // leak data from another tenant via the same session token.
  const { data: tenantPin } = await sb
    .from("clients")
    .select("tenant_id")
    .eq("id", cid)
    .maybeSingle();
  const tid = tenantPin?.tenant_id || null;

  // Fetch all client data in parallel. Schema-correct as of v538:
  //   invoices.invoice_number (not "number"), quotes.quote_number, quotes.expires_at
  //   (not "valid_until"), jobs has no "title" (use description), jobs.completed_at
  //   (not "completed_date"). photos table is generic record_type/record_id linked
  //   not directly client_id — fetch via the client's job ids instead.
  // Build queries; conditionally pin tenant_id when we have it.
  let clientQ = sb.from("clients").select("id,name,email,phone,address,city,state,zip,notes").eq("id", cid);
  let invoiceQ = sb.from("invoices").select("id,invoice_number,total,balance,amount_paid,status,due_date,created_at,description,line_items").eq("client_id", cid);
  let quoteQ = sb.from("quotes").select("id,quote_number,total,status,created_at,description,line_items,expires_at,signed_at").eq("client_id", cid);
  let jobQ = sb.from("jobs").select("id,job_number,status,scheduled_date,completed_at,description,notes,crew").eq("client_id", cid);
  if (tid) {
    clientQ = clientQ.eq("tenant_id", tid);
    invoiceQ = invoiceQ.eq("tenant_id", tid);
    quoteQ = quoteQ.eq("tenant_id", tid);
    jobQ = jobQ.eq("tenant_id", tid);
  }

  const [clientRes, invoicesRes, quotesRes, jobsRes] = await Promise.all([
    clientQ.maybeSingle(),
    invoiceQ.order("created_at", { ascending: false }).limit(50),
    quoteQ.order("created_at", { ascending: false }).limit(30),
    jobQ.order("scheduled_date", { ascending: false }).limit(30),
  ]);

  // Photos are stored generically with record_type+record_id pointing at any
  // jobs/quotes/clients row. Fetch all photos linked to this client's jobs +
  // the client record itself in one query.
  const jobIds = (jobsRes.data || []).map((j: { id: string }) => j.id);
  const photoIds = jobIds.length ? jobIds.concat([cid]) : [cid];
  const photosRes = await sb
    .from("photos")
    .select("id,url,name,label,record_type,record_id,taken_at,created_at")
    .in("record_id", photoIds)
    .in("record_type", ["job", "client", "quote"])
    .order("created_at", { ascending: false })
    .limit(80);

  // Re-shape to the field names the portal.html dashboard already expects
  // (number, valid_until, title, completed_date, caption, job_id, before_after)
  // so we don't have to ship a synchronized portal.html change too.
  const invoices = (invoicesRes.data || []).map((r: Record<string, unknown>) => ({
    ...r,
    number: r.invoice_number,
  }));
  const quotes = (quotesRes.data || []).map((r: Record<string, unknown>) => ({
    ...r,
    number: r.quote_number,
    valid_until: r.expires_at,
  }));
  const jobs = (jobsRes.data || []).map((r: Record<string, unknown>) => ({
    ...r,
    title: r.description || ("Job #" + r.job_number),
    completed_date: r.completed_at,
  }));
  const photos = (photosRes.data || []).map((r: Record<string, unknown>) => ({
    ...r,
    caption: r.label || r.name || "",
    job_id: r.record_type === "job" ? r.record_id : null,
    before_after: typeof r.label === "string" ? (/before/i.test(r.label) ? "before" : (/after/i.test(r.label) ? "after" : null)) : null,
  }));

  return cors(JSON.stringify({
    ok: true,
    client: clientRes.data,
    invoices,
    quotes,
    jobs,
    photos,
  }));
});
