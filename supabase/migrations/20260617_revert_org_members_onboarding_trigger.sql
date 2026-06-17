-- REVERT 20260616_org_members_onboarding_completed_trigger.
--
-- That trigger flipped onboarding_completed=true on every org_members INSERT,
-- which BROKE regular signup. Existing design: the `on_new_user_org_bootstrap`
-- trigger auto-creates a personal workspace + org_members row at signup; the
-- 6-step wizard then customizes it. By auto-flipping onboarding_completed,
-- regular signups bypassed the wizard entirely.
--
-- Invite flows DON'T need this trigger because:
--   - accept-workspace-invite uses admin.auth.admin.updateUserById to set
--     onboarding_completed=true server-side before the response returns
--   - signup-with-invite passes onboarding_completed=true in createUser's
--     user_metadata, baked into the very first JWT
--
-- Both server-side writes commit to auth.users.raw_user_meta_data BEFORE the
-- next session/JWT is minted, so invitees correctly bypass onboarding while
-- regular signups go through it.
--
-- Applied to prod 2026-06-17 via Supabase MCP. Mirrored here for git parity.

DROP TRIGGER IF EXISTS org_members_mark_onboarding_complete_trg ON public.org_members;
DROP FUNCTION IF EXISTS public.org_members_mark_onboarding_complete();
