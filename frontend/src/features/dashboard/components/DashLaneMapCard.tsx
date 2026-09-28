/**
 * DashLaneMapCard — Dashboard rebuild §C.2 (Morning Brief handoff).
 *
 * Mounts the EXISTING LaneMap (map core untouched) inside a 460px card and
 * floats the left glass "Portfolio lanes" overlay panel on top. The
 * WorkspaceLane[] → GlobeLane[] conversion replicates the exact idiom of
 * src/features/coach/WorkspaceLanesGlobe.tsx (resolveEndpoint coords +
 * laneRegionColor origin-region palette) since that conversion is not
 * exported from the coach file.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { type GlobeLane } from "@/components/GlobeCanvas";
import { type LaneMapLaneColor } from "@/components/LaneMap";
import { resolveEndpoint } from "@/lib/laneGlobe";
import { laneRegionColor } from "@/lib/laneRegions";

// Same code-split idiom as WorkspaceLanesGlobe — Leaflet only loads on demand.
const LaneMap = lazy(() => import("@/components/LaneMap"));

const F_DISPLAY = "'Space Grotesk',sans-serif";
const F_BODY = "'DM Sans',system-ui,sans-serif";
const F_MONO = "'JetBrains Mono',monospace";
const EASE = "cubic-bezier(0.16,1,0.3,1)";

/** pulse-coach WorkspaceLane (structural subset we consume). */
interface WorkspaceLaneLite {
  key: string;
  from_label: string;
  to_label: string;
  shipments_total: number;
  account_count?: number;
}

/** computeDash lane row (structural subset we consume). */
interface DashLaneRow {
  key: string;
  label: string;
  from: string;
  color: string;
  cos: string;
  val: string;
  delta: string;
  deltaFg: string;
  s: number;
  opacity: number;
  rowBg: string;
  onClick: () => void;
}

interface Props {
  workspaceLanes: WorkspaceLaneLite[];
  lanes: DashLaneRow[];
  headline: string; // "{topLane} leads with {share}"
  unit: string;
  reduced: boolean;
}

const dashKeyOf = (l: WorkspaceLaneLite) => `${l.from_label}::${l.to_label}`.toLowerCase();
const dashKeyTrimmed = (l: WorkspaceLaneLite) =>
  `${l.from_label.trim()}::${l.to_label.trim()}`.toLowerCase();

/** Phone layout: the lanes panel docks to the bottom instead of covering the map. */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width:640px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width:640px)");
    const on = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

