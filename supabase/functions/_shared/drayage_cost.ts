// supabase/functions/_shared/drayage_cost.ts
//
// Deterministic drayage cost estimator.
//
// v2 formula (EIA diesel-indexed fuel surcharge):
//   linehaul   = base_per_mile * miles * containers_eq
//   chassis    = chassis_per_day * est_days
//   access     = per_container_fee * count + port_fee * containers_eq
//   fuel       = ((diesel_usd_gal − 1.20 peg) / 6.0 mpg) * miles * containers_eq
//   subtotal   = linehaul + chassis + access + fuel
//   if LCL:    subtotal *= 0.35
//   if <60mi:  subtotal = max(subtotal, 450 * count)
//
// The diesel price comes from `lit_fuel_index` (weekly EIA US on-highway
// diesel, refreshed by the `fuel-index-refresh` cron fn). The $1.20/gal peg
// and 6.0 mpg are the standard industry fuel-surcharge convention (surcharge
// covers cost above the peg baseline that's already baked into base linehaul).
//
// v1 fallback: when no diesel price is available (empty lit_fuel_index),
// fuel reverts to the legacy flat 22% of (linehaul + chassis).
//
// 2026 coefficients from DAT, ATRI Operational Costs of Trucking, PierPASS.
// Disclose ±25% band to user; never present as a firm quote.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

export type ContainerType = "20FT" | "40FT" | "40HC" | "LCL";

const TEU_FACTOR: Record<ContainerType, number> = {
  "20FT": 1, "40FT": 1.8, "40HC": 1.8, "LCL": 1,
};

const PORT_FEES: Record<string, number> = {
  USLAX: 39.62, USLGB: 39.62,
  USNYC: 45, USEWR: 45,
};

const BASE_PER_MILE = 3.15;
const CHASSIS_PER_DAY = 45;
const PER_CONTAINER_FEE = 175;
/** Legacy flat fuel surcharge — v1 fallback when no diesel index row exists. */
const FUEL_PCT_FALLBACK = 0.22;
/** Fuel-surcharge peg: base linehaul assumes diesel at $1.20/gal. */
export const FUEL_PEG_USD_GAL = 1.2;
/** Assumed drayage tractor fuel economy. */
export const TRUCK_MPG = 6.0;
const LCL_FACTOR = 0.35;
const LOCAL_MILE_THRESHOLD = 60;
const LOCAL_FLOOR_PER_CONTAINER = 450;

export interface DrayageInput {
  pod_unloc: string;
  dest_city: string;
  dest_state: string;
  container_count: number;
  container_type: ContainerType;
  miles: number;
  /**
   * Latest EIA weekly US on-highway diesel price ($/gal) from
   * `lit_fuel_index` (see `fetchLatestDieselPrice`). When null/absent the
   * estimator falls back to the legacy flat 22% fuel surcharge (v1).
   */
  diesel_usd_gal?: number | null;
}

export interface DrayageOutput {
  cost: number;
  low: number;
  high: number;
  containers_eq: number;
  formula_version: "v1" | "v2";
}

export function normalizeContainerType(raw: string | null | undefined): ContainerType {
  if (!raw) return "40FT";
  const s = String(raw).toUpperCase().replace(/['"\s]/g, "");
  if (s.includes("LCL")) return "LCL";
  if (s.includes("40HC") || s.includes("HC")) return "40HC";
  if (s.startsWith("20")) return "20FT";
  if (s.startsWith("40")) return "40FT";
  return "40FT";
}

/**
 * Read the most recent diesel price from `lit_fuel_index`. Returns null when
 * the table is empty or the read fails — callers pass the result straight
 * into `estimateDrayageCost`, which degrades to the v1 flat surcharge.
 */
export async function fetchLatestDieselPrice(
  supabase: SupabaseClient,
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from("lit_fuel_index")
      .select("week_of, diesel_usd_gal")
      .order("week_of", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const price = Number(data.diesel_usd_gal);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

export function estimateDrayageCost(input: DrayageInput): DrayageOutput {
  const count = Math.max(1, input.container_count);
  const teu = TEU_FACTOR[input.container_type];
  const containers_eq = count * teu;
  const miles = Math.max(0, input.miles);
  const port_fee_per_teu = PORT_FEES[input.pod_unloc] ?? 0;
  const est_days = Math.ceil(miles / 450) + 1;
  const linehaul = BASE_PER_MILE * miles * containers_eq;
  const chassis = CHASSIS_PER_DAY * est_days;
  const accessorials = PER_CONTAINER_FEE * count + port_fee_per_teu * containers_eq;

  // Fuel surcharge — diesel-indexed (v2) when a price is available,
  // legacy flat 22% (v1) otherwise.
  const diesel = Number(input.diesel_usd_gal);
  const useDiesel = Number.isFinite(diesel) && diesel > 0;
  const fuel = useDiesel
    ? (Math.max(0, diesel - FUEL_PEG_USD_GAL) / TRUCK_MPG) * miles * containers_eq
    : FUEL_PCT_FALLBACK * (linehaul + chassis);

  let subtotal = linehaul + chassis + accessorials + fuel;
  if (input.container_type === "LCL") subtotal *= LCL_FACTOR;
  if (miles < LOCAL_MILE_THRESHOLD) {
    subtotal = Math.max(subtotal, LOCAL_FLOOR_PER_CONTAINER * count);
  }
  const cost = Math.round(subtotal);
  return {
    cost,
    low: Math.round(cost * 0.75),
    high: Math.round(cost * 1.25),
    containers_eq,
    formula_version: useDiesel ? "v2" : "v1",
  };
}
