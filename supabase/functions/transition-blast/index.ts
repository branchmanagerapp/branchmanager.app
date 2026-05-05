// Branch Manager — One-time customer transition blast
// Sends a "we've moved to a new portal" email to every active client with a
// valid email address. Personalized with first name.
//
// SAFETY: defaults to dry_run mode. Caller must explicitly pass {dry_run:false}
// to actually send. Returns full report (attempted, sent, errors).
//
// Deploy:
//   supabase functions deploy transition-blast --no-verify-jwt
//
// Dry run (preview):
//   curl -X POST https://ltpivkqahvplapyagljt.supabase.co/functions/v1/transition-blast \
//     -H "Content-Type: application/json" -d '{"dry_run": true}'
//
// Real send:
//   curl -X POST https://ltpivkqahvplapyagljt.supabase.co/functions/v1/transition-blast \
//     -H "Content-Type: application/json" -d '{"dry_run": false, "confirm": "send-it"}'
//
// The `confirm: "send-it"` gate is a second seatbelt so a stray request
// can't fire 285 emails. Both flags must be set to actually send.


// NOTE: when un-paused, must call resolveTenantId(req) + loadTenantBranding(sb, id)
// at top of serve() and bind result to a `BRANDING` variable so the inline
// templates below resolve. Currently paused per MEMORY.md (Basquali incident).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { resolveTenantId } from '../_shared/tenant.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };

// Owner-only gate. Verifies the caller's Supabase Auth JWT and confirms
// either (a) email is in the hardcoded owner whitelist OR (b) team_members
// row exists with role in (owner, admin). Stops the previous open-relay
// behavior where `confirm:"send-it"` (literal string in source comments)
// was the only gate. Caller must include `Authorization: Bearer <jwt>`
// where jwt is the supabase session access_token.
const OWNER_EMAILS = (Deno.env.get('OWNER_EMAILS_OVERRIDE')?.split(',') ?? ['info@${BRANDING.website_display}', 'doug@${BRANDING.website_display}']);
async function requireOwner(req: Request): Promise<{ ok: true; userId: string; email: string } | { ok: false; status: number; error: string }> {
  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return { ok: false, status: 401, error: 'Missing Authorization Bearer token' };
  const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + jwt }
  });
  if (!ur.ok) return { ok: false, status: 401, error: 'Invalid or expired session' };
  const user = await ur.json();
  if (!user || !user.id) return { ok: false, status: 401, error: 'Invalid session payload' };
  const email = (user.email || '').toLowerCase();
  if (OWNER_EMAILS.indexOf(email) !== -1) return { ok: true, userId: user.id, email };
  // Fallback: check team_members for owner/admin role
  const tmRes = await fetch(
    `${SUPABASE_URL}/rest/v1/team_members?auth_id=eq.${user.id}&role=in.(owner,admin)&select=id&limit=1`,
    { headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY } }
  );
  if (tmRes.ok) {
    const mems = await tmRes.json();
    if (mems && mems.length) return { ok: true, userId: user.id, email };
  }
  return { ok: false, status: 403, error: 'Not an owner/admin' };
}

