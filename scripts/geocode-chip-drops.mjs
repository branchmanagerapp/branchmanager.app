#!/usr/bin/env node
/**
 * Geocode chip_drop_spots that have an address but no lat/lng.
 *
 * Uses OpenStreetMap Nominatim (free, no key, 1 req/sec rate limit per their
 * usage policy). Idempotent — only touches rows where lat IS NULL. Polite —
 * waits 1100ms between calls. Identifies the User-Agent per Nominatim policy.
 */
const SUPABASE_URL = 'https://ltpivkqahvplapyagljt.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI';

const headers = {
  apikey:        ANON_KEY,
  Authorization: 'Bearer ' + ANON_KEY,
  'Content-Type':'application/json'
};

async function fetchUngeocoded() {
  const url = SUPABASE_URL + '/rest/v1/chip_drop_spots?select=id,name,address&lat=is.null&address=not.is.null&address=neq.';
  const r = await fetch(url, { headers });
  return r.ok ? await r.json() : [];
}

// Doug's Tree Sheet has many addresses without ", NY" — geocoders default
// to disambiguating to whatever's most populous globally. Append NY when
// the address looks like it lacks a state/country, to bias toward Westchester/
// Putnam/Orange/Dutchess. (Caught Apr 30 when "19 Woodlawn Dr, Carmel"
// resolved to Carmel, IN instead of Carmel, NY.)
function biasToNY(addr) {
  if (/\b(NY|New York|N\.Y\.)\b/i.test(addr)) return addr;
  if (/USA|United States/i.test(addr)) return addr;
  return addr + ', NY';
}

async function geocode(addr, retries = 3) {
  const biased = biasToNY(addr);
  const u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=' + encodeURIComponent(biased);
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'BranchManager/1.0 (+https://branchmanager.app)' } });
      if (!r.ok) {
        if (r.status === 429 || r.status === 503) { await sleep(5000 * (i + 1)); continue; }
        return null;
      }
      const j = await r.json();
      if (!Array.isArray(j) || !j.length) return null;
      const lat = parseFloat(j[0].lat), lng = parseFloat(j[0].lon);
      // Sanity check: SNT operates in Westchester/Putnam/Orange/Dutchess/Rockland.
      // Reject anything outside the broad NY metro bounding box — false matches
      // (Carmel IN, etc.) get filtered here instead of polluting the table.
      if (lat < 40.4 || lat > 42.4 || lng < -75 || lng > -72.5) return null;
      return { lat, lng };
    } catch (e) {
      // Network blip or rate-limit drop — back off and retry
      await sleep(3000 * (i + 1));
    }
  }
  return null;
}

async function patch(id, lat, lng) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/chip_drop_spots?id=eq.' + id, {
    method: 'PATCH',
    headers: Object.assign({}, headers, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ lat, lng, updated_at: new Date().toISOString() })
  });
  return r.ok;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

(async () => {
  const rows = await fetchUngeocoded();
  console.log('Geocoding ' + rows.length + ' ungeocoded chip drop spots via Nominatim (1 req/sec)…\n');
  let ok = 0, miss = 0, fail = 0;
  for (const row of rows) {
    try {
      const g = await geocode(row.address);
      if (!g) { console.log('  ❓ ' + row.name + ' — no result for: ' + row.address); miss++; }
      else {
        const upd = await patch(row.id, g.lat, g.lng);
        if (upd) { console.log('  ✅ ' + row.name + ' → ' + g.lat.toFixed(4) + ',' + g.lng.toFixed(4)); ok++; }
        else     { console.log('  ❌ ' + row.name + ' — patch failed'); fail++; }
      }
    } catch (e) {
      console.log('  💥 ' + row.name + ' — ' + e.message);
      fail++;
    }
    await sleep(1500); // Nominatim policy: ≤1 req/sec; 1.5s gives breathing room
  }
  console.log('\nDone. ' + ok + ' geocoded · ' + miss + ' no-result · ' + fail + ' errors.');
})();
