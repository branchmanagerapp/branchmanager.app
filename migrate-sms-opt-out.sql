ALTER TABLE clients ADD COLUMN IF NOT EXISTS sms_opt_out boolean default false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sms_opt_out_at timestamptz;
CREATE INDEX IF NOT EXISTS clients_sms_opt_out_idx ON clients(sms_opt_out) WHERE sms_opt_out = true;

-- Force PostgREST to refresh its schema cache so new columns/tables/RLS
-- show up immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
