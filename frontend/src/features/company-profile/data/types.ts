/**
 * Company Profile v2 — core data contracts.
 *
 * Every number on the profile page is a sum/count over `ShipmentRow[]`
 * filtered by `ProfileState` (period window + facet filters). See
 * docs handoff README §4. No component may display a value that does not
 * reconcile against these rows (Data-trace requirement).
 */

export type Metric = "shipments" | "teu" | "spend";
export type DimKey = "lane" | "carrier" | "supplier" | "product" | "ctype";

export const DIMS: DimKey[] = ["lane", "carrier", "supplier", "product", "ctype"];
export const DIM_LABEL: Record<DimKey, string> = {
  lane: "Lane",
  carrier: "Carrier",
  supplier: "Supplier",
  product: "Product",
  ctype: "Equipment",
};

/** Normalized bill-of-lading row. Built by `normalizeShipments` from
 *  `lit_unified_shipments` (primary) or ImportYeti `recentBols` (fallback). */
export interface ShipmentRow {
  id: string; // BOL number (house preferred), unique-ified per dataset
  ts: number; // arrival ms epoch
  mi: number; // month index = (year - firstYear) * 12 + month0
  day: number;
  lane: string; // "CN-US" (origin ISO2 + "-" + dest ISO2)
  origin: string; // "China"
  oc: string; // "CN"
  dc: string; // "US"
  oPort: string;
  dPort: string;
  carrier: string; // SCAC, e.g. "CMDU"
  carrierName: string; // display name, e.g. "CMA CGM"
  mode: "FCL" | "LCL";
  /** Equipment bucket. `null` when the source row has no container type —
   *  such rows are excluded from the Equipment facet (never invented). */
  ctype: string | null;
  containers: number;
  teu: number;
  /** true when teu was derived from container count (source teu was null). */
  teuModeled: boolean;
  spend: number; // USD
  /** true when spend was modeled (rate × TEU) rather than real cost. */
  spendModeled: boolean;
  weight: number; // kg
  hs: string; // "8427.20" or "" when unknown
  product: string; // facet key + display label for the commodity
  supplier: string; // shipper of record
}

/** A company's normalized shipment archive plus the derived time frame. */
export interface ShipmentDataset {
  rows: ShipmentRow[]; // sorted ascending by ts
  firstYear: number; // earliest year in data (mi anchor)
  lastMi: number; // month index of the CURRENT month (not last data month)
  todayTs: number;
  /** share of rows whose teu / spend is modeled (for "Modeled" labels) */
  teuModeledShare: number;
  spendModeledShare: number;
  source: "archive" | "snapshot";
}

export type Filters = Partial<Record<DimKey, string[]>>;

export interface TraceTarget {
  dim: DimKey | "mi" | "id" | null;
  key: unknown;
  label: string;
  mi?: number;
}

export interface ProfileState {
  m0: number;
  m1: number; // inclusive month-index window
  preset: string | null; // null once brushed manually
  metric: Metric;
  f: Filters;
  trace: TraceTarget | null;
  hover: number | null; // hovered month in cadence chart
  pins: string[]; // KPI ids in the metric grid
  intro: boolean; // first ~120ms: bars render at scale 0 then grow in
  /** count-up display values keyed by KPI id (driven by tween()) */
  disp?: Record<string, number> | null;
}

export const DEFAULT_PINS = ["shipments", "teu", "spend", "lanes", "avgTeu", "lastDays"];

export interface ProfileActions {
  toggle(dim: DimKey, key: string): void;
  preset(id: string): void;
  range(m0: number, m1: number, id?: string | null): void;
  metric(m: Metric): void;
  brushStart(mi: number): void;
  brushMove(mi: number): void;
  hover(mi: number | null): void;
  trace(dim: TraceTarget["dim"], key: unknown, label: string, mi?: number): void;
  pin(id: string): void;
}

export interface Preset {
  id: string;
  label: string;
  m0: number;
  m1: number;
}
