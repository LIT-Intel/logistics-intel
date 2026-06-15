-- IY-3.1: domestic inland-leg RPC for the Premium Intel "Domestic transportation" card.
--
-- For each US import consignee, aggregate the (entry port -> destination city)
-- inland legs and infer the likely mode from inland miles. Distance is sourced
-- from lit_drayage_estimates.miles (joined on bol_number+destination_city);
-- when no estimate exists, miles are NULL and est_mode falls back to 'Truck'
-- (the default short-haul assumption). Mode thresholds:
--   <500mi  -> Truck
--   500-1500mi -> Intermodal
--   >1500mi -> Rail
--
-- Note column naming: the spec referenced entry_port / destination_city, but
-- the live schema uses destination_port (= port of unloading for US imports)
-- and dest_city / dest_state on lit_unified_shipments, and destination_city /
-- destination_state / miles on lit_drayage_estimates. This RPC bridges that
-- naming so the frontend gets the spec's contract.
--
-- Applied via Supabase MCP on 2026-06-15. Mirrored here so the auto-deploy
-- workflow's `supabase db push` treats it as already-applied (idempotent).

CREATE OR REPLACE FUNCTION public.lit_domestic_inland_leg(p_company_name text)
RETURNS TABLE (
  entry_port text,
  destination_city text,
  destination_state text,
  shipment_count bigint,
  approx_inland_miles numeric,
  est_mode text
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH legs AS (
    SELECT
      s.destination_port AS entry_port,
      s.dest_city        AS destination_city,
      s.dest_state       AS destination_state,
      AVG(e.miles)       AS avg_miles,
      COUNT(*)::bigint   AS n
    FROM public.lit_unified_shipments s
    LEFT JOIN public.lit_drayage_estimates e
      ON e.bol_number = s.bol_number
     AND COALESCE(e.destination_city, '')  = COALESCE(s.dest_city, '')
     AND COALESCE(e.destination_state, '') = COALESCE(s.dest_state, '')
    WHERE s.consignee_name ILIKE '%' || p_company_name || '%'
      AND s.destination_port IS NOT NULL
      AND s.dest_city IS NOT NULL
      AND COALESCE(s.destination_country_code, 'US') = 'US'
    GROUP BY 1, 2, 3
  )
  SELECT
    entry_port,
    destination_city,
    destination_state,
    n AS shipment_count,
    ROUND(avg_miles::numeric, 1) AS approx_inland_miles,
    CASE
      WHEN avg_miles IS NULL THEN 'Truck'
      WHEN avg_miles < 500   THEN 'Truck'
      WHEN avg_miles < 1500  THEN 'Intermodal'
      ELSE                        'Rail'
    END AS est_mode
  FROM legs
  ORDER BY n DESC;
$$;

GRANT EXECUTE ON FUNCTION public.lit_domestic_inland_leg(text) TO authenticated, anon;

COMMENT ON FUNCTION public.lit_domestic_inland_leg(text) IS
  'Per-consignee inland-leg rollup: entry port -> destination city, with average inland miles (from lit_drayage_estimates) and an inferred mode (Truck/Intermodal/Rail) based on the <500/500-1500/>1500 mile thresholds. Powers the Premium Intel "Domestic transportation" card.';
