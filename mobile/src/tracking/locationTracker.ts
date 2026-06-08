/**
 * Branch Manager — Always-On Location Tracker (native, background)
 *
 * "I want to be tracked everywhere." This is the piece a PWA cannot do: with the
 * native app + the iOS "Always" location permission, the OS wakes the app for
 * location events even when it's backgrounded / screen-off / in your pocket, and
 * we post each fix to Supabase.
 *
 *   • crew_locations  — upsert one LIVE row per user (powers the dispatch "where
 *                       is everyone now" map). onConflict: user_id.
 *   • location_pings  — append-only HISTORY (powers "where was I all day" — the
 *                       day reconstruction so forgetting to clock in stops mattering).
 *
 * RLS: every write goes through the app's session-authenticated `supabase`
 * client (persisted in AsyncStorage, auto-refreshed). No service role, ever.
 * tenant_id is DB-defaulted on crew_locations; we also stash + send it explicitly.
 *
 * Requires a DEV/STANDALONE build (EAS) — background location + TaskManager do
 * NOT work in Expo Go. See app.json (UIBackgroundModes, Always usage strings).
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../api/supabase';

export const LOCATION_TASK = 'bm-background-location';
const PREF_KEY = 'bm-track-everywhere';      // '1' = tracking enabled
const IDENTITY_KEY = 'bm-track-identity';    // { userId, userName, role, tenantId, sessionId }

type Identity = {
  userId: string;
  userName: string;
  role: string;
  tenantId: string | null;
  sessionId: string;
};

async function loadIdentity(): Promise<Identity | null> {
  try {
    const raw = await AsyncStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

/**
 * The background task. Registered at module import (App.tsx imports this file at
 * launch) so iOS can hand it location events while the app is suspended.
 */
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.warn('[tracker] task error:', error.message);
    return;
  }
  const locations: Location.LocationObject[] = data?.locations || [];
  if (!locations.length) return;

  const id = await loadIdentity();
  if (!id) return; // not logged in / identity not stashed — nothing to attribute

  // Append every fix to history (location_pings).
  const pings = locations.map((l) => ({
    tenant_id: id.tenantId,
    user_id: id.userId,
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy_m: l.coords.accuracy ?? null,
    altitude_m: l.coords.altitude ?? null,
    speed_mps: l.coords.speed ?? null,
    heading: l.coords.heading ?? null,
    client_ts: new Date(l.timestamp).toISOString(),
    session_id: id.sessionId,
    source: 'mobile-bg',
  }));

  try {
    await supabase.from('location_pings').insert(pings);
  } catch (e: any) {
    console.warn('[tracker] location_pings insert failed:', e?.message);
  }

  // Upsert the most-recent fix as the live position (crew_locations).
  const last = locations[locations.length - 1];
  try {
    await supabase.from('crew_locations').upsert(
      {
        tenant_id: id.tenantId ?? undefined,
        user_id: id.userId,
        user_name: id.userName,
        role: id.role,
        lat: last.coords.latitude,
        lng: last.coords.longitude,
        accuracy: last.coords.accuracy ?? null,
        heading: last.coords.heading ?? null,
        speed: last.coords.speed ?? null,
        status: 'tracking',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch (e: any) {
    console.warn('[tracker] crew_locations upsert failed:', e?.message);
  }
});

/** Resolve the signed-in user's tenant_id from user_tenants (matches web resolveTenantId). */
async function resolveTenantId(userId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    return data?.tenant_id ?? null;
  } catch {
    return null;
  }
}

export async function isTrackingEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(PREF_KEY)) === '1';
}

export async function isTrackingRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

/**
 * Request permissions and start always-on tracking. Returns a status the UI can
 * surface. Safe to call repeatedly (no-op if already running).
 */
export async function startTracking(user: {
  id: string;
  name: string;
  role: string;
}): Promise<{ ok: boolean; reason?: string }> {
  // 1) Foreground permission (required before background can be asked).
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') {
    return { ok: false, reason: 'Location permission denied.' };
  }
  // 2) Background ("Always") permission — the part that enables pocket/screen-off tracking.
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    return {
      ok: false,
      reason: 'Set Location to "Always" in iOS Settings to be tracked in the background.',
    };
  }

  // 3) Stash identity for the headless task (it has no React context).
  const tenantId = await resolveTenantId(user.id);
  const identity: Identity = {
    userId: user.id,
    userName: user.name,
    role: user.role,
    tenantId,
    // session id varies per start without Date.now collisions; userId+role is stable enough,
    // suffix with a short time slice from the first fix is added server-side via created_at.
    sessionId: `${user.id}:${user.role}`,
  };
  await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  await AsyncStorage.setItem(PREF_KEY, '1');

  // 4) Start the OS-managed updates.
  const already = await isTrackingRunning();
  if (!already) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,   // ~100m, battery-friendly; bump to High for tighter tracks
      timeInterval: 60_000,                    // try for a fix ~every 60s
      distanceInterval: 50,                    // ...or every 50m moved
      deferredUpdatesInterval: 60_000,
      pausesUpdatesAutomatically: false,       // keep going even when stationary
      showsBackgroundLocationIndicator: false, // no blue bar nagging
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService: {                     // Android: required for background location
        notificationTitle: 'Branch Manager',
        notificationBody: 'Tracking your work location.',
        notificationColor: '#1b5e20',
      },
    });
  }
  return { ok: true };
}

/** Stop tracking and clear the preference. */
export async function stopTracking(): Promise<void> {
  await AsyncStorage.setItem(PREF_KEY, '0');
  try {
    if (await isTrackingRunning()) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch (e: any) {
    console.warn('[tracker] stop failed:', e?.message);
  }
}

/**
 * Called on app launch (after auth restore). If the user previously enabled
 * tracking, make sure the OS updates are running again after a cold start.
 */
export async function resumeTrackingIfEnabled(user: {
  id: string;
  name: string;
  role: string;
} | null): Promise<void> {
  if (!user) return;
  if (!(await isTrackingEnabled())) return;
  if (await isTrackingRunning()) return;
  await startTracking(user).catch(() => {});
}
