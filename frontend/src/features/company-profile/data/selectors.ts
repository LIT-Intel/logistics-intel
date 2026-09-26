/**
 * selectors — typed port of the handoff's profile-data.js calculation spec
 * (`match`, `summarize`, `computeView`, `computeLanes`).
 *
 * Pure functions: (dataset, state, actions) → view-model. All filtering is
 * client-side; components render the view-model verbatim. Every displayed
 * number carries a numeric twin (`*N`) so the reconciliation unit test can
 * assert Σ(facet values) === KPI value and trace totals === clicked numbers.
 */
import {
  CARRIER_COLOR,
  CTYPE_COLOR,
  PALETTE,
  deltaTone,
  fmtDate,
  fmtDelta,
  fmtMoney,
  fmtNum,
  miLabel,
  miShort,
  miYear,
} from "./format";
import type {
  DimKey,
  Metric,
  Preset,
  ProfileActions,
  ProfileState,
  ShipmentDataset,
  ShipmentRow,
} from "./types";
import { DIMS, DIM_LABEL } from "./types";

// ---------------------------------------------------------------- presets

/** Presets are relative to the CURRENT month (ds.lastMi), never hardcoded. */
export function computePresets(ds: ShipmentDataset): Preset[] {
  const last = ds.lastMi;
  const curYear = miYear(last, ds.firstYear);
  const yearPreset = (y: number): Preset => {
    const m0 = (y - ds.firstYear) * 12;
    return { id: String(y), label: String(y), m0, m1: Math.min(last, m0 + 11) };
  };
  const out: Preset[] = [
    { id: "12M", label: "Last 12M", m0: Math.max(0, last - 11), m1: last },
    { id: "YTD", label: "YTD", m0: (curYear - ds.firstYear) * 12, m1: last },
  ];
  for (let y = curYear - 1; y >= Math.max(ds.firstYear, curYear - 3); y--) out.push(yearPreset(y));
  out.push({ id: "ALL", label: "All time", m0: 0, m1: last });
  return out;
}

// ---------------------------------------------------------------- matching

/** Row in view? Time window + every facet filter (optionally skipping one dim
 *  — the crossfilter rule — or skipping the time window for the brush). */
export function match(
  r: ShipmentRow,
  st: Pick<ProfileState, "m0" | "m1" | "f">,
  skip: DimKey | "time" | null,
): boolean {
  if (skip !== "time" && (r.mi < st.m0 || r.mi > st.m1)) return false;
  for (const d of DIMS) {
    if (d === skip) continue;
    const v = st.f[d];
    if (v && v.length && !v.includes(r[d] as string)) return false;
  }
  return true;
}

// ---------------------------------------------------------------- summarize

export interface Summary {
  shipments: number;
  teu: number;
  spend: number;
  containers: number;
  weight: number;
  lanes: number;
  carriers: number;
  suppliers: number;
  avgTeu: number;
  last: ShipmentRow | null;
  lastDays: number | null;
  teuModeled: boolean;
  spendModeled: boolean;
}

export function summarize(rows: ShipmentRow[], todayTs: number): Summary {
  const s = { shipments: rows.length, teu: 0, spend: 0, containers: 0, weight: 0 };
  const L = new Set<string>(), C = new Set<string>(), S = new Set<string>();
  let last: ShipmentRow | null = null;
  let teuModeled = false, spendModeled = false;
  for (const r of rows) {
    s.teu += r.teu; s.spend += r.spend; s.containers += r.containers; s.weight += r.weight;
    L.add(r.lane); C.add(r.carrier); S.add(r.supplier);
    if (!last || r.ts > last.ts) last = r;
    if (r.teuModeled) teuModeled = true;
    if (r.spendModeled) spendModeled = true;
  }
  return {
    ...s,
    lanes: L.size, carriers: C.size, suppliers: S.size,
    avgTeu: rows.length ? s.teu / rows.length : 0,
    last,
    lastDays: last ? Math.round((todayTs - last.ts) / 864e5) : null,
    teuModeled, spendModeled,
  };
}

// ------------------------------------------------------- stable color maps

interface DatasetMeta {
  laneColor: Map<string, string>;
  laneLabel: Map<string, string>;
  laneOc: Map<string, string>;
  laneOrigin: Map<string, string>;
  lanePorts: Map<string, { oPort: string; dPort: string }>;
  carrierColor: Map<string, string>;
  carrierName: Map<string, string>;
}

const metaCache = new WeakMap<ShipmentDataset, DatasetMeta>();

/** Colors + labels are assigned by all-time rank and are stable per key —
 *  changing the window or filters never recolors a lane/carrier. */
