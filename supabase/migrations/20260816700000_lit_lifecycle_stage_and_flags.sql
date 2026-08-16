-- ============================================================================
-- Phase 7 (Lifecycle Behavioral Messaging) + Phase 9 (Existing-User Reactivation)
-- Stage computation, reactivation segments, send-tracking, and the OWNER GATE.
--
-- SAFETY: both gate flags (lifecycle_messaging_enabled / reactivation_enabled)
-- default FALSE. The dispatcher edge fn and admin "send now" buttons MUST no-op
-- when the corresponding flag is off. Nothing emails a real user until the owner
-- flips the flag via lit_admin_set_lifecycle_flag().
--
-- Reuses: lit_user_activation (activation data), lit_internal_meta (KV flags,
-- mirrors the attio_sync_flag kill-switch pattern), lit_email_unsubscribes +
-- lit_email_suppression_list + lit_marketing_suppression_list (suppression),
-- is_platform_admin() (admin gate), organizations.is_internal (internal exclude),
-- profiles.status='suspended' + auth.users.banned_until (suspended exclude),
-- lit_saved_companies.source_company_key (deep-link company slug).
-- ============================================================================

-- ── 1. Send-tracking table (once-per-user-per-stage dedup) ──────────────────
create table if not exists public.lit_lifecycle_sends (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  stage       text not null,                    -- 'stage0'..'stage4','trial_expiry'
  channel     text not null default 'email',
  campaign    text not null default 'lifecycle',-- 'lifecycle' | 'reactivation'
  event_type  text,                             -- send-subscription-email event_type used
  sent_at     timestamptz not null default now()
);

-- Dedup guarantee: a given user is nudged at most once per (stage, campaign).
create unique index if not exists lit_lifecycle_sends_user_stage_campaign_uidx
  on public.lit_lifecycle_sends (user_id, stage, campaign);
create index if not exists lit_lifecycle_sends_sent_at_idx
  on public.lit_lifecycle_sends (sent_at desc);

alter table public.lit_lifecycle_sends enable row level security;
-- No permissive policies: only SECURITY DEFINER RPCs + service-role (dispatcher)
-- touch this table. RLS-on with no policy = deny-all to anon/authenticated.

-- ── 2. Gate-flag seed (default OFF) + reader/setters ────────────────────────
insert into public.lit_internal_meta (meta_key, meta_value, updated_at)
values
  ('lifecycle_messaging_enabled', 'false'::jsonb, now()),
  ('reactivation_enabled',        'false'::jsonb, now())
on conflict (meta_key) do nothing;   -- never re-arm on re-run; preserve owner setting

-- Boolean reader for a lifecycle flag. Fails CLOSED (default false) — the
-- opposite of attio_sync_flag (which fails open) because these gate real sends.
create or replace function public.lit_lifecycle_flag(p_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select (meta_value #>> '{}')::boolean
       from public.lit_internal_meta
      where meta_key = p_key
        and p_key in ('lifecycle_messaging_enabled','reactivation_enabled')),
    false
  );
$$;

