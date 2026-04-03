-- Setup organization for vraymond83@gmail.com user
-- This migration creates an organization and adds the user as owner

DO $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
BEGIN
  -- Get the user ID for vraymond83@gmail.com
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'vraymond83@gmail.com' LIMIT 1;

  -- Only proceed if the user exists
  IF v_user_id IS NOT NULL THEN
    -- Create organization for the user
    INSERT INTO organizations (id, owner_id, name, industry, region, timezone)
    VALUES (
      gen_random_uuid(),
      v_user_id,
      'Logistics Intel Workspace',
      'Logistics',
      'US',
      'America/New_York'
    )
    ON CONFLICT (owner_id) DO NOTHING
    RETURNING id INTO v_org_id;

    -- If the organization wasn't created (already exists), get its ID
    IF v_org_id IS NULL THEN
      SELECT id INTO v_org_id FROM organizations WHERE owner_id = v_user_id LIMIT 1;
    END IF;

    -- Add user to organization as owner
    INSERT INTO org_members (org_id, user_id, role, joined_at)
    VALUES (v_org_id, v_user_id, 'owner', now())
    ON CONFLICT DO NOTHING;

    -- Create billing record for the organization
    INSERT INTO org_billing (org_id, plan, status, created_at, updated_at)
    VALUES (v_org_id, 'free_trial', 'active', now(), now())
    ON CONFLICT (org_id) DO NOTHING;
  END IF;
END $$;
