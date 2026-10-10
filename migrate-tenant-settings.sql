-- ============================================================================
-- Branch Manager — tenant_settings table
--
-- Stores per-tenant API keys + app preferences so every device that logs in
-- under the same tenant picks up the same keys automatically.
--
-- Used by: src/cloudkeys.js (CloudKeys.init / _push / _delete)
-- Run this ONCE in Supabase → SQL Editor.
-- ============================================================================

-- 1. Table
create table if not exists public.tenant_settings (
  tenant_id  uuid        not null,
  key        text        not null,
  value      text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

-- 2. Indexes (the PK already covers lookup-by-tenant-and-key; add a bare
--    tenant_id index for "give me everything for this tenant" pulls)
create index if not exists tenant_settings_tenant_idx
  on public.tenant_settings (tenant_id);

-- 3. RLS — only members of the tenant can read/write
alter table public.tenant_settings enable row level security;

-- Drop any old policies (idempotent re-run)
drop policy if exists tenant_settings_select on public.tenant_settings;
drop policy if exists tenant_settings_insert on public.tenant_settings;
drop policy if exists tenant_settings_update on public.tenant_settings;
drop policy if exists tenant_settings_delete on public.tenant_settings;

-- Users can only see / write rows for tenants they belong to
create policy tenant_settings_select on public.tenant_settings
  for select
  using (
    tenant_id in (
      select ut.tenant_id from public.user_tenants ut
      where ut.user_id = auth.uid()
    )
  );

create policy tenant_settings_insert on public.tenant_settings
  for insert
  with check (
    tenant_id in (
      select ut.tenant_id from public.user_tenants ut
      where ut.user_id = auth.uid()
    )
  );

create policy tenant_settings_update on public.tenant_settings
  for update
  using (
    tenant_id in (
      select ut.tenant_id from public.user_tenants ut
      where ut.user_id = auth.uid()
    )
  )
  with check (
    tenant_id in (
      select ut.tenant_id from public.user_tenants ut
      where ut.user_id = auth.uid()
    )
  );

create policy tenant_settings_delete on public.tenant_settings
  for delete
  using (
    tenant_id in (
      select ut.tenant_id from public.user_tenants ut
      where ut.user_id = auth.uid()
    )
  );

-- 4. Auto-bump updated_at on every update (so CloudKeys' last-write-wins works)
create or replace function public.tenant_settings_touch()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tenant_settings_touch_trg on public.tenant_settings;
create trigger tenant_settings_touch_trg
  before update on public.tenant_settings
  for each row
  execute function public.tenant_settings_touch();

-- 5. Realtime — so other devices see changes instantly (without this they'd
--    only pick up new keys on next login).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'tenant_settings'
  ) then
    execute 'alter publication supabase_realtime add table public.tenant_settings';
  end if;
end $$;

-- Done. After running this, on your main device:
--   1. Reload the app (peekskilltree.com/branchmanager/?reset=1)
--   2. Go to Settings → re-save the Claude key (or any other key)
--   3. Log in on a second device → it should pull the keys automatically.

-- Force PostgREST to refresh its schema cache so new columns/tables/RLS
-- show up immediately on the API. Idempotent — safe to re-run.
NOTIFY pgrst, 'reload schema';
