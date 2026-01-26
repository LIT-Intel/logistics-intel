/*
  # Organization Settings Table

  1. New Tables
    - `org_settings` - Organization preferences and defaults
      - `org_id` (uuid, primary key)
      - `search_depth` (enum: light|full)
      - `max_results` (int)
      - `auto_enrichment` (boolean)
      - `cache_enabled` (boolean)
      - `credit_protection` (boolean)
      - `mfa_required` (boolean)
      - `magic_link_enabled` (boolean)
      - `google_oauth_enabled` (boolean)
      - `command_center_defaults` (jsonb)
      - `rfp_defaults` (jsonb)
      - `updated_at` (timestamp)
*/

CREATE TABLE IF NOT EXISTS org_settings (
  org_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  search_depth text DEFAULT 'full' CHECK (search_depth IN ('light', 'full')),
  max_results integer DEFAULT 1000,
  auto_enrichment boolean DEFAULT false,
  cache_enabled boolean DEFAULT true,
  credit_protection boolean DEFAULT false,
  mfa_required boolean DEFAULT false,
  magic_link_enabled boolean DEFAULT false,
  google_oauth_enabled boolean DEFAULT false,
  command_center_defaults jsonb DEFAULT '{"pipeline": "lead", "stages": []}'::jsonb,
  rfp_defaults jsonb DEFAULT '{"template": "standard", "owner": ""}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view settings"
  ON org_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_settings.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Org admins can update settings"
  ON org_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_settings.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_settings.org_id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );