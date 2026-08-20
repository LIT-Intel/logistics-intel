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
 *   precision text — 'city' | 'region' | 'country' | 'failed'
 *
 * RLS: authenticated SELECT — safe to query directly from the frontend.
 *
 * Only rows with non-null coords and precision 'city' or 'region' are
 * returned. 'failed' and 'country' rows are treated exactly like missing
 * keys (a country-precision row must never masquerade as a city dot —
 * callers already have their own country-centroid fallback). 'region'
 * rows are returned WITH their precision so callers can gate them: the
 * seed contains junk city|country pairs (e.g. "beijing|united states"
 * region-geocoded to NYC) that must never place a dot, but legitimate
 * region rows ("pune district|india") are real endpoints. Use
 * {@link centroidUsableForCity} to accept a region row ONLY when the
 * key's country segment matches the lane's resolved country. Port keys
 * are unaffected — they only ever carry precision 'city' or 'failed',
 * and port consumers require `precision === "city"` explicitly.
 *
 * KEY NORMALIZATION: the seed's country segment is always the FULL
 * lowercase country name ('india', 'united kingdom', 'hong kong
 * s.a.r.'), NEVER an ISO2 code — but lane/shipment data often carries
 * ISO2-ish codes ("Ahmadabad, IN"). Use {@link iso2SeedCountryName} /
 * the candidate builders below instead of hand-rolling `city|cc` keys,
 * which silently miss and fall back to the country centroid.
 *
 * Lives under frontend/src/api/ per CLAUDE.md — new domain code must NOT
 * be added to frontend/src/lib/api.ts.
 */
import { useEffect } from "react";
import {
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Coordinates don't move — cache aggressively. */
const ONE_DAY = 24 * 60 * 60 * 1000;

/** PostgREST `.in()` chunk size — keeps the query-string length sane. */
const IN_CHUNK = 200;

export type PlaceCentroid = {
  lat: number;
  lng: number;
  /**
   * Only 'city' and 'region' rows are ever returned (see module docs).
   * 'city' is always safe to plot; gate 'region' rows through
   * {@link centroidUsableForCity} before placing a dot.
   */
  precision: "city" | "region";
};

/* ── ISO2 → seed country-name normalization ─────────────────────────────
 * The seed table keys foreign places as `lower(city)|lower(country)` with
 * the FULL country name — 'ahmadabad|india', never 'ahmadabad|in'. Lane
 * and shipment feeds frequently carry 2-letter codes instead, so every
 * key builder must run its country segment through these helpers.
 *
 * US-STATE COLLISION ('IN' = India AND Indiana, 'CA' = Canada AND
 * California…): these helpers are for COUNTRY-segment contexts only —
 * i.e. foreign origins and non-US destinations, where the seed keys on
 * the country name. US destination keys use `lower(city)|lower(state)`
 * ('austin|tx') and are built in a separate code path that treats
 * 2-letter tokens as state codes; callers must pick the branch from the
 * lane's resolved destination country BEFORE calling this (see
 * CDPSupplyChain.buildPairEndpointKeys — `destIsUs`).
 */

/** ISO2 (plus 'uk') → the exact lowercase country name the seed uses. */
const ISO2_SEED_COUNTRY_NAMES: Record<string, string> = {
  in: "india",
  cn: "china",
  vn: "vietnam",
  tr: "turkey",
  es: "spain",
  it: "italy",
  de: "germany",
  gb: "united kingdom",
  uk: "united kingdom",
  kr: "south korea",
  jp: "japan",
  tw: "taiwan",
  th: "thailand",
  my: "malaysia",
  id: "indonesia",
  ph: "philippines",
  bd: "bangladesh",
  pk: "pakistan",
  mx: "mexico",
  ca: "canada",
  br: "brazil",
  cl: "chile",
  co: "colombia",
  au: "australia",
  nz: "new zealand",
  fr: "france",
  nl: "netherlands",
  be: "belgium",
  pl: "poland",
  se: "sweden",
  fi: "finland",
  dk: "denmark",
  at: "austria",
  ch: "switzerland",
  pt: "portugal",
  gr: "greece",
  eg: "egypt",
  za: "south africa",
  sa: "saudi arabia",
  ae: "united arab emirates",
  il: "israel",
  sg: "singapore",
  hk: "hong kong s.a.r.",
  us: "united states of america",
};

/**
 * Map a 2-letter ISO country code ('IN', 'gb', also 'UK') to the full
 * lowercase country name used in the seed's `city|country` keys. Returns
 * null for unknown codes — callers should then fall back to whatever
 * full-name string they already have. NEVER call this with a US state
 * code (see the collision note above).
 */
export function iso2SeedCountryName(
  code: string | null | undefined,
): string | null {
  const c = String(code ?? "").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(c)) return null;
  return ISO2_SEED_COUNTRY_NAMES[c] ?? null;
}

/**
 * Normalize one raw country segment (full name OR 2-letter code) into the
 * form the seed keys on. Full names pass through lowercased; known ISO2
 * codes map to the full name; UNKNOWN 2-letter tokens return null (a
 * bare code can never match the seed, so a `city|xx` key is pure waste).
 * Country-segment contexts only — never US states.
 */
export function normalizeSeedCountrySegment(
  raw: string | null | undefined,
): string | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (/^[a-z]{2}$/.test(v)) return iso2SeedCountryName(v);
  return v;
}

