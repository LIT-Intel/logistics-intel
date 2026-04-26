/*
  # Affiliate Backend — Phase B (additive)

  Creates the tables, indexes, RLS policies, and updated_at triggers for
  the LIT partner program. All objects use IF NOT EXISTS / DO $$ guards
  so the migration is safe to re-run.

  Tables:
    - affiliate_tiers          program tier config (starter/launch_promo/partner)
    - affiliate_applications   submit / review queue
    - affiliate_partners       approved partner records
    - affiliate_referrals      attribution + referred-customer state
    - affiliate_commissions    commission ledger
    - affiliate_payouts        monthly payout batches

  RLS:
    Each table is RLS-enabled. Authenticated users can read their own
    rows (applications by user_id, everything else through partner.user_id).
    Authenticated users can INSERT applications for themselves only —
    everything else is service-role only.

  Reuses update_updated_at_column() from
  20260115001235_create_lit_schema_part4_triggers.sql.
*/

-- ============================================================================
-- 1. affiliate_tiers — program config (read-only for users)
-- ============================================================================

CREATE TABLE IF NOT EXISTS affiliate_tiers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text NOT NULL UNIQUE,
  name                text NOT NULL,
  commission_pct      numeric(5,2) NOT NULL,
  commission_months   integer NOT NULL,
  attribution_days    integer NOT NULL DEFAULT 90,
  min_payout_cents    integer NOT NULL DEFAULT 5000,
  description         text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE affiliate_tiers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'affiliate_tiers'
      AND policyname = 'Authenticated can view active tiers'
  ) THEN
    CREATE POLICY "Authenticated can view active tiers"
      ON affiliate_tiers FOR SELECT TO authenticated
      USING (is_active = true);
  END IF;
END $$;

INSERT INTO affiliate_tiers (code, name, commission_pct, commission_months, attribution_days, min_payout_cents, description, is_active)
VALUES
  ('starter',      'Starter',       30, 12, 90, 5000, 'Default tier for approved partners.',                  true),
  ('launch_promo', 'Launch Promo',  40, 12, 90, 5000, 'Limited 30-day activation window for early partners.', true),
  ('partner',      'Partner',       30, 12, 90, 5000, 'Custom rate for strategic partners — set manually.',   true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. affiliate_applications — submit / review queue
-- ============================================================================

CREATE TABLE IF NOT EXISTS affiliate_applications (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                      text NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','approved','rejected','withdrawn')),
  full_name                   text,
  company_or_brand            text,
  website_or_linkedin         text,
  country                     text,
  audience_description        text,
  audience_size               text,
  primary_channels            text,
  expected_referral_volume    text,
  accepted_partner_terms      boolean NOT NULL DEFAULT false,
  accepted_stripe_ack         boolean NOT NULL DEFAULT false,
  payload                     jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at                timestamptz NOT NULL DEFAULT now(),
  reviewed_at                 timestamptz,
  reviewed_by                 uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer                    text,
  rejection_reason            text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- One active (pending or approved) application per user. Withdrawn /
-- rejected rows can coexist so users can reapply.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_affiliate_applications_user_active
  ON affiliate_applications (user_id)
  WHERE status IN ('pending','approved');

CREATE INDEX IF NOT EXISTS idx_affiliate_applications_user_status
  ON affiliate_applications (user_id, status);

CREATE INDEX IF NOT EXISTS idx_affiliate_applications_status_submitted
  ON affiliate_applications (status, submitted_at DESC);

ALTER TABLE affiliate_applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'affiliate_applications'
      AND policyname = 'Users can view their own applications'
  ) THEN
    CREATE POLICY "Users can view their own applications"
      ON affiliate_applications FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'affiliate_applications'
      AND policyname = 'Users can submit their own applications'
  ) THEN
    CREATE POLICY "Users can submit their own applications"
      ON affiliate_applications FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Self-update only allowed while still pending and only by the owner.
  -- Status transitions are reserved for service-role (review function).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'affiliate_applications'
      AND policyname = 'Users can edit own pending applications'
  ) THEN
    CREATE POLICY "Users can edit own pending applications"
      ON affiliate_applications FOR UPDATE TO authenticated
      USING (auth.uid() = user_id AND status = 'pending')
      WITH CHECK (auth.uid() = user_id AND status = 'pending');
  END IF;
END $$;

-- ============================================================================
-- 3. affiliate_partners — approved partner records
-- ============================================================================

