/**
 * Branch Manager — shared Plaid credential resolver (v856)
 *
 * Resolution order (first hit wins):
 *   1. tenants.config.plaid.{client_id, secret, env}     ← per-tenant
 *   2. Deno.env PLAID_CLIENT_ID / PLAID_SECRET / PLAID_ENV ← platform fallback
 *
 * Per-tenant keys are the long-term white-label path: each tenant pays
 * Plaid directly with their own developer account. The env fallback keeps
 * SNT working during transition + lets a friend trial Plaid against the
 * BM operator's sandbox keys.
 *
 * Tenants table: config jsonb column → key 'plaid' → { client_id, secret, env }
 */

const SUPA_URL = Deno.env.get('SUPABASE_URL') || 'https://ltpivkqahvplapyagljt.supabase.co';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

export type PlaidCreds = { client_id: string; secret: string; env: string; base: string; source: 'tenant' | 'env' };

// SECURITY (2026-06-07): Plaid creds used to live in tenants.config.plaid, but
// the `tenants` row is anon-readable (public_read_tenants_for_branding policy)
// so the production secret leaked to anyone with the bundled anon key. Creds now
// live in `tenant_secrets` (RLS: owner-only SELECT, service-role writes, NO anon).
// These helpers are the ONLY path; all five plaid-* fns go through them.
const SECRETS_TBL = 'tenant_secrets';

// Read the full plaid secret blob for a tenant: { client_id, secret, env, cursors }.
// Service-role read (bypasses RLS). Transitional fallback to the legacy
// config.plaid location keeps reads working in the window between deploying this
// code and running the `config = config - 'plaid'` strip migration. Remove the
// fallback once the strip has run and been verified.
export async function readPlaidSecret(tenantId: string | null | undefined): Promise<any | null> {
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId) || !SERVICE_KEY) return null;
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/${SECRETS_TBL}?tenant_id=eq.${tenantId}&key=eq.plaid&select=value&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (r.ok) {
      const rows = await r.json();
      const v = rows && rows[0] && rows[0].value;
      if (v && (v.client_id || v.cursors)) return v;
    }
  } catch (_e) { /* fall through */ }
  // Transitional fallback: legacy config.plaid (delete after strip migration).
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/tenants?id=eq.${tenantId}&select=config`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    if (r.ok) {
      const rows = await r.json();
      const legacy = rows && rows[0] && rows[0].config && rows[0].config.plaid;
      if (legacy && (legacy.client_id || legacy.cursors)) return legacy;
    }
  } catch (_e) { /* ignore */ }
  return null;
}

// Merge a patch into the tenant's plaid secret blob (upsert on tenant_id+key).
// Used by plaid-save-keys (creds) and plaid-sync-transactions (cursors).
export async function writePlaidSecret(tenantId: string, patch: any): Promise<void> {
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId) || !SERVICE_KEY) {
    throw new Error('writePlaidSecret: bad tenantId or missing service key');
  }
  const existing = (await readPlaidSecret(tenantId)) || {};
  const merged = { ...existing, ...patch };
  const r = await fetch(`${SUPA_URL}/rest/v1/${SECRETS_TBL}?on_conflict=tenant_id,key`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ tenant_id: tenantId, key: 'plaid', value: merged, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`writePlaidSecret: ${r.status} ${await r.text()}`);
}

export async function resolvePlaidCreds(tenantId: string | null | undefined): Promise<PlaidCreds | null> {
  // Try the per-tenant secret store first (was tenants.config.plaid — see note above)
  const cfg = await readPlaidSecret(tenantId);
  if (cfg && cfg.client_id && cfg.secret) {
    const env = (cfg.env || 'sandbox').toLowerCase();
    return {
      client_id: String(cfg.client_id).trim(),
      secret: String(cfg.secret).trim(),
      env,
      base: `https://${env}.plaid.com`,
      source: 'tenant',
    };
  }
  // Env fallback
  const envCid = Deno.env.get('PLAID_CLIENT_ID') || '';
  const envSecret = Deno.env.get('PLAID_SECRET') || '';
  if (envCid && envSecret) {
    const env = (Deno.env.get('PLAID_ENV') || 'sandbox').toLowerCase();
    return {
      client_id: envCid,
      secret: envSecret,
      env,
      base: `https://${env}.plaid.com`,
      source: 'env',
    };
  }
  return null;
}

// Look up tenant_id for a given plaid_item_id (used by the webhook,
// which receives item_id without tenant context).
export async function tenantIdForPlaidItem(itemId: string): Promise<string | null> {
  if (!itemId || !SERVICE_KEY) return null;
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/bank_accounts?plaid_item_id=eq.${encodeURIComponent(itemId)}&select=tenant_id&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return (rows && rows[0] && rows[0].tenant_id) || null;
  } catch { return null; }
}
