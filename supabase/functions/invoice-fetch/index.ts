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
  const url = `${SUPABASE_URL}/rest/v1/invoices?id=eq.${encodeURIComponent(id)}&status=neq.draft&select=*&limit=1`;
  const r = await fetch(url, { headers });
  if (!r.ok) return j(500, { ok: false, error: 'lookup failed', status: r.status });
  const rows = await r.json();
  if (!rows || !rows.length) return j(404, { ok: false, error: 'Invoice not found or draft' });

  const row = rows[0];
  const stored = String(row.payment_token || '');
  if (!stored || !safeEq(stored, token)) return j(403, { ok: false, error: 'Invalid token' });

  // Strip the token from the response.
  delete row.payment_token;

  // Safe tenant branding for the customer page (pay.html can no longer read
  // the tenants table anon — the RLS lockdown was correct). WHITELIST only
  // presentation fields; never the raw config (it holds compliance IDs etc).
  let tenant: { name: string; config: Record<string, unknown> } | null = null;
  if (row.tenant_id) {
    try {
      const tr = await fetch(
        `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(row.tenant_id)}&select=name,config&limit=1`,
        { headers }
      );
      if (tr.ok) {
        const trows = await tr.json();
        if (trows && trows[0]) {
          const cfg = (trows[0].config || {}) as Record<string, unknown>;
          const SAFE = ['logo_url', 'city', 'state', 'zip', 'address_line1', 'address_line2',
            'phone', 'company_phone', 'company_name', 'website', 'company_website',
            'email', 'company_email', 'from_email', 'google_review_url', 'stripe_base_link'];
          const safeCfg: Record<string, unknown> = {};
          for (const k of SAFE) if (cfg[k] != null) safeCfg[k] = cfg[k];
          tenant = { name: trows[0].name || '', config: safeCfg };
        }
      }
    } catch (_) { /* branding is best-effort — never block the invoice */ }
  }

  return j(200, { ok: true, invoice: row, tenant });
});
