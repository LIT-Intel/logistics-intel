/*
  # Repoint user_preferences.user_id FK at auth.users

  ## Problem
  `user_preferences.user_id` was created in the very first core-tables
  migration (20260114021023_001_create_core_tables.sql) with:

      user_id uuid UNIQUE REFERENCES users(id) ON DELETE CASCADE

  …i.e. it points at the legacy `public.users` table — a bespoke table
  that was never wired to the Supabase auth flow. There is no trigger
  mirroring `auth.users → public.users`, no INSERT policy on
  `public.users` for the authenticated role, and no application code
  that ever creates a `public.users` row for a logged-in user.

  As a result, every attempt to upsert `user_preferences` from the
  Settings page fails with:

      insert or update on table "user_preferences" violates foreign key
      constraint "user_preferences_user_id_fkey"

  Every newer FK in this codebase that needs to point at "the logged-in
  user" correctly references `auth.users(id)` instead — see
  `profiles.id` (20260403_005), `user_profiles.user_id`
  (20260126215600), `saved_companies.user_id` (20260114220921),
  `lit_rate_limits.user_id`, `lit_api_logs.user_id`. `user_preferences`
  is the lone outlier.

  ## Fix
  Drop the broken FK and re-create it pointing at `auth.users(id)`,
  matching the canonical Supabase pattern used everywhere else in this
  schema.

  ## Safety
    * Constraint-only change — no columns added, removed, or retyped.
    * No data is read, written, or deleted.
    * No RLS policy is touched (the existing `auth.uid() = user_id`
      policies on user_preferences continue to apply unchanged).
    * `IF EXISTS` guards make this safe to re-run.
    * If somehow a row exists with a `user_id` that doesn't appear in
      `auth.users`, the new FK creation will fail loudly — but no such
      rows can exist today because every prior insert was being
      rejected.
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_preferences_user_id_fkey'
      AND conrelid = 'public.user_preferences'::regclass
  ) THEN
    ALTER TABLE public.user_preferences
      DROP CONSTRAINT user_preferences_user_id_fkey;
  END IF;
END $$;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;
