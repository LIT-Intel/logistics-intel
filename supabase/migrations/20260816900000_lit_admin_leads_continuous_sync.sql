-- ============================================================================
-- Phase 10 QA fix (P0): CONTINUOUS SYNC for the internal Lead-CRM.
--
-- PROBLEM: lit_admin_leads was populated ONCE by the backfill migration
-- (20260816000300). Nothing writes new leads into it afterward — every new
-- lead-magnet capture (lit_lead_magnet_sessions.email) and every new signup
-- (auth.users / lit_user_activation) is invisible to the /app/leads CRM. The
-- CRM goes stale the moment the backfill ran.
--
-- FIX: a SECURITY DEFINER sync fn that upserts new leads since a high-water
-- mark, deduped on lower(email), excluding internal + suspended/banned, and
-- runs cached company recognition (0 provider credits) on the rows it touches.
-- Registered on pg_cron every 15 min AND safe to call from the magnet/signup
-- paths. Idempotent + monotonic: never downgrades a stage, never touches a
-- manually-overridden lead's stage.
--
-- REUSES (does not rebuild):
--   * public.lead_derived_stage(bool,bool,bool,bool)  -> stage position
--   * public.lit_leadcrm_resolve_company(text,text)   -> cached recognition
--   * public.is_internal_user / is_suspended_or_banned -> exclusion
--   * public.lit_lead_pipeline_stages                 -> stage ids by position
-- ============================================================================

-- High-water mark storage (jsonb KV, mirrors the lit_internal_meta pattern).
insert into public.lit_internal_meta (meta_key, meta_value, updated_at)
values ('admin_leads_sync_hwm', to_jsonb('epoch'::text), now())
on conflict (meta_key) do nothing;

create or replace function public.lit_admin_leads_sync(p_full boolean default false)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hwm       timestamptz;
  v_new_hwm   timestamptz;
  v_touched   integer := 0;
  r           record;
