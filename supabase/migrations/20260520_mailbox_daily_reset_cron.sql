-- Daily + hourly mailbox counter resets for lit_email_accounts.
-- The dispatcher increments sent_today / sent_this_hour as it sends;
-- these jobs reset them at the appropriate UTC boundaries.

SELECT cron.unschedule('mailbox-daily-reset')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'mailbox-daily-reset'
);

SELECT cron.schedule(
  'mailbox-daily-reset',
  '0 0 * * *',
  $$
  UPDATE public.lit_email_accounts
     SET sent_today = 0,
         sent_this_hour = 0
   WHERE sent_today > 0 OR sent_this_hour > 0;
  $$
);

SELECT cron.unschedule('mailbox-hourly-reset')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'mailbox-hourly-reset'
);

SELECT cron.schedule(
  'mailbox-hourly-reset',
  '0 * * * *',
  $$
  UPDATE public.lit_email_accounts
     SET sent_this_hour = 0
   WHERE sent_this_hour > 0;
  $$
);
