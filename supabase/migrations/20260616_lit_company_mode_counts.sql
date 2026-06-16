-- 20260616_lit_company_mode_counts.sql
--
-- Per-mode shipment counts for a single company across all three shipment
-- sources. Powers the Supply Chain tab's ServiceModeFilterChips: chips
-- for modes with zero count render disabled / non-interactive / tooltip
-- explains why. Prevents the dead-click bug where every mode chip
-- appeared clickable regardless of whether the viewed company had any
-- shipments in that mode.
--
-- Sources rolled up:
--   - lit_unified_shipments         -> ocean
--   - lit_mx_import_declarations    -> air / truck / rail / broker
--   - lit_unified_shipments (inland leg) -> drayage / domestic
--
-- Both drayage and domestic come from the same inland-leg slice (any
-- US-destination row that has a destination city — i.e. there's an
-- inland leg between port of entry and the consignee city). Drayage =
-- the port pull, Domestic Transportation = the full inland trip; both
-- exist whenever there's an inland leg.

CREATE OR REPLACE FUNCTION public.lit_company_mode_counts(p_company_name text)
RETURNS TABLE (
  ocean bigint,
  air bigint,
  truck bigint,
  rail bigint,
  drayage bigint,
  broker bigint,
  domestic bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH
    unified AS (
      SELECT transport_mode FROM public.lit_unified_shipments
      WHERE consignee_name ILIKE '%' || p_company_name || '%'
    ),
    mx AS (
      SELECT transport_type FROM public.lit_mx_import_declarations
      WHERE importer_name ILIKE '%' || p_company_name || '%'
    ),
    brokers AS (
      SELECT 1 FROM public.lit_mx_import_declarations
      WHERE importer_name ILIKE '%' || p_company_name || '%'
        AND customs_broker_name IS NOT NULL
    ),
    drayage_legs AS (
      -- US destinations with a dest_city present = an inland leg exists.
      -- This drives both "Drayage" (port pull) and "Domestic
      -- Transportation" (the inland trip itself).
      SELECT 1 FROM public.lit_unified_shipments
      WHERE consignee_name ILIKE '%' || p_company_name || '%'
        AND dest_city IS NOT NULL
        AND destination_country ILIKE '%united states%'
    )
  SELECT
    (SELECT COUNT(*) FROM unified WHERE COALESCE(transport_mode, 'Ocean') ILIKE 'ocean')::bigint AS ocean,
    (SELECT COUNT(*) FROM mx WHERE transport_type ILIKE '%air%')::bigint AS air,
    (SELECT COUNT(*) FROM mx WHERE transport_type ILIKE '%truck%' OR transport_type ILIKE '%camion%')::bigint AS truck,
    (SELECT COUNT(*) FROM mx WHERE transport_type ILIKE '%rail%' OR transport_type ILIKE '%ferrocarril%')::bigint AS rail,
    (SELECT COUNT(*) FROM drayage_legs)::bigint AS drayage,
    (SELECT COUNT(*) FROM brokers)::bigint AS broker,
    (SELECT COUNT(*) FROM drayage_legs)::bigint AS domestic;
$$;

GRANT EXECUTE ON FUNCTION public.lit_company_mode_counts(text) TO authenticated, anon;
