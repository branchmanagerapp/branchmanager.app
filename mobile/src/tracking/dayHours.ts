/**
 * Reconstruct a work day from the background location track, so the owner only
 * has to VERIFY hours instead of clocking in/out.
 *
 * Work span = from the first location fix that's away from base (left the yard /
 * arrived at work) to the last fix away from base (last thing before heading
 * home). If no base is set, falls back to first→last fix of the day.
 *
 * The estimate is intentionally simple + transparent — the user confirms or
 * edits it on the Verify screen, then we write one complete time_entry.
 */
import { supabase } from '../api/supabase';
import {
  getBase, getIdentity, haversineM, localDateStr,
  getPendingVerify, setPendingVerify, getHandledVerify,
} from './trackingStore';

export type DaySpan = {
  date: string;            // local YYYY-MM-DD
  clockIn: string | null;  // ISO
  clockOut: string | null; // ISO
  hours: number;           // decimal hours, rounded to 0.25
  fixes: number;           // how many GPS fixes informed it
  awayFixes: number;       // fixes counted as "at work" (away from base)
};

function roundQuarter(h: number): number {
  return Math.round(h * 4) / 4;
}

/** Pull today's pings for the signed-in user and estimate the work span. */
export async function reconstructDay(dateStr?: string): Promise<DaySpan> {
  const id = await getIdentity();
  const base = await getBase();
  const day = dateStr || localDateStr();
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(`${day}T23:59:59`);

  const empty: DaySpan = { date: day, clockIn: null, clockOut: null, hours: 0, fixes: 0, awayFixes: 0 };
  if (!id) return empty;

  const { data, error } = await supabase
    .from('location_pings')
    .select('lat,lng,client_ts')
    .eq('user_id', id.userId)
    .gte('client_ts', start.toISOString())
    .lte('client_ts', end.toISOString())
    .order('client_ts', { ascending: true });

  if (error || !data || !data.length) return empty;

  // "At work" = away from base. With no base, every fix counts.
  const away = base
    ? data.filter((p: any) => haversineM(p.lat, p.lng, base.lat, base.lng) > base.radius)
    : data;
  const span = away.length ? away : data;

  const clockIn = span[0].client_ts as string;
  const clockOut = span[span.length - 1].client_ts as string;
  const hours = roundQuarter((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3_600_000);

  return {
    date: day,
    clockIn,
    clockOut,
    hours: Math.max(0, hours),
    fixes: data.length,
    awayFixes: away.length,
  };
}

/**
 * Evening safety-net: if it's late in the day, work was tracked, and we haven't
 * already prompted or had the day handled, flag it pending. Covers days you
 * drive straight home (never leave the yard geofence at end of day). Returns the
 * date now pending verification, or null.
 */
export async function maybeFlagEndOfDay(): Promise<string | null> {
  const now = new Date();
  if (now.getHours() < 16) return null; // only consider after 4pm
  const today = localDateStr(now);

  const pending = await getPendingVerify();
  if (pending) return pending;
  if ((await getHandledVerify()) === today) return null; // already confirmed/dismissed today

  const span = await reconstructDay(today);
  if (span.awayFixes > 0 && span.hours > 0) {
    await setPendingVerify(today);
    return today;
  }
  return null;
}

/**
 * Write the confirmed day as a single complete time_entry. `hours` is whatever
 * the user confirmed (possibly edited from the estimate). Idempotent-ish: if a
 * verified entry already exists for this user+date, it updates it.
 */
export async function writeVerifiedDay(span: {
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  hours: number;
  notes?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const id = await getIdentity();
  if (!id) return { ok: false, reason: 'Not signed in.' };

  const row: Record<string, any> = {
    user_id: id.userId,
    user_name: id.userName,
    date: span.date,
    clock_in: span.clockIn,
    clock_out: span.clockOut,
    hours: span.hours,
    notes: span.notes || 'Verified from location track',
  };
  if (id.tenantId) row.tenant_id = id.tenantId;

  try {
    // Replace any prior auto/verified entry for this user+date to avoid dupes.
    const { data: existing } = await supabase
      .from('time_entries')
      .select('id')
      .eq('user_id', id.userId)
      .eq('date', span.date)
      .ilike('notes', '%location track%')
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase.from('time_entries').update(row).eq('id', existing.id);
      if (error) return { ok: false, reason: error.message };
    } else {
      const { error } = await supabase.from('time_entries').insert(row);
      if (error) return { ok: false, reason: error.message };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'Write failed.' };
  }
}
