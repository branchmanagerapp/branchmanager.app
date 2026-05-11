/**
 * Branch Manager — Command Palette (⌘K)
 * Spotlight-style quick actions across the entire app
 */
var CommandPalette = {
  _visible: false,
  _idx: 0,
  _results: [],

  // All available commands
  _commands: [
    // Navigation
    { category: 'Navigate', label: 'Go to Dashboard', icon: '🏠', action: function() { loadPage('dashboard'); }, keywords: 'home overview' },
    { category: 'Navigate', label: 'Go to Schedule', icon: '📅', action: function() { loadPage('schedule'); }, keywords: 'calendar' },
    { category: 'Navigate', label: 'Go to Clients', icon: '👥', action: function() { loadPage('clients'); }, keywords: 'customers contacts' },
    { category: 'Navigate', label: 'Go to Requests', icon: '📥', action: function() { loadPage('requests'); }, keywords: 'leads inbox' },
    { category: 'Navigate', label: 'Go to Quotes', icon: '📋', action: function() { loadPage('quotes'); }, keywords: 'estimates proposals' },
    { category: 'Navigate', label: 'Go to Jobs', icon: '🔧', action: function() { loadPage('jobs'); }, keywords: 'work orders tasks' },
    { category: 'Navigate', label: 'Go to Invoices', icon: '💰', action: function() { loadPage('invoices'); }, keywords: 'billing payments' },
    { category: 'Navigate', label: 'Go to Pipeline', icon: '📊', action: function() { loadPage('pipeline'); }, keywords: 'sales funnel' },
    { category: 'Navigate', label: 'Go to Timesheets', icon: '⏱', action: function() { loadPage('timesheet'); }, keywords: 'time tracking hours' },
    { category: 'Navigate', label: 'Go to Expenses', icon: '💸', action: function() { loadPage('expenses'); }, keywords: 'costs receipts' },
    { category: 'Navigate', label: 'Go to Reporting', icon: '📈', action: function() { loadPage('reports'); }, keywords: 'analytics stats' },
    { category: 'Navigate', label: 'Go to Crew', icon: '👷', action: function() { window._payrollTab='payroll'; loadPage('payroll'); }, keywords: 'crew employees staff team payroll' },
    { category: 'Navigate', label: 'Go to Settings', icon: '⚙️', action: function() { loadPage('settings'); }, keywords: 'preferences config' },
    { category: 'Navigate', label: 'Go to Dispatch', icon: '🗺️', action: function() { loadPage('dispatch'); }, keywords: 'route map driving' },
    { category: 'Navigate', label: 'Go to Crew Performance', icon: '🏆', action: function() { loadPage('crewperformance'); }, keywords: 'leaderboard stats metrics' },
    { category: 'Navigate', label: 'Go to Messages', icon: '💬', action: function() { loadPage('messaging'); }, keywords: 'sms email text' },

    // Create
    { category: 'Create', label: 'New Client', icon: '➕', action: function() { ClientsPage.showForm(); }, keywords: 'add customer' },
    { category: 'Create', label: 'New Request', icon: '➕', action: function() { RequestsPage.showForm(); }, keywords: 'add lead' },
    { category: 'Create', label: 'New Quote', icon: '➕', action: function() { QuotesPage.showForm(); }, keywords: 'add estimate' },
    { category: 'Create', label: 'New Job', icon: '➕', action: function() { JobsPage.showForm(); }, keywords: 'add work order' },
    { category: 'Create', label: 'New Invoice', icon: '➕', action: function() { if(typeof InvoicesPage!=='undefined') InvoicesPage.showForm(); }, keywords: 'add bill' },
    { category: 'Create', label: 'Quick Estimate', icon: '🧮', action: function() { if(typeof Estimator!=='undefined') Estimator.show(); }, keywords: 'calculator price' },
    { category: 'Create', label: 'Log Expense', icon: '💸', action: function() { loadPage('expenses'); }, keywords: 'add cost receipt' },
    { category: 'Create', label: 'Clock In', icon: '⏱', action: function() { if(typeof TimeTrackPage!=='undefined') TimeTrackPage.clockIn(null); else loadPage('timetrack'); }, keywords: 'start time punch' },

    // Actions
    { category: 'Actions', label: 'Toggle Dark Mode', icon: '🌙', action: function() { toggleDarkMode(); }, keywords: 'theme night light' },
    { category: 'Actions', label: 'Sync to Cloud', icon: '☁️', action: function() { if(typeof CloudSync!=='undefined') CloudSync.refresh(); loadPage('backup'); }, keywords: 'upload backup save' },
    { category: 'Actions', label: 'Export All Data', icon: '📦', action: function() { if(typeof BackupPage!=='undefined') BackupPage.downloadBackup(); }, keywords: 'download backup' },
    { category: 'Actions', label: 'Show Keyboard Shortcuts', icon: '⌨️', action: function() { CommandPalette._showShortcuts(); }, keywords: 'hotkeys keys help' },
    { category: 'Actions', label: 'View Property Map', icon: '🗺️', action: function() { if(typeof PropertyMap!=='undefined') PropertyMap.show(''); else loadPage('dispatch'); }, keywords: 'satellite aerial equipment' },
    { category: 'Actions', label: 'Open Online Booking Settings', icon: '🌐', action: function() { loadPage('onlinebooking'); }, keywords: 'widget embed website' },
    { category: 'Actions', label: 'View Job Costing', icon: '💵', action: function() { loadPage('jobcosting'); }, keywords: 'profitability margin' },
    { category: 'Actions', label: 'Email Templates', icon: '✉️', action: function() { loadPage('messaging'); }, keywords: 'templates messages' },
    { category: 'Actions', label: 'Recurring Jobs', icon: '🔄', action: function() { loadPage('recurring'); }, keywords: 'repeat schedule' }
  ],

  show: function() {
    if (CommandPalette._visible) { CommandPalette.hide(); return; }
    CommandPalette._visible = true;
    CommandPalette._idx = 0;
    CommandPalette._results = CommandPalette._commands.slice();

    var overlay = document.createElement('div');
    overlay.id = 'cmd-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding-top:15vh;backdrop-filter:blur(4px);';
    overlay.onclick = function(e) { if (e.target === overlay) CommandPalette.hide(); };

    var palette = document.createElement('div');
    palette.id = 'cmd-palette';
    palette.style.cssText = 'width:560px;max-width:90vw;background:var(--white);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;';

    palette.innerHTML = '<div style="padding:16px;border-bottom:1px solid var(--border);">'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<span style="font-size:18px;color:var(--text-light);">🔍</span>'
      + '<input type="text" id="cmd-input" placeholder="Type a command or search..." '
      + 'style="flex:1;border:none;outline:none;font-size:16px;background:transparent;color:var(--text);" autocomplete="off">'
      + '<kbd style="background:var(--bg);padding:3px 8px;border-radius:4px;font-size:11px;color:var(--text-light);border:1px solid var(--border);">ESC</kbd>'
      + '</div></div>'
      + '<div id="cmd-results" style="max-height:50vh;overflow-y:auto;"></div>'
      + '<div style="padding:8px 16px;border-top:1px solid var(--border);display:flex;gap:12px;font-size:11px;color:var(--text-light);">'
      + '<span><kbd style="background:var(--bg);padding:1px 5px;border-radius:3px;font-size:10px;">↑↓</kbd> Navigate</span>'
      + '<span><kbd style="background:var(--bg);padding:1px 5px;border-radius:3px;font-size:10px;">↵</kbd> Select</span>'
      + '<span><kbd style="background:var(--bg);padding:1px 5px;border-radius:3px;font-size:10px;">esc</kbd> Close</span>'
      + '</div>';

    overlay.appendChild(palette);
    document.body.appendChild(overlay);

    CommandPalette._renderResults('');

    var input = document.getElementById('cmd-input');
    setTimeout(function() { input.focus(); }, 50);

    input.addEventListener('input', function() {
      CommandPalette._filter(this.value.trim());
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { CommandPalette.hide(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        CommandPalette._idx = Math.min(CommandPalette._idx + 1, CommandPalette._results.length - 1);
        CommandPalette._highlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        CommandPalette._idx = Math.max(CommandPalette._idx - 1, 0);
        CommandPalette._highlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var cmd = CommandPalette._results[CommandPalette._idx];
        if (cmd) {
          CommandPalette.hide();
          cmd.action();
        }
      }
    });
  },

  hide: function() {
    CommandPalette._visible = false;
    var overlay = document.getElementById('cmd-overlay');
    if (overlay) overlay.remove();
  },

  _filter: function(q) {
    if (!q) {
      CommandPalette._results = CommandPalette._commands.slice();
    } else {
      var lower = q.toLowerCase();
      CommandPalette._results = CommandPalette._commands.filter(function(cmd) {
        return cmd.label.toLowerCase().indexOf(lower) > -1
          || cmd.category.toLowerCase().indexOf(lower) > -1
          || (cmd.keywords && cmd.keywords.toLowerCase().indexOf(lower) > -1);
      });

      // Also search records (clients, jobs, quotes)
      if (typeof DB !== 'undefined') {
        var clients = DB.clients.search(q).slice(0, 3).map(function(c) {
          return { category: 'Clients', label: c.name, icon: '👤', action: function() { ClientsPage.showDetail(c.id); }, keywords: '' };
        });
        var jobs = DB.jobs.search(q).slice(0, 3).map(function(j) {
          return { category: 'Jobs', label: '#' + j.jobNumber + ' ' + (j.clientName || ''), icon: '🔧', action: function() { JobsPage.showDetail(j.id); }, keywords: '' };
        });
        var quotes = DB.quotes.search(q).slice(0, 3).map(function(qr) {
          return { category: 'Quotes', label: '#' + qr.quoteNumber + ' ' + (qr.clientName || ''), icon: '📋', action: function() { QuotesPage.showDetail(qr.id); }, keywords: '' };
        });
        CommandPalette._results = CommandPalette._results.concat(clients, jobs, quotes);
      }
    }

    CommandPalette._idx = 0;
    CommandPalette._renderResults(q);
  },

  _renderResults: function(q) {
    var container = document.getElementById('cmd-results');
    if (!container) return;

    if (CommandPalette._results.length === 0) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-light);">'
        + '<div style="font-size:24px;margin-bottom:8px;">🤷</div>'
        + 'No matching commands for "' + UI.esc(q) + '"</div>';
      return;
    }

    var html = '';
    var lastCategory = '';
    CommandPalette._results.forEach(function(cmd, i) {
      if (cmd.category !== lastCategory) {
        html += '<div style="padding:6px 16px;font-size:10px;font-weight:700;color:var(--text-light);text-transform:uppercase;letter-spacing:.5px;background:var(--bg);">' + cmd.category + '</div>';
        lastCategory = cmd.category;
      }
      html += '<div class="cmd-item" data-idx="' + i + '" '
        + 'onclick="CommandPalette._results[' + i + '].action();CommandPalette.hide();" '
        + 'onmouseover="CommandPalette._idx=' + i + ';CommandPalette._highlight();" '
        + 'style="display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;transition:background .1s;' + (i === 0 ? 'background:var(--bg);' : '') + '">'
        + '<span style="font-size:16px;width:24px;text-align:center;">' + cmd.icon + '</span>'
        + '<span style="font-size:14px;font-weight:500;">' + UI.esc(cmd.label) + '</span>'
        + '</div>';
    });

    container.innerHTML = html;
  },

  _highlight: function() {
    var items = document.querySelectorAll('.cmd-item');
    items.forEach(function(item, i) {
      item.style.background = i === CommandPalette._idx ? 'var(--bg)' : '';
    });
    if (items[CommandPalette._idx]) {
      items[CommandPalette._idx].scrollIntoView({ block: 'nearest' });
    }
  },

  _showShortcuts: function() {
    UI.showModal('Keyboard Shortcuts', '<div style="font-size:14px;line-height:2.2;">'
      + '<div style="display:flex;justify-content:space-between;"><span>Command Palette</span><kbd style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px;">⌘K</kbd></div>'
      + '<div style="display:flex;justify-content:space-between;"><span>Create New</span><kbd style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px;">⌘N</kbd></div>'
      + '<div style="display:flex;justify-content:space-between;"><span>Dashboard</span><kbd style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px;">1</kbd></div>'
      + '<div style="display:flex;justify-content:space-between;"><span>Schedule</span><kbd style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px;">2</kbd></div>'
      + '<div style="display:flex;justify-content:space-between;"><span>Clients</span><kbd style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px;">3</kbd></div>'
      + '<div style="display:flex;justify-content:space-between;"><span>Quotes</span><kbd style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px;">4</kbd></div>'
      + '<div style="display:flex;justify-content:space-between;"><span>Jobs</span><kbd style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px;">5</kbd></div>'
      + '<div style="display:flex;justify-content:space-between;"><span>Invoices</span><kbd style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px;">6</kbd></div>'
      + '<div style="display:flex;justify-content:space-between;"><span>Pipeline</span><kbd style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px;">7</kbd></div>'
      + '<div style="display:flex;justify-content:space-between;"><span>Dark Mode</span><kbd style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:12px;">⌘D</kbd></div>'
      + '</div>', { keepModal: true });
  }
};
