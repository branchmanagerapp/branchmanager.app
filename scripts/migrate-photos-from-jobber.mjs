#!/usr/bin/env node
/**
 * Migrate Jobber-hosted photos into Supabase.
 *
 * Why: every quote/job photo in BM is currently a `photoUrl` pointing at
 * Jobber's CloudFront (d3c880upivypdk.cloudfront.net). If Jobber ever
 * closes the account, every photo vanishes. Move them to our own bucket
 * and rewrite the JSONB references so BM owns its data.
 *
 * What it does:
 *   1. Fetches every quotes.line_items / jobs.line_items from Supabase
 *   2. For each item with a Jobber CloudFront URL:
 *        - downloads the JPEG
 *        - uploads to the `job-photos` bucket under a stable path
 *        - replaces photoUrl with the new Supabase public URL
 *        - inserts a row in the `photos` table for the viewer page
 *   3. Idempotent: checks storage existence + skips already-rewritten rows.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-photos-from-jobber.mjs
 *   (also: --dry to just count, --limit=N to cap)
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const DRY   = !!args.dry;
const LIMIT = args.limit ? parseInt(args.limit, 10) : Infinity;
const BUCKET = 'job-photos';
const TENANT_ID = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5';

const H = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' };

async function sbSelect(path) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: H });
  if (!r.ok) throw new Error('select ' + path + ' → ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}
async function sbUpdate(table, id, body) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + id, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('update ' + table + ' ' + id + ' → ' + r.status + ' ' + (await r.text()).slice(0, 200));
}
async function sbInsertPhoto(row) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/photos', {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(row)
  });
  if (!r.ok && r.status !== 409) {
    const t = await r.text();
    if (!/duplicate key/i.test(t)) throw new Error('photos insert → ' + r.status + ' ' + t.slice(0, 200));
  }
}
async function storageUpload(path, buf, contentType) {
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: buf
  });
  if (!r.ok) throw new Error('storage upload → ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + path;
}

// Extract stable-ish filename from Jobber CloudFront URL (base64-encoded JSON payload contains the key)
function parseJobberUrl(url) {
  try {
    const u = new URL(url);
    if (!u.host.endsWith('cloudfront.net')) return null;
    const b64 = u.pathname.replace(/^\//, '');
    const decoded = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    const key = decoded.key || '';
    const parts = key.split('/');
    const fname = parts[parts.length - 1] || ('unknown-' + Date.now() + '.jpg');
    const id = parts[parts.length - 2] || ('anon-' + Date.now());
    return { key, fname, id, ext: (fname.split('.').pop() || 'jpg').toLowerCase() };
  } catch (e) { return null; }
}

const MIME_BY_EXT = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', heic:'image/heic' };
async function downloadBuf(url, fallbackExt) {
  // Retry on transient 5xx (Jobber CloudFront occasionally 502s)
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status >= 500) { lastErr = new Error('status ' + r.status); await new Promise(res => setTimeout(res, 1500)); continue; }
      if (!r.ok) throw new Error('download → ' + r.status);
      const ab = await r.arrayBuffer();
      // Pin content-type by file extension — CloudFront returns types Supabase storage rejects
      const ct = MIME_BY_EXT[(fallbackExt || 'jpg').toLowerCase()] || 'image/jpeg';
      return { buf: Buffer.from(ab), ct };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// ── main ───────────────────────────────────────────────────────────────────
async function processTable(table, parentIdKey) {
  console.log('\n═══ ' + table + ' ═══');
  const rows = await sbSelect(table + '?select=id,' + parentIdKey + ',line_items&order=created_at.desc');
  let rowsScanned = 0, itemsFound = 0, rewritten = 0, uploaded = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    if (rowsScanned >= LIMIT) break;
    rowsScanned++;
    if (!Array.isArray(row.line_items) || !row.line_items.length) continue;
    let changed = false;
    const newItems = [];
    for (let idx = 0; idx < row.line_items.length; idx++) {
      const it = { ...row.line_items[idx] };
      const url = it.photoUrl;
      if (!url || typeof url !== 'string') { newItems.push(it); continue; }
      itemsFound++;
      if (url.includes(SUPABASE_URL)) { newItems.push(it); skipped++; continue; } // already migrated
      const meta = parseJobberUrl(url);
      if (!meta) { newItems.push(it); failed++; continue; }
      const path = table + '/' + row.id + '/' + idx + '-' + meta.fname;
      try {
        if (DRY) {
          console.log('  DRY ' + table + ' ' + row.id + ' item ' + idx + ' → ' + path);
          newItems.push(it); continue;
        }
        // x-upsert is on, so re-uploading the same key is a no-op write —
        // cheaper than the round-trip a HEAD pre-check would cost. The
        // up-front "already migrated" guard above (line ~126) already
        // skips rows whose photoUrl points at Supabase.
        const { buf, ct } = await downloadBuf(url, meta.ext);
        const publicUrl = await storageUpload(path, buf, ct);
        uploaded++;
        it.photoUrl = publicUrl;
        it._originalPhotoUrl = url; // keep as audit trail
        changed = true;
        rewritten++;
        // Insert row in photos table so BM's photo viewer finds it
        await sbInsertPhoto({
          tenant_id: TENANT_ID,
          record_type: table === 'quotes' ? 'quote' : 'job',
          record_id: row.id,
          url: publicUrl,
          storage_path: path,
          name: meta.fname,
          label: it.service || it.description || null
        });
        if (uploaded % 25 === 0) console.log('  …uploaded ' + uploaded);
      } catch (e) {
        failed++;
        console.warn('  ! ' + table + ' ' + row.id + '[' + idx + ']: ' + e.message);
        newItems.push(row.line_items[idx]); // keep original on failure
        continue;
      }
      newItems.push(it);
    }
    if (changed && !DRY) await sbUpdate(table, row.id, { line_items: newItems });
  }
  console.log('[' + table + '] rows=' + rowsScanned + ' itemsWithPhoto=' + itemsFound + ' uploaded=' + uploaded + ' alreadyInSupabase=' + skipped + ' rewritten=' + rewritten + ' failed=' + failed);
}

(async () => {
  const t0 = Date.now();
  await processTable('quotes', 'quote_number');
  await processTable('jobs',   'job_number');
  console.log('\nDone in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
})().catch(e => { console.error(e); process.exit(1); });
