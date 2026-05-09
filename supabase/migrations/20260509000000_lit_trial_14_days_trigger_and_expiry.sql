-- LIT trial lifecycle: 14-day trial, auto-fire trial_welcome on signup,
-- auto-expire lapsed trials so accounts gate after the trial ends.
--
-- Per founder 2026-05-09:
--   - Trial duration = 14 days (was 30)
--   - trial_welcome fires immediately when a subscription enters
--     'trialing' status (BEFORE trigger + pg_net call to the
--     subscription-email-cron edge fn's trigger_one_off path)
--   - paid_plan_welcome fires when status transitions trialing → active
--   - When trial_ends_at lapses, status flips to 'expired' (hourly
--     sweep). Combined with serverEntitlements.isSubscriptionLockedOut
--     this gates search / company views / Pulse / enrichment behind an
--     upgrade prompt without fully locking the account.
--
-- Idempotent: re-running this migration is safe.

-- 1. Plans: free_trial duration 30 → 14 days
UPDATE public.plans
SET trial_days = 14, updated_at = NOW()
WHERE code = 'free_trial';

-- 2. Backfill trial_ends_at for existing trialing subscriptions that have
--    a NULL trial_ends_at. New value = started_at + 14 days. Idempotent
--    (only touches NULL rows).
UPDATE public.subscriptions s
SET trial_ends_at = s.started_at + INTERVAL '14 days'
WHERE s.status = 'trialing'
  AND s.trial_ends_at IS NULL
  AND s.started_at IS NOT NULL;

-- 3. Trigger function: BEFORE INSERT/UPDATE on subscriptions.
--    a) Auto-set trial_ends_at = started_at + plans.trial_days when missing
--    b) Fire trial_welcome email via pg_net (idempotent at events layer)
--    c) On status transition trialing → active, fire paid_plan_welcome
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

  -- Decide which email (if any) to fire
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
      'event_type', v_event_type,
      'user_id', NEW.user_id,
      'org_id', NEW.organization_id,
      'subscription_id', NEW.id::text
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_fire_lifecycle_email ON public.subscriptions;
CREATE TRIGGER subscriptions_fire_lifecycle_email
BEFORE INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.fire_subscription_lifecycle_email();

-- 4. Trial expiration sweep
CREATE OR REPLACE FUNCTION public.expire_lapsed_trials()
RETURNS TABLE(expired_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.subscriptions
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'trialing'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < NOW()
  RETURNING id;
$$;

-- 5. Hourly cron job to flip lapsed trials to 'expired'. Once flipped,
--    serverEntitlements.isSubscriptionLockedOut returns true and every
--    feature gate denies — user is forced to /settings/billing.
DO $$ BEGIN
  PERFORM cron.unschedule('lit-trial-expire-sweep');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'lit-trial-expire-sweep',
  '17 * * * *',
  $cron$ SELECT public.expire_lapsed_trials(); $cron$
);
