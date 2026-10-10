/**
 * Branch Manager — Form Builder v1
 * No-code editor for the online booking form (book.html)
 * Config stored in Supabase settings table + localStorage
 */
var FormBuilderPage = {

  _STORAGE_KEY: 'bm-form-config',
  _SUPABASE_URL: 'https://ltpivkqahvplapyagljt.supabase.co',
  _SUPABASE_KEY: (typeof SupabaseDB !== 'undefined' && SupabaseDB.ANON_KEY) || '',

  _defaultConfig: function() {
    return {
      title: BM_CONFIG.companyName,
      subtitle: BM_CONFIG.city + ' — ' + BM_CONFIG.tagline,
      buttonText: 'Request Free Estimate',
      successTitle: 'Request Received!',
      successMessage: "Thanks! We'll review your request and get back to you within 2 hours during business hours.",
      notifyEmail: BM_CONFIG.email,
      fields: [
        { id: 'f1', label: 'Your Name', type: 'text', placeholder: 'First and last name', required: true },
        { id: 'f2', label: 'Phone Number', type: 'tel', placeholder: '(914) 555-1234', required: true },
        { id: 'f3', label: 'Email', type: 'email', placeholder: 'you@email.com', required: false },
        { id: 'f4', label: 'Property Address', type: 'text', placeholder: '123 Main St, Peekskill, NY', required: true },
        { id: 'f5', label: 'Service Needed', type: 'select', required: true, options: [
          'Tree Removal', 'Tree Pruning / Trimming', 'Stump Removal',
          'Storm Damage / Emergency', 'Land Clearing', 'Bucket Truck Work',
          'Cabling & Bracing', 'Tree Health Assessment', 'Gutter Clean Out',
          'Firewood', 'Other'
        ]},
        { id: 'f6', label: 'Describe the Work', type: 'textarea', placeholder: 'Tell us about the trees, the situation, any concerns...', required: false }
      ]
    };
  },

  _getConfig: function() {
    try {
      var saved = JSON.parse(localStorage.getItem(FormBuilderPage._STORAGE_KEY));
      return saved || FormBuilderPage._defaultConfig();
    } catch(e) { return FormBuilderPage._defaultConfig(); }
  },

  _saveConfig: function(cfg) {
    localStorage.setItem(FormBuilderPage._STORAGE_KEY, JSON.stringify(cfg));
  },

  render: function() {
    var cfg = FormBuilderPage._getConfig();
    var html = '<div style="max-width:900px;margin:0 auto;">';

    // Header
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px;">'
      + '<div>'
      + '<h2 style="margin:0;font-size:20px;">📋 Online Booking Form Editor</h2>'
      + '<p style="margin:4px 0 0;font-size:13px;color:var(--text-light);">Edit the form on peekskilltree.com/contact.html — no coding needed</p>'
      + '</div>'
      + '<div style="display:flex;gap:8px;">'
      + '<button class="btn btn-outline" onclick="FormBuilderPage.preview()" style="font-size:13px;">👁 Preview Form</button>'
      + '<button class="btn btn-primary" onclick="FormBuilderPage.save()" id="fb-save-btn" style="font-size:13px;">💾 Save & Publish</button>'
      + '</div>'
      + '</div>';

    // Two-column layout
    html += '<div style="display:grid;grid-template-columns:1fr 380px;gap:20px;align-items:start;">';

    // LEFT: Form fields editor
    html += '<div>';
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px;">'
      + '<h3 style="font-size:15px;font-weight:700;margin:0 0 16px;">Form Fields</h3>'
      + '<div id="fb-fields">';

    cfg.fields.forEach(function(f, i) {
      html += FormBuilderPage._renderFieldRow(f, i, cfg.fields.length);
    });

    html += '</div>'
      + '<button class="btn btn-outline" onclick="FormBuilderPage.addField()" style="width:100%;margin-top:12px;font-size:13px;">+ Add Field</button>'
      + '</div>';

    // Service options editor (only shown if select field exists)
    var selectField = cfg.fields.find(function(f){ return f.type === 'select'; });
    if (selectField) {
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px;">'
        + '<h3 style="font-size:15px;font-weight:700;margin:0 0 4px;">Service Options</h3>'
        + '<p style="font-size:12px;color:var(--text-light);margin:0 0 12px;">Edit the dropdown choices — one per line</p>'
        + '<textarea id="fb-options" style="width:100%;height:180px;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;" onchange="FormBuilderPage._saveOptions()">'
        + (selectField.options || []).join('\n')
        + '</textarea>'
        + '</div>';
    }
    html += '</div>';

    // RIGHT: Settings panel + live preview
    html += '<div>';

    // Form settings
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px;">'
      + '<h3 style="font-size:15px;font-weight:700;margin:0 0 16px;">Form Settings</h3>'
      + '<div style="margin-bottom:12px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">FORM TITLE</label>'
      + '<input id="fb-title" type="text" value="' + UI.esc(cfg.title) + '" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;" onchange="FormBuilderPage._liveUpdate()">'
      + '</div>'
      + '<div style="margin-bottom:12px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">SUBTITLE</label>'
      + '<input id="fb-subtitle" type="text" value="' + UI.esc(cfg.subtitle) + '" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '</div>'
      + '<div style="margin-bottom:12px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">BUTTON TEXT</label>'
      + '<input id="fb-btn-text" type="text" value="' + UI.esc(cfg.buttonText) + '" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '</div>'
      + '<div style="margin-bottom:12px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">SUCCESS MESSAGE</label>'
      + '<textarea id="fb-success-msg" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;height:70px;">' + UI.esc(cfg.successMessage) + '</textarea>'
      + '</div>'
      + '<div>'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">NOTIFY EMAIL</label>'
      + '<input id="fb-notify-email" type="email" value="' + UI.esc(cfg.notifyEmail) + '" style="width:100%;padding:9px 12px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '</div>'
      + '</div>';

    // Mini live preview
    html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:20px;">'
      + '<h3 style="font-size:15px;font-weight:700;margin:0 0 12px;">Live Preview</h3>'
      + '<div id="fb-preview" style="border:2px solid var(--border);border-radius:10px;padding:16px;background:#f9fafb;">'
      + FormBuilderPage._buildPreview(cfg)
      + '</div>'
      + '<p style="font-size:11px;color:var(--text-light);margin:8px 0 0;text-align:center;">Form live at <a href="https://peekskilltree.com/contact.html" target="_blank" rel="noopener noreferrer">peekskilltree.com/contact.html</a></p>'
      + '</div>';

    html += '</div></div></div>';
    return html;
  },

  _renderFieldRow: function(f, idx, total) {
    var typeIcons = { text: '📝', tel: '📞', email: '📧', select: '▼', textarea: '📄' };
    var html = '<div id="fb-row-' + f.id + '" style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--bg);">'
      // Drag handle
      + '<span style="cursor:grab;color:var(--text-light);font-size:16px;">⠿</span>'
      // Type icon
      + '<span style="font-size:14px;" title="' + f.type + '">' + (typeIcons[f.type] || '📝') + '</span>'
      // Label input
      + '<input type="text" value="' + UI.esc(f.label) + '" data-field-id="' + f.id + '" data-prop="label"'
      + ' style="flex:1;padding:6px 10px;border:2px solid var(--border);border-radius:6px;font-size:13px;"'
      + ' onchange="FormBuilderPage._updateField(this)">'
      // Type select
      + '<select data-field-id="' + f.id + '" data-prop="type" onchange="FormBuilderPage._updateField(this);loadPage(\'formbuilder\')"'
      + ' style="padding:6px;border:2px solid var(--border);border-radius:6px;font-size:12px;">'
      + ['text','tel','email','select','textarea'].map(function(t){ return '<option value="'+t+'"'+(f.type===t?' selected':'')+'>'+t+'</option>'; }).join('')
      + '</select>'
      // Required toggle
      + '<label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-light);white-space:nowrap;cursor:pointer;">'
      + '<input type="checkbox" data-field-id="' + f.id + '" data-prop="required" onchange="FormBuilderPage._updateField(this)"'
      + (f.required ? ' checked' : '') + ' style="cursor:pointer;">'
      + 'Req</label>'
      // Move up/down
      + '<div style="display:flex;flex-direction:column;gap:2px;">'
      + (idx > 0 ? '<button onclick="FormBuilderPage.moveField(\'' + f.id + '\',-1)" style="background:none;border:none;cursor:pointer;padding:1px;font-size:10px;line-height:1;" title="Move up">▲</button>' : '<span style="width:16px;"></span>')
      + (idx < total - 1 ? '<button onclick="FormBuilderPage.moveField(\'' + f.id + '\',1)" style="background:none;border:none;cursor:pointer;padding:1px;font-size:10px;line-height:1;" title="Move down">▼</button>' : '<span style="width:16px;"></span>')
      + '</div>'
      // Delete
      + (total > 1 ? '<button onclick="FormBuilderPage.removeField(\'' + f.id + '\')" style="background:none;border:none;cursor:pointer;color:#dc3545;font-size:16px;padding:2px 4px;" title="Remove">✕</button>' : '')
      + '</div>';
    return html;
  },

  _buildPreview: function(cfg) {
    var html = '<div style="font-size:13px;">'
      + '<div style="text-align:center;margin-bottom:12px;">'
      + '<div style="font-size:20px;">🌳</div>'
      + '<div style="font-weight:700;color:#1a3c12;font-size:14px;">' + UI.esc(cfg.title) + '</div>'
      + '<div style="font-size:11px;color:#888;">' + UI.esc(cfg.subtitle) + '</div>'
      + '</div>';
    cfg.fields.slice(0, 4).forEach(function(f) {
      html += '<div style="margin-bottom:8px;">'
        + '<label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:2px;">'
        + UI.esc(f.label) + (f.required ? ' *' : '')
        + '</label>';
      if (f.type === 'textarea') {
        html += '<div style="height:36px;border:2px solid #e0e0e0;border-radius:6px;background:#fafafa;"></div>';
      } else if (f.type === 'select') {
        html += '<div style="height:28px;border:2px solid #e0e0e0;border-radius:6px;background:#fafafa;padding:4px 8px;font-size:11px;color:#aaa;">'
          + (f.options && f.options[0] ? UI.esc(f.options[0]) : 'Select...') + '</div>';
      } else {
        html += '<div style="height:28px;border:2px solid #e0e0e0;border-radius:6px;background:#fafafa;padding:4px 8px;font-size:11px;color:#aaa;">'
          + UI.esc(f.placeholder || '') + '</div>';
      }
      html += '</div>';
    });
    if (cfg.fields.length > 4) {
      html += '<div style="font-size:11px;color:#999;text-align:center;margin:4px 0;">+ ' + (cfg.fields.length - 4) + ' more field(s)</div>';
    }
    html += '<div style="background:#1a3c12;color:#fff;text-align:center;padding:8px;border-radius:8px;font-size:12px;font-weight:700;margin-top:8px;">'
      + UI.esc(cfg.buttonText) + '</div>'
      + '</div>';
    return html;
  },

  _updateField: function(el) {
    var cfg = FormBuilderPage._getConfig();
    var id = el.dataset.fieldId;
    var prop = el.dataset.prop;
    var field = cfg.fields.find(function(f){ return f.id === id; });
    if (!field) return;
    if (prop === 'required') field[prop] = el.checked;
    else field[prop] = el.value;
    FormBuilderPage._saveConfig(cfg);
    // Update preview
    var prev = document.getElementById('fb-preview');
    if (prev) prev.innerHTML = FormBuilderPage._buildPreview(cfg);
  },

  _saveOptions: function() {
    var cfg = FormBuilderPage._getConfig();
    var textarea = document.getElementById('fb-options');
    if (!textarea) return;
    var selectField = cfg.fields.find(function(f){ return f.type === 'select'; });
    if (selectField) {
      selectField.options = textarea.value.split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
      FormBuilderPage._saveConfig(cfg);
    }
  },

  _liveUpdate: function() {
    var cfg = FormBuilderPage._getConfig();
    var titleEl = document.getElementById('fb-title');
    if (titleEl) cfg.title = titleEl.value;
    FormBuilderPage._saveConfig(cfg);
    var prev = document.getElementById('fb-preview');
    if (prev) prev.innerHTML = FormBuilderPage._buildPreview(cfg);
  },

  addField: function() {
    var cfg = FormBuilderPage._getConfig();
    cfg.fields.push({
      id: 'f' + Date.now(),
      label: 'New Field',
      type: 'text',
      placeholder: '',
      required: false
    });
    FormBuilderPage._saveConfig(cfg);
    loadPage('formbuilder');
  },

  removeField: function(id) {
    var cfg = FormBuilderPage._getConfig();
    cfg.fields = cfg.fields.filter(function(f){ return f.id !== id; });
    FormBuilderPage._saveConfig(cfg);
    loadPage('formbuilder');
  },

  moveField: function(id, dir) {
    var cfg = FormBuilderPage._getConfig();
    var idx = cfg.fields.findIndex(function(f){ return f.id === id; });
    if (idx < 0) return;
    var newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= cfg.fields.length) return;
    var tmp = cfg.fields[idx];
    cfg.fields[idx] = cfg.fields[newIdx];
    cfg.fields[newIdx] = tmp;
    FormBuilderPage._saveConfig(cfg);
    loadPage('formbuilder');
  },

  save: function() {
    // Collect all current values from DOM before saving
    var cfg = FormBuilderPage._getConfig();
    var get = function(id){ var el = document.getElementById(id); return el ? el.value : null; };
    cfg.title = get('fb-title') || cfg.title;
    cfg.subtitle = get('fb-subtitle') || cfg.subtitle;
    cfg.buttonText = get('fb-btn-text') || cfg.buttonText;
    cfg.successMessage = get('fb-success-msg') || cfg.successMessage;
    cfg.notifyEmail = get('fb-notify-email') || cfg.notifyEmail;

    // Save options if any
    var optEl = document.getElementById('fb-options');
    if (optEl) {
      var sf = cfg.fields.find(function(f){ return f.type === 'select'; });
      if (sf) sf.options = optEl.value.split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
    }

    FormBuilderPage._saveConfig(cfg);

    // Push to Supabase settings table
    var btn = document.getElementById('fb-save-btn');
    if (btn) { btn.textContent = '⏳ Publishing...'; btn.disabled = true; }

    fetch(FormBuilderPage._SUPABASE_URL + '/rest/v1/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': FormBuilderPage._SUPABASE_KEY,
        'Authorization': 'Bearer ' + FormBuilderPage._SUPABASE_KEY,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ key: 'form_config', value: JSON.stringify(cfg) })
    })
    .then(function(r) {
      if (btn) { btn.textContent = '✅ Published!'; btn.disabled = false; setTimeout(function(){ if(btn) btn.textContent = '💾 Save & Publish'; }, 2000); }
      UI.toast('✅ Form saved — live at peekskilltree.com/contact.html');
    })
    .catch(function() {
      if (btn) { btn.textContent = '💾 Save & Publish'; btn.disabled = false; }
      UI.toast('⚠️ Saved locally — Supabase sync failed');
    });
  },

  preview: function() {
    window.open('https://branchmanager.app/book.html', '_blank');
  }
};
