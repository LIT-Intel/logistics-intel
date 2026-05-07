-- Phase 3: deliverability hardening.
--
-- Two tables that the dispatcher reads on every tick:
--
--   1. lit_inbox_sender_caps      — per-mailbox daily send budget.
--                                   Operators can override per inbox.
--                                   Default cap pre-warmup is 50/day.
--
--   2. lit_email_suppression_list — global "do-not-email" per org.
--                                   Hard bounces / unsubscribes / manual
--                                   adds. Dispatcher skips and marks
--                                   recipient.status='skipped' instead
--                                   of failing the send.
--
-- Both are append-only operationally (the dispatcher INSERTs into
-- suppression on a hard bounce; CSV imports also INSERT). RLS scopes
-- by org so users only see / modify their own.

-- ─── lit_inbox_sender_caps ────────────────────────────────────────────────────
create table if not exists public.lit_inbox_sender_caps (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid references public.organizations(id) on delete cascade,
  email_account_id  uuid not null references public.lit_email_accounts(id) on delete cascade,
  -- Daily ceiling. Once a mailbox has sent this many emails in the
  -- current UTC day, the dispatcher stops picking recipients that
  -- would route through it until midnight UTC.
  daily_cap         integer not null default 50 check (daily_cap >= 0),
  -- Optional warmup curve. If both warmup_start_at and warmup_target_cap
  -- are set, the dispatcher computes today's effective cap as a linear
  -- ramp from daily_cap toward warmup_target_cap over warmup_days.
  warmup_target_cap integer check (warmup_target_cap is null or warmup_target_cap >= 0),
  warmup_start_at   timestamptz,
  warmup_days       integer not null default 14 check (warmup_days >= 1),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint lit_inbox_sender_caps_unique_per_account unique (email_account_id)
);

create index if not exists lit_inbox_sender_caps_org_idx
  on public.lit_inbox_sender_caps (org_id);

alter table public.lit_inbox_sender_caps enable row level security;

drop policy if exists lit_inbox_sender_caps_select on public.lit_inbox_sender_caps;
create policy lit_inbox_sender_caps_select on public.lit_inbox_sender_caps
  for select using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );
drop policy if exists lit_inbox_sender_caps_write on public.lit_inbox_sender_caps;
create policy lit_inbox_sender_caps_write on public.lit_inbox_sender_caps
  for all using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  ) with check (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

comment on table public.lit_inbox_sender_caps is
  'Per-mailbox daily send budget + warmup curve. Dispatcher reads this every tick to decide whether a mailbox can take more sends today.';

-- ─── lit_email_suppression_list ───────────────────────────────────────────────
create table if not exists public.lit_email_suppression_list (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations(id) on delete cascade,
  email       text not null,
  reason      text not null check (reason in (
    'manual','unsubscribe','bounce_hard','bounce_soft','complaint','invalid','other'
  )),
  source      text,                 -- e.g. 'recipient_clicked_unsubscribe', 'gmail_smtp_550', 'csv_import'
  context     jsonb not null default '{}'::jsonb,
  added_by    uuid references auth.users(id) on delete set null,
  added_at    timestamptz not null default now(),
  -- Global suppressions (org_id IS NULL) apply across the whole platform.
  -- Per-org rows are scoped to the org via RLS.
  constraint lit_email_suppression_list_unique_per_org unique (org_id, email)
);

create index if not exists lit_email_suppression_list_email_idx
  on public.lit_email_suppression_list (lower(email));

alter table public.lit_email_suppression_list enable row level security;

drop policy if exists lit_email_suppression_list_select on public.lit_email_suppression_list;
create policy lit_email_suppression_list_select on public.lit_email_suppression_list
  for select using (
    org_id is null
    or org_id in (select org_id from public.org_members where user_id = auth.uid())
  );
drop policy if exists lit_email_suppression_list_write on public.lit_email_suppression_list;
create policy lit_email_suppression_list_write on public.lit_email_suppression_list
  for all using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  ) with check (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

comment on table public.lit_email_suppression_list is
  'Global do-not-email registry. Dispatcher checks this before sending; matched recipients are marked skipped. Hard bounces auto-populate.';

-- ─── helper RPC: today_sent_count(email_account_id) ──────────────────────────
-- Single source of truth for "how many emails has this mailbox sent today
-- (UTC)". Used by the dispatcher for the throttle check.
create or replace function public.lit_inbox_sent_count_today(p_account uuid)
returns bigint
language sql
stable
as $$
  select count(*)::bigint
  from public.lit_outreach_history h
  join public.lit_email_accounts a on a.user_id = h.user_id
  where a.id = p_account
    and h.channel = 'email'
    and h.event_type = 'sent'
    and h.occurred_at >= date_trunc('day', now() at time zone 'utc');
$$;
