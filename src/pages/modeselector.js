/**
 * Branch Manager — Mode Selector
 * First screen after login: Sales Mode or Crew Mode
 * Stores preference in localStorage, can switch anytime from sidebar
 */
var ModeSelector = {

  getMode: function() {
    return localStorage.getItem('bm-app-mode') || '';
  },

  setMode: function(mode) {
    localStorage.setItem('bm-app-mode', mode);
    // Update sidebar visibility
    ModeSelector._applySidebar(mode);
    // Navigate to the right home
    if (mode === 'sales') {
      loadPage('requests');
    } else if (mode === 'crew') {
      loadPage('crewview');
    } else {
      loadPage('dashboard');
    }
  },

  // Show mode selection screen
  render: function() {
    var userName = (typeof Auth !== 'undefined' && Auth.user) ? Auth.user.name || '' : '';
    var firstName = userName.split(' ')[0] || 'there';

    return '<div style="min-height:80vh;display:flex;align-items:center;justify-content:center;">'
      + '<div style="max-width:500px;width:100%;padding:20px;text-align:center;">'
      + '<img src="icons/login-logo.png" alt="Branch Manager" style="width:100px;height:100px;border-radius:16px;margin-bottom:16px;" onerror="this.style.display=\'none\'">'
      + '<h1 style="font-size:28px;font-weight:800;color:var(--green-dark);margin-bottom:4px;">Branch Manager</h1>'
      + '<p style="font-size:16px;color:var(--text-light);margin-bottom:32px;">Hey ' + firstName + ', how are you working today?</p>'

      // Sales Mode
      + '<button onclick="ModeSelector.setMode(\'sales\')" style="width:100%;padding:24px;background:var(--white);border:2px solid var(--border);border-radius:16px;cursor:pointer;text-align:left;margin-bottom:12px;display:flex;align-items:center;gap:16px;transition:border-color .2s,box-shadow .2s;" onmouseover="this.style.borderColor=\'var(--green-dark)\';this.style.boxShadow=\'0 4px 12px rgba(30,125,50,.15)\'" onmouseout="this.style.borderColor=\'var(--border)\';this.style.boxShadow=\'none\'">'
      + '<div style="width:56px;height:56px;background:linear-gradient(135deg,#1b5e20,#2e7d32);border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
      + '<span style="font-size:28px;color:#fff;">📋</span></div>'
      + '<div><div style="font-size:18px;font-weight:700;color:var(--text);">Sales Mode</div>'
      + '<div style="font-size:14px;color:var(--text-light);margin-top:2px;">Requests, quotes, clients, assessments</div></div>'
      + '</button>'

      // Crew Mode
      + '<button onclick="ModeSelector.setMode(\'crew\')" style="width:100%;padding:24px;background:var(--white);border:2px solid var(--border);border-radius:16px;cursor:pointer;text-align:left;margin-bottom:12px;display:flex;align-items:center;gap:16px;transition:border-color .2s,box-shadow .2s;" onmouseover="this.style.borderColor=\'var(--accent)\';this.style.boxShadow=\'0 4px 12px rgba(21,101,192,.15)\'" onmouseout="this.style.borderColor=\'var(--border)\';this.style.boxShadow=\'none\'">'
      + '<div style="width:56px;height:56px;background:linear-gradient(135deg,#1565c0,#1976d2);border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
      + '<span style="font-size:28px;color:#fff;">🌳</span></div>'
      + '<div><div style="font-size:18px;font-weight:700;color:var(--text);">Crew Mode</div>'
      + '<div style="font-size:14px;color:var(--text-light);margin-top:2px;">Today\'s jobs, clock in/out, photos, notes</div></div>'
      + '</button>'

      // Full Mode (owner)
      + '<button onclick="ModeSelector.setMode(\'full\')" style="width:100%;padding:16px;background:none;border:1px solid var(--border);border-radius:12px;cursor:pointer;font-size:14px;color:var(--text-light);margin-top:8px;">Full Dashboard (Owner)</button>'

      + '</div></div>';
  },

  // Apply sidebar nav based on mode — DISABLED v362 (was hiding items).
  // Kept as a stub so any stray callers don't error. No-op + resets visibility.
  _applySidebar: function(mode) {
    try {
      document.querySelectorAll('.nav-item[data-page]').forEach(function(btn) { btn.style.display = ''; });
      document.querySelectorAll('.nav-section').forEach(function(sec) { sec.style.display = ''; });
    } catch (e) {}
    return;
  },
  _applySidebar_disabled_original: function(mode) {
    var allNavItems = document.querySelectorAll('.nav-item[data-page]');
    if (!allNavItems.length) return;

    var salesPages = ['dashboard','requests','quotes','clients','schedule','teamchat','settings','marketing','socialbranch','reviews','mediacenter','comms','messaging','taskreminders','reports'];
    var crewPages = ['crewview','dispatch','teamchat','schedule','socialbranch','mediacenter'];

    allNavItems.forEach(function(btn) {
      var page = btn.dataset.page;
      if (mode === 'sales') {
        btn.style.display = salesPages.indexOf(page) >= 0 ? '' : 'none';
      } else if (mode === 'crew') {
        btn.style.display = crewPages.indexOf(page) >= 0 ? '' : 'none';
      } else {
        btn.style.display = ''; // show all in full mode
      }
    });

    // Hide/show nav sections
    document.querySelectorAll('.nav-section').forEach(function(sec) {
      if (mode === 'crew') {
        sec.style.display = 'none';
      } else {
        sec.style.display = '';
      }
    });
  },

  // Restore mode on page load — DISABLED v360
  // Mode system was hiding nav items unnecessarily while the app
  // is in active development. Will re-enable once the app is
  // feature-complete and role-based access is the priority.
  init: function() {
    // Force-clear any leftover mode so every nav item renders.
    localStorage.removeItem('bm-app-mode');
    // Reset display on every nav item in case the filter previously ran.
    try {
      document.querySelectorAll('.nav-item[data-page]').forEach(function(btn) { btn.style.display = ''; });
      document.querySelectorAll('.nav-section').forEach(function(sec) { sec.style.display = ''; });
    } catch (e) {}
  }
};
