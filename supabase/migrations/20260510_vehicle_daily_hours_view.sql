-- v740: vehicle_daily_hours view — derives per-truck per-day work windows
-- from vehicle_positions. Used by TimeTrackPage Truck Hours tab so the
-- owner can fall back to "truck-derived hours + 30 min prep" when an
-- employee forgets to clock in or for company-wide policy.
--
-- Output columns:
--   tenant_id, vehicle_id, vehicle_name, day (date in NY time),
--   first_seen_ts, last_seen_ts, duration_seconds, ping_count,
--   max_speed_mph, distance_proxy_meters (haversine first→last; rough)
--
-- A "day" is bucketed in America/New_York to match Doug's calendar.
-- Days are dropped if the truck only has 1 ping (parked, no real work
-- window). Minimum 5 minutes between first/last to be considered a
-- valid work day (filters out engine-start tests).
--
-- View runs with security_invoker = on so callers' RLS scopes apply.
-- Vehicles + vehicle_positions are already tenant-isolated at the table
-- level, so this view inherits that correctly.
--
-- Apply: SUPABASE_ACCESS_TOKEN=... npx supabase db query --linked \
--          --file supabase/migrations/20260510_vehicle_daily_hours_view.sql

BEGIN;

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
)
SELECT
  b.tenant_id,
  b.vehicle_id,
  v.name AS vehicle_name,
  v.nickname AS vehicle_nickname,
  b.day,
  MIN(b.ts) AS first_seen_ts,
  MAX(b.ts) AS last_seen_ts,
  EXTRACT(EPOCH FROM (MAX(b.ts) - MIN(b.ts)))::int AS duration_seconds,
  COUNT(*) AS ping_count,
  MAX(b.speed_mph) AS max_speed_mph
FROM bucketed b
JOIN public.vehicles v ON v.id = b.vehicle_id
GROUP BY b.tenant_id, b.vehicle_id, v.name, v.nickname, b.day
HAVING EXTRACT(EPOCH FROM (MAX(b.ts) - MIN(b.ts))) >= 300  -- 5+ min window
  AND COUNT(*) >= 2;

GRANT SELECT ON public.vehicle_daily_hours TO authenticated, anon;

COMMIT;

-- Verify:
--   SELECT * FROM vehicle_daily_hours
--   WHERE day >= current_date - interval '7 days'
--   ORDER BY day DESC, vehicle_name;
