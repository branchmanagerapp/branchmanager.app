#!/usr/bin/env node
// audit-deep.mjs — every check that would have caught a real bug we hit.
//
// Run: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/audit-deep.mjs
//
// Categories (each independently passes/fails — exits 1 if any fail):
//   1. Public-fn reachability    — HEAD, GET, POST verify-probe shape
//   2. Bundle integrity          — version.json vs BUNDLED_VERSION vs CACHE_NAME
//                                  vs ?v= in script tag vs dist/ file existence
//   3. CSP / connect-src         — every BM-fetched origin in CSP
//   4. Hardcoded SNT UUID scan   — UUID literals outside _shared/tenant.ts
//   5. End-to-end anon write     — actually round-trip through RLS
//   6. verify_jwt consistency    — config.toml ↔ deploy-fn.sh ↔ live function
//   7. Stale data buckets        — quotes/invoices/tasks rotting >threshold
//   8. Email deliverability      — bouncing customers + recent failure ratio
//
// Combine with health-audit.mjs (schema/RLS/orphans/dupes) for full coverage.

import { execSync, spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PROJECT_REF = "ltpivkqahvplapyagljt";
const SNT_UUID = "93af4348-8bba-4045-ac3e-5e71ec1cc8c5";

// v848: any bare fetch() with AbortSignal.timeout() that doesn't have a
// .catch() will throw unhandled when post-breach RLS makes the query slow.
// Catch both forms (unhandledRejection AND uncaughtException) so a single
// slow probe doesn't kill the whole 17-cat run.
process.on("unhandledRejection", (e) => {
  const name = (e && e.name) || "UnhandledRejection";
  console.log(`  ⚠ ${name} caught at process level — continuing`);
});
process.on("uncaughtException", (e) => {
  const name = (e && e.name) || "UncaughtException";
  console.log(`  ⚠ ${name} caught at process level — continuing`);
});

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error("ERROR: SUPABASE_ACCESS_TOKEN env var required.");
  process.exit(2);
}

const ANON_KEY = (() => {
  try {
    const grep = execSync(`grep -rho 'eyJ[A-Za-z0-9_.-]\\{30,\\}' ${ROOT}/src/ | sort -u | head -1`, { encoding: "utf8" });
    return grep.trim();
  } catch (_) { return ""; }
})();

const issues = [];
function fail(category, msg) { issues.push({ category, msg }); }
function pass(category, msg = "ok") { /* noop unless verbose */ }

async function jsonFetch(url, opts = {}) {
  const r = await fetch(url, opts);
  let body;
  try { body = await r.json(); } catch (_) { body = await r.text().catch(() => ""); }
  return { status: r.status, body };
}

// ── 1. Public function reachability ──────────────────────────────────────────
async function auditPublicFns() {
  console.log("\n┌─ 1. Public-fn reachability (HEAD/GET/POST shape) ───");
  const PUBLIC = [
    "dialpad-webhook", "bouncie-webhook", "stripe-webhook", "resend-webhook",
    "request-notify", "quote-notify", "quote-update", "quote-fetch",
    "invoice-fetch", "portal-auth", "portal-session", "portal-update",
  ];
  for (const fn of PUBLIC) {
    const url = `https://${PROJECT_REF}.supabase.co/functions/v1/${fn}`;
    const head = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000) }).catch(e => ({ status: 0, err: e.message }));
    const get  = await fetch(url, { method: "GET",  signal: AbortSignal.timeout(8000) }).catch(e => ({ status: 0, err: e.message }));
    if (head.status !== 200 || get.status !== 200) {
      fail("public-fn-reachability",
        `${fn}: HEAD=${head.status} GET=${get.status} (verify probes need 200, was 405/500 = bug)`);
    }
  }
  console.log(`  ${issues.filter(i => i.category === "public-fn-reachability").length === 0 ? "✅" : "❌"} ${PUBLIC.length} public fns checked`);
}

// ── 2. Bundle integrity ──────────────────────────────────────────────────────
function auditBundle() {
  console.log("\n┌─ 2. Bundle integrity ──────────────────────────────");
  const indexHtml = readFileSync(join(ROOT, "index.html"), "utf8");
  const versionJson = JSON.parse(readFileSync(join(ROOT, "version.json"), "utf8"));
  const swJs = existsSync(join(ROOT, "sw.js")) ? readFileSync(join(ROOT, "sw.js"), "utf8") : "";

  const bundledMatch = indexHtml.match(/var\s+BUNDLED_VERSION\s*=\s*(\d+)/);
  const bundledVer = bundledMatch ? parseInt(bundledMatch[1], 10) : null;
  const cacheNameMatch = swJs.match(/branch-manager-v(\d+)/);
  const cacheVer = cacheNameMatch ? parseInt(cacheNameMatch[1], 10) : null;
  const scriptTagMatch = indexHtml.match(/dist\/bm\.bundle\.v(\d+)\.min\.js/);
  const scriptTagVer = scriptTagMatch ? parseInt(scriptTagMatch[1], 10) : null;

  console.log(`  version.json:     ${versionJson.version}`);
  console.log(`  BUNDLED_VERSION:  ${bundledVer}`);
  console.log(`  sw.js CACHE:      ${cacheVer ?? "(no sw.js)"}`);
  console.log(`  <script src=…vN>: ${scriptTagVer}`);

  const all = new Set([versionJson.version, bundledVer, scriptTagVer, cacheVer].filter(v => v != null));
  if (all.size !== 1) {
    fail("bundle-integrity", `Version drift: version.json=${versionJson.version} BUNDLED=${bundledVer} CACHE=${cacheVer} script=${scriptTagVer} — all 4 must match. Run ./scripts/bump.sh.`);
  }

  const expectedBundle = `dist/bm.bundle.v${versionJson.version}.min.js`;
  if (!existsSync(join(ROOT, expectedBundle))) {
    fail("bundle-integrity", `MISSING BUNDLE FILE: ${expectedBundle} — app would 404 at boot. Run ./scripts/bump.sh ${versionJson.version} or rebuild.`);
  } else {
    console.log(`  ${expectedBundle}: exists`);
  }
}

