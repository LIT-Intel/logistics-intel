/*
  # LIT Development Mode Tables
  
  This migration creates temporary tables for UI development while the Google Cloud backend is unavailable.
  These tables will store saved companies, contacts, campaigns, and campaign associations during development.
  
  ## New Tables
  
  ### `lit_saved_companies`
  Stores companies saved to Command Center
  - `id` (uuid, primary key)
  - `company_id` (text, unique) - The company identifier (e.g., "company/walmart-inc")
  - `company_key` (text) - ImportYeti company key
  - `company_name` (text) - Display name
  - `company_data` (jsonb) - Full company object from ImportYeti/search
  - `user_id` (text) - User who saved this company
  - `stage` (text) - Pipeline stage (default: "prospect")
  - `source` (text) - Data source (e.g., "importyeti", "manual")
  - `created_at` (timestamptz) - When company was saved
  - `updated_at` (timestamptz) - Last update time
  
  ### `lit_contacts`
  Stores enriched contact data for companies
  - `id` (uuid, primary key)
  - `company_id` (text, foreign key to lit_saved_companies)
  - `contact_name` (text)
  - `contact_title` (text)
  - `contact_email` (text)
  - `contact_phone` (text)
  - `contact_data` (jsonb) - Full contact object
  - `enriched_at` (timestamptz)
  - `created_at` (timestamptz)
  
  ### `lit_campaigns`
  Stores outreach campaigns
  - `id` (uuid, primary key)
  - `campaign_name` (text)
  - `campaign_type` (text) - e.g., "email", "linkedin"
  - `status` (text) - e.g., "draft", "active", "paused", "completed"
  - `campaign_data` (jsonb) - Full campaign configuration
  - `user_id` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  
  ### `lit_campaign_companies`
  Associates companies with campaigns
  - `id` (uuid, primary key)
  - `campaign_id` (uuid, foreign key to lit_campaigns)
  - `company_id` (text)
  - `status` (text) - e.g., "pending", "in_progress", "completed"
  - `added_at` (timestamptz)
  
  ## Security
  
  - Enable RLS on all tables
  - All tables are accessible without authentication during development (FOR DEVELOPMENT ONLY)
  - These tables are temporary and should be replaced with Google Cloud backend later
  
  ## Notes
  
  - These tables are designed for development/demo purposes only
  - Data structure matches the expected API responses for seamless transition
  - When reconnecting to Google Cloud, simply set VITE_USE_MOCK_DATA=false
*/

-- Create lit_saved_companies table
CREATE TABLE IF NOT EXISTS lit_saved_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text UNIQUE NOT NULL,
  company_key text,
  company_name text NOT NULL,
  company_data jsonb DEFAULT '{}'::jsonb,
  user_id text DEFAULT 'dev-user',
  stage text DEFAULT 'prospect',
  source text DEFAULT 'importyeti',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_lit_saved_companies_company_id ON lit_saved_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_lit_saved_companies_user_id ON lit_saved_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_lit_saved_companies_created_at ON lit_saved_companies(created_at DESC);

-- Create lit_contacts table
CREATE TABLE IF NOT EXISTS lit_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  contact_name text,
  contact_title text,
  contact_email text,
  contact_phone text,
  contact_data jsonb DEFAULT '{}'::jsonb,
  enriched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_lit_contacts_company_id ON lit_contacts(company_id);

-- Create lit_campaigns table
CREATE TABLE IF NOT EXISTS lit_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name text NOT NULL,
  campaign_type text DEFAULT 'email',
  status text DEFAULT 'draft',
  campaign_data jsonb DEFAULT '{}'::jsonb,
  user_id text DEFAULT 'dev-user',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_lit_campaigns_user_id ON lit_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_lit_campaigns_status ON lit_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_lit_campaigns_created_at ON lit_campaigns(created_at DESC);

-- Create lit_campaign_companies table
CREATE TABLE IF NOT EXISTS lit_campaign_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES lit_campaigns(id) ON DELETE CASCADE,
  company_id text NOT NULL,
  status text DEFAULT 'pending',
  added_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_lit_campaign_companies_campaign_id ON lit_campaign_companies(campaign_id);
CREATE INDEX IF NOT EXISTS idx_lit_campaign_companies_company_id ON lit_campaign_companies(company_id);

-- Enable RLS on all tables
ALTER TABLE lit_saved_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE lit_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lit_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE lit_campaign_companies ENABLE ROW LEVEL SECURITY;

-- DEVELOPMENT ONLY: Allow all access without authentication
-- WARNING: Remove these policies before production deployment
CREATE POLICY "Allow all access to lit_saved_companies during development"
  ON lit_saved_companies
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to lit_contacts during development"
  ON lit_contacts
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to lit_campaigns during development"
  ON lit_campaigns
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to lit_campaign_companies during development"
  ON lit_campaign_companies
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert sample data for immediate testing
INSERT INTO lit_saved_companies (company_id, company_key, company_name, company_data, stage, source)
VALUES 
  (
    'company/apple-inc',
    'company/apple-inc',
    'Apple Inc.',
    '{"name": "Apple Inc.", "domain": "apple.com", "phone": "+1-408-996-1010", "address": "One Apple Park Way, Cupertino, CA 95014", "totalShipments": 45240, "shipmentsLast12m": 45240}'::jsonb,
    'prospect',
    'importyeti'
  ),
  (
    'company/walmart-inc',
    'company/walmart-inc',
    'Walmart Inc.',
    '{"name": "Walmart Inc.", "domain": "walmart.com", "phone": "+1-479-273-4000", "address": "702 Southwest 8th Street, Bentonville, AR 72716", "totalShipments": 124850, "shipmentsLast12m": 124850}'::jsonb,
    'prospect',
    'importyeti'
  )
ON CONFLICT (company_id) DO NOTHING;
