-- Picker RPC v2: wrap DISTINCT ON in a subquery so the outer LIMIT
-- picks the globally oldest stale saves, not the alphabetically-first
-- ones. v1 forced ORDER BY source_company_key (DISTINCT ON requires
-- its leftmost ORDER BY column to match the dedupe expression), which
-- meant the daily batch processed alphabetically (3D Systems, ABB,
-- Adidas...) instead of oldest-first. Real saves like EAE and LG
-- got starved at the back of the alphabet.
--
-- Outer re-sort by snapshot_updated_at ASC restores the design
-- intent: oldest stale saved companies refresh first.

CREATE OR REPLACE FUNCTION public.pick_stale_saved_snapshots(p_limit int, p_ttl_hours int)
RETURNS TABLE(source_company_key text, snapshot_updated_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT source_company_key, snapshot_updated_at
    FROM (
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
    ) deduped
   ORDER BY snapshot_updated_at ASC
   LIMIT p_limit;
$function$;
