/**
 * Shared persistence + geo helpers for location tracking. Kept separate so the
 * background task (locationTracker), the day reconstruction (dayHours), and the
 * UI (VerifyHoursScreen, Settings) all read/write the same keys without import
 * cycles.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PREF_KEY = 'bm-track-everywhere';      // '1' = tracking enabled
export const IDENTITY_KEY = 'bm-track-identity';    // who the pings belong to
export const BASE_KEY = 'bm-track-base';            // the yard/home geofence
export const DAYSTATE_KEY = 'bm-track-daystate';    // per-day geofence transition state
export const VERIFY_PENDING_KEY = 'bm-verify-pending'; // 'YYYY-MM-DD' awaiting confirmation
export const VERIFY_HANDLED_KEY = 'bm-verify-handled'; // 'YYYY-MM-DD' already confirmed/dismissed

export const DEFAULT_BASE_RADIUS_M = 150;

export type Identity = {
  userId: string;
  userName: string;
  role: string;
  tenantId: string | null;
  sessionId: string;
};

export type Base = { lat: number; lng: number; radius: number; label?: string };

export type DayState = {
  date: string;        // local YYYY-MM-DD this state covers
  sawAway: boolean;    // left base at least once (work started)
  sawReturn: boolean;  // came back to base after being away
  notified: boolean;   // end-of-day verify already fired today
  lastInside: boolean; // was the most recent fix inside the base radius
};

/** Local calendar date (not UTC) so a workday maps to the right day. */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Meters between two lat/lng points. */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function getIdentity(): Promise<Identity | null> {
  try {
    const raw = await AsyncStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}
export async function setIdentity(id: Identity): Promise<void> {
  await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(id));
}

export async function getBase(): Promise<Base | null> {
  try {
    const raw = await AsyncStorage.getItem(BASE_KEY);
    return raw ? (JSON.parse(raw) as Base) : null;
  } catch {
    return null;
  }
}
export async function setBase(base: Base): Promise<void> {
  await AsyncStorage.setItem(BASE_KEY, JSON.stringify(base));
}

export async function getDayState(): Promise<DayState | null> {
  try {
    const raw = await AsyncStorage.getItem(DAYSTATE_KEY);
    return raw ? (JSON.parse(raw) as DayState) : null;
  } catch {
    return null;
  }
}
export async function setDayState(s: DayState): Promise<void> {
  await AsyncStorage.setItem(DAYSTATE_KEY, JSON.stringify(s));
}

export async function getPendingVerify(): Promise<string | null> {
  return AsyncStorage.getItem(VERIFY_PENDING_KEY);
}
export async function setPendingVerify(date: string | null): Promise<void> {
  if (date) await AsyncStorage.setItem(VERIFY_PENDING_KEY, date);
  else await AsyncStorage.removeItem(VERIFY_PENDING_KEY);
}

export async function getHandledVerify(): Promise<string | null> {
  return AsyncStorage.getItem(VERIFY_HANDLED_KEY);
}
/** Mark a day's hours as confirmed or dismissed so we stop prompting for it. */
export async function setHandledVerify(date: string): Promise<void> {
  await AsyncStorage.setItem(VERIFY_HANDLED_KEY, date);
  await AsyncStorage.removeItem(VERIFY_PENDING_KEY);
}
