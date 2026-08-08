-- trial_welcome must not race the confirmation email (2026-08-08).
--
-- The free-trial subscription is inserted by handle_new_user_org_bootstrap
-- at auth.users INSERT — i.e. at signup, before the user confirms their
-- email — and fire_subscription_lifecycle_email sent trial_welcome the
-- moment the subscription entered 'trialing'. Result: "confirm your email"
-- and "you're in" arrived simultaneously.
--
-- Fix:
--  1. fire_subscription_lifecycle_email skips trial_welcome when the
--     user's email is not yet confirmed (all other lifecycle events are
--     unaffected — they can only occur post-login, hence post-confirm).
--  2. A new trigger on auth.users fires trial_welcome when
--     email_confirmed_at transitions NULL → set. OAuth signups arrive
--     already confirmed at INSERT, so path 1 handles them immediately and
--     this trigger never double-fires (it only watches the transition).
--     send-subscription-email also dedups per (user, event) as a backstop.

create or replace function public.fire_subscription_lifecycle_email()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
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
    if v_trial_days is null or v_trial_days<=0 then v_trial_days:=14; end if;
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
  -- trigger (below) sends it when they click the confirm link.
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

create or replace function public.fire_trial_welcome_on_confirm()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $function$
declare
  v_sub public.subscriptions%rowtype;
  v_first_name text;
  v_plan_name text;
begin
  -- Only the NULL → confirmed transition.
  if old.email_confirmed_at is not null or new.email_confirmed_at is null then
    return new;
  end if;

  select * into v_sub from public.subscriptions
  where user_id = new.id and status = 'trialing'
  limit 1;
  if not found then return new; end if;

  select nullif(split_part(coalesce(up.full_name,''),' ',1),'')
  into v_first_name
  from public.user_profiles up where up.user_id = new.id limit 1;

  select name into v_plan_name from public.plans where code = v_sub.plan_code;
  if v_plan_name is null then v_plan_name := v_sub.plan_code; end if;

  perform net.http_post(
    url:='https://jkmrfiaefxwgbvftohrb.supabase.co/functions/v1/subscription-email-cron',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'X-Internal-Cron',(select decrypted_secret from vault.decrypted_secrets where name='LIT_CRON_SECRET')
    ),
    body:=jsonb_build_object(
      'trigger_one_off',true,'recipient_email',new.email,'first_name',v_first_name,
      'plan_slug',v_sub.plan_code,'plan_name',v_plan_name,'event_type','trial_welcome',
      'user_id',new.id,'org_id',v_sub.organization_id,'subscription_id',v_sub.id::text
    ),
    timeout_milliseconds:=10000
  );
  return new;
exception when others then
  raise warning 'fire_trial_welcome_on_confirm threw: %', sqlerrm;
  return new;
end;
$function$;

drop trigger if exists on_auth_user_email_confirmed_welcome on auth.users;
create trigger on_auth_user_email_confirmed_welcome
after update of email_confirmed_at on auth.users
for each row execute function public.fire_trial_welcome_on_confirm();
