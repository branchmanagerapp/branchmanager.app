var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var BUST_PATHS = /* @__PURE__ */ new Set([
  "/sw.js",
  "/version.json"
]);
var ORIGIN = "https://branchmanagerapp.github.io/branchmanager.app";
var CACHE_EPOCH = "20260728a";
var TENANT_BY_SUBDOMAIN = {
  // 'friend': 'TENANT-UUID-FOR-FRIEND',  // add when seeded
  // 'acme':   'TENANT-UUID-FOR-ACME',
};
function tenantForHost(hostname) {
  const m = hostname.match(/^([a-z0-9-]+)\.branchmanager\.app$/i);
  if (!m) return null;
  const sub = m[1].toLowerCase();
  if (sub === "www" || sub === "clients" || sub === "app") return null;
  return TENANT_BY_SUBDOMAIN[sub] || null;
}
__name(tenantForHost, "tenantForHost");
var SECURITY_HEADERS = {
  "X-BM-Proxy-Rev": CACHE_EPOCH,
  "X-Frame-Options": "SAMEORIGIN",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(self)",
  "Content-Security-Policy": "default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; connect-src 'self' https: wss: blob:; frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.plaid.com https://cdn.plaid.com; media-src 'self' blob: https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self' https:;"
};
function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
__name(applySecurityHeaders, "applySecurityHeaders");
var SHORTLINKS = {
  "/today": "/today-snt-9d4b1e.html",
  // printable Today sheet
  "/work": "/workflow-snt-e82c4b.html",
  // How-We-Work workflow
  "/runsheet": "/schedule-snt-c47a2e.html",
  // run schedule (Catherine's order)
  "/dennis": "/lucente-invoice-7b3e9c.html",
  // Lucente invoice
  "/gc": "/ground-control-7c3f9a.html",
  // Ground Control
  "/map": "/estimates-map-3f9c21.html",
  // estimates map
  "/links": "/today-snt-9d4b1e.html",
  // links bar lives on the Today sheet
  "/ireland": "/ireland/index.html",
  // Ireland Lacrosse proposal (explicit file — avoids trailing-slash re-match loop)
  "/catherine": "/catherine/index.html"
  // Catherine AI assistant proposal
};
var index_default = {
  async fetch(request) {
    const url = new URL(request.url);
    const short = SHORTLINKS[url.pathname.toLowerCase().replace(/\/$/, "") || "/"];
    if (short && url.hostname === "branchmanager.app") {
      return Response.redirect("https://branchmanager.app" + short, 302);
    }
    const tenantId = tenantForHost(url.hostname);
    if (url.hostname === "clients.branchmanager.app") {
      let path = url.pathname;
      if (path === "/" || path === "") path = "/portal/";
      else if (!path.startsWith("/portal")) path = "/portal" + path;
      const target2 = ORIGIN + path + url.search;
      const upstreamReq2 = new Request(target2, request);
      upstreamReq2.headers.set("Host", "branchmanagerapp.github.io");
      const upstream2 = await fetch(upstreamReq2, { redirect: "manual" });
      return applySecurityHeaders(new Response(upstream2.body, upstream2));
    }
    const target = ORIGIN + url.pathname + url.search + (url.search ? "&" : "?") + "__e=" + CACHE_EPOCH;
    const upstreamReq = new Request(target, request);
    upstreamReq.headers.set("Host", "branchmanagerapp.github.io");
    if (tenantId) {
      upstreamReq.headers.set("X-Tenant-ID", tenantId);
    }
    const isCacheBust = BUST_PATHS.has(url.pathname);
    const fetchOpts = isCacheBust ? { redirect: "manual", cf: { cacheTtl: 0, cacheEverything: false } } : { redirect: "manual", cf: { cacheTtlByStatus: { "200-299": 600, "300-399": 0, "400-499": 0, "500-599": 0 } } };
    const upstream = await fetch(upstreamReq, fetchOpts);
    if (isCacheBust) {
      const headers = new Headers(upstream.headers);
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      headers.set("Pragma", "no-cache");
      headers.delete("etag");
      headers.delete("last-modified");
      return applySecurityHeaders(new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers
      }));
    }
    return applySecurityHeaders(new Response(upstream.body, upstream));
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
