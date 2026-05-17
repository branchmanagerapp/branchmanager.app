-- BM SECURITY layer 2: remove the NULL-bypass in tenant_isolation_* (2026-05-16)
-- Current: (tenant_id = current_tenant_id()) OR (current_tenant_id() IS NULL)
-- The OR-NULL clause means: no tenant claim => sees EVERYTHING. After the token
-- hook ships, staff always have a claim, so the bypass is pure risk. Rewrite to
-- strict equality.
BEGIN;
DROP POLICY IF EXISTS "tenant_isolation_clients" ON public.clients;
CREATE POLICY "tenant_isolation_clients" ON public.clients AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = current_tenant_id()))) WITH CHECK (((tenant_id = current_tenant_id())));
DROP POLICY IF EXISTS "tenant_isolation_communications" ON public.communications;
CREATE POLICY "tenant_isolation_communications" ON public.communications AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = current_tenant_id()))) WITH CHECK (((tenant_id = current_tenant_id())));
DROP POLICY IF EXISTS "tenant_isolation_write" ON public.compliance_documents;
CREATE POLICY "tenant_isolation_write" ON public.compliance_documents AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_tenant_id())) WITH CHECK ((tenant_id = current_tenant_id()));
DROP POLICY IF EXISTS "tenant_isolation_select" ON public.compliance_documents;
CREATE POLICY "tenant_isolation_select" ON public.compliance_documents AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = current_tenant_id()));
DROP POLICY IF EXISTS "tenant_isolation_select" ON public.expenses;
CREATE POLICY "tenant_isolation_select" ON public.expenses AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = current_tenant_id()));
DROP POLICY IF EXISTS "tenant_isolation_expenses" ON public.expenses;
CREATE POLICY "tenant_isolation_expenses" ON public.expenses AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = current_tenant_id()))) WITH CHECK (((tenant_id = current_tenant_id())));
DROP POLICY IF EXISTS "tenant_isolation_write" ON public.expenses;
CREATE POLICY "tenant_isolation_write" ON public.expenses AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_tenant_id())) WITH CHECK ((tenant_id = current_tenant_id()));
DROP POLICY IF EXISTS "tenant_isolation_invoices" ON public.invoices;
CREATE POLICY "tenant_isolation_invoices" ON public.invoices AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = current_tenant_id()))) WITH CHECK (((tenant_id = current_tenant_id())));
DROP POLICY IF EXISTS "tenant_isolation_jobs" ON public.jobs;
CREATE POLICY "tenant_isolation_jobs" ON public.jobs AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = current_tenant_id()))) WITH CHECK (((tenant_id = current_tenant_id())));
DROP POLICY IF EXISTS "tenant_isolation_materials" ON public.materials;
CREATE POLICY "tenant_isolation_materials" ON public.materials AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = current_tenant_id()))) WITH CHECK (((tenant_id = current_tenant_id())));
DROP POLICY IF EXISTS "tenant_isolation_select" ON public.onboarding_uploads;
CREATE POLICY "tenant_isolation_select" ON public.onboarding_uploads AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = current_tenant_id()));
DROP POLICY IF EXISTS "tenant_isolation_write" ON public.onboarding_uploads;
CREATE POLICY "tenant_isolation_write" ON public.onboarding_uploads AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_tenant_id())) WITH CHECK ((tenant_id = current_tenant_id()));
DROP POLICY IF EXISTS "tenant_isolation_payments" ON public.payments;
CREATE POLICY "tenant_isolation_payments" ON public.payments AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = current_tenant_id()))) WITH CHECK (((tenant_id = current_tenant_id())));
DROP POLICY IF EXISTS "tenant_isolation_photos" ON public.photos;
CREATE POLICY "tenant_isolation_photos" ON public.photos AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = current_tenant_id()))) WITH CHECK (((tenant_id = current_tenant_id())));
DROP POLICY IF EXISTS "tenant_isolation_quotes" ON public.quotes;
CREATE POLICY "tenant_isolation_quotes" ON public.quotes AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = current_tenant_id()))) WITH CHECK (((tenant_id = current_tenant_id())));
DROP POLICY IF EXISTS "tenant_isolation_recurring" ON public.recurring;
CREATE POLICY "tenant_isolation_recurring" ON public.recurring AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = current_tenant_id()))) WITH CHECK (((tenant_id = current_tenant_id())));
DROP POLICY IF EXISTS "tenant_isolation_requests" ON public.requests;
CREATE POLICY "tenant_isolation_requests" ON public.requests AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = current_tenant_id()))) WITH CHECK (((tenant_id = current_tenant_id())));
DROP POLICY IF EXISTS "tenant_isolation_services" ON public.services;
CREATE POLICY "tenant_isolation_services" ON public.services AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = current_tenant_id()))) WITH CHECK (((tenant_id = current_tenant_id())));
DROP POLICY IF EXISTS "tenant_isolation_team_members" ON public.team_members;
CREATE POLICY "tenant_isolation_team_members" ON public.team_members AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = current_tenant_id()))) WITH CHECK (((tenant_id = current_tenant_id())));
DROP POLICY IF EXISTS "tenant_isolation_select" ON public.time_entries;
CREATE POLICY "tenant_isolation_select" ON public.time_entries AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = current_tenant_id()));
DROP POLICY IF EXISTS "tenant_isolation_write" ON public.time_entries;
CREATE POLICY "tenant_isolation_write" ON public.time_entries AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_tenant_id())) WITH CHECK ((tenant_id = current_tenant_id()));
DROP POLICY IF EXISTS "tenant_isolation_time_entries" ON public.time_entries;
CREATE POLICY "tenant_isolation_time_entries" ON public.time_entries AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = current_tenant_id()))) WITH CHECK (((tenant_id = current_tenant_id())));
DROP POLICY IF EXISTS "tenant_isolation_visits" ON public.visits;
CREATE POLICY "tenant_isolation_visits" ON public.visits AS PERMISSIVE FOR ALL TO authenticated USING (((tenant_id = current_tenant_id()))) WITH CHECK (((tenant_id = current_tenant_id())));
COMMIT;
