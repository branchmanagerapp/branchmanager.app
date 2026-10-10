/**
 * Branch Manager — Save Plaid keys to tenants.config (v856)
 *
 * Lets each tenant wire their own Plaid keys without an operator
 * touching Supabase secrets. Owner-gated like stripe-create-link.
 *
 * Request:
 *   POST { tenantId, clientId, secret, env: 'sandbox'|'development'|'production' }
 *
 * Response:
 *   { ok, source: 'tenant', testedOk: boolean, testedMsg?: string }
 *
 * The fn also calls Plaid's /institutions/get_by_id with a known
 * institution (ins_109508 = Chase) as a credential smoke-test before
 * persisting — catches typos / wrong-env / revoked keys at save time
 * instead of mid-flow.
 *
 * Deploy: supabase functions deploy plaid-save-keys --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { writePlaidSecret } from '../_shared/plaid.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-tenant-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPA_URL = Deno.env.get('SUPABASE_URL') || 'https://ltpivkqahvplapyagljt.supabase.co';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const OWNER_EMAILS = (Deno.env.get('OWNER_EMAILS_OVERRIDE')?.split(',') ?? ['info@peekskilltree.com', 'doug@peekskilltree.com']).map((e) => e.trim().toLowerCase());

function json(status: number, body: any) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// Same owner-gate as stripe-create-link: verify caller's Supabase JWT
// and confirm (a) email in OWNER_EMAILS or (b) team_members role
// in (owner, admin) for this tenant.
async function requireOwner(req: Request, tenantId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return { ok: false, status: 401, error: 'Missing Authorization Bearer token' };
  const ur = await fetch(`${SUPA_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + jwt },
  });
  if (!ur.ok) return { ok: false, status: 401, error: 'Invalid or expired session' };
  const user = await ur.json();
  if (!user || !user.id) return { ok: false, status: 401, error: 'Invalid session payload' };
  const email = (user.email || '').toLowerCase();
  if (OWNER_EMAILS.indexOf(email) !== -1) return { ok: true };
  const tmRes = await fetch(
    `${SUPA_URL}/rest/v1/team_members?auth_id=eq.${user.id}&tenant_id=eq.${tenantId}&role=in.(owner,admin)&select=id&limit=1`,
    { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY } }
  );
  if (tmRes.ok) {
    const mems = await tmRes.json();
    if (mems && mems.length) return { ok: true };
  }
  return { ok: false, status: 403, error: 'Not an owner/admin for this tenant' };
}

async function testPlaidCreds(clientId: string, secret: string, env: string): Promise<{ ok: boolean; msg: string }> {
  try {
    // Validate via /institutions/get — works in EVERY environment and only
    // checks that client_id+secret are valid. (The old test used
    // /institutions/get_by_id with hardcoded institution_id 'ins_109508',
    // which is a SANDBOX-only institution → "invalid institution_id provided"
    // in production, falsely rejecting valid production keys.)
    const r = await fetch(`https://${env}.plaid.com/institutions/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret, count: 1, offset: 0, country_codes: ['US'] }),
    });
    const data = await r.json();
    if (!r.ok || data.error_code) {
      return { ok: false, msg: data.error_message || data.display_message || `HTTP ${r.status}` };
    }
    return { ok: true, msg: `Verified — ${env} credentials accepted` };
  } catch (e) {
    return { ok: false, msg: `Network: ${(e as Error).message}` };
  }
}

// SECURITY (2026-06-07): Plaid creds now go to the locked `tenant_secrets`
// table, NOT tenants.config (which is anon-readable and leaked the secret).
// We still write a NON-secret marker into config so the Settings UI can show
// "Plaid connected" + the env without ever exposing the secret.
async function saveCreds(tenantId: string, clientId: string | null, secret: string | null, env: string | null) {
  // 1. Secret material → tenant_secrets (owner-only RLS, never anon).
  await writePlaidSecret(tenantId, { client_id: clientId, secret, env });

  // 2. Non-secret marker → config (safe to be anon-readable).
  const get = await fetch(`${SUPA_URL}/rest/v1/tenants?id=eq.${tenantId}&select=config`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!get.ok) throw new Error(`Read tenants: ${get.status}`);
  const rows = await get.json();
  const existing = (rows && rows[0] && rows[0].config) || {};
  // Strip any legacy plaid blob and drop a clean marker.
  const { plaid: _legacy, ...rest } = existing;
  const merged = { ...rest, plaid_configured: !!(clientId && secret), plaid_env: (clientId && secret) ? env : null };

  const put = await fetch(`${SUPA_URL}/rest/v1/tenants?id=eq.${tenantId}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ config: merged }),
  });
  if (!put.ok) throw new Error(`Update tenants: ${put.status} ${await put.text()}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' });

  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { ok: false, error: 'Invalid JSON' }); }

  const tenantId = String(body.tenantId || '').trim();
  const clientId = String(body.clientId || '').trim();
  const secret = String(body.secret || '').trim();
  const env = String(body.env || 'sandbox').toLowerCase();

  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return json(400, { ok: false, error: 'Missing or invalid tenantId' });
  if (!['sandbox', 'development', 'production'].includes(env)) return json(400, { ok: false, error: "env must be 'sandbox' | 'development' | 'production'" });

  const gate = await requireOwner(req, tenantId);
  if (!gate.ok) return json(gate.status, { ok: false, error: gate.error });

  // Allow CLEARING keys by passing empty strings.
  if (!clientId && !secret) {
    try {
      await saveCreds(tenantId, null, null, null);
      return json(200, { ok: true, cleared: true });
    } catch (e) {
      return json(500, { ok: false, error: `Clear failed: ${(e as Error).message}` });
    }
  }

  if (!clientId || !secret) return json(400, { ok: false, error: 'Both clientId and secret are required (or both empty to clear)' });

  // Smoke-test the creds before persisting
  const test = await testPlaidCreds(clientId, secret, env);
  if (!test.ok) return json(400, { ok: false, error: `Plaid rejected the keys: ${test.msg}` });

  try {
    await saveCreds(tenantId, clientId, secret, env);
  } catch (e) {
    return json(500, { ok: false, error: `Save failed: ${(e as Error).message}` });
  }

  return json(200, { ok: true, testedOk: true, testedMsg: test.msg, env });
});
