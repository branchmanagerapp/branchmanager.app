/**
 * Branch Manager — Subscription Checkout (Phase 1.B)
 *
 * Creates a Stripe Checkout Session for a BM tenant to subscribe to (or
 * upgrade to) Solo / Crew / Pro. Returns { url } for the BM client to
 * redirect the user into Stripe-hosted Checkout.
 *
 * On payment success, Stripe fires `checkout.session.completed` with
 * `mode: 'subscription'`. The stripe-webhook edge fn handles that event
 * and writes `tenants.config.subscription` with status='active' + the
 * stripe_subscription_id + stripe_customer_id.
 *
 * Request body: { tenant_id: uuid, tier: 'solo'|'crew'|'pro' }
 * Returns: { url, session_id } on success
 *
 * Env vars required:
 *   STRIPE_API_KEY                 — sk_live_... or sk_test_...
 *   STRIPE_PRICE_SOLO              — price_... ($39/mo)
 *   STRIPE_PRICE_CREW              — price_... ($89/mo)
 *   STRIPE_PRICE_PRO               — price_... ($149/mo)
 *   STRIPE_CHECKOUT_SUCCESS_URL    — defaults to https://branchmanager.app/?subscription=success
 *   STRIPE_CHECKOUT_CANCEL_URL     — defaults to https://branchmanager.app/?subscription=cancel
 *
 * Deploy: supabase functions deploy subscription-create-checkout --no-verify-jwt
 *   (also pinned in supabase/config.toml)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-tenant-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STRIPE_API_KEY = Deno.env.get('STRIPE_API_KEY') ?? '';
const PRICE_BY_TIER: Record<string, string> = {
  solo: Deno.env.get('STRIPE_PRICE_SOLO') ?? '',
  crew: Deno.env.get('STRIPE_PRICE_CREW') ?? '',
  pro: Deno.env.get('STRIPE_PRICE_PRO') ?? '',
};
const SUCCESS_URL = Deno.env.get('STRIPE_CHECKOUT_SUCCESS_URL')
  ?? 'https://branchmanager.app/?subscription=success&session_id={CHECKOUT_SESSION_ID}';
const CANCEL_URL = Deno.env.get('STRIPE_CHECKOUT_CANCEL_URL')
  ?? 'https://branchmanager.app/?subscription=cancel';

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') return err('POST only', 405);

  if (!STRIPE_API_KEY) {
    return err(
      'Stripe API key not configured. Set STRIPE_API_KEY (and STRIPE_PRICE_SOLO/CREW/PRO) via supabase secrets, then redeploy.',
      500,
    );
  }

  let body: { tenant_id?: string; tier?: string; email?: string } = {};
  try { body = await req.json(); } catch { return err('Invalid JSON body'); }

  const tenantId = String(body.tenant_id || req.headers.get('x-tenant-id') || '').trim();
  const tier = String(body.tier || '').trim().toLowerCase();
  const customerEmail = String(body.email || '').trim() || undefined;

  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) return err('Missing/invalid tenant_id');
  if (!['solo', 'crew', 'pro'].includes(tier)) return err('tier must be solo|crew|pro');

  const priceId = PRICE_BY_TIER[tier];
  if (!priceId) {
    return err(
      `STRIPE_PRICE_${tier.toUpperCase()} not configured. Create Solo/Crew/Pro recurring prices in Stripe and set the env vars.`,
      500,
    );
  }

  // Stripe Checkout Session creation. Using x-www-form-urlencoded since
  // Stripe's API expects that, no SDK import needed.
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', SUCCESS_URL);
  params.set('cancel_url', CANCEL_URL);
  params.set('client_reference_id', tenantId);  // Stripe shows this in dashboard
  params.set('metadata[tenant_id]', tenantId);   // Echoed back on webhooks
  params.set('metadata[tier]', tier);
  params.set('metadata[product]', 'bm_saas_subscription');
  params.set('subscription_data[metadata][tenant_id]', tenantId);
  params.set('subscription_data[metadata][tier]', tier);
  params.set('subscription_data[metadata][product]', 'bm_saas_subscription');
  params.set('allow_promotion_codes', 'true');
  if (customerEmail) params.set('customer_email', customerEmail);

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await r.json();
    if (!r.ok) {
      return err(`Stripe error: ${data?.error?.message || r.status}`, r.status);
    }

    return new Response(
      JSON.stringify({ url: data.url, session_id: data.id }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return err(`Network error: ${(e as Error).message}`, 502);
  }
});
