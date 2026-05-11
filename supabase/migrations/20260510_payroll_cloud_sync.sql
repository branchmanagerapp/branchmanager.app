-- v743: cloud-sync payroll state so iPhone + desktop see the same
-- approvals + employee rates + photos. Until now, payroll approvals
-- and crew rates lived in localStorage only — Doug's iPhone "approved"
-- state never reached his laptop and vice versa.
--
-- Changes:
--   1. team_members gets: rate, photo_url, hire_date, employment_type, notes
--   2. New table: payroll_approvals (per-day + per-week approval state)
--   3. New table: payroll_runs (record of completed/paid payroll batches)
--
-- All new objects RLS-scoped to tenant_id via current_tenant_id().

BEGIN;

-- 1. team_members: hire date, rate, photo, type, notes
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS rate            numeric(10,2),
  ADD COLUMN IF NOT EXISTS photo_url       text,
  ADD COLUMN IF NOT EXISTS hire_date       date,
  ADD COLUMN IF NOT EXISTS employment_type text,  -- 'w2' | '1099' | 'salary'
  ADD COLUMN IF NOT EXISTS notes           text;

-- 2. payroll_approvals — one row per employee per week, plus optional
-- day-level rows. employee_name is used (not FK) because legacy
-- time_entries store `user` as a name string; matching by name keeps
-- the data path simple.
CREATE TABLE IF NOT EXISTS public.payroll_approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_name text NOT NULL,
  week_start    date NOT NULL,
  day           date,                       -- null = whole-week approval
  status        text NOT NULL DEFAULT 'approved',  -- approved | pending | unapproved
  edited_after  boolean NOT NULL DEFAULT false,    -- flagged when entries change post-approval
  approved_by   text,
  approved_at   timestamptz NOT NULL DEFAULT now(),
  notes         text,
  UNIQUE (tenant_id, employee_name, week_start, day)
);

CREATE INDEX IF NOT EXISTS payroll_approvals_tenant_week_idx
  ON public.payroll_approvals (tenant_id, week_start DESC);

ALTER TABLE public.payroll_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pa_tenant_all ON public.payroll_approvals;
CREATE POLICY pa_tenant_all ON public.payroll_approvals
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_approvals TO authenticated;

-- 3. payroll_runs — when Doug "marks paid" or exports an ACH batch,
-- we record the run so the Payroll page can show what's been paid out.
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  week_start    date NOT NULL,
  week_end      date NOT NULL,
  status        text NOT NULL DEFAULT 'exported',  -- exported | paid | reversed
  total_hours   numeric(10,2),
  total_ot      numeric(10,2),
  total_gross   numeric(12,2),
  employee_count int,
  exported_at   timestamptz,
  paid_at       timestamptz,
  paid_by       text,
  method        text,                              -- 'ach_csv' | 'manual' | 'gusto' | 'check'
  batch_payload jsonb,                             -- per-employee rows: { name, hours, ot, rate, gross }
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_runs_tenant_week_idx
  ON public.payroll_runs (tenant_id, week_start DESC);

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pr_tenant_all ON public.payroll_runs;
CREATE POLICY pr_tenant_all ON public.payroll_runs
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO authenticated;

COMMIT;
