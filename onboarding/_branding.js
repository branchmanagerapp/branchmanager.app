/**
 * Onboarding white-label branding bootstrap (v597)
 *
 * Replaces {{tokens}} in the page body with values from the current
 * tenant's config (tenants.config in Supabase). Lets every onboarding
 * HTML stay tenant-agnostic — Second Nature Tree, Demo Tree Service, or
 * any future tenant gets their own legal name, address, phone, etc. by
 * just changing tenants.config.
 *
 * Tenant resolution order (first hit wins):
 *   1. ?tenant=<uuid> in the URL
 *   2. localStorage 'bm-tenant-id' (set by main BM app)
 *   3. window.parent.localStorage 'bm-tenant-id' (when iframed in BM)
 *   4. SNT fallback for safety
 *
 * Token format: {{token}} or {{token|fallback}}.
 *
 * Tokens (all sourced from tenants.config):
 *   {{business_name}}        - "Second Nature Tree Service"
 *   {{business_short_name}}  - "Second Nature Tree"
 *   {{legal_name}}           - "Second Nature Tree Service LLC"
 *   {{owner_name}}           - "Doug Brown"
 *   {{phone}}                - "(914) 391-5233"
 *   {{email}}                - "info@peekskilltree.com"
 *   {{website}}              - "https://peekskilltree.com"
 *   {{address_line1}}        - "1 Highland Industrial Park"
 *   {{address_line2}}        - "" (optional suite/floor)
 *   {{city}}                 - "Peekskill"
 *   {{state}}                - "NY"
 *   {{state_full}}           - "New York"
 *   {{zip}}                  - "10566"
 *   {{address_full}}         - composed: "1 Highland Industrial Park, Peekskill, NY 10566"
 *   {{address_short}}        - composed: "Peekskill, NY"
 *   {{effective_date}}       - "April 2026"
 *   {{license_text}}         - "Licensed & Fully Insured"
 *   {{logo_url}}             - "https://branchmanager.app/icons/icon-512.png"
 *   {{brand_color}}          - "#1a3c12"
 *   {{vertical}}             - "tree_service"
 */
