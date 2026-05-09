/**
 * Branch Manager — Plaid public_token → access_token exchange (v691)
 *
 * After Plaid Link succeeds, the client gets a public_token + metadata
 * (which accounts the user picked, the institution name, etc.). This fn
 * exchanges public_token for a permanent access_token, then creates a
 * row in `bank_accounts` for each picked account, kicks off an initial
 * transactions backfill (deferred to plaid-sync-transactions).
 *
 * Request: POST { tenant_id, public_token, metadata }
 *   metadata: { institution: { name }, accounts: [{ id, name, type, subtype, mask }] }
 *
 * Response: { item_id, accounts: [...] }
 *
 * Env vars: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, SUPABASE_SERVICE_ROLE_KEY
 *
 * Deploy: supabase functions deploy plaid-exchange-token --no-verify-jwt
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-tenant-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID') || '';
const PLAID_SECRET = Deno.env.get('PLAID_SECRET') || '';
const PLAID_ENV = (Deno.env.get('PLAID_ENV') || 'sandbox').toLowerCase();
const PLAID_BASE = `https://${PLAID_ENV}.plaid.com`;
const SUPA_URL = Deno.env.get('SUPABASE_URL') || 'https://ltpivkqahvplapyagljt.supabase.co';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function err(m: string, status = 400) {
  return new Response(JSON.stringify({ error: m }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function plaid(path: string, body: any) {
  const r = await fetch(`${PLAID_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET, ...body }),
  });
  const data = await r.json();
  if (!r.ok || data.error_code) throw new Error(data.error_message || data.display_message || 'plaid error');
  return data;
}

async function supa(method: string, path: string, body?: any) {
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
  if (req.method !== 'POST') return err('POST only', 405);
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) return err('Plaid credentials not configured', 500);

  let body: any = {};
  try { body = await req.json(); } catch { return err('Invalid JSON body'); }
  const tenantId = String(body.tenant_id || req.headers.get('x-tenant-id') || '').trim();
  const publicToken = String(body.public_token || '').trim();
  const metadata = body.metadata || {};

  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) return err('Missing or invalid tenant_id');
  if (!publicToken) return err('Missing public_token');

  try {
    // 1. Exchange public_token for access_token + item_id
    const ex = await plaid('/item/public_token/exchange', { public_token: publicToken });
    const accessToken = ex.access_token;
    const itemId = ex.item_id;

    // 2. Create bank_accounts rows for each picked account
    const accounts = (metadata.accounts || []) as Array<any>;
    const institutionName = (metadata.institution && metadata.institution.name) || 'Bank';

    const inserted = [];
    for (const a of accounts) {
      const row = {
        tenant_id: tenantId,
        name: a.name || `${institutionName} ${(a.subtype || a.type || '').toString()}`,
        bank_name: institutionName,
        account_type: (a.subtype || a.type || 'checking').toString(),
        last_4: a.mask || null,
        plaid_item_id: itemId,
        plaid_access_token: accessToken,
        plaid_account_id: a.id,
        active: true,
      };
      try {
        const out = await supa('POST', 'bank_accounts', row);
        inserted.push(out[0]);
      } catch (e) {
        // Continue with other accounts
        console.warn('Failed to insert', a, (e as Error).message);
      }
    }

    // 3. Kick off async transactions backfill (fire-and-forget)
    fetch(`${SUPA_URL}/functions/v1/plaid-sync-transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ tenant_id: tenantId, item_id: itemId, full_backfill: true }),
    }).catch(() => { /* ignore */ });

    return new Response(JSON.stringify({ item_id: itemId, accounts: inserted }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return err(`Exchange failed: ${(e as Error).message}`, 502);
  }
});
