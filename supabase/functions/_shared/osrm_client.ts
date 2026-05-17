//
// OSRM public demo (project-osrm.org) for road distance.
// Falls back to haversine * 1.2 if OSRM is unreachable or slow.
//
// Cache the (POD, dest_city, dest_state) → miles lookup in
// public.lit_drayage_distance_cache to avoid hammering OSRM.

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const HAVERSINE_ROAD_FACTOR = 1.2;
const KM_PER_MILE = 1.609344;

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.7613; // earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function normalizeCityKey(s: string): string {
  return String(s || "").trim().toLowerCase();
}

export interface RouteResult {
  miles: number;
  source: "osrm" | "haversine";
}

export async function routeMiles(args: {
  fromLat: number; fromLon: number;
  toLat: number; toLon: number;
}): Promise<RouteResult> {
  const url = `${OSRM_BASE}/${args.fromLon},${args.fromLat};${args.toLon},${args.toLat}?overview=false`;
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!resp.ok) throw new Error(`osrm_${resp.status}`);
    const json = await resp.json();
    const meters = json?.routes?.[0]?.distance;
    if (typeof meters !== "number") throw new Error("osrm_no_route");
    return { miles: (meters / 1000) / KM_PER_MILE, source: "osrm" };
  } catch (_err) {
    const miles = haversineMiles(args.fromLat, args.fromLon, args.toLat, args.toLon) * HAVERSINE_ROAD_FACTOR;
    return { miles, source: "haversine" };
  }
}
