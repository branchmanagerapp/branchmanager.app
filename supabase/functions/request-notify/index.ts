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

const PHOTO_BUCKET = 'job-photos';
function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; contentType: string } | null {
  try {
    let b64 = dataUrl; let contentType = 'image/jpeg';
    const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
    if (m) { contentType = m[1]; b64 = m[2]; } else if (dataUrl.includes(',')) { b64 = dataUrl.split(',')[1]; }
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, contentType };
  } catch { return null; }
}

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
    const images = Array.isArray(data.images) ? data.images.slice(0, 10) : [];

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

    // Upload any customer-attached photos to the shared job-photos bucket and
    // tag them to this request (record_type 'request'), so they ride along with
    // the request and land in the team notification email below.
    const photoUrls: Array<{ url: string; name: string }> = [];
    const reqId = (insertResult as any)?.id;
    if (images.length && reqId && SUPABASE_URL && SERVICE_ROLE_KEY) {
      for (let i = 0; i < images.length; i++) {
        const img = images[i] || {};
        const dec = img.dataUrl ? decodeDataUrl(img.dataUrl) : null;
        if (!dec || dec.bytes.length > 12 * 1024 * 1024) continue;
        const ext = dec.contentType === 'image/png' ? 'png' : dec.contentType === 'image/webp' ? 'webp' : dec.contentType === 'image/heic' ? 'heic' : 'jpg';
        const safe = (img.name || ('photo.' + ext)).replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^.]+$/, '') + '.' + ext;
        const path = `request/${reqId}/${Date.now()}_${i}_${safe}`;
        const up = await sb.storage.from(PHOTO_BUCKET).upload(path, dec.bytes, { contentType: dec.contentType, upsert: false });
        if (up.error) { console.warn('request-notify: photo upload failed:', up.error.message); continue; }
        const { data: urlData } = sb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
        photoUrls.push({ url: urlData.publicUrl, name: img.name || safe });
        await sb.from('photos').insert({ record_type: 'request', record_id: reqId, url: urlData.publicUrl, storage_path: path, name: img.name || safe, label: '', taken_at: new Date().toISOString(), taken_by: 'Customer', tenant_id: tenantId });
      }
      if (photoUrls.length) { try { await sb.from('requests').update({ assessment_photos: photoUrls }).eq('id', reqId); } catch (_e) { /* column optional */ } }
    }

    // 1. SMS to tenant owner(s). White-label: each tenant configures
    // their own alert phones in BM Settings → tenants.config.
    // owner_alert_phones (array, multi-recipient — Doug + Catherine,
    // partner + dispatch, etc.). Resolution order: OWNER_ALERT_PHONE
    // env (rare; only as a global override) → tenants.config.
    // owner_alert_phones (array, preferred) → tenants.config.
    // owner_alert_phone (singular, back-compat) → legacy sms_from_number.
    // Then: normalize → dedupe → filter empty → filter same-as-DIALPAD_
    // FROM_NUMBER (carriers drop same-number SMS, found 2026-05-19).
    const dialpadFromDigits = (Deno.env.get('DIALPAD_FROM_NUMBER') || '').replace(/\D/g, '');
    const envPhone = (Deno.env.get('OWNER_ALERT_PHONE') || '').trim();
    const cfgPhones: any = (b as any).owner_alert_phones;
    const phonesRaw: string[] = [];
    if (envPhone) phonesRaw.push(envPhone);
    if (Array.isArray(cfgPhones)) for (const p of cfgPhones) { if (p) phonesRaw.push(String(p)); }
    else if (typeof cfgPhones === 'string' && cfgPhones) for (const p of cfgPhones.split(/[\n,]+/)) phonesRaw.push(p);
    if ((b as any).owner_alert_phone) phonesRaw.push(String((b as any).owner_alert_phone));
    if (b.sms_from_number) phonesRaw.push(b.sms_from_number);
    const phones = Array.from(new Set(
      phonesRaw.map((p) => p.trim()).filter(Boolean).map((p) => {
        const d = p.replace(/\D/g, '');
        if (d.length === 10) return '+1' + d;
        if (d.length === 11 && d[0] === '1') return '+' + d;
        return d ? '+' + d : '';
      }).filter(Boolean).filter((p) => !dialpadFromDigits || p.replace(/\D/g, '') !== dialpadFromDigits)
    ));
    const smsBody = `🌳 New request!\n${name || '—'} · ${service || 'Tree service'}\n📍 ${address || '—'}\n📞 ${phone || '—'}\nOpen BM: branchmanager.app/`;
    if (!phones.length) {
      console.warn('request-notify: no eligible alert phones (all empty or matched DIALPAD_FROM_NUMBER) — SMS skipped. Set tenants.config.owner_alert_phones in BM Settings.');
    } else {
      for (const to of phones) {
        try { await sendSMS(to, smsBody); }
        catch (e) { console.warn('request-notify: sendSMS failed for', to, e); }
      }
      console.log('request-notify: SMS sent to', phones.length, 'recipient(s):', phones.join(','));
    }

    // 2. Email alert to team
    const teamSubject = `🌳 New request — ${service || 'Service'} — ${name}`;
    const teamBody = `New service request submitted via website.\n\nName:    ${name || '—'}\nPhone:   ${phone || '—'}\nEmail:   ${email || '—'}\nAddress: ${address || '—'}\nService: ${service || '—'}\nDetails: ${details || '—'}\n\nView in Branch Manager:\nhttps://branchmanager.app/`;
    const teamPhotoText = photoUrls.length ? ('\n\nPhotos (' + photoUrls.length + '):\n' + photoUrls.map(function (p) { return '  ' + p.url; }).join('\n')) : '';
    const teamHtml = photoUrls.length
      ? ('<div style="font-family:-apple-system,sans-serif;max-width:580px;"><pre style="font:14px/1.5 -apple-system,Arial;white-space:pre-wrap;color:#333;">' + esc(teamBody) + '</pre>'
        + '<p style="font-size:13px;color:#888;margin:12px 0 6px;">\uD83D\uDCF7 ' + photoUrls.length + ' customer photo' + (photoUrls.length > 1 ? 's' : '') + ':</p><div>'
        + photoUrls.map(function (p) { return '<a href="' + esc(p.url) + '"><img src="' + esc(p.url) + '" style="width:120px;height:120px;object-fit:cover;border-radius:8px;margin:0 8px 8px 0;border:1px solid #ddd;"></a>'; }).join('')
        + '</div></div>')
      : undefined;
    await sendEmail(b, b.email, teamSubject, teamBody + teamPhotoText, teamHtml);

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
