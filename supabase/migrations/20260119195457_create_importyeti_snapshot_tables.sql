/*
  # ImportYeti Snapshot Architecture Migration

  1. New Tables
    - `lit_importyeti_company_snapshot`
      - System of record for ImportYeti company data
      - Caches full raw payload + parsed KPIs
      - 30-day refresh policy
    - `lit_company_index`
      - Fast search index for frontend queries
      - Populated from snapshots
      - Optimized for ILIKE searches
  
  2. Security
    - Enable RLS on both tables
    - Authenticated users can read
    - Only service role can write (via edge functions)
  
  3. Indexes
    - lit_company_index.company_name for fast search
    - lit_importyeti_company_snapshot.updated_at for cache invalidation
*/

-- Enable extensions first
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Snapshot table (system of record)
CREATE TABLE IF NOT EXISTS lit_importyeti_company_snapshot (
  company_id TEXT PRIMARY KEY,
  raw_payload JSONB NOT NULL,
  parsed_summary JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Search index table (fast UI search)
CREATE TABLE IF NOT EXISTS lit_company_index (
  company_id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  country TEXT,
  city TEXT,
  last_shipment_date DATE,
  total_shipments INTEGER DEFAULT 0,
  total_teu NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_company_index_name ON lit_company_index USING gin(company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_company_index_shipments ON lit_company_index(total_shipments DESC);
CREATE INDEX IF NOT EXISTS idx_snapshot_updated ON lit_importyeti_company_snapshot(updated_at);

-- Enable RLS
ALTER TABLE lit_importyeti_company_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE lit_company_index ENABLE ROW LEVEL SECURITY;

-- Policies for snapshot table
DROP POLICY IF EXISTS "Authenticated users can read snapshots" ON lit_importyeti_company_snapshot;
CREATE POLICY "Authenticated users can read snapshots"
  ON lit_importyeti_company_snapshot FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can write snapshots" ON lit_importyeti_company_snapshot;
CREATE POLICY "Service role can write snapshots"
  ON lit_importyeti_company_snapshot FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policies for index table
DROP POLICY IF EXISTS "Authenticated users can read index" ON lit_company_index;
CREATE POLICY "Authenticated users can read index"
  ON lit_company_index FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Service role can write index" ON lit_company_index;
CREATE POLICY "Service role can write index"
  ON lit_company_index FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);