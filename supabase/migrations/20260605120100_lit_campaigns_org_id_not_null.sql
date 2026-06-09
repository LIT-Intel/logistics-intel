-- 20260605120100_lit_campaigns_org_id_not_null.sql
-- Phase 2: Lock org_id NOT NULL + add covering index.

BEGIN;

ALTER TABLE public.lit_campaigns
  ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS lit_campaigns_org_id_idx
  ON public.lit_campaigns(org_id);

COMMIT;
