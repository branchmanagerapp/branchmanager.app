/**
 * Branch Manager — Plaid Link token (v691)
 *
 * Creates a short-lived Link token that the BM client uses to launch
 * Plaid Link (the bank-connect popup). Once the user picks their bank
 * and authenticates, Plaid hands back a public_token which BM exchanges
 * via plaid-exchange-token for a permanent access_token.
 *
 * Request: POST { tenant_id }
 * Response: { link_token, expiration }
 *
 * Env vars (set via supabase secrets):
 *   PLAID_CLIENT_ID
 *   PLAID_SECRET
 *   PLAID_ENV   = 'sandbox' | 'development' | 'production'  (default: sandbox)
 *
 * Deploy: supabase functions deploy plaid-link-token --no-verify-jwt
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

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return err('POST only', 405);

  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    return err(
      'Plaid credentials not configured. Set PLAID_CLIENT_ID + PLAID_SECRET via supabase secrets, then redeploy.',
      500,
    );
  }

  let body: { tenant_id?: string } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }
  const tenantId = String(body.tenant_id || req.headers.get('x-tenant-id') || '').trim();
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) return err('Missing or invalid tenant_id');

  // Build the Link token request. Tree-service ops only need
  // 'transactions' product. Add 'auth' if Doug ever wants ACH-out.
  const payload = {
    client_id: PLAID_CLIENT_ID,
    secret: PLAID_SECRET,
    client_name: 'Branch Manager',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en',
    user: { client_user_id: tenantId },
    webhook: `https://ltpivkqahvplapyagljt.supabase.co/functions/v1/plaid-webhook`,
  };

  try {
    const r = await fetch(`${PLAID_BASE}/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok || data.error_code) {
      return err(`Plaid error: ${data.error_message || data.display_message || 'unknown'}`, r.status);
    }
    return new Response(
      JSON.stringify({ link_token: data.link_token, expiration: data.expiration }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return err(`Network error: ${(e as Error).message}`, 502);
  }
});
