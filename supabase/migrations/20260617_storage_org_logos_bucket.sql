-- Create the org-logos storage bucket + RLS policies. Replaces the stubbed
-- base44 UploadFile path in SettingsPage's onUploadLogo. Public read; write
-- restricted to org owners/admins for the matching org_id folder.
-- Applied to prod 2026-06-17 via Supabase MCP. Mirrored here for git parity.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('org-logos', 'org-logos', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/svg+xml'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "org_logos_public_read" ON storage.objects;
CREATE POLICY "org_logos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-logos');

DROP POLICY IF EXISTS "org_logos_admin_upload" ON storage.objects;
CREATE POLICY "org_logos_admin_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'org-logos'
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id::text = (storage.foldername(name))[1]
        AND om.user_id = auth.uid()
        AND om.role IN ('owner','admin')
        AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "org_logos_admin_update" ON storage.objects;
CREATE POLICY "org_logos_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id::text = (storage.foldername(name))[1]
        AND om.user_id = auth.uid()
        AND om.role IN ('owner','admin')
        AND om.status = 'active'
    )
  );

DROP POLICY IF EXISTS "org_logos_admin_delete" ON storage.objects;
CREATE POLICY "org_logos_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id::text = (storage.foldername(name))[1]
        AND om.user_id = auth.uid()
        AND om.role IN ('owner','admin')
        AND om.status = 'active'
    )
  );
