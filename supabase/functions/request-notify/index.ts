/**
 * Branch Manager — New Request Notification (multi-tenant)
 * Supabase Edge Function
 *
 * Called by book.html after a customer submits a service request.
 * Sends:
 *   1. SMS alert to the tenant's owner phone (tenants.config.sms_from_number)
 *   2. Email notification to the tenant's company_email
 *   3. Confirmation email to customer (if email provided)
 *
 * Tenant resolution: X-Tenant-ID header. Falls back to SNT.
 *
 * Deploy:
 *   supabase functions deploy request-notify --no-verify-jwt
 *
 * Set secrets:
 *   supabase secrets set RESEND_API_KEY=re_...
 *   supabase secrets set TWILIO_ACCOUNT_SID=AC...
 *   supabase secrets set TWILIO_AUTH_TOKEN=...
 *   supabase secrets set TWILIO_FROM=+1XXXXXXXXXX
 *
 * v598: white-label Slice 2 — every hardcoded SNT string now driven by
 * tenants.config via loadTenantBranding().
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { resolveTenantId, loadTenantBranding, TenantBranding } from '../_shared/tenant.ts';

const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')     ?? '';
const TWILIO_SID        = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_TOKEN      = Deno.env.get('TWILIO_AUTH_TOKEN')  ?? '';
const TWILIO_FROM       = Deno.env.get('TWILIO_FROM')        ?? '';
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')       ?? '';
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Tenant-ID' };

async function insertRequest(row: Record<string, unknown>) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.warn('Supabase env missing; skipping DB insert');
    return { ok: false, reason: 'env' };
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(row)
  });
  if (!r.ok) {
    const t = await r.text();
    console.warn('requests insert failed (' + r.status + '):', t.slice(0, 300));
    return { ok: false, reason: 'insert', status: r.status, body: t.slice(0, 300) };
  }
  const d = await r.json();
  return { ok: true, id: Array.isArray(d) ? d[0]?.id : d?.id };
}

async function sendSMS(to: string, body: string) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM || !to) return;
  const creds = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
  const form = new URLSearchParams({ From: TWILIO_FROM, To: to, Body: body });
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
}

async function sendEmail(b: TenantBranding, to: string, subject: string, text: string, html?: string) {
  if (!RESEND_API_KEY) { console.warn('RESEND_API_KEY not set; skipping email'); return; }
  const fromHeader = `${b.from_name} <${b.from_email}>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromHeader,
      to: [to],
      subject,
      text,
      html: html || undefined,
      reply_to: b.email
    })
  });
  if (!r.ok) {
    const errTxt = await r.text();
    console.warn('Resend failed (' + r.status + '):', errTxt.slice(0, 200));
  }
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function telHref(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    return new Response('request-notify ok', { status: 200, headers: CORS });
  }

  try {
    const tenantId = resolveTenantId(req);
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const b = await loadTenantBranding(sb, tenantId);

    // Parse body — support BOTH application/json (BM app, internal callers)
    // AND application/x-www-form-urlencoded / multipart/form-data so the
    // BM-rendered marketing-site contact form (a plain <form method="POST">)
    // works without JS. Browsers default to urlencoded for HTML form submits.
    let data: Record<string, any> = {};
    const ct = (req.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      data = await req.json();
    } else if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
      const fd = await req.formData();
      fd.forEach((v, k) => { data[k] = typeof v === 'string' ? v : (v as File).name; });
    } else {
      // Best-effort: try JSON, then urlencoded text
      const raw = await req.text();
      try { data = JSON.parse(raw); }
      catch { try { data = Object.fromEntries(new URLSearchParams(raw)); } catch { data = {}; } }
    }
    // Marketing-site form uses 'description' + 'property'; keep legacy
    // 'service' / 'details' / 'address' working for older callers.
    const { name, phone, email, source } = data;
    const address = data.address || data.property || '';
    const service = data.service || '';
    const details = data.details || data.description || '';

    const nameClean = (name || '').toString().trim();
    const phoneDigits = (phone || '').toString().replace(/\D/g, '');
    const emailClean = (email || '').toString().trim();
    const hasName = nameClean.length >= 2 && /[a-z]/i.test(nameClean);
    const hasContact = phoneDigits.length >= 10 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean);
    if (!hasName || !hasContact) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing or invalid name/contact' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    const firstName = nameClean.split(' ')[0] || 'Someone';
    const phoneTel = telHref(b.phone);

    // SMOKE-TEST GUARD — when the magic marker `_BM_SMOKE_TEST_` appears in
    // any free-text field, return { ok:true, skipped:true } WITHOUT inserting
    // a row, sending SMS, or sending emails. Lets developers (and Claude)
    // exercise the live edge fn end-to-end without spamming the owner's phone
    // or polluting the requests table. Marker matched anywhere in name,
    // details, address, or service; case-insensitive.
    const SMOKE_MARKER = /_BM_SMOKE_TEST_/i;
    if (SMOKE_MARKER.test(nameClean) || SMOKE_MARKER.test(details) ||
        SMOKE_MARKER.test(address)   || SMOKE_MARKER.test(service)) {
      return new Response(JSON.stringify({
        ok: true,
        skipped: 'smoke-test marker detected',
        tenant: tenantId
      }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    // 0. Persist to `requests` table FIRST.
    const nowIso = new Date().toISOString();
    const insertResult = await insertRequest({
      client_name: name || 'Unknown',
      client_phone: phone || null,
      phone: phone || null,
      email: email || null,
      property: address || null,
      title: service || 'Service request',
      notes: details || null,
      source: source || 'Website form',
      status: 'new',
      priority: 'normal',
      tenant_id: tenantId,
      created_at: nowIso,
      updated_at: nowIso
    });

    // 1. SMS to tenant owner
    const smsBody = `🌳 New request!\n${name || '—'} · ${service || 'Tree service'}\n📍 ${address || '—'}\n📞 ${phone || '—'}\nOpen BM: branchmanager.app/`;
    if (b.sms_from_number) await sendSMS(b.sms_from_number, smsBody);

    // 2. Email alert to team
    const teamSubject = `🌳 New request — ${service || 'Service'} — ${name}`;
    const teamBody = `New service request submitted via website.\n\nName:    ${name || '—'}\nPhone:   ${phone || '—'}\nEmail:   ${email || '—'}\nAddress: ${address || '—'}\nService: ${service || '—'}\nDetails: ${details || '—'}\n\nView in Branch Manager:\nhttps://branchmanager.app/`;
    await sendEmail(b, b.email, teamSubject, teamBody);

    // 3. Confirmation email to customer
    if (email) {
      const custSubject = `We received your request — ${b.business_name}`;
      const custText = `Hi ${firstName},\n\nThanks for reaching out! We received your request for ${service || 'service'} at ${address || 'your property'}.\n\nWe typically respond within 2 hours during business hours. We'll call or text you at ${phone || 'the number you provided'} to set up a free estimate.\n\nQuestions? Reply to this email or call/text ${b.phone}.\n\n— ${b.owner_name}\n${b.business_name}\n${b.address_short} · ${b.license_text}\n${b.website_display}`;

      const custHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;">
  <div style="background:${b.brand_color};padding:24px 28px;border-radius:10px 10px 0 0;">
    <div style="color:#fff;font-size:22px;font-weight:800;">🌳 ${esc(b.business_name)}</div>
    <div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:4px;">${esc(b.address_short)} · ${esc(b.phone)}</div>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e8e8e8;border-radius:0 0 10px 10px;">
    <h2 style="color:${b.brand_color};font-size:20px;margin:0 0 12px;">Request Received! ✅</h2>
    <p style="color:#444;font-size:15px;line-height:1.6;">Hi ${esc(firstName)},</p>
    <p style="color:#444;font-size:15px;line-height:1.6;">Thanks for reaching out! We got your request for <strong>${esc(service || 'service')}</strong> at <strong>${esc(address || 'your property')}</strong>.</p>
    <div style="background:#f0f7f0;border-left:3px solid ${b.brand_color};border-radius:0 8px 8px 0;padding:14px 16px;margin:16px 0;font-size:14px;color:#333;">
      We typically respond within <strong>2 hours</strong> during business hours.<br>
      We'll reach out at <strong>${esc(phone || 'the number you provided')}</strong> to schedule your free estimate.
    </div>
    <p style="color:#444;font-size:15px;line-height:1.6;">Questions? Reply to this email or call/text us directly:</p>
    <a href="tel:${phoneTel}" style="display:inline-block;background:${b.brand_color};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;margin-top:4px;">📞 ${esc(b.phone)}</a>
    <p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">${esc(b.business_name)} · ${esc(b.address_short)} · ${esc(b.license_text)}</p>
  </div>
</div>`;

      await sendEmail(b, email, custSubject, custText, custHtml);
    }

    return new Response(JSON.stringify({ ok: true, tenant: tenantId, inserted: insertResult }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('request-notify error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }
});
