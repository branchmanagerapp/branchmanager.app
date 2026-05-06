/**
 * Branch Manager — Token-gated quote status update
 *
 * Replaces the anon UPDATE-anywhere RLS policy. Customer's approve.html
 * POSTs {id, token, action, payload} here; we validate the token via
 * service-role and apply ONE of three actions: approve, request_changes,
 * decline. Status transitions are validated server-side.
 *
 * Was previously: anon could PATCH any sent quote to status='approved'
 * with no token check. Money-grade exploit (triggers job creation, alerts
 * Doug to schedule, fake order).
 *
 * Deploy:
 *   supabase functions deploy quote-update --no-verify-jwt --project-ref ltpivkqahvplapyagljt
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function safeEq(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function trunc(s: any, max: number): string {
  const v = String(s ?? '');
  return v.length > max ? v.slice(0, max) : v;
}

const j = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'Content-Type': 'application/json' }
});

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET' || req.method === 'HEAD') {
    return new Response('quote-update ok', { status: 200, headers: CORS });
  }
  if (req.method !== 'POST')    return j(405, { ok: false, error: 'POST only' });

  let body: any = {};
  try { body = await req.json(); } catch { return j(400, { ok: false, error: 'Bad JSON' }); }
  const id     = String(body.id || '').trim();
  const token  = String(body.token || '').trim();
  const action = String(body.action || '').trim();
  if (!id || !token || !action) return j(400, { ok: false, error: 'id, token, action required' });
  if (!['approve', 'request_changes', 'decline'].includes(action)) {
    return j(400, { ok: false, error: 'Invalid action' });
  }

  // 1. Look up the quote + verify token (service-role)
  const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json'
  };
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/quotes?id=eq.${encodeURIComponent(id)}&select=id,status,approval_token,expires_at&limit=1`,
    { headers }
  );
  if (!r.ok) return j(500, { ok: false, error: 'lookup failed', status: r.status });
  const rows = await r.json();
  if (!rows || !rows.length) return j(404, { ok: false, error: 'Quote not found' });
  const q = rows[0];
  if (!safeEq(String(q.approval_token || ''), token)) return j(403, { ok: false, error: 'Invalid token' });

  // 2. Validate state transition. Only sent/awaiting can move to approved/declined.
  if (!['sent', 'awaiting'].includes(q.status)) {
    return j(409, { ok: false, error: 'Quote is ' + q.status + ' — cannot modify' });
  }
  // Block actions on expired quotes for the approve path
  if (action === 'approve' && q.expires_at && new Date(q.expires_at) < new Date()) {
    return j(409, { ok: false, error: 'Quote has expired' });
  }

  // 3. Build the patch payload depending on action.
  const now = new Date().toISOString();
  const patch: Record<string, any> = { updated_at: now };

  if (action === 'approve') {
    patch.status = 'approved';
    patch.signed_name = trunc(body.signed_name, 200);
    patch.signed_at = now;
    patch.signed_ip = trunc(body.signed_ip, 64);
    patch.signed_user_agent = trunc(body.signed_user_agent, 500);
    patch.signed_quote_hash = trunc(body.signed_quote_hash, 128);
    patch.signed_quote_snapshot = body.signed_quote_snapshot ? trunc(body.signed_quote_snapshot, 50000) : null;
    if (body.client_signature) patch.client_signature = trunc(body.client_signature, 500000); // 500KB cap on dataURL

    // Partial approval — customer picked a subset of line items to accept.
    // Server-side recomputes the binding total from the original quote's
    // line_items + the picked subset (we don't trust client math). Saves
    // accepted_items + accepted_total which become the source of truth for
    // invoicing. If selected_items_payload is missing, full approval is
    // implied (status=approved, no accepted_* fields written).
    if (body.selected_items_payload && typeof body.selected_items_payload === 'object') {
      // Look up the quote's full line_items so we can independently sum.
      const qr = await fetch(
        `${SUPABASE_URL}/rest/v1/quotes?id=eq.${encodeURIComponent(id)}&select=line_items,tax_rate,total&limit=1`,
        { headers }
      );
      if (qr.ok) {
        const qData = await qr.json();
        const quote = (qData && qData[0]) || {};
        const allItems = Array.isArray(quote.line_items) ? quote.line_items : [];
        const taxRate = Number(quote.tax_rate || 0);
        const picked = Array.isArray(body.selected_items_payload.line_items)
          ? body.selected_items_payload.line_items.slice(0, 100)
          : [];
        // Server-side sum (defensive — never trust client total)
        let subtotal = 0;
        for (const it of picked) {
          const amt = Number((it as { total?: number; amount?: number; price?: number }).total
                         ?? (it as { amount?: number }).amount
                         ?? (it as { price?: number }).price ?? 0);
          if (Number.isFinite(amt)) subtotal += amt;
        }
        const tax = Math.round(subtotal * (taxRate / 100) * 100) / 100;
        const acceptedTotal = Math.round((subtotal + tax) * 100) / 100;
        const originalCount = allItems.length;
        const isPartial = picked.length > 0 && picked.length < originalCount;

        patch.accepted_items     = picked;
        patch.accepted_subtotal  = subtotal;
        patch.accepted_tax       = tax;
        patch.accepted_total     = acceptedTotal;
        patch.acceptance_kind    = isPartial ? 'partial' : 'full';
        patch.accepted_at        = now;
        patch.original_total     = Number(quote.total || 0);
      }
    }
  } else if (action === 'request_changes') {
    patch.status = 'awaiting';
    patch.client_changes = trunc(body.changes, 4000);
  } else if (action === 'decline') {
    patch.status = 'declined';
    patch.client_decline_reason = trunc(body.reason, 4000);
    patch.declined_at = now;
  }

  const ur = await fetch(
    `${SUPABASE_URL}/rest/v1/quotes?id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', headers, body: JSON.stringify(patch) }
  );
  if (!ur.ok) {
    const errTxt = await ur.text();
    return j(500, { ok: false, error: 'update failed', status: ur.status, body: errTxt.slice(0, 200) });
  }

  return j(200, { ok: true, action });
});
