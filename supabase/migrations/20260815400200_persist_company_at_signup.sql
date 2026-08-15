-- Persist the mandatory company name captured at signup.
--
-- The signup form now sends `company` in auth user_metadata. Two triggers read
-- it:
--   1. handle_new_user_profile — store it on profiles.company_name (and mirror
--      to organization_name for display). Additive: full_name/email unchanged.
--   2. handle_new_user_org_bootstrap — name the personal workspace after the
--      company when provided, instead of "<name>'s Workspace".
-- Both are backward compatible: when `company` is absent (e.g. OAuth signups,
-- legacy invites) the prior behavior is preserved.

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company text;
BEGIN
  v_company := NULLIF(btrim(NEW.raw_user_meta_data->>'company'), '');

  INSERT INTO public.profiles (id, full_name, email, company_name, organization_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'display_name', ''),
    NEW.email,
    v_company,
    v_company
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user_org_bootstrap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id uuid;
  full_name  text;
  v_company  text;
  v_org_name text;
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

  -- Prefer the company name for the workspace; fall back to "<name>'s Workspace".
  v_company := NULLIF(btrim(NEW.raw_user_meta_data->>'company'), '');
  v_org_name := COALESCE(v_company, full_name || '''s Workspace');

  -- Create a personal workspace for the new user
  INSERT INTO organizations (name, owner_id)
  VALUES (v_org_name, NEW.id)
  RETURNING id INTO new_org_id;

  -- Add user as owner (org_members has no status column)
  INSERT INTO org_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  -- Seed a free_trial subscription (subscriptions has no org_id or started_at)
  INSERT INTO subscriptions (user_id, plan_code, status)
  VALUES (NEW.id, 'free_trial', 'trialing')
  ON CONFLICT (user_id) DO NOTHING;

  -- Demo seed companies (CEO 2026-08-13): every NEW user starts with the
  -- curated list from lit_internal_meta['demo_seed_companies'] pre-saved so
  -- the dashboard / Command Center are populated on first login.
  BEGIN
    INSERT INTO lit_saved_companies
      (user_id, org_id, company_id, stage, status, source, source_company_key)
    SELECT NEW.id, new_org_id, c.id, 'lead', 'active', 'demo_seed', c.source_company_key
    FROM lit_internal_meta m
    CROSS JOIN LATERAL jsonb_array_elements(m.meta_value) AS e
    JOIN lit_companies c ON c.id = (e->>'company_id')::uuid
    WHERE m.meta_key = 'demo_seed_companies'
      AND jsonb_typeof(m.meta_value) = 'array'
    ON CONFLICT (user_id, company_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'demo_seed insert failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
