import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Globe2, Layers, Maximize2, Minimize2, Sparkles, X } from "lucide-react";
import GlobeCanvas, { type GlobeLane } from "@/components/GlobeCanvas";
import LaneMap, { type LaneMapLaneColor } from "@/components/LaneMap";
import LaneViewToggle from "@/components/LaneViewToggle";
import { useLaneViewMode } from "@/hooks/useLaneViewMode";
import { formatLaneShort, resolveEndpoint } from "@/lib/laneGlobe";
import { laneRegionColor } from "@/lib/laneRegions";
import LitFlag from "@/components/ui/LitFlag";
import { usePulseCoach, useWorkspaceLanes } from "./PulseCoachWidget";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useWorkspaceLaneIntel } from "@/api/laneIntel";
import LaneIntelligenceCard from "@/components/maps/LaneIntelligenceCard";

// Responsive globe sizing: clamp to a sensible band so it scales
// down on tablet (where the panel is narrow) and scales up on
// 24-inch+ screens (where the right rail gets generous).
const GLOBE_MIN = 220;
const GLOBE_MAX = 460;

/**
 * Workspace Lanes — aggregated trade-lane view across every saved
 * company visible in the user's workspace.
 *
 * CEO overhaul 2026-08-13: the interactive 2-D LaneMap is now the
 * primary view (light variant, origin-region lane colors, volume-
 * weighted lines, selected-lane focus + supply-chain flow — mirrors
 * the Company Profile map hero at eb33ef20). The legacy 3-D globe
 * remains available behind the existing Globe/Map toggle.
 *
 *  - Line weight = total shipments across all accounts on that lane
 *  - Lane color = origin region (lib/laneRegions), and the ranked-lane
 *    list's rank chips ride the SAME color so card ↔ line mapping is
 *    instant
 *  - Click a line → asks Coach to focus that lane (highlight + brief)
 *  - Coach nudges with `lane_focus` highlight the matching lane
 */

type Mode = "volume" | "concentration" | "opportunity" | "whitespace" | "risk";

const MODE_OPTIONS: { id: Mode; label: string }[] = [
  { id: "volume", label: "By volume" },
  { id: "concentration", label: "By concentration" },
  { id: "opportunity", label: "Opportunity score" },
  { id: "whitespace", label: "Coverage gaps" },
  { id: "risk", label: "Concentration risk" },
];

