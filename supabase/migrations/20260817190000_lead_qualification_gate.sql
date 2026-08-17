alter table public.lit_admin_leads
  add column if not exists apollo_organization_id text;

update public.lit_admin_leads
set apollo_organization_id = (regexp_match(notes, 'organization ([A-Za-z0-9_-]+)'))[1]
where apollo_organization_id is null
  and notes ~ 'Imported from Apollo.*organization [A-Za-z0-9_-]+';

create unique index if not exists lit_admin_leads_apollo_org_uidx
  on public.lit_admin_leads (apollo_organization_id)
  where apollo_organization_id is not null;

create table if not exists public.lit_lead_company_qualifications (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_company_id text not null,
  company_name text not null,
  domain text,
  website text,
  status text not null check (status in ('qualified', 'disqualified', 'review')),
  company_type text not null check (company_type in (
    'freight_broker', 'freight_forwarder', 'freight_broker_and_forwarder',
    'other_logistics', 'non_target', 'unknown'
  )),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  verified_domain text,
  reason text not null,
  positive_signals jsonb not null default '[]'::jsonb,
  exclusion_signals jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  model text,
  agent_version text not null default 'lead-qualification-v1',
  checked_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  lead_id uuid references public.lit_admin_leads(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_company_id)
);

alter table public.lit_lead_company_qualifications enable row level security;
revoke all on public.lit_lead_company_qualifications from anon, authenticated;

create or replace function public.lit_leadcrm_import_apollo_company(
  p_apollo_organization_id text,
  p_company_name text,
  p_website text default null,
  p_company_domain text default null,
  p_logo_url text default null,
  p_company_city text default null,
  p_company_state text default null,
  p_company_country text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id text := nullif(btrim(p_apollo_organization_id), '');
  v_name text := nullif(btrim(p_company_name), '');
  v_domain text := nullif(lower(regexp_replace(regexp_replace(coalesce(p_company_domain, p_website, ''), '^\s*https?://', '', 'i'), '^www\.|[/?#].*$', '', 'gi')), '');
  v_existing public.lit_admin_leads%rowtype;
  v_stage uuid;
  v_lead_id uuid;
  v_qualification public.lit_lead_company_qualifications%rowtype;
begin
  if not public.is_lead_crm_member(auth.uid()) then
    raise exception 'not authorized';
  end if;
  if v_org_id is null or v_name is null then
    return jsonb_build_object('ok', false, 'reason', 'apollo_id_and_company_required');
  end if;

  select * into v_qualification
  from public.lit_lead_company_qualifications
  where provider = 'apollo' and provider_company_id = v_org_id;

  if not found or v_qualification.status <> 'qualified'
     or v_qualification.confidence < 0.75 or v_qualification.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'qualification_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('apollo:' || v_org_id, 0));

  select * into v_existing
  from public.lit_admin_leads
  where apollo_organization_id = v_org_id
     or (v_domain is not null and lower(regexp_replace(coalesce(company_domain, ''), '^www\.', '')) = v_domain)
     or (public.lit_canonicalize_name(company_name) = public.lit_canonicalize_name(v_name))
  order by case when apollo_organization_id = v_org_id then 0 when company_domain is not null then 1 else 2 end,
           created_at asc
  limit 1;

  if found then
    update public.lit_admin_leads
    set apollo_organization_id = coalesce(apollo_organization_id, v_org_id),
        company_name = coalesce(company_name, v_name),
        website = coalesce(website, nullif(btrim(p_website), '')),
        company_domain = coalesce(company_domain, v_domain),
        company_logo_url = coalesce(company_logo_url, nullif(btrim(p_logo_url), ''),
          case when v_domain is not null then 'https://img.logo.dev/' || v_domain || '?size=160' end),
        company_city = coalesce(company_city, nullif(btrim(p_company_city), '')),
        company_state = coalesce(company_state, nullif(btrim(p_company_state), '')),
        company_country = coalesce(company_country, nullif(btrim(p_company_country), '')),
        updated_at = now()
    where id = v_existing.id;
    update public.lit_lead_company_qualifications set lead_id = v_existing.id, updated_at = now() where id = v_qualification.id;
    return jsonb_build_object(
      'ok', true, 'lead_id', v_existing.id, 'created', false, 'merged', true,
      'saved_status', case when v_existing.deleted_at is not null then 'deleted' when v_existing.archived_at is not null then 'archived' else 'active' end
    );
  end if;

  select id into v_stage from public.lit_lead_pipeline_stages order by position asc limit 1;
  insert into public.lit_admin_leads (
    company_name, website, company_domain, company_logo_url, company_city,
    company_state, company_country, apollo_organization_id, primary_source,
    stage_id, notes, status, first_seen_at, last_activity_at
  ) values (
    v_name, nullif(btrim(p_website), ''), v_domain,
    coalesce(nullif(btrim(p_logo_url), ''), case when v_domain is not null then 'https://img.logo.dev/' || v_domain || '?size=160' end),
    nullif(btrim(p_company_city), ''), nullif(btrim(p_company_state), ''), nullif(btrim(p_company_country), ''),
    v_org_id, 'apollo', v_stage, 'Imported from Apollo · organization ' || v_org_id,
    'open', now(), now()
  ) returning id into v_lead_id;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (v_lead_id, 'created', jsonb_build_object(
    'source', 'apollo', 'company', v_name, 'apollo_organization_id', v_org_id,
    'qualification_status', v_qualification.status,
    'qualification_confidence', v_qualification.confidence
  ), auth.uid(), 'apollo');

  update public.lit_lead_company_qualifications set lead_id = v_lead_id, updated_at = now() where id = v_qualification.id;
  return jsonb_build_object('ok', true, 'lead_id', v_lead_id, 'created', true, 'merged', false, 'saved_status', 'active');
exception when unique_violation then
  select id into v_lead_id from public.lit_admin_leads where apollo_organization_id = v_org_id limit 1;
  return jsonb_build_object('ok', true, 'lead_id', v_lead_id, 'created', false, 'merged', true, 'saved_status', 'active');
end;
$$;

revoke all on function public.lit_leadcrm_import_apollo_company(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.lit_leadcrm_import_apollo_company(text, text, text, text, text, text, text, text) to authenticated;
