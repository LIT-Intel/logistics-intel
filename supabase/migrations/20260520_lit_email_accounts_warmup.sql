-- supabase/migrations/20260520_lit_email_accounts_warmup.sql
ALTER TABLE public.lit_email_accounts
  ADD COLUMN IF NOT EXISTS daily_send_cap      integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS hourly_send_cap     integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS warmup_started_at   timestamptz,
  ADD COLUMN IF NOT EXISTS warmup_complete     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sent_today          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_this_hour      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_send_at        timestamptz,
  ADD COLUMN IF NOT EXISTS gmail_watch_expiration   timestamptz,
  ADD COLUMN IF NOT EXISTS gmail_history_id    text,
  ADD COLUMN IF NOT EXISTS graph_subscription_id    text,
  ADD COLUMN IF NOT EXISTS graph_subscription_expiration timestamptz;

COMMENT ON COLUMN public.lit_email_accounts.daily_send_cap IS
  '50/day default. Post-warmup ceiling. Raised manually via SQL for trusted mailboxes.';
COMMENT ON COLUMN public.lit_email_accounts.warmup_started_at IS
  'When the auto-ramp curve started. NULL = no ramp (treat as complete).';
COMMENT ON COLUMN public.lit_email_accounts.warmup_complete IS
  'True = skip warmup curve, use daily_send_cap directly. Defaults false for new connections.';
COMMENT ON COLUMN public.lit_email_accounts.gmail_history_id IS
  'Last processed historyId from Gmail Watch. Used to fetch new messages on push.';
COMMENT ON COLUMN public.lit_email_accounts.graph_subscription_id IS
  'Microsoft Graph subscription ID for inbox messages. Renewed every 60h.';

ALTER TABLE public.lit_campaign_contacts
  ADD COLUMN IF NOT EXISTS next_step_order     integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS suppressed_reason   text;
