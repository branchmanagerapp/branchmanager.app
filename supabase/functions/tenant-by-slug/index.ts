/**
 * tenant-by-slug — resolves a marketing-site / portal slug to a public
 * tenant id + display name + logo URL.
 *
 * Used by:
 *   - portal.html / pay.html / approve.html / paid.html / book.html
 *     when loaded under clients.branchmanager.app/{slug}/...
 *     (the CF Worker forwards the slug as ?tenant_slug=<slug>)
 *   - The page reads ?tenant_slug, calls this fn, then knows which
 *     tenant the customer is interacting with.
 *
 * Public read-only — verify_jwt = false. Returns only fields safe to
 * expose: id, name, logo_url, phone, email, website. Never config.
 *
 * Deploy:
 *   SUPABASE_ACCESS_TOKEN=... supabase functions deploy tenant-by-slug \
 *     --project-ref ltpivkqahvplapyagljt
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  let slug = (url.searchParams.get("slug") || "").trim().toLowerCase();
  if (!slug && req.method === "POST") {
    try {
      const body = await req.json();
      slug = String(body?.slug || "").trim().toLowerCase();
    } catch { /* ignore */ }
  }
  if (!slug) {
    return new Response(JSON.stringify({ ok: false, error: "Missing slug" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Resolve slug → tenant. We check three places, in order:
  //   1. tenants.config.marketing_site.slug (the canonical home for slugs)
  //   2. tenants.config.slug (legacy / shortcut)
  //   3. lowercase(tenants.name) with non-alphanumerics stripped
  // Using PostgREST's `or` to do all three in one round trip is awkward
  // because of the jsonb path queries — easier to fetch a small list
  // and filter in code.
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tenants?select=id,name,config`, {
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY },
  });
  if (!r.ok) {
    return new Response(JSON.stringify({ ok: false, error: "tenant lookup failed " + r.status }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const tenants = await r.json();
  const normalize = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const wanted = normalize(slug);

  let match: any = null;
  for (const t of tenants) {
    const ms = t.config?.marketing_site?.slug;
    const cfgSlug = t.config?.slug;
    const candidates = [ms, cfgSlug, t.name].filter(Boolean).map((s: string) => normalize(s));
    if (candidates.includes(wanted)) {
      match = t;
      break;
    }
  }

  if (!match) {
    return new Response(JSON.stringify({ ok: false, error: "No tenant for slug" }), {
      status: 404, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const cfg = match.config || {};
  const safe = {
    ok: true,
    id: match.id,
    name: match.name,
    slug: cfg.marketing_site?.slug || cfg.slug || normalize(match.name),
    logo_url: cfg.logo_url || cfg.brand_logo_url || null,
    phone: cfg.phone || null,
    email: cfg.email || null,
    website: cfg.website || cfg.website_url || null,
  };
  return new Response(JSON.stringify(safe), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json", "cache-control": "public, max-age=300" },
  });
});
