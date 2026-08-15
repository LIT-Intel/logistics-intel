-- Additively extend lit_admin_users_360 with moderation state (status,
-- is_banned) appended after the existing columns. Return type changes, so the
-- function must be dropped + recreated. All prior columns keep names/order.

DROP FUNCTION IF EXISTS public.lit_admin_users_360();

CREATE FUNCTION public.lit_admin_users_360()
 RETURNS TABLE(user_id uuid, email text, full_name text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, email_confirmed boolean, org_name text, org_role text, plan_code text, sub_status text, activity_30d bigint, enrichments_total bigint, profile_views_total bigint, signup_source text, signup_landing text, status text, is_banned boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
    u.raw_user_meta_data->'attribution'->>'landing',
    pr.status,
    (u.banned_until is not null and u.banned_until > now())
  from auth.users u
  left join public.user_profiles up on up.user_id = u.id
  left join public.profiles pr on pr.id = u.id
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
$function$;
