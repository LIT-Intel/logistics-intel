-- BEFORE INSERT trigger auto-populates org_id from joined campaign.
BEGIN;
CREATE OR REPLACE FUNCTION public.lit_campaign_contacts_set_org_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.lit_campaigns WHERE id = NEW.campaign_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lit_campaign_contacts_org_id_trigger ON public.lit_campaign_contacts;
CREATE TRIGGER lit_campaign_contacts_org_id_trigger
  BEFORE INSERT ON public.lit_campaign_contacts
  FOR EACH ROW EXECUTE FUNCTION public.lit_campaign_contacts_set_org_id();
COMMIT;
