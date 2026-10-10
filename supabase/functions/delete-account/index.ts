/**
 * Branch Manager — In-app account deletion (Apple App Store Guideline 5.1.1(v)).
 *
 * Deletes ONLY the authenticated caller's own account: their Supabase Auth
 * user + their team_members row. It never touches any other user, and it
 * never deletes company business records (clients/quotes/jobs/invoices) —
 * those stay with the account owner (disclosed to the user in the UI).
 *
 * The caller's identity is taken from THEIR OWN access token (verified against
 * /auth/v1/user), so a request can only ever delete the person making it.
 *
 * Deploy (needs Doug's Supabase access token):
 *   npx supabase functions deploy delete-account --project-ref ltpivkqahvplapyagljt
 * (Leave JWT verification ON — the client always calls with the user's session.)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const j = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'Content-Type': 'application/json' }
});

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET' || req.method === 'HEAD') return new Response('delete-account ok', { status: 200, headers: CORS });
  if (req.method !== 'POST') return j(405, { error: 'method not allowed' });
  if (!SUPABASE_URL || !SERVICE_KEY) return j(500, { error: 'server not configured' });

  // 1. Identify the caller from THEIR OWN token (this is what scopes the delete to self).
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return j(401, { error: 'not signed in' });

  const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!uRes.ok) return j(401, { error: 'invalid session' });
  const user = await uRes.json();
  const uid = user?.id;
  const email = user?.email;
  if (!uid) return j(401, { error: 'no user' });

  // 2. Delete the caller's own team_members row(s) (their personal profile/access).
  //    Scoped by their own email; never other users.
  if (email) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/team_members?email=eq.${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=minimal' }
      });
    } catch (_e) { /* non-fatal — the auth-user delete below is the account deletion */ }
  }

  // 3. Delete the caller's Auth user (this is the account deletion).
  const dRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  if (!dRes.ok) {
    const detail = await dRes.text().catch(() => '');
    return j(500, { error: 'delete failed', detail: detail.slice(0, 200) });
  }

  return j(200, { deleted: true });
});
