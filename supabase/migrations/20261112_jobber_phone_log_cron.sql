-- Nov 12 2026: copy Twilio calls/texts/voicemails into Jobber every 5 minutes (jobber-phone-log).
do $$ begin
  if not exists (select 1 from cron.job where jobname='jobber-phone-log-5min') then
    perform cron.schedule('jobber-phone-log-5min','*/5 * * * *',
      $c$ select net.http_post(url := 'https://ltpivkqahvplapyagljt.supabase.co/functions/v1/jobber-phone-log', body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb); $c$);
  end if;
end $$;
