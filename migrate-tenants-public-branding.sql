-- ============================================================================
-- migrate-tenants-public-branding.sql
-- Audit fix (Jun 14 2026): the `tenants` table is readable by the ANON key.
--
-- LIVE-VERIFIED LEAK: with only the public anon key and NO login, a SELECT on
-- `tenants` returns ALL platform tenants including `owner_email` and the full
-- `config` blob (addresses, phones, license/cert #s, owner_alert_phones, ...).
-- That's a cross-tenant PII leak — any visitor can enumerate every business on
-- the platform and their owners' contact info.
--
-- WHY IT EXISTS: a broad `public_read` SELECT policy was added so the
-- customer-facing pay/approve/portal/book pages (which load with NO session)
-- can fetch tenant BRANDING by id/slug — see tenant-slug-bootstrap.js. So we
-- must NOT simply revoke anon access (that breaks customers' payment pages).
-- Instead: expose ONLY safe branding fields to anon, hide everything else.
--
-- ⚠️ DO NOT APPLY BLIND. Apply this together with the matching
--    tenant-slug-bootstrap.js change (point the anon-by-id fetch at the RPC),
--    then verify a customer pay/approve page still renders the right logo +
--    brand color before considering it shipped. Re-run the anon RLS probe
--    afterwards to confirm `tenants` returns 0 rows to anon.
-- ============================================================================

-- 1. Remove the broad anon read of the base table.
--    (Name may differ in your DB — list policies first:
--     select policyname from pg_policies where tablename='tenants';)
DROP POLICY IF EXISTS tenants_public_read ON public.tenants;
DROP POLICY IF EXISTS "Public read" ON public.tenants;
DROP POLICY IF EXISTS public_read ON public.tenants;

-- Keep RLS enabled. Authenticated same-tenant read should remain via your
-- existing authed policy (e.g. tenants_select_own). If you don't have one,
-- create it (uncomment, adjust to your tenant-claim source):
-- CREATE POLICY tenants_select_own ON public.tenants
--   FOR SELECT TO authenticated
--   USING (id = (auth.jwt() ->> 'tenant_id')::uuid);

-- 2. A SECURITY DEFINER function that returns ONLY safe, customer-facing
--    branding for one tenant. This is the public surface the unauthenticated
--    pay/approve/portal/book pages call. It deliberately OMITS owner_email,
--    owner_name, owner_alert_phone(s), receptionist/subscription internals, etc.
CREATE OR REPLACE FUNCTION public.tenant_branding(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',   t.id,
    'name', t.name,
    'slug', t.slug,
    'config', jsonb_strip_nulls(jsonb_build_object(
      'company_name',     t.config->>'company_name',
      'legal_name',       t.config->>'legal_name',
      'logo_url',         t.config->>'logo_url',
      'brand_color',      t.config->>'brand_color',
      'brand_color_dark', t.config->>'brand_color_dark',
      'company_phone',    t.config->>'company_phone',
      'company_email',    t.config->>'company_email',
      'company_website',  t.config->>'company_website',
      'address_line1',    t.config->>'address_line1',
      'address_line2',    t.config->>'address_line2',
      'city',             t.config->>'city',
      'state',            t.config->>'state',
      'zip',              t.config->>'zip',
      'service_label',    t.config->>'service_label',
      'license_text',     t.config->>'license_text',
      'currency',         t.config->>'currency',
      'google_review_url',t.config->>'google_review_url'
    ))
  )
  FROM public.tenants t
  WHERE t.id = p_id;
$$;

REVOKE ALL ON FUNCTION public.tenant_branding(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.tenant_branding(uuid) TO anon, authenticated;

-- 3. (Optional) same for slug lookups if any anon page resolves by slug
--    against the table directly. The edge function /functions/v1/tenant-by-slug
--    runs with the service role — AUDIT IT SEPARATELY to confirm it doesn't
--    return owner_email/full config to the browser.
CREATE OR REPLACE FUNCTION public.tenant_branding_by_slug(p_slug text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.tenant_branding(t.id) FROM public.tenants t WHERE t.slug = p_slug;
$$;
REVOKE ALL ON FUNCTION public.tenant_branding_by_slug(text) FROM public;
GRANT EXECUTE ON FUNCTION public.tenant_branding_by_slug(text) TO anon, authenticated;

-- VERIFY AFTER APPLYING (run as anon, e.g. the RLS probe in the audit):
--   GET /rest/v1/tenants?select=*            -> expect 0 rows
--   POST /rest/v1/rpc/tenant_branding {p_id} -> expect safe branding only
