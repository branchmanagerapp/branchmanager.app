#!/usr/bin/env node
/**
 * ⚠ EXPERIMENTAL — DO NOT USE WITH --html ⚠
 *
 * v372 attempt: this script builds a single concatenated JS bundle from
 * the 90 individual <script src=…> files in index.html. The build itself
 * works, but the resulting bundle FREEZES THE RENDERER on load — naive
 * concat doesn't preserve the per-script `defer` boot ordering that the
 * codebase relies on. The parallel `index-bundled.html` test page
 * confirmed this. Live `index.html` is unaffected.
 *
 * Real fix needs either (a) refactor every script to be import-safe and
 * use real esbuild dep tracking, or (b) keep concat but add explicit boot
 * wrappers per file. Either is 4-6 hours.
 *
 * Until that lands: don't run with --html. The default (dist-only) mode
 * is harmless — it builds artifacts to dist/ without touching the live
 * page.
 *
 * Original goal: cut cold-start HTTP from 90 round-trips to 1.
 *
 * Strategy: pure concatenation. These scripts are non-modular (each writes a
 * `var Foo = {…}` global), so we DON'T touch their contents — we just stitch
 * them in the SAME order index.html loads them, with `;\n` between files so
 * trailing-statement issues don't bleed across boundaries. esbuild then
 * minifies the combined file.
 *
 * The 2 CDN scripts at the top of index.html (Lucide, MapLibre) stay external —
 * we don't redistribute upstream code.
 *
 * Output: dist/bm.bundle.v{N}.min.js
 *
 * Usage:
 *   node scripts/build-bundle.mjs            # builds with current ?v= number
 *   node scripts/build-bundle.mjs --watch    # rebuild on change
 *   node scripts/build-bundle.mjs --html     # also rewrite index.html in place (DESTRUCTIVE)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const DIST = path.join(ROOT, 'dist');

const args = new Set(process.argv.slice(2));
const REWRITE_HTML = args.has('--html');

function extractLocalScripts(html) {
  // Capture lines that load LOCAL scripts (not CDN). Preserve order.
  const re = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/g;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const src = m[1];
    if (/^https?:\/\//.test(src)) continue;     // skip CDN
    const cleanPath = src.split('?')[0];        // strip cache-bust
    out.push({ raw: m[0], src, cleanPath, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function readVersionFromHTML(html) {
  // Prefer ?v=N script-tag query string (pre-bundle layout). Fall back to
  // the BUNDLED_VERSION constant (post-bundle layout, no ?v= strings left).
  // Last-resort: version.json.
  const m1 = html.match(/\?v=(\d+)/);
  if (m1) return m1[1];
  const m2 = html.match(/BUNDLED_VERSION\s*=\s*(\d+)/);
  if (m2) return m2[1];
  try {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
    if (v && typeof v.version !== 'undefined') return String(v.version);
  } catch (e) {}
  return 'dev';
}

// After --html swap, index.html no longer has the 90 individual <script> tags
// to extract from — only the single bundle reference. Persist the manifest the
// first time we successfully see a multi-script index.html, then reuse it.
const MANIFEST = path.join(ROOT, 'scripts', 'bundle-manifest.json');

function build() {
  const html = fs.readFileSync(INDEX, 'utf8');
  let scripts = extractLocalScripts(html);
  const version = readVersionFromHTML(html);

  // If we just see the bundle itself (1 entry), fall back to the persisted
  // manifest so post-swap rebuilds still pull from src/. If the manifest is
  // missing AND we're in single-bundle mode, hard-error so the user knows to
  // run from a pre-swap state once first.
  const isPostSwap = scripts.length <= 1;
  if (isPostSwap) {
    if (!fs.existsSync(MANIFEST)) {
      throw new Error('Post-swap index.html and no bundle-manifest.json — re-run before swapping, or restore manifest from git.');
    }
    const saved = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    scripts = saved.scripts.map(p => ({ cleanPath: p }));
    console.log('Loaded ' + scripts.length + ' scripts from manifest (post-swap mode, v' + version + ')');
  } else {
    // Save the freshly-extracted manifest so future post-swap rebuilds work.
    fs.writeFileSync(MANIFEST, JSON.stringify({
      generatedAt: new Date().toISOString(),
      scripts: scripts.map(s => s.cleanPath)
    }, null, 2));
    console.log('Found ' + scripts.length + ' local scripts to bundle (v' + version + ', manifest written)');
  }

  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

  // Concatenate sources with file-boundary markers so source maps + debugging stay sane
  const buf = [];
  let totalIn = 0;
  for (const s of scripts) {
    const fp = path.join(ROOT, s.cleanPath);
    if (!fs.existsSync(fp)) {
      console.warn('  SKIP missing: ' + s.cleanPath);
      continue;
    }
    const c = fs.readFileSync(fp, 'utf8');
    totalIn += c.length;
    buf.push('/* ──── ' + s.cleanPath + ' ──── */');
    buf.push(c);
    // Defensive: if a file ends mid-statement (rare), `;\n` between files keeps
    // the next file's leading parens from being read as a function call on the
    // previous one's last expression.
    buf.push(';');
  }
  const combined = buf.join('\n');

  const rawOut = path.join(DIST, 'bm.bundle.v' + version + '.js');
  fs.writeFileSync(rawOut, combined);

  // Minify with esbuild — pure local-bin invocation, no globals required
  const esbuild = path.join(ROOT, 'node_modules', '.bin', 'esbuild');
  const minOut  = path.join(DIST, 'bm.bundle.v' + version + '.min.js');
  // 2026-08-28: this used to console.warn and copy the UNMINIFIED file to
  // *.min.js — a 4.5 MB artifact with a minified name, shipped to crews on
  // phones, detectable only by reading a log line. A fresh `git clone` never
  // has node_modules/.bin, so this fired every time. Now: self-heal the bin
  // shim if the package is present, else FAIL HARD. Never emit a fake .min.js.
  if (!fs.existsSync(esbuild)) {
    const pkgBin = path.join(ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild');
    if (fs.existsSync(pkgBin)) {
      fs.mkdirSync(path.dirname(esbuild), { recursive: true });
      try { fs.symlinkSync(path.relative(path.dirname(esbuild), pkgBin), esbuild); }
      catch (e) { fs.copyFileSync(pkgBin, esbuild); fs.chmodSync(esbuild, 0o755); }
      console.log('esbuild bin shim was missing — created it at ' + esbuild);
    }
  }
  if (!fs.existsSync(esbuild)) {
    console.error('\nBUILD FAILED: esbuild not found at ' + esbuild);
    console.error('A fresh clone has no node_modules. Copy them in, e.g.:');
    console.error('  cp -R "<working-tree>/node_modules/esbuild" "<working-tree>/node_modules/@esbuild" node_modules/');
    console.error('Refusing to write an unminified bundle under a .min.js name.\n');
    process.exit(1);
  }
  {
    execSync('"' + esbuild + '" "' + rawOut + '" --minify --target=es2020 --legal-comments=none --outfile="' + minOut + '"', { stdio: 'inherit' });
  }

  const inKB  = (totalIn       / 1024).toFixed(1);
  const rawKB = (fs.statSync(rawOut).size / 1024).toFixed(1);
  const minKB = (fs.statSync(minOut).size / 1024).toFixed(1);
  console.log('In: ' + inKB + ' KB across ' + scripts.length + ' files');
  console.log('Concatenated: ' + rawKB + ' KB (' + path.relative(ROOT, rawOut) + ')');
  console.log('Minified:     ' + minKB + ' KB (' + path.relative(ROOT, minOut) + ')');
  // Guard: a real minify shrinks this bundle by ~35%. If .min is >90% of raw,
  // minification silently did not happen — do not let it reach production.
  if (fs.statSync(minOut).size > fs.statSync(rawOut).size * 0.9) {
    console.error('\nBUILD FAILED: ' + minKB + ' KB min vs ' + rawKB + ' KB raw — minification did not run.');
    fs.unlinkSync(minOut);
    process.exit(1);
  }

  // ── Self-prune old bundles ────────────────────────────────────────────────
  // 2026-08-29: dist/ had reached 1,016 MB / 289 files because every deploy
  // committed a superseded bundle forever and nothing ever removed one. Only
  // the single .min.js named in index.html is ever served.
  //
  // Keep the newest KEEP_BUNDLES minified bundles so a phone still running a
  // stale cached index.html can fetch its own version instead of 404ing, and
  // ALWAYS keep whatever index.html currently points at, whatever its age.
  const KEEP_BUNDLES = 10;
  try {
    let pinned = null;
    try {
      const m = fs.readFileSync(INDEX, 'utf8').match(/dist\/(bm\.bundle\.v\d+\.min\.js)/);
      if (m) pinned = m[1];
    } catch (e) { /* index unreadable — fall through, prune stays conservative */ }

    const mins = fs.readdirSync(DIST)
      .filter(f => /^bm\.bundle\.v\d+\.min\.js$/.test(f))
      .sort((a, b) => (+a.match(/v(\d+)/)[1]) - (+b.match(/v(\d+)/)[1]));

    const keep = new Set(mins.slice(-KEEP_BUNDLES));
    keep.add('bm.bundle.v' + version + '.min.js');
    if (pinned) keep.add(pinned);

    let freed = 0, n = 0;
    for (const f of fs.readdirSync(DIST)) {
      const m = f.match(/^bm\.bundle\.v(\d+)(\.min)?\.js$/);
      if (!m) continue;
      // raw intermediates: keep only the one just built (it is gitignored)
      const isRaw = !m[2];
      const isCurrentRaw = isRaw && +m[1] === version;
      if (keep.has(f) || isCurrentRaw) continue;
      freed += fs.statSync(path.join(DIST, f)).size;
      fs.unlinkSync(path.join(DIST, f));
      n++;
    }
    if (n) console.log('Pruned ' + n + ' stale bundle file(s), freed ' + (freed / 1048576).toFixed(1) + ' MB');
  } catch (e) {
    console.warn('Bundle prune skipped: ' + e.message);
  }

  if (REWRITE_HTML) {
    if (isPostSwap) {
      // In post-swap mode (manifest-driven), index.html already has exactly
      // one bundle tag and bump.sh already updated its version reference.
      // Nothing for --html to rewrite. Bail cleanly.
      console.log('Post-swap: index.html already has single bundle ref; --html is a no-op.');
      return;
    }
    // Pre-swap path: replace ALL local <script src=…> tags with one bundle tag.
    // We use the in-memory `scripts` list (which has start/end positions from
    // the live HTML), NOT a re-extracted list — that way nothing in newHtml
    // shifts unexpectedly mid-rewrite.
    const bundleTag = '<script defer src="dist/bm.bundle.v' + version + '.min.js"></script>';
    let newHtml = html;
    // Walk back-to-front: replace last script tag with empty, second-to-last
    // empty, etc., until we get to the FIRST one which becomes the bundle.
    for (let i = scripts.length - 1; i >= 0; i--) {
      const s = scripts[i];
      const replacement = (i === 0) ? bundleTag : '';
      // Trim a trailing newline + whitespace before the tag if we're stripping
      const trimBefore = (i === 0) ? newHtml.slice(0, s.start) : newHtml.slice(0, s.start).replace(/\n\s*$/, '\n');
      newHtml = trimBefore + replacement + newHtml.slice(s.end);
    }
    fs.writeFileSync(INDEX, newHtml);
    console.log('index.html rewritten — ' + scripts.length + ' tags collapsed into 1.');
  } else {
    console.log('\nDry-mode: index.html NOT modified.');
    console.log('To test the bundle, open index-bundled.html (parallel file) or rerun with --html when ready.');
  }
}

if (args.has('--watch')) {
  console.log('Watching src/ for changes... (Ctrl-C to stop)');
  build();
  fs.watch(path.join(ROOT, 'src'), { recursive: true }, (_e, _f) => { try { build(); } catch (e) { console.error(e.message); } });
} else {
  build();
}
