/**
 * computeCommandCenter — typed port of the Command Center handoff logic
 * (command-center-data.js ACCOUNTS/CONTACTS derivations + the .dc.html
 * renderVals aggregations) over REAL data:
 *
 *   accounts  ← the dashboard's DashDataset (getWorkspaceSavedCompanies +
 *               lit_company_time_series_monthly + lane months) — §3.2 fields
 *               (series/ship/yoy/lastDays/health/sig) derived per company.
 *   contacts  ← lit_contacts joined to lit_campaign_contacts (enrollment)
 *               and lit_outreach_history (Sent/Opened/Replied, last touch).
 *
 * Every number traces to those rows; gaps render as "—" or an empty state,
 * never invented. Selectors are pure — the UI renders VMs verbatim.
 */
import {
  miLabelOf,
  STAGE_COLOR,
  STAGE_ORDER,
  type DashCompany,
  type DashDataset,
} from "@/features/dashboard/data/computeDash";

// ---------------------------------------------------------------- formats

const fmtNum = (v: number): string => Math.round(v).toLocaleString("en-US");
const fmtMoney = (v: number): string =>
  v >= 1e6 ? "$" + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + "M" : v >= 1e3 ? "$" + Math.round(v / 1e3) + "K" : "$" + Math.round(v);
const dFmt = (p: number | null): string =>
  p == null || !isFinite(p) ? "—" : (p >= 0 ? "+" : "−") + Math.abs(Math.round(p * 100)) + "%";
const dFg = (p: number | null): string =>
  p == null || !isFinite(p) || Math.abs(p) < 0.05 ? "#64748b" : p > 0 ? "#059669" : "#e11d48";

/** README §2 relative time. */
export const ago = (d: number | null): string =>
  d == null ? "—" : d === 0 ? "today" : d < 60 ? d + "d ago" : d < 365 ? Math.round(d / 30) + "mo ago" : (d / 365).toFixed(1) + "y ago";

