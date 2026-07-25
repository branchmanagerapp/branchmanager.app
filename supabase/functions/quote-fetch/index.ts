/**
 * Branch Manager — Token-gated quote fetch
 *
 * Replaces the anon SELECT-anywhere RLS policy. Customer's approve.html now
 * POSTs {id, token} here; we look up the row via service-role and only
 * return it when the supplied approval_token matches.
 *
 * This is the gateway that lets us safely drop the previous wide-open
 * `Anon read quotes USING (status <> 'draft')` policy — that policy let
 * any anon-key holder dump every customer's name/phone/address/total.
 *
 * v2 (Jul 15 2026): on each successful token-validated fetch, notify the
 * tenant team by email that the customer OPENED the quote (throttled to one
 * email per quote per 4h via an analytics_events marker row). The notify
 * block is fully fire-safe: any failure inside it is swallowed so the
 * customer's quote page can never break because of it.
 *
 * Deploy:
 *   supabase functions deploy quote-fetch --no-verify-jwt --project-ref ltpivkqahvplapyagljt
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const VIEW_THROTTLE_MS = 4 * 60 * 60 * 1000; // one "opened" email per quote per 4h

// Email the tenant team that the customer opened the quote. Throttled via a
// marker row in analytics_events (path = /quote-viewed/<id>). Never throws.
async function notifyQuoteViewed(row: any, headers: Record<string, string>) {
  try {
    if (!RESEND_API_KEY) return;
    const qid = String(row.id);
    const marker = '/quote-viewed/' + qid;
    const since = new Date(Date.now() - VIEW_THROTTLE_MS).toISOString();

    // Throttle check
    const chk = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events?path=eq.${encodeURIComponent(marker)}&created_at=gt.${encodeURIComponent(since)}&select=id&limit=1`, { headers });
    if (chk.ok && (await chk.json()).length > 0) return;

    // Marker row (also the audit trail of customer views)
    await fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ tenant_id: row.tenant_id, session_id: 'quote-view-notify', path: marker, user_agent: 'quote-fetch' })
    });

    // Tenant branding (from_email required by Resend; company_email = recipient)
    const tr = await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(row.tenant_id)}&select=config&limit=1`, { headers });
    if (!tr.ok) return;
    const trows = await tr.json();
    const cfg = (trows && trows[0] && trows[0].config) || {};
    const to = cfg.company_email || cfg.email;
    const from = cfg.from_email;
    if (!to || !from) return;

    const qNum = row.quote_number || qid.slice(0, 8);
    const cName = row.client_name || 'Customer';
    const total = '$' + (+(row.total || 0)).toLocaleString('en-US', { maximumFractionDigits: 0 });
    const subject = `\u{1F440} Quote #${qNum} opened — ${cName}`;
    const text = `${cName} just opened Quote #${qNum} (${total}, status: ${row.status || '—'}).\n\nGood moment for a follow-up call or text.\n\nView in Branch Manager: https://branchmanager.app/`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${cfg.from_name || 'Branch Manager'} <${from}>`, to: [to], subject, text })
    });
  } catch (e) {
    console.warn('quote-view notify failed (non-fatal):', e);
  }
}
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// Constant-time compare so brute-forcing the token via response time is hard.
function safeEq(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const j = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'Content-Type': 'application/json' }
});

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET' || req.method === 'HEAD') {
    return new Response('quote-fetch ok', { status: 200, headers: CORS });
  }
  if (req.method !== 'POST')    return j(405, { ok: false, error: 'POST only' });

  let body: any = {};
  try { body = await req.json(); } catch { return j(400, { ok: false, error: 'Bad JSON' }); }
  const id    = String(body.id || '').trim();
  const token = String(body.token || '').trim();
  if (!id || !token) return j(400, { ok: false, error: 'id and token required' });
  // Reasonable length sanity check on token to avoid log spam.
  if (token.length < 8 || token.length > 128) return j(400, { ok: false, error: 'token length out of range' });

  // Service-role lookup — bypasses RLS. The token check happens in code.
  const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': 'Bearer ' + SERVICE_KEY
  };
  // No status filter: a valid-token link must resolve even while the quote is
  // still 'draft' (the Jul 6 Oswald + Jul 15 Barbara Jones "link not found"
  // failures). Security is the constant-time safeEq(approval_token) below.
  const url = `${SUPABASE_URL}/rest/v1/quotes?id=eq.${encodeURIComponent(id)}&select=*&limit=1`;
  const r = await fetch(url, { headers });
  if (!r.ok) return j(500, { ok: false, error: 'lookup failed', status: r.status });
  const rows = await r.json();
  if (!rows || !rows.length) return j(404, { ok: false, error: 'Quote not found' });

  const row = rows[0];
  const stored = String(row.approval_token || '');
  if (!stored || !safeEq(stored, token)) return j(403, { ok: false, error: 'Invalid token' });

  // Team heads-up: customer opened this quote (throttled, fire-safe).
  await notifyQuoteViewed(row, headers);

  // Strip approval_token from the response — customer doesn't need it back
  // and it should never echo to the client (defense-in-depth against
  // mid-stream interception).
  delete row.approval_token;
  return j(200, { ok: true, quote: row });
});
