-- ═══════════════════════════════════════════════════════════════════════════
-- Provision Sarah's dedicated agent user and bind it to the Second Nature tenant.
--
-- Sarah's auth user ALREADY EXISTS — it was created via the public signup
-- endpoint with the anon key (id 616359e1-e323-4fa6-9618-747a97fce2f4). Signup
-- left her (a) UNCONFIRMED, so she can't sign in yet, and (b) in a junk tenant,
-- because the on_auth_user_created trigger (migrate-multi-tenant.sql, PART C)
-- auto-creates a NEW tenant for every new auth user.
--
-- This ONE script finishes provisioning, all with the elevated SQL-editor role:
--   1. Confirms her email (so she can sign in).
--   2. Repoints her membership to the Second Nature tenant.
--   3. Deletes the junk tenant the trigger created.
--   4. Clears the orphan "RLS probe" row from the earlier RLS verification.
--
-- Run it in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/ltpivkqahvplapyagljt/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  sarah_uid   uuid;
  snt_tid     uuid;
  junk_tids   uuid[];
BEGIN
  -- Resolve Sarah's auth user (must exist from STEP 1).
  SELECT id INTO sarah_uid FROM auth.users WHERE email = 'sarah@peekskilltree.com' LIMIT 1;
  IF sarah_uid IS NULL THEN
    RAISE EXCEPTION 'sarah@peekskilltree.com not found — was signup run?';
  END IF;

  -- 1. Confirm her email so she can sign in (signup left her unconfirmed).
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, now())
  WHERE id = sarah_uid;

  -- Resolve the Second Nature tenant (seeded as info@peekskilltree.com).
  SELECT id INTO snt_tid FROM tenants WHERE owner_email = 'info@peekskilltree.com' LIMIT 1;
  IF snt_tid IS NULL THEN
    RAISE EXCEPTION 'Second Nature tenant not found (owner_email info@peekskilltree.com).';
  END IF;

  -- Collect any tenants the signup trigger auto-created and mapped to Sarah,
  -- EXCEPT Second Nature, so we can drop them after repointing.
  SELECT array_agg(ut.tenant_id) INTO junk_tids
  FROM user_tenants ut
  WHERE ut.user_id = sarah_uid AND ut.tenant_id <> snt_tid;

  -- Repoint: Sarah belongs to Second Nature only. role 'viewer' signals
  -- least-privilege intent (today RLS gates by tenant, not role; see NOTE below).
  DELETE FROM user_tenants WHERE user_id = sarah_uid;
  INSERT INTO user_tenants (user_id, tenant_id, role)
  VALUES (sarah_uid, snt_tid, 'viewer')
  ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role;

  -- Clean up the junk tenant(s) the trigger created for Sarah, but ONLY if no
  -- other user is a member and they hold no data (safety: never delete a tenant
  -- that someone else joined or that owns rows).
  IF junk_tids IS NOT NULL THEN
    DELETE FROM tenants t
    WHERE t.id = ANY(junk_tids)
      AND NOT EXISTS (SELECT 1 FROM user_tenants u WHERE u.tenant_id = t.id)
      AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.tenant_id = t.id)
      AND NOT EXISTS (SELECT 1 FROM clients  c WHERE c.tenant_id = t.id);
  END IF;

  RAISE NOTICE 'Sarah % bound to Second Nature tenant %', sarah_uid, snt_tid;
END $$;

-- Housekeeping: remove the orphan tenant_id=NULL "RLS probe" row left by the
-- live RLS verification (anon-insert path). Harmless (invisible in-app), but tidy.
DELETE FROM requests WHERE tenant_id IS NULL AND client_name = 'RLS probe';

-- Verify: should return exactly one row → Sarah → Second Nature.
SELECT u.email AS agent, t.name AS tenant, ut.role
FROM user_tenants ut
JOIN auth.users u ON u.id = ut.user_id
JOIN tenants    t ON t.id = ut.tenant_id
WHERE u.email = 'sarah@peekskilltree.com';

-- ───────────────────────────────────────────────────────────────────────────
-- NOTE (future hardening — not required for week one):
--   Current RLS gates every business table by tenant match only, so any
--   authenticated tenant member can read/write all of that tenant's tables.
--   Sarah is constrained to `requests` writes at the APP layer (her single tool
--   + sarah.toml [permissions]). To enforce least-privilege at the DB layer,
--   add role-aware policies, e.g.:
--     CREATE POLICY requests_agent_insert ON requests FOR INSERT TO authenticated
--       WITH CHECK (tenant_id = current_tenant_id()
--                   AND EXISTS (SELECT 1 FROM user_tenants
--                               WHERE user_id = auth.uid()
--                                 AND tenant_id = current_tenant_id()
--                                 AND role = 'viewer'));  -- + revoke broad grants
--   Deferred deliberately; flagged so it isn't forgotten.
-- ───────────────────────────────────────────────────────────────────────────
