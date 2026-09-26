/**
 * rollups — blends the ALREADY-SAVED monthly customs rollups into the v2
 * dataset (owner directive 2026-09-26: "each saved company already saves the
 * data we need").
 *
 * Sources (real aggregated customs records, saved at company-save time):
 *   - lit_company_time_series_monthly  (company-wide monthly shipments/teu,
 *     557 companies, full multi-year history)
 *   - lit_company_lane_months          (per-lane monthly, subset of companies)
 *
 * Rules:
 *   - Volume surfaces (brush, cadence, KPIs, YoY, lane history, story) use
 *     BLENDED months: max(documented BOLs, rollup) per month — rollups are
 *     complete counts, documents are a bounded sample.
 *   - Document surfaces (carrier/supplier/product/equipment facets, latest
 *     BOLs, Data-trace rows) stay BOL-backed; the trace notes coverage.
 *   - Any carrier/supplier/product/equipment filter → documents-only mode
 *     (rollups can't be filtered by those dims). A lane filter keeps the
 *     blend only when every selected lane has lane-level rollups.
 *   - Spend for rollup-only volume is modeled (rate × TEU) and labeled, like
 *     every other modeled value on the page.
 */
import {
  iso2FromName,
  normalizeRecentBols,
  normalizeUnifiedShipments,
  rateForYear,
  type RecentBolInput,
  type UnifiedShipmentDbRow,
} from "./normalizeShipments";
import { miYear } from "./format";
import type { Filters, RollupData, ShipmentDataset } from "./types";

// ---------------------------------------------------------------- db shapes

export interface TsMonthlyDbRow {
  year: number;
  month: number; // 1-12
  shipments: number | string | null;
  teu: number | string | null;
}

export interface LaneMonthDbRow {
  origin_country: string | null;
  dest_country: string | null;
  month: string; // "2026-07-01"
  shipments: number | string | null;
  teu: number | string | null;
}

export interface ArchiveBundle {
  bolRows: UnifiedShipmentDbRow[];
  tsRows: TsMonthlyDbRow[];
  laneRows: LaneMonthDbRow[];
}

