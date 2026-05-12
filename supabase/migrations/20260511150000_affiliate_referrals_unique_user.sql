-- Idempotency at the DB layer for affiliate attributions: one user can
-- only be attributed to one partner. The claim-affiliate-referral edge
-- function checks first, but a race could create dupes — this partial
-- unique index forces the second INSERT to fail with 23505 which the
-- edge fn maps to status=duplicate.
--
-- Plus two perf indexes for the admin "show me partner X's referrals"
-- lookups and for commission jobs that filter on the attribution window.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_affiliate_referrals_user
  ON public.affiliate_referrals (referred_user_id)
  WHERE referred_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_partner_signed
  ON public.affiliate_referrals (partner_id, signed_up_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_attribution_expires
  ON public.affiliate_referrals (attribution_expires_at)
  WHERE attribution_expires_at IS NOT NULL;
