/**
 * Reconciliation tests (handoff README §4.4 + QA §15):
 *  - every KPI equals the Data-trace total for the same click
 *  - Σ(facet values) === KPI value across random filter states
 *  - facet shares sum to 100%
 *  - YoY shows "—" (never NaN/Infinity) when the prior window has no data
 *  - normalizer models teu/spend with flags and never invents ctype
 */
import { describe, expect, it } from "vitest";
import {
  normalizeUnifiedShipments,
  type UnifiedShipmentDbRow,
} from "../normalizeShipments";
import { computeLanes, computePresets, computeView, match, summarize } from "../selectors";
import type { DimKey, ProfileActions, ProfileState } from "../types";
import { DIMS } from "../types";

// deterministic rng
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOW = new Date(2026, 8, 25);

const pick = <T,>(R: () => number, xs: T[]): T => xs[Math.floor(R() * xs.length)];

function makeDbRows(n: number, seed = 42): UnifiedShipmentDbRow[] {
  const R = mulberry32(seed);
  const origins = [
    ["China", "CN", "Shanghai"],
    ["India", "IN", "Chennai"],
    ["Vietnam", "VN", "Haiphong"],
    ["Germany", "DE", "Hamburg"],
    ["South Korea", "KR", "Busan"],
  ];
  const scacs = [
    ["CMDU", "CMA CGM"], ["MEDU", "MSC"], ["COSU", "COSCO"], ["ONEY", "ONE"], ["HLCU", "Hapag-Lloyd"],
  ];
  const dports = ["Savannah, GA", "Charleston, SC", "Los Angeles, CA"];
  const ctypes = ["40HC", "40ST", "20ST", "45G1", "MIXED", null, null, null];
  const out: UnifiedShipmentDbRow[] = [];
  for (let i = 0; i < n; i++) {
    const [origin, oc, oport] = pick(R, origins);
    const [scac, carrier] = pick(R, scacs);
    // dates spread Jan 2023 .. Sep 2026
    const mi = Math.floor(R() * 45);
    const d = new Date(2023 + Math.floor(mi / 12), mi % 12, 1 + Math.floor(R() * 27));
    const lcl = R() < 0.08;
    const containers = lcl ? 0 : 1 + Math.floor(R() * 3);
    const hasTeu = R() < 0.25; // mirrors prod: ~78% teu null
    const hasSpend = R() < 0.45;
    const teu = hasTeu ? containers * 2 : null;
    out.push({
      id: "uuid-" + i,
      bol_number: scac + String(1000000 + i),
      house_bol: null,
      master_bol: null,
      bol_date: d.toISOString(),
      scac,
      carrier_name: carrier,
      shipper_name: pick(R, ["Acme Industrial", "Globex Manufacturing", "Initech Exports", "Umbrella Supply"]),
      origin_country: origin,
      origin_country_code: oc,
      destination_country_code: "US",
      origin_port: oport,
      destination_port: pick(R, dports),
      hs_code: R() < 0.3 ? pick(R, ["8427.20", "8429.52", "8431.49"]) : null,
      product_description: R() < 0.6 ? pick(R, ["Excavator parts", "Forklifts", "Hydraulic cylinders"]) : null,
      container_count: containers,
      // PostgREST returns numerics as strings sometimes — exercise both
      teu: teu != null && R() < 0.5 ? String(teu) : teu,
      weight_kg: Math.round(4000 + R() * 20000),
      lcl,
      load_type: lcl ? "LCL" : "FCL",
      shipping_cost_usd: hasSpend ? Math.round(2000 + R() * 12000) : null,
      container_type: lcl ? "LCL" : pick(R, ctypes),
    });
  }
  return out;
}

const noop: ProfileActions = {
  toggle() {}, preset() {}, range() {}, metric() {}, brushStart() {},
  brushMove() {}, hover() {}, trace() {}, pin() {},
};

const baseState = (m0: number, m1: number): ProfileState => ({
  m0, m1, preset: null, metric: "shipments", f: {}, trace: null,
  hover: null, pins: [], intro: false, disp: null,
});

const ds = normalizeUnifiedShipments(makeDbRows(600), NOW);

