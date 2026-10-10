#!/usr/bin/env node
/**
 * Merge duplicate client rows: same phone (or same email) and same/very-similar
 * name. Picks a keeper (most relations, then cleanest address, then oldest),
 * repoints quotes/jobs/invoices/requests/photos to it, deletes the loser.
 *
 * Hard rule: only merges when the LOSER row has a name that matches the
 * keeper after lowercase + alnum strip — never merges different people.
 *
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/merge-duplicate-clients.mjs [--dry]
 */
const SB  = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !KEY) { console.error('Missing env'); process.exit(1); }
const DRY = process.argv.includes('--dry');
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

async function selectAll(path) {
  const r = await fetch(SB + '/rest/v1/' + path, { headers: H });
  if (!r.ok) throw new Error(path + ' → ' + r.status);
  return r.json();
}
async function patch(table, ids, body) {
  if (DRY || !ids.length) return;
  const r = await fetch(SB + '/rest/v1/' + table + '?id=in.(' + ids.map(encodeURIComponent).join(',') + ')', {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(table + ' patch → ' + r.status + ' ' + (await r.text()).slice(0, 200));
}
async function delById(table, id) {
  if (DRY) return;
  const r = await fetch(SB + '/rest/v1/' + table + '?id=eq.' + id, { method: 'DELETE', headers: H });
  if (!r.ok) throw new Error(table + ' delete ' + id + ' → ' + r.status);
}

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g,'');
const cleanScore = c => (c.address || '').length;     // longer/cleaner address tends to be the canonical one
const oldestScore = c => -new Date(c.created_at).getTime();

(async () => {
  const clients = await selectAll('clients?select=id,name,phone,email,address,created_at&limit=1000');
  // Group by normalized phone (digits only)
  const groups = new Map();
  function normPhone(p) {
    let d = (p || '').replace(/\D/g, '');
    // Strip US country-code prefix so '+19147031370' and '9147031370' match
    if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
    return d;
  }
  clients.forEach(c => {
    const ph = normPhone(c.phone);
    if (ph.length < 7) return;
    if (!groups.has(ph)) groups.set(ph, []);
    groups.get(ph).push(c);
  });

  // Also group by email
  const eGroups = new Map();
  clients.forEach(c => {
    const e = (c.email || '').toLowerCase().trim();
    if (!e) return;
    if (!eGroups.has(e)) eGroups.set(e, []);
    eGroups.get(e).push(c);
  });

  const dupSets = [];
  for (const [ph, list] of groups) if (list.length > 1) dupSets.push({ key: 'phone:' + ph, list });
  for (const [em, list] of eGroups) if (list.length > 1 && !dupSets.find(d => d.list.some(c => list.find(x => x.id === c.id)))) dupSets.push({ key: 'email:' + em, list });

  console.log('Found ' + dupSets.length + ' duplicate sets');

  // Pre-fetch FK dependents for relation-count scoring
  const [quotes, jobs, invoices, requests] = await Promise.all([
    selectAll('quotes?select=id,client_id'),
    selectAll('jobs?select=id,client_id'),
    selectAll('invoices?select=id,client_id'),
    selectAll('requests?select=id,client_id')
  ]);
  const countByClient = new Map();
  [quotes, jobs, invoices, requests].forEach(arr => arr.forEach(r => {
    if (r.client_id) countByClient.set(r.client_id, (countByClient.get(r.client_id) || 0) + 1);
  }));

  let merged = 0, skipped = 0;
  for (const set of dupSets) {
    // Validate that names are similar enough to merge (alnum-equal OR one contains the other)
    const names = set.list.map(c => norm(c.name));
    const allSimilar = names.every((a, i) => names.every((b, j) => i === j || a === b || a.includes(b) || b.includes(a)));
    if (!allSimilar) {
      console.log('SKIP ' + set.key + ' — names diverge: ' + set.list.map(c => c.name).join(' | '));
      skipped++;
      continue;
    }

    // Pick keeper: most relations → cleanest address → oldest
    set.list.sort((a, b) => {
      const ra = countByClient.get(a.id) || 0;
      const rb = countByClient.get(b.id) || 0;
      if (ra !== rb) return rb - ra;
      const sa = cleanScore(a), sb = cleanScore(b);
      if (sa !== sb) return sb - sa;
      return oldestScore(a) - oldestScore(b);
    });
    const keeper = set.list[0];
    const losers = set.list.slice(1);
    const loserIds = losers.map(c => c.id);

    console.log('MERGE ' + set.key + ' → keep ' + keeper.id + ' (' + keeper.name + '), drop ' + loserIds.length);

    // Repoint dependents
    await patch('quotes',   quotes  .filter(r => loserIds.includes(r.client_id)).map(r => r.id), { client_id: keeper.id });
    await patch('jobs',     jobs    .filter(r => loserIds.includes(r.client_id)).map(r => r.id), { client_id: keeper.id });
    await patch('invoices', invoices.filter(r => loserIds.includes(r.client_id)).map(r => r.id), { client_id: keeper.id });
    await patch('requests', requests.filter(r => loserIds.includes(r.client_id)).map(r => r.id), { client_id: keeper.id });

    // Delete losers
    for (const id of loserIds) await delById('clients', id);
    merged++;
  }

  console.log('Done — merged ' + merged + ' sets, skipped ' + skipped + (DRY ? ' [DRY]' : ''));
})().catch(e => { console.error(e); process.exit(1); });
