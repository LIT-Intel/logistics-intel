-- Phase 5 P1F — verification columns + tighten lit_contacts SELECT to user-scoped
--
-- Before this migration, lit_contacts had a single permissive SELECT policy
-- with predicate `true` for any authenticated user, leaking contacts across
-- orgs. Phase 0.5 audit confirmed.
--
-- This migration:
--   (1) Adds verification columns the enrich-contacts persistence patch (P1E)
--       writes from Lusha emailStatus.
--   (2) Drops the wide-open SELECT policy and replaces it with a user-scoped
--       policy that mirrors the existing INSERT/UPDATE/DELETE semantics
--       (lit_saved_companies join via auth.uid()).
--
-- 1. Verification columns
ALTER TABLE lit_contacts
  ADD COLUMN IF NOT EXISTS verified_by_provider boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verification_status text DEFAULT null;

-- 2. Tighten SELECT
DROP POLICY IF EXISTS "Contacts are viewable by authenticated users" ON lit_contacts;
DROP POLICY IF EXISTS "lit_contacts_select_via_saved" ON lit_contacts;
DROP POLICY IF EXISTS "lit_contacts_insert_via_saved" ON lit_contacts;
DROP POLICY IF EXISTS "lit_contacts_update_via_saved" ON lit_contacts;

CREATE POLICY "lit_contacts_select_via_saved" ON lit_contacts
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT sc.company_id
      FROM lit_saved_companies sc
      WHERE sc.user_id = auth.uid()
    )
  );

CREATE POLICY "lit_contacts_insert_via_saved" ON lit_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT sc.company_id
      FROM lit_saved_companies sc
      WHERE sc.user_id = auth.uid()
    )
  );

CREATE POLICY "lit_contacts_update_via_saved" ON lit_contacts
  FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT sc.company_id
      FROM lit_saved_companies sc
      WHERE sc.user_id = auth.uid()
    )
  );

-- Service role used by enrich-contacts edge function bypasses RLS automatically.
-- User-scoped (not org-scoped) because lit_saved_companies has no org_id today;
-- a follow-up migration should add org_id and widen visibility to all teammates.