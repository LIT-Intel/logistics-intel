/**
 * computeDash — typed port of the Dashboard Brief handoff's dashboard-data.js
 * selector, adapted to REAL saved-workspace data:
 *
 *   - companies:  getWorkspaceSavedCompanies() (lit_saved_companies + KPIs)
 *   - coRows:     lit_company_time_series_monthly (per-company monthly
 *                 shipments/teu — full multi-year history, all companies)
 *   - laneRows:   pulse-coach workspace_lane_months (per-company × lane ×
 *                 month — only companies with lane rollups)
 *
 * Volume KPIs / timeline / top accounts / signals come from coRows (the
 * complete source); the lane facet + map come from laneRows. Spend is
 * modeled (rate × TEU, labeled) exactly like the profile. Owners facet from
 * the design is omitted — lit_saved_companies has no per-row owner surface.
 */
import { rateForYear } from "@/features/company-profile/data/normalizeShipments";
import { deltaTone, fmtDelta as fmtDeltaBase, fmtMoney, fmtNum, PALETTE } from "@/features/company-profile/data/format";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type DashMetric = "shipments" | "teu" | "spend";

export interface DashCompany {
  key: string; // source_company_key slug — joins coRows/laneRows
  uuid: string | null;
  savedId: string;
  name: string;
  city: string;
  stage: string; // canonicalized stage bucket
  stageRaw: string;
  topRouteFallback: string | null; // kpis.top_route_12m when no lane rows
  lastActivityTs: number | null; // most recent shipment date (kpis)
  initials: string;
  /** domain/website for the logo.dev cascade (LogoTile). */
  logoDomain: string | null;
  /** lit_saved_companies.created_at (Command Center "recently saved"). */
  savedAtTs: number | null;
  /** Saver attribution (lit_saved_companies.user_id → profiles.full_name). */
  ownerId: string | null;
  ownerName: string | null;
  ownerKey: string; // initials, e.g. "VR"
  ownerColor: string;
  /** Onboarding example row (lit_saved_companies.is_sample). Optional so VM
   *  fixtures that predate sample data stay valid. */
  isSample?: boolean;
}

export interface CoMonthRow {
  c: string; // company key
  mi: number;
  shipments: number;
  teu: number;
  spend: number; // modeled rate × TEU
}

export interface LaneMonthRow {
  c: string;
  lane: string; // canonical "from::to" key
  fromLabel: string;
  toLabel: string;
  mi: number;
  shipments: number;
  teu: number;
  spend: number;
}

export interface DashDataset {
  companies: DashCompany[];
  coRows: CoMonthRow[];
  laneRows: LaneMonthRow[];
  firstYear: number;
  lastMi: number; // current month
  todayTs: number;
}

export interface DashFilters {
  lane?: string[];
  stage?: string[];
  owner?: string[]; // owner user ids
}

export interface DashState {
  m0: number;
  m1: number;
  preset: string | null;
  metric: DashMetric;
  f: DashFilters;
  sel: string | null; // company key for the Intelligence Panel
  sort: "value" | "growth" | "signals";
  done: string[]; // dismissed signal keys
  intro: boolean;
  disp?: Record<string, number> | null;
}

export interface DashActions {
  toggle(dim: "lane" | "stage" | "owner", key: string): void;
  preset(id: string): void;
  metric(m: DashMetric): void;
  brushStart(mi: number): void;
  brushMove(mi: number): void;
  select(key: string | null): void;
  sort(k: DashState["sort"]): void;
  done(k: string): void;
}

export const STAGE_ORDER = ["Prospect", "Contacted", "Engaged", "Quoting", "Won", "Lost", "Other"];
export const STAGE_COLOR: Record<string, string> = {
  Prospect: "#94a3b8",
  Contacted: "#60a5fa",
  Engaged: "#3b82f6",
  Quoting: "#8b5cf6",
  Won: "#10b981",
  Lost: "#f43f5e",
  Other: "#64748b",
};

export function canonStage(raw: string | null | undefined): string {
  const s = String(raw ?? "").toLowerCase();
  if (!s) return "Prospect";
  if (s.includes("won")) return "Won";
  if (s.includes("lost") || s.includes("closed")) return "Lost";
  if (s.includes("quot") || s.includes("proposal") || s.includes("negoti")) return "Quoting";
  if (s.includes("engag") || s.includes("demo") || s.includes("meeting") || s.includes("qualif")) return "Engaged";
  if (s.includes("contact") || s.includes("outreach")) return "Contacted";
  if (s.includes("prospect")) return "Prospect";
  return "Other";
}

