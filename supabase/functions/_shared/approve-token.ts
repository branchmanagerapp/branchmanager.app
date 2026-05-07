/**
 * HMAC-SHA256 signed tokens for the marketing-approve flow.
 * Token format: base64url(`${tenant_id}.${exp_unix_seconds}.${signature}`)
 *   where signature = HMAC-SHA256(secret, `${tenant_id}.${exp}`)
 *
 * Verifies tenant_id + expiry. No user identity in the token — it's a
 * "whoever has the link" capability. Sent only to the tenant owner's
 * email; expires in 24h by default.
 */

const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return new Uint8Array(atob(s).split('').map(c => c.charCodeAt(0)));
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

export async function mintApproveToken(tenantId: string, ttlSeconds = 24 * 3600): Promise<string> {
  const secret = Deno.env.get('MARKETING_APPROVE_SECRET') || '';
  if (!secret) throw new Error('MARKETING_APPROVE_SECRET not set');
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${tenantId}.${exp}`;
  const sig = await hmac(secret, payload);
  return b64urlEncode(enc.encode(`${payload}.${sig}`));
}

export async function verifyApproveToken(token: string): Promise<{ tenantId: string } | null> {
  try {
    const secret = Deno.env.get('MARKETING_APPROVE_SECRET') || '';
    if (!secret) return null;
    const decoded = new TextDecoder().decode(b64urlDecode(token));
    const parts = decoded.split('.');
    if (parts.length !== 3) return null;
    const [tenantId, expStr, sig] = parts;
    const exp = parseInt(expStr, 10);
    if (!exp || exp < Math.floor(Date.now() / 1000)) return null;
    const expectSig = await hmac(secret, `${tenantId}.${exp}`);
    if (sig !== expectSig) return null;
    return { tenantId };
  } catch { return null; }
}