/**
 * Whether a fetched centroid may place a CITY dot for a lane endpoint.
 *  - 'city' precision: always usable.
 *  - 'region' precision: usable ONLY when the key's country segment
 *    equals the lane's resolved full country name (seed form) — accepts
 *    legit rows like 'pune district|india' for an India lane while still
 *    rejecting junk like 'beijing|united states' for a China lane.
 *    US `city|state` keys never match a country name, so region rows
 *    are conservatively rejected there.
 * ('country'/'failed' rows are never fetched — see usePlaceCentroids.)
 */
export function centroidUsableForCity(
  placeKey: string,
  centroid: PlaceCentroid,
  laneSeedCountry: string | null | undefined,
): boolean {
  if (centroid.precision === "city") return true;
  const country = String(laneSeedCountry ?? "").trim().toLowerCase();
  if (!country) return false;
  const seg = String(placeKey ?? "").split("|")[1]?.trim() ?? "";
  return seg === country;
}

/**
 * Great-circle (haversine) distance in statute MILES between two points.
 * Straight-line, not road miles — callers should label it accordingly
 * (e.g. "142 mi from HQ", "~248 mi drayage/rail").
 */
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8; // Earth mean radius, statute miles
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

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
 * exist with usable coordinates — missing keys and precision 'failed' /
 * 'country' rows are simply absent, so callers fall back to their
 * current (country-centroid) behavior. 'region' rows are returned with
 * `precision: "region"`; gate them via {@link centroidUsableForCity}.
 * Disabled (resolves an empty Map) when the key list is empty; errors
 * degrade to whatever was already fetched.
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
          // 'city' + 'region' only. 'country'/'failed' behave like missing
          // keys (country dots come from the callers' own fallback).
          // 'region' rows are junk-prone (e.g. "beijing|united states" →
          // NYC) so they carry their precision out — callers must gate
          // them via centroidUsableForCity() before placing a dot.
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

/* ── On-demand geocode fallback (2026-08 self-healing seed) ─────────────
 * The seed only covers ~1,588 places harvested from past data — cities
 * outside it (e.g. "Winder, GA") can NEVER geocode client-side and their
 * dots fall back to the country centroid. useEnsurePlaceCentroids closes
 * the gap: callers hand it the endpoint descriptors that MISSED the
 * centroid table; it fires ONE debounced, batched call to the
 * `geocode-place` edge function (which looks the keys up server-side and
 * geocodes true misses via Nominatim, upserting the result — including a
 * negative-cache 'failed' row) and then invalidates the
 * usePlaceCentroids queries so dots move to the precise location when
 * results land.
 */

