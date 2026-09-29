// jobber-push — send ONE reviewed Branch Manager request (website lead) into Jobber (v1253, Sept 29 2026).
//
//   POST { request_id, dry_run? }   Authorization: Bearer <signed-in user's JWT>
//
// Only a signed-in owner/admin of the request's tenant can call it — it never runs on its own.
// 1. Finds the Jobber client by PHONE or EMAIL (never by name alone) so no duplicate clients.
// 2. If none, creates the client (Jobber marks it a lead) with the phone, email and property.
// 3. Creates the Jobber Request "Website: <service>" + a note with the customer's description.
// 4. Writes the Jobber ids/link back onto the BM request (review_status = sent_to_jobber), so a
//    request can never be sent twice.
// dry_run = true → only reports what it WOULD do (match found or not); creates nothing.
//
// Token: same rotating OAuth token as jobber-mirror, stored ONLY in tenants.config.jobber.
// Before any refresh we re-read the row so two functions never rotate the same refresh token.
//
// Deploy: npx supabase functions deploy jobber-push --project-ref ltpivkqahvplapyagljt   (JWT verified)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLIENT_ID    = Deno.env.get("JOBBER_CLIENT_ID") ?? "";
const CLIENT_SECRET= Deno.env.get("JOBBER_CLIENT_SECRET") ?? "";
const GQL_VERSION  = Deno.env.get("JOBBER_GRAPHQL_VERSION") ?? "2026-07-27";
const GRAPHQL_URL  = "https://api.getjobber.com/api/graphql";
const TOKEN_URL    = "https://api.getjobber.com/api/oauth/token";
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, obj: unknown) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

async function getToken(tenantId: string, force = false): Promise<string | null> {
  const { data } = await sb.from("tenants").select("config").eq("id", tenantId).maybeSingle();
  const cfg = data?.config?.jobber; if (!cfg?.refresh_token) return null;
  const fresh = cfg.access_token && cfg.expires_at && Date.parse(cfg.expires_at) > Date.now() + 60_000;
  if (fresh && !force) return cfg.access_token;
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: cfg.refresh_token, client_id: CLIENT_ID, client_secret: CLIENT_SECRET });
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return null;
  const ref = { access_token: j.access_token, refresh_token: j.refresh_token ?? cfg.refresh_token, expires_at: new Date(Date.now() + (Number(j.expires_in ?? 3600) - 60) * 1000).toISOString() };
  const { data: again } = await sb.from("tenants").select("config").eq("id", tenantId).maybeSingle();
  await sb.from("tenants").update({ config: { ...(again?.config ?? {}), jobber: { ...(again?.config?.jobber ?? cfg), ...ref } } }).eq("id", tenantId);
  return ref.access_token;
}

