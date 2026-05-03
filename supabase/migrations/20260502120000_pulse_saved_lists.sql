-- Pulse Saved Lists — named, user-private discovery lists.
--
-- This migration is ADDITIVE ONLY. It does not modify lit_companies,
-- lit_saved_companies, or any freight-ingestion table. The Pulse UI
-- continues to use lit_saved_companies (filtered on source='pulse')
-- for the unscoped library, and now layers named lists on top so a
-- saved company can belong to one or more user-curated lists.
--
-- pulse_lists.id is the primary key consumed by the frontend; the
-- many-to-many membership lives in pulse_list_companies referencing
-- lit_companies.id directly. ON DELETE CASCADE means if a freight
-- company row is purged we automatically clean up the orphan
-- membership — no write-side coupling, just integrity cleanup.

-- ─────────────────────────── pulse_lists ───────────────────────────

CREATE TABLE IF NOT EXISTS public.pulse_lists (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  -- The original natural-language prompt that built the list. Stored
  -- so the user can re-run / refine later.
  query_text   text,
  -- Structured filters used to build the list (industry, country,
  -- employee_band, etc). Optional — only present if the Coach query
  -- builder produced them.
  filter_recipe jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pulse_lists_user_updated
  ON public.pulse_lists (user_id, updated_at DESC);

-- ──────────────────────── pulse_list_companies ────────────────────────

CREATE TABLE IF NOT EXISTS public.pulse_list_companies (
  list_id    uuid NOT NULL REFERENCES public.pulse_lists(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.lit_companies(id) ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  added_by   uuid REFERENCES auth.users(id),
  -- Optional per-row note the user can attach to a list membership
  -- (e.g. "decision maker confirmed", "hold for Q3").
  note       text,
  PRIMARY KEY (list_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_pulse_list_companies_list
  ON public.pulse_list_companies (list_id, added_at DESC);
CREATE INDEX IF NOT EXISTS idx_pulse_list_companies_company
  ON public.pulse_list_companies (company_id);

-- ─────────────────────────── updated_at trigger ───────────────────────

CREATE OR REPLACE FUNCTION public.touch_pulse_list_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pulse_lists_updated_at ON public.pulse_lists;
CREATE TRIGGER trg_pulse_lists_updated_at
BEFORE UPDATE ON public.pulse_lists
FOR EACH ROW EXECUTE FUNCTION public.touch_pulse_list_updated_at();

-- When a membership is added/removed, bounce the parent list's
-- updated_at so the library sort surface them.
CREATE OR REPLACE FUNCTION public.touch_pulse_list_on_membership()
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

DROP TRIGGER IF EXISTS trg_pulse_list_companies_touch_parent
  ON public.pulse_list_companies;
CREATE TRIGGER trg_pulse_list_companies_touch_parent
AFTER INSERT OR DELETE ON public.pulse_list_companies
FOR EACH ROW EXECUTE FUNCTION public.touch_pulse_list_on_membership();

-- ─────────────────────────────── RLS ───────────────────────────────

ALTER TABLE public.pulse_lists           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pulse_list_companies  ENABLE ROW LEVEL SECURITY;

-- pulse_lists: a user can do anything with their own lists.
DROP POLICY IF EXISTS pulse_lists_owner_all ON public.pulse_lists;
CREATE POLICY pulse_lists_owner_all
  ON public.pulse_lists
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- pulse_list_companies: a row is visible / writable only when the
-- caller owns the parent list. Joining on the policy keeps this
-- enforced even for INSERTs that arrive without going through a
-- view.
DROP POLICY IF EXISTS pulse_list_companies_owner_all ON public.pulse_list_companies;
CREATE POLICY pulse_list_companies_owner_all
  ON public.pulse_list_companies
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.pulse_lists pl
       WHERE pl.id = pulse_list_companies.list_id
         AND pl.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pulse_lists pl
       WHERE pl.id = pulse_list_companies.list_id
         AND pl.user_id = auth.uid()
    )
  );

-- Grants for the API roles.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pulse_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pulse_list_companies TO authenticated;
