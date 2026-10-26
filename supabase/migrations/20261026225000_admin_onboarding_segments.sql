-- Platform-admin-only, aggregate onboarding signals for acquisition analysis.
-- No names, addresses, email, or individual profiles are returned.
create or replace function public.lit_admin_onboarding_segments()
returns table(segment_type text,segment_value text,users bigint)
language sql stable security definer set search_path = '' as $$
 select grouped.segment_type,grouped.segment_value,count(*)::bigint
 from (
   select 'company_type'::text segment_type,coalesce(nullif(p.company_type,''),'Unspecified')::text segment_value
     from public.profiles p where p.onboarding_completed_at is not null
   union all
   select 'signup_goal'::text,coalesce(nullif(p.onboarding_preferences->>'signup_goal',''),'Unspecified')
     from public.profiles p where p.onboarding_completed_at is not null
   union all
   select 'team'::text,coalesce(nullif(p.onboarding_preferences->>'team',''),'Unspecified')
     from public.profiles p where p.onboarding_completed_at is not null
   union all
   select 'service'::text,service.value
     from public.profiles p
     cross join lateral jsonb_array_elements_text(
       case when jsonb_typeof(p.onboarding_preferences->'services')='array'
       then p.onboarding_preferences->'services' else '[]'::jsonb end
     ) as service(value)
     where p.onboarding_completed_at is not null
   union all
   select 'signup_stage'::text,case when p.onboarding_completed_at is null then 'Incomplete' else 'Completed' end
     from public.profiles p
 ) grouped
 where exists (select 1 from public.platform_admins a where a.user_id=auth.uid())
 group by grouped.segment_type,grouped.segment_value
 order by grouped.segment_type,count(*) desc;
$$;
revoke all on function public.lit_admin_onboarding_segments() from public,anon;
grant execute on function public.lit_admin_onboarding_segments() to authenticated;
