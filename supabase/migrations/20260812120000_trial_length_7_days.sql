-- Free trial: 14 -> 7 days (2026-08-12 owner directive).
-- Applied to prod via Supabase MCP as migration `trial_length_7_days`.
--
-- Sources of trial length:
--   1. plans.trial_days (free_trial row) — consumed by get_entitlements,
--      get-billing-status, and the subscriptions BEFORE trigger.
--   2. fire_subscription_lifecycle_email() fallback constant (used only
--      when plans.trial_days is NULL/<=0).
--
-- In-flight trials keep their existing trial_ends_at: all current
-- 'trialing' rows had trial_ends_at set (verified 0 NULLs before
-- applying), so no backfill and no retroactive shortening.

-- 1. Source of truth: plans.trial_days for free_trial.
UPDATE public.plans
SET trial_days = 7, updated_at = NOW()
WHERE code = 'free_trial' AND trial_days = 14;

-- 2. Trigger fallback 14 -> 7. Full body otherwise identical to
--    20260808150000_trial_welcome_after_email_confirm.sql.
CREATE OR REPLACE FUNCTION public.fire_subscription_lifecycle_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
declare
  v_email text;
  v_confirmed_at timestamptz;
  v_first_name text;
  v_trial_days int;
  v_event_type text;
  v_started_at timestamptz;
  v_previous_plan_name text;
  v_period_end timestamptz;
  v_plan_name text;
begin
  if new.status='trialing' and new.trial_ends_at is null then
    select trial_days into v_trial_days from public.plans where code=new.plan_code;
    if v_trial_days is null or v_trial_days<=0 then v_trial_days:=7; end if;
    v_started_at:=coalesce(new.started_at,now());
    new.started_at:=v_started_at;
    new.trial_ends_at:=v_started_at+(v_trial_days||' days')::interval;
  end if;

  v_event_type:=null;
  if tg_op='INSERT' and new.status='trialing' then
    v_event_type:='trial_welcome';
  elsif tg_op='UPDATE' then
    if new.status='trialing' and old.status is distinct from 'trialing' then
      v_event_type:='trial_welcome';
    elsif new.status='active' and old.status='trialing' then
      v_event_type:='paid_plan_welcome';
    elsif new.status='active' and old.status='active'
      and new.plan_code is distinct from old.plan_code
      and old.plan_code is not null and old.plan_code<>'free_trial' then
      v_event_type:='upgrade_confirmation';
      select name into v_previous_plan_name from public.plans where code=old.plan_code;
    elsif new.status in ('cancelled','canceled') and old.status is distinct from new.status then
      v_event_type:='cancellation_confirmation';
      v_period_end:=new.current_period_end;
    elsif new.status='past_due' and old.status is distinct from 'past_due' then
      v_event_type:='payment_failed';
    end if;
  end if;

  if v_event_type is null or new.user_id is null then return new; end if;

  select au.email,au.email_confirmed_at,nullif(split_part(coalesce(up.full_name,''),' ',1),'')
  into v_email,v_confirmed_at,v_first_name
  from auth.users au left join public.user_profiles up on up.user_id=au.id
  where au.id=new.user_id limit 1;
  if v_email is null then return new; end if;

  -- Unconfirmed user: hold trial_welcome. The auth.users confirmation
  -- trigger sends it when they click the confirm link.
  if v_event_type='trial_welcome' and v_confirmed_at is null then
    return new;
  end if;

  select name into v_plan_name from public.plans where code=new.plan_code;
  if v_plan_name is null then v_plan_name:=new.plan_code; end if;

  perform net.http_post(
    url:='https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/subscription-email-cron',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Cron',(select decrypted_secret from vault.decrypted_secrets where name='LIT_CRON_SECRET')
    ),
    body:=jsonb_build_object(
      'trigger_one_off',true,'recipient_email',v_email,'first_name',v_first_name,
      'plan_slug',new.plan_code,'plan_name',v_plan_name,'event_type',v_event_type,
      'user_id',new.user_id,'org_id',new.organization_id,'subscription_id',new.id::text,
      'previous_plan_name',v_previous_plan_name,'period_end',v_period_end
    ),
    timeout_milliseconds:=10000
  );
  return new;
end;
$function$;
