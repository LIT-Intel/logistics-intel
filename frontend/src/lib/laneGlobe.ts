import type { GlobeLane } from "@/components/GlobeCanvas";

/**
 * Shared country-name → [longitude, latitude] map used by every globe surface
 * (Dashboard trade-lanes card, Company Detail trade-lane intelligence).
 *
 * Keys are lower-case canonical names. Add aliases alongside the canonical
 * key ("usa" + "united states") so `laneStringToGlobeLane` can resolve
 * whatever label the upstream returns.
 */
export const COUNTRY_COORDS: Record<string, [number, number]> = {
  china: [104.2, 35.9],
  usa: [-95.7, 37.1],
  "united states": [-95.7, 37.1],
  india: [78.9, 20.6],
  germany: [10.5, 51.2],
  japan: [138.3, 36.2],
  "south korea": [127.8, 35.9],
  korea: [127.8, 35.9],
  vietnam: [108.3, 14.1],
  mexico: [-102.6, 23.6],
  uk: [-1.5, 52.4],
  "united kingdom": [-1.5, 52.4],
  brazil: [-51.9, -14.2],
  canada: [-96.8, 56.1],
  australia: [133.7, -25.3],
  taiwan: [120.9, 23.7],
  thailand: [100.9, 15.9],
  malaysia: [109.7, 4.2],
  indonesia: [113.9, -0.8],
  bangladesh: [90.4, 23.7],
  pakistan: [69.3, 30.4],
  turkey: [35.2, 38.9],
  italy: [12.6, 41.9],
  france: [2.2, 46.2],
  netherlands: [5.3, 52.1],
  belgium: [4.5, 50.5],
  spain: [-3.7, 40.4],
  poland: [19.1, 51.9],
  "hong kong": [114.2, 22.3],
  singapore: [103.8, 1.4],
};

/**
 * Parse a lane string like "China → USA" into a `GlobeLane` with coordinates
 * resolved from {@link COUNTRY_COORDS}. Accepts `→`, `->`, or `>` as the
 * separator and normalises casing. Returns `null` when either endpoint
 * cannot be resolved — callers should filter `null` out before passing
 * the array to `<GlobeCanvas />`.
 *
 * The second parameter is retained for backwards compatibility with the
 * historical signature; it is ignored.
 */
export function laneStringToGlobeLane(
  laneStr: string,
  _index?: number,
): GlobeLane | null {
  const parts = laneStr.split(/→|->|>/).map((s) => s.trim().toLowerCase());
  if (parts.length < 2) return null;
  const fromCoords = COUNTRY_COORDS[parts[0]] ?? null;
  const toCoords = COUNTRY_COORDS[parts[1]] ?? null;
  if (!fromCoords || !toCoords) return null;
  return {
    id: laneStr,
    from: parts[0],
    to: parts[1],
    coords: [fromCoords, toCoords],
  };
}
