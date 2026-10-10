-- Yard trips for the Payroll GPS panel (Aug 12 2026)
--
-- Returns, per tracked truck, each sustained trip AWAY from the yard on a given
-- day: when it left the yard and when it got back. "Yard" = tenant HQ (SNT =
-- Peekskill, derived from where the chip trucks start/end every day). A dwell
-- threshold collapses GPS jitter near the geofence edge (the Ram flapping the
-- boundary) into real trips.
--
-- SECURITY INVOKER (default) — RLS on vehicle_positions/vehicles scopes rows to
-- the caller's tenant, so no p_tenant param and no cross-tenant leak.
-- Bouncie doesn't log while parked (ignition off), so the first ping of the day
-- is at the yard and the last ping is the return — the trip bookends are real.
--
-- Apply: POST https://api.supabase.com/v1/projects/<ref>/database/query (sbp_ token)

create or replace function public.bm_yard_trips(
  p_day         date,
  p_lat         float8  default 41.30489,      -- SNT Peekskill yard (truck-derived)
  p_lon         float8  default -73.92339,
  p_radius_m    int     default 200,
  p_min_minutes int     default 15
)
returns table(
  vehicle_id uuid, name text, model text, nickname text,
  left_yard timestamptz, back_yard timestamptz, mins_out int
)
language sql
stable
set search_path = public
as $$
  with pts as (
    select vp.vehicle_id, vp.ts,
      ( 2 * 6371000 * asin(sqrt(
          power(sin(radians(vp.lat - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(vp.lat))
            * power(sin(radians(vp.lon - p_lon) / 2), 2)
        )) <= p_radius_m ) as inside
    from vehicle_positions vp
    where (vp.ts at time zone 'America/New_York')::date = p_day
      and vp.lat is not null and vp.lon is not null
  ),
  chg as (
    select vehicle_id, ts, inside,
      case when inside is distinct from lag(inside)
             over (partition by vehicle_id order by ts) then 1 else 0 end as c
    from pts
  ),
  grp as (
    select vehicle_id, ts, inside,
      sum(c) over (partition by vehicle_id order by ts
                   rows between unbounded preceding and current row) as g
    from chg
  ),
  runs as (
    select vehicle_id, inside, min(ts) as s, max(ts) as e
    from grp group by vehicle_id, g, inside
  )
  select r.vehicle_id, v.name, v.model, v.nickname,
         r.s, r.e, round(extract(epoch from (r.e - r.s)) / 60)::int
  from runs r
  join vehicles v on v.id = r.vehicle_id
  where r.inside = false
    and (r.e - r.s) >= make_interval(mins => p_min_minutes)
  order by v.model, r.s;
$$;

grant execute on function public.bm_yard_trips(date, float8, float8, int, int) to authenticated;
