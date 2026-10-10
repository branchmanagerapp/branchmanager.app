import { supabase } from './supabase';

export interface Invoice {
  id: string;
  invoiceNumber: number;
  clientId: string;
  clientName: string;
  subject: string;
  total: number;
  balance: number;
  status: string;
  dueDate: string;
  paidDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchInvoices(limit: number = 50): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapInvoice);
}

export async function searchInvoices(query: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .or(`client_name.ilike.%${query}%,subject.ilike.%${query}%`)
    .order('updated_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data || []).map(mapInvoice);
}

function mapInvoice(row: any): Invoice {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    clientId: row.client_id,
    clientName: row.client_name || '',
    subject: row.subject || '',
    total: parseFloat(row.total) || 0,
    balance: parseFloat(row.balance) || 0,
    status: row.status || 'draft',
    dueDate: row.due_date,
    paidDate: row.paid_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
