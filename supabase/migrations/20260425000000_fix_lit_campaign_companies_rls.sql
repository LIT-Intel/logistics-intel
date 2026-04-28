/*
  # Fix lit_campaign_companies RLS — add missing UPDATE policy

  The original schema migration (20260115001224_create_lit_schema_part3.sql)
  created lit_campaign_companies with SELECT / INSERT / DELETE policies
  but no UPDATE policy.

  PostgREST translates Supabase upsert() with `onConflict` into
  `INSERT ... ON CONFLICT (cols) DO UPDATE SET ...`. PostgreSQL evaluates
  the UPDATE policy on the conflict branch — and even on first-time
  inserts the planner can require the UPDATE policy to exist when the
  conflict-target index is involved. With no UPDATE policy registered,
  the upsert fails with 42501 / "new row violates row-level security
  policy for table" the moment the user clicks Add to Campaign.

  This migration adds the missing UPDATE policy with the same
  parent-campaign ownership check used by SELECT / INSERT / DELETE:
  the row's `campaign_id` must point to a `lit_campaigns` row owned
  by the calling auth.uid().

  Additive only:
    - No existing policy modified, dropped, or weakened.
    - No table altered.
    - No data touched.
    - Safe to re-run (DO block + IF NOT EXISTS guard).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lit_campaign_companies'
      AND policyname = 'Users can update their campaign companies'
  ) THEN
    CREATE POLICY "Users can update their campaign companies"
      ON lit_campaign_companies FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM lit_campaigns
          WHERE lit_campaigns.id = campaign_id
            AND lit_campaigns.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM lit_campaigns
          WHERE lit_campaigns.id = campaign_id
            AND lit_campaigns.user_id = auth.uid()
        )
      );
  END IF;
END $$;
