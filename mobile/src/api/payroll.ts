import { supabase } from './supabase';
import type { PayrollRun, PayrollEmployee } from '../models/types';

export async function getPayrollRun(startDate: string, endDate: string): Promise<PayrollRun | null> {
  // Fetch time entries and team members in parallel
  const [entriesRes, teamRes] = await Promise.all([
    supabase.from('time_entries').select('*').gte('date', startDate).lte('date', endDate),
    supabase.from('team_members').select('id, name, role, rate').eq('active', true),
  ]);

  const entries = entriesRes.data || [];
  const team = teamRes.data || [];
  if (!entries.length && !team.length) return null;

  // Build rate lookup from team_members
  const rateByName: Record<string, { name: string; rate: number }> = {};
  team.forEach((t: any) => {
    rateByName[t.name] = { name: t.name, rate: parseFloat(t.rate) || 0 };
    rateByName[t.id] = { name: t.name, rate: parseFloat(t.rate) || 0 };
  });

  // Group hours by employee
  const byEmployee: Record<string, { hours: number; name: string }> = {};
  entries.forEach((e: any) => {
    const id = e.user_name || e.user_id || e.employee_id || 'unknown';
    if (!byEmployee[id]) byEmployee[id] = { hours: 0, name: e.user_name || rateByName[id]?.name || id };
    byEmployee[id].hours += parseFloat(e.hours) || 0;
  });

  const employees: PayrollEmployee[] = Object.entries(byEmployee).map(([id, data]) => {
    const regular = Math.min(data.hours, 40);
    const overtime = Math.max(0, data.hours - 40);
    const rate = rateByName[id]?.rate || rateByName[data.name]?.rate || 0;
    return {
      employeeId: id,
      name: data.name,
      regularHours: regular,
      overtimeHours: overtime,
      ptoHours: 0,
      rate,
      grossPay: (regular * rate) + (overtime * rate * 1.5),
      approved: false,
    };
  });

  return {
    id: `payroll-${startDate}`,
    startDate,
    endDate,
    employees,
    totalRegular: employees.reduce((s, e) => s + e.regularHours, 0),
    totalOvertime: employees.reduce((s, e) => s + e.overtimeHours, 0),
    totalGross: employees.reduce((s, e) => s + e.grossPay, 0),
    status: 'draft',
  };
}

export async function submitPayroll(runId: string): Promise<boolean> {
  // In production: POST to Gusto API
  console.log('[Payroll] Submitting:', runId);
  return true;
}
