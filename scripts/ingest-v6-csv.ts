// Admin-only one-shot V6 CSV ingest into lit_company_directory.
//
// Usage:
//   deno run --allow-read --allow-env --allow-net \
//     scripts/ingest-v6-csv.ts --csv ./path/to/v6.csv --dry-run
//
// Without --dry-run the script upserts rows. Re-runnable; dedups on
// canonical_domain → canonical_name+country+state.

import { parse as parseCsv } from "https://deno.land/std@0.224.0/csv/parse.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

export type V6Row = Record<string, string | undefined>;

export type NormalizedRow = {
  company_name: string;
  canonical_name: string;
  canonical_domain: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  industry: string | null;
  teu: number | null;
  revenue: string | null;
  vertical: string | null;
  top_dimensions: unknown | null;
  gp_potential: number | null;
  import_batch_name: string;
  source_file: string;
};

const SUFFIX_RE = /\s+(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|limited|sas|gmbh)$/i;

export function canonicalize(name: string): string {
  return name
    .toLowerCase()
    .replace(SUFFIX_RE, "")
    .replace(/[.,'"!?()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeV6Row(
  row: V6Row,
  meta: { batch?: string; source?: string } = {},
): NormalizedRow {
  const company_name = (row.Account ?? "").trim();
  const [city, state, country] = (row.Location ?? "")
    .split(",")
    .map((s) => s.trim());
  const teuRaw = (row["TEU Vol."] ?? "").replace(/[,$\s]/g, "");
  const teu = teuRaw ? Number(teuRaw) : null;
  const revenue = (row["Annual Sales"] ?? "")
    .replace(/[,$\s]/g, "")
    .replace(/^[^\d]+/, "") || null;
  const gpRaw = (row["GP Potential"] ?? "").replace(/[,$\s]/g, "");
  const gp_potential = gpRaw ? Number(gpRaw) : null;
  let top_dimensions: unknown | null = null;
  if (row["Top Dimensions"]) {
    try { top_dimensions = JSON.parse(row["Top Dimensions"]); } catch { top_dimensions = null; }
  }
  return {
    company_name,
    canonical_name: canonicalize(company_name),
    canonical_domain: null,
    city: city || null,
    state: state || null,
    country: country || null,
    industry: row.Industry?.trim() || null,
    teu,
    revenue,
    vertical: row.Vertical?.trim() || null,
    top_dimensions,
    gp_potential,
    import_batch_name: meta.batch ?? `v6-${new Date().toISOString().slice(0, 10)}`,
    source_file: meta.source ?? "v6.csv",
  };
}

async function main() {
  const args = parseArgs(Deno.args);
  const csvPath = args.csv;
  if (!csvPath) { console.error("Missing --csv"); Deno.exit(2); }
  const dryRun = !!args["dry-run"];

  const text = await Deno.readTextFile(csvPath as string);
  const rows = await parseCsv(text, { skipFirstRow: true, columns: undefined }) as V6Row[];

  const normalized = rows.map((r) => normalizeV6Row(r, { source: csvPath as string }));
  console.log(`Parsed ${normalized.length} rows from ${csvPath}.`);

  if (dryRun) {
    console.log("Sample row:", normalized[0]);
    return;
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const client = createClient(url, key);

  // Batch upserts to avoid huge payloads.
  const BATCH = 500;
  for (let i = 0; i < normalized.length; i += BATCH) {
    const chunk = normalized.slice(i, i + BATCH);
    const { error } = await client
      .from("lit_company_directory")
      .upsert(chunk, { onConflict: "canonical_name,country,state", ignoreDuplicates: false });
    if (error) { console.error(`Batch ${i}:`, error); Deno.exit(1); }
    console.log(`Upserted ${i + chunk.length}/${normalized.length}`);
  }
  console.log("Done.");
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

if (import.meta.main) await main();
