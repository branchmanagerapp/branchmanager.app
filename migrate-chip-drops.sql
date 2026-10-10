-- migrate-chip-drops.sql
--
-- BM Operations layer: places where the crew can drop wood chips alternative
-- to the main municipal site (CRP). Modeled loosely after ChipDrop's concept —
-- log + map private spots that have asked for chips, so on the way back from
-- a job the crew can pick the closest available spot instead of driving all
-- the way to CRP.
--
-- Renders as a toggleable MapLibre layer on the dispatch / propertymap views.

CREATE TABLE IF NOT EXISTS chip_drop_spots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  address       text,
  lat           numeric(10, 7),
  lng           numeric(10, 7),
  contact_name  text,
  contact_phone text,
  contact_email text,
  -- Capacity in approximate truckloads (typical chip truck ~6-8 cu yd).
  capacity_loads int DEFAULT 1,
  -- Comma-or-space-separated species the property owner accepts (oak, pine,
  -- maple, locust, walnut). Empty = any.
  accepts_species text,
  -- Free-form notes: gate codes, where to pile, time-of-day windows, etc.
  drop_notes    text,
  -- 'active' | 'full' | 'paused' | 'archived'
  status        text DEFAULT 'active',
  last_drop_at  timestamptz,
  last_drop_loads int DEFAULT 0,
  source        text,             -- 'self_added' | 'chipdrop' | 'inbound_request' | 'referral'
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chip_drop_tenant       ON chip_drop_spots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chip_drop_status       ON chip_drop_spots(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_chip_drop_last         ON chip_drop_spots(tenant_id, last_drop_at);

-- RLS: tenant-scoped read/write, same pattern as the tasks table.
ALTER TABLE chip_drop_spots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chip_drop_tenant_select ON chip_drop_spots;
CREATE POLICY chip_drop_tenant_select ON chip_drop_spots FOR SELECT
  USING (tenant_id = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'::uuid);

DROP POLICY IF EXISTS chip_drop_tenant_insert ON chip_drop_spots;
CREATE POLICY chip_drop_tenant_insert ON chip_drop_spots FOR INSERT
  WITH CHECK (tenant_id = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'::uuid);

DROP POLICY IF EXISTS chip_drop_tenant_update ON chip_drop_spots;
CREATE POLICY chip_drop_tenant_update ON chip_drop_spots FOR UPDATE
  USING (tenant_id = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'::uuid)
  WITH CHECK (tenant_id = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'::uuid);

DROP POLICY IF EXISTS chip_drop_tenant_delete ON chip_drop_spots;
CREATE POLICY chip_drop_tenant_delete ON chip_drop_spots FOR DELETE
  USING (tenant_id = '93af4348-8bba-4045-ac3e-5e71ec1cc8c5'::uuid);

-- Realtime so device A's "Mark as full" reflects on device B within ~1s.
ALTER PUBLICATION supabase_realtime ADD TABLE chip_drop_spots;

-- Seed CRP as the canonical municipal drop site. Doug already uses this; this
-- ensures it shows on the map by default. Coordinates are Cortlandt Recycling
-- Park (66 Furnace Woods Rd, Cortlandt Manor, NY 10567).
INSERT INTO chip_drop_spots (tenant_id, name, address, lat, lng, capacity_loads, accepts_species, drop_notes, status, source)
VALUES (
  '93af4348-8bba-4045-ac3e-5e71ec1cc8c5',
  'CRP — Cortlandt Recycling Park',
  '66 Furnace Woods Rd, Cortlandt Manor, NY 10567',
  41.27306,
  -73.91556,
  999,
  'all',
  'Municipal site — primary chip drop. Tipping fees may apply during peak season. Open weekdays 7am-3pm.',
  'active',
  'self_added'
)
ON CONFLICT DO NOTHING;

-- Force PostgREST to refresh its schema cache so new columns/tables/RLS
-- show up immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
