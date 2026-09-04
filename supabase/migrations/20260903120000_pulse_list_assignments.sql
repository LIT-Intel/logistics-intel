-- Pulse Lists v3 — per-member assignment.
--
-- Builds on v2 org-sharing (20260503100000). Adds an explicit "assign this
-- saved list to specific teammates" model so a sales director can hand a
-- prospect list to individual reps — the rep sees it in their Library on next
-- login, without the whole org seeing it (which is what is_shared does).
--
-- Additive only. Read-only for the assignee (same rule as org-share); only the
-- list OWNER can assign/unassign. RLS is written with SECURITY DEFINER helper
-- functions for the cross-table existence checks so pulse_lists ↔
-- pulse_list_assignments policies can reference each other WITHOUT triggering
-- infinite RLS recursion.

-- ─────────────────────── Table ───────────────────────

CREATE TABLE IF NOT EXISTS public.pulse_list_assignments (
  list_id          uuid NOT NULL REFERENCES public.pulse_lists(id) ON DELETE CASCADE,
  assignee_user_id uuid NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  assigned_by      uuid REFERENCES auth.users(id)                  ON DELETE SET NULL,
  assigned_at      timestamptz NOT NULL DEFAULT now(),
  note             text,
  PRIMARY KEY (list_id, assignee_user_id)
);

CREATE INDEX IF NOT EXISTS idx_pla_assignee ON public.pulse_list_assignments (assignee_user_id);
CREATE INDEX IF NOT EXISTS idx_pla_list     ON public.pulse_list_assignments (list_id);

ALTER TABLE public.pulse_list_assignments ENABLE ROW LEVEL SECURITY;

-- ─────────────────────── Recursion-safe helpers ───────────────────────
-- SECURITY DEFINER → the body runs as the function owner and bypasses RLS on
-- the referenced tables, so using these inside a policy never re-enters the
-- caller table's policy (no cycle). STABLE + explicit search_path for safety.

CREATE OR REPLACE FUNCTION public.pulse_list_is_owner(p_list uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.pulse_lists pl WHERE pl.id = p_list AND pl.user_id = p_uid);
$$;

CREATE OR REPLACE FUNCTION public.pulse_list_assigned_to(p_list uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pulse_list_assignments a
     WHERE a.list_id = p_list AND a.assignee_user_id = p_uid
  );
$$;

REVOKE ALL ON FUNCTION public.pulse_list_is_owner(uuid, uuid)   FROM public;
REVOKE ALL ON FUNCTION public.pulse_list_assigned_to(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pulse_list_is_owner(uuid, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.pulse_list_assigned_to(uuid, uuid) TO authenticated;

-- ─────────────────────── Assignment RLS ───────────────────────

-- Read: the assignee, or the list owner.
CREATE POLICY pla_select ON public.pulse_list_assignments
  FOR SELECT USING (
    assignee_user_id = auth.uid()
    OR public.pulse_list_is_owner(list_id, auth.uid())
  );

-- Assign: only the list owner; assigned_by must be the caller (audit).
CREATE POLICY pla_insert ON public.pulse_list_assignments
  FOR INSERT WITH CHECK (
    public.pulse_list_is_owner(list_id, auth.uid())
    AND assigned_by = auth.uid()
  );

-- Unassign: the list owner, or an assignee removing themselves.
CREATE POLICY pla_delete ON public.pulse_list_assignments
  FOR DELETE USING (
    assignee_user_id = auth.uid()
    OR public.pulse_list_is_owner(list_id, auth.uid())
  );

GRANT SELECT, INSERT, DELETE ON public.pulse_list_assignments TO authenticated;

-- ─────────────────────── Extend parent-table reads for assignees ───────────────────────

-- pulse_lists: owner OR org-shared member OR direct assignee.
DROP POLICY IF EXISTS pulse_lists_select ON public.pulse_lists;
CREATE POLICY pulse_lists_select ON public.pulse_lists
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      is_shared = true
      AND org_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.org_members om
         WHERE om.org_id = pulse_lists.org_id AND om.user_id = auth.uid()
      )
    )
    OR public.pulse_list_assigned_to(id, auth.uid())
  );

-- pulse_list_companies: readable when the parent list is readable (owner /
-- org-shared / assignee). Uses the definer helper for the assignee branch.
DROP POLICY IF EXISTS pulse_list_companies_select ON public.pulse_list_companies;
CREATE POLICY pulse_list_companies_select ON public.pulse_list_companies
  FOR SELECT USING (
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
                WHERE om.org_id = pl.org_id AND om.user_id = auth.uid()
             )
           )
         )
    )
    OR public.pulse_list_assigned_to(pulse_list_companies.list_id, auth.uid())
  );
