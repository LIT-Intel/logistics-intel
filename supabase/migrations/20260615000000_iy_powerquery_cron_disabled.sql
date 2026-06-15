-- IY-3: pg_cron schedule for iy-powerquery-sync (DISABLED BY DEFAULT)
--
-- The operator turns this on AFTER the first successful manual sync confirms
-- PowerQuery access is enabled on the IY account. Until then, scheduling it
-- would just burn through retry budget on 403 responses.
--
-- To enable: connect as a superuser and run the SELECT cron.schedule(...)
-- statement below. To disable later:
--   SELECT cron.unschedule('iy-powerquery-mx-import-daily');
--
-- Schedule: 04:00 UTC daily. Posts {source: 'mx-import'} with no company
-- filter — pulls fresh declarations across the IY universe. The function
-- itself enforces credit_floor and max_pages so this can't drain the wallet.

-- Sanity: ensure pg_cron + pg_net are available (Supabase ships these).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Intentional no-op. Uncomment AFTER first successful manual sync.
--
-- SELECT cron.schedule(
--   'iy-powerquery-mx-import-daily',
--   '0 4 * * *',
--   $cron$
--     SELECT net.http_post(
--       url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/iy-powerquery-sync',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
--       ),
--       body := jsonb_build_object(
--         'source', 'mx-import',
--         'credit_floor', 200,
--         'max_pages', 20
--       )
--     );
--   $cron$
-- );

-- Marker row so operators can see this migration ran without enabling cron.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE relname = '_iy_powerquery_cron_marker'
  ) THEN
    -- This is a no-op marker; nothing to insert. The comment below documents
    -- intent for the next agent reading this file.
    NULL;
  END IF;
END $$;
