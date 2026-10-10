import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.error('URL=', URL, 'KEY len=', KEY?.length);
const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false }});

const tables = [
  ['jobs',     ['property', 'description', 'client_name']],
  ['clients',  ['name', 'address', 'notes']],
  ['quotes',   ['property', 'description', 'notes', 'client_name']],
  ['invoices', ['client_name']],
  ['requests', ['property', 'notes', 'title', 'description', 'client_name']]
];

for (const [t, fields] of tables) {
  const { data, error } = await sb.from(t).select(['id'].concat(fields).join(','));
  if (error) { console.log(t, 'error:', error.message); continue; }
  const issues = { trailing_gt:0, leading_qd:0, stray_bs:0, html_ent:0, leading_sp:0, trailing_sp:0 };
  const ex = {};
  for (const r of data||[]) {
    for (const f of fields) {
      const v = r[f]; if (!v || typeof v !== 'string') continue;
      if (/\s>$/.test(v)) { issues.trailing_gt++; if (!ex.trailing_gt) ex.trailing_gt = f+': '+v.slice(0,60); }
      if (/^\d+"/.test(v)) { issues.leading_qd++; if (!ex.leading_qd) ex.leading_qd = f+': '+v.slice(0,60); }
      if (/\\\\/.test(v)) { issues.stray_bs++; if (!ex.stray_bs) ex.stray_bs = f+': '+v.slice(0,60); }
      if (/&[a-z]+;|&#\d+;/i.test(v)) { issues.html_ent++; if (!ex.html_ent) ex.html_ent = f+': '+v.slice(0,60); }
      if (/^\s/.test(v)) issues.leading_sp++;
      if (/\s$/.test(v)) issues.trailing_sp++;
    }
  }
  const total = Object.values(issues).reduce((a,b)=>a+b,0);
  if (!total) { console.log(`✓ ${t}: clean (${data.length} rows)`); continue; }
  console.log(`⚠ ${t} (${data.length} rows):`);
  for (const [k, n] of Object.entries(issues)) if (n) console.log(`    ${k}: ${n}` + (ex[k]?` e.g. ${ex[k]}`:''));
}
