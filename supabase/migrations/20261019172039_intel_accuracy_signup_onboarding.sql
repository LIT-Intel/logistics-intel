-- New signups require work email; onboarding writes only the caller's preferences.
create schema if not exists private;
create table if not exists private.signup_domain_allowlist (
 domain text primary key check (domain = lower(domain) and domain !~ '[[:space:]@]'),
 reason text not null,
 verified_by text not null,
 expires_at timestamptz not null
);
alter table private.signup_domain_allowlist enable row level security;
revoke all on private.signup_domain_allowlist from public, anon, authenticated;

create or replace function private.work_email_allowed(email text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
 v_domain text := lower(split_part(btrim(coalesce(email,'')), '@', 2));
begin
 if email is null or email !~ '^[^[:space:]@]+@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?([.][a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$' then return false; end if;
 -- Exact domain exceptions are operator-owned, time-limited and auditable.
 if exists(select 1 from private.signup_domain_allowlist a where a.domain=v_domain and a.expires_at>now()) then return true; end if;
 if public.lit_is_blocked_email(email) then return false; end if;
 if v_domain ~ '(^|[.])(gmail[.]com|googlemail[.]com|yahoo[.][a-z.]+|ymail[.]com|rocketmail[.]com|hotmail[.][a-z.]+|outlook[.][a-z.]+|live[.][a-z.]+|msn[.]com|aol[.]com|icloud[.]com|me[.]com|mac[.]com|proton[.]me|protonmail[.]com|pm[.]me|mail[.]com|gmx[.][a-z.]+|yandex[.][a-z.]+|qq[.]com|163[.]com|126[.]com|hey[.]com|fastmail[.]com|tuta[.]com|tutanota[.]com)$' then return false; end if;
 return true;
end $$;
revoke all on function private.work_email_allowed(text) from public, anon, authenticated;

-- A boolean-only preflight gives password/invite forms a friendly error.
-- The Auth hook and insert trigger remain authoritative for every signup path.
create or replace function public.lit_signup_email_allowed(p_email text)
returns boolean language sql security invoker set search_path = '' as $$
 select private.work_email_allowed(p_email);
$$;
grant usage on schema private to anon, authenticated;
grant execute on function private.work_email_allowed(text) to anon, authenticated;
revoke all on function public.lit_signup_email_allowed(text) from public;
grant execute on function public.lit_signup_email_allowed(text) to anon, authenticated;

-- Runs for password and OAuth creation even if the dashboard hook is disabled.
-- Does not run on UPDATE/login: existing customers retain access.
create or replace function private.enforce_work_email_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if not private.work_email_allowed(new.email) then
  raise exception using errcode='23514', message='Use your company email address to create an account. Contact support for a verified domain exception.';
 end if;
 return new;
end $$;
revoke all on function private.enforce_work_email_signup() from public, anon, authenticated;
drop trigger if exists lit_require_work_email on auth.users;
create trigger lit_require_work_email before insert on auth.users for each row execute function private.enforce_work_email_signup();

-- Friendly Auth hook error; the insert trigger above remains the backstop.
create or replace function public.hook_restrict_signup(event jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
 if not private.work_email_allowed(event->'user'->>'email') then
  return jsonb_build_object('error',jsonb_build_object('http_code',400,'message','Please sign up with your company email address.'));
 end if;
 if public.lit_is_gibberish_name(coalesce(event->'user'->'user_metadata'->>'full_name','')) then
  return jsonb_build_object('error',jsonb_build_object('http_code',400,'message','Please enter your full name.'));
 end if;
 return '{}'::jsonb;
end $$;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.work_email_allowed(text) to supabase_auth_admin;
grant execute on function public.lit_is_gibberish_name(text) to supabase_auth_admin;
revoke all on function public.hook_restrict_signup(jsonb) from public, anon, authenticated;
grant execute on function public.hook_restrict_signup(jsonb) to supabase_auth_admin;

alter table public.profiles add column if not exists onboarding_preferences jsonb;
create or replace function private.complete_onboarding_v2(p_team text,p_title text,p_services text[],p_geographies text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); completed timestamptz;
begin
 if uid is null then return jsonb_build_object('ok',false,'reason','unauthenticated'); end if;
 if p_team is null or p_team not in ('Sales','Marketing','Sales Leadership','Product','Operations','Other') or length(btrim(coalesce(p_title,''))) not between 2 and 120 then
  return jsonb_build_object('ok',false,'reason','role_required');
 end if;
 if coalesce(cardinality(p_services),0) not between 1 and 8 or not p_services <@ array['Ocean FCL','Ocean LCL','Air freight','Customs brokerage','Cross-border trucking','Drayage','Domestic trucking','Other']::text[] or array_position(p_services,null) is not null then
  return jsonb_build_object('ok',false,'reason','services_required');
 end if;
 if coalesce(cardinality(p_geographies),0)>50 or exists(select 1 from unnest(p_geographies) g where g is null or length(btrim(g)) not between 2 and 80) then
  return jsonb_build_object('ok',false,'reason','geographies_invalid');
 end if;
 update public.profiles set onboarding_preferences=jsonb_build_object('team',p_team,'title',btrim(p_title),'services',p_services,'sales_geographies',coalesce(p_geographies,'{}'::text[])), onboarding_completed_at=coalesce(onboarding_completed_at,now()),updated_at=now()
 where id=uid returning onboarding_completed_at into completed;
 if not found then return jsonb_build_object('ok',false,'reason','profile_missing'); end if;
 return jsonb_build_object('ok',true,'onboarding_completed_at',completed);
end $$;
revoke all on function private.complete_onboarding_v2(text,text,text[],text[]) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.complete_onboarding_v2(text,text,text[],text[]) to authenticated;
create or replace function public.lit_complete_onboarding_v2(p_team text,p_title text,p_services text[],p_geographies text[] default '{}')
returns jsonb language sql security invoker set search_path = '' as $$
 select private.complete_onboarding_v2(p_team,p_title,p_services,p_geographies);
$$;
revoke all on function public.lit_complete_onboarding_v2(text,text,text[],text[]) from public,anon;
grant execute on function public.lit_complete_onboarding_v2(text,text,text[],text[]) to authenticated;
