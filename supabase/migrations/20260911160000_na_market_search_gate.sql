-- SECURITY FIX: the NA cross-border market dataset was readable by ANY
-- authenticated user (demo/trial included). Owner rule: Mexico data requires a
-- paid plan AND the Mexico Trade Intelligence add-on. Gate is server-side:
-- the RPC raises 'mx_addon_required' and the tables lose their permissive
-- SELECT policies (all reads flow through the gated SECURITY DEFINER RPC).

DROP POLICY IF EXISTS nais_read ON public.lit_na_import_shipments;
DROP POLICY IF EXISTS naic_read ON public.lit_na_import_companies;

CREATE OR REPLACE FUNCTION public.lit_na_market_access_ok()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = auth.uid())
      OR (
        EXISTS (
          SELECT 1 FROM org_members om
          JOIN subscriptions s ON s.organization_id = om.org_id
          WHERE om.user_id = auth.uid()
            AND s.status IN ('active','trialing','past_due')
        )
        AND public.lit_org_has_addon('mx_trade')
      );
$$;

CREATE OR REPLACE FUNCTION public.lit_na_market_search(
  p_origin text DEFAULT 'Mexico', p_states text[] DEFAULT NULL,
  p_hs text[] DEFAULT NULL, p_industry text DEFAULT NULL,
  p_q text DEFAULT NULL, p_min_shipments int DEFAULT 0, p_limit int DEFAULT 300
)
RETURNS TABLE (
  consignee_norm text, name text, city text, state text, zip text,
  website text, industry text, mx_shipments integer, ca_shipments integer,
  total_shipments integer, total_teu numeric, total_value_usd numeric,
  first_arrival date, last_arrival date, top_hs_chapter text, hs_label text,
  top_lading_port text, top_unlading_port text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.lit_na_market_access_ok() THEN
    RAISE EXCEPTION 'mx_addon_required';
  END IF;
  RETURN QUERY
  SELECT c.consignee_norm, c.name, c.city, c.state, c.zip, c.website, c.industry,
         c.mx_shipments, c.ca_shipments, c.total_shipments, c.total_teu,
         c.total_value_usd, c.first_arrival, c.last_arrival, c.top_hs_chapter,
         h.label AS hs_label, c.top_lading_port, c.top_unlading_port
  FROM lit_na_import_companies c
  LEFT JOIN lit_hs_chapters h ON h.chapter = c.top_hs_chapter
  WHERE (p_origin IS NULL OR (p_origin = 'Mexico' AND c.mx_shipments > 0)
         OR (p_origin = 'Canada' AND c.ca_shipments > 0))
    AND (p_states IS NULL OR c.state = ANY(p_states))
    AND (p_hs IS NULL OR c.top_hs_chapter = ANY(p_hs) OR EXISTS (
          SELECT 1 FROM lit_na_import_shipments s2
          WHERE s2.consignee_norm = c.consignee_norm AND s2.hs_chapter = ANY(p_hs)))
    AND (p_industry IS NULL OR c.industry ILIKE '%' || p_industry || '%')
    AND (p_q IS NULL OR c.name ILIKE '%' || p_q || '%' OR EXISTS (
          SELECT 1 FROM lit_na_import_shipments s3
          WHERE s3.consignee_norm = c.consignee_norm AND s3.goods ILIKE '%' || p_q || '%'))
    AND c.total_shipments >= COALESCE(p_min_shipments, 0)
  ORDER BY c.total_shipments DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000);
END;
$$;
GRANT EXECUTE ON FUNCTION public.lit_na_market_search TO authenticated;
