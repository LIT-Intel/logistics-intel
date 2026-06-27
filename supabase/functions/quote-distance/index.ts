import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, requestId } from "../_shared/logger.ts";
import { routeMiles, haversineMiles } from "../_shared/osrm_client.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

interface GeoPoint {
  lat: number;
  lon: number;
  label: string;
}

/**
 * Geocode a free-text US location via OpenStreetMap Nominatim (free, no key).
 * Returns null when no match is found. Throws on transport errors so the
 * caller can decide how to surface them.
 */
async function geocode(query: string): Promise<GeoPoint | null> {
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}` +
    `&format=json&limit=1&countrycodes=us`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 6000);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "LogisticIntel-Quoting/1.0 (support@logisticintel.com)",
        "Accept": "application/json",
      },
    });
    if (!resp.ok) throw new Error(`nominatim_${resp.status}`);
    const arr = await resp.json();
    const hit = Array.isArray(arr) ? arr[0] : null;
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, label: String(hit.display_name ?? query) };
  } finally {
    clearTimeout(tid);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const log = createLogger("quote-distance", { request_id: requestId() });

  // Auth only (no quoting-feature gate — distance is a low-cost utility).
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, code: "UNAUTHORIZED" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!,
    anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ ok: false, code: "UNAUTHORIZED" }, 401);

  const body = await req.json().catch(() => ({}));
  const origin = String(body?.origin ?? "").trim();
  const destination = String(body?.destination ?? "").trim();
  if (origin.length < 2 || destination.length < 2) {
    return json({ ok: true, miles: null, reason: "need_both" });
  }

  try {
    // Sequential, not parallel — be polite to the free Nominatim endpoint.
    const originGeo = await geocode(origin);
    if (!originGeo) return json({ ok: true, miles: null, reason: "geocode_miss", which: "origin" });
    const destGeo = await geocode(destination);
    if (!destGeo) {
      return json({ ok: true, miles: null, reason: "geocode_miss", which: "destination" });
    }

    // OSRM driving distance; routeMiles already falls back to haversine*1.2
    // internally and reports which source it used.
    let miles: number;
    let source: "osrm" | "haversine";
    try {
      const route = await routeMiles({
        fromLat: originGeo.lat,
        fromLon: originGeo.lon,
        toLat: destGeo.lat,
        toLon: destGeo.lon,
      });
      miles = route.miles;
      source = route.source;
    } catch (routeErr) {
      log.warn("route_failed_fallback_haversine", { err: String(routeErr) });
      miles = haversineMiles(originGeo.lat, originGeo.lon, destGeo.lat, destGeo.lon);
      source = "haversine";
    }

    if (!Number.isFinite(miles)) {
      return json({ ok: true, miles: null, reason: "no_distance" });
    }

    return json({
      ok: true,
      miles: Math.round(miles),
      source,
      origin: { lat: originGeo.lat, lon: originGeo.lon, label: originGeo.label },
      destination: { lat: destGeo.lat, lon: destGeo.lon, label: destGeo.label },
    });
  } catch (err) {
    log.error("distance_failed", { err: err instanceof Error ? err.message : String(err) });
    return json({ ok: false, code: "DISTANCE_FAILED" }, 500);
  }
});
