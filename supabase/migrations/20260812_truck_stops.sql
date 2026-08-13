-- Truck stops (time on site) for the Payroll GPS panel (Aug 12 2026)
--
-- Per truck, each place it PARKED away from the yard on a given day, with how
-- long it sat there = time on site. A "stop" = a sustained low-speed cluster
-- (< 3 mph) lasting >= p_min_minutes, more than p_radius_m from the yard.
-- Stop location = cluster centroid; the client reverse-geocodes it to a street
-- address and/or matches it to that day's scheduled job.
--
-- SECURITY INVOKER — RLS scopes vehicle_positions/vehicles to the caller.
-- Apply: POST https://api.supabase.com/v1/projects/<ref>/database/query (sbp_ token)

create or replace function public.bm_truck_stops(
  p_day         date,
  p_lat         float8 default 41.30489,
  p_lon         float8 default -73.92339,
  p_radius_m    int    default 200,
  p_min_minutes int    default 10
)
returns table(
  vehicle_id uuid, name text, model text,
  arrive_ts timestamptz, depart_ts timestamptz, mins int,
  stop_lat float8, stop_lon float8
)
language sql
stable
set search_path = public
as $$
  with pts as (
    select vp.vehicle_id, vp.ts, vp.lat, vp.lon,
      (coalesce(vp.speed_mph, 0) < 3) as stopped,
      ( 2 * 6371000 * asin(sqrt(
          power(sin(radians(vp.lat - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(vp.lat))
            * power(sin(radians(vp.lon - p_lon) / 2), 2)
        )) ) as yard_m
    from vehicle_positions vp
    where (vp.ts at time zone 'America/New_York')::date = p_day
      and vp.lat is not null and vp.lon is not null
  ),
  chg as (
    select *, case when stopped is distinct from lag(stopped)
                     over (partition by vehicle_id order by ts) then 1 else 0 end as c
    from pts
  ),
  grp as (
    select *, sum(c) over (partition by vehicle_id order by ts
                           rows between unbounded preceding and current row) as g
    from chg
  ),
  runs as (
    select vehicle_id, g, min(ts) as s, max(ts) as e,
           avg(lat) as clat, avg(lon) as clon, avg(yard_m) as ay, bool_and(stopped) as is_stop
    from grp group by vehicle_id, g
  )
  select r.vehicle_id, v.name, v.model, r.s, r.e,
         round(extract(epoch from (r.e - r.s)) / 60)::int,
         round(r.clat::numeric, 6)::float8, round(r.clon::numeric, 6)::float8
  from runs r
  join vehicles v on v.id = r.vehicle_id
  where r.is_stop
    and (r.e - r.s) >= make_interval(mins => p_min_minutes)
    and r.ay > p_radius_m
  order by v.model, r.s;
$$;

grant execute on function public.bm_truck_stops(date, float8, float8, int, int) to authenticated;
