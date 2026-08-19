// One-time Nominatim geocoding batch for lit_geo_place_centroids.
// Resumable: appends to results.ndjson, skips already-done keys on restart.
import { readFileSync, appendFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(DIR, "results.ndjson");
const UA = "LogisticIntel-Geocoder/1.0 (vraymond83@gmail.com)";
const BASE = "https://nominatim.openstreetmap.org/search";
const RATE_MS = 1100;

const load = (f) => JSON.parse(readFileSync(join(DIR, f), "utf8"));
const origins = [...load("o1.json"), ...load("o2.json"), ...load("o3.json")];
const dests = [...load("d1.json"), ...load("d2.json")];

// Save combined pairs.json for the record
writeFileSync(join(DIR, "pairs.json"), JSON.stringify({ origins, dests }));

// Build task list (dedupe by place_key; origins first)
const tasks = [];
const seen = new Set();
for (const [city, country] of origins) {
  const key = `${city}|${country}`;
  if (seen.has(key)) { console.error(`dup key skipped: ${key}`); continue; }
  seen.add(key);
  tasks.push({ key, city, region: null, country, kind: "origin" });
}
for (const [city, region] of dests) {
  const key = `${city}|${region}`;
  if (seen.has(key)) { console.error(`dup key skipped (dest): ${key}`); continue; }
  seen.add(key);
  tasks.push({ key, city, region, country: "united states of america", kind: "dest" });
}

// Resume support
const done = new Set();
if (existsSync(RESULTS)) {
  for (const line of readFileSync(RESULTS, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { done.add(JSON.parse(line).key); } catch { /* ignore partial line */ }
  }
}
console.log(`tasks=${tasks.length} already_done=${done.size}`);

// Country normalization for querying + display_name acceptance check
const COUNTRY_QUERY = {
  "united states of america": "united states",
  "hong kong s.a.r.": "hong kong",
  "the bahamas": "bahamas",
};
const COUNTRY_MATCH = {
  "united states of america": "united states",
  "hong kong s.a.r.": "hong kong",
  "the bahamas": "bahamas",
};

const CITYISH = new Set([
  "city", "town", "village", "hamlet", "suburb", "municipality",
  "borough", "quarter", "neighbourhood", "locality", "isolated_dwelling",
  "residential", "township",
]);
function classify(r) {
  const t = (r.addresstype || "").toLowerCase();
  const t2 = (r.type || "").toLowerCase();
  return CITYISH.has(t) || CITYISH.has(t2) ? "city" : "region";
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function nominatim(params) {
  const url = `${BASE}?${params.toString()}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(url, { headers: { "User-Agent": UA } });
      if (resp.status === 429) {
        console.error(`429 on ${url} — sleeping 10s`);
        await sleep(10000);
        continue; // one retry
      }
      if (!resp.ok) {
        console.error(`HTTP ${resp.status} on ${url}`);
        return null;
      }
      return await resp.json();
    } catch (e) {
      console.error(`fetch error on ${url}: ${e.message} — sleeping 10s`);
      await sleep(10000);
    }
  }
  return null;
}

function baseParams() {
  const p = new URLSearchParams();
  p.set("format", "jsonv2");
  p.set("limit", "1");
  p.set("accept-language", "en");
  return p;
}

async function geocodeTask(t) {
  // 1) STRUCTURED query — mismatched city/country pairs simply fail (by design).
  const p = baseParams();
  p.set("city", t.city);
  if (t.kind === "dest") {
    if (t.region) p.set("state", t.region);
    p.set("country", "usa");
  } else {
    p.set("country", COUNTRY_QUERY[t.country] || t.country);
  }
  let results = await nominatim(p);
  if (results && results.length > 0) {
    const r = results[0];
    return { lat: +r.lat, lng: +r.lon, precision: classify(r), source: "nominatim-structured" };
  }

  // 2) ONE free-form retry, but only accept if display_name contains the expected country.
  await sleep(RATE_MS);
  const expected = t.kind === "dest"
    ? "united states"
    : (COUNTRY_MATCH[t.country] || t.country);
  const q = t.kind === "dest"
    ? `${t.city}, ${t.region ? t.region + ", " : ""}usa`
    : `${t.city}, ${COUNTRY_QUERY[t.country] || t.country}`;
  const p2 = baseParams();
  p2.set("q", q);
  results = await nominatim(p2);
  if (results && results.length > 0) {
    const r = results[0];
    const dn = (r.display_name || "").toLowerCase();
    if (dn.includes(expected)) {
      return { lat: +r.lat, lng: +r.lon, precision: classify(r), source: "nominatim-freeform" };
    }
  }
  return { lat: null, lng: null, precision: "failed", source: "nominatim" };
}

let processed = 0;
for (const t of tasks) {
  if (done.has(t.key)) continue;
  const geo = await geocodeTask(t);
  const row = {
    key: t.key, city: t.city, region: t.region, country: t.country,
    lat: geo.lat, lng: geo.lng, precision: geo.precision, source: geo.source,
  };
  appendFileSync(RESULTS, JSON.stringify(row) + "\n");
  processed++;
  if (processed % 25 === 0) console.log(`progress: ${processed} new, total ${done.size + processed}/${tasks.length}`);
  await sleep(RATE_MS);
}
console.log(`DONE. processed=${processed} total=${done.size + processed}/${tasks.length}`);
