-- BOT SIGNUP DOOR-BLOCK — part 2/3: pre-signup "Before User Created" auth hook.
--
-- This is a Supabase Postgres Auth Hook. When enabled in the dashboard
-- (Authentication > Hooks > "Before user created" > Postgres > public.hook_restrict_signup),
-- GoTrue calls this function with a JSONB `event` BEFORE inserting the new
-- auth.users row. Returning an `error` object rejects the signup; returning an
-- empty object allows it. This is the true door-block: bots never get an account.
--
-- Event contract (per Supabase docs, "Before User Created Hook"):
--   {
--     "metadata": { "uuid":..., "time":..., "name":"before-user-created", "ip_address":... },
--     "user": {
--       "id":..., "email":"a@b.com", "app_metadata": {"provider":"email", ...},
--       "user_metadata": { ...whatever the client passed in signUp options.data... },
--       ...
--     }
--   }
--   - email          => event->'user'->>'email'
--   - full_name      => event->'user'->'user_metadata'->>'full_name'
--                       (our signup client passes full_name + display_name here)
--   - provider       => event->'user'->'app_metadata'->>'provider'  ('email' for pw signup)
-- Reject shape (blocks signup, propagates message to client):
--   { "error": { "http_code": 400, "message": "..." } }
-- Allow shape:
--   {}   (empty object)
--
-- REJECT WHEN:
--   * lit_is_gibberish_name(full_name) is true  (reuses the existing guard), OR
--   * lit_is_blocked_email(email) is true       (disposable/throwaway domain).
-- FAIL OPEN: any internal error => allow the signup (never block a legit user
-- because the hook itself broke). Rejects are logged to lit_signup_spam_log with
-- reason 'hook_reject' (user_id null — no account exists yet).
--
-- NOTE ON security definer: Supabase docs generally recommend NOT using
-- `security definer` for hooks and instead granting table access to
-- supabase_auth_admin. We intentionally use SECURITY DEFINER here (owned by the
-- migration role) so the hook can read lit_blocked_email_domains + write
-- lit_signup_spam_log without widening supabase_auth_admin's grants on those
-- internal tables. search_path is pinned to avoid hijacking.

create or replace function public.hook_restrict_signup(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email    text;
  v_name     text;
  v_provider text;
  v_reject   boolean := false;
  v_reason   text;
  v_message  text;
begin
  -- Defensive extraction. Missing/odd shapes must not throw (fail open below).
  v_provider := event->'user'->'app_metadata'->>'provider';
  v_email    := event->'user'->>'email';
  v_name     := coalesce(
                  event->'user'->'user_metadata'->>'full_name',
                  event->'user'->'user_metadata'->>'display_name',
                  ''
                );

  -- Gibberish single-token name (reuses existing guard).
  if public.lit_is_gibberish_name(v_name) then
    v_reject := true;
    v_reason := 'hook_reject_gibberish_name';
    v_message := 'Please enter a valid full name to create an account.';
  -- Disposable / throwaway email domain.
  elsif public.lit_is_blocked_email(v_email) then
    v_reject := true;
    v_reason := 'hook_reject_disposable_email';
    v_message := 'Please sign up with a permanent work or personal email address.';
  end if;

  if v_reject then
    -- Best-effort log; never let a logging failure turn a reject into an allow
    -- (or vice-versa). user_id is null: no auth.users row exists yet.
    begin
      insert into public.lit_signup_spam_log (user_id, email, full_name, reason)
      values (null, v_email, v_name, v_reason);
    exception when others then
      null;
    end;

    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', v_message
      )
    );
  end if;

  -- Allow: empty object.
  return '{}'::jsonb;
exception
  when others then
    -- FAIL OPEN. If anything above throws unexpectedly, allow the signup so a
    -- bug in the door-block can never lock out real users.
    return '{}'::jsonb;
end;
$function$;

comment on function public.hook_restrict_signup(jsonb) is
  'Supabase "Before User Created" auth hook. Rejects signups with a gibberish name (lit_is_gibberish_name) or disposable email (lit_is_blocked_email). Fails OPEN on any error. Enable in Dashboard > Authentication > Hooks.';

-- Auth admin must be able to run the hook; the schema-usage grant is required
-- because supabase_auth_admin has no default access to the public schema.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_restrict_signup(jsonb) to supabase_auth_admin;

-- Keep it off-limits to the Data API roles.
revoke execute on function public.hook_restrict_signup(jsonb) from anon, authenticated, public;
