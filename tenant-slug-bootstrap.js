/**
 * tenant-slug-bootstrap.js — when a customer-facing page (pay / approve /
 * paid / portal / book) loads under clients.branchmanager.app/{slug}/...
 * the CF Worker forwards the slug as ?tenant_slug=<slug>. This script:
 *
 *   1. Reads ?tenant_slug
 *   2. Calls /functions/v1/tenant-by-slug
 *   3. Overrides BM_CONFIG fields with the tenant's brand strings
 *   4. Writes bm-co-* localStorage so CompanyInfo / branding.js token
 *      replacement picks up the override on first render
 *
 * Returns a Promise that resolves once the override is applied (or
 * immediately if no slug). Pages can `await` it before render.
 *
 * v774.
 */
(function() {
  var FN_URL = 'https://ltpivkqahvplapyagljt.supabase.co/functions/v1';
  window.bmTenantSlugBootstrap = (function() {
    var qs = new URLSearchParams(location.search);
    var slug = (qs.get('tenant_slug') || '').trim();
    if (!slug) return Promise.resolve(null);
    return fetch(FN_URL + '/tenant-by-slug?slug=' + encodeURIComponent(slug))
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(t) {
        if (!t || !t.ok) return null;
        // Override BM_CONFIG (used by pay.html / approve.html for branding)
        if (window.BM_CONFIG) {
          if (t.name)    window.BM_CONFIG.companyName = t.name;
          if (t.phone)   { window.BM_CONFIG.phone = t.phone; window.BM_CONFIG.phoneTel = '+' + (t.phone.replace(/\D/g, '').replace(/^1?/, '1')); window.BM_CONFIG.phoneDigits = t.phone.replace(/\D/g, ''); }
          if (t.email)   window.BM_CONFIG.email = t.email;
          if (t.website) { window.BM_CONFIG.website = t.website; window.BM_CONFIG.websiteUrl = t.website.indexOf('http') === 0 ? t.website : ('https://' + t.website); }
          if (t.logo_url) window.BM_CONFIG.logoUrl = t.logo_url;
        }
        // Write the same values to bm-co-* so CompanyInfo + branding.js
        // (used by portal.html token replacement) pick them up.
        try {
          if (t.name)     localStorage.setItem('bm-co-name', t.name);
          if (t.phone)    localStorage.setItem('bm-co-phone', t.phone);
          if (t.email)    localStorage.setItem('bm-co-email', t.email);
          if (t.website)  localStorage.setItem('bm-co-website', t.website);
          if (t.logo_url) localStorage.setItem('bm-co-logo', t.logo_url);
          // Stamp the resolved tenant id too so deep links can use it.
          if (t.id) localStorage.setItem('bm-tenant-id', t.id);
        } catch(e) {}
        // Expose for downstream code that wants the full record.
        window.bmResolvedTenant = t;
        return t;
      })
      .catch(function() { return null; });
  })();
})();
