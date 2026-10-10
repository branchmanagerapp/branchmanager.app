import { supabase } from './supabase';
import type { Job } from '../models/types';

export async function fetchTodayJobs(): Promise<Job[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('scheduled_date', today)
    .order('scheduled_date');
  if (error) throw error;
  return (data || []).map(mapJob);
}

export async function fetchUpcomingJobs(limit: number = 10): Promise<Job[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .gte('scheduled_date', today)
    .neq('status', 'completed')
    .neq('status', 'cancelled')
    .order('scheduled_date')
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapJob);
}

export async function fetchJob(id: string): Promise<Job | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return mapJob(data);
}

export async function fetchJobsByDate(date: string): Promise<Job[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('scheduled_date', date)
    .order('start_time');
  if (error) throw error;
  return (data || []).map(mapJob);
}

export async function updateJobStatus(id: string, status: string): Promise<void> {
  const updates: any = { status };
  if (status === 'completed') updates.completed_date = new Date().toISOString().split('T')[0];
  const { error } = await supabase.from('jobs').update(updates).eq('id', id);
  if (error) throw error;
}

export async function updateJob(id: string, changes: Partial<Job>): Promise<void> {
  const mapped: any = {};
  if (changes.description !== undefined) mapped.description = changes.description;
  if (changes.notes !== undefined) mapped.notes = changes.notes;
  if (changes.crew !== undefined) mapped.crew = changes.crew;
  if (changes.scheduledDate !== undefined) mapped.scheduled_date = changes.scheduledDate;
  if (changes.status !== undefined) mapped.status = changes.status;
  if (changes.photos !== undefined) mapped.photos = changes.photos;
  const { error } = await supabase.from('jobs').update(mapped).eq('id', id);
  if (error) throw error;
}

export async function createJob(job: Partial<Job>): Promise<Job> {
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      client_id: job.clientId,
      client_name: job.clientName,
      property: job.property,
      description: job.description,
      scheduled_date: job.scheduledDate,
      status: job.status || 'scheduled',
      total: job.total || 0,
      crew: job.crew || [],
      notes: job.notes,
    })
    .select()
    .single();
  if (error) throw error;
  return mapJob(data);
}

function mapJob(row: any): Job {
  return {
    id: row.id,
    jobNumber: row.job_number,
    clientId: row.client_id,
    clientName: row.client_name,
    property: row.property || row.address,
    description: row.description,
    scheduledDate: row.scheduled_date,
    status: row.status,
    total: row.total || 0,
    crew: row.crew || [],
    notes: row.notes,
    photos: row.photos,
  };
}