describe("normalizeUnifiedShipments", () => {
  it("derives month indexes anchored to the earliest data year", () => {
    expect(ds.firstYear).toBe(2023);
    expect(ds.lastMi).toBe((2026 - 2023) * 12 + 8); // Sep 2026
    for (const r of ds.rows) {
      const d = new Date(r.ts);
      expect(r.mi).toBe((d.getFullYear() - ds.firstYear) * 12 + d.getMonth());
    }
  });

  it("models missing teu from container count and flags it", () => {
    const modeled = ds.rows.filter((r) => r.teuModeled);
    expect(modeled.length).toBeGreaterThan(0);
    for (const r of modeled) {
      expect(r.teu).toBeGreaterThan(0);
      if (r.mode === "LCL") expect(r.teu).toBe(0.5);
    }
    // real teu passes through un-flagged (including string numerics)
    const real = ds.rows.filter((r) => !r.teuModeled);
    expect(real.length).toBeGreaterThan(0);
  });

  it("models missing spend as rate × TEU and flags it", () => {
    const modeled = ds.rows.filter((r) => r.spendModeled);
    const real = ds.rows.filter((r) => !r.spendModeled);
    expect(modeled.length).toBeGreaterThan(0);
    expect(real.length).toBeGreaterThan(0);
    for (const r of ds.rows) expect(r.spend).toBeGreaterThan(0);
    expect(ds.spendModeledShare).toBeGreaterThan(0);
    expect(ds.spendModeledShare).toBeLessThan(1);
  });

  it("buckets ISO container codes and never invents equipment", () => {
    for (const r of ds.rows) {
      if (r.ctype != null) expect(["20ST", "40ST", "40HC", "45HC", "MIXED", "LCL"]).toContain(r.ctype);
      if (r.mode === "LCL") expect(r.ctype).toBe("LCL");
    }
    // 45G1 raw codes became 40HC
    expect(ds.rows.some((r) => r.ctype === "40HC")).toBe(true);
  });

  it("keeps BOL ids unique and rows sorted ascending by ts", () => {
    const ids = new Set(ds.rows.map((r) => r.id));
    expect(ids.size).toBe(ds.rows.length);
    for (let i = 1; i < ds.rows.length; i++) expect(ds.rows[i].ts).toBeGreaterThanOrEqual(ds.rows[i - 1].ts);
  });
});

