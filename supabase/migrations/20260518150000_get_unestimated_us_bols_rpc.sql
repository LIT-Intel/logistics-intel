-- RPC: get_unestimated_us_bols(p_limit int) — returns US BOLs that don't
-- yet have a row in lit_drayage_estimates, ordered by id ASC. Powers the
-- pulse-drayage-recompute function's pagination.
--
-- Background: the function previously fetched via PostgREST with .limit()
-- but no .order() and no cursor, so it kept re-fetching the same first
-- ~1000 rows. 6,500+ BOLs were structurally unreachable, capping coverage
-- at ~13.5%. This RPC does a proper NOT EXISTS anti-join so each
-- invocation naturally moves forward through the unprocessed set.

CREATE OR REPLACE FUNCTION public.get_unestimated_us_bols(p_limit integer DEFAULT 1200)
RETURNS TABLE(
  id uuid,
  bol_number text,
  company_id text,
  destination_port text,
  destination_country_code text,
  dest_city text,
  dest_state text,
  container_count integer,
  load_type text,
  lcl boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    s.id,
    s.bol_number,
    s.company_id,
    s.destination_port,
    s.destination_country_code,
    s.dest_city,
    s.dest_state,
    s.container_count,
    s.load_type,
    s.lcl
  FROM public.lit_unified_shipments s
  WHERE s.destination_country_code = 'US'
    AND s.dest_city IS NOT NULL
    AND s.bol_number IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.lit_drayage_estimates e
      WHERE e.bol_number = s.bol_number
        AND COALESCE(e.destination_city, '') = COALESCE(s.dest_city, '')
        AND COALESCE(e.destination_state, '') = COALESCE(s.dest_state, '')
    )
  ORDER BY s.id
  LIMIT p_limit;
$function$;
