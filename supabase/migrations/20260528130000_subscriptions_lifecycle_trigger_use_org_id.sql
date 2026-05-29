-- 20260528130000_subscriptions_lifecycle_trigger_use_org_id.sql
--
-- Bug fix discovered during the subscriptions org-keyed audit (2026-05-28).
--
-- Two lifecycle-email trigger functions were referencing NEW.organization_id
-- on the subscriptions table:
--   - public.fire_subscription_lifecycle_email
--     (from 20260509000000_lit_trial_14_days_trigger_and_expiry.sql)
--   - public.fire_subscription_lifecycle_email_more_events (or whatever the
--     20260509100000 trigger was named — see below)
--
-- The `organization_id` column does not exist on subscriptions and never did.
-- At runtime PL/pgSQL evaluates NEW.organization_id when the trigger fires,
-- which would raise `record "new" has no field "organization_id"` and abort
-- the originating INSERT/UPDATE. The fact that subscription rows still get
-- written suggests the trigger has been silently failing inside an exception
-- handler somewhere, OR trial signups go through a path that doesn't fire
-- these branches.
--
-- Either way, the right fix is to use the org_id column added by migration
-- 20260528120000. This migration MUST be applied after that one.
--
-- We replace the function bodies via CREATE OR REPLACE FUNCTION. The
-- triggers themselves don't need to be re-created — they reference the
-- function by name.

begin;

CREATE OR REPLACE FUNCTION public.fire_subscription_lifecycle_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_email text;
  v_first_name text;
  v_trial_days int;
  v_event_type text;
  v_started_at timestamptz;
BEGIN
  -- Compute trial_ends_at if entering trialing without it set
  IF NEW.status = 'trialing' AND NEW.trial_ends_at IS NULL THEN
    SELECT trial_days INTO v_trial_days FROM public.plans WHERE code = NEW.plan_code;
    IF v_trial_days IS NULL OR v_trial_days <= 0 THEN
      v_trial_days := 14;
    END IF;
    v_started_at := COALESCE(NEW.started_at, NOW());
    NEW.started_at := v_started_at;
    NEW.trial_ends_at := v_started_at + (v_trial_days || ' days')::interval;
  END IF;

  v_event_type := NULL;
  IF TG_OP = 'INSERT' AND NEW.status = 'trialing' THEN
    v_event_type := 'trial_welcome';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'trialing' AND OLD.status IS DISTINCT FROM 'trialing' THEN
      v_event_type := 'trial_welcome';
    ELSIF NEW.status = 'active' AND OLD.status = 'trialing' THEN
      v_event_type := 'paid_plan_welcome';
    END IF;
  END IF;

  IF v_event_type IS NULL OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT au.email, NULLIF(split_part(COALESCE(up.full_name, ''), ' ', 1), '')
  INTO v_email, v_first_name
  FROM auth.users au
  LEFT JOIN public.user_profiles up ON up.user_id = au.id
  WHERE au.id = NEW.user_id
  LIMIT 1;

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Use NEW.org_id (added by 20260528120000_subscriptions_add_org_id.sql).
  -- The previous version referenced NEW.organization_id which never
  -- existed; that would raise `record has no field organization_id` and
  -- abort the originating INSERT/UPDATE.
  PERFORM net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/subscription-email-cron',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'trigger_one_off', true,
      'recipient_email', v_email,
      'first_name', v_first_name,
      'plan_slug', NEW.plan_code,
      'event_type', v_event_type,
      'user_id', NEW.user_id,
      'org_id', NEW.org_id,
      'subscription_id', NEW.id::text
    )
  );

  RETURN NEW;
END;
$$;

-- The 20260509100000_lit_lifecycle_emails_more_events migration defined a
-- second trigger function with the same bug. Find any function in the
-- public schema whose source still references NEW.organization_id and
-- replace the literal `NEW.organization_id` with `NEW.org_id` in-place via
-- pg_get_functiondef. Safer than naming the function explicitly, since the
-- migration's exact function name may have drifted.
DO $$
DECLARE
  fn_record record;
  fn_def text;
  fn_def_fixed text;
BEGIN
  FOR fn_record IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'fire_%subscription%'
      AND pg_get_functiondef(p.oid) LIKE '%NEW.organization_id%'
  LOOP
    fn_def := pg_get_functiondef(fn_record.oid);
    fn_def_fixed := replace(fn_def, 'NEW.organization_id', 'NEW.org_id');
    -- Replace 'CREATE OR REPLACE FUNCTION' with itself idempotent on rerun.
    EXECUTE fn_def_fixed;
    RAISE NOTICE 'Patched function: %.%', 'public', fn_record.proname;
  END LOOP;
END
$$;

commit;
