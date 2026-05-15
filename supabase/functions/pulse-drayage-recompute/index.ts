// supabase/functions/pulse-drayage-recompute/index.ts
//
// Daily tick at 07:00 UTC (1h after tracking refresh).
// For each lit_unified_shipments row that has POD + dest city + container info,
// looks up cached distance (or resolves via OSRM), computes drayage cost,
// and upserts lit_drayage_estimates.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { verifyCronAuth } from "../_shared/cron_auth.ts";
import { estimateDrayageCost, normalizeContainerType } from "../_shared/drayage_cost.ts";
import { routeMiles, normalizeCityKey } from "../_shared/osrm_client.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_CAP = 500;

// Minimal port → lat/lon map for v1. Extend as needed.
const PORT_COORDS: Record<string, { lat: number; lon: number }> = {
  USLAX: { lat: 33.74, lon: -118.27 },
  USLGB: { lat: 33.77, lon: -118.20 },
  USNYC: { lat: 40.68, lon: -74.04 },
  USEWR: { lat: 40.69, lon: -74.17 },
  USSAV: { lat: 32.13, lon: -81.14 },
  USHOU: { lat: 29.73, lon: -95.27 },
  USOAK: { lat: 37.80, lon: -122.32 },
  USSEA: { lat: 47.61, lon: -122.34 },
  USCHS: { lat: 32.78, lon: -79.93 },
  USMIA: { lat: 25.78, lon: -80.17 },
};

// Minimal US city → lat/lon for top inland destinations (extend on demand).
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  "chicago,il": { lat: 41.88, lon: -87.63 },
  "atlanta,ga": { lat: 33.75, lon: -84.39 },
  "dallas,tx": { lat: 32.78, lon: -96.80 },
  "houston,tx": { lat: 29.76, lon: -95.37 },
  "memphis,tn": { lat: 35.15, lon: -90.05 },
  "columbus,oh": { lat: 39.96, lon: -82.99 },
  "kansas city,mo": { lat: 39.10, lon: -94.58 },
  "indianapolis,in": { lat: 39.77, lon: -86.16 },
  "nashville,tn": { lat: 36.16, lon: -86.78 },
  "phoenix,az": { lat: 33.45, lon: -112.07 },
};

// US state centroid lat/lon — used as a fallback when dest_city is unknown.
// Drayage cost is dominated by miles-from-POD, and state centroid is a fair
// regional approximation for v1 (±25% band already disclosed to user).
const STATE_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  AL: { lat: 32.81, lon: -86.79 }, AK: { lat: 61.37, lon: -152.40 },
  AZ: { lat: 33.73, lon: -111.43 }, AR: { lat: 34.97, lon: -92.37 },
  CA: { lat: 36.17, lon: -119.73 }, CO: { lat: 39.06, lon: -105.31 },
  CT: { lat: 41.60, lon: -72.74 }, DE: { lat: 38.99, lon: -75.51 },
  DC: { lat: 38.90, lon: -77.03 }, FL: { lat: 27.77, lon: -81.69 },
  GA: { lat: 33.04, lon: -83.64 }, HI: { lat: 21.09, lon: -157.50 },
  ID: { lat: 44.24, lon: -114.48 }, IL: { lat: 40.35, lon: -88.99 },
  IN: { lat: 39.85, lon: -86.26 }, IA: { lat: 42.01, lon: -93.21 },
  KS: { lat: 38.53, lon: -96.73 }, KY: { lat: 37.67, lon: -84.67 },
  LA: { lat: 31.17, lon: -91.87 }, ME: { lat: 44.69, lon: -69.38 },
  MD: { lat: 39.06, lon: -76.80 }, MA: { lat: 42.23, lon: -71.53 },
  MI: { lat: 43.33, lon: -84.54 }, MN: { lat: 45.69, lon: -93.90 },
  MS: { lat: 32.74, lon: -89.68 }, MO: { lat: 38.46, lon: -92.29 },
  MT: { lat: 46.92, lon: -110.45 }, NE: { lat: 41.13, lon: -98.27 },
  NV: { lat: 38.31, lon: -117.06 }, NH: { lat: 43.45, lon: -71.56 },
  NJ: { lat: 40.30, lon: -74.52 }, NM: { lat: 34.84, lon: -106.25 },
  NY: { lat: 42.17, lon: -74.95 }, NC: { lat: 35.63, lon: -79.81 },
  ND: { lat: 47.53, lon: -99.78 }, OH: { lat: 40.39, lon: -82.76 },
  OK: { lat: 35.57, lon: -96.93 }, OR: { lat: 44.57, lon: -122.07 },
  PA: { lat: 40.59, lon: -77.21 }, RI: { lat: 41.68, lon: -71.51 },
  SC: { lat: 33.86, lon: -80.95 }, SD: { lat: 44.30, lon: -99.44 },
  TN: { lat: 35.75, lon: -86.69 }, TX: { lat: 31.05, lon: -97.56 },
  UT: { lat: 40.15, lon: -111.86 }, VT: { lat: 44.04, lon: -72.71 },
  VA: { lat: 37.77, lon: -78.17 }, WA: { lat: 47.40, lon: -121.49 },
  WV: { lat: 38.49, lon: -80.95 }, WI: { lat: 44.27, lon: -89.62 },
  WY: { lat: 42.76, lon: -107.30 },
};