export default function WorkspaceLanesGlobe() {
  const { lanes, months, laneMonths, loading } = useWorkspaceLanes();
  const { highlightedLane, highlightLane } = usePulseCoach();
  const [mode, setMode] = useState<Mode>("volume");
  const [expanded, setExpanded] = useState(false);
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  // Sticky selection for the "so-what" panel — set by clicking a row or a
  // globe arc, survives hover churn, cleared via the panel's ✕ or an
  // open-ocean click on the globe.
  const [stickyKey, setStickyKey] = useState<string | null>(null);
  const { mode: viewMode, setMode: setViewMode } = useLaneViewMode();
  const globeWrapRef = useRef<HTMLDivElement | null>(null);
  const [globeSize, setGlobeSize] = useState<number>(300);

  // Resize observer — watches the globe column width and picks a
  // square globe size that fits. Runs on every layout change so
  // the globe scales smoothly between tablet, desktop, and 4K.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = globeWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        // Account for padding (12px each side) so the canvas fits
        // without horizontal scroll on narrow phones.
        const target = Math.max(GLOBE_MIN, Math.min(GLOBE_MAX, w - 24));
        setGlobeSize(target);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const laneMetrics = useMemo(() => {
    const grouped = new Map<string, typeof laneMonths>();
    for (const row of laneMonths) {
      const key = `${row.from_label.trim().toLowerCase()}::${row.to_label.trim().toLowerCase()}`;
      const bucket = grouped.get(key) || [];
      bucket.push(row);
      grouped.set(key, bucket);
    }
    const result = new Map<string, { current: number; prior: number; yoy: number | null; latest: string | null }>();
    for (const lane of lanes) {
      const key = `${lane.from_label.trim().toLowerCase()}::${lane.to_label.trim().toLowerCase()}`;
      const rows = (grouped.get(key) || []).slice().sort((a, b) => a.month.localeCompare(b.month));
      const currentRows = rows.slice(-12);
      const priorRows = rows.slice(-24, -12);
      const current = currentRows.reduce((sum, row) => sum + Number(row.shipments || 0), 0);
      const prior = priorRows.reduce((sum, row) => sum + Number(row.shipments || 0), 0);
      result.set(lane.key, {
        current,
        prior,
        yoy: prior > 0 ? ((current - prior) / prior) * 100 : null,
        latest: rows.at(-1)?.month || null,
      });
    }
    return result;
  }, [lanes, laneMonths]);

  const workspaceMonths12 = useMemo(() => months.slice(-12), [months]);
  const workspacePeakRatio = useMemo(() => {
    const values = workspaceMonths12.map((row) => Number(row.shipments) || 0).filter((value) => value > 0);
    if (values.length < 3) return null;
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return average > 0 ? Math.max(...values) / average : null;
  }, [workspaceMonths12]);
  // 3-year seasonal overlay of the workspace monthly totals — mirrors the
  // expanded map's per-lane seasonal view so the dashboard "Monthly trend"
  // panel can show recurring seasonality across years, not just trailing-12.
  const [monthlySeasonal, setMonthlySeasonal] = useState(false);
  const workspaceSeasonal = useMemo(() => {
    const LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const years = Array.from(new Set(months.map((m: any) => String(m.month).slice(0, 4)))).sort().slice(-3);
    const byKey = new Map(months.map((m: any) => [String(m.month), Number(m.shipments) || 0]));
    const rows = LABELS.map((label, i) => {
      const mm = String(i + 1).padStart(2, "0");
      const row: any = { month: label };
      for (const y of years) row[y] = byKey.get(`${y}-${mm}`) || 0;
      return row;
    });
    return { rows, years };
  }, [months]);
  const seasonalAvailable = workspaceSeasonal.years.length >= 2;
  const SEASONAL_YEAR_COLORS = ["#CBD5E1", "#60A5FA", "#2563EB"];

  const sorted = useMemo(() => {
    const copy = [...lanes];
    const volumes = copy.map((lane) => laneMetrics.get(lane.key)?.current || lane.shipments_total).sort((a, b) => a - b);
    const medianVolume = volumes[Math.floor(volumes.length / 2)] || 0;
    let eligible = copy;
    if (mode === "concentration") {
      eligible = copy.filter((lane) => lane.account_count >= 2);
      eligible.sort((a, b) => {
        if (b.account_count !== a.account_count) {
          return b.account_count - a.account_count;
        }
        return (laneMetrics.get(b.key)?.current || b.shipments_total) - (laneMetrics.get(a.key)?.current || a.shipments_total);
      });
    } else if (mode === "opportunity") {
      eligible = copy.filter((lane) => (laneMetrics.get(lane.key)?.yoy ?? -Infinity) > 0);
      eligible.sort((a, b) => (laneMetrics.get(b.key)?.yoy || 0) - (laneMetrics.get(a.key)?.yoy || 0));
    } else if (mode === "whitespace") {
      eligible = copy.filter((lane) => lane.account_count <= 1 && (laneMetrics.get(lane.key)?.current || lane.shipments_total) >= medianVolume);
      eligible.sort((a, b) => ((laneMetrics.get(b.key)?.current || b.shipments_total) / Math.max(1, b.account_count)) - ((laneMetrics.get(a.key)?.current || a.shipments_total) / Math.max(1, a.account_count)));
    } else if (mode === "risk") {
      eligible = copy.filter((lane) => lane.account_count === 1 && (laneMetrics.get(lane.key)?.current || lane.shipments_total) >= medianVolume);
      eligible.sort((a, b) => (laneMetrics.get(b.key)?.current || b.shipments_total) - (laneMetrics.get(a.key)?.current || a.shipments_total));
    } else {
      eligible.sort((a, b) => (laneMetrics.get(b.key)?.current || b.shipments_total) - (laneMetrics.get(a.key)?.current || a.shipments_total));
    }
    // Graceful degradation: the real-data gates (positive YoY, multi-account,
    // >= median volume) can eliminate every lane when a workspace has sparse
    // history (e.g. no prior-year rollup rows to compute YoY). Rather than
    // wiping the globe — which reads as "broken" — fall back to the full
    // volume-ranked lane set so the map always shows real lanes for the mode.
    if (eligible.length === 0 && copy.length > 0) {
      eligible = copy
        .slice()
        .sort((a, b) => (laneMetrics.get(b.key)?.current || b.shipments_total) - (laneMetrics.get(a.key)?.current || a.shipments_total));
    }
    return eligible.slice(0, 8);
  }, [lanes, mode, laneMetrics]);

  const globeLanes: GlobeLane[] = useMemo(() => {
    const out: GlobeLane[] = [];
    for (const l of sorted) {
      const fromMeta = resolveEndpoint(l.from_label) || resolveEndpoint(`Port ${l.from_label}`);
      const toMeta = resolveEndpoint(l.to_label) || resolveEndpoint(`Port ${l.to_label}`);
      if (!fromMeta || !toMeta) continue;
      out.push({
        id: l.key,
        from: fromMeta.canonicalKey,
        to: toMeta.canonicalKey,
        coords: [fromMeta.coords, toMeta.coords],
        fromMeta,
        toMeta,
        shipments: laneMetrics.get(l.key)?.current || l.shipments_total,
      });
    }
    return out;
  }, [sorted, laneMetrics]);

  // Origin-region lane colors — one record drives the map lines AND the
  // lane list's rank chips (deterministic, keyed by lane key). Mirrors
  // the Company Profile map idiom (CDPSupplyChain @ eb33ef20).
  const laneColors = useMemo(() => {
    const out: Record<string, LaneMapLaneColor> = {};
    for (const l of globeLanes) {
      const c = laneRegionColor(l.fromMeta?.countryCode);
      out[l.id] = { base: c.base, selected: c.selected, glow: c.glow };
    }
    return out;
  }, [globeLanes]);

  const highlightId = useMemo(() => {
    if (!highlightedLane?.from || !highlightedLane?.to) return null;
    const wantFrom = String(highlightedLane.from).trim().toLowerCase();
    const wantTo = String(highlightedLane.to).trim().toLowerCase();
    if (!wantFrom || !wantTo) return null;
    // 1. exact match against either the literal label or the resolved
    //    country name (so "South Korea" matches the lane stored as
    //    "Yeongdeungpo-gu, South Korea")
    const matches = (l: typeof sorted[number], want: string, side: "from" | "to") => {
      const literal = (side === "from" ? l.from_label : l.to_label).toLowerCase();
      const meta =
        side === "from"
          ? resolveEndpoint(l.from_label) || resolveEndpoint(`Port ${l.from_label}`)
          : resolveEndpoint(l.to_label) || resolveEndpoint(`Port ${l.to_label}`);
      const country = String(meta?.countryName || "").toLowerCase();
      const code = String(meta?.countryCode || "").toLowerCase();
      return (
        literal === want ||
        country === want ||
        code === want ||
        literal.includes(want) ||
        want.includes(literal) ||
        (country && (country.includes(want) || want.includes(country)))
      );
    };
    const found = sorted.find(
      (l) => matches(l, wantFrom, "from") && matches(l, wantTo, "to"),
    );
    return found?.key || null;
  }, [sorted, highlightedLane]);

  const empty = !loading && sorted.length === 0;

  // Hover wins for transient emphasis; the sticky click-selection keeps the
  // globe focused (and the panel open) when the pointer moves away.
  const effectiveHighlightId = highlightId ?? stickyKey;
  const stickyLane = stickyKey
    ? sorted.find((l) => l.key === stickyKey) ?? null
    : null;

  // Central Intelligence Hub — workspace-scoped BOL detail for the selected
  // lane. The RPC keys on COUNTRY display names ("China" → "United States"),
  // not the raw city labels ("Shanghai, CN"), so resolve each endpoint to its
  // country name the same way the ranked list renders "China → United States"
  // (resolveEndpoint(...).countryName). Falls back to the raw label when the
  // endpoint doesn't resolve. The hook self-disables (→ null) until both names
  // are present, so passing possibly-undefined values is safe.
  const stickyOriginCountry = stickyLane
    ? (resolveEndpoint(stickyLane.from_label) ||
        resolveEndpoint(`Port ${stickyLane.from_label}`))?.countryName ||
      stickyLane.from_label
    : null;
  const stickyDestCountry = stickyLane
    ? (resolveEndpoint(stickyLane.to_label) ||
        resolveEndpoint(`Port ${stickyLane.to_label}`))?.countryName ||
      stickyLane.to_label
    : null;
  const { data: workspaceLaneIntel, isLoading: workspaceLaneIntelLoading } =
    useWorkspaceLaneIntel(stickyOriginCountry, stickyDestCountry);
  const workspaceShipTotal = sorted.reduce(
    (s, l) => s + (laneMetrics.get(l.key)?.current || l.shipments_total || 0),
    0,
  );

  return (
    <div className={expanded ? "fixed inset-0 z-[1000] overflow-auto bg-white" : "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"}>
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-b border-slate-100 px-3 py-2 md:px-4 md:py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Globe2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <div className="min-w-0">
            <div className="font-display truncate text-[12px] font-bold text-slate-900">
              Workspace trade lanes
            </div>
            <div className="font-body hidden truncate text-[10.5px] text-slate-500 md:block">
              Aggregated across every saved account
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Layers className="h-2.5 w-2.5 text-slate-400" />
          {MODE_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setMode(o.id)}
              className={[
                "font-display whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                mode === o.id
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              {o.label}
            </button>
          ))}
          <div className="ml-1 hidden h-3 w-px bg-slate-200 sm:block" aria-hidden />
          <LaneViewToggle mode={viewMode} onChange={setViewMode} />
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("lit:pulse-coach-open", { detail: { surface: "workspace-map", mode } }))} className="font-display inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-slate-800"><Sparkles className="h-3 w-3 text-cyan-600" />Pulse Coach</button>
          <button type="button" onClick={() => setMonthlyOpen((v) => !v)} className="font-display rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">{monthlyOpen ? "Hide monthly" : "Monthly trend"}</button>
          <button type="button" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? "Exit full screen map" : "Open full screen map"} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">{expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
        </div>
      </div>

      {monthlyOpen && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-display text-[11px] font-bold text-slate-900">Workspace shipment seasonality</div>
              <div className="font-body text-[10px] text-slate-500">All saved companies · {monthlySeasonal ? "monthly totals by year (last 3)" : "actual trailing-12-month shipment totals"}</div>
            </div>
            <div className="flex items-center gap-2">
              {seasonalAvailable && (
                <div className="inline-flex gap-1">
                  <button type="button" onClick={() => setMonthlySeasonal(false)} className={["font-display rounded-md border px-2 py-0.5 text-[9.5px] font-semibold", !monthlySeasonal ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"].join(" ")}>12-month</button>
                  <button type="button" onClick={() => setMonthlySeasonal(true)} className={["font-display rounded-md border px-2 py-0.5 text-[9.5px] font-semibold", monthlySeasonal ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600"].join(" ")}>3-yr seasonal</button>
                </div>
              )}
              <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">{workspacePeakRatio == null ? "History building" : `Peak month is ${workspacePeakRatio.toFixed(2)}× average`}</span>
            </div>
          </div>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              {monthlySeasonal && seasonalAvailable ? (
                <BarChart data={workspaceSeasonal.rows}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" fontSize={9} />
                  <YAxis fontSize={9} width={36} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                  {workspaceSeasonal.years.map((y, i) => (
                    <Bar key={y} dataKey={y} name={y} fill={SEASONAL_YEAR_COLORS[i] ?? "#2563EB"} radius={[3, 3, 0, 0]} />
                  ))}
                </BarChart>
              ) : (
                <BarChart data={workspaceMonths12}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" fontSize={9} />
                  <YAxis fontSize={9} width={36} />
                  <Tooltip />
                  <Bar dataKey="shipments" fill="#2563EB" radius={[3, 3, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* body */}
      {empty ? (
        <div className="px-6 py-10 text-center">
          <p className="font-display text-[12px] font-semibold text-slate-700">
            {lanes.length === 0 ? "No trade lanes yet." : "No lanes match this real-data filter."}
          </p>
          <p className="font-body mt-1 text-[11px] text-slate-500">
            {lanes.length === 0
              ? "Save a company with shipment history to fill the globe."
              : "Choose another view. This filter never substitutes modeled or synthetic lanes."}
          </p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(240px,1fr)_minmax(260px,1.2fr)] xl:grid-cols-[minmax(320px,1.1fr)_minmax(280px,1fr)] 2xl:grid-cols-[minmax(420px,1.4fr)_minmax(280px,1fr)]">
          <div
            ref={globeWrapRef}
            className={[
              "flex items-center justify-center p-3",
              viewMode === "globe" ? "bg-slate-50" : "bg-white",
            ].join(" ")}
          >
            {viewMode === "globe" ? (
              <GlobeCanvas
                lanes={globeLanes}
                selectedLane={effectiveHighlightId}
                size={globeSize}
                theme="trade"
                showFlagPins
                onSelectLane={(laneId) => {
                  const lane = sorted.find((l) => l.key === laneId);
                  setStickyKey(lane ? lane.key : null);
                  highlightLane(
                    lane ? { from: lane.from_label, to: lane.to_label } : null,
                  );
                }}
              />
            ) : (
              <LaneMap
                lanes={globeLanes}
                selectedLane={effectiveHighlightId}
                onSelectLane={(laneId) => {
                  const lane = sorted.find((l) => l.key === laneId);
                  setStickyKey(lane ? lane.key : null);
                  highlightLane(
                    lane ? { from: lane.from_label, to: lane.to_label } : null,
                  );
                }}
                height={Math.min(Math.max(globeSize, 320), 440)}
                className="w-full overflow-hidden rounded-lg"
                variant="dark"
                volumeScale
                zoomControlPosition="bottomleft"
                laneColors={laneColors}
                unselectedStyle="ghost"
                flow
                linesMode="always"
              />
            )}
          </div>
          <div className="max-h-[360px] overflow-y-auto md:max-h-[460px] 2xl:max-h-[520px]">
            {sorted.map((l, i) => {
              const fromMeta =
                resolveEndpoint(l.from_label) || resolveEndpoint(`Port ${l.from_label}`);
              const toMeta =
                resolveEndpoint(l.to_label) || resolveEndpoint(`Port ${l.to_label}`);
              const isActive = effectiveHighlightId === l.key;
              return (
                <button
                  key={l.key}
                  type="button"
                  onMouseEnter={() =>
                    highlightLane({ from: l.from_label, to: l.to_label })
                  }
                  onMouseLeave={() => highlightLane(null)}
                  onClick={() => {
                    setStickyKey(l.key);
                    highlightLane({ from: l.from_label, to: l.to_label });
                  }}
                  className={[
                    // Single-line grid: index | from | arrow | to | metric.
                    // Fixed slots for index, arrow, and metric column keep
                    // every row's geometry identical regardless of label
                    // length, so lanes line up edge-to-edge.
                    "grid w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 md:px-4 md:py-2.5",
                    isActive
                      ? "border-l-2 border-l-blue-500 bg-blue-50/60"
                      : "border-l-2 border-l-transparent hover:bg-slate-50/60",
                  ].join(" ")}
                  style={{
                    gridTemplateColumns:
                      "24px minmax(0,1fr) 14px minmax(0,1fr) 70px",
                  }}
                >
                  {/* Rank chip rides the lane's origin-region color so the
                      list ↔ map-line mapping is instant. */}
                  <span
                    className="font-mono inline-flex h-[18px] w-[22px] shrink-0 items-center justify-center rounded text-[9.5px] font-bold text-white"
                    style={{
                      background:
                        laneColors[l.key]?.[isActive ? "selected" : "base"] ??
                        "#94A3B8",
                    }}
                  >
                    {i + 1}
                  </span>
                  {(() => {
                    // Short labels: "Shanghai, CN → Savannah, US"
                    const short = formatLaneShort(
                      `${l.from_label} → ${l.to_label}`,
                    );
                    // Bare ISO codes ("CN", "PL") read as data debris next
                    // to full city labels — swap them for the resolved
                    // country name ("China") when we have one. The flag
                    // glyph already carries the code visually.
                    const humanize = (
                      label: string,
                      meta: typeof fromMeta,
                    ): string =>
                      label.trim().length <= 3 && meta?.countryName
                        ? meta.countryName
                        : label;
                    const fromLabel = humanize(
                      short?.fromLabel || l.from_label,
                      fromMeta,
                    );
                    const toLabel = humanize(
                      short?.toLabel || l.to_label,
                      toMeta,
                    );
                    return (
                      <>
                        <span className="flex min-w-0 items-center gap-1 whitespace-nowrap">
                          {fromMeta?.countryCode ? (
                            <LitFlag
                              code={fromMeta.countryCode}
                              size={12}
                              label={fromMeta.countryName}
                            />
                          ) : null}
                          <span className="font-display truncate text-[11.5px] font-semibold text-slate-900">
                            {fromLabel}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center justify-center text-slate-300">
                          →
                        </span>
                        <span className="flex min-w-0 items-center gap-1 whitespace-nowrap">
                          {toMeta?.countryCode ? (
                            <LitFlag
                              code={toMeta.countryCode}
                              size={12}
                              label={toMeta.countryName}
                            />
                          ) : null}
                          <span className="font-display truncate text-[11.5px] font-semibold text-slate-900">
                            {toLabel}
                          </span>
                        </span>
                      </>
                    );
                  })()}
                  <div className="text-right">
                    <div className="font-mono text-[11.5px] font-bold text-slate-900">
                      {(laneMetrics.get(l.key)?.current || l.shipments_total).toLocaleString()}
                    </div>
                    <div className="font-body text-[10px] text-slate-500">
                      {l.account_count}{" "}
                      {l.account_count === 1 ? "account" : "accts"}
                    </div>
                    <div className="font-mono text-[9px] font-semibold text-blue-600">
                      {laneMetrics.get(l.key)?.yoy == null
                        ? "YoY · history building"
                        : `YoY ${laneMetrics.get(l.key)!.yoy! >= 0 ? "+" : ""}${laneMetrics.get(l.key)!.yoy!.toFixed(1)}%`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── "So-what" panel — answers the question the globe raises. ──
            Appears when a lane is click-selected (row, arc, or 2-D map):
            volume, workspace share, the actual accounts on the lane as
            clickable chips, and a hand-off into the Explorer. */}
        {stickyLane && (() => {
          const share =
            workspaceShipTotal > 0
              ? Math.round(
                  ((stickyLane.shipments_total || 0) / workspaceShipTotal) * 100,
                )
              : null;
          const names = Array.isArray(stickyLane.account_names)
            ? stickyLane.account_names.slice(0, 6)
            : [];
          const extraNames =
            (stickyLane.account_names?.length || 0) - names.length;
          return (
            <div className="border-t border-slate-200 bg-slate-50/70 px-3 py-3 md:px-4">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[12px] font-bold text-slate-900">
                      {stickyLane.from_label} → {stickyLane.to_label}
                    </span>
                    <button
                      type="button"
                      aria-label="Clear lane selection"
                      onClick={() => {
                        setStickyKey(null);
                        highlightLane(null);
                      }}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="font-body mt-0.5 text-[11px] text-slate-600">
                    <span className="font-mono font-bold text-slate-900">
                      {stickyLane.shipments_total.toLocaleString()}
                    </span>{" "}
                    shipments
                    {share !== null && (
                      <>
                        {" · "}
                        <span className="font-mono font-bold text-slate-900">
                          {share}%
                        </span>{" "}
                        of your workspace volume
                      </>
                    )}
                    {" · "}
                    <span className="font-mono font-bold text-slate-900">
                      {stickyLane.account_count}
                    </span>{" "}
                    {stickyLane.account_count === 1 ? "account" : "accounts"}
                  </div>
                  {names.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="font-body text-[10px] uppercase tracking-[0.08em] text-slate-400">
                        Your accounts here
                      </span>
                      {names.map((n) => (
                        <Link
                          key={n}
                          to={`/app/search?q=${encodeURIComponent(n)}`}
                          className="font-display rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                        >
                          {n}
                        </Link>
                      ))}
                      {extraNames > 0 && (
                        <span className="font-body text-[10.5px] text-slate-400">
                          +{extraNames} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <Link
                  to="/app/search?tab=pulse"
                  className="font-display inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11.5px] font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  Find more shippers like these
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              {/* Central Intelligence Hub — workspace-aggregated BOL-level
                  detail for the selected lane. Purely presentational shared
                  card (scope="workspace"): carrier mix, modes, commodities,
                  FCL/LCL, origin ports. Each section is data-driven and hides
                  when empty; the whole block renders nothing when the RPC
                  returns no shipment-level detail. */}
              <div className="mt-3 border-t border-slate-200 pt-3">
                <div className="font-display mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <Sparkles className="h-3 w-3 text-blue-600" />
                  Lane intelligence
                </div>
                <div className="max-h-[46vh] overflow-y-auto pr-0.5">
                  <LaneIntelligenceCard
                    data={workspaceLaneIntel ?? null}
                    isLoading={workspaceLaneIntelLoading}
                    scope="workspace"
                  />
                </div>
              </div>
            </div>
          );
        })()}
        </>
      )}
    </div>
  );
}
