-- Mandatory 3-step post-signup ONBOARDING (2026-08-19).
--
-- WHY: bot/spam signups have been flooding the funnel for days. We already have
-- a Turnstile CAPTCHA + disposable-email blocklist + pre-signup hook + the
-- gibberish-name auto-suspend (20260816010000). This adds ONE MORE layer of
-- qualification friction AFTER the account exists and email is confirmed: the
-- user is forced through a 3-step onboarding (details → qualification → book a
-- demo) before they can reach the app. Real freight pros complete it in ~30s;
-- drive-by bots don't bother. It also captures qualification data (company
-- type, interests, phone) for sales.
--
-- DATA MODEL: extend `profiles` (the canonical per-user row already written by
-- handle_new_user_profile at signup) rather than a side table — the gating flag
-- lives next to full_name/company_name/status, and the frontend already has an
-- RLS self-select policy on profiles, so the routing guard can read the flag
-- with no extra RPC.
--
-- IDEMPOTENT + SAFE FOR PROD. Not applied automatically — apply manually.

-- ── 1. Columns ──────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists phone                   text,
  add column if not exists company_type            text,
  add column if not exists interests               text[] not null default '{}'::text[],
  add column if not exists onboarding_completed_at  timestamptz,
  add column if not exists demo_booked              boolean not null default false;

comment on column public.profiles.company_type is
  'Onboarding qualification: single-select — Freight Broker | Freight Forwarder | 3PL | Shipper | Other.';
comment on column public.profiles.interests is
  'Onboarding qualification: multi-select interests (finding_shippers, outreach, crm, market_intel, competitor_lanes, other).';
comment on column public.profiles.onboarding_completed_at is
  'Set when the user finishes the mandatory 3-step onboarding. NULL => app is gated to /onboarding. Backfilled to now() for all accounts existing before this migration (grandfathered — never re-gate a paying user).';
comment on column public.profiles.demo_booked is
  'True if the user clicked "book a demo" during onboarding (step 3 is skippable).';

-- ── 2. Grandfather every EXISTING user ──────────────────────────────────────
-- Anyone who already has an account predates this feature and must NOT be
-- suddenly locked out. Mark them completed. New signups get NULL (the column
-- default) and are therefore gated. This is the ONLY place existing users are
-- protected; the frontend guard treats NULL === "must onboard".
update public.profiles
   set onboarding_completed_at = coalesce(onboarding_completed_at, now())
 where onboarding_completed_at is null;

-- ── 3. RPC to persist onboarding + flip the flag ────────────────────────────
-- SECURITY DEFINER, gated on auth.uid(). Frontend never writes profiles
-- directly for this (mirrors the referral / stitch RPC pattern). Validates the
-- required fields server-side so a crafted client can't complete onboarding
-- with empty qualification data. Idempotent: safe to call again; once
-- onboarding_completed_at is set it is preserved (only demo_booked can be
-- upgraded false->true on a later call).
create or replace function public.lit_complete_onboarding(
  p_full_name     text,
  p_company_name  text,
  p_phone         text,
  p_company_type  text,
  p_interests     text[],
  p_demo_booked   boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid          uuid := auth.uid();
  v_name         text := btrim(coalesce(p_full_name, ''));
  v_company      text := btrim(coalesce(p_company_name, ''));
  v_phone        text := btrim(coalesce(p_phone, ''));
  v_type         text := btrim(coalesce(p_company_type, ''));
  v_interests    text[] := coalesce(p_interests, '{}'::text[]);
  v_already      timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  -- Server-side validation (client validates too; this is the real boundary).
  if v_name = '' then
    return jsonb_build_object('ok', false, 'reason', 'full_name_required');
  end if;
  if v_phone = '' then
    return jsonb_build_object('ok', false, 'reason', 'phone_required');
  end if;
  if v_type not in ('Freight Broker','Freight Forwarder','3PL','Shipper','Other') then
    return jsonb_build_object('ok', false, 'reason', 'company_type_invalid');
  end if;
  if array_length(v_interests, 1) is null then
    return jsonb_build_object('ok', false, 'reason', 'interests_required');
  end if;

  -- Preserve an earlier completion timestamp if the user somehow re-runs this.
  select onboarding_completed_at into v_already from public.profiles where id = v_uid;

  update public.profiles
     set full_name               = v_name,
         company_name            = coalesce(nullif(v_company, ''), company_name),
         organization_name       = coalesce(nullif(v_company, ''), organization_name),
         phone                   = v_phone,
         company_type            = v_type,
         interests               = v_interests,
         demo_booked             = demo_booked or coalesce(p_demo_booked, false),
         onboarding_completed_at = coalesce(v_already, now()),
         updated_at              = now()
   where id = v_uid;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'profile_missing');
  end if;

  return jsonb_build_object('ok', true, 'onboarding_completed_at', coalesce(v_already, now()));
end;
$$;

comment on function public.lit_complete_onboarding(text,text,text,text,text[],boolean) is
  'Persists the mandatory 3-step onboarding answers to the caller''s profile and stamps onboarding_completed_at (unlocking the app). SECURITY DEFINER, auth.uid()-scoped, server-validates required fields.';

revoke all on function public.lit_complete_onboarding(text,text,text,text,text[],boolean) from public;
grant execute on function public.lit_complete_onboarding(text,text,text,text,text[],boolean) to authenticated;
