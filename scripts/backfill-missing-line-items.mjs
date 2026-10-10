#!/usr/bin/env node
/**
 * Backfill quote/job rows that exist in Supabase but have empty line_items,
 * using the Jobber JSON scrapes that already live locally.
 *
 * Inputs (hard-coded paths — adjust if you re-scrape):
 *   ~/Downloads/jobber-quotes-with-lineitems.json
 *   ~/Desktop/jobber-jobs-with-lineitems.json
 *
 * Matches by quote_number / job_number. Only updates rows whose existing
 * line_items are empty — never overwrites a row that already has items.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-missing-line-items.mjs [--dry]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SB  = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !KEY) { console.error('Missing env'); process.exit(1); }
const DRY = process.argv.includes('--dry');
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

const QUOTES_JSON = path.join(os.homedir(), 'Downloads', 'jobber-quotes-with-lineitems.json');
const JOBS_JSON   = path.join(os.homedir(), 'Desktop',   'jobber-jobs-with-lineitems.json');

function load(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { console.error('cannot read', p); return []; } }

async function selectAll(table, cols) {
  const r = await fetch(SB + '/rest/v1/' + table + '?select=' + cols + '&limit=1000', { headers: H });
  if (!r.ok) throw new Error(table + ' select → ' + r.status);
  return r.json();
}
async function patch(table, id, body) {
  const r = await fetch(SB + '/rest/v1/' + table + '?id=eq.' + id, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(table + ' patch ' + id + ' → ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

// Normalize Jobber line item → BM shape (imageUrl → photoUrl, keep other fields).
function normalizeItems(items) {
  return (items || []).map(li => {
    const o = { ...li };
    if (o.imageUrl && !o.photoUrl) { o.photoUrl = o.imageUrl; delete o.imageUrl; }
    return o;
  });
}

async function run(table, numKey, jsonPath, jobberKey) {
  const rows = await selectAll(table, 'id,' + numKey + ',line_items');
  const jobber = load(jsonPath);
  const byNum = new Map(jobber.map(x => [String(x[jobberKey]), x]));

  const empties = rows.filter(r => !Array.isArray(r.line_items) || r.line_items.length === 0);
  console.log('[' + table + '] empty rows: ' + empties.length + ', jobber JSON: ' + jobber.length);

  let filled = 0, noMatch = 0, dryMatch = 0;
  for (const r of empties) {
    const num = String(r[numKey]);
    const jq = byNum.get(num);
    if (!jq || !Array.isArray(jq.lineItems) || !jq.lineItems.length) { noMatch++; continue; }
    const items = normalizeItems(jq.lineItems);
    if (DRY) { dryMatch++; console.log('  DRY ' + num + ' → ' + items.length + ' items'); continue; }
    await patch(table, r.id, { line_items: items, updated_at: new Date().toISOString() });
    filled++;
  }
  console.log('[' + table + '] filled=' + filled + ' dryMatched=' + dryMatch + ' unmatched=' + noMatch);
}

(async () => {
  await run('quotes', 'quote_number', QUOTES_JSON, 'quoteNumber');
  await run('jobs',   'job_number',   JOBS_JSON,   'jobNumber');
})().catch(e => { console.error(e); process.exit(1); });
