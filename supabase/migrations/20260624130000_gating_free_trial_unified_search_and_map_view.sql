-- Free-trial gating (applied to prod via MCP 2026-06-24):
-- (1) unified 5-search budget across Pulse + Company Search, counted over the
--     WHOLE trial (lifetime, not monthly);
-- (2) clicking companies (company_profile_view) is unlimited;
-- (3) a saved_map_view limit (free trial = 0; paid = unlimited).
-- Paid plans keep their existing separate per-feature monthly limits.
-- export_pdf is already 0 for free_trial (exports_per_month) — enforcement of the
-- client-side PDF download path is handled in app code, not here.

-- 1) New plan columns
alter table public.plans add column if not exists trial_search_limit integer;
alter table public.plans add column if not exists saved_map_views_limit integer;

-- 2) Values
update public.plans set trial_search_limit = 5,  saved_map_views_limit = 0    where code = 'free_trial';
update public.plans set saved_map_views_limit = null where code in ('starter','growth','scale','enterprise');
update public.plans set pulse_search_limit = 5, search_limit = 5 where code = 'free_trial';

-- 3) resolve_feature_limit: company_profile_view -> unlimited; add saved_map_view
create or replace function public.resolve_feature_limit(p_plan_code text, p_feature_key text)
 returns table(limit_value integer, kind text)
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_plan plans%rowtype;
begin
  select * into v_plan from plans where code = p_plan_code limit 1;
  if not found then select * into v_plan from plans where code = 'free_trial' limit 1; end if;
  case p_feature_key
    when 'company_search'       then limit_value := v_plan.search_limit;               kind := 'monthly';
    when 'company_profile_view' then limit_value := null;                              kind := 'monthly'; -- clicking companies is unlimited
    when 'saved_company'        then limit_value := v_plan.save_limit;                 kind := 'total';
    when 'saved_contact'        then limit_value := v_plan.saved_contacts_limit;       kind := 'total';
    when 'contact_enrichment'   then limit_value := v_plan.enrichment_limit;           kind := 'monthly';
    when 'pulse_brief'          then limit_value := v_plan.pulse_briefs_per_month;     kind := 'monthly';
    when 'pulse_ai'             then limit_value := v_plan.pulse_ai_limit;             kind := 'monthly';
    when 'pulse_search'         then limit_value := v_plan.pulse_search_limit;         kind := 'monthly';
    when 'saved_pulse_list'     then limit_value := v_plan.saved_pulse_lists_limit;    kind := 'total';
    when 'saved_map_view'       then limit_value := v_plan.saved_map_views_limit;      kind := 'total';
    when 'export_pdf'           then limit_value := v_plan.exports_per_month;          kind := 'monthly';
    when 'campaign_send'        then limit_value := v_plan.campaign_sends_per_month;   kind := 'monthly';
    when 'ai_brief'             then limit_value := v_plan.ai_brief_limit;             kind := 'monthly';
    when 'linkedin_touch'       then limit_value := v_plan.linkedin_touches_per_month; kind := 'monthly';
    when 'team_invite'          then limit_value := v_plan.included_seats;             kind := 'seat';
    else limit_value := null; kind := 'unknown';
  end case;
  return next;
end;
$function$;

-- 4) check_usage_limit: free-trial unified-search override + generic total-ledger branch
create or replace function public.check_usage_limit(p_org_id uuid, p_user_id uuid, p_feature_key text, p_quantity integer default 1)
 returns jsonb
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_plan_code text; v_limit integer; v_kind text; v_used integer := 0;
  v_period_start timestamptz; v_period_end timestamptz; v_is_admin boolean := false;
