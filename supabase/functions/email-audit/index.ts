/**
 * Branch Manager — Email Audit (one-shot diagnostic)
 *
 * Pulls recent emails from Resend's API so Doug can see exactly what went
 * out. Token-gated via PROVISION_TENANT_TOKEN (re-using same secret).
 *
 * Usage:
 *   curl -X GET 'https://.../email-audit?since_hours=48' \
 *        -H 'X-Provision-Token: <token>'
 *
 * Deploy:
 *   supabase functions deploy email-audit --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const PROVISION_TOKEN = Deno.env.get('PROVISION_TENANT_TOKEN') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Provision-Token',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const tokenHeader = req.headers.get('X-Provision-Token') || '';
  if (!PROVISION_TOKEN || tokenHeader !== PROVISION_TOKEN) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not set' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const url = new URL(req.url);
  const sinceHours = Math.min(parseInt(url.searchParams.get('since_hours') || '48', 10), 720);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 100);

  // Resend list endpoint
  const r = await fetch(`https://api.resend.com/emails?limit=${limit}`, {
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` }
  });

  if (!r.ok) {
    const txt = await r.text();
    return new Response(JSON.stringify({ error: 'resend list failed', status: r.status, body: txt }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const j = await r.json();
  const data = (j && (j.data || j)) || [];
  const cutoff = Date.now() - sinceHours * 3600 * 1000;
  const recent = (Array.isArray(data) ? data : []).filter((e: any) => {
    const t = new Date(e.created_at || e.last_event || 0).getTime();
    return t >= cutoff;
  });

  // Group by recipient + subject for quick scan
  const byRecip: Record<string, any[]> = {};
  for (const e of recent) {
    const to = Array.isArray(e.to) ? e.to.join(', ') : (e.to || '?');
    if (!byRecip[to]) byRecip[to] = [];
    byRecip[to].push({
      id: e.id,
      subject: e.subject,
      created_at: e.created_at,
      last_event: e.last_event
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    since_hours: sinceHours,
    total_returned: data.length,
    recent_count: recent.length,
    by_recipient: byRecip,
    raw: recent
  }, null, 2), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
});