async function gql(tenantId: string, query: string, variables: Record<string, unknown> = {}) {
  let token = await getToken(tenantId); if (!token) throw new Error("Jobber is not connected (no token)");
  const call = (t: string) => fetch(GRAPHQL_URL, { method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", "X-JOBBER-GRAPHQL-VERSION": GQL_VERSION }, body: JSON.stringify({ query, variables }) });
  let r = await call(token);
  if (r.status === 401) { token = await getToken(tenantId, true); if (!token) throw new Error("Jobber token refresh failed"); r = await call(token); }
  const b = await r.json().catch(() => ({}));
  if (b.errors) throw new Error("Jobber: " + JSON.stringify(b.errors).slice(0, 300));
  return b.data;
}

// "123 Main St, Peekskill, NY 10566" → Jobber address; falls back to the whole string as street.
function parseAddress(s: string) {
  const parts = String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
  const a: Record<string, string> = { street1: parts[0] || String(s || "").trim(), country: "US" };
  if (parts[1]) a.city = parts[1];
  const tail = parts.slice(2).join(" ");
  const st = /\b([A-Z]{2})\b/.exec(tail); if (st) a.province = st[1];
  const zip = /\b(\d{5})(?:-\d{4})?\b/.exec(tail || s); if (zip) a.postalCode = zip[1];
  if (!a.province) a.province = "NY";
  return a;
}

async function findClient(tenantId: string, phone: string, email: string) {
  const Q = `query($t:String!){ clients(searchTerm:$t, first:10){ nodes{ id name phones{number} emails{address} properties{ id address{street1 city} } jobberWebUri } } }`;
  const terms: string[] = [];
  const d = digits(phone);
  if (d.length === 10) terms.push(`${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`, d);
  if (email) terms.push(email);
  for (const t of terms) {
    const data = await gql(tenantId, Q, { t });
    for (const c of data?.clients?.nodes ?? []) {
      const phoneHit = d.length === 10 && (c.phones ?? []).some((p: any) => digits(p.number) === d);
      const emailHit = !!email && (c.emails ?? []).some((e: any) => String(e.address).toLowerCase() === email.toLowerCase());
      if (phoneHit || emailHit) return c;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u?.user) return json(401, { ok: false, error: "Sign in first" });
    const body = await req.json().catch(() => ({}));
    const id = body.request_id; const dry = !!body.dry_run;
    if (!id) return json(400, { ok: false, error: "request_id required" });

    const { data: r } = await sb.from("requests").select("*").eq("id", id).maybeSingle();
    if (!r) return json(404, { ok: false, error: "Request not found" });
    const { data: mem } = await sb.from("user_tenants").select("role,is_active").eq("user_id", u.user.id).eq("tenant_id", r.tenant_id).maybeSingle();
    if (!mem || mem.is_active === false || !["owner", "admin"].includes(String(mem.role || "").toLowerCase())) return json(403, { ok: false, error: "Only the owner/admin can send leads to Jobber" });
    if (r.jobber_request_id) return json(200, { ok: true, already: true, jobber_url: r.jobber_url });

    const name = String(r.client_name || "").trim();
    const phone = String(r.phone || r.client_phone || "").trim();
    const email = String(r.email || "").trim();
    const address = String(r.property || "").trim();
    const service = String(r.title || "Tree service").trim();
    const existing = await findClient(r.tenant_id, phone, email);
    if (dry) return json(200, { ok: true, dry_run: true, would: existing ? "use existing Jobber client" : "create new Jobber client", match: existing ? { name: existing.name, url: existing.jobberWebUri } : null, request_title: "Website: " + service });

    let clientId: string, propertyId: string | null = null, clientUrl = "";
    if (existing) {
      clientId = existing.id; clientUrl = existing.jobberWebUri;
      propertyId = existing.properties?.[0]?.id ?? null;
    } else {
      const [first, ...rest] = name.split(/\s+/);
      const d = digits(phone);
      const input: Record<string, unknown> = {
        firstName: first || name || "Website", lastName: rest.join(" ") || "(website lead)",
        phones: d.length === 10 ? [{ number: `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`, description: "MAIN", primary: true, smsAllowed: true }] : [],
        emails: email ? [{ address: email, description: "MAIN", primary: true }] : [],
        properties: address ? [{ address: parseAddress(address) }] : [],
      };
      const M = `mutation($i:ClientCreateInput!){ clientCreate(input:$i){ client{ id jobberWebUri properties{ id } } userErrors{ message path } } }`;
      let out = await gql(r.tenant_id, M, { i: input });
      let errs = out?.clientCreate?.userErrors ?? [];
      // Jobber rejects smsAllowed on landlines — retry once without SMS.
      if (errs.length && /sms/i.test(JSON.stringify(errs)) && (input.phones as any[]).length) { (input.phones as any[])[0].smsAllowed = false; out = await gql(r.tenant_id, M, { i: input }); errs = out?.clientCreate?.userErrors ?? []; }
      if (errs.length || !out?.clientCreate?.client?.id) return json(422, { ok: false, step: "clientCreate", errors: errs });
      clientId = out.clientCreate.client.id; clientUrl = out.clientCreate.client.jobberWebUri;
      propertyId = out.clientCreate.client.properties?.[0]?.id ?? null;
    }

    const RQ = `mutation($i:RequestCreateInput!){ requestCreate(input:$i){ request{ id jobberWebUri } userErrors{ message path } } }`;
    const rin: Record<string, unknown> = { clientId, title: ("Website: " + service).slice(0, 120) };
    if (propertyId) rin.propertyId = propertyId;
    const ro = await gql(r.tenant_id, RQ, { i: rin });
    const rerr = ro?.requestCreate?.userErrors ?? [];
    if (rerr.length || !ro?.requestCreate?.request?.id) return json(422, { ok: false, step: "requestCreate", errors: rerr, client_url: clientUrl });
    const jr = ro.requestCreate.request;

    const when = r.created_at ? new Date(r.created_at).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) : "";
    const msg = [`Website request (${when}) — sent from Branch Manager after review.`, `Service: ${service}`, address ? `Address: ${address}` : "", phone ? `Phone: ${phone}` : "", email ? `Email: ${email}` : "", r.description ? `\n${String(r.description).slice(0, 3000)}` : ""].filter(Boolean).join("\n");
    try { await gql(r.tenant_id, `mutation($id:EncodedId!,$i:RequestCreateNoteInput!){ requestCreateNote(requestId:$id, input:$i){ userErrors{ message } } }`, { id: jr.id, i: { message: msg } }); } catch (_e) { /* note is nice-to-have */ }

    await sb.from("requests").update({ review_status: "sent_to_jobber", jobber_client_id: clientId, jobber_request_id: jr.id, jobber_url: jr.jobberWebUri, jobber_pushed_at: new Date().toISOString() }).eq("id", id);
    return json(200, { ok: true, jobber_url: jr.jobberWebUri, client_url: clientUrl, reused_client: !!existing });
  } catch (e) {
    return json(500, { ok: false, error: String((e as Error)?.message ?? e).slice(0, 400) });
  }
});
