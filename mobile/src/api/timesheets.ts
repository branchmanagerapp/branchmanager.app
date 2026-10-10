import { supabase } from './supabase';
import type { HourEntry } from '../models/types';

export async function fetchTimeEntries(startDate: string, endDate: string): Promise<HourEntry[]> {
  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');
  if (error) throw error;
  return (data || []).map(row => ({
    id: row.id,
    employeeId: row.employee_id || row.user_id,
    date: row.date,
    clockIn: row.clock_in,
    clockOut: row.clock_out,
    hours: row.hours || 0,
    type: row.type || 'regular',
    jobId: row.job_id,
    notes: row.notes,
    photos: row.photos,
    createdAt: row.created_at,
  }));
}

export async function clockIn(employeeId: string, jobId?: string): Promise<HourEntry> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      employee_id: employeeId,
      date: now.split('T')[0],
      clock_in: now,
      hours: 0,
      type: 'regular',
      job_id: jobId,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    employeeId: data.employee_id,
    date: data.date,
    clockIn: data.clock_in,
    hours: 0,
    type: 'regular',
    jobId: data.job_id,
  };
}

export async function clockOut(entryId: string): Promise<void> {
  const now = new Date().toISOString();
  // Fetch entry to calculate hours
  const { data: entry } = await supabase
    .from('time_entries')
    .select('clock_in')
    .eq('id', entryId)
    .single();

  const hours = entry?.clock_in
    ? Math.round(((new Date(now).getTime() - new Date(entry.clock_in).getTime()) / 3600000) * 100) / 100
    : 0;

  const { error } = await supabase
    .from('time_entries')
    .update({ clock_out: now, hours })
    .eq('id', entryId);
  if (error) throw error;
}

export async function addHours(entry: Omit<HourEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
  const { error } = await supabase
    .from('time_entries')
    .insert({
      employee_id: entry.employeeId,
      date: entry.date,
      clock_in: entry.clockIn,
      clock_out: entry.clockOut,
      hours: entry.hours,
      type: entry.type || 'regular',
      job_id: entry.jobId,
      notes: entry.notes,
    });
  if (error) throw error;
}
