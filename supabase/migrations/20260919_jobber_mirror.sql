-- Jobber mirror (Sept 19 2026): read-only copies of Jobber quotes / jobs / invoices / requests so the
-- Estimate board lives INSIDE Branch Manager while Catherine keeps writing in Jobber.
-- Filled by edge fn jobber-mirror (hourly cron) and/or ~/Desktop/scripts/jobber-pull.py.
create table if not exists public.jobber_quotes (
  id text primary key, tenant_id uuid not null,
  quote_number int, title text, status text, total numeric, subtotal numeric,
  client_id text, client_name text, client_phone text, client_email text,
  street text, city text, province text, postal_code text, lat float8, lng float8,
  created_at timestamptz, sent_at timestamptz, updated_at timestamptz, synced_at timestamptz default now()
);
create table if not exists public.jobber_jobs (
  id text primary key, tenant_id uuid not null,
  job_number int, title text, status text, total numeric, client_name text,
  street text, city text, postal_code text, start_at timestamptz, end_at timestamptz,
  updated_at timestamptz, synced_at timestamptz default now()
);
create table if not exists public.jobber_invoices (
  id text primary key, tenant_id uuid not null,
  invoice_number text, subject text, status text, total numeric, balance numeric, client_name text,
  issued_date timestamptz, due_date timestamptz, updated_at timestamptz, synced_at timestamptz default now()
);
create table if not exists public.jobber_requests (
  id text primary key, tenant_id uuid not null,
  title text, status text, client_name text, street text, city text, created_at timestamptz, synced_at timestamptz default now()
);
create index if not exists jobber_quotes_tenant_status on public.jobber_quotes(tenant_id, status, created_at desc);
alter table public.jobber_quotes   enable row level security;
alter table public.jobber_jobs     enable row level security;
alter table public.jobber_invoices enable row level security;
alter table public.jobber_requests enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='jobber_quotes'   and policyname='jobber_quotes_tenant')   then create policy jobber_quotes_tenant   on public.jobber_quotes   for select to authenticated using (tenant_id = current_tenant_id()); end if;
  if not exists (select 1 from pg_policies where tablename='jobber_jobs'     and policyname='jobber_jobs_tenant')     then create policy jobber_jobs_tenant     on public.jobber_jobs     for select to authenticated using (tenant_id = current_tenant_id()); end if;
  if not exists (select 1 from pg_policies where tablename='jobber_invoices' and policyname='jobber_invoices_tenant') then create policy jobber_invoices_tenant on public.jobber_invoices for select to authenticated using (tenant_id = current_tenant_id()); end if;
  if not exists (select 1 from pg_policies where tablename='jobber_requests' and policyname='jobber_requests_tenant') then create policy jobber_requests_tenant on public.jobber_requests for select to authenticated using (tenant_id = current_tenant_id()); end if;
end $$;
do $$ begin
  if not exists (select 1 from cron.job where jobname='jobber-mirror-hourly') then
    perform cron.schedule('jobber-mirror-hourly','12 * * * *',
      $c$ select net.http_post(url := 'https://ltpivkqahvplapyagljt.supabase.co/functions/v1/jobber-mirror', body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb); $c$);
  end if;
end $$;
