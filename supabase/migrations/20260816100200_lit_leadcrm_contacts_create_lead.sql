-- Lead-CRM Phase 2 — Part 3: lead contacts RPC, manual create-lead RPC, and
-- company_* fields folded into the existing list/get lead RPCs.

-- ── Read the existing lit_contacts for a lead's recognized company.
-- Read-only, membership-gated. Reuses the product's company-scoped lit_contacts
-- (company_id FK) — the same rows the Command Center contact cards render.
create or replace function public.lit_leadcrm_lead_contacts(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path to 'public'
as $$
declare v_cid uuid; v_rows jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  select company_id into v_cid from public.lit_admin_leads where id = p_lead_id;
  if v_cid is null then
    return jsonb_build_object('ok', true, 'company_linked', false, 'contacts', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by (t.email is not null) desc, t.full_name), '[]'::jsonb)
    into v_rows
  from (
    select c.id, c.full_name, c.title, c.email, c.phone, c.linkedin_url,
           c.email_verification_status, c.enrichment_status,
           c.city, c.state, c.country_code
    from public.lit_contacts c
    where c.company_id = v_cid
    order by (c.email is not null) desc, c.full_name
    limit 100
  ) t;

  return jsonb_build_object('ok', true, 'company_linked', true, 'contacts', v_rows);
end;
$$;

comment on function public.lit_leadcrm_lead_contacts(uuid) is
  'Existing lit_contacts for the lead''s recognized company. Read-only, membership-gated. 0 provider credits.';

-- ── Manually create (or merge) an opportunity. Idempotent on email.
-- Same object as inbound leads (primary_source = 'manual'), then auto-runs the
-- company recognizer and seeds a 'created' activity.
create or replace function public.lit_leadcrm_create_lead(
  p_email        text,
  p_full_name    text default null,
  p_company_name text default null,
  p_stage_id     uuid default null,
  p_assignee     uuid default null,
  p_notes        text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email    citext;
  v_lead_id  uuid;
  v_existing uuid;
  v_stage    uuid := p_stage_id;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  v_email := nullif(btrim(lower(p_email)), '')::citext;
  if v_email is null or v_email::text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;

  -- Idempotent: if a lead with this email already exists, return it (merge in
  -- any newly-supplied name/company/notes without clobbering existing values).
  select id into v_existing from public.lit_admin_leads where email = v_email;
  if v_existing is not null then
    update public.lit_admin_leads
       set full_name    = coalesce(nullif(btrim(p_full_name),''), full_name),
           company_name = coalesce(nullif(btrim(p_company_name),''), company_name),
           assigned_to  = coalesce(p_assignee, assigned_to),
           stage_id     = coalesce(p_stage_id, stage_id),
           notes        = coalesce(nullif(btrim(p_notes),''), notes),
           updated_at   = now()
     where id = v_existing;
    -- Re-run recognition in case the company name was just filled in.
    perform public.lit_leadcrm_recognize_company(v_existing);
    return jsonb_build_object('ok', true, 'lead_id', v_existing, 'created', false, 'merged', true);
  end if;

  -- Default stage = lowest-position (New) when not supplied.
  if v_stage is null then
    select id into v_stage from public.lit_lead_pipeline_stages order by position asc limit 1;
  end if;

  insert into public.lit_admin_leads
    (email, full_name, company_name, primary_source, stage_id, assigned_to, notes,
     status, first_seen_at, last_activity_at)
  values
    (v_email, nullif(btrim(p_full_name),''), nullif(btrim(p_company_name),''),
     'manual', v_stage, p_assignee, nullif(btrim(p_notes),''),
     'open', now(), now())
  returning id into v_lead_id;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (v_lead_id, 'created',
          jsonb_build_object('email', v_email::text, 'source', 'manual',
                             'company', nullif(btrim(p_company_name),'')),
          auth.uid(), 'manual');

  if p_assignee is not null then
    insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
    values (v_lead_id, 'assignment',
            jsonb_build_object('assignee_user_id', p_assignee), auth.uid(), 'manual');
  end if;

  -- Best-effort auto-recognition (cached reads only).
  perform public.lit_leadcrm_recognize_company(v_lead_id);

  return jsonb_build_object('ok', true, 'lead_id', v_lead_id, 'created', true, 'merged', false);
end;
$$;

comment on function public.lit_leadcrm_create_lead(text,text,text,uuid,uuid,text) is
  'Manually add an opportunity (primary_source=manual). Idempotent on email; auto-runs company recognition.';

-- ── Fold company_* fields into the existing list + get lead RPCs so the list
-- rows can show logos and the drawer can render the company panel without an
-- extra round-trip. (Re-create the two functions with the added fields.)

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
      l.company_id, l.source_company_key, l.company_domain, l.company_logo_url,
      l.company_country, l.company_city, l.company_state, l.company_recognized_at,
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
      'company_id', l.company_id, 'source_company_key', l.source_company_key,
      'company_domain', l.company_domain, 'company_logo_url', l.company_logo_url,
      'company_country', l.company_country, 'company_city', l.company_city,
      'company_state', l.company_state, 'company_recognized_at', l.company_recognized_at,
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

-- Grants for the new RPCs (list/get keep their existing grants via replace).
revoke all on function public.lit_leadcrm_lead_contacts(uuid) from public;
revoke all on function public.lit_leadcrm_create_lead(text,text,text,uuid,uuid,text) from public;
grant execute on function public.lit_leadcrm_lead_contacts(uuid) to authenticated;
grant execute on function public.lit_leadcrm_create_lead(text,text,text,uuid,uuid,text) to authenticated;
