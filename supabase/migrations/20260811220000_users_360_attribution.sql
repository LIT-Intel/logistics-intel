-- Users 360 + first-touch attribution (2026-08-11).
-- Signup source now stamps into raw_user_meta_data->'attribution' (from
-- the lit_attrib first-party cookie: marketing middleware sets it,
-- signup/AuthProvider persists it). Surface it as a single display
-- string: utm_source/medium win, else referrer host, else "direct",
-- plus the landing path.
-- Return-shape change requires drop + recreate.

drop function if exists public.lit_admin_users_360();

create function public.lit_admin_users_360()
returns table (
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed boolean,
  org_name text,
  org_role text,
  plan_code text,
  sub_status text,
  activity_30d bigint,
  enrichments_total bigint,
  profile_views_total bigint,
  signup_source text,
  signup_landing text
)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select
    u.id,
    u.email::text,
    coalesce(up.full_name, u.raw_user_meta_data->>'full_name'),
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at is not null,
    o.name,
    om.role,
    s.plan_code,
    s.status,
    (select count(*) from public.lit_activity_events e
      where e.user_id = u.id and e.created_at > now() - interval '30 days'),
    (select count(*) from public.lit_usage_ledger l
      where l.user_id = u.id and l.feature_key = 'contact_enrichment'),
    (select count(*) from public.lit_usage_ledger l
      where l.user_id = u.id and l.feature_key = 'company_profile_view'),
    case
      when u.raw_user_meta_data->'attribution'->>'utm_source' is not null then
        u.raw_user_meta_data->'attribution'->>'utm_source'
        || coalesce(' / ' || (u.raw_user_meta_data->'attribution'->>'utm_medium'), '')
      when u.raw_user_meta_data->'attribution'->>'referrer' is not null then
        u.raw_user_meta_data->'attribution'->>'referrer'
      when u.raw_user_meta_data ? 'attribution' then 'direct'
      else null
    end,
    u.raw_user_meta_data->'attribution'->>'landing'
  from auth.users u
  left join public.user_profiles up on up.user_id = u.id
  left join lateral (
    select * from public.org_members m
    where m.user_id = u.id order by m.joined_at limit 1
  ) om on true
  left join public.organizations o on o.id = om.org_id
  left join lateral (
    select * from public.subscriptions sb
    where sb.user_id = u.id order by sb.updated_at desc nulls last limit 1
  ) s on true
  where exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  )
  order by u.created_at desc
$$;

revoke execute on function public.lit_admin_users_360() from anon;
