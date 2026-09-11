// plaid-balances — live balance refresh (added 2026-09-11).
// POST { tenant_id } → calls Plaid /accounts/balance/get for every active
// Plaid-linked bank_accounts row of that tenant, writes balance_current /
// balance_as_of, and returns the fresh balances. Service-role callers only.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { resolvePlaidCreds } from '../_shared/plaid.ts';

const SUPA_URL = Deno.env.get('SUPABASE_URL') || 'https://ltpivkqahvplapyagljt.supabase.co';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function supa(method: string, path: string, body?: unknown) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`supabase ${method} ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  // Service-role only: accept the exact env key, or a JWT whose role claim is service_role.
  const auth = req.headers.get('authorization') || '';
  const tok = auth.replace(/^Bearer\s+/i, '');
  let role = '';
  try { role = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role || ''; } catch { /* not a JWT */ }
  if (!(SERVICE_KEY && tok === SERVICE_KEY) && role !== 'service_role') return json({ error: 'service role required' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const tenant = body.tenant_id;
  if (!tenant) return json({ error: 'tenant_id required' }, 400);

  const creds = await resolvePlaidCreds(tenant);
  if (!creds) return json({ error: 'no plaid creds for tenant' }, 400);

  // Balance-only rows (active=false) are included on purpose: they hold the
  // other accounts under the same M&T login so balances refresh, while the
  // transaction importer (which requires active=true) leaves them alone.
  const rows: any[] = await supa(
    'GET',
    `bank_accounts?tenant_id=eq.${tenant}&plaid_access_token=not.is.null` +
      `&select=id,name,account_type,plaid_item_id,plaid_access_token,plaid_account_id,active`,
  );
  const byItem: Record<string, { access: string; rows: any[] }> = {};
  for (const r of rows) (byItem[r.plaid_item_id] ||= { access: r.plaid_access_token, rows: [] }).rows.push(r);

  const out: any[] = [];
  const asOf = new Date().toISOString();
  for (const item of Object.values(byItem)) {
    // Try real-time /accounts/balance/get first (needs the Balance product);
    // fall back to /accounts/get, which returns the balances Plaid cached at
    // the last transactions refresh (no extra product required).
    const call = async (path: string) => {
      const pr = await fetch(`${creds.base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: creds.client_id, secret: creds.secret, access_token: item.access }),
      });
      return { ok: pr.ok, data: await pr.json() };
    };
    let { ok, data } = await call('/accounts/balance/get');
    let mode = 'realtime';
    if (!ok || data.error_code) { ({ ok, data } = await call('/accounts/get')); mode = 'cached'; }
    const pr = { ok };
    if (!pr.ok || data.error_code) {
      out.push({ error: data.error_message || data.error_code || 'plaid error', item_rows: item.rows.map((r) => r.name) });
      continue;
    }
    for (const acct of data.accounts || []) {
      const row = item.rows.find((r) => r.plaid_account_id === acct.account_id);
      const bal = acct.balances || {};
      // One Plaid item = one bank login, which can hold accounts that belong to
      // different tenants (e.g. 0606 tree, 0929 skate park). Write the balance to
      // every bank_accounts row carrying this plaid_account_id, whatever the tenant.
      const updated: any[] = await supa('PATCH', `bank_accounts?plaid_account_id=eq.${encodeURIComponent(acct.account_id)}`, {
        balance_current: bal.current,
        balance_as_of: asOf.slice(0, 10),
        updated_at: asOf,
      });
      const stored = Array.isArray(updated) ? updated.length : 0;
      out.push({
        plaid_account_id: acct.account_id,
        name: row?.name || acct.name,
        type: acct.type,
        subtype: acct.subtype,
        mask: acct.mask,
        current: bal.current,
        available: bal.available,
        limit: bal.limit,
        currency: bal.iso_currency_code,
        balance_mode: mode,
        matched_row: !!row,
        rows_updated: stored,
      });
    }
  }
  return json({ as_of: asOf, plaid_env: creds.env, accounts: out });
});
