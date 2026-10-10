-- ============================================================================
-- Branch Manager — RLS Token Gateway Lockdown
--
-- Closes CRITICAL #1 + #2 from Apr 29, 2026 security audit:
--
--   #1: anon could `curl /rest/v1/invoices?select=*` and dump every customer's
--       name/email/phone/address/balance. Same for quotes.
--   #2: anon could `PATCH /rest/v1/quotes?id=eq.<any>` and flip status to
--       'approved' without ever loading approve.html (no token check; the
--       URL token was only validated client-side).
--
-- New design (shipped in v534):
--   - approve.html now POSTs {id, token} to quote-fetch edge fn
--   - approve.html POSTs to quote-update edge fn for approve/changes/decline
--   - pay.html POSTs to invoice-fetch edge fn (with payment_token in URL)
--   - All three edge fns do service-role lookup + constant-time token compare
--
-- This migration:
--   1. Backfills approval_token on any quote without one (32-char hex)
--   2. Adds payment_token column to invoices + backfills
--   3. DROPS the wide-open anon SELECT/UPDATE policies on quotes/invoices
--   4. REVOKEs column-level SELECT on the token columns (defense-in-depth in
--      case some other policy ever opens SELECT in the future)
--
-- SAFE TO RE-RUN. Idempotent.
--
-- ⚠ DEPLOYMENT ORDER ⚠
--   Step 1: Deploy v534 client + 3 new edge fns (BEFORE running this migration).
--           Until edge fns are live, approve.html / pay.html still work via
--           the old anon SELECT path that this migration is about to remove.
--   Step 2: Run THIS migration. Old code-paths break, new code-paths take over.
--   Step 3: Verify with a real customer link or a curl test from a new session.
--
-- The window between v534 client deploy and this migration is the rollover
-- window — both old and new paths work. Once you run this migration, only
-- the new path works. Don't roll back v534 client without rolling back the
-- RLS too.
-- ============================================================================

-- ── Step 1: Backfill approval_token on any quote that lacks one ────────────
-- The column already exists (BM has been writing it lazily for months); this
-- just fills in any rows where it's null/empty. Uses gen_random_uuid()×2
-- joined and stripped to 32 chars for ~128 bits of entropy.
UPDATE quotes
SET approval_token = REPLACE(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE approval_token IS NULL
   OR length(approval_token) < 24;

-- ── Step 2: Add payment_token to invoices + backfill ──────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_token text;

UPDATE invoices
SET payment_token = REPLACE(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE payment_token IS NULL
   OR length(payment_token) < 24;

CREATE INDEX IF NOT EXISTS invoices_payment_token_idx ON invoices(payment_token);
CREATE INDEX IF NOT EXISTS quotes_approval_token_idx ON quotes(approval_token);

-- ── Step 3: Drop wide-open anon SELECT/UPDATE policies ────────────────────
-- These were the actual exploit vectors. Customers will now go through the
-- token-gated edge functions (quote-fetch, quote-update, invoice-fetch).

DROP POLICY IF EXISTS "Anon read quotes" ON quotes;
DROP POLICY IF EXISTS "Anon read quote by token" ON quotes;
DROP POLICY IF EXISTS "Anon update quote status" ON quotes;
DROP POLICY IF EXISTS "Anon update quote by token" ON quotes;

DROP POLICY IF EXISTS "Anon read invoices" ON invoices;
DROP POLICY IF EXISTS "Anon read invoice by token" ON invoices;

-- Note: NO replacement anon policies created. Anon role can no longer
-- SELECT or UPDATE quotes/invoices via PostgREST at all. Customer-facing
-- approve.html / pay.html now go exclusively through the edge functions
-- which use service role.

-- ── Step 4: Defense-in-depth — REVOKE column-level SELECT on tokens ───────
-- Even if some future policy accidentally re-opens SELECT, the token columns
-- themselves cannot be read by the anon role. This stops a token-enumeration
-- attack where someone reads the row to learn the token and then crafts an
-- approval URL. Service role bypasses these grants (intentional).

REVOKE SELECT (approval_token) ON quotes FROM anon, authenticated;
REVOKE SELECT (payment_token) ON invoices FROM anon, authenticated;

-- Allow BM (authenticated owner / crew) to SELECT all OTHER columns on
-- quotes/invoices. The previous "Auth full access" policies handle this;
-- no change needed.

-- ── Step 5: Sanity check — list remaining anon policies ───────────────────
-- After this migration, the only anon-touchable policies should be:
--   services    - "Anon read services"     SELECT (catalog, public OK)
--   requests    - "Anon insert requests"   INSERT status='new' (book.html)
--   settings    - "Anon read settings"     SELECT (form config)
--   clients     - "Anon read clients"      SELECT (used by client.html)
--   storage     - "Public read job photos" + "Anon upload job photos"
--
-- Quotes + invoices should have ZERO anon rows. If you see any, drop them.

SELECT
  schemaname, tablename, policyname,
  roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND 'anon' = ANY(roles)
ORDER BY tablename, policyname;

-- Force PostgREST to refresh its schema cache so new columns/tables/RLS
-- show up immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
