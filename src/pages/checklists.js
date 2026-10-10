/**
 * Branch Manager — Job Checklists / Forms
 * Pre-job and post-job inspection checklists per job type
 */
var Checklists = {
  render: function() { return Checklists.renderTemplateManager(); },
  // Default checklist templates by service type
  _templates: {
    'Tree Removal': {
      pre: [
        { text: 'Assess drop zone and clear area', required: true },
        { text: 'Check for power lines / utilities', required: true },
        { text: 'Identify dead or hazardous branches', required: true },
        { text: 'Confirm equipment access path', required: true },
        { text: 'Review rigging plan with crew', required: false },
        { text: 'Set up traffic cones / barriers if needed', required: false },
        { text: 'Take before photos', required: true }
      ],
      post: [
        { text: 'All debris removed from property', required: true },
        { text: 'Stump ground (if included)', required: false },
        { text: 'Rake and clean work area', required: true },
        { text: 'Check for property damage', required: true },
        { text: 'Take after photos', required: true },
        { text: 'Client walkthrough / sign-off', required: false },
        { text: 'Equipment secured and loaded', required: true }
      ]
    },
    'Tree Pruning': {
      pre: [
        { text: 'Identify branches to prune', required: true },
        { text: 'Check for power lines nearby', required: true },
        { text: 'Assess tree health / disease signs', required: false },
        { text: 'Confirm pruning scope with client', required: true },
        { text: 'Take before photos', required: true }
      ],
      post: [
        { text: 'All cut branches removed', required: true },
        { text: 'Proper pruning cuts verified (no stubs)', required: true },
        { text: 'Debris cleaned up', required: true },
        { text: 'Take after photos', required: true },
        { text: 'Equipment secured', required: true }
      ]
    },
    'Stump Removal': {
      pre: [
        { text: 'Locate underground utilities (call 811)', required: true },
        { text: 'Measure stump diameter', required: true },
        { text: 'Check grinder access path', required: true },
        { text: 'Take before photos', required: true }
      ],
      post: [
        { text: 'Stump ground below grade', required: true },
        { text: 'Grindings spread or removed', required: true },
        { text: 'Area leveled', required: true },
        { text: 'Take after photos', required: true }
      ]
    },
    'General': {
      pre: [
        { text: 'Confirm scope of work with client', required: true },
        { text: 'Assess safety hazards', required: true },
        { text: 'Check equipment is operational', required: false },
        { text: 'Take before photos', required: true }
      ],
      post: [
        { text: 'Work completed per scope', required: true },
        { text: 'Clean up work area', required: true },
        { text: 'Check for property damage', required: true },
        { text: 'Take after photos', required: true },
        { text: 'Equipment loaded and secured', required: true }
      ]
    }
  },

  // Get checklist for a job (from job data or template)
  getForJob: function(jobId) {
    var j = DB.jobs.getById(jobId);
    if (!j) return { pre: [], post: [] };
    if (j.checklist) return j.checklist;

    // Auto-generate from template based on job description
    var template = null;
    var desc = (j.description || '').toLowerCase();
    if (desc.indexOf('removal') > -1 || desc.indexOf('remove') > -1) {
      template = Checklists._templates['Tree Removal'];
    } else if (desc.indexOf('prun') > -1 || desc.indexOf('trim') > -1) {
      template = Checklists._templates['Tree Pruning'];
    } else if (desc.indexOf('stump') > -1 || desc.indexOf('grind') > -1) {
      template = Checklists._templates['Stump Removal'];
    } else {
      template = Checklists._templates['General'];
    }

    // Deep copy and add IDs
    var checklist = {
      pre: template.pre.map(function(item, i) {
        return { id: 'pre-' + i, text: item.text, required: item.required, checked: false, checkedBy: '', checkedAt: '' };
      }),
      post: template.post.map(function(item, i) {
        return { id: 'post-' + i, text: item.text, required: item.required, checked: false, checkedBy: '', checkedAt: '' };
      })
    };
    return checklist;
  },

  // Toggle a checklist item
  toggle: function(jobId, itemId) {
    var j = DB.jobs.getById(jobId);
    if (!j) return;
    var checklist = j.checklist || Checklists.getForJob(jobId);
    var allItems = checklist.pre.concat(checklist.post);
    var item = allItems.find(function(it) { return it.id === itemId; });
    if (item) {
      item.checked = !item.checked;
      item.checkedBy = item.checked ? ((typeof Auth !== 'undefined' && Auth.user) ? Auth.user.name : 'User') : '';
      item.checkedAt = item.checked ? new Date().toISOString() : '';
    }
    DB.jobs.update(jobId, { checklist: checklist });
  },

  // Add custom item to checklist
  addItem: function(jobId, phase, text) {
    var j = DB.jobs.getById(jobId);
    if (!j) return;
    var checklist = j.checklist || Checklists.getForJob(jobId);
    var newItem = {
      id: phase + '-custom-' + Date.now(),
      text: text,
      required: false,
      checked: false,
      checkedBy: '',
      checkedAt: '',
      custom: true
    };
    checklist[phase].push(newItem);
    DB.jobs.update(jobId, { checklist: checklist });
  },

  // Remove custom item
  removeItem: function(jobId, itemId) {
    var j = DB.jobs.getById(jobId);
    if (!j || !j.checklist) return;
    ['pre', 'post'].forEach(function(phase) {
      j.checklist[phase] = j.checklist[phase].filter(function(it) { return it.id !== itemId; });
    });
    DB.jobs.update(jobId, { checklist: j.checklist });
  },

  // Render checklist section for job detail page
  renderForJob: function(jobId) {
    var checklist = Checklists.getForJob(jobId);
    var preCompleted = checklist.pre.filter(function(i) { return i.checked; }).length;
    var postCompleted = checklist.post.filter(function(i) { return i.checked; }).length;
    var totalRequired = checklist.pre.concat(checklist.post).filter(function(i) { return i.required; }).length;
    var totalRequiredDone = checklist.pre.concat(checklist.post).filter(function(i) { return i.required && i.checked; }).length;

    var html = '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px;">'
      + '<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">'
      + '<h4 style="font-size:13px;color:var(--text-light);text-transform:uppercase;letter-spacing:.05em;margin:0;">📋 Job Checklist</h4>'
      + '<div style="font-size:12px;color:' + (totalRequiredDone === totalRequired ? 'var(--green-dark)' : 'var(--text-light)') + ';font-weight:600;">'
      + totalRequiredDone + '/' + totalRequired + ' required complete'
      + (totalRequiredDone === totalRequired ? ' ✅' : '') + '</div></div>';

    // Progress bar
    var pct = totalRequired > 0 ? Math.round(totalRequiredDone / totalRequired * 100) : 0;
    html += '<div style="height:4px;background:var(--bg);"><div style="height:100%;width:' + pct + '%;background:' + (pct === 100 ? 'var(--green-dark)' : 'var(--accent)') + ';transition:width .3s;"></div></div>';

    // Pre-job section
    html += '<div style="padding:12px 16px;">'
      + '<div style="font-weight:700;font-size:13px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">'
      + '<span style="color:#1565c0;">▶</span> Pre-Job (' + preCompleted + '/' + checklist.pre.length + ')</div>';
    checklist.pre.forEach(function(item) {
      html += Checklists._renderItem(jobId, item);
    });
    // Add custom item input
    html += '<div style="display:flex;gap:6px;margin-top:8px;">'
      + '<input type="text" id="cl-add-pre-' + jobId + '" placeholder="+ Add item..." style="flex:1;padding:6px 10px;border:1px dashed var(--border);border-radius:6px;font-size:12px;background:var(--bg);" onkeydown="if(event.key===\'Enter\'){Checklists.addItem(\'' + jobId + '\',\'pre\',this.value);JobsPage.showDetail(\'' + jobId + '\');}">'
      + '</div></div>';

    // Post-job section
    html += '<div style="padding:0 16px 12px;">'
      + '<div style="font-weight:700;font-size:13px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">'
      + '<span style="color:#2e7d32;">✓</span> Post-Job (' + postCompleted + '/' + checklist.post.length + ')</div>';
    checklist.post.forEach(function(item) {
      html += Checklists._renderItem(jobId, item);
    });
    html += '<div style="display:flex;gap:6px;margin-top:8px;">'
      + '<input type="text" id="cl-add-post-' + jobId + '" placeholder="+ Add item..." style="flex:1;padding:6px 10px;border:1px dashed var(--border);border-radius:6px;font-size:12px;background:var(--bg);" onkeydown="if(event.key===\'Enter\'){Checklists.addItem(\'' + jobId + '\',\'post\',this.value);JobsPage.showDetail(\'' + jobId + '\');}">'
      + '</div></div></div>';

    return html;
  },

  _renderItem: function(jobId, item) {
    var checked = item.checked;
    return '<label style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;cursor:pointer;' + (checked ? 'opacity:.6;' : '') + '" onclick="event.preventDefault();Checklists.toggle(\'' + jobId + '\',\'' + item.id + '\');JobsPage.showDetail(\'' + jobId + '\');">'
      + '<div style="width:18px;height:18px;border:2px solid ' + (checked ? 'var(--accent)' : 'var(--border)') + ';border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-top:1px;background:' + (checked ? 'var(--accent)' : 'transparent') + ';transition:all .15s;">'
      + (checked ? '<span style="color:#fff;font-size:12px;font-weight:700;">✓</span>' : '') + '</div>'
      + '<div style="flex:1;">'
      + '<span style="font-size:13px;' + (checked ? 'text-decoration:line-through;color:var(--text-light);' : '') + '">' + UI.esc(item.text) + '</span>'
      + (item.required ? '<span style="color:#dc3545;font-size:10px;margin-left:4px;">*</span>' : '')
      + (item.checkedBy && checked ? '<div style="font-size:10px;color:var(--text-light);">' + item.checkedBy + ' · ' + UI.dateRelative(item.checkedAt) + '</div>' : '')
      + '</div>'
      + (item.custom ? '<button onclick="event.stopPropagation();Checklists.removeItem(\'' + jobId + '\',\'' + item.id + '\');JobsPage.showDetail(\'' + jobId + '\');" style="background:none;border:none;cursor:pointer;color:#dc3545;font-size:14px;padding:0 4px;">×</button>' : '')
      + '</label>';
  },

  // Manage checklist templates (settings page)
  renderTemplateManager: function() {
    var custom = JSON.parse(localStorage.getItem('bm-checklist-templates') || '{}');
    var allTemplates = Object.assign({}, Checklists._templates, custom);
    var html = '<h3 style="margin-bottom:16px;">Checklist Templates</h3>';

    Object.keys(allTemplates).forEach(function(name) {
      var t = allTemplates[name];
      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;">'
        + '<div style="font-weight:700;font-size:14px;margin-bottom:8px;">' + UI.esc(name) + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);">'
        + 'Pre-job: ' + t.pre.length + ' items · Post-job: ' + t.post.length + ' items'
        + '</div></div>';
    });
    return html;
  }
};
