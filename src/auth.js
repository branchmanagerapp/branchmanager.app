/**
 * Branch Manager — Authentication
 * Supabase Auth with email/password login
 * Role-based access: Owner, Crew Lead, Crew Member
 */
var Auth = {
  user: null,
  role: null,

  init: function() {
    // URL-based logout escape hatch: ?logout=1
    if (window.location.search.includes('logout=1')) {
      localStorage.removeItem('bm-session');
      window.location.href = window.location.pathname;
      return;
    }
    // Check for existing session — validate against Supabase if possible
    var session = localStorage.getItem('bm-session');
    if (session) {
      try {
        var parsed = JSON.parse(session);
        // Reject sessions without a proper login source
        if (!parsed.email || parsed.email.endsWith('@demo')) {
          localStorage.removeItem('bm-session');
          return;
        }
        Auth.user = parsed;
        Auth.role = Auth.user.role || 'owner';
        // Async validate with Supabase (non-blocking)
        if (typeof SupabaseDB !== 'undefined' && SupabaseDB.client) {
          SupabaseDB.client.auth.getSession().then(function(result) {
            if (result.data && result.data.session) {
              // Supabase session valid — keep going
            } else if (Auth.user && Auth.user.email && !Auth.user.email.endsWith('@demo')) {
              // Local auth user — allow (offline fallback)
            } else {
              // No valid session — clear
              Auth.logout();
            }
          }).catch(function() { /* offline — trust local session */ });
        }
      } catch(e) {
        localStorage.removeItem('bm-session');
      }
    }
  },

  isLoggedIn: function() {
    return !!Auth.user;
  },

  isOwner: function() {
    return Auth.role === 'owner';
  },

  isCrewLead: function() {
    return Auth.role === 'owner' || Auth.role === 'crew_lead';
  },

  // Show login screen
  renderLogin: function() {
    return '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:20px;">'
      + '<div style="background:var(--white);border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:400px;width:100%;padding:40px;">'
      + '<div style="text-align:center;margin-bottom:32px;">'
      + '<img src="icons/login-logo.png" alt="Branch Manager" style="width:120px;height:120px;margin-bottom:8px;border-radius:16px;">'
      + '<h1 style="font-size:24px;color:var(--green-dark);margin-bottom:4px;">Branch Manager</h1>'
      + '<p style="font-size:14px;color:var(--text-light);">' + (localStorage.getItem('bm-co-name') || 'Field Service Management') + '</p>'
      + '</div>'
      + '<form onsubmit="Auth.login(event)">'
      + '<div style="margin-bottom:12px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Email</label>'
      + '<input type="email" id="auth-email" required placeholder="you@email.com" style="width:100%;padding:12px;border:2px solid var(--border);border-radius:10px;font-size:15px;" autofocus>'
      + '</div>'
      + '<div style="margin-bottom:16px;">'
      + '<label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Password</label>'
      + '<input type="password" id="auth-password" required placeholder="••••••••" style="width:100%;padding:12px;border:2px solid var(--border);border-radius:10px;font-size:15px;">'
      + '</div>'
      + '<button type="submit" id="auth-submit" style="width:100%;padding:14px;background:var(--green-dark);color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;">Sign In</button>'
      + '<div id="auth-error" style="display:none;margin-top:12px;padding:10px;background:#fde8e8;border-radius:8px;font-size:13px;color:#c0392b;text-align:center;"></div>'
      + '</form>'
      + '<div style="margin-top:24px;text-align:center;font-size:12px;color:var(--text-light);">New tree-service company? <a href="landing-tree.html" style="color:var(--green-dark);font-weight:600;">See plans &amp; start a free 14-day trial</a></div>'
      + '</div></div>';
  },

  // Self-serve signup — a new company gets its own isolated tenant.
  // handle_new_user() auto-provisions tenant+owner from email/business_name;
  // the access-token hook then stamps tenant_id+role onto the session.
  renderSignup: function() {
    var tier = (new URLSearchParams(location.search).get('signup') || 'solo').toLowerCase();
    if (['solo','crew','pro'].indexOf(tier) === -1) tier = 'solo';
    var pretty = { solo:'Solo · $39/mo', crew:'Crew · $89/mo', pro:'Pro · $149/mo' }[tier];
    return '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:20px;">'
      + '<div style="background:var(--white);border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:420px;width:100%;padding:40px;">'
      + '<div style="text-align:center;margin-bottom:28px;">'
      + '<img src="icons/login-logo.png" alt="Branch Manager" style="width:96px;height:96px;margin-bottom:8px;border-radius:16px;">'
      + '<h1 style="font-size:22px;color:var(--green-dark);margin-bottom:4px;">Start your free trial</h1>'
      + '<p style="font-size:13px;color:var(--text-light);">' + pretty + ' · 14 days free · no card required</p>'
      + '</div>'
      + '<form onsubmit="Auth.signup(event)">'
      + '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Company name</label>'
      + '<input type="text" id="su-company" required placeholder="Acme Tree Service" style="width:100%;padding:12px;border:2px solid var(--border);border-radius:10px;font-size:15px;" autofocus></div>'
      + '<div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Work email</label>'
      + '<input type="email" id="su-email" required placeholder="you@yourcompany.com" style="width:100%;padding:12px;border:2px solid var(--border);border-radius:10px;font-size:15px;"></div>'
      + '<div style="margin-bottom:16px;"><label style="font-size:12px;font-weight:600;color:var(--text-light);display:block;margin-bottom:4px;">Password</label>'
      + '<input type="password" id="su-password" required minlength="8" placeholder="At least 8 characters" style="width:100%;padding:12px;border:2px solid var(--border);border-radius:10px;font-size:15px;"></div>'
      + '<button type="submit" id="su-submit" style="width:100%;padding:14px;background:var(--green-dark);color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;">Create account &amp; start trial</button>'
      + '<div id="su-error" style="display:none;margin-top:12px;padding:10px;background:#fde8e8;border-radius:8px;font-size:13px;color:#c0392b;text-align:center;"></div>'
      + '<div id="su-ok" style="display:none;margin-top:12px;padding:10px;background:#e8f5e9;border-radius:8px;font-size:13px;color:#1b5e20;text-align:center;"></div>'
      + '</form>'
      + '<div style="margin-top:22px;text-align:center;font-size:12px;color:var(--text-light);">Already have an account? <a href="' + location.pathname + '" style="color:var(--green-dark);font-weight:600;">Sign in</a></div>'
      + '</div></div>';
  },

  signup: async function(event) {
    event.preventDefault();
    var co = document.getElementById('su-company').value.trim();
    var email = document.getElementById('su-email').value.trim();
    var pw = document.getElementById('su-password').value;
    var tier = (new URLSearchParams(location.search).get('signup') || 'solo').toLowerCase();
    if (['solo','crew','pro'].indexOf(tier) === -1) tier = 'solo';
    var btn = document.getElementById('su-submit');
    var errEl = document.getElementById('su-error');
    var okEl = document.getElementById('su-ok');
    errEl.style.display = 'none'; okEl.style.display = 'none';
    btn.textContent = 'Creating your workspace…'; btn.disabled = true;
    function fail(msg) { errEl.textContent = msg; errEl.style.display = 'block'; btn.textContent = 'Create account & start trial'; btn.disabled = false; }

    if (!(typeof SupabaseDB !== 'undefined' && SupabaseDB.ready && SupabaseDB.client)) {
      return fail('Signup is temporarily unavailable. Please try again shortly.');
    }
    try {
      var res = await SupabaseDB.client.auth.signUp({
        email: email, password: pw,
        options: { data: { business_name: co, signup_tier: tier } }
      });
      if (res.error) {
        var m = (res.error.message || '').toLowerCase();
        if (m.indexOf('already') !== -1 || m.indexOf('registered') !== -1)
          return fail('That email already has an account. Use the Sign in link below.');
        return fail(res.error.message || 'Could not create account.');
      }
      var data = res.data;
      // handle_new_user() has now auto-provisioned this company's tenant + owner row.
      if (!data.session) {
        var r2 = await SupabaseDB.client.auth.signInWithPassword({ email: email, password: pw });
        if (r2.error) {
          okEl.innerHTML = 'Account created. Check <strong>' + email + '</strong> to confirm your email, then sign in.';
          okEl.style.display = 'block'; btn.style.display = 'none';
          return;
        }
        data = r2.data;
      }
      Auth.user = { email: data.user.email, id: data.user.id, role: 'owner', name: co || 'Owner' };
      Auth.role = 'owner';
      localStorage.setItem('bm-session', JSON.stringify(Auth.user));
      try { localStorage.setItem('bm-co-name', co); } catch (e) {}
      try {
        if (typeof Subscription !== 'undefined' && Subscription.setStateLocal) {
          var now = new Date(), ends = new Date(now.getTime() + 14 * 86400000);
          Subscription.setStateLocal({ tier: tier, status: 'trial', trial_started_at: now.toISOString(), trial_ends_at: ends.toISOString() });
        }
      } catch (e) {}
      window.location.href = window.location.pathname;  // clean URL → reload into their branded BM
    } catch (e) {
      fail('Unexpected error: ' + (e && e.message ? e.message : e));
    }
  },

  login: async function(event) {
    event.preventDefault();
    var email = document.getElementById('auth-email').value.trim();
    var password = document.getElementById('auth-password').value;
    var btn = document.getElementById('auth-submit');
    var errEl = document.getElementById('auth-error');

    btn.textContent = 'Signing in...';
    btn.disabled = true;
    errEl.style.display = 'none';

    // Try Supabase auth
    if (SupabaseDB && SupabaseDB.ready) {
      try {
        var { data, error } = await SupabaseDB.client.auth.signInWithPassword({ email: email, password: password });
        if (error) throw error;
        Auth.user = { email: data.user.email, id: data.user.id, role: 'owner', name: (typeof CompanyInfo !== 'undefined' && CompanyInfo.get('ownerName')) || 'Owner' };
        Auth.role = 'owner';
        localStorage.setItem('bm-session', JSON.stringify(Auth.user));
        window.location.reload();
        return;
      } catch(e) {
        // Fall through to local auth
        console.warn('Supabase auth failed:', e.message);
      }
    }

    // Local auth fallback — case insensitive email
    // Uses djb2 hash for password comparison (no plaintext passwords in source)
    // To generate a hash: Auth._hash('yourpassword') in browser console
    var emailLower = email.toLowerCase();
    var customHashes = {};
    try { customHashes = JSON.parse(localStorage.getItem('bm-auth-hashes') || '{}'); } catch(e) {}
    var users = {
      'info@peekskilltree.com': { hash: customHashes['info@peekskilltree.com'] || '28006cfd', role: 'owner', name: (typeof CompanyInfo !== 'undefined' && CompanyInfo.get('ownerName')) || 'Owner' },
      'crew@peekskilltree.com': { hash: customHashes['crew@peekskilltree.com'] || '14b65440', role: 'crew_lead', name: 'Crew Lead' },
      'doug@peekskilltree.com': { hash: customHashes['doug@peekskilltree.com'] || '28006cfd', role: 'owner', name: (typeof CompanyInfo !== 'undefined' && CompanyInfo.get('ownerName')) || 'Owner' }
    };

    var user = users[emailLower];

    // ALSO accept any team member from the Team page whose email has a password hash set.
    // (Owner creates logins via Team → member → "Create Login" — generates a random password,
    //  stores its hash in bm-auth-hashes keyed by email.)
    if (!user) {
      try {
        var team = JSON.parse(localStorage.getItem('bm-team') || '[]');
        var teamMatch = team.find(function(m) { return (m.email || '').toLowerCase() === emailLower; });
        if (teamMatch && customHashes[emailLower]) {
          user = {
            hash: customHashes[emailLower],
            role: teamMatch.role || 'crew_member',
            name: teamMatch.name || emailLower.split('@')[0]
          };
        }
      } catch(e) {}
    }

    if (user && Auth._hash(password) === user.hash) {
      Auth.user = { email: email, role: user.role, name: user.name };
      Auth.role = user.role;
      localStorage.setItem('bm-session', JSON.stringify(Auth.user));
      window.location.reload();
    } else {
      errEl.textContent = 'Invalid email or password';
      errEl.style.display = 'block';
      btn.textContent = 'Sign In';
      btn.disabled = false;
    }
  },

  // djb2 hash — simple, fast, no dependencies. Returns hex string.
  // Generate new hash: Auth._hash('yourpassword') in browser console
  _hash: function(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & 0xffffffff;
    }
    return (hash >>> 0).toString(16);
  },

  logout: function() {
    Auth.user = null;
    Auth.role = null;
    localStorage.removeItem('bm-session');
    // Clear sensitive cached data on logout
    localStorage.removeItem('bm-recent-search');
    localStorage.removeItem('bm-recent-searches');
    // Tear down realtime + polling so we don't leak subscriptions across users
    try {
      if (SupabaseDB && SupabaseDB._realtimeChannel) { SupabaseDB._realtimeChannel.unsubscribe(); SupabaseDB._realtimeChannel = null; }
      if (SupabaseDB && SupabaseDB._livePollInterval) { clearInterval(SupabaseDB._livePollInterval); SupabaseDB._livePollInterval = null; }
      if (SupabaseDB && SupabaseDB._pollInterval) { clearInterval(SupabaseDB._pollInterval); SupabaseDB._pollInterval = null; }
    } catch(e) {}
    // Clear biometric session unlock so the next login re-prompts
    try { sessionStorage.removeItem('bm-biometric-unlocked'); } catch(e) {}
    if (SupabaseDB && SupabaseDB.ready) {
      SupabaseDB.client.auth.signOut().catch(function() {});
    }
    // Clear service worker cache for security
    if ('caches' in window) {
      caches.keys().then(function(names) {
        names.forEach(function(n) { caches.delete(n); });
      });
    }
    window.location.reload();
  },

  // Session timeout — auto logout after 30 DAYS inactivity (was 30 min).
  // Your phone/computer is already locked with biometrics; extra timeout here
  // just creates friction without real security benefit on a trusted device.
  _TIMEOUT_MS: 30 * 24 * 60 * 60 * 1000,
  _lastActivity: Date.now(),
  _timeoutTimer: null,

  resetActivity: function() {
    Auth._lastActivity = Date.now();
  },

  startSessionTimer: function() {
    if (Auth._timeoutTimer) clearInterval(Auth._timeoutTimer);
    Auth._timeoutTimer = setInterval(function() {
      if (Auth.isLoggedIn() && (Date.now() - Auth._lastActivity) > Auth._TIMEOUT_MS) {
        UI.toast('Session expired — logging out for security', 'error');
        setTimeout(function() { Auth.logout(); }, 1500);
      }
    }, 60000); // Check every minute
    // Track activity
    ['click', 'keydown', 'scroll', 'touchstart'].forEach(function(evt) {
      document.addEventListener(evt, Auth.resetActivity, { passive: true });
    });
  },

  // Get pages visible for current role
  getVisiblePages: function() {
    var all = ['dashboard','pipeline','schedule','dispatch','clients','requests','quotes','jobs','invoices',
      'payments','insights','reviews','reviewtools','satisfaction','team','timesheet','automations',
      'calculators','messaging','clientmap','photomap','propertymap','recurring','notifications',
      'expenses','profitloss','jobcosting','budget','reports','weeklysummary','onlinebooking',
      'clienthub','formbuilder','mediacenter','beforeafter','campaigns','referrals','receptionist',
      'import','backup','settings','crewview','crewperformance','employeecenter','equipment',
      'materials','comms','emailtemplates','customfields','visits','checklists','workflow',
      'ai','treemeasure','reminders','search',
      // Hub pages + recent additions — were missing, hid them in nav
      'operations','marketing','tools','branchcam','teamchat','taskreminders',
      'modeselector','permissions','payroll','dailyinspection','cardone','videoquote',
      'aitreeid','estimator','photomap','recurring','pretrip'];

    if (Auth.role === 'crew_member') {
      return ['crewview','dispatch','schedule','timesheet','employeecenter','budget','notifications'];
    }
    if (Auth.role === 'crew_lead') {
      return ['dashboard','dispatch','schedule','clients','jobs','quotes','timesheet','messaging','employeecenter','budget','notifications','expenses'];
    }
    return all; // owner sees everything
  },

  // Check if current user can see a page
  canAccess: function(page) {
    return Auth.getVisiblePages().indexOf(page) >= 0;
  }
};

// Init on load
Auth.init();
