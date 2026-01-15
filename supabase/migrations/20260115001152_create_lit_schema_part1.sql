/*
  # LIT Platform Schema - Part 1: Core Tables

  Creates core company and KPI tables
*/

-- ============================================================================
-- 1. LIT_COMPANIES - Canonical company records
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity / Matching
  source text NOT NULL DEFAULT 'importyeti',
  source_company_key text,
  name text NOT NULL,
  normalized_name text,
  domain text,
  website text,
  phone text,
  country_code text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,

  -- Logo
  logo_url text,

  -- Latest raw payload snapshots
  raw_profile jsonb,
  raw_stats jsonb,
  raw_bols jsonb,
  raw_last_search jsonb,

  -- Computed KPIs (for fast UI)
  shipments_12m integer DEFAULT 0,
  teu_12m numeric,
  fcl_shipments_12m integer,
  lcl_shipments_12m integer,
  est_spend_12m numeric,
  most_recent_shipment_date date,
  top_route_12m text,
  recent_route text,

  -- Scoring / Tags
  confidence_score numeric,
  tags text[],
  primary_mode text,
  revenue_range text,
  risk_level text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Unique constraints
  UNIQUE (source, source_company_key)
);

CREATE INDEX IF NOT EXISTS idx_lit_companies_name ON lit_companies USING gin (to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_lit_companies_domain ON lit_companies(domain);
CREATE INDEX IF NOT EXISTS idx_lit_companies_source_key ON lit_companies(source, source_company_key);
CREATE INDEX IF NOT EXISTS idx_lit_companies_updated ON lit_companies(updated_at DESC);

-- Enable RLS (read for authenticated, write via Edge Functions only)
ALTER TABLE lit_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies are viewable by authenticated users"
  ON lit_companies FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- 2. LIT_COMPANY_KPIS_MONTHLY - Monthly KPI tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS lit_company_kpis_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES lit_companies(id) ON DELETE CASCADE,
  month_start date NOT NULL,
  shipments integer DEFAULT 0,
  fcl_shipments integer DEFAULT 0,
  lcl_shipments integer DEFAULT 0,
  teu numeric,
  est_spend numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, month_start)
);

CREATE INDEX IF NOT EXISTS idx_kpis_company_month ON lit_company_kpis_monthly(company_id, month_start DESC);

ALTER TABLE lit_company_kpis_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "KPIs are viewable by authenticated users"
  ON lit_company_kpis_monthly FOR SELECT
  TO authenticated
  USING (true);
