/*
  # Consolidate Plan Definitions (Phase 1)

  Moves plan definitions from frontend code to database as single source of truth.

  Changes:
  1. Enhance plans table with feature access matrix
  2. Add usage limits to plans
  3. Add pricing metadata (per-seat, intervals)
  4. RLS policies for public read access
*/

-- Add columns to plans table for complete plan definition
ALTER TABLE plans
ADD COLUMN IF NOT EXISTS features jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS usage_limits jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS seat_rules jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS per_seat_pricing boolean DEFAULT false;

-- Update existing plans with complete definitions
UPDATE plans SET
  features = jsonb_build_object(
    'dashboard', true,
    'search', true,
    'command_center', true,
    'company_page', false,
    'campaign_builder', false,
    'pulse', false,
    'enrichment', false,
    'billing_admin', false,
    'seat_management', false,
    'credit_rating_ready', false,
    'contact_intel_ready', false
  ),
  usage_limits = jsonb_build_object(
    'searches_per_month', 10,
    'company_views_per_month', 0,
    'command_center_saves_per_month', 10,
    'enrichment_credits_per_month', 0,
    'pulse_runs_per_month', 0
  ),
  seat_rules = jsonb_build_object(
    'min', 1,
    'max', 1,
    'default', 1
  ),
  per_seat_pricing = false
WHERE code = 'free_trial';

UPDATE plans SET
  features = jsonb_build_object(
    'dashboard', true,
    'search', true,
    'command_center', true,
    'company_page', true,
    'campaign_builder', false,
    'pulse', false,
    'enrichment', false,
    'billing_admin', true,
    'seat_management', false,
    'credit_rating_ready', false,
    'contact_intel_ready', false
  ),
  usage_limits = jsonb_build_object(
    'searches_per_month', 100,
    'company_views_per_month', 50,
    'command_center_saves_per_month', 50,
    'enrichment_credits_per_month', 0,
    'pulse_runs_per_month', 0
  ),
  seat_rules = jsonb_build_object(
    'min', 1,
    'max', 1,
    'default', 1
  ),
  per_seat_pricing = false
WHERE code = 'standard';

UPDATE plans SET
  features = jsonb_build_object(
    'dashboard', true,
    'search', true,
    'command_center', true,
    'company_page', true,
    'campaign_builder', true,
    'pulse', true,
    'enrichment', true,
    'billing_admin', true,
    'seat_management', true,
    'credit_rating_ready', false,
    'contact_intel_ready', true
  ),
  usage_limits = jsonb_build_object(
    'searches_per_month', 500,
    'company_views_per_month', 200,
    'command_center_saves_per_month', 200,
    'enrichment_credits_per_month', 100,
    'pulse_runs_per_month', 50
  ),
  seat_rules = jsonb_build_object(
    'min', 3,
    'max', 7,
    'default', 3
  ),
  per_seat_pricing = true
WHERE code = 'growth';

UPDATE plans SET
  features = jsonb_build_object(
    'dashboard', true,
    'search', true,
    'command_center', true,
    'company_page', true,
    'campaign_builder', true,
    'pulse', true,
    'enrichment', true,
    'billing_admin', true,
    'seat_management', true,
    'credit_rating_ready', true,
    'contact_intel_ready', true
  ),
  usage_limits = jsonb_build_object(
    'searches_per_month', null,
    'company_views_per_month', null,
    'command_center_saves_per_month', null,
    'enrichment_credits_per_month', null,
    'pulse_runs_per_month', null
  ),
  seat_rules = jsonb_build_object(
    'min', 6,
    'max', null,
    'default', 6
  ),
  per_seat_pricing = true
WHERE code = 'enterprise';

-- Create index for plan lookups
CREATE INDEX IF NOT EXISTS idx_plans_code_active ON plans(code, is_active);