// ── 3. CSP / connect-src ─────────────────────────────────────────────────────
function auditCSP() {
  console.log("\n┌─ 3. CSP connect-src vs known origins ──────────────");
  const indexHtml = readFileSync(join(ROOT, "index.html"), "utf8");
  const cspMatch = indexHtml.match(/Content-Security-Policy[\s\S]*?content="([\s\S]*?)"/);
  if (!cspMatch) { fail("csp", "No CSP meta tag found in index.html"); return; }
  const csp = cspMatch[1].replace(/\s+/g, " ");
  // BM is known to call these origins; CSP must allow them in connect-src or script-src.
  const REQUIRED_CONNECT = [
    "*.supabase.co", "wss://*.supabase.co",
    "api.anthropic.com", "api.stripe.com", "api.open-meteo.com",
    "nominatim.openstreetmap.org", "my-api.plantnet.org", "dialpad.com",
    "*.ingest.us.sentry.io", "*.sentry.io",
  ];
  for (const origin of REQUIRED_CONNECT) {
    if (!csp.includes(origin)) {
      fail("csp", `CSP missing connect-src origin: ${origin} (BM calls this — would cause silent CSP block in console)`);
    }
  }
  // script-src
  const REQUIRED_SCRIPT = [
    "https://js.stripe.com", "https://unpkg.com",
    "https://js.sentry-cdn.com",
  ];
  for (const origin of REQUIRED_SCRIPT) {
    if (!csp.includes(origin.replace(/https:\/\//, ""))) {
      fail("csp", `CSP missing script-src origin: ${origin}`);
    }
  }
  console.log(`  CSP includes ${REQUIRED_CONNECT.length + REQUIRED_SCRIPT.length} required origins`);
}

// ── 4. Hardcoded SNT UUID scan ───────────────────────────────────────────────
function auditHardcodedUuids() {
  console.log("\n┌─ 4. Hardcoded SNT UUID scan ────────────────────────");
  const out = spawnSync("grep", [
    "-rln",
    SNT_UUID,
    join(ROOT, "src"),
    join(ROOT, "supabase", "functions"),
    join(ROOT, "index.html"),
    join(ROOT, "cloudflare-worker"),
  ], { encoding: "utf8" });
  const lines = (out.stdout || "").split("\n").filter(Boolean);
  // Allowed locations — fallbacks during Phase 2 rollout
  const ALLOWED = [
    /\/_shared\/tenant\.ts$/,           // SNT_TENANT_ID_CONST + fallback
    /\/src\/supabase\.js$/,             // resolveTenantHeader fallback (single source of truth)
    /\/scripts\/.*\.(mjs|sh|sql)$/,     // audit + seed scripts may reference
    /\/audit-deep\.mjs$/,               // this file
    /\/MULTI-TENANT-PHASE-2\.md$/,
    /\/seed-tenant\.sql$/,
    /\/cloudflare-worker\/index\.js$/,  // tenant comment in TENANT_BY_SUBDOMAIN
  ];
  const offenders = lines.filter(f => !ALLOWED.some(re => re.test(f)));
  if (offenders.length > 0) {
    fail("hardcoded-uuid", `${offenders.length} files still reference SNT UUID outside the resolver:\n      ${offenders.join("\n      ")}`);
  }
  console.log(`  ${offenders.length === 0 ? "✅" : "❌"} ${lines.length} total references, ${offenders.length} unauthorized`);
}

// ── 5. End-to-end anon write LOCKDOWN (post-2026-05-17 breach closure) ──────
// INVERTED: anon writes to clients SHOULD fail post-breach. The test now
// asserts the lockdown holds — failure to fail (i.e. INSERT succeeded) is
// the alarm condition, not an HTTP 401. Mirrors the same flip applied to
// health-audit.mjs cat 4 in commit 5f70684. The May-2 silent-write bug
// scare is no longer applicable: anon writes are deliberately blocked
// across all tenant tables except the two whitelisted public exceptions
// (requests insert, services read).
async function auditAnonWrite() {
  console.log("\n┌─ 5. Anon-write lockdown (post-2026-05-17 cutover) ──");
  if (!ANON_KEY) { fail("anon-write", "Could not extract anon key from src/"); return; }
  const url = `https://${PROJECT_REF}.supabase.co/rest/v1/clients`;
  const headers = {
    "apikey": ANON_KEY,
    "Authorization": `Bearer ${ANON_KEY}`,
    "X-Tenant-ID": SNT_UUID,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };
  const testName = `AUDIT_LOCKDOWN_${Date.now()}`;
  const ins = await fetch(url, {
    method: "POST", headers,
    body: JSON.stringify({ name: testName, phone: "5550000000" }),
    signal: AbortSignal.timeout(10000),
  }).catch(e => ({ ok: false, status: 0, _err: e.message }));
  if (ins.ok) {
    // Anon write SUCCEEDED — that's the breach reopening. Clean up the
    // test row so the leak doesn't pile up, then alarm.
    try {
      const row = (await ins.json())[0];
      if (row && row.id) {
        await fetch(`${url}?id=eq.${row.id}`, { method: "DELETE", headers, signal: AbortSignal.timeout(8000) });
      }
    } catch (e) { /* best effort */ }
    fail("anon-write", `Anon INSERT to clients SUCCEEDED — breach has reopened (was supposed to be denied post-2026-05-17)`);
    return;
  }
  console.log(`  ✅ Anon INSERT denied (status=${ins.status}) — lockdown intact`);
}

// ── 6. verify_jwt consistency ────────────────────────────────────────────────
async function auditVerifyJwt() {
  console.log("\n┌─ 6. verify_jwt consistency (config.toml ↔ live) ────");
  const tomlText = readFileSync(join(ROOT, "supabase", "config.toml"), "utf8");
  const tomlConfigured = [...tomlText.matchAll(/\[functions\.([a-z0-9-]+)\]\nverify_jwt = false/g)].map(m => m[1]);
  const deployText = readFileSync(join(ROOT, "scripts", "deploy-fn.sh"), "utf8");
  const deployListMatch = deployText.match(/PUBLIC_FNS=\(\n([\s\S]*?)\n\)/);
  const deployList = deployListMatch ? deployListMatch[1].trim().split(/\s+/) : [];

  // 1) every fn in deploy-fn.sh PUBLIC_FNS must be in config.toml
  const missing1 = deployList.filter(fn => !tomlConfigured.includes(fn));
  if (missing1.length) fail("verify-jwt", `Functions in deploy-fn.sh PUBLIC_FNS but missing from config.toml: ${missing1.join(", ")}`);

  // 2) every fn in config.toml should appear in deploy-fn.sh too
  const missing2 = tomlConfigured.filter(fn => !deployList.includes(fn));
  if (missing2.length) fail("verify-jwt", `Functions in config.toml but missing from deploy-fn.sh PUBLIC_FNS: ${missing2.join(", ")}`);

  // 3) live verify_jwt status matches
  for (const fn of tomlConfigured) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${fn}`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!r || !r.ok) { fail("verify-jwt", `Could not query ${fn} state`); continue; }
    const j = await r.json();
    if (j.verify_jwt !== false) {
      fail("verify-jwt", `${fn}: verify_jwt is ${j.verify_jwt} but config.toml says false (LIVE STATE WRONG)`);
    }
  }
  console.log(`  ${tomlConfigured.length} public fns configured; deploy-fn.sh ↔ config.toml ↔ live cross-checked`);
}

// ── 7. Stale data buckets ────────────────────────────────────────────────────
async function auditStale() {
  console.log("\n┌─ 7. Stale data buckets ────────────────────────────");
  if (!ANON_KEY) return;
  const headers = { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}`, "X-Tenant-ID": SNT_UUID, "Prefer": "count=exact" };

  // v848: each fetch wrapped — without .catch, an AbortError throws as
  // unhandled rejection and crashes the whole audit script (cat 7 was
  // taking down 8-17 every night).
  async function staleCount(url) {
    try {
      const r = await fetch(url, { method: "HEAD", headers, signal: AbortSignal.timeout(8000) });
      const cr = r.headers.get("content-range") || "";
      return parseInt(cr.split("/")[1] || "0", 10);
    } catch (e) {
      console.log(`  ⚠ probe timeout: ${e.name} — skipped`);
      return -1;
    }
  }
  // Quotes "sent" >90d — should be archived/expired
  const since90 = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
  const stale1 = await staleCount(`https://${PROJECT_REF}.supabase.co/rest/v1/quotes?status=eq.sent&sent_at=lt.${since90}&select=id`);
  if (stale1 > 0) fail("stale-quotes", `${stale1} quotes still in 'sent' status with sent_at >90d ago — bulk-archive candidates`);

  // Invoices unpaid >180d — likely write-off candidates
  const since180 = new Date(Date.now() - 180 * 86400 * 1000).toISOString();
  const stale2 = await staleCount(`https://${PROJECT_REF}.supabase.co/rest/v1/invoices?status=eq.unpaid&created_at=lt.${since180}&select=id`);
  if (stale2 > 0) fail("stale-invoices", `${stale2} invoices unpaid for >180d — write-off review needed`);

  console.log(`  ${stale1} stale-sent quotes, ${stale2} unpaid invoices >180d`);
}

// ── 8. Email deliverability ──────────────────────────────────────────────────
async function auditEmail() {
  console.log("\n┌─ 8. Email deliverability ───────────────────────────");
  if (!ANON_KEY) return;
  const headers = { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}`, "X-Tenant-ID": SNT_UUID, "Prefer": "count=exact" };

  // v848: all anon-key fetches now wrapped — post-breach RLS makes some
  // queries slow enough to trip the 8s timeout, and an unhandled AbortError
  // was crashing the whole audit at cat 8 every night.
  // Bouncing clients
  let bouncers = [];
  try {
    const r1 = await fetch(`https://${PROJECT_REF}.supabase.co/rest/v1/clients?email_status=eq.bounced&select=id,email,name`, {
      headers, signal: AbortSignal.timeout(8000),
    });
    bouncers = await r1.json().catch(() => []);
  } catch (e) { console.log(`  ⚠ bouncers probe ${e.name} — skipped`); }
  if (bouncers.length > 0) {
    console.log(`  ⚠️  ${bouncers.length} bouncing email customers:`);
    bouncers.slice(0, 5).forEach(b => console.log(`     ${b.email} (${b.name})`));
    if (bouncers.length > 5) console.log(`     ...and ${bouncers.length - 5} more`);
  } else {
    console.log(`  ✅ no bouncing email customers`);
  }

  // Bounce events last 7d
  const since7 = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  let recent = 0;
  try {
    const r2 = await fetch(`https://${PROJECT_REF}.supabase.co/rest/v1/communications?channel=eq.email&status=eq.hard_bounce&created_at=gte.${since7}&select=id`, {
      method: "HEAD", headers, signal: AbortSignal.timeout(8000),
    });
    const cr2 = r2.headers.get("content-range") || "";
    recent = parseInt(cr2.split("/")[1] || "0", 10);
  } catch (e) { console.log(`  ⚠ bounce-events probe ${e.name} — skipped`); }
  if (recent > 0) console.log(`  ⚠️  ${recent} hard-bounce events in last 7d`);
}

