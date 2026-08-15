-- Bug 2: email delivery + fulfillment cron bookkeeping on lead-magnet sessions.
alter table public.lit_lead_magnet_sessions
  add column if not exists report_emailed_at timestamptz,
  add column if not exists email_send_attempts int not null default 0,
  add column if not exists last_email_error text;

-- Partial index to make the cron sweep (captured but not yet emailed, under the
-- retry cap) cheap.
create index if not exists idx_lit_lead_magnet_sessions_fulfillment
  on public.lit_lead_magnet_sessions (email_captured_at)
  where email_captured_at is not null and report_emailed_at is null;

comment on column public.lit_lead_magnet_sessions.report_emailed_at is
  'When the magnet result email was successfully sent (or skipped for suppression). Null = pending fulfillment.';
comment on column public.lit_lead_magnet_sessions.email_send_attempts is
  'Number of fulfillment send attempts (cron caps retries at 3).';
comment on column public.lit_lead_magnet_sessions.last_email_error is
  'Last send error / skip reason for observability.';
