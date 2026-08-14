-- CRM — capture SERVICE TYPE + LANE (origin → destination) on deals.
--
-- CEO ask (2026-08-14): opportunities must be segmented and reportable by
-- service type and by lane, so the pipeline can be sliced Ocean vs Air vs
-- Truck etc. and origin→destination is trackable per deal.
--
-- Adds three nullable text columns to lit_deals:
--   service_type  — one of the profile's mode set (ocean|air|truck|rail|
--                   drayage|broker|domestic|intermodal|other). CHECK-guarded
--                   but nullable so existing rows and "unspecified" deals are
--                   valid. Lowercase canonical values (mirrors ServiceMode).
--   origin        — free-text lane origin ("From").
--   destination   — free-text lane destination ("To").
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. RLS + grants on lit_deals are left
-- UNTOUCHED — deals are already owner/org-scoped by migration
-- 20260814120000 (+ owner-scoped RLS 20260814180000); adding columns does not
-- change row visibility, so no policy edits are needed.
--
-- Applied to prod jkmrfiaefxwgbvftohrb via Supabase MCP; mirrored here so the
-- auto-deploy `supabase db push` treats it as idempotent.

BEGIN;

ALTER TABLE public.lit_deals ADD COLUMN IF NOT EXISTS service_type text;
ALTER TABLE public.lit_deals ADD COLUMN IF NOT EXISTS origin       text;
ALTER TABLE public.lit_deals ADD COLUMN IF NOT EXISTS destination  text;

-- Constrain service_type to the profile's mode set (nullable = unspecified).
-- Guarded so re-running the migration doesn't error on an existing constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lit_deals_service_type_check'
      AND conrelid = 'public.lit_deals'::regclass
  ) THEN
    ALTER TABLE public.lit_deals
      ADD CONSTRAINT lit_deals_service_type_check
      CHECK (service_type IS NULL OR service_type IN (
        'ocean','air','truck','rail','drayage','broker','domestic','intermodal','other'
      ));
  END IF;
END$$;

-- Index for the "pipeline by service type" report breakdown (org-scoped slice).
CREATE INDEX IF NOT EXISTS lit_deals_org_service_type_idx
  ON public.lit_deals(org_id, service_type);

COMMIT;
