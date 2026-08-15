-- Lead-CRM Phase 4 — Part 1: Lifecycle REPORTING RPCs.
--
-- Five SECURITY DEFINER, membership-gated report functions backing the Reports
-- tab. Every one excludes internal/suspended users (mirrors the eligibility
-- filter in lit_leadcrm_pipeline_summary) so the numbers reflect real prospects
-- only. All take p_days (7 / 30 / 90) and window on the lead's created_at unless
-- a lifecycle timestamp is more meaningful (noted inline).
--
-- No fabricated numbers: counts are honest (zero when there is no data), and
-- conversion rates guard divide-by-zero → 0.

-- ── Funnel: lifecycle counts + conversion % between adjacent stages ──────────
create or replace function public.lit_leadcrm_report_funnel(p_days int default 30)
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare v_since timestamptz; v jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  v_since := now() - make_interval(days => greatest(1, coalesce(p_days, 30)));

  with eligible as (
    select l.*, st.position, st.is_won, st.is_lost
    from public.lit_admin_leads l
    join public.lit_lead_pipeline_stages st on st.id = l.stage_id
    where l.created_at >= v_since
      and (l.user_id is null
           or (not public.is_internal_user(l.user_id) and not public.is_suspended_or_banned(l.user_id)))
  ),
  t as (
    select
      count(*)                                              as leads,
      count(*) filter (where position >= 1 and not is_lost) as contacted,
      count(*) filter (where position >= 2 and not is_lost) as engaged,
      count(*) filter (where position >= 3 and not is_lost) as trial,
      count(*) filter (where is_won)                        as subscriber,
      count(*) filter (where is_lost)                       as lost
    from eligible
  )
  select jsonb_build_object(
    'ok', true,
    'days', greatest(1, coalesce(p_days, 30)),
    'generated_at', now(),
    'steps', jsonb_build_array(
      jsonb_build_object('key','leads',      'label','Leads',      'count', leads),
      jsonb_build_object('key','contacted',  'label','Contacted',  'count', contacted),
      jsonb_build_object('key','engaged',    'label','Engaged',    'count', engaged),
      jsonb_build_object('key','trial',      'label','Trial',      'count', trial),
      jsonb_build_object('key','subscriber', 'label','Subscriber', 'count', subscriber)
    ),
    'lost', lost,
    'conversions', jsonb_build_object(
      'leads_to_contacted',      case when leads>0     then round(contacted::numeric*100/leads,1)     else 0 end,
      'contacted_to_engaged',    case when contacted>0 then round(engaged::numeric*100/contacted,1)   else 0 end,
      'engaged_to_trial',        case when engaged>0   then round(trial::numeric*100/engaged,1)       else 0 end,
      'trial_to_subscriber',     case when trial>0     then round(subscriber::numeric*100/trial,1)    else 0 end,
      'leads_to_subscriber',     case when leads>0     then round(subscriber::numeric*100/leads,1)    else 0 end
    )
  ) into v from t;

  return coalesce(v, jsonb_build_object('ok', true, 'steps', '[]'::jsonb));
end;
$$;

-- ── By source / utm_source: which channel produces subscribers ──────────────
create or replace function public.lit_leadcrm_report_by_source(p_days int default 30)
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare v_since timestamptz; v jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  v_since := now() - make_interval(days => greatest(1, coalesce(p_days, 30)));

  with eligible as (
    select
      coalesce(nullif(trim(l.utm_source),''), nullif(trim(l.primary_source),''), 'unknown') as source,
      st.position, st.is_won
    from public.lit_admin_leads l
    join public.lit_lead_pipeline_stages st on st.id = l.stage_id
    where l.created_at >= v_since
      and (l.user_id is null
           or (not public.is_internal_user(l.user_id) and not public.is_suspended_or_banned(l.user_id)))
  ),
  agg as (
    select source,
      count(*)                                    as leads,
      count(*) filter (where position >= 3)       as trials,
      count(*) filter (where is_won)              as subscribers
    from eligible
    group by source
  )
  select jsonb_build_object(
    'ok', true,
    'days', greatest(1, coalesce(p_days, 30)),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'source', source,
      'leads', leads,
      'trials', trials,
      'subscribers', subscribers,
      'conversion', case when leads>0 then round(subscribers::numeric*100/leads,1) else 0 end
    ) order by subscribers desc, leads desc), '[]'::jsonb)
  ) into v from agg;

  return coalesce(v, jsonb_build_object('ok', true, 'rows', '[]'::jsonb));
end;
$$;

