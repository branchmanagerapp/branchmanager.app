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
 * AIConfig — single source of truth for "is Claude server-managed?".
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
