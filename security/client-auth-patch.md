# Client Auth Patch — make a real Supabase session authoritative

## Current state (from src/auth.js, src/supabase.js)
- `SupabaseDB.client = createClient(url, anonKey, {headers:{'X-Tenant-ID': …}})`
  — anon key, spoofable tenant header, no session required for data.
- `Auth.login()` tries `supabase.auth.signInWithPassword()` FIRST, then
  falls back to a djb2-hash check against `localStorage['bm-auth-hashes']`.
- `Auth.isLoggedIn()` = `!!Auth.user`. `Auth.user` is restored from
  `localStorage['bm-session']`. → A user is "logged in" with NO live
  Supabase session whenever the djb2 fallback path was used.

## Required change (scoped, not a rewrite)
1. **Make the Supabase session authoritative.** On boot, if
   `supabase.auth.getSession()` is null → force the login screen, even if
   `localStorage['bm-session']` exists. Data access requires a live session.
2. **Demote the djb2 fallback.** Keep it only as an offline-display
   convenience if desired, but it must NOT satisfy `isLoggedIn()` for any
   path that queries Supabase. Simplest: delete the fallback, require
   `signInWithPassword` to succeed.
3. **Stop trusting the X-Tenant-ID header for security.** After the token
   hook ships, tenant comes from the JWT claim. The header can remain only
   as a non-security routing hint; RLS must rely on the claim.
4. **Every BM staff member needs a real Supabase Auth account** (email +
   password) with `app_metadata.tenant_id` = the SNT tenant uuid
   `93af4348-8bba-4045-ac3e-5e71ec1cc8c5` and a `role`. One-time admin
   creation (Supabase dashboard or admin API).

## Token hook (server-side, required for tenant isolation to work at all)
Add a `custom_access_token_hook` (Postgres function + enable in Auth
settings) that copies `app_metadata.tenant_id` and `role` into the JWT
claims, so `current_tenant_id()` (JWT path) and the rewritten `auth_*`
policies resolve correctly. Without this, even authenticated staff get
nothing after lockdown.

## Deploy constraint
The client change ships only via the BM repo → blocked by the dead
`branchmanagerapp` GitHub PAT. The token hook + auth accounts + policy
rewrite are server-side (management token) and can be staged independently,
but must not be the LAST step — lockdown is last, and only after the
client deploy is verified live (ROLLOUT.md step 6).

## Done in this offline pass
Design + exact SQL only. No code edited, nothing deployed, no live change.
Implementation of the hook/patch/policy-rewrite is the supervised work.
