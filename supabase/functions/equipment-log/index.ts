/**
 * Branch Manager — Equipment service log gateway (Oct 27 2026)
 *
 * Backs the crew page branchmanager.app/km100/?k=<key>. The page holds no
 * Supabase key; every read and write comes through here, checked against the
 * EQUIP_LINK_KEY secret, then done with service-role. Tables + private bucket:
 * supabase/migrations/20261027_equipment_log.sql.
 *
 * POST {k, unit, action, ...}
 *   state    → {hours[], checks[], info, photos[{slot,url,...}], files{name:url}}
 *   hours    {h, name}
 *   daily    {date, name, done[], skipped[], note, hours}
 *   service  {milestone, label, date, hours, name, done[], skipped[], note}
 *   info     {data:{serial, year, engineSerial, startHours}}
 *   photoUrl {slot}           → {path, uploadUrl}   (PUT the JPEG there)
 *   photoAdd {slot, path, name}
 *
 * Deploy:
 *   supabase functions deploy equipment-log --no-verify-jwt --project-ref ltpivkqahvplapyagljt
 *   supabase secrets set EQUIP_LINK_KEY=<random> --project-ref ltpivkqahvplapyagljt
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const LINK_KEY     = Deno.env.get('EQUIP_LINK_KEY') ?? '';
const TENANT_ID    = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'; // Second Nature Tree
const BUCKET       = 'equipment-private';
const UNITS        = new Set(['km100']);
const SIGN_SECS    = 6 * 60 * 60;

// Files every unit page can open (paths inside the bucket, under <unit>/).
const UNIT_FILES: Record<string, string[]> = {
  km100: [
    'docs/intrepid-user-manual.pdf', 'docs/km100-parts-book.pdf', 'docs/intrepid-troubleshooting.pdf',
    'img/engine-bay.jpg', 'img/pre-filter.jpg', 'img/grease-daily.jpg', 'img/grease-150.jpg', 'img/dipstick.jpg',
    'img/coolant-tank.jpg', 'img/hyd-sight-glass.jpg', 'img/air-filter-elements.jpg', 'img/hyd-intake-filter.jpg',
  ],
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function sameKey(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 10) / 10 : null; };
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date().toISOString().slice(0, 10));
const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 40).map(x => str(x, 200)).filter(Boolean) : []);

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...H, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`db ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null; // writes use return=minimal → 201 with empty body
}
async function signMany(paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: SIGN_SECS, paths }),
  });
  const out: Record<string, string> = {};
  if (!r.ok) return out;
  for (const s of await r.json()) if (s.signedURL) out[s.path] = `${SUPABASE_URL}/storage/v1${s.signedURL}`;
  return out;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!sameKey(str(b.k, 200), LINK_KEY)) return json({ error: 'bad key' }, 403);
  const unit = str(b.unit, 40);
  if (!UNITS.has(unit)) return json({ error: 'unknown unit' }, 400);
  const u = encodeURIComponent(unit);

  try {
    switch (b.action) {
      case 'state': {
        const [hours, checks, info, photos] = await Promise.all([
          rest(`equipment_hours?equipment_key=eq.${u}&select=hours,reading_date,entered_by,created_at&order=created_at.desc&limit=200`),
          rest(`equipment_checks?equipment_key=eq.${u}&select=kind,milestone,label,check_date,hours,done_by,done,skipped,notes,updated_at&order=check_date.desc,updated_at.desc&limit=300`),
          rest(`equipment_info?equipment_key=eq.${u}&select=data,updated_at`),
          rest(`equipment_photos?equipment_key=eq.${u}&select=slot,storage_path,taken_by,created_at&order=created_at.desc&limit=200`),
        ]);
        const filePaths = (UNIT_FILES[unit] || []).map(p => `${unit}/${p}`);
        const signed = await signMany([...filePaths, ...photos.map((p: any) => p.storage_path)]);
        const files: Record<string, string> = {};
        for (const p of UNIT_FILES[unit] || []) if (signed[`${unit}/${p}`]) files[p] = signed[`${unit}/${p}`];
        return json({
          hours, checks, info: info[0]?.data || {}, files,
          photos: photos.map((p: any) => ({ slot: p.slot, by: p.taken_by, at: p.created_at, url: signed[p.storage_path] || null })),
        });
      }
      case 'hours': {
        const h = num(b.h);
        if (h == null) return json({ error: 'hours required' }, 400);
        await rest('equipment_hours', { method: 'POST', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ tenant_id: TENANT_ID, equipment_key: unit, hours: h, reading_date: day(b.date), entered_by: str(b.name, 80) || null }) });
        return json({ ok: true });
      }
      case 'daily':
      case 'service': {
        const isSvc = b.action === 'service';
        const milestone = isSvc ? Math.round(Number(b.milestone)) : null;
        if (isSvc && !(milestone! > 0 && milestone! <= 20000)) return json({ error: 'milestone required' }, 400);
        const date = day(b.date);
        const row = {
          tenant_id: TENANT_ID, equipment_key: unit, kind: b.action,
          dedupe_key: isSvc ? `${unit}:service:${milestone}` : `${unit}:daily:${date}`,
          milestone, label: str(b.label, 120) || null, check_date: date, hours: num(b.hours),
          done_by: str(b.name, 80) || null, done: list(b.done), skipped: list(b.skipped),
          notes: str(b.note, 2000) || null, updated_at: new Date().toISOString(),
        };
        await rest('equipment_checks?on_conflict=dedupe_key', { method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
        if (isSvc && row.hours != null) {
          await rest('equipment_hours', { method: 'POST', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ tenant_id: TENANT_ID, equipment_key: unit, hours: row.hours, reading_date: date, entered_by: row.done_by }) });
        }
        return json({ ok: true });
      }
      case 'info': {
        const d = b.data || {};
        const data = { serial: str(d.serial, 80), year: str(d.year, 20), engineSerial: str(d.engineSerial, 80), startHours: num(d.startHours) };
        await rest('equipment_info?on_conflict=equipment_key', { method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ equipment_key: unit, tenant_id: TENANT_ID, data, updated_at: new Date().toISOString() }) });
        return json({ ok: true });
      }
      case 'photoUrl': {
        const slot = str(b.slot, 30).replace(/[^a-z0-9_-]/gi, '') || 'other';
        const path = `${unit}/photos/${slot}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;
        const r = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', headers: H });
        if (!r.ok) throw new Error(`sign upload ${r.status}`);
        const s = await r.json();
        return json({ path, uploadUrl: `${SUPABASE_URL}/storage/v1${s.url}` });
      }
      case 'photoAdd': {
        const slot = str(b.slot, 30).replace(/[^a-z0-9_-]/gi, '') || 'other';
        const path = str(b.path, 300);
        if (!path.startsWith(`${unit}/photos/${slot}/`)) return json({ error: 'bad path' }, 400);
        await rest('equipment_photos', { method: 'POST', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ tenant_id: TENANT_ID, equipment_key: unit, slot, storage_path: path, taken_by: str(b.name, 80) || null }) });
        return json({ ok: true });
      }
      default:
        return json({ error: 'unknown action' }, 400);
    }
  } catch (e) {
    console.error('equipment-log', b?.action, String(e));
    return json({ error: 'server' }, 500);
  }
});
