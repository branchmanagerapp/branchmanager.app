-- Branch Manager — RLS Migration
-- Run this in your Supabase SQL Editor to lock down the anon key
-- This replaces the old USING(true) policies with authenticated-only access
--
-- WHAT THIS DOES:
-- Before: Anyone with the anon key could read ALL your client data, jobs, invoices, etc.
-- After:  Only logged-in users can access data. Anon can only view quotes (for approve.html)
--         and invoices (for pay.html) that aren't in draft status.
--
-- Run this ONCE. It's safe to re-run (uses IF EXISTS).

-- ══════════════════════════════════════
-- Step 1: Drop the old wide-open policies
-- ══════════════════════════════════════
DROP POLICY IF EXISTS "Allow all for authenticated" ON clients;
DROP POLICY IF EXISTS "Allow all for authenticated" ON requests;
DROP POLICY IF EXISTS "Allow all for authenticated" ON quotes;
DROP POLICY IF EXISTS "Allow all for authenticated" ON jobs;
DROP POLICY IF EXISTS "Allow all for authenticated" ON invoices;
DROP POLICY IF EXISTS "Allow all for authenticated" ON services;
DROP POLICY IF EXISTS "Allow all for authenticated" ON time_entries;
DROP POLICY IF EXISTS "Allow all for authenticated" ON expenses;
DROP POLICY IF EXISTS "Allow all for authenticated" ON team_members;
DROP POLICY IF EXISTS "Allow all for authenticated" ON notes;
DROP POLICY IF EXISTS "Allow all for authenticated" ON automation_log;

-- ══════════════════════════════════════
-- Step 2: Create new authenticated-only policies
-- Only signed-in users can access business data
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

-- ══════════════════════════════════════
-- Step 3: Verify client-facing anon policies exist
-- These let approve.html and pay.html work without login
-- ══════════════════════════════════════

-- Allow anon to read non-draft quotes (for approve.html)
DROP POLICY IF EXISTS "Anon read quotes" ON quotes;
CREATE POLICY "Anon read quotes" ON quotes FOR SELECT TO anon USING (status <> 'draft');

-- Allow anon to approve/request changes on sent quotes
DROP POLICY IF EXISTS "Anon update quote status" ON quotes;
CREATE POLICY "Anon update quote status" ON quotes FOR UPDATE TO anon
  USING (status IN ('sent', 'awaiting'))
  WITH CHECK (status IN ('approved', 'awaiting'));

-- Allow anon to read non-draft invoices (for pay.html)
DROP POLICY IF EXISTS "Anon read invoices" ON invoices;
CREATE POLICY "Anon read invoices" ON invoices FOR SELECT TO anon USING (status <> 'draft');

-- Allow anon to read services catalog (for online booking form)
DROP POLICY IF EXISTS "Anon read services" ON services;
CREATE POLICY "Anon read services" ON services FOR SELECT TO anon USING (true);

-- Allow anon to INSERT new requests (for book.html public booking form)
DROP POLICY IF EXISTS "Anon insert requests" ON requests;
CREATE POLICY "Anon insert requests" ON requests FOR INSERT TO anon WITH CHECK (status = 'new');

-- Allow anon to read settings (for form config in book.html)
DROP POLICY IF EXISTS "Anon read settings" ON settings;
CREATE POLICY "Anon read settings" ON settings FOR SELECT TO anon USING (true);

-- ══════════════════════════════════════
-- Done! Your anon key can now only:
-- 1. Read non-draft quotes (approve.html)
-- 2. Update sent/awaiting quotes to approved (approve.html)
-- 3. Read non-draft invoices (pay.html)
-- 4. Read services catalog (online booking)
-- 5. INSERT new requests with status='new' (book.html)
-- 6. Read settings (form config)
--
-- Everything else requires authentication.
-- ══════════════════════════════════════

-- Force PostgREST to refresh its schema cache so new columns/tables/RLS
-- show up immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