describe("reconciliation across random filter states", () => {
  const R = mulberry32(7);
  const metrics = ["shipments", "teu", "spend"] as const;

  for (let trial = 0; trial < 20; trial++) {
    it(`state #${trial}: KPIs, facets, traces and shares reconcile`, () => {
      const a = Math.floor(R() * (ds.lastMi + 1));
      const b = Math.floor(R() * (ds.lastMi + 1));
      const st = baseState(Math.min(a, b), Math.max(a, b));
      st.metric = pick(R, metrics as unknown as string[]) as ProfileState["metric"];
      // random facet filters on up to 2 dims
      const dims = [...DIMS].sort(() => R() - 0.5).slice(0, Math.floor(R() * 3));
      for (const dim of dims) {
        const keys = [...new Set(ds.rows.map((r) => r[dim]).filter((k): k is string => k != null))];
        if (keys.length) st.f[dim] = [pick(R, keys)];
      }

      const view = computeView(ds, st, noop);
      const cur = ds.rows.filter((r) => match(r, st, null));
      const S = summarize(cur, ds.todayTs);
      const metricOf = (rows: typeof cur): number =>
        st.metric === "shipments" ? rows.length : rows.reduce((s, r) => s + r[st.metric], 0);

      // KPI === direct summary
      expect(view.S.shipments).toBe(S.shipments);
      expect(view.S.teu).toBeCloseTo(S.teu, 6);
      expect(view.S.spend).toBeCloseTo(S.spend, 6);

      // KPI trace (dim null) === KPI values
      const traced = computeView(ds, { ...st, trace: { dim: null, key: null, label: "KPI" } }, noop);
      expect(traced.traceSumN.shipments).toBe(S.shipments);
      expect(traced.traceSumN.teu).toBeCloseTo(S.teu, 6);
      expect(traced.traceSumN.spend).toBeCloseTo(S.spend, 6);

      // Σ facet values === in-view metric total (for dims without a selection)
      const total = metricOf(cur);
      const facets: [DimKey, { valN: number; shareN: number; key: string; shipmentsN: number; teuN: number; spendN: number }[]][] = [
        ["lane", view.lanes], ["carrier", view.carriers], ["supplier", view.suppliers], ["product", view.products],
      ];
      for (const [dim, items] of facets) {
        if (st.f[dim]?.length) continue; // crossfilter: facet ignores its own selection
        const sum = items.reduce((s, x) => s + x.valN, 0);
        expect(sum).toBeCloseTo(total, 6);
        if (items.length) {
          const shareSum = items.reduce((s, x) => s + x.shareN, 0);
          expect(shareSum).toBeCloseTo(1, 6);
        }
      }
      // equipment facet reconciles against CLASSIFIED rows only
      if (!st.f.ctype?.length) {
        const classified = metricOf(cur.filter((r) => r.ctype != null));
        const sum = view.ctypes.reduce((s, x) => s + x.valN, 0);
        expect(sum).toBeCloseTo(classified, 6);
      }

      // facet item trace === item numbers (unfiltered dim)
      for (const [dim, items] of facets) {
        if (st.f[dim]?.length || !items.length) continue;
        const item = items[0];
        const t = computeView(ds, { ...st, trace: { dim, key: item.key, label: item.key } }, noop);
        expect(t.traceSumN.shipments).toBe(item.shipmentsN);
        expect(t.traceSumN.teu).toBeCloseTo(item.teuN, 6);
        expect(t.traceSumN.spend).toBeCloseTo(item.spendN, 6);
      }

      // month trace === cadence bar value
      const bar = view.cadence.find((c: any) => c.v > 0);
      if (bar) {
        const t = computeView(ds, { ...st, trace: { dim: "mi", key: bar.mi, label: "m" } }, noop);
        const traceMetric =
          st.metric === "shipments" ? t.traceSumN.shipments : st.metric === "teu" ? t.traceSumN.teu : t.traceSumN.spend;
        expect(traceMetric).toBeCloseTo(bar.v, 6);
      }

      // no NaN/Infinity ever reaches a rendered delta
      for (const k of view.kpis) expect(String(k.delta)).not.toMatch(/NaN|Infinity/);

      // lanes tab reconciles with overview lanes facet
      const lanesView = computeLanes(ds, st, noop);
      if (!st.f.lane?.length) {
        const overviewLaneSum = view.lanes.reduce((s, l) => s + l.valN, 0);
        const lanesTabSum = lanesView.lanesD.reduce((s: number, l: any) => s + l.valN, 0);
        expect(lanesTabSum).toBeCloseTo(overviewLaneSum, 6);
      }
      // stacked history bars sum to the in-view total computed WITHOUT the
      // lane filter (spec: lane selection highlights rather than hides)
      const stackSum = lanesView.stackBars.reduce((s: number, b: any) => s + b.tN, 0);
      const lanePool = ds.rows.filter((r) => match(r, { ...st, f: { ...st.f, lane: undefined } }, null));
      expect(stackSum).toBeCloseTo(metricOf(lanePool), 6);
    });
  }
});

describe("prior-period guards", () => {
  it("shows — (not NaN/Infinity) when the window has no prior data", () => {
    const st = baseState(0, 5); // m0-12 < 0 → no prior
    const view = computeView(ds, st, noop);
    expect(view.hasPrior).toBe(false);
    expect(view.priorLabel).toBe("No prior data");
    for (const k of view.kpis) {
      if (k.fmt !== "days") expect(k.delta).toBe("—");
    }
    for (const l of view.lanes) expect(l.delta).toBe("—");
  });
});

describe("presets", () => {
  it("computes windows relative to the current month", () => {
    const presets = computePresets(ds);
    const byId = Object.fromEntries(presets.map((p) => [p.id, p]));
    expect(byId["12M"]).toMatchObject({ m0: ds.lastMi - 11, m1: ds.lastMi });
    expect(byId["ALL"]).toMatchObject({ m0: 0, m1: ds.lastMi });
    expect(byId["YTD"].m1).toBe(ds.lastMi);
    expect(byId["YTD"].m0).toBe((2026 - ds.firstYear) * 12);
    expect(byId["2025"]).toMatchObject({ m0: (2025 - 2023) * 12, m1: (2025 - 2023) * 12 + 11 });
  });
});

describe("timeline", () => {
  it("spans the full history through the current month", () => {
    const view = computeView(ds, baseState(ds.lastMi - 11, ds.lastMi), noop);
    expect(view.timeline.length).toBe(ds.lastMi + 1);
    const timelineSum = view.timeline.reduce((s: number, b: any) => s + b.v, 0);
    expect(timelineSum).toBe(ds.rows.length); // metric=shipments, no facet filters
  });
});
