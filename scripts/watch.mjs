#!/usr/bin/env node
// Auto-rebuilds dist/bundle.js whenever any file under src/ changes.
// No deps — uses Node's built-in fs.watch.
import { watch } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = resolve(ROOT, 'src');

let building = false;
let queued   = false;

function build() {
  if (building) { queued = true; return; }
  building = true;
  const t = Date.now();
  process.stdout.write(`[watch] building… `);
  try {
    execSync('node scripts/build-bundle.mjs', { cwd: ROOT, stdio: 'inherit' });
    console.log(`done in ${Date.now() - t}ms`);
  } catch {
    console.log('BUILD FAILED — check output above');
  }
  building = false;
  if (queued) { queued = false; build(); }
}

// Initial build
build();

// Watch src/ recursively
watch(SRC, { recursive: true }, (_event, filename) => {
  if (!filename || filename.endsWith('~') || filename.includes('.swp')) return;
  console.log(`[watch] changed: src/${filename}`);
  build();
});

console.log(`[watch] watching src/ for changes — Ctrl+C to stop`);
