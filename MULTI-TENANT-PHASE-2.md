# Multi-Tenant Phase 2 — White-Label Roadmap

Owner: Doug · Status: in-progress (started May 2 2026) · Target: ship friend's tenant on BM

## Goal

Convert BM from "hardcoded single tenant (SNT)" to "any number of tree-service companies, each with their own data, branding, services, and integrations, all on one shared deploy."

## Why now

Doug's friend has a tree-service business and wants to use BM. Today's RLS hardcodes `tenant_id = '93af4348-...'` (SNT's UUID); a 2nd tenant would be rejected by every policy. Per Doug's "always proper over quick wins" rule, a fork-and-duplicate workaround creates maintenance debt. Doing it right.

## End state

- One Cloudflare Worker, one Supabase project, one BM bundle.
- N tenants, each addressable by subdomain (`acme.branchmanager.app`) or auth claim.
- Each tenant gets: own data (RLS-isolated), own branding (color + logo), own services list + rates, own Stripe key, own Resend FROM domain, own SMS sender, own custom fields.
- Tenant signup is a self-service flow (later phase) — for now, manual via SQL.
- Existing SNT setup keeps working with zero migration steps.

## Architecture

### Data layer
- New PG function `current_tenant_id()` returns the active tenant_id from:
  1. JWT claim `tenant_id` (when authenticated)
  2. Custom request header `X-Tenant-ID` (when anon, validated against `tenants.id`)
  3. Falls back to NULL → policy denies (no implicit SNT)
- Replace existing `snt_anon_*` policies with `mt_anon_*` policies that use `current_tenant_id()`.
- Keep `snt_anon_*` policies alongside during cutover so single-tenant SNT keeps working.
- New table `tenant_config` (or extended `tenants` table) for per-tenant: brand_color, logo_url, stripe_key_ref, resend_from, sms_from, services_seed.

### Edge functions
- All hardcoded `TENANT_ID = '93af4348-...'` literals removed.
- Each function reads tenant from header (`X-Tenant-ID`) or, for cron'd functions like marketing-automation, iterates over all `tenants.id`.
- Service key writes still need explicit tenant_id stamped.

### Client (BM bundle)
- On boot, resolve tenant from:
  1. URL subdomain (`acme.branchmanager.app` → tenant=acme, looked up by slug)
  2. Stored `bm-tenant-id` localStorage (current behavior, preserved)
  3. Default to last-active tenant for the auth'd user
- Stamp `X-Tenant-ID` header on every fetch to Supabase + edge functions.
- Remove all hardcoded SNT branding from defaults — read from tenant_config.

### Cloudflare Worker
- Match subdomain → look up tenant slug in a KV store (or hardcoded map for now).
- Inject `X-Tenant-ID` request header.
- Tenant-scoped Worker route: `*.branchmanager.app/*` (currently only the apex).

## Migration steps (in order)

1. **SQL: `current_tenant_id()` function + dual-policy RLS**
   - Create the function.
   - Add `mt_anon_*` policies on every tenant-scoped table that allow access where `tenant_id = current_tenant_id()`.
   - Existing `snt_anon_*` policies remain — they short-circuit on the SNT tenant_id literal, so SNT keeps working unchanged.
   - **Test:** anon write to clients with `X-Tenant-ID: 93af4348-...` succeeds (matched by both policies); without header, fails (no current_tenant_id, snt policy still allows because of literal check, mt policy denies).

2. **`tenant_config` table** with per-tenant settings:
   - id (FK to tenants)
   - brand_name, brand_color, logo_url
   - stripe_secret_key_ref (reference, stored in Supabase secrets)
   - resend_from_email
   - sms_from_number
   - services_default (JSONB)

3. **Edge functions: parameterize tenant_id**
   - dialpad-webhook, dialpad-sms-send, marketing-automation, resend-webhook, request-notify, quote-notify, send-email, transition-blast, sendjim-send, stripe-charge, stripe-create-link, stripe-webhook, portal-auth, portal-session, portal-update, ai-chat, bouncie-webhook
   - 17 functions to touch. Each reads `X-Tenant-ID` or iterates per-tenant.

4. **BM client: tenant resolver**
   - `src/db.js → resolveTenantId()` already exists, extend it to also try subdomain lookup.
   - Stamp `X-Tenant-ID` on Supabase client requests via `global.headers` config.
   - Read brand colors / services / etc. from `tenant_config`, fall back to current SNT values.

5. **Cloudflare Worker: subdomain routing**
   - Update `cloudflare-worker/index.js` to extract subdomain from request, resolve to tenant_id, inject header.
   - Add Cloudflare DNS wildcard `*.branchmanager.app` → Worker.
   - Add `friend.branchmanager.app` as the first non-SNT subdomain.

6. **Seed friend's tenant**
   - Insert row in `tenants`: id (uuid), name, slug=friend
   - Insert row in `tenant_config` with friend's branding
   - Optional: bulk-insert sample services / equipment / etc.

7. **Test plan**
   - SNT browser: confirm everything still works (load all 18 nav pages, create a test client, verify it lands with SNT tenant_id).
   - Friend browser at friend.branchmanager.app: confirm separate tenant_id stamps, confirm Friend can't see SNT data, confirm SNT can't see Friend data.

8. **Drop old `snt_anon_*` policies** once dual-policy verification is solid.

## Risks
- RLS policy changes can silently break writes (today's earlier RLS bug story).
- Edge function refactor across 17 functions = surface area for bugs.
- Subdomain DNS + cert provisioning has its own propagation lag.
- BM bundle refactor touches branding + services, easy to miss something.

## Mitigations
- Dual-policy phase ensures SNT keeps working through cutover.
- Each step verified before moving to next.
- Friend's tenant created in production but only their subdomain points there — no SNT user can accidentally hit it.
- Health-audit.mjs extended to verify multi-tenant invariants (no anon write succeeds without X-Tenant-ID).

## Status

- [x] Roadmap written (this doc, May 2 2026)
- [x] Step 1 — SQL function + dual-policy RLS *(May 10 audit: function
      `current_tenant_id()` exists, 26 of 36 tenant-scoped tables have
      `mt_anon_*` policies. The one gap — `onboarding_signatures` missing
      `mt_anon_select` + `mt_anon_insert` — closed via migration
      `supabase/migrations/20260510_mt_phase2_step1_signatures.sql`.
      Other tables without anon policies are intentionally auth-only or
      service-key-only — out of scope for anon multi-tenant RLS.)*
- [/] Step 2 — tenant_config table *(partial: `tenant_settings` table
      exists; audit its schema vs the {brand_color, logo_url, stripe_key_ref,
      resend_from, sms_from, services_default} spec and extend if gaps.)*
- [ ] Step 3 — Edge functions parameterized *(17 functions; some already
      read `X-Tenant-ID` per recent commits — audit each.)*
- [ ] Step 4 — BM client tenant resolver
- [ ] Step 5 — Cloudflare Worker subdomain routing
- [ ] Step 6 — Friend tenant seed
- [ ] Step 7 — Side-by-side validation
- [ ] Step 8 — Drop legacy policies

## v737 audit findings (May 10 2026)

The Phase 1 work landed more thoroughly than the roadmap reflects. Real
remaining gaps in priority order:

1. **`onboarding_signatures` mt_anon parity** — migration drafted, awaits
   review + apply.
2. **`tenant_settings` schema vs the spec** — likely has SOME of the
   fields but may be missing `services_default` / Stripe / SMS-from
   columns. Need a `\d tenant_settings` audit.
3. **Edge function tenant scoping (Step 3)** — biggest remaining work.
   17 functions to walk, each either reading `X-Tenant-ID` (good) or
   hardcoding the SNT uuid (needs fix).
4. **Cloudflare Worker subdomain routing (Step 5)** — enables real
   tenant isolation at the request layer. Until this lands, anon
   clients can spoof `X-Tenant-ID` from devtools and read other
   tenants' data. The mt_anon policies are correct but the security
   model relies on the Worker injecting the header server-side.

Phases 6–8 are downstream of 3 + 5.
