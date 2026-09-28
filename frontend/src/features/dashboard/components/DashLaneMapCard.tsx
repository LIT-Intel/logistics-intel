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
import { lazy, Suspense, useMemo } from "react";
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

export default function DashLaneMapCard({ workspaceLanes, lanes, headline, unit, reduced }: Props) {
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
  const selectedMapKey = useMemo(() => {
    const active = lanes.filter((l) => l.rowBg !== "transparent").map((l) => l.key);
    if (!active.length) return null;
    const wl = workspaceLanes.find(
      (w) => active.includes(dashKeyOf(w)) || active.includes(dashKeyTrimmed(w)),
    );
    return wl?.key ?? null;
  }, [lanes, workspaceLanes]);

  // Map lane click → matching computeDash lane onClick (lane filter toggle).
  const onSelectLane = (laneId: string) => {
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
        height: 460,
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid #E5E7EB",
        boxShadow: "0 20px 40px rgba(15,23,42,0.10)",
        background: "#EEF2F6",
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
            selectedLane={selectedMapKey}
            onSelectLane={onSelectLane}
            height="fill"
            variant="light"
            volumeScale
            linesMode="always"
            unselectedStyle="ghost"
            laneColors={laneColors}
            zoomControlPosition="bottomright"
            fitPadding={{ top: 30, right: 30, bottom: 30, left: 370 }}
          />
        </Suspense>
      </div>

      {/* ── Left glass overlay panel (UI only — floats over the map) ── */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          bottom: 16,
          width: 340,
          maxWidth: "calc(100% - 32px)",
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
          <div style={{ font: `600 18px/1.3 ${F_DISPLAY}`, marginTop: 6 }}>{headline}</div>
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
          {lanes.length === 0 ? (
            <div style={{ padding: "18px 14px", font: `400 13px/1.5 ${F_BODY}`, color: "#64748b" }}>
              Lane-level history is still building for your saved companies.
            </div>
          ) : (
            lanes.map((l) => (
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
