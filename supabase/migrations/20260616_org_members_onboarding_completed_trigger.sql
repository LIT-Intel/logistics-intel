-- Defense-in-depth: when a user joins any workspace (org_members INSERT),
-- mark their onboarding as complete in auth.users.raw_user_meta_data.
-- This guarantees the RequireAuth gate in App.jsx sees the correct flag
-- regardless of which client path created the membership.
--
-- SECURITY DEFINER so the function can write to auth.users (normally
-- protected). Owner is postgres so it inherits the necessary permissions.
--
-- Idempotent: only writes if the flag isn't already true, so it's safe
-- on bulk inserts and re-inserts.

CREATE OR REPLACE FUNCTION public.org_members_mark_onboarding_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_meta jsonb;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(raw_user_meta_data, '{}'::jsonb)
    INTO current_meta
    FROM auth.users
   WHERE id = NEW.user_id;

  IF current_meta IS NULL THEN
    -- User row not found (edge case during signup race). Skip — the client
    -- side update will handle it.
    RETURN NEW;
  END IF;

  IF (current_meta->>'onboarding_completed')::boolean IS DISTINCT FROM TRUE THEN
    UPDATE auth.users
       SET raw_user_meta_data = jsonb_set(
             current_meta,
             '{onboarding_completed}',
             'true'::jsonb,
             true
           ),
           updated_at = now()
     WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_members_mark_onboarding_complete_trg ON public.org_members;
CREATE TRIGGER org_members_mark_onboarding_complete_trg
  AFTER INSERT ON public.org_members
  FOR EACH ROW
  EXECUTE FUNCTION public.org_members_mark_onboarding_complete();

COMMENT ON FUNCTION public.org_members_mark_onboarding_complete() IS
  'Auto-flips auth.users.raw_user_meta_data.onboarding_completed to true when a user joins any workspace. Failsafe so the /onboarding wizard never appears for users with active workspace memberships, regardless of which client path created the membership.';
