// RECOVERED FROM DEPLOYED (Supabase mgmt API, Aug 1 2026) — the repo copy had
// drifted behind production. This transpiled source IS production truth.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
async function pgFetch(path, init) {
  return await fetch(SUPABASE_URL + path, {
    ...init,
    headers: {
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      ...init && init.headers || {}
    }
  });
}
async function stripeForm(path, secretKey, params) {
  const body = new URLSearchParams(params).toString();
  const r = await fetch("https://api.stripe.com/v1" + path, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + secretKey,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const json = await r.json();
  if (!r.ok) throw new Error("Stripe " + path + " " + r.status + ": " + (json?.error?.message || JSON.stringify(json)));
  return json;
}
function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json"
    }
  });
}
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: CORS
  });
  if (req.method !== "POST") return new Response("Method not allowed", {
    status: 405,
    headers: CORS
  });
  try {
    const { invoiceId, returnUrl, amountCents: reqAmount } = await req.json();
    if (!invoiceId) return json(400, {
      ok: false,
      error: "Missing invoiceId"
    });
    // 1. Look up the invoice (service role bypasses RLS).
    const invRes = await pgFetch(`/rest/v1/invoices?id=eq.${encodeURIComponent(invoiceId)}&select=id,invoice_number,balance,total,status,tenant_id,client_id,client_email,client_name&limit=1`);
    if (!invRes.ok) throw new Error("Invoice lookup failed " + invRes.status);
    const invs = await invRes.json();
    const inv = invs && invs[0];
    if (!inv) return json(404, {
      ok: false,
      error: "Invoice not found"
    });
    if (inv.status === "paid") return json(400, {
      ok: false,
      error: "Invoice is already paid"
    });
    if (inv.status === "cancelled") return json(400, {
      ok: false,
      error: "Invoice was cancelled"
    });
    const dollars = Number(inv.balance ?? inv.total ?? 0);
    const balanceCents = Math.round(dollars * 100);
    // Allow the caller (pay.html) to pass a higher amount (balance + card
    // surcharge + tip), but NEVER below the invoice balance — a customer can
    // add on top, never underpay.
    const wanted = Math.round(Number(reqAmount) || 0);
    const cents = Math.max(balanceCents, wanted);
    if (cents < 50) return json(400, {
      ok: false,
      error: "Amount must be at least $0.50"
    });
    // 2. Tenant Stripe secret key (same source portal-pay-all uses).
    const tRes = await pgFetch(`/rest/v1/tenants?id=eq.${inv.tenant_id}&select=name,config`);
    const tArr = await tRes.json();
    const tenant = tArr && tArr[0];
    // The project secret is named STRIPE_API_KEY (verified Jul 13); keep the other
    // names as fallbacks in case a tenant stores its own key later.
    const secretKey = tenant?.config?.stripe_secret_key || Deno.env.get("STRIPE_API_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "";
    if (!secretKey) return json(400, {
      ok: false,
      error: "Stripe not configured for tenant"
    });
    const invNum = inv.invoice_number || String(inv.id).slice(0, 8);
    const base = returnUrl || "https://branchmanager.app";
    const success = base + "/paid.html?id=" + encodeURIComponent(inv.id) + "&paid=1";
    const cancel = base + "/pay.html?id=" + encodeURIComponent(inv.id) + "&canceled=1";
    // 3. Create the Checkout Session — exact amount, quantity 1, NOT adjustable.
    //    Set BOTH client_reference_id (INV-<num>) and metadata.invoice_ids (uuid)
    //    so the existing stripe-webhook matches either way → marks paid + receipt.
    const params = {
      "mode": "payment",
      "success_url": success,
      "cancel_url": cancel,
      "client_reference_id": "INV-" + invNum,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(cents),
      "line_items[0][price_data][product_data][name]": (tenant?.name || "Service") + " — Invoice #" + invNum,
      "metadata[invoice_ids]": String(inv.id),
      "metadata[tenant_id]": String(inv.tenant_id || ""),
      "metadata[client_id]": String(inv.client_id || ""),
      "metadata[source]": "invoice-checkout",
      "payment_intent_data[metadata][invoice_ids]": String(inv.id),
      "payment_intent_data[metadata][tenant_id]": String(inv.tenant_id || "")
    };
    if (inv.client_email) params["customer_email"] = inv.client_email;
    const checkout = await stripeForm("/checkout/sessions", secretKey, params);
    return json(200, {
      ok: true,
      url: checkout.url,
      amount: (cents / 100).toFixed(2),
      invoiceNumber: invNum
    });
  } catch (err) {
    console.error("invoice-checkout error:", err);
    return json(500, {
      ok: false,
      error: String(err?.message || err)
    });
  }
});