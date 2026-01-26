/*
  # Billing and Token Tracking Tables

  1. New Tables
    - `org_billing` - Organization subscription and billing info
      - `org_id` (uuid, primary key)
      - `stripe_customer_id` (text)
      - `stripe_subscription_id` (text)
      - `plan` (enum: free|pro|enterprise)
      - `seat_limit` (int)
      - `token_limit_monthly` (int)
      - `status` (enum: active|past_due|canceled)
      - `current_period_start` (timestamp)
      - `current_period_end` (timestamp)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `token_ledger` - Per-transaction token usage tracking
      - `id` (uuid, primary key)
      - `org_id` (uuid, references organizations)
      - `user_id` (uuid)
      - `feature` (enum: search|company_modal|command_center|rfp|campaigns|ai)
      - `tokens` (int)
      - `meta` (jsonb) - Additional context (company_id, query, etc.)
      - `created_at` (timestamp)
    
    - `api_keys` - Organization API keys for external integrations
      - `id` (uuid, primary key)
      - `org_id` (uuid, references organizations)
      - `user_id` (uuid)
      - `key_name` (text)
      - `key_prefix` (text)
      - `key_hash` (text)
      - `last_used_at` (timestamp)
      - `created_at` (timestamp)

  2. Security
    - Token ledger is audit-only (append-only)
    - Only org admins can view billing
    - API keys are per-user and only they can view their own
*/

CREATE TABLE IF NOT EXISTS org_billing (
  org_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  seat_limit integer DEFAULT 5,
  token_limit_monthly integer DEFAULT 100000,
  status text DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE org_billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view billing"
  ON org_billing FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_billing.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admins can update billing"
  ON org_billing FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_billing.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_billing.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

-- Token ledger - append-only audit log
CREATE TABLE IF NOT EXISTS token_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  feature text NOT NULL CHECK (feature IN ('search', 'company_modal', 'command_center', 'rfp', 'campaigns', 'ai')),
  tokens integer NOT NULL DEFAULT 1,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE token_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view ledger"
  ON token_ledger FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = token_ledger.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "System can insert ledger entries"
  ON token_ledger FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_token_ledger_org_id ON token_ledger(org_id);
CREATE INDEX IF NOT EXISTS idx_token_ledger_user_id ON token_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_token_ledger_created_at ON token_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_token_ledger_feature ON token_ledger(feature);

-- API keys for external integrations
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  key_name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, key_name)
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own API keys"
  ON api_keys FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Org admins can view org API keys"
  ON api_keys FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = api_keys.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can create API keys"
  ON api_keys FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own keys"
  ON api_keys FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_api_keys_org_id ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);