begin
  v_plan_code := public.resolve_plan_code(p_org_id, p_user_id);
  select limit_value, kind into v_limit, v_kind from public.resolve_feature_limit(v_plan_code, p_feature_key);

  if v_kind = 'unknown' then
    return jsonb_build_object('ok',false,'code','UNKNOWN_FEATURE','feature',p_feature_key,'plan',v_plan_code,
      'message',format('Unknown feature key: %s',p_feature_key));
  end if;

  -- FREE-TRIAL UNIFIED SEARCH BUDGET: Pulse Explorer + Company Search share ONE
  -- 5-search budget over the WHOLE trial (lifetime, not monthly). Paid plans fall
  -- through to their standard separate per-feature monthly limits below.
  if v_plan_code = 'free_trial' and p_feature_key in ('pulse_search','company_search') then
    select trial_search_limit into v_limit from plans where code = 'free_trial';
    v_kind := 'total';
    select coalesce(sum(quantity),0)::integer into v_used
      from lit_usage_ledger
     where feature_key in ('pulse_search','company_search')
       and ((p_org_id is not null and org_id = p_org_id) or (p_user_id is not null and user_id = p_user_id));
  elsif v_limit is not null and v_kind = 'monthly' then
    v_period_start := date_trunc('month', now());
    v_period_end   := v_period_start + interval '1 month';
    select coalesce(sum(quantity),0)::integer into v_used
      from lit_usage_ledger
     where feature_key = p_feature_key and created_at >= v_period_start and created_at < v_period_end
       and ((p_org_id is not null and org_id = p_org_id) or (p_user_id is not null and user_id = p_user_id));
  elsif v_kind = 'total' and p_feature_key = 'saved_company' then
    select count(*)::integer into v_used from lit_saved_companies where user_id = p_user_id;
  elsif v_kind = 'total' and p_feature_key = 'saved_pulse_list' then
    begin
      execute 'select count(*)::integer from pulse_saved_lists where owner_user_id = $1' into v_used using p_user_id;
    exception when undefined_table then
      select coalesce(sum(quantity),0)::integer into v_used from lit_usage_ledger
       where feature_key='saved_pulse_list' and ((p_org_id is not null and org_id=p_org_id) or (p_user_id is not null and user_id=p_user_id));
    end;
  elsif v_kind = 'total' and p_feature_key = 'saved_contact' then
    begin
      execute 'select count(*)::integer from lit_contacts where saved_by_user_id = $1' into v_used using p_user_id;
    exception when undefined_column or undefined_table then v_used := 0;
    end;
  elsif v_kind = 'seat' and p_feature_key = 'team_invite' then
    if p_org_id is not null then select count(*)::integer into v_used from org_members where org_id = p_org_id; else v_used := 0; end if;
  elsif v_kind = 'total' then
    -- generic lifetime ledger sum (covers saved_map_view + any future total key)
    select coalesce(sum(quantity),0)::integer into v_used from lit_usage_ledger
     where feature_key = p_feature_key and ((p_org_id is not null and org_id=p_org_id) or (p_user_id is not null and user_id=p_user_id));
  end if;

  if p_user_id is not null and public.is_platform_admin(p_user_id) then v_is_admin := true; end if;

  if v_is_admin then
    return jsonb_build_object('ok',true,'admin_bypass',true,'feature',p_feature_key,'used',v_used,'limit',v_limit,'plan',v_plan_code,
      'reset_at', case when v_kind='monthly' then v_period_end else null end);
  end if;

  if v_limit is null then
    return jsonb_build_object('ok',true,'feature',p_feature_key,'used',null,'limit',null,'plan',v_plan_code,'reset_at',null);
  end if;

  if (v_used + p_quantity) > v_limit then
    return jsonb_build_object('ok',false,'code','LIMIT_EXCEEDED','feature',p_feature_key,'used',v_used,'limit',v_limit,'plan',v_plan_code,
      'reset_at', case when v_kind='monthly' then v_period_end else null end,
      'upgrade_url','/app/billing','upgrade_required',true,
      'message', format('%s plan includes %s %s. Upgrade to continue.', initcap(v_plan_code), v_limit, replace(p_feature_key,'_',' ')));
  end if;

  return jsonb_build_object('ok',true,'feature',p_feature_key,'used',v_used,'limit',v_limit,'plan',v_plan_code,
    'reset_at', case when v_kind='monthly' then v_period_end else null end);
end;
$function$;
