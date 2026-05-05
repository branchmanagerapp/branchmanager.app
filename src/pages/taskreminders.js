/**
 * Branch Manager — Tasks & Reminders
 * Time-based task/errand system with browser notifications
 * Integrates with Team Chat channels (Errands, Maintenance)
 */
var TaskReminders = {
  _filter: 'all',
  _editing: null,
  _timerStarted: false,
  _overlayPrefill: null,
  _micActive: false,
  _micRecognition: null,

  STORAGE_KEY: 'bm-tasks',

  PRIORITIES: [
    { key: 'low', label: 'Low', color: '#6c757d', bg: '#f8f9fa' },
    { key: 'medium', label: 'Medium', color: '#0d6efd', bg: '#e7f1ff' },
    { key: 'high', label: 'High', color: '#e65100', bg: '#fff3e0' },
    { key: 'urgent', label: 'Urgent', color: '#c62828', bg: '#ffebee' }
  ],

  CATEGORIES: [
    { key: 'errand', label: 'Errand', icon: 'map-pin' },
    { key: 'maintenance', label: 'Maintenance', icon: 'wrench' },
    { key: 'prep', label: 'Prep', icon: 'clipboard-list' },
    { key: 'cleanup', label: 'Cleanup', icon: 'trash-2' },
    { key: 'sales', label: 'Sales', icon: 'dollar-sign' },
    { key: 'order_parts', label: 'Order Parts', icon: 'package' }
  ],

  _catIcon: function(iconName, size) {
    size = size || 13;
    return '<i data-lucide="' + iconName + '" style="width:' + size + 'px;height:' + size + 'px;vertical-align:middle;stroke-width:2;display:inline-block;"></i>';
  },

  RECURRENCE: [
    { key: 'none', label: 'One-time' },
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' }
  ],

  // Voice-to-task: listen via mic, open overlay with transcribed title
  _voiceNewTask: function() {
    if (typeof UI !== 'undefined') UI.closeModal();
    var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) { TaskReminders._openOverlay(null); return; }
    var gotResult = false;
    UI.toast('🎤 Listening — say the task name');
    var rec = new SpeechRec();
    rec.lang = 'en-US'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = function(e) {
      gotResult = true;
      var title = ((e.results[0][0].transcript) || '').trim();
      TaskReminders._openOverlay(null, { title: title });
    };
    rec.onerror = function() { if (!gotResult) { gotResult = true; TaskReminders._openOverlay(null); } };
    rec.onend   = function() { if (!gotResult) { gotResult = true; TaskReminders._openOverlay(null); } };
    rec.start();
  },

  _search: '',

  render: function() {
    // One-time: remove seeded sample tasks if present
    if (!localStorage.getItem('bm-seed-tasks-cleaned')) {
      var cleaned = TaskReminders._getAll().filter(function(t) { return t.id.indexOf('task_seed_') !== 0; });
      TaskReminders._saveAll(cleaned);
      localStorage.removeItem('bm-tasks-seeded');
      localStorage.setItem('bm-seed-tasks-cleaned', '1');
    }
    TaskReminders._startChecker();
    TaskReminders._requestNotificationPermission();
    TaskReminders._initCloudSync();

    var tasks = TaskReminders._getAll();
    var now = new Date();
    var active = tasks.filter(function(t) { return !t.completed; }).length;
    var dueToday = tasks.filter(function(t) { return !t.completed && t.dueDate && new Date(t.dueDate).toDateString() === now.toDateString(); }).length;
    var overdue = tasks.filter(function(t) { return !t.completed && t.dueDate && new Date(t.dueDate) < now && new Date(t.dueDate).toDateString() !== now.toDateString(); }).length;
    var completedCount = tasks.filter(function(t) { return t.completed; }).length;

    var q = (TaskReminders._search || '').toLowerCase();
    var filtered = TaskReminders._applyFilter(tasks);
    if (q) filtered = filtered.filter(function(t) {
      return (t.title||'').toLowerCase().indexOf(q) !== -1 || (t.description||'').toLowerCase().indexOf(q) !== -1;
    });
    filtered.sort(function(a, b) {
      if (a.completed && !b.completed) return 1;
      if (!a.completed && b.completed) return -1;
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      var aD = new Date(a.dueDate), bD = new Date(b.dueDate);
      var aOv = !a.completed && aD < now, bOv = !b.completed && bD < now;
      if (aOv && !bOv) return -1;
      if (!aOv && bOv) return 1;
      return aD - bD;
    });

    var html = '';

    // ── Stats grid ──
    var stats = [
      { label: 'Open',    val: active,         color: '#1565c0', bg: '#e3f2fd' },
      { label: 'Today',   val: dueToday,        color: '#e07c24', bg: '#fff3e0' },
      { label: 'Overdue', val: overdue,          color: '#c62828', bg: '#ffebee' },
      { label: 'Done',    val: completedCount,   color: '#2e7d32', bg: '#e8f5e9' }
    ];
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">';
    stats.forEach(function(s) {
      html += '<div onclick="TaskReminders._filter=\'' + (s.label==='Open'?'all':s.label.toLowerCase()) + '\';loadPage(\'taskreminders\')" '
        + 'style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px 16px;cursor:pointer;position:relative;overflow:hidden;">'
        + '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:' + s.color + ';"></div>'
        + '<div style="font-size:30px;font-weight:800;color:' + s.color + ';line-height:1;">' + s.val + '</div>'
        + '<div style="font-size:12px;color:var(--text-light);margin-top:4px;">' + s.label + '</div>'
        + '</div>';
    });
    html += '</div>';

    // ── Bulk bar (fixed bottom) ──
    html += '<div id="task-bulk-bar" style="display:none;position:fixed;bottom:0;left:var(--sidebar-w,0);right:0;z-index:500;background:#1a1a2e;color:#fff;padding:12px 24px;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">'
      + '<span id="task-bulk-count" style="font-weight:700;font-size:14px;">0 selected</span>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button onclick="TaskReminders._bulkComplete()" style="background:#2e7d32;color:#fff;border:none;padding:7px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;"><i data-lucide="check" style="width:14px;height:14px;"></i>Complete</button>'
      + '<button onclick="TaskReminders._bulkArchive()" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:7px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Archive</button>'
      + '<button onclick="TaskReminders._bulkDelete()" style="background:#c62828;color:#fff;border:none;padding:7px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Delete</button>'
      + '<button onclick="TaskReminders._clearBulk()" style="background:none;color:rgba(255,255,255,.6);border:none;font-size:13px;cursor:pointer;padding:7px 0;">Cancel</button>'
      + '</div>'
      + '</div>';

    // ── Header: filters + search + actions ──
    var filters = [
      { key: 'all', label: 'All' },
      { key: 'today', label: 'Today' },
      { key: 'overdue', label: 'Overdue' },
      { key: 'mine', label: 'Mine' },
      { key: 'completed', label: 'Done' }
    ];
    html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">';
    html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">';
    html += '<h3 style="font-size:16px;font-weight:700;margin:0;">Tasks</h3>';
    html += '<span style="font-size:13px;color:var(--text-light);">(' + filtered.length + ')</span>';
    filters.forEach(function(f) {
      var on = TaskReminders._filter === f.key;
      html += '<button onclick="TaskReminders._filter=\'' + f.key + '\';loadPage(\'taskreminders\')" '
        + 'style="padding:5px 12px;border-radius:20px;font-size:12px;font-weight:' + (on?'700':'500') + ';cursor:pointer;'
        + 'border:' + (on?'2px solid var(--green-dark)':'1px solid var(--border)') + ';'
        + 'background:' + (on?'var(--green-dark)':'var(--white)') + ';'
        + 'color:' + (on?'#fff':'var(--text)') + ';">' + f.label + '</button>';
    });
    html += '</div>';
    html += '<div style="display:flex;gap:6px;align-items:center;">'
      + '<div class="search-box" style="min-width:180px;">'
      + '<span style="color:var(--text-light);display:flex;align-items:center;"><i data-lucide="search" style="width:14px;height:14px;"></i></span>'
      + '<input type="text" placeholder="Search tasks…" value="' + UI.esc(TaskReminders._search||'') + '" '
      + 'oninput="TaskReminders._search=this.value;loadPage(\'taskreminders\')" '
      + 'style="border:none;outline:none;background:transparent;font-size:13px;width:100%;color:var(--text);"></div>'
      + '<button id="bm-task-mic-btn" onclick="TaskReminders._toggleMic()" title="Voice input" style="width:34px;height:34px;border-radius:8px;border:1px solid var(--border);background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i data-lucide="mic" style="width:16px;height:16px;"></i></button>'
      + '<button onclick="TaskReminders._openOverlay(null)" style="background:var(--green-dark);color:#fff;border:none;padding:0 16px;height:34px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">+ New</button>'
      + '</div>';
    html += '</div>';

    // ── Table ──
    html += '<div style="background:var(--white);border-radius:12px;border:1px solid var(--border);box-shadow:0 1px 3px rgba(0,0,0,0.04);overflow:hidden;">';

    if (filtered.length === 0) {
      html += '<div style="padding:48px 24px;text-align:center;color:var(--text-light);">'
        + '<div style="margin-bottom:8px;"><i data-lucide="check-circle-2" style="width:40px;height:40px;color:var(--text-light);"></i></div>'
        + '<div style="font-size:15px;font-weight:600;margin-bottom:4px;">No tasks</div>'
        + '<div style="font-size:13px;">Use + New or type below to add one</div>'
        + '</div>';
    } else {
      // Desktop table
      html += '<div class="desktop-only">';
      html += '<table class="data-table"><thead><tr>'
        + '<th style="width:32px;"><input type="checkbox" onchange="TaskReminders._selectAll(this)"></th>'
        + '<th>Task</th><th>Category</th><th>Priority</th><th>Due</th><th>Assigned</th>'
        + '</tr></thead><tbody>';
      filtered.forEach(function(task) {
        var now2 = new Date();
        var isOverdue = !task.completed && task.dueDate && new Date(task.dueDate) < now2 && new Date(task.dueDate).toDateString() !== now2.toDateString();
        var pri = TaskReminders.PRIORITIES.find(function(p){return p.key===task.priority;})||TaskReminders.PRIORITIES[0];
        var cat = task.category ? TaskReminders.CATEGORIES.find(function(c){return c.key===task.category;}) : null;
        var dueLabel = task.dueDate ? TaskReminders._formatDue(task.dueDate, now2) : '—';
        html += '<tr style="cursor:pointer;' + (task.completed?'opacity:.55;':'') + '" onclick="TaskReminders._openQuickComplete(\'' + task.id + '\')">'
          + '<td onclick="event.stopPropagation()"><input type="checkbox" class="task-check" value="' + task.id + '" onchange="TaskReminders._updateBulk()"></td>'
          + '<td><strong style="' + (task.completed?'text-decoration:line-through;':'') + '">' + UI.esc(task.title) + '</strong>'
          + (task.description ? '<div style="font-size:12px;color:var(--text-light);">' + UI.esc(task.description.slice(0,60)) + '</div>' : '')
          + '</td>'
          + '<td>' + (cat ? TaskReminders._catIcon(cat.icon) + ' ' + cat.label : '—') + '</td>'
          + '<td><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:' + pri.bg + ';color:' + pri.color + ';">' + pri.label + '</span></td>'
          + '<td style="color:' + (isOverdue?'#c62828':'var(--text)') + ';font-weight:' + (isOverdue?'600':'400') + ';">' + (isOverdue ? '<i data-lucide="alert-triangle" style="width:12px;height:12px;vertical-align:middle;margin-right:2px;"></i>' : '') + dueLabel + '</td>'
          + '<td style="color:var(--text-light);">' + UI.esc(task.assignedTo||'—') + '</td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';

      // Mobile cards
      html += '<div class="mobile-only">';
      filtered.forEach(function(task, idx) {
        html += TaskReminders._renderRow(task, now, idx === filtered.length - 1);
      });
      html += '</div>';
    }

    // Quick-add bar
    html += '<div style="padding:10px 14px;border-top:1px solid var(--border);display:flex;gap:6px;align-items:center;">'
      + '<input type="text" id="bm-task-quickadd" placeholder="Quick add a task…"'
      + ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();TaskReminders._quickAddSubmit();}"'
      + ' style="flex:1;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;outline:none;background:var(--bg);color:var(--text);min-width:0;">'
      + '<button onclick="TaskReminders._quickAddSubmit()" style="background:var(--green-dark);color:#fff;border:none;padding:0 14px;height:34px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;flex-shrink:0;">Add</button>'
      + '</div>';

    html += '</div>';
    return html;
  },

  _updateBulk: function() {
    var checked = document.querySelectorAll('.task-check:checked');
    var bar = document.getElementById('task-bulk-bar');
    var cnt = document.getElementById('task-bulk-count');
    if (bar) bar.style.display = checked.length > 0 ? 'flex' : 'none';
    if (cnt) cnt.textContent = checked.length + ' selected';
  },

  _selectAll: function(cb) {
    document.querySelectorAll('.task-check').forEach(function(c) { c.checked = cb.checked; });
    TaskReminders._updateBulk();
  },

  _clearBulk: function() {
    document.querySelectorAll('.task-check').forEach(function(c) { c.checked = false; });
    TaskReminders._updateBulk();
  },

  _selectedIds: function() {
    return Array.from(document.querySelectorAll('.task-check:checked')).map(function(c) { return c.value; });
  },

  _bulkComplete: function() {
    TaskReminders._selectedIds().forEach(function(id) { TaskReminders._toggleComplete(id, true); });
    TaskReminders._clearBulk();
    loadPage('taskreminders');
  },

  _bulkArchive: function() {
    var ids = TaskReminders._selectedIds();
    var tasks = TaskReminders._getAll();
    tasks.forEach(function(t) { if (ids.indexOf(t.id) !== -1) { t.archived = true; t.updatedAt = new Date().toISOString(); } });
    TaskReminders._saveAll(tasks);
    TaskReminders._clearBulk();
    loadPage('taskreminders');
  },

  _bulkDelete: function() {
    var ids = TaskReminders._selectedIds();
    if (!ids.length) return;
    if (!confirm('Delete ' + ids.length + ' task' + (ids.length>1?'s':'') + '?')) return;
    var tasks = TaskReminders._getAll().filter(function(t) { return ids.indexOf(t.id) === -1; });
    TaskReminders._saveAll(tasks);
    TaskReminders._deleteCloud(ids);
    TaskReminders._clearBulk();
    loadPage('taskreminders');
  },

  _renderRow: function(task, now, isLast) {
    var isOverdue = !task.completed && task.dueDate && new Date(task.dueDate) < now && new Date(task.dueDate).toDateString() !== now.toDateString();
    var pri = TaskReminders.PRIORITIES.find(function(p) { return p.key === task.priority; }) || TaskReminders.PRIORITIES[0];
    var dot = task.completed ? '#ccc' : (isOverdue ? '#c62828' : pri.color);
    var cat = task.category ? TaskReminders.CATEGORIES.find(function(c) { return c.key === task.category; }) : null;
    var dueLabel = task.dueDate ? TaskReminders._formatDue(task.dueDate, now) : '';

    var html = '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;'
      + (isLast ? '' : 'border-bottom:1px solid var(--border);')
      + (task.completed ? 'opacity:0.55;' : '')
      + 'cursor:pointer;" onclick="TaskReminders._openQuickComplete(\'' + task.id + '\')">';

    html += '<input type="checkbox" class="task-check" value="' + task.id + '" onclick="event.stopPropagation()" onchange="TaskReminders._updateBulk()" style="width:16px;height:16px;flex-shrink:0;cursor:pointer;">';
    html += '<div style="width:8px;height:8px;border-radius:50%;background:' + dot + ';flex-shrink:0;"></div>';
    html += '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:14px;font-weight:600;' + (task.completed?'text-decoration:line-through;':'') + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + UI.esc(task.title) + '</div>'
      + (cat || dueLabel ? '<div style="font-size:12px;color:var(--text-light);margin-top:1px;display:flex;align-items:center;gap:3px;">'
          + (cat ? TaskReminders._catIcon(cat.icon, 11) + ' ' + cat.label : '')
          + (cat && dueLabel ? '<span style="margin:0 2px;">·</span>' : '')
          + (dueLabel ? '<span style="color:' + (isOverdue?'#c62828':'inherit') + ';display:inline-flex;align-items:center;gap:2px;">' + (isOverdue ? '<i data-lucide="alert-triangle" style="width:11px;height:11px;"></i>' : '') + dueLabel + '</span>' : '')
          + '</div>' : '')
      + '</div>';
    html += '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:' + pri.bg + ';color:' + pri.color + ';white-space:nowrap;flex-shrink:0;">' + pri.label + '</span>';
    html += '</div>';
    return html;
  },

  _renderForm: function() {
    var task = TaskReminders._editing ? TaskReminders._getById(TaskReminders._editing) : null;
    var team = TaskReminders._getTeamMembers();
    var isEdit = !!task;
    // Pre-fill support (from AI suggestions on dashboard)
    var pf = (!isEdit && TaskReminders._overlayPrefill) ? TaskReminders._overlayPrefill : {};

    var nowLocal = new Date();
    nowLocal.setMinutes(nowLocal.getMinutes() + 30);
    var defaultDate = nowLocal.toISOString().slice(0, 16);

    var html = '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      + '<h3 style="font-size:16px;margin:0;">' + (isEdit ? 'Edit Task' : 'New Task') + '</h3>'
      + '<button onclick="TaskReminders._hideForm()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-light);">\u2715</button>'
      + '</div>';

    // If pre-filled from AI, show a chip
    if (pf.aiLabel) {
      html += '<div style="background:#e8f5e9;color:#1a3c12;font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;margin-bottom:10px;display:inline-block;">\u2726 AI-Enriched \u2014 review &amp; save</div>';
    }

    // Title
    var titleVal = task ? UI.esc(task.title) : (pf.title ? UI.esc(pf.title.slice(0, 80)) : '');
    html += '<div style="margin-bottom:12px;">'
      + '<label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Title *</label>'
      + '<input type="text" id="task-title" value="' + titleVal + '" placeholder="e.g. Pick up chainsaw chains" '
      + 'style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:15px;box-sizing:border-box;"></div>';

    // Description
    var descVal = task ? UI.esc(task.description || '') : (pf.description ? UI.esc(pf.description) : '');
    html += '<div style="margin-bottom:12px;">'
      + '<label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Description</label>'
      + '<textarea id="task-desc" rows="2" placeholder="Additional details..." '
      + 'style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;resize:vertical;box-sizing:border-box;">' + descVal + '</textarea></div>';

    // Row: assigned, due date
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';

    // Assigned to
    html += '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Assigned To</label>'
      + '<select id="task-assigned" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">'
      + '<option value="">Unassigned</option>';
    team.forEach(function(name) {
      var sel = task && task.assignedTo === name ? ' selected' : '';
      html += '<option value="' + UI.esc(name) + '"' + sel + '>' + UI.esc(name) + '</option>';
    });
    html += '</select></div>';

    // Due date/time (pre-fills from task, then AI prefill.dueDate, then default +30min)
    var duePrefill = task ? task.dueDate : (pf.dueDate || null);
    html += '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Due Date / Time</label>'
      + '<input type="datetime-local" id="task-due" value="' + (duePrefill ? duePrefill.slice(0, 16) : defaultDate) + '" '
      + 'style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;box-sizing:border-box;"></div>';
    html += '</div>';

    // Row: priority, category, recurrence
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">';

    // Priority (pre-fills from task or AI prefill)
    var pfPriority = pf.priority || 'medium';
    html += '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Priority</label>'
      + '<select id="task-priority" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">';
    TaskReminders.PRIORITIES.forEach(function(p) {
      var sel = (task ? task.priority === p.key : pfPriority === p.key) ? ' selected' : '';
      html += '<option value="' + p.key + '"' + sel + '>' + p.label + '</option>';
    });
    html += '</select></div>';

    // Category (pre-fills from task or AI prefill)
    var pfCategory = pf.category || '';
    html += '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Category</label>'
      + '<select id="task-category" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">';
    TaskReminders.CATEGORIES.forEach(function(c) {
      var sel = (task ? task.category === c.key : pfCategory === c.key) ? ' selected' : '';
      html += '<option value="' + c.key + '"' + sel + '>' + c.label + '</option>';
    });
    html += '</select></div>';

    // Recurrence
    html += '<div><label style="font-size:12px;color:var(--text-light);display:block;margin-bottom:4px;">Repeat</label>'
      + '<select id="task-recurrence" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;font-size:14px;">';
    TaskReminders.RECURRENCE.forEach(function(r) {
      var sel = task && task.recurrence === r.key ? ' selected' : '';
      html += '<option value="' + r.key + '"' + sel + '>' + r.label + '</option>';
    });
    html += '</select></div>';
    html += '</div>';

    // Hidden actionLink field (set by AI suggestion prefill or preserved from existing task)
    var actionLinkVal = task ? UI.esc(task.actionLink || '') : UI.esc(pf.actionLink || '');
    html += '<input type="hidden" id="task-action-link" value="' + actionLinkVal + '">';

    // Buttons
    html += '<div style="display:flex;gap:8px;justify-content:flex-end;">';
    if (isEdit) {
      html += '<button onclick="TaskReminders._deleteTask(\'' + task.id + '\')" style="background:#ffebee;color:#c62828;border:none;padding:10px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;margin-right:auto;">Delete</button>';
    }
    html += '<button onclick="TaskReminders._hideForm()" style="background:var(--bg);color:var(--text);border:1px solid var(--border);padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;">Cancel</button>';
    html += '<button onclick="TaskReminders._saveTask()" style="background:var(--green-dark);color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px;">' + (isEdit ? 'Update' : 'Create Task') + '</button>';
    html += '</div></div>';

    return html;
  },

  // --- Form actions ---

  _showForm: function(taskId) {
    TaskReminders._editing = taskId || null;
    var wrapper = document.getElementById('task-form-wrapper');
    if (wrapper) {
      wrapper.innerHTML = TaskReminders._renderForm();
      wrapper.style.display = 'block';
      var titleInput = document.getElementById('task-title');
      if (titleInput) titleInput.focus();
    }
  },

  _hideForm: function() {
    // If an overlay is open, close it instead of just hiding the inner wrapper
    var overlay = document.getElementById('bm-task-overlay');
    if (overlay) { TaskReminders._closeOverlay(); return; }
    TaskReminders._editing = null;
    var wrapper = document.getElementById('task-form-wrapper');
    if (wrapper) wrapper.style.display = 'none';
  },

  // Open task form as a floating bottom-sheet overlay (works from any page)
  // v588: collapse/expand the dashboard tasks widget
  _toggleCollapse: function() {
    var current = localStorage.getItem('bm-tasks-widget-collapsed') === 'true';
    localStorage.setItem('bm-tasks-widget-collapsed', current ? 'false' : 'true');
    if (typeof loadPage === 'function' && window._currentPage === 'dashboard') loadPage('dashboard');
  },

  _openOverlay: function(taskId, prefill) {
    var old = document.getElementById('bm-task-overlay');
    if (old) old.remove();
    TaskReminders._overlayPrefill = prefill || null;
    TaskReminders._editing = taskId || null;
    var overlay = document.createElement('div');
    overlay.id = 'bm-task-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9998;display:flex;align-items:flex-end;justify-content:center;';
    overlay.innerHTML = '<div style="background:var(--white);border-radius:16px 16px 0 0;width:100%;max-width:640px;max-height:92vh;overflow-y:auto;padding:20px;box-sizing:border-box;">'
      + '<div id="task-form-wrapper"></div>'
      + '</div>';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) TaskReminders._closeOverlay(); });
    document.body.appendChild(overlay);
    TaskReminders._showForm(taskId);
  },

  _closeOverlay: function() {
    var overlay = document.getElementById('bm-task-overlay');
    if (overlay) overlay.remove();
    TaskReminders._overlayPrefill = null;
    TaskReminders._editing = null;
  },

  _editTask: function(id) {
    TaskReminders._showForm(id);
    // Scroll to form
    var wrapper = document.getElementById('task-form-wrapper');
    if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  _saveTask: function() {
    var title = (document.getElementById('task-title').value || '').trim();
    if (!title) { alert('Task title is required.'); return; }

    var desc = (document.getElementById('task-desc').value || '').trim();
    var assigned = document.getElementById('task-assigned').value;
    var due = document.getElementById('task-due').value;
    var priority = document.getElementById('task-priority').value;
    var category = document.getElementById('task-category').value;
    var recurrence = document.getElementById('task-recurrence').value;
    var actionLink = (document.getElementById('task-action-link') || {}).value || '';

    var tasks = TaskReminders._getAll();

    if (TaskReminders._editing) {
      // Update existing
      var idx = -1;
      for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].id === TaskReminders._editing) { idx = i; break; }
      }
      if (idx >= 0) {
        tasks[idx].title = title;
        tasks[idx].description = desc;
        tasks[idx].assignedTo = assigned;
        tasks[idx].dueDate = due ? new Date(due).toISOString() : '';
        tasks[idx].priority = priority;
        tasks[idx].category = category;
        tasks[idx].recurrence = recurrence;
        tasks[idx].actionLink = actionLink;
        tasks[idx].updatedAt = new Date().toISOString();
      }
    } else {
      // Create new
      tasks.push({
        id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        title: title,
        description: desc,
        assignedTo: assigned,
        dueDate: due ? new Date(due).toISOString() : '',
        priority: priority,
        category: category,
        recurrence: recurrence,
        actionLink: actionLink,
        completed: false,
        completedAt: null,
        notified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    TaskReminders._saveAll(tasks);
    TaskReminders._overlayPrefill = null;
    TaskReminders._editing = null;
    // Close overlay if open, then reload current page (not always taskreminders)
    var overlay = document.getElementById('bm-task-overlay');
    if (overlay) overlay.remove();
    loadPage(window._currentPage || 'taskreminders');
  },

  _toggleComplete: function(id) {
    var tasks = TaskReminders._getAll();
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id) {
        if (!tasks[i].completed) {
          tasks[i].completed = true;
          tasks[i].completedAt = new Date().toISOString();

          // Handle recurring: spawn next occurrence
          if (tasks[i].recurrence && tasks[i].recurrence !== 'none' && tasks[i].dueDate) {
            var nextDue = TaskReminders._getNextOccurrence(tasks[i].dueDate, tasks[i].recurrence);
            tasks.push({
              id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
              title: tasks[i].title,
              description: tasks[i].description,
              assignedTo: tasks[i].assignedTo,
              dueDate: nextDue,
              priority: tasks[i].priority,
              category: tasks[i].category,
              recurrence: tasks[i].recurrence,
              completed: false,
              completedAt: null,
              notified: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          }
        } else {
          tasks[i].completed = false;
          tasks[i].completedAt = null;
        }
        break;
      }
    }
    TaskReminders._saveAll(tasks);
    loadPage(window._currentPage || 'taskreminders');
  },

  _deleteTask: function(id) {
    if (!confirm('Delete this task?')) return;
    UI.closeModal();
    var tasks = TaskReminders._getAll().filter(function(t) { return t.id !== id; });
    TaskReminders._saveAll(tasks);
    TaskReminders._deleteCloud([id]);
    TaskReminders._editing = null;
    var overlay = document.getElementById('bm-task-overlay');
    if (overlay) overlay.remove();
    loadPage(window._currentPage || 'taskreminders');
  },

  _deleteCloud: function(ids) {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client) return;
    if (!ids || !ids.length) return;
    try {
      SupabaseDB.client.from('tasks').delete().in('id', ids).then(function(res) {
        if (res.error) console.warn('[Tasks] cloud delete failed:', res.error.message);
      });
    } catch (e) { console.warn('[Tasks] cloud delete threw:', e); }
  },

  _archiveTask: function(id) {
    UI.closeModal();
    var tasks = TaskReminders._getAll();
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id) { tasks[i].archived = true; tasks[i].updatedAt = new Date().toISOString(); break; }
    }
    TaskReminders._saveAll(tasks);
    var overlay = document.getElementById('bm-task-overlay');
    if (overlay) overlay.remove();
    loadPage(window._currentPage || 'taskreminders');
  },

  // --- Recurring logic ---

  _getNextOccurrence: function(dateStr, recurrence) {
    var d = new Date(dateStr);
    switch (recurrence) {
      case 'daily': d.setDate(d.getDate() + 1); break;
      case 'weekly': d.setDate(d.getDate() + 7); break;
      case 'monthly': d.setMonth(d.getMonth() + 1); break;
    }
    return d.toISOString();
  },

  // --- Reminder checker ---

  _startChecker: function() {
    if (TaskReminders._timerStarted) return;
    TaskReminders._timerStarted = true;
    // Check immediately on load
    TaskReminders._checkReminders();
    // Then every 60 seconds
    setInterval(function() { TaskReminders._checkReminders(); }, 60000);
  },

  _checkReminders: function() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    var tasks = TaskReminders._getAll();
    var now = new Date();
    var fiveMin = 5 * 60 * 1000;
    var changed = false;

    tasks.forEach(function(task) {
      if (task.completed || task.notified || !task.dueDate) return;
      var due = new Date(task.dueDate);
      var diff = due.getTime() - now.getTime();

      // Fire notification if due within 5 minutes (and not already past by more than 5 min)
      if (diff <= fiveMin && diff > -fiveMin) {
        try {
          new Notification('Task Due: ' + task.title, {
            body: task.description || (task.assignedTo ? 'Assigned to ' + task.assignedTo : 'No description'),
            icon: 'icons/icon-192.png',
            tag: 'task-' + task.id
          });
        } catch (e) {
          // Notification may fail in some contexts
        }
        task.notified = true;
        changed = true;
      }
    });

    if (changed) TaskReminders._saveAll(tasks);
  },

  _requestNotificationPermission: function() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  },

  // --- Filters ---

  _applyFilter: function(tasks) {
    var now = new Date();
    var currentUser = TaskReminders._getCurrentUser();

    switch (TaskReminders._filter) {
      case 'today':
        return tasks.filter(function(t) {
          if (t.completed || !t.dueDate) return false;
          return new Date(t.dueDate).toDateString() === now.toDateString();
        });
      case 'overdue':
        return tasks.filter(function(t) {
          return !t.completed && t.dueDate && new Date(t.dueDate) < now;
        });
      case 'mine':
        return tasks.filter(function(t) {
          return !t.completed && (!t.assignedTo || t.assignedTo === currentUser);
        });
      case 'completed':
        return tasks.filter(function(t) { return t.completed; });
      default:
        // All: show incomplete + recently completed (last 24h)
        var dayAgo = new Date(now.getTime() - 86400000);
        return tasks.filter(function(t) {
          if (!t.completed) return true;
          return t.completedAt && new Date(t.completedAt) > dayAgo;
        });
    }
  },

  // --- Data helpers ---

  _getAll: function(includeArchived) {
    try {
      var all = JSON.parse(localStorage.getItem(TaskReminders.STORAGE_KEY) || '[]');
      return includeArchived ? all : all.filter(function(t) { return !t.archived; });
    } catch (e) { return []; }
  },

  _saveAll: function(tasks) {
    localStorage.setItem(TaskReminders.STORAGE_KEY, JSON.stringify(tasks));
    TaskReminders._pushCloud(tasks);
  },

  // ── Cloud sync ──────────────────────────────────────────
  // Tasks were localStorage-only until v538, which meant iPhone (Capacitor) and
  // the web browser kept divergent task lists. Now both sides upsert to the
  // Supabase `tasks` table on every save, and pull on init + visibility change.

  _toCloudRow: function(t) {
    var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    return {
      id: t.id,
      tenant_id: tid,
      title: t.title || '',
      description: t.description || null,
      assigned_to: t.assignedTo || null,
      due_date: t.dueDate || null,
      priority: t.priority || 'medium',
      category: t.category || null,
      recurrence: t.recurrence || 'none',
      action_link: t.actionLink || null,
      completed: !!t.completed,
      completed_at: t.completedAt || null,
      notified: !!t.notified,
      archived: !!t.archived,
      created_at: t.createdAt || new Date().toISOString(),
      updated_at: t.updatedAt || new Date().toISOString()
    };
  },

  _fromCloudRow: function(r) {
    return {
      id: r.id,
      title: r.title || '',
      description: r.description || '',
      assignedTo: r.assigned_to || '',
      dueDate: r.due_date || '',
      priority: r.priority || 'medium',
      category: r.category || '',
      recurrence: r.recurrence || 'none',
      actionLink: r.action_link || '',
      completed: !!r.completed,
      completedAt: r.completed_at || null,
      notified: !!r.notified,
      archived: !!r.archived,
      createdAt: r.created_at || new Date().toISOString(),
      updatedAt: r.updated_at || new Date().toISOString()
    };
  },

  _pushCloud: function(tasks) {
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client) return;
    if (!tasks || !tasks.length) return;
    var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    if (!tid) return;
    try {
      var rows = tasks.map(TaskReminders._toCloudRow);
      SupabaseDB.client.from('tasks').upsert(rows, { onConflict: 'id' }).then(function(res) {
        if (res.error) console.warn('[Tasks] cloud push failed:', res.error.message);
      });
    } catch (e) { console.warn('[Tasks] cloud push threw:', e); }
  },

  _pullCloud: function(opts) {
    opts = opts || {};
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client) return;
    var tid = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    if (!tid) return;
    if (TaskReminders._pullInFlight) return;
    TaskReminders._pullInFlight = true;
    SupabaseDB.client
      .from('tasks')
      .select('*')
      .eq('tenant_id', tid)
      .then(function(res) {
        TaskReminders._pullInFlight = false;
        if (res.error) {
          // Table might not exist yet on a stale Supabase instance — log + bail
          console.warn('[Tasks] cloud pull failed:', res.error.message);
          return;
        }
        if (!res.data) return;

        // Last-write-wins merge keyed by id, comparing updated_at
        var local = TaskReminders._getAll(true);
        var byId = {};
        local.forEach(function(t) { byId[t.id] = t; });
        var cloudById = {};
        res.data.forEach(function(r) { cloudById[r.id] = TaskReminders._fromCloudRow(r); });

        var changedFromCloud = false;
        var toPushUp = [];

        // Cloud → local: take cloud if newer or local missing
        Object.keys(cloudById).forEach(function(id) {
          var cloud = cloudById[id];
          var existing = byId[id];
          if (!existing || new Date(cloud.updatedAt) > new Date(existing.updatedAt || 0)) {
            byId[id] = cloud;
            changedFromCloud = true;
          }
        });

        // Local → cloud: push any local not in cloud, or where local is newer
        local.forEach(function(t) {
          var cloud = cloudById[t.id];
          if (!cloud) {
            toPushUp.push(t);
          } else if (new Date(t.updatedAt || 0) > new Date(cloud.updatedAt)) {
            toPushUp.push(t);
          }
        });

        var merged = Object.keys(byId).map(function(k) { return byId[k]; });
        // Write merged set to localStorage WITHOUT going through _saveAll (which
        // would re-trigger _pushCloud and feedback-loop). _pushCloud below handles
        // anything that needs to go up.
        localStorage.setItem(TaskReminders.STORAGE_KEY, JSON.stringify(merged));
        if (toPushUp.length) TaskReminders._pushCloud(toPushUp);

        if ((changedFromCloud || opts.alwaysRender) && window._currentPage === 'taskreminders' && typeof loadPage === 'function') {
          loadPage('taskreminders');
        }
      });
  },

  _initCloudSync: function() {
    if (TaskReminders._cloudSyncInited) return;
    TaskReminders._cloudSyncInited = true;
    TaskReminders._pullCloud();
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) TaskReminders._pullCloud();
    });
    window.addEventListener('focus', function() { TaskReminders._pullCloud(); });

    // Realtime: receive task changes from other devices
    try {
      if (typeof SupabaseDB !== 'undefined' && SupabaseDB.client && SupabaseDB.client.channel) {
        var ch = SupabaseDB.client.channel('bm-tasks-' + Math.random().toString(36).slice(2, 8));
        ch.on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, function() {
          clearTimeout(TaskReminders._rtDebounce);
          TaskReminders._rtDebounce = setTimeout(function() { TaskReminders._pullCloud(); }, 600);
        });
        ch.subscribe();
        TaskReminders._rtChannel = ch;
      }
    } catch (e) { console.warn('[Tasks] realtime sub failed:', e); }
  },

  _getById: function(id) {
    var tasks = TaskReminders._getAll();
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id) return tasks[i];
    }
    return null;
  },

  _getCurrentUser: function() {
    return (typeof Auth !== 'undefined' && Auth.user) ? Auth.user.name : 'Owner';
  },

  _getTeamMembers: function() {
    var names = [];
    try {
      var team = JSON.parse(localStorage.getItem('bm-team') || '[]');
      team.forEach(function(t) { if (t.name) names.push(t.name); });
    } catch (e) {}
    var current = TaskReminders._getCurrentUser();
    if (names.indexOf(current) === -1) names.unshift(current);
    return names;
  },

  // --- Formatting ---

  _formatDue: function(dateStr, now) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (!now) now = new Date();

    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.round((target - today) / 86400000);

    var timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (diff === 0) return 'Today ' + timeStr;
    if (diff === 1) return 'Tomorrow ' + timeStr;
    if (diff === -1) return 'Yesterday ' + timeStr;
    if (diff > 1 && diff <= 6) return TaskReminders._dayName(d.getDay()) + ' ' + timeStr;

    // Fallback to short date
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + timeStr;
  },

  _dayName: function(idx) {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][idx];
  },

  // --- Dashboard widget (call from dashboard) ---

  getDashboardWidget: function() {
    // Clean seeded tasks if not already done
    if (!localStorage.getItem('bm-seed-tasks-cleaned')) {
      var c = TaskReminders._getAll().filter(function(t) { return t.id.indexOf('task_seed_') !== 0; });
      TaskReminders._saveAll(c);
      localStorage.removeItem('bm-tasks-seeded');
      localStorage.setItem('bm-seed-tasks-cleaned', '1');
    }
    var tasks = TaskReminders._getAll();
    var now = new Date();
    var todayStr = now.toDateString();
    var allIncomplete = tasks.filter(function(t) { return !t.completed; });

    // Empty → compact pill (same height as Today's Jobs empty)
    if (allIncomplete.length === 0) {
      return '<div style="background:var(--white);border-radius:10px;padding:10px 16px;border:1px solid var(--border);margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;font-size:13px;color:var(--text-light);">'
        + '<span><strong style="color:var(--text);">Tasks</strong> · All clear</span>'
        + '<div style="display:flex;gap:6px;">'
        + '<button onclick="TaskReminders._openOverlay(null)" style="background:var(--green-dark);color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;">+ New</button>'
        + '<button onclick="loadPage(\'taskreminders\')" style="background:none;border:1px solid var(--border);padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;color:var(--accent);">View All →</button>'
        + '</div>'
        + '</div>';
    }

    // Overdue → today → future/no-date, max 6 shown
    var overdue = allIncomplete.filter(function(t) { return t.dueDate && new Date(t.dueDate) < now && new Date(t.dueDate).toDateString() !== todayStr; });
    var today   = allIncomplete.filter(function(t) { return t.dueDate && new Date(t.dueDate).toDateString() === todayStr; });
    var rest    = allIncomplete.filter(function(t) { return !t.dueDate || (new Date(t.dueDate) > now && new Date(t.dueDate).toDateString() !== todayStr); });
    var shown   = overdue.concat(today).concat(rest).slice(0, 6);

    var prioMap = { urgent: '#c62828', high: '#e65100', medium: '#1976d2', low: '#6c757d' };

    // v588: collapsable — state persisted in localStorage. Collapsed shows
    // header + counts only; expanded shows the task rows below. Chevron
    // toggles. Default expanded for first-time users.
    var collapsed = localStorage.getItem('bm-tasks-widget-collapsed') === 'true';

    var html = '<div style="background:var(--white);border-radius:12px;padding:18px 20px;border:1px solid var(--border);margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">';

    // ── Header ──
    var overdueCount = overdue.length;
    var todayCount = today.length;
    var subtitle = allIncomplete.length + ' open'
      + (overdueCount ? ' · ' + overdueCount + ' overdue' : '')
      + (todayCount ? ' · ' + todayCount + ' today' : '');
    html += '<div style="display:flex;justify-content:space-between;align-items:center;' + (collapsed ? '' : 'margin-bottom:12px;') + '">'
      + '<div onclick="TaskReminders._toggleCollapse()" style="cursor:pointer;flex:1;display:flex;align-items:center;gap:8px;">'
      +   '<div><h3 style="font-size:16px;font-weight:700;margin:0;">Tasks</h3>'
      +   '<div style="font-size:12px;color:var(--text-light);margin-top:2px;">' + subtitle + '</div>'
      +   '</div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;align-items:center;">'
      + '<button onclick="event.stopPropagation();TaskReminders._openOverlay(null)" style="background:var(--green-dark);color:#fff;border:none;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;">+ New</button>'
      + '<button onclick="event.stopPropagation();loadPage(\'taskreminders\')" style="background:none;border:1px solid var(--border);padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;color:var(--accent);">View All →</button>'
      + '<button onclick="event.stopPropagation();TaskReminders._toggleCollapse()" title="' + (collapsed ? 'Expand' : 'Collapse') + '" style="background:none;border:1px solid var(--border);padding:5px 9px;border-radius:6px;font-size:12px;cursor:pointer;color:var(--text-light);line-height:1;">'
      +   '<span style="display:inline-block;transition:transform .15s;transform:rotate(' + (collapsed ? '-90' : '0') + 'deg);">▼</span>'
      + '</button>'
      + '</div>'
      + '</div>';

    // Bail out early if collapsed — task rows skipped, quick-add bar skipped
    if (collapsed) {
      html += '</div>';
      return html;
    }

    // ── Task rows ──
    if (shown.length > 0) {
      shown.forEach(function(task, idx) {
        var isOverdue = task.dueDate && new Date(task.dueDate) < now && new Date(task.dueDate).toDateString() !== todayStr;
        var dot = prioMap[task.priority] || '#6c757d';
        var midParts = [];
        if (task.assignedTo) midParts.push(UI.esc(task.assignedTo));
        if (task.category) {
          var cat = TaskReminders.CATEGORIES.find(function(c){return c.key===task.category;});
          if (cat) midParts.push(cat.label);
        }
        var dueLabel = task.dueDate ? TaskReminders._formatDue(task.dueDate, now) : '';
        var dueHtml = dueLabel
          ? '<span style="font-size:11px;flex-shrink:0;color:' + (isOverdue ? '#c62828' : 'var(--text-light)') + ';">' + (isOverdue ? '⚠ ' : '') + dueLabel + '</span>'
          : '';
        var isLast = idx === shown.length - 1 && allIncomplete.length <= shown.length;
        html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;' + (isLast ? '' : 'border-bottom:1px solid var(--border);') + 'cursor:pointer;" onclick="TaskReminders._openQuickComplete(\'' + task.id + '\')">'
          + '<div style="width:8px;height:8px;border-radius:50%;background:' + dot + ';flex-shrink:0;"></div>'
          + '<div style="font-size:14px;font-weight:600;flex-shrink:0;white-space:nowrap;">' + UI.esc(task.title) + '</div>'
          + (midParts.length ? '<div style="flex:1;min-width:0;font-size:12px;color:var(--text-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + midParts.join(' · ') + '</div>' : '<div style="flex:1;"></div>')
          + dueHtml
          + '</div>';
      });
      if (allIncomplete.length > shown.length) {
        html += '<div style="padding-top:8px;font-size:12px;color:var(--text-light);text-align:center;">'
          + '<a onclick="loadPage(\'taskreminders\')" style="cursor:pointer;color:var(--green-dark);font-weight:600;">+ ' + (allIncomplete.length - shown.length) + ' more →</a></div>';
      }
    } else {
      html += '<div style="padding:4px 0 8px;font-size:13px;color:var(--text-light);">No open tasks</div>';
    }

    html += '</div>';
    return html;
  },

  // ── Quick-complete sheet (tap a task row → this) ──
  _openQuickComplete: function(id) {
    var task = TaskReminders._getAll().find(function(t) { return t.id === id; });
    if (!task) return;
    var prioMap = { urgent: '#c62828', high: '#e65100', medium: '#1976d2', low: '#6c757d' };
    var dot = prioMap[task.priority] || '#6c757d';
    var meta = [];
    if (task.assignedTo) meta.push('<span style="display:inline-flex;align-items:center;gap:3px;"><i data-lucide="user" style="width:12px;height:12px;"></i>' + UI.esc(task.assignedTo) + '</span>');
    if (task.dueDate) meta.push('<span style="display:inline-flex;align-items:center;gap:3px;"><i data-lucide="calendar" style="width:12px;height:12px;"></i>' + UI.dateShort(task.dueDate) + '</span>');
    if (task.notes)   meta.push('<span style="color:var(--text-light);">' + UI.esc(task.notes.slice(0,80)) + '</span>');

    var html = '<div style="text-align:center;padding:8px 0 16px;">'
      + '<div style="width:10px;height:10px;border-radius:50%;background:' + dot + ';display:inline-block;margin-bottom:12px;"></div>'
      + '<div style="font-size:17px;font-weight:700;margin-bottom:8px;line-height:1.3;">' + UI.esc(task.title) + '</div>'
      + (meta.length ? '<div style="font-size:12px;color:var(--text-light);margin-bottom:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' + meta.join('') + '</div>' : '<div style="margin-bottom:16px;"></div>')
      + '<button onclick="TaskReminders._toggleComplete(\'' + id + '\');UI.closeModal();" style="width:100%;padding:14px;background:var(--green-dark);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:6px;"><i data-lucide="check-circle" style="width:18px;height:18px;"></i>Mark Complete</button>'
      + (task.actionLink ? '<button onclick="' + task.actionLink + ';UI.closeModal();" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:8px;color:var(--text);">→ Open Linked Record</button>' : '')
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">'
      + '<button onclick="UI.closeModal();TaskReminders._openOverlay(\'' + id + '\')" style="background:none;border:none;color:var(--text-light);font-size:13px;cursor:pointer;padding:4px 0;">Edit</button>'
      + '<div style="display:flex;gap:12px;">'
      + '<button onclick="TaskReminders._archiveTask(\'' + id + '\')" style="background:none;border:none;color:var(--text-light);font-size:13px;cursor:pointer;padding:4px 0;">Archive</button>'
      + '<button onclick="TaskReminders._deleteTask(\'' + id + '\')" style="background:none;border:none;color:#c62828;font-size:13px;cursor:pointer;padding:4px 0;">Delete</button>'
      + '</div>'
      + '</div>'
      + '</div>';

    UI.showModal(task.title, html);
    setTimeout(function() { if (typeof lucide !== 'undefined') lucide.createIcons(); }, 0);
  },

  // ── AI quick-add methods ──

  _quickAddSubmit: function() {
    var input = document.getElementById('bm-task-quickadd');
    if (!input) return;
    var raw = (input.value || '').trim();
    if (!raw) { input.focus(); return; }

    // Stop mic if active
    if (TaskReminders._micActive) TaskReminders._toggleMic();

    // Swap button to loading state
    var btn = input.parentNode ? input.parentNode.querySelector('button[title="Add with AI enrichment"]') : null;
    var origLabel = '✦ Add';
    if (btn) { btn.disabled = true; btn.textContent = '…'; }

    TaskReminders._aiEnrichTask(raw).then(function(prefill) {
      if (btn) { btn.disabled = false; btn.textContent = origLabel; }
      input.value = '';
      TaskReminders._openOverlay(null, prefill);
    }).catch(function() {
      if (btn) { btn.disabled = false; btn.textContent = origLabel; }
      // Fallback: open overlay with raw title
      input.value = '';
      TaskReminders._openOverlay(null, { title: raw.slice(0, 80), aiLabel: false });
    });
  },

  _aiEnrichTask: function(description) {
    return new Promise(function(resolve, reject) {
      var apiKey = (window.bmAIKey ? window.bmAIKey() : null)
                 || localStorage.getItem('bm-claude-key') || '';
      if (!apiKey) {
        // No AI key — return minimal prefill
        return resolve({ title: description.slice(0, 80), aiLabel: false });
      }

      var systemPrompt = 'You are a task parser for Second Nature Tree Service (tree trimming, removal, cleanups — Westchester NY). '
        + 'Parse the user\'s natural language task into a structured object.\n\n'
        + 'Available categories: errand, maintenance, prep, cleanup\n'
        + 'Available priorities: low, medium, high, urgent\n\n'
        + 'Respond ONLY with a single JSON object — no markdown, no explanation. Fields:\n'
        + '  title: string (max 70 chars, imperative action verb first)\n'
        + '  description: string (optional extra context, max 120 chars, or empty string)\n'
        + '  category: one of the categories above\n'
        + '  priority: one of the priorities above\n'
        + '  dueDate: ISO datetime string (YYYY-MM-DDTHH:mm) if urgency implied, else null\n'
        + '  actionLink: a JS expression to jump to the relevant BM page if applicable, else null.\n'
        + '    Valid options: "loadPage(\'jobs\')", "loadPage(\'quotes\')", "loadPage(\'invoices\')",\n'
        + '    "loadPage(\'clients\')", "loadPage(\'requests\')", "loadPage(\'equipment\')",\n'
        + '    "loadPage(\'schedule\')", null\n';

      fetch('https://ltpivkqahvplapyagljt.supabase.co/functions/v1/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 256,
          system: systemPrompt,
          messages: [{ role: 'user', content: description }],
          apiKey: apiKey
        })
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var text = (data.content && data.content[0] && data.content[0].text) || '';
        // Strip any accidental markdown fences
        text = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
        var parsed = JSON.parse(text);
        parsed.aiLabel = true;
        resolve(parsed);
      })
      .catch(function() {
        // Parse failed — return raw title
        resolve({ title: description.slice(0, 80), aiLabel: false });
      });
    });
  },

  _toggleMic: function() {
    var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      UI.toast('Voice input not supported in this browser', 'error');
      return;
    }
    var btn = document.getElementById('bm-task-mic-btn');
    if (TaskReminders._micActive) {
      // Stop
      if (TaskReminders._micRecognition) TaskReminders._micRecognition.stop();
      TaskReminders._micActive = false;
      TaskReminders._micRecognition = null;
      if (btn) { btn.style.background = 'none'; btn.style.borderColor = 'var(--border)'; }
      return;
    }
    // Start
    var rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = function(e) {
      var transcript = e.results[0][0].transcript || '';
      var input = document.getElementById('bm-task-quickadd');
      if (input) { input.value = transcript; input.focus(); }
      TaskReminders._micActive = false;
      TaskReminders._micRecognition = null;
      if (btn) { btn.style.background = 'none'; btn.style.borderColor = 'var(--border)'; }
    };
    rec.onerror = function() {
      TaskReminders._micActive = false;
      TaskReminders._micRecognition = null;
      if (btn) { btn.style.background = 'none'; btn.style.borderColor = 'var(--border)'; }
    };
    rec.onend = function() {
      TaskReminders._micActive = false;
      TaskReminders._micRecognition = null;
      if (btn) { btn.style.background = 'none'; btn.style.borderColor = 'var(--border)'; }
    };
    rec.start();
    TaskReminders._micRecognition = rec;
    TaskReminders._micActive = true;
    if (btn) { btn.style.background = '#ffebee'; btn.style.borderColor = '#c62828'; }
  },

  // --- Team Chat integration ---

  postToChat: function(task, channel) {
    // Post task to team chat channel
    if (typeof TeamChat === 'undefined') return;
    var ch = channel || (task.category === 'maintenance' ? 'maintenance' : 'errands');
    var messages = [];
    try { messages = JSON.parse(localStorage.getItem('bm-chat-' + ch) || '[]'); } catch (e) {}
    messages.push({
      id: 'msg_' + Date.now(),
      author: TaskReminders._getCurrentUser(),
      text: 'New task assigned: ' + task.title + (task.assignedTo ? ' (' + task.assignedTo + ')' : '') + (task.dueDate ? ' - Due: ' + TaskReminders._formatDue(task.dueDate) : ''),
      task: task.title,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem('bm-chat-' + ch, JSON.stringify(messages));
  }
};
