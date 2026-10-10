-- Branch Manager — Database Schema
-- Run this in Supabase SQL Editor to create all tables

-- ══════════════════════════════════════
-- CLIENTS
-- ══════════════════════════════════════
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  status TEXT DEFAULT 'lead' CHECK (status IN ('lead', 'active', 'inactive')),
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════
-- REQUESTS
-- ══════════════════════════════════════
CREATE TABLE requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT,
  property TEXT,
  phone TEXT,
  email TEXT,
  source TEXT, -- Google Search, Facebook, Nextdoor, Friend, etc.
  notes TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'assessment_scheduled', 'assessment_complete', 'converted', 'archived')),
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════
-- QUOTES
-- ══════════════════════════════════════
CREATE TABLE quotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_number SERIAL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  property TEXT,
  description TEXT,
  line_items JSONB DEFAULT '[]',
  total DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'awaiting', 'approved', 'declined', 'converted')),
  job_id UUID,
  map_data JSONB, -- equipment placement markers
  expires_at DATE,
  deposit_required BOOLEAN DEFAULT false,
  deposit_due DECIMAL(10,2) DEFAULT 0,
  deposit_paid BOOLEAN DEFAULT false,
  approved_at TIMESTAMPTZ,
  client_changes TEXT, -- requested changes from client on approve page
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- If table already exists, add columns with:
-- ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_email TEXT;
-- ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_phone TEXT;
-- ALTER TABLE quotes ADD COLUMN IF NOT EXISTS expires_at DATE;
-- ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_required BOOLEAN DEFAULT false;
-- ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_due DECIMAL(10,2) DEFAULT 0;
-- ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN DEFAULT false;
-- ALTER TABLE quotes ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
-- ALTER TABLE quotes ADD COLUMN IF NOT EXISTS client_changes TEXT;

-- ══════════════════════════════════════
-- JOBS
-- ══════════════════════════════════════
CREATE TABLE jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_number SERIAL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  property TEXT,
  description TEXT,
  line_items JSONB DEFAULT '[]',
  total DECIMAL(10,2) DEFAULT 0,
  scheduled_date DATE,
  start_time TIME,
  end_time TIME,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'late', 'cancelled')),
  crew TEXT[] DEFAULT '{}',
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  invoice_id TEXT, -- UUID or 'legacy' for pre-migration Jobber invoices
  completed_date DATE,
  notes TEXT,
  photos TEXT[] DEFAULT '{}',
  map_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- If table already exists, add columns with:
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_email TEXT;
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_phone TEXT;
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS invoice_id TEXT;
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_date DATE;

-- ══════════════════════════════════════
-- INVOICES
-- ══════════════════════════════════════
CREATE TABLE invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number SERIAL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  subject TEXT DEFAULT 'For Services Rendered',
  line_items JSONB DEFAULT '[]',
  total DECIMAL(10,2) DEFAULT 0,
  balance DECIMAL(10,2) DEFAULT 0,
  amount_paid DECIMAL(10,2) DEFAULT 0,
  issued_date DATE,
  due_date DATE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'cancelled')),
  paid_date TIMESTAMPTZ,
  payment_method TEXT,
  stripe_payment_url TEXT,
  payment_link_sent TIMESTAMPTZ,
  payment_link_email TEXT,
  sent_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- If table already exists, add columns with:
-- ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_email TEXT;
-- ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_phone TEXT;
-- ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2) DEFAULT 0;
-- ALTER TABLE invoices ADD COLUMN IF NOT EXISTS issued_date DATE;
-- ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_payment_url TEXT;
-- ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_link_sent TIMESTAMPTZ;
-- ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_link_email TEXT;
-- ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
-- ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
-- ALTER TABLE invoices ADD CONSTRAINT invoices_status_check CHECK (status IN ('draft','sent','viewed','partial','paid','overdue','cancelled'));

-- ══════════════════════════════════════
-- SERVICES CATALOG
-- ══════════════════════════════════════
CREATE TABLE services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'service' CHECK (type IN ('service', 'product')),
  default_rate DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════
