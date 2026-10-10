/**
 * Branch Manager — Auto-create Stripe Payment Link
 *
 * Called once from BM Settings to bootstrap the base Payment Link without
 * the user having to navigate Stripe's dashboard. Creates a $0.01/unit
 * product + price + Payment Link with `adjustable_quantity` enabled, so
 * BM can drive any invoice amount via `prefilled_quantity` (cents trick).
 *
 * Request body:
 *   { secretKey: 'sk_live_...', successUrl?: 'https://branchmanager.app/paid.html' }
 *
 * The secret key is used inline for one set of API calls and never stored
 * anywhere. Returned to the client as { ok, url }.
 *
 * Deploy:
 *   supabase functions deploy stripe-create-link --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Owner-only gate — verifies caller's Supabase Auth JWT and confirms either
// (a) email is in OWNER_EMAILS or (b) team_members role in (owner, admin).
// TODO white-label: read tenant owner allow-list from tenants.config.owner_emails
// when a 2nd real tenant is onboarded. Currently SNT-only since these are
// admin functions Doug calls personally.
const OWNER_EMAILS = (Deno.env.get('OWNER_EMAILS_OVERRIDE')?.split(',') ?? ['info@peekskilltree.com', 'doug@peekskilltree.com']);
async function requireOwner(req: Request): Promise<{ ok: true; userId: string; email: string } | { ok: false; status: number; error: string }> {
  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return { ok: false, status: 401, error: 'Missing Authorization Bearer token' };
  const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + jwt }
  });
  if (!ur.ok) return { ok: false, status: 401, error: 'Invalid or expired session' };
  const user = await ur.json();
  if (!user || !user.id) return { ok: false, status: 401, error: 'Invalid session payload' };
  const email = (user.email || '').toLowerCase();
  if (OWNER_EMAILS.indexOf(email) !== -1) return { ok: true, userId: user.id, email };
  const tmRes = await fetch(
    `${SUPABASE_URL}/rest/v1/team_members?auth_id=eq.${user.id}&role=in.(owner,admin)&select=id&limit=1`,
    { headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + SERVICE_ROLE_KEY } }
  );
  if (tmRes.ok) {
    const mems = await tmRes.json();
    if (mems && mems.length) return { ok: true, userId: user.id, email };
  }
  return { ok: false, status: 403, error: 'Not an owner/admin' };
}

// Persist link to tenants.config.stripe_base_link via service role (bypasses
// RLS). BM runs as anon and can't update tenants directly.
async function saveLinkToTenant(tenantId: string, link: string) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !tenantId) return { ok: false, reason: 'env or no tenantId' };
  const headers = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + SERVICE_ROLE_KEY,
    'Content-Type': 'application/json'
  };
  // 1. Read existing config to merge
  const r1 = await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}&select=config`, { headers });
  if (!r1.ok) return { ok: false, reason: 'read failed', status: r1.status };
  const data = await r1.json();
  const cfg = (data && data[0] && data[0].config) || {};
  cfg.stripe_base_link = link;
  // 2. Write back
  const r2 = await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify({ config: cfg })
  });
  if (!r2.ok) {
    const t = await r2.text();
    return { ok: false, reason: 'write failed', status: r2.status, body: t.slice(0, 200) };
  }
  return { ok: true };
}

async function stripeForm(path: string, secretKey: string, params: Record<string, string>) {
  const body = new URLSearchParams(params).toString();
  const r = await fetch('https://api.stripe.com/v1' + path, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + secretKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const json = await r.json();
  if (!r.ok) throw new Error('Stripe ' + path + ' ' + r.status + ': ' + (json?.error?.message || JSON.stringify(json)));
  return json;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const gate = await requireOwner(req);
  if (!gate.ok) {
    return new Response(JSON.stringify({ ok: false, error: gate.error }),
      { status: gate.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  try {
    const { secretKey, successUrl, productName, tenantId } = await req.json();

    if (!secretKey || typeof secretKey !== 'string' || !secretKey.startsWith('sk_')) {
      return new Response(JSON.stringify({ ok: false, error: 'secretKey must start with sk_' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const success = successUrl || 'https://branchmanager.app/paid.html';
    const name = productName || 'Service Invoice';

    // 1. Create product
    const product = await stripeForm('/products', secretKey, { name });

    // 2. Create $0.01/unit price
    const price = await stripeForm('/prices', secretKey, {
      product: product.id,
      unit_amount: '1',  // 1 cent
      currency: 'usd'
    });

    // 3. Create Payment Link with adjustable quantity. BM passes
    //    prefilled_quantity = invoice cents to drive the actual amount.
    //    Initial quantity must be >= 50 because Stripe requires every
    //    Checkout Session total to be at least $0.50 USD; at $0.01/unit
    //    that means qty 50 minimum at link creation time.
    const link = await stripeForm('/payment_links', secretKey, {
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': '50',
      'line_items[0][adjustable_quantity][enabled]': 'true',
      'line_items[0][adjustable_quantity][minimum]': '50',
      'line_items[0][adjustable_quantity][maximum]': '999999',
      'after_completion[type]': 'redirect',
      'after_completion[redirect][url]': success,
      'allow_promotion_codes': 'false'
    });

    // Persist link to tenants.config so pay.html (anon, no localStorage)
    // can read it. Service-role write bypasses RLS.
    let saveResult: any = { ok: false, reason: 'no tenantId' };
    if (tenantId) saveResult = await saveLinkToTenant(tenantId, link.url);

    return new Response(JSON.stringify({ ok: true, url: link.url, productId: product.id, priceId: price.id, paymentLinkId: link.id, tenantSave: saveResult }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('stripe-create-link error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
