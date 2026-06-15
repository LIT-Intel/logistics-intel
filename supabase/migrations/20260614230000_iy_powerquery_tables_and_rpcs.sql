-- IY-3: ImportYeti PowerQuery backend integration
-- New tables for MX import/export declarations, US export BOLs, brokers dim.
-- Adds transport_mode classifier to lit_unified_shipments + backfill.
-- Adds lit_lane_carrier_mix + lit_lane_yoy_trend RPCs.
--
-- Applied via Supabase MCP on 2026-06-15. Mirrored here so the auto-deploy
-- workflow's `supabase db push` treats it as already-applied (idempotent).

-- ---------------------------------------------------------------------------
-- 1. MX import declarations (truck/rail/air via mx-import PowerQuery)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lit_mx_import_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_id text UNIQUE NOT NULL,
  declaration_date date,
  importer_name text,
  importer_rfc text,
  supplier_name text,
  supplier_country text,
  customs_broker_name text,
  customs_broker_id text,
  customs_office text,
  transport_type text,
  hs_code text,
  product_description text,
  value_usd numeric,
  weight_kg numeric,
  origin_country text,
  raw_payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lit_mx_import_decl_importer_name
  ON public.lit_mx_import_declarations (importer_name);
CREATE INDEX IF NOT EXISTS lit_mx_import_decl_date
  ON public.lit_mx_import_declarations (declaration_date DESC);
CREATE INDEX IF NOT EXISTS lit_mx_import_decl_transport
  ON public.lit_mx_import_declarations (transport_type);
CREATE INDEX IF NOT EXISTS lit_mx_import_decl_broker
  ON public.lit_mx_import_declarations (customs_broker_name);

ALTER TABLE public.lit_mx_import_declarations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lit_mx_import_decl_read ON public.lit_mx_import_declarations;
CREATE POLICY lit_mx_import_decl_read
  ON public.lit_mx_import_declarations
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 2. MX export declarations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lit_mx_export_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_id text UNIQUE NOT NULL,
  declaration_date date,
  exporter_name text,
  exporter_rfc text,
  consignee_name text,
  consignee_country text,
  customs_broker_name text,
  customs_broker_id text,
  customs_office text,
  transport_type text,
  hs_code text,
  product_description text,
  value_usd numeric,
  weight_kg numeric,
  destination_country text,
  raw_payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lit_mx_export_decl_exporter_name
  ON public.lit_mx_export_declarations (exporter_name);
CREATE INDEX IF NOT EXISTS lit_mx_export_decl_date
  ON public.lit_mx_export_declarations (declaration_date DESC);
CREATE INDEX IF NOT EXISTS lit_mx_export_decl_transport
  ON public.lit_mx_export_declarations (transport_type);
CREATE INDEX IF NOT EXISTS lit_mx_export_decl_broker
  ON public.lit_mx_export_declarations (customs_broker_name);

ALTER TABLE public.lit_mx_export_declarations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lit_mx_export_decl_read ON public.lit_mx_export_declarations;
CREATE POLICY lit_mx_export_decl_read
  ON public.lit_mx_export_declarations
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 3. US export BOLs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lit_us_export_bols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bol_number text UNIQUE NOT NULL,
  shipper_name text,
  consignee_name text,
  consignee_country text,
  carrier text,
  vessel text,
  origin_port text,
  destination_port text,
  hs_code text,
  product_description text,
  teu numeric,
  weight_kg numeric,
  shipment_date date,
  raw_payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lit_us_export_bols_shipper
  ON public.lit_us_export_bols (shipper_name);
CREATE INDEX IF NOT EXISTS lit_us_export_bols_consignee
  ON public.lit_us_export_bols (consignee_name);
CREATE INDEX IF NOT EXISTS lit_us_export_bols_date
  ON public.lit_us_export_bols (shipment_date DESC);
CREATE INDEX IF NOT EXISTS lit_us_export_bols_dest_country
  ON public.lit_us_export_bols (consignee_country);

ALTER TABLE public.lit_us_export_bols ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lit_us_export_bols_read ON public.lit_us_export_bols;
CREATE POLICY lit_us_export_bols_read
  ON public.lit_us_export_bols
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 4. Brokers dim
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lit_customs_brokers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  broker_name text NOT NULL,
  broker_id text,
  declaration_count integer DEFAULT 0,
  raw_payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lit_customs_brokers_uniq UNIQUE (source, broker_id, broker_name)
);
CREATE INDEX IF NOT EXISTS lit_customs_brokers_name
  ON public.lit_customs_brokers (broker_name);
