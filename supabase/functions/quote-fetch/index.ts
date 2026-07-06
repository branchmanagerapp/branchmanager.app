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
 * Deploy:
 *   supabase functions deploy quote-fetch --no-verify-jwt --project-ref ltpivkqahvplapyagljt
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
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
  // NO status filter — security is the constant-time token compare below (safeEq
  // on approval_token). A valid-token link must ALWAYS resolve, even while the
  // quote is still 'draft'/being priced, so a shared link never 404s again
  // ("link not found" incident, Oswald Roche, Jul 6 2026). Token secrecy is the guard.
  const url = `${SUPABASE_URL}/rest/v1/quotes?id=eq.${encodeURIComponent(id)}&select=*&limit=1`;
  const r = await fetch(url, { headers });
  if (!r.ok) return j(500, { ok: false, error: 'lookup failed', status: r.status });
  const rows = await r.json();
  if (!rows || !rows.length) return j(404, { ok: false, error: 'Quote not found' });

  const row = rows[0];
  const stored = String(row.approval_token || '');
  if (!stored || !safeEq(stored, token)) return j(403, { ok: false, error: 'Invalid token' });

  // Strip approval_token from the response — customer doesn't need it back
  // and it should never echo to the client (defense-in-depth against
  // mid-stream interception).
  delete row.approval_token;
  return j(200, { ok: true, quote: row });
});
