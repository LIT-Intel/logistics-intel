-- Repoint the inbox sync cron at the REAL sync-inbox edge function.
--
-- lit-sync-inbox-tick (jobid 2) previously POSTed to a non-existent
-- `sync-inbox-cron` function with NO auth header, so every tick 404'd
-- silently and nothing was ever synced. Point it at the deployed
-- `sync-inbox` function, add the X-Internal-Cron secret the function
-- requires (verifyCronAuth-style), and relax the cadence to ~15 min
-- (the sync is incremental via gmail_history_id / Graph delta, so 15m is
-- plenty and avoids hammering the Gmail/Graph APIs).
--
-- The secret is read server-side from Vault so it never appears in the job
-- definition in plaintext.

do $$
declare
  v_job_id int;
begin
  select jobid into v_job_id from cron.job where jobname = 'lit-sync-inbox-tick';
  if v_job_id is not null then
    perform cron.alter_job(
      job_id  := v_job_id,
      schedule := '*/15 * * * *',
      command := $cmd$
        select net.http_post(
          url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/sync-inbox',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'X-Internal-Cron', (select decrypted_secret from vault.decrypted_secrets where name = 'LIT_CRON_SECRET')
          ),
          body := '{}'::jsonb
        );
      $cmd$
    );
  else
    perform cron.schedule(
      'lit-sync-inbox-tick',
      '*/15 * * * *',
      $cmd$
        select net.http_post(
          url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/sync-inbox',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'X-Internal-Cron', (select decrypted_secret from vault.decrypted_secrets where name = 'LIT_CRON_SECRET')
          ),
          body := '{}'::jsonb
        );
      $cmd$
    );
  end if;
end $$;
