/**
 * computeDash invariants (Dashboard Brief handoff §5.2 + §6):
 *  - KPI totals reconcile with the Top-accounts list sums
 *  - signals are deterministic per the §3.1 rules
 *  - timeline spans the full history and sums to the row totals
 *  - stage / lane facets behave; deltas never show NaN/Infinity
 */
import { describe, expect, it } from "vitest";
import {
  canonStage,
  computeDash,
  dashPresets,
  type CoMonthRow,
  type DashActions,
  type DashCompany,
  type DashDataset,
  type DashState,
  type LaneMonthRow,
} from "../computeDash";

const noop: DashActions = {
  toggle() {}, preset() {}, metric() {}, brushStart() {}, brushMove() {},
  select() {}, sort() {}, done() {},
};

const NOW = new Date(2026, 8, 27); // Sep 2026
const FY = 2024;
const LAST = (2026 - FY) * 12 + 8; // Sep 2026 → mi 32

function co(key: string, name: string, stage: string, lastActivityDaysAgo: number | null): DashCompany {
  return {
    key,
    uuid: null,
    savedId: "s-" + key,
    name,
    city: "Atlanta, GA",
    stage: canonStage(stage),
    stageRaw: stage,
    topRouteFallback: "CN → US",
    lastActivityTs: lastActivityDaysAgo == null ? null : +NOW - lastActivityDaysAgo * 864e5,
    initials: name.slice(0, 2).toUpperCase(),
  };
}

// Fixture: 4 companies with distinct behaviors.
const COMPANIES: DashCompany[] = [
  co("alpha", "Alpha Imports", "prospecting", 5),      // steady
  co("bravo", "Bravo Freight", "quoting", 10),         // spiking
  co("charlie", "Charlie Goods", "engaged", 120),      // dormant
  co("delta", "Delta Trading", "closed won", 3),       // lane-covered
];

const coRows: CoMonthRow[] = [];
const push = (c: string, mi: number, shipments: number, teu: number) =>
  coRows.push({ c, mi, shipments, teu, spend: teu * 3000 });
for (let mi = 0; mi <= LAST; mi++) {
  push("alpha", mi, 10, 20);
  // bravo: quiet history, 3x spike in the last 3 months
  push("bravo", mi, mi >= LAST - 2 ? 15 : 5, mi >= LAST - 2 ? 30 : 10);
  // charlie: went dark 4 months ago
  if (mi <= LAST - 4) push("charlie", mi, 8, 16);
  push("delta", mi, 4, 8);
}

// Lane rows only for delta (two lanes; one opened 2 months ago)
const laneRows: LaneMonthRow[] = [];
for (let mi = 0; mi <= LAST; mi++) {
  laneRows.push({ c: "delta", lane: "china::united states", fromLabel: "China", toLabel: "United States", mi, shipments: 3, teu: 6, spend: 6 * 3000 });
  if (mi >= LAST - 1)
    laneRows.push({ c: "delta", lane: "vietnam::united states", fromLabel: "Vietnam", toLabel: "United States", mi, shipments: 1, teu: 2, spend: 2 * 3000 });
}

const ds: DashDataset = { companies: COMPANIES, coRows, laneRows, firstYear: FY, lastMi: LAST, todayTs: +NOW };

const st = (over: Partial<DashState> = {}): DashState => ({
  m0: LAST - 11, m1: LAST, preset: "12M", metric: "shipments", f: {},
  sel: null, sort: "value", done: [], intro: false, disp: null, ...over,
});

