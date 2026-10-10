-- ============================================================================
-- migrate-job-number-unique.sql
-- Audit fix (Jun 14 2026): job_number collisions across devices.
--
-- DB.nextJobNum() minted max(jobNumber)+1 from the LOCAL cache only. Two devices
-- (or two tabs) that hadn't synced each other handed out the SAME job_number.
-- UUID `id` keeps the rows distinct, but job_number is the human-facing ID on
-- invoices / schedule / dispatch, so duplicates are a real data-integrity bug.
--
-- src/db.js already got the cheap half of the fix (cloud-aware nextJobNum via
-- window._bmCloudMax.jobs) which closes the common ONLINE/multi-tab race.
-- This migration is the OFFLINE-safe half: atomic, server-authoritative numbers.
--
-- ⚠️ DO NOT APPLY BLIND. The unique index will make a colliding insert FAIL —
--    so it MUST go out together with the client change that gets its number
--    from next_job_number() (Step 3) instead of computing it locally. Validate
--    with the two-device offline test (phone airplane-mode + laptop both create
--    a job, reconnect) BEFORE relying on it. Until then, leave jobs creating via
--    the cloud-aware local path already shipped.
-- ============================================================================

-- 0. SAFETY: there must be no existing duplicates before adding the unique index.
--    (Live data on 2026-06-14 had ZERO dupes — but re-check per tenant.)
--    SELECT tenant_id, job_number, count(*) FROM public.jobs
--    GROUP BY tenant_id, job_number HAVING count(*) > 1;

-- 1. Per-tenant uniqueness. (Partial index ignores legacy null-tenant rows.)
CREATE UNIQUE INDEX IF NOT EXISTS jobs_tenant_job_number_uniq
  ON public.jobs (tenant_id, job_number)
  WHERE tenant_id IS NOT NULL AND job_number IS NOT NULL;

-- 2. Atomic allocator. One row per tenant holds the last-issued number;
--    next_job_number() bumps and returns it in a single statement, so two
--    concurrent callers can never get the same value. Seeds from the current
--    max so existing numbering continues unbroken.
CREATE TABLE IF NOT EXISTS public.job_number_counters (
  tenant_id  uuid PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 399
);
ALTER TABLE public.job_number_counters ENABLE ROW LEVEL SECURITY;
-- No direct table access for clients; the SECURITY DEFINER function is the API.

CREATE OR REPLACE FUNCTION public.next_job_number(p_tenant uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
  v_seed integer;
BEGIN
  IF p_tenant IS NULL THEN
    RAISE EXCEPTION 'next_job_number: tenant required';
  END IF;
  -- Seed the counter from the live max the first time we see this tenant.
  SELECT COALESCE(MAX(job_number), 399) INTO v_seed
    FROM public.jobs WHERE tenant_id = p_tenant;
  INSERT INTO public.job_number_counters (tenant_id, last_number)
    VALUES (p_tenant, v_seed)
    ON CONFLICT (tenant_id) DO NOTHING;
  UPDATE public.job_number_counters
    SET last_number = GREATEST(last_number, v_seed) + 1
    WHERE tenant_id = p_tenant
    RETURNING last_number INTO v_next;
  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.next_job_number(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.next_job_number(uuid) TO anon, authenticated;

-- 3. CLIENT INTEGRATION (do in the same release as this migration):
--    In src/pages/jobs.js JobsPage.save(), before DB.jobs.create(data), when
--    online, fetch the authoritative number and set it so create() doesn't mint
--    its own:
--
--      let num = null;
--      try {
--        const tid = DB.getTenantId && DB.getTenantId();
--        if (tid && navigator.onLine && SupabaseDB.ready) {
--          const { data: n } = await SupabaseDB.client.rpc('next_job_number', { p_tenant: tid });
--          if (typeof n === 'number') num = n;
--        }
--      } catch (e) { /* offline → fall back to local nextJobNum */ }
--      if (num != null) data.jobNumber = num;
--      DB.jobs.create(data);   // create() keeps its local fallback when num is null
--
--    Offline creates still use the local cloud-aware number; the unique index
--    is the backstop that surfaces the rare offline-collision as a loud,
--    retryable error instead of a silent duplicate.
--
--    Apply the SAME pattern to invoices.invoice_number and quotes.quote_number —
--    they share the identical local-max collision risk.
