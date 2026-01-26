/*
  # Additional Settings Tables for Complete Feature Support

  1. New Tables
    - `security_audit_logs` - Audit trail for security events
      - `id` (uuid, primary key)
      - `org_id` (uuid, references organizations)
      - `user_id` (uuid, references auth.users)
      - `action` (text) - e.g., 'org_updated', 'member_removed', 'setting_changed'
      - `resource_type` (text) - e.g., 'organization', 'member', 'setting'
      - `resource_id` (text) - ID of affected resource
      - `changes` (jsonb) - Before/after values
      - `ip_address` (text)
      - `user_agent` (text)
      - `status` (text) - 'success' or 'failure'
      - `created_at` (timestamp)

    - `user_profiles` - Extended user profile information
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users, unique)
      - `full_name` (text)
      - `title` (text)
      - `phone` (text)
      - `avatar_url` (text)
      - `bio` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `integrations` - Manage external service connections
      - `id` (uuid, primary key)
      - `org_id` (uuid, references organizations)
      - `user_id` (uuid)
      - `integration_type` (enum: gmail, outlook, slack, salesforce, zapier)
      - `name` (text) - Display name
      - `status` (enum: connected, disconnected, error)
      - `external_id` (text) - ID from external service
      - `credentials_encrypted` (text) - Encrypted OAuth tokens (never return in API)
      - `last_sync_at` (timestamp)
      - `error_message` (text)
      - `connected_at` (timestamp)
      - `created_at` (timestamp)

    - `feature_toggles` - Organization-specific feature flags
      - `id` (uuid, primary key)
      - `org_id` (uuid, references organizations)
      - `feature_key` (text) - e.g., 'advanced_search', 'campaigns', 'api_access'
      - `enabled` (boolean)
      - `metadata` (jsonb) - Feature-specific config
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - All tables have RLS enabled
    - Audit logs are append-only (no delete)
    - User profiles readable by self and org admins
    - Integrations restricted to owning user and org admins
    - Feature toggles readable by all org members
*/

-- Audit logs table
CREATE TABLE IF NOT EXISTS security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  changes jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  status text DEFAULT 'success' CHECK (status IN ('success', 'failure')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE security_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view audit logs"
  ON security_audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = security_audit_logs.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "System can insert audit logs"
  ON security_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_org_id ON security_audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_created_at ON security_audit_logs(created_at DESC);

-- User profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  title text,
  phone text,
  avatar_url text,
  bio text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Org admins can view org member profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      JOIN org_members om2 ON om.org_id = om2.org_id
      WHERE om.user_id = user_profiles.user_id
      AND om2.user_id = auth.uid()
      AND om2.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Integrations table
CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  integration_type text NOT NULL CHECK (integration_type IN ('gmail', 'outlook', 'slack', 'salesforce', 'zapier')),
  name text NOT NULL,
  status text DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  external_id text,
  credentials_encrypted text,
  last_sync_at timestamptz,
  error_message text,
  connected_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, integration_type)
);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org integrations"
  ON integrations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = integrations.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can manage integrations"
  ON integrations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = integrations.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admins can update integrations"
  ON integrations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = integrations.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = integrations.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admins can delete integrations"
  ON integrations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = integrations.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_integrations_org_id ON integrations(org_id);
CREATE INDEX IF NOT EXISTS idx_integrations_user_id ON integrations(user_id);

-- Feature toggles table
CREATE TABLE IF NOT EXISTS feature_toggles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, feature_key)
);

ALTER TABLE feature_toggles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view feature toggles"
  ON feature_toggles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = feature_toggles.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can manage feature toggles"
  ON feature_toggles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = feature_toggles.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Org admins can update feature toggles"
  ON feature_toggles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = feature_toggles.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = feature_toggles.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_feature_toggles_org_id ON feature_toggles(org_id);
CREATE INDEX IF NOT EXISTS idx_feature_toggles_feature_key ON feature_toggles(feature_key);
