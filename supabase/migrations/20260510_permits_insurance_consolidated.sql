-- Consolidated migration for the permits + insurance + vehicle-docs sweep.
-- Adds three things:
--   1. job_permits table — per-job permit tracking (required → applied → approved → closed)
--   2. vehicle_documents table — per-vehicle reg/inspection/insurance card files
--   3. compliance_documents — additive columns (carrier, policy_number, coverage_limit, notes)
--      so the legacy localStorage bm-ins-policies fields can move to the cloud.
--
-- All tenant-scoped + RLS-enforced. Safe to re-run (IF NOT EXISTS everywhere).

BEGIN;

-- ── 1. job_permits ──────────────────────────────────────────────────────
-- Per-job permit lifecycle:
--   required → applied → submitted → paid → approved → inspected → closed
--   (or)   not_required (Doug confirmed no permit needed)
--   (or)   denied      (jurisdiction rejected)

CREATE TABLE IF NOT EXISTS public.job_permits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id          uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  client_id       uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  jurisdiction    text,            -- snapshot at time-of-application
  permit_number   text,            -- assigned by the jurisdiction once approved
  status          text NOT NULL DEFAULT 'required',
  fee_amount      numeric(10,2),
  fee_paid_at     timestamptz,
  applied_at      timestamptz,
  approved_at     timestamptz,
  expires_at      date,
  inspection_at   timestamptz,
  inspector_name  text,
  contact_phone   text,
  contact_email   text,
  portal_url      text,
  notes           text,
  file_urls       jsonb DEFAULT '[]'::jsonb,  -- attached PDFs (Storage URLs)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_permits_tenant_job_idx ON public.job_permits (tenant_id, job_id);
CREATE INDEX IF NOT EXISTS job_permits_status_idx ON public.job_permits (tenant_id, status);
CREATE INDEX IF NOT EXISTS job_permits_expires_idx ON public.job_permits (tenant_id, expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE public.job_permits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jp_tenant_all ON public.job_permits;
CREATE POLICY jp_tenant_all ON public.job_permits
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_permits TO authenticated;

-- Jobs gets a quick lookup flag — true if a permit row exists for this job.
-- Computed on-write by app; saves a join when rendering the Jobs list.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS permit_required boolean DEFAULT false;

-- ── 2. vehicle_documents ───────────────────────────────────────────────
-- Per-vehicle reg / NY inspection / insurance ID card / lease, etc.
-- File uploads attach via Supabase Storage (bucket: job-photos, prefix
-- vehicle-docs/<vehicle_id>/).

CREATE TABLE IF NOT EXISTS public.vehicle_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id      uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  kind            text NOT NULL,   -- 'registration' | 'inspection' | 'insurance_card' | 'lease' | 'other'
  issued_date     date,
  expires_date    date,
  issuer          text,            -- NY DMV / Travelers / lease holder / etc.
  document_number text,
  file_url        text,            -- public Storage URL (PDF or JPEG)
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_documents_vehicle_idx ON public.vehicle_documents (vehicle_id);
CREATE INDEX IF NOT EXISTS vehicle_documents_expires_idx ON public.vehicle_documents (tenant_id, expires_date)
  WHERE expires_date IS NOT NULL;

ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vd_tenant_all ON public.vehicle_documents;
CREATE POLICY vd_tenant_all ON public.vehicle_documents
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_documents TO authenticated;

-- ── 3. compliance_documents additive columns ──────────────────────────
-- The legacy localStorage bm-ins-policies stored: carrier, policyNum,
-- limit, expiry, notes. Add those to compliance_documents so the
-- Policies tab can move to a single cloud-synced source.
ALTER TABLE public.compliance_documents
  ADD COLUMN IF NOT EXISTS carrier         text,
  ADD COLUMN IF NOT EXISTS policy_number   text,
  ADD COLUMN IF NOT EXISTS coverage_limit  text,  -- text to allow "$2M" / "$1M aggregate"
  ADD COLUMN IF NOT EXISTS notes           text;

COMMIT;

-- Verify after apply:
--   SELECT count(*) FROM public.job_permits;          -- 0 expected on first install
--   SELECT count(*) FROM public.vehicle_documents;    -- 0 expected
--   \d+ public.compliance_documents                   -- new columns visible
