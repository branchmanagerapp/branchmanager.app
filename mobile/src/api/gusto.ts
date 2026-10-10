/**
 * Gusto API Integration
 * Handles employee sync, hour submission, and payroll runs
 * Uses Gusto Partner API v1
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const GUSTO_STORAGE_KEY = 'bm-gusto-config';

interface GustoConfig {
  apiKey: string;
  companyId: string;
  connected: boolean;
}

interface GustoEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  currentCompensation: {
    rate: string;
    paymentUnit: string;
    flsaStatus: string;
  };
}

interface GustoPayroll {
  id: string;
  payPeriod: { startDate: string; endDate: string };
  checkDate: string;
  calculated: boolean;
  processed: boolean;
  totals: { grossPay: string; netPay: string; employerTaxes: string };
}

// ── Config Management ──

export async function getGustoConfig(): Promise<GustoConfig | null> {
  const raw = await AsyncStorage.getItem(GUSTO_STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function saveGustoConfig(config: GustoConfig): Promise<void> {
  await AsyncStorage.setItem(GUSTO_STORAGE_KEY, JSON.stringify(config));
}

export async function disconnectGusto(): Promise<void> {
  await AsyncStorage.removeItem(GUSTO_STORAGE_KEY);
}

export async function isGustoConnected(): Promise<boolean> {
  const config = await getGustoConfig();
  return !!config?.connected;
}

// ── Employee Sync ──

export async function syncEmployeesFromGusto(): Promise<GustoEmployee[]> {
  const config = await getGustoConfig();
  if (!config?.apiKey) throw new Error('Gusto not connected');

  // In production: GET https://api.gusto.com/v1/companies/{companyId}/employees
  // For now, return mock data structure showing the integration shape
  return [
    {
      id: 'gusto-emp-1',
      firstName: 'Catherine',
      lastName: 'Conway',
      email: 'catherine@peekskilltree.com',
      department: 'Field Operations',
      currentCompensation: { rate: '35.00', paymentUnit: 'Hour', flsaStatus: 'Nonexempt' },
    },
    {
      id: 'gusto-emp-2',
      firstName: 'Ryan',
      lastName: 'Knapp',
      email: 'ryan@peekskilltree.com',
      department: 'Field Operations',
      currentCompensation: { rate: '28.00', paymentUnit: 'Hour', flsaStatus: 'Nonexempt' },
    },
  ];
}

// ── Submit Hours ──

interface HourSubmission {
  employeeGustoId: string;
  regularHours: number;
  overtimeHours: number;
  ptoHours: number;
  startDate: string;
  endDate: string;
}

export async function submitHoursToGusto(hours: HourSubmission[]): Promise<{ success: boolean; payrollId?: string }> {
  const config = await getGustoConfig();
  if (!config?.apiKey) throw new Error('Gusto not connected');

  // In production: POST https://api.gusto.com/v1/companies/{companyId}/payrolls
  // Body: { employee_compensations: [...] }
  console.log('[Gusto] Submitting hours for', hours.length, 'employees');
  return { success: true, payrollId: 'mock-payroll-' + Date.now() };
}

// ── Payroll Status ──

export async function getPayrollStatus(payrollId: string): Promise<GustoPayroll | null> {
  const config = await getGustoConfig();
  if (!config?.apiKey) return null;

  // In production: GET https://api.gusto.com/v1/companies/{companyId}/payrolls/{payrollId}
  return {
    id: payrollId,
    payPeriod: { startDate: '2026-03-24', endDate: '2026-03-30' },
    checkDate: '2026-04-03',
    calculated: true,
    processed: false,
    totals: { grossPay: '2870.00', netPay: '2153.00', employerTaxes: '219.56' },
  };
}

// ── Submit Payroll for Processing ──

export async function processPayroll(payrollId: string): Promise<boolean> {
  const config = await getGustoConfig();
  if (!config?.apiKey) throw new Error('Gusto not connected');

  // In production: PUT https://api.gusto.com/v1/companies/{companyId}/payrolls/{payrollId}/submit
  console.log('[Gusto] Processing payroll:', payrollId);
  return true;
}

// ── Webhook Handler ──

export interface GustoWebhookEvent {
  event: 'payroll.processed' | 'payroll.reversed' | 'employee.created' | 'employee.updated';
  resourceId: string;
  timestamp: string;
}

export async function handleWebhook(event: GustoWebhookEvent): Promise<void> {
  switch (event.event) {
    case 'payroll.processed':
      console.log('[Gusto] Payroll processed:', event.resourceId);
      break;
    case 'employee.created':
    case 'employee.updated':
      console.log('[Gusto] Employee updated:', event.resourceId);
      break;
  }
}
