/**
 * Geo place-centroid API — reads `lit_geo_place_centroids`, the seeded
 * city/region centroid table that fixes the trade-lane map's endpoint
 * accuracy (dots used to sit on COUNTRY centroids from
 * `@/lib/laneGlobe.COUNTRY_COORDS`, so every "→ Atlanta, GA" lane landed
 * near the geographic center of the US).
 *
 * Table contract (built by the geocode seeding job, may be EMPTY while it
 * backfills — consumers must degrade to the country-centroid behavior):
 *   place_key text PK — lower-cased lookup key:
 *     origins:  `lower(city)|lower(country)`     e.g. "hangzhou shi|china"
 *     US dests: `lower(city)|lower(state_code)`  e.g. "atlanta|ga"
 *   lat/lng double precision — NULL when precision='failed'
 *   precision text — 'city' | 'region' | 'failed'
 *
 * RLS: authenticated SELECT — safe to query directly from the frontend.
 *
 * Only rows with non-null coords and precision in ('city','region') are
 * returned; 'failed' rows are treated exactly like missing keys so a
 * failed geocode can never move a dot to a wrong place.
 *
 * Lives under frontend/src/api/ per CLAUDE.md — new domain code must NOT
 * be added to frontend/src/lib/api.ts.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Coordinates don't move — cache aggressively. */
const ONE_DAY = 24 * 60 * 60 * 1000;

/** PostgREST `.in()` chunk size — keeps the query-string length sane. */
const IN_CHUNK = 200;

export type PlaceCentroid = {
  lat: number;
  lng: number;
  precision: "city" | "region";
};

/**
 * Build a `lower(a)|lower(b)` place key. Returns null when either part is
 * blank so callers can `filter(Boolean)` candidate lists.
 */
export function makePlaceKey(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  const left = String(a ?? "").trim().toLowerCase();
  const right = String(b ?? "").trim().toLowerCase();
  if (!left || !right) return null;
  return `${left}|${right}`;
}

/**
 * Resolve a set of place_keys to city/region-precision centroids.
 *
 * Returns a Map<place_key, PlaceCentroid> containing ONLY the keys that
 * exist with usable coordinates — missing keys and precision='failed'
 * rows are simply absent, so callers fall back to their current
 * (country-centroid) behavior. Disabled (resolves an empty Map) when the
 * key list is empty; errors degrade to whatever was already fetched.
 */
export function usePlaceCentroids(
  keys: string[],
): UseQueryResult<Map<string, PlaceCentroid>> {
  // Sorted + deduped so the queryKey is stable regardless of caller order.
  const keyList = Array.from(
    new Set((keys ?? []).map((k) => String(k ?? "").trim().toLowerCase()).filter(Boolean)),
  ).sort();

  return useQuery({
    queryKey: ["geo-place-centroids", keyList.join(";")],
    enabled: keyList.length > 0,
    staleTime: ONE_DAY,
    gcTime: ONE_DAY,
    queryFn: async (): Promise<Map<string, PlaceCentroid>> => {
      const out = new Map<string, PlaceCentroid>();
      for (let i = 0; i < keyList.length; i += IN_CHUNK) {
        const chunk = keyList.slice(i, i + IN_CHUNK);
        const { data, error } = await supabase
          .from("lit_geo_place_centroids")
          .select("place_key, lat, lng, precision")
          .in("place_key", chunk);
        if (error) {
          // Table not deployed / transient failure — degrade to country
          // centroids rather than throwing (the map must always render).
          console.warn(
            "[geoCentroids] lit_geo_place_centroids query failed:",
            error.message,
          );
          continue;
        }
        for (const r of (data ?? []) as any[]) {
          const precision = String(r?.precision ?? "");
          if (precision !== "city" && precision !== "region") continue;
          const lat = Number(r?.lat);
          const lng = Number(r?.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          out.set(String(r.place_key), { lat, lng, precision });
        }
      }
      return out;
    },
  });
}
