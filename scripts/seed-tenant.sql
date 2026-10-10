-- Friend-tenant seed template — Multi-Tenant Phase 2
--
-- Run via: Supabase SQL Editor (or psql) AFTER replacing each <PLACEHOLDER>
-- with the friend's actual values. The cloudflare-worker/index.js
-- TENANT_BY_SUBDOMAIN map ALSO needs the new uuid added so subdomain routing works.
--
-- Order matters:
--   1. Create the tenants row (with config)
--   2. Note the auto-generated id from RETURNING
--   3. Add that id to cloudflare-worker/index.js TENANT_BY_SUBDOMAIN
--   4. Deploy the Worker (`wrangler deploy` from cloudflare-worker/)
--   5. Add DNS for `<slug>.branchmanager.app` (CNAME or proxy through Cloudflare)
--
-- Optional: seed the friend's first user via Supabase Auth UI; they'll see
-- only their own data because the mt_anon_* RLS policies match on
-- current_tenant_id() which is fed by Worker-injected X-Tenant-ID.

INSERT INTO tenants (name, owner_email, plan, slug, config) VALUES (
  '<COMPANY_NAME>',                         -- e.g. 'Friend Tree LLC'
  '<OWNER_EMAIL>',                          -- e.g. 'friend@example.com'
  'beta',
  '<SUBDOMAIN_SLUG>',                       -- lowercase, e.g. 'friend' for friend.branchmanager.app
  jsonb_build_object(
    'company_name',     '<COMPANY_NAME_DISPLAY>',
    'company_phone',    '<COMPANY_PHONE>',           -- e.g. '(555) 123-4567'
    'company_email',    '<COMPANY_EMAIL>',
    'company_website',  '<COMPANY_WEBSITE>',         -- e.g. 'https://friend.com'
    'from_name',        '<EMAIL_FROM_NAME>',         -- e.g. 'Friend Tree'
    'from_email',       '<EMAIL_FROM_EMAIL>',        -- e.g. 'info@friend.com'
    'sms_from_number',  '<DIALPAD_NUMBER_E164>',     -- e.g. '+15551234567'
    'subdomain',        '<SUBDOMAIN_SLUG>',
    'brand_color',      '#1a3c12',                   -- override
    'brand_color_dark', '#0f2c08',
    'logo_url',         '<LOGO_URL>',
    'tax_rate',         8.0,
    'currency',         'USD',
    'service_areas',    jsonb_build_array('<COUNTY1>', '<COUNTY2>'),
    'google_review_url', '<G_REVIEW_URL>',
    'stripe_account_id', '<STRIPE_ACCOUNT_ID>',      -- if friend has connected Stripe; else null
    'bouncie_account',   '<BOUNCIE_ACCT_HASH>',      -- if friend has Bouncie; else null
    'owner_name',        '<OWNER_FULL_NAME>'
  )
) RETURNING id, slug;

-- After running:
--   - Add id to cloudflare-worker/index.js > TENANT_BY_SUBDOMAIN
--     {  '<SUBDOMAIN_SLUG>': '<RETURNED_UUID>'  }
--   - wrangler deploy (or paste into CF Workers dashboard)
--   - Add DNS at Cloudflare:
--       <SUBDOMAIN_SLUG>.branchmanager.app  CNAME  branchmanager.app  (Proxied)

-- ── Phase 2 cleanup (FUTURE) ─────────────────────────────────────────────
-- Once the friend tenant is live and validated end-to-end:
--   1. Drop the SNT-literal `snt_anon_*` policies on every tenant-scoped
--      table (the dual-policy approach is finished its useful life).
--   2. Drop the SNT_TENANT_ID fallback in supabase/functions/_shared/tenant.ts
--      (require X-Tenant-ID header on all callers).
--   3. Drop the SNT fallback in src/supabase.js's resolveTenantHeader().
-- This snapshot of work is intentionally NOT done in the same commit as
-- the friend-onboarding so SNT can't break during cutover.
