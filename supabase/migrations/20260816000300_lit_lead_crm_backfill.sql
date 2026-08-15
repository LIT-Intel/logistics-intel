-- Lead-CRM Phase 1 — Part 3b: backfill lit_admin_leads from all lead sources.
-- Deduped on lower(email); user_id resolved; internal + suspended/banned excluded.
-- Idempotent: only inserts emails not already present.

with stage_ids as (
  select
    (select id from public.lit_lead_pipeline_stages where position=0) as s_new,
    (select id from public.lit_lead_pipeline_stages where position=1) as s_contacted,
    (select id from public.lit_lead_pipeline_stages where position=2) as s_engaged,
    (select id from public.lit_lead_pipeline_stages where position=3) as s_trial,
    (select id from public.lit_lead_pipeline_stages where position=4) as s_subscriber
),
magnet as (
  select lower(email) as email,
         null::uuid as user_id,
         max(anonymous_id) as anonymous_id,
         'lead_magnet'::text as src,
         max(magnet_slug) as magnet_slug,
         max(utm_source) as utm_source, max(utm_medium) as utm_medium, max(utm_campaign) as utm_campaign,
         min(coalesce(session_started_at, created_at)) as first_seen_at,
         min(email_captured_at) as email_captured_at,
         min(signup_at) as signup_at,
         min(trial_started_at) as trial_started_at,
         min(converted_at) as converted_at,
         bool_or(first_search_at is not null or first_save_at is not null) as engaged_sig,
         false as contacted_sig
  from public.lit_lead_magnet_sessions
  where email is not null and length(trim(email)) > 0
  group by lower(email)
),
signups as (
  select lower(u.email) as email,
         u.id as user_id,
         null::text as anonymous_id,
         'signup'::text as src,
         null::text as magnet_slug,
         a.first_touch_utm_source, a.first_touch_utm_medium, a.first_touch_utm_campaign,
         u.created_at as first_seen_at,
         null::timestamptz as email_captured_at,
         coalesce(a.signup_at, u.created_at) as signup_at,
         a.trial_started_at,
         a.converted_paid_at as converted_at,
         (a.first_search_at is not null or a.first_save_at is not null
           or coalesce(a.activity_count_30d,0) > 0) as engaged_sig,
         false as contacted_sig
  from auth.users u
  left join public.lit_user_activation a on a.user_id = u.id
  where u.email is not null
),
leads_tbl as (
  select lower(email) as email,
         null::uuid as user_id,
         null::text as anonymous_id,
         'lead'::text as src,
         null::text as magnet_slug,
         nullif(first_touch->>'utm_source','') as utm_source,
         nullif(first_touch->>'utm_medium','') as utm_medium,
         nullif(first_touch->>'utm_campaign','') as utm_campaign,
         min(created_at) as first_seen_at,
         min(created_at) as email_captured_at,
         null::timestamptz as signup_at,
         null::timestamptz as trial_started_at,
         null::timestamptz as converted_at,
         false as engaged_sig,
         false as contacted_sig
  from public.lit_leads
  where email is not null and length(trim(email)) > 0
  group by lower(email),
           nullif(first_touch->>'utm_source',''), nullif(first_touch->>'utm_medium',''), nullif(first_touch->>'utm_campaign','')
),
demo as (
  select lower(prospect_email) as email,
         (array_remove(array_agg(signed_up_user_id), null))[1] as user_id,
         null::text as anonymous_id,
         'demo_invite'::text as src,
         null::text as magnet_slug,
         null::text as utm_source, null::text as utm_medium, null::text as utm_campaign,
         min(created_at) as first_seen_at,
         null::timestamptz as email_captured_at,
         min(signed_up_at) as signup_at,
         min(trial_started_at) as trial_started_at,
         min(upgraded_at) as converted_at,
         bool_or(opened_at is not null or clicked_at is not null) as engaged_sig,
         bool_or(sent_at is not null or delivered_at is not null) as contacted_sig
  from public.lit_demo_invites
  where prospect_email is not null and length(trim(prospect_email)) > 0
  group by lower(prospect_email)
),
unioned as (
  select * from magnet
  union all select * from signups
  union all select * from leads_tbl
  union all select * from demo
),
merged as (
  select
    email,
    (array_remove(array_agg(user_id), null))[1] as user_id,
    (array_remove(array_agg(anonymous_id), null))[1] as anonymous_id,
    -- primary_source precedence: signup > demo_invite > lead_magnet > lead
    coalesce(
      max(case when src='signup' then src end),
      max(case when src='demo_invite' then src end),
      max(case when src='lead_magnet' then src end),
      max(src)
    ) as primary_source,
    (array_remove(array_agg(magnet_slug), null))[1] as magnet_slug,
    (array_remove(array_agg(utm_source), null))[1]  as utm_source,
    (array_remove(array_agg(utm_medium), null))[1]  as utm_medium,
    (array_remove(array_agg(utm_campaign), null))[1] as utm_campaign,
    min(first_seen_at) as first_seen_at,
    min(email_captured_at) as email_captured_at,
    min(signup_at) as signup_at,
    min(trial_started_at) as trial_started_at,
    min(converted_at) as converted_at,
    bool_or(engaged_sig) as engaged_sig,
    bool_or(contacted_sig) as contacted_sig
  from unioned
  group by email
),
enriched as (
  select m.*,
    p.full_name as p_full_name,
    coalesce(p.company_name, p.organization_name) as p_company_name,
    -- subscriber signal: active/paid subscription OR converted_paid_at
    (exists (select 1 from public.subscriptions s
             where s.user_id = m.user_id and s.status in ('active'))
      or a.converted_paid_at is not null) as sub_paid,
    (a.trial_started_at is not null
      or exists (select 1 from public.subscriptions s
                 where s.user_id = m.user_id and s.status = 'trialing')) as trialing,
    (exists (select 1 from public.lit_activity_events e where e.user_id = m.user_id)
      or a.first_search_at is not null or a.first_save_at is not null) as acct_engaged,
    a.trial_started_at as a_trial_started_at,
    a.converted_paid_at as a_converted_at,
    a.signup_at as a_signup_at
  from merged m
  left join public.profiles p on p.id = m.user_id
  left join public.lit_user_activation a on a.user_id = m.user_id
),
-- exclude internal + suspended/banned (spam)
filtered as (
  select * from enriched e
  where e.user_id is null
     or (not public.is_internal_user(e.user_id) and not public.is_suspended_or_banned(e.user_id))
),
scored as (
  select f.*,
    (f.sub_paid) as is_subscriber,
    (f.trialing or f.a_trial_started_at is not null) as is_trial,
    (f.engaged_sig or f.acct_engaged) as is_engaged,
    (f.contacted_sig) as is_contacted
  from filtered f
),
final as (
  select s.*,
    public.lead_derived_stage(s.is_subscriber, s.is_trial, s.is_engaged, s.is_contacted) as stage_pos,
    -- lead_score: +5 lead, +20 signup, +15 engaged(search/save/activity), +30 trial, +50 subscriber
    ( 5
      + case when s.user_id is not null or s.signup_at is not null or s.a_signup_at is not null then 20 else 0 end
      + case when (s.engaged_sig or s.acct_engaged) then 15 else 0 end
      + case when (s.trialing or s.a_trial_started_at is not null) then 30 else 0 end
      + case when s.sub_paid then 50 else 0 end
    ) as lead_score
  from scored s
)
insert into public.lit_admin_leads (
  email, user_id, anonymous_id, full_name, company_name, primary_source, magnet_slug,
  utm_source, utm_medium, utm_campaign, stage_id, status, lead_score,
  first_seen_at, email_captured_at, signup_at, trial_started_at, converted_at, last_activity_at
)
select
  f.email::citext,
  f.user_id,
  f.anonymous_id,
  f.p_full_name,
  f.p_company_name,
  f.primary_source,
  f.magnet_slug,
  f.utm_source, f.utm_medium, f.utm_campaign,
  case f.stage_pos
    when 4 then (select s_subscriber from stage_ids)
    when 3 then (select s_trial from stage_ids)
    when 2 then (select s_engaged from stage_ids)
    when 1 then (select s_contacted from stage_ids)
    else (select s_new from stage_ids)
  end as stage_id,
  case when f.sub_paid then 'converted' else 'open' end as status,
  f.lead_score,
  f.first_seen_at,
  f.email_captured_at,
  coalesce(f.signup_at, f.a_signup_at),
  coalesce(f.a_trial_started_at, f.trial_started_at),
  coalesce(f.converted_at, f.a_converted_at),
  nullif(greatest(
    coalesce(f.converted_at, f.a_converted_at, 'epoch'::timestamptz),
    coalesce(f.a_trial_started_at, f.trial_started_at, 'epoch'::timestamptz),
    coalesce(f.signup_at, f.a_signup_at, 'epoch'::timestamptz),
    coalesce(f.email_captured_at, 'epoch'::timestamptz),
    coalesce(f.first_seen_at, 'epoch'::timestamptz)
  ), 'epoch'::timestamptz) as last_activity_at
from final f
where not exists (select 1 from public.lit_admin_leads l where l.email = f.email::citext)
  and f.email is not null and length(trim(f.email)) > 0;
