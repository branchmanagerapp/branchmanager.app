# BM Security Fix — Staged Rollout (supervised, NOT autonomous)

The lockdown and the client change **cannot be reversed in the wrong order**.
Apply DB lockdown before the client authenticates → BM goes blank for the
live business mid-operation. This sequence is mandatory.

## Pre-flight (offline, no live change) — DONE / TODO
- [x] `lockdown.sql` / `rollback.sql` — layer 3a: drop 210 `*_anon_*` breach policies + verbatim recreate
- [x] `token-hook.sql` — layer 1: custom_access_token_hook (tenant_id+role into JWT) — WRITTEN, not applied
- [x] `tenant-isolation-fix.sql` — layer 2: strip the `OR current_tenant_id() IS NULL` bypass on 23 policies
- [x] `auth-broad-drop.sql` / `auth-broad-rollback.sql` — layer 3b: drop 55 over-broad
      `USING true`/bare-authenticated policies + verbatim recreate
- [x] `FINDINGS.md` — both breaches, scope, 3-layer shape
- [x] `client-auth-patch.md` — spec for making the Supabase session authoritative
- [ ] BM staff `user_tenants` rows + real Supabase Auth accounts (Doug + crew) — needs your input
- [ ] Implement the client patch in src/auth.js/supabase.js — **deploy-blocked by dead BM PAT**
- [ ] Live application of any SQL — supervised window only

## Order of operations (each step verified before the next)

1. **Build + verify the token hook** on a throwaway test user — confirm a
   signed-in session's JWT contains `tenant_id` + `role`.
2. **Create BM staff auth accounts** with correct tenant_id. Test login →
   real session → `current_tenant_id()` resolves.
3. **Ship the client patch** (needs the BM PAT rotated first). After deploy,
   BM still works (anon policies still present) but now ALSO carries a real
   authenticated session. Verify every BM surface loads while authed.
4. **Tighten `auth_*` policies** (tenant+role scoped) — apply, re-verify all
   surfaces still load for staff, and that a portal-customer session can NOT
   read clients/invoices.
5. **Dry-run lockdown**: in the Supabase SQL editor (Doug present),
   `BEGIN; \i lockdown.sql ...; <verify count=0>; ROLLBACK;` — confirms the
   script runs clean and touches the right rows, changes nothing.
6. **Apply lockdown** for real, low-traffic window, Doug watching:
   run `lockdown.sql`, then immediately smoke-test (see checklist). If ANY
   core surface breaks → run `rollback.sql` (instant) and diagnose.
7. **Verify breach closed**: with only the anon key (no session), confirm
   reads/writes/deletes on clients/invoices/payments/quotes all denied;
   public lead form + portal still work.

## Post-lockdown smoke checklist (must all pass before leaving)
- Dashboard loads with data · Clients list · open a client · Quotes ·
  Invoices · Payments · Schedule/jobs · create a quote · edit an invoice ·
  Pipeline · Calculators · public book.html submits a lead · customer
  portal magic-link login + sees their own invoices only.

## Rollback triggers
Any of: a core list renders empty for staff, save/create fails, portal
breaks. Action: `rollback.sql` (re-opens the hole but restores operation),
then diagnose offline. Rollback restores the *vulnerable* state — it is an
operational stopgap, not a resting state.

## Hard constraints
- Never run lockdown via automation/tooling against prod — SQL editor only,
  Doug present, rollback.sql open in another tab.
- Steps 3 is gated on the BM GitHub PAT (currently dead). Until rotated,
  the fix cannot complete — the breach stays open. This is the critical path.