describe("computeDash", () => {
  it("KPI totals reconcile with the Top-accounts sums (20 random states)", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32);
    for (let t = 0; t < 20; t++) {
      const a = Math.floor(rnd() * (LAST + 1));
      const b = Math.floor(rnd() * (LAST + 1));
      const metric = (["shipments", "teu", "spend"] as const)[Math.floor(rnd() * 3)];
      const v = computeDash(ds, st({ m0: Math.min(a, b), m1: Math.max(a, b), metric }), noop);
      const listSum = v.ranked.reduce((s: number, c: any) => s + c.v, 0);
      const kpi = v.kpis.find((k: any) => k.id === metric)!;
      expect(listSum).toBeCloseTo(kpi.valueN, 6);
      for (const k of v.kpis) expect(String(k.delta)).not.toMatch(/NaN|Infinity/);
    }
  });

  it("signals follow the §3.1 rules deterministically", () => {
    const v = computeDash(ds, st(), noop);
    const types = (key: string) => v.signals.filter((s: any) => s.coKey === key).map((s: any) => s.type);
    expect(types("bravo")).toContain("spike");
    expect(types("charlie")).toContain("dormant");
    expect(types("delta")).toContain("newlane");
    expect(types("alpha")).toEqual([]); // steady shipper: no signals
    expect(v.openSignals).toBe(v.signals.length); // nothing marked done
    const done = computeDash(ds, st({ done: ["charlie:dormant"] }), noop);
    expect(done.openSignals).toBe(done.signals.length - 1);
  });

  it("timeline spans full history and sums to row totals", () => {
    const v = computeDash(ds, st(), noop);
    expect(v.timeline.length).toBe(LAST + 1);
    const sum = v.timeline.reduce((s: number, b: any) => s + b.v, 0);
    expect(sum).toBe(coRows.reduce((s, r) => s + r.shipments, 0));
  });

  it("stage facet groups canonically and pipeline = Engaged+Quoting annualized", () => {
    const v = computeDash(ds, st(), noop);
    const byLabel = Object.fromEntries(v.stages.map((s: any) => [s.label, s]));
    expect(byLabel.Prospect.count).toBe(1);
    expect(byLabel.Quoting.count).toBe(1);
    expect(byLabel.Engaged.count).toBe(1);
    expect(byLabel.Won.count).toBe(1);
    const pipelineKpi = v.kpis.find((k: any) => k.id === "pipeline")!;
    expect(pipelineKpi.valueN).toBeCloseTo(byLabel.Engaged.raw + byLabel.Quoting.raw, 4);
  });

  it("lane filter keeps only lane-covered companies; lane facet reconciles", () => {
    const v = computeDash(ds, st({ f: { lane: ["china::united states"] } }), noop);
    expect(v.ranked.map((c: any) => c.key)).toEqual(["delta"]);
    const kpi = v.kpis.find((k: any) => k.id === "shipments")!;
    expect(kpi.valueN).toBe(4 * 12); // delta's company-level rows in the 12M window
    const noFilter = computeDash(ds, st(), noop);
    const laneSum = noFilter.lanes.reduce((s: number, l: any) => s + l.valN, 0);
    expect(laneSum).toBe(laneRows.filter((r) => r.mi >= LAST - 11).reduce((s, r) => s + r.shipments, 0));
  });

  it("no prior window → deltas render as —, never NaN", () => {
    const v = computeDash(ds, st({ m0: 0, m1: 5 }), noop);
    for (const k of v.kpis) expect(String(k.delta)).not.toMatch(/NaN|Infinity/);
    expect(v.priorLabel).toBe("No prior data");
  });

  it("Intelligence Panel carries ≤24 bars for the selected company", () => {
    const v = computeDash(ds, st({ sel: "alpha" }), noop);
    expect(v.panelOpen).toBe(true);
    expect(v.panel.bars.length).toBeLessThanOrEqual(24);
    expect(v.panel.name).toBe("Alpha Imports");
  });

  it("presets are relative to the current month", () => {
    const p = Object.fromEntries(dashPresets(ds).map((x) => [x.id, x]));
    expect(p["12M"]).toMatchObject({ m0: LAST - 11, m1: LAST });
    expect(p["3M"]).toMatchObject({ m0: LAST - 2, m1: LAST });
    expect(p["YTD"].m1).toBe(LAST);
  });
});
