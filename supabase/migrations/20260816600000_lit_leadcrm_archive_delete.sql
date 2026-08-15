-- ============================================================================
-- Lead CRM — Delete + Archive, and hide merged/archived/deleted everywhere.
--
-- Context: the internal Lead-CRM (/app/leads) let members merge duplicate leads
-- (Phase 4 added lit_admin_leads.merged_into_lead_id) but list/board/summary
-- still surfaced the merged dupes, and there was no way to archive or remove a
-- lead. This migration:
--
--   1. Adds archived_at + deleted_at to lit_admin_leads (SOFT delete only — no
--      row is ever hard-deleted by members; activity is preserved).
--   2. Adds membership-gated RPCs: archive / delete (soft) / restore, plus a
--      platform-admin-only hard purge kept behind an explicit confirm flag.
--   3. Patches list_leads to accept a status filter (active | archived | deleted)
--      and, by default (active), hides rows where
--         merged_into_lead_id is null AND archived_at is null AND deleted_at is null.
--   4. Patches board + pipeline_summary + all report RPCs to always exclude
--      merged/archived/deleted (these are the "active pipeline" surfaces).
--
-- Everything stays SECURITY DEFINER + gated on public.is_lead_crm_member().
-- ============================================================================

-- 1. Columns ────────────────────────────────────────────────────────────────
alter table public.lit_admin_leads
  add column if not exists archived_at timestamptz null,
  add column if not exists deleted_at  timestamptz null;

-- Partial indexes so the "is it active" predicate stays cheap on the hot paths.
create index if not exists lit_admin_leads_active_idx
  on public.lit_admin_leads (last_activity_at desc)
  where merged_into_lead_id is null and archived_at is null and deleted_at is null;

create index if not exists lit_admin_leads_archived_idx
  on public.lit_admin_leads (archived_at desc)
  where archived_at is not null and deleted_at is null;

create index if not exists lit_admin_leads_deleted_idx
  on public.lit_admin_leads (deleted_at desc)
  where deleted_at is not null;

-- 2. Archive / Delete (soft) / Restore / Purge RPCs ─────────────────────────

