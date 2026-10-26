-- First-login enrichment; v2 remains for backward compatibility.
-- Company name and website are user-provided, NOT automatically verified.
create or replace function private.complete_onboarding_v3(
 p_company_name text,p_company_type text,p_website text,
 p_team text,p_title text,p_services text[],p_geographies text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 uid uuid := auth.uid();
 completed timestamptz;
 cleaned_website text := nullif(lower(btrim(coalesce(p_website,''))),'');
 normalized_company text := btrim(coalesce(p_company_name,''));
begin
 if uid is null then return jsonb_build_object('ok',false,'reason','unauthenticated'); end if;
 if length(normalized_company) not between 2 and 160 then
   return jsonb_build_object('ok',false,'reason','company_name_required');
 end if;
 if p_company_type is null or p_company_type not in
 ('Freight Forwarder','Freight Broker','3PL','Customs Broker','Shipper','Carrier','Other') then
   return jsonb_build_object('ok',false,'reason','company_type_required');
 end if;
 if cleaned_website is not null then
   if length(cleaned_website)>253 or cleaned_website !~ '^(https://)?([a-z0-9-]+[.])+[a-z]{2,}(/[^[:space:]]*)?$' then
     return jsonb_build_object('ok',false,'reason','website_invalid');
   end if;
 end if;
 if p_team is null or p_team not in ('Sales','Marketing','Sales Leadership','Product','Operations','Other')
 or length(btrim(coalesce(p_title,''))) not between 2 and 120 then
   return jsonb_build_object('ok',false,'reason','role_required');
 end if;
 if coalesce(cardinality(p_services),0) not between 1 and 8
 or not p_services <@ array['Ocean FCL','Ocean LCL','Air freight','Customs brokerage','Cross-border trucking','Drayage','Domestic trucking','Other']::text[]
 or array_position(p_services,null) is not null then
   return jsonb_build_object('ok',false,'reason','services_required');
 end if;
 if coalesce(cardinality(p_geographies),0)>50
 or exists(select 1 from unnest(p_geographies) g where g is null or length(btrim(g)) not between 2 and 80) then
   return jsonb_build_object('ok',false,'reason','geographies_invalid');
 end if;
 update public.profiles set
   company_name=normalized_company,
   company_type=p_company_type,
   onboarding_preferences=jsonb_build_object(
     'team',p_team,'title',btrim(p_title),'services',p_services,
     'sales_geographies',coalesce(p_geographies,'{}'::text[]),
     'company_website',cleaned_website,'company_website_verified',false
   ),
   onboarding_completed_at=coalesce(onboarding_completed_at,now()),
   updated_at=now()
 where id=uid returning onboarding_completed_at into completed;
 if not found then return jsonb_build_object('ok',false,'reason','profile_missing'); end if;
 return jsonb_build_object('ok',true,'onboarding_completed_at',completed);
end $$;
revoke all on function private.complete_onboarding_v3(text,text,text,text,text,text[],text[]) from public,anon;
grant execute on function private.complete_onboarding_v3(text,text,text,text,text,text[],text[]) to authenticated;
create or replace function public.lit_complete_onboarding_v3(
 p_company_name text,p_company_type text,p_website text,
 p_team text,p_title text,p_services text[],p_geographies text[] default '{}')
returns jsonb language sql security invoker set search_path='' as $$
 select private.complete_onboarding_v3(p_company_name,p_company_type,p_website,p_team,p_title,p_services,p_geographies);
$$;
revoke all on function public.lit_complete_onboarding_v3(text,text,text,text,text,text[],text[]) from public,anon;
grant execute on function public.lit_complete_onboarding_v3(text,text,text,text,text,text[],text[]) to authenticated;