export const pathOf = (vals: number[], h = 26): string => {
  const mx = Math.max(1, ...vals);
  if (vals.length < 2) return "M0 14 L100 14";
  return vals
    .map((v, i) => (i ? "L" : "M") + ((i / (vals.length - 1)) * 100).toFixed(1) + " " + (h - (v / mx) * (h - 2) - 1).toFixed(1))
    .join(" ");
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateLabel = (ts: number): string => {
  const d = new Date(ts);
  return MON[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
};

// ---------------------------------------------------------------- accounts

export const HEALTH = [
  { id: "growing", label: "Growing", color: "#10b981" },
  { id: "steady", label: "Steady", color: "#3b82f6" },
  { id: "slowing", label: "Slowing", color: "#f59e0b" },
  { id: "dormant", label: "Gone quiet", color: "#f43f5e" },
  { id: "none", label: "No history", color: "#cbd5e1" },
] as const;
export type HealthId = (typeof HEALTH)[number]["id"];

export interface AccountDerived {
  co: DashCompany;
  series: number[]; // last 24 months of shipments (oldest → newest)
  ship: number; // Σ shipments last 12M
  shipPrev: number;
  teu: number;
  teuPrev: number;
  spend: number; // modeled rate×TEU (labeled Est.)
  spendPrev: number;
  yoy: number | null;
  lastDays: number | null;
  lastDate: string | null;
  lanes: { key: string; label: string; oc: string; n: number; share: number }[];
  health: HealthId;
  sig: { t: string; icon: string; color: string };
  savedDays: number | null;
  contacts: number;
}

/** §3.2 — derive every per-account field from the dataset rows. */
export function deriveAccounts(
  ds: DashDataset,
  contactCounts: Map<string, number>, // by company uuid
): AccountDerived[] {
  const L = ds.lastMi;
  const start24 = L - 23;
  const byCo = new Map<string, typeof ds.coRows>();
  ds.coRows.forEach((r) => {
    const arr = byCo.get(r.c) ?? [];
    arr.push(r);
    byCo.set(r.c, arr);
  });
  const lanesByCo = new Map<string, typeof ds.laneRows>();
  ds.laneRows.forEach((r) => {
    const arr = lanesByCo.get(r.c) ?? [];
    arr.push(r);
    lanesByCo.set(r.c, arr);
  });

  return ds.companies.map((co) => {
    const rows = (byCo.get(co.key) ?? []).filter((r) => r.mi >= start24);
    const series = Array.from({ length: 24 }, (_, i) =>
      rows.filter((r) => r.mi === start24 + i).reduce((a, r) => a + r.shipments, 0),
    );
    const cur = rows.filter((r) => r.mi >= L - 11);
    const prev = rows.filter((r) => r.mi <= L - 12);
    const sum = (rs: typeof rows, k: "shipments" | "teu" | "spend") => rs.reduce((a, r) => a + (r[k] || 0), 0);
    const ship = sum(cur, "shipments");
    const shipPrev = sum(prev, "shipments");
    const yoy = shipPrev ? ship / shipPrev - 1 : null;

    // Last shipment: the real BOL date from kpis when present, else the
    // newest month bucket (mid-month approximation, labeled by month).
    let lastDays: number | null = null;
    let lastDate: string | null = null;
    if (co.lastActivityTs != null) {
      lastDays = Math.max(0, Math.floor((ds.todayTs - co.lastActivityTs) / 864e5));
      lastDate = dateLabel(co.lastActivityTs);
    } else if (rows.length) {
      const lastMiSeen = Math.max(...rows.map((r) => r.mi));
      lastDays = Math.max(0, (L - lastMiSeen) * 30 + 15);
      lastDate = miLabelOf(lastMiSeen, ds.firstYear);
    }

    // Lanes (last 12M) from lane rollups; fall back to the KPI top route.
    const laneRows = (lanesByCo.get(co.key) ?? []).filter((r) => r.mi >= L - 11);
    const laneTot = new Map<string, { label: string; oc: string; n: number }>();
    laneRows.forEach((r) => {
      const o = laneTot.get(r.lane) ?? {
        label: `${r.fromLabel} → ${r.toLabel}`,
        oc: r.fromLabel.slice(0, 2).toUpperCase(),
        n: 0,
      };
      o.n += r.shipments;
      laneTot.set(r.lane, o);
    });
    let lanes = [...laneTot.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([key, l]) => ({ key, label: l.label, oc: l.oc, n: l.n, share: ship ? l.n / ship : 0 }));
    if (!lanes.length && co.topRouteFallback) {
      lanes = [{ key: co.topRouteFallback, label: co.topRouteFallback, oc: co.topRouteFallback.slice(0, 2).toUpperCase(), n: 0, share: 0 }];
    }

    const hasHistory = rows.length > 0 || co.lastActivityTs != null;
    const health: HealthId = !hasHistory
      ? "none"
      : lastDays != null && lastDays > 90
        ? "dormant"
        : yoy != null && yoy <= -0.12
          ? "slowing"
          : yoy != null && yoy >= 0.2
            ? "growing"
            : "steady";

    // §3.2 sig — first match wins.
    const laneFirsts = new Map<string, number>();
    (lanesByCo.get(co.key) ?? []).forEach((r) => {
      const f = laneFirsts.get(r.lane);
      if (f == null || r.mi < f) laneFirsts.set(r.lane, r.mi);
    });
    const newLane = [...laneFirsts.entries()].find(([, mi]) => mi >= L - 3);
    let sig: AccountDerived["sig"];
    if (health === "none") sig = { t: "No import history", icon: "circle-dashed", color: "#94a3b8" };
    else if (newLane) {
      const lr = ds.laneRows.find((r) => r.lane === newLane[0] && r.c === co.key);
      sig = { t: "New lane · " + (lr?.fromLabel ?? newLane[0]), icon: "route", color: "#0891b2" };
    } else if (health === "dormant") sig = { t: "Quiet for " + lastDays + " days", icon: "clock", color: "#e11d48" };
    else if (health === "slowing") sig = { t: "Volume down " + Math.round(-(yoy as number) * 100) + "%", icon: "trending-down", color: "#d97706" };
    else if (co.stage === "Quoting") sig = { t: "Quote in progress", icon: "file-text", color: "#7c3aed" };
    else if (health === "growing") sig = { t: "Volume up " + Math.round((yoy as number) * 100) + "%", icon: "trending-up", color: "#059669" };
    else sig = { t: "Steady volume", icon: "minus", color: "#64748b" };

    return {
      co,
      series,
      ship,
      shipPrev,
      teu: Math.round(sum(cur, "teu")),
      teuPrev: Math.round(sum(prev, "teu")),
      spend: sum(cur, "spend"),
      spendPrev: sum(prev, "spend"),
      yoy,
      lastDays,
      lastDate,
      lanes,
      health,
      sig,
      savedDays: co.savedAtTs != null ? Math.max(0, Math.floor((ds.todayTs - co.savedAtTs) / 864e5)) : null,
      contacts: contactCounts.get(co.uuid ?? "") ?? contactCounts.get(co.key) ?? 0,
    };
  });
}

// ---------------------------------------------------------------- contacts

export const SENIORITY = [
  { id: "C-level", color: "#0F172A", darkColor: "#334155" },
  { id: "VP", color: "#7c3aed", darkColor: "#7c3aed" },
  { id: "Director", color: "#2563eb", darkColor: "#2563eb" },
  { id: "Manager", color: "#0891b2", darkColor: "#0891b2" },
  { id: "Staff", color: "#64748b", darkColor: "#64748b" },
] as const;
export type SenId = (typeof SENIORITY)[number]["id"];
const SEN_RANK: Record<string, number> = Object.fromEntries(SENIORITY.map((s, i) => [s.id, i]));

/** Map lit_contacts.seniority (c_suite/founder/…) — else the title — to design buckets. Kept in one place per §3.3. */
export function senBucket(seniority: string | null | undefined, title: string | null | undefined): SenId {
  const s = String(seniority ?? "").toLowerCase();
  if (["c_suite", "cxo", "founder", "owner", "partner"].includes(s)) return "C-level";
  if (s === "vp" || s === "vice_president") return "VP";
  if (s === "director") return "Director";
  if (s === "manager" || s === "head") return "Manager";
  if (s === "entry" || s === "senior" || s === "intern" || s === "staff") return "Staff";
  const t = String(title ?? "").toLowerCase();
  if (/chief|\bceo\b|\bcfo\b|\bcoo\b|\bcio\b|president|founder|owner/.test(t)) return "C-level";
  if (/\bvp\b|vice president|head of global/.test(t)) return "VP";
  if (/director/.test(t)) return "Director";
  if (/manager|head of/.test(t)) return "Manager";
  return "Staff";
}

export type EmailState = "verified" | "unverified" | "none";

export interface CCContact {
  id: string;
  companyUuid: string; // lit_contacts.company_id → lit_companies.id
  name: string;
  initials: string;
  title: string;
  dept: string;
  sen: SenId;
  email: EmailState;
  emailAddr: string | null;
  phone: boolean;
  linkedin: boolean;
  camp: { name: string; status: "Sent" | "Opened" | "Replied" } | null;
  touchDays: number | null;
  addedDays: number | null;
}

export const isDM = (c: { sen: SenId }): boolean => ["C-level", "VP", "Director"].includes(c.sen);

/** Normalize a raw lit_contacts row (+ campaign/touch lookups) into CCContact. */
export function normalizeContact(
  raw: any,
  camp: CCContact["camp"],
  lastTouchTs: number | null,
  todayTs: number,
): CCContact {
  const name = String(raw.full_name || `${raw.first_name ?? ""} ${raw.last_name ?? ""}`.trim() || "Unknown");
  const emailAddr = raw.email ? String(raw.email) : null;
  const verified = raw.email_verification_status === "verified" || raw.email_verified === true;
  const created = raw.created_at ? Date.parse(raw.created_at) : NaN;
  return {
    id: String(raw.id),
    companyUuid: String(raw.company_id ?? ""),
    name,
    initials:
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w: string) => w[0]?.toUpperCase() ?? "")
        .join("") || "—",
    title: String(raw.title ?? "—"),
    dept: String(raw.department ?? ""),
    sen: senBucket(raw.seniority, raw.title),
    email: emailAddr ? (verified ? "verified" : "unverified") : "none",
    emailAddr,
    phone: !!raw.phone,
    linkedin: !!raw.linkedin_url,
    camp,
    touchDays: lastTouchTs != null ? Math.max(0, Math.floor((todayTs - lastTouchTs) / 864e5)) : null,
    addedDays: Number.isFinite(created) ? Math.max(0, Math.floor((todayTs - created) / 864e5)) : null,
  };
}

