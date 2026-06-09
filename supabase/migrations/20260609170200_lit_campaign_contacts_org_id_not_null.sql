-- Lock the invariant: lit_campaign_contacts.org_id NOT NULL.
BEGIN;
ALTER TABLE public.lit_campaign_contacts ALTER COLUMN org_id SET NOT NULL;
COMMIT;
