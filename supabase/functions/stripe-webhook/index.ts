/**
 * Branch Manager — Stripe Webhook Handler
 * Supabase Edge Function
 *
 * Deploy:
 *   supabase functions deploy stripe-webhook --no-verify-jwt
 *
 * Set secrets:
 *   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
 *   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
 *
 * Stripe webhook endpoint:
 *   https://ltpivkqahvplapyagljt.supabase.co/functions/v1/stripe-webhook
 *
 * Events to enable in Stripe:
 *   - payment_intent.succeeded
 *   - checkout.session.completed
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SNT_TENANT_ID_CONST } from '../_shared/tenant.ts';

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://ltpivkqahvplapyagljt.supabase.co';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeEq(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function money(n: number): string {
  return '$' + (Math.round((n || 0) * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ── Receipt email HTML (mirrors invoices.js _sendReceiptEmail) ───────────────

function buildReceiptHtml(params: {
  firstName: string;
  invoiceNumber: number | string;
  total: number;
  paidDate: string;
  lineItems: Array<{ service?: string; description?: string; qty?: number; rate?: number; amount?: number }>;
  coName: string;
  coPhone: string;
  coWebsite: string;
  coLogo: string;
  googleReviewUrl: string;
  facebookUrl: string;
  instagramUrl: string;
}): string {
  const { firstName, invoiceNumber, total, paidDate, lineItems,
          coName, coPhone, coWebsite, coLogo,
          googleReviewUrl, facebookUrl, instagramUrl } = params;

  const totalStr = money(total);

  // Line item rows
  let liRows = '';
  if (lineItems && lineItems.length) {
    lineItems.forEach((item, i) => {
      const amt = item.amount ?? ((item.qty ?? 1) * (item.rate ?? 0));
      liRows += `<tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};">`
        + `<td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;color:#374151;font-size:13px;">${esc(item.service || item.description || 'Service')}</td>`
        + `<td style="padding:8px 12px;text-align:right;border-bottom:1px solid #f3f4f6;font-weight:600;color:#374151;font-size:13px;">${money(amt)}</td>`
        + '</tr>';
    });
  }

  // Social links
  const socialLinks: string[] = [];
  if (googleReviewUrl) socialLinks.push(`<a href="${googleReviewUrl}" style="color:#1a3c12;text-decoration:none;font-weight:700;font-size:12px;">⭐ Leave a Review</a>`);
  if (facebookUrl)     socialLinks.push(`<a href="${facebookUrl}" style="color:#1877f2;text-decoration:none;font-size:12px;">&#9633; Facebook</a>`);
  if (instagramUrl)    socialLinks.push(`<a href="${instagramUrl}" style="color:#e1306c;text-decoration:none;font-size:12px;">&#9650; Instagram</a>`);

  const logoBlock = coLogo
    ? `<img src="${coLogo}" style="width:40px;height:40px;object-fit:contain;border-radius:8px;display:block;margin-bottom:8px;" alt="">`
    : `<div style="background:rgba(255,255,255,.2);border-radius:8px;width:40px;height:40px;text-align:center;line-height:40px;font-size:20px;margin-bottom:8px;">🌳</div>`;

  return `<div style="background:#f5f6f8;padding:24px 0;">`
    + `<table style="max-width:560px;margin:0 auto;border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">`
    // Header
    + `<tr style="background:#059669;">`
    + `<td style="padding:20px 26px;width:55%;vertical-align:middle;">`
    + logoBlock
    + `<div style="font-size:15px;font-weight:800;color:#fff;">${esc(coName)}</div>`
    + (coPhone ? `<div style="font-size:12px;color:rgba(255,255,255,.75);margin-top:2px;">${esc(coPhone)}</div>` : '')
    + `</td>`
    + `<td style="padding:20px 26px;text-align:right;vertical-align:middle;background:#047857;">`
    + `<div style="font-size:11px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Receipt</div>`
    + `<div style="font-size:18px;font-weight:900;color:#fff;">#${esc(invoiceNumber)}</div>`
    + `<div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-1px;margin:6px 0 4px;">${totalStr}</div>`
    + `<div style="font-size:11px;color:rgba(255,255,255,.8);background:rgba(255,255,255,.15);padding:3px 10px;border-radius:20px;display:inline-block;">✓ PAID IN FULL</div>`
    + `</td>`
    + `</tr>`
    // Thank you
    + `<tr style="background:#fff;">`
    + `<td colspan="2" style="padding:20px 26px;">`
    + `<p style="font-size:15px;font-weight:700;color:#059669;margin:0 0 8px;">Thank you, ${esc(firstName)}! 🎉</p>`
    + `<p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0;">Your payment of <strong>${totalStr}</strong> was received on ${esc(paidDate)}. Your account is paid in full. This email is your receipt.</p>`
    + `</td>`
    + `</tr>`
    // Line items
    + (liRows ? `<tr style="background:#fff;"><td colspan="2" style="padding:0 26px 8px;">`
      + `<table style="width:100%;border-collapse:collapse;">`
      + `<tr style="background:#374151;"><th style="padding:7px 12px;text-align:left;font-size:11px;color:#fff;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">Service</th><th style="padding:7px 12px;text-align:right;font-size:11px;color:#fff;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">Amount</th></tr>`
      + liRows
      + `<tr style="background:#f0fdf4;"><td style="padding:9px 12px;font-weight:700;font-size:14px;color:#166534;">Total Paid</td><td style="padding:9px 12px;text-align:right;font-weight:900;font-size:14px;color:#166534;">${totalStr}</td></tr>`
      + `</table></td></tr>` : '')
    // Review ask
    + (googleReviewUrl ? `<tr style="background:#f0fdf4;"><td colspan="2" style="padding:16px 26px;text-align:center;border-top:1px solid #d1fae5;">`
      + `<p style="font-size:13px;color:#374151;margin:0 0 10px;">Happy with our work? It means the world to us! ⭐</p>`
      + `<a href="${googleReviewUrl}" style="display:inline-block;background:#1a3c12;color:#fff;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">⭐ Leave Us a Google Review</a>`
      + `</td></tr>` : '')
    // Footer
    + `<tr style="background:#f9fafb;"><td colspan="2" style="padding:14px 26px;border-top:1px solid #f3f4f6;">`
    + `<table style="width:100%;border-collapse:collapse;"><tr>`
    + `<td style="font-size:12px;color:#6b7280;">Questions? Call <strong>${esc(coPhone)}</strong></td>`
    + (coWebsite ? `<td style="text-align:right;font-size:12px;"><a href="${coWebsite}" style="color:#1a3c12;text-decoration:none;">${esc(coWebsite.replace(/^https?:\/\//,''))}</a></td>` : '<td></td>')
    + `</tr></table>`
    + `</td></tr>`
    // Social bar
    + (socialLinks.length ? `<tr style="background:#f9fafb;"><td colspan="2" style="padding:10px 26px 16px;border-top:1px solid #f3f4f6;text-align:center;">${socialLinks.join('<span style="color:#e5e7eb;margin:0 8px;">|</span>')}</td></tr>` : '')
    + `</table></div>`;
}

// ── Send receipt via send-email edge function ────────────────────────────────

async function sendReceipt(params: {
  toEmail: string;
  inv: Record<string, unknown>;
  coConfig: Record<string, unknown>;
}): Promise<void> {
  const { toEmail, inv, coConfig } = params;
  const firstName = (String(inv.client_name ?? '')).split(' ')[0] || 'there';
  const invoiceNumber = inv.invoice_number ?? '';
  const total = parseFloat(String(inv.total ?? 0));
  const paidDate = inv.paid_date
    ? new Date(String(inv.paid_date)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const lineItems: Array<{ service?: string; description?: string; amount?: number }> =
    Array.isArray(inv.line_items) ? inv.line_items as Array<{ service?: string; description?: string; amount?: number }> : [];

  const htmlBody = buildReceiptHtml({
    firstName,
    invoiceNumber,
    total,
    paidDate,
    lineItems,
    // SNT-default fallbacks — only fire when tenants.config is missing the field
    coName:         String(coConfig.company_name ?? 'Second Nature Tree Service'),
    coPhone:        String(coConfig.company_phone ?? '(914) 391-5233'),
    coWebsite:      String(coConfig.company_website ?? 'https://peekskilltree.com'),
    coLogo:         String(coConfig.company_logo ?? ''),
    googleReviewUrl: String(coConfig.google_review_url ?? ''),
    facebookUrl:    String(coConfig.facebook_url ?? ''),
    instagramUrl:   String(coConfig.instagram_url ?? ''),
  });

  const textBody = `Hi ${firstName},\n\nThank you for your payment of ${money(total)}! Your account is paid in full.\n\nInvoice #${invoiceNumber}\n${inv.subject ? 'Job: ' + inv.subject + '\n' : ''}Amount Paid: ${money(total)}\nDate: ${paidDate}\n\n${coConfig.google_review_url ? 'Happy with our work? We\'d love a Google review!\n' + coConfig.google_review_url + '\n\n' : ''}Thanks,\n${coConfig.owner_name ?? "Owner"}\n${coConfig.company_name ?? 'Second Nature Tree Service'}\n${coConfig.company_phone ?? '(914) 391-5233'}`;

  const subject = `Payment Receipt — Invoice #${invoiceNumber} · ${money(total)} · ${coConfig.company_name ?? 'Second Nature Tree Service'}`;

  const sendEmailUrl = `${SUPABASE_URL}/functions/v1/send-email`;
  const r = await fetch(sendEmailUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: toEmail, subject, html: htmlBody, text: textBody }),
  });

  if (r.ok) {
    console.log(`✅ Receipt sent to ${toEmail} for invoice #${invoiceNumber}`);
  } else {
    const err = await r.text().catch(() => '');
    console.error(`Receipt email failed (${r.status}): ${err.slice(0, 200)}`);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  // Verify probes (UptimeRobot, Stripe webhook setup pre-flight) get 200
  if (req.method === 'GET' || req.method === 'HEAD') {
    return new Response('stripe-webhook ok', { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const body = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  // Verify webhook signature
  let event: any;
  try {
    // Simple HMAC verification (Stripe uses SHA-256)
    const encoder = new TextEncoder();
    const parts = signature.split(',');
    const timestamp = parts.find((p: string) => p.startsWith('t='))?.split('=')[1] ?? '';
    const sigHex = parts.find((p: string) => p.startsWith('v1='))?.split('=')[1] ?? '';

    // Replay protection: reject events older than 5 minutes (Stripe's standard
    // tolerance window). Without this, an attacker who captures any signed
    // payment_intent.succeeded payload can re-POST it weeks later and mark
    // arbitrary invoices paid for free.
    const ts = parseInt(timestamp, 10);
    if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) {
      console.error('Webhook timestamp stale:', timestamp);
      return new Response('Timestamp out of tolerance', { status: 401 });
    }

    const signedPayload = `${timestamp}.${body}`;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(STRIPE_WEBHOOK_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const computedSig = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (!safeEq(computedSig, sigHex)) {
      console.error('Webhook signature mismatch');
      return new Response('Signature mismatch', { status: 401 });
    }

    event = JSON.parse(body);
  } catch (err) {
    console.error('Webhook parse error:', err);
    return new Response('Bad request', { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Phase 2 — resolve tenant by matching Stripe webhook account.id against
  // tenants.config.stripe_account_id. Falls back to SNT (single source of
  // truth at top of file via SNT_TENANT_ID_CONST import).
  let TENANT_ID: string = SNT_TENANT_ID_CONST;
  try {
    const acctId = (event as { account?: string }).account || '';
    if (acctId) {
      const { data: tRow } = await supabase
        .from('tenants')
        .select('id')
        .filter('config->>stripe_account_id', 'eq', acctId)
        .limit(1);
      if (tRow && tRow.length) TENANT_ID = tRow[0].id;
    }
  } catch (_) { /* keep SNT fallback */ }

  // Fetch company config for the resolved tenant
  let coConfig: Record<string, unknown> = {};
  try {
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('config')
      .eq('id', TENANT_ID)
      .single();
    if (tenantRow?.config) coConfig = tenantRow.config as Record<string, unknown>;
  } catch (e) {
    console.warn('Could not fetch tenant config:', e);
  }

  // ── BM SaaS subscription events (Phase 1.B) ────────────────────────────
  // These events update tenants.config.subscription instead of writing to
  // the invoices table. Distinguished by metadata.product='bm_saas_subscription'
  // (set by subscription-create-checkout edge fn).
  const bmSubMetadata = (event.data.object?.metadata?.product === 'bm_saas_subscription')
    || (event.data.object?.subscription_data?.metadata?.product === 'bm_saas_subscription');
  const isSubLifecycleEvent = event.type === 'customer.subscription.created'
    || event.type === 'customer.subscription.updated'
    || event.type === 'customer.subscription.deleted';
  const isSubCheckoutComplete = event.type === 'checkout.session.completed'
    && event.data.object?.mode === 'subscription'
    && bmSubMetadata;

  if (isSubLifecycleEvent || isSubCheckoutComplete) {
    const obj = event.data.object;
    const subTenantId = String(
      obj?.metadata?.tenant_id
      || obj?.subscription_data?.metadata?.tenant_id
      || obj?.client_reference_id
      || '',
    );
    const tier = String(obj?.metadata?.tier || obj?.subscription_data?.metadata?.tier || 'crew');
    const stripeCustomerId = String(obj?.customer || '');
    const stripeSubscriptionId = String(obj?.subscription || obj?.id || '');
    const subStatus = obj?.status || (event.type === 'customer.subscription.deleted' ? 'canceled' : 'active');
    // Translate Stripe statuses to our schema
    const status = subStatus === 'canceled' ? 'canceled'
      : subStatus === 'past_due' || subStatus === 'unpaid' ? 'past_due'
      : 'active';
    const periodEnd = obj?.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : undefined;

    if (!subTenantId || !/^[0-9a-f-]{36}$/i.test(subTenantId)) {
      console.warn('BM-SaaS event missing tenant_id metadata:', event.type, event.id);
      return new Response(JSON.stringify({ received: true, skipped: 'no tenant_id in metadata' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Read current config so we don't clobber other subscription fields
    const { data: tRow } = await supabase.from('tenants').select('config').eq('id', subTenantId).maybeSingle();
    const cfg = (tRow?.config as Record<string, unknown>) || {};
    const existingSub = (cfg.subscription as Record<string, unknown>) || {};
    const newSub: Record<string, unknown> = {
      ...existingSub,
      tier,
      status,
      stripe_customer_id: stripeCustomerId || existingSub.stripe_customer_id,
      stripe_subscription_id: stripeSubscriptionId || existingSub.stripe_subscription_id,
      current_period_end: periodEnd || existingSub.current_period_end,
      updated_at: new Date().toISOString(),
    };
    cfg.subscription = newSub;

    const { error: updErr } = await supabase.from('tenants').update({ config: cfg }).eq('id', subTenantId);
    if (updErr) {
      console.error('Failed to update tenants.config.subscription:', updErr);
    } else {
      console.log(`BM-SaaS sub updated: tenant=${subTenantId} tier=${tier} status=${status}`);
    }

    return new Response(JSON.stringify({ received: true, bm_saas: true, tenant: subTenantId, tier, status }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Handle relevant events
  if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
    const session = event.data.object;
    const amountPaid = session.amount_total ?? session.amount_received ?? 0; // cents
    const clientRef = session.client_reference_id ?? ''; // e.g. "INV-377"
    const paymentIntentId = session.payment_intent ?? session.id ?? '';
    const customerEmail = session.customer_details?.email ?? session.receipt_email ?? '';

    console.log(`Payment received: ${clientRef} — $${(amountPaid/100).toFixed(2)}`);

    // Multi-invoice charge from stripe-charge edge fn — uses PaymentIntent
    // metadata.invoice_ids (UUID list) instead of session.client_reference_id.
    const metaInvoiceIds = (session.metadata && session.metadata.invoice_ids) || '';
    if (metaInvoiceIds) {
      const ids = metaInvoiceIds.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (ids.length) {
        const { data: invs, error } = await supabase
          .from('invoices')
          .select('id, invoice_number, balance, total, client_name, client_email, client_id, line_items, subject, paid_date')
          .in('id', ids);
        if (error) { console.error('Multi-invoice fetch error:', error); }
        else {
          for (const inv of (invs || [])) {
            await supabase.from('invoices').update({
              status: 'paid',
              balance: 0,
              paid_date: new Date().toISOString(),
              amount_paid: inv.total,
              payment_method: 'stripe',
              stripe_payment_id: paymentIntentId,
              updated_at: new Date().toISOString()
            }).eq('id', inv.id);
            console.log(`✅ Invoice #${inv.invoice_number} (${inv.client_name}) marked PAID via multi-invoice charge`);

            // Send receipt to client
            const toEmail = inv.client_email || customerEmail || '';
            if (toEmail) {
              const invWithDate = { ...inv, paid_date: new Date().toISOString() };
              await sendReceipt({ toEmail, inv: invWithDate as Record<string, unknown>, coConfig });
            }
          }
        }
        return new Response('OK', { status: 200 });
      }
    }

    if (clientRef && clientRef.startsWith('INV-')) {
      // Find invoice by invoice number
      const invoiceNumber = parseInt(clientRef.replace('INV-', ''));

      const { data: invoices, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, balance, total, status, client_name, client_email, client_id, line_items, subject')
        .eq('invoice_number', invoiceNumber)
        .limit(1);

      if (error) {
        console.error('Supabase query error:', error);
        return new Response('DB error', { status: 500 });
      }

      if (invoices && invoices.length > 0) {
        const inv = invoices[0];
        const amountDollars = amountPaid / 100;
        const paidAt = new Date().toISOString();

        // Update invoice as paid
        const { error: updateErr } = await supabase
          .from('invoices')
          .update({
            status: 'paid',
            balance: 0,
            paid_date: paidAt,
            amount_paid: amountDollars,
            payment_method: 'stripe',
            stripe_payment_id: paymentIntentId,
            updated_at: paidAt
          })
          .eq('id', inv.id);

        if (updateErr) {
          console.error('Invoice update error:', updateErr);
          return new Response('Update error', { status: 500 });
        }

        console.log(`✅ Invoice #${invoiceNumber} for ${inv.client_name} marked PAID — $${amountDollars.toFixed(2)}`);

        // Send receipt to client
        const toEmail = inv.client_email || customerEmail || '';
        if (toEmail) {
          await sendReceipt({
            toEmail,
            inv: { ...inv, total: amountDollars, paid_date: paidAt } as Record<string, unknown>,
            coConfig
          });
        } else {
          console.log(`No client email for invoice #${invoiceNumber} — skipping receipt`);
        }

        // Notify Doug via Resend (send-email edge fn)
        const notifyText = `Invoice #${invoiceNumber} for ${inv.client_name} was just paid online.\n\nAmount: $${amountDollars.toFixed(2)}\nMethod: Stripe / Credit Card\nEmail: ${customerEmail}\n\nThe invoice has been automatically marked as paid in Branch Manager.\n\nhttps://branchmanager.app/`;
        const notifyHtml = `<p>Invoice #${esc(invoiceNumber)} for ${esc(inv.client_name)} was just paid online.</p>`
          + `<p><strong>Amount:</strong> $${amountDollars.toFixed(2)}<br>`
          + `<strong>Method:</strong> Stripe / Credit Card<br>`
          + `<strong>Email:</strong> ${esc(customerEmail)}</p>`
          + `<p>The invoice has been automatically marked as paid in Branch Manager.</p>`
          + `<p><a href="https://branchmanager.app/">https://branchmanager.app/</a></p>`;
        await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: String(coConfig.company_email ?? 'info@peekskilltree.com'),
            subject: `💳 Payment received — Invoice #${invoiceNumber} — $${amountDollars.toFixed(2)}`,
            html: notifyHtml,
            text: notifyText
          })
        }).catch((e) => console.error('Doug notify email failed:', e));
      } else {
        // Stripe-confirmed payment that we cannot reconcile to a BM invoice.
        // Return 500 so Stripe retries (up to 3 days) — buys time to fix data.
        // Also fire an alert email to Doug so he knows immediately.
        console.error(`Invoice not found for ref: ${clientRef} — payment_intent=${paymentIntentId} amount=$${(amountPaid/100).toFixed(2)}`);
        const dashUrl = `https://dashboard.stripe.com/payments/${paymentIntentId}`;
        const alertText = `A Stripe payment succeeded but the matching BM invoice could not be found.\n\n`
          + `client_reference_id: ${clientRef}\n`
          + `Stripe ID: ${paymentIntentId}\n`
          + `Amount: $${(amountPaid/100).toFixed(2)}\n`
          + `Customer email: ${customerEmail || '(none)'}\n\n`
          + `Stripe Dashboard: ${dashUrl}\n\n`
          + `Stripe will retry this webhook for up to 3 days. Fix the invoice (create/restore it with matching invoice_number) and the next retry will mark it paid automatically.`;
        const alertHtml = `<p>A Stripe payment succeeded but the matching BM invoice could not be found.</p>`
          + `<p><strong>client_reference_id:</strong> ${esc(clientRef)}<br>`
          + `<strong>Stripe ID:</strong> ${esc(paymentIntentId)}<br>`
          + `<strong>Amount:</strong> $${(amountPaid/100).toFixed(2)}<br>`
          + `<strong>Customer email:</strong> ${esc(customerEmail || '(none)')}</p>`
          + `<p><a href="${dashUrl}">Open in Stripe Dashboard</a></p>`
          + `<p>Stripe will retry this webhook for up to 3 days. Fix the invoice (create/restore it with matching invoice_number) and the next retry will mark it paid automatically.</p>`;
        await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: String(coConfig.company_email ?? 'info@peekskilltree.com'),
            subject: `🚨 Stripe webhook: invoice not found for paid session`,
            html: alertHtml,
            text: alertText
          })
        }).catch((e) => console.error('Alert email failed:', e));
        return new Response('Invoice not found — retry', { status: 500 });
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
