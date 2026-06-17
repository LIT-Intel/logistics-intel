// Admin one-shot V6 CSV ingest into lit_company_directory.
//
// V6 CSV columns (verified against the live "US Sales Data - V6.csv"):
//   Company ID, Company Name, Street Address, City, State, Zip Code, Country,
//   Latitude, Longitude, Industry, Vertical, RevenueVessel Website,
//   Company Website, Company Type, Estimated Headcount, Total Contacts,
//   Total Ocean Manifest Shipments, Total TEU, Total LCL Shipments,
//   Estimated Annual Revenue, Top Forwarder One/Two/Three (+ TEU + Percent),
//   Top OceanTradeLanes One/Two/Three (+ TEU + Percent), ... (138 total cols)
//
// Run:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<paste> \
//   deno run --allow-read --allow-env --allow-net \
//     scripts/ingest-v6-csv.ts --csv path/to/v6.csv
//
// Verified: 53,277 unique companies upserted in ~65s with batch=800, parallel=2.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { parse } from "https://deno.land/std@0.224.0/csv/parse.ts";

const BATCH_SIZE = 800;
const PARALLEL_BATCHES = 2;
const SUFFIX_RE = /\s+(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|limited|sas|gmbh)$/i;

export function canonicalize(name: string): string {
  return name.toLowerCase()
    .replace(SUFFIX_RE, "")
    .replace(/[.,'"!?()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function numOrNull(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[,$\s]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t || null;
}

function buildForwarders(r: Record<string, string>) {
  const out: { name: string; teu: number | null; percent: number | null }[] = [];
  for (const n of ["One", "Two", "Three"]) {
    const name = strOrNull(r[`Top Forwarder ${n}`]);
    if (!name) continue;
    out.push({
      name,
      teu: numOrNull(r[`Top Forwarder ${n} TEU`]),
      percent: numOrNull(r[`Top Forwarder ${n} Percent`]),
    });
  }
  return out.length ? out : null;
}

function buildLanes(r: Record<string, string>) {
  const out: { lane: string; teu: number | null; percent: number | null }[] = [];
  for (const n of ["One", "Two", "Three"]) {
    const lane = strOrNull(r[`Top OceanTradeLanes ${n}`]);
    if (!lane) continue;
    out.push({
      lane,
      teu: numOrNull(r[`Top OceanTradeLanes ${n} TEU`]),
      percent: numOrNull(r[`Top OceanTradeLanes ${n} Percent`]),
    });
  }
  return out.length ? out : null;
}

export type NormalizedRow = NonNullable<ReturnType<typeof normalizeV6Row>>;

export function normalizeV6Row(r: Record<string, string>) {
  const company_name = strOrNull(r["Company Name"]) ?? "";
  if (!company_name) return null;
  const canonical_name = canonicalize(company_name);
  if (!canonical_name) return null;
  return {
    company_name,
    canonical_name,
    city: strOrNull(r["City"]),
    state: strOrNull(r["State"]),
    country: strOrNull(r["Country"]),
    postal_code: strOrNull(r["Zip Code"]),
    address_line1: strOrNull(r["Street Address"]),
    industry: strOrNull(r["Industry"]),
    vertical: strOrNull(r["Vertical"]),
    company_type: strOrNull(r["Company Type"]),
    website: strOrNull(r["Company Website"]),
    employee_count: strOrNull(r["Estimated Headcount"]),
    revenue: strOrNull(r["Estimated Annual Revenue"]),
    shipments: numOrNull(r["Total Ocean Manifest Shipments"]),
    teu: numOrNull(r["Total TEU"]),
    lcl: numOrNull(r["Total LCL Shipments"]),
    latitude: numOrNull(r["Latitude"]),
    longitude: numOrNull(r["Longitude"]),
    top_dimensions: buildLanes(r),
    top_forwarders: buildForwarders(r),
    source: "v6",
    source_file: "US Sales Data - V6.csv",
    import_batch_name: `v6-${new Date().toISOString().slice(0, 10)}`,
  };
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) out[k] = true;
      else { out[k] = next; i++; }
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(Deno.args);
  const csvPath = (args.csv as string) || "tmp/v6/v6.csv";
  const dryRun = !!args["dry-run"];

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!dryRun && (!url || !key)) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars (or pass --dry-run).");
    Deno.exit(2);
  }

  const t0 = Date.now();
  console.log(`Reading ${csvPath}...`);
  const text = await Deno.readTextFile(csvPath);
  console.log(`Loaded ${text.length} bytes in ${Date.now() - t0}ms.`);
  const rows = await parse(text, { skipFirstRow: true }) as Record<string, string>[];
  console.log(`Parsed ${rows.length} rows in ${Date.now() - t0}ms.`);

  const normalizedAll = rows.map(normalizeV6Row).filter((r): r is NormalizedRow => r !== null);

  // Dedup within batch — keep the row with highest TEU per (canonical_name,
  // country, state). Postgres ON CONFLICT can't handle duplicate target keys
  // within a single statement.
  const byKey = new Map<string, NormalizedRow>();
  for (const r of normalizedAll) {
    const k = `${r.canonical_name}|${r.country ?? ""}|${r.state ?? ""}`;
    const existing = byKey.get(k);
    if (!existing || (r.teu ?? 0) > (existing.teu ?? 0)) byKey.set(k, r);
  }
  const normalized = Array.from(byKey.values());
  console.log(`Normalized ${normalizedAll.length}; deduped to ${normalized.length}.`);

  if (dryRun) {
    console.log("DRY RUN. Sample:", normalized[0]);
    return;
  }

  const client = createClient(url!, key!);
  let inserted = 0;
  let errors = 0;

  async function upsertBatch(batch: NormalizedRow[], batchNum: number, attempt = 1): Promise<void> {
    const { error } = await client
      .from("lit_company_directory")
      .upsert(batch, { onConflict: "canonical_name,country,state", ignoreDuplicates: false });
    if (error) {
      const isTimeout = /timeout|cancel/i.test(error.message);
      if (isTimeout && attempt < 3) {
        console.warn(`batch ${batchNum} timeout, retry ${attempt + 1}...`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        return upsertBatch(batch, batchNum, attempt + 1);
      }
      console.error(`batch ${batchNum} err:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }

  const batches: NormalizedRow[][] = [];
  for (let i = 0; i < normalized.length; i += BATCH_SIZE) batches.push(normalized.slice(i, i + BATCH_SIZE));
  console.log(`${batches.length} batches; running ${PARALLEL_BATCHES} at a time...`);

  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    const wave = batches.slice(i, i + PARALLEL_BATCHES);
    await Promise.all(wave.map((b, j) => upsertBatch(b, i + j)));
    console.log(`wave ${Math.floor(i / PARALLEL_BATCHES) + 1}/${Math.ceil(batches.length / PARALLEL_BATCHES)}: inserted=${inserted}, errors=${errors}, ${Date.now() - t0}ms`);
  }
  console.log(`DONE. rows=${rows.length}, normalized=${normalized.length}, inserted=${inserted}, errors=${errors}, elapsed=${Date.now() - t0}ms`);
}

if (import.meta.main) await main();
