-- See deployment notes at top of supabase/functions/sync-inbox-cron/index.ts.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'lit-sync-inbox-tick') then
    perform cron.unschedule('lit-sync-inbox-tick');
  end if;
end $$;

select cron.schedule(
  'lit-sync-inbox-tick',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/sync-inbox-cron',
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  $cron$
);
