/**
 * Branch Manager — Tenant Switcher (v798)
 *
 * For users who have access to multiple tenants (e.g. Doug owns SNT, also
 * runs a partner shop's books), this lets them switch the active tenant_id
 * without logging out/in. Backed by the user_tenants join table.
 *
 * Flow:
 *   1. On load, query user_tenants for the current Supabase Auth user.
 *   2. If >= 2 rows, expose a "Switch tenant" entry in the avatar menu.
 *   3. Clicking opens a modal listing all tenants by name. Click to switch.
 *   4. On switch: write the new tenant_id to localStorage + clear in-memory
 *      cache + reload so all data refetches under the new tenant.
 */
var TenantSwitcher = {
  _loaded: false,
  _tenants: [],

  // Pull the list of tenants this user can access. Resolves the user_id
  // from the current Supabase Auth session, then joins user_tenants with
  // tenants for name+slug. Caches the result so repeat calls are cheap.
  loadTenants: async function() {
    if (TenantSwitcher._loaded) return TenantSwitcher._tenants;
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client || !SupabaseDB.ready) {
      return [];
    }
    try {
      var sess = await SupabaseDB.client.auth.getSession();
      var uid = sess && sess.data && sess.data.session && sess.data.session.user && sess.data.session.user.id;
      if (!uid) return [];

      // Use the SupabaseDB client so RLS is respected. user_tenants → tenants join.
      var res = await SupabaseDB.client
        .from('user_tenants')
        .select('tenant_id, role, tenants(id, name, config)')
        .eq('user_id', uid);
      if (res.error) {
        console.warn('[TenantSwitcher] load error:', res.error.message);
        return [];
      }
      var rows = (res.data || []).map(function(r) {
        var t = r.tenants || {};
        return {
          id: r.tenant_id,
          name: t.name || '(unnamed)',
          role: r.role || 'member',
          logo: (t.config && t.config.logo_url) || null
        };
      }).filter(function(r){ return r.id; });
      TenantSwitcher._tenants = rows;
      TenantSwitcher._loaded = true;
      return rows;
    } catch(e) {
      console.warn('[TenantSwitcher] load exception:', e);
      return [];
    }
  },

  // Surface the menu entry only when the user has 2+ tenants. Called from
  // a small init hook after Auth resolves; safe to call repeatedly.
  init: function() {
    TenantSwitcher.loadTenants().then(function(tenants) {
      if (!tenants || tenants.length < 2) return;
      var menu = document.querySelector('.topbar-avatar .avatar-menu');
      if (!menu) return;
      if (menu.querySelector('[data-bm-tenant-switcher]')) return; // already injected
      var btn = document.createElement('button');
      btn.setAttribute('data-bm-tenant-switcher', '1');
      btn.onclick = function() { TenantSwitcher.show(); };
      btn.innerHTML = '<i data-lucide="building-2" style="width:14px;height:14px;stroke:currentColor;vertical-align:middle;margin-right:6px;"></i>Switch tenant <span style="margin-left:auto;font-size:10px;color:var(--text-light);font-weight:600;">' + tenants.length + '</span>';
      // Insert above the "Help & Onboarding" entry (or just below My Account)
      var helpBtn = Array.from(menu.querySelectorAll('button')).find(function(b){
        return b.textContent.indexOf('Help') >= 0;
      });
      if (helpBtn) menu.insertBefore(btn, helpBtn);
      else menu.appendChild(btn);
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    }).catch(function(){});
  },

  // Open a modal listing every tenant the user can switch to. Current tenant
  // is highlighted; click any other to switch.
  show: function() {
    var current = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    TenantSwitcher.loadTenants().then(function(tenants) {
      if (!tenants.length) {
        UI.toast('No tenants on your account', 'error');
        return;
      }
      var body = '<div style="font-size:13px;color:var(--text-light);margin-bottom:12px;">Pick the tenant you want to work in. The page will reload to refresh data under the new tenant.</div>'
        + '<div style="display:flex;flex-direction:column;gap:6px;">';
      tenants.forEach(function(t) {
        var isCurrent = t.id === current;
        body += '<button '
          + (isCurrent ? '' : 'onclick="TenantSwitcher.switchTo(\'' + t.id + '\')" ')
          + 'style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid ' + (isCurrent ? 'var(--accent)' : 'var(--border)') + ';border-radius:8px;background:' + (isCurrent ? 'var(--green-bg)' : 'var(--white)') + ';cursor:' + (isCurrent ? 'default' : 'pointer') + ';text-align:left;width:100%;">'
          + (t.logo
              ? '<img src="' + UI.esc(t.logo) + '" style="width:28px;height:28px;border-radius:6px;object-fit:cover;flex-shrink:0;">'
              : '<div style="width:28px;height:28px;border-radius:6px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">🏢</div>')
          + '<div style="flex:1;min-width:0;">'
          +   '<div style="font-weight:700;font-size:14px;">' + UI.esc(t.name) + '</div>'
          +   '<div style="font-size:11px;color:var(--text-light);">' + UI.esc(t.role) + '</div>'
          + '</div>'
          + (isCurrent ? '<span style="font-size:11px;color:var(--accent);font-weight:700;">CURRENT</span>' : '<span style="font-size:18px;color:var(--text-light);">→</span>')
          + '</button>';
      });
      body += '</div>';
      UI.showModal('Switch tenant', body, {
        footer: '<button class="btn btn-outline" onclick="UI.closeModal()">Close</button>'
      });
    });
  },

  // Apply the switch: write tenant id to localStorage + clear caches + reload.
  switchTo: function(tenantId) {
    if (!tenantId) return;
    var current = (typeof DB !== 'undefined' && DB.getTenantId) ? DB.getTenantId() : null;
    if (tenantId === current) { UI.closeModal(); return; }
    if (!confirm('Switch to this tenant? Page will reload and data caches will refresh.')) return;
    try {
      localStorage.setItem('bm-tenant-id', tenantId);
      // Clear cross-tenant caches that would otherwise show stale data
      ['bm-clients','bm-jobs','bm-quotes','bm-invoices','bm-requests','bm-team','bm-services','bm-expenses','bm-comms'].forEach(function(k){
        // Comms is keyed bm-comms-{id} per client — clear all client-comm keys
        if (k === 'bm-comms') {
          for (var i = localStorage.length - 1; i >= 0; i--) {
            var key = localStorage.key(i);
            if (key && key.indexOf('bm-comms-') === 0) localStorage.removeItem(key);
          }
          return;
        }
        localStorage.removeItem(k);
      });
      window.location.reload();
    } catch(e) {
      UI.toast('Switch failed: ' + e.message, 'error');
    }
  }
};

// Auto-init when Auth is ready. Polls briefly because Auth may resolve
// asynchronously after the bundle loads.
(function() {
  var tries = 0;
  function tryInit() {
    if (tries++ > 20) return; // ~10s max
    if (typeof SupabaseDB === 'undefined' || !SupabaseDB.ready) {
      return setTimeout(tryInit, 500);
    }
    TenantSwitcher.init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(tryInit, 1500); });
  } else {
    setTimeout(tryInit, 1500);
  }
})();
