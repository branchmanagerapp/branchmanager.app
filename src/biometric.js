/**
 * Branch Manager — Biometric Lock
 * Gates app access with Face ID / Touch ID / Windows Hello via WebAuthn.
 * Works in Safari, PWA standalone, and Capacitor iOS/Android webviews.
 *
 * Toggle in Settings → Security.
 * Storage:
 *   - bm-biometric-enabled  = "1" if enabled
 *   - bm-biometric-credid   = base64url credential ID (registered once per device)
 */
var Biometric = {
  ENABLE_KEY: 'bm-biometric-enabled',
  CRED_KEY: 'bm-biometric-credid',
  UNLOCKED_KEY: 'bm-biometric-unlocked', // sessionStorage — per-tab unlocks

  isSupported: function() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  },

  isEnabled: function() {
    var enabled = localStorage.getItem(Biometric.ENABLE_KEY) === '1';
    var credId = localStorage.getItem(Biometric.CRED_KEY);
    // Both must be present; otherwise self-heal by disabling
    if (enabled && (!credId || credId.length < 4)) {
      localStorage.removeItem(Biometric.ENABLE_KEY);
      return false;
    }
    return enabled && !!credId;
  },

  isUnlocked: function() {
    return sessionStorage.getItem(Biometric.UNLOCKED_KEY) === '1';
  },

  _buf2b64url: function(buf) {
    var bytes = new Uint8Array(buf);
    var str = '';
    for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  _b64url2buf: function(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  },
  _randomChallenge: function() {
    var a = new Uint8Array(32);
    crypto.getRandomValues(a);
    return a.buffer;
  },

  // Register a new passkey on this device — triggers Face ID / Touch ID enrollment
  register: async function() {
    if (!Biometric.isSupported()) {
      UI.toast('Biometric not supported on this device', 'error');
      return false;
    }
    try {
      var user = (typeof Auth !== 'undefined' && Auth.user) ? Auth.user : { email: 'user@branchmanager', name: 'Doug' };
      var userIdBuf = new TextEncoder().encode(user.email || 'bm-user').buffer;

      var cred = await navigator.credentials.create({
        publicKey: {
          challenge: Biometric._randomChallenge(),
          rp: { name: 'Branch Manager', id: location.hostname },
          user: {
            id: userIdBuf,
            name: user.email || 'user',
            displayName: user.name || user.email || 'Branch Manager'
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },   // ES256
            { type: 'public-key', alg: -257 }  // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform', // Face ID / Touch ID / Windows Hello
            userVerification: 'required',
            residentKey: 'preferred'
          },
          timeout: 60000,
          attestation: 'none'
        }
      });

      if (!cred || !cred.rawId) { UI.toast('Enrollment cancelled', 'error'); return false; }
      var credId = Biometric._buf2b64url(cred.rawId);
      localStorage.setItem(Biometric.CRED_KEY, credId);
      localStorage.setItem(Biometric.ENABLE_KEY, '1');
      sessionStorage.setItem(Biometric.UNLOCKED_KEY, '1');
      UI.toast('Face ID / Touch ID enabled ✓');
      return true;
    } catch (e) {
      console.warn('[Biometric] register failed:', e);
      UI.toast('Could not enroll: ' + (e.message || 'cancelled'), 'error');
      return false;
    }
  },

  // Prompt for authentication — returns true if unlocked
  authenticate: async function() {
    if (!Biometric.isSupported()) return false;
    var credId = localStorage.getItem(Biometric.CRED_KEY);
    if (!credId) return false;
    var idBuf;
    try { idBuf = Biometric._b64url2buf(credId); }
    catch (e) {
      console.warn('[Biometric] corrupted credential — disabling');
      Biometric.disable();
      UI.toast('Biometric data corrupted — please re-enable in Settings', 'error');
      return false;
    }
    try {
      var result = await navigator.credentials.get({
        publicKey: {
          challenge: Biometric._randomChallenge(),
          allowCredentials: [{ type: 'public-key', id: idBuf }],
          userVerification: 'required',
          timeout: 60000,
          rpId: location.hostname
        }
      });
      if (result) {
        sessionStorage.setItem(Biometric.UNLOCKED_KEY, '1');
        return true;
      }
    } catch (e) {
      console.warn('[Biometric] auth failed:', e);
    }
    return false;
  },

  disable: function() {
    localStorage.removeItem(Biometric.ENABLE_KEY);
    localStorage.removeItem(Biometric.CRED_KEY);
    sessionStorage.removeItem(Biometric.UNLOCKED_KEY);
    UI.toast('Biometric lock disabled');
  },

  // Show the lock screen + trigger auth. Called on app boot if enabled.
  showLockScreen: function() {
    // Prevent interaction with the rest of the app
    var veil = document.createElement('div');
    veil.id = 'biometric-veil';
    veil.style.cssText = 'position:fixed;inset:0;background:linear-gradient(180deg,#1a3c12,#0e1410);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    veil.innerHTML = '<div style="font-size:72px;margin-bottom:16px;">🌳</div>'
      + '<div style="font-size:22px;font-weight:800;margin-bottom:6px;">Branch Manager</div>'
      + '<div style="font-size:13px;opacity:.75;margin-bottom:28px;">Locked — authenticate to continue</div>'
      + '<button id="biometric-auth-btn" style="background:#fff;color:#1a3c12;border:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">🔓 Unlock with Face ID</button>'
      + '<button id="biometric-logout-btn" style="margin-top:14px;background:transparent;color:rgba(255,255,255,.6);border:none;font-size:12px;cursor:pointer;text-decoration:underline;">Sign out instead</button>';
    document.body.appendChild(veil);
    document.getElementById('biometric-auth-btn').onclick = function() {
      Biometric.authenticate().then(function(ok) {
        if (ok) { veil.remove(); }
        else { UI.toast('Authentication failed — try again', 'error'); }
      });
    };
    document.getElementById('biometric-logout-btn').onclick = function() {
      Biometric.disable();
      if (typeof Auth !== 'undefined') Auth.logout();
      veil.remove();
    };
    // Auto-prompt on show
    setTimeout(function() {
      Biometric.authenticate().then(function(ok) { if (ok) veil.remove(); });
    }, 300);
  },

  // Boot check — call after Auth confirms logged in
  initGate: function() {
    if (Biometric.isEnabled() && !Biometric.isUnlocked()) {
      Biometric.showLockScreen();
    }
  }
};