export default function DashLaneMapCard({ workspaceLanes, lanes, headline, unit, reduced }: Props) {
  const isNarrow = useIsNarrow();
  // ── WorkspaceLane[] → GlobeLane[] (mirrors WorkspaceLanesGlobe) ──────
  const globeLanes: GlobeLane[] = useMemo(() => {
    const sorted = [...workspaceLanes].sort(
      (a, b) => (b.shipments_total || 0) - (a.shipments_total || 0),
    );
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
        shipments: l.shipments_total,
      });
    }
    return out;
  }, [workspaceLanes]);

  // Origin-region lane colors — one record drives the map lines (same as
  // the coach map, via lib/laneRegions).
  const laneColors = useMemo(() => {
    const out: Record<string, LaneMapLaneColor> = {};
    for (const l of globeLanes) {
      const c = laneRegionColor(l.fromMeta?.countryCode);
      out[l.id] = { base: c.base, selected: c.selected, glow: c.glow };
    }
    return out;
  }, [globeLanes]);

  // Map ← filter selection: first lane-filtered dash lane, mapped back to
  // its workspace lane key so the existing LaneMap highlights it.
  const filterMapKey = useMemo(() => {
    const active = lanes.filter((l) => l.rowBg !== "transparent").map((l) => l.key);
    if (!active.length) return null;
    const wl = workspaceLanes.find(
      (w) => active.includes(dashKeyOf(w)) || active.includes(dashKeyTrimmed(w)),
    );
    return wl?.key ?? null;
  }, [lanes, workspaceLanes]);

  // Fallback mode: monthly lane rollups don't cover every saved company yet,
  // so when computeDash has no lane rows the panel ranks the pulse-coach
  // AGGREGATE lanes (the same feed the arcs already draw) — panel and map
  // always agree. Selection then highlights on the map only.
  const [fallbackSel, setFallbackSel] = useState<string | null>(null);
  const fallbackMode = lanes.length === 0 && workspaceLanes.length > 0;
  const fallbackRows = useMemo(() => {
    if (!fallbackMode) return [];
    const sorted = [...workspaceLanes].sort(
      (a, b) => (b.shipments_total || 0) - (a.shipments_total || 0),
    );
    const tot = sorted.reduce((a, l) => a + (l.shipments_total || 0), 0) || 1;
    const mx = sorted[0]?.shipments_total || 1;
    return sorted.slice(0, 12).map((l) => {
      const fromMeta = resolveEndpoint(l.from_label) || resolveEndpoint(`Port ${l.from_label}`);
      const c = laneRegionColor(fromMeta?.countryCode);
      const on = fallbackSel === l.key;
      return {
        key: l.key,
        label: `${l.from_label} → ${l.to_label}`,
        from: l.from_label,
        color: c.base,
        cos: `${l.account_count ?? "—"} ${l.account_count === 1 ? "account" : "accounts"}`,
        val: (l.shipments_total || 0).toLocaleString("en-US"),
        delta: Math.round(((l.shipments_total || 0) / tot) * 100) + "%",
        deltaFg: "#64748b",
        s: (l.shipments_total || 0) / mx,
        opacity: fallbackSel && !on ? 0.55 : 1,
        rowBg: on ? "rgba(59,130,246,0.07)" : "transparent",
        onClick: () => setFallbackSel(on ? null : l.key),
      };
    });
  }, [fallbackMode, workspaceLanes, fallbackSel]);
  const shownRows = fallbackMode ? fallbackRows : lanes;
  const shownHeadline =
    fallbackMode && fallbackRows.length
      ? `${fallbackRows[0].label} leads with ${fallbackRows[0].delta}`
      : headline;

  // Map lane click → matching computeDash lane onClick (lane filter toggle),
  // or the local highlight in fallback mode.
  const onSelectLane = (laneId: string) => {
    if (fallbackMode) {
      setFallbackSel((cur) => (cur === laneId ? null : laneId));
      return;
    }
    const wl = workspaceLanes.find((w) => w.key === laneId);
    if (!wl) return;
    const k1 = dashKeyOf(wl);
    const k2 = dashKeyTrimmed(wl);
    const match = lanes.find((l) => l.key === k1 || l.key === k2);
    match?.onClick();
  };

  return (
    <section
      style={{
        position: "relative",
        height: isNarrow ? 420 : 460,
        borderRadius: 14,
        overflow: "hidden",
        // Same shell as the profile map card (owner: match the profile style)
        border: "1px solid #1F2937",
        boxShadow: "0 20px 40px rgba(15,23,42,0.14)",
        background: "#0b1220",
      }}
    >
      <div style={{ position: "absolute", inset: 0 }}>
        <Suspense
          fallback={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                font: `500 11px ${F_BODY}`,
                color: "#94a3b8",
              }}
            >
              Loading map…
            </div>
          }
        >
          <LaneMap
            lanes={globeLanes}
            selectedLane={fallbackMode ? fallbackSel : filterMapKey}
            onSelectLane={onSelectLane}
            height="fill"
            variant="dark"
            volumeScale
            linesMode="always"
            unselectedStyle="ghost"
            laneColors={laneColors}
            zoomControlPosition={isNarrow ? "topright" : "bottomright"}
            fitPadding={
              isNarrow
                ? { top: 24, right: 24, bottom: 210, left: 24 }
                : { top: 30, right: 30, bottom: 30, left: 370 }
            }
          />
        </Suspense>
      </div>

      {/* ── Glass lanes panel — left rail on desktop, bottom sheet on phones ── */}
      <div
        style={{
          position: "absolute",
          ...(isNarrow
            ? { left: 10, right: 10, bottom: 10, top: "auto", width: "auto", maxHeight: 200 }
            : { top: 16, left: 16, bottom: 16, width: 340 }),
          maxWidth: "calc(100% - 20px)",
          zIndex: 500,
          background: "rgba(255,255,255,0.94)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderRadius: 14,
          boxShadow: "0 20px 40px rgba(15,23,42,0.18)",
          color: "#0F172A",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid #EEF2F6" }}>
          <div
            style={{
              font: `600 11px ${F_DISPLAY}`,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#0e7490",
            }}
          >
            Portfolio lanes · by {unit}
          </div>
          <div style={{ font: `600 ${isNarrow ? 15 : 18}px/1.3 ${F_DISPLAY}`, marginTop: 6 }}>{shownHeadline}</div>
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: 6,
            scrollbarWidth: "thin",
            scrollbarColor: "#CBD5E1 transparent",
          }}
        >
          {shownRows.length === 0 ? (
            <div style={{ padding: "18px 14px", font: `400 13px/1.5 ${F_BODY}`, color: "#64748b" }}>
              Lane-level history is still building for your saved companies.
            </div>
          ) : (
            shownRows.map((l) => (
              <div
                key={l.key}
                onClick={l.onClick}
                className="dv2-lanerow"
                style={{
                  padding: "9px 12px",
                  borderRadius: 10,
                  cursor: "pointer",
                  background: l.rowBg,
                  opacity: l.opacity,
                  transition: "background 200ms, opacity 200ms",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      font: `600 11px ${F_MONO}`,
                      color: "#fff",
                      background: l.color,
                      borderRadius: 4,
                      padding: "2px 5px",
                    }}
                  >
                    {(l.from || l.label).slice(0, 2).toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        font: `600 13px ${F_BODY}`,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {l.label}
                    </div>
                    <div style={{ font: `400 11px ${F_MONO}`, color: "#94a3b8" }}>{l.cos}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ font: `600 13px ${F_MONO}` }}>{l.val}</div>
                    <div style={{ font: `600 10px ${F_MONO}`, color: l.deltaFg }}>{l.delta}</div>
                  </div>
                </div>
                <div
                  style={{
                    height: 4,
                    background: "#EEF2F6",
                    borderRadius: 999,
                    marginTop: 7,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      background: l.color,
                      borderRadius: 999,
                      transform: `scaleX(${l.s})`,
                      transformOrigin: "left",
                      transition: reduced ? "none" : `transform 500ms ${EASE}`,
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
