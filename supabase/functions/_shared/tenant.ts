// Shared tenant resolver — Phase 2 multi-tenant support.
//
// All edge functions used to hardcode SNT's tenant_id
// '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'. That worked with one tenant but
// would have stamped every other tenant's data into SNT's bucket.
//
// New flow:
//   1. Caller (BM client OR Cloudflare Worker for subdomain traffic) sets
//      the `X-Tenant-ID` request header. BM's supabase.js stamps it on every
//      Supabase client call; the Worker injects it from the subdomain map.
//   2. Edge functions call resolveTenantId(req) to extract it.
//   3. If absent or invalid (not a UUID), we fall back to SNT for backwards
//      compatibility during the rollout. Once every BM build + Worker route
//      sends X-Tenant-ID reliably, the fallback can be removed.
//
// Webhook receivers (dialpad-webhook, stripe-webhook, bouncie-webhook,
// resend-webhook) get tenant from the *event payload* instead — by
// looking up the receiver phone/account/customer in tenants.config and
// matching. They should NOT use this helper directly; see resolveTenantFromEvent.

const SNT_TENANT_ID = "93af4348-8bba-4045-ac3e-5e71ec1cc8c5";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve tenant_id from an HTTP request. Reads X-Tenant-ID header,
 * validates UUID shape, falls back to SNT.
 *
 * @param req incoming Request
 * @param opts.requireHeader if true, throws when header missing/invalid
 *   (use for new functions during cutover; defaults false = SNT fallback)
 */
export function resolveTenantId(
  req: Request,
  opts: { requireHeader?: boolean } = {},
): string {
  const raw = req.headers.get("x-tenant-id") || req.headers.get("X-Tenant-ID") || "";
  const trimmed = raw.trim().toLowerCase();
  if (UUID_RE.test(trimmed)) return trimmed;
  if (opts.requireHeader) {
    throw new Error("X-Tenant-ID header required");
  }
  // Backwards-compat fallback during Phase 2 rollout.
  return SNT_TENANT_ID;
}

/**
 * For webhook receivers — look up tenant from a known field in the event
 * payload. We carry tenant routing keys in `tenants.config`:
 *   - sms_from_number  → matched against Dialpad's to_number
 *   - stripe_account_id → matched against Stripe webhook account.id
 *   - bouncie_account → matched against Bouncie account hash
 *   - resend_audience → matched against Resend webhook audience id
 *
 * @param sb Supabase client (service-role)
 * @param key the kind of routing key
 * @param value the value to match
 * @returns tenant_id, or SNT fallback if not found
 */
export async function resolveTenantFromEvent(
  // deno-lint-ignore no-explicit-any
  sb: any,
  key: "sms_from_number" | "stripe_account_id" | "bouncie_account" | "resend_audience",
  value: string,
): Promise<string> {
  if (!value) return SNT_TENANT_ID;
  try {
    const { data, error } = await sb
      .from("tenants")
      .select("id, config")
      .filter(`config->>${key}`, "eq", value)
      .limit(1);
    if (error || !data || data.length === 0) return SNT_TENANT_ID;
    return data[0].id;
  } catch (_e) {
    return SNT_TENANT_ID;
  }
}

export const SNT_TENANT_ID_CONST = SNT_TENANT_ID;

/**
 * Branding values used in customer-facing emails / SMS / PDFs.
 * Mirrors the tokens defined in /branding.js for HTML pages.
 *
 * Fields are guaranteed non-null — falls back to SNT defaults if a tenant
 * doesn't have the field set yet, so edge functions can use them safely.
 */
export interface TenantBranding {
  tenant_id: string;
  business_name: string;       // "Second Nature Tree Service"
  business_short_name: string; // "Second Nature Tree"
  legal_name: string;          // "Second Nature Tree Service LLC"
  owner_name: string;
  phone: string;               // "(914) 391-5233"
  email: string;               // "info@peekskilltree.com"
  website: string;             // "https://peekskilltree.com"
  website_display: string;     // "peekskilltree.com" (no protocol)
  address_line1: string;       // "1 Highland Industrial Park"
  address_line2: string;
  city: string;
  state: string;
  state_full: string;
  zip: string;
  address_full: string;        // composed: "1 Highland Industrial Park, Peekskill, NY 10566"
  address_short: string;       // composed: "Peekskill, NY"
  effective_date: string;
  license_text: string;
  logo_url: string;
  brand_color: string;
  vertical: string;
  from_email: string;          // Resend sender — "info@peekskilltree.com" by default
  from_name: string;           // Resend display — "Second Nature Tree"
  sms_from_number: string;     // E.164 — "+19143915233"
  google_review_url: string;
}

