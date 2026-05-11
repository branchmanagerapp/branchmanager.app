-- v746: schedule bouncie-rest-sync every 15 min. Same pattern as the
-- marketing-automation cron used to use (now disabled). This one is
-- safe to leave running — the function is read-only and tenant-scoped:
-- it only fires for tenants whose tenants.config.bouncie.access_token
-- is set, so tenants without OAuth completed get a no-op.
--
-- To disable: SELECT cron.unschedule('bouncie-rest-sync');

SELECT cron.schedule(
  'bouncie-rest-sync',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ltpivkqahvplapyagljt.supabase.co/functions/v1/bouncie-rest-sync',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
