import React from "react";
import { ArrowRight } from "lucide-react";
import GlobeCanvas from "@/components/GlobeCanvas";
import LitSectionCard from "@/components/ui/LitSectionCard";
import LitFlag from "@/components/ui/LitFlag";

/**
 * Phase 2 — Dashboard "Top Active Trade Lanes" card.
 *
 * Two-column layout: GlobeCanvas (trade theme + flag pins) on the left,
 * ranked-lane list on the right. Mirrors the design source structure
 * verbatim. Driven entirely by real data — `lanes` is the canonical lane
 * list aggregated from `lit_saved_companies.kpis.top_route_12m` upstream;
 * empty state renders when the user has no saved accounts to aggregate.
 */
export default function GlobeCard({
  lanes,
  globeLanes,
  selectedLaneId,
  onSelectLane,
  globeSize,
}) {
  const hasLanes = lanes && lanes.length > 0;
  const activeLane = hasLanes
    ? lanes.find((l) => l.displayLabel === selectedLaneId) || lanes[0]
    : null;

  return (
    <LitSectionCard
      title="Top Active Trade Lanes"
      sub="Click a lane to focus the globe · Trailing 12-month TEU"
      action={
        <span className="font-display inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-green-200 bg-green-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-green-700">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden />
          Live
        </span>
      }
      padded={false}
    >
      <div className="grid min-h-[340px] grid-cols-1 lg:grid-cols-[minmax(280px,1fr)_minmax(0,1.05fr)]">
        {/* Globe pane */}
        <div
          className="relative flex items-center justify-center border-b border-slate-100 lg:border-b-0 lg:border-r"
          style={{ background: "radial-gradient(circle at 30% 30%, #F8FAFC 0%, #EEF2F7 100%)" }}
        >
          <span className="font-display absolute left-3 top-3 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
            Trade Lane Map
          </span>
          {hasLanes ? (
            <div className="py-4">
              <GlobeCanvas
                size={globeSize}
                lanes={globeLanes}
                selectedLane={selectedLaneId || (lanes[0]?.displayLabel ?? null)}
                theme="trade"
                showFlagPins
              />
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="font-body text-[12px] text-slate-500">
                No active lanes yet — save companies in the Command Center to populate the globe.
              </p>
            </div>
          )}

          {/* Floating dark-glass overlay surfacing the active lane */}
          {hasLanes && activeLane && (
            <div
              className="absolute bottom-3 left-3 right-3 flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-white shadow-lg"
              style={{ background: "rgba(15,23,42,0.92)", backdropFilter: "blur(8px)" }}
            >
              <LitFlag code={activeLane.fromMeta?.countryCode} size={18} label={activeLane.fromMeta?.countryName || activeLane.fromMeta?.label} />
              <ArrowRight aria-hidden className="h-2.5 w-2.5 text-slate-400" />
              <LitFlag code={activeLane.toMeta?.countryCode} size={18} label={activeLane.toMeta?.countryName || activeLane.toMeta?.label} />
              <div className="min-w-0 flex-1">
                <div className="font-display truncate text-[11.5px] font-bold">
                  {activeLane.fromMeta?.countryName || activeLane.fromMeta?.label} → {activeLane.toMeta?.countryName || activeLane.toMeta?.label}
                </div>
                <div className="font-mono mt-0.5 text-[10px] text-slate-400">
                  {(Number(activeLane.shipments) || 0).toLocaleString()} ships
                  {activeLane.teu != null && Number(activeLane.teu) > 0
                    ? ` · ${Math.round(Number(activeLane.teu)).toLocaleString()} TEU`
                    : ""}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Ranked-lane list */}
        <div className="max-h-[340px] overflow-y-auto">
          {hasLanes ? (
            lanes.map((lane, i) => {
              const isSelected = (selectedLaneId || lanes[0]?.displayLabel) === lane.displayLabel;
              return (
                <button
                  key={lane.displayLabel}
                  type="button"
                  onClick={() => onSelectLane(lane.displayLabel)}
                  className={[
                    "flex w-full items-center gap-2.5 border-b border-slate-100 px-3.5 py-2.5 text-left transition-colors duration-150 last:border-b-0",
                    isSelected
                      ? "border-l-2 border-l-blue-500 bg-blue-50"
                      : "border-l-2 border-l-transparent hover:bg-slate-50/60",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "font-mono w-[18px] shrink-0 text-center text-[9px] font-bold",
                      isSelected ? "text-blue-700" : "text-slate-400",
                    ].join(" ")}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <LitFlag code={lane.fromMeta?.countryCode} size={14} label={lane.fromMeta?.countryName} />
                      <span
                        className={[
                          "font-mono text-[11px] font-semibold",
                          isSelected ? "text-blue-700" : "text-slate-900",
                        ].join(" ")}
                      >
                        {lane.fromMeta?.countryName || lane.fromMeta?.label || "—"}
                      </span>
                      <ArrowRight aria-hidden className="h-2.5 w-2.5 text-slate-300" />
                      <LitFlag code={lane.toMeta?.countryCode} size={14} label={lane.toMeta?.countryName} />
                      <span
                        className={[
                          "font-mono text-[11px] font-semibold",
                          isSelected ? "text-blue-700" : "text-slate-900",
                        ].join(" ")}
                      >
                        {lane.toMeta?.countryName || lane.toMeta?.label || "—"}
                      </span>
                    </div>
                    <div className="mt-1 flex gap-2.5">
                      <span className="font-mono text-[10px] text-slate-500">
                        {(Number(lane.shipments) || 0).toLocaleString()} ships
                      </span>
                      {lane.teu != null && Number(lane.teu) > 0 && (
                        <span className="font-mono text-[10px] text-slate-400">
                          {Math.round(Number(lane.teu)).toLocaleString()} TEU
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="font-body text-[12px] text-slate-400">No lanes to rank yet.</p>
            </div>
          )}
        </div>
      </div>
    </LitSectionCard>
  );
}