function buildEmail(firstName: string) {
  const text = `Hi ${firstName},

Just a quick note from us — we've moved to a new client portal at:

https://branchmanager.app/

Your history — past quotes, invoices, appointments, and property photos — is already there. Future quotes and invoices will come from this address and link you to the new portal directly.

Older emails with "clienthub.getjobber.com" links will still work for a short transition period, but please use branchmanager.app going forward.

To request new work, you can still call or text (914) 391-5233, or use the website form at:
https://branchmanager.app/book.html

Thanks for your continued trust.

— ${BRANDING.owner_name}
${BRANDING.business_name}
${BRANDING.phone}
${BRANDING.website_display}`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#222;">
  <div style="background:#1a3c12;padding:24px 28px;border-radius:10px 10px 0 0;">
    <div style="color:#fff;font-size:20px;font-weight:800;">${BRANDING.business_name}</div>
    <div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:4px;">Peekskill, NY · (914) 391-5233</div>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e8e8e8;border-radius:0 0 10px 10px;line-height:1.6;font-size:15px;">
    <p>Hi ${firstName},</p>
    <p>Just a quick note from Doug — we've <strong>moved to a new client portal</strong>:</p>
    <p style="text-align:center;margin:18px 0;">
      <a href="https://branchmanager.app/" style="display:inline-block;background:#1a3c12;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Open my portal</a>
    </p>
    <p>Your history — past quotes, invoices, appointments, and property photos — is already there. Future quotes and invoices will come from this address and link you in directly.</p>
    <p>Older emails with <code>clienthub.getjobber.com</code> links will still work for a short transition period, but please use the new portal going forward.</p>
    <p>To request new work, you can still call or text us at <a href="tel:9143915233" style="color:#1a3c12;font-weight:600;">(914) 391-5233</a>, or use the <a href="https://branchmanager.app/book.html" style="color:#1a3c12;">website form</a>.</p>
    <p>Thanks for your continued trust.</p>
    <p style="margin-top:20px;">— ${BRANDING.owner_name}<br>${BRANDING.business_name}</p>
    <p style="font-size:11px;color:#999;border-top:1px solid #eee;padding-top:14px;margin-top:24px;">Licensed &amp; Insured · WC-32079 / PC-50644</p>
  </div>
</div>`;

  return { text, html };
}

async function sendOne(to: string, firstName: string) {
  const { text, html } = buildEmail(firstName);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // RESEND_FROM_EMAIL secret to flip post-Resend-verification:
      //   supabase secrets set RESEND_FROM_EMAIL="Second Nature Tree <info@${BRANDING.website_display}>"
      from: Deno.env.get('RESEND_FROM_EMAIL') ?? `${BRANDING.from_name} <${BRANDING.from_email}>`,
      to: [to],
      subject: `A quick heads-up — ${BRANDING.business_short_name} has a new client portal`,
      text,
      html,
      reply_to: 'info@${BRANDING.website_display}'
    })
  });
  if (r.ok) return { ok: true, id: (await r.json()).id };
  return { ok: false, status: r.status, error: (await r.text()).slice(0, 200) };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body, null, 2), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' }
  });

  try {
    const gate = await requireOwner(req);
    if (!gate.ok) return json(gate.status, { ok: false, error: gate.error });

    const body = await req.json().catch(() => ({}));
    const dry  = body?.dry_run !== false;
    const confirmed = body?.confirm === 'send-it';

    if (!RESEND_API_KEY || !SUPABASE_URL || !SERVICE_KEY) {
      return json(500, { ok: false, error: 'Missing env (RESEND_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' });
    }
    if (!dry && !confirmed) {
      return json(400, { ok: false, error: 'To send for real, pass both {dry_run:false, confirm:"send-it"}' });
    }

    // Phase 2 — resolve tenant from caller's X-Tenant-ID header (SNT fallback)
    const TENANT_ID = resolveTenantId(req);

    // Pull eligible clients — has email, not archived, current tenant
    const r = await fetch(`${SUPABASE_URL}/rest/v1/clients?select=id,name,first_name,email,archived&tenant_id=eq.${TENANT_ID}&email=neq.&archived=is.false&limit=1000`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    if (!r.ok) return json(500, { ok: false, error: 'clients fetch ' + r.status });
    const clients = (await r.json()) as Array<{ id: string; name?: string; first_name?: string; email?: string }>;

    // Validate + dedupe by email
    const seen = new Set<string>();
    const eligible = clients
      .filter(c => c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email!))
      .filter(c => { const k = c.email!.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .map(c => ({
        id: c.id,
        email: c.email!,
        firstName: (c.first_name || (c.name || '').split(' ')[0] || 'there').trim()
      }));

    if (dry) {
      return json(200, {
        ok: true,
        dry_run: true,
        eligible_count: eligible.length,
        first_3_previews: eligible.slice(0, 3).map(e => ({
          to: e.email,
          subject: `A quick heads-up — ${BRANDING.business_short_name} has a new client portal`,
          first_line: `Hi ${e.firstName},`
        })),
        next_step: 'Re-call with {dry_run:false, confirm:"send-it"} to actually send.'
      });
    }

    // Real send — sequential with a 250ms gap to stay polite to Resend's rate limit
    const sent: string[] = [];
    const errs: Array<{ email: string; err: string }> = [];
    for (const c of eligible) {
      const res = await sendOne(c.email, c.firstName);
      if (res.ok) sent.push(c.email);
      else errs.push({ email: c.email, err: `${res.status || ''} ${res.error || ''}`.trim() });
      await new Promise(r => setTimeout(r, 250));
    }

    return json(200, {
      ok: true,
      dry_run: false,
      attempted: eligible.length,
      sent: sent.length,
      failed: errs.length,
      errors: errs.slice(0, 20)
    });
  } catch (e) {
    return json(500, { ok: false, error: String((e as Error).message || e) });
  }
});
