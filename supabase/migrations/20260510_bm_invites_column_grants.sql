-- Follow-up to 20260510_secure_bm_invites.sql: the prior migration killed
-- the anon write-fraud vector (swapped payment URL etc.) but anon SELECT
-- still leaks every column via enumeration because USING(true).
--
-- invite.html (public landing for /invite.html?code=XYZ) does need anon
-- SELECT on a NARROW subset of columns — recipient_name, plan_type,
-- price_cents, promo_label, notes, status, expires_at, stripe_payment
-- _link_url, code. Everything else (stripe_customer_id, stripe_subscription
-- _id, stripe_promotion_code_id, used_by_email, created_by) should NOT
-- be readable by anon.
--
-- Approach: revoke anon's column-level grants then re-grant only the
-- safe columns. RLS still applies on top, but column grants are what
-- determine which columns are even visible.
--
-- Apply: SUPABASE_ACCESS_TOKEN=... npx supabase db query --linked \
--          --file supabase/migrations/20260510_bm_invites_column_grants.sql

BEGIN;

-- Revoke any all-column anon grants (Supabase default GRANT ALL on PUBLIC
-- includes the anon role unless tightened).
REVOKE ALL ON public.bm_invites FROM anon;

-- Re-grant SELECT only on columns invite.html actually consumes.
-- (`code` is the lookup key; the rest is the offer payload shown to
-- the recipient.)
GRANT SELECT (
  code,
  recipient_name,
  plan_type,
  price_cents,
  promo_label,
  notes,
  status,
  expires_at,
  stripe_payment_link_url
) ON public.bm_invites TO anon;

-- authenticated keeps full access (RLS still scopes to created_by =
-- auth.email() per the previous migration).
GRANT ALL ON public.bm_invites TO authenticated;

-- service_role bypasses RLS, no change needed.

COMMIT;

-- Verification (run after apply):
--   -- These should succeed (anon, narrow columns):
--   SELECT code, plan_type FROM bm_invites WHERE code = 'XYZ';
--
--   -- These should fail with "permission denied for column":
--   SELECT stripe_customer_id FROM bm_invites;
--   SELECT created_by FROM bm_invites;
--   SELECT used_by_email FROM bm_invites;
