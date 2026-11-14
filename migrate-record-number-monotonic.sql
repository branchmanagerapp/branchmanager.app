-- Nov 14 2026 (audit fix): record-number allocators never go backwards.
-- Before: last_number = v_seed + 1 (ignored the stored counter), so two devices
-- asking before either saved got the SAME number -> 409 on save. Now the counter
-- is monotonic: GREATEST(stored counter, highest real number) + 1. Still skips
-- the legacy BM-only 2000-series so numbering continues from Jobber's sequence.
CREATE OR REPLACE FUNCTION public.next_quote_number(p_tenant uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_next integer; v_seed integer;
BEGIN
  IF p_tenant IS NULL THEN RAISE EXCEPTION 'tenant required'; END IF;
  SELECT COALESCE(MAX(quote_number),0) INTO v_seed FROM public.quotes WHERE tenant_id=p_tenant AND NOT (quote_number BETWEEN 2000 AND 2999);
  INSERT INTO public.record_number_counters (tenant_id,kind,last_number) VALUES (p_tenant,'quote',v_seed) ON CONFLICT (tenant_id,kind) DO NOTHING;
  UPDATE public.record_number_counters SET last_number = GREATEST(last_number, v_seed) + 1 WHERE tenant_id=p_tenant AND kind='quote' RETURNING last_number INTO v_next;
  RETURN v_next;
END; $$;

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_tenant uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_next integer; v_seed integer;
BEGIN
  IF p_tenant IS NULL THEN RAISE EXCEPTION 'tenant required'; END IF;
  SELECT COALESCE(MAX(invoice_number),0) INTO v_seed FROM public.invoices WHERE tenant_id=p_tenant AND NOT (invoice_number BETWEEN 2000 AND 2999);
  INSERT INTO public.record_number_counters (tenant_id,kind,last_number) VALUES (p_tenant,'invoice',v_seed) ON CONFLICT (tenant_id,kind) DO NOTHING;
  UPDATE public.record_number_counters SET last_number = GREATEST(last_number, v_seed) + 1 WHERE tenant_id=p_tenant AND kind='invoice' RETURNING last_number INTO v_next;
  RETURN v_next;
END; $$;

CREATE OR REPLACE FUNCTION public.next_job_number(p_tenant uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_next integer; v_seed integer;
BEGIN
  IF p_tenant IS NULL THEN RAISE EXCEPTION 'tenant required'; END IF;
  SELECT COALESCE(MAX(job_number),0) INTO v_seed FROM public.jobs WHERE tenant_id=p_tenant AND NOT (job_number BETWEEN 2000 AND 2999);
  INSERT INTO public.record_number_counters (tenant_id,kind,last_number) VALUES (p_tenant,'job',v_seed) ON CONFLICT (tenant_id,kind) DO NOTHING;
  UPDATE public.record_number_counters SET last_number = GREATEST(last_number, v_seed) + 1 WHERE tenant_id=p_tenant AND kind='job' RETURNING last_number INTO v_next;
  RETURN v_next;
END; $$;
