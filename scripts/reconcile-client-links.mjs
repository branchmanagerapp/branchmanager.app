#!/usr/bin/env node
/**
 * Reconcile orphaned quotes/jobs/invoices by matching client_name text
 * back to a clients.id. Also links jobs→quotes and invoices→jobs where
 * the relationship can be inferred from name + date proximity.
 *
 * Safe: only sets fields that are currently NULL. Never overwrites an
 * existing client_id / quote_id / job_id.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/reconcile-client-links.mjs [--dry]
 */

const SB  = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !KEY) { console.error('Missing env'); process.exit(1); }
const DRY = process.argv.includes('--dry');
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

async function selectAll(path) {
  let all = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const r = await fetch(SB + '/rest/v1/' + path + (path.includes('?') ? '&' : '?') + 'offset=' + from + '&limit=' + step, { headers: H });
    if (!r.ok) throw new Error(path + ' → ' + r.status);
    const d = await r.json();
    all = all.concat(d);
    if (d.length < step) break;
    from += step;
  }
  return all;
}
async function patch(table, id, body) {
  if (DRY) return;
  const r = await fetch(SB + '/rest/v1/' + table + '?id=eq.' + id, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(table + ' patch → ' + r.status + ' ' + (await r.text()).slice(0,200));
}

function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g,'').trim();
}

