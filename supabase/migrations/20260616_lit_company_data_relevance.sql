-- lit_company_data_relevance(p_company_name)
--
-- Returns a single row with four EXISTS booleans + one count, used by the
-- frontend useCompanyDataRelevance() hook to decide which Premium Intel cards
-- to render for a given company. Cards hide for regular users when their
-- backing data source is empty; platform admins still see actionable
-- "Sync from ImportYeti" buttons (via the AdminRunSyncButton component) so
-- they can trigger enrichment. The visibility logic lives in the cards; this
-- RPC is just the data lookup.
--
-- SECURITY DEFINER so anon/authenticated can call regardless of per-table
-- RLS — the function returns aggregate booleans only, no row-level data.

CREATE OR REPLACE FUNCTION public.lit_company_data_relevance(p_company_name text)
RETURNS TABLE (
  has_unified_shipments boolean,
  has_mx_imports boolean,
  has_us_exports boolean,
  has_pq_suppliers boolean,
  unified_shipment_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS(SELECT 1 FROM public.lit_unified_shipments
           WHERE consignee_name ILIKE '%' || p_company_name || '%' LIMIT 1) AS has_unified_shipments,
    EXISTS(SELECT 1 FROM public.lit_mx_import_declarations
           WHERE importer_name ILIKE '%' || p_company_name || '%' LIMIT 1) AS has_mx_imports,
    EXISTS(SELECT 1 FROM public.lit_us_export_bols
           WHERE shipper_name ILIKE '%' || p_company_name || '%' LIMIT 1) AS has_us_exports,
    EXISTS(SELECT 1 FROM public.lit_pq_supplier_aggregates
           WHERE buyer_company_name ILIKE '%' || p_company_name || '%' LIMIT 1) AS has_pq_suppliers,
    COALESCE((SELECT COUNT(*) FROM public.lit_unified_shipments
              WHERE consignee_name ILIKE '%' || p_company_name || '%'), 0)::bigint AS unified_shipment_count;
$$;

GRANT EXECUTE ON FUNCTION public.lit_company_data_relevance(text) TO authenticated, anon;
