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

function cityKey(city: string, state: string | null): string {
  return `${normalizeCityKey(city)},${(state || "").trim().toLowerCase()}`;
}

serve(async (req) => {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: rows, error } = await supabase
    .from("lit_unified_shipments")
    .select("id, bol_number, company_id, destination_port, dest_city, dest_state, container_count, load_type, lcl")
    .not("destination_port", "is", null)
    .not("dest_city", "is", null)
    .limit(BATCH_CAP);
  if (error) return json({ ok: false, error: error.message }, 500);

  let computed = 0, skipped = 0, missing_coords = 0;
  for (const r of rows || []) {
    const pod = r.destination_port?.toUpperCase();
    if (!pod || !PORT_COORDS[pod]) { missing_coords++; continue; }
    const ckey = cityKey(r.dest_city || "", r.dest_state);
    const cityCoord = CITY_COORDS[ckey];
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

  return json({ ok: true, computed, missing_coords, skipped, examined: rows?.length || 0 });
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
