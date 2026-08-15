-- Lead-CRM Phase 1 — Part 3c: seed bounded historical activity for backfilled leads.
-- Best-effort, bounded. The 'created' rows already exist via trigger; add milestone + magnet-event rows.
-- Disable the touch trigger during bulk seed to avoid churn; we recompute last_activity_at at the end.

alter table public.lit_lead_activity disable trigger trg_lit_lead_activity_touch;

-- Milestone activity from lead timestamps (email captured / signup / trial / converted).
insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source, occurred_at)
select l.id, 'email_captured', jsonb_build_object('email', l.email::text), null, 'magnet', l.email_captured_at
from public.lit_admin_leads l where l.email_captured_at is not null;

insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source, occurred_at)
select l.id, 'signup', jsonb_build_object('user_id', l.user_id), null, 'product', l.signup_at
from public.lit_admin_leads l where l.signup_at is not null;

insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source, occurred_at)
select l.id, 'trial_started', '{}'::jsonb, null, 'product', l.trial_started_at
from public.lit_admin_leads l where l.trial_started_at is not null;

insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source, occurred_at)
select l.id, 'converted', '{}'::jsonb, null, 'product', l.converted_at
from public.lit_admin_leads l where l.converted_at is not null;

-- Magnet events (bounded to 20 most-recent per lead) matched by anonymous_id.
insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source, occurred_at)
select lead_id, kind, body, null, 'magnet', occurred_at from (
  select l.id as lead_id,
         'magnet_event' as kind,
         jsonb_build_object('event', e.event_name, 'magnet_slug', e.magnet_slug) as body,
         e.created_at as occurred_at,
         row_number() over (partition by l.id order by e.created_at desc) as rn
  from public.lit_admin_leads l
  join public.lit_lead_magnet_events e
    on e.anonymous_id is not null and e.anonymous_id = l.anonymous_id
) t
where rn <= 20;

alter table public.lit_lead_activity enable trigger trg_lit_lead_activity_touch;

-- Recompute last_activity_at from the max activity occurred_at (fallback to first_seen_at).
update public.lit_admin_leads l
set last_activity_at = greatest(
      coalesce((select max(a.occurred_at) from public.lit_lead_activity a where a.lead_id = l.id), 'epoch'::timestamptz),
      coalesce(l.last_activity_at, 'epoch'::timestamptz),
      coalesce(l.first_seen_at, 'epoch'::timestamptz))
where true;
