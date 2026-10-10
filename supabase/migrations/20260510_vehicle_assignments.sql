-- v741: per-vehicle driver assignment.
--   - vehicles.default_driver_name: sticky default driver (text — matches
--     timeEntries.user shape, which is the employee name string).
--   - vehicle_day_assignments: per-truck-day overrides for when someone
--     other than the default driver took the truck that day.
--
-- Why both: most days the same person drives the same truck (default),
-- but Doug or a sub will occasionally swap. We need a sticky default
-- AND a per-day override so the Truck Hours tab can render the right
-- driver without manual entry every day.
--
-- Apply: cd ~/Desktop/Tree/branchmanager-app && \
--   SUPABASE_ACCESS_TOKEN=... npx supabase db query --linked \
--     --file supabase/migrations/20260510_vehicle_assignments.sql

BEGIN;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS default_driver_name text;

CREATE TABLE IF NOT EXISTS public.vehicle_day_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  day date NOT NULL,
  driver_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, day)
);

CREATE INDEX IF NOT EXISTS vehicle_day_assignments_tenant_day_idx
  ON public.vehicle_day_assignments (tenant_id, day DESC);

ALTER TABLE public.vehicle_day_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vda_tenant_read ON public.vehicle_day_assignments;
CREATE POLICY vda_tenant_read ON public.vehicle_day_assignments
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS vda_tenant_write ON public.vehicle_day_assignments;
CREATE POLICY vda_tenant_write ON public.vehicle_day_assignments
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_day_assignments TO authenticated;

-- Rebuild vehicle_daily_hours to expose the resolved driver name.
DROP VIEW IF EXISTS public.vehicle_daily_hours;

CREATE VIEW public.vehicle_daily_hours WITH (security_invoker = on) AS
WITH bucketed AS (
  SELECT
    vp.tenant_id,
    vp.vehicle_id,
    (vp.ts AT TIME ZONE 'America/New_York')::date AS day,
    vp.ts,
    vp.lat,
    vp.lon,
    vp.speed_mph
  FROM public.vehicle_positions vp
),
agg AS (
  SELECT
    b.tenant_id,
    b.vehicle_id,
    b.day,
    MIN(b.ts) AS first_seen_ts,
    MAX(b.ts) AS last_seen_ts,
    EXTRACT(EPOCH FROM (MAX(b.ts) - MIN(b.ts)))::int AS duration_seconds,
    COUNT(*) AS ping_count,
    MAX(b.speed_mph) AS max_speed_mph
  FROM bucketed b
  GROUP BY b.tenant_id, b.vehicle_id, b.day
  HAVING EXTRACT(EPOCH FROM (MAX(b.ts) - MIN(b.ts))) >= 300
     AND COUNT(*) >= 2
)
SELECT
  a.tenant_id,
  a.vehicle_id,
  v.name AS vehicle_name,
  v.nickname AS vehicle_nickname,
  a.day,
  a.first_seen_ts,
  a.last_seen_ts,
  a.duration_seconds,
  a.ping_count,
  a.max_speed_mph,
  COALESCE(vda.driver_name, v.default_driver_name) AS driver_name,
  (vda.driver_name IS NOT NULL) AS driver_is_override
FROM agg a
JOIN public.vehicles v ON v.id = a.vehicle_id
LEFT JOIN public.vehicle_day_assignments vda
  ON vda.vehicle_id = a.vehicle_id AND vda.day = a.day;

GRANT SELECT ON public.vehicle_daily_hours TO authenticated, anon;

COMMIT;