// ---------------------------------------------------------------- state

export interface CCState {
  tab: "companies" | "contacts";
  q: string;
  health: HealthId | null;
  stages: string[];
  owner: string | null; // owner user id (single-select per design)
  sort: "spend" | "volume" | "recent" | "saved";
  sel: string[];
  drawer: { t: "co" | "ct"; id: string } | null;
  sen: SenId[];
  chan: "all" | "email" | "phone" | "fresh";
  group: boolean;
  page: number;
}

export interface CCActions {
  set(patch: Partial<CCState>): void;
  tog(k: "stages" | "sen" | "sel", v: string): void;
}

export const PAGE_SIZE = 50;

// ---------------------------------------------------------------- views

const stagePill = (stage: string) => ({
  stageFg: stage === "Prospect" ? "#475569" : (STAGE_COLOR[stage] ?? "#64748b"),
  stageBg: (STAGE_COLOR[stage] ?? "#64748b") + "1f",
});

/** Companies-tab view model (README §4.3 + companies KPIs §4.1). */
export function computeAccountsView(
  accounts: AccountDerived[],
  st: CCState,
  A: CCActions,
  ownersList: { id: string; name: string; key: string; color: string }[],
) {
  const ql = st.q.trim().toLowerCase();
  const match = (a: AccountDerived) =>
    (!ql || (a.co.name + " " + a.co.city + " " + a.lanes.map((l) => l.label).join(" ")).toLowerCase().includes(ql)) &&
    (!st.owner || a.co.ownerId === st.owner);
  const pre = accounts.filter((a) => match(a) && (!st.stages.length || st.stages.includes(a.co.stage)));
  const list = pre.filter((a) => !st.health || a.health === st.health);

  const sorters: Record<CCState["sort"], (a: AccountDerived, b: AccountDerived) => number> = {
    spend: (a, b) => b.spend - a.spend,
    volume: (a, b) => b.ship - a.ship,
    recent: (a, b) => (a.lastDays ?? 1e9) - (b.lastDays ?? 1e9),
    saved: (a, b) => (a.savedDays ?? 1e9) - (b.savedDays ?? 1e9),
  };
  list.sort(sorters[st.sort]);

  const tot = (k: "ship" | "shipPrev" | "teu" | "teuPrev" | "spend" | "spendPrev") =>
    list.reduce((s, a) => s + a[k], 0);
  const ship = tot("ship"), shipPrev = tot("shipPrev");
  const teu = tot("teu"), teuPrev = tot("teuPrev");
  const spend = tot("spend"), spendPrev = tot("spendPrev");
  const active = list.filter((a) => a.lastDays != null && a.lastDays <= 90).length;
  const pipe = list.filter((a) => ["Engaged", "Quoting"].includes(a.co.stage));

  const kpis = [
    { id: "n", label: "Saved companies", icon: "building-2", value: fmtNum(list.length), delta: "+" + list.filter((a) => a.savedDays != null && a.savedDays <= 30).length, dfg: "#059669", sub: "in last 30 days" },
    { id: "active", label: "Shipping now", icon: "ship", value: fmtNum(active), delta: list.length ? Math.round((active / list.length) * 100) + "%" : "—", dfg: "#0e7490", sub: "shipped in 90 days" },
    { id: "ship", label: "Shipments 12M", icon: "package", value: fmtNum(ship), delta: dFmt(shipPrev ? ship / shipPrev - 1 : null), dfg: dFg(shipPrev ? ship / shipPrev - 1 : null), sub: "vs " + fmtNum(shipPrev) },
    { id: "teu", label: "TEU 12M", icon: "container", value: fmtNum(teu), delta: dFmt(teuPrev ? teu / teuPrev - 1 : null), dfg: dFg(teuPrev ? teu / teuPrev - 1 : null), sub: "vs " + fmtNum(teuPrev) },
    { id: "spend", label: "Est. spend 12M", icon: "dollar-sign", value: fmtMoney(spend), delta: dFmt(spendPrev ? spend / spendPrev - 1 : null), dfg: dFg(spendPrev ? spend / spendPrev - 1 : null), sub: "vs " + fmtMoney(spendPrev) },
    { id: "pipe", label: "Open pipeline", icon: "target", value: fmtMoney(pipe.reduce((s, a) => s + a.spend, 0)), delta: String(pipe.length), dfg: "#7c3aed", sub: "engaged or quoting" },
  ];

  const maxHS = Math.max(1, pre.length);
  const healthSegs = HEALTH.map((h) => {
    const g = pre.filter((a) => a.health === h.id);
    return {
      id: h.id,
      label: h.label,
      color: h.color,
      count: g.length,
      flex: String(g.length ? g.length / maxHS : 0.0001),
      spend: g.length && h.id !== "none" ? fmtMoney(g.reduce((s, a) => s + a.spend, 0)) : "",
      opacity: !st.health || st.health === h.id ? 1 : 0.3,
      bg: st.health === h.id ? "#F1F5F9" : "transparent",
      onClick: () => A.set({ health: st.health === h.id ? null : h.id, page: 0 }),
    };
  });

  // Stage chips: crossfilter — counts respect search + owner but not stage.
  const stageChips = STAGE_ORDER.filter((s) => s !== "Other" || accounts.some((a) => a.co.stage === "Other")).map((s) => {
    const on = st.stages.includes(s);
    return {
      label: s,
      color: STAGE_COLOR[s],
      count: accounts.filter((a) => match(a) && a.co.stage === s).length,
      bg: on ? "#0F172A" : "#FFFFFF",
      fg: on ? "#FFFFFF" : "#334155",
      bd: on ? "#0F172A" : "#E5E7EB",
      onClick: () => A.tog("stages", s),
    };
  });

  const owners = ownersList.map((o) => ({
    ...o,
    opacity: !st.owner || st.owner === o.id ? 1 : 0.35,
    ring: st.owner === o.id ? `0 0 0 2px #fff,0 0 0 4px ${o.color}` : "none",
    onClick: () => A.set({ owner: st.owner === o.id ? null : o.id, page: 0 }),
  }));

  const selKey = (k: string) => st.sel.includes(k);
  const rows = list.map((a) => {
    const k = "a" + a.co.savedId;
    const on = selKey(k);
    const top = a.lanes[0];
    return {
      key: k,
      coKey: a.co.key,
      savedId: a.co.savedId,
      uuid: a.co.uuid,
      name: a.co.name,
      initials: a.co.initials,
      logoDomain: a.co.logoDomain,
      city: a.co.city,
      ownerKey: a.co.ownerKey,
      ownerColor: a.co.ownerColor,
      ownerName: a.co.ownerName,
      contactsLabel: a.contacts + (a.contacts === 1 ? " contact" : " contacts"),
      stage: a.co.stage,
      ...stagePill(a.co.stage),
      has: a.health !== "none",
      none: a.health === "none",
      lastAgo: ago(a.lastDays),
      lastDate: a.lastDate ?? "",
      lastFg: a.lastDays == null ? "#94a3b8" : a.lastDays <= 30 ? "#059669" : a.lastDays <= 90 ? "#2563eb" : "#e11d48",
      ship: fmtNum(a.ship),
      spark: pathOf(a.series),
      teu: fmtNum(a.teu),
      spend: fmtMoney(a.spend),
      yoy: dFmt(a.yoy),
      yoyFg: dFg(a.yoy),
      laneOc: top?.oc ?? "",
      lane: top?.label ?? "—",
      laneShare: top && top.share ? Math.round(top.share * 100) + "%" : "",
      sig: a.sig.t,
      sigIcon: a.sig.icon,
      sigColor: a.sig.color,
      chkBd: on ? "#3b82f6" : "#CBD5E1",
      chkBg: on ? "#3b82f6" : "#FFFFFF",
      rowBg: on ? "rgba(59,130,246,0.05)" : "transparent",
      onCheck: () => A.tog("sel", k),
      onClick: () => A.set({ drawer: { t: "co", id: a.co.savedId } }),
    };
  });

  const pageRows = rows.slice(st.page * PAGE_SIZE, (st.page + 1) * PAGE_SIZE);
  const keys = rows.map((r) => r.key);
  const all = keys.length > 0 && keys.every(selKey);

  return {
    kpis,
    healthSegs,
    stageChips,
    owners,
    rows: pageRows,
    totalRows: rows.length,
    pages: Math.max(1, Math.ceil(rows.length / PAGE_SIZE)),
    noRows: rows.length === 0,
    hasFilters: !!(ql || st.health || st.stages.length || st.owner),
    sum: {
      n: fmtNum(list.length),
      active: fmtNum(active),
      ship: fmtNum(ship),
      spend: fmtMoney(spend),
      slowing: list.filter((a) => a.health === "slowing").length,
      dormant: list.filter((a) => a.health === "dormant").length,
    },
    footer: `Showing ${pageRows.length} of ${accounts.length} saved companies`,
    allBd: all ? "#3b82f6" : "#CBD5E1",
    allBg: all ? "#3b82f6" : "#FFFFFF",
    selAll: () => A.set({ sel: all ? [] : keys }),
  };
}

