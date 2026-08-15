-- Lead-CRM structural fix — Part 5: "Add from LIT" company picker.
--
-- Owner intent: turn ANY company already in LIT (brokers, forwarders,
-- importers, directory rows, search results) into a lead/opportunity — no email
-- required. Two membership-gated, cached-read RPCs (0 provider credits):
--
--   1. lit_leadcrm_search_companies(p_q, p_limit)
--        Typeahead over LIT's existing company data — lit_company_directory
--        (78k rows incl. brokers/forwarders) UNION lit_companies. Returns the
--        shape the Add-opportunity modal needs to render results with logos.
--
--   2. lit_leadcrm_create_lead_from_company(company_id | source_company_key |
--        company_name, stage, assignee)
--        Creates an email-less lead from a chosen LIT company, auto-populating
--        company_* columns via the existing recognizer, deduped on company. The
--        team then runs Enrich (lead-crm-enrich-contacts) to get people+emails.

-- ── 1. Company typeahead over existing LIT data (cached reads only) ─────────
create or replace function public.lit_leadcrm_search_companies(
  p_q     text,
  p_limit int default 20
)
returns jsonb
language plpgsql
security definer
stable
set search_path to 'public'
as $$
declare
  v_q     text := nullif(btrim(p_q), '');
  v_lim   int  := greatest(1, least(coalesce(p_limit, 20), 50));
  v_like  text;
  v_rows  jsonb;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;
  if v_q is null or length(v_q) < 2 then
    return jsonb_build_object('ok', true, 'companies', '[]'::jsonb);
  end if;

  v_like := '%' || v_q || '%';

  with dir as (
    -- lit_companies first: these carry a logo_url + snapshot key when known.
    (
      select
        c.id                                            as id,
        nullif(regexp_replace(coalesce(c.source_company_key,''), '^company/', ''), '') as source_company_key,
        c.name                                          as name,
        nullif(lower(coalesce(c.domain, c.website)), '') as domain,
        c.city                                          as city,
        c.state                                         as state,
        c.country_code                                  as country,
        c.industry                                      as industry,
        'companies'::text                               as origin,
        coalesce(c.shipments_12m, 0)::numeric           as rank_ship
      from public.lit_companies c
      where c.name ilike v_like
      order by (c.source_company_key is not null) desc, c.shipments_12m desc nulls last
      limit v_lim
    )

    union all

    -- lit_company_directory: the broad 78k broker/forwarder/importer directory.
    (
      select
        null::uuid                                      as id,
        nullif(coalesce(
          nullif(regexp_replace(coalesce(d.source_company_key,''), '^company/', ''), ''),
          nullif(d.seo_slug, '')
        ), '')                                          as source_company_key,
        d.company_name                                  as name,
        nullif(lower(coalesce(d.domain, d.canonical_domain)), '') as domain,
        d.city                                          as city,
        d.state                                         as state,
        d.country                                       as country,
        d.industry                                      as industry,
        'directory'::text                               as origin,
        coalesce(d.shipments, 0)::numeric               as rank_ship
      from public.lit_company_directory d
      where d.company_name ilike v_like
      order by d.shipments desc nulls last
      limit v_lim
    )
  ),
  deduped as (
    -- Collapse duplicates across both sources by normalized name, preferring
    -- the row that has a snapshot key / logo domain, then higher shipments.
    select distinct on (public.lit_canonicalize_name(name))
      id, source_company_key, name, domain, city, state, country, industry, origin, rank_ship
    from dir
    where name is not null
    order by public.lit_canonicalize_name(name),
             (source_company_key is not null) desc,
             (domain is not null) desc,
             rank_ship desc
  )
  select coalesce(jsonb_agg(x order by x.rank_ship desc nulls last), '[]'::jsonb)
    into v_rows
  from (
    select
      id, source_company_key, name, domain, city, state, country, industry, origin,
      rank_ship,
      -- Only claim a usable snapshot when the key actually has an ImportYeti
      -- snapshot (mirrors the recognizer's gate).
      (source_company_key is not null
        and exists (
          select 1 from public.lit_importyeti_company_snapshot s
          where s.company_id = source_company_key
        )) as has_snapshot
    from deduped
    limit v_lim
  ) x;

  return jsonb_build_object('ok', true, 'companies', v_rows);
end;
$$;

comment on function public.lit_leadcrm_search_companies(text,int) is
  'Membership-gated typeahead over existing LIT company data (lit_companies + lit_company_directory, incl. brokers/forwarders). Cached reads only, 0 provider credits. Returns { ok, companies:[{id, source_company_key, name, domain, city, state, country, industry, origin, has_snapshot}] }.';

revoke all on function public.lit_leadcrm_search_companies(text,int) from public;
grant execute on function public.lit_leadcrm_search_companies(text,int) to authenticated;

-- ── 2. Create a lead from a chosen LIT company (no email required) ─────────
create or replace function public.lit_leadcrm_create_lead_from_company(
  p_company_id         uuid default null,
  p_source_company_key text default null,
  p_company_name       text default null,
  p_stage_id           uuid default null,
  p_assignee           uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_key     text := nullif(btrim(p_source_company_key), '');
  v_name    text := nullif(btrim(p_company_name), '');
  v_cid     uuid := p_company_id;
  v_cn      text;
  v_stage   uuid := p_stage_id;
  v_lead_id uuid;
  v_existing uuid;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  -- Strip a leading "company/" prefix on the key to match stored form.
  if v_key is not null then
    v_key := nullif(regexp_replace(v_key, '^company/', ''), '');
  end if;

  -- Resolve a display name from whatever identity we were handed.
  if v_name is null then
    if v_cid is not null then
      select name into v_name from public.lit_companies where id = v_cid limit 1;
    end if;
    if v_name is null and v_key is not null then
      select coalesce(c.name, d.company_name) into v_name
      from public.lit_companies c
      full outer join public.lit_company_directory d
        on nullif(regexp_replace(coalesce(d.source_company_key,''), '^company/', ''), '') = v_key
      where nullif(regexp_replace(coalesce(c.source_company_key,''), '^company/', ''), '') = v_key
         or nullif(regexp_replace(coalesce(d.source_company_key,''), '^company/', ''), '') = v_key
      limit 1;
    end if;
    if v_name is null and v_key is not null then
      -- Directory rows may only be keyed by seo_slug.
      select company_name into v_name
      from public.lit_company_directory
      where seo_slug = v_key
      limit 1;
    end if;
  end if;

  if v_name is null and v_cid is null and v_key is null then
    return jsonb_build_object('ok', false, 'reason', 'company_required');
  end if;

  -- ── Dedupe: prefer an existing email-less lead already pointing at this
  -- company (by company_id, then source_company_key, then normalized name).
  if v_cid is not null then
    select id into v_existing from public.lit_admin_leads
    where company_id = v_cid order by created_at asc limit 1;
  end if;
  if v_existing is null and v_key is not null then
    select id into v_existing from public.lit_admin_leads
    where source_company_key = v_key order by created_at asc limit 1;
  end if;
  if v_existing is null and v_name is not null then
    v_cn := public.lit_canonicalize_name(v_name);
    if v_cn is not null and length(v_cn) >= 2 then
      select id into v_existing from public.lit_admin_leads
      where email is null and public.lit_canonicalize_name(company_name) = v_cn
      order by created_at asc limit 1;
    end if;
  end if;

  if v_existing is not null then
    update public.lit_admin_leads
       set company_name       = coalesce(company_name, v_name),
           company_id         = coalesce(company_id, v_cid),
           source_company_key = coalesce(source_company_key, v_key),
           assigned_to        = coalesce(p_assignee, assigned_to),
           stage_id           = coalesce(p_stage_id, stage_id),
           updated_at         = now()
     where id = v_existing;
    perform public.lit_leadcrm_recognize_company(v_existing);
    return jsonb_build_object('ok', true, 'lead_id', v_existing, 'created', false, 'merged', true);
  end if;

  if v_stage is null then
    select id into v_stage from public.lit_lead_pipeline_stages order by position asc limit 1;
  end if;

  -- Email-less, company-first lead. Seed the company_* identity we already
  -- know; the recognizer then fills logo/location/snapshot key from cache.
  insert into public.lit_admin_leads
    (email, full_name, company_name, primary_source, stage_id, assigned_to,
     status, first_seen_at, last_activity_at, company_id, source_company_key)
  values
    (null, null, v_name, 'manual', v_stage, p_assignee,
     'open', now(), now(), v_cid, v_key)
  returning id into v_lead_id;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (v_lead_id, 'created',
          jsonb_build_object('source', 'manual', 'from', 'lit_company',
                             'company', v_name, 'company_id', v_cid,
                             'source_company_key', v_key),
          auth.uid(), 'manual');

  if p_assignee is not null then
    insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
    values (v_lead_id, 'assignment',
            jsonb_build_object('assignee_user_id', p_assignee), auth.uid(), 'manual');
  end if;

  -- Cached recognition — fills company_domain/logo/location/snapshot key.
  -- The recognizer resolves by name/domain and, on NO match, nulls the company_*
  -- columns. Since we were handed an explicit LIT identity, re-assert the
  -- company_id / source_company_key afterward so a canonicalization miss never
  -- discards the caller's chosen company.
  perform public.lit_leadcrm_recognize_company(v_lead_id);

  if v_cid is not null or v_key is not null then
    update public.lit_admin_leads
       set company_id         = coalesce(company_id, v_cid),
           source_company_key = coalesce(source_company_key, v_key),
           company_recognized_at = coalesce(company_recognized_at, now()),
           updated_at         = now()
     where id = v_lead_id;
  end if;

  return jsonb_build_object('ok', true, 'lead_id', v_lead_id, 'created', true, 'merged', false);
end;
$$;

comment on function public.lit_leadcrm_create_lead_from_company(uuid,text,text,uuid,uuid) is
  'Create an email-less lead from an existing LIT company (brokers/forwarders/directory rows). Auto-populates company_* via lit_leadcrm_recognize_company (cached reads, 0 credits). Deduped on company. Enrich contacts afterward to get people+emails.';

revoke all on function public.lit_leadcrm_create_lead_from_company(uuid,text,text,uuid,uuid) from public;
grant execute on function public.lit_leadcrm_create_lead_from_company(uuid,text,text,uuid,uuid) to authenticated;
