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
  var SB_URL = 'https://ltpivkqahvplapyagljt.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI';

  // Apply a tenant's branding over BM_CONFIG + bm-co-* localStorage.
  // `t` = { name, config } (tenants row) OR the flat tenant-by-slug shape.
  // White-label core: every customer-facing standalone page (pay/approve/
  // paid/client/book/sat) renders BM_CONFIG, whose defaults are Second
  // Nature Tree. This rewrites those fields to the record's real tenant so
  // a friend's customer never sees SNT. Pure data write — pages re-render
  // from BM_CONFIG afterwards. Safe + idempotent; no-op on bad input.
  function applyBranding(t) {
    if (!t) return;
    var c = (t.config && typeof t.config === 'object') ? t.config
          : t; // flat shape (tenant-by-slug already returns top-level fields)
    var name  = t.name || c.company_name || c.name || '';
    var phone = c.company_phone || c.phone || '';
    var email = c.company_email || c.from_email || c.email || '';
    var site  = c.company_website || c.website || '';
    var logo  = c.logo_url || '';
    var addr  = [c.address_line1, c.address_line2,
                 [c.city, c.state, c.zip].filter(Boolean).join(', ')]
                .filter(Boolean).join(', ');
    var BC = window.BM_CONFIG;
    if (BC) {
      if (name)  BC.companyName = name;
      if (phone) {
        BC.phone = phone;
        var dg = String(phone).replace(/\D/g, '');
        BC.phoneDigits = dg;
        BC.phoneTel = '+' + dg.replace(/^1?/, '1');
      }
      if (email) BC.email = email;
      if (site)  { BC.website = site; BC.websiteUrl = site.indexOf('http') === 0 ? site : ('https://' + site); }
      if (logo)  BC.logoUrl = logo;
      if (addr)  BC.address = addr;
      if (c.city || c.state) BC.city = [c.city, c.state].filter(Boolean).join(', ');
      if (c.state) BC.state = c.state;
    }
    try {
      if (name)  localStorage.setItem('bm-co-name', name);
      if (phone) localStorage.setItem('bm-co-phone', phone);
      if (email) localStorage.setItem('bm-co-email', email);
      if (site)  localStorage.setItem('bm-co-website', site);
      if (logo)  localStorage.setItem('bm-co-logo', logo);
      if (addr)  localStorage.setItem('bm-co-address', addr);
      if (c.google_review_url) localStorage.setItem('bm-co-review', c.google_review_url);
      if (t.id || c.id) localStorage.setItem('bm-tenant-id', t.id || c.id);
    } catch (e) {}
    window.bmResolvedTenant = t;
  }
  window.bmApplyBranding = applyBranding;

  // Resolve a tenant's branding by id (anon REST — public_read policy on
  // tenants allows select name,config by id). Returns a Promise. Used by
  // pages that have the record's tenant_id but no ?tenant_slug.
  window.bmApplyTenantBranding = function(tenantId) {
    if (!tenantId) return Promise.resolve(null);
    if (window.bmResolvedTenant) return Promise.resolve(window.bmResolvedTenant);
    return fetch(SB_URL + '/rest/v1/tenants?select=name,config&id=eq.' + encodeURIComponent(tenantId) + '&limit=1',
        { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(rows) {
        var t = rows && rows[0];
        if (t) applyBranding(t);
        return t || null;
      })
      .catch(function() { return null; });
  };

  window.bmTenantSlugBootstrap = (function() {
    var qs = new URLSearchParams(location.search);
    var slug = (qs.get('tenant_slug') || '').trim();
    if (!slug) return Promise.resolve(null);
    return fetch(FN_URL + '/tenant-by-slug?slug=' + encodeURIComponent(slug))
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(t) {
        if (!t || !t.ok) return null;
        // Unified path — applyBranding handles the flat tenant-by-slug
        // shape and writes BM_CONFIG + bm-co-* + bmResolvedTenant.
        applyBranding(t);
        return t;
      })
      .catch(function() { return null; });
  })();
})();
