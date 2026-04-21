/*
  # Fix RLS: Remove permissive dev policies, fix plan constraints, enable RLS on all tables

  Problems fixed:
  1. Dev-era policies used `FOR ALL USING (true)` WITHOUT `TO authenticated` — allows anon role
  2. Plan constraints used 'standard' instead of canonical 'starter'
  3. plan_audit_log INSERT policy was TO public (no role specified) — allows anon inserts
  4. Idempotent RLS enable across all tables to clear Supabase security alert
*/

-- ============================================================================
-- 1. Drop permissive development-era policies (allow anon access)
-- ============================================================================

DROP POLICY IF EXISTS "Allow all access to lit_saved_companies during development" ON lit_saved_companies;
DROP POLICY IF EXISTS "Allow all access to lit_contacts during development" ON lit_contacts;
DROP POLICY IF EXISTS "Allow all access to lit_campaigns during development" ON lit_campaigns;
DROP POLICY IF EXISTS "Allow all access to lit_campaign_companies during development" ON lit_campaign_companies;

-- ============================================================================
-- 2. Fix plan_audit_log INSERT policy (was TO public → anon accessible)
-- ============================================================================

DROP POLICY IF EXISTS "System can create plan audit" ON plan_audit_log;

CREATE POLICY "Authenticated can create plan audit"
  ON plan_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- 3. Normalize stale plan values before updating constraints
-- ============================================================================

UPDATE subscriptions SET plan_code = 'free_trial'  WHERE plan_code = 'free';
UPDATE subscriptions SET plan_code = 'starter'     WHERE plan_code = 'standard';
UPDATE subscriptions SET plan_code = 'growth'      WHERE plan_code = 'pro';
UPDATE subscriptions SET plan_code = 'enterprise'  WHERE plan_code = 'unlimited';

UPDATE org_billing SET plan = 'free_trial' WHERE plan = 'free';
UPDATE org_billing SET plan = 'starter'    WHERE plan = 'standard';
UPDATE org_billing SET plan = 'growth'     WHERE plan = 'pro';
UPDATE org_billing SET plan = 'enterprise' WHERE plan = 'unlimited';

-- ============================================================================
-- 4. Fix plan constraints: 'standard' → 'starter'
-- ============================================================================

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS fk_subscriptions_plan;
ALTER TABLE subscriptions
  ADD CONSTRAINT fk_subscriptions_plan
  CHECK (plan_code IN ('free_trial', 'starter', 'growth', 'enterprise'));

ALTER TABLE org_billing DROP CONSTRAINT IF EXISTS fk_org_billing_plan;
ALTER TABLE org_billing
  ADD CONSTRAINT fk_org_billing_plan
  CHECK (plan IN ('free_trial', 'starter', 'growth', 'enterprise'));

-- ============================================================================
-- 5. Enable RLS on all public tables (idempotent — safe to run multiple times)
-- ============================================================================

ALTER TABLE IF EXISTS users                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS companies                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contacts                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS campaigns                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS campaign_contacts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS enrichment_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_preferences              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS credit_transactions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_companies                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_company_kpis_monthly      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_saved_companies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_contacts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_saved_contacts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_campaigns                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_campaign_companies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_rfps                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_activity_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS organizations                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS org_members                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS org_invites                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS org_settings                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS org_billing                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS token_ledger                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS api_keys                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS security_audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS integrations                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS feature_toggles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS profiles                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscriptions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS plans                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_importyeti_company_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_company_index             ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS platform_admins               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS company_enrichment            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS saved_companies               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_importyeti_cache          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_rate_limits               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS lit_api_logs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS plan_audit_log                ENABLE ROW LEVEL SECURITY;
