/**
 * Branch Manager — Marketing Draft Approve / Reject
 *
 * Two flows:
 *   A) GET  /marketing-approve?t=TOKEN&id=DRAFT_ID&action=approve|reject
 *      Single-click from email — returns an HTML confirmation page.
 *   B) POST /marketing-approve  (JSON: { token, ids:[uuid...], action })
 *      Bulk path used by approvals.html.
 *
 * On approve: marks status='approved' AND immediately sends the customer
 * email via Resend. Logs to communications. On reject: marks status='rejected'.
 *
 * Auth: HMAC-signed token from _shared/approve-token.ts. The token binds the
 * action to a specific tenant_id with a 24h expiry. No customer email is
 * ever sent without a valid token.
 *
 * Deploy: supabase functions deploy marketing-approve --no-verify-jwt
 * Secrets: MARKETING_APPROVE_SECRET (random 32+ bytes), RESEND_API_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { verifyApproveToken } from '../_shared/approve-token.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

type Action = 'approve' | 'reject';

async function loadTenantBranding(tenantId: string) {
  const { data } = await sb.from('tenants').select('id, name, owner_email, config').eq('id', tenantId).maybeSingle();
  return data || null;
}

async function sendOne(draft: any, fromEmail: string): Promise<{ ok: boolean; error?: string; resend_id?: string }> {
  if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY not set' };
  if (!draft.to_email) return { ok: false, error: 'draft has no to_email' };

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromEmail,
      to: [draft.to_email],
      subject: draft.subject || '(no subject)',
      text: draft.body_text || '',
      html: draft.body_html || undefined
    })
  });
  const txt = await r.text();
  let parsed: any = null; try { parsed = JSON.parse(txt); } catch { /* */ }
  if (!r.ok) return { ok: false, error: parsed?.message || txt || `HTTP ${r.status}` };
  return { ok: true, resend_id: parsed?.id };
}

async function actOnDraft(tenantId: string, draftId: string, action: Action): Promise<{ id: string; ok: boolean; error?: string }> {
  // Fetch draft
  const { data: draft, error: dErr } = await sb
    .from('marketing_drafts')
    .select('*')
    .eq('id', draftId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (dErr) return { id: draftId, ok: false, error: dErr.message };
  if (!draft) return { id: draftId, ok: false, error: 'not found' };
  if (draft.status !== 'pending') return { id: draftId, ok: false, error: `already ${draft.status}` };

  if (action === 'reject') {
    const { error } = await sb.from('marketing_drafts').update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_reason: 'user-rejected'
    }).eq('id', draftId).eq('tenant_id', tenantId);
    return { id: draftId, ok: !error, error: error?.message };
  }

  // approve → send via Resend
  const tenant = await loadTenantBranding(tenantId);
  const fromEmail = tenant?.config?.from_email
    ? `${tenant.config.from_name || tenant.name} <${tenant.config.from_email}>`
    : `${tenant?.name || 'Branch Manager'} <onboarding@resend.dev>`;

  const sendResult = await sendOne(draft, fromEmail);
  if (!sendResult.ok) {
    // Mark approved-but-failed so it doesn't loop
    await sb.from('marketing_drafts').update({
      status: 'failed',
      approved_at: new Date().toISOString(),
      approved_by: 'email-link',
      rejected_reason: sendResult.error || 'send failed'
    }).eq('id', draftId).eq('tenant_id', tenantId);
    return { id: draftId, ok: false, error: sendResult.error };
  }

  // Mark sent + log to communications
  await sb.from('marketing_drafts').update({
    status: 'sent',
    approved_at: new Date().toISOString(),
    approved_by: 'email-link',
    sent_at: new Date().toISOString()
  }).eq('id', draftId).eq('tenant_id', tenantId);

  await sb.from('communications').insert({
    tenant_id: tenantId,
    client_id: draft.client_id || null,
    type: 'email', direction: 'outbound', channel: 'email',
    status: 'sent',
    body: draft.subject,
    notes: draft.body_text,
    metadata: {
      kind: 'marketing_approved_send',
      trigger: draft.trigger,
      to: draft.to_email,
      resend_id: sendResult.resend_id || null,
      draft_id: draftId
    }
  });

  return { id: draftId, ok: true };
}

function htmlPage(title: string, body: string): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:520px;margin:60px auto;padding:0 24px;color:#1c1c1c;}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:32px 28px;box-shadow:0 4px 12px rgba(0,0,0,.04);}
h1{font-size:22px;margin:0 0 12px;}p{font-size:15px;line-height:1.55;color:#4b5563;margin:8px 0;}
.ok{color:#15803d;}.err{color:#b91c1c;}
a.btn{display:inline-block;margin-top:18px;background:#1a3c12;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;}
</style></head><body><div class="card">${body}</div></body></html>`;
  return new Response(html, { status: 200, headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);

  // GET single-click flow
  if (req.method === 'GET') {
    const token = url.searchParams.get('t') || '';
    const id = url.searchParams.get('id') || '';
    const action = (url.searchParams.get('action') || '').toLowerCase() as Action;

    const verified = await verifyApproveToken(token);
    if (!verified) return htmlPage('Link expired', '<h1>Link expired</h1><p class="err">This approval link has expired or is invalid. Open the latest daily email and try again.</p>');
    if (!id || (action !== 'approve' && action !== 'reject')) {
      return htmlPage('Invalid request', '<h1>Invalid request</h1><p class="err">Missing draft id or action.</p>');
    }

    const result = await actOnDraft(verified.tenantId, id, action);
    if (result.ok) {
      const verb = action === 'approve' ? 'approved &amp; sent' : 'rejected';
      return htmlPage('Done', `<h1 class="ok">✓ Draft ${verb}</h1><p>The draft was ${verb} successfully.</p><a class="btn" href="https://branchmanager.app/approvals.html?t=${encodeURIComponent(token)}">Review remaining drafts →</a>`);
    } else {
      return htmlPage('Failed', `<h1 class="err">Couldn\'t ${action}</h1><p>${result.error || 'Unknown error.'}</p>`);
    }
  }

  // POST bulk flow
  if (req.method === 'POST') {
    let body: any = {};
    try { body = await req.json(); } catch { /* */ }
    const token = String(body.token || '');
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    const action = String(body.action || '').toLowerCase() as Action;

    const verified = await verifyApproveToken(token);
    if (!verified) {
      return new Response(JSON.stringify({ error: 'invalid or expired token' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (!ids.length || (action !== 'approve' && action !== 'reject')) {
      return new Response(JSON.stringify({ error: 'ids[] and action required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const MAX = 50;
    const slice = ids.slice(0, MAX);
    const results = [];
    for (const id of slice) {
      results.push(await actOnDraft(verified.tenantId, id, action));
    }
    return new Response(JSON.stringify({
      ok: true,
      action,
      attempted: slice.length,
      succeeded: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ error: 'GET or POST only' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } });
});
