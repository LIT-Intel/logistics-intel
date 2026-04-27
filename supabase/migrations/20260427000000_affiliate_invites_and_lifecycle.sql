/*
  # Affiliate Invites + Partner Lifecycle (additive)

  Adds the affiliate_invites table and widens affiliate_partners with
  lifecycle columns so admins can:
    - invite new affiliates by email (no prior account required)
    - deactivate / reactivate partners
    - soft-delete partners (preserves financial history)
    - track referral link state separately from partner status

  All changes are additive and idempotent. No data loss; existing active
  partners get referral_link_status backfilled to 'active' so their
  referral links keep working.
*/

-- ============================================================================
-- 1. affiliate_invites — pre-account invitations sent by admins
-- ============================================================================

CREATE TABLE IF NOT EXISTS affiliate_invites (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 text NOT NULL,
  name                  text,
  company               text,
  note                  text,
  tier_code             text REFERENCES affiliate_tiers(code) ON DELETE SET NULL,
  token                 text NOT NULL UNIQUE,
  expires_at            timestamptz NOT NULL,
  invited_by_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by_email      text,
  claimed_at            timestamptz,
  claimed_by_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  partner_id            uuid REFERENCES affiliate_partners(id) ON DELETE SET NULL,
  revoked_at            timestamptz,
  last_sent_at          timestamptz NOT NULL DEFAULT now(),
  send_count            integer NOT NULL DEFAULT 1,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_invites_email ON affiliate_invites (lower(email));
CREATE INDEX IF NOT EXISTS idx_affiliate_invites_token ON affiliate_invites (token);
CREATE INDEX IF NOT EXISTS idx_affiliate_invites_open
  ON affiliate_invites (created_at DESC)
  WHERE claimed_at IS NULL AND revoked_at IS NULL;

ALTER TABLE affiliate_invites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Authenticated users can read invites tied to their own claim, so the
  -- /app/affiliate/invite page can show "already claimed by you" state.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'affiliate_invites'
      AND policyname = 'Users can view invites they claimed'
  ) THEN
    CREATE POLICY "Users can view invites they claimed"
      ON affiliate_invites FOR SELECT TO authenticated
      USING (claimed_by_user_id = auth.uid());
  END IF;
  -- All other reads / all writes go through service-role edge functions.
END $$;

-- ============================================================================
-- 2. affiliate_partners — lifecycle widening
-- ============================================================================

-- 2a. Drop the column-level UNIQUE so soft-deleted rows can coexist with
--     a re-invited active row for the same user.
ALTER TABLE affiliate_partners
  DROP CONSTRAINT IF EXISTS affiliate_partners_user_id_key;

-- 2b. Lifecycle audit columns.
ALTER TABLE affiliate_partners
  ADD COLUMN IF NOT EXISTS deactivated_at         timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at             timestamptz,
  ADD COLUMN IF NOT EXISTS referral_link_status   text NOT NULL DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS invite_id              uuid REFERENCES affiliate_invites(id) ON DELETE SET NULL;

-- 2c. Widen the status CHECK to include invited + deactivated.
--     'deleted' is NOT a status — soft delete uses deleted_at IS NOT NULL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'affiliate_partners_status_check'
      AND conrelid = 'public.affiliate_partners'::regclass
  ) THEN
    ALTER TABLE affiliate_partners DROP CONSTRAINT affiliate_partners_status_check;
  END IF;
END $$;

ALTER TABLE affiliate_partners
  ADD CONSTRAINT affiliate_partners_status_check
  CHECK (status IN ('invited', 'active', 'deactivated', 'suspended', 'terminated'));

-- 2d. Constrain referral_link_status values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'affiliate_partners_referral_link_status_check'
      AND conrelid = 'public.affiliate_partners'::regclass
  ) THEN
    ALTER TABLE affiliate_partners
      ADD CONSTRAINT affiliate_partners_referral_link_status_check
      CHECK (referral_link_status IN ('inactive', 'active', 'paused', 'deleted'));
  END IF;
END $$;

-- 2e. Replace the old user_id uniqueness with a partial unique that
--     allows soft-deleted rows alongside a fresh active partner.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_affiliate_partners_user_active
  ON affiliate_partners (user_id)
  WHERE deleted_at IS NULL;

-- 2f. Backfill: any partner currently 'active' should keep their
--     referral link working. Without this, the new
--     referral_link_status='inactive' default would silently break
--     existing partners' /?ref=... URLs.
UPDATE affiliate_partners
   SET referral_link_status = 'active'
 WHERE status = 'active'
   AND deleted_at IS NULL
   AND referral_link_status = 'inactive';

-- ============================================================================
-- 3. updated_at trigger for affiliate_invites (reuse helper)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_affiliate_invites_updated_at'
  ) THEN
    CREATE TRIGGER update_affiliate_invites_updated_at
      BEFORE UPDATE ON affiliate_invites
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
