-- Inbox v1 — thread + message storage for the email inbox feature.
--
-- Two tables track conversations originating from campaigns (or any
-- inbound mail to a connected Gmail / Microsoft 365 mailbox).
--
--   lit_email_threads  — one row per Gmail thread / Graph conversation.
--                        Aggregates message count, unread count, last
--                        activity. Joinable to campaign / contact /
--                        company so the same thread surfaces on the
--                        campaign page AND on the company / contact
--                        profile inbox tabs.
--
--   lit_email_messages — one row per message (inbound + outbound).
--                        body_html for rich rendering, body_text for
--                        search + plain-text fallback.
--
-- Sync is pull-based v1 (poll the connected mailbox every N minutes).
-- Phase 4 reply detection (push via Gmail Watch / Graph subscriptions)
-- can land later as an event source that writes the same rows.

-- ─── lit_email_threads ────────────────────────────────────────────────────────
create table if not exists public.lit_email_threads (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid references public.organizations(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  email_account_id    uuid not null references public.lit_email_accounts(id) on delete cascade,
  provider            text not null,                   -- 'gmail' | 'outlook'
  provider_thread_id  text not null,                   -- Gmail threadId / Graph conversationId
  subject             text,
  participants        jsonb not null default '[]'::jsonb,  -- [{email, name, role}]
  -- Optional joins. Match made at sync time by looking up sender / recipient
  -- email against lit_contacts and lit_campaign_contacts.
  campaign_id         uuid references public.lit_campaigns(id) on delete set null,
  contact_id          uuid references public.lit_contacts(id) on delete set null,
  company_id          uuid references public.lit_companies(id) on delete set null,
  -- Activity rollups maintained by sync + reply functions.
  last_message_at     timestamptz,
  message_count       integer not null default 0,
  unread_count        integer not null default 0,
  -- 'open' | 'archived' | 'snoozed'. Lightweight UI state, not a Gmail label sync.
  status              text not null default 'open' check (status in ('open','archived','snoozed')),
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Same Gmail thread shouldn't dupe across syncs.
  constraint lit_email_threads_unique_per_account
    unique (email_account_id, provider_thread_id)
);

-- Sort + filter indexes that the inbox UI relies on.
create index if not exists lit_email_threads_user_lastmsg_idx
  on public.lit_email_threads (user_id, last_message_at desc nulls last);
create index if not exists lit_email_threads_campaign_idx
  on public.lit_email_threads (campaign_id) where campaign_id is not null;
create index if not exists lit_email_threads_company_idx
  on public.lit_email_threads (company_id) where company_id is not null;
create index if not exists lit_email_threads_contact_idx
  on public.lit_email_threads (contact_id) where contact_id is not null;

-- ─── lit_email_messages ───────────────────────────────────────────────────────
create table if not exists public.lit_email_messages (
  id                    uuid primary key default gen_random_uuid(),
  thread_id             uuid not null references public.lit_email_threads(id) on delete cascade,
  org_id                uuid references public.organizations(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  email_account_id      uuid not null references public.lit_email_accounts(id) on delete cascade,
  provider_message_id   text not null,
  -- 'inbound' = received by the connected mailbox.
  -- 'outbound' = sent FROM the connected mailbox (campaign send, manual reply).
  direction             text not null check (direction in ('inbound','outbound')),
  from_email            text,
  from_name             text,
  to_emails             text[] not null default '{}',
  cc_emails             text[] not null default '{}',
  bcc_emails            text[] not null default '{}',
  subject               text,
  body_text             text,
  body_html             text,
  snippet               text,
  message_date          timestamptz,
  is_unread             boolean not null default false,
  -- raw_headers preserves Message-ID, In-Reply-To, References for proper
  -- thread continuation when we send a reply.
  raw_headers           jsonb not null default '{}'::jsonb,
  -- Provenance — same as on lit_outreach_history.
  campaign_id           uuid references public.lit_campaigns(id) on delete set null,
  campaign_step_id      uuid references public.lit_campaign_steps(id) on delete set null,
  contact_id            uuid references public.lit_contacts(id) on delete set null,
  created_at            timestamptz not null default now(),
  constraint lit_email_messages_unique_per_account
    unique (email_account_id, provider_message_id)
);

create index if not exists lit_email_messages_thread_date_idx
  on public.lit_email_messages (thread_id, message_date asc nulls last);
create index if not exists lit_email_messages_user_recent_idx
  on public.lit_email_messages (user_id, message_date desc nulls last);

-- ─── updated_at trigger on threads ────────────────────────────────────────────
create or replace function public.set_lit_email_threads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_lit_email_threads_updated_at on public.lit_email_threads;
create trigger trg_lit_email_threads_updated_at
  before update on public.lit_email_threads
  for each row execute function public.set_lit_email_threads_updated_at();

-- ─── Row-level security ──────────────────────────────────────────────────────
alter table public.lit_email_threads enable row level security;
alter table public.lit_email_messages enable row level security;

-- Threads + messages: visible to the mailbox owner (user_id = auth.uid())
-- AND to other org members so reps in the same workspace can see each
-- other's outreach. Service role bypasses for the sync function.
drop policy if exists lit_email_threads_select on public.lit_email_threads;
create policy lit_email_threads_select on public.lit_email_threads
  for select using (
    user_id = auth.uid()
    or org_id in (select org_id from public.org_members where user_id = auth.uid())
  );
drop policy if exists lit_email_threads_update on public.lit_email_threads;
create policy lit_email_threads_update on public.lit_email_threads
  for update using (
    user_id = auth.uid()
    or org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

drop policy if exists lit_email_messages_select on public.lit_email_messages;
create policy lit_email_messages_select on public.lit_email_messages
  for select using (
    user_id = auth.uid()
    or org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

comment on table public.lit_email_threads is
  'One row per email conversation in a connected Gmail/Microsoft 365 mailbox. Aggregates last_message_at + counts; joinable to campaign / contact / company for cross-page inbox views.';
comment on table public.lit_email_messages is
  'One row per email message (inbound or outbound). body_html drives rich rendering in the inbox UI; raw_headers preserves Message-ID + threading metadata for reply continuation.';
