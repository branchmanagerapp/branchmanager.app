import AsyncStorage from '@react-native-async-storage/async-storage';

const APPROVALS_KEY = 'bm-payroll-approvals';

export interface ApprovalState {
  [key: string]: 'approved' | undefined;
}

export async function getApprovals(): Promise<ApprovalState> {
  const raw = await AsyncStorage.getItem(APPROVALS_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function saveApprovals(state: ApprovalState): Promise<void> {
  await AsyncStorage.setItem(APPROVALS_KEY, JSON.stringify(state));
}

export async function approveDay(employeeId: string, date: string): Promise<void> {
  const state = await getApprovals();
  state[`${employeeId}_day_${date}`] = 'approved';
  await saveApprovals(state);
}

export async function approveEmployee(employeeId: string, weekStart: string): Promise<void> {
  const state = await getApprovals();
  state[`${employeeId}_${weekStart}`] = 'approved';
  await saveApprovals(state);
}

export async function approveWeek(employeeIds: string[], weekStart: string): Promise<void> {
  const state = await getApprovals();
  employeeIds.forEach(id => {
    state[`${id}_${weekStart}`] = 'approved';
  });
  await saveApprovals(state);
}

export function isDayApproved(state: ApprovalState, employeeId: string, date: string): boolean {
  return state[`${employeeId}_day_${date}`] === 'approved';
}

export function isEmployeeApproved(state: ApprovalState, employeeId: string, weekStart: string): boolean {
  return state[`${employeeId}_${weekStart}`] === 'approved';
}
