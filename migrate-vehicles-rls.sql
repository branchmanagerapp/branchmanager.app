-- Branch Manager — vehicles RLS fix (Apr 30, 2026)
--
-- Symptom: Fleet page rendered "No vehicles yet" despite 6 rows in the
-- vehicles table. Cause: the only RLS policy on vehicles was
-- `service_write_vehicles` for service_role. Without an authenticated
-- policy, Doug's logged-in BM (running as `authenticated`) got an empty
-- array on SELECT — RLS silently filtered everything out.
--
-- Fix: tenant-scoped FOR ALL policy on `authenticated`, mirroring the
-- pattern used by tenant_isolation_quotes / clients / jobs etc.
--
-- Run via Supabase SQL Editor or pg_meta. Idempotent — safe to re-run.

DROP POLICY IF EXISTS auth_full_vehicles ON public.vehicles;

CREATE POLICY auth_full_vehicles ON public.vehicles
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING       ((tenant_id = current_tenant_id()) OR (current_tenant_id() IS NULL))
  WITH CHECK  ((tenant_id = current_tenant_id()) OR (current_tenant_id() IS NULL));

-- Force PostgREST to refresh its schema cache so new columns/tables/RLS
-- show up immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
