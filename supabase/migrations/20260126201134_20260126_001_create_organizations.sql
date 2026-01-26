/*
  # Organizations Table

  1. New Tables
    - `organizations` - Multi-tenant workspace records
      - `id` (uuid, primary key)
      - `owner_id` (uuid)
      - `name` (text)
      - `industry` (text)
      - `region` (text)
      - `timezone` (text)
      - `logo_url` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
*/

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  industry text,
  region text DEFAULT 'North America',
  timezone text DEFAULT 'UTC',
  logo_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view orgs they belong to"
  ON organizations FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Org owners can update settings"
  ON organizations FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON organizations(owner_id);