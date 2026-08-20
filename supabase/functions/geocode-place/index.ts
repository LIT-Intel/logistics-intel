// geocode-place — on-demand, self-healing geocoder for lit_geo_place_centroids.
//
// The seed table only covers ~1,588 places harvested from past shipment data,
// so any city outside the seed (e.g. "Winder, GA") can NEVER geocode
// client-side and its map dot falls back to the country centroid. This fn
// closes that gap: the frontend batches the place_keys that MISSED the table
// here; each miss is geocoded ONCE via Nominatim and upserted (including a
// negative-cache 'failed' row) so the table heals itself over time.
//
// POST { places: [{ city, region?, country? }] }  (user JWT required; max 10)
//   For each place:
//     1. Build the canonical place_key (same rules as the seed):
//          US   → `lower(city)|lower(2-letter state)` when a state is given,
//                 else `lower(city)|united states of america`
//          else → `lower(city)|lower(full country name)` (ISO2 codes are
//                 expanded; unknown codes are rejected — a bare `city|xx`
//                 key can never match the seed)
//     2. Look the key up in lit_geo_place_centroids (service role). Any
//        existing row — including precision='failed' — is returned as-is
//        (negative caching: a failed key is never re-geocoded).
//     3. On a true miss, geocode via Nominatim STRUCTURED search, always
//        constrained by country (never a bare city name), 1.1s spacing
//        between remote calls per the Nominatim usage policy, and UPSERT
//        the result with source='nominatim-ondemand' and precision 'city'
//        (or 'failed' with null coords when Nominatim returns nothing).
//
// Returns { ok: true, results: [{ place_key, lat, lng, precision }] }.
// Places that can't produce a canonical key come back with
// precision 'failed' and a null place_key-side lookup is skipped.
//
// verify_jwt=true (default — do NOT add to no_verify_jwt).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handlePreflight, json, requireUser } from "../_shared/auth.ts";
import { createLogger, requestId } from "../_shared/logger.ts";

const TABLE = "lit_geo_place_centroids";
const MAX_PLACES = 10;
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_USER_AGENT = "LogisticIntel-Geocoder/1.0 (vraymond83@gmail.com)";
/** Nominatim usage policy: max 1 req/s — space sequential calls by 1.1s. */
const NOMINATIM_SPACING_MS = 1100;

/** 2-letter USPS codes accepted as the state segment of a US place_key. */
const US_STATE_CODES = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id",
  "il", "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms",
  "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok",
  "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv",
  "wi", "wy", "dc", "pr", "vi", "gu",
]);

/** ISO2 (plus 'uk') → the exact lowercase country name the seed keys on.
 *  MUST stay in sync with frontend/src/api/geoCentroids.ts. */
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

const US_SEED_NAME = "united states of america";
const US_COUNTRY_FORMS = new Set([
  "us", "usa", "united states", "united states of america",
]);

type PlaceInput = { city: string; region: string | null; country: string | null };

type ResolvedPlace = {
  place_key: string;
  city: string;
  /** 2-letter US state code (lowercase) when the key is `city|state`. */
  usState: string | null;
  /** Seed-form country name for the key/country column. */
  seedCountry: string;
  /** Country name to constrain the Nominatim query with. */
  queryCountry: string;
};

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * Canonicalize one input place into its seed place_key + query parts.
 * Returns null when no key can be built (blank city, or a country that is
 * neither a full name nor a known ISO2 code — we NEVER geocode a bare city).
 */
function resolvePlace(input: PlaceInput): ResolvedPlace | null {
  const city = norm(input.city);
  if (!city) return null;
  const region = norm(input.region);
  const countryRaw = norm(input.country);

  const isUs =
    US_COUNTRY_FORMS.has(countryRaw) ||
    (!countryRaw && US_STATE_CODES.has(region));

  if (isUs) {
    if (region && US_STATE_CODES.has(region)) {
      return {
        place_key: `${city}|${region}`,
        city: String(input.city).trim(),
        usState: region,
        seedCountry: US_SEED_NAME,
        queryCountry: "United States",
      };
    }
    // No usable state — country-constrained key. Ambiguity risk accepted:
    // a top-hit city dot beats a mid-Kansas country-centroid dot.
    return {
      place_key: `${city}|${US_SEED_NAME}`,
      city: String(input.city).trim(),
      usState: null,
      seedCountry: US_SEED_NAME,
      queryCountry: "United States",
    };
  }

  if (!countryRaw) return null;
  let seedCountry = countryRaw;
  if (/^[a-z]{2}$/.test(countryRaw)) {
    const mapped = ISO2_SEED_COUNTRY_NAMES[countryRaw];
    if (!mapped) return null; // unknown code — a `city|xx` key is pure waste
    seedCountry = mapped;
  }
  return {
    place_key: `${city}|${seedCountry}`,
    city: String(input.city).trim(),
    usState: null,
    seedCountry,
    queryCountry: seedCountry,
  };
}

