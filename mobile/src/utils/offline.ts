/**
 * Offline queue — stores actions when offline, syncs when back online
 * Critical for crew in the field with spotty service
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../api/supabase';

const QUEUE_KEY = 'bm-offline-queue';

interface QueuedAction {
  id: string;
  table: string;
  type: 'insert' | 'update' | 'delete';
  data: any;
  recordId?: string;
  createdAt: string;
}

// ── Queue Management ──

export async function getQueue(): Promise<QueuedAction[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveQueue(queue: QueuedAction[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueue(action: Omit<QueuedAction, 'id' | 'createdAt'>): Promise<void> {
  const queue = await getQueue();
  queue.push({
    ...action,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    createdAt: new Date().toISOString(),
  });
  await saveQueue(queue);
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

// ── Connectivity Check ──

export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected === true;
  } catch {
    return true; // Assume online if check fails
  }
}

// ── Sync Queue ──

export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const online = await isOnline();
  if (!online) return { synced: 0, failed: 0 };

  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: QueuedAction[] = [];

  for (const action of queue) {
    try {
      switch (action.type) {
        case 'insert': {
          const { error } = await supabase.from(action.table).insert(action.data);
          if (error) throw error;
          break;
        }
        case 'update': {
          if (!action.recordId) throw new Error('No record ID for update');
          const { error } = await supabase.from(action.table).update(action.data).eq('id', action.recordId);
          if (error) throw error;
          break;
        }
        case 'delete': {
          if (!action.recordId) throw new Error('No record ID for delete');
          const { error } = await supabase.from(action.table).delete().eq('id', action.recordId);
          if (error) throw error;
          break;
        }
      }
      synced++;
    } catch (e) {
      console.warn('[Offline] Sync failed for action:', action.id, e);
      remaining.push(action);
      failed++;
    }
  }

  await saveQueue(remaining);
  return { synced, failed };
}

// ── Smart Write (online → direct, offline → queue) ──

export async function smartInsert(table: string, data: any): Promise<any> {
  const online = await isOnline();
  if (online) {
    const { data: result, error } = await supabase.from(table).insert(data).select().single();
    if (error) throw error;
    return result;
  }
  await enqueue({ table, type: 'insert', data });
  return { ...data, id: 'offline-' + Date.now(), _offline: true };
}

export async function smartUpdate(table: string, id: string, data: any): Promise<void> {
  const online = await isOnline();
  if (online) {
    const { error } = await supabase.from(table).update(data).eq('id', id);
    if (error) throw error;
    return;
  }
  await enqueue({ table, type: 'update', data, recordId: id });
}