(async () => {
  const clients  = await selectAll('clients?select=id,name,first_name,last_name,phone,email');
  const quotes   = await selectAll('quotes?select=id,client_id,client_name,client_phone,client_email,total,created_at');
  const jobs     = await selectAll('jobs?select=id,client_id,client_name,client_phone,quote_id,total,created_at,scheduled_date');
  const invoices = await selectAll('invoices?select=id,client_id,client_name,client_phone,job_id,total,created_at');
  console.log('Loaded clients=' + clients.length + ' quotes=' + quotes.length + ' jobs=' + jobs.length + ' invoices=' + invoices.length);

  // Build fast lookup maps
  const clientsByName = new Map();
  const clientsByPhone = new Map();
  const clientsByEmail = new Map();
  clients.forEach(c => {
    const nm = normName(c.name || ((c.first_name||'') + ' ' + (c.last_name||'')));
    if (nm) (clientsByName.get(nm) || clientsByName.set(nm, []).get(nm)).push(c);
    const ph = (c.phone || '').replace(/\D/g,'');
    if (ph.length >= 7) (clientsByPhone.get(ph) || clientsByPhone.set(ph, []).get(ph)).push(c);
    const em = (c.email || '').toLowerCase().trim();
    if (em) (clientsByEmail.get(em) || clientsByEmail.set(em, []).get(em)).push(c);
  });

  function findClient(row) {
    const ph = (row.client_phone || '').replace(/\D/g,'');
    if (ph.length >= 7 && clientsByPhone.get(ph)) return clientsByPhone.get(ph);
    const em = (row.client_email || '').toLowerCase().trim();
    if (em && clientsByEmail.get(em)) return clientsByEmail.get(em);
    const nm = normName(row.client_name);
    if (nm && clientsByName.get(nm)) return clientsByName.get(nm);
    return null;
  }

  // ── 1. Link quotes → clients
  let qFixed = 0, qAmbig = 0, qMiss = 0;
  for (const q of quotes) {
    if (q.client_id) continue;
    const c = findClient(q);
    if (!c) { qMiss++; continue; }
    if (c.length > 1) { qAmbig++; continue; } // skip ambiguous — don't guess
    await patch('quotes', q.id, { client_id: c[0].id });
    q.client_id = c[0].id; // in-memory for later passes
    qFixed++;
  }
  console.log('[quotes]   fixed=' + qFixed + ' ambiguous=' + qAmbig + ' no-match=' + qMiss);

  // ── 2. Link jobs → clients
  let jFixed = 0, jAmbig = 0, jMiss = 0;
  for (const j of jobs) {
    if (j.client_id) continue;
    const c = findClient(j);
    if (!c) { jMiss++; continue; }
    if (c.length > 1) { jAmbig++; continue; }
    await patch('jobs', j.id, { client_id: c[0].id });
    j.client_id = c[0].id;
    jFixed++;
  }
  console.log('[jobs]     fixed=' + jFixed + ' ambiguous=' + jAmbig + ' no-match=' + jMiss);

  // ── 3. Link invoices → clients
  let iFixed = 0, iAmbig = 0, iMiss = 0;
  for (const inv of invoices) {
    if (inv.client_id) continue;
    const c = findClient(inv);
    if (!c) { iMiss++; continue; }
    if (c.length > 1) { iAmbig++; continue; }
    await patch('invoices', inv.id, { client_id: c[0].id });
    inv.client_id = c[0].id;
    iFixed++;
  }
  console.log('[invoices] fixed=' + iFixed + ' ambiguous=' + iAmbig + ' no-match=' + iMiss);

  // ── 4. Link jobs → quotes (by client + nearby total)
  const quotesByClient = new Map();
  quotes.forEach(q => { if (q.client_id) (quotesByClient.get(q.client_id) || quotesByClient.set(q.client_id, []).get(q.client_id)).push(q); });
  let jqFixed = 0, jqAmbig = 0;
  for (const j of jobs) {
    if (j.quote_id || !j.client_id) continue;
    const qs = quotesByClient.get(j.client_id) || [];
    const candidates = qs.filter(q => Math.abs((parseFloat(q.total)||0) - (parseFloat(j.total)||0)) < 0.5);
    if (candidates.length === 1) {
      await patch('jobs', j.id, { quote_id: candidates[0].id });
      j.quote_id = candidates[0].id;
      jqFixed++;
    } else if (qs.length === 1) {
      await patch('jobs', j.id, { quote_id: qs[0].id });
      j.quote_id = qs[0].id;
      jqFixed++;
    } else if (candidates.length > 1 || qs.length > 1) { jqAmbig++; }
  }
  console.log('[jobs→quote]    fixed=' + jqFixed + ' ambiguous=' + jqAmbig);

  // ── 5. Link invoices → jobs (prefer job_id match via client + date proximity)
  const jobsByClient = new Map();
  jobs.forEach(j => { if (j.client_id) (jobsByClient.get(j.client_id) || jobsByClient.set(j.client_id, []).get(j.client_id)).push(j); });
  let ijFixed = 0, ijAmbig = 0;
  for (const inv of invoices) {
    if (inv.job_id || !inv.client_id) continue;
    const js = jobsByClient.get(inv.client_id) || [];
    if (js.length === 1) {
      await patch('invoices', inv.id, { job_id: js[0].id });
      ijFixed++;
    } else if (js.length > 1) {
      const invDate = new Date(inv.created_at).getTime();
      js.sort((a, b) => Math.abs(new Date(a.scheduled_date||a.created_at).getTime() - invDate) - Math.abs(new Date(b.scheduled_date||b.created_at).getTime() - invDate));
      const best = js[0];
      const sameTotalMatches = js.filter(j => Math.abs((parseFloat(j.total)||0) - (parseFloat(inv.total)||0)) < 0.5);
      if (sameTotalMatches.length === 1) {
        await patch('invoices', inv.id, { job_id: sameTotalMatches[0].id });
        ijFixed++;
      } else {
        // Pick closest date when total doesn't disambiguate
        await patch('invoices', inv.id, { job_id: best.id });
        ijFixed++;
        ijAmbig++; // note it for telemetry but we still filled
      }
    }
  }
  console.log('[invoices→job]  fixed=' + ijFixed + ' (' + ijAmbig + ' picked-by-date)');

  console.log('\nDone.' + (DRY ? ' [DRY — no writes]' : ''));
})().catch(e => { console.error(e); process.exit(1); });
