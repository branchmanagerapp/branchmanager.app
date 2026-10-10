-- Permanent crew auto-provisioning (Aug 12 2026)
--
-- Closes the "logs in → sees an EMPTY app" class permanently (the Catherine /
-- Michelle / Dave saga). RLS on data tables is gated by current_tenant_id(),
-- which reads the JWT tenant_id claim (from app_metadata) OR a user_tenants-
-- validated x-tenant-id header. So a crew member is invisible to their own
-- tenant's data unless BOTH are in place. This makes the DB itself guarantee
-- that, driven off the team_members roster — whichever exists first (the auth
-- user or the roster row) triggers provisioning of the other side.
--
-- app_metadata.tenant_id is the UNIVERSAL guarantee (works for every role incl.
-- 'sales', on any device, no cache/header dependency). user_tenants is added
-- for the roles its CHECK allows (owner/crew_lead/crew_member/viewer) — 'sales'
-- is intentionally excluded there and rides the app_metadata path.
--
-- Apply: POST https://api.supabase.com/v1/projects/<ref>/database/query  (sbp_ token)
-- See memory crew-tenant-provisioning.

-- ── shared provisioner ────────────────────────────────────────────────
create or replace function public.bm_provision_from_roster(p_uid uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare m record;
begin
  if p_uid is null or p_email is null then return; end if;
  select tenant_id, role into m
    from public.team_members
   where lower(email) = lower(p_email) and active = true
   order by (role = 'owner') desc
   limit 1;
  if not found or m.tenant_id is null then return; end if;

  -- 1) app_metadata (EVERY role) — the JWT claim current_tenant_id() reads.
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('tenant_id', m.tenant_id::text, 'role', m.role)
   where id = p_uid
     and coalesce(raw_app_meta_data->>'tenant_id', '') is distinct from m.tenant_id::text;

  -- 2) user_tenants for roles the CHECK allows ('sales' excluded by design).
  if m.role in ('owner', 'crew_lead', 'crew_member', 'viewer') then
    insert into public.user_tenants(user_id, tenant_id, role)
    values (p_uid, m.tenant_id, m.role)
    on conflict (user_id, tenant_id) do update set role = excluded.role;
  end if;
end;
$$;

-- ── trigger: new/updated auth user (signup / invite / email change) ────
create or replace function public.bm_tg_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.bm_provision_from_roster(NEW.id, NEW.email);
  return NEW;
end; $$;

drop trigger if exists bm_autoprovision_auth on auth.users;
create trigger bm_autoprovision_auth
  after insert or update of email on auth.users
  for each row execute function public.bm_tg_auth_user();

-- ── trigger: new/updated roster row (roster-first onboarding) ──────────
create or replace function public.bm_tg_team_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare u_id uuid;
begin
  if NEW.email is null or NEW.active is distinct from true then return NEW; end if;
  select id into u_id from auth.users where lower(email) = lower(NEW.email) limit 1;
  if u_id is not null then
    perform public.bm_provision_from_roster(u_id, NEW.email);
  end if;
  return NEW;
end; $$;

drop trigger if exists bm_autoprovision_roster on public.team_members;
create trigger bm_autoprovision_roster
  after insert or update on public.team_members
  for each row execute function public.bm_tg_team_member();

-- ── backfill: provision every currently-rostered auth user (idempotent) ─
do $$
declare r record;
begin
  for r in
    select au.id, au.email
      from auth.users au
      join public.team_members tm
        on lower(tm.email) = lower(au.email) and tm.active = true
  loop
    perform public.bm_provision_from_roster(r.id, r.email);
  end loop;
end $$;
