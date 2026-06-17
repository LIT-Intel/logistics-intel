-- Backfill org_members.email and full_name from auth.users for any rows
-- that joined without these columns populated. Accept-workspace-invite was
-- inserting only (org_id, user_id, role) prior to 2026-06-16, leaving the
-- display columns NULL -- Settings -> Workspace Members showed the UUID
-- instead of a friendly name + email.

UPDATE public.org_members om
SET
  email = COALESCE(om.email, u.email),
  full_name = COALESCE(
    om.full_name,
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    NULLIF(u.raw_user_meta_data->>'display_name', ''),
    split_part(u.email, '@', 1)
  )
FROM auth.users u
WHERE om.user_id = u.id
  AND (om.email IS NULL OR om.full_name IS NULL);

-- Also add a trigger so future inserts auto-fill from auth.users if the
-- caller forgot to set these columns. Belt-and-suspenders against any
-- future edge fn or admin path that inserts a bare row.
CREATE OR REPLACE FUNCTION public.org_members_fill_display_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  u_row record;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.email IS NOT NULL AND NEW.full_name IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT email, raw_user_meta_data INTO u_row FROM auth.users WHERE id = NEW.user_id;
  IF u_row IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.email IS NULL THEN
    NEW.email := u_row.email;
  END IF;
  IF NEW.full_name IS NULL THEN
    NEW.full_name := COALESCE(
      NULLIF(u_row.raw_user_meta_data->>'full_name', ''),
      NULLIF(u_row.raw_user_meta_data->>'display_name', ''),
      split_part(u_row.email, '@', 1)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_members_fill_display_columns_trg ON public.org_members;
CREATE TRIGGER org_members_fill_display_columns_trg
  BEFORE INSERT ON public.org_members
  FOR EACH ROW
  EXECUTE FUNCTION public.org_members_fill_display_columns();
