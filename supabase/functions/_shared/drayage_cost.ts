// supabase/functions/_shared/drayage_cost.ts
//
// Deterministic drayage cost estimator. v1 formula:
//   linehaul   = base_per_mile * miles * containers_eq
//   chassis    = chassis_per_day * est_days
//   access     = per_container_fee * count + port_fee * containers_eq
//   fuel       = fuel_pct * (linehaul + chassis)
//   subtotal   = linehaul + chassis + access + fuel
//   if LCL:    subtotal *= 0.35
//   if <60mi:  subtotal = max(subtotal, 450 * count)
// 2026 coefficients from DAT, ATRI Operational Costs of Trucking, PierPASS.
// Disclose ±25% band to user; never present as a firm quote.

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
const FUEL_PCT = 0.22;
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
}

export interface DrayageOutput {
  cost: number;
  low: number;
  high: number;
  containers_eq: number;
  formula_version: "v1";
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
  const fuel = FUEL_PCT * (linehaul + chassis);
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
    formula_version: "v1",
  };
}
