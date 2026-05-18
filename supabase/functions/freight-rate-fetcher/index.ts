// Phase 4 — freight-rate-fetcher (v2)
//
// Pulls the current Freightos Baltic Index rates and upserts them into
// `lit_freight_rate_benchmarks`. Designed for weekly invocation via
// Supabase pg_cron + pg_net (Mondays 16:00 UTC, after FBX updates).
//
// Implementation: Freightos embeds a JSON blob on every FBX terminal page
// containing all current lane rates. We fetch ONE page (the index landing)
// and parse the blob, rather than scraping 12 separate URLs.
//
// Secondary estimator branch: some lanes (e.g. FBX09 China→SAEC) were retired
// by Freightos and have no free public USD/40ft replacement source. For these
// lanes we set `freightos_label: null` plus a `secondary_estimator` discriminator
// and compute a transparent proxy from other already-fetched lanes. The DB
// `source` column is set to `lit_estimated_*` (never `freightos_fbx`) so the
// derivation is auditable. If estimator inputs are missing, we skip gracefully.
//
// Auth: X-Internal-Cron header against LIT_CRON_SECRET env.

import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyCronAuth } from "../_shared/cron_auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const FREIGHTOS_INDEX_URL =
  "https://www.freightos.com/enterprise/terminal/freightos-baltic-index-global-container-pricing-index/";

// Map Freightos's current FBX-NN label to our stable LIT-internal lane code.
// Freightos renumbered their labels in mid-2026 — we keep our internal codes
// frozen so existing DB rows, charts, and queries don't churn. The semantic
// meaning of each LIT code is preserved.
type SecondaryEstimator =
  | "midpoint_fbx02_fbx10"
  | "fbx01_times_085"        // ASIA → AUS
  | "fbx01_times_070"        // ASIA → INDIA
  | "fbx12_times_105"        // MED → NAEC
  | "fbx11_times_160"        // NAEC → MED (calibrated to 5/7 baseline)
  | "sum_fbx05_fbx11"        // NAWC → NEU (transpacific + transatlantic)
  | "fbx12_times_120";       // NEU → NAWC

type LaneSpec = {
  lit_code: string;       // stable internal code (FBX01..FBX12)
  freightos_label: string | null; // current Freightos label, or null if retired
  secondary_estimator?: SecondaryEstimator; // proxy estimator when freightos_label is null
  label: string;          // human-readable
  origin: string;
  destination: string;
};

