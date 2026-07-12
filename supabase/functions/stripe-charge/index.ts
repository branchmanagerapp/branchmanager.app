/**
 * Branch Manager — Embedded Stripe Charge (multi-invoice)
 *
 * Server-side PaymentIntent create + confirm for the embedded Collect
 * Payment page. Reads the tenant's stripe_secret_key from tenants.config
 * (RLS-gated; only service role inside this function can read it).
 *
 * Flow:
 *   BM client builds Stripe Elements card form, calls stripe.confirmCardPayment
 *   with a clientSecret returned from this function. We never see the card.
 *
 * Request body (POST):
 *   { tenantId, amount, invoiceIds[], description?, customerEmail? }
 *
 * Response on success:
 *   { ok: true, clientSecret, paymentIntentId }
 *
 * Deploy:
 *   supabase functions deploy stripe-charge --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

async function getTenantSecretKey(tenantId: string): Promise<string | null> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}&select=config`, {
    headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + SERVICE_ROLE_KEY }
  });
  if (!r.ok) return null;
  const data = await r.json();
  const cfg = data && data[0] && data[0].config;
  return (cfg && cfg.stripe_secret_key) || Deno.env.get('STRIPE_SECRET_KEY') || null;
}

// Server-side authoritative amount: sum the REAL balances of the given
// invoices (scoped to the tenant). Returns cents, or null if it can't verify.
async function getInvoicesBalanceCents(tenantId: string, ids: string[]): Promise<number | null> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ids.length) return null;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/invoices?id=in.(${ids.join(',')})&tenant_id=eq.${tenantId}&select=balance,total`,
    { headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': 'Bearer ' + SERVICE_ROLE_KEY } }
  );
  if (!r.ok) return null;
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) return null;
  let cents = 0;
  for (const row of rows) cents += Math.round(Number(row.balance ?? row.total ?? 0) * 100);
  return cents;
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
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  try {
    const { tenantId, amount, invoiceIds, description, customerEmail } = await req.json();

    if (!tenantId) {
      return new Response(JSON.stringify({ ok: false, error: 'tenantId required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }
    // AUTHORITATIVE AMOUNT: if this charge is tied to invoices, compute the
    // amount SERVER-SIDE from their real balances — never trust the client's
    // `amount` (a tampered browser could try to pay a $5,000 invoice for $0.50).
    const invoiceIdList = Array.isArray(invoiceIds) ? invoiceIds.filter(Boolean) : [];
    let cents = Math.round(parseFloat(amount) * 100); // fallback: owner ad-hoc charge with no invoice attached
    if (invoiceIdList.length) {
      const serverCents = await getInvoicesBalanceCents(tenantId, invoiceIdList);
      if (serverCents == null) {
        return new Response(JSON.stringify({ ok: false, error: 'Could not verify invoice balances' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }
      cents = serverCents; // ignore whatever the client sent
    }
    if (!cents || cents < 50) {
      return new Response(JSON.stringify({ ok: false, error: 'Amount must be at least $0.50' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const secretKey = await getTenantSecretKey(tenantId);
    if (!secretKey) {
      return new Response(JSON.stringify({ ok: false, error: 'Stripe secret key not configured for tenant' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    // Encode invoice IDs in client_reference_id so the existing stripe-webhook
    // can mark all of them paid via comma-split. We append "MULTI:" prefix so
    // the webhook can distinguish multi-invoice charges.
    const ref = invoiceIdList.length ? 'MULTI:' + invoiceIdList.join(',') : '';

    const params: Record<string, string> = {
      amount: String(cents),
      currency: 'usd',
      'automatic_payment_methods[enabled]': 'true',
      'metadata[invoice_ids]': invoiceIdList.join(','),
      'metadata[tenant_id]': tenantId,
      description: description || ('Invoice payment — ' + invoiceIdList.length + ' invoice(s)')
    };
    if (customerEmail) params['receipt_email'] = customerEmail;
    if (ref) params['statement_descriptor_suffix'] = 'BRANCH MGR';

    const intent = await stripeForm('/payment_intents', secretKey, params);

    return new Response(JSON.stringify({
      ok: true,
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('stripe-charge error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
