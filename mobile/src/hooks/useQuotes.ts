import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchQuotes, searchQuotes, type Quote } from '../api/quotes';

export function useQuotes(limit?: number) {
  return useQuery({
    queryKey: ['quotes', limit],
    queryFn: () => fetchQuotes(limit),
    staleTime: 5 * 60 * 1000,
  });
}

export function useQuoteSearch(query: string) {
  return useQuery({
    queryKey: ['quotes', 'search', query],
    queryFn: () => searchQuotes(query),
    enabled: query.length >= 2,
  });
}
