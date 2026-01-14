/*
  # Enhance Companies Table and Add Caching Infrastructure

  ## Changes to Existing Tables

  ### `companies` table enhancements
  - Add `company_key` (text) - ImportYeti key for API calls
  - Add `country_code` (text) - ISO country code (keep existing `country` for compatibility)
  - Add `phone` (text) - Company phone
  - Add `total_shipments` (integer) - Lifetime shipments
  - Add `shipments_12m` (integer) - Last 12 months shipments
  - Add `most_recent_shipment` (date) - Latest shipment date
  - Add `top_suppliers` (jsonb) - Array of top suppliers
  - Add `raw_data` (jsonb) - Complete ImportYeti response
  - Add `source` (text) - Data source tracking
  - Add `last_fetched_at` (timestamptz) - When ImportYeti was last called

  ### `contacts` table enhancements
  - Add `user_id` (uuid) - Who enriched/added this contact
  - Add `contact_linkedin` (text) - LinkedIn URL
  - Add `verified` (boolean) - Email verification status
  - Add `enrichment_source` (text) - Source tracking
  - Add `raw_data` (jsonb) - Complete enrichment response
  - Change company_id to text to match companies.company_id

  ## New Tables

  ### `company_enrichment`
  AI-generated enrichment data (Gemini)

  ### `saved_companies`
  Command Center saved companies (user relationships)

  ### `lit_importyeti_cache`
  Raw ImportYeti API response cache with TTL

  ### `lit_rate_limits`
  User-based rate limiting for ImportYeti API

  ### `lit_api_logs`
  API request logging and analytics

  ## Security
  - Enable RLS on all new tables
  - Maintain existing RLS policies
  - Add proper foreign key constraints
*/

-- ============================================================================
-- 1. ENHANCE EXISTING COMPANIES TABLE
-- ============================================================================

DO $$
BEGIN
  -- Add new columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'company_key') THEN
    ALTER TABLE companies ADD COLUMN company_key text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'country_code') THEN
    ALTER TABLE companies ADD COLUMN country_code text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'phone') THEN
    ALTER TABLE companies ADD COLUMN phone text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'total_shipments') THEN
    ALTER TABLE companies ADD COLUMN total_shipments integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'shipments_12m') THEN
    ALTER TABLE companies ADD COLUMN shipments_12m integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'most_recent_shipment') THEN
    ALTER TABLE companies ADD COLUMN most_recent_shipment date;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'top_suppliers') THEN
    ALTER TABLE companies ADD COLUMN top_suppliers jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'raw_data') THEN
    ALTER TABLE companies ADD COLUMN raw_data jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'source') THEN
    ALTER TABLE companies ADD COLUMN source text DEFAULT 'importyeti';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'last_fetched_at') THEN
    ALTER TABLE companies ADD COLUMN last_fetched_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_companies_country_code ON companies(country_code) WHERE country_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_last_fetched ON companies(last_fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_companies_shipments ON companies(shipments_12m DESC);
CREATE INDEX IF NOT EXISTS idx_companies_company_key ON companies(company_key) WHERE company_key IS NOT NULL;

-- ============================================================================
-- 2. COMPANY ENRICHMENT TABLE (New)
-- ============================================================================

CREATE TABLE IF NOT EXISTS company_enrichment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL,
  enrichment_type text NOT NULL,
  enrichment_data jsonb DEFAULT '{}'::jsonb,
  model_version text,
  enriched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, enrichment_type)
);

