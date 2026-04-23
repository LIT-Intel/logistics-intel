/*
  # Fix RLS: Remove permissive dev policies, fix plan constraints, enable RLS on all tables

  Problems fixed:
  1. Dev-era policies used `FOR ALL USING (true)` WITHOUT `TO authenticated` — allows anon role
  2. Plan constraints used 'standard' instead of canonical 'starter'
  3. plan_audit_log INSERT policy was TO public (no role specified) — allows anon inserts
  4. Idempotent RLS enable across all tables to clear Supabase security alert

  All operations are wrapped in DO blocks or use IF EXISTS so the migration is
  safe to run regardless of which prior migrations have or have not been applied.
*/

-- ============================================================================
-- 1. Drop permissive development-era policies (allow anon access)
--    These policies were created WITHOUT "TO authenticated", so the anon role
--    can also read/write these tables. We drop them and leave only the proper
--    authenticated-scoped policies that later migrations already added.
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'lit_saved_companies') THEN
    DROP POLICY IF EXISTS "Allow all access to lit_saved_companies during development" ON lit_saved_companies;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'lit_contacts') THEN
    DROP POLICY IF EXISTS "Allow all access to lit_contacts during development" ON lit_contacts;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'lit_campaigns') THEN
    DROP POLICY IF EXISTS "Allow all access to lit_campaigns during development" ON lit_campaigns;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'lit_campaign_companies') THEN
    DROP POLICY IF EXISTS "Allow all access to lit_campaign_companies during development" ON lit_campaign_companies;
  END IF;
END $$;

-- ============================================================================
-- 2. plan_audit_log: create if missing, then set a proper INSERT policy
-- ============================================================================

CREATE TABLE IF NOT EXISTS plan_audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code  text NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('created', 'updated', 'deleted')),
  old_values  jsonb,
  new_values  jsonb,
  changed_by  uuid,
  changed_at  timestamptz DEFAULT now()
);

ALTER TABLE plan_audit_log ENABLE ROW LEVEL SECURITY;

-- Drop the old public-accessible INSERT policy if it exists
DROP POLICY IF EXISTS "System can create plan audit" ON plan_audit_log;

-- Admins can read audit logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plan_audit_log'
      AND policyname = 'Admins can view plan audit'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Admins can view plan audit"
        ON plan_audit_log FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM auth.users
            WHERE id = auth.uid()
              AND email IN ('vraymond@sparkfusiondigital.com', 'support@logisticintel.com')
          )
        )
    $p$;
  END IF;
END $$;

-- Authenticated users can insert audit records (needed for trigger-based logging)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'plan_audit_log'
      AND policyname = 'Authenticated can create plan audit'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Authenticated can create plan audit"
        ON plan_audit_log FOR INSERT
        TO authenticated
        WITH CHECK (true)
    $p$;
  END IF;
END $$;

-- ============================================================================
-- 3. Normalize plan values + fix CHECK constraints
--    org_billing was originally created with an inline CHECK constraint using
--    old plan names ('free', 'pro', 'enterprise'). Drop it before updating.
-- ============================================================================

DO $$ BEGIN
  -- Drop original inline check on org_billing.plan (auto-named by Postgres)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'org_billing_plan_check'
      AND conrelid = 'org_billing'::regclass
  ) THEN
    ALTER TABLE org_billing DROP CONSTRAINT org_billing_plan_check;
  END IF;

  -- Drop named constraint added by a prior migration (may or may not exist)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_org_billing_plan'
      AND conrelid = 'org_billing'::regclass
  ) THEN
    ALTER TABLE org_billing DROP CONSTRAINT fk_org_billing_plan;
  END IF;
END $$;

-- Normalize stale values in org_billing
UPDATE org_billing SET plan = 'free_trial' WHERE plan IN ('free');
UPDATE org_billing SET plan = 'starter'    WHERE plan IN ('standard');
UPDATE org_billing SET plan = 'growth'     WHERE plan IN ('pro');
UPDATE org_billing SET plan = 'enterprise' WHERE plan IN ('unlimited');

-- Add canonical constraint
ALTER TABLE org_billing
  ADD CONSTRAINT fk_org_billing_plan
  CHECK (plan IN ('free_trial', 'starter', 'growth', 'enterprise'));

-- subscriptions table: drop old named constraint (may or may not exist)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_subscriptions_plan'
      AND conrelid = 'subscriptions'::regclass
  ) THEN
    ALTER TABLE subscriptions DROP CONSTRAINT fk_subscriptions_plan;
  END IF;
END $$;

-- Normalize stale values in subscriptions
UPDATE subscriptions SET plan_code = 'free_trial' WHERE plan_code IN ('free');
UPDATE subscriptions SET plan_code = 'starter'    WHERE plan_code IN ('standard');
UPDATE subscriptions SET plan_code = 'growth'     WHERE plan_code IN ('pro');
UPDATE subscriptions SET plan_code = 'enterprise' WHERE plan_code IN ('unlimited');

-- Add canonical constraint
ALTER TABLE subscriptions
  ADD CONSTRAINT fk_subscriptions_plan
  CHECK (plan_code IN ('free_trial', 'starter', 'growth', 'enterprise'));

-- ============================================================================
-- 4. Enable RLS on all public tables (idempotent — safe to run multiple times)
-- ============================================================================

ALTER TABLE IF EXISTS users                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS companies                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contacts                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS campaigns                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS campaign_contacts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS enrichment_logs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_preferences                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS credit_transactions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_companies                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_company_kpis_monthly        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_saved_companies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_contacts                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_saved_contacts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_campaigns                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_campaign_companies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_rfps                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_activity_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS organizations                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS org_members                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS org_invites                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS org_settings                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS org_billing                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS token_ledger                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS api_keys                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS security_audit_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_profiles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS integrations                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS feature_toggles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS profiles                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscriptions                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS plans                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_importyeti_company_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_company_index               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS platform_admins                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS company_enrichment              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS saved_companies                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_importyeti_cache            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_rate_limits                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_api_logs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS plan_audit_log                  ENABLE ROW LEVEL SECURITY;