-- TIME ENTRIES (employee clock in/out)
-- ══════════════════════════════════════
CREATE TABLE time_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_name TEXT,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  date DATE DEFAULT CURRENT_DATE,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  hours DECIMAL(5,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════
-- USERS / TEAM
-- ══════════════════════════════════════
CREATE TABLE team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_id UUID, -- links to Supabase auth.users
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'crew' CHECK (role IN ('owner', 'crew_lead', 'crew')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════
-- NOTES & ATTACHMENTS
-- ══════════════════════════════════════
CREATE TABLE notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  record_type TEXT NOT NULL, -- 'client', 'request', 'job', 'quote', 'invoice'
  record_id UUID NOT NULL,
  content TEXT,
  photos TEXT[] DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════
-- AUTOMATIONS LOG
-- ══════════════════════════════════════
CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date TIMESTAMPTZ DEFAULT now(),
  amount NUMERIC(10,2) DEFAULT 0,
  category TEXT,
  description TEXT,
  vendor TEXT,
  job TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE automation_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL, -- 'quote_followup', 'invoice_followup', 'visit_reminder', 'review_request'
  record_id UUID,
  recipient TEXT,
  channel TEXT, -- 'email', 'sms'
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_requests_status ON requests(status);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_scheduled ON jobs(scheduled_date);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_time_entries_date ON time_entries(date);
CREATE INDEX idx_notes_record ON notes(record_type, record_id);
CREATE INDEX idx_expenses_date ON expenses(date);

-- ══════════════════════════════════════
-- ROW LEVEL SECURITY (enable later for multi-tenant)
-- ══════════════════════════════════════
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════
-- AUTHENTICATED USER POLICIES
-- Only logged-in users (not anon) can access business data
-- ══════════════════════════════════════
CREATE POLICY "Auth full access clients" ON clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access requests" ON requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access quotes" ON quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access jobs" ON jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access invoices" ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access services" ON services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access time_entries" ON time_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access expenses" ON expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access team_members" ON team_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access notes" ON notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth full access automation_log" ON automation_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- IMPORTANT: The anon key can NO LONGER read clients, jobs, requests, expenses,
-- team members, time entries, notes, or automation logs.
-- Only the specific client-facing policies below grant anon access to quotes/invoices.

-- ══════════════════════════════════════
-- CLIENT-FACING PAGE POLICIES (anon access)
-- Run these in Supabase SQL Editor to enable approve.html and pay.html
-- ══════════════════════════════════════

-- Allow anonymous users to read non-draft quotes (for approve.html)
CREATE POLICY "Anon read quotes" ON quotes FOR SELECT TO anon USING (status <> 'draft');
-- Allow anonymous users to approve or request changes on sent quotes
CREATE POLICY "Anon update quote status" ON quotes FOR UPDATE TO anon
  USING (status IN ('sent', 'awaiting'))
  WITH CHECK (status IN ('approved', 'awaiting'));

-- Allow anonymous users to read non-draft invoices (for pay.html)
CREATE POLICY "Anon read invoices" ON invoices FOR SELECT TO anon USING (status <> 'draft');

-- ══════════════════════════════════════
-- SEED SERVICES CATALOG
-- ══════════════════════════════════════
INSERT INTO services (name, description, type) VALUES
  ('Tree Removal', 'Schedule an estimate for a tree removal', 'service'),
  ('Tree Pruning', 'General pruning to remove dead, damaged or crossing branches', 'service'),
  ('Stump Removal', 'Stump grinding service', 'service'),
  ('Bucket Truck', 'Per hour rate with operator. 2 hour minimum.', 'service'),
  ('Cabling', '', 'service'),
  ('Land Clearing', '', 'service'),
  ('Snow Removal', 'Snow removal services for residential or corporate locations', 'service'),
  ('Spring Clean Up', 'Clean out leaves, shape ornamentals. Remove material off site.', 'service'),
  ('Gutter Clean Out', '', 'service'),
  ('Haul Debris', 'Haul debris from site', 'service'),
  ('Ice Dam Removal', 'Clearing snow and ice from impacted roof area', 'service'),
  ('Labor', 'Hourly labor charge', 'service'),
  ('Free Estimate', 'Please fill out the information form', 'service'),
  ('Arborist Letter', 'Letter from certified arborist', 'service'),
  ('Cat Rescue', 'Cat rescue', 'service'),
  ('Firewood Bundle', 'Firewood', 'product'),
  ('Firewood Cord', 'Firewood cord delivered within 10 miles', 'product'),
  ('Firewood Splitting', 'Split your logs to firewood on site', 'service'),
  ('Firewood Stacking', 'Stacking of firewood to customers desired location', 'service'),
  ('Free Woodchips', 'Free Woodchips $50 delivery fee', 'product'),
  ('Chipping Brush', '', 'service');
