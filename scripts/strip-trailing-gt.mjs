import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const { data, error } = await sb.from('jobs').select('id,description');
if (error) { console.error(error); process.exit(1); }
const bad = data.filter(j => / >$/.test(j.description || ''));
console.log(`Found ${bad.length} jobs with trailing ' >'.`);
let done = 0;
for (const j of bad) {
  const cleaned = j.description.replace(/ >$/, '').trim();
  const { error: e } = await sb.from('jobs').update({ description: cleaned }).eq('id', j.id);
  if (e) console.error('  fail:', j.id, e.message);
  else done++;
}
console.log(`✅ Cleaned ${done}/${bad.length}.`);
