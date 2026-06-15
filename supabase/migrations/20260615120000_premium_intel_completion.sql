-- Premium Intel completion (claude/premium-intel-completion)
--
-- Closes 6 gaps in the Premium Intel workstream:
--   2. lit_pq_company_aggregates  — IY PowerQuery /companies endpoints
--   3. lit_pq_supplier_aggregates — IY PowerQuery /suppliers endpoints
--   4. lit_lane_yoy_trend         — sliding 12-month windows (replaces hardcoded 2024/25/26)
--   5. lit_internal_meta          — kv table for /database-updated cache
--   6. lit_lane_carrier_mix       — city/state granularity (destination side only;
--                                    lit_unified_shipments has dest_city/dest_state
--                                    but no origin_city/origin_state — origin
--                                    stays country-only with a comment marking
--                                    the source-data gap)
--
-- Applied via Supabase MCP `apply_migration` so the prod DB is current. Mirrored
-- here so the auto-deploy `supabase db push` treats it as already-applied
-- (idempotent CREATE / CREATE OR REPLACE everywhere).

-- ---------------------------------------------------------------------------
-- 1. lit_pq_company_aggregates  (Gap 2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lit_pq_company_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,                  -- 'us-import-companies' / 'us-export-companies' / 'mx-import-companies' / 'mx-export-companies'
  company_name text NOT NULL,
  company_address text[],
  company_country_code text,
  company_country text,
  total_shipments integer,
  name_variations text[],
  customs_offices text[],
  product_descriptions text[],
  incoterms text[],
  raw_payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lit_pq_company_aggregates_uniq UNIQUE (source, company_name)
);
CREATE INDEX IF NOT EXISTS lit_pq_co_agg_source_name
  ON public.lit_pq_company_aggregates (source, company_name);
CREATE INDEX IF NOT EXISTS lit_pq_co_agg_company_name
  ON public.lit_pq_company_aggregates (company_name);

ALTER TABLE public.lit_pq_company_aggregates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lit_pq_company_aggregates_read ON public.lit_pq_company_aggregates;
CREATE POLICY lit_pq_company_aggregates_read
  ON public.lit_pq_company_aggregates
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.lit_pq_company_aggregates IS
  'ImportYeti PowerQuery /companies aggregates. Source=us-import-companies|us-export-companies|mx-import-companies|mx-export-companies. Written by iy-powerquery-sync.';

-- ---------------------------------------------------------------------------
-- 2. lit_pq_supplier_aggregates  (Gap 3)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lit_pq_supplier_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,                  -- '*-suppliers'
  buyer_company_name text NOT NULL,      -- the company we're researching
  supplier_name text NOT NULL,
  supplier_country text,
  shipment_count integer,
  top_products text[],
  first_shipment_date date,
  last_shipment_date date,
  raw_payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lit_pq_supplier_aggregates_uniq UNIQUE (source, buyer_company_name, supplier_name)
);
CREATE INDEX IF NOT EXISTS lit_pq_sup_agg_buyer
  ON public.lit_pq_supplier_aggregates (buyer_company_name);
CREATE INDEX IF NOT EXISTS lit_pq_sup_agg_source_buyer
  ON public.lit_pq_supplier_aggregates (source, buyer_company_name);

ALTER TABLE public.lit_pq_supplier_aggregates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lit_pq_supplier_aggregates_read ON public.lit_pq_supplier_aggregates;
CREATE POLICY lit_pq_supplier_aggregates_read
  ON public.lit_pq_supplier_aggregates
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.lit_pq_supplier_aggregates IS
  'ImportYeti PowerQuery /suppliers aggregates: per-buyer supplier rollup. Source=us-import-suppliers|mx-import-suppliers|mx-export-suppliers. Written by iy-powerquery-sync.';

