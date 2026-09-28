/**
 * useDashboardData / useDashState — the Dashboard rebuild's single data
 * assembly + URL-synced state (Dashboard Brief handoff §3.1).
 *
 * Sources (all existing — nothing renamed):
 *   - getWorkspaceSavedCompanies()            → companies + stages + KPIs
 *   - lit_company_time_series_monthly (bulk)  → per-company monthly volumes
 *   - useWorkspaceLanes() (pulse-coach)       → per-lane monthly + map lanes
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { getWorkspaceSavedCompanies } from "@/api/workspace";
import { useWorkspaceLanes } from "@/features/coach/PulseCoachWidget";
import { toArchiveSlug } from "@/features/company-profile/data/useCompanyShipments";
import {
  canonStage,
  dashPresets,
  type CoMonthRow,
  type DashActions,
  type DashCompany,
  type DashDataset,
  type DashMetric,
  type DashState,
  type LaneMonthRow,
} from "./computeDash";
import { rateForYear } from "@/features/company-profile/data/normalizeShipments";

const FIVE_MIN = 5 * 60 * 1000;
const DONE_KEY = "lit-dash-signals-done";

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
}

interface RawTsRow {
  company_id: string;
  year: number;
  month: number;
  shipments: number | string | null;
  teu: number | string | null;
}

async function fetchBulkMonthly(slugs: string[]): Promise<RawTsRow[]> {
  // PostgREST hard-caps every response at 1,000 rows regardless of .limit()
  // (Supabase db-max-rows default). A saved workspace holds ~45k monthly rows,
  // so each chunk MUST be paged with .range() until exhausted — the earlier
  // single-shot fetch silently dropped ~86% of the history and rendered most
  // recently-saved companies as zeros (owner report 2026-09-28).
  const PAGE = 1000;
  const out: RawTsRow[] = [];
  for (let i = 0; i < slugs.length; i += 100) {
    const chunk = slugs.slice(i, i + 100);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("lit_company_time_series_monthly")
        .select("company_id,year,month,shipments,teu")
        .in("company_id", chunk)
        .order("company_id", { ascending: true })
        .order("year", { ascending: true })
        .order("month", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        console.error("fetchBulkMonthly page failed:", error.message);
        break;
      }
      out.push(...((data ?? []) as unknown as RawTsRow[]));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

export interface DashboardData {
  ds: DashDataset | null;
  loading: boolean;
  /** aggregated lanes for the existing map component (pulse-coach shape) */
  workspaceLanes: any[];
}

