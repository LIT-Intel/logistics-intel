-- Org flow hardening (2026-08-11) — Phase 1 of the enterprise admin work.
--
-- 1. page_permissions on org_members: per-member page access, edited by
--    org owners/admins from Settings → Workspace. NULL = role default
--    (full access). Shape: {"dashboard":true,"search":true,
--    "command_center":true,"campaigns":true,"quoting":true,"billing":false}
--    Enforced in the app shell as a UX control; data access remains
--    org-scoped by RLS regardless.
-- 2. org_invites.used_at: accept paths already try to write it and fall
--    back silently when absent — make it real.
-- 3. Seat-count consistency: the trigger counted members + pending
--    invites while both accept edge functions count members only, so a
--    stale pending invite could block an accept the edge fn had already
--    approved. Now: an INSERT (member or invite) is blocked only when
--    confirmed MEMBERS have reached the cap — pending invites never
--    consume a seat (multiple invites may race for the last seat; first
--    accept wins, the rest fail at accept, matching the edge fns).
-- 4. plans.seat_limit alignment: seat_limit contradicted included_seats
--    (scale said 1 vs 5). Only a COALESCE fallback reads seat_limit —
--    align it to included_seats so no path can pick up the wrong number.

alter table public.org_members
  add column if not exists page_permissions jsonb;

comment on column public.org_members.page_permissions is
  'Per-member page access map, e.g. {"campaigns":false}. NULL = role default (all pages). Edited by org owners/admins; enforced in the app shell.';

alter table public.org_invites
  add column if not exists used_at timestamptz;

update public.plans set seat_limit = included_seats
where seat_limit is distinct from included_seats;

create or replace function public.enforce_org_seat_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
DECLARE
  v_org uuid;
  v_plan_code text;
  v_included_seats int;
  v_member_count int;
BEGIN
  v_org := NEW.org_id;
  IF v_org IS NULL THEN RETURN NEW; END IF;

  -- Resolve the org's effective plan via its owner's subscription.
  SELECT s.plan_code INTO v_plan_code
    FROM public.org_members om
    JOIN public.subscriptions s ON s.user_id = om.user_id
   WHERE om.org_id = v_org AND om.role = 'owner'
     AND s.status IN ('active', 'trialing')
   ORDER BY s.updated_at DESC NULLS LAST
   LIMIT 1;

  -- No plan resolved (e.g. fresh org with no owner subscription yet) —
  -- let the insert proceed; the app's UpgradeGate is the next defence.
  IF v_plan_code IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(included_seats, seat_limit, 1) INTO v_included_seats
    FROM public.plans WHERE code = v_plan_code;
  IF v_included_seats IS NULL THEN RETURN NEW; END IF;

  -- Members ONLY (2026-08-11): pending invites do not consume a seat
  -- until accepted — matches accept-workspace-invite/signup-with-invite.
  SELECT count(*) INTO v_member_count FROM public.org_members WHERE org_id = v_org;

  IF v_member_count >= v_included_seats AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'seat_limit_exceeded: plan % allows % seats; org already has % member(s). Upgrade the plan to add more.',
      v_plan_code, v_included_seats, v_member_count;
  END IF;

  RETURN NEW;
END;
$function$;
