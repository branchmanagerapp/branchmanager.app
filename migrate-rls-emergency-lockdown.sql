-- ============================================================================
-- Branch Manager — RLS EMERGENCY LOCKDOWN (Apr 29, 2026 late evening)
--
-- The previous migrate-rls-token-gateway.sql dropped the policies named
-- "Anon read quotes" / "Anon read invoices" but did NOT touch the duplicate
-- anon_all_* policies that exist under different names. Verification SELECT
-- after the first migration revealed:
--
--   anon_all_quotes      ALL    USING(true) WITH CHECK(true)   ← still wide open
--   anon_all_invoices    ALL    USING(true) WITH CHECK(true)   ← still wide open
--   anon_all_clients     ALL    USING(true) WITH CHECK(true)   ← PII massacre
--   anon_all_jobs        ALL    USING(true) WITH CHECK(true)
--   anon_all_team        ALL    USING(true) WITH CHECK(true)   ← employee data
--   anon_all_time        ALL    USING(true) WITH CHECK(true)   ← payroll
--   anon_read_tenants    SELECT USING(true)                    ← stripe key in config!
--   anon_read_requests   SELECT USING(true)
--   anon_select_communications SELECT USING(true)              ← every SMS/call log
--   anon_read_user_tenants SELECT USING(true)
--   ...plus competitors, vehicles*, location_pings, detected_locations,
--      team_messages, vehicle_positions
--
-- These were never in checked-in migration files. Ran directly in SQL editor
-- at some point.
--
-- This migration drops every anon policy that isn't intentionally there for
-- public customer-facing flows (book.html / approve.html via the new edge
-- fns / pay.html via the new edge fns). After this runs, the only legit
-- anon policies remaining should be:
--
--   services    "anon_read_services"        SELECT TRUE          (catalog)
--   requests    "Anon insert requests"      INSERT status='new'  (book.html)
--
-- approve.html and pay.html no longer need any anon policy at all — they go
-- through quote-fetch / quote-update / invoice-fetch which use service-role.
--
-- Tenants config: dropped anon read entirely. tenants.config.stripe_secret_key
-- was readable by anon-key holders. Stripe redirect-to-attacker territory.
-- ============================================================================

-- ── quotes / invoices — drop the duplicate ALL/true policies ──────────────
DROP POLICY IF EXISTS "anon_all_quotes"             ON quotes;
DROP POLICY IF EXISTS "anon_all_invoices"           ON invoices;
DROP POLICY IF EXISTS "anon_read_invoices_nondraft" ON invoices;

-- ── clients — anon_all_clients was ALL/true. Catastrophic. Drop. ──────────
DROP POLICY IF EXISTS "anon_all_clients"            ON clients;
DROP POLICY IF EXISTS "Anon read clients"           ON clients;

-- ── jobs / team_members / time_entries — payroll + employee data ──────────
DROP POLICY IF EXISTS "anon_all_jobs"               ON jobs;
DROP POLICY IF EXISTS "anon_all_team"               ON team_members;
DROP POLICY IF EXISTS "anon_all_time"               ON time_entries;

-- ── tenants — config column carries stripe_secret_key. Drop. ──────────────
DROP POLICY IF EXISTS "anon_read_tenants"           ON tenants;
DROP POLICY IF EXISTS "anon_read_user_tenants"      ON user_tenants;

-- ── communications — every call/SMS/email log was anon-readable ──────────
DROP POLICY IF EXISTS "anon_select_communications"  ON communications;
DROP POLICY IF EXISTS "anon_insert_communications"  ON communications;

-- ── requests — anon SELECT removed; only INSERT (for book.html) remains ──
DROP POLICY IF EXISTS "anon_read_requests"          ON requests;

-- ── competitors / vehicles* / location_pings / team_messages — biz data ──
DROP POLICY IF EXISTS "anon_read"                   ON competitors;
DROP POLICY IF EXISTS "anon_read_vehicles"          ON vehicles;
DROP POLICY IF EXISTS "anon_read_vpos"              ON vehicle_positions;
DROP POLICY IF EXISTS "anon_read_vmaint"            ON vehicle_maintenance;
DROP POLICY IF EXISTS "tenant_read_pings"           ON location_pings;
DROP POLICY IF EXISTS "tenant_write_pings"          ON location_pings;
DROP POLICY IF EXISTS "tenant_read_dloc"            ON detected_locations;
DROP POLICY IF EXISTS "tenant_write_dloc"           ON detected_locations;
DROP POLICY IF EXISTS "tenant_update_dloc"          ON detected_locations;
DROP POLICY IF EXISTS "tenant_read_chat"            ON team_messages;
DROP POLICY IF EXISTS "tenant_write_chat"           ON team_messages;
DROP POLICY IF EXISTS "tenant_update_chat"          ON team_messages;

-- These tenant_* policies were misnamed — they say "tenant" but apply to
-- anon role. Dropped. Authenticated-only access to these tables already
-- exists via the "Auth full access" policies; no anon need.

-- ── Verification: list every remaining anon-touchable policy ─────────────
-- After this, expected:
--   services   "anon_read_services"     SELECT TRUE
--   requests   "Anon insert requests"   INSERT status='new'
--   storage.objects (job-photos bucket) — outside this query
SELECT
  schemaname, tablename, policyname,
  roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND 'anon' = ANY(roles)
ORDER BY tablename, policyname;

-- Force PostgREST to refresh its schema cache so new columns/tables/RLS
-- show up immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
