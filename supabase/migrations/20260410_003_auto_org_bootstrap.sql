-- Migration: auto-create org + membership + subscription for new direct signups
-- Only fires when the new user has no existing org_members row (i.e. not an invited user)

CREATE OR REPLACE FUNCTION handle_new_user_org_bootstrap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  full_name  text;
BEGIN
  -- Skip bootstrap if the user was invited (already has an org_members row pending)
  IF EXISTS (
    SELECT 1 FROM org_invites
    WHERE email = NEW.email AND status = 'pending'
  ) THEN
    RETURN NEW;
  END IF;

  -- Also skip if user already has an org membership (e.g. re-triggered)
  IF EXISTS (
    SELECT 1 FROM org_members WHERE user_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Derive display name
  full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'display_name',
    split_part(NEW.email, '@', 1)
  );

  -- Create a personal organization for the new user
  INSERT INTO organizations (name, created_by)
  VALUES (full_name || '''s Workspace', NEW.id)
  RETURNING id INTO new_org_id;

  -- Add user as owner
  INSERT INTO org_members (org_id, user_id, role, status)
  VALUES (new_org_id, NEW.id, 'owner', 'active');

  -- Create a free_trial subscription for the org
  INSERT INTO subscriptions (org_id, user_id, plan_code, status, started_at)
  VALUES (new_org_id, NEW.id, 'free_trial', 'active', now())
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_new_user_org_bootstrap ON auth.users;
CREATE TRIGGER on_new_user_org_bootstrap
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_org_bootstrap();
