import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApprovals, approveDay, approveEmployee, approveWeek } from '../api/approvals';

export function useApprovals() {
  return useQuery({
    queryKey: ['approvals'],
    queryFn: getApprovals,
  });
}

export function useApproveDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, date }: { employeeId: string; date: string }) =>
      approveDay(employeeId, date),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals'] }),
  });
}

export function useApproveEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, weekStart }: { employeeId: string; weekStart: string }) =>
      approveEmployee(employeeId, weekStart),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals'] }),
  });
}

export function useApproveWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeIds, weekStart }: { employeeIds: string[]; weekStart: string }) =>
      approveWeek(employeeIds, weekStart),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals'] }),
  });
}
