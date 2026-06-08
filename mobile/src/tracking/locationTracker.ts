/**
 * Branch Manager — Always-On Location Tracker (native, background)
 *
 * "I want to be tracked everywhere" + "just verify hours at end of day once I
 * leave the geofence." So: track silently all day, and when you LEAVE the yard
 * for home at day's end, fire a notification asking you to CONFIRM the hours we
 * reconstructed from the track. No manual clock-in/out.
 *
 *   • crew_locations  — upsert one LIVE row per user (dispatch map).
 *   • location_pings  — append-only HISTORY (feeds dayHours reconstruction).
 *
 * RLS: every write goes through the app's session-authenticated `supabase`
 * client. No service role. Requires a DEV/STANDALONE build (not Expo Go).
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import {
  PREF_KEY,
  DEFAULT_BASE_RADIUS_M,
  type Identity,
  getIdentity,
  setIdentity,
  getBase,
  setBase,
  getDayState,
  setDayState,
  setPendingVerify,
  haversineM,
  localDateStr,
} from './trackingStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../api/supabase';

export const LOCATION_TASK = 'bm-background-location';

/** Fire the end-of-day "verify your hours" prompt (once per day). */
async function fireVerifyPrompt(date: string) {
  await setPendingVerify(date);
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Verify today's hours",
        body: 'Tap to confirm the hours we tracked for you today.',
        data: { type: 'verify_hours', date },
      },
      trigger: null, // immediate
    });
  } catch {
    /* notification perms may be off; the in-app banner still covers it */
  }
}

/**
 * Geofence bookkeeping per fix. Detects the end-of-day departure: you left the
 * yard in the morning (sawAway), came back at some point (sawReturn), then left
 * again — that final exit = heading home → prompt to verify.
 */
async function updateGeofenceState(lat: number, lng: number) {
  const base = await getBase();
  if (!base) return; // no yard set → can't do geofence end-of-day; app-open check covers it
  const inside = haversineM(lat, lng, base.lat, base.lng) <= base.radius;
  const today = localDateStr();

  let st = await getDayState();
  if (!st || st.date !== today) {
    st = { date: today, sawAway: false, sawReturn: false, notified: false, lastInside: inside };
    await setDayState(st);
    return;
  }

  if (st.lastInside !== inside) {
    if (st.lastInside && !inside) {
      // Left the base.
      if (st.sawAway && st.sawReturn && !st.notified) {
        await fireVerifyPrompt(today);
        st.notified = true;
      } else {
        st.sawAway = true; // morning departure
      }
    } else if (!st.lastInside && inside) {
      // Returned to base.
      if (st.sawAway) st.sawReturn = true;
    }
  }
  st.lastInside = inside;
  await setDayState(st);
}

/** Background task — registered at import so iOS can deliver fixes while suspended. */
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.warn('[tracker] task error:', error.message);
    return;
  }
  const locations: Location.LocationObject[] = data?.locations || [];
  if (!locations.length) return;

  const id = await getIdentity();
  if (!id) return;

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

  // End-of-day geofence check on the freshest fix.
  await updateGeofenceState(last.coords.latitude, last.coords.longitude).catch(() => {});
});

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

/** Capture the current location as the yard/base geofence. */
export async function setBaseToCurrentLocation(label = 'Yard'): Promise<{ ok: boolean; reason?: string }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { ok: false, reason: 'Location permission denied.' };
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    await setBase({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      radius: DEFAULT_BASE_RADIUS_M,
      label,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'Could not get current location.' };
  }
}

export async function startTracking(user: {
  id: string;
  name: string;
  role: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { ok: false, reason: 'Location permission denied.' };
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') {
    return { ok: false, reason: 'Set Location to "Always" in iOS Settings to be tracked in the background.' };
  }

  const tenantId = await resolveTenantId(user.id);
  const identity: Identity = {
    userId: user.id,
    userName: user.name,
    role: user.role,
    tenantId,
    sessionId: `${user.id}:${user.role}`,
  };
  await setIdentity(identity);
  await AsyncStorage.setItem(PREF_KEY, '1');

  if (!(await isTrackingRunning())) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 60_000,
      distanceInterval: 50,
      deferredUpdatesInterval: 60_000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService: {
        notificationTitle: 'Branch Manager',
        notificationBody: 'Tracking your work location.',
        notificationColor: '#1b5e20',
      },
    });
  }
  return { ok: true };
}

export async function stopTracking(): Promise<void> {
  await AsyncStorage.setItem(PREF_KEY, '0');
  try {
    if (await isTrackingRunning()) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch (e: any) {
    console.warn('[tracker] stop failed:', e?.message);
  }
}

export async function resumeTrackingIfEnabled(
  user: { id: string; name: string; role: string } | null
): Promise<void> {
  if (!user) return;
  if (!(await isTrackingEnabled())) return;
  if (await isTrackingRunning()) return;
  await startTracking(user).catch(() => {});
}