CREATE INDEX IF NOT EXISTS lit_customs_brokers_source
  ON public.lit_customs_brokers (source);

ALTER TABLE public.lit_customs_brokers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lit_customs_brokers_read ON public.lit_customs_brokers;
CREATE POLICY lit_customs_brokers_read
  ON public.lit_customs_brokers
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 5. transport_mode classifier on lit_unified_shipments + backfill
-- ---------------------------------------------------------------------------
ALTER TABLE public.lit_unified_shipments
  ADD COLUMN IF NOT EXISTS transport_mode text;

COMMENT ON COLUMN public.lit_unified_shipments.transport_mode IS
  'Ocean / Air / Truck / Rail / Transborder / Drayage. Backfilled from load_type + origin_country (MX/CA origins with no ocean carrier => Transborder).';

CREATE INDEX IF NOT EXISTS lit_unified_shipments_transport_mode
  ON public.lit_unified_shipments (transport_mode);

UPDATE public.lit_unified_shipments
SET transport_mode = CASE
  WHEN origin_country IN ('MX','CA','Mexico','Canada')
       AND carrier_name IS NULL THEN 'Transborder'
  WHEN load_type IN ('FCL','LCL') THEN 'Ocean'
  ELSE 'Ocean'
END
WHERE transport_mode IS NULL;

-- ---------------------------------------------------------------------------
-- 6. RPC: lit_lane_carrier_mix(p_company_name text)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lit_lane_carrier_mix(p_company_name text)
RETURNS TABLE (
  origin_country text,
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
      origin_country,
      destination_country,
      carrier_name AS carrier,
      COUNT(*)::bigint AS n
    FROM public.lit_unified_shipments
    WHERE consignee_name ILIKE '%' || p_company_name || '%'
    GROUP BY 1, 2, 3
  )
  SELECT
    origin_country,
    destination_country,
    carrier,
    n AS shipment_count,
    ROUND(
      100.0 * n
      / NULLIF(SUM(n) OVER (PARTITION BY origin_country, destination_country), 0)
    , 1) AS share_pct
  FROM lanes
  ORDER BY origin_country, destination_country, n DESC;
$$;
GRANT EXECUTE ON FUNCTION public.lit_lane_carrier_mix(text) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 7. RPC: lit_lane_yoy_trend(p_company_name text)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lit_lane_yoy_trend(p_company_name text)
RETURNS TABLE (
  origin_country text,
  destination_country text,
  period_2024 bigint,
  period_2025 bigint,
  period_2026 bigint,
  yoy_pct numeric
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lanes AS (
    SELECT
      origin_country,
      destination_country,
      EXTRACT(YEAR FROM bol_date)::int AS yr
    FROM public.lit_unified_shipments
    WHERE consignee_name ILIKE '%' || p_company_name || '%'
      AND bol_date IS NOT NULL
  ),
  rollup AS (
    SELECT
      origin_country,
      destination_country,
      COUNT(*) FILTER (WHERE yr = 2024)::bigint AS period_2024,
      COUNT(*) FILTER (WHERE yr = 2025)::bigint AS period_2025,
      COUNT(*) FILTER (WHERE yr = 2026)::bigint AS period_2026
    FROM lanes
    GROUP BY 1, 2
  )
  SELECT
    origin_country,
    destination_country,
    period_2024,
    period_2025,
    period_2026,
    CASE
      WHEN period_2025 = 0 THEN NULL
      ELSE ROUND(100.0 * (period_2026 - period_2025) / period_2025, 1)
    END AS yoy_pct
  FROM rollup
  ORDER BY (period_2024 + period_2025 + period_2026) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.lit_lane_yoy_trend(text) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 8. Operator comments
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.lit_mx_import_declarations IS
  'ImportYeti PowerQuery mx-import: MX customs import declarations (truck/rail/air/sea). Written by iy-powerquery-sync edge fn.';
COMMENT ON TABLE public.lit_mx_export_declarations IS
  'ImportYeti PowerQuery mx-export: MX customs export declarations. Written by iy-powerquery-sync edge fn.';
COMMENT ON TABLE public.lit_us_export_bols IS
  'ImportYeti PowerQuery us-export: US export bills of lading. Mirror of lit_unified_shipments (imports). Written by iy-powerquery-sync edge fn.';
COMMENT ON TABLE public.lit_customs_brokers IS
  'Aggregated MX customs brokers dim from IY PowerQuery brokers endpoints. Source=mx-import|mx-export.';
