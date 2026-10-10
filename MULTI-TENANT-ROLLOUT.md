# Multi-Tenant Rollout Plan

## Why
We want multiple tree-service businesses to sign up for Branch Manager and only see their own data. Today, there's one shared Supabase with no tenant scoping — whoever has the anon key sees everything. Before inviting beta testers, we need isolation.

## Three phases

### ✅ Phase 1 — Schema (safe, non-breaking)
**What:** Add `tenant_id` column to every business table + create `tenants` + `user_tenants` + provisioning trigger.
**Risk:** Near-zero — everything nullable / additive. Existing rows backfill to Doug's seed tenant.
**How:** Paste `migrate-multi-tenant.sql` PARTS A + C in Supabase SQL editor → Run.
**After:** Existing app continues to work identically. Doug's rows still returned by any query. New signups auto-get a tenant via the trigger.

### ⏳ Phase 2 — App code (not started yet)
**What:** 
- On login, cache `current_tenant_id` in localStorage (fetched via `/rest/v1/user_tenants?user_id=eq.<uid>&select=tenant_id`).
- All client-side INSERT payloads include `tenant_id: currentTenantId`.
- All client-side SELECT queries filter by `tenant_id=eq.<id>` (or let RLS do it in Phase 3).
- Add a Business Name input to the signup form that flows into `raw_user_meta_data.business_name`.

**Estimated effort:** ~3 hrs. Files to touch: `src/db.js`, `src/supabase.js`, `src/auth.js`, any direct-fetch calls.

### 🔒 Phase 3 — RLS enforcement (the lock)
**What:** Run PART B of `migrate-multi-tenant.sql` to turn on strict row-level security.
**Risk:** HIGH if Phase 2 incomplete. Will block any INSERT without `tenant_id` and hide cross-tenant rows.
**Pre-flight checklist before running:**
- [ ] Every `DB.*.create` call in the app includes `tenant_id`
- [ ] Tested signup → new user creates new tenant → sees empty dashboard (not Doug's data)
- [ ] Tested Doug's existing login → still sees all his data
- [ ] Backup taken (`pg_dump` or Supabase point-in-time-restore handy)
- [ ] Tested on staging Supabase project first

## What's in each SQL part

| Part | Contents | Safe to run? |
|------|----------|--------------|
| **A** | Add columns, create tenants + user_tenants tables, backfill existing rows, helper function | ✅ Yes — additive only |
| **B** | Enable RLS, create `tenant_isolation_*` policies on every table | ⚠️ Only after Phase 2 |
| **C** | `handle_new_user` trigger — auto-creates tenant on signup | ✅ Yes — only fires on new signups |

## Beta invite flow (what Phase 2 unlocks)
1. Doug sends a tester a link to `/branchmanager/signup.html`
2. Tester enters email + password + business name
3. Supabase auth creates user → trigger creates tenant → user_tenants row links them
4. Tester logs in → sees an empty dashboard (their tenant)
5. Tester uses the app normally, their data is tagged with their `tenant_id`
6. Once RLS is on, tester physically cannot see Doug's or anyone else's data

## TL;DR for Doug

- **Run now (safe):** `migrate-multi-tenant.sql` parts A + C in Supabase SQL editor
- **Defer (needs code):** Part B — don't uncomment until I've shipped Phase 2 code changes
- **Don't invite testers** until Phase 3 lands
