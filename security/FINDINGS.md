# BM Production Security Finding — anon-role policies expose all customer data

**Severity: Critical.** Discovered during authorized pen test, May 2026.

## What

BM's Supabase (`ltpivkqahvplapyagljt`) has RLS enabled on all 44 tables, but
each core table carries `mt_anon_*` and `snt_anon_*` policies that grant the
**`anon` role** full SELECT/INSERT/UPDATE/DELETE:

- `snt_anon_*` — hardcoded `tenant_id = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'`
  (the Second Nature tenant). No auth of any kind required.
- `mt_anon_*` — scoped to `current_tenant_id()`, which falls back to the
  `x-tenant-id` **request header** — set by the client, trivially spoofable.

The anon key is public in the BM client JS (view-source on
peekskilltree.com/branchmanager/). With only that key, **no login**, an
attacker can:

- READ: 537 clients (name/address/phone/email), 350 invoices, 364 payments,
  504 quotes (incl. `approval_token` → quote-approval forgery), 498 requests,
  304 jobs, team_members (incl. pay rates)
- WRITE/DELETE: mass-edit clients/invoices/payments/quotes; **delete clients**

Verified non-destructively (zero-match WHERE clauses; no rows mutated).

## Root cause

BM never adopted Supabase Auth. It runs on the public anon key + an
`X-Tenant-ID` header + a client-side localStorage login gate. The
`*_anon_*` policies were written to make that work — they ARE the hole.
Correct `{authenticated}` policies (`auth_read`, `tenant_isolation_*`)
already exist alongside them and would work once the client authenticates.

## Scope

210 breach policies across 27 tables (full list: lockdown.sql).

**Intentionally public — NOT touched by the fix** (verified safe/minimal):
- `requests."Anon insert requests"` — public lead form (INSERT, CHECK status='new')
- `services.anon_read_services` — public booking catalog
- `tenants.public_read_tenants_for_branding` — logo/name for public pages
- `bm_invites.anon_lookup_invite` — invite acceptance by token
- `analytics_events.analytics_events_anon_insert` — write-only analytics

**Flagged for the supervised session (need token-scoping, not blanket anon):**
- `onboarding_signatures` / `onboarding_uploads` snt_anon_select/insert —
  new-hire e-sign flow legitimately needs anon but currently exposes all
  signatures. Replace blanket anon with token-scoped policy, don't just drop.
- `portal_sessions` anon policies — verify the customer-portal edge fns use
  service_role (bypass RLS); if so these can be dropped safely.

## Second finding — `{authenticated}` policies are also over-broad

Forcing authentication is necessary but NOT sufficient:
- 285 `auth.users` exist — these are **customer-portal magic-link accounts**,
  not BM staff. Only 1 has a `tenant_id` claim. No `custom_access_token_hook`.
- Policies like `clients.auth_read` are `USING (auth.role() = 'authenticated')`
  with **no tenant or role scoping**. So any of the 285 portal customers,
  once logged in, can read every client/invoice/payment.
- `current_tenant_id()` resolves tenant from the JWT `tenant_id` claim — but
  no JWT carries it (no token hook), so tenant isolation for authed users
  currently doesn't function either.

Implication: the real fix has THREE layers, not one —
1. Drop the `*_anon_*` breach policies (lockdown.sql).
2. Add a `custom_access_token_hook` injecting `tenant_id` + `role` into the
   JWT; give BM staff real Supabase Auth accounts (stop the djb2 localStorage
   fallback being a data-access path).
3. Tighten the `auth_*` policies to tenant + role scoped (not bare
   `auth.role()='authenticated'`), so a portal customer ≠ a BM operator.

## Fix shape

Two coupled parts (see ROLLOUT.md for order — they CANNOT be reversed):
1. **Client:** BM establishes a real Supabase Auth session carrying a
   `tenant_id` claim (client-auth-patch.md). Deploy-blocked by the dead
   BM GitHub PAT.
2. **DB:** apply lockdown.sql (drops the 210 breach policies). Instant via
   management token — but ONLY after #1 ships, or BM goes blank for the
   live business.
