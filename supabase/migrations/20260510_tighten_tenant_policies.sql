-- Multi-tenant policy tightening: tenants / user_tenants / tenant_settings
--
-- Before: each table had an auth_full_* policy with USING(true) CHECK(true)
-- for the authenticated role. Any logged-in user in BM could read/write
-- every tenant's row, including modifying another tenant's branding,
-- adding themselves to any tenant's membership, or reading every tenant's
-- stripe keys + resend FROM.
--
-- After: policies scope to user_tenants membership.
--   - tenants:         authed user can SELECT tenants they're a member of;
--                      can UPDATE tenants where they're owner/admin
--   - user_tenants:    authed user can SELECT their own memberships;
--                      no client writes (managed via service-role edge fns)
--   - tenant_settings: authed user can SELECT settings for tenants they're
--                      a member of; can UPDATE/INSERT for tenants where
--                      they're owner/admin
--
-- Service-role bypasses RLS, so edge functions (portal-auth, marketing-
-- automation, etc.) keep working unchanged.
--
-- Preserved: `public_read_tenants_for_branding` on tenants (anon+auth can
-- read tenants for landing-page branding by slug).
--
-- Apply: SUPABASE_ACCESS_TOKEN=... npx supabase db query --linked \
--          --file supabase/migrations/20260510_tighten_tenant_policies.sql

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- tenants
-- ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS auth_full_tenants ON public.tenants;

CREATE POLICY auth_member_select_tenants ON public.tenants
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_tenants ut
    WHERE ut.user_id = auth.uid() AND ut.tenant_id = tenants.id
  ));

CREATE POLICY auth_owner_update_tenants ON public.tenants
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_tenants ut
    WHERE ut.user_id = auth.uid()
      AND ut.tenant_id = tenants.id
      AND ut.role IN ('owner','admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_tenants ut
    WHERE ut.user_id = auth.uid()
      AND ut.tenant_id = tenants.id
      AND ut.role IN ('owner','admin')
  ));

-- INSERT + DELETE on tenants: service-role only (no policy = denied for
-- the authenticated role). Tenant provisioning happens via edge fn.

-- ──────────────────────────────────────────────────────────────────────
-- user_tenants
-- ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS auth_full_user_tenants ON public.user_tenants;

CREATE POLICY auth_self_select_user_tenants ON public.user_tenants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT/UPDATE/DELETE: service-role only. Membership changes happen via
-- the invite/redemption flow (portal-auth + bm-invite-* edge fns).

-- ──────────────────────────────────────────────────────────────────────
-- tenant_settings
-- ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_settings_auth_all ON public.tenant_settings;
DROP POLICY IF EXISTS tenant_isolation_tenant_settings ON public.tenant_settings;
-- ^ the old isolation policy used current_tenant_id() (JWT/header) which
-- can be spoofed from devtools until Phase 2 Step 5 (Worker subdomain
-- injection) lands. Membership-scoped is the safer interim model.

CREATE POLICY auth_member_select_settings ON public.tenant_settings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_tenants ut
    WHERE ut.user_id = auth.uid() AND ut.tenant_id = tenant_settings.tenant_id
  ));

CREATE POLICY auth_owner_update_settings ON public.tenant_settings
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_tenants ut
    WHERE ut.user_id = auth.uid()
      AND ut.tenant_id = tenant_settings.tenant_id
      AND ut.role IN ('owner','admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_tenants ut
    WHERE ut.user_id = auth.uid()
      AND ut.tenant_id = tenant_settings.tenant_id
      AND ut.role IN ('owner','admin')
  ));

CREATE POLICY auth_owner_insert_settings ON public.tenant_settings
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_tenants ut
    WHERE ut.user_id = auth.uid()
      AND ut.tenant_id = tenant_settings.tenant_id
      AND ut.role IN ('owner','admin')
  ));

-- DELETE: service-role only.

COMMIT;

-- Verification (run after apply):
--   SELECT c.relname, p.polname, p.polcmd
--   FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
--   WHERE c.relname IN ('tenants','user_tenants','tenant_settings')
--   ORDER BY c.relname, p.polname;
--
-- Smoke test (as Doug, authenticated):
--   - SELECT * FROM tenants WHERE id = '<SNT uuid>'    → returns row
--   - UPDATE tenants SET config=config WHERE id = '<SNT uuid>'  → succeeds
--   - SELECT * FROM tenants WHERE id = '<Demo uuid>'   → 0 rows
--   - SELECT * FROM user_tenants                       → only Doug's row
