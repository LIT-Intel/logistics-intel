-- Picks the oldest stale snapshots that ALSO belong to active saves.
-- Fixes the pulse-refresh-tick bug where the picker selected stalest
-- snapshots without joining to lit_saved_companies first — orphan
-- snapshots from search-page browsing sorted to the top, filled all
-- 20 slots, then got filtered out as non-active. Result: 0 saved
-- companies refreshed for 14 straight days.
--
-- DISTINCT ON dedupes the case where multiple users saved the same
-- company. SECURITY DEFINER so the cron-invoked edge fn can call it
-- against tables it doesn't have direct SELECT on.

CREATE OR REPLACE FUNCTION public.pick_stale_saved_snapshots(p_limit int, p_ttl_hours int)
RETURNS TABLE(source_company_key text, snapshot_updated_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (sc.source_company_key)
         sc.source_company_key,
         s.updated_at AS snapshot_updated_at
    FROM lit_saved_companies sc
    INNER JOIN lit_importyeti_company_snapshot s
            ON s.company_id = sc.source_company_key
   WHERE sc.refresh_status = 'active'
     AND sc.source_company_key IS NOT NULL
     AND s.updated_at < (now() - (p_ttl_hours || ' hours')::interval)
   ORDER BY sc.source_company_key, s.updated_at ASC
   LIMIT p_limit;
$function$;