-- ── By rep: assigned / worked / trials / subscribers / open + overdue tasks ──
create or replace function public.lit_leadcrm_report_by_rep(p_days int default 30)
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare v_since timestamptz; v jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  v_since := now() - make_interval(days => greatest(1, coalesce(p_days, 30)));

  -- Universe of reps = lead-CRM members ∪ platform admins.
  with reps as (
    select user_id from public.lit_lead_crm_members
    union
    select user_id from public.platform_admins
  ),
  eligible_leads as (
    select l.*, st.position, st.is_won
    from public.lit_admin_leads l
    join public.lit_lead_pipeline_stages st on st.id = l.stage_id
    where l.created_at >= v_since
      and (l.user_id is null
           or (not public.is_internal_user(l.user_id) and not public.is_suspended_or_banned(l.user_id)))
  ),
  assigned as (
    select assigned_to as uid,
      count(*)                              as assigned,
      count(*) filter (where position >= 3) as trials,
      count(*) filter (where is_won)        as subscribers
    from eligible_leads
    where assigned_to is not null
    group by assigned_to
  ),
  worked as (
    -- distinct leads a rep touched (activity as actor) in window
    select a.actor_user_id as uid, count(distinct a.lead_id) as worked
    from public.lit_lead_activity a
    where a.actor_user_id is not null and a.occurred_at >= v_since
    group by a.actor_user_id
  ),
  tasks as (
    select assignee_user_id as uid,
      count(*) filter (where status = 'open')                                        as open_tasks,
      count(*) filter (where status = 'open' and due_date is not null and due_date < current_date) as overdue_tasks
    from public.lit_lead_tasks
    where assignee_user_id is not null
    group by assignee_user_id
  )
  select jsonb_build_object(
    'ok', true,
    'days', greatest(1, coalesce(p_days, 30)),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'user_id', r.user_id,
      'name', coalesce(nullif(trim(pr.full_name),''), split_part(coalesce(pr.email,'teammate'), '@', 1)),
      'email', pr.email,
      'assigned', coalesce(a.assigned, 0),
      'worked', coalesce(w.worked, 0),
      'trials', coalesce(a.trials, 0),
      'subscribers', coalesce(a.subscribers, 0),
      'open_tasks', coalesce(tk.open_tasks, 0),
      'overdue_tasks', coalesce(tk.overdue_tasks, 0)
    ) order by coalesce(a.subscribers,0) desc, coalesce(a.assigned,0) desc), '[]'::jsonb)
  ) into v
  from reps r
  left join public.profiles pr on pr.id = r.user_id
  left join assigned a on a.uid = r.user_id
  left join worked   w on w.uid = r.user_id
  left join tasks   tk on tk.uid = r.user_id;

  return coalesce(v, jsonb_build_object('ok', true, 'rows', '[]'::jsonb));
end;
$$;

-- ── Velocity: avg days lead→trial and trial→subscriber + created/converted series ──
create or replace function public.lit_leadcrm_report_velocity(p_days int default 30)
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare v_since timestamptz; v jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  v_since := now() - make_interval(days => greatest(1, coalesce(p_days, 30)));

  with eligible as (
    select l.*
    from public.lit_admin_leads l
    where (l.user_id is null
           or (not public.is_internal_user(l.user_id) and not public.is_suspended_or_banned(l.user_id)))
  ),
  windowed as (
    select * from eligible where created_at >= v_since
  ),
  velo as (
    select
      avg(extract(epoch from (trial_started_at - coalesce(first_seen_at, created_at))) / 86400.0)
        filter (where trial_started_at is not null and trial_started_at >= v_since) as days_to_trial,
      avg(extract(epoch from (converted_at - trial_started_at)) / 86400.0)
        filter (where converted_at is not null and trial_started_at is not null and converted_at >= v_since) as days_trial_to_sub
    from eligible
  ),
  days as (
    select generate_series(
      date_trunc('day', v_since),
      date_trunc('day', now()),
      interval '1 day'
    )::date as d
  ),
  created_by_day as (
    select date_trunc('day', created_at)::date as d, count(*) as n
    from windowed group by 1
  ),
  converted_by_day as (
    select date_trunc('day', converted_at)::date as d, count(*) as n
    from eligible where converted_at is not null and converted_at >= v_since group by 1
  )
  select jsonb_build_object(
    'ok', true,
    'days', greatest(1, coalesce(p_days, 30)),
    'avg_days_lead_to_trial', (select case when days_to_trial is null then null else round(days_to_trial::numeric,1) end from velo),
    'avg_days_trial_to_subscriber', (select case when days_trial_to_sub is null then null else round(days_trial_to_sub::numeric,1) end from velo),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', to_char(dd.d, 'YYYY-MM-DD'),
        'created', coalesce(c.n, 0),
        'converted', coalesce(cv.n, 0)
      ) order by dd.d)
      from days dd
      left join created_by_day c on c.d = dd.d
      left join converted_by_day cv on cv.d = dd.d
    ), '[]'::jsonb)
  ) into v;

  return coalesce(v, jsonb_build_object('ok', true, 'series', '[]'::jsonb));
