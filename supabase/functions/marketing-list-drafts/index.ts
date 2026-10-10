/**
 * Branch Manager — list marketing drafts for the approvals page.
 * Token-gated; same HMAC token as marketing-approve.
 *
 * GET /marketing-list-drafts?t=TOKEN&status=pending
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { verifyApproveToken } from '../_shared/approve-token.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'GET only' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('t') || '';
  const status = url.searchParams.get('status') || 'pending';

  const verified = await verifyApproveToken(token);
  if (!verified) {
    return new Response(JSON.stringify({ error: 'invalid or expired token' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const { data, error } = await sb
    .from('marketing_drafts')
    .select('id, trigger, client_name, to_email, subject, body_text, status, created_at, metadata')
    .eq('tenant_id', verified.tenantId)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // Tenant info for header
  const { data: tenant } = await sb.from('tenants').select('id, name, config').eq('id', verified.tenantId).maybeSingle();

  return new Response(JSON.stringify({
    ok: true,
    tenant: { id: verified.tenantId, name: tenant?.name || '', company: tenant?.config?.company_name || tenant?.name || '' },
    status,
    drafts: data || []
  }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
});
