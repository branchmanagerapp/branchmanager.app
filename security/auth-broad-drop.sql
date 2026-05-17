-- BM SECURITY layer 3: drop 55 over-broad authenticated/public policies (2026-05-16)
-- These ('USING true' / bare auth.role()='authenticated') let ANY logged-in
-- user (incl. the 285 self-signup portal customers) read/write ALL rows.
-- Removing them leaves the correctly-scoped tenant_isolation_* (staff, via
-- JWT tenant claim) and client_self_* (portal customer = own rows) policies.
-- PREREQ: token-hook.sql live + staff have real auth accounts, or staff lose access.
BEGIN;
DROP POLICY IF EXISTS "Auth full access clients" ON public.clients;
DROP POLICY IF EXISTS "auth_delete_clients" ON public.clients;
DROP POLICY IF EXISTS "auth_read" ON public.clients;
DROP POLICY IF EXISTS "auth_read_clients" ON public.clients;
DROP POLICY IF EXISTS "auth_update_clients" ON public.clients;
DROP POLICY IF EXISTS "auth_write" ON public.clients;
DROP POLICY IF EXISTS "auth_write_clients" ON public.clients;
DROP POLICY IF EXISTS "service_write" ON public.competitors;
DROP POLICY IF EXISTS "Authenticated read crew_locations" ON public.crew_locations;
DROP POLICY IF EXISTS "Users update own location" ON public.crew_locations;
DROP POLICY IF EXISTS "Users upsert own location" ON public.crew_locations;
DROP POLICY IF EXISTS "auth_read" ON public.crew_locations;
DROP POLICY IF EXISTS "auth_write" ON public.crew_locations;
DROP POLICY IF EXISTS "Auth full access expenses" ON public.expenses;
DROP POLICY IF EXISTS "Auth full access invoices" ON public.invoices;
DROP POLICY IF EXISTS "auth_read" ON public.invoices;
DROP POLICY IF EXISTS "auth_read_invoices" ON public.invoices;
DROP POLICY IF EXISTS "auth_update_invoices" ON public.invoices;
DROP POLICY IF EXISTS "auth_write" ON public.invoices;
DROP POLICY IF EXISTS "auth_write_invoices" ON public.invoices;
DROP POLICY IF EXISTS "Auth full access jobs" ON public.jobs;
DROP POLICY IF EXISTS "auth_read" ON public.jobs;
DROP POLICY IF EXISTS "auth_read_jobs" ON public.jobs;
DROP POLICY IF EXISTS "auth_update_jobs" ON public.jobs;
DROP POLICY IF EXISTS "auth_write" ON public.jobs;
DROP POLICY IF EXISTS "auth_write_jobs" ON public.jobs;
DROP POLICY IF EXISTS "auth_full_marketing_drafts" ON public.marketing_drafts;
DROP POLICY IF EXISTS "Auth full access payments" ON public.payments;
DROP POLICY IF EXISTS "auth_read" ON public.payments;
DROP POLICY IF EXISTS "auth_write" ON public.payments;
DROP POLICY IF EXISTS "service_all" ON public.portal_sessions;
DROP POLICY IF EXISTS "Auth full access quotes" ON public.quotes;
DROP POLICY IF EXISTS "auth_read" ON public.quotes;
DROP POLICY IF EXISTS "auth_read_quotes" ON public.quotes;
DROP POLICY IF EXISTS "auth_update_quotes" ON public.quotes;
DROP POLICY IF EXISTS "auth_write" ON public.quotes;
DROP POLICY IF EXISTS "auth_write_quotes" ON public.quotes;
DROP POLICY IF EXISTS "Auth full access requests" ON public.requests;
DROP POLICY IF EXISTS "auth_read" ON public.requests;
DROP POLICY IF EXISTS "auth_read_requests" ON public.requests;
DROP POLICY IF EXISTS "auth_update_requests" ON public.requests;
DROP POLICY IF EXISTS "auth_write" ON public.requests;
DROP POLICY IF EXISTS "auth_write_requests" ON public.requests;
DROP POLICY IF EXISTS "Auth full access services" ON public.services;
DROP POLICY IF EXISTS "auth_read" ON public.services;
DROP POLICY IF EXISTS "auth_write" ON public.services;
DROP POLICY IF EXISTS "Auth full access team_members" ON public.team_members;
DROP POLICY IF EXISTS "auth_all_team" ON public.team_members;
DROP POLICY IF EXISTS "auth_read" ON public.team_members;
DROP POLICY IF EXISTS "auth_write" ON public.team_members;
DROP POLICY IF EXISTS "Auth full access time_entries" ON public.time_entries;
DROP POLICY IF EXISTS "auth_all_time" ON public.time_entries;
DROP POLICY IF EXISTS "service_write_vmaint" ON public.vehicle_maintenance;
DROP POLICY IF EXISTS "service_write_vpos" ON public.vehicle_positions;
DROP POLICY IF EXISTS "service_write_vehicles" ON public.vehicles;
COMMIT;
