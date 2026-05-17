/**
 * Branch Manager — White-Label Configuration
 *
 * All public-facing HTML files (approve, pay, book, client, paid) read from
 * this object instead of hardcoding company info.  To rebrand, change the
 * values below — every customer-facing page picks them up automatically.
 */
var BM_CONFIG = {
  companyName:     'Second Nature Tree Service',
  ownerName:       '',
  phone:           '(914) 391-5233',
  phoneTel:        '+19143915233',      // tel: link format
  phoneDigits:     '9143915233',        // no punctuation, for tel: hrefs
  email:           'info@peekskilltree.com',
  website:         'peekskilltree.com',
  websiteUrl:      'https://peekskilltree.com',
  address:         '1 Highland Industrial Park, Peekskill, NY 10566',
  city:            'Peekskill, NY',
  licenses:        'WC-32079 / PC-50644',
  licensesLong:    'WC-32079 (Westchester), PC-50644 (Putnam)',
  googleReviewUrl: 'https://g.page/r/CcVkZHV_EKlEEBM/review',
  state:           'New York',
  stateAbbr:       'NY',
  timezone:        'America/New_York',
  tagline:         'Licensed & Insured',
  reviewStars:     '5.0',
  reviewCount:     '100+',

  // ── Fleet specs (for truck-route sharing with crew) ──
  // Users can override per-vehicle in Equipment page once that supports it.
  truckSpecs: {
    heightFt:   11,
    heightIn:   6,
    lengthFt:   24,
    weightLbs:  26000,   // GVWR
    hasCDL:     false,   // whether the driver needs a CDL
    notes:      'Watch low bridges on Rt 9 (Taconic clearance 11\'3"). Avoid narrow roads in Garrison.'
  }
};

/**
 * CompanyInfo — single source of truth for company data.
 * Reads user-edited values from localStorage first, falls back to BM_CONFIG defaults.
 * Replaces ~99 scattered `localStorage.getItem('bm-co-x') || BM_CONFIG.x` reads.
 *
 * Usage:
 *   CompanyInfo.get('name')          → 'Second Nature Tree Service'
 *   CompanyInfo.get('phone')         → '(914) 391-5233'
 *   CompanyInfo.get('phoneDigits')   → '9143915233'
 *   CompanyInfo.all()                → entire object
 */
/**
 * AIConfig — single source of truth for "is AI server-managed?".
 *
 * v406: Six callsites used to ask this question with three different defaults
 * (`!== 'false'` default-on, `=== 'true'` default-off). Server-managed has
 * been the intended default since v388 (works on mobile / fresh installs
 * without prompting). This helper enforces the default-on semantics
 * everywhere — flag is server-managed UNLESS explicitly set to 'false'.
 */
var AIConfig = {
  serverManaged: function() {
    try { return localStorage.getItem('bm-claude-server-managed') !== 'false'; }
    catch(e) { return true; }
  },
  // Returns true if the AI is reachable — either via server proxy or a device key.
  available: function() {
    if (AIConfig.serverManaged()) return true;
    try { return (localStorage.getItem('bm-claude-key') || '').trim().length > 0; }
    catch(e) { return false; }
  },
  // Returns the device key, or '' if server-managed (server proxy doesn't need one).
  deviceKey: function() {
    if (AIConfig.serverManaged()) return '';
    try { return localStorage.getItem('bm-claude-key') || ''; }
    catch(e) { return ''; }
  }
};

var CompanyInfo = (function() {
  // Maps CompanyInfo key → (localStorage key, BM_CONFIG key)
  var MAP = {
    name:         { ls: 'bm-co-name',     bm: 'companyName' },
    phone:        { ls: 'bm-co-phone',    bm: 'phone' },
    phoneTel:     { ls: null,             bm: 'phoneTel' },
    phoneDigits:  { ls: null,             bm: 'phoneDigits' },
    email:        { ls: 'bm-co-email',    bm: 'email' },
    website:      { ls: 'bm-co-website',  bm: 'website' },
    websiteUrl:   { ls: null,             bm: 'websiteUrl' },
    address:      { ls: 'bm-co-address',  bm: 'address' },
    city:         { ls: null,             bm: 'city' },
    licenses:     { ls: 'bm-co-licenses', bm: 'licenses' },
    licensesLong: { ls: null,             bm: 'licensesLong' },
    state:        { ls: null,             bm: 'state' },
    stateAbbr:    { ls: null,             bm: 'stateAbbr' },
    timezone:     { ls: null,             bm: 'timezone' },
    tagline:      { ls: null,             bm: 'tagline' },
    googleReviewUrl: { ls: 'bm-co-review',     bm: 'googleReviewUrl' },
    facebookUrl:     { ls: 'bm-co-facebook',   bm: null },
    instagramUrl:    { ls: 'bm-co-instagram',  bm: null },
    yelpUrl:         { ls: 'bm-co-yelp',       bm: null },
    nextdoorUrl:     { ls: 'bm-co-nextdoor',   bm: null },
    taxRate:         { ls: 'bm-tax-rate',       bm: null, def: '8.375' },
    ownerName:       { ls: 'bm-co-owner-name',  bm: 'ownerName' },
    legalName:       { ls: 'bm-co-legal-name',  bm: null, def: 'Second Nature Tree Service LLC' },
    businessShortName:{ ls: 'bm-co-short-name', bm: null, def: 'Second Nature Tree' },
    licenseText:     { ls: 'bm-co-license-text',bm: null, def: 'Licensed & Fully Insured' },
    brandColor:      { ls: 'bm-co-brand-color', bm: null, def: '#1a3c12' },
    logo:            { ls: 'bm-co-logo',        bm: 'logoUrl' }
  };

  return {
    get: function(key) {
      var m = MAP[key];
      if (!m) {
        // Fall back to direct BM_CONFIG lookup for unmapped keys
        return (typeof BM_CONFIG !== 'undefined' && BM_CONFIG[key]) || '';
      }
      if (m.ls) {
        var v = null;
        try { v = localStorage.getItem(m.ls); } catch(e) {}
        if (v) return v;
      }
      if (m.bm && typeof BM_CONFIG !== 'undefined' && BM_CONFIG[m.bm]) return BM_CONFIG[m.bm];
      return m.def || '';
    },
    set: function(key, value) {
      var m = MAP[key];
      if (!m || !m.ls) return false;
      try { localStorage.setItem(m.ls, value); return true; } catch(e) { return false; }
    },
    all: function() {
      var out = {};
      Object.keys(MAP).forEach(function(k){ out[k] = CompanyInfo.get(k); });
      return out;
    }
  };
})();

