-- Multi-Tenant Phase 2 — Step 1 closure
--
-- Context: per supabase/MULTI-TENANT-PHASE-2.md, Step 1 asks for
-- current_tenant_id() + dual-policy RLS (snt_anon_* + mt_anon_*) on every
-- tenant-scoped table. May 10 2026 audit:
--   - current_tenant_id() function exists and reads JWT claim → x-tenant-id header
--   - 26 of 36 tenant-scoped tables already have full mt_anon_* coverage
--   - onboarding_signatures has snt_anon_* but is the only table MISSING
--     the matching mt_anon_* policies — closing that gap here
--
-- All other "no mt_anon" tables (bank_*, analytics_events, marketing_drafts,
-- tenant_settings, user_tenants, compliance_documents, etc.) are
-- intentionally auth-only or service-key-only and NOT in scope for anon
-- multi-tenant RLS.
--
-- Apply: SUPABASE_ACCESS_TOKEN=... npx supabase db query --linked \
--          --file supabase/migrations/20260510_mt_phase2_step1_signatures.sql

CREATE POLICY mt_anon_select ON public.onboarding_signatures
  FOR SELECT TO anon
  USING (tenant_id = current_tenant_id());

CREATE POLICY mt_anon_insert ON public.onboarding_signatures
  FOR INSERT TO anon
  WITH CHECK (tenant_id = current_tenant_id());

-- onboarding_signatures has snt_anon_select + snt_anon_insert but no
-- snt_anon_update or snt_anon_delete (signatures are append-only by design).
-- Adding mt_anon_* with the same shape — select + insert only.

-- Verification queries (run after apply):
--   SELECT polname FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
--   WHERE c.relname = 'onboarding_signatures' ORDER BY polname;
--   -- expect: mt_anon_insert, mt_anon_select, snt_anon_insert, snt_anon_select
