/**
 * Rollup-blending tests (owner directive 2026-09-26): volume surfaces use
 * the FULL saved monthly customs history; document surfaces stay BOL-backed;
 * any non-lane facet filter reverts to documents-only mode.
 */
import { describe, expect, it } from "vitest";
import { rateForYear, type UnifiedShipmentDbRow } from "../normalizeShipments";
import { assembleDataset, blendMode, type LaneMonthDbRow, type TsMonthlyDbRow } from "../rollups";
import { computeView } from "../selectors";
import type { ProfileActions, ProfileState } from "../types";

const NOW = new Date(2026, 8, 26); // Sep 2026

const noop: ProfileActions = {
  toggle() {}, preset() {}, range() {}, metric() {}, brushStart() {},
  brushMove() {}, hover() {}, trace() {}, pin() {},
};

const st = (m0: number, m1: number, over: Partial<ProfileState> = {}): ProfileState => ({
  m0, m1, preset: null, metric: "shipments", f: {}, trace: null,
  hover: null, pins: [], intro: false, disp: null, ...over,
});

function docRow(i: number, iso: string, oc: string, date: string, teu: number | null): UnifiedShipmentDbRow {
  return {
    id: "d" + i,
    bol_number: "BOL" + i,
    house_bol: null,
    master_bol: null,
    bol_date: date,
    scac: "CMDU",
    carrier_name: "CMA CGM",
    shipper_name: "Shipper " + iso,
    origin_country: iso,
    origin_country_code: oc,
    destination_country_code: "US",
    origin_port: "Port " + iso,
    destination_port: "Savannah, GA",
    hs_code: null,
    product_description: "Widgets",
    container_count: 1,
    teu,
    weight_kg: 1000,
    lcl: false,
    load_type: "FCL",
    shipping_cost_usd: 1000,
    container_type: "40HC",
  };
}

// Documents: 4 BOLs, all in 2026 (mi anchored to rollup start 2023-10)
const BOLS: UnifiedShipmentDbRow[] = [
  docRow(1, "China", "CN", "2026-07-05T00:00:00Z", 2),
  docRow(2, "China", "CN", "2026-08-10T00:00:00Z", 2),
  docRow(3, "India", "IN", "2026-08-20T00:00:00Z", 4),
  docRow(4, "India", "IN", "2026-09-01T00:00:00Z", 2),
];

// Rollups: Oct 2023 → Sep 2026, 5 shipments / 10 TEU every month
const TS: TsMonthlyDbRow[] = [];
for (let y = 2023; y <= 2026; y++) {
  for (let m = 1; m <= 12; m++) {
    if (y === 2023 && m < 10) continue;
    if (y === 2026 && m > 9) continue;
    TS.push({ year: y, month: m, shipments: 5, teu: 10 });
  }
}

// Lane rollups only for CN-US (3 shipments / 6 TEU monthly, same span)
const LANES: LaneMonthDbRow[] = TS.map((r) => ({
  origin_country: "China",
  dest_country: "United States",
  month: `${r.year}-${String(r.month).padStart(2, "0")}-01`,
  shipments: 3,
  teu: 6,
}));

const ds = assembleDataset({ bolRows: BOLS, tsRows: TS, laneRows: LANES }, null, NOW)!;

describe("assembleDataset", () => {
  it("anchors the month frame to the earliest rollup year", () => {
    expect(ds.firstYear).toBe(2023);
    expect(ds.rollup?.firstMi).toBe(9); // Oct 2023
    expect(ds.lastMi).toBe((2026 - 2023) * 12 + 8); // Sep 2026
    expect(ds.rollup?.totalShipments).toBe(TS.length * 5);
  });

  it("keeps rollups when documents fall back to the snapshot sample", () => {
    const snap = assembleDataset(
      { bolRows: [], tsRows: TS, laneRows: [] },
      [{ bolNumber: "S1", date: "2026-08-01", teu: 2, containersCount: 1, scac: "CMDU", supplier: "X", origin_country: "China", supplier_country_code: "CN" }],
      NOW,
    )!;
    expect(snap.source).toBe("snapshot");
    expect(snap.rows.length).toBe(1);
    expect(snap.rollup?.totalShipments).toBe(TS.length * 5);
  });
});

describe("blended volume surfaces", () => {
  const FULL = st(0, ds.lastMi);

  it("timeline spans the full rollup history", () => {
    const view = computeView(ds, FULL, noop);
    expect(view.timeline.length).toBe(ds.lastMi + 1);
    expect(view.timeline[9].v).toBe(5); // Oct 2023: rollup only
    expect(view.timeline[0].v).toBe(0); // pre-history
  });

  it("KPIs use max(docs, rollup) per month", () => {
    const view = computeView(ds, FULL, noop);
    // Aug 2026 has 2 docs but rollup says 5 → 5; every rollup month contributes 5
    expect(view.S.shipments).toBe(TS.length * 5);
    expect(view.S.teu).toBeCloseTo(TS.length * 10, 6);
    // documents keep their real spend; undocumented TEU is modeled at rate×TEU
    const view2 = computeView(ds, st(9, 9), noop); // Oct 2023 (rollup only)
    expect(view2.S.spend).toBe(Math.round(10 * rateForYear(2023)));
    expect(view2.S.shipments).toBe(5);
  });

  it("cadence + provenance + trace stay honest about documents", () => {
    const view = computeView(ds, st(ds.lastMi - 11, ds.lastMi), noop);
    expect(view.provenance).toContain("shipments");
    expect(view.provenance).toContain("BOL docs");
    const traced = computeView(ds, { ...st(ds.lastMi - 11, ds.lastMi), trace: { dim: null, key: null, label: "KPI" } }, noop);
    expect(traced.traceSumN.shipments).toBe(4); // the 4 documents
    expect(traced.traceNote.length).toBeGreaterThan(0);
  });

  it("YoY deltas come from the rollup history", () => {
    const view = computeView(ds, st(ds.lastMi - 11, ds.lastMi), noop);
    expect(view.hasPrior).toBe(true);
    const shipKpi = view.kpis.find((k: any) => k.id === "shipments");
    expect(shipKpi.delta).not.toBe("—");
  });
});

describe("blend gating", () => {
  it("any non-lane facet filter reverts to documents-only", () => {
    expect(blendMode(ds, { ctype: ["40HC"] })).toBe("docs");
    const view = computeView(ds, st(0, ds.lastMi, { f: { ctype: ["40HC"] } }), noop);
    expect(view.S.shipments).toBe(4); // documents only
  });

  it("lane filter keeps the blend only for covered lanes", () => {
    expect(blendMode(ds, { lane: ["CN-US"] })).toBe("lane");
    expect(blendMode(ds, { lane: ["IN-US"] })).toBe("docs");
    const cn = computeView(ds, st(0, ds.lastMi, { f: { lane: ["CN-US"] } }), noop);
    expect(cn.S.shipments).toBe(TS.length * 3); // lane rollup: 3/month
    const inView = computeView(ds, st(0, ds.lastMi, { f: { lane: ["IN-US"] } }), noop);
    expect(inView.S.shipments).toBe(2); // IN docs only
  });

  it("no rollups → behavior identical to documents-only", () => {
    const plain = assembleDataset({ bolRows: BOLS, tsRows: [], laneRows: [] }, null, NOW)!;
    const view = computeView(plain, st(0, plain.lastMi), noop);
    expect(view.S.shipments).toBe(4);
    expect(view.provenance).toContain("of");
  });
});
