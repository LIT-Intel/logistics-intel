-- Add a `source` column to affiliate_referrals so we can distinguish
-- attributions created by the ref-link flow (claim-affiliate-referral) from
-- those an admin creates manually for a subscriber who signed up without the
-- link (admin-assign-affiliate). The commission path
-- (_shared/affiliate_commission.ts) does NOT read this column, so tagging is
-- purely for provenance/audit — a manual_admin row credits the partner
-- identically to a ref_link row.
--
-- Applied to prod (jkmrfiaefxwgbvftohrb) via MCP apply_migration on 2026-08-14.
ALTER TABLE public.affiliate_referrals
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ref_link';

-- Constrain to the known set so bad values can't slip in.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_referrals_source_check'
  ) THEN
    ALTER TABLE public.affiliate_referrals
      ADD CONSTRAINT affiliate_referrals_source_check
      CHECK (source IN ('ref_link', 'manual_admin'));
  END IF;
END $$;

COMMENT ON COLUMN public.affiliate_referrals.source IS
  'Provenance of the attribution: ref_link (claim-affiliate-referral via ?ref= URL) or manual_admin (admin-assign-affiliate). Not read by the commission path.';