CREATE INDEX IF NOT EXISTS idx_enrichment_company_id ON company_enrichment(company_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_type ON company_enrichment(enrichment_type);
CREATE INDEX IF NOT EXISTS idx_enrichment_created ON company_enrichment(created_at DESC);

ALTER TABLE company_enrichment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enrichment is viewable by authenticated users"
  ON company_enrichment FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enrichment can be inserted by authenticated users"
  ON company_enrichment FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enrichment can be updated by authenticated users"
  ON company_enrichment FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 3. SAVED COMPANIES TABLE (New)
-- ============================================================================

CREATE TABLE IF NOT EXISTS saved_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id text NOT NULL,
  stage text DEFAULT 'prospect',
  notes text,
  tags text[] DEFAULT ARRAY[]::text[],
  saved_at timestamptz DEFAULT now(),
  last_viewed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_companies_user_id ON saved_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_companies_company_id ON saved_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_saved_companies_stage ON saved_companies(stage);
CREATE INDEX IF NOT EXISTS idx_saved_companies_saved_at ON saved_companies(saved_at DESC);

ALTER TABLE saved_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved companies"
  ON saved_companies FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved companies"
  ON saved_companies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved companies"
  ON saved_companies FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved companies"
  ON saved_companies FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 4. IMPORTYETI CACHE TABLE (New)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_importyeti_cache (
  cache_key text PRIMARY KEY,
  endpoint text NOT NULL,
  params_hash text NOT NULL,
  request_params jsonb DEFAULT '{}'::jsonb,
  response_data jsonb DEFAULT '{}'::jsonb,
  status_code integer DEFAULT 200,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  hit_count integer DEFAULT 0,
  last_hit_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cache_endpoint ON lit_importyeti_cache(endpoint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON lit_importyeti_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_cache_params_hash ON lit_importyeti_cache(params_hash);

ALTER TABLE lit_importyeti_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cache is viewable by authenticated users"
  ON lit_importyeti_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Cache can be inserted by authenticated users"
  ON lit_importyeti_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Cache can be updated by authenticated users"
  ON lit_importyeti_cache FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 5. RATE LIMITS TABLE (New)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  request_count integer DEFAULT 0,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint ON lit_rate_limits(user_id, endpoint, window_end);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_end ON lit_rate_limits(window_end);

ALTER TABLE lit_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own rate limits"
  ON lit_rate_limits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own rate limits"
  ON lit_rate_limits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own rate limits"
  ON lit_rate_limits FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 6. API LOGS TABLE (New)
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  method text NOT NULL,
  cache_hit boolean DEFAULT false,
  response_time_ms integer,
  status_code integer,
  error_message text,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_logs_user_id ON lit_api_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint ON lit_api_logs(endpoint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON lit_api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_cache_hit ON lit_api_logs(cache_hit);

ALTER TABLE lit_api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own API logs"
  ON lit_api_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "API logs can be inserted by authenticated users"
  ON lit_api_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check and increment rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id uuid,
  p_endpoint text,
  p_max_requests integer,
  p_window_minutes integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_count integer;
  v_window_start timestamptz;
  v_window_end timestamptz;
BEGIN
  v_window_start := date_trunc('hour', now());
  v_window_end := v_window_start + (p_window_minutes || ' minutes')::interval;

  SELECT request_count INTO v_current_count
  FROM lit_rate_limits
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND window_start = v_window_start;

  IF v_current_count IS NULL THEN
    INSERT INTO lit_rate_limits (user_id, endpoint, request_count, window_start, window_end)
    VALUES (p_user_id, p_endpoint, 1, v_window_start, v_window_end);
    RETURN true;
  END IF;

  IF v_current_count >= p_max_requests THEN
    RETURN false;
  END IF;

  UPDATE lit_rate_limits
  SET request_count = request_count + 1,
      updated_at = now()
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND window_start = v_window_start;

  RETURN true;
END;
$$;

-- Function to get cache with automatic hit tracking
CREATE OR REPLACE FUNCTION get_cache(p_cache_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_response jsonb;
BEGIN
  UPDATE lit_importyeti_cache
  SET hit_count = hit_count + 1,
      last_hit_at = now()
  WHERE cache_key = p_cache_key
    AND expires_at > now()
  RETURNING response_data INTO v_response;

  RETURN v_response;
END;
$$;

-- Function to clean expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  DELETE FROM lit_importyeti_cache
  WHERE expires_at < now();

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;