/**
 * lock-debt.mjs — encrypt the private /debt content into debt/index.html.
 *
 * The plaintext lives OUTSIDE the web root at:
 *   TREE FOLDER/Tree/_debt-content-PRIVATE.html
 * Only the encrypted blob is written into the served page, so nothing sensitive
 * is readable via view-source or by guessing the URL. Decryption happens in the
 * browser only after the correct password is entered (PBKDF2-SHA256 250k iters
 * → AES-256-GCM — same params as the decrypt code in debt/index.html).
 *
 * Usage:
 *   DEBT_PW='your-strong-password' node scripts/lock-debt.mjs
 *
 * Re-run any time you edit the private content file or want a new password.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..');                       // branchmanager-app/
const CONTENT = join(APP_ROOT, '..', '_debt-content-PRIVATE.html'); // Tree/_debt-content-PRIVATE.html
const PAGE = join(APP_ROOT, 'debt', 'index.html');

const pw = process.env.DEBT_PW;
if (!pw || pw.length < 6) {
  console.error('Set a password (min 6 chars):  DEBT_PW=\'...\' node scripts/lock-debt.mjs');
  process.exit(1);
}

const plaintext = readFileSync(CONTENT, 'utf8');
const enc = new TextEncoder();

const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));

const baseKey = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
  baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
);
const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));

const b64 = (u8) => Buffer.from(u8).toString('base64');
const blob = JSON.stringify({ s: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ctBuf)) });

let page = readFileSync(PAGE, 'utf8');
const START = '/*BLOB_START*/', END = '/*BLOB_END*/';
const re = new RegExp(START.replace(/[*/]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[*/]/g, '\\$&'));
if (!re.test(page)) { console.error('Could not find BLOB markers in debt/index.html'); process.exit(1); }
page = page.replace(re, START + 'window.__DEBT_BLOB__=' + JSON.stringify(blob) + ';' + END);
writeFileSync(PAGE, page);

console.log('Locked. Encrypted', plaintext.length, 'chars into debt/index.html');
console.log('Password set. Share it with Jon out-of-band (text/call), not in the same channel as the link.');
