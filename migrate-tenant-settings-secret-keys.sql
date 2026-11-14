-- Nov 14 2026 (audit B13): API keys / webhook URLs in tenant_settings were readable by EVERY member of the
-- company (crew included) and copied to their phones by CloudKeys. Secrets are now owner/admin-only.
-- Non-secret settings (company name, tax rate, nav prefs) stay readable by all members.
-- Edge functions use the service role and are unaffected.
DROP POLICY IF EXISTS auth_member_select_settings ON public.tenant_settings;
CREATE POLICY auth_member_select_settings ON public.tenant_settings FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM user_tenants ut WHERE ut.user_id = auth.uid() AND ut.tenant_id = tenant_settings.tenant_id)
  AND (
    tenant_settings.key NOT IN ('bm-dialpad-key','bm-claude-key','bm-gusto-api-key','bm-plantnet-key','bm-socialpilot-webhook')
    OR EXISTS (SELECT 1 FROM user_tenants ut WHERE ut.user_id = auth.uid() AND ut.tenant_id = tenant_settings.tenant_id AND ut.role = ANY (ARRAY['owner','admin']))
  )
);
