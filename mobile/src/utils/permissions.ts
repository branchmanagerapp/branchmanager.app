import type { RoleKey, PermissionKey } from '../models/types';

// Permissions explicitly DENIED per role. Everything else is allowed by default.
// super_admin and owner always have full access.
const DENIED: Partial<Record<RoleKey, PermissionKey[]>> = {
  admin: [
    'system.manage_permissions',
    'employees.terminate',
  ],
  manager: [
    'system.manage_permissions',
    'system.manage_settings',
    'employees.terminate',
    'employees.change_pay_rates',
    'payroll.trigger',
    'payroll.fix_errors',
  ],
  payroll_admin: [
    'system.manage_permissions',
    'system.manage_settings',
    'employees.terminate',
    'employees.add',
    'timesheets.delete_hours',
  ],
  accountant: [
    'timesheets.edit_hours',
    'timesheets.approve_hours',
    'timesheets.delete_hours',
    'employees.add',
    'employees.terminate',
    'employees.assign_roles',
    'system.manage_permissions',
    'system.manage_settings',
  ],
  hr_manager: [
    'payroll.trigger',
    'payroll.fix_errors',
    'system.manage_permissions',
    'system.manage_settings',
  ],
  crew_lead: [
    'payroll.trigger',
    'payroll.fix_errors',
    'payroll.sync_gusto',
    'employees.add',
    'employees.terminate',
    'employees.change_pay_rates',
    'employees.assign_roles',
    'system.manage_settings',
    'system.manage_permissions',
  ],
  crew_member: [
    'timesheets.edit_hours',
    'timesheets.approve_hours',
    'timesheets.delete_hours',
    'payroll.view_summary',
    'payroll.trigger',
    'payroll.view_reports',
    'payroll.fix_errors',
    'payroll.sync_gusto',
    'payroll.view_gusto_status',
    'employees.add',
    'employees.edit_info',
    'employees.change_pay_rates',
    'employees.terminate',
    'employees.assign_roles',
    'system.manage_settings',
    'system.manage_permissions',
    'system.manage_overtime',
    'system.manage_schedules',
    'system.manage_job_codes',
    'system.manage_notifications',
  ],
  employee: [
    'timesheets.edit_hours',
    'timesheets.approve_hours',
    'timesheets.delete_hours',
    'payroll.view_summary',
    'payroll.trigger',
    'payroll.view_reports',
    'payroll.fix_errors',
    'payroll.sync_gusto',
    'payroll.view_gusto_status',
    'employees.add',
    'employees.edit_info',
    'employees.change_pay_rates',
    'employees.terminate',
    'employees.assign_roles',
    'system.manage_settings',
    'system.manage_permissions',
    'system.manage_overtime',
    'system.manage_schedules',
    'system.manage_job_codes',
    'system.manage_notifications',
  ],
};

export function can(role: RoleKey, permission: PermissionKey): boolean {
  if (role === 'super_admin' || role === 'owner') return true;
  const denied = DENIED[role];
  if (!denied) return true;
  return !denied.includes(permission);
}

export function canAny(role: RoleKey, permissions: PermissionKey[]): boolean {
  return permissions.some(p => can(role, p));
}

export function canAll(role: RoleKey, permissions: PermissionKey[]): boolean {
  return permissions.every(p => can(role, p));
}
