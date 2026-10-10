-- ══════════════════════════════════════════════════════════════════════════
-- Multi-tenant migration for Branch Manager
-- ══════════════════════════════════════════════════════════════════════════
-- PHASE 3 is now live. After Phase 2 code ships in v222, paste this entire file
-- into the Supabase SQL editor: https://supabase.com/dashboard/project/ltpivkqahvplapyagljt/sql/new
-- It re-runs Parts A + C (idempotent — safe) and applies Part B strict RLS.
-- If anything breaks, run the disable-RLS rollback block at the bottom.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Goal: let multiple tree-service businesses each sign up, see only THEIR
--       data, without any code changes in the app beyond scoped queries.
--
-- Strategy:
--   1. Add `tenant_id UUID` to every business table.
--   2. Create a `tenants` table (id, name, owner_email, plan, created_at).
--   3. Map every Supabase auth user to a tenant via `user_tenants`.
--   4. RLS: every SELECT/INSERT/UPDATE/DELETE checks that row.tenant_id
--      matches the caller's tenant_id (looked up from user_tenants).
--
-- Rollout plan (DO NOT RUN BLIND — read this first):
--   Phase 1: run PART A below to add columns + new tables.  Doug's existing
--            rows get tenant_id = the-first-created-tenant.  App still works.
--   Phase 2: update client app to store current tenant_id in session and
--            include it on INSERT.  Tested locally before flipping.
--   Phase 3: run PART B to enable strict RLS.  Before this, anyone with the
--            anon key sees everything — so DO NOT invite beta testers until
--            Phase 3 lands.
-- ══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- PART A — schema additions (safe to run now, does not affect RLS yet)
-- ─────────────────────────────────────────────────────────────────────────

-- 1. tenants table (one row per business / customer)
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_email text NOT NULL,
  plan text NOT NULL DEFAULT 'beta' CHECK (plan IN ('beta','free','starter','pro','enterprise')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Seed a tenant for Doug so existing rows can link to something
INSERT INTO tenants (name, owner_email, plan)
SELECT 'Second Nature Tree Service', 'info@peekskilltree.com', 'pro'
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE owner_email = 'info@peekskilltree.com');

-- 3. user_tenants — which auth.user is a member of which tenant
--    (role lets us later add crew vs owner permissions per tenant)
CREATE TABLE IF NOT EXISTS user_tenants (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','crew_lead','crew_member','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_user_tenants_user ON user_tenants(user_id);

-- 4. Add tenant_id to every business table (nullable for now — Phase 3 locks)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'clients','requests','quotes','jobs','invoices','payments',
    'services','team_members','communications','crew_locations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_tenant ON %I(tenant_id);', t, t);
    END IF;
  END LOOP;
END $$;

-- 5. Backfill existing rows → Doug's tenant
DO $$
DECLARE
  doug_tid uuid;
  t text;
  tables text[] := ARRAY[
    'clients','requests','quotes','jobs','invoices','payments',
    'services','team_members','communications','crew_locations'
  ];
BEGIN
  SELECT id INTO doug_tid FROM tenants WHERE owner_email = 'info@peekskilltree.com' LIMIT 1;
  IF doug_tid IS NULL THEN RAISE EXCEPTION 'Could not find seed tenant'; END IF;
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      EXECUTE format('UPDATE %I SET tenant_id = $1 WHERE tenant_id IS NULL;', t) USING doug_tid;
    END IF;
  END LOOP;
END $$;

-- 6. Helper function: current user's tenant id (used by RLS in Phase 3)
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid() LIMIT 1
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- PART B — STRICT RLS (run ONLY after app code is updated — Phase 3)
-- ─────────────────────────────────────────────────────────────────────────
-- Phase 3: strict RLS is ENABLED below.  Turning this on will BLOCK any INSERT
-- that doesn't include a valid tenant_id, and hide every row from other tenants.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'clients','requests','quotes','jobs','invoices','payments',
    'services','team_members','communications','crew_locations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON %I;', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_write ON %I;', t);
      EXECUTE format('CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (tenant_id = current_tenant_id());', t);
      EXECUTE format('CREATE POLICY tenant_isolation_write ON %I FOR ALL USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());', t);
    END IF;
  END LOOP;
END $$;

-- Tenants + user_tenants RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_read ON tenants;
CREATE POLICY tenants_read ON tenants FOR SELECT USING (id = current_tenant_id());
ALTER TABLE user_tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_tenants_read ON user_tenants;
CREATE POLICY user_tenants_read ON user_tenants FOR SELECT USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- PART C — Tenant provisioning trigger (auto-create tenant on signup)
-- ─────────────────────────────────────────────────────────────────────────
-- When a new user signs up, create a tenant for them + link user_tenants.
-- Safe to run now — only fires on new auth.users inserts.

CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_tenant_id uuid;
  biz_name text;
BEGIN
  -- Skip if user already has a tenant (e.g., invited to an existing one via user_tenants INSERT elsewhere)
  IF EXISTS (SELECT 1 FROM user_tenants WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  -- Get business name from raw_user_meta_data, fall back to email
  biz_name := COALESCE(NEW.raw_user_meta_data->>'business_name', split_part(NEW.email, '@', 1) || ' Tree Service');
  INSERT INTO tenants (name, owner_email, plan) VALUES (biz_name, NEW.email, 'beta') RETURNING id INTO new_tenant_id;
  INSERT INTO user_tenants (user_id, tenant_id, role) VALUES (NEW.id, new_tenant_id, 'owner');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Link the existing Doug user (if it exists) to his seed tenant
DO $$
DECLARE
  doug_uid uuid;
  doug_tid uuid;
BEGIN
  SELECT id INTO doug_uid FROM auth.users WHERE email = 'info@peekskilltree.com' LIMIT 1;
  SELECT id INTO doug_tid FROM tenants WHERE owner_email = 'info@peekskilltree.com' LIMIT 1;
  IF doug_uid IS NOT NULL AND doug_tid IS NOT NULL THEN
    INSERT INTO user_tenants (user_id, tenant_id, role)
    VALUES (doug_uid, doug_tid, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- ROLLBACK (paste this if Phase 3 breaks the app):
-- ─────────────────────────────────────────────────────────────────────────
-- DO $$ DECLARE t text; tables text[] := ARRAY['clients','requests','quotes','jobs','invoices','payments','services','team_members','communications','crew_locations'];
-- BEGIN FOREACH t IN ARRAY tables LOOP
--   IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
--     EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY;', t);
--   END IF; END LOOP; END $$;

-- Force PostgREST to refresh its schema cache so new columns/tables/RLS
-- show up immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