-- Archive (or un-archive) a lead. Logs an activity so the timeline records it.
create or replace function public.lit_leadcrm_archive_lead(
  p_lead_id uuid,
  p_archived boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_exists boolean;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  if p_lead_id is null then return jsonb_build_object('ok', false, 'reason', 'lead_required'); end if;

  select true into v_exists from public.lit_admin_leads where id = p_lead_id;
  if not v_exists then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  update public.lit_admin_leads
     set archived_at = case when p_archived then coalesce(archived_at, now()) else null end,
         updated_at  = now()
   where id = p_lead_id;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (
    p_lead_id,
    case when p_archived then 'archived' else 'unarchived' end,
    jsonb_build_object('archived', p_archived),
    auth.uid(),
    'manual'
  );

  return jsonb_build_object('ok', true, 'lead_id', p_lead_id, 'archived', p_archived);
end;
$function$;

-- Soft-delete a lead. Never hard-deletes; sets deleted_at and logs 'deleted'.
create or replace function public.lit_leadcrm_delete_lead(
  p_lead_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_exists boolean;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  if p_lead_id is null then return jsonb_build_object('ok', false, 'reason', 'lead_required'); end if;

  select true into v_exists from public.lit_admin_leads where id = p_lead_id;
  if not v_exists then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  update public.lit_admin_leads
     set deleted_at = coalesce(deleted_at, now()),
         updated_at = now()
   where id = p_lead_id;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (p_lead_id, 'deleted', jsonb_build_object('soft', true), auth.uid(), 'manual');

  return jsonb_build_object('ok', true, 'lead_id', p_lead_id, 'deleted', true);
end;
$function$;

-- Restore a lead from archived and/or deleted state.
create or replace function public.lit_leadcrm_restore_lead(
  p_lead_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_exists boolean;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  if p_lead_id is null then return jsonb_build_object('ok', false, 'reason', 'lead_required'); end if;

  select true into v_exists from public.lit_admin_leads where id = p_lead_id;
  if not v_exists then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  update public.lit_admin_leads
     set archived_at = null,
         deleted_at  = null,
         updated_at  = now()
   where id = p_lead_id;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (p_lead_id, 'restored', jsonb_build_object('restored', true), auth.uid(), 'manual');

  return jsonb_build_object('ok', true, 'lead_id', p_lead_id, 'restored', true);
end;
$function$;

-- Platform-admin-only HARD delete. Kept behind an explicit confirm flag so it
-- can never fire by accident. Purges the lead + its activity/tasks. Members who
-- are not platform admins cannot call this.
create or replace function public.lit_leadcrm_purge_lead(
  p_lead_id uuid,
  p_confirm boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_platform_admin(auth.uid()) then raise exception 'not authorized'; end if;
  if p_lead_id is null then return jsonb_build_object('ok', false, 'reason', 'lead_required'); end if;
  if p_confirm is not true then return jsonb_build_object('ok', false, 'reason', 'confirm_required'); end if;

  delete from public.lit_lead_tasks    where lead_id = p_lead_id;
  delete from public.lit_lead_activity where lead_id = p_lead_id;
  delete from public.lit_admin_leads   where id      = p_lead_id;

  return jsonb_build_object('ok', true, 'lead_id', p_lead_id, 'purged', true);
end;
$function$;

grant execute on function public.lit_leadcrm_archive_lead(uuid, boolean) to authenticated;
grant execute on function public.lit_leadcrm_delete_lead(uuid)           to authenticated;
grant execute on function public.lit_leadcrm_restore_lead(uuid)          to authenticated;
grant execute on function public.lit_leadcrm_purge_lead(uuid, boolean)   to authenticated;

-- 3. list_leads — status filter + active-by-default exclusion ────────────────
-- p_status: 'active' (default) hides merged+archived+deleted; 'archived' shows
-- only archived (not deleted); 'deleted' shows only soft-deleted; 'all' shows
-- everything except merged dupes. The new signature adds a trailing p_status
-- arg (with a default). supabase-js calls by NAMED params, so callers that omit
-- p_status still resolve to this function via the default. We DROP the prior
-- 6-arg overload so the two don't coexist (which would (a) leave a version that
-- ignores merged/archived/deleted and (b) make positional/untyped-null calls
-- ambiguous).
drop function if exists public.lit_leadcrm_list_leads(uuid, text, uuid, text, integer, integer);

create or replace function public.lit_leadcrm_list_leads(
  p_stage_id uuid    default null,
  p_source   text    default null,
  p_assignee uuid    default null,
  p_q        text    default null,
  p_limit    integer default 100,
  p_offset   integer default 0,
  p_status   text    default 'active'
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_rows   jsonb;
  v_total  int;
  v_status text := lower(coalesce(nullif(btrim(p_status), ''), 'active'));
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  select count(*) into v_total
  from public.lit_admin_leads l
  where l.merged_into_lead_id is null
    and (
      case v_status
        when 'archived' then (l.archived_at is not null and l.deleted_at is null)
        when 'deleted'  then (l.deleted_at is not null)
        when 'all'      then true
        else                 (l.archived_at is null and l.deleted_at is null)  -- active
      end
    )
    and (p_stage_id is null or l.stage_id = p_stage_id)
    and (p_source   is null or l.primary_source = p_source)
    and (p_assignee is null or l.assigned_to = p_assignee)
    and (p_q is null or p_q = '' or
         l.email::text ilike '%'||p_q||'%' or coalesce(l.full_name,'') ilike '%'||p_q||'%'
         or coalesce(l.company_name,'') ilike '%'||p_q||'%');

  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) into v_rows
  from (
    select
      l.id, l.email::text as email, l.full_name, l.company_name,
      l.primary_source, l.magnet_slug, l.status, l.lead_score,
      l.stage_id, st.name as stage_name, st.position as stage_position, st.color as stage_color,
      l.assigned_to,
      ap.email as assignee_email, ap.full_name as assignee_name,
      l.user_id,
      act.current_plan, act.current_status,
      l.company_id, l.source_company_key, l.company_domain, l.company_logo_url,
      l.company_country, l.company_city, l.company_state, l.company_recognized_at,
      l.first_seen_at, l.email_captured_at, l.signup_at, l.trial_started_at,
      l.converted_at, l.last_activity_at, l.is_stale,
      l.archived_at, l.deleted_at
    from public.lit_admin_leads l
    left join public.lit_lead_pipeline_stages st on st.id = l.stage_id
    left join public.profiles ap on ap.id = l.assigned_to
    left join public.lit_user_activation act on act.user_id = l.user_id
    where l.merged_into_lead_id is null
      and (
        case v_status
          when 'archived' then (l.archived_at is not null and l.deleted_at is null)
          when 'deleted'  then (l.deleted_at is not null)
          when 'all'      then true
          else                 (l.archived_at is null and l.deleted_at is null)  -- active
        end
      )
      and (p_stage_id is null or l.stage_id = p_stage_id)
      and (p_source   is null or l.primary_source = p_source)
      and (p_assignee is null or l.assigned_to = p_assignee)
      and (p_q is null or p_q = '' or
           l.email::text ilike '%'||p_q||'%' or coalesce(l.full_name,'') ilike '%'||p_q||'%'
           or coalesce(l.company_name,'') ilike '%'||p_q||'%')
    order by l.last_activity_at desc nulls last
    limit greatest(1, least(coalesce(p_limit,100), 500))
    offset greatest(0, coalesce(p_offset,0))
  ) t;

  return jsonb_build_object('ok', true, 'total', v_total, 'leads', v_rows, 'status', v_status);
end;
$function$;

grant execute on function public.lit_leadcrm_list_leads(uuid, text, uuid, text, integer, integer, text) to authenticated;

-- 4a. board — exclude merged/archived/deleted from the active kanban ─────────
create or replace function public.lit_leadcrm_board(p_limit_per_stage integer default 50)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_cap int := greatest(1, least(coalesce(p_limit_per_stage, 50), 200)); v_result jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  with eligible as (
    select
      l.id, l.email::text as email, l.full_name, l.company_name,
      l.primary_source, l.magnet_slug, l.status, l.lead_score,
      l.stage_id, l.assigned_to,
      ap.full_name as assignee_name, ap.email as assignee_email,
      l.company_domain, l.company_logo_url,
      l.last_activity_at,
      row_number() over (
        partition by l.stage_id
        order by l.lead_score desc nulls last, l.last_activity_at desc nulls last
      ) as rn
    from public.lit_admin_leads l
    left join public.profiles ap on ap.id = l.assigned_to
    where l.stage_id is not null
      and l.merged_into_lead_id is null
      and l.archived_at is null
      and l.deleted_at is null
      and (l.user_id is null
        or (not public.is_internal_user(l.user_id) and not public.is_suspended_or_banned(l.user_id)))
  ),
  counts as (
    select stage_id, count(*) as total from eligible group by stage_id
  )
  select jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'stages', coalesce(jsonb_agg(
      jsonb_build_object(
        'stage_id', st.id,
        'stage_name', st.name,
        'color', st.color,
        'position', st.position,
        'is_won', st.is_won,
        'is_lost', st.is_lost,
        'total', coalesce(c.total, 0),
        'leads', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', e.id, 'email', e.email, 'full_name', e.full_name,
            'company_name', e.company_name, 'company_domain', e.company_domain,
            'company_logo_url', e.company_logo_url, 'primary_source', e.primary_source,
            'magnet_slug', e.magnet_slug, 'status', e.status, 'lead_score', e.lead_score,
            'stage_id', e.stage_id, 'assigned_to', e.assigned_to,
            'assignee_name', e.assignee_name, 'last_activity_at', e.last_activity_at
          ) order by e.lead_score desc nulls last, e.last_activity_at desc nulls last)
          from eligible e where e.stage_id = st.id and e.rn <= v_cap
        ), '[]'::jsonb)
      ) order by st.position
    ), '[]'::jsonb)
  ) into v_result
  from public.lit_lead_pipeline_stages st
  left join counts c on c.stage_id = st.id;

  return v_result;
