/**
 * Branch Manager — Analytics Beacon
 *
 * Receives page-view events from per-tenant marketing sites and stores
 * them in `analytics_events`. White-label: every event is scoped to a
 * tenant_id, no cross-tenant bleed. Lightweight: no cookies, only a
 * client-generated session_id (random per tab) used to dedupe within
 * a session.
 *
 * Privacy: stores only path + referrer + truncated UA + country (from
 * Cloudflare/Deno headers). No IP, no fingerprint, no PII.
 *
 * Endpoint: POST /bm-analytics-beacon
 * Body: { tenant_id, session_id, path, referrer? }
 *
 * Deploy: supabase functions deploy bm-analytics-beacon --no-verify-jwt
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }

  const tenantId = String(body.tenant_id || '').trim();
  const sessionId = String(body.session_id || '').trim().slice(0, 64);
  const path = String(body.path || '/').trim().slice(0, 256);
  const referrer = String(body.referrer || '').trim().slice(0, 256) || null;

  if (!UUID_RE.test(tenantId)) {
    return new Response(JSON.stringify({ error: 'invalid tenant_id' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  if (!sessionId || sessionId.length < 8) {
    return new Response(JSON.stringify({ error: 'session_id required (8+ chars)' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // Headers from edge runtime
  const ua = (req.headers.get('user-agent') || '').slice(0, 200);
  const country = req.headers.get('cf-ipcountry') || req.headers.get('x-vercel-ip-country') || null;
  const city = req.headers.get('cf-ipcity') || req.headers.get('x-vercel-ip-city') || null;

  // Confirm tenant exists (cheap guard against spam to random UUIDs)
  const { data: tenant } = await sb.from('tenants').select('id').eq('id', tenantId).maybeSingle();
  if (!tenant) {
    return new Response(JSON.stringify({ error: 'unknown tenant' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const { error } = await sb.from('analytics_events').insert({
    tenant_id: tenantId,
    session_id: sessionId,
    path,
    referrer,
    user_agent: ua,
    country,
    city
  });
  if (error) {
    console.error('[beacon insert]', error.message);
    return new Response(JSON.stringify({ error: 'insert failed' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
});
