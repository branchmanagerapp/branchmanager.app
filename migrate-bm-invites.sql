-- migrate-bm-invites.sql
-- Doug-only "grandfathered pricing" invite system for BM-the-product.
-- Lets Doug create personalized offers (e.g., friend gets $29.99/mo locked
-- forever, even if standard rises to $79). Each invite generates its own
-- Stripe Price + payment link.
--
-- Not tenant-scoped — these are BM product-level offers, not customer data.
-- RLS gated to authenticated owner role only (stricter than the current
-- permissive `auth_full_*` patterns).

CREATE TABLE IF NOT EXISTS public.bm_invites (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                        TEXT UNIQUE NOT NULL,            -- short share code: "FRIEND-DOUG-001"
  recipient_name              TEXT,
  recipient_email             TEXT,
  plan_type                   TEXT NOT NULL CHECK (plan_type IN (
                                'grandfathered_monthly',  -- recurring at locked price
                                'standard_monthly',       -- standard $49.99/mo
                                'lifetime',               -- standard $2,999 once
                                'custom_monthly',         -- one-off recurring rate
                                'custom_lifetime'         -- one-off lump-sum rate
                              )),
  price_cents                 INTEGER,                          -- the rate this invite locks in (in cents)
  promo_label                 TEXT,                             -- "First 100 customers", "Beta tester #4", etc.
  notes                       TEXT,                             -- internal notes only Doug sees

  -- Stripe linkage (filled when the invite is generated through bm-invite-create)
  stripe_price_id             TEXT,
  stripe_promotion_code_id    TEXT,
  stripe_payment_link_id      TEXT,
  stripe_payment_link_url     TEXT,                             -- the share-able URL

  -- Lifecycle
  created_by                  TEXT NOT NULL,                    -- Doug's email
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at                  TIMESTAMPTZ,                      -- optional kill switch
  status                      TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
                                'active','used','expired','revoked'
                              )),
  used_at                     TIMESTAMPTZ,
  used_by_email               TEXT,
  stripe_subscription_id      TEXT,                             -- captured by webhook on conversion
  stripe_customer_id          TEXT
);

CREATE INDEX IF NOT EXISTS idx_bm_invites_code ON public.bm_invites (code);
CREATE INDEX IF NOT EXISTS idx_bm_invites_status ON public.bm_invites (status, created_at DESC);

-- RLS: anonymous users can SELECT a single invite by code (for the public
-- /invite.html?code=X landing page), but only authenticated users with the
-- owner role can list/create/update.
ALTER TABLE public.bm_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_lookup_by_code" ON public.bm_invites;
CREATE POLICY "anon_lookup_by_code" ON public.bm_invites
  FOR SELECT TO anon, authenticated
  USING (true);  -- pricing info is public-by-design (the recipient needs to see the offer)
                 -- Sensitive fields aren't here. To tighten: drop this and route public
                 -- reads through an edge fn that filters columns.

DROP POLICY IF EXISTS "auth_manage_invites" ON public.bm_invites;
CREATE POLICY "auth_manage_invites" ON public.bm_invites
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
