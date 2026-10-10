import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTimeEntries, clockIn, clockOut, addHours } from '../api/timesheets';
import type { HourEntry } from '../models/types';

export function useTimeEntries(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['timeEntries', startDate, endDate],
    queryFn: () => fetchTimeEntries(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, jobId }: { employeeId: string; jobId?: string }) =>
      clockIn(employeeId, jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => clockOut(entryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}

export function useAddHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entry: Omit<HourEntry, 'id' | 'createdAt' | 'updatedAt'>) => addHours(entry),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timeEntries'] });
    },
  });
}
