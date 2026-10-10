alter table public.social_posts add column if not exists work_day_id uuid;

create or replace function public.social_post_work_day_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if tg_op = 'DELETE' then
    if old.work_day_id is not null then
      update public.work_days set status = 'skipped' where id = old.work_day_id and status = 'draft';
    end if;
    return old;
  end if;
  if new.work_day_id is not null
     and new.status in ('scheduled','posted')
     and coalesce(old.status,'') not in ('scheduled','posted') then
    select decrypted_secret into k from vault.decrypted_secrets where name = 'work_days_key' limit 1;
    perform net.http_post(
      url := 'https://ltpivkqahvplapyagljt.supabase.co/functions/v1/work-days',
      body := jsonb_build_object('key', k, 'id', new.work_day_id, 'action', 'approve', 'social_post_id', new.id),
      headers := '{"Content-Type":"application/json"}'::jsonb);
  end if;
  return new;
end $$;

drop trigger if exists social_post_work_day_sync_upd on public.social_posts;
create trigger social_post_work_day_sync_upd after update of status on public.social_posts
  for each row execute function public.social_post_work_day_sync();
drop trigger if exists social_post_work_day_sync_del on public.social_posts;
create trigger social_post_work_day_sync_del after delete on public.social_posts
  for each row execute function public.social_post_work_day_sync();

select 'ok' as done,
  (select count(*) from vault.secrets where name = 'work_days_key') as secret,
  (select count(*) from pg_trigger where tgname like 'social_post_work_day_sync%') as triggers;
