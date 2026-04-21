-- Fix handle_new_user_org_bootstrap trigger
-- Bugs: organizations.created_by → owner_id
--       org_members had no status column
--       subscriptions had no org_id or started_at column

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
  -- Skip bootstrap if the user was invited (already has an org_invites row pending)
  IF EXISTS (
    SELECT 1 FROM org_invites
    WHERE email = NEW.email AND status = 'pending'
  ) THEN
    RETURN NEW;
  END IF;

  -- Skip if user already has an org membership (re-trigger guard)
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

  -- Create a personal workspace for the new user
  INSERT INTO organizations (name, owner_id)
  VALUES (full_name || '''s Workspace', NEW.id)
  RETURNING id INTO new_org_id;

  -- Add user as owner (org_members has no status column)
  INSERT INTO org_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  -- Seed a free_trial subscription (subscriptions has no org_id or started_at)
  INSERT INTO subscriptions (user_id, plan_code, status)
  VALUES (NEW.id, 'free_trial', 'trialing')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Re-attach trigger
DROP TRIGGER IF EXISTS on_new_user_org_bootstrap ON auth.users;
CREATE TRIGGER on_new_user_org_bootstrap
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_org_bootstrap();

-- Fix organizations RLS: allow org members (not just owner) to SELECT their org
DROP POLICY IF EXISTS "Users can view orgs they belong to" ON organizations;
CREATE POLICY "Users can view orgs they belong to"
  ON organizations FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = organizations.id
        AND org_members.user_id = auth.uid()
    )
  );

-- Also allow org INSERT for authenticated users (needed when bootstrap trigger fails
-- and frontend creates the org directly via the client)
DROP POLICY IF EXISTS "Users can create their own org" ON organizations;
CREATE POLICY "Users can create their own org"
  ON organizations FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- Allow org members to INSERT into org_members for their own membership
DROP POLICY IF EXISTS "Users can insert their own membership" ON org_members;
CREATE POLICY "Users can insert their own membership"
  ON org_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