export function useDashboardData(): DashboardData {
  const savedQ = useQuery({
    queryKey: ["dash-saved-companies"],
    staleTime: FIVE_MIN,
    queryFn: async () => (await getWorkspaceSavedCompanies()).rows ?? [],
  });

  const slugs = useMemo(
    () =>
      Array.from(
        new Set(
          (savedQ.data ?? [])
            .map((r: any) => toArchiveSlug(r?.company?.company_id ?? r?.company?.id ?? null))
            .filter((s: string | null): s is string => !!s),
        ),
      ),
    [savedQ.data],
  );

  const monthlyQ = useQuery({
    queryKey: ["dash-co-monthly", slugs.join("|")],
    enabled: slugs.length > 0,
    staleTime: FIVE_MIN,
    queryFn: () => fetchBulkMonthly(slugs),
  });

  // Owner attribution: lit_saved_companies.user_id → profiles.full_name.
  // RLS scopes rows to own + org-shared saves; missing profile names fall
  // back to "Teammate" (never invented).
  const savedIds = useMemo(
    () => (savedQ.data ?? []).map((r: any) => r.saved_id).filter(Boolean),
    [savedQ.data],
  );
  const ownersQ = useQuery({
    queryKey: ["dash-owners", savedIds.join("|")],
    enabled: savedIds.length > 0,
    staleTime: FIVE_MIN,
    queryFn: async () => {
      const bySaved = new Map<string, string>();
      for (let i = 0; i < savedIds.length; i += 200) {
        const { data } = await supabase
          .from("lit_saved_companies")
          .select("id,user_id")
          .in("id", savedIds.slice(i, i + 200));
        (data ?? []).forEach((r: any) => r.user_id && bySaved.set(r.id, r.user_id));
      }
      const userIds = Array.from(new Set([...bySaved.values()]));
      const names = new Map<string, string>();
      for (let i = 0; i < userIds.length; i += 200) {
        const { data } = await supabase
          .from("profiles")
          .select("id,full_name")
          .in("id", userIds.slice(i, i + 200));
        (data ?? []).forEach((r: any) => r.full_name && names.set(r.id, r.full_name));
      }
      return { bySaved, names };
    },
  });

  const { lanes: workspaceLanes, laneMonths, loading: lanesLoading } = useWorkspaceLanes();

  const ds = useMemo<DashDataset | null>(() => {
    const saved = savedQ.data ?? [];
    if (!saved.length) return null;
    const ts = monthlyQ.data ?? [];
    const now = new Date();

    const years: number[] = [];
    for (const r of ts) if (r.year >= 2000) years.push(r.year);
    for (const lm of laneMonths ?? []) {
      const y = parseInt(String(lm.month).slice(0, 4), 10);
      if (y >= 2000) years.push(y);
    }
    const firstYear = years.length ? Math.min(...years) : now.getFullYear();
    const lastMi = (now.getFullYear() - firstYear) * 12 + now.getMonth();

    const ownerOf = ownersQ.data;
    const OWNER_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#f43f5e", "#00c8d4"];
    const ownerColorIdx = new Map<string, number>();
    const companies: DashCompany[] = saved.map((r: any) => {
      const co = r.company ?? {};
      const key = toArchiveSlug(co.company_id ?? null) ?? String(co.company_id ?? r.saved_id);
      const lastTs = co.kpis?.last_activity ? Date.parse(co.kpis.last_activity) : NaN;
      const ownerId = ownerOf?.bySaved.get(r.saved_id) ?? null;
      const ownerName = ownerId ? (ownerOf?.names.get(ownerId) ?? "Teammate") : null;
      if (ownerId && !ownerColorIdx.has(ownerId)) ownerColorIdx.set(ownerId, ownerColorIdx.size);
      return {
        key,
        uuid: co.id ?? null,
        savedId: r.saved_id,
        name: co.name ?? key,
        city: String(co.address ?? "").split(",").slice(0, 2).join(",").trim(),
        stage: canonStage(r.stage),
        stageRaw: String(r.stage ?? ""),
        topRouteFallback: co.kpis?.top_route_12m ?? null,
        lastActivityTs: Number.isFinite(lastTs) ? lastTs : null,
        initials: initialsOf(co.name ?? key),
        logoDomain: co.domain || co.website || null,
        savedAtTs: r.saved_at ? (Number.isFinite(Date.parse(r.saved_at)) ? Date.parse(r.saved_at) : null) : null,
        ownerId,
        ownerName,
        ownerKey: ownerName ? initialsOf(ownerName) : "—",
        ownerColor: ownerId
          ? OWNER_COLORS[(ownerColorIdx.get(ownerId) ?? 0) % OWNER_COLORS.length]
          : "#94a3b8",
      };
    });
    // De-dupe by key (org shares can produce duplicates)
    const seen = new Set<string>();
    const uniq = companies.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));

    const coRows: CoMonthRow[] = [];
    for (const r of ts) {
      const mi = (r.year - firstYear) * 12 + (r.month - 1);
      if (mi < 0 || mi > lastMi) continue;
      const shipments = num(r.shipments);
      const teu = num(r.teu);
      if (shipments <= 0 && teu <= 0) continue;
      coRows.push({
        c: r.company_id,
        mi,
        shipments,
        teu,
        spend: Math.round(teu * rateForYear(r.year)),
      });
    }

    const laneRows: LaneMonthRow[] = [];
    for (const lm of laneMonths ?? []) {
      const d = new Date(String(lm.month).length === 7 ? lm.month + "-01" : lm.month);
      if (Number.isNaN(+d)) continue;
      const mi = (d.getUTCFullYear() - firstYear) * 12 + d.getUTCMonth();
      if (mi < 0 || mi > lastMi) continue;
      const c = toArchiveSlug(lm.company_id) ?? lm.company_id;
      const shipments = num(lm.shipments);
      const teu = num(lm.teu);
      if (shipments <= 0 && teu <= 0) continue;
      laneRows.push({
        c,
        lane: (lm.from_label + "::" + lm.to_label).toLowerCase(),
        fromLabel: lm.from_label,
        toLabel: lm.to_label,
        mi,
        shipments,
        teu,
        spend: Math.round(teu * rateForYear(d.getUTCFullYear())),
      });
    }

    return { companies: uniq, coRows, laneRows, firstYear, lastMi, todayTs: +now };
  }, [savedQ.data, monthlyQ.data, laneMonths, ownersQ.data]);

  return {
    ds,
    loading: savedQ.isLoading || (slugs.length > 0 && monthlyQ.isLoading) || lanesLoading,
    workspaceLanes: workspaceLanes ?? [],
  };
}

