-- migrate-quote-invoice-number-rpc.sql
-- Fixes field-audit finding #3 (Aug 8 2026): the client calls
-- window.BMNum.alloc('quote'|'invoice') -> RPC next_quote_number /
-- next_invoice_number, but only next_job_number was ever created. For
-- quotes/invoices the RPC 404s, the client falls back to a LOCAL max+1,
-- and two devices offline at once mint the SAME number. The UNIQUE
-- (tenant_id, *_number) constraints (applied 2026-05-09) then make the
-- second save 409 and loop forever in the write-queue.
--
-- This adds the two missing atomic allocators, mirroring next_job_number
-- exactly (see migrate-job-number-unique.sql). SAFE to run more than once.
--
-- APPLY: Supabase Dashboard -> SQL Editor -> paste -> Run
--   (project ltpivkqahvplapyagljt, logged in as info@peekskilltree.com)
-- No client change needed — BMNum.alloc already calls these names.

-- ── QUOTES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quote_number_counters (
  tenant_id  uuid PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);
ALTER TABLE public.quote_number_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_quote_number(p_tenant uuid)
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
    RAISE EXCEPTION 'next_quote_number: tenant required';
  END IF;
  SELECT COALESCE(MAX(quote_number), 0) INTO v_seed
    FROM public.quotes WHERE tenant_id = p_tenant;
  INSERT INTO public.quote_number_counters (tenant_id, last_number)
    VALUES (p_tenant, v_seed)
    ON CONFLICT (tenant_id) DO NOTHING;
  UPDATE public.quote_number_counters
    SET last_number = GREATEST(last_number, v_seed) + 1
    WHERE tenant_id = p_tenant
    RETURNING last_number INTO v_next;
  RETURN v_next;
END;
$$;
REVOKE ALL ON FUNCTION public.next_quote_number(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.next_quote_number(uuid) TO anon, authenticated;

-- ── INVOICES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_number_counters (
  tenant_id  uuid PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);
ALTER TABLE public.invoice_number_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_tenant uuid)
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
    RAISE EXCEPTION 'next_invoice_number: tenant required';
  END IF;
  SELECT COALESCE(MAX(invoice_number), 0) INTO v_seed
    FROM public.invoices WHERE tenant_id = p_tenant;
  INSERT INTO public.invoice_number_counters (tenant_id, last_number)
    VALUES (p_tenant, v_seed)
    ON CONFLICT (tenant_id) DO NOTHING;
  UPDATE public.invoice_number_counters
    SET last_number = GREATEST(last_number, v_seed) + 1
    WHERE tenant_id = p_tenant
    RETURNING last_number INTO v_next;
  RETURN v_next;
END;
$$;
REVOKE ALL ON FUNCTION public.next_invoice_number(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO anon, authenticated;

-- Verify after running:
--   SELECT public.next_quote_number('93af4348-8bba-4045-ac3e-5e71ec1cc8c5');
--   SELECT public.next_invoice_number('93af4348-8bba-4045-ac3e-5e71ec1cc8c5');
-- Each should return one more than the current max for that tenant.