-- Platform-admin setter for the gate flags. The confirm-and-enable path.
create or replace function public.lit_admin_set_lifecycle_flag(p_key text, p_enabled boolean)
returns table(meta_key text, enabled boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;
  if p_key not in ('lifecycle_messaging_enabled','reactivation_enabled') then
    raise exception 'unknown lifecycle flag: %', p_key;
  end if;

  insert into public.lit_internal_meta (meta_key, meta_value, updated_at)
  values (p_key, to_jsonb(coalesce(p_enabled, false)), now())
  on conflict (meta_key)
    do update set meta_value = to_jsonb(coalesce(p_enabled, false)), updated_at = now();

  return query
    select m.meta_key, (m.meta_value #>> '{}')::boolean, m.updated_at
      from public.lit_internal_meta m
     where m.meta_key = p_key;
end;
$$;

-- ── 3. Core stage computation view (SECURITY DEFINER via wrapper RPCs) ──────
-- One row per ACTIVE, non-internal, non-suspended user with a computed stage,
-- the branded event_type to send, and the resolved deep link. Reactivation and
-- lifecycle both read from THIS single source of truth (spec §30-35, §54).
--
-- Stages:
--   stage0: signed up, NO search          -> day1_run_first_search  -> /app/search
--   stage1: searched, NO save             -> lifecycle_save_company  -> most-recent co or /app/search
--   stage2: saved, NO intel/return        -> lifecycle_view_intel    -> /app/companies/:key?tab=research
--   stage3: viewed intel, NO contacts     -> lifecycle_find_contacts -> /app/companies/:key?tab=contacts
--   stage4: engaged, trial not converted  -> lifecycle_value_recap   -> /app/pricing
--   trial_expiry (day5/6/7/expired)       -> lifecycle_trial_value   -> /app/pricing  (accumulated-value framing)
--
-- NOTE ON DEEP LINKS: the real app route is /app/companies/:id (CompanyProfileV2
-- resolves :id against source_company_key). There is NO "pulse" tab — Pulse AI
-- intelligence lives under the "research" tab; contacts under "contacts". The
-- pricing route is /app/pricing.
create or replace view public.lit_lifecycle_user_stages
with (security_invoker = false) as
with base as (
  select
    a.user_id,
    a.email,
    a.first_search_at,
    a.first_save_at,
    a.first_profile_view_at,
    a.first_enrichment_at,
    a.returned_d7_at,
    a.trial_started_at,
    a.converted_paid_at,
    a.current_plan,
    a.current_status,
    a.last_active_at,
    a.activity_count_30d,
    pr.status as profile_status,
    (u.banned_until is not null and u.banned_until > now()) as is_banned,
    coalesce(bool_or(o.is_internal), false) as is_internal,
    (
      select sc.source_company_key
        from public.lit_saved_companies sc
       where sc.user_id = a.user_id
         and sc.source_company_key is not null
       order by sc.created_at desc
       limit 1
    ) as recent_company_key,
    -- trial-expiry window: trial started, still on trial/unconverted, day 5/6/7/
    -- expired of the 7-day trial. IMPORTANT: requires first_search_at — the
    -- accumulated-value framing (§54) only makes sense for users who actually
    -- activated. A never-searched user with a stale trial belongs in stage0
    -- ("run your first search"), NOT a "look at all your value" email.
    case
      when a.trial_started_at is not null
       and a.converted_paid_at is null
       and a.first_search_at is not null
       and now() >= a.trial_started_at + interval '5 days'
      then true else false
    end as in_trial_expiry
  from public.lit_user_activation a
  left join auth.users u on u.id = a.user_id
  left join public.profiles pr on pr.id = a.user_id
  left join public.org_members m on m.user_id = a.user_id
  left join public.organizations o on o.id = m.org_id
  group by
    a.user_id, a.email, a.first_search_at, a.first_save_at, a.first_profile_view_at,
    a.first_enrichment_at, a.returned_d7_at, a.trial_started_at, a.converted_paid_at,
    a.current_plan, a.current_status, a.last_active_at, a.activity_count_30d,
    pr.status, u.banned_until
),
classified as (
  select
    b.*,
    case
      when b.in_trial_expiry then 'trial_expiry'
      when b.first_search_at is null then 'stage0'
      when b.first_save_at is null then 'stage1'
      when b.first_profile_view_at is null and b.returned_d7_at is null then 'stage2'
      when b.first_enrichment_at is null then 'stage3'
      else 'stage4'
    end as stage
  from base b
  -- Active, real users only. Converted-paid users are excluded from lifecycle
  -- (they're customers, not nudge targets) EXCEPT they never reach here because
  -- converted_paid_at is null in every stage branch below via the where clause.
  where not b.is_internal
    and coalesce(b.profile_status, '') <> 'suspended'
    and not b.is_banned
    and b.converted_paid_at is null
)
select
  c.user_id,
  c.email,
  c.stage,
  case c.stage
    when 'stage0'       then 'day1_run_first_search'
    when 'stage1'       then 'lifecycle_save_company'
    when 'stage2'       then 'lifecycle_view_intel'
    when 'stage3'       then 'lifecycle_find_contacts'
    when 'stage4'       then 'lifecycle_value_recap'
    when 'trial_expiry' then 'lifecycle_trial_value'
  end as event_type,
  case c.stage
    when 'stage0' then '/app/search'
    when 'stage1' then coalesce('/app/companies/' || c.recent_company_key, '/app/search')
    when 'stage2' then coalesce('/app/companies/' || c.recent_company_key || '?tab=research', '/app/search')
    when 'stage3' then coalesce('/app/companies/' || c.recent_company_key || '?tab=contacts', '/app/companies')
    when 'stage4' then '/app/pricing'
    when 'trial_expiry' then '/app/pricing'
  end as deep_link,
  c.recent_company_key,
  c.current_plan,
  c.activity_count_30d,
  c.last_active_at,
  c.trial_started_at
from classified c;

comment on view public.lit_lifecycle_user_stages is
  'Phase 7/9 single source of truth: active non-internal/non-suspended/unconverted users with computed lifecycle stage, branded event_type, and resolved deep link. Read only by SECURITY DEFINER admin RPCs and the dispatcher (service role).';

-- ── 4. Per-user classifier RPC (spec: lit_lifecycle_stage(user)) ────────────
-- Returns the row {user_id, email, stage, deep_link, last_nudged_stage, eligible}
-- for a single user. eligible = not-yet-nudged-for-this-stage(lifecycle) AND
-- not suppressed/unsubscribed.
create or replace function public.lit_lifecycle_stage(p_user uuid)
returns table(
  user_id uuid,
  email text,
  stage text,
  event_type text,
  deep_link text,
  last_nudged_stage text,
  eligible boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    s.user_id,
    s.email,
    s.stage,
    s.event_type,
    s.deep_link,
    (select ls.stage
       from public.lit_lifecycle_sends ls
      where ls.user_id = s.user_id and ls.campaign = 'lifecycle'
      order by ls.sent_at desc limit 1) as last_nudged_stage,
    (
      -- eligible: never nudged for THIS stage on the lifecycle drip, and the
      -- email is not suppressed / unsubscribed anywhere.
      not exists (
        select 1 from public.lit_lifecycle_sends ls
         where ls.user_id = s.user_id and ls.stage = s.stage and ls.campaign = 'lifecycle'
      )
      and not exists (select 1 from public.lit_email_unsubscribes u
                       where lower(u.recipient_email) = lower(s.email))
      and not exists (select 1 from public.lit_email_suppression_list sl
                       where lower(sl.email) = lower(s.email))
      and not exists (select 1 from public.lit_marketing_suppression_list ml
                       where lower(ml.email) = lower(s.email))
    ) as eligible
  from public.lit_lifecycle_user_stages s
  where s.user_id = p_user;
$$;

-- ── 5. Admin lifecycle segment counts (spec: lit_admin_lifecycle_segments) ──
create or replace function public.lit_admin_lifecycle_segments()
returns table(
  stage text,
  event_type text,
  total bigint,
  eligible bigint,
  already_nudged bigint,
  suppressed bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  return query
  with rows as (
    select
      s.stage,
      s.event_type,
      s.user_id,
      s.email,
      exists (select 1 from public.lit_lifecycle_sends ls
               where ls.user_id = s.user_id and ls.stage = s.stage and ls.campaign = 'lifecycle') as nudged,
      (exists (select 1 from public.lit_email_unsubscribes u where lower(u.recipient_email)=lower(s.email))
       or exists (select 1 from public.lit_email_suppression_list sl where lower(sl.email)=lower(s.email))
       or exists (select 1 from public.lit_marketing_suppression_list ml where lower(ml.email)=lower(s.email))) as suppressed
    from public.lit_lifecycle_user_stages s
  )
  select
    r.stage,
    max(r.event_type) as event_type,
    count(*)::bigint as total,
    count(*) filter (where not r.nudged and not r.suppressed)::bigint as eligible,
    count(*) filter (where r.nudged)::bigint as already_nudged,
    count(*) filter (where r.suppressed)::bigint as suppressed
  from rows r
  group by r.stage
  order by r.stage;
end;
$$;

-- ── 6. Admin lifecycle stage PREVIEW (sample users per stage) ───────────────
create or replace function public.lit_admin_lifecycle_preview(p_stage text default null, p_limit integer default 25)
returns table(
  user_id uuid,
  email text,
  stage text,
  event_type text,
  deep_link text,
  activity_count_30d integer,
  last_active_at timestamptz,
  already_nudged boolean,
  suppressed boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  return query
  select
    s.user_id, s.email, s.stage, s.event_type, s.deep_link,
    s.activity_count_30d, s.last_active_at,
    exists (select 1 from public.lit_lifecycle_sends ls
             where ls.user_id = s.user_id and ls.stage = s.stage and ls.campaign = 'lifecycle') as already_nudged,
    (exists (select 1 from public.lit_email_unsubscribes u where lower(u.recipient_email)=lower(s.email))
     or exists (select 1 from public.lit_email_suppression_list sl where lower(sl.email)=lower(s.email))
     or exists (select 1 from public.lit_marketing_suppression_list ml where lower(ml.email)=lower(s.email))) as suppressed
  from public.lit_lifecycle_user_stages s
  where (p_stage is null or s.stage = p_stage)
  order by s.stage, s.last_active_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 25), 500));
end;
$$;

-- ── 7. Reactivation segments (Phase 9) ──────────────────────────────────────
-- Segment A: signed up / never searched   (== stage0)
-- Segment B: searched / never saved        (== stage1)
-- Segment C: saved / never returned/intel  (== stage2)
-- Segment D: high usage / not paid         (stage3+stage4+trial_expiry with activity)
-- Reactivation dedup uses campaign='reactivation' (separate ledger from the
-- ongoing 'lifecycle' drip), so a user can get one reactivation touch AND still
-- flow through lifecycle later.
create or replace function public.lit_admin_reactivation_segments()
returns table(
  segment text,
  label text,
  total bigint,
  eligible bigint,
  already_sent bigint,
  suppressed bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  return query
  with rows as (
    select
      s.user_id, s.email,
      case
        when s.stage = 'stage0' then 'A'
        when s.stage = 'stage1' then 'B'
        when s.stage = 'stage2' then 'C'
        else 'D'   -- stage3 / stage4 / trial_expiry = engaged-but-unpaid
      end as segment,
      exists (select 1 from public.lit_lifecycle_sends ls
               where ls.user_id = s.user_id and ls.campaign = 'reactivation') as sent,
      (exists (select 1 from public.lit_email_unsubscribes u where lower(u.recipient_email)=lower(s.email))
       or exists (select 1 from public.lit_email_suppression_list sl where lower(sl.email)=lower(s.email))
       or exists (select 1 from public.lit_marketing_suppression_list ml where lower(ml.email)=lower(s.email))) as suppressed
    from public.lit_lifecycle_user_stages s
  ),
  seg(segment, label) as (
    values
      ('A','Signed up / never searched'),
      ('B','Searched / never saved'),
      ('C','Saved / never returned'),
      ('D','High usage / not paid')
  )
  select
    seg.segment, seg.label,
    count(r.user_id)::bigint as total,
    count(*) filter (where not r.sent and not r.suppressed)::bigint as eligible,
    count(*) filter (where r.sent)::bigint as already_sent,
    count(*) filter (where r.suppressed)::bigint as suppressed
  from seg
  left join rows r on r.segment = seg.segment
  group by seg.segment, seg.label
  order by seg.segment;
end;
$$;

-- Reactivation user list for a segment (preview + used by the "send now" fn).
create or replace function public.lit_admin_reactivation_users(p_segment text, p_limit integer default 500)
returns table(
  user_id uuid,
  email text,
  stage text,
  event_type text,
  deep_link text,
  eligible boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;
  if p_segment not in ('A','B','C','D') then
    raise exception 'unknown segment: %', p_segment;
  end if;

  return query
  select
    s.user_id, s.email, s.stage, s.event_type, s.deep_link,
    (
      not exists (select 1 from public.lit_lifecycle_sends ls
                   where ls.user_id = s.user_id and ls.campaign = 'reactivation')
      and not exists (select 1 from public.lit_email_unsubscribes u where lower(u.recipient_email)=lower(s.email))
      and not exists (select 1 from public.lit_email_suppression_list sl where lower(sl.email)=lower(s.email))
      and not exists (select 1 from public.lit_marketing_suppression_list ml where lower(ml.email)=lower(s.email))
    ) as eligible
  from public.lit_lifecycle_user_stages s
  where case p_segment
          when 'A' then s.stage = 'stage0'
          when 'B' then s.stage = 'stage1'
          when 'C' then s.stage = 'stage2'
          when 'D' then s.stage in ('stage3','stage4','trial_expiry')
        end
  order by s.last_active_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
end;
$$;

-- ── 8. Grants ───────────────────────────────────────────────────────────────
-- Admin RPCs are SECURITY DEFINER + is_platform_admin()-gated internally, so
-- authenticated may EXECUTE (the function refuses non-admins). The dispatcher
-- (service role) bypasses grants. The stage view is NOT granted to
-- authenticated (only definer functions and service role read it).
revoke all on public.lit_lifecycle_user_stages from anon, authenticated;

grant execute on function public.lit_lifecycle_flag(text) to authenticated, service_role;
grant execute on function public.lit_admin_set_lifecycle_flag(text, boolean) to authenticated;
grant execute on function public.lit_lifecycle_stage(uuid) to authenticated, service_role;
grant execute on function public.lit_admin_lifecycle_segments() to authenticated;
grant execute on function public.lit_admin_lifecycle_preview(text, integer) to authenticated;
grant execute on function public.lit_admin_reactivation_segments() to authenticated;
grant execute on function public.lit_admin_reactivation_users(text, integer) to authenticated;
