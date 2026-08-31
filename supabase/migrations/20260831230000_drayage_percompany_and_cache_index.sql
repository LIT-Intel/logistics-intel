-- Drayage on-demand (CDP "Compute now") + distance-cache integrity.
--
-- Context: the pulse-drayage-recompute edge fn was cron-only (403 on the
-- browser "Compute now" button) and ignored the company key. The fn now
-- supports dual-auth (internal cron OR an authenticated user) + per-company
-- recompute, real Nominatim city geocoding (cached in lit_geo_place_centroids),
-- and its distance-cache upserts finally work thanks to the unique index below
-- (previously silently failing -> cache stayed empty, re-hitting OSRM every run).
--
-- This migration adds the SQL objects those code paths depend on. The edge fn
-- itself is deployed via MCP (CI edge deploy is unreliable — see CLAUDE.md).

-- Per-company unestimated-BOL source for the on-demand button. Mirrors
-- get_unestimated_us_bols but scoped to one company_id.
create or replace function public.get_unestimated_us_bols_for_company(
  p_company_id text,
  p_limit integer default 600
)
returns table(
  id uuid, bol_number text, company_id text, destination_port text,
  destination_country_code text, dest_city text, dest_state text,
  container_count integer, load_type text, lcl boolean
)
language sql
security definer
set search_path to 'public'
as $function$
  select s.id, s.bol_number, s.company_id, s.destination_port, s.destination_country_code,
         s.dest_city, s.dest_state, s.container_count, s.load_type, s.lcl
  from public.lit_unified_shipments s
  where s.company_id = p_company_id
    and s.destination_country_code = 'US'
    and s.dest_city is not null
    and s.bol_number is not null
    and not exists (
      select 1 from public.lit_drayage_estimates e
      where e.bol_number = s.bol_number
        and coalesce(e.destination_city, '') = coalesce(s.dest_city, '')
        and coalesce(e.destination_state, '') = coalesce(s.dest_state, '')
    )
  order by s.id
  limit p_limit;
$function$;

grant execute on function public.get_unestimated_us_bols_for_company(text, integer)
  to authenticated, service_role, anon;

-- Distance-cache upserts use onConflict(pod_unloc,dest_city_norm,dest_state);
-- without this unique index the upserts errored silently and the cache never
-- populated (every run re-resolved distance via OSRM).
create unique index if not exists lit_drayage_distance_cache_key
  on public.lit_drayage_distance_cache (pod_unloc, dest_city_norm, dest_state);
