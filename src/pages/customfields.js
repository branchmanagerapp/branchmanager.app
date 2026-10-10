/**
 * Branch Manager — Custom Fields
 * Add custom fields to clients, jobs, quotes, invoices
 */
var CustomFields = {
  render: function() { return CustomFields.renderSettings(); },
  // Field types
  TYPES: ['text', 'number', 'date', 'dropdown', 'checkbox', 'textarea', 'phone', 'email', 'url'],

  // Get field definitions for an entity type
  getDefinitions: function(entityType) {
    var defs = JSON.parse(localStorage.getItem('bm-custom-fields') || '{}');
    return defs[entityType] || [];
  },

  // Save field definitions
  saveDefinitions: function(entityType, fields) {
    var defs = JSON.parse(localStorage.getItem('bm-custom-fields') || '{}');
    defs[entityType] = fields;
    localStorage.setItem('bm-custom-fields', JSON.stringify(defs));
  },

  // Add a field definition
  addField: function(entityType, field) {
    var fields = CustomFields.getDefinitions(entityType);
    field.id = 'cf-' + Date.now();
    fields.push(field);
    CustomFields.saveDefinitions(entityType, fields);
    return field.id;
  },

  // Remove a field definition
  removeField: function(entityType, fieldId) {
    var fields = CustomFields.getDefinitions(entityType).filter(function(f) { return f.id !== fieldId; });
    CustomFields.saveDefinitions(entityType, fields);
  },

  // Get custom field values for a specific record
  getValues: function(entityType, recordId) {
    var vals = JSON.parse(localStorage.getItem('bm-cf-values-' + entityType) || '{}');
    return vals[recordId] || {};
  },

  // Save custom field values for a record
  saveValues: function(entityType, recordId, values) {
    var vals = JSON.parse(localStorage.getItem('bm-cf-values-' + entityType) || '{}');
    vals[recordId] = values;
    localStorage.setItem('bm-cf-values-' + entityType, JSON.stringify(vals));
  },

  // Set a single field value
  setValue: function(entityType, recordId, fieldId, value) {
    var vals = CustomFields.getValues(entityType, recordId);
    vals[fieldId] = value;
    CustomFields.saveValues(entityType, recordId, vals);
  },

  // Render custom fields in a detail view (read-only display)
  renderDisplay: function(entityType, recordId) {
    var fields = CustomFields.getDefinitions(entityType);
    if (!fields.length) return '';
    var values = CustomFields.getValues(entityType, recordId);

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin:0;">🏷️ Custom Fields</h4>'
      + '<button class="btn btn-outline" onclick="CustomFields._editValues(\'' + entityType + '\',\'' + recordId + '\')" style="font-size:11px;padding:4px 10px;">Edit</button></div>';

    fields.forEach(function(field) {
      var val = values[field.id];
      var display = '';
      if (field.type === 'checkbox') {
        display = val ? '✅ Yes' : '❌ No';
      } else if (field.type === 'url' && val) {
        display = '<a href="' + val + '" target="_blank" rel="noopener noreferrer" style="color:#1565c0;">' + UI.esc(val) + '</a>';
      } else if (field.type === 'email' && val) {
        display = '<a href="mailto:' + val + '" style="color:#1565c0;">' + UI.esc(val) + '</a>';
      } else if (field.type === 'phone' && val) {
        display = '<a href="tel:' + val + '" style="color:#1565c0;">' + UI.esc(val) + '</a>';
      } else if (field.type === 'date' && val) {
        display = UI.dateShort(val);
      } else {
        display = val ? UI.esc(String(val)) : '<span style="color:var(--text-light);font-style:italic;">—</span>';
      }

      html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f5f5f5;">'
        + '<span style="font-size:13px;color:var(--text-light);">' + UI.esc(field.label) + '</span>'
        + '<span style="font-size:13px;font-weight:500;">' + display + '</span></div>';
    });

    html += '</div>';
    return html;
  },

  // Render custom fields as form inputs (for edit modals)
  renderForm: function(entityType, recordId) {
    var fields = CustomFields.getDefinitions(entityType);
    if (!fields.length) return '';
    var values = CustomFields.getValues(entityType, recordId);

    var html = '<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px;">'
      + '<div style="font-size:12px;font-weight:700;color:var(--text-light);text-transform:uppercase;margin-bottom:8px;">Custom Fields</div>';

    fields.forEach(function(field) {
      var val = values[field.id] || '';
      html += '<div style="margin-bottom:10px;"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">'
        + UI.esc(field.label) + (field.required ? ' <span style="color:#dc3545;">*</span>' : '') + '</label>';

      switch (field.type) {
        case 'textarea':
          html += '<textarea class="cf-input" data-field-id="' + field.id + '" rows="2" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;resize:vertical;">' + UI.esc(val) + '</textarea>';
          break;
        case 'dropdown':
          html += '<select class="cf-input" data-field-id="' + field.id + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;">'
            + '<option value="">Select...</option>';
          (field.options || []).forEach(function(opt) {
            html += '<option value="' + UI.esc(opt) + '"' + (val === opt ? ' selected' : '') + '>' + UI.esc(opt) + '</option>';
          });
          html += '</select>';
          break;
        case 'checkbox':
          html += '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">'
            + '<input type="checkbox" class="cf-input" data-field-id="' + field.id + '"' + (val ? ' checked' : '') + '>'
            + '<span style="font-size:13px;">Yes</span></label>';
          break;
        case 'number':
          html += '<input type="number" class="cf-input" data-field-id="' + field.id + '" value="' + UI.esc(val) + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;">';
          break;
        case 'date':
          html += '<input type="date" class="cf-input" data-field-id="' + field.id + '" value="' + val + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;">';
          break;
        default:
          html += '<input type="' + (field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'url' ? 'url' : 'text') + '" class="cf-input" data-field-id="' + field.id + '" value="' + UI.esc(val) + '" placeholder="' + UI.esc(field.placeholder || '') + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;">';
      }
      html += '</div>';
    });
    html += '</div>';
    return html;
  },

  // Collect values from form inputs
  collectFormValues: function() {
    var values = {};
    document.querySelectorAll('.cf-input').forEach(function(input) {
      var fieldId = input.dataset.fieldId;
      if (input.type === 'checkbox') {
        values[fieldId] = input.checked;
      } else {
        values[fieldId] = input.value;
      }
    });
    return values;
  },

  // Edit values modal
  _editValues: function(entityType, recordId) {
    var fields = CustomFields.getDefinitions(entityType);
    var values = CustomFields.getValues(entityType, recordId);

    var html = '<div style="display:grid;gap:12px;">';
    fields.forEach(function(field) {
      var val = values[field.id] || '';
      html += '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">' + UI.esc(field.label) + '</label>';

      if (field.type === 'dropdown') {
        html += '<select id="cf-edit-' + field.id + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;">'
          + '<option value="">Select...</option>';
        (field.options || []).forEach(function(opt) {
          html += '<option value="' + UI.esc(opt) + '"' + (val === opt ? ' selected' : '') + '>' + UI.esc(opt) + '</option>';
        });
        html += '</select>';
      } else if (field.type === 'checkbox') {
        html += '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="cf-edit-' + field.id + '"' + (val ? ' checked' : '') + '> Yes</label>';
      } else if (field.type === 'textarea') {
        html += '<textarea id="cf-edit-' + field.id + '" rows="2" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;">' + UI.esc(val) + '</textarea>';
      } else {
        html += '<input type="' + (field.type || 'text') + '" id="cf-edit-' + field.id + '" value="' + UI.esc(val) + '" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;">';
      }
      html += '</div>';
    });

    html += '<div style="display:flex;gap:8px;justify-content:flex-end;">'
      + '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
      + '<button class="btn btn-primary" onclick="CustomFields._saveEditedValues(\'' + entityType + '\',\'' + recordId + '\')">Save</button>'
      + '</div></div>';

    UI.showModal('Edit Custom Fields', html);
  },

  _saveEditedValues: function(entityType, recordId) {
    var fields = CustomFields.getDefinitions(entityType);
    var values = {};
    fields.forEach(function(field) {
      var el = document.getElementById('cf-edit-' + field.id);
      if (el) {
        values[field.id] = el.type === 'checkbox' ? el.checked : el.value;
      }
    });
    CustomFields.saveValues(entityType, recordId, values);
    UI.closeModal();
    UI.toast('Custom fields saved');
    // Refresh the page
    if (entityType === 'client') ClientsPage.showDetail(recordId);
    else if (entityType === 'job') JobsPage.showDetail(recordId);
    else if (entityType === 'quote') QuotesPage.showDetail(recordId);
  },

  // Settings page to manage custom field definitions
  renderSettings: function() {
    var entityTypes = [
      { key: 'client', label: 'Clients', icon: '👥' },
      { key: 'job', label: 'Jobs', icon: '🔧' },
      { key: 'quote', label: 'Quotes', icon: '📋' },
      { key: 'invoice', label: 'Invoices', icon: '💰' }
    ];

    var html = '<div style="margin-bottom:24px;">'
      + '<h3 style="margin-bottom:4px;">Custom Fields</h3>'
      + '<p style="font-size:13px;color:var(--text-light);margin-bottom:16px;">Add custom fields to track additional information on clients, jobs, quotes, and invoices.</p>';

    entityTypes.forEach(function(et) {
      var fields = CustomFields.getDefinitions(et.key);
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
        + '<div style="font-weight:700;font-size:14px;">' + et.icon + ' ' + et.label + ' <span style="font-weight:400;color:var(--text-light);">(' + fields.length + ' fields)</span></div>'
        + '<button class="btn btn-outline" onclick="CustomFields._showAddFieldForm(\'' + et.key + '\')" style="font-size:11px;padding:4px 10px;">+ Add Field</button></div>';

      if (fields.length) {
        fields.forEach(function(f) {
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f5f5f5;">'
            + '<div><span style="font-weight:600;font-size:13px;">' + UI.esc(f.label) + '</span>'
            + ' <span style="font-size:11px;color:var(--text-light);background:var(--bg);padding:2px 6px;border-radius:4px;">' + f.type + '</span>'
            + (f.required ? ' <span style="color:#dc3545;font-size:10px;">required</span>' : '') + '</div>'
            + '<button onclick="CustomFields.removeField(\'' + et.key + '\',\'' + f.id + '\');loadPage(\'settings\');" style="background:none;border:none;cursor:pointer;color:#dc3545;font-size:13px;">Remove</button></div>';
        });
      } else {
        html += '<div style="font-size:12px;color:var(--text-light);font-style:italic;">No custom fields yet</div>';
      }
      html += '</div>';
    });

    html += '</div>';
    return html;
  },

  _showAddFieldForm: function(entityType) {
    var labels = { client: 'Client', job: 'Job', quote: 'Quote', invoice: 'Invoice' };
    var html = '<div style="display:grid;gap:12px;">'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Field Label</label>'
      + '<input type="text" id="cf-new-label" placeholder="e.g. Lot Size, Property Type, Referral Source" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Field Type</label>'
      + '<select id="cf-new-type" onchange="CustomFields._toggleOptions()" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;">';
    CustomFields.TYPES.forEach(function(t) {
      html += '<option value="' + t + '">' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>';
    });
    html += '</select></div>'
      + '<div id="cf-options-wrap" style="display:none;"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Options (comma-separated)</label>'
      + '<input type="text" id="cf-new-options" placeholder="Option 1, Option 2, Option 3" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>'
      + '<div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Placeholder</label>'
      + '<input type="text" id="cf-new-placeholder" placeholder="Hint text shown in empty field" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;"></div>'
      + '<label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="cf-new-required"> Required field</label>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
      + '<button class="btn btn-outline" onclick="UI.closeModal()">Cancel</button>'
      + '<button class="btn btn-primary" onclick="CustomFields._saveNewField(\'' + entityType + '\')">Add Field</button>'
      + '</div></div>';

    UI.showModal('Add Custom Field — ' + labels[entityType], html);
  },

  _toggleOptions: function() {
    var type = document.getElementById('cf-new-type').value;
    document.getElementById('cf-options-wrap').style.display = type === 'dropdown' ? 'block' : 'none';
  },

  _saveNewField: function(entityType) {
    var label = document.getElementById('cf-new-label').value.trim();
    var type = document.getElementById('cf-new-type').value;
    var placeholder = document.getElementById('cf-new-placeholder').value.trim();
    var required = document.getElementById('cf-new-required').checked;

    if (!label) { UI.toast('Enter a field label', 'error'); return; }

    var field = { label: label, type: type, placeholder: placeholder, required: required };
    if (type === 'dropdown') {
      var optStr = document.getElementById('cf-new-options').value.trim();
      field.options = optStr ? optStr.split(',').map(function(s) { return s.trim(); }) : [];
    }

    CustomFields.addField(entityType, field);
    UI.closeModal();
    UI.toast('Custom field added');
    loadPage('settings');
  }
};
