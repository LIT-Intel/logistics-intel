/**
 * useProfileState — page state + URL sync + actions (README §4.2).
 *
 * URL params (shareable, survive refresh; coexist with the page's ?tab=):
 *   p   preset id ("12M" | "YTD" | "<year>" | "ALL")
 *   m0/m1  custom brushed window (only when preset is null)
 *   m   metric ("teu" | "spend"; omitted for the default "shipments")
 *   lane/carrier/supplier/product/ctype  repeated params per selected value
 *
 * KPI pins persist per user in localStorage.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { computePresets } from "./selectors";
import type {
  DimKey,
  Filters,
  Metric,
  ProfileActions,
  ProfileState,
  ShipmentDataset,
} from "./types";
import { DEFAULT_PINS, DIMS } from "./types";

const PINS_KEY = "lit-profile-v2-pins";

const loadPins = (): string[] => {
  try {
    const raw = localStorage.getItem(PINS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.every((x) => typeof x === "string") && arr.length) return arr;
    }
  } catch { /* private mode etc. */ }
  return DEFAULT_PINS;
};
const savePins = (pins: string[]) => {
  try { localStorage.setItem(PINS_KEY, JSON.stringify(pins)); } catch { /* noop */ }
};

export interface ProfileExtraActions {
  endBrush(): void;
  closeTrace(): void;
  clearAll(): void;
  clearHover(): void;
}

export interface UseProfileStateResult {
  state: ProfileState;
  actions: ProfileActions;
  extra: ProfileExtraActions;
  ready: boolean;
}

export function useProfileState(ds: ShipmentDataset | null): UseProfileStateResult {
  const [params, setParams] = useSearchParams();
  const brushAnchor = useRef<number | null>(null);
  const initedFor = useRef<ShipmentDataset | null>(null);
  const [st, setSt] = useState<ProfileState>(() => ({
    m0: 0, m1: 0, preset: "12M", metric: "shipments", f: {},
    trace: null, hover: null, pins: loadPins(), intro: true, disp: null,
  }));

  // Initialize from URL once the dataset (and thus the month frame) exists.
  useEffect(() => {
    if (!ds || initedFor.current === ds) return;
    initedFor.current = ds;
    const presets = computePresets(ds);
    const clampMi = (v: number) => Math.max(0, Math.min(ds.lastMi, Math.round(v)));
    const f: Filters = {};
    for (const d of DIMS) {
      const vals = params.getAll(d);
      if (vals.length) f[d] = vals;
    }
    const mParam = params.get("m");
    const metric: Metric = mParam === "teu" || mParam === "spend" ? mParam : "shipments";
    const m0p = params.get("m0");
    const m1p = params.get("m1");
    let m0: number, m1: number, preset: string | null;
    if (m0p != null && m1p != null && Number.isFinite(+m0p) && Number.isFinite(+m1p)) {
      m0 = clampMi(+m0p);
      m1 = clampMi(+m1p);
      if (m1 < m0) [m0, m1] = [m1, m0];
      preset = null;
    } else {
      const p = presets.find((x) => x.id === (params.get("p") ?? "12M")) ?? presets[0];
      m0 = p.m0; m1 = p.m1; preset = p.id;
    }
    setSt((s) => ({ ...s, m0, m1, preset, metric, f, intro: true }));
    // first paint: bars render at scale 0 for ~120ms, then grow in (§11)
    const t = setTimeout(() => setSt((s) => ({ ...s, intro: false })), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds]);

  // Reflect state → URL (replace, never push history entries).
  useEffect(() => {
    if (!ds || initedFor.current !== ds) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        ["p", "m", "m0", "m1", ...DIMS].forEach((k) => next.delete(k));
        if (st.preset) next.set("p", st.preset);
        else { next.set("m0", String(st.m0)); next.set("m1", String(st.m1)); }
        if (st.metric !== "shipments") next.set("m", st.metric);
        for (const d of DIMS) (st.f[d] ?? []).forEach((v) => next.append(d, v));
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, st.m0, st.m1, st.preset, st.metric, st.f]);

  const actions = useMemo<ProfileActions>(
    () => ({
      toggle: (dim: DimKey, key: string) =>
        setSt((s) => {
          const c = s.f[dim] || [];
          return { ...s, f: { ...s.f, [dim]: c.includes(key) ? c.filter((x) => x !== key) : [...c, key] } };
        }),
      preset: (id) => {
        if (!ds) return;
        const p = computePresets(ds).find((x) => x.id === id);
        if (p) setSt((s) => ({ ...s, m0: p.m0, m1: p.m1, preset: p.id }));
      },
      range: (m0, m1, id) => setSt((s) => ({ ...s, m0, m1, preset: id ?? null })),
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
      hover: (mi) => setSt((s) => ({ ...s, hover: mi })),
      trace: (dim, key, label, mi) => setSt((s) => ({ ...s, trace: { dim, key, label, mi } })),
      pin: (id) =>
        setSt((s) => {
          const pins = s.pins.includes(id) ? s.pins.filter((x) => x !== id) : [...s.pins, id];
          savePins(pins);
          return { ...s, pins };
        }),
    }),
    [ds],
  );

  const extra = useMemo<ProfileExtraActions>(
    () => ({
      endBrush: () => { brushAnchor.current = null; },
      closeTrace: () => setSt((s) => (s.trace ? { ...s, trace: null } : s)),
      clearAll: () => setSt((s) => ({ ...s, f: {} })),
      clearHover: () => setSt((s) => (s.hover != null ? { ...s, hover: null } : s)),
    }),
    [],
  );

  // Global listeners the brush needs (mouseup anywhere ends it; Esc closes trace)
  useEffect(() => {
    const up = () => { brushAnchor.current = null; };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") extra.closeTrace(); };
    window.addEventListener("mouseup", up);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mouseup", up);
      window.removeEventListener("keydown", esc);
    };
  }, [extra]);

  return { state: st, actions, extra, ready: !!ds && initedFor.current === ds };
}
