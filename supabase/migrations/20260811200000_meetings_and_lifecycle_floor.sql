-- Lifecycle engine foundation (2026-08-11, applied to prod via MCP):
-- Cal.com meeting tracking + no-show auto-enrollment + weekly-nurture
-- eligibility.

create table if not exists public.lit_meetings (
  id uuid primary key default gen_random_uuid(),
  cal_booking_uid text unique,
  attendee_email text not null,
  attendee_name text,
  organizer_email text,
  event_type text,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes int,
  status text not null default 'booked'
    check (status in ('booked','rescheduled','cancelled','completed','no_show')),
  outcome_note text,
  raw_payload jsonb,
  demo_invite_id uuid references public.lit_demo_invites(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lit_meetings_email_idx on public.lit_meetings (lower(attendee_email));
create index if not exists lit_meetings_status_idx on public.lit_meetings (status);

alter table public.lit_meetings enable row level security;
drop policy if exists meetings_internal_select on public.lit_meetings;
create policy meetings_internal_select on public.lit_meetings
  for select to authenticated
  using (exists (
    select 1 from public.org_members om
    join public.organizations o on o.id = om.org_id
    where om.user_id = auth.uid() and o.is_internal = true
  ));
drop policy if exists meetings_internal_update on public.lit_meetings;
create policy meetings_internal_update on public.lit_meetings
  for update to authenticated
  using (exists (
    select 1 from public.org_members om
    join public.organizations o on o.id = om.org_id
    where om.user_id = auth.uid() and o.is_internal = true
  ));

-- No-show → auto-enroll the meeting-no-show sequence (2 steps, code-defined
-- in the marketing dispatcher). Idempotent per meeting.
create or replace function public.lit_enroll_no_show_sequence()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'no_show' and (old.status is distinct from 'no_show') then
    if not exists (
      select 1 from public.lit_lead_sequence_queue q
      where lower(q.email) = lower(new.attendee_email)
        and q.sequence_key = 'meeting-no-show'
        and q.created_at > now() - interval '30 days'
    ) then
      insert into public.lit_lead_sequence_queue (email, sequence_key, step, send_at, subject, source)
      values
        (lower(new.attendee_email), 'meeting-no-show', 1, now() + interval '2 hours',
         'We missed you — want to grab another time?', 'cal-no-show'),
        (lower(new.attendee_email), 'meeting-no-show', 2, now() + interval '4 days',
         'The 5-minute version of what we were going to show you', 'cal-no-show');
    end if;
  end if;
  return new;
exception when others then
  raise warning 'lit_enroll_no_show_sequence threw: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_meeting_no_show_enroll on public.lit_meetings;
create trigger trg_meeting_no_show_enroll
after update on public.lit_meetings
for each row execute function public.lit_enroll_no_show_sequence();

-- Weekly-nurture eligibility: every distinct opted-in address across leads,
-- demo requests/invites, and expired trials that has no pending sequence
-- email and no lit-weekly send in the last 6 days. Consumed by the weekly
-- enrollment cron (service-role-only execute).
create or replace function public.lit_weekly_nurture_candidates()
returns table (email text)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  with audience as (
    select lower(email) as email from public.lit_leads where email is not null
    union
    select lower(email) from public.lit_demo_requests where email is not null
    union
    select lower(prospect_email) from public.lit_demo_invites
    union
    select lower(u.email) from auth.users u
    join public.subscriptions s on s.user_id = u.id
    where s.plan_code = 'free_trial' and s.status in ('expired','trialing')
  )
  select a.email from audience a
  where not exists (select 1 from public.lit_email_unsubscribes un where lower(un.recipient_email) = a.email)
    and not exists (select 1 from public.lit_email_suppression_list sup where lower(sup.email) = a.email)
    and not exists (
      select 1 from public.lit_lead_sequence_queue q
      where lower(q.email) = a.email and q.sent_at is null and q.failed_at is null
    )
    and not exists (
      select 1 from public.lit_lead_sequence_queue q
      where lower(q.email) = a.email and q.sequence_key = 'lit-weekly'
        and q.created_at > now() - interval '6 days'
    )
    and not exists (
      select 1 from auth.users u
      join public.subscriptions s on s.user_id = u.id
      where lower(u.email) = a.email and s.status = 'active' and s.plan_code <> 'free_trial'
    )
$$;

revoke execute on function public.lit_weekly_nurture_candidates() from public, anon, authenticated;
grant execute on function public.lit_weekly_nurture_candidates() to service_role;
