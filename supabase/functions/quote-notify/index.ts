/**
 * Branch Manager — Quote Notification (multi-tenant)
 * Supabase Edge Function
 *
 * Called by approve.html when a customer approves a quote or requests changes.
 * Sends notification email to the tenant's team address (`tenants.config.company_email`)
 * and confirmation email to the customer (if email provided).
 *
 * Tenant resolution: X-Tenant-ID header (BM client + CF Worker stamp it).
 * Falls back to SNT for backwards-compat during Phase 2 cutover.
 *
 * Deploy:
 *   supabase functions deploy quote-notify --no-verify-jwt
 *
 * Set secrets:
 *   supabase secrets set RESEND_API_KEY=re_...
 *
 * v598: white-label Slice 2 — every hardcoded SNT string replaced with
 * tenant.config-driven values via loadTenantBranding(). Caller no longer
 * needs RESEND_FROM_EMAIL secret per-tenant; from_email is read from
 * tenants.config.from_email (with from_name as display).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { resolveTenantId, loadTenantBranding, TenantBranding } from '../_shared/tenant.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Tenant-ID' };
const APP_URL = 'https://branchmanager.app/';

async function sendEmail(b: TenantBranding, to: string, _toName: string, subject: string, text: string, html?: string) {
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

function htmlWrap(b: TenantBranding, headerBg: string, headerContent: string, bodyContent: string): string {
  const wcCert = b.tenant_id === '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'
    ? ' · WC-32079 / PC-50644' : '';  // Only SNT shows its specific WC# in footer; other tenants leave it off.
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;">
  <div style="background:${headerBg};padding:24px 28px;border-radius:10px 10px 0 0;">
    ${headerContent}
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e8e8e8;border-radius:0 0 10px 10px;">
    ${bodyContent}
    <p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">${b.business_name} · ${b.address_full} · ${b.license_text}${wcCert}</p>
  </div>
</div>`;
}

function money(n: number): string {
  return '$' + (+(n || 0)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function esc(s: any): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function trunc(s: any, max: number): string {
  const v = String(s ?? '');
  return v.length > max ? v.slice(0, max) : v;
}

// Convert "(914) 391-5233" → "9143915233" for tel: hrefs
function telHref(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    return new Response('quote-notify ok', { status: 200, headers: CORS });
  }

  try {
    const tenantId = resolveTenantId(req);
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const b = await loadTenantBranding(sb, tenantId);

    const data = await req.json();

    if (data.event !== 'approved' && data.event !== 'changes_requested') {
      return new Response(JSON.stringify({ error: 'Invalid event' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const event = data.event;
    const quoteId = trunc(data.quoteId, 64);
    const quoteNumber = trunc(data.quoteNumber, 32);
    const clientName = trunc(data.clientName, 200);
    const property = trunc(data.property, 300);
    const changeNotes = trunc(data.changeNotes, 4000);
    const total = Number(data.total) || 0;
    const clientEmail = trunc(data.clientEmail, 200);

    const emailOk = !clientEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail);
    if (!emailOk) {
      return new Response(JSON.stringify({ error: 'Invalid clientEmail' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const qNum = quoteNumber || quoteId || '—';
    const cName = clientName || 'Customer';
    const firstName = (cName.split(' ')[0]) || 'there';
    const totalFmt = money(total);
    const propFmt = property || '—';

    const qNumHtml = esc(qNum);
    const cNameHtml = esc(cName);
    const firstNameHtml = esc(firstName);
    const propFmtHtml = esc(propFmt);
    const changeNotesEsc = esc(changeNotes || '(no notes provided)');

    const phoneTel = telHref(b.phone);

    if (event === 'approved') {
      const teamSubject = `✅ Quote #${qNum} approved — ${cName}`;
      const teamText = `Quote #${qNum} approved by ${cName}.

Property: ${propFmt}
Total:    ${totalFmt}

Customer approved via online portal. Create a job and schedule service.

View in Branch Manager:
${APP_URL}`;

      const teamHtml = htmlWrap(
        b,
        b.brand_color,
        `<div style="color:#fff;font-size:22px;font-weight:800;">✅ Quote Approved</div>
    <div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:4px;">${esc(b.business_name)}</div>`,
        `<h2 style="color:${b.brand_color};font-size:20px;margin:0 0 16px;">Quote #${qNumHtml} — ${cNameHtml}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
      <tr><td style="color:#888;padding:5px 0;width:110px;">Property</td><td style="font-weight:600;">${propFmtHtml}</td></tr>
      <tr><td style="color:#888;padding:5px 0;">Total</td><td style="font-weight:700;font-size:18px;color:${b.brand_color};">${totalFmt}</td></tr>
    </table>
    <div style="background:#e8f5e9;border-left:3px solid ${b.brand_color};border-radius:0 8px 8px 0;padding:14px 16px;margin:16px 0;font-size:14px;color:#333;">
      Customer approved via online portal. <strong>Create a job and schedule service.</strong>
    </div>
    <a href="${APP_URL}" style="display:inline-block;background:${b.brand_color};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Open Branch Manager</a>`
      );

      await sendEmail(b, b.email, 'Team', teamSubject, teamText, teamHtml);

      if (clientEmail) {
        const custSubject = `Your quote is confirmed — ${b.business_name}`;
        const custText = `Hi ${firstName},

Thank you for approving Quote #${qNum}. We'll be in touch shortly to confirm your scheduling.

Questions? Call or text us at ${b.phone} or reply to this email.

— ${b.owner_name}
${b.business_name}
${b.address_short} · ${b.license_text}
${b.website_display}`;

        const custHtml = htmlWrap(
          b,
          b.brand_color,
          `<div style="color:#fff;font-size:22px;font-weight:800;">🌳 ${esc(b.business_name)}</div>
    <div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:4px;">${esc(b.address_short)} · ${esc(b.phone)}</div>`,
          `<h2 style="color:${b.brand_color};font-size:20px;margin:0 0 12px;">Quote Confirmed! ✅</h2>
    <p style="color:#444;font-size:15px;line-height:1.6;">Hi ${firstNameHtml},</p>
    <p style="color:#444;font-size:15px;line-height:1.6;">Thank you for approving <strong>Quote #${qNumHtml}</strong>. We'll be in touch shortly to confirm your scheduling and any prep needed before we arrive.</p>
    <div style="background:#f0f7f0;border-left:3px solid ${b.brand_color};border-radius:0 8px 8px 0;padding:14px 16px;margin:16px 0;font-size:14px;color:#333;">
      Questions? Reply to this email or call/text us directly:
    </div>
    <a href="tel:${phoneTel}" style="display:inline-block;background:${b.brand_color};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;margin-top:4px;">📞 ${esc(b.phone)}</a>
    <p style="color:#444;font-size:14px;margin-top:20px;">You can also visit us at <a href="${b.website}" style="color:${b.brand_color};">${esc(b.website_display)}</a></p>`
        );

        await sendEmail(b, clientEmail, firstName, custSubject, custText, custHtml);
      }

    } else if (event === 'changes_requested') {
      const teamSubject = `💬 Quote #${qNum} — changes requested — ${cName}`;
      const teamText = `Quote #${qNum} — changes requested by ${cName}.

Property: ${propFmt}
Total:    ${totalFmt}

Customer notes:
${changeNotes || '(no notes provided)'}

Review and send a revised quote:
${APP_URL}`;

      const teamHtml = htmlWrap(
        b,
        '#b45309',
        `<div style="color:#fff;font-size:22px;font-weight:800;">💬 Changes Requested</div>
    <div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:4px;">${esc(b.business_name)}</div>`,
        `<h2 style="color:#92400e;font-size:20px;margin:0 0 16px;">Quote #${qNumHtml} — ${cNameHtml}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
      <tr><td style="color:#888;padding:5px 0;width:110px;">Property</td><td style="font-weight:600;">${propFmtHtml}</td></tr>
      <tr><td style="color:#888;padding:5px 0;">Total</td><td style="font-weight:700;font-size:18px;color:#92400e;">${totalFmt}</td></tr>
    </table>
    <div style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:6px;">Customer Notes</div>
    <div style="background:#fff7ed;border-left:3px solid #b45309;border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:16px;font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap;">${changeNotesEsc}</div>
    <div style="font-size:14px;color:#555;margin-bottom:16px;">Review and send a revised quote.</div>
    <a href="${APP_URL}" style="display:inline-block;background:#b45309;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Open Branch Manager</a>`
      );

      await sendEmail(b, b.email, 'Team', teamSubject, teamText, teamHtml);

      if (clientEmail) {
        const custSubject = `We got your feedback — ${b.business_name}`;
        const custText = `Hi ${firstName},

Thanks for your feedback on Quote #${qNum}. We'll review your request and send a revised quote soon.

Questions? Call or text us at ${b.phone} or reply to this email.

— ${b.owner_name}
${b.business_name}
${b.address_short} · ${b.license_text}
${b.website_display}`;

        const custHtml = htmlWrap(
          b,
          b.brand_color,
          `<div style="color:#fff;font-size:22px;font-weight:800;">🌳 ${esc(b.business_name)}</div>
    <div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:4px;">${esc(b.address_short)} · ${esc(b.phone)}</div>`,
          `<h2 style="color:${b.brand_color};font-size:20px;margin:0 0 12px;">Feedback Received 💬</h2>
    <p style="color:#444;font-size:15px;line-height:1.6;">Hi ${firstNameHtml},</p>
    <p style="color:#444;font-size:15px;line-height:1.6;">Thanks for your feedback on <strong>Quote #${qNumHtml}</strong>. We'll review your request and send a revised quote soon.</p>
    <div style="background:#f0f7f0;border-left:3px solid ${b.brand_color};border-radius:0 8px 8px 0;padding:14px 16px;margin:16px 0;font-size:14px;color:#333;">
      Questions or anything to add? Reply to this email or call/text us:
    </div>
    <a href="tel:${phoneTel}" style="display:inline-block;background:${b.brand_color};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;margin-top:4px;">📞 ${esc(b.phone)}</a>
    <p style="color:#444;font-size:14px;margin-top:20px;">You can also visit us at <a href="${b.website}" style="color:${b.brand_color};">${esc(b.website_display)}</a></p>`
        );

        await sendEmail(b, clientEmail, firstName, custSubject, custText, custHtml);
      }
    }

    return new Response(JSON.stringify({ ok: true, tenant: b.tenant_id }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('quote-notify error:', err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
