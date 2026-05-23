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

export async function resolvePlaidCreds(tenantId: string | null | undefined): Promise<PlaidCreds | null> {
  // Try tenant config first
  if (tenantId && /^[0-9a-f-]{36}$/i.test(tenantId) && SERVICE_KEY) {
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/tenants?id=eq.${tenantId}&select=config`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      if (r.ok) {
        const rows = await r.json();
        const cfg = rows && rows[0] && rows[0].config && rows[0].config.plaid;
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
      }
    } catch (_e) { /* fall through to env */ }
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
