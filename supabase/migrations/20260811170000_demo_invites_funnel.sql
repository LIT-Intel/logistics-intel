-- Demo-invite sales funnel (2026-08-11) — enterprise admin Phase 2.
--
-- Outbound demo invitations sent by members of the internal (LIT) org,
-- with the full prospect journey resolved automatically on one row:
--   sent → delivered → opened → clicked → signed_up → trialing → upgraded
-- Sources: Resend webhook events (delivery/open/click via resend_email_id),
-- auth.users INSERT (signup match by email), subscriptions UPDATE (paid
-- match by user). No polling — everything is trigger-driven.

alter table public.organizations
  add column if not exists is_internal boolean not null default false;

comment on column public.organizations.is_internal is
  'True for LIT''s own workspace(s). Gates internal tools like demo invites.';

update public.organizations set is_internal = true
where id = '7a16be7f-b6b9-499e-8618-533373970f7c';

create table if not exists public.lit_demo_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id),
  sender_user_id uuid not null,
  sender_email text,
  prospect_email text not null,
  prospect_name text,
  prospect_company text,
  personal_note text,
  resend_email_id text,
  -- Highest funnel stage reached. bounced is terminal-bad.
  status text not null default 'sent'
    check (status in ('sent','delivered','opened','clicked','signed_up','trialing','upgraded','bounced')),
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  signed_up_at timestamptz,
  signed_up_user_id uuid,
  trial_started_at timestamptz,
  upgraded_at timestamptz,
  upgraded_plan_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lit_demo_invites_email_idx on public.lit_demo_invites (lower(prospect_email));
create index if not exists lit_demo_invites_resend_idx on public.lit_demo_invites (resend_email_id);
create index if not exists lit_demo_invites_sender_idx on public.lit_demo_invites (sender_user_id);

alter table public.lit_demo_invites enable row level security;

-- Members of internal orgs can read the funnel. Writes go through the
-- send-demo-invite edge fn (service role) and the triggers below.
drop policy if exists demo_invites_internal_select on public.lit_demo_invites;
create policy demo_invites_internal_select on public.lit_demo_invites
  for select to authenticated
  using (exists (
    select 1 from public.org_members om
    join public.organizations o on o.id = om.org_id
    where om.user_id = auth.uid() and o.is_internal = true
  ));

create or replace function public.lit_demo_invite_stage_rank(s text)
returns int language sql immutable as $$
  select case s
    when 'bounced' then 0
    when 'sent' then 1
    when 'delivered' then 2
    when 'opened' then 3
    when 'clicked' then 4
    when 'signed_up' then 5
    when 'trialing' then 6
    when 'upgraded' then 7
    else 1 end
$$;

-- 1. Resend webhook events → invite stage. Matched on resend_email_id.
create or replace function public.lit_demo_invite_sync_email_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_stage text;
begin
  if new.provider is distinct from 'resend' or new.email_id is null then
    return new;
  end if;

  v_stage := case new.event_type
    when 'delivered' then 'delivered'
    when 'opened' then 'opened'
    when 'clicked' then 'clicked'
    when 'bounced' then 'bounced'
    else null end;
  if v_stage is null then return new; end if;

  update public.lit_demo_invites di
  set
    delivered_at = case when v_stage = 'delivered' and di.delivered_at is null then now() else di.delivered_at end,
    opened_at    = case when v_stage = 'opened'    and di.opened_at    is null then now() else di.opened_at end,
    clicked_at   = case when v_stage = 'clicked'   and di.clicked_at   is null then now() else di.clicked_at end,
    bounced_at   = case when v_stage = 'bounced'   and di.bounced_at   is null then now() else di.bounced_at end,
    status = case
      when v_stage = 'bounced' then 'bounced'
      when public.lit_demo_invite_stage_rank(v_stage) > public.lit_demo_invite_stage_rank(di.status) then v_stage
      else di.status end,
    updated_at = now()
  where di.resend_email_id = new.email_id;

  return new;
exception when others then
  raise warning 'lit_demo_invite_sync_email_event threw: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_demo_invite_email_sync on public.email_webhook_events;
create trigger trg_demo_invite_email_sync
after insert on public.email_webhook_events
for each row execute function public.lit_demo_invite_sync_email_event();

-- 2. Signup match: prospect creates an account → signed_up (+ trialing,
-- since org bootstrap grants the trial at signup).
create or replace function public.lit_demo_invite_sync_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.lit_demo_invites di
  set
    signed_up_at = coalesce(di.signed_up_at, now()),
    signed_up_user_id = coalesce(di.signed_up_user_id, new.id),
    trial_started_at = coalesce(di.trial_started_at, now()),
    status = case
      when public.lit_demo_invite_stage_rank('trialing') > public.lit_demo_invite_stage_rank(di.status)
      then 'trialing' else di.status end,
    updated_at = now()
  where lower(di.prospect_email) = lower(new.email)
    and di.signed_up_at is null;
  return new;
exception when others then
  raise warning 'lit_demo_invite_sync_signup threw: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_demo_invite_signup_sync on auth.users;
create trigger trg_demo_invite_signup_sync
after insert on auth.users
for each row execute function public.lit_demo_invite_sync_signup();

-- 3. Paid match: prospect's subscription goes active on a paid plan.
create or replace function public.lit_demo_invite_sync_upgrade()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'active' and coalesce(new.plan_code, 'free_trial') <> 'free_trial' then
    update public.lit_demo_invites di
    set
      upgraded_at = coalesce(di.upgraded_at, now()),
      upgraded_plan_code = coalesce(di.upgraded_plan_code, new.plan_code),
      status = 'upgraded',
      updated_at = now()
    where di.signed_up_user_id = new.user_id
      and di.upgraded_at is null;
  end if;
  return new;
exception when others then
  raise warning 'lit_demo_invite_sync_upgrade threw: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_demo_invite_upgrade_sync on public.subscriptions;
create trigger trg_demo_invite_upgrade_sync
after insert or update on public.subscriptions
for each row execute function public.lit_demo_invite_sync_upgrade();
