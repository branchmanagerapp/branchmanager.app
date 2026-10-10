import { useQuery, useMutation } from '@tanstack/react-query';
import { getPayrollRun, submitPayroll } from '../api/payroll';

export function usePayrollRun(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['payroll', startDate, endDate],
    queryFn: () => getPayrollRun(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

export function useSubmitPayroll() {
  return useMutation({
    mutationFn: (runId: string) => submitPayroll(runId),
  });
}
