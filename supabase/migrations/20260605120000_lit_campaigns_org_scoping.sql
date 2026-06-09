-- 20260605120000_lit_campaigns_org_scoping.sql
-- Phase 1: Add org_id column + backfill from owner's primary org.

BEGIN;

ALTER TABLE public.lit_campaigns
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

UPDATE public.lit_campaigns lc
   SET org_id = (
     SELECT om.org_id
       FROM public.org_members om
      WHERE om.user_id = lc.user_id
        AND om.status = 'active'
      ORDER BY (om.role = 'owner') DESC, om.joined_at ASC
      LIMIT 1
   )
 WHERE org_id IS NULL;

COMMIT;
