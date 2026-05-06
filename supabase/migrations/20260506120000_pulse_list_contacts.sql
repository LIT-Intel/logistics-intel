-- Universal Lists, Step 1 — promote pulse_lists to a top-level concept
-- by adding contact-level membership alongside the existing
-- company-level membership.
--
-- Today pulse_list_companies binds a list to lit_companies. Audience
-- resolution at campaign send time will UNION (a) every enriched
-- contact whose company is in pulse_list_companies with (b) every
-- explicit contact added directly via pulse_list_contacts. That gives
-- two flows:
--   1) "I want every enriched contact on these companies" — add
--      companies, leave contacts empty.
--   2) "I want this specific person" — add the contact (also adds
--      the company so the list page still shows the company card).
--
-- This migration is ADDITIVE ONLY. No schema changes to lit_contacts,
-- pulse_lists, or pulse_list_companies.

CREATE TABLE IF NOT EXISTS public.pulse_list_contacts (
  list_id    uuid NOT NULL REFERENCES public.pulse_lists(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.lit_contacts(id) ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  added_by   uuid REFERENCES auth.users(id),
  note       text,
  PRIMARY KEY (list_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_pulse_list_contacts_list
  ON public.pulse_list_contacts (list_id, added_at DESC);
CREATE INDEX IF NOT EXISTS idx_pulse_list_contacts_contact
  ON public.pulse_list_contacts (contact_id);

-- Bounce parent list updated_at so library sort surfaces lists with
-- recent contact additions (mirrors the company-membership trigger).
CREATE OR REPLACE FUNCTION public.touch_pulse_list_on_contact_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.pulse_lists
     SET updated_at = now()
   WHERE id = COALESCE(NEW.list_id, OLD.list_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_pulse_list_contacts_touch_parent
  ON public.pulse_list_contacts;
CREATE TRIGGER trg_pulse_list_contacts_touch_parent
AFTER INSERT OR DELETE ON public.pulse_list_contacts
FOR EACH ROW EXECUTE FUNCTION public.touch_pulse_list_on_contact_membership();

ALTER TABLE public.pulse_list_contacts ENABLE ROW LEVEL SECURITY;

-- Same pattern as pulse_list_companies: caller must own the parent
-- list. Service role bypasses RLS so server-side audience resolution
-- still works for any user.
DROP POLICY IF EXISTS pulse_list_contacts_owner_all ON public.pulse_list_contacts;
CREATE POLICY pulse_list_contacts_owner_all
  ON public.pulse_list_contacts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.pulse_lists pl
       WHERE pl.id = pulse_list_contacts.list_id
         AND pl.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pulse_lists pl
       WHERE pl.id = pulse_list_contacts.list_id
         AND pl.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pulse_list_contacts TO authenticated;
