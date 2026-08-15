-- Lead-CRM CORE completion (part 1): extend pipeline_summary + kanban board RPC.
-- Additive: existing keys (stages/totals/conversion_rates) are preserved; the
-- eligibility filter (public leads + non-internal + non-suspended) matches the
-- rest of the lead-CRM RPCs so counts are honest and consistent.

-- ── 1. Extend pipeline_summary with new_this_week / unassigned / avg_score ────
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
    where l.user_id is null
       or (not public.is_internal_user(l.user_id) and not public.is_suspended_or_banned(l.user_id))
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

-- ── 2. Kanban board: leads grouped + capped per stage in ONE round trip ──────
-- Returns { ok, stages:[{stage_id, stage_name, color, position, total, leads:[…capped]}] }.
-- Same eligibility filter as list_leads/pipeline_summary. p_limit_per_stage caps
-- the rendered cards; `total` gives the true column count so the UI can show
-- "+N more". Ordered by score desc then recent activity so the top of each
-- column is the hottest lead.
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
