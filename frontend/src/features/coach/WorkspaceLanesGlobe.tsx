import { useEffect, useMemo, useRef, useState } from "react";
import { Globe2, Layers } from "lucide-react";
import GlobeCanvas, { type GlobeLane } from "@/components/GlobeCanvas";
import { formatLaneShort, resolveEndpoint } from "@/lib/laneGlobe";
import LitFlag from "@/components/ui/LitFlag";
import { usePulseCoach, useWorkspaceLanes } from "./PulseCoachWidget";

// Responsive globe sizing: clamp to a sensible band so it scales
// down on tablet (where the panel is narrow) and scales up on
// 24-inch+ screens (where the right rail gets generous).
const GLOBE_MIN = 220;
const GLOBE_MAX = 460;

/**
 * Workspace Lanes Globe — aggregated trade-lane view across every
 * saved company in the user's org. Replaces the "single company"
 * globe pattern from the Company Profile.
 *
 *  - Arc width = total shipments across all accounts on that lane
 *  - Multi-account lanes get visual emphasis (cyan accent)
 *  - Click an arc → asks Coach to focus that lane (highlight + brief)
 *  - Coach nudges with `lane_focus` highlight the matching arc
 *
 * The hero is split: globe on the left, ranked-lane list on the right
 * (mirrors Company Profile's TopLanesCard so the design language is
 * consistent across pages).
 */

type Mode = "volume" | "concentration";

const MODE_OPTIONS: { id: Mode; label: string }[] = [
  { id: "volume", label: "By volume" },
  { id: "concentration", label: "By concentration" },
];

export default function WorkspaceLanesGlobe() {
  const { lanes, loading } = useWorkspaceLanes();
  const { highlightedLane, highlightLane } = usePulseCoach();
  const [mode, setMode] = useState<Mode>("volume");
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

  const sorted = useMemo(() => {
    const copy = [...lanes];
    if (mode === "concentration") {
      copy.sort((a, b) => {
        if (b.account_count !== a.account_count) {
          return b.account_count - a.account_count;
        }
        return b.shipments_total - a.shipments_total;
      });
    } else {
      copy.sort((a, b) => b.shipments_total - a.shipments_total);
    }
    return copy.slice(0, 8);
  }, [lanes, mode]);

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
        shipments: l.shipments_total,
      });
    }
    return out;
  }, [sorted]);

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

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
        <div className="flex shrink-0 flex-wrap items-center gap-1">
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
        </div>
      </div>

      {/* body */}
      {empty ? (
        <div className="px-6 py-10 text-center">
          <p className="font-display text-[12px] font-semibold text-slate-700">
            No trade lanes yet.
          </p>
          <p className="font-body mt-1 text-[11px] text-slate-500">
            Save a company with shipment history to fill the globe.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[minmax(240px,1fr)_minmax(260px,1.2fr)] xl:grid-cols-[minmax(320px,1.1fr)_minmax(280px,1fr)] 2xl:grid-cols-[minmax(420px,1.4fr)_minmax(280px,1fr)]">
          <div
            ref={globeWrapRef}
            className="flex items-center justify-center bg-slate-50 p-3"
          >
            <GlobeCanvas
              lanes={globeLanes}
              selectedLane={highlightId}
              size={globeSize}
              theme="trade"
              showFlagPins
            />
          </div>
          <div className="max-h-[360px] overflow-y-auto md:max-h-[460px] 2xl:max-h-[520px]">
            {sorted.map((l, i) => {
              const fromMeta =
                resolveEndpoint(l.from_label) || resolveEndpoint(`Port ${l.from_label}`);
              const toMeta =
                resolveEndpoint(l.to_label) || resolveEndpoint(`Port ${l.to_label}`);
              const isActive = highlightId === l.key;
              return (
                <button
                  key={l.key}
                  type="button"
                  onMouseEnter={() =>
                    highlightLane({ from: l.from_label, to: l.to_label })
                  }
                  onMouseLeave={() => highlightLane(null)}
                  onClick={() =>
                    highlightLane({ from: l.from_label, to: l.to_label })
                  }
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
                      "20px minmax(0,1fr) 14px minmax(0,1fr) 70px",
                  }}
                >
                  <span className="font-mono shrink-0 text-[10px] text-slate-400">
                    #{i + 1}
                  </span>
                  {(() => {
                    // Short labels: "Shanghai, CN → Savannah, US"
                    const short = formatLaneShort(
                      `${l.from_label} → ${l.to_label}`,
                    );
                    const fromLabel = short?.fromLabel || l.from_label;
                    const toLabel = short?.toLabel || l.to_label;
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
                      {l.shipments_total.toLocaleString()}
                    </div>
                    <div className="font-body text-[10px] text-slate-500">
                      {l.account_count}{" "}
                      {l.account_count === 1 ? "account" : "accts"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