const num = (v: number | string | null | undefined): number => {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------- normalize

export function normalizeRollups(
  tsRows: TsMonthlyDbRow[],
  laneRows: LaneMonthDbRow[],
  firstYear: number,
  maxMi: number,
): RollupData | null {
  const byMi: RollupData["byMi"] = {};
  const laneByKey: RollupData["laneByKey"] = {};
  let firstMi: number | null = null;
  let lastMi: number | null = null;
  let totalShipments = 0;
  let totalTeu = 0;
  const touch = (mi: number) => {
    if (firstMi == null || mi < firstMi) firstMi = mi;
    if (lastMi == null || mi > lastMi) lastMi = mi;
  };

  for (const r of tsRows) {
    const mi = (r.year - firstYear) * 12 + (r.month - 1);
    if (mi < 0 || mi > maxMi) continue;
    const shipments = num(r.shipments);
    const teu = num(r.teu);
    if (shipments <= 0 && teu <= 0) continue;
    const o = byMi[mi] || (byMi[mi] = { shipments: 0, teu: 0 });
    o.shipments += shipments;
    o.teu += teu;
    totalShipments += shipments;
    totalTeu += teu;
    touch(mi);
  }

  for (const r of laneRows) {
    const d = new Date(r.month);
    if (Number.isNaN(+d)) continue;
    const mi = (d.getUTCFullYear() - firstYear) * 12 + d.getUTCMonth();
    if (mi < 0 || mi > maxMi) continue;
    const oc = iso2FromName(r.origin_country) ?? "XX";
    const dc = iso2FromName(r.dest_country) ?? "US";
    const key = oc + "-" + dc;
    const shipments = num(r.shipments);
    const teu = num(r.teu);
    if (shipments <= 0 && teu <= 0) continue;
    const lane = laneByKey[key] || (laneByKey[key] = {});
    const o = lane[mi] || (lane[mi] = { shipments: 0, teu: 0 });
    o.shipments += shipments;
    o.teu += teu;
    touch(mi);
  }

  if (firstMi == null) return null;
  return { byMi, laneByKey, firstMi, lastMi, totalShipments, totalTeu };
}

// ---------------------------------------------------------------- assemble

/** One-stop dataset assembly: documents (archive, else snapshot sample) +
 *  rollups, with the month-index anchor pulled back to the earliest year in
 *  ANY source so the history brush spans the full saved history. */
export function assembleDataset(
  bundle: ArchiveBundle,
  recentBols: RecentBolInput[] | null | undefined,
  now: Date = new Date(),
): ShipmentDataset | null {
  const years: number[] = [];
  for (const r of bundle.tsRows) if (r.year >= 2000) years.push(r.year);
  for (const r of bundle.laneRows) {
    const y = parseInt(String(r.month).slice(0, 4), 10);
    if (y >= 2000) years.push(y);
  }
  const anchorYear = years.length ? Math.min(...years) : undefined;

  const useArchiveDocs = bundle.bolRows.length > 0;
  const ds = useArchiveDocs
    ? normalizeUnifiedShipments(bundle.bolRows, now, anchorYear)
    : normalizeRecentBols(recentBols ?? [], now, anchorYear);

  ds.rollup = normalizeRollups(bundle.tsRows, bundle.laneRows, ds.firstYear, ds.lastMi);
  if (!ds.rows.length && !ds.rollup) return null;
  return ds;
}

// ---------------------------------------------------------------- blending

export type BlendMode = "docs" | "lane" | "full";

/** Which mode the current filter state allows (see module doc). */
export function blendMode(ds: ShipmentDataset, f: Filters): BlendMode {
  if (!ds.rollup) return "docs";
  if (f.carrier?.length || f.supplier?.length || f.product?.length || f.ctype?.length) return "docs";
  if (f.lane?.length) {
    return f.lane.every((k) => ds.rollup!.laneByKey[k]) ? "lane" : "docs";
  }
  return "full";
}

export interface MonthAggLike {
  shipments: number;
  teu: number;
  spend: number;
}

const Z: MonthAggLike = { shipments: 0, teu: 0, spend: 0 };

/** Blended totals for one month: max(documents, rollup) on shipments/teu;
 *  spend = documented spend + modeled rate×TEU for the undocumented TEU. */
export function blendedMonth(
  ds: ShipmentDataset,
  mode: BlendMode,
  selLanes: string[],
  mi: number,
  docs: MonthAggLike | undefined,
): MonthAggLike {
  const d = docs ?? Z;
  if (mode === "docs" || !ds.rollup) return d;
  let rs = 0;
  let rt = 0;
  if (mode === "lane") {
    for (const k of selLanes) {
      const m = ds.rollup.laneByKey[k]?.[mi];
      if (m) {
        rs += m.shipments;
        rt += m.teu;
      }
    }
  } else {
    const m = ds.rollup.byMi[mi];
    if (m) {
      rs = m.shipments;
      rt = m.teu;
    }
  }
  const shipments = Math.max(d.shipments, rs);
  const teu = Math.max(d.teu, rt);
  const extraTeu = Math.max(0, teu - d.teu);
  const spend = d.spend + (extraTeu > 0 ? Math.round(extraTeu * rateForYear(miYear(mi, ds.firstYear))) : 0);
  return { shipments, teu, spend };
}

/** Blended totals for one lane in one month (lane cards / heatmap / stack). */
export function blendedLaneMonth(
  ds: ShipmentDataset,
  blendOn: boolean,
  lane: string,
  mi: number,
  docs: MonthAggLike | undefined,
): MonthAggLike {
  const d = docs ?? Z;
  if (!blendOn || !ds.rollup) return d;
  const m = ds.rollup.laneByKey[lane]?.[mi];
  if (!m) return d;
  const shipments = Math.max(d.shipments, m.shipments);
  const teu = Math.max(d.teu, m.teu);
  const extraTeu = Math.max(0, teu - d.teu);
  const spend = d.spend + (extraTeu > 0 ? Math.round(extraTeu * rateForYear(miYear(mi, ds.firstYear))) : 0);
  return { shipments, teu, spend };
}

/** Latest month with any rollup volume within [0, maxMi] (for last-activity). */
export function lastRollupActivityMi(ds: ShipmentDataset, maxMi: number): number | null {
  if (!ds.rollup) return null;
  let best: number | null = null;
  for (const k of Object.keys(ds.rollup.byMi)) {
    const mi = +k;
    if (mi <= maxMi && (best == null || mi > best)) best = mi;
  }
  return best;
}
