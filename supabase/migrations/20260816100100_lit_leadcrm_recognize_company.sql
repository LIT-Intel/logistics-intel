-- Lead-CRM Phase 2 — Part 2: company recognition resolver + snapshot RPC.
--
-- Recognition strategy (honest, confidence-ordered — never guesses):
--   Tier A  name  -> lit_companies (canonical name), prefer rows carrying a
--                    source_company_key (ImportYeti snapshot). Highest signal.
--   Tier B  email domain -> lit_companies.domain / website.
--   Tier C  name  -> lit_company_directory (canonical_name). Gives location +
--                    directory metrics + a snapshot slug (seo_slug / key) when
--                    the directory row maps to a snapshot.
-- If no tier is confident, everything stays NULL and the lead is left honestly
-- "not recognized" (the UI shows a clean empty state).
--
-- The domain -> logo.dev URL mirrors the app/marketing shared logo helper
-- (frontend/src/lib/logo.ts buildLogoDevUrl -> https://img.logo.dev/<domain>?size=160[&token]).
-- We store a token-less URL as a fallback; the frontend CompanyAvatar re-resolves
-- with the real VITE_LOGO_DEV_TOKEN + Clearbit/unavatar cascade at render time.
-- 0 provider credits: cached reads only, no live ImportYeti fetch.

-- ── Shared resolver: given a company name + optional email domain, return the
-- best confident match as a jsonb blob (or NULL columns when unrecognized).
create or replace function public.lit_leadcrm_resolve_company(
  p_company_name text,
  p_email_domain text default null
)
returns table (
  company_id         uuid,
  source_company_key text,
  company_domain     text,
  company_logo_url   text,
  company_country    text,
  company_city       text,
  company_state      text,
  match_tier         text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_cn        text := public.lit_canonicalize_name(p_company_name);
  v_domain    text := nullif(lower(btrim(coalesce(p_email_domain,''))), '');
  v_key       text;
  v_dom       text;
  v_cid       uuid;
  v_country   text;
  v_city      text;
  v_state     text;
  v_tier      text;
  v_logo_dom  text;
begin
  -- Free-domain guard: don't "recognize" a company from a generic mailbox host.
  if v_domain is not null and v_domain ~ '(gmail|yahoo|hotmail|outlook|icloud|aol|proton|gmx|live|msn)\.' then
    v_domain := null;
  end if;

  -- Tier A: canonical name -> lit_companies, prefer a snapshot-bearing row.
  if v_cn is not null and length(v_cn) >= 3 then
    select c.id,
           nullif(regexp_replace(coalesce(c.source_company_key,''), '^company/', ''), ''),
           nullif(lower(coalesce(c.domain, c.website)), ''),
           c.country_code, c.city, c.state
      into v_cid, v_key, v_dom, v_country, v_city, v_state
    from public.lit_companies c
    where public.lit_canonicalize_name(c.name) = v_cn
       or (c.normalized_name is not null and c.normalized_name = v_cn)
    order by (c.source_company_key is not null) desc,
             c.shipments_12m desc nulls last,
             c.updated_at desc nulls last
    limit 1;
    if v_cid is not null then v_tier := 'companies_name'; end if;
  end if;

  -- Tier B: email domain -> lit_companies.domain / website.
  if v_cid is null and v_domain is not null then
    select c.id,
           nullif(regexp_replace(coalesce(c.source_company_key,''), '^company/', ''), ''),
           nullif(lower(coalesce(c.domain, c.website)), ''),
           c.country_code, c.city, c.state
      into v_cid, v_key, v_dom, v_country, v_city, v_state
    from public.lit_companies c
    where lower(coalesce(c.domain,'')) = v_domain
       or lower(coalesce(c.domain,'')) = 'www.'||v_domain
       or lower(regexp_replace(coalesce(c.website,''), '^https?://(www\.)?', '')) like v_domain||'%'
    order by (c.source_company_key is not null) desc,
             c.shipments_12m desc nulls last
    limit 1;
    if v_cid is not null then v_tier := 'companies_domain'; end if;
  end if;

  -- Tier C: canonical name -> lit_company_directory (location + snapshot slug).
  if v_cid is null and v_cn is not null and length(v_cn) >= 3 then
    select nullif(coalesce(
              nullif(regexp_replace(coalesce(d.source_company_key,''), '^company/', ''), ''),
              nullif(d.seo_slug, '')
           ), ''),
           nullif(lower(coalesce(d.domain, d.canonical_domain)), ''),
           coalesce(d.country, null), d.city, d.state
      into v_key, v_dom, v_country, v_city, v_state
    from public.lit_company_directory d
    where d.canonical_name = v_cn
    order by coalesce(d.shipments, 0) desc nulls last, d.updated_at desc nulls last
    limit 1;
    if v_key is not null or v_dom is not null or v_city is not null then
      v_tier := 'directory_name';
    end if;
  end if;

  -- No confident match on any tier → return a single all-NULL row (honest miss).
  if v_tier is null then
    company_id := null; source_company_key := null; company_domain := null;
    company_logo_url := null; company_country := null; company_city := null;
    company_state := null; match_tier := null;
    return next;
    return;
  end if;

  -- Only trust the snapshot key if a snapshot actually exists (cached read).
  if v_key is not null and not exists (
       select 1 from public.lit_importyeti_company_snapshot s where s.company_id = v_key) then
    v_key := null;
  end if;

  -- Logo domain: resolved company domain, else the email domain (Tier A/B/C).
  v_logo_dom := coalesce(v_dom, v_domain);

  company_id         := v_cid;
  source_company_key := v_key;
  company_domain     := v_logo_dom;
  company_logo_url   := case when v_logo_dom is not null
                              then 'https://img.logo.dev/'||v_logo_dom||'?size=160'
                              else null end;
  company_country    := v_country;
  company_city       := v_city;
  company_state      := v_state;
  match_tier         := v_tier;
  return next;
end;
$$;

comment on function public.lit_leadcrm_resolve_company(text,text) is
  'Confidence-ordered company recognition for the Lead-CRM. Cached reads only (0 provider credits). Returns all-NULL on an unconfident miss.';

-- ── RPC: recognize (and persist) the company for one lead. SECURITY DEFINER,
-- membership-gated. Writes the company_* columns + a company_recognized activity.
create or replace function public.lit_leadcrm_recognize_company(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name     text;
  v_email    citext;
  v_domain   text;
  r          record;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  select company_name, email into v_name, v_email
  from public.lit_admin_leads where id = p_lead_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  v_domain := split_part(v_email::text, '@', 2);

  select * into r from public.lit_leadcrm_resolve_company(v_name, v_domain);

  if r.match_tier is null then
    -- Honest miss: clear any prior recognition, stamp the attempt, no activity noise.
    update public.lit_admin_leads
       set company_id = null, source_company_key = null, company_domain = null,
           company_logo_url = null, company_country = null, company_city = null,
           company_state = null, company_recognized_at = now(), updated_at = now()
     where id = p_lead_id;
    return jsonb_build_object('ok', true, 'recognized', false);
  end if;

  update public.lit_admin_leads
     set company_id            = r.company_id,
         source_company_key    = r.source_company_key,
         company_domain        = r.company_domain,
         company_logo_url      = r.company_logo_url,
         company_country       = r.company_country,
         company_city          = r.company_city,
         company_state         = r.company_state,
         company_recognized_at = now(),
         updated_at            = now()
   where id = p_lead_id;

  insert into public.lit_lead_activity (lead_id, kind, body, actor_user_id, source)
  values (p_lead_id, 'company_recognized',
          jsonb_build_object('tier', r.match_tier, 'company_id', r.company_id,
                             'source_company_key', r.source_company_key,
                             'domain', r.company_domain,
                             'has_snapshot', (r.source_company_key is not null)),
          auth.uid(), 'system');

  return jsonb_build_object(
    'ok', true, 'recognized', true, 'tier', r.match_tier,
    'company_id', r.company_id, 'source_company_key', r.source_company_key,
    'company_domain', r.company_domain, 'company_logo_url', r.company_logo_url,
    'company_country', r.company_country, 'company_city', r.company_city,
    'company_state', r.company_state, 'has_snapshot', (r.source_company_key is not null)
  );
end;
$$;

-- ── RPC: company intelligence snapshot for a lead's recognized company.
-- Reads ONLY cached data (lit_importyeti_company_snapshot.parsed_summary +
-- lit_company_directory). 0 provider credits. Returns the shape the drawer
-- expects. Membership-gated.
create or replace function public.lit_leadcrm_company_snapshot(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path to 'public'
as $$
declare
  v_key      text;
  v_cid      uuid;
  v_name     text;
  v_domain   text;
  v_logo     text;
  v_city     text;
  v_state    text;
  v_country  text;
  ps         jsonb;
  v_trend    jsonb;
  v_origins  jsonb;
  v_ports    jsonb;
  v_lane     text;
  v_ship12   numeric;
  v_teu      numeric;
  v_href     text;
begin
  if not public.is_lead_crm_member(auth.uid()) then raise exception 'not authorized'; end if;

  select company_name, source_company_key, company_id, company_domain, company_logo_url,
         company_city, company_state, company_country
    into v_name, v_key, v_cid, v_domain, v_logo, v_city, v_state, v_country
  from public.lit_admin_leads where id = p_lead_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  if v_key is not null then
    select parsed_summary into ps
    from public.lit_importyeti_company_snapshot where company_id = v_key limit 1;
  end if;

  -- Directory fallback for location / basic metrics when there is no snapshot.
  if ps is null and v_cid is not null then
    -- nothing extra to pull from companies here; location already cached on lead.
    null;
  end if;

  v_href := case when v_key is not null then '/app/companies/'||v_key else null end;

  if ps is not null then
    v_ship12 := coalesce((ps->>'shipments_last_12m')::numeric, (ps->>'total_shipments')::numeric);
    v_teu    := (ps->>'total_teu')::numeric;
    v_lane   := coalesce(ps->'route_kpis'->>'topRouteLast12m',
                         (ps->'top_routes'->0->>'route'));

    -- Top US ports + top origin countries derived from top_routes ("Origin → Dest").
    select coalesce(jsonb_agg(distinct trim(split_part(route, '→', 2))) filter (
             where position('→' in route) > 0), '[]'::jsonb)
      into v_ports
    from (select (r->>'route') as route
          from jsonb_array_elements(coalesce(ps->'top_routes','[]'::jsonb)) r
          limit 5) x;

    select coalesce(jsonb_agg(distinct trim(split_part(route, '→', 1))) filter (
             where position('→' in route) > 0), '[]'::jsonb)
      into v_origins
    from (select (r->>'route') as route
          from jsonb_array_elements(coalesce(ps->'top_routes','[]'::jsonb)) r
          limit 5) x;

    -- Monthly trend: last 12 months of {month, shipments} from monthly_volumes.
    select coalesce(jsonb_agg(jsonb_build_object('month', m, 'shipments',
             coalesce((ps->'monthly_volumes'->m->>'shipments')::numeric, 0))
             order by m), '[]'::jsonb)
      into v_trend
    from (
      select m from jsonb_object_keys(coalesce(ps->'monthly_volumes','{}'::jsonb)) m
      order by m desc limit 12
    ) mm;
  end if;

  return jsonb_build_object(
    'ok', true,
    'has_snapshot', (ps is not null),
    'company_name', coalesce(nullif(ps->>'company_name',''), nullif(ps->>'name',''), v_name),
    'domain', coalesce(nullif(lower(ps->>'website'),''), v_domain),
    'logo_url', v_logo,
    'city', v_city,
    'state', v_state,
    'country', coalesce(v_country, nullif(ps->>'country','')),
    'shipments_12m', v_ship12,
    'total_teu', v_teu,
    'top_origin_countries', coalesce(v_origins, '[]'::jsonb),
    'top_us_ports', coalesce(v_ports, '[]'::jsonb),
    'top_lane', v_lane,
    'monthly_trend', coalesce(v_trend, '[]'::jsonb),
    'profile_href', v_href,
    'source_company_key', v_key
  );
end;
$$;

comment on function public.lit_leadcrm_company_snapshot(uuid) is
  'Cached company intelligence for a lead''s recognized company (ImportYeti snapshot + directory). 0 provider credits.';

-- Grants: revoke public, allow authenticated (RPCs self-gate on membership).
revoke all on function public.lit_leadcrm_resolve_company(text,text) from public;
revoke all on function public.lit_leadcrm_recognize_company(uuid) from public;
revoke all on function public.lit_leadcrm_company_snapshot(uuid) from public;
grant execute on function public.lit_leadcrm_recognize_company(uuid) to authenticated;
grant execute on function public.lit_leadcrm_company_snapshot(uuid) to authenticated;
