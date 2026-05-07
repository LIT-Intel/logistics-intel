-- 20260504200000 — Campaign recipient roster.
--
-- lit_campaign_contacts is the per-recipient lifecycle table the
-- dispatcher reads from to know who to send what next, and writes back
-- to as events arrive (sent, opened, clicked, replied, bounced).
--
-- Existing tables it stitches together:
--   lit_campaigns        — owns the campaign
--   lit_campaign_steps   — the sequence the recipient walks
--   lit_companies / lit_contacts — the source-of-truth person + company
--   lit_email_accounts   — which mailbox sends FROM (resolved at send time
--                          via lit_campaigns.send_from_email_account_id —
--                          added in a follow-up if/when multi-inbox lands)
--
-- Why this row exists at all (vs. just walking lit_contacts at send time):
--   1. Send order is per-recipient: "Bob is on day 5, Alice is on day 1".
--   2. Suppression is per-recipient: bounced once -> never retry.
--   3. Reply detection updates a SINGLE row, not the contact globally
--      (the same person could be in two campaigns).

-- ─── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.lit_campaign_contacts (
  id              uuid primary key default gen_random_uuid(),

  -- Ownership / RLS
  org_id          uuid references public.organizations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,

  -- Linkage
  campaign_id     uuid not null references public.lit_campaigns(id) on delete cascade,
  contact_id      uuid references public.lit_contacts(id) on delete set null,
  company_id      uuid references public.lit_companies(id) on delete set null,
  current_step_id uuid references public.lit_campaign_steps(id) on delete set null,

  -- Denormalized recipient identity. We carry these on the row so that
  -- if lit_contacts is deleted (data hygiene, GDPR), audit history of
  -- who-was-sent-what survives.
  email           text not null,
  first_name      text,
  last_name       text,
  display_name    text,
  title           text,
  linkedin_url    text,
  phone           text,

  -- Lifecycle. Allowed values:
  --   pending      — added but not yet queued for first step
  --   queued       — dispatcher will send at next_send_at
  --   sent         — first step delivered to mailbox API
  --   delivered    — provider confirmed delivery (Gmail/Graph webhook)
  --   opened       — at least one open recorded (tracking pixel)
  --   clicked      — at least one click recorded
  --   replied      — reply detected, removed from sequence
  --   bounced      — hard bounce, removed from sequence
  --   unsubscribed — recipient opted out, removed from sequence
  --   failed       — non-bounce send failure (token revoked, quota, etc.)
  --   skipped      — globally suppressed at send time
  --   completed    — walked entire sequence without reply
  status          text not null default 'pending'
                    check (status in (
                      'pending','queued','sent','delivered',
                      'opened','clicked','replied','bounced',
                      'unsubscribed','failed','skipped','completed'
                    )),

  -- Scheduling. Dispatcher polls rows where status in ('pending','queued')
  -- AND next_send_at <= now() with limit + locking.
  next_send_at    timestamptz,
  last_sent_at    timestamptz,
  last_error      text,

  -- Free-form merge variables. Populated by the enrichment writer with
  -- whatever provider-specific extras we want available at template time
  -- (e.g. {{job_function}}, {{seniority}}, {{department}}). Always a
  -- jsonb object, never null, so substitution code can safely spread it.
  merge_vars      jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Same person attached twice to the same campaign = update, not duplicate.
  -- email is lower-cased at write time by the enrichment / API layer.
  constraint lit_campaign_contacts_unique_email_per_campaign
    unique (campaign_id, email)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
-- Dispatcher hot path: who's due to send right now?
create index if not exists lit_campaign_contacts_due_idx
  on public.lit_campaign_contacts (next_send_at)
  where status in ('pending','queued');

-- "All recipients on campaign X" + filter by status — list view.
create index if not exists lit_campaign_contacts_campaign_status_idx
  on public.lit_campaign_contacts (campaign_id, status);

-- Suppression checks at send time (does this email exist in ANY of my
-- org's campaigns with bounced/unsubscribed status?). Covers the
-- per-org dedupe + bounce-aware send filter.
create index if not exists lit_campaign_contacts_org_email_idx
  on public.lit_campaign_contacts (org_id, lower(email));

-- Reverse lookups — who's on this campaign from this company?
create index if not exists lit_campaign_contacts_company_idx
  on public.lit_campaign_contacts (company_id)
  where company_id is not null;

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.set_lit_campaign_contacts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_lit_campaign_contacts_updated_at
  on public.lit_campaign_contacts;

create trigger trg_lit_campaign_contacts_updated_at
  before update on public.lit_campaign_contacts
  for each row
  execute function public.set_lit_campaign_contacts_updated_at();

-- ─── Row-level security ──────────────────────────────────────────────────────
alter table public.lit_campaign_contacts enable row level security;

-- Members of the owning org can read.
drop policy if exists lit_campaign_contacts_select on public.lit_campaign_contacts;
create policy lit_campaign_contacts_select
  on public.lit_campaign_contacts
  for select
  using (
    org_id in (
      select org_id from public.org_members where user_id = auth.uid()
    )
  );

-- Members of the owning org can insert/update/delete (typical app flow:
-- frontend adds recipients via supabase.from(...).insert under the
-- caller's session; service role bypasses for the dispatcher).
drop policy if exists lit_campaign_contacts_insert on public.lit_campaign_contacts;
create policy lit_campaign_contacts_insert
  on public.lit_campaign_contacts
  for insert
  with check (
    org_id in (
      select org_id from public.org_members where user_id = auth.uid()
    )
  );

drop policy if exists lit_campaign_contacts_update on public.lit_campaign_contacts;
create policy lit_campaign_contacts_update
  on public.lit_campaign_contacts
  for update
  using (
    org_id in (
      select org_id from public.org_members where user_id = auth.uid()
    )
  );

drop policy if exists lit_campaign_contacts_delete on public.lit_campaign_contacts;
create policy lit_campaign_contacts_delete
  on public.lit_campaign_contacts
  for delete
  using (
    org_id in (
      select org_id from public.org_members where user_id = auth.uid()
    )
  );

comment on table public.lit_campaign_contacts is
  'Per-recipient roster for outbound campaigns. One row = one (campaign, recipient email). Drives dispatcher scheduling + persists provider lifecycle events. See migration 20260504200000.';