(function() {
  var SUPABASE_URL = 'https://ltpivkqahvplapyagljt.supabase.co';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cGl2a3FhaHZwbGFweWFnbGp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwOTgxNzIsImV4cCI6MjA4OTY3NDE3Mn0.bQ-wAx4Uu-FyA2ZwsTVfFoU2ZPbeWCmupqV-6ZR9uFI';
  var SNT_FALLBACK_ID = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5';

  function resolveTenantId() {
    try {
      var url = new URL(window.location.href);
      var t = url.searchParams.get('tenant');
      if (t) return t;
    } catch(e) {}
    try {
      var t1 = localStorage.getItem('bm-tenant-id');
      if (t1) return t1;
    } catch(e) {}
    try {
      var t2 = window.parent && window.parent.localStorage && window.parent.localStorage.getItem('bm-tenant-id');
      if (t2) return t2;
    } catch(e) {}
    return SNT_FALLBACK_ID;
  }

  // Hardcoded SNT defaults — used if Supabase fetch fails AND no tenant config
  // is reachable, so the page still renders something sensible. Same values
  // currently shipped in the HTML, just as a backup.
  var SNT_DEFAULTS = {
    business_name: 'Second Nature Tree Service',
    business_short_name: 'Second Nature Tree',
    legal_name: 'Second Nature Tree Service LLC',
    owner_name: 'Doug Brown',
    phone: '(914) 391-5233',
    email: 'info@peekskilltree.com',
    website: 'https://peekskilltree.com',
    address_line1: '1 Highland Industrial Park',
    address_line2: '',
    city: 'Peekskill',
    state: 'NY',
    state_full: 'New York',
    zip: '10566',
    effective_date: 'April 2026',
    license_text: 'Licensed & Fully Insured',
    logo_url: 'https://branchmanager.app/icons/icon-512.png',
    brand_color: '#1a3c12',
    vertical: 'tree_service'
  };

  function buildTokens(tenant) {
    var c = (tenant && tenant.config) || {};
    var t = {};
    Object.keys(SNT_DEFAULTS).forEach(function(k) { t[k] = SNT_DEFAULTS[k]; });

    // Map tenants.config field names → token names
    if (c.company_name) t.business_name = c.company_name;
    if (c.business_short_name) t.business_short_name = c.business_short_name;
    if (c.legal_name) t.legal_name = c.legal_name;
    if (c.owner_name) t.owner_name = c.owner_name;
    if (c.company_phone) t.phone = c.company_phone;
    if (c.company_email) t.email = c.company_email;
    if (c.company_website) t.website = c.company_website;
    if (c.address_line1) t.address_line1 = c.address_line1;
    if (c.address_line2 !== undefined) t.address_line2 = c.address_line2 || '';
    if (c.city) t.city = c.city;
    if (c.state) t.state = c.state;
    if (c.state_full) t.state_full = c.state_full;
    if (c.zip) t.zip = c.zip;
    if (c.effective_date) t.effective_date = c.effective_date;
    if (c.license_text) t.license_text = c.license_text;
    if (c.logo_url) t.logo_url = c.logo_url;
    if (c.brand_color) t.brand_color = c.brand_color;
    if (c.vertical) t.vertical = c.vertical;

    // Composed addresses
    var addrParts = [t.address_line1];
    if (t.address_line2) addrParts.push(t.address_line2);
    addrParts.push(t.city + ', ' + t.state + ' ' + t.zip);
    t.address_full = addrParts.join(', ');
    t.address_short = t.city + ', ' + t.state;

    return t;
  }

  function applyTokens(tokens) {
    // Replace in <title> and innerHTML of body. Also replace in any text
    // content of meta description if present.
    var titleEl = document.querySelector('title');
    if (titleEl) titleEl.textContent = renderTokens(titleEl.textContent, tokens);
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', renderTokens(metaDesc.getAttribute('content') || '', tokens));
    if (document.body) {
      document.body.innerHTML = renderTokens(document.body.innerHTML, tokens);
    }
    // Stash for any later JS that wants the values
    window.BRANDING = tokens;
    // Expose a resolver for code that builds HTML strings dynamically:
    //   element.innerHTML = window.BM_brand('<p>{{phone}}</p>');
    window.BM_brand = function(html) { return renderTokens(html, tokens); };
    // Catch tokens introduced AFTER the initial pass — e.g., a function that
    // builds HTML containing {{phone}} and assigns it to innerHTML later.
    // The observer rewalks any subtree mutated after the initial render and
    // resolves remaining tokens in text nodes + selected attributes.
    installObserver(tokens);
    // Fire a custom event so per-page JS can re-render anything that
    // builds DOM after this point (e.g., signature blocks built from JS).
    try {
      document.dispatchEvent(new CustomEvent('bm-branding-ready', { detail: tokens }));
    } catch(e) {}
  }

  function resolveSubtree(root, tokens) {
    if (!root) return;
    if (root.nodeType === 3) {
      // Text node
      var v = root.nodeValue;
      if (v && v.indexOf('{{') !== -1) {
        var n = renderTokens(v, tokens);
        if (n !== v) root.nodeValue = n;
      }
      return;
    }
    if (root.nodeType !== 1) return; // skip comments etc
    // Resolve selected attributes too (href/src/title/alt/placeholder/value)
    var attrs = ['href', 'src', 'title', 'alt', 'placeholder', 'value'];
    for (var i = 0; i < attrs.length; i++) {
      var a = attrs[i];
      var v2 = root.getAttribute && root.getAttribute(a);
      if (v2 && v2.indexOf('{{') !== -1) {
        var n2 = renderTokens(v2, tokens);
        if (n2 !== v2) root.setAttribute(a, n2);
      }
    }
    // Recurse into children
    var kids = root.childNodes;
    for (var k = 0; k < kids.length; k++) resolveSubtree(kids[k], tokens);
  }

  function installObserver(tokens) {
    if (!('MutationObserver' in window) || !document.body) return;
    var mo = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'childList') {
          for (var k = 0; k < m.addedNodes.length; k++) resolveSubtree(m.addedNodes[k], tokens);
        } else if (m.type === 'characterData') {
          resolveSubtree(m.target, tokens);
        } else if (m.type === 'attributes') {
          resolveSubtree(m.target, tokens);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'src', 'title', 'alt', 'placeholder', 'value'] });
  }

  function renderTokens(text, tokens) {
    if (!text) return text;
    return text.replace(/\{\{([a-z_]+)(?:\|([^}]*))?\}\}/g, function(_m, key, fallback) {
      if (tokens[key] !== undefined && tokens[key] !== null) return tokens[key];
      return fallback || '';
    });
  }

  async function init() {
    var tenantId = resolveTenantId();
    var tokens = buildTokens(null); // start with defaults
    try {
      var r = await fetch(
        SUPABASE_URL + '/rest/v1/tenants?id=eq.' + tenantId + '&select=id,name,config',
        { headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY } }
      );
      if (r.ok) {
        var rows = await r.json();
        if (rows && rows[0]) tokens = buildTokens(rows[0]);
      }
    } catch (e) {
      // network failure → defaults render
      console.warn('[branding] tenant fetch failed, using defaults:', e);
    }
    applyTokens(tokens);
  }

  // Run immediately if DOM already past parsing, else wait
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
