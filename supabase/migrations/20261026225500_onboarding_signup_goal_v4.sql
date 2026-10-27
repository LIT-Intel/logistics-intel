-- v4 records signup intent after the v3 validated intake in one transaction.
create or replace function private.complete_onboarding_v4(
 p_company_name text,p_company_type text,p_website text,p_team text,p_title text,
 p_services text[],p_geographies text[],p_goal text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_goal is null or p_goal not in (
 'Find new shippers','Research competitors and trade lanes',
 'Manage outreach and CRM','Track existing accounts','Benchmark freight rates','Other') then
 return jsonb_build_object('ok',false,'reason','signup_goal_required');
 end if;
 result := private.complete_onboarding_v3(p_company_name,p_company_type,p_website,p_team,p_title,p_services,p_geographies);
 if coalesce((result->>'ok')::boolean,false) then
   update public.profiles p set onboarding_preferences =
      coalesce(p.onboarding_preferences,'{}'::jsonb) || jsonb_build_object('signup_goal',p_goal)
   where p.id=auth.uid();
 end if;
 return result;
end $$;
revoke all on function private.complete_onboarding_v4(text,text,text,text,text,text[],text[],text) from public,anon;
grant execute on function private.complete_onboarding_v4(text,text,text,text,text,text[],text[],text) to authenticated;
create or replace function public.lit_complete_onboarding_v4(
 p_company_name text,p_company_type text,p_website text,p_team text,p_title text,
 p_services text[],p_geographies text[],p_goal text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.complete_onboarding_v4(p_company_name,p_company_type,p_website,p_team,p_title,p_services,p_geographies,p_goal);
$$;
revoke all on function public.lit_complete_onboarding_v4(text,text,text,text,text,text[],text[],text) from public,anon;
grant execute on function public.lit_complete_onboarding_v4(text,text,text,text,text,text[],text[],text) to authenticated;