const SNT_DEFAULTS: TenantBranding = {
  tenant_id: SNT_TENANT_ID,
  business_name: "Second Nature Tree Service",
  business_short_name: "Second Nature Tree",
  legal_name: "Second Nature Tree Service LLC",
  owner_name: "Owner",
  phone: "(914) 391-5233",
  email: "info@peekskilltree.com",
  website: "https://peekskilltree.com",
  website_display: "peekskilltree.com",
  address_line1: "1 Highland Industrial Park",
  address_line2: "",
  city: "Peekskill",
  state: "NY",
  state_full: "New York",
  zip: "10566",
  address_full: "1 Highland Industrial Park, Peekskill, NY 10566",
  address_short: "Peekskill, NY",
  effective_date: "April 2026",
  license_text: "Licensed & Fully Insured",
  logo_url: "https://branchmanager.app/icons/icon-512.png",
  brand_color: "#1a3c12",
  vertical: "tree_service",
  from_email: "info@peekskilltree.com",
  from_name: "Second Nature Tree",
  sms_from_number: "+19143915233",
  google_review_url: "https://g.page/r/CcVkZHV_EKlEEBM/review",
};

/**
 * Load tenant branding from `tenants.config`. Always returns a fully-populated
 * TenantBranding object — missing fields fall back to SNT defaults.
 *
 * Caches per (sb-instance, tenant_id) for the duration of the function invocation.
 *
 * @param sb Supabase client (service-role recommended)
 * @param tenant_id UUID
 */
const _brandingCache = new Map<string, TenantBranding>();
export async function loadTenantBranding(
  // deno-lint-ignore no-explicit-any
  sb: any,
  tenant_id: string,
): Promise<TenantBranding> {
  const key = tenant_id || SNT_TENANT_ID;
  const cached = _brandingCache.get(key);
  if (cached) return cached;

  let row: { id: string; name?: string; config?: Record<string, unknown> } | null = null;
  try {
    const { data, error } = await sb
      .from("tenants")
      .select("id, name, config")
      .eq("id", key)
      .limit(1)
      .single();
    if (!error && data) row = data;
  } catch (_e) {
    // fall through to defaults
  }

  const c = (row?.config || {}) as Record<string, unknown>;
  const get = (k: string, fb: string): string => {
    const v = c[k];
    return typeof v === "string" && v.length > 0 ? v : fb;
  };

  const branding: TenantBranding = {
    tenant_id: key,
    business_name: get("company_name", SNT_DEFAULTS.business_name),
    business_short_name: get("business_short_name", SNT_DEFAULTS.business_short_name),
    legal_name: get("legal_name", SNT_DEFAULTS.legal_name),
    owner_name: get("owner_name", SNT_DEFAULTS.owner_name),
    phone: get("company_phone", SNT_DEFAULTS.phone),
    email: get("company_email", SNT_DEFAULTS.email),
    website: get("company_website", SNT_DEFAULTS.website),
    website_display: get("company_website", SNT_DEFAULTS.website).replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
    address_line1: get("address_line1", SNT_DEFAULTS.address_line1),
    address_line2: get("address_line2", ""),
    city: get("city", SNT_DEFAULTS.city),
    state: get("state", SNT_DEFAULTS.state),
    state_full: get("state_full", SNT_DEFAULTS.state_full),
    zip: get("zip", SNT_DEFAULTS.zip),
    address_full: "",  // composed below
    address_short: "",
    effective_date: get("effective_date", SNT_DEFAULTS.effective_date),
    license_text: get("license_text", SNT_DEFAULTS.license_text),
    logo_url: get("logo_url", SNT_DEFAULTS.logo_url),
    brand_color: get("brand_color", SNT_DEFAULTS.brand_color),
    vertical: get("vertical", SNT_DEFAULTS.vertical),
    from_email: get("from_email", SNT_DEFAULTS.from_email),
    from_name: get("from_name", SNT_DEFAULTS.from_name),
    sms_from_number: get("sms_from_number", SNT_DEFAULTS.sms_from_number),
    google_review_url: get("google_review_url", SNT_DEFAULTS.google_review_url),
  };
  branding.address_full = [
    branding.address_line1,
    branding.address_line2,
    `${branding.city}, ${branding.state} ${branding.zip}`,
  ].filter(Boolean).join(", ");
  branding.address_short = `${branding.city}, ${branding.state}`;

  _brandingCache.set(key, branding);
  return branding;
}

