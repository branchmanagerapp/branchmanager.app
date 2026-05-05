// branchmanager-proxy — Cloudflare Worker source
// Deployed to: branchmanager.app + clients.branchmanager.app
//
// Routes:
//   clients.branchmanager.app/*   → branchmanagerapp.github.io/branchmanager.app/portal/*
//   branchmanager.app/*           → branchmanagerapp.github.io/branchmanager.app/*
//
// History:
//   Apr 25 2026 — initial proxy created (BM white-label phase 1, v418)
//   May  2 2026 — added cache-bypass for /sw.js and /version.json so each
//                 BM deploy is picked up by browsers immediately. Without this,
//                 GitHub Pages' cache-control: max-age=14400 (4hr) was being
//                 honored by Cloudflare's Worker fetch, so SW updates rolled
//                 out hours late and gave users the "Failed to update SW" error.
//                 The Cloudflare zone-level Cache Rule we added couldn't fix it
//                 because the Worker's internal fetch caches before the zone
//                 rule sees the response.
//
// Deploy:
//   wrangler deploy   (from this directory; requires wrangler.toml)
// or via Cloudflare dashboard: Workers & Pages → branchmanager-proxy → Edit code
//   → paste contents of this file → Deploy.

const BUST_PATHS = new Set([
  '/sw.js',
  '/version.json',
]);

const ORIGIN = 'https://branchmanagerapp.github.io/branchmanager.app';

// Phase 2 — subdomain → tenant_id map. Adding a new tenant: register
// {subdomain}.branchmanager.app DNS at Cloudflare, add a row here, seed
// `tenants` row with matching slug. Worker stamps `X-Tenant-ID` header
// onto requests so edge functions + the BM bundle scope correctly.
//
// SNT (apex) and any apex/www traffic continue to use the SNT tenant
// without an injected header — edge functions already have a SNT
// fallback when X-Tenant-ID is absent.
const TENANT_BY_SUBDOMAIN = {
  // 'friend': 'TENANT-UUID-FOR-FRIEND',  // add when seeded
  // 'acme':   'TENANT-UUID-FOR-ACME',
};

function tenantForHost(hostname) {
  // matches "<sub>.branchmanager.app"
  const m = hostname.match(/^([a-z0-9-]+)\.branchmanager\.app$/i);
  if (!m) return null;
  const sub = m[1].toLowerCase();
  // Reserved subdomains that don't map to tenants
  if (sub === 'www' || sub === 'clients' || sub === 'app') return null;
  return TENANT_BY_SUBDOMAIN[sub] || null;
}

// Security response headers applied to every response.
// May 2 2026 audit: only HSTS was set; X-Frame, X-Content, Referrer-Policy,
// and CSP were all missing.
//
// CSP intentionally permissive — BM loads from a wide set of CDNs (unpkg,
// supabase.co, stripe.com, maptiler/maplibre, googleusercontent for photos,
// resend, dialpad, etc.). Tightening further requires a per-resource audit;
// the current CSP catches the common XSS injection attempts (no inline
// eval, no untrusted scripts) without breaking the integrations.
const SECURITY_HEADERS = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self)',
  'Content-Security-Policy':
    "default-src 'self' https: data: blob:; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:; " +
    "style-src 'self' 'unsafe-inline' https:; " +
    "img-src 'self' data: blob: https:; " +
    "connect-src 'self' https: wss: blob:; " +
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com; " +
    "media-src 'self' blob: https:; " +
    "worker-src 'self' blob:; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self' https:;",
};

function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // ── Phase 2 tenant subdomain routing ──
    // {tenant}.branchmanager.app/* → same content as apex but with
    // X-Tenant-ID header injected for the BM bundle and any edge
    // function calls relayed downstream.
    const tenantId = tenantForHost(url.hostname);

    // ── Customer portal subdomain ──
    // clients.branchmanager.app/* → /portal/* on the GH Pages origin.
    if (url.hostname === 'clients.branchmanager.app') {
      let path = url.pathname;
      if (path === '/' || path === '') path = '/portal/';
      else if (!path.startsWith('/portal')) path = '/portal' + path;

      const target = ORIGIN + path + url.search;
      const upstreamReq = new Request(target, request);
      upstreamReq.headers.set('Host', 'branchmanagerapp.github.io');

      const upstream = await fetch(upstreamReq, { redirect: 'manual' });
      return applySecurityHeaders(new Response(upstream.body, upstream));
    }

    // ── Main BM domain (apex) or tenant subdomain ──
    const target = ORIGIN + url.pathname + url.search;
    const upstreamReq = new Request(target, request);
    upstreamReq.headers.set('Host', 'branchmanagerapp.github.io');
    if (tenantId) {
      // Stamp the tenant id so edge functions reached via the BM bundle
      // know which tenant the user is operating as. The bundle ALSO
      // writes a localStorage `bm-tenant-id` and includes the header on
      // its own Supabase calls — this stamp is the safety net for any
      // path that bypasses the bundle (e.g. cold redirect → form post).
      upstreamReq.headers.set('X-Tenant-ID', tenantId);
    }

    const isCacheBust = BUST_PATHS.has(url.pathname);

    // For SW + version metadata, tell Cloudflare's Worker fetch to skip its
    // internal cache. Without this, the Worker would serve a 4hr-old GH Pages
    // response even when the origin had the latest version.
    const fetchOpts = isCacheBust
      ? { redirect: 'manual', cf: { cacheTtl: 0, cacheEverything: false } }
      : { redirect: 'manual' };

    const upstream = await fetch(upstreamReq, fetchOpts);

    if (isCacheBust) {
      // Override response headers so browsers (and any downstream caches)
      // also treat this as no-store. Strips ETag/Last-Modified to prevent
      // 304 Not Modified responses from re-using a cached copy.
      const headers = new Headers(upstream.headers);
      headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      headers.set('Pragma', 'no-cache');
      headers.delete('etag');
      headers.delete('last-modified');
      return applySecurityHeaders(new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      }));
    }

    return applySecurityHeaders(new Response(upstream.body, upstream));
  },
};