/**
 * White-label: load the LOGGED-IN tenant's branding into CompanyInfo.
 *
 * The operator app authenticates with a Supabase session whose JWT carries
 * tenant_id (custom_access_token_hook). tenants.config holds the full brand
 * record. This mirrors the proven tenant-slug-bootstrap.js pattern (used for
 * public pay/approve/portal pages) but keyed off the session instead of a URL
 * slug: it writes bm-co-* localStorage + patches BM_CONFIG, so CompanyInfo
 * (localStorage-first) re-skins the entire app for that tenant.
 *
 * Safe + additive: any error / no session / no tenant / no config => no-op,
 * app keeps its existing BM_CONFIG defaults (zero regression). Only writes
 * keys that are present and non-empty (never blanks a fallback). Idempotent.
 */
CompanyInfo.loadTenantFromSession = (function() {
  var done = false;
  return function() {
    if (done) return Promise.resolve(false);
    done = true;
    try {
      if (typeof SupabaseDB === 'undefined' || !SupabaseDB.client) return Promise.resolve(false);
      // Scope via user_tenants (RLS returns ONLY the caller's mapping rows) so
      // we get THE caller's tenant deterministically. A bare tenants.limit(1)
      // is wrong: public_read_tenants_for_branding exposes every tenant row,
      // so limit(1) could brand the app as some other tenant (e.g. "Demo").
      return SupabaseDB.client
        .from('user_tenants').select('tenant_id,tenants(id,name,config)').limit(1)
        .then(function(res) {
          var row = res && res.data && res.data[0];
          var t = row && row.tenants;
          if (!t) return false;
          var c = t.config || {};
          function L(lsKey, val) { if (val) { try { localStorage.setItem(lsKey, String(val)); } catch(e) {} } }
          function B(bmKey, val) { if (val && typeof BM_CONFIG !== 'undefined') BM_CONFIG[bmKey] = val; }
          var nm = c.company_name || t.name;
          L('bm-co-name', nm);            B('companyName', nm);
          L('bm-co-email', c.company_email || c.from_email);  B('email', c.company_email || c.from_email);
          L('bm-co-website', c.company_website);
          if (c.company_website) { B('website', c.company_website); B('websiteUrl', c.company_website.indexOf('http')===0 ? c.company_website : ('https://'+c.company_website)); }
          if (c.company_phone) {
            L('bm-co-phone', c.company_phone);
            B('phone', c.company_phone);
            var dg = String(c.company_phone).replace(/\D/g,'');
            B('phoneDigits', dg); B('phoneTel', '+' + dg.replace(/^1?/, '1'));
          }
          L('bm-co-logo', c.logo_url);    B('logoUrl', c.logo_url);
          var addr = [c.address_line1, c.address_line2, [c.city, c.state, c.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ');
          L('bm-co-address', addr || null); B('address', addr || undefined);
          if (c.city || c.state) B('city', [c.city, c.state].filter(Boolean).join(', '));
          L('bm-co-brand-color', c.brand_color);
          L('bm-co-licenses', c.wc_number);
          L('bm-co-license-text', c.license_text);
          L('bm-co-review', c.google_review_url); B('googleReviewUrl', c.google_review_url);
          L('bm-co-facebook', c.facebook_url);
          L('bm-co-instagram', c.instagram_url);
          L('bm-co-yelp', (c.social_links && c.social_links.yelp) || null);
          L('bm-tax-rate', c.tax_rate != null ? c.tax_rate : null);
          L('bm-co-owner-name', c.owner_name); B('ownerName', c.owner_name);
          L('bm-co-legal-name', c.legal_name);
          L('bm-co-short-name', c.business_short_name);
          try { if (t.id) localStorage.setItem('bm-tenant-id', t.id); } catch(e) {}
          window.bmResolvedTenant = t;
          return true;
        })
        .catch(function() { return false; });
    } catch (e) { return Promise.resolve(false); }
  };
})();