end;
$function$;

grant execute on function public.lit_leadcrm_board(integer) to authenticated;

-- 4b. pipeline_summary — exclude merged/archived/deleted ─────────────────────
create or replace function public.lit_leadcrm_pipeline_summary()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_result jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  with eligible as (
    select l.*, st.name as stage_name, st.position, st.is_won, st.is_lost
    from public.lit_admin_leads l
    join public.lit_lead_pipeline_stages st on st.id = l.stage_id
    where l.merged_into_lead_id is null
      and l.archived_at is null
      and l.deleted_at is null
      and (l.user_id is null
       or (not public.is_internal_user(l.user_id) and not public.is_suspended_or_banned(l.user_id)))
  ),
  by_stage as (
    select st.id, st.name, st.position, st.color, count(e.id) as cnt
    from public.lit_lead_pipeline_stages st
    left join eligible e on e.stage_id = st.id
    group by st.id, st.name, st.position, st.color
    order by st.position
  ),
  totals as (
    select
      count(*) as total_leads,
      count(*) filter (where position >= 1 and not is_lost) as reached_contacted,
      count(*) filter (where position >= 2 and not is_lost) as reached_engaged,
      count(*) filter (where position >= 3 and not is_lost) as reached_trial,
      count(*) filter (where is_won) as subscribers,
      count(*) filter (where is_lost) as lost,
      count(*) filter (where coalesce(email_captured_at, first_seen_at, created_at) >= (now() - interval '7 days')) as new_this_week,
      count(*) filter (where assigned_to is null and not is_won and not is_lost) as unassigned,
      round(avg(lead_score) filter (where lead_score is not null), 0) as avg_score
    from eligible
  )
  select jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'stages', (select coalesce(jsonb_agg(jsonb_build_object(
        'stage_id', id, 'stage', name, 'position', position, 'count', cnt, 'color', color
      ) order by position), '[]'::jsonb) from by_stage),
    'totals', (select jsonb_build_object(
        'total_leads', total_leads,
        'contacted', reached_contacted,
        'engaged', reached_engaged,
        'trial', reached_trial,
        'subscriber', subscribers,
        'lost', lost,
        'new_this_week', new_this_week,
        'unassigned', unassigned,
        'avg_score', avg_score
      ) from totals),
    'conversion_rates', (select jsonb_build_object(
        'lead_to_contacted', case when total_leads>0 then round(reached_contacted::numeric*100/total_leads,1) else 0 end,
        'lead_to_engaged',   case when total_leads>0 then round(reached_engaged::numeric*100/total_leads,1) else 0 end,
        'lead_to_trial',     case when total_leads>0 then round(reached_trial::numeric*100/total_leads,1) else 0 end,
        'lead_to_subscriber',case when total_leads>0 then round(subscribers::numeric*100/total_leads,1) else 0 end,
        'trial_to_subscriber', case when reached_trial>0 then round(subscribers::numeric*100/reached_trial,1) else 0 end
      ) from totals)
  ) into v_result;

  return v_result;