const LANES: LaneSpec[] = [
  { lit_code: "FBX01", freightos_label: "FBX01", label: "China/East Asia → North America West Coast",        origin: "China/East Asia",         destination: "North America West Coast" },
  { lit_code: "FBX02", freightos_label: "FBX03", label: "China/East Asia → North America East Coast",        origin: "China/East Asia",         destination: "North America East Coast" },
  { lit_code: "FBX03", freightos_label: "FBX11", label: "China/East Asia → North Europe",                    origin: "China/East Asia",         destination: "North Europe" },
  { lit_code: "FBX04", freightos_label: "FBX13", label: "China/East Asia → Mediterranean",                   origin: "China/East Asia",         destination: "Mediterranean" },
  { lit_code: "FBX05", freightos_label: "FBX02", label: "North America West Coast → China/East Asia",        origin: "North America West Coast", destination: "China/East Asia" },
  { lit_code: "FBX06", freightos_label: "FBX04", label: "North America East Coast → China/East Asia",        origin: "North America East Coast", destination: "China/East Asia" },
  { lit_code: "FBX07", freightos_label: "FBX12", label: "North Europe → China/East Asia",                    origin: "North Europe",             destination: "China/East Asia" },
  { lit_code: "FBX08", freightos_label: "FBX14", label: "Mediterranean → China/East Asia",                   origin: "Mediterranean",            destination: "China/East Asia" },
  // FBX09 (China → SAEC) retired by Freightos. No free public USD/40ft replacement
  // exists (Drewry WCI omits Santos; SCFI sub-indices paywalled; CCFI is index pts).
  // Carrier APIs (Hapag, CMA) require authenticated shipper accounts. We estimate via
  // midpoint(FBX02 China→NAEC, FBX10 Europe→SAEC) — the lane sits between these two
  // structurally (Asian origin + South American destination). Source col is
  // `lit_estimated_midpoint_fbx02_fbx10` (NOT `freightos_fbx`) so it's auditable.
  { lit_code: "FBX09", freightos_label: null,    secondary_estimator: "midpoint_fbx02_fbx10",
                                                  label: "China/East Asia → South America East Coast",        origin: "China/East Asia",         destination: "South America East Coast" },
  { lit_code: "FBX10", freightos_label: "FBX24", label: "Europe → South America East Coast",                 origin: "Europe",                   destination: "South America East Coast" },
  { lit_code: "FBX11", freightos_label: "FBX21", label: "North America East Coast → North Europe",           origin: "North America East Coast", destination: "North Europe" },
  { lit_code: "FBX12", freightos_label: "FBX22", label: "North Europe → North America East Coast",           origin: "North Europe",             destination: "North America East Coast" },
  // LIT-custom lanes — no Freightos source, derived from working FBX lanes via
  // industry-anchored coefficients. Coefficients calibrated against 2026-05-07
  // seed baselines so refreshed values stay within ±20% of historical norms.
  { lit_code: "LIT-ASIA-AUS",   freightos_label: null, secondary_estimator: "fbx01_times_085",
    label: "China/East Asia → Australia",              origin: "China/East Asia",         destination: "Australia" },
  { lit_code: "LIT-ASIA-INDIA", freightos_label: null, secondary_estimator: "fbx01_times_070",
    label: "China/East Asia → India",                  origin: "China/East Asia",         destination: "India" },
  { lit_code: "LIT-MED-NAEC",   freightos_label: null, secondary_estimator: "fbx12_times_105",
    label: "Mediterranean → North America East Coast", origin: "Mediterranean",           destination: "North America East Coast" },
  { lit_code: "LIT-NAEC-MED",   freightos_label: null, secondary_estimator: "fbx11_times_160",
    label: "North America East Coast → Mediterranean", origin: "North America East Coast", destination: "Mediterranean" },
  { lit_code: "LIT-NAWC-NEU",   freightos_label: null, secondary_estimator: "sum_fbx05_fbx11",
    label: "North America West Coast → North Europe",  origin: "North America West Coast", destination: "North Europe" },
  { lit_code: "LIT-NEU-NAWC",   freightos_label: null, secondary_estimator: "fbx12_times_120",
    label: "North Europe → North America West Coast",  origin: "North Europe",             destination: "North America West Coast" },
];

type FreightosRow = { label: string; value: string; change?: string; positive?: boolean };

