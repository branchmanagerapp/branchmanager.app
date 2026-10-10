/**
 * Branch Manager — Data Backup & Restore
 * Export all data as JSON, restore from backup
 */
var BackupPage = {
  render: function() {
    var lastBackup = BackupPage._getLastBackupDate();
    var daysSince = lastBackup ? Math.floor((Date.now() - new Date(lastBackup)) / 86400000) : 999;

    var html = '<div class="section-header"><h2>Backup & Restore</h2>'
      + '<p style="color:var(--text-light);margin-top:4px;">Download a full backup of all your data, or restore from a previous backup.</p></div>';

    // Auto-backup warning banner
    if (daysSince > 7) {
      html += '<div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px;">'
        + '<span style="font-size:20px;">&#9888;&#65039;</span>'
        + '<div><strong style="color:#e65100;">Backup overdue</strong> — '
        + (lastBackup ? 'Last backup was <strong>' + daysSince + ' days ago</strong>.' : 'You have <strong>never backed up</strong> your data.')
        + ' Download a backup now to protect your data.</div>'
        + '</div>';
    }

    // Data summary
    var clients = DB.clients.getAll().length;
    var quotes = DB.quotes.getAll().length;
    var jobs = DB.jobs.getAll().length;
    var invoices = DB.invoices.getAll().length;
    var requests = DB.requests.getAll().length;

    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<h3 style="font-size:15px;margin-bottom:12px;">Current Data</h3>'
      + '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;text-align:center;margin-bottom:16px;">'
      + '<div style="padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:20px;font-weight:800;">' + clients + '</div><div style="font-size:11px;color:var(--text-light);">Clients</div></div>'
      + '<div style="padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:20px;font-weight:800;">' + quotes + '</div><div style="font-size:11px;color:var(--text-light);">Quotes</div></div>'
      + '<div style="padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:20px;font-weight:800;">' + jobs + '</div><div style="font-size:11px;color:var(--text-light);">Jobs</div></div>'
      + '<div style="padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:20px;font-weight:800;">' + invoices + '</div><div style="font-size:11px;color:var(--text-light);">Invoices</div></div>'
      + '<div style="padding:12px;background:var(--bg);border-radius:8px;"><div style="font-size:20px;font-weight:800;">' + requests + '</div><div style="font-size:11px;color:var(--text-light);">Requests</div></div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;">'
      + '<button onclick="BackupPage.downloadBackup()" style="background:var(--green-dark);color:#fff;border:none;padding:12px 24px;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px;">📥 Download Full Backup</button>'
      + '<button onclick="if (typeof CloudSync !== \'undefined\') CloudSync.refresh()" style="background:#1565c0;color:#fff;border:none;padding:12px 24px;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px;">☁️ Sync from Cloud</button>'
      + '</div>'
      + '<p style="font-size:12px;color:var(--text-light);margin-top:8px;">Backup includes all clients, quotes, jobs, invoices, requests, expenses, settings, and communication logs.</p>'
      + '</div>';

    // Recent backup history
    var history = BackupPage._getHistory();
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<h3 style="font-size:15px;margin-bottom:12px;">Recent Backups</h3>';
    if (history.length === 0) {
      html += '<div style="font-size:13px;color:var(--text-light);">No backups recorded yet. Download your first backup above.</div>';
    } else {
      history.forEach(function(h) {
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">'
          + '<div><strong>' + h.date.split('T')[0] + '</strong>'
          + ' <span style="color:var(--text-light);">' + new Date(h.date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + '</span></div>'
          + '<div style="color:var(--text-light);">'
          + h.clients + ' clients &middot; ' + h.quotes + ' quotes &middot; ' + h.jobs + ' jobs &middot; ' + h.invoices + ' invoices'
          + ' &middot; <span style="color:var(--green-dark);font-weight:600;">' + h.size + '</span></div>'
          + '</div>';
      });
    }
    html += '</div>';

    // CSV Export
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<h3 style="font-size:15px;margin-bottom:8px;">Export as CSV</h3>'
      + '<p style="font-size:13px;color:var(--text-light);margin-bottom:12px;">Download individual data sets as CSV files for use in Excel or Google Sheets.</p>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button onclick="BackupPage.exportCSV(\'clients\')" style="background:#e3f2fd;color:#1565c0;border:none;padding:10px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;">&#128196; Clients CSV</button>'
      + '<button onclick="BackupPage.exportCSV(\'jobs\')" style="background:#e8f5e9;color:#2e7d32;border:none;padding:10px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;">&#128196; Jobs CSV</button>'
      + '<button onclick="BackupPage.exportCSV(\'invoices\')" style="background:#fff3e0;color:#e65100;border:none;padding:10px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;">&#128196; Invoices CSV</button>'
      + '</div></div>';

    // Restore
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);margin-bottom:16px;">'
      + '<h3 style="font-size:15px;margin-bottom:8px;">Restore from Backup</h3>'
      + '<p style="font-size:13px;color:var(--text-light);margin-bottom:12px;">Upload a previously downloaded backup file to restore all data.</p>'
      + '<label style="display:inline-block;background:#fff3e0;border:2px dashed #ffe0b2;border-radius:8px;padding:16px 24px;cursor:pointer;font-size:14px;font-weight:600;color:#e65100;">'
      + '📤 Choose Backup File<input type="file" accept=".json" onchange="BackupPage.restore(event)" style="display:none;">'
      + '</label>'
      + '<p style="font-size:11px;color:var(--red);margin-top:8px;">⚠️ Restoring will replace all current data. Make sure you have a current backup first.</p>'
      + '</div>';

    // Auto-backup settings
    html += '<div style="background:var(--white);border-radius:12px;padding:20px;border:1px solid var(--border);">'
      + '<h3 style="font-size:15px;margin-bottom:8px;">Backup Info</h3>'
      + '<div style="font-size:13px;color:var(--text-light);line-height:1.8;">'
      + '<div>☁️ <strong>Cloud (Supabase):</strong> ' + (typeof SupabaseDB !== 'undefined' && SupabaseDB && SupabaseDB.ready ? '<span style="color:var(--green-dark);">Connected — data syncs automatically</span>' : '<span style="color:var(--red);">Not connected</span>') + '</div>'
      + '<div>💾 <strong>Local Storage:</strong> ' + BackupPage._getLocalSize() + ' used</div>'
      + '<div>📅 <strong>Last cloud sync:</strong> ' + ((typeof CloudSync !== 'undefined' ? CloudSync.lastSync : null) > 0 ? UI.dateRelative(new Date((typeof CloudSync !== 'undefined' ? CloudSync.lastSync : null)).toISOString()) : 'Never') + '</div>'
      + '</div></div>';

    return html;
  },

  downloadBackup: function() {
    var backup = {
      version: '1.0',
      app: 'Branch Manager',
      date: new Date().toISOString(),
      data: {}
    };

    // Collect all localStorage data
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.startsWith('bm-')) {
        try {
          backup.data[key] = JSON.parse(localStorage.getItem(key));
        } catch(e) {
          backup.data[key] = localStorage.getItem(key);
        }
      }
    }

    var json = JSON.stringify(backup, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'branch-manager-backup-' + new Date().toISOString().split('T')[0] + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Save to backup history
    var sizeBytes = json.length;
    var sizeLabel = sizeBytes > 1048576 ? (sizeBytes / 1048576).toFixed(1) + ' MB'
      : sizeBytes > 1024 ? Math.round(sizeBytes / 1024) + ' KB'
      : sizeBytes + ' B';
    var histEntry = {
      date: backup.date,
      clients: DB.clients.getAll().length,
      quotes: DB.quotes.getAll().length,
      jobs: DB.jobs.getAll().length,
      invoices: DB.invoices.getAll().length,
      size: sizeLabel
    };
    var hist = BackupPage._getHistory();
    hist.unshift(histEntry);
    if (hist.length > 5) hist = hist.slice(0, 5);
    localStorage.setItem('bm-backup-history', JSON.stringify(hist));

    UI.toast('Backup downloaded!');
  },

  restore: function(event) {
    var file = event.target.files[0];
    if (!file) return;

    if (!confirm('This will replace ALL current data with the backup. Are you sure?')) return;

    var reader = new FileReader();
    reader.onload = function(e) {
      var backup;
      // STEP 1: Parse + validate the backup FIRST — no data touched yet
      try {
        backup = JSON.parse(e.target.result);
      } catch(err) {
        UI.toast('Failed to parse backup file: ' + err.message, 'error');
        return;
      }

      if (!backup || typeof backup !== 'object') {
        UI.toast('Invalid backup file (not an object)', 'error');
        return;
      }
      if (!backup.data || !backup.version) {
        UI.toast('Invalid backup file (missing data or version)', 'error');
        return;
      }
      if (typeof backup.data !== 'object' || Array.isArray(backup.data)) {
        UI.toast('Invalid backup file (data field malformed)', 'error');
        return;
      }
      var keyCount = Object.keys(backup.data).length;
      if (keyCount === 0) {
        UI.toast('Backup file is empty — nothing to restore', 'error');
        return;
      }

      // STEP 2: Confirm before wiping
      var dateStr = backup.date ? backup.date.split('T')[0] : 'unknown date';
      if (!confirm('Restore backup from ' + dateStr + ' (' + keyCount + ' keys)?\n\nThis will REPLACE all current data. Current data will be saved to bm-rollback-* keys in case you need to undo.')) {
        return;
      }

      // STEP 3: Save current data as rollback BEFORE wiping
      try {
        var rollbackSnapshot = {};
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i);
          if (key && key.startsWith('bm-') && !key.startsWith('bm-rollback-')) {
            rollbackSnapshot[key] = localStorage.getItem(key);
          }
        }
        localStorage.setItem('bm-rollback-' + Date.now(), JSON.stringify(rollbackSnapshot));
      } catch(err) {
        if (!confirm('Could not save rollback (localStorage may be full). Continue anyway? This is irreversible.')) return;
      }

      // STEP 4: Now safe to clear + restore
      try {
        var keysToRemove = [];
        for (var j = 0; j < localStorage.length; j++) {
          var k = localStorage.key(j);
          if (k && k.startsWith('bm-') && !k.startsWith('bm-rollback-')) keysToRemove.push(k);
        }
        keysToRemove.forEach(function(k) { localStorage.removeItem(k); });

        Object.keys(backup.data).forEach(function(key) {
          var val = backup.data[key];
          localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
        });

        UI.toast('Data restored from ' + dateStr + '. Rollback saved to bm-rollback-*');
        setTimeout(function() { window.location.reload(); }, 1500);
      } catch(err) {
        UI.toast('Restore failed: ' + err.message + '. Check bm-rollback-* to recover.', 'error');
      }
    };
    reader.readAsText(file);
  },

  // Rollback a botched restore
  rollback: function() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.startsWith('bm-rollback-')) keys.push(k);
    }
    if (keys.length === 0) { UI.toast('No rollback available', 'error'); return; }
    keys.sort(); // oldest first
    var latest = keys[keys.length - 1];
    if (!confirm('Restore from rollback: ' + latest + '?\n\nThis will replace current data with what you had before the last restore.')) return;
    try {
      var snapshot = JSON.parse(localStorage.getItem(latest));
      // Clear current bm- keys
      var toRemove = [];
      for (var j = 0; j < localStorage.length; j++) {
        var key = localStorage.key(j);
        if (key && key.startsWith('bm-') && !key.startsWith('bm-rollback-')) toRemove.push(key);
      }
      toRemove.forEach(function(k) { localStorage.removeItem(k); });
      Object.keys(snapshot).forEach(function(k) { localStorage.setItem(k, snapshot[k]); });
      UI.toast('Rolled back successfully');
      setTimeout(function() { window.location.reload(); }, 1000);
    } catch(e) { UI.toast('Rollback failed: ' + e.message, 'error'); }
  },

  _getHistory: function() {
    try { return JSON.parse(localStorage.getItem('bm-backup-history')) || []; } catch(e) { return []; }
  },

  _getLastBackupDate: function() {
    var hist = BackupPage._getHistory();
    return hist.length > 0 ? hist[0].date : null;
  },

  exportCSV: function(type) {
    var data, headers, filename;
    if (type === 'clients') {
      data = DB.clients.getAll();
      headers = ['id', 'name', 'phone', 'email', 'address', 'city', 'status'];
      filename = 'clients.csv';
    } else if (type === 'jobs') {
      data = DB.jobs.getAll();
      headers = ['id', 'clientName', 'description', 'status', 'scheduledDate', 'total'];
      filename = 'jobs.csv';
    } else if (type === 'invoices') {
      data = DB.invoices.getAll();
      headers = ['id', 'clientName', 'invoiceNumber', 'status', 'dueDate', 'total', 'balance'];
      filename = 'invoices.csv';
    } else {
      return;
    }
    var csv = headers.join(',') + '\n' + data.map(function(row) {
      return headers.map(function(h) {
        var val = row[h] != null ? String(row[h]) : '';
        return '"' + val.replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.toast(type.charAt(0).toUpperCase() + type.slice(1) + ' exported as CSV!');
  },

  _getLocalSize: function() {
    var total = 0;
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.startsWith('bm-')) {
        total += (localStorage.getItem(key) || '').length;
      }
    }
    if (total > 1048576) return (total / 1048576).toFixed(1) + ' MB';
    if (total > 1024) return Math.round(total / 1024) + ' KB';
    return total + ' bytes';
  }
};
