-- v696 (2026-05-09) — UNIQUE constraints on (tenant_id, quote/job/invoice_number)
--
-- WHY: a re-run of scripts/jobber-parity-2026-05-08/apply.py earlier today
-- silently inserted 64 quote dupes + 18 job dupes (3 copies of each Jobber-mirror
-- record before cleanup). Root cause was twofold:
--   1. apply.py's INSERT path had no idempotency guard
--   2. quotes/jobs/invoices had no UNIQUE constraint on (tenant_id, *_number)
-- so the database accepted the dupes silently. This migration fixes #2; v696
-- ships the apply.py fix for #1.
--
-- Pre-flight verified before running this: zero dupes existed on any of the 3
-- (tenant_id, *_number) pairs, and zero nulls in either column. Migration was
-- applied 2026-05-09 ~16:38 ET via Supabase Management API.

alter table quotes
  add constraint quotes_tenant_qnum_unique unique (tenant_id, quote_number);

alter table jobs
  add constraint jobs_tenant_jnum_unique unique (tenant_id, job_number);

alter table invoices
  add constraint invoices_tenant_invnum_unique unique (tenant_id, invoice_number);

notify pgrst, 'reload schema';
