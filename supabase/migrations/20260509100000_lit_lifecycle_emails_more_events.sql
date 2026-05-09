-- Extend the subscription lifecycle email trigger to cover the three
-- remaining transitions that the dispatcher already supports but
-- nothing was firing:
--
--   1. Plan upgrade between paid plans (status='active', plan_code
--      changed) -> upgrade_confirmation, with previous_plan_name from
--      plans.name lookup
--   2. Subscription cancelled (status -> cancelled) ->
--      cancellation_confirmation, with period_end so the email can
--      tell the user when they lose access
--   3. Payment failed (status -> past_due) -> payment_failed
--
-- Existing behaviour preserved: INSERT/transition-to-trialing fires
-- trial_welcome; trialing->active fires paid_plan_welcome.
--
-- Idempotent. The dispatcher dedupes on (user_id, org_id, event_type,
-- plan_slug) so re-running the trigger or replaying a Stripe webhook
-- won't double-send.

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
  v_previous_plan_name text;
  v_period_end timestamptz;
  v_plan_name text;
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

  -- Decide which email (if any) to fire
  v_event_type := NULL;
  IF TG_OP = 'INSERT' AND NEW.status = 'trialing' THEN
    v_event_type := 'trial_welcome';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'trialing' AND OLD.status IS DISTINCT FROM 'trialing' THEN
      v_event_type := 'trial_welcome';
    ELSIF NEW.status = 'active' AND OLD.status = 'trialing' THEN
      v_event_type := 'paid_plan_welcome';
    ELSIF NEW.status = 'active'
          AND OLD.status = 'active'
          AND NEW.plan_code IS DISTINCT FROM OLD.plan_code
          AND OLD.plan_code IS NOT NULL
          AND OLD.plan_code <> 'free_trial' THEN
      -- Paid -> Paid plan change. We treat any change as an upgrade
      -- email (covers upgrades and downgrades alike — the copy still
      -- reads "your plan has been updated"). Skip when OLD plan was
      -- free_trial because that case was already covered above by the
      -- trialing->active branch.
      v_event_type := 'upgrade_confirmation';
      SELECT name INTO v_previous_plan_name FROM public.plans WHERE code = OLD.plan_code;
    ELSIF NEW.status IN ('cancelled', 'canceled')
          AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_event_type := 'cancellation_confirmation';
      v_period_end := NEW.current_period_end;
    ELSIF NEW.status = 'past_due' AND OLD.status IS DISTINCT FROM 'past_due' THEN
      v_event_type := 'payment_failed';
    END IF;
  END IF;

  IF v_event_type IS NULL OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look up email + first name
  SELECT au.email, NULLIF(split_part(COALESCE(up.full_name, ''), ' ', 1), '')
  INTO v_email, v_first_name
  FROM auth.users au
  LEFT JOIN public.user_profiles up ON up.user_id = au.id
  WHERE au.id = NEW.user_id
  LIMIT 1;

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Pretty plan name for cancellation/payment_failed copy. Falls back
  -- to plan_code when the plans row has no display name.
  SELECT name INTO v_plan_name FROM public.plans WHERE code = NEW.plan_code;
  IF v_plan_name IS NULL THEN
    v_plan_name := NEW.plan_code;
  END IF;

  -- Fire email asynchronously via pg_net. The dispatcher dedupes on
  -- (user_id, org_id, event_type, plan_slug) so this can't double-send.
  PERFORM net.http_post(
    url := 'https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/subscription-email-cron',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'trigger_one_off', true,
      'recipient_email', v_email,
      'first_name', v_first_name,
      'plan_slug', NEW.plan_code,
      'plan_name', v_plan_name,
      'event_type', v_event_type,
      'user_id', NEW.user_id,
      'org_id', NEW.organization_id,
      'subscription_id', NEW.id::text,
      'previous_plan_name', v_previous_plan_name,
      'period_end', v_period_end
    )
  );

  RETURN NEW;
END;
$$;
