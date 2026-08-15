-- Lead-CRM Phase 1 — Part 4: Lead-CRM RPCs (all SECURITY DEFINER, gated by is_lead_crm_member).

-- Stages (ordered).
create or replace function public.lit_leadcrm_stages()
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'position', position,
      'is_won', is_won, 'is_lost', is_lost, 'color', color, 'win_probability', win_probability
    ) order by position), '[]'::jsonb)
    from public.lit_lead_pipeline_stages
  );
end;
$$;

-- List leads (filtered, paginated).
create or replace function public.lit_leadcrm_list_leads(
  p_stage_id uuid    default null,
  p_source   text    default null,
  p_assignee uuid    default null,
  p_q        text    default null,
  p_limit    int     default 100,
  p_offset   int     default 0
)
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare v_rows jsonb; v_total int;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  select count(*) into v_total
  from public.lit_admin_leads l
  where (p_stage_id is null or l.stage_id = p_stage_id)
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
      l.first_seen_at, l.email_captured_at, l.signup_at, l.trial_started_at,
      l.converted_at, l.last_activity_at, l.is_stale
    from public.lit_admin_leads l
    left join public.lit_lead_pipeline_stages st on st.id = l.stage_id
    left join public.profiles ap on ap.id = l.assigned_to
    left join public.lit_user_activation act on act.user_id = l.user_id
    where (p_stage_id is null or l.stage_id = p_stage_id)
      and (p_source   is null or l.primary_source = p_source)
      and (p_assignee is null or l.assigned_to = p_assignee)
      and (p_q is null or p_q = '' or
           l.email::text ilike '%'||p_q||'%' or coalesce(l.full_name,'') ilike '%'||p_q||'%'
           or coalesce(l.company_name,'') ilike '%'||p_q||'%')
    order by l.last_activity_at desc nulls last
    limit greatest(1, least(coalesce(p_limit,100), 500))
    offset greatest(0, coalesce(p_offset,0))
  ) t;

  return jsonb_build_object('ok', true, 'total', v_total, 'leads', v_rows);
end;
$$;

-- Single lead detail.
create or replace function public.lit_leadcrm_get_lead(p_lead_id uuid)
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare v jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  select jsonb_build_object(
    'ok', true,
    'lead', jsonb_build_object(
      'id', l.id, 'email', l.email::text, 'full_name', l.full_name, 'company_name', l.company_name,
      'primary_source', l.primary_source, 'magnet_slug', l.magnet_slug,
      'utm_source', l.utm_source, 'utm_medium', l.utm_medium, 'utm_campaign', l.utm_campaign,
      'stage_id', l.stage_id, 'stage_name', st.name, 'stage_position', st.position, 'stage_color', st.color,
      'status', l.status, 'lead_score', l.lead_score,
      'assigned_to', l.assigned_to, 'assignee_email', ap.email, 'assignee_name', ap.full_name,
      'anonymous_id', l.anonymous_id, 'notes', l.notes, 'is_stale', l.is_stale,
      'first_seen_at', l.first_seen_at, 'email_captured_at', l.email_captured_at,
      'signup_at', l.signup_at, 'trial_started_at', l.trial_started_at,
      'converted_at', l.converted_at, 'last_activity_at', l.last_activity_at,
      'created_at', l.created_at, 'updated_at', l.updated_at
    ),
    'user', case when l.user_id is null then null else jsonb_build_object(
      'user_id', l.user_id, 'email', up.email, 'full_name', up.full_name,
      'company_name', coalesce(up.company_name, up.organization_name)
    ) end,
    'subscription', (
      select jsonb_build_object('status', s.status, 'plan_code', s.plan_code,
                                'trial_ends_at', s.trial_ends_at,
                                'current_period_end', s.current_period_end)
      from public.subscriptions s where s.user_id = l.user_id
      order by s.updated_at desc nulls last limit 1
    ),
    'activation', case when l.user_id is null then null else (
      select jsonb_build_object('current_plan', a.current_plan, 'current_status', a.current_status,
                                'signup_at', a.signup_at, 'trial_started_at', a.trial_started_at,
                                'converted_paid_at', a.converted_paid_at, 'last_active_at', a.last_active_at,
                                'activity_count_30d', a.activity_count_30d)
      from public.lit_user_activation a where a.user_id = l.user_id
    ) end
  ) into v
  from public.lit_admin_leads l
  left join public.lit_lead_pipeline_stages st on st.id = l.stage_id
  left join public.profiles ap on ap.id = l.assigned_to
  left join public.profiles up on up.id = l.user_id
  where l.id = p_lead_id;

  if v is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  return v;
