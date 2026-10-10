import { supabase } from './supabase';

export interface Quote {
  id: string;
  quoteNumber: number;
  clientId: string;
  clientName: string;
  property: string;
  description: string;
  total: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchQuotes(limit: number = 50): Promise<Quote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapQuote);
}

export async function searchQuotes(query: string): Promise<Quote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .or(`client_name.ilike.%${query}%,description.ilike.%${query}%`)
    .order('updated_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data || []).map(mapQuote);
}

function mapQuote(row: any): Quote {
  return {
    id: row.id,
    quoteNumber: row.quote_number,
    clientId: row.client_id,
    clientName: row.client_name || '',
    property: row.property || '',
    description: row.description || '',
    total: parseFloat(row.total) || 0,
    status: row.status || 'draft',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
