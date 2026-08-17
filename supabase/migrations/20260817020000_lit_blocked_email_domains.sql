-- BOT SIGNUP DOOR-BLOCK — part 1/3: disposable / throwaway email blocklist.
--
-- Bots hit the signup API directly with random gibberish names + throwaway
-- emails (~7/day). We already auto-suspend gibberish names post-hoc
-- (handle_new_user_profile + lit_is_gibberish_name). This adds a seeded
-- disposable-domain blocklist + a helper so BOTH the pre-signup hook
-- (hook_restrict_signup, part 2) and the post-hoc guard (part 3) can reject /
-- suspend throwaway-email signups.
--
-- IMPORTANT: this list contains ONLY disposable / temp-mail providers. Major
-- consumer + business providers (gmail/yahoo/outlook/hotmail/icloud/aol/proton/
-- gmx/…) are LEGIT and must NEVER be listed here.

create table if not exists public.lit_blocked_email_domains (
  domain     text primary key,
  reason     text,
  created_at timestamptz not null default now()
);

comment on table public.lit_blocked_email_domains is
  'Disposable / throwaway email domains blocked at signup. Seeded from common temp-mail providers. Do NOT add major providers (gmail/yahoo/outlook/etc.) — those are legit.';

-- Lock it down: this is an internal control table. Only the DB owner + auth admin
-- (for the SECURITY DEFINER helper it never queries directly, but be safe) touch it.
alter table public.lit_blocked_email_domains enable row level security;
revoke all on table public.lit_blocked_email_domains from anon, authenticated;
-- No RLS policy for anon/authenticated => no client access. Platform admins can
-- manage rows via SQL / service role as needed.

-- Seed list — common disposable/temp-mail domains (2026-08). Case-insensitive by
-- convention (all lowercase). Helper below lowercases the input before matching.
insert into public.lit_blocked_email_domains (domain, reason) values
  ('mailinator.com',      'disposable'),
  ('guerrillamail.com',   'disposable'),
  ('guerrillamail.info',  'disposable'),
  ('guerrillamail.net',   'disposable'),
  ('guerrillamail.org',   'disposable'),
  ('guerrillamail.biz',   'disposable'),
  ('grr.la',              'disposable'),
  ('sharklasers.com',     'disposable'),
  ('spam4.me',            'disposable'),
  ('10minutemail.com',    'disposable'),
  ('10minutemail.net',    'disposable'),
  ('20minutemail.com',    'disposable'),
  ('tempmail.com',        'disposable'),
  ('temp-mail.org',       'disposable'),
  ('temp-mail.io',        'disposable'),
  ('tempmailo.com',       'disposable'),
  ('tempmail.plus',       'disposable'),
  ('tempr.email',         'disposable'),
  ('tmpmail.org',         'disposable'),
  ('tmpmail.net',         'disposable'),
  ('yopmail.com',         'disposable'),
  ('yopmail.net',         'disposable'),
  ('yopmail.fr',          'disposable'),
  ('getnada.com',         'disposable'),
  ('nada.email',          'disposable'),
  ('trashmail.com',       'disposable'),
  ('trashmail.de',        'disposable'),
  ('trashmail.net',       'disposable'),
  ('trbvm.com',           'disposable'),
  ('dispostable.com',     'disposable'),
  ('throwawaymail.com',   'disposable'),
  ('throwaway.email',     'disposable'),
  ('maildrop.cc',         'disposable'),
  ('mailnesia.com',       'disposable'),
  ('mailcatch.com',       'disposable'),
  ('mohmal.com',          'disposable'),
  ('fakeinbox.com',       'disposable'),
  ('fakemailgenerator.com','disposable'),
  ('emailondeck.com',     'disposable'),
  ('mintemail.com',       'disposable'),
  ('mytemp.email',        'disposable'),
  ('inboxkitten.com',     'disposable'),
  ('discard.email',       'disposable'),
  ('discardmail.com',     'disposable'),
  ('spamgourmet.com',     'disposable'),
  ('mailsac.com',         'disposable'),
  ('moakt.com',           'disposable'),
  ('emailfake.com',       'disposable'),
  ('email-fake.com',      'disposable'),
  ('luxusmail.org',       'disposable'),
  ('dropmail.me',         'disposable'),
  ('33mail.com',          'disposable'),
  ('anonaddy.com',        'disposable'),
  ('burnermail.io',       'disposable'),
  ('getairmail.com',      'disposable'),
  ('easytrashmail.com',   'disposable'),
  ('wegwerfmail.de',      'disposable'),
  ('maileater.com',       'disposable'),
  ('mail-temp.com',       'disposable'),
  ('mvrht.net',           'disposable'),
  ('cs.email',            'disposable')
on conflict (domain) do nothing;

-- Helper: is this email on the disposable/throwaway blocklist?
-- Extracts the domain (part after the last '@'), lowercases it, and checks the
-- table. Returns false for null/malformed input (fail-open: never block on a
-- parse miss). IMMUTABLE-ish but marked STABLE because it reads a table.
create or replace function public.lit_is_blocked_email(p_email text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_domain text;
begin
  if p_email is null then return false; end if;
  v_domain := lower(btrim(split_part(p_email, '@', 2)));
  if v_domain = '' then return false; end if;
  return exists (
    select 1 from public.lit_blocked_email_domains d where d.domain = v_domain
  );
exception
  when others then
    -- Fail OPEN: never block a legit signup because this helper errored.
    return false;
end;
$function$;

comment on function public.lit_is_blocked_email(text) is
  'True when the email domain is on lit_blocked_email_domains (disposable/throwaway). Fails OPEN (returns false) on null/malformed/error.';

-- The post-hoc trigger (handle_new_user_profile) runs SECURITY DEFINER as the
-- table owner and already has access. The pre-signup hook (part 2) is also
-- SECURITY DEFINER owned by the same role, so it can call this too. Grant
-- EXECUTE to supabase_auth_admin explicitly so the hook can invoke it.
grant execute on function public.lit_is_blocked_email(text) to supabase_auth_admin;
revoke execute on function public.lit_is_blocked_email(text) from anon, authenticated, public;
