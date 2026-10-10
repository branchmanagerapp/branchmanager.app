import { supabase } from './supabase';
import type { Employee } from '../models/types';

export async function fetchEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    payRate: row.rate || row.pay_rate || 0,
    role: row.role || 'employee',
    active: row.active !== false,
    gustoId: row.gusto_id,
    createdAt: row.created_at,
  }));
}

export async function fetchEmployee(id: string): Promise<Employee | null> {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    email: data.email,
    payRate: data.rate || data.pay_rate || 0,
    role: data.role || 'employee',
    active: data.active !== false,
    gustoId: data.gusto_id,
    createdAt: data.created_at,
  };
}

export async function updateEmployee(id: string, changes: Partial<Employee>): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .update(changes)
    .eq('id', id);
  if (error) throw error;
}
