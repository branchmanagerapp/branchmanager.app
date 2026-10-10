import { useQuery } from '@tanstack/react-query';
import { fetchInvoices, searchInvoices } from '../api/invoices';

export function useInvoices(limit?: number) {
  return useQuery({
    queryKey: ['invoices', limit],
    queryFn: () => fetchInvoices(limit),
    staleTime: 5 * 60 * 1000,
  });
}

export function useInvoiceSearch(query: string) {
  return useQuery({
    queryKey: ['invoices', 'search', query],
    queryFn: () => searchInvoices(query),
    enabled: query.length >= 2,
  });
}