async function fetchFreightosIndex(): Promise<{
  ok: boolean;
  byLabel: Record<string, number>;
  error?: string;
  raw_count: number;
}> {
  const resp = await fetch(FREIGHTOS_INDEX_URL, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!resp.ok) return { ok: false, byLabel: {}, raw_count: 0, error: `HTTP ${resp.status}` };
  const html = await resp.text();

  // The page embeds a JSON array of {label, value, change, positive} entries.
  // Locate the array by anchoring on the leading `[{"label":"FBX"`.
  const blobMatch = html.match(/\[\{"label":"FBX"[^\]]+\]/);
  if (!blobMatch) return { ok: false, byLabel: {}, raw_count: 0, error: "blob_not_found" };

  let parsed: FreightosRow[] = [];
  try {
    parsed = JSON.parse(blobMatch[0]);
  } catch (e: any) {
    return { ok: false, byLabel: {}, raw_count: 0, error: `parse_failed: ${String(e?.message ?? e)}` };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, byLabel: {}, raw_count: 0, error: "blob_not_array" };
  }

  const byLabel: Record<string, number> = {};
  for (const row of parsed) {
    if (!row?.label || !row?.value) continue;
    const cleaned = String(row.value).replace(/[$,\s]/g, "");
    const num = Number(cleaned);
    if (Number.isFinite(num) && num > 0 && num < 50000) {
      byLabel[String(row.label).toUpperCase()] = num;
    }
  }
  return { ok: true, byLabel, raw_count: parsed.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const auth = verifyCronAuth(req);
  if (!auth.ok) return auth.response;

  const requestId = crypto.randomUUID();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(
      { ok: false, error: "Supabase env not configured", code: "ENV_MISSING" },
      500,
    );
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty body */ }

  const requestedLanes: string[] = Array.isArray(body?.lanes)
    ? body.lanes.map((l: any) => String(l).toUpperCase())
    : [];
  const dryRun = Boolean(body?.dry_run);

  const lanesToProcess = requestedLanes.length
    ? LANES.filter((l) => requestedLanes.includes(l.lit_code))
    : LANES;

  console.log("➡️ freight-rate-fetcher v2", {
    requestId,
    lane_count: lanesToProcess.length,
    dry_run: dryRun,
  });

  const fetchRes = await fetchFreightosIndex();
  if (!fetchRes.ok) {
    return jsonResponse(
      { ok: false, error: `freightos_fetch_failed: ${fetchRes.error}`, requestId },
      502,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const results: any[] = [];
  let upserts = 0;
  const errors: any[] = [];

  for (const lane of lanesToProcess) {
    // Primary path: Freightos blob lookup
    if (lane.freightos_label) {
      const rate = fetchRes.byLabel[lane.freightos_label];
      if (!Number.isFinite(rate)) {
        errors.push({
          lit_code: lane.lit_code,
          freightos_label: lane.freightos_label,
          error: "rate_missing_in_blob",
        });
        results.push({
          lit_code: lane.lit_code,
          ok: false,
          error: "rate_missing_in_blob",
        });
        continue;
      }
      const ratePerTeu = Math.round((rate / 2) * 100) / 100;
      const row = {
        lane_code: lane.lit_code,
        lane_label: lane.label,
        origin_region: lane.origin,
        destination_region: lane.destination,
        rate_usd_per_40ft: rate,
        rate_usd_per_teu: ratePerTeu,
        source: "freightos_fbx",
        as_of_date: today,
        fetched_at: new Date().toISOString(),
      };
      results.push({ lit_code: lane.lit_code, ok: true, ...row });

      if (!dryRun) {
        const { error } = await supabase
          .from("lit_freight_rate_benchmarks")
          .upsert(row, { onConflict: "source,lane_code,as_of_date" });
        if (error) {
          errors.push({ lit_code: lane.lit_code, error: error.message });
        } else {
          upserts++;
        }
      }
      continue;
    }

    // Secondary path: proxy estimator from other already-fetched lanes.
    if (lane.secondary_estimator === "midpoint_fbx02_fbx10") {
      // Our FBX02 = Freightos FBX03 (China→NAEC). Our FBX10 = Freightos FBX24 (Europe→SAEC).
      const fbx02 = fetchRes.byLabel["FBX03"];
      const fbx10 = fetchRes.byLabel["FBX24"];
      if (!Number.isFinite(fbx02) || !Number.isFinite(fbx10)) {
        results.push({
          lit_code: lane.lit_code,
          ok: false,
          skipped: true,
          reason: "estimator_inputs_missing",
          estimator: lane.secondary_estimator,
          inputs: { fbx02_china_naec: fbx02 ?? null, fbx10_europe_saec: fbx10 ?? null },
        });
        continue;
      }
      const estimated = Math.round(((fbx02 + fbx10) / 2) * 100) / 100;
      const ratePerTeu = Math.round((estimated / 2) * 100) / 100;
      const row = {
        lane_code: lane.lit_code,
        lane_label: lane.label,
        origin_region: lane.origin,
        destination_region: lane.destination,
        rate_usd_per_40ft: estimated,
        rate_usd_per_teu: ratePerTeu,
        source: "lit_estimated_midpoint_fbx02_fbx10",
        as_of_date: today,
        fetched_at: new Date().toISOString(),
      };
      results.push({
        lit_code: lane.lit_code,
        ok: true,
        estimator: lane.secondary_estimator,
        inputs: { fbx02_china_naec: fbx02, fbx10_europe_saec: fbx10 },
        ...row,
      });

      if (!dryRun) {
        const { error } = await supabase
          .from("lit_freight_rate_benchmarks")
          .upsert(row, { onConflict: "source,lane_code,as_of_date" });
        if (error) {
          errors.push({ lit_code: lane.lit_code, error: error.message });
        } else {
          upserts++;
        }
      }
      continue;
    }

    // LIT-custom estimator branches. Each derives from working FBX lanes via
    // a transparent coefficient. byLabel keys use Freightos's CURRENT labels:
    //   LIT FBX01 = Freightos "FBX01"  (China → NAWC)
    //   LIT FBX05 = Freightos "FBX02"  (NAWC → China)
    //   LIT FBX11 = Freightos "FBX21"  (NAEC → N.Europe)
    //   LIT FBX12 = Freightos "FBX22"  (N.Europe → NAEC)
    type EstimatorPlan = {
      inputs: Record<string, number | undefined>;
      compute: (vals: Record<string, number>) => number;
    };
    const plans: Record<string, EstimatorPlan | undefined> = {
      fbx01_times_085: {
        inputs: { fbx01_china_nawc: fetchRes.byLabel["FBX01"] },
        compute: (v) => v.fbx01_china_nawc * 0.85,
      },
      fbx01_times_070: {
        inputs: { fbx01_china_nawc: fetchRes.byLabel["FBX01"] },
        compute: (v) => v.fbx01_china_nawc * 0.70,
      },
      fbx12_times_105: {
        inputs: { fbx12_neu_naec: fetchRes.byLabel["FBX22"] },
        compute: (v) => v.fbx12_neu_naec * 1.05,
      },
      fbx11_times_160: {
        inputs: { fbx11_naec_neu: fetchRes.byLabel["FBX21"] },
        compute: (v) => v.fbx11_naec_neu * 1.60,
      },
      sum_fbx05_fbx11: {
        inputs: {
          fbx05_nawc_china: fetchRes.byLabel["FBX02"],
          fbx11_naec_neu: fetchRes.byLabel["FBX21"],
        },
        compute: (v) => v.fbx05_nawc_china + v.fbx11_naec_neu,
      },
      fbx12_times_120: {
        inputs: { fbx12_neu_naec: fetchRes.byLabel["FBX22"] },
        compute: (v) => v.fbx12_neu_naec * 1.20,
      },
    };

    const plan = lane.secondary_estimator ? plans[lane.secondary_estimator] : undefined;
    if (plan) {
      const missing = Object.entries(plan.inputs).filter(
        ([, v]) => !Number.isFinite(v as number),
      );
      if (missing.length > 0) {
        results.push({
          lit_code: lane.lit_code,
          ok: false,
          skipped: true,
          reason: "estimator_inputs_missing",
          estimator: lane.secondary_estimator,
          inputs: plan.inputs,
        });
        continue;
      }
      const validInputs = plan.inputs as Record<string, number>;
      const estimated = Math.round(plan.compute(validInputs) * 100) / 100;
      const ratePerTeu = Math.round((estimated / 2) * 100) / 100;
      const row = {
        lane_code: lane.lit_code,
        lane_label: lane.label,
        origin_region: lane.origin,
        destination_region: lane.destination,
        rate_usd_per_40ft: estimated,
        rate_usd_per_teu: ratePerTeu,
        source: `lit_estimated_${lane.secondary_estimator}`,
        as_of_date: today,
        fetched_at: new Date().toISOString(),
      };
      results.push({
        lit_code: lane.lit_code,
        ok: true,
        estimator: lane.secondary_estimator,
        inputs: plan.inputs,
        ...row,
      });

      if (!dryRun) {
        const { error } = await supabase
          .from("lit_freight_rate_benchmarks")
          .upsert(row, { onConflict: "source,lane_code,as_of_date" });
        if (error) {
          errors.push({ lit_code: lane.lit_code, error: error.message });
        } else {
          upserts++;
        }
      }
      continue;
    }

    // No source at all
    results.push({
      lit_code: lane.lit_code,
      ok: false,
      skipped: true,
      reason: "no_freightos_source",
    });
  }

  console.log("✅ freight-rate-fetcher v2 complete", {
    requestId,
    lanes_processed: lanesToProcess.length,
    upserts,
    errors: errors.length,
    raw_freightos_rows: fetchRes.raw_count,
  });

  return jsonResponse({
    ok: true,
    fetched_at: new Date().toISOString(),
    lanes_attempted: lanesToProcess.length,
    upserts,
    errors,
    results,
    raw_freightos_rows: fetchRes.raw_count,
  });
});
