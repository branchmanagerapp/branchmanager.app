// Node CLI port of fuzzyMatchQuotes/fuzzyMatchJobs from import-jobber.html
// Runs end-to-end: fetches Supabase, matches by name+date, patches missing line_items.

const SUPA_URL = 'https://ltpivkqahvplapyagljt.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI';

const headers = {
  'Content-Type': 'application/json',
  apikey: SUPA_KEY,
  Authorization: 'Bearer ' + SUPA_KEY,
  Prefer: 'return=minimal',
};

import fs from 'node:fs/promises';

async function fetchAll(table, select) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const res = await fetch(`${SUPA_URL}/rest/v1/${table}?select=${select}`, {
      headers: { ...headers, Range: `${from}-${from + pageSize - 1}` },
    });
    if (!res.ok) throw new Error(`fetchAll ${table} ${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function patchOne(table, id, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`  PATCH ${table} ${id} failed:`, res.status, await res.text());
    return false;
  }
  return true;
}

function norm(s) { return (s || '').toLowerCase().trim(); }

async function fuzzyQuotes() {
  const jobberQuotes = JSON.parse(await fs.readFile('./jobber-quotes-with-lineitems.json', 'utf8'));
  console.log(`\n── QUOTES ── loaded ${jobberQuotes.length} from JSON`);
  const supa = await fetchAll('quotes', 'id,quote_number,client_name,created_at,total,line_items');
  console.log(`Supabase has ${supa.length} quotes`);
  const matchedNumbers = new Set(supa.map(q => String(q.quote_number)));
  const unmatched = jobberQuotes.filter(jq => !matchedNumbers.has(String(jq.quoteNumber)));
  console.log(`${unmatched.length} Jobber quotes not in Supabase by number`);

  let fuzzy = 0, still = 0, updated = 0, errors = 0, photoCount = 0;
  for (const jq of unmatched) {
    const jqDate = new Date(jq.createdAt).getTime();
    const match = supa.find(sq => {
      if (norm(sq.client_name) !== norm(jq.clientName)) return false;
      if (!sq.created_at) return false;
      const diff = Math.abs(new Date(sq.created_at).getTime() - jqDate);
      return diff < 3 * 86400000;
    });
    const newItems = (jq.lineItems || []).map(x => {
      if (x.imageUrl) photoCount++;
      return {
        service: x.service || '',
        description: x.description || '',
        qty: x.qty || 1,
        rate: x.rate || 0,
        amount: (x.qty || 1) * (x.rate || 0),
        photoUrl: x.imageUrl,
      };
    });
    if (match) {
      fuzzy++;
      const hasItems = Array.isArray(match.line_items)
        && match.line_items.length > 0
        && match.line_items.some(x => x.description);
      if (!hasItems && newItems.length > 0) {
        const ok = await patchOne('quotes', match.id, { line_items: newItems });
        if (ok) {
          updated++;
          console.log(`  ✓ #${jq.quoteNumber} → ${match.client_name} (${new Date(match.created_at).toLocaleDateString()})`);
        } else errors++;
      }
    } else {
      still++;
    }
  }
  console.log(`\n  DONE quotes: fuzzy=${fuzzy} updated=${updated} still_unmatched=${still} photos=${photoCount} errors=${errors}`);
}

async function fuzzyJobs() {
  const jobberJobs = JSON.parse(await fs.readFile('./jobber-jobs-with-lineitems.json', 'utf8'));
  console.log(`\n── JOBS ── loaded ${jobberJobs.length} from JSON`);
  const supa = await fetchAll('jobs', 'id,job_number,client_name,created_at,total,line_items');
  console.log(`Supabase has ${supa.length} jobs`);
  const matchedNumbers = new Set(supa.map(j => String(j.job_number)));
  const unmatched = jobberJobs.filter(jj => !matchedNumbers.has(String(jj.jobNumber)));
  console.log(`${unmatched.length} Jobber jobs not in Supabase by number`);

  let fuzzy = 0, still = 0, updated = 0, errors = 0;
  for (const jj of unmatched) {
    const jjDate = new Date(jj.createdAt).getTime();
    const match = supa.find(sj => {
      if (norm(sj.client_name) !== norm(jj.clientName)) return false;
      if (!sj.created_at) return false;
      const diff = Math.abs(new Date(sj.created_at).getTime() - jjDate);
      return diff < 7 * 86400000; // 7-day window for jobs (dates drift more)
    });
    const newItems = (jj.lineItems || []).map(x => ({
      service: x.service || '',
      description: x.description || '',
      qty: x.qty || 1,
      rate: x.rate || 0,
      amount: (x.qty || 1) * (x.rate || 0),
    }));
    if (match) {
      fuzzy++;
      const hasItems = Array.isArray(match.line_items)
        && match.line_items.length > 0
        && match.line_items.some(x => x.description);
      if (!hasItems && newItems.length > 0) {
        const ok = await patchOne('jobs', match.id, { line_items: newItems });
        if (ok) {
          updated++;
          console.log(`  ✓ #${jj.jobNumber} → ${match.client_name} (${new Date(match.created_at).toLocaleDateString()})`);
        } else errors++;
      }
    } else {
      still++;
    }
  }
  console.log(`\n  DONE jobs: fuzzy=${fuzzy} updated=${updated} still_unmatched=${still} errors=${errors}`);
}

await fuzzyQuotes();
await fuzzyJobs();