CREATE TABLE IF NOT EXISTS affiliate_partners (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id              uuid REFERENCES affiliate_applications(id) ON DELETE SET NULL,
  ref_code                    text NOT NULL UNIQUE,
  tier                        text NOT NULL DEFAULT 'starter',
  status                      text NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','suspended','terminated')),
  commission_pct              numeric(5,2) NOT NULL DEFAULT 30,
  commission_months           integer NOT NULL DEFAULT 12,
  attribution_days            integer NOT NULL DEFAULT 90,
  min_payout_cents            integer NOT NULL DEFAULT 5000,
  payout_currency             text NOT NULL DEFAULT 'usd',
  stripe_account_id           text,
  stripe_status               text NOT NULL DEFAULT 'not_connected',
  stripe_charges_enabled      boolean NOT NULL DEFAULT false,
  stripe_payouts_enabled      boolean NOT NULL DEFAULT false,
  stripe_details_submitted    boolean NOT NULL DEFAULT false,
  account_manager_email       text DEFAULT 'partnerships@logisticintel.com',
  joined_at                   timestamptz NOT NULL DEFAULT now(),
  suspended_at                timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_partners_user
  ON affiliate_partners (user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_partners_ref_code
  ON affiliate_partners (ref_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_partners_status
  ON affiliate_partners (status);

ALTER TABLE affiliate_partners ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'affiliate_partners'
      AND policyname = 'Users can view their own partner record'
  ) THEN
    CREATE POLICY "Users can view their own partner record"
      ON affiliate_partners FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
  -- All writes are service-role only (review/onboard/status edge functions).
END $$;

-- ============================================================================
-- 4. affiliate_referrals — attribution + referred-customer state
-- ============================================================================

CREATE TABLE IF NOT EXISTS affiliate_referrals (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id                  uuid NOT NULL REFERENCES affiliate_partners(id) ON DELETE CASCADE,
  ref_code                    text NOT NULL,
  referred_user_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_org_id             uuid,
  referred_email              text,
  referred_company            text,
  plan_code                   text,
  subscription_status         text,
  mrr_cents                   integer NOT NULL DEFAULT 0,
  first_seen_at               timestamptz NOT NULL DEFAULT now(),
  signed_up_at                timestamptz,
  became_paid_at              timestamptz,
  churned_at                  timestamptz,
  attribution_expires_at      timestamptz,
  metadata                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_partner
  ON affiliate_referrals (partner_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_ref_code
  ON affiliate_referrals (ref_code);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_status
  ON affiliate_referrals (partner_id, subscription_status);

ALTER TABLE affiliate_referrals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'affiliate_referrals'
      AND policyname = 'Partners can view their own referrals'
  ) THEN
    CREATE POLICY "Partners can view their own referrals"
      ON affiliate_referrals FOR SELECT TO authenticated
      USING (
        partner_id IN (
          SELECT id FROM affiliate_partners WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 5. affiliate_commissions — commission ledger
-- ============================================================================

CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          uuid NOT NULL REFERENCES affiliate_partners(id) ON DELETE CASCADE,
  referral_id         uuid REFERENCES affiliate_referrals(id) ON DELETE SET NULL,
  invoice_id          text,
  stripe_customer_id  text,
  subscription_id     text,
  amount_cents        integer NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'usd',
  commission_pct      numeric(5,2) NOT NULL,
  commission_months   integer NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','earned','paid','voided','flagged')),
  earned_at           timestamptz,
  clears_at           timestamptz,
  paid_at             timestamptz,
  voided_at           timestamptz,
  notes               text,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_partner_status
  ON affiliate_commissions (partner_id, status);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_clears_at
  ON affiliate_commissions (clears_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_invoice
  ON affiliate_commissions (invoice_id);

ALTER TABLE affiliate_commissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'affiliate_commissions'
      AND policyname = 'Partners can view their own commissions'
  ) THEN
    CREATE POLICY "Partners can view their own commissions"
      ON affiliate_commissions FOR SELECT TO authenticated
      USING (
        partner_id IN (
          SELECT id FROM affiliate_partners WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 6. affiliate_payouts — monthly payout batches
-- ============================================================================

CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          uuid NOT NULL REFERENCES affiliate_partners(id) ON DELETE CASCADE,
  period_start        date NOT NULL,
  period_end          date NOT NULL,
  amount_cents        integer NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'usd',
  commissions_count   integer NOT NULL DEFAULT 0,
  stripe_transfer_id  text,
  stripe_payout_id    text,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','paid','failed','cancelled')),
  paid_on             timestamptz,
  failure_reason      text,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_partner_status
  ON affiliate_payouts (partner_id, status);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_period
  ON affiliate_payouts (partner_id, period_start DESC);

ALTER TABLE affiliate_payouts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'affiliate_payouts'
      AND policyname = 'Partners can view their own payouts'
  ) THEN
    CREATE POLICY "Partners can view their own payouts"
      ON affiliate_payouts FOR SELECT TO authenticated
      USING (
        partner_id IN (
          SELECT id FROM affiliate_partners WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 7. updated_at triggers (reuse update_updated_at_column from part4_triggers)
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'affiliate_tiers',
    'affiliate_applications',
    'affiliate_partners',
    'affiliate_referrals',
    'affiliate_commissions',
    'affiliate_payouts'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = format('update_%s_updated_at', t)
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER update_%I_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
        t, t
      );
    END IF;
  END LOOP;
END $$;
