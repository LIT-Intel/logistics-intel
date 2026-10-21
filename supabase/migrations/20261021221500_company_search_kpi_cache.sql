-- Issue #154: fast search KPI read path.
-- Applied to production 2026-10-21 as two Supabase MCP migrations:
-- cache_expensive_company_search_kpis; serve_company_search_from_indexed_kpi_cache.
-- This idempotent repository counterpart ensures reproducible environments.
-- Important: cached KPI fields may lag the source view by up to one refresh interval.
-- Source: lit_company_search_kpis (historical shipment JSON analytics).
-- Authentication: same view contract; cache SELECT only for authenticated (not anon).
-- Existing exposed view remains security_invoker.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.lit_company_search_kpis_cached AS
SELECT * FROM public.lit_company_search_kpis WITH DATA;
CREATE UNIQUE INDEX IF NOT EXISTS lit_company_search_kpis_cached_pk
ON public.lit_company_search_kpis_cached (company_id);
REVOKE ALL ON public.lit_company_search_kpis_cached FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lit_company_search_kpis_cached TO authenticated;
CREATE OR REPLACE VIEW public.lit_company_search_results
WITH (security_invoker = true) AS
SELECT
  i.company_id,
  COALESCE(k.company_name, i.company_name) AS company_name,
  COALESCE(k.country, i.country) AS country,
  i.city,
  COALESCE(k.last_shipment_date, i.last_shipment_date) AS last_shipment_date,
  COALESCE(k.total_shipments::integer, i.total_shipments) AS total_shipments,
  COALESCE(k.all_time_teu_from_series, i.total_teu) AS total_teu,
  k.latest_year,
  k.latest_year_shipments,
  k.latest_year_teu,
  k.top_container_length,
  k.top_container_count,
  k.top_container_shipments,
  k.top_container_teu,
  k.fcl_shipments,
  k.fcl_shipments_perc,
  k.lcl_shipments,
  k.lcl_shipments_perc,
  k.website,
  k.country_code,
  GREATEST(i.updated_at, COALESCE(k.updated_at, i.updated_at)) AS updated_at
FROM public.lit_company_index i
LEFT JOIN public.lit_company_search_kpis_cached k USING (company_id);
SELECT cron.schedule(
  'lit-company-search-kpis-refresh',
  '*/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.lit_company_search_kpis_cached'
);
-- Rollback (manually, if needed): replace the view with the same SELECT above
-- but LEFT JOIN public.lit_company_search_kpis k USING (company_id).
-- Then SELECT cron.unschedule('lit-company-search-kpis-refresh');
-- Keep the cached MV until downstream references are confirmed absent.
