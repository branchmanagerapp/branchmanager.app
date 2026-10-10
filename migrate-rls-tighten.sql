-- ============================================================================
-- Branch Manager — RLS Tightening Pass
--
-- Fixes three tables that currently have "TO anon USING (true)" or similarly
-- wide-open policies, leaving them readable by anyone with the anon key:
--
--   1. payments         — anon can read ALL payment records (any tenant). FIXED.
--   2. crew_locations   — anon can read/write ALL GPS pings.            FIXED.
--   3. communications   — already authenticated-only; left alone.
--
-- Safe to re-run (drops policies first).
--
-- NOTE: This is a TIGHTENING pass, not a full tenant-scoped rewrite.
-- Full tenant scoping (so User A can't see Tenant B's data) is in the roadmap
-- as `migrate-rls-tenant-scope.sql` — larger change, staged separately.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- payments — was: TO anon USING (true)  → now: authenticated only
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "payments_anon_read"   ON payments;
DROP POLICY IF EXISTS "payments_anon_insert" ON payments;
DROP POLICY IF EXISTS "payments_anon_update" ON payments;

CREATE POLICY "Auth full access payments" ON payments
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────────
-- crew_locations — was: TO anon for all 3 ops → now: authenticated only
-- (the real crew uses Supabase Auth, so this is safe)
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon read crew_locations"    ON crew_locations;
DROP POLICY IF EXISTS "Anon upsert crew_locations"  ON crew_locations;
DROP POLICY IF EXISTS "Anon update crew_locations"  ON crew_locations;
-- Keep the authenticated policies already in place from migrate-crew-locations.sql

-- ────────────────────────────────────────────────────────────────────────────
-- Verification — list every policy across the app and their status
-- Review the output of this SELECT in Supabase SQL Editor to confirm no
-- "{anon}" rows remain except the 6 explicitly allowed ones from migrate-rls.sql
-- (Anon read quotes / Anon update quote status / Anon read invoices /
--  Anon read services / Anon insert requests / Anon read settings).
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  schemaname, tablename, policyname,
  roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Expected anon rows (safe, by design):
--   quotes          · "Anon read quotes"         · SELECT · status <> 'draft'
--   quotes          · "Anon update quote status" · UPDATE · status IN ('sent','awaiting')
--   invoices        · "Anon read invoices"       · SELECT · status <> 'draft'
--   services        · "Anon read services"       · SELECT · true
--   requests        · "Anon insert requests"     · INSERT · status = 'new'
--   settings        · "Anon read settings"       · SELECT · true
--   clients         · "Anon read clients"        · SELECT · true    (client.html)
--   storage.objects · "Public read job photos"   · SELECT · job-photos bucket
--   storage.objects · "Anon upload job photos"   · INSERT · job-photos bucket
-- ANY OTHER ANON ROW = SECURITY HOLE. Drop it.

-- Force PostgREST to refresh its schema cache so new columns/tables/RLS
-- show up immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