// ---------------------------------------------------------------- state

const loadDone = (): string[] => {
  try {
    const raw = localStorage.getItem(DONE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const saveDone = (done: string[]) => {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify(done.slice(-200)));
  } catch {
    /* noop */
  }
};

export function useDashState(ds: DashDataset | null): {
  state: DashState;
  actions: DashActions;
  endBrush: () => void;
  ready: boolean;
} {
  const [params, setParams] = useSearchParams();
  const brushAnchor = useRef<number | null>(null);
  const initedFor = useRef<DashDataset | null>(null);
  const [st, setSt] = useState<DashState>(() => ({
    m0: 0,
    m1: 0,
    preset: "12M",
    metric: "shipments",
    f: {},
    sel: null,
    sort: "value",
    done: loadDone(),
    intro: true,
    disp: null,
  }));

  useEffect(() => {
    if (!ds || initedFor.current === ds) return;
    initedFor.current = ds;
    const presets = dashPresets(ds);
    const pid = params.get("p") ?? "12M";
    const p = presets.find((x) => x.id === pid) ?? presets[0];
    const mParam = params.get("m");
    const metric: DashMetric = mParam === "teu" || mParam === "spend" ? mParam : "shipments";
    const f: DashState["f"] = {};
    const lanes = params.getAll("lane");
    const stagesSel = params.getAll("stage");
    const ownersSel = params.getAll("owner");
    if (lanes.length) f.lane = lanes;
    if (stagesSel.length) f.stage = stagesSel;
    if (ownersSel.length) f.owner = ownersSel;
    setSt((s) => ({ ...s, m0: p.m0, m1: p.m1, preset: p.id, metric, f, intro: true }));
    const t = setTimeout(() => setSt((s) => ({ ...s, intro: false })), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds]);

  useEffect(() => {
    if (!ds || initedFor.current !== ds) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        ["p", "m", "lane", "stage", "owner"].forEach((k) => next.delete(k));
        if (st.preset) next.set("p", st.preset);
        if (st.metric !== "shipments") next.set("m", st.metric);
        (st.f.lane ?? []).forEach((v) => next.append("lane", v));
        (st.f.stage ?? []).forEach((v) => next.append("stage", v));
        (st.f.owner ?? []).forEach((v) => next.append("owner", v));
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, st.preset, st.metric, st.f]);

  const actions = useMemo<DashActions>(
    () => ({
      toggle: (dim, key) =>
        setSt((s) => {
          const c = s.f[dim] ?? [];
          return {
            ...s,
            f: { ...s.f, [dim]: c.includes(key) ? c.filter((x) => x !== key) : [...c, key] },
          };
        }),
      preset: (id) => {
        if (!ds) return;
        const p = dashPresets(ds).find((x) => x.id === id);
        if (p) setSt((s) => ({ ...s, m0: p.m0, m1: p.m1, preset: p.id }));
      },
      metric: (m) => setSt((s) => ({ ...s, metric: m })),
      brushStart: (mi) => {
        brushAnchor.current = mi;
        setSt((s) => ({ ...s, m0: mi, m1: mi, preset: null }));
      },
      brushMove: (mi) => {
        const a = brushAnchor.current;
        if (a == null) return;
        setSt((s) => ({ ...s, m0: Math.min(a, mi), m1: Math.max(a, mi), preset: null }));
      },
      select: (key) => setSt((s) => ({ ...s, sel: key })),
      sort: (k) => setSt((s) => ({ ...s, sort: k })),
      done: (k) =>
        setSt((s) => {
          const done = s.done.includes(k) ? s.done.filter((x) => x !== k) : [...s.done, k];
          saveDone(done);
          return { ...s, done };
        }),
    }),
    [ds],
  );

  useEffect(() => {
    const up = () => {
      brushAnchor.current = null;
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSt((s) => (s.sel ? { ...s, sel: null } : s));
    };
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", esc);
    };
  }, []);

  return {
    state: st,
    actions,
    endBrush: () => {
      brushAnchor.current = null;
    },
    ready: !!ds && initedFor.current === ds,
  };
}