type NominatimHit = { lat: number; lng: number } | null;

/** One structured Nominatim lookup — ALWAYS country-constrained. */
async function nominatimLookup(place: ResolvedPlace): Promise<NominatimHit> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("city", place.city);
  if (place.usState) url.searchParams.set("state", place.usState.toUpperCase());
  url.searchParams.set("country", place.queryCountry);

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": NOMINATIM_USER_AGENT,
      "Accept": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }
  const data = (await res.json()) as Array<Record<string, unknown>>;
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const log = createLogger("geocode-place", { request_id: requestId() });
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") {
    return json({ ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed" }, 405);
  }

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: "BAD_JSON", error: "Invalid JSON" }, 400);
  }
  const rawPlaces = Array.isArray(body.places) ? body.places : null;
  if (!rawPlaces || rawPlaces.length === 0) {
    return json({ ok: false, code: "MISSING_PLACES", error: "Body must be {places: [{city, region?, country?}]}" }, 400);
  }

  // Cap + canonicalize. Dedupe by place_key so a batch can't burn multiple
  // Nominatim calls on the same key.
  const resolved = new Map<string, ResolvedPlace>();
  for (const raw of rawPlaces.slice(0, MAX_PLACES)) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const place = resolvePlace({
      city: String(o.city ?? ""),
      region: o.region == null ? null : String(o.region),
      country: o.country == null ? null : String(o.country),
    });
    if (place && !resolved.has(place.place_key)) {
      resolved.set(place.place_key, place);
    }
  }
  if (resolved.size === 0) {
    return json({ ok: true, results: [] });
  }

  try {
    const admin = auth.admin;
    const keys = [...resolved.keys()];

    // 1. Existing rows (any precision — 'failed' rows are the negative cache
    //    and must short-circuit the Nominatim path forever).
    const { data: existingRows, error: selectError } = await admin
      .from(TABLE)
      .select("place_key, lat, lng, precision")
      .in("place_key", keys);
    if (selectError) {
      log.error("select_failed", { err: selectError.message, user_id: auth.user.id });
      return json({ ok: false, code: "DB_ERROR", error: "Centroid lookup failed" }, 500);
    }

    type ResultRow = {
      place_key: string;
      lat: number | null;
      lng: number | null;
      precision: string;
    };
    const results = new Map<string, ResultRow>();
    for (const r of existingRows ?? []) {
      results.set(String(r.place_key), {
        place_key: String(r.place_key),
        lat: r.lat == null ? null : Number(r.lat),
        lng: r.lng == null ? null : Number(r.lng),
        precision: String(r.precision ?? "failed"),
      });
    }

    // 2. True misses → sequential Nominatim loop (1.1s spacing, max 10 by
    //    the MAX_PLACES cap above).
    const misses = keys.filter((k) => !results.has(k));
    let remoteCalls = 0;
    for (const key of misses) {
      const place = resolved.get(key)!;
      if (remoteCalls > 0) await sleep(NOMINATIM_SPACING_MS);
      remoteCalls += 1;

      let hit: NominatimHit = null;
      let lookupFailed = false;
      try {
        hit = await nominatimLookup(place);
      } catch (err) {
        // Transient Nominatim failure (rate limit / network): do NOT write a
        // 'failed' row — that would permanently negative-cache a place that
        // never actually got geocoded. Skip it; a later session retries.
        lookupFailed = true;
        log.warn("nominatim_error", { err: String(err), place_key: key });
      }
      if (lookupFailed) continue;

      const now = new Date().toISOString();
      const row = {
        place_key: key,
        city: place.city,
        region: place.usState ? place.usState.toUpperCase() : null,
        country: place.seedCountry,
        lat: hit ? hit.lat : null,
        lng: hit ? hit.lng : null,
        precision: hit ? "city" : "failed",
        source: "nominatim-ondemand",
        updated_at: now,
      };
      const { error: upsertError } = await admin
        .from(TABLE)
        .upsert(row, { onConflict: "place_key" });
      if (upsertError) {
        log.error("upsert_failed", { err: upsertError.message, place_key: key });
        // Still return the geocode result to the caller for this session.
      }
      results.set(key, {
        place_key: key,
        lat: row.lat,
        lng: row.lng,
        precision: row.precision,
      });
    }

    log.info("geocoded", {
      user_id: auth.user.id,
      requested: keys.length,
      cached: keys.length - misses.length,
      remote_calls: remoteCalls,
    });
    return json({ ok: true, results: [...results.values()] });
  } catch (err) {
    log.error("internal_error", { err: String(err) });
    return json({ ok: false, code: "INTERNAL_ERROR", error: "Geocoding failed" }, 500);
  }
});
