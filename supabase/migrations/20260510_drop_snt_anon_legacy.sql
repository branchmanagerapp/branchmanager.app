-- 20260510 — DROP legacy snt_anon_* RLS policies.
--
-- Background: every tenant-scoped table has TWO sets of anon-role policies:
--   • snt_anon_{select,insert,update,delete} — hardcoded tenant_id = SNT_UUID
--   • mt_anon_{select,insert,update,delete}  — tenant_id = current_tenant_id()
--
-- The snt_anon_* set is what's leaking: it allows anon role to read every row
-- where tenant_id = SNT's UUID, with no auth required. Pen test on May 10 2026
-- confirmed 536 client rows, all invoices, all communications (SMS bodies),
-- all team_members exfiltrated to anon-key holder.
--
-- These were the original single-tenant policies and were left when multi-
-- tenant rolled out. Removing them moves SNT access exclusively to:
--   • authenticated role with JWT tenant_id claim (signed-in BM users)
--   • service-role from edge functions (public flows already use this path)
--
-- ⚠ APPLY ONLY AFTER verifying Supabase Auth login works for Doug.
-- See SECURITY-PENTEST-MAY10.md for the verification step. Skipping it can
-- log Doug out of his own app.

BEGIN;

-- Tenant-scoped tables: drop snt_anon_*; rely on mt_anon_* + authenticated.
DO $$
DECLARE
  t TEXT;
  p TEXT;
  tables TEXT[] := ARRAY[
    'clients','jobs','invoices','quotes','requests','communications',
    'team_members','vehicles','vehicle_positions','services','materials',
    'time_entries','photos','deals','expenses','team_messages','tasks'
  ];
  policies TEXT[] := ARRAY[
    'snt_anon_select','snt_anon_insert','snt_anon_update','snt_anon_delete'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOREACH p IN ARRAY policies LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
    END LOOP;
  END LOOP;
END
$$;

-- Tenants table: lock down enumeration. Anon was able to list every tenant's
-- id + name + owner_email. Tighten to authenticated users only, scoped to
-- tenants they're a member of via user_tenants.
DROP POLICY IF EXISTS snt_anon_select ON public.tenants;
DROP POLICY IF EXISTS snt_anon_update ON public.tenants;
DROP POLICY IF EXISTS snt_anon_insert ON public.tenants;
DROP POLICY IF EXISTS snt_anon_delete ON public.tenants;
DROP POLICY IF EXISTS mt_anon_select ON public.tenants;

-- Re-state the authenticated read policy (idempotent — drop+recreate).
DROP POLICY IF EXISTS tenants_member_read ON public.tenants;
CREATE POLICY tenants_member_read ON public.tenants
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT ut.tenant_id FROM public.user_tenants ut WHERE ut.user_id = auth.uid()
  ));

COMMIT;

-- Verification (run after applying):
--   curl -H "apikey: ANON_KEY" -H "Authorization: Bearer ANON_KEY" \
--     "https://ltpivkqahvplapyagljt.supabase.co/rest/v1/clients?select=name&limit=3"
--   → Expected: []
--
--   curl -H "apikey: ANON_KEY" -H "Authorization: Bearer ANON_KEY" \
--     "https://ltpivkqahvplapyagljt.supabase.co/rest/v1/tenants?select=id&limit=3"
--   → Expected: []
--
-- Rollback (if anything breaks): the policies that get dropped can be
-- restored from any pre-May-10 snapshot. They were created in the original
-- pre-multi-tenant migrations (look for `CREATE POLICY snt_anon_select` in
-- /supabase/migrations/).