/** Contacts-tab view model (README §4.4 + contacts KPIs). */
export function computeContactsView(
  contacts: CCContact[],
  accounts: AccountDerived[],
  st: CCState,
  A: CCActions,
) {
  const ql = st.q.trim().toLowerCase();
  const acctByUuid = new Map(accounts.filter((a) => a.co.uuid).map((a) => [a.co.uuid as string, a]));
  const ownerOf = (c: CCContact) => acctByUuid.get(c.companyUuid)?.co.ownerId ?? null;

  const cm = (c: CCContact) =>
    (!ql || (c.name + " " + c.title + " " + (acctByUuid.get(c.companyUuid)?.co.name ?? "") + " " + (c.emailAddr || "")).toLowerCase().includes(ql)) &&
    (!st.owner || ownerOf(c) === st.owner) &&
    (st.chan === "all" ||
      (st.chan === "email" && c.email === "verified") ||
      (st.chan === "phone" && c.phone) ||
      (st.chan === "fresh" && !c.camp));
  const pre = contacts.filter(cm);
  const cl = pre.filter((c) => !st.sen.length || st.sen.includes(c.sen));

  const spendOf = (c: CCContact) => acctByUuid.get(c.companyUuid)?.spend ?? 0;
  const bySpend = (x: CCContact, y: CCContact) => spendOf(y) - spendOf(x) || x.companyUuid.localeCompare(y.companyUuid);
  cl.sort((x, y) =>
    st.group ? bySpend(x, y) || SEN_RANK[x.sen] - SEN_RANK[y.sen] : SEN_RANK[x.sen] - SEN_RANK[y.sen] || bySpend(x, y),
  );

  const pct = (n: number, t: number) => (t ? Math.round((n / t) * 100) + "%" : "—");
  const dm = cl.filter(isDM).length;
  const ver = cl.filter((c) => c.email === "verified").length;
  const ph = cl.filter((c) => c.phone).length;
  const inC = cl.filter((c) => c.camp);
  const rep = inC.filter((c) => c.camp!.status === "Replied").length;
  const cos = new Set(cl.map((c) => c.companyUuid)).size;

  const dmUuids = new Set(contacts.filter(isDM).map((c) => c.companyUuid));
  const gapList = accounts
    .filter((a) => a.co.uuid && !dmUuids.has(a.co.uuid))
    .sort((x, y) => y.spend - x.spend);

  const kpis = [
    { id: "n", label: "Contacts", icon: "contact", value: fmtNum(cl.length), delta: "", dfg: "#64748b", sub: "across " + cos + " companies" },
    { id: "dm", label: "Decision makers", icon: "crown", value: fmtNum(dm), delta: pct(dm, cl.length), dfg: "#7c3aed", sub: "Director and above" },
    { id: "ver", label: "Verified email", icon: "badge-check", value: fmtNum(ver), delta: pct(ver, cl.length), dfg: "#059669", sub: "deliverable" },
    { id: "ph", label: "Direct dial", icon: "phone", value: fmtNum(ph), delta: pct(ph, cl.length), dfg: "#0e7490", sub: "with phone" },
    { id: "camp", label: "In Outbound Engine", icon: "megaphone", value: fmtNum(inC.length), delta: String(rep), dfg: "#059669", sub: "replied" },
    { id: "cov", label: "Account coverage", icon: "shield-check", value: pct(accounts.length - gapList.length, accounts.length), delta: String(gapList.length), dfg: "#d97706", sub: "without a decision maker" },
  ];

  const senChips = SENIORITY.map((s) => {
    const on = st.sen.includes(s.id);
    return {
      label: s.id,
      color: s.color,
      count: pre.filter((c) => c.sen === s.id).length,
      bg: on ? "#0F172A" : "#FFFFFF",
      fg: on ? "#FFFFFF" : "#334155",
      bd: on ? "#0F172A" : "#E5E7EB",
      onClick: () => A.tog("sen", s.id),
    };
  });

  const CAMP: Record<string, [string, string]> = {
    Sent: ["#475569", "#F1F5F9"],
    Opened: ["#1d4ed8", "rgba(59,130,246,0.12)"],
    Replied: ["#047857", "rgba(16,185,129,0.14)"],
  };
  const senColorOf = (sen: SenId, dark = false) => {
    const s = SENIORITY.find((x) => x.id === sen)!;
    return dark ? s.darkColor : s.color;
  };

  const selKey = (k: string) => st.sel.includes(k);
  const row = (c: CCContact) => {
    const k = "c" + c.id;
    const on = selKey(k);
    const a = acctByUuid.get(c.companyUuid);
    return {
      key: k,
      id: c.id,
      name: c.name,
      initials: c.initials,
      dept: c.dept,
      title: c.title,
      sen: c.sen,
      senColor: senColorOf(c.sen),
      isDM: isDM(c),
      avBg: isDM(c) ? "#0F172A" : "#EEF2F6",
      avFg: isDM(c) ? "#00F0FF" : "#475569",
      co: a?.co.name ?? "—",
      coInitials: a?.co.initials ?? "—",
      coLogoDomain: a?.co.logoDomain ?? null,
      companyUuid: c.companyUuid,
      savedId: a?.co.savedId ?? null,
      email: c.emailAddr || "No email found",
      emailState: c.email,
      emailFg: c.email === "verified" ? "#10b981" : c.email === "unverified" ? "#f59e0b" : "#cbd5e1",
      emailTx: c.email === "none" ? "#94a3b8" : "#334155",
      chE: c.email !== "none" ? "#0891b2" : "#E2E8F0",
      chP: c.phone ? "#0891b2" : "#E2E8F0",
      chL: c.linkedin ? "#0891b2" : "#E2E8F0",
      campStatus: c.camp ? c.camp.status : "Not enrolled",
      campName: c.camp?.name ?? "",
      campFg: c.camp ? CAMP[c.camp.status][0] : "#94a3b8",
      campBg: c.camp ? CAMP[c.camp.status][1] : "transparent",
      touch: c.touchDays == null ? "Never" : ago(c.touchDays),
      chkBd: on ? "#3b82f6" : "#CBD5E1",
      chkBg: on ? "#3b82f6" : "#FFFFFF",
      rowBg: on ? "rgba(59,130,246,0.05)" : "transparent",
      onCheck: () => A.tog("sel", k),
      onClick: () => A.set({ drawer: { t: "ct", id: c.id } }),
      onCo: a ? () => A.set({ drawer: { t: "co", id: a.co.savedId } }) : undefined,
    };
  };

  let groups: { showHead: boolean; head?: any; rows: ReturnType<typeof row>[] }[];
  if (st.group) {
    const ids = [...new Set(cl.map((c) => c.companyUuid))];
    groups = ids.map((uuid) => {
      const a = acctByUuid.get(uuid);
      const g = cl.filter((c) => c.companyUuid === uuid);
      const allForCo = contacts.filter((c) => c.companyUuid === uuid);
      const n = allForCo.filter(isDM).length;
      return {
        showHead: true,
        head: a
          ? {
              name: a.co.name,
              initials: a.co.initials,
              logoDomain: a.co.logoDomain,
              stage: a.co.stage,
              ...stagePill(a.co.stage),
              meta: g.length + " shown · " + (a.health === "none" ? "no import history" : fmtMoney(a.spend) + " est. spend"),
              dm: n ? n + " decision maker" + (n > 1 ? "s" : "") : "No decision maker",
              dmFg: n ? "#059669" : "#d97706",
              dmWarn: !n,
              onClick: () => A.set({ drawer: { t: "co", id: a.co.savedId } }),
            }
          : { name: "—", initials: "—", stage: "", meta: g.length + " shown", dm: "", dmFg: "#64748b", dmWarn: false },
        rows: g.map(row),
      };
    });
  } else {
    groups = [{ showHead: false, rows: cl.map(row) }];
  }

  const keys = cl.map((c) => "c" + c.id);
  const all = keys.length > 0 && keys.every(selKey);

  return {
    kpis,
    senChips,
    groups,
    noContacts: cl.length === 0,
    showGaps: gapList.length > 0 && !ql,
    gaps: gapList.slice(0, 6).map((a) => {
      const n = contacts.filter((c) => c.companyUuid === a.co.uuid).length;
      return {
        name: a.co.name,
        initials: a.co.initials,
        logoDomain: a.co.logoDomain,
        spend: a.health === "none" ? "No history" : fmtMoney(a.spend),
        n: n + " on file",
        onClick: () => A.set({ drawer: { t: "co", id: a.co.savedId } }),
      };
    }),
    hasFilters: !!(ql || st.sen.length || st.owner || st.chan !== "all"),
    csum: {
      n: fmtNum(contacts.length),
      cos: accounts.length,
      dm: fmtNum(contacts.filter(isDM).length),
      verified: fmtNum(contacts.filter((c) => c.email === "verified").length),
      gap: gapList.length,
    },
    footer: `Showing ${cl.length} of ${contacts.length} contacts`,
    allBd: all ? "#3b82f6" : "#CBD5E1",
    allBg: all ? "#3b82f6" : "#FFFFFF",
    selAll: () => A.set({ sel: all ? [] : keys }),
  };
}

