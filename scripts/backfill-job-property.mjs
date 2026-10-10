#!/usr/bin/env node
/**
 * Backfill jobs.property from clients.address where missing.
 *
 * Why: Jobber CSV import didn't populate jobs.property for most rows, so the
 * Jobs table renders "—" in the Property column for ~99% of jobs even though
 * the linked client has a perfectly good address on record.
 *
 * Strategy: one SQL UPDATE that copies clients.address into jobs.property
 * wherever jobs.property is NULL or empty AND clients.address is set.
 *
 * Run:
 *   SUPABASE_URL=https://ltpivkqahvplapyagljt.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/backfill-job-property.mjs
 *
 * Service role key bypasses RLS (this script needs to read clients +
 * write jobs across all rows). Pull the key from the Supabase dashboard
 * (Project Settings → API → service_role) or via the Management API.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

console.log('Fetching jobs with empty property + a linked client…');

// Pull all jobs missing property. Supabase REST API can't do JOIN UPDATE in one
// shot, so we do this in two steps: SELECT eligible jobs (paginated), then
// UPDATE each in batches of 50.
let allJobs = [];
let page = 0;
const PAGE = 1000;
while (true) {
  const { data, error } = await sb
    .from('jobs')
    .select('id, client_id, property')
    .or('property.is.null,property.eq.')
    .not('client_id', 'is', null)
    .range(page * PAGE, (page + 1) * PAGE - 1);
  if (error) { console.error(error); process.exit(1); }
  if (!data || data.length === 0) break;
  allJobs = allJobs.concat(data);
  if (data.length < PAGE) break;
  page++;
}
console.log(`Found ${allJobs.length} jobs with empty property + a client_id.`);

if (allJobs.length === 0) {
  console.log('Nothing to backfill. Done.');
  process.exit(0);
}

const clientIds = [...new Set(allJobs.map(j => j.client_id))];
console.log(`Fetching ${clientIds.length} unique client addresses…`);

const addressByClientId = {};
for (let i = 0; i < clientIds.length; i += 500) {
  const slice = clientIds.slice(i, i + 500);
  const { data, error } = await sb
    .from('clients')
    .select('id, address')
    .in('id', slice);
  if (error) { console.error(error); process.exit(1); }
  for (const c of data) {
    if (c.address && c.address.trim()) addressByClientId[c.id] = c.address.trim();
  }
}
console.log(`Got addresses for ${Object.keys(addressByClientId).length} clients.`);

const updates = allJobs
  .filter(j => addressByClientId[j.client_id])
  .map(j => ({ id: j.id, property: addressByClientId[j.client_id] }));

console.log(`Will update ${updates.length} jobs.`);

let done = 0;
for (let i = 0; i < updates.length; i += 50) {
  const batch = updates.slice(i, i + 50);
  const results = await Promise.all(batch.map(u =>
    sb.from('jobs').update({ property: u.property }).eq('id', u.id)
  ));
  done += batch.length;
  const errs = results.filter(r => r.error);
  if (errs.length) console.error(`  Batch errors: ${errs.length} of ${batch.length}`, errs[0].error);
  process.stdout.write(`\r  Updated ${done}/${updates.length}`);
}
console.log(`\n✅ Backfilled property on ${updates.length} jobs.`);
console.log(`   ${allJobs.length - updates.length} jobs had a client_id but the client had no address — left as-is.`);
