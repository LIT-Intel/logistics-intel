-- 20260501100000_outbound_templates_personas_rls.sql
--
-- Adds RLS policies to lit_outreach_templates and lit_personas so the
-- Outbound Engine v2 composer can:
--
--   * Read "standard" templates (rows where org_id IS NULL)
--   * Read "workspace" templates owned by any org the current user is an
--     active member of
--   * Insert / update / delete templates within their own org
--   * Same pattern for lit_personas
--
-- Both tables had RLS enabled with ZERO policies before this migration,
-- which silently blocked every browser read/write — that's why the
-- TemplatesDrawer fell back to its static starter catalog every time.
--
-- Membership source: public.org_members (the canonical 7-row table; the
-- other org_* tables are unused or zero-row at time of writing). The
-- policy uses status='active' so deactivated members lose access
-- immediately without dropping the row.
--
-- Standard templates (org_id IS NULL) are intentionally read-only from
-- the browser — they can only be created or edited via the service-role
-- client (admin tooling, seed scripts). This keeps the public catalog
-- curated.

BEGIN;

-- ============================================================
-- lit_outreach_templates
-- ============================================================

DROP POLICY IF EXISTS "tpl_select_standard_or_org" ON public.lit_outreach_templates;
DROP POLICY IF EXISTS "tpl_insert_own_org"        ON public.lit_outreach_templates;
DROP POLICY IF EXISTS "tpl_update_own_org"        ON public.lit_outreach_templates;
DROP POLICY IF EXISTS "tpl_delete_own_org"        ON public.lit_outreach_templates;

CREATE POLICY "tpl_select_standard_or_org"
  ON public.lit_outreach_templates
  FOR SELECT
  TO authenticated
  USING (
    org_id IS NULL
    OR org_id IN (
      SELECT org_id
      FROM public.org_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "tpl_insert_own_org"
  ON public.lit_outreach_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT org_id
      FROM public.org_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "tpl_update_own_org"
  ON public.lit_outreach_templates
  FOR UPDATE
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT org_id
      FROM public.org_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT org_id
      FROM public.org_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "tpl_delete_own_org"
  ON public.lit_outreach_templates
  FOR DELETE
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT org_id
      FROM public.org_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

-- ============================================================
-- lit_personas (same shape: org_id-scoped, no user_id column)
-- ============================================================

DROP POLICY IF EXISTS "persona_select_standard_or_org" ON public.lit_personas;
DROP POLICY IF EXISTS "persona_insert_own_org"        ON public.lit_personas;
DROP POLICY IF EXISTS "persona_update_own_org"        ON public.lit_personas;
DROP POLICY IF EXISTS "persona_delete_own_org"        ON public.lit_personas;

CREATE POLICY "persona_select_standard_or_org"
  ON public.lit_personas
  FOR SELECT
  TO authenticated
  USING (
    org_id IS NULL
    OR org_id IN (
      SELECT org_id
      FROM public.org_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "persona_insert_own_org"
  ON public.lit_personas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT org_id
      FROM public.org_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "persona_update_own_org"
  ON public.lit_personas
  FOR UPDATE
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT org_id
      FROM public.org_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  )
  WITH CHECK (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT org_id
      FROM public.org_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

CREATE POLICY "persona_delete_own_org"
  ON public.lit_personas
  FOR DELETE
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT org_id
      FROM public.org_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

-- ============================================================
-- Read-side scoping support: the composer needs to surface the current
-- user's active org membership so the createWorkspaceTemplate helper can
-- derive org_id without a service-role round-trip. org_members is RLS-
-- enabled but has no policies — add a minimal "users can read their own
-- memberships" policy so the helper works.
-- ============================================================

DROP POLICY IF EXISTS "org_members_self_select" ON public.org_members;

CREATE POLICY "org_members_self_select"
  ON public.org_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMIT;
