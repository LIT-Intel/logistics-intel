-- Search-billing inversion (2026-08-06).
--
-- Product decision: company-LIST searches are free — importyeti-proxy and
-- pulse-explore no longer gate or consume on search. The metered action is
-- the company CLICK (`company_profile_view`), which is when we actually pay
-- ImportYeti for full shipment detail. Previously that was inverted:
-- searches charged credits while profile views were unlimited (mapped to
-- NULL in resolve_feature_limit).
--
-- Gate profile views per-plan via a new plans.company_view_limit column:
-- free_trial = 10/month, paid plans = NULL (unlimited).

alter table public.plans add column if not exists company_view_limit integer;

comment on column public.plans.company_view_limit is
  'Monthly cap on company_profile_view consumption (deep company opens). NULL = unlimited. Only free_trial is capped as of 2026-08-06.';

update public.plans set company_view_limit = 10 where code = 'free_trial';

create or replace function public.resolve_feature_limit(p_plan_code text, p_feature_key text)
returns table(limit_value integer, kind text)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_plan plans%rowtype;
begin
  select * into v_plan from plans where code = p_plan_code limit 1;
  if not found then select * into v_plan from plans where code = 'free_trial' limit 1; end if;
  case p_feature_key
    when 'company_search'       then limit_value := null;                              kind := 'monthly'; -- list search is free (2026-08-06)
    when 'company_profile_view' then limit_value := v_plan.company_view_limit;         kind := 'monthly'; -- the metered click
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
