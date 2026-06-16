-- BEFORE INSERT trigger: auto-fills lit_activity_events.org_id from user_id's
-- primary org membership when NULL. Lets the 6 legacy activity-event writers
-- (update-company, lusha-contact-search, gemini-brief, apollo-phone-webhook,
-- apollo-contact-search, apollo-contact-enrich) continue to work post the
-- multi-tenant migration without code changes. Applied to prod 2026-06-16
-- via Supabase MCP. Mirrored for git/auto-deploy parity.

CREATE OR REPLACE FUNCTION public.lit_activity_events_fill_org_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT om.org_id INTO NEW.org_id FROM public.org_members om
     WHERE om.user_id = NEW.user_id AND om.status = 'active'
     ORDER BY om.joined_at ASC NULLS LAST LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lit_activity_events_fill_org_id_trg ON public.lit_activity_events;
CREATE TRIGGER lit_activity_events_fill_org_id_trg
  BEFORE INSERT ON public.lit_activity_events
  FOR EACH ROW EXECUTE FUNCTION public.lit_activity_events_fill_org_id();
