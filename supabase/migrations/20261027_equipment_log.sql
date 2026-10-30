-- Equipment service log (Oct 27 2026) — first unit: Intrepid KM100 Tele loader.
-- Backs the crew page branchmanager.app/km100/ (link carries a key; the page talks
-- only to the equipment-log edge function, which uses service-role). No anon policies.
--
-- Apply:
--   SUPABASE_ACCESS_TOKEN=... npx supabase db query --linked --file supabase/migrations/20261027_equipment_log.sql
-- Idempotent.

CREATE TABLE IF NOT EXISTS equipment_hours (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  equipment_key text NOT NULL,
  hours         numeric(8,1) NOT NULL CHECK (hours >= 0),
  reading_date  date NOT NULL DEFAULT current_date,
  entered_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS equipment_hours_key_idx ON equipment_hours (equipment_key, created_at DESC);

-- One row per daily check (per unit per day) or per scheduled service (per unit per milestone).
CREATE TABLE IF NOT EXISTS equipment_checks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  equipment_key text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('daily','service')),
  dedupe_key    text NOT NULL UNIQUE,          -- km100:daily:2026-10-27 | km100:service:150
  milestone     int,                           -- service hour mark (50, 150, 300 …)
  label         text,
  check_date    date NOT NULL,
  hours         numeric(8,1),
  done_by       text,
  done          jsonb NOT NULL DEFAULT '[]'::jsonb,
  skipped       jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS equipment_checks_key_idx ON equipment_checks (equipment_key, check_date DESC);

CREATE TABLE IF NOT EXISTS equipment_info (
  equipment_key text PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  equipment_key text NOT NULL,
  slot          text NOT NULL,
  storage_path  text NOT NULL,
  taken_by      text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS equipment_photos_key_idx ON equipment_photos (equipment_key, created_at DESC);

-- RLS: signed-in BM users see their own tenant's rows (for a later in-app view).
ALTER TABLE equipment_hours  ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_info   ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_photos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['equipment_hours','equipment_checks','equipment_info','equipment_photos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_all', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id())', t || '_tenant_all', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
  END LOOP;
END $$;

-- Private bucket: manuals (dealer parts book is marked confidential) + crew photos.
-- Read only through short-lived signed URLs issued by the equipment-log function.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('equipment-private', 'equipment-private', false, 31457280,
        ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

NOTIFY pgrst, 'reload schema';
