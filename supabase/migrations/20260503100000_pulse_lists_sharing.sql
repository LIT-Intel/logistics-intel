-- Pulse Lists v2 — org-scoped sharing.
--
-- Layered on top of the v1 pulse_lists table created in
-- 20260502120000_pulse_saved_lists.sql. Adds an opt-in sharing
-- model so a list owner can publish a list to their org members
-- (read-only by default; only the owner can mutate). Existing
-- single-user behavior is preserved — is_shared defaults to false
-- and the RLS policies still allow the owner everything they had.
--
-- Additive only. No changes to lit_companies, lit_saved_companies,
-- or any freight-ingestion table. Reads from the existing
-- org_members table to gate org-scoped SELECTs.

-- ─────────────────────── Schema additions ───────────────────────

ALTER TABLE public.pulse_lists
  ADD COLUMN IF NOT EXISTS org_id      uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_shared   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_at   timestamptz;

CREATE INDEX IF NOT EXISTS idx_pulse_lists_org_shared
  ON public.pulse_lists (org_id, is_shared)
  WHERE is_shared = true;

-- ─────────────────────── RLS replacement ───────────────────────

-- Drop the v1 owner-only policy so we can install the wider read
-- policy + the still-strict write policies. Both replacements key
-- off auth.uid() so service-role calls (e.g. future cron) still
-- bypass via the postgres role.

DROP POLICY IF EXISTS pulse_lists_owner_all          ON public.pulse_lists;
DROP POLICY IF EXISTS pulse_list_companies_owner_all ON public.pulse_list_companies;

-- ── pulse_lists ──

-- Read: owner OR an org member of a shared list
CREATE POLICY pulse_lists_select
  ON public.pulse_lists
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      is_shared = true
      AND org_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.org_members om
         WHERE om.org_id = pulse_lists.org_id
           AND om.user_id = auth.uid()
      )
    )
  );

-- Write (insert / update / delete): owner only. Sharing toggles via
-- UPDATE on the owner's own row.
CREATE POLICY pulse_lists_insert
  ON public.pulse_lists
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY pulse_lists_update
  ON public.pulse_lists
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY pulse_lists_delete
  ON public.pulse_lists
  FOR DELETE
  USING (auth.uid() = user_id);

-- ── pulse_list_companies ──

-- Read: parent list owner OR org member of a shared parent list
CREATE POLICY pulse_list_companies_select
  ON public.pulse_list_companies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pulse_lists pl
       WHERE pl.id = pulse_list_companies.list_id
         AND (
           pl.user_id = auth.uid()
           OR (
             pl.is_shared = true
             AND pl.org_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM public.org_members om
                WHERE om.org_id = pl.org_id
                  AND om.user_id = auth.uid()
             )
           )
         )
    )
  );

-- Write: parent list owner only. Org members can READ a shared list
-- but cannot mutate its membership — keeps "shared = read-only by
-- default" predictable for v2. Future v3 can add a per-list
-- collaborator role.
CREATE POLICY pulse_list_companies_write
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

-- Grants reaffirmed (no-op if already granted).
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pulse_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.pulse_list_companies TO authenticated;
