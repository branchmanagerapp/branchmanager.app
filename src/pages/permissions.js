/**
 * Branch Manager — Enterprise RBAC Permissions System
 * Multi-role support with toggleable permissions per action
 * Roles: Super Admin, Admin, Manager, Employee, Payroll Admin, Accountant, HR Manager, Owner
 * v1
 */
var RBAC = {
  _STORAGE_KEY: 'bm-rbac-roles',

  // Default role definitions with permissions
  _defaultRoles: {
    'super_admin': {
      label: 'Super Admin', color: '#dc2626', icon: '🛡️',
      permissions: { /* all true by default */ }
    },
    'owner': {
      label: 'Owner', color: '#16a34a', icon: '👑',
      permissions: { /* all true by default */ }
    },
    'admin': {
      label: 'Admin', color: '#2563eb', icon: '⚙️',
      permissions: {
        'system.manage_permissions': false,
        'employees.terminate': false
      }
    },
    'manager': {
      label: 'Manager', color: 'var(--accent)', icon: '👷',
      permissions: {
        'system.manage_permissions': false,
        'system.manage_settings': false,
        'employees.terminate': false,
        'employees.change_pay_rates': false,
        'payroll.trigger': false,
        'payroll.fix_errors': false
      }
    },
    'payroll_admin': {
      label: 'Payroll Admin', color: '#ea580c', icon: '💰',
      permissions: {
        'system.manage_permissions': false,
        'system.manage_settings': false,
        'employees.terminate': false,
        'employees.add': false,
        'timesheets.delete_hours': false
      }
    },
    'accountant': {
      label: 'Accountant', color: '#0891b2', icon: '📊',
      permissions: {
        'timesheets.edit_hours': false,
        'timesheets.approve_hours': false,
        'timesheets.delete_hours': false,
        'employees.add': false,
        'employees.terminate': false,
        'employees.assign_roles': false,
        'system.manage_permissions': false,
        'system.manage_settings': false
      }
    },
    'hr_manager': {
      label: 'HR Manager', color: '#be185d', icon: '👥',
      permissions: {
        'payroll.trigger': false,
        'payroll.fix_errors': false,
        'system.manage_permissions': false,
        'system.manage_settings': false
      }
    },
    'employee': {
      label: 'Employee', color: '#6b7280', icon: '🧑‍🔧',
      permissions: {
        'timesheets.edit_hours': false,
        'timesheets.approve_hours': false,
        'timesheets.delete_hours': false,
        'timesheets.view_notes': true,
        'payroll.view_summary': false,
        'payroll.trigger': false,
        'payroll.view_reports': false,
        'payroll.fix_errors': false,
        'payroll.sync_gusto': false,
        'employees.add': false,
        'employees.edit_info': false,
        'employees.change_pay_rates': false,
        'employees.terminate': false,
        'employees.assign_roles': false,
        'system.manage_settings': false,
        'system.manage_permissions': false,
        'system.manage_overtime': false,
        'system.manage_schedules': false,
        'system.manage_job_codes': false,
        'system.manage_notifications': false
      }
    }
  },

  // All available permissions
  _allPermissions: {
    'Timesheets': [
      { key: 'timesheets.view_hours', label: 'View hours' },
      { key: 'timesheets.edit_hours', label: 'Edit hours' },
      { key: 'timesheets.approve_hours', label: 'Approve hours' },
      { key: 'timesheets.delete_hours', label: 'Delete hours' },
      { key: 'timesheets.add_notes', label: 'Add notes' },
      { key: 'timesheets.view_notes', label: 'View notes' },
      { key: 'timesheets.view_photos', label: 'View photos' }
    ],
    'Payroll': [
      { key: 'payroll.view_summary', label: 'View payroll summary' },
      { key: 'payroll.trigger', label: 'Trigger payroll' },
      { key: 'payroll.view_reports', label: 'View payroll reports' },
      { key: 'payroll.fix_errors', label: 'Fix payroll errors' },
      { key: 'payroll.sync_gusto', label: 'Sync with Gusto' },
      { key: 'payroll.view_gusto_status', label: 'View Gusto sync status' }
    ],
    'Employees': [
      { key: 'employees.add', label: 'Add employees' },
      { key: 'employees.edit_info', label: 'Edit employee info' },
      { key: 'employees.change_pay_rates', label: 'Change pay rates' },
      { key: 'employees.terminate', label: 'Terminate employees' },
      { key: 'employees.assign_roles', label: 'Assign roles' },
      { key: 'employees.view_history', label: 'View job history' }
    ],
    'System': [
      { key: 'system.manage_settings', label: 'Manage settings' },
      { key: 'system.manage_notifications', label: 'Manage notifications' },
      { key: 'system.manage_permissions', label: 'Manage permissions' },
      { key: 'system.manage_overtime', label: 'Manage overtime rules' },
      { key: 'system.manage_schedules', label: 'Manage schedules' },
      { key: 'system.manage_job_codes', label: 'Manage job codes' }
    ]
  },

  // Get roles (with custom overrides from localStorage)
  getRoles: function() {
    try {
      var custom = JSON.parse(localStorage.getItem(RBAC._STORAGE_KEY) || '{}');
      var merged = {};
      Object.keys(RBAC._defaultRoles).forEach(function(roleKey) {
        merged[roleKey] = JSON.parse(JSON.stringify(RBAC._defaultRoles[roleKey]));
        if (custom[roleKey] && custom[roleKey].permissions) {
          Object.assign(merged[roleKey].permissions, custom[roleKey].permissions);
        }
      });
      return merged;
    } catch(e) { return JSON.parse(JSON.stringify(RBAC._defaultRoles)); }
  },

  // Check if a role has a specific permission
  can: function(roleKey, permissionKey) {
    var roles = RBAC.getRoles();
    var role = roles[roleKey];
    if (!role) return false;
    if (roleKey === 'super_admin' || roleKey === 'owner') return true;
    if (role.permissions[permissionKey] === false) return false;
    return true; // default to allowed unless explicitly denied
  },

  // Check current user's permission
  currentCan: function(permissionKey) {
    var role = (typeof Auth !== 'undefined' && Auth.role) ? Auth.role : 'owner';
    return RBAC.can(role, permissionKey);
  },

  // Save role permission override
  savePermission: function(roleKey, permKey, value) {
    var custom = {};
    try { custom = JSON.parse(localStorage.getItem(RBAC._STORAGE_KEY) || '{}'); } catch(e) {}
    if (!custom[roleKey]) custom[roleKey] = { permissions: {} };
    custom[roleKey].permissions[permKey] = value;
    localStorage.setItem(RBAC._STORAGE_KEY, JSON.stringify(custom));
  },

  // ── Render Permissions Page ──
  render: function() {
    var roles = RBAC.getRoles();
    var html = '<div style="max-width:900px;">';

    html += '<div class="section-header"><h2>🛡️ Permissions & Roles</h2>'
      + '<p style="color:var(--text-light);margin-top:4px;">Configure what each role can do. Changes apply immediately.</p></div>';

    // Role cards
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">';
    Object.keys(roles).forEach(function(key) {
      var r = roles[key];
      html += '<div style="background:var(--white);border:2px solid ' + r.color + '20;border-radius:10px;padding:14px;text-align:center;cursor:pointer;" onclick="RBAC.editRole(\'' + key + '\')">'
        + '<div style="font-size:24px;">' + r.icon + '</div>'
        + '<div style="font-weight:700;font-size:13px;margin-top:4px;">' + r.label + '</div>'
        + '<div style="font-size:11px;color:var(--text-light);margin-top:2px;">' + Object.keys(r.permissions).filter(function(p) { return r.permissions[p] === false; }).length + ' restricted</div>'
        + '</div>';
    });
    html += '</div>';

    // Permission matrix
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;overflow:hidden;">';
    Object.keys(RBAC._allPermissions).forEach(function(category) {
      html += '<div style="padding:10px 16px;background:var(--bg);font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);">' + category + '</div>';
      RBAC._allPermissions[category].forEach(function(perm) {
        html += '<div style="display:flex;align-items:center;padding:8px 16px;border-bottom:1px solid #f5f5f5;gap:8px;">'
          + '<div style="flex:1;font-size:13px;">' + perm.label + '</div>';
        Object.keys(roles).forEach(function(roleKey) {
          var allowed = RBAC.can(roleKey, perm.key);
          html += '<div style="width:60px;text-align:center;font-size:11px;color:' + (allowed ? '#22c55e' : '#ef4444') + ';font-weight:600;">'
            + (roleKey === 'super_admin' || roleKey === 'owner' ? '✓' : (allowed ? '✓' : '✗'))
            + '</div>';
        });
        html += '</div>';
      });
    });
    html += '</div>';

    html += '</div>';
    return html;
  },

  editRole: function(roleKey) {
    var roles = RBAC.getRoles();
    var role = roles[roleKey];
    if (!role) return;
    if (roleKey === 'super_admin' || roleKey === 'owner') {
      UI.toast(role.label + ' has all permissions — cannot be restricted');
      return;
    }

    var html = '<div style="max-height:500px;overflow-y:auto;">';
    Object.keys(RBAC._allPermissions).forEach(function(category) {
      html += '<div style="font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;margin:16px 0 8px;">' + category + '</div>';
      RBAC._allPermissions[category].forEach(function(perm) {
        var allowed = RBAC.can(roleKey, perm.key);
        html += '<label style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--bg);border-radius:6px;margin-bottom:4px;cursor:pointer;">'
          + '<input type="checkbox" ' + (allowed ? 'checked' : '') + ' onchange="RBAC.savePermission(\'' + roleKey + '\',\'' + perm.key + '\',this.checked)">'
          + '<span style="font-size:13px;">' + perm.label + '</span>'
          + '</label>';
      });
    });
    html += '</div>';

    UI.showModal(role.icon + ' ' + role.label + ' Permissions', html, {
      footer: '<button class="btn btn-outline" onclick="UI.closeModal();loadPage(\'permissions\')">Done</button>'
    });
  }
};