end;
$$;

-- Unified timeline (bounded to last 200).
create or replace function public.lit_leadcrm_lead_timeline(p_lead_id uuid)
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
declare
  v_email  citext;
  v_user   uuid;
  v_anon   text;
  v_rows   jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  select email, user_id, anonymous_id into v_email, v_user, v_anon
  from public.lit_admin_leads where id = p_lead_id;
  if v_email is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  with unified as (
    -- 1) native lead activity
    select a.occurred_at, a.kind, coalesce(a.source,'system') as source,
           a.kind as title,
           a.body as detail
    from public.lit_lead_activity a
    where a.lead_id = p_lead_id

    -- 2) magnet events (by anonymous_id)
    union all
    select e.created_at, 'magnet_event', 'magnet',
           e.event_name,
           jsonb_build_object('magnet_slug', e.magnet_slug, 'metadata', e.metadata)
    from public.lit_lead_magnet_events e
    where v_anon is not null and e.anonymous_id = v_anon

    -- 3) product usage (searches/saves/enrich) via usage_ledger (by user_id)
    union all
    select ul.created_at, 'usage', 'product',
           ul.feature_key || coalesce(':'||ul.action_key,''),
           jsonb_build_object('feature', ul.feature_key, 'action', ul.action_key, 'qty', ul.quantity)
    from public.lit_usage_ledger ul
    where v_user is not null and ul.user_id = v_user

    -- 4) product activity events (by user_id)
    union all
    select ae.created_at, ae.event_type, 'product',
           ae.event_type,
           coalesce(ae.metadata, '{}'::jsonb)
    from public.lit_activity_events ae
    where v_user is not null and ae.user_id = v_user

    -- 5) email opens/clicks — resend events (by recipient email)
    union all
    select re.created_at, coalesce(re.event_type,'email'), 'email',
           coalesce(re.subject, re.event_type, 'email'),
           jsonb_build_object('event_type', re.event_type, 'click_url', re.click_url, 'template_id', re.template_id)
    from public.lit_resend_events re
    where re.email_to is not null and lower(re.email_to) = v_email::text

    -- 5b) email webhook events (by recipient in to_emails jsonb array)
    union all
    select we.created_at_provider, coalesce(we.event_type,'email'), 'email',
           coalesce(we.subject, we.event_type, 'email'),
           jsonb_build_object('event_type', we.event_type, 'provider', we.provider)
    from public.email_webhook_events we
    where we.to_emails is not null
      and exists (select 1 from jsonb_array_elements_text(we.to_emails) x where lower(x) = v_email::text)

    -- 6) demo invite lifecycle (by prospect email)
    union all
    select coalesce(di.sent_at, di.created_at), 'demo_sent', 'demo',
           'Demo invite sent',
           jsonb_build_object('status', di.status, 'company', di.prospect_company)
    from public.lit_demo_invites di
    where lower(di.prospect_email) = v_email::text
  )
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) into v_rows
  from (
    select occurred_at, kind, source, title, detail
    from unified
    where occurred_at is not null
    order by occurred_at desc
    limit 200
  ) t;

  return jsonb_build_object('ok', true, 'timeline', v_rows);
end;
$$;

-- Set stage (trigger logs the change) + manual note with reason. Marks manual_override.
create or replace function public.lit_leadcrm_set_stage(
  p_lead_id uuid, p_stage_id uuid, p_reason text default null
)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v_is_lost boolean; v_is_won boolean;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  if not exists (select 1 from public.lit_lead_pipeline_stages where id = p_stage_id) then
    raise exception 'invalid stage';
  end if;
  select is_lost, is_won into v_is_lost, v_is_won from public.lit_lead_pipeline_stages where id = p_stage_id;

  update public.lit_admin_leads
     set stage_id = p_stage_id,
         manual_override = true,
         status = case when v_is_won then 'converted' when v_is_lost then 'lost' else status end,
         converted_at = case when v_is_won then coalesce(converted_at, now()) else converted_at end,
         updated_at = now()
   where id = p_lead_id;

  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  if p_reason is not null and p_reason <> '' then
    insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
    values (p_lead_id, 'note', jsonb_build_object('reason', p_reason, 'context', 'stage_change'), auth.uid(), 'manual');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- Assign lead.
