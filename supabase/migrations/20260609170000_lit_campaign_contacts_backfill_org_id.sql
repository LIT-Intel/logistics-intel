-- Backfill lit_campaign_contacts.org_id from joined campaign.
BEGIN;
UPDATE public.lit_campaign_contacts cc
   SET org_id = c.org_id
  FROM public.lit_campaigns c
 WHERE c.id = cc.campaign_id AND cc.org_id IS NULL AND c.org_id IS NOT NULL;
COMMIT;