begin
  -- Read the high-water mark. p_full => reconsider every source row (safe: the
  -- upsert is idempotent + monotonic) e.g. for a manual/backfill re-run.
  if p_full then
    v_hwm := 'epoch'::timestamptz;
  else
    select coalesce(nullif(meta_value #>> '{}', '')::timestamptz, 'epoch'::timestamptz)
      into v_hwm
      from public.lit_internal_meta
     where meta_key = 'admin_leads_sync_hwm';
    v_hwm := coalesce(v_hwm, 'epoch'::timestamptz);
  end if;

  -- Stage ids by position (Lost = pos 5, never auto-assigned).
  drop table if exists _stage_ids;
  create temp table _stage_ids on commit drop as
    select position, id from public.lit_lead_pipeline_stages;

  -- Candidate emails from the two live lead sources, only those changed since HWM.
  -- Compute per-email signals then upsert. New MAX(change_ts) becomes the new HWM.
  drop table if exists _cand;
  create temp table _cand on commit drop as
  with magnet as (
    select lower(email) as email,
           null::uuid as user_id,
           max(anonymous_id) as anonymous_id,
           'lead_magnet'::text as src,
           max(magnet_slug) as magnet_slug,
           max(utm_source) as utm_source, max(utm_medium) as utm_medium, max(utm_campaign) as utm_campaign,
           min(coalesce(session_started_at, created_at)) as first_seen_at,
           min(email_captured_at) as email_captured_at,
           min(signup_at) as signup_at,
           min(trial_started_at) as trial_started_at,
           min(converted_at) as converted_at,
           bool_or(first_search_at is not null or first_save_at is not null) as engaged_sig,
           max(greatest(coalesce(created_at,'epoch'::timestamptz),
                        coalesce(email_captured_at,'epoch'::timestamptz),
                        coalesce(signup_at,'epoch'::timestamptz),
                        coalesce(trial_started_at,'epoch'::timestamptz),
                        coalesce(converted_at,'epoch'::timestamptz))) as change_ts
    from public.lit_lead_magnet_sessions
    where email is not null and length(trim(email)) > 0
    group by lower(email)
  ),
  signups as (
    select lower(u.email) as email,
           u.id as user_id,
           null::text as anonymous_id,
           'signup'::text as src,
           null::text as magnet_slug,
           a.first_touch_utm_source as utm_source,
           a.first_touch_utm_medium as utm_medium,
           a.first_touch_utm_campaign as utm_campaign,
           u.created_at as first_seen_at,
           null::timestamptz as email_captured_at,
           coalesce(a.signup_at, u.created_at) as signup_at,
           a.trial_started_at,
           a.converted_paid_at as converted_at,
           (a.first_search_at is not null or a.first_save_at is not null
             or coalesce(a.activity_count_30d,0) > 0) as engaged_sig,
           greatest(coalesce(u.created_at,'epoch'::timestamptz),
                    coalesce(a.updated_at,'epoch'::timestamptz),
                    coalesce(a.signup_at,'epoch'::timestamptz),
                    coalesce(a.trial_started_at,'epoch'::timestamptz),
                    coalesce(a.converted_paid_at,'epoch'::timestamptz)) as change_ts
    from auth.users u
    left join public.lit_user_activation a on a.user_id = u.id
    where u.email is not null
      -- exclude internal + suspended/banned at the source
      and not public.is_internal_user(u.id)
      and not public.is_suspended_or_banned(u.id)
  ),
  unioned as (
    select email, user_id, anonymous_id, src, magnet_slug, utm_source, utm_medium, utm_campaign,
           first_seen_at, email_captured_at, signup_at, trial_started_at, converted_at, engaged_sig, change_ts
    from magnet
    union all
    select email, user_id, anonymous_id, src, magnet_slug, utm_source, utm_medium, utm_campaign,
           first_seen_at, email_captured_at, signup_at, trial_started_at, converted_at, engaged_sig, change_ts
    from signups
  ),
  merged as (
    select
      email,
      (array_remove(array_agg(user_id), null))[1] as user_id,
      (array_remove(array_agg(anonymous_id), null))[1] as anonymous_id,
      coalesce(
        max(case when src='signup' then src end),
        max(case when src='lead_magnet' then src end),
        max(src)
      ) as primary_source,
      (array_remove(array_agg(magnet_slug), null))[1] as magnet_slug,
      (array_remove(array_agg(utm_source), null))[1]  as utm_source,
      (array_remove(array_agg(utm_medium), null))[1]  as utm_medium,
      (array_remove(array_agg(utm_campaign), null))[1] as utm_campaign,
      min(first_seen_at) as first_seen_at,
      min(email_captured_at) as email_captured_at,
      min(signup_at) as signup_at,
      min(trial_started_at) as trial_started_at,
      min(converted_at) as converted_at,
      bool_or(engaged_sig) as engaged_sig,
      max(change_ts) as change_ts
    from unioned
    group by email
  )
  select * from merged
  where change_ts > v_hwm
    and email is not null and length(trim(email)) > 0;

  -- Nothing new: advance HWM to now() only when doing a targeted (non-full) run
  -- would be wrong (no rows => leave HWM alone). Just return.
  if not exists (select 1 from _cand) then
    return 0;
  end if;

  v_new_hwm := (select max(change_ts) from _cand);

  -- Enrich with subscription / activation signals, then upsert one row at a time
  -- so we can call the recognizer per new row (cached, 0 credits) and keep the
  -- monotonic stage rule.
  for r in
    select c.*,
           p.full_name as p_full_name,
           coalesce(p.company_name, p.organization_name) as p_company_name,
           (exists (select 1 from public.subscriptions s
                     where s.user_id = c.user_id and s.status in ('active'))
             or a.converted_paid_at is not null) as sub_paid,
           (a.trial_started_at is not null
             or exists (select 1 from public.subscriptions s
                         where s.user_id = c.user_id and s.status = 'trialing')) as trialing,
           (exists (select 1 from public.lit_activity_events e where e.user_id = c.user_id)
             or a.first_search_at is not null or a.first_save_at is not null) as acct_engaged,
           a.trial_started_at as a_trial_started_at,
           a.converted_paid_at as a_converted_at,
           a.signup_at as a_signup_at
    from _cand c
    left join public.profiles p on p.id = c.user_id
    left join public.lit_user_activation a on a.user_id = c.user_id
  loop
    declare
      v_is_subscriber boolean := r.sub_paid;
      v_is_trial      boolean := (r.trialing or r.a_trial_started_at is not null);
      v_is_engaged    boolean := (r.engaged_sig or r.acct_engaged);
      v_stage_pos     int;
      v_stage_id      uuid;
      v_lead_score    int;
      v_last_act      timestamptz;
      v_lead_id       uuid;
      v_existing_pos  int;
      v_existing_override boolean;
      v_email         citext := r.email::citext;
    begin
      v_stage_pos := public.lead_derived_stage(v_is_subscriber, v_is_trial, v_is_engaged, false);
      select id into v_stage_id from _stage_ids where position = v_stage_pos;

      v_lead_score := 5
        + case when r.user_id is not null or r.signup_at is not null or r.a_signup_at is not null then 20 else 0 end
        + case when v_is_engaged then 15 else 0 end
        + case when v_is_trial then 30 else 0 end
        + case when v_is_subscriber then 50 else 0 end;

      v_last_act := nullif(greatest(
        coalesce(r.converted_at, r.a_converted_at, 'epoch'::timestamptz),
        coalesce(r.a_trial_started_at, r.trial_started_at, 'epoch'::timestamptz),
        coalesce(r.signup_at, r.a_signup_at, 'epoch'::timestamptz),
        coalesce(r.email_captured_at, 'epoch'::timestamptz),
        coalesce(r.first_seen_at, 'epoch'::timestamptz)
      ), 'epoch'::timestamptz);

      -- Existing lead? Fetch current stage position + manual override.
      select l.id, ps.position, l.manual_override
        into v_lead_id, v_existing_pos, v_existing_override
      from public.lit_admin_leads l
      left join public.lit_lead_pipeline_stages ps on ps.id = l.stage_id
      where l.email = v_email;

      if v_lead_id is null then
        -- INSERT new lead.
        insert into public.lit_admin_leads (
          email, user_id, anonymous_id, full_name, company_name, primary_source, magnet_slug,
          utm_source, utm_medium, utm_campaign, stage_id, status, lead_score,
          first_seen_at, email_captured_at, signup_at, trial_started_at, converted_at, last_activity_at
        ) values (
          v_email, r.user_id, r.anonymous_id, r.p_full_name, r.p_company_name, r.primary_source, r.magnet_slug,
          r.utm_source, r.utm_medium, r.utm_campaign, v_stage_id,
          case when v_is_subscriber then 'converted' else 'open' end, v_lead_score,
          r.first_seen_at, r.email_captured_at,
          coalesce(r.signup_at, r.a_signup_at),
          coalesce(r.a_trial_started_at, r.trial_started_at),
          coalesce(r.converted_at, r.a_converted_at),
          v_last_act
        )
        returning id into v_lead_id;
        v_touched := v_touched + 1;
      else
        -- UPDATE existing lead. Monotonic: only ADVANCE the stage, never downgrade,
        -- and never touch stage on a manually-overridden lead. Always refresh
        -- identity/timestamps/score (data freshness), never regressing timestamps.
        update public.lit_admin_leads l
           set user_id      = coalesce(l.user_id, r.user_id),
               anonymous_id = coalesce(l.anonymous_id, r.anonymous_id),
               full_name    = coalesce(r.p_full_name, l.full_name),
               company_name = coalesce(l.company_name, r.p_company_name),
               magnet_slug  = coalesce(l.magnet_slug, r.magnet_slug),
               utm_source   = coalesce(l.utm_source, r.utm_source),
               utm_medium   = coalesce(l.utm_medium, r.utm_medium),
               utm_campaign = coalesce(l.utm_campaign, r.utm_campaign),
               lead_score   = greatest(l.lead_score, v_lead_score),
               status       = case when v_is_subscriber then 'converted' else l.status end,
               stage_id     = case
                                when l.manual_override then l.stage_id
                                when v_stage_pos > coalesce(v_existing_pos, 0) and coalesce(v_existing_pos,0) < 5
                                  then v_stage_id
                                else l.stage_id
                              end,
               signup_at        = least(coalesce(l.signup_at, 'infinity'::timestamptz), coalesce(r.signup_at, r.a_signup_at, 'infinity'::timestamptz)),
               trial_started_at = least(coalesce(l.trial_started_at, 'infinity'::timestamptz), coalesce(r.a_trial_started_at, r.trial_started_at, 'infinity'::timestamptz)),
               converted_at     = least(coalesce(l.converted_at, 'infinity'::timestamptz), coalesce(r.converted_at, r.a_converted_at, 'infinity'::timestamptz)),
               last_activity_at = greatest(coalesce(l.last_activity_at, 'epoch'::timestamptz), coalesce(v_last_act, 'epoch'::timestamptz)),
               updated_at       = now()
         where l.id = v_lead_id;
        v_touched := v_touched + 1;
      end if;

      -- Cached company recognition (0 provider credits) when not yet recognized.
      -- Reuses the shared resolver directly (the RPC wrapper is membership-gated;
      -- here we run as definer/cron so we call the resolver + write directly).
      if v_lead_id is not null then
        declare
          rc record;
          v_name text;
          v_domain text;
        begin
          select company_name, split_part(email::text,'@',2)
            into v_name, v_domain
          from public.lit_admin_leads where id = v_lead_id and company_recognized_at is null;
          if found then
            select * into rc from public.lit_leadcrm_resolve_company(v_name, v_domain);
            update public.lit_admin_leads
               set company_id            = rc.company_id,
                   source_company_key    = rc.source_company_key,
                   company_domain        = rc.company_domain,
                   company_logo_url      = rc.company_logo_url,
                   company_country       = rc.company_country,
                   company_city          = rc.company_city,
                   company_state         = rc.company_state,
                   company_recognized_at = now(),
                   updated_at            = now()
             where id = v_lead_id;
          end if;
        end;
      end if;
    end;
  end loop;

  -- Advance the high-water mark (only on non-full runs; full run must not skip
  -- future incremental rows, so keep the max we saw either way).
  update public.lit_internal_meta
     set meta_value = to_jsonb(v_new_hwm::text), updated_at = now()
   where meta_key = 'admin_leads_sync_hwm'
     and (meta_value #>> '{}')::timestamptz < v_new_hwm;

  return v_touched;
end;
$$;

comment on function public.lit_admin_leads_sync(boolean) is
  'Continuous CRM sync: upserts new lead-magnet captures + new signups into lit_admin_leads since a high-water mark. Deduped on email, excludes internal/suspended/banned, runs cached company recognition (0 provider credits). Monotonic stage advance; never touches manual_override leads. p_full=true reconsiders all rows.';

-- Dispatcher-only: service_role (cron) + platform admin (manual kick).
revoke all on function public.lit_admin_leads_sync(boolean) from public, anon, authenticated;
grant execute on function public.lit_admin_leads_sync(boolean) to service_role;

-- Admin-callable manual trigger (self-gates).
create or replace function public.lit_admin_leads_sync_now()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;
  return public.lit_admin_leads_sync(false);
end;
$$;
revoke all on function public.lit_admin_leads_sync_now() from public, anon, authenticated;
grant execute on function public.lit_admin_leads_sync_now() to authenticated;

-- pg_cron: run every 15 minutes to keep the CRM current.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('lit-admin-leads-sync-15m')
      where exists (select 1 from cron.job where jobname = 'lit-admin-leads-sync-15m');
    perform cron.schedule('lit-admin-leads-sync-15m', '*/15 * * * *',
      $cron$ select public.lit_admin_leads_sync(false); $cron$);
  end if;
end;
$$;
