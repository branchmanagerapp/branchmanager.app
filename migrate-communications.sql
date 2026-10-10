-- Communications log (Dialpad calls, SMS, voicemails)
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/ltpivkqahvplapyagljt/sql

CREATE TABLE IF NOT EXISTS communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('call','sms','voicemail','email')),
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  from_number text,
  to_number text,
  duration_seconds int,
  body text,
  recording_url text,
  status text,
  dialpad_id text UNIQUE,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comms_client ON communications(client_id);
CREATE INDEX IF NOT EXISTS idx_comms_created ON communications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comms_channel ON communications(channel);

-- RLS: authenticated users only
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comms_read" ON communications;
DROP POLICY IF EXISTS "comms_write" ON communications;
CREATE POLICY "comms_read" ON communications FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "comms_write" ON communications FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Force PostgREST to refresh its schema cache so new columns/tables/RLS
-- show up immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
