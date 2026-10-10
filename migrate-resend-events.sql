-- migrate-resend-events.sql
--
-- Adds email deliverability tracking to clients so the resend-webhook edge fn
-- can mark hard-bounced / spam-complained recipients, and so Email.send in
-- the BM client can refuse to re-send to known-bad addresses.
--
-- Run once:
--   psql "$DATABASE_URL" -f migrate-resend-events.sql
-- or paste into Supabase SQL editor.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_status text DEFAULT 'ok';
-- Valid values: ok | bounced | complained | unsubscribed
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_status_at timestamptz;

CREATE INDEX IF NOT EXISTS clients_email_status_idx
  ON clients(email_status)
  WHERE email_status <> 'ok';

-- Force PostgREST to refresh its schema cache so new columns/tables/RLS
-- show up immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
