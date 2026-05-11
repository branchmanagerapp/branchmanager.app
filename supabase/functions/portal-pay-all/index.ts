/**
 * portal-pay-all — combined Stripe Checkout for every unpaid invoice
 * tied to the logged-in customer portal session.
 *
 * Flow:
 *   1. Customer clicks "Pay All Outstanding" on portal.html
 *   2. Browser POSTs { token } from localStorage bm-portal-token
 *   3. We validate the session (same path as portal-session) and pull
 *      the client_id + tenant_id off the row
 *   4. Fetch every unpaid invoice for that client (status != paid AND
 *      total > 0 AND balance > 0)
 *   5. Sum balances → cents
 *   6. Pull the tenant's stripe_secret_key from tenants.config
 *   7. POST to Stripe /v1/checkout/sessions to create a hosted
 *      Checkout page for the combined amount, embedding the invoice IDs
 *      in metadata so the existing stripe-webhook can mark all paid
 *   8. Return { ok, url, total_cents, invoice_ids }
 *
 * The hosted Stripe Checkout flow is simpler than embedded PaymentIntent
 * for a client-facing one-off — no card UI to build, Stripe handles
 * Apple Pay/Google Pay, success URL bounces back to portal.html.
 *
 * Deploy: supabase functions deploy portal-pay-all --no-verify-jwt
 *   (verify_jwt=false because portal sessions auth via custom token,
 *   not Supabase JWT)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function pgFetch(path: string, init?: RequestInit) {
  return await fetch(SUPABASE_URL + path, {
    ...init,
    headers: {
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      ...((init && init.headers) || {}),
    },
  });
}

async function stripeForm(path: string, secretKey: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams(params).toString();
  const r = await fetch("https://api.stripe.com/v1" + path, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + secretKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await r.json();
  if (!r.ok) throw new Error("Stripe " + path + " " + r.status + ": " + (json?.error?.message || JSON.stringify(json)));
  return json;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  try {
    const { token, returnUrl } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "Missing token" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 1. Validate session — same shape as portal-session
    const sessRes = await pgFetch(`/rest/v1/portal_sessions?token=eq.${encodeURIComponent(token)}&select=client_id,tenant_id,expires_at`);
    if (!sessRes.ok) throw new Error("Session lookup failed " + sessRes.status);
    const sessions = await sessRes.json();
    if (!sessions || !sessions.length) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid or expired session" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const session = sessions[0];
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      return new Response(JSON.stringify({ ok: false, error: "Session expired" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 2. Pull unpaid invoices for this client
    const invRes = await pgFetch(`/rest/v1/invoices?client_id=eq.${session.client_id}&tenant_id=eq.${session.tenant_id}&status=neq.paid&status=neq.cancelled&select=id,invoice_number,balance,total,client_email,client_name`);
    if (!invRes.ok) throw new Error("Invoice fetch failed " + invRes.status);
    const invoices = await invRes.json();
    const unpaid = (invoices || []).filter((i: any) => Number(i.balance ?? i.total ?? 0) > 0);
    if (!unpaid.length) {
      return new Response(JSON.stringify({ ok: false, error: "No outstanding invoices" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 3. Sum + cents conversion
    let totalCents = 0;
    const lineItems = unpaid.map((i: any) => {
      const dollars = Number(i.balance ?? i.total ?? 0);
      const cents = Math.round(dollars * 100);
      totalCents += cents;
      return {
        price_data_currency: "usd",
        price_data_amount: String(cents),
        invoiceNumber: i.invoice_number || i.id.slice(0, 8),
      };
    });
    if (totalCents < 50) {
      return new Response(JSON.stringify({ ok: false, error: "Total must be at least $0.50" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 4. Pull tenant's Stripe key
    const tenantRes = await pgFetch(`/rest/v1/tenants?id=eq.${session.tenant_id}&select=name,config`);
    const tenantArr = await tenantRes.json();
    const tenant = tenantArr && tenantArr[0];
    const secretKey = tenant?.config?.stripe_secret_key || Deno.env.get("STRIPE_SECRET_KEY") || "";
    if (!secretKey) {
      return new Response(JSON.stringify({ ok: false, error: "Stripe not configured for tenant" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // 5. Create the Stripe Checkout Session
    const invoiceIdList = unpaid.map((i: any) => i.id);
    const params: Record<string, string> = {
      "mode": "payment",
      "success_url": (returnUrl || "https://branchmanager.app/portal.html") + "?paid=1",
      "cancel_url": (returnUrl || "https://branchmanager.app/portal.html") + "?canceled=1",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(totalCents),
      "line_items[0][price_data][product_data][name]": (tenant?.name || "Tree service") + " — " + unpaid.length + " invoice" + (unpaid.length === 1 ? "" : "s"),
      "line_items[0][price_data][product_data][description]": unpaid.map((i: any) => "#" + (i.invoice_number || i.id.slice(0, 6))).join(", "),
      "metadata[invoice_ids]": invoiceIdList.join(","),
      "metadata[tenant_id]": session.tenant_id,
      "metadata[client_id]": session.client_id,
      "metadata[source]": "portal-pay-all",
      "payment_intent_data[metadata][invoice_ids]": invoiceIdList.join(","),
      "payment_intent_data[metadata][tenant_id]": session.tenant_id,
    };
    const clientEmail = (unpaid[0] && unpaid[0].client_email) || "";
    if (clientEmail) params["customer_email"] = clientEmail;

    const checkout = await stripeForm("/checkout/sessions", secretKey, params);

    return new Response(JSON.stringify({
      ok: true,
      url: checkout.url,
      total_cents: totalCents,
      total: (totalCents / 100).toFixed(2),
      invoice_ids: invoiceIdList,
      invoice_count: unpaid.length,
    }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("portal-pay-all error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
