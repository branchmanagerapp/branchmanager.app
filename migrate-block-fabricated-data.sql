-- migrate-block-fabricated-data.sql (v2)
-- Server-side defense against the seedDemo()-style fabricated-data leak.
-- May 5 2026 — third such incident. Adds a BEFORE-INSERT trigger to clients,
-- jobs, invoices, requests, quotes that REJECTS rows whose (name, phone)
-- matches the known demo seed fingerprint. Real customers with these names
-- are allow-listed by id.
--
-- v2: uses to_jsonb(NEW) for dynamic column access so a single function works
-- across all 5 tables without static-type errors.

CREATE OR REPLACE FUNCTION public.block_fabricated_demo_data()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  j JSONB := to_jsonb(NEW);
  v_name TEXT;
  v_phone TEXT;
  v_id UUID;
  v_client_id UUID;
  v_key TEXT;
  v_real_christina UUID := '3a8282c5-12a9-4a2f-b64d-b6030938dcfb';
BEGIN
  IF TG_TABLE_NAME = 'clients' THEN
    v_name := lower(trim(j->>'name'));
    v_phone := regexp_replace(coalesce(j->>'phone', ''), '\D', '', 'g');
    v_id := nullif(j->>'id', '')::UUID;
    -- For clients we require BOTH name AND phone to match (extra safety so a real
    -- new "George Grant" at a different phone is allowed).
    IF v_name IS NULL OR v_name = '' THEN RETURN NEW; END IF;
    IF length(v_phone) >= 10 THEN
      v_phone := right(v_phone, 10);
    ELSE
      RETURN NEW;
    END IF;
    v_key := v_name || '|' || v_phone;
    IF v_key NOT IN (
      'brian heermance|6462284455',
      'ken phillips|9145550102',
      'cynthia ferral|3477761419',
      'christina eckhart|4237401778',
      'marlene colangelo|9145550199',
      'george grant|9145550177'
    ) THEN RETURN NEW; END IF;
    IF v_id = v_real_christina THEN RETURN NEW; END IF;
  ELSE
    -- jobs/invoices/requests/quotes: child tables. Block if client_name matches
    -- a demo seed name AND client_id is NOT the real Christina. This is broader
    -- than the clients-table check (no phone available) but the trade-off is
    -- worth it: even if Doug ever gets a real customer named Marlene Colangelo
    -- the existing-clients check would have already created her real row, and
    -- the resulting job's client_id would point to her real row → allow-list
    -- would need to be extended. Acceptable.
    v_name := lower(trim(coalesce(j->>'client_name', '')));
    v_client_id := nullif(j->>'client_id', '')::UUID;
    IF v_name NOT IN (
      'brian heermance', 'ken phillips', 'cynthia ferral',
      'christina eckhart', 'marlene colangelo', 'george grant'
    ) THEN RETURN NEW; END IF;
    IF v_client_id = v_real_christina THEN RETURN NEW; END IF;
  END IF;

  RAISE EXCEPTION 'BLOCKED: fabricated-demo-data fingerprint detected. table=% name=% (see migrate-block-fabricated-data.sql)',
    TG_TABLE_NAME, v_name;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_fabricated_clients ON public.clients;
CREATE TRIGGER trg_block_fabricated_clients
  BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.block_fabricated_demo_data();

DROP TRIGGER IF EXISTS trg_block_fabricated_jobs ON public.jobs;
CREATE TRIGGER trg_block_fabricated_jobs
  BEFORE INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.block_fabricated_demo_data();

DROP TRIGGER IF EXISTS trg_block_fabricated_invoices ON public.invoices;
CREATE TRIGGER trg_block_fabricated_invoices
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.block_fabricated_demo_data();

DROP TRIGGER IF EXISTS trg_block_fabricated_requests ON public.requests;
CREATE TRIGGER trg_block_fabricated_requests
  BEFORE INSERT ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.block_fabricated_demo_data();

DROP TRIGGER IF EXISTS trg_block_fabricated_quotes ON public.quotes;
CREATE TRIGGER trg_block_fabricated_quotes
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.block_fabricated_demo_data();
