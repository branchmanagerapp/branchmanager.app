# BM Security Audit — May 10 2026

## TL;DR

- **Source-code visibility via DevTools is normal and expected** for any web app. The question is what's IN the code. Your bundle is clean of server secrets (no service-role keys, no Stripe secret keys, no Resend keys). The Supabase anon key in the bundle is meant to be public — RLS is the actual gate.
- **One real critical finding**: `bm_invites` table has anon full-access RLS. Includes a tightening migration in `supabase/migrations/20260510_secure_bm_invites.sql` — review then apply.
- Several **latent multi-tenant gaps** that don't matter while you're solo but break the moment a 2nd tenant joins.
- A handful of **lower-priority hygiene items**.

---

## 🔴 CRITICAL

### `bm_invites` is fully anon-accessible

Policy `anon_full_invites` on `public.bm_invites`:
```
USING (true)  CHECK (true)
ROLES: anon, authenticated
```

Anyone with the public Supabase anon key (visible in every BM browser session) can:
- **SELECT** every invite row — exposes `stripe_payment_link_url`, `stripe_customer_id`, `stripe_subscription_id`, `created_by` emails
- **INSERT** fake invite rows
- **UPDATE** existing invites — **biggest risk**: swap `stripe_payment_link_url` to an attacker-controlled Stripe account; when the legit invite link is sent to a new user they land at a spoofed payment page
- **DELETE** invites (deny-service against new tenants signing up)

**Likely exploited via**: open DevTools, copy the Supabase URL + anon key from any BM session, run:
```js
fetch('https://ltpivkqahvplapyagljt.supabase.co/rest/v1/bm_invites?select=*', {
  headers: { 'apikey': '<the anon key from your bundle>' }
}).then(r => r.json()).then(console.log)
```

Migration drafted at `supabase/migrations/20260510_secure_bm_invites.sql` — locks SELECT to anon by token only, removes anon INSERT/UPDATE/DELETE entirely (those become service-role-only operations through edge functions).

---

## 🟠 HIGH (latent — only matters once 2 tenants exist)

These don't impact you today (solo SNT) but become real the moment friend's tenant joins:

### `tenants` table — `auth_full_tenants` policy
Any authenticated user can SELECT/INSERT/UPDATE/DELETE any tenant row. A logged-in user from tenant A could rename tenant B, delete tenant C.

### `user_tenants` (membership join) — `auth_full_user_tenants`
Any authenticated user can add themselves to any tenant by inserting a row. Trivial cross-tenant escalation.

### `tenant_settings` — `tenant_settings_auth_all`
Allows authenticated all-ops on the per-tenant config table (brand colors, Stripe key refs, Resend FROM, SMS sender, etc.). An auth user from tenant A can read tenant B's branding/integration config.

**Fix shape**: all three need policies that scope to `user_tenants.user_id = auth.uid() AND user_tenants.tenant_id = target.tenant_id` instead of `auth.role() = 'authenticated'`. Concretely:
```sql
USING (
  EXISTS (
    SELECT 1 FROM user_tenants
    WHERE user_tenants.user_id = auth.uid()
      AND user_tenants.tenant_id = tenants.id
      AND user_tenants.role IN ('owner','admin')
  )
)
```

### Phase 2 mt_anon header-trust
The new multi-tenant policies trust the `X-Tenant-ID` header verbatim. Anon clients can spoof it from DevTools today and read any tenant's data. Phase 2 Step 5 (Cloudflare Worker subdomain routing) is the fix — Worker resolves subdomain → injects header server-side, anon clients can't override.

---

## 🟡 MEDIUM hygiene

### `bouncie-webhook` fails open without secret
If `BOUNCIE_WEBHOOK_KEY` env var is unset, the function accepts unverified payloads with a `console.warn`. Memory says you renamed the secret in v694 to match — verify in Supabase secrets that `BOUNCIE_WEBHOOK_KEY` is actually set. If empty, anyone with the webhook URL can post arbitrary vehicle telemetry into your DB.

### `DIALPAD_WEBHOOK_SECRET`
Per memory (Apr 30 + May 6), this is set on both Supabase secrets AND in the Dialpad webhook subscription. Code at `dialpad-webhook/index.ts:136` correctly returns 401 if signature required. Good.

### Edge functions all return `Access-Control-Allow-Origin: *`
27 functions surveyed. Universal pattern, mostly OK because each function should validate auth in its own body. The risk is when a function trusts the caller's anon session without checking the user's tenant — e.g. `portal-session` should verify the token is for the requesting client. Audit each function with auth claims separately when you have time; not a today-issue.

### `tenant_isolation_*` policies coexist with `auth_full_*` policies
Multiple postgres policies on the same role are OR'd. A row matches if ANY policy passes. So having both `tenant_isolation_tenant_settings` (proper isolation) AND `tenant_settings_auth_all` (wide-open) means the wide-open one wins. The proper isolation policy is currently dead weight. Drop the `auth_all` ones once the scoped policy is verified.

---

## 🟢 OK / NORMAL

- **No service-role keys in client bundle** — confirmed via grep of `sk_live_`, `service_role`, `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `DIALPAD_API_KEY`, `ghp_`, `sbp_*`. The only `sk_live_` hits are placeholder text in `<input>` fields for Doug to paste his key, never in source as a literal.
- **Stripe publishable key (`pk_...`)** stored in localStorage. That's fine — publishable keys ARE meant to be public.
- **Source-readable via DevTools** — yes, expected, normal. No data exposed beyond the Supabase URL + anon key, both of which are public-by-design.
- **Supabase magic-link auth** — modern, secure, no password storage in BM.
- **No password reuse risk** — BM doesn't store user passwords at all; Supabase Auth handles credential storage.
- **XSS risk in `innerHTML` usages** — sampled and mostly safe: error messages from controlled API responses, status badges from known statuses, etc. A formal CSP would tighten this further but isn't blocking.
- **Stripe secret key**: form field in Settings (`<input type="password">`), sent to backend `stripe-charge` / `stripe-create-link` edge functions, NOT stored in localStorage.
- **Customer portal tokens**: 7-day expiry, scoped to single client per memory v541.

---

## What to do

**Immediate (today)**:
1. Review + apply `supabase/migrations/20260510_secure_bm_invites.sql` to close the bm_invites hole.
2. Verify `BOUNCIE_WEBHOOK_KEY` is set in Supabase secrets — `supabase secrets list --project-ref ltpivkqahvplapyagljt`.

**Before friend's tenant joins (Phase 2 prerequisite)**:
3. Tighten `tenants`, `user_tenants`, `tenant_settings` policies to scope-by-membership.
4. Ship Phase 2 Step 5 (Cloudflare Worker subdomain routing) so anon clients can't spoof `X-Tenant-ID`.

**Whenever**:
5. Drop the now-redundant `*_auth_all` policies once `*_isolation_*` ones are proven.
6. Audit each edge function's auth-validation logic in its handler body.
