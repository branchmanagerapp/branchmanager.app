/**
 * Branch Manager — Provision Tenant (white-label friend-share)
 * Supabase Edge Function
 *
 * Spins up a fresh, isolated tenant for a friend / prospect to test BM as
 * if it were their own business. Returns a share URL the friend can open
 * to start using BM in their own sandboxed tenant.
 *
 * Auth: requires X-Provision-Token header matching PROVISION_TENANT_TOKEN
 * secret. Doug holds this token; not exposed to public.
 *
 * Deploy:
 *   supabase functions deploy provision-tenant --no-verify-jwt
 *   supabase secrets set PROVISION_TENANT_TOKEN=<random>
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PROVISION_TOKEN = Deno.env.get('PROVISION_TENANT_TOKEN') ?? '';
const APP_URL = 'https://branchmanager.app/';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Provision-Token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'POST or DELETE only' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // Auth gate — must match secret token
  const tokenHeader = req.headers.get('X-Provision-Token') || '';
  if (!PROVISION_TOKEN || tokenHeader !== PROVISION_TOKEN) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  // DELETE — remove a demo tenant by id (only if config.is_demo === true)
  if (req.method === 'DELETE') {
    const id = String(body.id || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return new Response(JSON.stringify({ error: 'valid uuid id required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: row } = await sb.from('tenants').select('id, config').eq('id', id).maybeSingle();
    if (!row) {
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    if (!row.config || row.config.is_demo !== true) {
      return new Response(JSON.stringify({ error: 'refusing to delete non-demo tenant' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const { error: delErr } = await sb.from('tenants').delete().eq('id', id);
    if (delErr) {
      return new Response(JSON.stringify({ error: 'delete failed', detail: delErr.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, deleted: id }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const businessName = String(body.businessName || '').trim();
  const ownerName = String(body.ownerName || '').trim();
  const ownerEmail = String(body.ownerEmail || '').trim();
  const vertical = String(body.vertical || 'tree_service').trim();
  const brandColor = String(body.brandColor || '#1a3c12').trim();

  if (businessName.length < 2) {
    return new Response(JSON.stringify({ error: 'businessName required (min 2 chars)' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Generate unique slug — append short suffix if collision
  let baseSlug = slugify(businessName) || 'demo';
  let slug = baseSlug;
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await sb.from('tenants').select('id').eq('slug', slug).maybeSingle();
    if (!existing) break;
    slug = baseSlug + '-' + Math.random().toString(36).substring(2, 6);
  }

  // v670: every new tenant starts on a 14-day Solo trial. Stripe checkout
  // moves them to status:'active' on first paid period; trial_ends_at is
  // when soft-block kicks in if they haven't subscribed.
  const trialStart = new Date();
  const trialEnd = new Date(trialStart.getTime() + 14 * 24 * 3600 * 1000);

  const config: Record<string, any> = {
    slug,
    company_name: businessName,
    legal_name: businessName,
    from_name: businessName,
    owner_name: ownerName || '',
    company_email: ownerEmail || '',
    from_email: ownerEmail || '',
    vertical,
    brand_color: brandColor,
    currency: 'USD',
    tax_rate: 8.375,
    state_full: '',
    state: '',
    city: '',
    zip: '',
    address_line1: '',
    address_line2: '',
    license_text: 'Demo tenant — fill in via Settings',
    is_demo: true,
    provisioned_at: trialStart.toISOString(),
    subscription: {
      tier: 'solo',
      status: 'trial',
      trial_started_at: trialStart.toISOString(),
      trial_ends_at: trialEnd.toISOString()
    }
  };

  const { data: tenant, error } = await sb
    .from('tenants')
    .insert({
      slug,
      name: businessName,
      owner_email: ownerEmail || `demo+${slug}@branchmanager.app`,
      plan: 'beta',
      config
    })
    .select('id, slug, name')
    .single();

  if (error) {
    console.error('insert failed:', error);
    return new Response(JSON.stringify({ error: 'provision failed', detail: error.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    });
  }

  const shareUrl = `${APP_URL}?welcome=${tenant.id}&name=${encodeURIComponent(businessName)}`;

  return new Response(JSON.stringify({
    ok: true,
    tenant_id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    share_url: shareUrl
  }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
});
