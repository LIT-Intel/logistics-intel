-- Phase 1.4 — admin notification on new user signup.
--
-- Trigger fires AFTER INSERT on auth.users and POSTs to the
-- admin-notify edge function so the founder sees every new account.
-- The bearer secret is read from a Postgres config parameter so we
-- never store it in a plaintext table. Set it once with:
--
--   ALTER DATABASE postgres SET app.admin_notify_secret = '<value>';
--   ALTER DATABASE postgres SET app.supabase_functions_base = 'https://jkmrfiaefxwgbvftohrb.functions.supabase.co';
--
-- The trigger function silently skips when either setting is unset —
-- this is observability, not security. Auth still works either way.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_admin_new_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text;
  v_base text;
  v_full_name text;
  v_company text;
  v_payload jsonb;
BEGIN
  v_secret := current_setting('app.admin_notify_secret', true);
  v_base := current_setting('app.supabase_functions_base', true);

  IF v_secret IS NULL OR v_secret = '' OR v_base IS NULL OR v_base = '' THEN
    RAISE NOTICE 'notify_admin_new_signup: skipping (admin_notify_secret or supabase_functions_base not configured)';
    RETURN NEW;
  END IF;

  v_full_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    NEW.raw_user_meta_data ->> 'display_name',
    split_part(NEW.email, '@', 1)
  );
  v_company := COALESCE(
    NEW.raw_user_meta_data ->> 'company',
    NEW.raw_user_meta_data ->> 'organization'
  );

  v_payload := jsonb_build_object(
    'event', 'signup',
    'subject', format('New signup — %s', NEW.email),
    'summary', format('%s signed up', v_full_name),
    'cta_url', 'https://app.logisticintel.com/app/admin',
    'cta_label', 'Open admin',
    'details', jsonb_build_object(
      'Email', NEW.email,
      'Full name', v_full_name,
      'Company', v_company,
      'Provider', COALESCE(NEW.raw_app_meta_data ->> 'provider', 'email'),
      'User id', NEW.id::text,
      'Signed up at', to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'Source', COALESCE(NEW.raw_user_meta_data ->> 'source', 'unknown')
    )
  );

  PERFORM net.http_post(
    url := v_base || '/admin-notify',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := v_payload,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth signup on observability failures.
  RAISE WARNING 'notify_admin_new_signup threw: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_users_admin_notify ON auth.users;
CREATE TRIGGER trg_auth_users_admin_notify
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.notify_admin_new_signup();

-- Confirm the trigger landed.
COMMENT ON FUNCTION public.notify_admin_new_signup() IS
  'Phase 1.4: posts a founder notification to the admin-notify edge function whenever a new user lands in auth.users. Reads bearer secret + base URL from app.admin_notify_secret / app.supabase_functions_base settings; silently skips if unset.';