-- ---------------------------------------------------------------------------
-- 3. lit_internal_meta  (Gap 5 — kv store for database-updated freshness)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lit_internal_meta (
  meta_key text PRIMARY KEY,
  meta_value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lit_internal_meta ENABLE ROW LEVEL SECURITY;
-- Authenticated read (the freshness badge calls this from the browser via RPC).
-- Write is service-role only (no policy => writes blocked under RLS).
DROP POLICY IF EXISTS lit_internal_meta_read ON public.lit_internal_meta;
CREATE POLICY lit_internal_meta_read
  ON public.lit_internal_meta
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.lit_internal_meta IS
  'Generic kv store for per-feature internal state. Keys: importyeti_database_updated (cached /v1.0/database-updated response).';

-- ---------------------------------------------------------------------------
-- 4. RPC: lit_lane_carrier_mix  — city/state granularity (Gap NEW)
--
-- IMPORTANT: lit_unified_shipments has dest_city + dest_state but NO
-- origin_city / origin_state. Origin granularity stays at country until the
-- upstream source feeds city-level origin data. This is a known source-data
-- gap; the RPC signature surfaces NULLs for origin_city/origin_state so the
-- frontend can render "—, — CN → Long Beach, CA US" gracefully.
-- ---------------------------------------------------------------------------
-- DROP first: return type changed (added origin_city/state/destination_city/state).
-- CREATE OR REPLACE can't change OUT parameter shape.
DROP FUNCTION IF EXISTS public.lit_lane_carrier_mix(text);
CREATE FUNCTION public.lit_lane_carrier_mix(p_company_name text)
RETURNS TABLE (
  origin_city text,
  origin_state text,
  origin_country text,
  destination_city text,
  destination_state text,
  destination_country text,
  carrier text,
  shipment_count bigint,
  share_pct numeric
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lanes AS (
    SELECT
      NULL::text AS origin_city,        -- source data gap: no origin_city in lit_unified_shipments
      NULL::text AS origin_state,       -- source data gap: no origin_state in lit_unified_shipments
      origin_country,
      dest_city AS destination_city,
      dest_state AS destination_state,
      destination_country,
      carrier_name AS carrier,
      COUNT(*)::bigint AS n
    FROM public.lit_unified_shipments
    WHERE consignee_name ILIKE '%' || p_company_name || '%'
    GROUP BY 1, 2, 3, 4, 5, 6, 7
  )
  SELECT
    origin_city,
    origin_state,
    origin_country,
    destination_city,
    destination_state,
    destination_country,
    carrier,
    n AS shipment_count,
    ROUND(
      100.0 * n
      / NULLIF(
          SUM(n) OVER (
            PARTITION BY origin_country, destination_city, destination_state, destination_country
          ), 0
        ),
      1
    ) AS share_pct
  FROM lanes
  ORDER BY origin_country, destination_country, destination_city, n DESC;
$$;
GRANT EXECUTE ON FUNCTION public.lit_lane_carrier_mix(text) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. RPC: lit_lane_yoy_trend  — sliding 12-month windows + city/state (Gap 4 + NEW)
--
-- Replaces hardcoded period_2024 / period_2025 / period_2026 columns with
-- trailing/prior/prior-prior 12-month windows anchored to now(). Same
-- city/state caveat as lit_lane_carrier_mix: origin is country-only.
-- ---------------------------------------------------------------------------
-- DROP first: return type changed (sliding-window columns + city/state).
DROP FUNCTION IF EXISTS public.lit_lane_yoy_trend(text);
CREATE FUNCTION public.lit_lane_yoy_trend(p_company_name text)
RETURNS TABLE (
  origin_city text,
  origin_state text,
  origin_country text,
  destination_city text,
  destination_state text,
  destination_country text,
  trailing_12m bigint,
  prior_12m bigint,
  prior_prior_12m bigint,
  yoy_pct numeric
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lanes AS (
    SELECT
      NULL::text AS origin_city,        -- source data gap (see lit_lane_carrier_mix)
      NULL::text AS origin_state,
      origin_country,
      dest_city AS destination_city,
      dest_state AS destination_state,
      destination_country,
      COUNT(*) FILTER (
        WHERE bol_date > (now() - interval '12 months')
      )::bigint AS trailing_12m,
      COUNT(*) FILTER (
        WHERE bol_date BETWEEN (now() - interval '24 months')
                          AND (now() - interval '12 months')
      )::bigint AS prior_12m,
      COUNT(*) FILTER (
        WHERE bol_date BETWEEN (now() - interval '36 months')
                          AND (now() - interval '24 months')
      )::bigint AS prior_prior_12m
    FROM public.lit_unified_shipments
    WHERE consignee_name ILIKE '%' || p_company_name || '%'
      AND bol_date IS NOT NULL
    GROUP BY 1, 2, 3, 4, 5, 6
  )
  SELECT
    origin_city,
    origin_state,
    origin_country,
    destination_city,
    destination_state,
    destination_country,
    trailing_12m,
    prior_12m,
    prior_prior_12m,
    CASE
      WHEN prior_12m > 0
        THEN ROUND(100.0 * (trailing_12m - prior_12m) / prior_12m, 1)
      ELSE NULL
    END AS yoy_pct
  FROM lanes
  ORDER BY trailing_12m DESC;
$$;
GRANT EXECUTE ON FUNCTION public.lit_lane_yoy_trend(text) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 6. RPC: lit_get_database_freshness  (Gap 5)
--
-- Reads the cached IY /database-updated response from lit_internal_meta and
-- returns a flattened view the UI can render directly. Returns nulls (not an
-- error) when the cache is empty so the badge can show "—".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lit_get_database_freshness()
RETURNS TABLE (
  last_updated timestamptz,
  age_days integer,
  fetched_at timestamptz
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NULLIF(meta_value->>'last_updated', '')::timestamptz AS last_updated,
    CASE
      WHEN meta_value->>'last_updated' IS NULL THEN NULL
      ELSE EXTRACT(DAY FROM (now() - (meta_value->>'last_updated')::timestamptz))::integer
    END AS age_days,
    updated_at AS fetched_at
  FROM public.lit_internal_meta
  WHERE meta_key = 'importyeti_database_updated'
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.lit_get_database_freshness() TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 7. RPC: lit_get_pq_credits_summary  (Gap 5 — credits gauge)
--
-- Aggregates the last 30 days of credit-burning rows from lit_credit_ledger
-- (action='importyeti_powerquery_sync') plus the last sync's response (cached
-- in lit_internal_meta under 'importyeti_credits_remaining'). Used by the
-- admin Enrichment Providers panel.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lit_get_pq_credits_summary()
RETURNS TABLE (
  credits_remaining integer,
  credits_burned_30d integer,
  last_sync_at timestamptz
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH meta AS (
    SELECT
      NULLIF(meta_value->>'credits_remaining', '')::integer AS credits_remaining,
      updated_at
    FROM public.lit_internal_meta
    WHERE meta_key = 'importyeti_credits_remaining'
    LIMIT 1
  ),
  burn AS (
    SELECT COALESCE(SUM(credits), 0)::integer AS burned
    FROM public.lit_credit_ledger
    WHERE action = 'importyeti_powerquery_sync'
      AND created_at > now() - interval '30 days'
  )
  SELECT
    (SELECT credits_remaining FROM meta),
    (SELECT burned FROM burn),
    (SELECT updated_at FROM meta);
$$;
GRANT EXECUTE ON FUNCTION public.lit_get_pq_credits_summary() TO authenticated, anon;

COMMENT ON FUNCTION public.lit_get_pq_credits_summary() IS
  'PowerQuery credits gauge: live creditsRemaining (from latest iy-powerquery-sync response cached in lit_internal_meta) + 30-day burn (summed from lit_credit_ledger). Authenticated-readable; admin UI clients filter to platform_admins.';
