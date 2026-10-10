-- ============================================================================
-- Branch Manager — Passive Location Tracking
--
-- Two tables:
--   1. location_pings      — raw GPS samples (append-only, prune after N days)
--   2. detected_locations  — dwell clusters the app flags for user review
--
-- Run ONCE in Supabase → SQL Editor.
-- Safe to re-run (IF NOT EXISTS / idempotent).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. location_pings — raw samples
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.location_pings (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid             not null,
  user_id       uuid             not null,
  lat           double precision not null,
  lng           double precision not null,
  accuracy_m    double precision,
  altitude_m    double precision,
  speed_mps     double precision,
  heading       double precision,
  battery_pct   double precision,
  client_ts     timestamptz,            -- when the device actually captured it (may differ from insert time if queued offline)
  session_id    text,                   -- groups pings from a single app-open session (client-generated uuid)
  source        text default 'foreground', -- 'foreground' | 'background' | 'manual' | 'test'
  created_at    timestamptz not null default now()
);

-- Fast "last N pings for this user" + time-range queries
create index if not exists idx_pings_user_time
  on public.location_pings (tenant_id, user_id, created_at desc);
create index if not exists idx_pings_session
  on public.location_pings (session_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. detected_locations — dwell clusters the app detected (candidates for tagging)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.detected_locations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid             not null,
  user_id         uuid             not null,
  center_lat      double precision not null,
  center_lng      double precision not null,
  radius_m        double precision not null default 50,
  first_seen_at   timestamptz      not null,
  last_seen_at    timestamptz      not null,
  dwell_minutes   integer          not null default 0,
  ping_count      integer          not null default 0,
  -- 'pending'    = awaiting user to tag
  -- 'tagged'     = user linked it to a job/client/label
  -- 'ignored'    = user dismissed (don't prompt again)
  -- 'yard'       = home base (auto-tagged from geofence)
  status          text             not null default 'pending',
  job_id          uuid,
  client_id       uuid,
  label           text,              -- free-form e.g. "Lunch at Subway", "Yard"
  notes           text,
  address_guess   text,              -- reverse-geocoded on client if available
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_detected_user_status
  on public.detected_locations (tenant_id, user_id, status);
create index if not exists idx_detected_last_seen
  on public.detected_locations (tenant_id, last_seen_at desc);

-- auto-bump updated_at on edit
create or replace function public.detected_locations_touch()
  returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists detected_locations_touch_trg on public.detected_locations;
create trigger detected_locations_touch_trg
  before update on public.detected_locations
  for each row execute function public.detected_locations_touch();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Row-Level Security — tenant-scoped
--    Policy: members of a tenant can read/write their own rows.
--    Owners/managers can see all rows in their tenant (enforced app-side via
--    DB role check; RLS stays tenant-level so team_members is the gate).
-- ────────────────────────────────────────────────────────────────────────────
alter table public.location_pings      enable row level security;
alter table public.detected_locations  enable row level security;

-- location_pings
drop policy if exists pings_select on public.location_pings;
drop policy if exists pings_insert on public.location_pings;
drop policy if exists pings_update on public.location_pings;
drop policy if exists pings_delete on public.location_pings;

create policy pings_select on public.location_pings
  for select using (
    tenant_id in (select ut.tenant_id from public.user_tenants ut where ut.user_id = auth.uid())
  );

create policy pings_insert on public.location_pings
  for insert with check (
    tenant_id in (select ut.tenant_id from public.user_tenants ut where ut.user_id = auth.uid())
  );

create policy pings_update on public.location_pings
  for update using (
    tenant_id in (select ut.tenant_id from public.user_tenants ut where ut.user_id = auth.uid())
  ) with check (
    tenant_id in (select ut.tenant_id from public.user_tenants ut where ut.user_id = auth.uid())
  );

create policy pings_delete on public.location_pings
  for delete using (
    tenant_id in (select ut.tenant_id from public.user_tenants ut where ut.user_id = auth.uid())
  );

-- detected_locations
drop policy if exists det_select on public.detected_locations;
drop policy if exists det_insert on public.detected_locations;
drop policy if exists det_update on public.detected_locations;
drop policy if exists det_delete on public.detected_locations;

create policy det_select on public.detected_locations
  for select using (
    tenant_id in (select ut.tenant_id from public.user_tenants ut where ut.user_id = auth.uid())
  );

create policy det_insert on public.detected_locations
  for insert with check (
    tenant_id in (select ut.tenant_id from public.user_tenants ut where ut.user_id = auth.uid())
  );

create policy det_update on public.detected_locations
  for update using (
    tenant_id in (select ut.tenant_id from public.user_tenants ut where ut.user_id = auth.uid())
  ) with check (
    tenant_id in (select ut.tenant_id from public.user_tenants ut where ut.user_id = auth.uid())
  );

create policy det_delete on public.detected_locations
  for delete using (
    tenant_id in (select ut.tenant_id from public.user_tenants ut where ut.user_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Realtime — so the "pending detected locations" badge updates live
-- ────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'detected_locations'
  ) then
    execute 'alter publication supabase_realtime add table public.detected_locations';
  end if;
  -- pings deliberately NOT added to realtime — too chatty, no UI needs a live stream
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Retention helper — optional, manual for now
--    Call this from a daily Edge Function cron to trim raw pings older than 30 days.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.prune_old_location_pings(days_to_keep int default 30)
  returns integer language plpgsql as $$
declare
  deleted_count integer;
begin
  delete from public.location_pings
    where created_at < now() - (days_to_keep || ' days')::interval;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end; $$;

-- Done. After running: reload BM, toggle the new "Passive Location Tracking"
-- setting under Settings → Location Services, and allow location when prompted.

-- Force PostgREST to refresh its schema cache so new columns/tables/RLS
-- show up immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
