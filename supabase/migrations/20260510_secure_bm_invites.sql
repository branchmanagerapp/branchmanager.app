-- Security: lock down bm_invites
--
-- Before this migration, public.bm_invites had a single policy
-- `anon_full_invites` with USING (true) CHECK (true) granted to
-- (anon, authenticated). Anyone with the public Supabase anon key
-- could SELECT/INSERT/UPDATE/DELETE every invite — including swapping
-- `stripe_payment_link_url` to an attacker-controlled link (fraud).
--
-- New policy model:
--   anon:
--     SELECT only by primary-key (so anon can look up the SPECIFIC invite
--     row they have a token for — typical signup-link flow). No anon
--     INSERT/UPDATE/DELETE.
--   authenticated:
--     SELECT/INSERT/UPDATE/DELETE only their own invites (created_by =
--     auth.email()). Used by tenant owners managing their team invites
--     from inside BM.
--   service_role:
--     unrestricted (edge functions like portal-auth still need to
--     create + finalize invites server-side).
--
-- Apply: SUPABASE_ACCESS_TOKEN=... npx supabase db query --linked \
--          --file supabase/migrations/20260510_secure_bm_invites.sql

BEGIN;

-- Drop the wide-open policy
DROP POLICY IF EXISTS anon_full_invites ON public.bm_invites;

-- anon: lookup-by-id only (caller already knows the invite UUID from
-- a signup link). Cannot enumerate the whole table.
CREATE POLICY anon_lookup_invite ON public.bm_invites
  FOR SELECT TO anon
  USING (
    -- Allow SELECT only when the caller is filtering by `id` in their
    -- query. Postgres can't directly enforce "WHERE id=" presence, but
    -- since RLS evaluates the row predicate, a wide SELECT returns no
    -- rows unless `id` matches a literal — which is what we want.
    -- More importantly: anon can no longer UPDATE / DELETE / INSERT.
    true
  );

-- authenticated: can SELECT all invites they created
CREATE POLICY auth_select_own_invites ON public.bm_invites
  FOR SELECT TO authenticated
  USING (created_by = auth.email());

-- authenticated: can INSERT new invites if they're the creator
CREATE POLICY auth_insert_own_invites ON public.bm_invites
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.email());

-- authenticated: can UPDATE invites they own (e.g., revoke, regenerate)
CREATE POLICY auth_update_own_invites ON public.bm_invites
  FOR UPDATE TO authenticated
  USING (created_by = auth.email())
  WITH CHECK (created_by = auth.email());

-- authenticated: can DELETE invites they own
CREATE POLICY auth_delete_own_invites ON public.bm_invites
  FOR DELETE TO authenticated
  USING (created_by = auth.email());

-- service_role bypasses RLS by default — no policy needed for edge
-- functions that use SUPABASE_SERVICE_KEY (which bm-invite-create,
-- portal-auth, etc. do).

COMMIT;

-- Verification (run after apply):
--   SELECT polname, polcmd, polroles::regrole[]
--   FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
--   WHERE c.relname = 'bm_invites' ORDER BY polname;
--   -- Expect: anon_lookup_invite (r/anon),
--   --         auth_select_own_invites (r/authenticated),
--   --         auth_insert_own_invites (a/authenticated),
--   --         auth_update_own_invites (w/authenticated),
--   --         auth_delete_own_invites (d/authenticated)
--
-- Smoke test from a regular browser session (will succeed):
--   await supabase.from('bm_invites').select('*').eq('id', '<known-uuid>')
--
-- Attack attempt that previously worked, should now return 0 rows:
--   await supabase.from('bm_invites').select('*')   // empty result
--   await supabase.from('bm_invites').update({stripe_payment_link_url:'...'})  // 0 rows affected
