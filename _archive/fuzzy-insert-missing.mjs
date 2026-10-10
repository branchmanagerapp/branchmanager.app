// Insert Jobber records that aren't in Supabase by number AND have no fuzzy match.
// Safe: only inserts NEW rows, never updates or deletes existing.

const SUPA_URL = 'https://ltpivkqahvplapyagljt.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI';
const headers = { 'Content-Type': 'application/json', apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, Prefer: 'return=representation' };

import fs from 'node:fs/promises';

async function fetchAll(table, select) {
  const rows = []; let from = 0; const ps = 1000;
  while (true) {
    const res = await fetch(`${SUPA_URL}/rest/v1/${table}?select=${select}`, { headers: { ...headers, Range: `${from}-${from+ps-1}` } });
    if (!res.ok) throw new Error(`${table} ${res.status}`);
    const p = await res.json(); rows.push(...p);
    if (p.length < ps) break; from += ps;
  }
  return rows;
}
async function insertOne(table, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) { console.error(`  INSERT fail:`, res.status, await res.text()); return null; }
  const j = await res.json(); return Array.isArray(j) ? j[0] : j;
}
function norm(s) { return (s || '').toLowerCase().trim(); }

// Find an existing client by name (case-insensitive) so we can link new records.
async function clientLookup() {
  const clients = await fetchAll('clients', 'id,name');
  const map = new Map();
  for (const c of clients) map.set(norm(c.name), c.id);
  return map;
}

async function insertMissingQuotes(clientMap) {
  const jobber = JSON.parse(await fs.readFile('./jobber-quotes-with-lineitems.json', 'utf8'));
  const supa = await fetchAll('quotes', 'id,quote_number,client_name,created_at');
  const have = new Set(supa.map(q => String(q.quote_number)));
  const supaByName = new Map();
  for (const q of supa) {
    const k = norm(q.client_name);
    if (!supaByName.has(k)) supaByName.set(k, []);
    supaByName.get(k).push(q);
  }
  const missing = [];
  for (const jq of jobber) {
    if (have.has(String(jq.quoteNumber))) continue;
    const candidates = supaByName.get(norm(jq.clientName)) || [];
    const jqT = new Date(jq.createdAt).getTime();
    const fuzzy = candidates.find(c => c.created_at && Math.abs(new Date(c.created_at).getTime() - jqT) < 3*86400000);
    if (!fuzzy) missing.push(jq);
  }
  console.log(`\n── QUOTES ── ${missing.length} genuinely missing — inserting…`);
  let inserted = 0;
  for (const jq of missing) {
    const clientId = clientMap.get(norm(jq.clientName)) || null;
    const items = (jq.lineItems || []).map(x => ({
      service: x.service || '', description: x.description || '',
      qty: x.qty || 1, rate: x.rate || 0, amount: (x.qty || 1) * (x.rate || 0), photoUrl: x.imageUrl,
    }));
    const row = {
      quote_number: jq.quoteNumber, client_name: jq.clientName || '',
      client_id: clientId, total: jq.total || 0, status: jq.status || 'archived',
      line_items: items, created_at: jq.createdAt,
      description: jq.description || '', property: jq.property || '',
    };
    const result = await insertOne('quotes', row);
    if (result) { inserted++; console.log(`  ✓ #${jq.quoteNumber} — ${jq.clientName}`); }
  }
  console.log(`  Inserted: ${inserted}/${missing.length}`);
}

async function insertMissingJobs(clientMap) {
  const jobber = JSON.parse(await fs.readFile('./jobber-jobs-with-lineitems.json', 'utf8'));
  const supa = await fetchAll('jobs', 'id,job_number,client_name,created_at');
  const have = new Set(supa.map(j => String(j.job_number)));
  const supaByName = new Map();
  for (const j of supa) {
    const k = norm(j.client_name);
    if (!supaByName.has(k)) supaByName.set(k, []);
    supaByName.get(k).push(j);
  }
  const missing = [];
  for (const jj of jobber) {
    if (have.has(String(jj.jobNumber))) continue;
    const candidates = supaByName.get(norm(jj.clientName)) || [];
    const jT = new Date(jj.createdAt).getTime();
    const fuzzy = candidates.find(c => c.created_at && Math.abs(new Date(c.created_at).getTime() - jT) < 7*86400000);
    if (!fuzzy) missing.push(jj);
  }
  console.log(`\n── JOBS ── ${missing.length} genuinely missing — inserting…`);
  let inserted = 0;
  for (const jj of missing) {
    const clientId = clientMap.get(norm(jj.clientName)) || null;
    const items = (jj.lineItems || []).map(x => ({
      service: x.service || '', description: x.description || '',
      qty: x.qty || 1, rate: x.rate || 0, amount: (x.qty || 1) * (x.rate || 0),
    }));
    const row = {
      job_number: jj.jobNumber, client_name: jj.clientName || '',
      client_id: clientId, total: jj.total || 0, status: jj.status || 'completed',
      line_items: items, created_at: jj.createdAt,
    };
    const result = await insertOne('jobs', row);
    if (result) { inserted++; console.log(`  ✓ #${jj.jobNumber} — ${jj.clientName}`); }
  }
  console.log(`  Inserted: ${inserted}/${missing.length}`);
}

const clientMap = await clientLookup();
console.log(`Client lookup: ${clientMap.size} clients`);
await insertMissingQuotes(clientMap);
await insertMissingJobs(clientMap);
