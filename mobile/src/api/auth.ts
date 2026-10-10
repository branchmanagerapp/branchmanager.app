import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RoleKey } from '../models/types';

const SESSION_KEY = 'bm-mobile-session';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: RoleKey;
}

export async function signIn(email: string, password: string): Promise<UserSession> {
  // Try Supabase auth first
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error && data.user) {
    const session: UserSession = {
      id: data.user.id,
      email: data.user.email || email,
      name: 'Doug Brown',
      role: 'owner',
    };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  // Local auth fallback with djb2 hash
  const hash = djb2Hash(password);
  const users: Record<string, { hash: string; role: RoleKey; name: string }> = {
    'info@peekskilltree.com': { hash: '28006cfd', role: 'owner', name: 'Doug Brown' },
    'crew@peekskilltree.com': { hash: '14b65440', role: 'crew_lead', name: 'Crew Lead' },
    'doug@peekskilltree.com': { hash: '28006cfd', role: 'owner', name: 'Doug Brown' },
  };

  const user = users[email.toLowerCase()];
  if (user && hash === user.hash) {
    const session: UserSession = { id: email, email, name: user.name, role: user.role };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  throw new Error('Invalid email or password');
}

export async function signOut(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
  await supabase.auth.signOut().catch(() => {});
}

export async function getSession(): Promise<UserSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function quickLogin(role: RoleKey): Promise<UserSession> {
  const names: Record<string, string> = {
    owner: 'Doug Brown',
    crew_lead: 'Crew Lead',
    crew_member: 'Crew Member',
  };
  const session: UserSession = {
    id: role + '-demo',
    email: role + '@demo',
    name: names[role] || role,
    role,
  };
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return (hash >>> 0).toString(16);
}