export const miLabelOf = (mi: number, firstYear: number): string =>
  MON[mi % 12] + " " + (firstYear + Math.floor(mi / 12));
export const miShortOf = (mi: number): string => MON[mi % 12];

const fmtDelta = fmtDeltaBase;

const pathOf = (vals: number[], h = 26): string => {
  const mx = Math.max(1, ...vals);
  if (vals.length < 2) return "M0 14 L100 14";
  return vals
    .map((v, i) => (i ? "L" : "M") + ((i / (vals.length - 1)) * 100).toFixed(1) + " " + (h - (v / mx) * (h - 4)).toFixed(1))
    .join(" ");
};

export interface DashPreset {
  id: string;
  label: string;
  m0: number;
  m1: number;
}

export function dashPresets(ds: DashDataset): DashPreset[] {
  const L = ds.lastMi;
  const curYearStart = L - (new Date(ds.todayTs).getMonth() ?? 0);
  return [
    { id: "12M", label: "Last 12M", m0: Math.max(0, L - 11), m1: L },
    { id: "6M", label: "6M", m0: Math.max(0, L - 5), m1: L },
    { id: "3M", label: "90 days", m0: Math.max(0, L - 2), m1: L },
    { id: "YTD", label: "YTD", m0: Math.max(0, curYearStart), m1: L },
  ];
}

/** Attach modeled spend to raw monthly rows (rate × TEU, labeled downstream). */
export function withModeledSpend<T extends { mi: number; teu: number }>(
  row: T,
  firstYear: number,
): T & { spend: number } {
  const year = firstYear + Math.floor(row.mi / 12);
  return { ...row, spend: Math.round(row.teu * rateForYear(year)) };
}

// ---------------------------------------------------------------- compute