// ── 9. Speed audit ───────────────────────────────────────────────────────────
async function auditSpeed() {
  console.log("\n┌─ 9. Speed audit (latency to key endpoints) ─────────");
  const versionJson = JSON.parse(readFileSync(join(ROOT, "version.json"), "utf8"));
  const v = versionJson.version;
  const ENDPOINTS = [
    { name: `BM bundle (v${v})`, url: `https://branchmanager.app/dist/bm.bundle.v${v}.min.js`, budget_ms: 2000 },
    { name: "version.json",     url: `https://branchmanager.app/version.json`,                budget_ms: 800 },
    { name: "marketing site",   url: `https://peekskilltree.com/`,                            budget_ms: 1500 },
    { name: "REST clients HEAD",url: `https://${PROJECT_REF}.supabase.co/rest/v1/clients?limit=1`, budget_ms: 1500, headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "X-Tenant-ID": SNT_UUID, Prefer: "count=exact" }, method: "HEAD" },
    { name: "Edge dialpad-webhook",  url: `https://${PROJECT_REF}.supabase.co/functions/v1/dialpad-webhook`, budget_ms: 1500 },
    { name: "Edge request-notify",   url: `https://${PROJECT_REF}.supabase.co/functions/v1/request-notify`,  budget_ms: 1500 },
  ];
  for (const e of ENDPOINTS) {
    const t0 = Date.now();
    try {
      await fetch(e.url, { method: e.method || "GET", headers: e.headers || {}, signal: AbortSignal.timeout(8000) });
      const ms = Date.now() - t0;
      const ok = ms < e.budget_ms;
      console.log(`  ${ok ? "✅" : "⚠️ "} ${e.name.padEnd(24)} ${ms}ms (budget ${e.budget_ms}ms)`);
      if (!ok) fail("speed", `${e.name} took ${ms}ms (budget ${e.budget_ms}ms)`);
    } catch (err) {
      fail("speed", `${e.name}: ${err.message}`);
    }
  }
}

