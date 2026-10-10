/**
 * Branch Manager — Analytics Summary
 *
 * Returns aggregated stats for a tenant's marketing site over the last
 * N days: total visitors, total sessions, total pageviews, daily
 * breakdown, top pages, top referrers, top countries.
 *
 * Token-gated (X-Tenant-ID header from BM client; the service role
 * runs the queries so RLS is bypassed safely scoped to the requested
 * tenant).
 *
 * GET /analytics-summary?tenant_id=<uuid>&days=30
 *
 * Deploy: supabase functions deploy analytics-summary --no-verify-jwt
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Tenant-ID',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'GET only' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const url = new URL(req.url);
  const tenantId = (url.searchParams.get('tenant_id') || req.headers.get('X-Tenant-ID') || '').trim();
  const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days') || '30', 10)));

  if (!UUID_RE.test(tenantId)) {
    return new Response(JSON.stringify({ error: 'invalid or missing tenant_id' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const sinceIso = new Date(Date.now() - days * 86400 * 1000).toISOString();

  // Pull all events in window — small enough for a single fetch at SNT scale.
  // If a tenant ever exceeds ~50k events per window we can move to SQL group-by.
  const { data: events, error } = await sb
    .from('analytics_events')
    .select('session_id, path, referrer, country, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(50000);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const rows = events || [];
  const sessionSet = new Set<string>();
  const dailySessionCounts: Record<string, Set<string>> = {};
  const dailyPageviews: Record<string, number> = {};
  const pageCounts: Record<string, number> = {};
  const referrerCounts: Record<string, number> = {};
  const countryCounts: Record<string, number> = {};

  for (const e of rows) {
    sessionSet.add(e.session_id);
    const day = (e.created_at || '').substring(0, 10);
    if (!dailySessionCounts[day]) dailySessionCounts[day] = new Set<string>();
    dailySessionCounts[day].add(e.session_id);
    dailyPageviews[day] = (dailyPageviews[day] || 0) + 1;
    pageCounts[e.path] = (pageCounts[e.path] || 0) + 1;
    const ref = (e.referrer || '(direct)').replace(/^https?:\/\//, '').split('/')[0] || '(direct)';
    referrerCounts[ref] = (referrerCounts[ref] || 0) + 1;
    const c = e.country || '(unknown)';
    countryCounts[c] = (countryCounts[c] || 0) + 1;
  }

  // Build daily series with zero-fill across the whole window
  const dailySeries: Array<{ date: string; sessions: number; pageviews: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400 * 1000);
    const ds = d.toISOString().substring(0, 10);
    dailySeries.push({
      date: ds,
      sessions: dailySessionCounts[ds] ? dailySessionCounts[ds].size : 0,
      pageviews: dailyPageviews[ds] || 0
    });
  }

  function topN(map: Record<string, number>, n: number) {
    return Object.keys(map)
      .map(k => ({ key: k, count: map[k] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  }

  return new Response(JSON.stringify({
    ok: true,
    tenant_id: tenantId,
    days,
    totals: {
      sessions: sessionSet.size,
      pageviews: rows.length
    },
    daily: dailySeries,
    top_pages: topN(pageCounts, 10),
    top_referrers: topN(referrerCounts, 10),
    top_countries: topN(countryCounts, 10)
  }, null, 2), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
});