export function computeDash(ds: DashDataset, st: DashState, A: DashActions) {
  const metric = st.metric;
  const fm = (v: number) => (metric === "spend" ? fmtMoney(v) : fmtNum(v));
  const unit = metric === "shipments" ? "shipments" : metric === "teu" ? "TEU" : "est. spend";
  const FY = ds.firstYear;
  const L = ds.lastMi;
  const N = L + 1;
  const selL = st.f.lane ?? [];
  const selS = st.f.stage ?? [];
  const selO = st.f.owner ?? [];
  const nM = st.m1 - st.m0 + 1;
  const p0 = st.m0 - 12;
  const p1 = st.m1 - 12;
  const hasP = p0 >= 0;

  const coByKey = new Map(ds.companies.map((c) => [c.key, c]));
  const coOk = (c: DashCompany, skip?: "stage" | "owner") =>
    (skip === "stage" || !selS.length || selS.includes(c.stage)) &&
    (skip === "owner" || !selO.length || (c.ownerId != null && selO.includes(c.ownerId)));
  // Lane filter at company level: a company passes when it has ANY lane row
  // on a selected lane (companies without lane rollups pass only when no
  // lane filter is active — we can't attribute their volume to a lane).
  const laneCos = new Map<string, Set<string>>();
  for (const r of ds.laneRows) {
    let s = laneCos.get(r.c);
    if (!s) laneCos.set(r.c, (s = new Set()));
    s.add(r.lane);
  }
  const laneOk = (c: DashCompany) => {
    if (!selL.length) return true;
    const s = laneCos.get(c.key);
    return !!s && selL.some((k) => s.has(k));
  };
  const rowOk = (r: CoMonthRow, skip?: "stage") => {
    const c = coByKey.get(r.c);
    return !!c && coOk(c, skip) && laneOk(c);
  };
  const inW = (mi: number, a = st.m0, b = st.m1) => mi >= a && mi <= b;

  const cur = ds.coRows.filter((r) => rowOk(r) && inW(r.mi));
  const prior = hasP ? ds.coRows.filter((r) => rowOk(r) && inW(r.mi, p0, p1)) : [];
  const sum = (rs: CoMonthRow[], k: DashMetric) => rs.reduce((a, r) => a + r[k], 0);
  const S = { shipments: sum(cur, "shipments"), teu: sum(cur, "teu"), spend: sum(cur, "spend") };
  const P = { shipments: sum(prior, "shipments"), teu: sum(prior, "teu"), spend: sum(prior, "spend") };
  const cos = ds.companies.filter((c) => coOk(c) && laneOk(c));
  const period = miLabelOf(st.m0, FY) + " → " + miLabelOf(st.m1, FY);
  const priorLabel = hasP ? miLabelOf(p0, FY) + " → " + miLabelOf(p1, FY) : "No prior data";

  // ---- per-company list -------------------------------------------------
  const rowsByCo = new Map<string, CoMonthRow[]>();
  for (const r of ds.coRows) {
    let arr = rowsByCo.get(r.c);
    if (!arr) rowsByCo.set(r.c, (arr = []));
    arr.push(r);
  }
  const laneRowsByCo = new Map<string, LaneMonthRow[]>();
  for (const r of ds.laneRows) {
    let arr = laneRowsByCo.get(r.c);
    if (!arr) laneRowsByCo.set(r.c, (arr = []));
    arr.push(r);
  }
  const laneMeta = new Map<string, { label: string; from: string; to: string }>();
  for (const r of ds.laneRows)
    if (!laneMeta.has(r.lane)) laneMeta.set(r.lane, { label: r.fromLabel + " → " + r.toLabel, from: r.fromLabel, to: r.toLabel });
  const laneColor = new Map<string, string>();
  {
    const totals = new Map<string, number>();
    for (const r of ds.laneRows) totals.set(r.lane, (totals.get(r.lane) ?? 0) + r.shipments);
    [...totals.entries()].sort((a, b) => b[1] - a[1]).forEach(([k], i) => laneColor.set(k, PALETTE[i % PALETTE.length]));
  }

  const coList = cos.map((c) => {
    const all = rowsByCo.get(c.key) ?? [];
    const rs = all.filter((r) => inW(r.mi));
    const ps = hasP ? all.filter((r) => inW(r.mi, p0, p1)) : [];
    const v = rs.reduce((a, r) => a + r[metric], 0);
    const pv = ps.reduce((a, r) => a + r[metric], 0);
    const d = pv ? (v - pv) / pv : null;
    const t = deltaTone(d);
    const series: number[] = [];
    for (let mi = 0; mi <= L; mi++) series.push(all.filter((r) => r.mi === mi).reduce((a, r) => a + r[metric], 0));
    const win = series.slice(st.m0, st.m1 + 1);
    const activeMis = all.filter((r) => r.shipments > 0).map((r) => r.mi);
    const lastMiActive = activeMis.length ? Math.max(...activeMis) : null;
    const lastDays =
      c.lastActivityTs != null
        ? Math.max(0, Math.round((ds.todayTs - c.lastActivityTs) / 864e5))
        : lastMiActive == null
          ? null
          : (L - lastMiActive) * 30 + 15;
    const l3 = all.filter((r) => r.mi >= L - 2).reduce((a, r) => a + r.shipments, 0);
    const pr3 = all.filter((r) => r.mi >= L - 5 && r.mi <= L - 3).reduce((a, r) => a + r.shipments, 0);
    const lrs = (laneRowsByCo.get(c.key) ?? []).filter((r) => inW(r.mi));
    const byLane = new Map<string, number>();
    lrs.forEach((r) => byLane.set(r.lane, (byLane.get(r.lane) ?? 0) + r[metric]));
    const lanes = [...byLane.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, x]) => ({
        key: k,
        label: laneMeta.get(k)?.label ?? k,
        color: laneColor.get(k) ?? "#94a3b8",
        val: fm(x),
        share: Math.round((x / (v || 1)) * 100) + "%",
        w: ((x / (v || 1)) * 100).toFixed(1) + "%",
      }));
    // signals (design §3.1; "newlane" only for lane-covered companies)
    const firsts = new Map<string, number>();
    (laneRowsByCo.get(c.key) ?? []).forEach((r) => {
      const curF = firsts.get(r.lane);
      if (curF == null || r.mi < curF) firsts.set(r.lane, r.mi);
    });
    const sig: any[] = [];
    if (lastDays != null && lastDays >= 60)
      sig.push({ type: "dormant", icon: "moon", color: "#f59e0b", title: "Gone quiet", body: "No shipments in " + lastDays + " days" });
    firsts.forEach((m, k) => {
      if (m >= L - 3 && m >= 0)
        sig.push({
          type: "newlane",
          icon: "git-branch-plus",
          color: "#00c8d4",
          title: "New lane",
          body: (laneMeta.get(k)?.label ?? k) + " opened " + miLabelOf(m, FY),
        });
    });
    if (pr3 >= 4 && l3 / pr3 - 1 >= 0.3)
      sig.push({ type: "spike", icon: "trending-up", color: "#10b981", title: "Volume spike", body: fmtDelta(l3 / pr3 - 1) + " shipments, last 90 days vs prior 90" });
    if (pr3 >= 4 && l3 / pr3 - 1 <= -0.3 && !(lastDays != null && lastDays >= 60))
      sig.push({ type: "drop", icon: "trending-down", color: "#f43f5e", title: "Volume drop", body: fmtDelta(l3 / pr3 - 1) + " shipments, last 90 days vs prior 90" });

    return {
      ...c,
      v,
      pv,
      val: fm(v),
      delta: fmtDelta(d),
      dN: d,
      dfg: t.fg,
      dbg: t.bg,
      spark: pathOf(win),
      series,
      lanes,
      topLane: lanes[0]?.label ?? c.topRouteFallback ?? "—",
      laneColor: lanes[0]?.color ?? "#94a3b8",
      shipments: fmtNum(rs.reduce((a, r) => a + r.shipments, 0)),
      teu: fmtNum(rs.reduce((a, r) => a + r.teu, 0)),
      spend: fmtMoney(rs.reduce((a, r) => a + r.spend, 0)),
      lastDays,
      lastLabel: lastDays == null ? "—" : lastDays + "d ago",
      sig,
      sigCount: sig.length,
      sig0: sig[0] ?? null,
      sigColor: sig[0]?.color ?? "transparent",
      sigTitle: sig[0]?.title ?? "",
      stageColor: STAGE_COLOR[c.stage] ?? "#64748b",
      stageBg: (STAGE_COLOR[c.stage] ?? "#64748b") + "1f",
      active: st.sel === c.key,
      rowBg: st.sel === c.key ? "rgba(59,130,246,0.06)" : "transparent",
      onClick: () => A.select(c.key),
    };
  });

  const sortKey = st.sort || "value";
  const ranked = coList
    .slice()
    .sort((a, b) =>
      sortKey === "growth"
        ? (b.dN ?? -9) - (a.dN ?? -9)
        : sortKey === "signals"
          ? b.sigCount - a.sigCount || b.v - a.v
          : b.v - a.v,
    );
  const mx = Math.max(1, ...coList.map((c) => c.v));
  ranked.forEach((c: any, i: number) => {
    c.rank = String(i + 1).padStart(2, "0");
    c.s = st.intro ? 0 : c.v / mx;
  });
  const sorts = (
    [
      ["value", "Volume"],
      ["growth", "Growth"],
      ["signals", "Signals"],
    ] as const
  ).map(([id, label]) => ({
    id,
    label,
    bg: sortKey === id ? "#FFFFFF" : "transparent",
    fg: sortKey === id ? "#0F172A" : "#64748b",
    shadow: sortKey === id ? "0 1px 3px rgba(15,23,42,0.12)" : "none",
    onClick: () => A.sort(id),
  }));

  // ---- signals feed -------------------------------------------------------
  const signals: any[] = [];
  coList.forEach((c: any) =>
    c.sig.forEach((s: any) => {
      const key = c.key + ":" + s.type;
      signals.push({
        ...s,
        key,
        co: c.name,
        coKey: c.key,
        initials: c.initials,
        stage: c.stage,
        done: (st.done ?? []).includes(key),
        onClick: () => A.select(c.key),
        onDone: (e?: { stopPropagation?: () => void }) => {
          e?.stopPropagation?.();
          A.done(key);
        },
      });
    }),
  );
  const order: Record<string, number> = { spike: 0, newlane: 1, drop: 2, dormant: 3 };
  signals.sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));
  signals.forEach((s) => {
    s.opacity = s.done ? 0.45 : 1;
    s.checkBg = s.done ? "#10b981" : "transparent";
    s.checkBorder = s.done ? "#10b981" : "#CBD5E1";
    s.strike = s.done ? "line-through" : "none";
  });
  const openSignals = signals.filter((s) => !s.done).length;

  // ---- pipeline by stage --------------------------------------------------
  const annual = (x: number) => (nM ? (x * 12) / nM : x);
  // All six canonical stages always render (design card shape); "Other"
  // only when raw stages didn't map into the canon.
  const stagesShown = STAGE_ORDER.filter(
    (s) => s !== "Other" || coList.some((c) => c.stage === "Other"),
  );
  const stages = stagesShown.map((sName) => {
    const list = coList.filter((c: any) => c.stage === sName);
    const sp = list.reduce(
      (a: number, c: any) => a + (rowsByCo.get(c.key) ?? []).filter((r) => inW(r.mi)).reduce((q, r) => q + r.spend, 0),
      0,
    );
    const on = selS.includes(sName);
    return {
      label: sName,
      color: STAGE_COLOR[sName] ?? "#64748b",
      count: list.length,
      value: fmtMoney(annual(sp)),
      raw: annual(sp),
      active: on,
      opacity: selS.length && !on ? 0.45 : 1,
      onClick: () => A.toggle("stage", sName),
    };
  });
  const stMax = Math.max(1, ...stages.map((s) => s.raw));
  stages.forEach((s: any) => (s.s = st.intro ? 0 : s.raw / stMax));
  const pipeline = stages.filter((s) => ["Engaged", "Quoting"].includes(s.label)).reduce((a, s) => a + s.raw, 0);

  // ---- owners (crossfilter: computed with every filter except owner) ------
  const ownerAgg = new Map<string, { name: string; key: string; color: string; count: number }>();
  ds.companies
    .filter((c) => coOk(c, "owner") && laneOk(c) && c.ownerId)
    .forEach((c) => {
      const o = ownerAgg.get(c.ownerId!) ?? {
        name: c.ownerName ?? "Teammate",
        key: c.ownerKey,
        color: c.ownerColor,
        count: 0,
      };
      o.count++;
      ownerAgg.set(c.ownerId!, o);
    });
  const owners = [...ownerAgg.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([id, o]) => {
      const on = selO.includes(id);
      return {
        id,
        key: o.key,
        name: o.name,
        color: o.color,
        count: o.count,
        active: on,
        opacity: selO.length && !on ? 0.45 : 1,
        bg: on ? "rgba(59,130,246,0.07)" : "transparent",
        onClick: () => A.toggle("owner", id),
      };
    });

  // ---- lanes (facet + map) ------------------------------------------------
  const laneRowsOk = ds.laneRows.filter((r) => {
    const c = coByKey.get(r.c);
    return !!c && coOk(c);
  });
  const laneCur = laneRowsOk.filter((r) => inW(r.mi));
  const laneP = hasP ? laneRowsOk.filter((r) => inW(r.mi, p0, p1)) : [];
  const lt = new Map<string, { v: number; shipments: number; teu: number; cos: Set<string> }>();
  laneCur.forEach((r) => {
    let o = lt.get(r.lane);
    if (!o) lt.set(r.lane, (o = { v: 0, shipments: 0, teu: 0, cos: new Set() }));
    o.v += r[metric];
    o.shipments += r.shipments;
    o.teu += r.teu;
    o.cos.add(r.c);
  });
  const ltot = [...lt.values()].reduce((a, x) => a + x.v, 0) || 1;
  const lmax = Math.max(1, ...[...lt.values()].map((x) => x.v));
  const lanes = [...lt.entries()]
    .sort((a, b) => b[1].v - a[1].v)
    .map(([k, x], i) => {
      const meta = laneMeta.get(k);
      const pv = laneP.filter((r) => r.lane === k).reduce((a, r) => a + r[metric], 0);
      const d = pv ? (x.v - pv) / pv : null;
      const t = deltaTone(d);
      const on = selL.includes(k);
      return {
        key: k,
        rank: String(i + 1).padStart(2, "0"),
        label: meta?.label ?? k,
        from: meta?.from ?? "",
        to: meta?.to ?? "",
        color: laneColor.get(k) ?? PALETTE[i % PALETTE.length],
        val: fm(x.v),
        valN: x.v,
        shareN: x.v / ltot,
        share: Math.round((x.v / ltot) * 100) + "%",
        shipments: fmtNum(x.shipments),
        shipmentsN: x.shipments,
        teu: fmtNum(x.teu),
        cos: x.cos.size + (x.cos.size === 1 ? " account" : " accounts"),
        delta: fmtDelta(d),
        deltaFg: t.fg,
        deltaBg: t.bg,
        s: st.intro ? 0 : x.v / lmax,
        dimmed: selL.length > 0 && !on,
        opacity: selL.length && !on ? 0.45 : 1,
        rowBg: on ? "rgba(59,130,246,0.07)" : "transparent",
        onClick: () => A.toggle("lane", k),
      };
    });

  // ---- timeline (time filter skipped) ------------------------------------
  const base = ds.coRows.filter((r) => rowOk(r));
  const ser: number[] = [];
  for (let mi = 0; mi <= L; mi++) ser.push(base.filter((r) => r.mi === mi).reduce((a, r) => a + r[metric], 0));
  const smax = Math.max(1, ...ser);
  const timeline = ser.map((v, mi) => ({
    mi,
    v,
    s: st.intro ? 0 : Math.max(0.03, v / smax),
    sel: inW(mi),
    label: miLabelOf(mi, FY) + " · " + fm(v) + " " + unit,
    bg: inW(mi) ? "#3b82f6" : "#CBD5E1",
    short: mi % 12 === 0 ? String(FY + Math.floor(mi / 12)) : mi % 3 === 0 ? miShortOf(mi) : "",
    onDown: (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      A.brushStart(mi);
    },
    onEnter: () => A.brushMove(mi),
  }));
  const brush = {
    left: ((st.m0 / N) * 100).toFixed(2) + "%",
    width: ((nM / N) * 100).toFixed(2) + "%",
  };

  // ---- KPI cards ----------------------------------------------------------
  const disp = st.disp ?? {};
  const dv = (k: string) => (disp[k] != null ? disp[k] : null);
  const kdef: [string, string, string, number, number | null, (v: number) => string, string][] = [
    ["companies", "Saved companies", "building-2", cos.length, null, fmtNum, "in Command Center"],
    ["shipments", "Shipments", "ship", S.shipments, hasP ? P.shipments : null, fmtNum, "across portfolio"],
    ["teu", "TEU", "container", S.teu, hasP ? P.teu : null, fmtNum, "twenty-ft equiv."],
    ["spend", "Est. freight spend", "dollar-sign", S.spend, hasP ? P.spend : null, fmtMoney, "lane rate × TEU"],
    ["pipeline", "Pipeline value", "briefcase", pipeline, null, fmtMoney, "Engaged + Quoting, annualized"],
    ["signals", "Open signals", "radar", openSignals, null, fmtNum, "last 90 days"],
  ];
  const kpis = kdef.map(([id, label, icon, v, pv, fmt, sub]) => {
    const d = pv ? (v - pv) / pv : null;
    const t = deltaTone(d);
    const shown = dv(id) != null ? (dv(id) as number) : v;
    const sp = ["shipments", "teu", "spend"].includes(id)
      ? pathOf(
          Array.from({ length: nM }, (_, i) =>
            base.filter((r) => r.mi === st.m0 + i).reduce((a, r) => a + (r as any)[id], 0),
          ),
        )
      : "";
    return {
      id,
      label,
      icon,
      value: fmt(shown),
      valueN: v,
      sub,
      delta: pv != null ? fmtDelta(d) : "",
      dfg: t.fg,
      dbg: t.bg,
      hasDelta: pv != null,
      prior: pv != null ? "prior " + fmt(pv) : sub,
      spark: sp,
      hasSpark: !!sp,
    };
  });
  const targets: Record<string, number> = {};
  kdef.forEach(([id, , , v]) => (targets[id] = v));

  // ---- chrome -------------------------------------------------------------
  const presets = dashPresets(ds).map((p) => ({
    ...p,
    active: st.preset === p.id,
    bg: st.preset === p.id ? "#0F172A" : "transparent",
    fg: st.preset === p.id ? "#FFFFFF" : "#475569",
    onClick: () => A.preset(p.id),
  }));
  const metrics = (
    [
      ["shipments", "Shipments"],
      ["teu", "TEU"],
      ["spend", "Spend"],
    ] as const
  ).map(([id, label]) => ({
    id,
    label,
    bg: metric === id ? "#FFFFFF" : "transparent",
    fg: metric === id ? "#0F172A" : "#64748b",
    shadow: metric === id ? "0 1px 3px rgba(15,23,42,0.12)" : "none",
    onClick: () => A.metric(id),
  }));
  const tokens: any[] = [];
  selL.forEach((k) => tokens.push({ dim: "Lane", label: laneMeta.get(k)?.label ?? k, onRemove: () => A.toggle("lane", k) }));
  selS.forEach((k) => tokens.push({ dim: "Stage", label: k, onRemove: () => A.toggle("stage", k) }));
  selO.forEach((id) =>
    tokens.push({
      dim: "Owner",
      label: ownerAgg.get(id)?.name ?? ds.companies.find((c) => c.ownerId === id)?.ownerName ?? "Teammate",
      onRemove: () => A.toggle("owner", id),
    }),
  );

  // ---- activity ticker ----------------------------------------------------
  const activity: any[] = [];
  coList.forEach((c: any) => {
    const lrs = (laneRowsByCo.get(c.key) ?? []).filter((r) => r.mi >= L - 1 && r.shipments > 0);
    if (lrs.length) {
      lrs.forEach((r) =>
        activity.push({
          co: c.name,
          coKey: c.key,
          month: miLabelOf(r.mi, FY),
          mi: r.mi,
          lane: laneMeta.get(r.lane)?.label ?? r.lane,
          color: laneColor.get(r.lane) ?? "#94a3b8",
          n: r.shipments,
          onClick: () => A.select(c.key),
        }),
      );
    } else {
      (rowsByCo.get(c.key) ?? [])
        .filter((r) => r.mi >= L - 1 && r.shipments > 0)
        .forEach((r) =>
          activity.push({
            co: c.name,
            coKey: c.key,
            month: miLabelOf(r.mi, FY),
            mi: r.mi,
            lane: c.topLane !== "—" ? c.topLane : "portfolio",
            color: c.laneColor,
            n: r.shipments,
            onClick: () => A.select(c.key),
          }),
        );
    }
  });
  activity.sort((a, b) => b.mi - a.mi || b.n - a.n);
  const tick = activity.slice(0, 10);

  // ---- Intelligence Panel -------------------------------------------------
  const sel = st.sel != null ? (coList.find((c: any) => c.key === st.sel) as any) ?? null : null;
  let panel: any = null;
  if (sel) {
    const window24 = sel.series.slice(Math.max(0, N - 24), N);
    const off = Math.max(0, N - 24);
    const smx2 = Math.max(1, ...window24);
    panel = {
      ...sel,
      bars: window24.map((v: number, i: number) => ({
        s: st.intro ? 0 : Math.max(0.02, v / smx2),
        bg: inW(off + i) ? sel.laneColor : "#E2E8F0",
        title: miLabelOf(off + i, FY) + " · " + fm(v),
      })),
    };
  }

  // ---- story --------------------------------------------------------------
  const pS = P.shipments ? (S.shipments - P.shipments) / P.shipments : null;
  const story = {
    shipments: fmtNum(dv("shipments") ?? S.shipments),
    teu: fmtNum(dv("teu") ?? S.teu),
    spend: fmtMoney(dv("spend") ?? S.spend),
    companies: String(cos.length),
    period,
    delta: fmtDelta(pS),
    deltaFg: deltaTone(pS).fg,
    signals: String(openSignals),
    topLane: lanes[0]?.label ?? "—",
    topLaneShare: lanes[0]?.share ?? "—",
    topCo: (ranked[0] as any)?.name ?? "—",
    pipeline: fmtMoney(pipeline),
    quoting: String(coList.filter((c: any) => c.stage === "Quoting").length),
  };

  return {
    kpis,
    targets,
    story,
    period,
    priorLabel,
    unit,
    presets,
    metrics,
    tokens,
    hasTokens: tokens.length > 0,
    owners,
    ranked,
    topAccounts: ranked.slice(0, 8),
    sorts,
    signals,
    openSignals,
    stages,
    lanes,
    timeline,
    brush,
    activity: activity.slice(0, 12),
    ticker: tick.concat(tick),
    panel,
    panelOpen: !!panel,
    companyCount: fmtNum(cos.length),
    rowsInView: fmtNum(cur.length),
    spendModeled: true,
    hasPrior: hasP,
  };
}

export type DashView = ReturnType<typeof computeDash>;