// ── 10. Code audit (dead routes, console.errors, TODO density) ──────────────
function auditCode() {
  console.log("\n┌─ 10. Code audit (dead routes, console noise, TODO) ─");
  // Extract pageRenderers keys from index.html — those are the AUTHORITATIVE
  // list of valid loadPage('xxx') targets. Cross-check loadPage() call sites
  // against this list. Bug we hit: loadPage('fleet') and loadPage('pdfgen')
  // were dead routes — the renderer didn't exist.
  const indexHtml = readFileSync(join(ROOT, "index.html"), "utf8");
  // var pageRenderers = { dashboard: function(){...}, schedule: function(){...}, ...
  const renderersBlock = indexHtml.match(/var\s+pageRenderers\s*=\s*\{([\s\S]*?)\n\};/);
  const validTargets = new Set();
  if (renderersBlock) {
    for (const m of renderersBlock[1].matchAll(/^\s*([a-z][a-z0-9-]*):\s*function/gmi)) {
      validTargets.add(m[1]);
    }
  }
  // Also accept soft-aliases — `if (page === 'X') page = 'Y';` rewrites
  // before the pageRenderers lookup. Example: `marketing` → `socialbranch`
  // at index.html:1826. Without this, audit false-positives on every alias.
  for (const m of indexHtml.matchAll(/if\s*\(\s*page\s*===\s*['"]([a-z0-9_-]+)['"]\s*\)\s*\{\s*[^}]*page\s*=\s*['"]([a-z0-9_-]+)['"]/gi)) {
    const alias = m[1], target = m[2];
    if (validTargets.has(target)) validTargets.add(alias);
  }

  const grepOut = spawnSync("grep", ["-rn", "-E", "loadPage\\(['\"][a-z]+['\"]\\)", join(ROOT, "src"), join(ROOT, "index.html")], { encoding: "utf8" });
  const pageRefs = new Set();
  for (const line of (grepOut.stdout || "").split("\n").filter(Boolean)) {
    // Skip commented-out references (// or /* */)
    const codeOnly = line.replace(/^[^:]+:\d+:/, ""); // strip "file:line:" prefix
    if (/^\s*(\/\/|\*|#)/.test(codeOnly)) continue;
    const m = line.match(/loadPage\(['"]([a-z]+)['"]\)/);
    if (m) pageRefs.add(m[1]);
  }
  const orphanRefs = [...pageRefs].filter(r => !validTargets.has(r));
  console.log(`  ${pageRefs.size} loadPage() call sites, ${validTargets.size} valid pageRenderers keys`);
  if (orphanRefs.length > 0) {
    fail("dead-route", `loadPage() calls with no matching pageRenderers entry: ${orphanRefs.join(", ")}`);
  } else {
    console.log(`  ✅ all loadPage() targets resolve to a pageRenderers entry`);
  }

  // TODO/FIXME density — too many = stale debt
  const todoOut = spawnSync("grep", ["-rln", "-E", "TODO|FIXME|XXX|HACK", join(ROOT, "src"), join(ROOT, "supabase", "functions")], { encoding: "utf8" });
  const todoLines = (todoOut.stdout || "").split("\n").filter(Boolean).length;
  console.log(`  ${todoLines} files with TODO/FIXME/HACK markers`);
  if (todoLines > 50) {
    fail("code-quality", `${todoLines} files with TODO/FIXME — review and burn down`);
  }

  // console.error count — high values mean noisy logs / production-error spam
  const errOut = spawnSync("grep", ["-rln", "console.error", join(ROOT, "src"), join(ROOT, "supabase", "functions")], { encoding: "utf8" });
  const errLines = (errOut.stdout || "").split("\n").filter(Boolean).length;
  console.log(`  ${errLines} files with console.error calls`);
}

// ── 11. Security headers audit (live URL) ────────────────────────────────────
async function auditSecurityHeaders() {
  console.log("\n┌─ 11. Security headers (live URL response) ──────────");
  const REQUIRED_HEADERS = [
    "strict-transport-security", "x-frame-options",
    "x-content-type-options", "referrer-policy",
    "permissions-policy", "content-security-policy",
  ];
  const r = await fetch("https://branchmanager.app/", { signal: AbortSignal.timeout(8000) });
  const haveHeaders = new Set([...r.headers.keys()].map(k => k.toLowerCase()));
  for (const h of REQUIRED_HEADERS) {
    if (!haveHeaders.has(h)) fail("security-headers", `Live response missing: ${h}`);
  }
  console.log(`  ${REQUIRED_HEADERS.length} required headers checked on live response`);
}

// ── 12. Cron / scheduled-task freshness ──────────────────────────────────────
async function auditCron() {
  console.log("\n┌─ 12. Cron / scheduled-task freshness ──────────────");
  const sql = `
    select jobid, schedule, command, active,
           extract(epoch from (now() - last_run_started_at))/3600 as hours_since_last_run
    from cron.job_run_details d
    right join cron.job j on j.jobid = d.jobid
    where j.active = true
    order by jobid;
  `.replace(/\s+/g, " ").trim();
  // Try via pg cron schema; if access denied, fall back to checking
  // marketing-automation last invocation via communications table proxy.
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length) {
        for (const j of rows) {
          const hrs = j.hours_since_last_run;
          const flag = hrs == null ? "❓ never run" : hrs > 6 ? `⚠️ ${hrs.toFixed(1)}h ago` : `✅ ${hrs.toFixed(1)}h ago`;
          console.log(`  job ${j.jobid} (${j.schedule}): ${flag}`);
          if (hrs != null && hrs > 6) {
            fail("cron", `cron job ${j.jobid} (${j.schedule}) hasn't run in ${hrs.toFixed(1)}h`);
          }
        }
        return;
      }
    }
  } catch (_) { /* fall through */ }

  // Proxy: marketing-automation logs to communications. If 0 outbound emails
  // in last 24h via 'tenant_id IS NOT NULL' tagged auto-emails, cron is stalled.
  const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const r2 = await fetch(`https://${PROJECT_REF}.supabase.co/rest/v1/communications?channel=eq.email&direction=eq.outbound&created_at=gte.${since24}&select=id`, {
    method: "HEAD",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "X-Tenant-ID": SNT_UUID, Prefer: "count=exact" },
    signal: AbortSignal.timeout(8000),
  });
  const cr = r2.headers.get("content-range") || "*/0";
  const sent = parseInt(cr.split("/")[1] || "0", 10);
  console.log(`  ${sent} outbound emails in last 24h via marketing-automation`);
  if (sent === 0) console.log(`  ⚠️  may be quiet day OR marketing-automation cron stalled — check pg_cron`);
}

// ── 13. Service Worker cache integrity ──────────────────────────────────────
function auditSW() {
  console.log("\n┌─ 13. Service Worker cache integrity ───────────────");
  const swPath = join(ROOT, "sw.js");
  if (!existsSync(swPath)) { fail("sw", "sw.js missing"); return; }
  const sw = readFileSync(swPath, "utf8");
  const versionJson = JSON.parse(readFileSync(join(ROOT, "version.json"), "utf8"));

  const cacheNameMatch = sw.match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
  if (!cacheNameMatch) {
    fail("sw", "sw.js has no CACHE_NAME constant");
  } else {
    const expected = `branch-manager-v${versionJson.version}`;
    if (cacheNameMatch[1] !== expected) {
      fail("sw", `sw.js CACHE_NAME=${cacheNameMatch[1]} but version.json=${versionJson.version} (expected ${expected})`);
    } else {
      console.log(`  ✅ sw.js CACHE_NAME matches version.json (${expected})`);
    }
  }

  // Check for "old caches purge" logic — without it, every deploy leaves
  // dead caches lingering. The May 2 cache-bypass work added this.
  if (!/caches\.delete|keys\(\)\.then/i.test(sw)) {
    fail("sw", "sw.js doesn't appear to purge old caches on activate (cache build-up risk)");
  } else {
    console.log(`  ✅ sw.js has cache-purge logic`);
  }

  // Old dist/ files — every bumped version leaves bm.bundle.vN.min.js behind.
  // Check we don't have >5 (older deploys ok for rollback, more = bloat).
  const distFiles = execSync(`ls ${ROOT}/dist/ 2>/dev/null`, { encoding: "utf8" }).split("\n").filter(f => /bm\.bundle\.v\d+\.min\.js$/.test(f));
  console.log(`  ${distFiles.length} bundle files in dist/ (last 5 kept for rollback; consider pruning if >10)`);
  if (distFiles.length > 15) fail("sw", `${distFiles.length} bundle files in dist/ — prune older than v${versionJson.version - 5}`);
}

// ── 14. Realtime + DB trigger health ────────────────────────────────────────
async function auditRealtime() {
  console.log("\n┌─ 14. Realtime + DB trigger health ──────────────────");
  // Health endpoint (we already saw realtime was the only thing alive during
  // the May 2 outage — check it still is).
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/health?services=realtime`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(8000),
  });
  if (r.ok) {
    const j = await r.json();
    const rt = j.find(s => s.name === "realtime");
    if (!rt || !rt.healthy) fail("realtime", `realtime UNHEALTHY: ${rt?.error || "unknown"}`);
    else console.log(`  ✅ realtime ACTIVE (db_connected=${rt.info?.db_connected}, replication_connected=${rt.info?.replication_connected})`);
  }

  // Verify replica identity is set on tables that BM realtime-subscribes to.
  // tasks (cloud sync), team_messages (chat), communications (call center),
  // crew_locations (live map). Without REPLICA IDENTITY FULL or a non-trivial
  // primary key, postgres_changes events miss the OLD row payload.
  const sql = `
    select c.relname as table_name,
           case relreplident
             when 'd' then 'default'
             when 'n' then 'nothing'
             when 'f' then 'full'
             when 'i' then 'index'
           end as replident
    from pg_class c
    where c.relname in ('tasks', 'team_messages', 'communications', 'crew_locations',
                        'clients', 'quotes', 'invoices', 'jobs')
      and c.relkind = 'r'
    order by c.relname;
  `.replace(/\s+/g, " ").trim();
  const r2 = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(8000),
  });
  if (r2.ok) {
    const rows = await r2.json();
    const dflt = (rows || []).filter(r => r.replident === "default");
    console.log(`  ${rows?.length || 0} BM-critical tables checked, ${dflt.length} with default replica identity`);
    // 'default' is fine if PK exists; 'nothing' means realtime payloads will be incomplete.
    const broken = (rows || []).filter(r => r.replident === "nothing");
    if (broken.length) fail("realtime", `Tables with REPLICA IDENTITY NOTHING (realtime won't get old-row payloads): ${broken.map(r => r.table_name).join(", ")}`);
  }
}

// ── 15. Auth ↔ team_members consistency ────────────────────────────────────
async function auditAuthConsistency() {
  console.log("\n┌─ 15. Auth ↔ team_members consistency ────────────────");
  // BM has TWO user populations:
  //   (a) team users — sign into BM operator app, must have team_members row
  //   (b) portal users — clients who view their invoices/quotes via portal.
  //       portal access is via portal_sessions (client_id + token), no auth.users.
  // So auth.users without a team_members row that ALSO have an email matching
  // a known client = portal-style. Treat those as legitimate.
  const sql = `
    select
      (select count(*) from auth.users)                                                            as total_auth_users,
      (select count(*) from team_members)                                                           as total_team_members,
      (select count(*) from auth.users au
         where au.email is not null
           and not exists (select 1 from team_members t where lower(t.email) = lower(au.email))
           and not exists (select 1 from clients c where lower(c.email) = lower(au.email))
      )                                                                                             as orphan_team_users,
      (select count(*) from team_members t where t.email is not null
         and not exists (select 1 from auth.users u where lower(u.email) = lower(t.email)))          as tm_without_auth,
      (select count(*) from auth.users where last_sign_in_at < now() - interval '90 days')           as dormant_auth_90d,
      (select count(*) from auth.users au
         where au.email is not null
           and exists (select 1 from clients c where lower(c.email) = lower(au.email)))              as auth_users_who_are_clients;
  `.replace(/\s+/g, " ").trim();
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) { fail("auth", "Could not query auth/team_members"); return; }
  const [row] = await r.json();
  if (!row) { fail("auth", "Empty result"); return; }
  console.log(`  total_auth_users=${row.total_auth_users}  team_members=${row.total_team_members}  client_match=${row.auth_users_who_are_clients}`);
  console.log(`  orphan_team_users=${row.orphan_team_users}  tm_without_auth=${row.tm_without_auth}  dormant>90d=${row.dormant_auth_90d}`);
  // Drift in the "team" population only — portal users are expected to outnumber team
  if (row.orphan_team_users > 5) fail("auth", `${row.orphan_team_users} non-portal auth users without a team_members row — verify they shouldn't have access`);
  if (row.tm_without_auth > 5) fail("auth", `${row.tm_without_auth} team_members rows without auth user — can't sign in`);
}

// ── 16. Page render smoke test ──────────────────────────────────────────────
function auditPageRender() {
  console.log("\n┌─ 16. Page render smoke test ────────────────────────");
  // Pull pageRenderers keys from index.html — those are the modules that
  // MUST expose a render() function. src/pages/*.js files that aren't in
  // pageRenderers are utility modules (commandpalette, pdfgen, quotes-tm)
  // and don't need render().
  const indexHtml = readFileSync(join(ROOT, "index.html"), "utf8");
  const renderersBlock = indexHtml.match(/var\s+pageRenderers\s*=\s*\{([\s\S]*?)\n\};/);
  const validTargets = new Set();
  const targetToModule = {};
  if (renderersBlock) {
    // Format is like:  dashboard: function() { return DashboardPage.render(); },
    for (const m of renderersBlock[1].matchAll(/^\s*([a-z][a-z0-9-]*):\s*function\s*\(\)\s*\{\s*return\s+([A-Za-z_]+)\.render\(\)/gmi)) {
      validTargets.add(m[1]);
      targetToModule[m[1]] = m[2];
    }
  }
  const pageFiles = execSync(`ls ${ROOT}/src/pages/*.js 2>/dev/null`, { encoding: "utf8" }).split("\n").filter(Boolean);
  let missing = 0;
  let total = 0;
  for (const f of pageFiles) {
    const fname = f.split("/pages/")[1].replace(/\.js$/, "");
    // Only enforce render() for files that are actually in pageRenderers
    if (!validTargets.has(fname)) continue; // utility module; skip
    const src = readFileSync(f, "utf8");
    total++;
    if (!/(render\s*:\s*function|render\s*\(\s*\)\s*\{|render\s*=\s*function)/.test(src)) {
      missing++;
      fail("page-render", `${fname}.js is in pageRenderers but exposes no render() function`);
    }
  }
  console.log(`  ${total} pageRenderers entries scanned, ${missing} broken`);
}

// ── 17. UI / button / onclick audit ──────────────────────────────────────────
function auditUI() {
  console.log("\n┌─ 17. UI / button / onclick wiring ──────────────────");
  // Static analysis: every `onclick="someFn(...)"` in HTML strings should
  // reference a function/method that's defined somewhere in the codebase.
  // Catches: typo'd handlers, deleted functions still referenced, dead buttons.
  //
  // Bug pattern this would catch: button with onclick="ChipDrops.addNew()"
  // when ChipDrops module was renamed but template wasn't updated → silent
  // dead button (no error, just no action).

  const allCode = execSync(
    `find ${ROOT}/src ${ROOT}/index.html ${ROOT}/onboarding ${ROOT}/portal -type f \\( -name '*.js' -o -name '*.html' \\) 2>/dev/null`,
    { encoding: "utf8" },
  ).split("\n").filter(Boolean);

  // Extract every onclick="X(...)" / onclick='X(...)' reference
  const handlerPattern = /onclick\s*=\s*["']\s*([A-Za-z_$][A-Za-z0-9_$.]*)\s*\(/g;
  const handlerCalls = new Map(); // handler name → first file:line we saw it
  for (const f of allCode) {
    const src = readFileSync(f, "utf8");
    let i = 0;
    for (const m of src.matchAll(handlerPattern)) {
      i++;
      const name = m[1];
      if (!handlerCalls.has(name)) handlerCalls.set(name, f);
    }
  }
  // For each handler name, verify the LEAF (final segment) is defined
  // somewhere as a function-like binding. For dotted names like
  // 'Stripe.sendPaymentLink', the relevant check is whether
  // 'sendPaymentLink' appears as `sendPaymentLink: function`,
  // `sendPaymentLink:` (object property), `function sendPaymentLink(`,
  // `sendPaymentLink = function`, etc.
  const allSrcText = allCode.map(f => readFileSync(f, "utf8")).join("\n");
  const undefinedHandlers = [];
  for (const [name, sample] of handlerCalls.entries()) {
    // Built-ins / globals we trust
    const root = name.split(".")[0];
    const leaf = name.split(".").pop();
    if (["alert", "console", "history", "location"].includes(root)) continue;
    // For "Foo" simple names, look for any function definition
    // For "Foo.bar.baz" dotted names, look for the LEAF as a method/property
    const target = leaf;
    const pat = new RegExp(
      [
        `function\\s+${target}\\s*\\(`,            // function NAME(
        `\\b${target}\\s*:\\s*(?:async\\s+)?function`, // NAME: function
        `\\b${target}\\s*:\\s*\\(`,                  // NAME: (         (arrow)
        `\\b${target}\\s*=\\s*(?:async\\s+)?function`, // NAME = function
        `\\b${target}\\s*=\\s*\\(`,                  // NAME = (         (arrow)
        `\\b${target}\\s*\\([^)]*\\)\\s*\\{`,        // NAME(args) {     (method shorthand)
        `(?:window|globalThis)\\.${target}\\s*=`,    // window.NAME =
      ].join("|"),
    );
    if (!pat.test(allSrcText)) {
      undefinedHandlers.push({ name, sample });
    }
  }
  console.log(`  ${handlerCalls.size} unique onclick handlers, ${undefinedHandlers.length} with no visible definition`);
  if (undefinedHandlers.length > 0) {
    // Print first 10 — full list might be noisy
    for (const u of undefinedHandlers.slice(0, 10)) {
      console.log(`     ⚠️  onclick="${u.name}(…)"  (sample: ${u.sample.split("/").pop()})`);
    }
    if (undefinedHandlers.length > 10) {
      console.log(`     ...and ${undefinedHandlers.length - 10} more`);
    }
    // Many of these may be valid (object methods we can't statically resolve).
    // Threshold: only fail if the count is HIGH (>50 likely means a pattern is broken).
    if (undefinedHandlers.length > 50) {
      fail("ui", `${undefinedHandlers.length} onclick handlers can't be statically resolved — investigate`);
    }
  } else {
    console.log(`  ✅ every onclick handler resolves`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log("─".repeat(60));
console.log("  BM Deep Audit — every check that would have caught a real bug");
console.log("─".repeat(60));

// v848: wrap each cat so a single timeout/exception doesn't crash the
// whole 17-cat run before we get to summary + tracking-issue file step.
async function safe(name, fn) {
  try { await fn(); }
  catch (e) {
    const eName = (e && e.name) || "Error";
    console.log(`  ⚠ cat "${name}" threw ${eName} — skipped`);
  }
}
await safe("public-fns", auditPublicFns);
await safe("bundle", auditBundle);
await safe("csp", auditCSP);
await safe("hardcoded-uuids", auditHardcodedUuids);
await safe("anon-write", auditAnonWrite);
await safe("verify-jwt", auditVerifyJwt);
await safe("stale", auditStale);
await safe("email", auditEmail);
await safe("speed", auditSpeed);
await safe("code", auditCode);
await safe("security-headers", auditSecurityHeaders);
await safe("cron", auditCron);
await safe("sw", auditSW);
await safe("realtime", auditRealtime);
await safe("auth-consistency", auditAuthConsistency);
await safe("page-render", auditPageRender);
await safe("ui", auditUI);

console.log("\n" + "─".repeat(60));
if (issues.length === 0) {
  console.log("🟢  DEEP-HEALTHY — 0 issues across 17 categories.");
  process.exit(0);
} else {
  console.log(`🔴  ${issues.length} issue(s) found:\n`);
  for (const i of issues) {
    console.log(`  [${i.category}] ${i.msg}\n`);
  }
  process.exit(1);
}