end;
$function$;

grant execute on function public.lit_leadcrm_pipeline_summary() to authenticated;

-- 4c. Reports — exclude merged/archived/deleted so metrics match the active
--     pipeline. (find_duplicates already filters merged; leave it as-is.)
create or replace function public.lit_leadcrm_report_funnel(p_days integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_since timestamptz; v jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  v_since := now() - make_interval(days => greatest(1, coalesce(p_days, 30)));

  with eligible as (
    select l.*, st.position, st.is_won, st.is_lost
    from public.lit_admin_leads l
    join public.lit_lead_pipeline_stages st on st.id = l.stage_id
    where l.created_at >= v_since
      and l.merged_into_lead_id is null
      and l.archived_at is null
      and l.deleted_at is null
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
$function$;

create or replace function public.lit_leadcrm_report_by_source(p_days integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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
      and l.merged_into_lead_id is null
      and l.archived_at is null
      and l.deleted_at is null
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
$function$;

create or replace function public.lit_leadcrm_report_by_rep(p_days integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_since timestamptz; v jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  v_since := now() - make_interval(days => greatest(1, coalesce(p_days, 30)));

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
      and l.merged_into_lead_id is null
      and l.archived_at is null
      and l.deleted_at is null
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
$function$;

create or replace function public.lit_leadcrm_report_won_lost(p_days integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_since timestamptz; v jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  v_since := now() - make_interval(days => greatest(1, coalesce(p_days, 30)));

  with eligible as (
    select l.*, st.is_won, st.is_lost
    from public.lit_admin_leads l
    join public.lit_lead_pipeline_stages st on st.id = l.stage_id
    where l.created_at >= v_since
      and l.merged_into_lead_id is null
      and l.archived_at is null
      and l.deleted_at is null
      and (l.user_id is null
           or (not public.is_internal_user(l.user_id) and not public.is_suspended_or_banned(l.user_id)))
  ),
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
$function$;

create or replace function public.lit_leadcrm_report_velocity(p_days integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_since timestamptz; v jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  v_since := now() - make_interval(days => greatest(1, coalesce(p_days, 30)));

  with eligible as (
    select l.*
    from public.lit_admin_leads l
    where l.merged_into_lead_id is null
      and l.archived_at is null
      and l.deleted_at is null
      and (l.user_id is null
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
$function$;

grant execute on function public.lit_leadcrm_report_funnel(integer)    to authenticated;
grant execute on function public.lit_leadcrm_report_by_source(integer) to authenticated;
grant execute on function public.lit_leadcrm_report_by_rep(integer)    to authenticated;
grant execute on function public.lit_leadcrm_report_won_lost(integer)  to authenticated;
grant execute on function public.lit_leadcrm_report_velocity(integer)  to authenticated;