end;
$$;

-- ── Won / Lost: subscriber vs lost counts + lost reasons (from activity notes) ──
create or replace function public.lit_leadcrm_report_won_lost(p_days int default 30)
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare v_since timestamptz; v jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  v_since := now() - make_interval(days => greatest(1, coalesce(p_days, 30)));

  with eligible as (
    select l.*, st.is_won, st.is_lost
    from public.lit_admin_leads l
    join public.lit_lead_pipeline_stages st on st.id = l.stage_id
    where l.created_at >= v_since
      and (l.user_id is null
           or (not public.is_internal_user(l.user_id) and not public.is_suspended_or_banned(l.user_id)))
  ),
  -- Lost reasons: the reason text captured on the stage-change note (context='stage_change')
  -- for leads currently in a lost stage. Best-effort — null reasons bucket as 'Unspecified'.
  lost_leads as (
    select id from eligible where is_lost
  ),
  reasons as (
    select coalesce(nullif(trim(a.body->>'reason'),''), 'Unspecified') as reason, count(*) as n
    from public.lit_lead_activity a
    join lost_leads ll on ll.id = a.lead_id
    where a.kind = 'note' and a.body ? 'reason'
    group by 1
  )
  select jsonb_build_object(
    'ok', true,
    'days', greatest(1, coalesce(p_days, 30)),
    'won', (select count(*) from eligible where is_won),
    'lost', (select count(*) from eligible where is_lost),
    'lost_reasons', coalesce((
      select jsonb_agg(jsonb_build_object('reason', reason, 'count', n) order by n desc)
      from reasons
    ), '[]'::jsonb)
  ) into v;

  return coalesce(v, jsonb_build_object('ok', true, 'won', 0, 'lost', 0, 'lost_reasons', '[]'::jsonb));
end;
$$;

-- ── Audit trail (platform-admin only): who did what across all leads ─────────
create or replace function public.lit_leadcrm_audit(p_days int default 30, p_limit int default 200)
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare v_since timestamptz; v jsonb;
begin
  -- Accountability layer is platform-admin only (broader than membership).
  if not public.is_platform_admin(auth.uid()) then raise exception 'not authorized'; end if;
  v_since := now() - make_interval(days => greatest(1, coalesce(p_days, 30)));

  select jsonb_build_object(
    'ok', true,
    'days', greatest(1, coalesce(p_days, 30)),
    'rows', coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.occurred_at desc), '[]'::jsonb)
  ) into v
  from (
    select
      a.occurred_at,
      a.kind,
      coalesce(a.source, 'system') as source,
      a.lead_id,
      coalesce(nullif(trim(l.full_name),''), l.company_name, l.email::text, 'Lead') as lead_label,
      a.actor_user_id,
      coalesce(nullif(trim(pr.full_name),''), split_part(coalesce(pr.email,''), '@', 1), 'System') as actor_name,
      pr.email as actor_email
    from public.lit_lead_activity a
    left join public.lit_admin_leads l on l.id = a.lead_id
    left join public.profiles pr on pr.id = a.actor_user_id
    where a.occurred_at >= v_since
      and a.actor_user_id is not null          -- human actions only (the accountability layer)
    order by a.occurred_at desc
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
  ) t;

  return coalesce(v, jsonb_build_object('ok', true, 'rows', '[]'::jsonb));
end;
$$;

-- Grants.
revoke all on function public.lit_leadcrm_report_funnel(int)    from public;
revoke all on function public.lit_leadcrm_report_by_source(int)  from public;
revoke all on function public.lit_leadcrm_report_by_rep(int)     from public;
revoke all on function public.lit_leadcrm_report_velocity(int)   from public;
revoke all on function public.lit_leadcrm_report_won_lost(int)   from public;
revoke all on function public.lit_leadcrm_audit(int,int)         from public;

grant execute on function public.lit_leadcrm_report_funnel(int)    to authenticated;
grant execute on function public.lit_leadcrm_report_by_source(int)  to authenticated;
grant execute on function public.lit_leadcrm_report_by_rep(int)     to authenticated;
grant execute on function public.lit_leadcrm_report_velocity(int)   to authenticated;
grant execute on function public.lit_leadcrm_report_won_lost(int)   to authenticated;
grant execute on function public.lit_leadcrm_audit(int,int)         to authenticated;