/** Drawer VMs (README §4.6). */
export function computeDrawer(
  st: CCState,
  accounts: AccountDerived[],
  contacts: CCContact[],
  A: CCActions,
) {
  const d = st.drawer;
  const acctByUuid = new Map(accounts.filter((a) => a.co.uuid).map((a) => [a.co.uuid as string, a]));
  const senColorDark = (sen: SenId) => SENIORITY.find((x) => x.id === sen)!.darkColor;
  const person = (c: CCContact) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    initials: c.initials,
    sen: c.sen,
    senColor: senColorDark(c.sen),
    onClick: () => A.set({ drawer: { t: "ct", id: c.id } }),
  });

  if (d?.t === "co") {
    const a = accounts.find((x) => x.co.savedId === d.id);
    if (!a) return { dCo: false, dCt: false, pc: null, pp: null };
    const ppl = contacts
      .filter((c) => c.companyUuid === a.co.uuid)
      .sort((x, y) => SEN_RANK[x.sen] - SEN_RANK[y.sen]);
    const mx = Math.max(1, ...a.series);
    return {
      dCo: true,
      dCt: false,
      pp: null,
      pc: {
        savedId: a.co.savedId,
        coKey: a.co.key,
        uuid: a.co.uuid,
        name: a.co.name,
        initials: a.co.initials,
        logoDomain: a.co.logoDomain,
        stage: a.co.stage,
        stageColor: STAGE_COLOR[a.co.stage] ?? "#64748b",
        city: a.co.city,
        owner: a.co.ownerName ?? "—",
        saved: ago(a.savedDays),
        has: a.health !== "none",
        ship: fmtNum(a.ship),
        teu: fmtNum(a.teu),
        spend: fmtMoney(a.spend),
        yoy: dFmt(a.yoy),
        yoyFg: a.yoy == null ? "#94a3b8" : a.yoy >= 0 ? "#34d399" : "#fb7185",
        sig: a.sig.t,
        sigIcon: a.sig.icon,
        sigColor: a.sig.color === "#64748b" ? "#94a3b8" : a.sig.color,
        lastLabel:
          a.lastDays == null
            ? "No U.S. import records in the last 24 months. Check export data or alternate entities."
            : `Last shipment ${a.lastDate} (${ago(a.lastDays)})`,
        bars: a.series.map((v, i) => ({
          s: v / mx,
          bg: i >= 12 ? "#00c8d4" : "#334155",
          title: v + " shipments",
        })),
        lanes: a.lanes.slice(0, 4).map((l) => ({
          oc: l.oc,
          label: l.label,
          n: fmtNum(l.n),
          share: Math.round(l.share * 100) + "%",
        })),
        contactCount: ppl.length,
        people: ppl.slice(0, 5).map(person),
      },
    };
  }

  if (d?.t === "ct") {
    const c = contacts.find((x) => x.id === d.id);
    if (!c) return { dCo: false, dCt: false, pc: null, pp: null };
    const a = acctByUuid.get(c.companyUuid);
    return {
      dCo: false,
      dCt: true,
      pc: null,
      pp: {
        id: c.id,
        name: c.name,
        initials: c.initials,
        title: c.title,
        co: a?.co.name ?? "—",
        coSavedId: a?.co.savedId ?? null,
        coKey: a?.co.key ?? null,
        onCo: a ? () => A.set({ drawer: { t: "co", id: a.co.savedId } }) : undefined,
        sen: c.sen,
        senColor: senColorDark(c.sen),
        email: c.emailAddr || "No email found",
        emailStatus: c.email === "verified" ? "Verified" : c.email === "unverified" ? "Unverified" : "Enrich",
        emailFg: c.email === "verified" ? "#34d399" : c.email === "unverified" ? "#fbbf24" : "#60a5fa",
        phone: c.phone ? "Direct dial available" : "No direct dial",
        phoneFg: c.phone ? "#f8fafc" : "#64748b",
        li: c.linkedin ? "LinkedIn profile matched" : "No LinkedIn match",
        liFg: c.linkedin ? "#f8fafc" : "#64748b",
        touch: c.touchDays == null ? "Never" : ago(c.touchDays),
        added: ago(c.addedDays),
        campTitle: c.camp ? `${c.camp.status} · ${c.camp.name}` : "Not in a campaign",
        campBody: c.camp
          ? "Last step " + (c.touchDays == null ? "—" : ago(c.touchDays))
          : "Add to an Outbound Engine sequence to start outreach.",
        campFg: c.camp ? (c.camp.status === "Replied" ? "#34d399" : "#60a5fa") : "#64748b",
        peers: contacts
          .filter((x) => x.companyUuid === c.companyUuid && x.id !== c.id)
          .sort((x, y) => SEN_RANK[x.sen] - SEN_RANK[y.sen])
          .slice(0, 4)
          .map(person),
      },
    };
  }

  return { dCo: false, dCt: false, pc: null, pp: null };
}
