-- Create payments table in Supabase
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/ltpivkqahvplapyagljt/sql/new

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payout_date DATE,
  method TEXT,
  status TEXT DEFAULT 'SUCCEEDED',
  source TEXT,
  stripe_payment_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_anon_read" ON payments;
CREATE POLICY "payments_anon_read" ON payments FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "payments_anon_insert" ON payments;
CREATE POLICY "payments_anon_insert" ON payments FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "payments_anon_update" ON payments;
CREATE POLICY "payments_anon_update" ON payments FOR UPDATE TO anon USING (true);

CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_payments_updated_at();

SELECT 'payments table created' AS status, COUNT(*) AS row_count FROM payments;

-- Force PostgREST to refresh its schema cache so new columns/tables/RLS
-- show up immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
