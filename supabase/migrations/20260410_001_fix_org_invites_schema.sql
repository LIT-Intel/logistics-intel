-- Migration: align org_invites schema with live DB and edge function expectations
-- Adds: token, invited_by_user_id, email_sent_at columns if not present

ALTER TABLE org_invites
  ADD COLUMN IF NOT EXISTS token uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE org_invites
  ADD COLUMN IF NOT EXISTS invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE org_invites
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

-- Ensure token is unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invites_token ON org_invites(token);

-- Back-fill invited_by_user_id from the legacy invited_by column (if it stores a uuid)
UPDATE org_invites
SET invited_by_user_id = invited_by::uuid
WHERE invited_by_user_id IS NULL
  AND invited_by IS NOT NULL
  AND invited_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- RLS: authenticated user can read their own pending invite by email
CREATE POLICY IF NOT EXISTS "Users can read their own invite"
  ON org_invites
  FOR SELECT
  TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
