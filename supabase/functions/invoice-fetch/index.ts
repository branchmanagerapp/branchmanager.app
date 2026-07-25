/**
 * Branch Manager — Token-gated invoice fetch
 *
 * Replaces the anon SELECT-anywhere RLS policy. Customer's pay.html now
 * POSTs {id, token} here; we look up the invoice via service-role and
 * only return it when the supplied payment_token matches.
 *
 * Was previously: anon could `curl /rest/v1/invoices?select=*` and dump
 * every customer's name/phone/address/balance/total. PII leak.
 *
 * Deploy:
 *   supabase functions deploy invoice-fetch --no-verify-jwt --project-ref ltpivkqahvplapyagljt
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

const j = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'Content-Type': 'application/json' }
});

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET' || req.method === 'HEAD') {
    return new Response('invoice-fetch ok', { status: 200, headers: CORS });
  }
  if (req.method !== 'POST')    return j(405, { ok: false, error: 'POST only' });

  let body: any = {};
  try { body = await req.json(); } catch { return j(400, { ok: false, error: 'Bad JSON' }); }
  const id    = String(body.id || '').trim();
  const token = String(body.token || '').trim();
  if (!id || !token) return j(400, { ok: false, error: 'id and token required' });
  if (token.length < 8 || token.length > 128) return j(400, { ok: false, error: 'token length out of range' });

  const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': 'Bearer ' + SERVICE_KEY
  };
  // No status filter: a valid-token link must resolve even while the invoice
  // row is 'draft' (same class as the Jul 6 quote-fetch bug — Jul 15 2026 it
  // broke Lucente's and the 25 Cayuga customer's invoice links). Security is
  // the constant-time safeEq(payment_token) below.
  const url = `${SUPABASE_URL}/rest/v1/invoices?id=eq.${encodeURIComponent(id)}&select=*&limit=1`;
  const r = await fetch(url, { headers });
  if (!r.ok) return j(500, { ok: false, error: 'lookup failed', status: r.status });
  const rows = await r.json();
  if (!rows || !rows.length) return j(404, { ok: false, error: 'Invoice not found' });

  const row = rows[0];
  const stored = String(row.payment_token || '');
  if (!stored || !safeEq(stored, token)) return j(403, { ok: false, error: 'Invalid token' });

  // Strip the token from the response.
  delete row.payment_token;
  return j(200, { ok: true, invoice: row });
});