/** A place that missed the centroid table and should be geocoded once. */
export type EnsurePlaceDescriptor = {
  /** Canonical seed key this descriptor heals (used for session dedupe
   *  AND rebuilt server-side from city/region/country — keep them in
   *  sync via the same key rules). */
  placeKey: string;
  city: string;
  /** 2-letter US state code when known (US destinations). */
  region?: string | null;
  /** Full country name or ISO2 code ('us' for stateless US cities). */
  country?: string | null;
};

/** Max places per geocode-place invocation (mirrors the edge fn cap). */
const ENSURE_BATCH_MAX = 10;
/** Debounce so rapid descriptor churn (scope filters) fires one call. */
const ENSURE_DEBOUNCE_MS = 1000;

/** place_keys already attempted this session (success OR failure) — a key
 *  is only ever sent once per page load; no retry loops. Module-level so
 *  every consumer (hero + dialog) shares the same guard. */
const attemptedPlaceKeys = new Set<string>();

/**
 * Fire-and-forget fallback geocoding for centroid-table misses.
 *
 * Pass the descriptors that had NO usable city/region row after
 * usePlaceCentroids resolved (pass [] while loading — the hook is inert
 * until `enabled` and the list is non-empty). Each place_key is attempted
 * at most once per session; when the edge fn reports at least one usable
 * hit the geo-place-centroids queries are invalidated so the map picks up
 * the healed rows. Errors are swallowed (the country-centroid fallback
 * stays on screen).
 */
export function useEnsurePlaceCentroids(
  descriptors: EnsurePlaceDescriptor[],
  enabled: boolean,
): void {
  const queryClient = useQueryClient();

  // Stable signature so the effect only re-arms when the actual set of
  // un-attempted keys changes (not on every parent render).
  const pendingKey = (descriptors ?? [])
    .map((d) => String(d?.placeKey ?? "").trim().toLowerCase())
    .filter((k) => k && !attemptedPlaceKeys.has(k))
    .sort()
    .join(";");

  useEffect(() => {
    if (!enabled || !pendingKey) return;
    const timer = window.setTimeout(() => {
      // Re-filter at fire time (another consumer may have claimed keys
      // during the debounce window), dedupe by key, cap at the fn limit.
      const byKey = new Map<string, EnsurePlaceDescriptor>();
      for (const d of descriptors ?? []) {
        const k = String(d?.placeKey ?? "").trim().toLowerCase();
        if (!k || attemptedPlaceKeys.has(k) || byKey.has(k)) continue;
        if (!String(d?.city ?? "").trim()) continue;
        byKey.set(k, d);
        if (byKey.size >= ENSURE_BATCH_MAX) break;
      }
      if (byKey.size === 0) return;
      for (const k of byKey.keys()) attemptedPlaceKeys.add(k);

      const places = [...byKey.values()].map((d) => ({
        city: String(d.city).trim(),
        region: String(d.region ?? "").trim() || null,
        country: String(d.country ?? "").trim() || null,
      }));

      void supabase.functions
        .invoke("geocode-place", { body: { places } })
        .then(({ data, error }) => {
          if (error) {
            console.warn("[geoCentroids] geocode-place failed:", error.message ?? error);
            return;
          }
          const results = Array.isArray((data as any)?.results)
            ? ((data as any).results as any[])
            : [];
          const healed = results.some(
            (r) =>
              (r?.precision === "city" || r?.precision === "region") &&
              Number.isFinite(Number(r?.lat)) &&
              Number.isFinite(Number(r?.lng)),
          );
          // Refetch every geo-place-centroids query so dots move to the
          // precise location. Only worth it when something actually healed
          // ('failed' rows behave exactly like the misses we already have).
          if (healed) {
            void queryClient.invalidateQueries({
              queryKey: ["geo-place-centroids"],
            });
          }
        })
        .catch((err) => {
          console.warn("[geoCentroids] geocode-place invoke error:", err);
        });
    }, ENSURE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // descriptors identity churns per render; pendingKey captures the real
    // dependency (the set of un-attempted keys).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pendingKey, queryClient]);
}