function datasetMeta(ds: ShipmentDataset): DatasetMeta {
  const hit = metaCache.get(ds);
  if (hit) return hit;
  const laneCount = new Map<string, number>();
  const carrierCount = new Map<string, number>();
  const laneOrigin = new Map<string, Map<string, number>>();
  const laneOPort = new Map<string, Map<string, number>>();
  const laneDPort = new Map<string, Map<string, number>>();
  const carrierName = new Map<string, string>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const bumpSub = (m: Map<string, Map<string, number>>, k: string, sub: string) => {
    if (!sub) return;
    let inner = m.get(k);
    if (!inner) m.set(k, (inner = new Map()));
    bump(inner, sub);
  };
  for (const r of ds.rows) {
    bump(laneCount, r.lane);
    bump(carrierCount, r.carrier);
    bumpSub(laneOrigin, r.lane, r.origin);
    bumpSub(laneOPort, r.lane, r.oPort);
    bumpSub(laneDPort, r.lane, r.dPort);
    if (!carrierName.has(r.carrier)) carrierName.set(r.carrier, r.carrierName);
  }
  const top = (m: Map<string, number> | undefined): string => {
    if (!m || !m.size) return "";
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const rank = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const laneColor = new Map<string, string>();
  rank(laneCount).forEach((k, i) => laneColor.set(k, PALETTE[i % PALETTE.length]));
  const carrierColor = new Map<string, string>();
  rank(carrierCount).forEach((k, i) => carrierColor.set(k, CARRIER_COLOR[k] ?? PALETTE[i % PALETTE.length]));
  const laneLabel = new Map<string, string>();
  const laneOc = new Map<string, string>();
  const laneOriginOut = new Map<string, string>();
  const lanePorts = new Map<string, { oPort: string; dPort: string }>();
  for (const k of laneCount.keys()) {
    const [oc, dc] = k.split("-");
    const origin = top(laneOrigin.get(k)) || oc;
    laneOc.set(k, oc);
    laneOriginOut.set(k, origin);
    laneLabel.set(k, origin + " → " + (dc || "US"));
    lanePorts.set(k, { oPort: top(laneOPort.get(k)), dPort: top(laneDPort.get(k)) });
  }
  const meta: DatasetMeta = {
    laneColor, laneLabel, laneOc, laneOrigin: laneOriginOut, lanePorts, carrierColor, carrierName,
  };
  metaCache.set(ds, meta);
  return meta;
}

export function labelOf(ds: ShipmentDataset, dim: DimKey, key: string): string {
  const meta = datasetMeta(ds);
  if (dim === "lane") return meta.laneLabel.get(key) ?? key;
  if (dim === "carrier") return meta.carrierName.get(key) ?? key;
  return key;
}

// ---------------------------------------------------------------- KPI defs

interface KpiDef {
  id: string;
  label: string;
  icon: string;
  fmt: "num" | "money" | "dec1" | "days";
  unit: string;
}

const KDEFS: KpiDef[] = [
  { id: "shipments", label: "Shipments", icon: "ship", fmt: "num", unit: "BOLs" },
  { id: "teu", label: "TEU", icon: "container", fmt: "num", unit: "twenty-ft equiv." },
  { id: "spend", label: "Est. freight spend", icon: "dollar-sign", fmt: "money", unit: "lane rate × TEU" },
  { id: "containers", label: "Containers", icon: "package", fmt: "num", unit: "FCL boxes" },
  { id: "lanes", label: "Active lanes", icon: "route", fmt: "num", unit: "origin countries" },
  { id: "avgTeu", label: "Avg TEU / shipment", icon: "layers", fmt: "dec1", unit: "per BOL" },
  { id: "carriers", label: "Carriers", icon: "anchor", fmt: "num", unit: "ocean lines" },
  { id: "suppliers", label: "Suppliers", icon: "factory", fmt: "num", unit: "shippers of record" },
  { id: "lastDays", label: "Last shipment", icon: "calendar-clock", fmt: "days", unit: "" },
];
export const KPI_IDS = KDEFS.map((k) => ({ id: k.id, label: k.label }));

const fmtK = (fmt: KpiDef["fmt"], v: number | null | undefined): string =>
  v == null ? "—" : fmt === "money" ? fmtMoney(v) : fmt === "dec1" ? v.toFixed(1) : fmt === "days" ? Math.round(v) + "d" : fmtNum(v);

// ---------------------------------------------------------------- rowOut

export interface TraceRowVM {
  id: string;
  date: string;
  lane: string;
  oc: string;
  route: string;
  carrier: string;
  scac: string;
  equip: string;
  teu: string;
  spend: string;
  spendModeled: boolean;
  product: string;
  supplier: string;
  weight: string;
  color: string;
  onClick: () => void;
}

function rowOut(ds: ShipmentDataset, r: ShipmentRow, A: ProfileActions): TraceRowVM {
  const meta = datasetMeta(ds);
  return {
    id: r.id,
    date: fmtDate(r.ts),
    lane: meta.laneLabel.get(r.lane) ?? r.lane,
    oc: r.oc,
    route: (r.oPort || r.origin) + " → " + (r.dPort || r.dc),
    carrier: r.carrierName,
    scac: r.carrier,
    equip: r.mode === "LCL" ? "LCL" : r.containers + "× " + (r.ctype ?? "cntr"),
    teu: r.teu % 1 ? r.teu.toFixed(1) : String(r.teu),
    spend: fmtMoney(r.spend),
    spendModeled: r.spendModeled,
    product: r.product,
    supplier: r.supplier,
    weight: fmtNum(r.weight) + " kg",
    color: meta.laneColor.get(r.lane) ?? PALETTE[0],
    onClick: () => A.trace("id", r.id, "BOL " + r.id),
  };
}

// ---------------------------------------------------------------- facets

export interface FacetItemVM {
  key: string;
  rank: string;
  label: string;
  sub: string;
  color: string;
  val: string;
  valN: number;
  share: string;
  shareN: number;
  s: number;
  w: string;
  shipments: string;
  shipmentsN: number;
  teu: string;
  teuN: number;
  spend: string;
  spendN: number;
  delta: string;
  deltaN: number | null;
  deltaFg: string;
  deltaBg: string;
  active: boolean;
  dimmed: boolean;
  opacity: number;
  checkBg: string;
  checkBorder: string;
  rowBg: string;
  onClick: () => void;
  onTrace: (e?: { stopPropagation?: () => void }) => void;
}

// ---------------------------------------------------------------- view

export interface ProfileView {
  S: Summary;
  pS: number | null;
  kpis: any[];
  pinnedKpis: any[];
  targets: Record<string, number>;
  timeline: any[];
  years: any[];
  brush: { left: string; width: string };
  cadence: any[];
  readout: { title: string; value: string; sub: string };
  rbTicks: any[];
  lanes: (FacetItemVM & { oc: string; origin: string; oPort: string; dPort: string })[];
  carriers: FacetItemVM[];
  suppliers: FacetItemVM[];
  products: FacetItemVM[];
  ctypes: (FacetItemVM & { checkable: true })[];
  ctypeCoverage: number; // share of in-view rows with a known ctype
  tokens: any[];
  hasTokens: boolean;
  presets: any[];
  metrics: any[];
  recent: TraceRowVM[];
  traceOpen: boolean;
  traceRows: TraceRowVM[];
  traceTitle: string;
  traceSum: string;
  traceSumN: { shipments: number; teu: number; spend: number };
  heat: any[];
  hmMonths: any[];
  story: any;
  nMonths: number;
  periodLabel: string;
  priorLabel: string;
  unitM: string;
  totalBols: string;
  bolsInView: string;
  hasPrior: boolean;
  modeled: { teu: boolean; spend: boolean };
}

export function computeView(ds: ShipmentDataset, st: ProfileState, A: ProfileActions): ProfileView {
  const meta = datasetMeta(ds);
  const metric = st.metric;
  const ROWS = ds.rows;
  const LAST_MI = ds.lastMi;
  const FY = ds.firstYear;
  const mv = (r: ShipmentRow): number => (metric === "shipments" ? 1 : r[metric]);
  const fmtM = (v: number): string => (metric === "spend" ? fmtMoney(v) : fmtNum(v));
  const unitM = metric === "shipments" ? "shipments" : metric === "teu" ? "TEU" : "est. spend";
  const hasPrior = st.m0 - 12 >= 0;
  const pst = { ...st, m0: st.m0 - 12, m1: st.m1 - 12 };
  const cur = ROWS.filter((r) => match(r, st, null));
  const prior = hasPrior ? ROWS.filter((r) => match(r, pst, null)) : [];
  const S = summarize(cur, ds.todayTs);
  const P = summarize(prior, ds.todayTs);
  const periodLabel = st.m0 === st.m1 ? miLabel(st.m0, FY) : miLabel(st.m0, FY) + " → " + miLabel(st.m1, FY);
  const priorLabel = hasPrior
    ? pst.m0 === pst.m1 ? miLabel(pst.m0, FY) : miLabel(pst.m0, FY) + " → " + miLabel(pst.m1, FY)
    : "No prior data";
  const nMonths = st.m1 - st.m0 + 1;

  // monthly series in range (sparks + cadence)
  type MonthAgg = { shipments: number; teu: number; spend: number; containers: number };
  const byMi: Record<number, MonthAgg> = {};
  const byMiP: Record<number, MonthAgg> = {};
  for (const r of cur) {
    const o = byMi[r.mi] || (byMi[r.mi] = { shipments: 0, teu: 0, spend: 0, containers: 0 });
    o.shipments++; o.teu += r.teu; o.spend += r.spend; o.containers += r.containers;
  }
  for (const r of prior) {
    const o = byMiP[r.mi + 12] || (byMiP[r.mi + 12] = { shipments: 0, teu: 0, spend: 0, containers: 0 });
    o.shipments++; o.teu += r.teu; o.spend += r.spend; o.containers += r.containers;
  }
  const spark = (key: keyof MonthAgg): string => {
    const vals: number[] = [];
    for (let mi = st.m0; mi <= st.m1; mi++) vals.push(byMi[mi] ? byMi[mi][key] : 0);
    const mx = Math.max(1, ...vals);
    if (vals.length < 2) return "M0 14 L100 14";
    return vals
      .map((v, i) => (i ? "L" : "M") + ((i / (vals.length - 1)) * 100).toFixed(1) + " " + (26 - (v / mx) * 22).toFixed(1))
      .join(" ");
  };

  const disp = st.disp || {};
  const kpis = KDEFS.map((k) => {
    const raw = (S as any)[k.id] as number | null;
    const v = disp[k.id] != null && k.fmt !== "days" ? disp[k.id] : raw;
    const p = k.fmt === "days" ? null : hasPrior && (P as any)[k.id] ? (((S as any)[k.id] - (P as any)[k.id]) / (P as any)[k.id]) : null;
    const tone = deltaTone(p);
    const modeled = (k.id === "teu" && S.teuModeled) || (k.id === "spend" && S.spendModeled) || (k.id === "avgTeu" && S.teuModeled);
    return {
      ...k,
      value: fmtK(k.fmt, v),
      valueN: raw ?? 0,
      modeled,
      delta: k.fmt === "days" ? "" : fmtDelta(p),
      deltaN: p,
      deltaFg: tone.fg,
      deltaBg: tone.bg,
      deltaIcon: tone.icon,
      prior: k.fmt === "days" ? (S.last ? fmtDate(S.last.ts) : "—") : "prior " + fmtK(k.fmt, (P as any)[k.id] || 0),
      spark: ["shipments", "teu", "spend", "containers"].includes(k.id) ? spark(k.id as keyof MonthAgg) : "",
      hasSpark: ["shipments", "teu", "spend", "containers"].includes(k.id),
      pinned: !st.pins || st.pins.includes(k.id),
      onPin: () => A.pin(k.id),
      onTrace: () => A.trace(null, null, k.label),
    };
  });
  const targets: Record<string, number> = {};
  KDEFS.forEach((k) => { if (k.fmt !== "days") targets[k.id] = (S as any)[k.id] || 0; });

  // full-history timeline (time filter skipped, facet filters respected)
  const tl: Record<number, number> = {};
  for (const r of ROWS) if (match(r, st, "time")) tl[r.mi] = (tl[r.mi] || 0) + mv(r);
  const tlVals: number[] = [];
  for (let mi = 0; mi <= LAST_MI; mi++) tlVals.push(tl[mi] || 0);
  const tlMax = Math.max(1, ...tlVals);
  const N = LAST_MI + 1;
  const timeline = tlVals.map((v, mi) => ({
    mi,
    v,
    s: st.intro ? 0 : Math.max(0.02, v / tlMax),
    sel: mi >= st.m0 && mi <= st.m1,
    bg: mi >= st.m0 && mi <= st.m1 ? "#3b82f6" : "#CBD5E1",
    label: miLabel(mi, FY) + " · " + fmtM(v) + " " + unitM,
    onDown: (e?: { preventDefault?: () => void }) => { e?.preventDefault?.(); A.brushStart(mi); },
    onEnter: () => A.brushMove(mi),
  }));
  const nYears = Math.ceil(N / 12);
  const years = Array.from({ length: nYears }, (_, y) => ({
    label: String(FY + y),
    left: ((y * 12) / N * 100).toFixed(2) + "%",
    width: (Math.min(12, N - y * 12) / N * 100).toFixed(2) + "%",
  }));
  const brush = {
    left: ((st.m0 / N) * 100).toFixed(2) + "%",
    width: (((st.m1 - st.m0 + 1) / N) * 100).toFixed(2) + "%",
  };

  // cadence (range bars, current vs same-month prior year)
  const rb: { mi: number; v: number; pv: number }[] = [];
  let rbMax = 1;
  for (let mi = st.m0; mi <= st.m1; mi++) {
    const v = byMi[mi] ? (metric === "shipments" ? byMi[mi].shipments : byMi[mi][metric]) : 0;
    const pv = byMiP[mi] ? (metric === "shipments" ? byMiP[mi].shipments : byMiP[mi][metric]) : 0;
    rb.push({ mi, v, pv });
    rbMax = Math.max(rbMax, v, pv);
  }
  const hov = st.hover;
  const cadence = rb.map((b, i) => ({
    ...b,
    label: nMonths > 18 ? (b.mi % 12 === 0 ? String(miYear(b.mi, FY)) : "") : miShort(b.mi),
    s: st.intro ? 0 : Math.max(0.01, b.v / rbMax),
    ps: st.intro ? 0 : Math.max(0.01, b.pv / rbMax),
    delay: Math.min(i * 18, 400),
    bg: hov == null || hov === b.mi ? "#3b82f6" : "#93C5FD",
    onEnter: () => A.hover(b.mi),
    onClick: () => A.trace("mi", b.mi, miLabel(b.mi, FY)),
  }));
  const hb = hov != null ? rb.find((b) => b.mi === hov) : null;
  const readout = hb
    ? {
        title: miLabel(hb.mi, FY),
        value: fmtM(hb.v),
        sub: hasPrior ? "vs " + fmtM(hb.pv) + " in " + miLabel(hb.mi - 12, FY) + " (" + fmtDelta(hb.pv ? (hb.v - hb.pv) / hb.pv : null) + ")" : "",
      }
    : {
        title: periodLabel,
        value: fmtM(rb.reduce((a, b) => a + b.v, 0)),
        sub: hasPrior ? "vs " + fmtM(rb.reduce((a, b) => a + b.pv, 0)) + " prior period" : "No prior period",
      };
  const rbTicks = [1, 0.5].map((f) => ({ label: fmtM(rbMax * f), top: (1 - f) * 100 + "%" }));

  // facets (crossfilter: computed with all filters except their own dim)
  const facet = (dim: DimKey, subOf?: (key: string) => string): FacetItemVM[] => {
    const rows = ROWS.filter((r) => match(r, st, dim) && (dim !== "ctype" || r.ctype != null));
    const g: Record<string, { key: string; shipments: number; teu: number; spend: number; containers: number }> = {};
    for (const r of rows) {
      const key = r[dim] as string | null;
      if (key == null) continue;
      const o = g[key] || (g[key] = { key, shipments: 0, teu: 0, spend: 0, containers: 0 });
      o.shipments++; o.teu += r.teu; o.spend += r.spend; o.containers += r.containers;
    }
    const pg: Record<string, number> = {};
    if (hasPrior) for (const r of ROWS) if (match(r, pst, dim) && (dim !== "ctype" || r.ctype != null)) {
      const key = r[dim] as string | null;
      if (key != null) pg[key] = (pg[key] || 0) + mv(r);
    }
    const arr = Object.values(g)
      .map((x) => ({ ...x, val: metric === "shipments" ? x.shipments : x[metric] }))
      .sort((a, b) => b.val - a.val);
    const tot = arr.reduce((a, x) => a + x.val, 0) || 1;
    const mx = arr.length ? arr[0].val : 1;
    const sel = st.f[dim] || [];
    return arr.map((x, i) => {
      const p = pg[x.key] ? (x.val - pg[x.key]) / pg[x.key] : null;
      const tone = deltaTone(p);
      const active = sel.includes(x.key);
      const color =
        dim === "lane" ? meta.laneColor.get(x.key) ?? PALETTE[i % PALETTE.length]
        : dim === "carrier" ? meta.carrierColor.get(x.key) ?? PALETTE[i % PALETTE.length]
        : dim === "ctype" ? CTYPE_COLOR[x.key] ?? PALETTE[i % PALETTE.length]
        : PALETTE[i % PALETTE.length];
      return {
        key: x.key,
        rank: String(i + 1).padStart(2, "0"),
        label: labelOf(ds, dim, x.key),
        sub: subOf ? subOf(x.key) : "",
        color,
        val: fmtM(x.val),
        valN: x.val,
        share: Math.round((x.val / tot) * 100) + "%",
        shareN: x.val / tot,
        s: st.intro ? 0 : x.val / mx,
        w: ((x.val / tot) * 100).toFixed(2) + "%",
        shipments: fmtNum(x.shipments),
        shipmentsN: x.shipments,
        teu: fmtNum(x.teu),
        teuN: x.teu,
        spend: fmtMoney(x.spend),
        spendN: x.spend,
        delta: fmtDelta(p),
        deltaN: p,
        deltaFg: tone.fg,
        deltaBg: tone.bg,
        active,
        dimmed: sel.length > 0 && !active,
        opacity: sel.length > 0 && !active ? 0.45 : 1,
        checkBg: active ? "#3b82f6" : "#FFFFFF",
        checkBorder: active ? "#3b82f6" : "#CBD5E1",
        rowBg: active ? "rgba(59,130,246,0.07)" : "transparent",
        onClick: () => A.toggle(dim, x.key),
        onTrace: (e?: { stopPropagation?: () => void }) => { e?.stopPropagation?.(); A.trace(dim, x.key, labelOf(ds, dim, x.key)); },
      };
    });
  };

  const lanes = facet("lane", (k) => {
    const p = meta.lanePorts.get(k);
    return p && p.oPort ? p.oPort + " → " + (p.dPort || "US") : "";
  }).map((l) => ({
    ...l,
    oc: meta.laneOc.get(l.key) ?? l.key.split("-")[0],
    origin: meta.laneOrigin.get(l.key) ?? l.key,
    oPort: meta.lanePorts.get(l.key)?.oPort ?? "",
    dPort: meta.lanePorts.get(l.key)?.dPort ?? "",
  }));
  const carriers = facet("carrier", (k) => k);
  const suppliers = facet("supplier", (k) => {
    const row = ROWS.find((r) => r.supplier === k);
    return row ? row.origin : "";
  });
  const products = facet("product", (k) => {
    const row = ROWS.find((r) => r.product === k);
    return row && row.hs ? "HS " + row.hs : "";
  });
  const ctypes = facet("ctype", (k) =>
    k === "LCL" ? "Less than container" : k === "20ST" ? "20ft standard" : k === "40ST" ? "40ft standard" : k === "40HC" ? "40ft high cube" : k === "45HC" ? "45ft high cube" : k === "MIXED" ? "Mixed equipment" : k,
  ).map((c) => ({ ...c, checkable: true as const }));
  const ctypeKnown = cur.filter((r) => r.ctype != null).length;
  const ctypeCoverage = cur.length ? ctypeKnown / cur.length : 0;

  const tokens: any[] = [];
  DIMS.forEach((d) =>
    (st.f[d] || []).forEach((k) =>
      tokens.push({ dim: DIM_LABEL[d], label: labelOf(ds, d, k), onRemove: () => A.toggle(d, k) }),
    ),
  );
  const presets = computePresets(ds).map((p) => ({
    ...p,
    active: st.preset === p.id,
    bg: st.preset === p.id ? "#0F172A" : "transparent",
    fg: st.preset === p.id ? "#FFFFFF" : "#475569",
    onClick: () => A.preset(p.id),
  }));
  const metrics = ([["shipments", "Shipments"], ["teu", "TEU"], ["spend", "Spend"]] as [Metric, string][]).map(
    ([id, label]) => ({
      id,
      label,
      active: metric === id,
      bg: metric === id ? "#FFFFFF" : "transparent",
      fg: metric === id ? "#0F172A" : "#64748b",
      shadow: metric === id ? "0 1px 3px rgba(15,23,42,0.12)" : "none",
      onClick: () => A.metric(id),
    }),
  );

  const recent = cur.slice().sort((a, b) => b.ts - a.ts).slice(0, 8).map((r) => rowOut(ds, r, A));

  // trace
  let traceRows: TraceRowVM[] = [];
  let traceTitle = "";
  let traceSum = "";
  let traceSumN = { shipments: 0, teu: 0, spend: 0 };
  if (st.trace) {
    const t = st.trace;
    const tr = cur
      .filter((r) =>
        t.dim == null ? true
        : t.dim === "mi" ? r.mi === t.key
        : t.dim === "id" ? r.id === t.key
        : (r as any)[t.dim] === t.key && (t.mi == null || r.mi === t.mi),
      )
      .sort((a, b) => b.ts - a.ts);
    const ts = summarize(tr, ds.todayTs);
    traceTitle = t.label;
    traceSum = fmtNum(ts.shipments) + " BOLs · " + fmtNum(ts.teu) + " TEU · " + fmtMoney(ts.spend);
    traceSumN = { shipments: ts.shipments, teu: ts.teu, spend: ts.spend };
    traceRows = tr.slice(0, 150).map((r) => rowOut(ds, r, A));
  }

  // heatmap: lanes × months
  const hmMonths: { mi: number; label: string }[] = [];
  for (let mi = st.m0; mi <= st.m1; mi++)
    hmMonths.push({ mi, label: nMonths > 18 ? (mi % 12 === 0 ? "'" + String(miYear(mi, FY)).slice(2) : "") : miShort(mi) });
  const hmG: Record<string, number> = {};
  let hmMax = 1;
  for (const r of cur) {
    const k = r.lane + "|" + r.mi;
    hmG[k] = (hmG[k] || 0) + mv(r);
    hmMax = Math.max(hmMax, hmG[k]);
  }
  const heat = lanes.map((l) => ({
    label: l.label,
    color: l.color,
    total: l.val,
    cells: hmMonths.map((m) => {
      const v = hmG[l.key + "|" + m.mi] || 0;
      return {
        v: v ? fmtM(v) : "",
        vN: v,
        bg: v ? `rgba(59,130,246,${(0.12 + (0.88 * v) / hmMax).toFixed(2)})` : "#F1F5F9",
        fg: v / hmMax > 0.5 ? "#FFFFFF" : "#1e3a8a",
        title: l.label + " · " + miLabel(m.mi, FY) + " · " + fmtM(v),
        onClick: () => v && A.trace("lane", l.key, l.label + " · " + miLabel(m.mi, FY), m.mi),
      };
    }),
  }));

  const top = lanes.find((l) => !l.dimmed) || lanes[0];
  const topC = carriers[0];
  const pS = hasPrior && P.shipments ? (S.shipments - P.shipments) / P.shipments : null;
  const story = {
    shipments: fmtNum(disp.shipments != null ? disp.shipments : S.shipments),
    teu: fmtNum(disp.teu != null ? disp.teu : S.teu),
    spend: fmtMoney(disp.spend != null ? disp.spend : S.spend),
    lanes: String(S.lanes),
    period: periodLabel,
    delta: fmtDelta(pS),
    deltaFg: deltaTone(pS).fg,
    direction: pS == null ? "with no prior period to compare" : pS >= 0 ? "up" : "down",
    topLane: top ? top.label : "—",
    topShare: top ? top.share : "—",
    topCarrier: topC ? topC.label : "—",
    topCarrierShare: topC ? topC.share : "—",
    lastDate: S.last ? fmtDate(S.last.ts) : "—",
    lastDays: S.lastDays != null ? S.lastDays + " days ago" : "—",
  };

  return {
    S, pS, kpis, targets,
    pinnedKpis: kpis.filter((k) => k.pinned),
    timeline, years, brush, cadence, readout, rbTicks,
    lanes, carriers, suppliers, products, ctypes, ctypeCoverage,
    tokens, hasTokens: tokens.length > 0, presets, metrics, recent,
    traceOpen: !!st.trace, traceRows, traceTitle, traceSum, traceSumN,
    heat, hmMonths, story, nMonths, periodLabel, priorLabel, unitM,
    totalBols: fmtNum(ROWS.length), bolsInView: fmtNum(cur.length), hasPrior,
    modeled: { teu: S.teuModeled, spend: S.spendModeled },
  };
}

// ---------------------------------------------------------------- lanes tab

function matchFacets(r: ShipmentRow, st: ProfileState, skips: DimKey[]): boolean {
  for (const d of DIMS) {
    if (skips.includes(d)) continue;
    const v = st.f[d];
    if (v && v.length && !v.includes(r[d] as string)) return false;
  }
  return true;
}

export function computeLanes(ds: ShipmentDataset, st: ProfileState, A: ProfileActions) {
  const meta = datasetMeta(ds);
  const metric = st.metric;
  const FY = ds.firstYear;
  const LAST_MI = ds.lastMi;
  const mv = (r: ShipmentRow): number => (metric === "shipments" ? 1 : r[metric]);
  const fmtM = (v: number): string => (metric === "spend" ? fmtMoney(v) : fmtNum(v));
  const pool = ds.rows.filter((r) => matchFacets(r, st, ["lane"]));
  const sel = st.f.lane || [];
  const cur = pool.filter((r) => r.mi >= st.m0 && r.mi <= st.m1);
  const nM = st.m1 - st.m0 + 1;
  const tot = cur.reduce((a, r) => a + mv(r), 0) || 1;
  const sumIn = (id: string, a: number, b: number): number =>
    pool.reduce((s, r) => s + (r.lane === id && r.mi >= a && r.mi <= b ? mv(r) : 0), 0);
  const hasP1 = st.m0 - 12 >= 0;
  const hasP2 = st.m0 - 24 >= 0;
  const laneKeys = [...new Set(cur.map((r) => r.lane))];

  let L = laneKeys
    .map((laneId) => {
      const rs = cur.filter((r) => r.lane === laneId);
      if (!rs.length) return null;
      const S = summarize(rs, ds.todayTs);
      const val = rs.reduce((a, r) => a + mv(r), 0);
      const p1 = hasP1 ? sumIn(laneId, st.m0 - 12, st.m1 - 12) : null;
      const p2 = hasP2 ? sumIn(laneId, st.m0 - 24, st.m1 - 24) : null;
      const g: Record<string, number> = {};
      rs.forEach((r) => (g[r.carrier] = (g[r.carrier] || 0) + mv(r)));
      const carriers = Object.entries(g)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => ({
          key: k,
          label: meta.carrierName.get(k) ?? k,
          color: meta.carrierColor.get(k) ?? PALETTE[0],
          share: Math.round((v / val) * 100) + "%",
          shareN: v / val,
          w: ((v / val) * 100).toFixed(2) + "%",
          onClick: () => A.toggle("carrier", k),
        }));
      const topOf = (key: keyof ShipmentRow): string => {
        const m: Record<string, number> = {};
        rs.forEach((r) => { const v = r[key]; if (v != null && v !== "") m[String(v)] = (m[String(v)] || 0) + 1; });
        const e = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
        return e ? e[0] : "—";
      };
      const fcl = rs.filter((r) => r.mode === "FCL").length / rs.length;
      const vals: number[] = [];
      for (let mi = st.m0; mi <= st.m1; mi++) vals.push(rs.reduce((a, r) => a + (r.mi === mi ? mv(r) : 0), 0));
      const mx = Math.max(1, ...vals);
      const spark =
        vals.length < 2
          ? "M0 14 L100 14"
          : vals.map((v, i) => (i ? "L" : "M") + ((i / (vals.length - 1)) * 100).toFixed(1) + " " + (26 - (v / mx) * 22).toFixed(1)).join(" ");
      const all = pool.filter((r) => r.lane === laneId);
      const pc = p1 ? (val - p1) / p1 : null;
      const tone = deltaTone(pc);
      const active = sel.includes(laneId);
      const ports = meta.lanePorts.get(laneId);
      return {
        key: laneId,
        label: meta.laneLabel.get(laneId) ?? laneId,
        route: ports && ports.oPort ? ports.oPort + " → " + (ports.dPort || "US") : "",
        oc: meta.laneOc.get(laneId) ?? laneId.split("-")[0],
        color: meta.laneColor.get(laneId) ?? PALETTE[0],
        val, valN: val, valFmt: fmtM(val), p1, p2,
        share: Math.round((val / tot) * 100) + "%",
        shareN: val / tot,
        shipments: fmtNum(S.shipments), shipmentsN: S.shipments,
        teu: fmtNum(S.teu), teuN: S.teu,
        spend: fmtMoney(S.spend), spendN: S.spend,
        containers: fmtNum(S.containers),
        delta: fmtDelta(pc), deltaN: pc, deltaFg: tone.fg, deltaBg: tone.bg,
        carriers,
        topCarrier: carriers[0]?.label ?? "—",
        topSupplier: topOf("supplier"),
        topProduct: topOf("product"),
        topEquip: topOf("ctype"),
        fcl: Math.round(fcl * 100) + "%",
        lcl: Math.round((1 - fcl) * 100) + "%",
        last: S.last ? fmtDate(S.last.ts) : "—",
        lastDays: S.lastDays != null ? S.lastDays + "d ago" : "—",
        first: all.length ? fmtDate(all[0].ts) : "—",
        spark,
        active,
        opacity: sel.length && !active ? 0.45 : 1,
        ring: active ? "0 0 0 2px #3b82f6" : "none",
        border: active ? "#3b82f6" : "#E5E7EB",
        onClick: () => A.toggle("lane", laneId),
        onTrace: (e?: { stopPropagation?: () => void }) => { e?.stopPropagation?.(); A.trace("lane", laneId, meta.laneLabel.get(laneId) ?? laneId); },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => b.val - a.val);

  const maxV = L.length ? L[0].val : 1;
  const yMax = Math.max(1, ...L.map((l) => Math.max(l.val, l.p1 || 0, l.p2 || 0)));
  const lanesD = L.map((l, i) => ({
    ...l,
    rank: String(i + 1).padStart(2, "0"),
    mixS: st.intro ? 0 : l.val / maxV,
    mixW: ((l.val / maxV) * 100).toFixed(2) + "%",
    yoy: [
      { label: "−24M", v: l.p2 == null ? "n/a" : fmtM(l.p2), s: st.intro || l.p2 == null ? 0 : l.p2 / yMax, bg: "#E2E8F0" },
      { label: "−12M", v: l.p1 == null ? "n/a" : fmtM(l.p1), s: st.intro || l.p1 == null ? 0 : l.p1 / yMax, bg: "#94a3b8" },
      { label: "Now", v: fmtM(l.val), s: st.intro ? 0 : l.val / yMax, bg: l.color },
    ],
  }));

  const carrierLegend = [...new Set(cur.map((r) => r.carrier))].map((k) => ({
    label: meta.carrierName.get(k) ?? k,
    color: meta.carrierColor.get(k) ?? PALETTE[0],
  }));

  // domestic leg: loads per port of entry (Σ containers, LCL counts 1)
  const dg: Record<string, { port: string; shipments: number; loads: number }> = {};
  cur.forEach((r) => {
    const port = r.dPort || "Unknown port";
    const o = dg[port] || (dg[port] = { port, shipments: 0, loads: 0 });
    o.shipments++;
    o.loads += r.containers || 1;
  });
  const dray = Object.values(dg)
    .sort((a, b) => b.loads - a.loads)
    .map((d) => ({
      port: d.port,
      miles: null as number | null, // resolved by the DomesticLeg component (port→HQ lookup)
      shipments: fmtNum(d.shipments),
      loads: fmtNum(d.loads),
      loadsN: d.loads,
      perMonth: (d.loads / nM).toFixed(1),
    }));
  const drayTotalN = Object.values(dg).reduce((a, d) => a + d.loads, 0);

  // history: stacked months
  const stack: { mi: number; segs: { color: string; v: number }[]; t: number }[] = [];
  let sMax = 1;
  for (let mi = st.m0; mi <= st.m1; mi++) {
    const segs = lanesD.map((l) => ({
      color: l.color,
      v: cur.reduce((a, r) => a + (r.lane === l.key && r.mi === mi ? mv(r) : 0), 0),
    }));
    const t = segs.reduce((a, s) => a + s.v, 0);
    sMax = Math.max(sMax, t);
    stack.push({ mi, segs, t });
  }
  const stackBars = stack.map((b, i) => ({
    mi: b.mi,
    tN: b.t,
    label: nM > 18 ? (b.mi % 12 === 0 ? String(miYear(b.mi, FY)) : "") : miShort(b.mi),
    title: miLabel(b.mi, FY) + " · " + fmtM(b.t),
    s: st.intro ? 0 : b.t / sMax,
    delay: Math.min(i * 18, 400),
    segs: b.segs.filter((s) => s.v > 0).map((s) => ({ color: s.color, h: ((s.v / (b.t || 1)) * 100).toFixed(2) + "%" })),
    onClick: () => A.trace("mi", b.mi, miLabel(b.mi, FY)),
  }));

  // lifecycle over the full history
  const life = laneKeys
    .map((laneId) => {
      const rs = pool.filter((r) => r.lane === laneId);
      if (!rs.length) return null;
      const byM: Record<number, number> = {};
      rs.forEach((r) => (byM[r.mi] = (byM[r.mi] || 0) + mv(r)));
      const mx = Math.max(1, ...Object.values(byM));
      let streak = 0, best = 0, gap = 0, bestGap = 0;
      let gapEnd: number | null = null;
      for (let mi = rs[0].mi; mi <= LAST_MI; mi++) {
        if (byM[mi]) {
          streak++;
          best = Math.max(best, streak);
          if (gap > bestGap) { bestGap = gap; gapEnd = mi; }
          gap = 0;
        } else { streak = 0; gap++; }
      }
      const cells: any[] = [];
      for (let mi = 0; mi <= LAST_MI; mi++) {
        const v = byM[mi] || 0;
        const inR = mi >= st.m0 && mi <= st.m1;
        cells.push({
          bg: v ? meta.laneColor.get(laneId) : "#F1F5F9",
          op: v ? +(0.3 + (0.7 * v) / mx).toFixed(2) : 1,
          outline: inR ? "#0F172A" : "transparent",
          title: (meta.laneLabel.get(laneId) ?? laneId) + " · " + miLabel(mi, FY) + " · " + fmtM(v),
          onClick: () => v && A.trace("lane", laneId, (meta.laneLabel.get(laneId) ?? laneId) + " · " + miLabel(mi, FY), mi),
        });
      }
      const peakMi = +Object.entries(byM).sort((a, b) => b[1] - a[1])[0][0];
      return {
        key: laneId,
        label: meta.laneLabel.get(laneId) ?? laneId,
        color: meta.laneColor.get(laneId) ?? PALETTE[0],
        oc: meta.laneOc.get(laneId) ?? "",
        cells,
        first: fmtDate(rs[0].ts),
        last: fmtDate(rs[rs.length - 1].ts),
        months: Object.keys(byM).length,
        streak: best + " mo",
        gap: bestGap ? bestGap + " mo" : "—",
        peak: miLabel(peakMi, FY),
        firstTs: rs[0].ts,
        gapEnd,
        bestGap,
        peakMi,
        peakV: byM[peakMi],
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.firstTs - b.firstTs);

  const unitWord = metric === "shipments" ? "shipments" : metric === "teu" ? "TEU" : "est. spend";
  const events: any[] = [];
  life.forEach((l) => {
    events.push({ ts: l.firstTs, date: l.first, color: l.color, icon: "flag", title: "Lane opened · " + l.label, body: "First bill of lading on this lane in the dataset." });
    events.push({
      ts: +new Date(FY + Math.floor(l.peakMi / 12), l.peakMi % 12, 15),
      date: miLabel(l.peakMi, FY),
      color: l.color,
      icon: "trending-up",
      title: "Peak month · " + l.label,
      body: fmtM(l.peakV) + " " + unitWord + ", the highest on record for this lane.",
    });
    if (l.bestGap >= 3 && l.gapEnd != null)
      events.push({
        ts: +new Date(FY + Math.floor(l.gapEnd / 12), l.gapEnd % 12, 1),
        date: miLabel(l.gapEnd, FY),
        color: "#94a3b8",
        icon: "pause",
        title: "Resumed after " + l.bestGap + "-month gap · " + l.label,
        body: "No bills of lading for " + l.bestGap + " consecutive months before this.",
      });
  });
  events.sort((a, b) => b.ts - a.ts);
  const N = LAST_MI + 1;
  const lifeYears = Array.from({ length: Math.ceil(N / 12) }, (_, y) => ({
    label: String(FY + y),
    w: (Math.min(12, N - y * 12) / N * 100).toFixed(2) + "%",
  }));

  return {
    lanesD,
    carrierLegend,
    dray,
    drayTotal: fmtNum(drayTotalN),
    drayTotalN,
    drayPerMonth: (drayTotalN / nM).toFixed(1),
    stackBars,
    stackMax: fmtM(sMax),
    life,
    events: events.slice(0, 10),
    lifeYears,
    laneCount: L.length,
  };
}

export type LanesView = ReturnType<typeof computeLanes>;
