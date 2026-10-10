-- Branch Manager — RLS audit fixes (Apr 30, 2026)
--
-- Followup to migrate-vehicles-rls.sql. Audit found 5 more tables that BM
-- queries but had no `authenticated` policy — anon/authenticated reads
-- silently returned empty arrays:
--
--   - vehicle_maintenance — only service_role
--   - vehicle_positions   — only service_role  (BM Fleet > Detail > history)
--   - team_messages       — no policies at all (teamchat.js silent when team exists)
--   - detected_locations  — no policies at all (passive-tracker dwell detection)
--   - location_pings      — no policies at all (passive-tracker raw GPS)
--
-- All five get tenant-scoped FOR ALL policies on `authenticated`, mirroring
-- the pattern used by quotes/clients/jobs. vehicle_positions joins through
-- vehicles since it lacks its own tenant_id column.
--
-- Idempotent — safe to re-run.

DROP POLICY IF EXISTS auth_tenant_vmaint ON public.vehicle_maintenance;
CREATE POLICY auth_tenant_vmaint ON public.vehicle_maintenance
  AS PERMISSIVE FOR ALL TO authenticated
  USING       ((tenant_id = current_tenant_id()) OR (current_tenant_id() IS NULL))
  WITH CHECK  ((tenant_id = current_tenant_id()) OR (current_tenant_id() IS NULL));

DROP POLICY IF EXISTS auth_tenant_vpos ON public.vehicle_positions;
CREATE POLICY auth_tenant_vpos ON public.vehicle_positions
  AS PERMISSIVE FOR ALL TO authenticated
  USING       (vehicle_id IN (SELECT id FROM vehicles WHERE tenant_id = current_tenant_id())
               OR current_tenant_id() IS NULL)
  WITH CHECK  (vehicle_id IN (SELECT id FROM vehicles WHERE tenant_id = current_tenant_id())
               OR current_tenant_id() IS NULL);

DROP POLICY IF EXISTS auth_tenant_team_messages ON public.team_messages;
CREATE POLICY auth_tenant_team_messages ON public.team_messages
  AS PERMISSIVE FOR ALL TO authenticated
  USING       ((tenant_id = current_tenant_id()) OR (current_tenant_id() IS NULL))
  WITH CHECK  ((tenant_id = current_tenant_id()) OR (current_tenant_id() IS NULL));

DROP POLICY IF EXISTS auth_tenant_detected_locations ON public.detected_locations;
CREATE POLICY auth_tenant_detected_locations ON public.detected_locations
  AS PERMISSIVE FOR ALL TO authenticated
  USING       ((tenant_id = current_tenant_id()) OR (current_tenant_id() IS NULL))
  WITH CHECK  ((tenant_id = current_tenant_id()) OR (current_tenant_id() IS NULL));

DROP POLICY IF EXISTS auth_tenant_location_pings ON public.location_pings;
CREATE POLICY auth_tenant_location_pings ON public.location_pings
  AS PERMISSIVE FOR ALL TO authenticated
  USING       ((tenant_id = current_tenant_id()) OR (current_tenant_id() IS NULL))
  WITH CHECK  ((tenant_id = current_tenant_id()) OR (current_tenant_id() IS NULL));

-- Force PostgREST to refresh its schema cache so new policies show up
-- immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
