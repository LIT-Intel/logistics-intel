-- BOT SIGNUP DOOR-BLOCK — part 3/3: strengthen the post-hoc guard.
--
-- The pre-signup hook (part 2) is the real door-block, but it's owner-enabled in
-- the dashboard and could be disabled. This adds defense-in-depth: if a
-- blocked-domain signup ever reaches auth.users (hook off, OAuth path, whatever),
-- handle_new_user_profile also auto-suspends it and logs it — same treatment the
-- gibberish-name guard already gives.
--
-- Only change vs the existing function: v_spam now also trips on
-- lit_is_blocked_email(new.email), and the spam-log reason distinguishes the two
-- causes. Gibberish-name behavior is unchanged.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company text;
  v_name    text;
  v_bad_name  boolean;
  v_bad_email boolean;
  v_spam    boolean;
  v_reason  text;
begin
  v_company := nullif(btrim(new.raw_user_meta_data->>'company'), '');
  v_name    := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'display_name', '');

  v_bad_name  := public.lit_is_gibberish_name(v_name);
  v_bad_email := public.lit_is_blocked_email(new.email);
  v_spam      := v_bad_name or v_bad_email;

  insert into public.profiles (id, full_name, email, company_name, organization_name, status)
  values (
    new.id, v_name, new.email, v_company, v_company,
    case when v_spam then 'suspended' else 'active' end
  )
  on conflict (id) do update
    set status = case when v_spam then 'suspended' else public.profiles.status end;

  if v_spam then
    v_reason := case
      when v_bad_name and v_bad_email then 'gibberish_name_and_disposable_email_auto_suspend'
      when v_bad_email then 'disposable_email_auto_suspend'
      else 'gibberish_name_auto_suspend'
    end;
    insert into public.lit_signup_spam_log (user_id, email, full_name, reason)
    values (new.id, new.email, v_name, v_reason);
  end if;

  return new;
end;
$function$;

comment on function public.handle_new_user_profile() is
  'Post-signup trigger: provisions the profile and auto-suspends + logs bot signups (gibberish name via lit_is_gibberish_name OR disposable email via lit_is_blocked_email). Defense-in-depth behind the pre-signup hook_restrict_signup door-block.';
