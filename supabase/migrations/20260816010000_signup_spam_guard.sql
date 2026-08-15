-- Server-side spam-signup guard. Bots hit the auth signup API directly, bypassing
-- the client-side name/company validation, so they must be caught in the DB at
-- profile-creation time. The observed wave: single-token 17-23 char random names
-- (ifyKjvcQEzYMKFLXTtbo, IflfXcWJQdxEOABWq, ...), unconfirmed, never signed in.
--
-- Conservative heuristic (near-zero false positives, verified against real names
-- incl. Wolfeschlegelstein/Muhammad/Christopher): a REAL human name is extremely
-- unlikely to be a single token >=14 chars, mixed-case, with <32% vowels.

create or replace function public.lit_is_gibberish_name(p_name text)
returns boolean
language plpgsql
immutable
as $$
declare
  n text := btrim(coalesce(p_name, ''));
  letters text;
  vowels int;
  total int;
begin
  if n = '' then return false; end if;
  if position(' ' in n) > 0 then return false; end if; -- has a space => "First Last", treat as human
  if length(n) < 14 then return false; end if;
  if not (n ~ '[a-z]' and n ~ '[A-Z]') then return false; end if; -- must be mixed-case
  letters := regexp_replace(n, '[^A-Za-z]', '', 'g');
  total := length(letters);
  if total = 0 then return false; end if;
  vowels := total - length(regexp_replace(lower(letters), '[aeiou]', '', 'g'));
  return (vowels::numeric / total) < 0.32; -- real words run ~38-45% vowels
end;
$$;

create table if not exists public.lit_signup_spam_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  full_name text,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.lit_signup_spam_log enable row level security;
drop policy if exists lit_signup_spam_log_admin_read on public.lit_signup_spam_log;
create policy lit_signup_spam_log_admin_read on public.lit_signup_spam_log
  for select using (public.is_platform_admin(auth.uid()));

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company text;
  v_name    text;
  v_spam    boolean;
begin
  v_company := nullif(btrim(new.raw_user_meta_data->>'company'), '');
  v_name    := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'display_name', '');
  v_spam    := public.lit_is_gibberish_name(v_name);

  insert into public.profiles (id, full_name, email, company_name, organization_name, status)
  values (
    new.id, v_name, new.email, v_company, v_company,
    case when v_spam then 'suspended' else 'active' end
  )
  on conflict (id) do update
    set status = case when v_spam then 'suspended' else public.profiles.status end;

  if v_spam then
    insert into public.lit_signup_spam_log (user_id, email, full_name, reason)
    values (new.id, new.email, v_name, 'gibberish_name_auto_suspend');
  end if;

  return new;
end;
$function$;

comment on function public.lit_is_gibberish_name(text) is
  'Conservative bot-name detector: single-token, >=14 chars, mixed-case, <32% vowels. Used by handle_new_user_profile to auto-suspend spam signups server-side.';
