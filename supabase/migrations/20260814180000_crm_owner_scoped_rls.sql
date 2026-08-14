-- CRM owner-scoped visibility (data-leak fix).
--
-- Phase-1 RLS made lit_deals/lit_tasks/lit_deal_activity readable by ALL active
-- org members. CEO wants OWNER-SCOPED visibility:
--   * Regular member  -> only their own rows.
--       deals:    owner_user_id = auth.uid() (or created_by)
--       tasks:    assignee_user_id = auth.uid() OR created_by = auth.uid()
--       activity: via parent deal ownership
--   * Org owner/admin  -> ALL rows in their org (org_members.role in owner,admin).
--   * Solo users       -> unchanged (they only ever own their own rows).
--   * platform_admins  -> unchanged (see everything).
-- lit_deal_stages stays org-wide (shared config) and is intentionally untouched.
-- Base GRANTs are unchanged (authenticated already has SELECT/INSERT/UPDATE/DELETE).

-- Helper: is the current user an owner/admin of the given org?
CREATE OR REPLACE FUNCTION public.lit_is_org_manager(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.role = ANY (ARRAY['owner','admin'])
      AND om.status = 'active'
  );
$$;

-- Helper: is the current user an active member of the given org (any role)?
CREATE OR REPLACE FUNCTION public.lit_is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
  );
$$;

GRANT EXECUTE ON FUNCTION public.lit_is_org_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lit_is_org_member(uuid) TO authenticated;

-- ============================ lit_deals ============================
DROP POLICY IF EXISTS lit_deals_select ON public.lit_deals;
CREATE POLICY lit_deals_select ON public.lit_deals
  FOR SELECT TO authenticated
  USING (
    (
      public.lit_is_org_member(org_id)
      AND (public.lit_is_org_manager(org_id) OR owner_user_id = auth.uid() OR created_by = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  );

DROP POLICY IF EXISTS lit_deals_update ON public.lit_deals;
CREATE POLICY lit_deals_update ON public.lit_deals
  FOR UPDATE TO authenticated
  USING (
    public.lit_is_org_member(org_id)
    AND (public.lit_is_org_manager(org_id) OR owner_user_id = auth.uid() OR created_by = auth.uid())
  )
  WITH CHECK (
    public.lit_is_org_member(org_id)
    AND (public.lit_is_org_manager(org_id) OR owner_user_id = auth.uid() OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS lit_deals_delete ON public.lit_deals;
CREATE POLICY lit_deals_delete ON public.lit_deals
  FOR DELETE TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR created_by = auth.uid()
    OR public.lit_is_org_manager(org_id)
  );

-- ============================ lit_tasks ============================
DROP POLICY IF EXISTS lit_tasks_select ON public.lit_tasks;
CREATE POLICY lit_tasks_select ON public.lit_tasks
  FOR SELECT TO authenticated
  USING (
    (
      public.lit_is_org_member(org_id)
      AND (public.lit_is_org_manager(org_id) OR assignee_user_id = auth.uid() OR created_by = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  );

DROP POLICY IF EXISTS lit_tasks_update ON public.lit_tasks;
CREATE POLICY lit_tasks_update ON public.lit_tasks
  FOR UPDATE TO authenticated
  USING (
    public.lit_is_org_member(org_id)
    AND (public.lit_is_org_manager(org_id) OR assignee_user_id = auth.uid() OR created_by = auth.uid())
  )
  WITH CHECK (
    public.lit_is_org_member(org_id)
    AND (public.lit_is_org_manager(org_id) OR assignee_user_id = auth.uid() OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS lit_tasks_delete ON public.lit_tasks;
CREATE POLICY lit_tasks_delete ON public.lit_tasks
  FOR DELETE TO authenticated
  USING (
    assignee_user_id = auth.uid()
    OR created_by = auth.uid()
    OR public.lit_is_org_manager(org_id)
  );

-- ======================= lit_deal_activity =======================
-- Visibility follows the parent deal: manager sees all org activity;
-- member sees activity only for deals they own/created.
DROP POLICY IF EXISTS lit_deal_activity_select ON public.lit_deal_activity;
CREATE POLICY lit_deal_activity_select ON public.lit_deal_activity
  FOR SELECT TO authenticated
  USING (
    (
      public.lit_is_org_member(org_id)
      AND (
        public.lit_is_org_manager(org_id)
        OR EXISTS (
          SELECT 1 FROM public.lit_deals d
          WHERE d.id = lit_deal_activity.deal_id
            AND (d.owner_user_id = auth.uid() OR d.created_by = auth.uid())
        )
      )
    )
    OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  );

-- lit_deal_stages: intentionally unchanged (org-wide shared pipeline config).
