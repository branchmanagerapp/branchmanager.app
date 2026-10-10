/**
 * Branch Manager — pg_cron Audit (one-shot diagnostic)
 *
 * Reads cron.job and cron.job_run_details directly via service role so we
 * can see exactly what's scheduled and what fired recently. Token-gated.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PROVISION_TOKEN = Deno.env.get('PROVISION_TENANT_TOKEN') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Provision-Token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const tokenHeader = req.headers.get('X-Provision-Token') || '';
  if (!PROVISION_TOKEN || tokenHeader !== PROVISION_TOKEN) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Read all cron jobs
  const { data: jobs, error: jobErr } = await sb.schema('cron').from('job').select('*');
  // Read recent runs (last 24h)
  const { data: runs, error: runErr } = await sb.schema('cron').from('job_run_details')
    .select('jobid, runid, status, return_message, start_time, end_time')
    .gte('start_time', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .order('start_time', { ascending: false })
    .limit(100);

  return new Response(JSON.stringify({
    ok: true,
    jobs: jobs || [],
    job_error: jobErr?.message,
    recent_runs: runs || [],
    run_error: runErr?.message
  }, null, 2), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
});
