// Build idempotent SQL seed file(s) from results.ndjson
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(DIR, "..", "supabase", "migrations");
const BASE_NAME = "20260819200000_lit_geo_place_centroids_seed";
const MAX_BYTES = 800 * 1024;
const BATCH = 500; // rows per insert statement

const rows = new Map(); // key -> row (last wins)
for (const line of readFileSync(join(DIR, "results.ndjson"), "utf8").split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  rows.set(r.key, r);
}

const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;
const num = (v) => (v === null || v === undefined || Number.isNaN(v) ? "null" : (+v).toFixed(4));

function rowSql(r) {
  const region = r.region === null || r.region === undefined || r.region === "" ? "null" : esc(r.region);
  return `(${esc(r.key)}, ${esc(r.city)}, ${region}, ${esc(r.country)}, ${num(r.lat)}, ${num(r.lng)}, ${esc(r.precision)}, ${esc(r.source)})`;
}

const HEADER = `-- Seed for public.lit_geo_place_centroids
-- Generated ${new Date().toISOString()} by one-time Nominatim (OpenStreetMap) geocoding batch.
-- precision='failed' rows are kept intentionally (lat/lng null) so they are not re-geocoded.
`;
const STMT_HEAD = "insert into public.lit_geo_place_centroids (place_key, city, region, country, lat, lng, precision, source) values\n";
const STMT_TAIL = "\non conflict (place_key) do update set lat=excluded.lat, lng=excluded.lng, precision=excluded.precision, updated_at=now();\n";

const all = [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
const stmts = [];
for (let i = 0; i < all.length; i += BATCH) {
  const chunk = all.slice(i, i + BATCH);
  stmts.push(STMT_HEAD + chunk.map(rowSql).join(",\n") + STMT_TAIL);
}

// Assemble into files, splitting if over MAX_BYTES
const files = [];
let cur = HEADER;
for (const s of stmts) {
  if (Buffer.byteLength(cur + s, "utf8") > MAX_BYTES && cur !== HEADER) {
    files.push(cur);
    cur = HEADER;
  }
  cur += "\n" + s;
}
files.push(cur);

if (files.length === 1) {
  writeFileSync(join(OUT_DIR, `${BASE_NAME}.sql`), files[0]);
  console.log(`wrote ${BASE_NAME}.sql rows=${all.length} bytes=${Buffer.byteLength(files[0], "utf8")}`);
} else {
  files.forEach((f, i) => {
    writeFileSync(join(OUT_DIR, `${BASE_NAME}_part${i + 1}.sql`), f);
    console.log(`wrote ${BASE_NAME}_part${i + 1}.sql bytes=${Buffer.byteLength(f, "utf8")}`);
  });
  console.log(`total rows=${all.length}`);
}

// Stats + spot checks
const stats = {};
for (const r of all) stats[r.precision] = (stats[r.precision] || 0) + 1;
console.log("precision counts:", JSON.stringify(stats));
for (const k of ["atlanta|ga", "hangzhou shi|china", "changwat rayong|thailand", "beijing|united states of america"]) {
  const r = rows.get(k);
  console.log(`spot ${k}:`, r ? `${r.lat},${r.lng} precision=${r.precision} source=${r.source}` : "MISSING");
}
