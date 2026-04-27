-- Phase B.7 — lit_contacts write RLS
--
-- The base lit_contacts schema (supabase/migrations/20260115001208_create_lit_schema_part2.sql:66-97)
-- only granted SELECT to authenticated users. Without an INSERT/UPDATE/DELETE
-- policy, every "Save Contact" insert returned 42501 RLS denial.
--
-- This migration grants authenticated users write access ONLY for contacts
-- whose company_id is in their own lit_saved_companies row.
--
-- Live lit_saved_companies schema (same part2 migration, lines 11-32):
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id uuid NOT NULL,                                        <-- ownership
--   company_id uuid NOT NULL REFERENCES lit_companies(id) ON DELETE CASCADE,
--   ...
--   UNIQUE (user_id, company_id)
--
-- The ownership column is `user_id` (uuid). RLS predicates compare it with
-- auth.uid() so a user can only insert/update/delete contacts for companies
-- they have personally saved.

-- Idempotent: drop policies with these names if a previous run created them.
DROP POLICY IF EXISTS "lit_contacts: authenticated insert for own saved companies" ON lit_contacts;
DROP POLICY IF EXISTS "lit_contacts: authenticated update for own saved companies" ON lit_contacts;
DROP POLICY IF EXISTS "lit_contacts: authenticated delete for own saved companies" ON lit_contacts;

CREATE POLICY "lit_contacts: authenticated insert for own saved companies"
  ON lit_contacts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM lit_saved_companies sc
      WHERE sc.company_id = lit_contacts.company_id
        AND sc.user_id = auth.uid()
    )
  );

CREATE POLICY "lit_contacts: authenticated update for own saved companies"
  ON lit_contacts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM lit_saved_companies sc
      WHERE sc.company_id = lit_contacts.company_id
        AND sc.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM lit_saved_companies sc
      WHERE sc.company_id = lit_contacts.company_id
        AND sc.user_id = auth.uid()
    )
  );

CREATE POLICY "lit_contacts: authenticated delete for own saved companies"
  ON lit_contacts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM lit_saved_companies sc
      WHERE sc.company_id = lit_contacts.company_id
        AND sc.user_id = auth.uid()
    )
  );