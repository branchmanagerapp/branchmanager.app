import { supabase } from './supabase';
import type { Client } from '../models/types';

export async function fetchClients(limit: number = 50): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapClient);
}

export async function searchClients(query: string): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .or(`name.ilike.%${query}%,address.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
    .order('updated_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data || []).map(mapClient);
}

export async function fetchClient(id: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return mapClient(data);
}

export async function createClient(client: Partial<Client>): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      name: client.name,
      company: client.company,
      phone: client.phone,
      email: client.email,
      address: client.address,
      status: client.status || 'lead',
      tags: client.tags || [],
    })
    .select()
    .single();
  if (error) throw error;
  return mapClient(data);
}

export async function updateClient(id: string, changes: Partial<Client>): Promise<void> {
  const { error } = await supabase.from('clients').update(changes).eq('id', id);
  if (error) throw error;
}

function mapClient(row: any): Client {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    address: row.address || '',
    phone: row.phone,
    email: row.email,
    status: row.status || 'lead',
    tags: row.tags,
  };
}