create or replace function public.lit_leadcrm_assign(
  p_lead_id uuid, p_assignee_user_id uuid
)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v_name text; v_email text;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  update public.lit_admin_leads set assigned_to = p_assignee_user_id, updated_at = now()
   where id = p_lead_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  select full_name, email into v_name, v_email from public.profiles where id = p_assignee_user_id;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (p_lead_id, 'assignment',
          jsonb_build_object('assignee_user_id', p_assignee_user_id, 'assignee_email', v_email, 'assignee_name', v_name),
          auth.uid(), 'manual');

  return jsonb_build_object('ok', true, 'assigned_to', p_assignee_user_id);
end;
$$;

-- Add a note.
create or replace function public.lit_leadcrm_add_note(p_lead_id uuid, p_body text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  if not exists (select 1 from public.lit_admin_leads where id = p_lead_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (p_lead_id, 'note', jsonb_build_object('text', p_body), auth.uid(), 'manual')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'activity_id', v_id);
end;
$$;

-- Log a manual call/email touch.
create or replace function public.lit_leadcrm_log_touch(
  p_lead_id uuid, p_channel text, p_body text
)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  if not exists (select 1 from public.lit_admin_leads where id = p_lead_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (p_lead_id, 'touch', jsonb_build_object('channel', p_channel, 'text', p_body), auth.uid(), 'manual')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'activity_id', v_id);
end;
$$;

-- Pipeline summary (per-stage counts + funnel + conversion rates). Excludes internal/suspended.
create or replace function public.lit_leadcrm_pipeline_summary()
returns jsonb
language plpgsql security definer stable
set search_path to 'public'
as $$
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
    select st.id, st.name, st.position, count(e.id) as cnt
    from public.lit_lead_pipeline_stages st
    left join eligible e on e.stage_id = st.id
    group by st.id, st.name, st.position
    order by st.position
  ),
  totals as (
    select
      count(*) as total_leads,
      count(*) filter (where position >= 1 and not is_lost) as reached_contacted,
      count(*) filter (where position >= 2 and not is_lost) as reached_engaged,
      count(*) filter (where position >= 3 and not is_lost) as reached_trial,
      count(*) filter (where is_won) as subscribers,
      count(*) filter (where is_lost) as lost
    from eligible
  )
  select jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'stages', (select coalesce(jsonb_agg(jsonb_build_object(
        'stage_id', id, 'stage', name, 'position', position, 'count', cnt
      ) order by position), '[]'::jsonb) from by_stage),
    'totals', (select jsonb_build_object(
        'total_leads', total_leads,
        'contacted', reached_contacted,
        'engaged', reached_engaged,
        'trial', reached_trial,
        'subscriber', subscribers,
        'lost', lost
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
$$;

-- Grants.
revoke all on function public.lit_leadcrm_stages() from public;
revoke all on function public.lit_leadcrm_list_leads(uuid,text,uuid,text,int,int) from public;
revoke all on function public.lit_leadcrm_get_lead(uuid) from public;
revoke all on function public.lit_leadcrm_lead_timeline(uuid) from public;
revoke all on function public.lit_leadcrm_set_stage(uuid,uuid,text) from public;
revoke all on function public.lit_leadcrm_assign(uuid,uuid) from public;
revoke all on function public.lit_leadcrm_add_note(uuid,text) from public;
revoke all on function public.lit_leadcrm_log_touch(uuid,text,text) from public;
revoke all on function public.lit_leadcrm_pipeline_summary() from public;

grant execute on function public.lit_leadcrm_stages() to authenticated;
grant execute on function public.lit_leadcrm_list_leads(uuid,text,uuid,text,int,int) to authenticated;
grant execute on function public.lit_leadcrm_get_lead(uuid) to authenticated;
grant execute on function public.lit_leadcrm_lead_timeline(uuid) to authenticated;
grant execute on function public.lit_leadcrm_set_stage(uuid,uuid,text) to authenticated;
grant execute on function public.lit_leadcrm_assign(uuid,uuid) to authenticated;
grant execute on function public.lit_leadcrm_add_note(uuid,text) to authenticated;
grant execute on function public.lit_leadcrm_log_touch(uuid,text,text) to authenticated;
grant execute on function public.lit_leadcrm_pipeline_summary() to authenticated;