function cityKey(city: string, state: string | null): string {
  return `${normalizeCityKey(city)},${(state || "").trim().toLowerCase()}`;
}

// Region-based POD inference for US destinations when destination_port is null.
// ImportYeti rarely surfaces POD, so we approximate from dest_state region.
// These are regional approximations — treated as "best-guess discharge port".
const US_STATE_TO_POD: Record<string, string> = {
  CA: 'USLAX', WA: 'USSEA', OR: 'USSEA', AK: 'USSEA', HI: 'USSEA',
  NY: 'USNYC', NJ: 'USNYC', MA: 'USNYC', CT: 'USNYC', RI: 'USNYC', ME: 'USNYC', NH: 'USNYC',
  VA: 'USNYC', MD: 'USNYC', DE: 'USNYC', PA: 'USNYC', DC: 'USNYC',
  GA: 'USSAV', SC: 'USSAV', NC: 'USSAV',
  FL: 'USMIA',
  TX: 'USHOU', LA: 'USHOU', AL: 'USHOU', MS: 'USHOU',
};

function inferPodFromState(destState: string | null, destCountryCode: string | null): string | null {
  if (destCountryCode !== 'US' || !destState) return null;
  return US_STATE_TO_POD[destState.toUpperCase()] || 'USLAX';
}

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: rows, error } = await supabase
    .from("lit_unified_shipments")
    .select("id, bol_number, company_id, destination_port, destination_country_code, dest_city, dest_state, container_count, load_type, lcl")
    .not("dest_city", "is", null)
    .limit(BATCH_CAP);
  if (error) return json({ ok: false, error: error.message }, 500);

  let computed = 0, skipped = 0, missing_coords = 0, inferred_pod_count = 0;
  for (const r of rows || []) {
    let pod = r.destination_port?.toUpperCase();
    if (!pod || !PORT_COORDS[pod]) {
      pod = inferPodFromState(r.dest_state, r.destination_country_code);
      if (!pod || !PORT_COORDS[pod]) { missing_coords++; continue; }
      inferred_pod_count++;
    }
    const ckey = cityKey(r.dest_city || "", r.dest_state);
    let cityCoord = CITY_COORDS[ckey];
    if (!cityCoord && r.dest_state) {
      cityCoord = STATE_CENTROIDS[r.dest_state.toUpperCase()];
    }
    if (!cityCoord) { missing_coords++; continue; }

    // Check cache.
    const { data: cached } = await supabase
      .from("lit_drayage_distance_cache")
      .select("miles, source")
      .eq("pod_unloc", pod)
      .eq("dest_city_norm", normalizeCityKey(r.dest_city))
      .eq("dest_state", (r.dest_state || "").toUpperCase())
      .maybeSingle();
    let miles: number;
    if (cached?.miles) {
      miles = Number(cached.miles);
    } else {
      const route = await routeMiles({
        fromLat: PORT_COORDS[pod].lat, fromLon: PORT_COORDS[pod].lon,
        toLat: cityCoord.lat, toLon: cityCoord.lon,
      });
      miles = route.miles;
      await supabase.from("lit_drayage_distance_cache").upsert({
        pod_unloc: pod,
        dest_city_norm: normalizeCityKey(r.dest_city),
        dest_state: (r.dest_state || "").toUpperCase(),
        miles,
        source: route.source,
      }, { onConflict: "pod_unloc,dest_city_norm,dest_state" });
    }

    const container_type = r.lcl ? "LCL" : normalizeContainerType(r.load_type);
    const out = estimateDrayageCost({
      pod_unloc: pod,
      dest_city: r.dest_city,
      dest_state: r.dest_state || "",
      container_count: r.container_count || 1,
      container_type: container_type as any,
      miles,
    });
    await supabase.from("lit_drayage_estimates").upsert({
      bol_number: r.bol_number,
      source_company_key: r.company_id,
      pod_unloc: pod,
      destination_city: r.dest_city,
      destination_state: r.dest_state,
      miles,
      containers_eq: out.containers_eq,
      est_cost_usd: out.cost,
      est_cost_low_usd: out.low,
      est_cost_high_usd: out.high,
      formula_version: out.formula_version,
    }, { onConflict: "bol_number,destination_city,destination_state" });
    computed++;
  }

  return json({ ok: true, computed, missing_coords, skipped, inferred_pod_count, examined: rows?.length || 0 });
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
