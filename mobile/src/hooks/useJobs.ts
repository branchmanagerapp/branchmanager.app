import { useQuery } from '@tanstack/react-query';
import { fetchTodayJobs, fetchUpcomingJobs } from '../api/jobs';

export function useTodayJobs() {
  return useQuery({
    queryKey: ['jobs', 'today'],
    queryFn: fetchTodayJobs,
    staleTime: 2 * 60 * 1000,
  });
}

export function useUpcomingJobs(limit: number = 10) {
  return useQuery({
    queryKey: ['jobs', 'upcoming', limit],
    queryFn: () => fetchUpcomingJobs(limit),
    staleTime: 5 * 60 * 1000,
  });
}
