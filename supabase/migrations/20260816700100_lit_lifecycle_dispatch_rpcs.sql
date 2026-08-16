-- ============================================================================
-- Phase 7/9 dispatcher-support RPCs (called by lifecycle-nudge-tick + the admin
-- "send reactivation now" button). ALL of these enforce the OWNER GATE:
--   * lit_lifecycle_pick_batch  -> returns [] when lifecycle_messaging_enabled is off
--   * lit_reactivation_pick_batch -> returns [] when reactivation_enabled is off
-- so even if the dispatcher is invoked, it sends nothing until the flag is on.
--
-- These run as SECURITY DEFINER but are granted ONLY to service_role (the
-- dispatcher's key) — they are not exposed to authenticated users. The admin
-- "send now" button calls the edge fn (service role), not these directly.
-- ============================================================================

-- ── Lifecycle drip batch picker ─────────────────────────────────────────────
-- Returns up to p_limit eligible users for the ongoing lifecycle drip:
--   * gate ON, else empty
--   * not already nudged for their current stage (campaign='lifecycle')
--   * not suppressed / unsubscribed
--   * ~1 nudge/user/day cap: no lifecycle send to this user in the last 24h
create or replace function public.lit_lifecycle_pick_batch(p_limit integer default 100)
returns table(
  user_id uuid,
  email text,
  stage text,
  event_type text,
  deep_link text,
  recent_company_key text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  -- GATE: dead unless the owner has enabled lifecycle messaging.
  if not public.lit_lifecycle_flag('lifecycle_messaging_enabled') then
    return;  -- empty set
  end if;

  return query
  select
    s.user_id, s.email, s.stage, s.event_type, s.deep_link, s.recent_company_key
  from public.lit_lifecycle_user_stages s
  where s.event_type is not null
    -- once-per-stage dedup
    and not exists (
      select 1 from public.lit_lifecycle_sends ls
       where ls.user_id = s.user_id and ls.stage = s.stage and ls.campaign = 'lifecycle'
    )
    -- ~1 nudge/user/day cap (across all lifecycle stages)
    and not exists (
      select 1 from public.lit_lifecycle_sends ls
       where ls.user_id = s.user_id and ls.campaign = 'lifecycle'
         and ls.sent_at > now() - interval '24 hours'
    )
    -- suppression / unsubscribe
    and not exists (select 1 from public.lit_email_unsubscribes u where lower(u.recipient_email)=lower(s.email))
    and not exists (select 1 from public.lit_email_suppression_list sl where lower(sl.email)=lower(s.email))
    and not exists (select 1 from public.lit_marketing_suppression_list ml where lower(ml.email)=lower(s.email))
  order by s.last_active_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

-- ── Reactivation batch picker (one-time targeted send per segment) ──────────
create or replace function public.lit_reactivation_pick_batch(p_segment text, p_limit integer default 500)
returns table(
  user_id uuid,
  email text,
  stage text,
  event_type text,
  deep_link text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  -- GATE: dead unless the owner has enabled reactivation.
  if not public.lit_lifecycle_flag('reactivation_enabled') then
    return;  -- empty set
  end if;
  if p_segment not in ('A','B','C','D') then
    raise exception 'unknown segment: %', p_segment;
  end if;

  return query
  select s.user_id, s.email, s.stage, s.event_type, s.deep_link
  from public.lit_lifecycle_user_stages s
  where s.event_type is not null
    and case p_segment
          when 'A' then s.stage = 'stage0'
          when 'B' then s.stage = 'stage1'
          when 'C' then s.stage = 'stage2'
          when 'D' then s.stage in ('stage3','stage4','trial_expiry')
        end
    -- once-per-user for the reactivation campaign
    and not exists (
      select 1 from public.lit_lifecycle_sends ls
       where ls.user_id = s.user_id and ls.campaign = 'reactivation'
    )
    and not exists (select 1 from public.lit_email_unsubscribes u where lower(u.recipient_email)=lower(s.email))
    and not exists (select 1 from public.lit_email_suppression_list sl where lower(sl.email)=lower(s.email))
    and not exists (select 1 from public.lit_marketing_suppression_list ml where lower(ml.email)=lower(s.email))
  order by s.last_active_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
end;
$$;

-- ── Idempotent send recorder ────────────────────────────────────────────────
-- Called after a successful mailer dispatch. ON CONFLICT DO NOTHING makes the
-- whole tick idempotent: a duplicate record attempt for the same
-- (user, stage, campaign) is a no-op. Returns true when a NEW row was written.
create or replace function public.lit_lifecycle_record_send(
  p_user uuid,
  p_stage text,
  p_campaign text,
  p_event_type text,
  p_channel text default 'email'
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rows integer := 0;
begin
  if p_campaign not in ('lifecycle','reactivation') then
    raise exception 'unknown campaign: %', p_campaign;
  end if;

  insert into public.lit_lifecycle_sends (user_id, stage, channel, campaign, event_type)
  values (p_user, p_stage, coalesce(p_channel,'email'), p_campaign, p_event_type)
  on conflict (user_id, stage, campaign) do nothing;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- ── Grants: dispatcher-only (service role). NOT exposed to authenticated. ────
revoke all on function public.lit_lifecycle_pick_batch(integer) from public, anon, authenticated;
revoke all on function public.lit_reactivation_pick_batch(text, integer) from public, anon, authenticated;
revoke all on function public.lit_lifecycle_record_send(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.lit_lifecycle_pick_batch(integer) to service_role;
grant execute on function public.lit_reactivation_pick_batch(text, integer) to service_role;
grant execute on function public.lit_lifecycle_record_send(uuid, text, text, text, text) to service_role;
