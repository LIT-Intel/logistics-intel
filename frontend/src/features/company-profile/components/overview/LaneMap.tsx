/**
 * v2 Overview lane map — mounts the app's EXISTING map engine
 * (src/components/LaneMap.tsx: satellite tiles, arcs, endpoint popups,
 * selection + flow animation) per the Dashboard/Map handoff rule:
 * MAP CORE UNTOUCHED — only the overlay chrome here is v2.
 *
 * The old custom Leaflet port that lived in this file is gone (owner
 * directive 2026-09-26: "the map you should be using is the supply chain
 * tab map which has the pop up feature").
 */
import React from "react";
import { Maximize2 } from "lucide-react";
import AppLaneMap from "@/components/LaneMap";
import type { GlobeLane } from "@/components/GlobeCanvas";
import { destCoords, originCoords } from "../../data/geo";
import type { ProfileView } from "../../data/selectors";
import { EASE_OUT, FONT_DISPLAY, FONT_MONO, Overline, ShareBar } from "../ui";

/** v2 lane facet items → the GlobeLane shape the app map expects.
 *  coords are [lng, lat]; origin falls back to the country centroid and the
 *  destination through the US-city/centroid cascade so lanes always draw. */
export function toGlobeLanes(lanes: ProfileView["lanes"]): GlobeLane[] {
  const out: GlobeLane[] = [];
  for (const l of lanes) {
    const dc = (l.key.split("-")[1] || "US").toUpperCase();
    const o = originCoords(l.oPort, l.oc);
    const d = destCoords(l.dPort, dc);
    if (!o || !d) continue;
    out.push({
      id: l.key,
      from: l.origin || l.oc,
      to: dc,
      coords: [
        [o[1], o[0]],
        [d[1], d[0]],
      ],
      shipments: l.shipmentsN,
      fromMeta: {
        label: l.origin || l.oc,
        countryCode: l.oc,
        countryName: l.origin || undefined,
        coords: [o[1], o[0]],
      },
      toMeta: {
        label: l.dPort || "United States",
        countryCode: dc,
        countryName: dc === "US" ? "United States" : undefined,
        coords: [d[1], d[0]],
      },
    } as GlobeLane);
  }
  return out;
}

export function LaneMap({
  view,
  onOpenLanesTab,
  onExpand,
}: {
  view: ProfileView;
  onOpenLanesTab?: () => void;
  /** Opens the fullscreen Cinematic trade-lanes view. */
  onExpand?: () => void;
}) {
  const globeLanes = React.useMemo(() => toGlobeLanes(view.lanes), [view.lanes]);
  const hasGeo = globeLanes.length > 0;
  // A single selected lane drives the map highlight; multi-select keeps the
  // page filters but the map shows the first selected lane.
  const selected = view.lanes.find((l) => l.active)?.key ?? null;
  const handleSelect = React.useCallback(
    (laneId: string) => {
      const lane = view.lanes.find((l) => l.key === laneId);
      lane?.onClick();
    },
    [view.lanes],
  );

  return (
    <section
      className="relative h-[500px] overflow-hidden rounded-[14px] border border-[#1F2937] bg-[#0b1220]"
      style={{ boxShadow: "0 20px 40px rgba(15,23,42,0.14)" }}
    >
      {hasGeo && (
        <div className="absolute inset-0 z-0">
          <AppLaneMap
            lanes={globeLanes}
            selectedLane={selected}
            onSelectLane={handleSelect}
            height="fill"
            variant="dark"
            volumeScale
            flow
            linesMode="always"
            unselectedStyle="ghost"
            zoomControlPosition="bottomright"
            fitPadding={{ left: 400, top: 40, right: 40, bottom: 40 }}
          />
        </div>
      )}

      {/* Left glass overlay: ranked lane list */}
      <div
        className="absolute bottom-4 left-4 top-4 z-[500] flex flex-col overflow-hidden rounded-[14px] border border-[rgba(255,255,255,0.6)]"
        style={{
          width: hasGeo ? 360 : undefined,
          right: hasGeo ? undefined : 16,
          maxWidth: "calc(100% - 32px)",
          background: "rgba(255,255,255,0.94)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "0 20px 40px rgba(2,6,23,0.3)",
        }}
      >
        <div className="border-b border-[#EEF2F6] px-[18px] pb-3 pt-4">
          <Overline>Trade lanes · by {view.unitM}</Overline>
          <div
            className="mt-1.5 text-[18px] font-semibold leading-[1.3] text-[#0F172A]"
            style={{ fontFamily: FONT_DISPLAY }}
          >
            {view.story.topLane} carries {view.story.topShare} of volume
          </div>
        </div>
        <div className="flex-1 overflow-auto p-1.5">
          {view.lanes.map((l) => (
            <div
              key={l.key}
              onClick={l.onClick}
              className="cursor-pointer rounded-[10px] px-3 py-2.5 hover:bg-[#F1F5F9]"
              style={{ background: l.rowBg, opacity: l.opacity, transition: "background 200ms, opacity 200ms" }}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-[18px] text-[11px] font-medium text-[#94a3b8]" style={{ fontFamily: FONT_MONO }}>
                  {l.rank}
                </span>
                <span
                  className="flex-none rounded px-[5px] py-[2px] text-[11px] font-semibold text-white"
                  style={{ fontFamily: FONT_MONO, background: l.color }}
                >
                  {l.oc}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[#0F172A]">{l.label}</div>
                  <div className="truncate text-[11px] text-[#94a3b8]" style={{ fontFamily: FONT_MONO }}>
                    {l.sub}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-semibold text-[#0F172A]" style={{ fontFamily: FONT_MONO }}>
                    {l.val}
                  </div>
                  <div className="text-[10px] font-semibold" style={{ fontFamily: FONT_MONO, color: l.deltaFg }}>
                    {l.delta}
                  </div>
                </div>
              </div>
              <ShareBar color={l.color} s={l.s} className="ml-7 mt-2" />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-[#EEF2F6] px-[18px] py-2.5 text-[12px] text-[#64748b]">
          <span>Click a lane to filter the page</span>
          <button
            type="button"
            onClick={onOpenLanesTab}
            className="font-medium text-[#3b82f6] hover:text-[#2563eb]"
          >
            Trade Lanes tab
          </button>
        </div>
      </div>

      {/* Top-right: legend pill + expand */}
      {hasGeo && (
        <div className="absolute right-4 top-4 z-[500] flex items-center gap-2">
          <div
            className="flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.12)] px-3 py-1.5 text-[11px] font-medium text-[#e2e8f0]"
            style={{
              background: "rgba(2,6,23,0.72)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              fontFamily: FONT_MONO,
              transition: `opacity 200ms ${EASE_OUT}`,
            }}
          >
            <span className="h-2 w-2 rounded-full bg-[#00c8d4]" style={{ boxShadow: "0 0 8px rgba(0,240,255,0.6)" }} />
            line weight = share
          </div>
          {onExpand && (
            <button
              type="button"
              aria-label="Expand trade lanes map"
              onClick={onExpand}
              className="grid h-8 w-8 place-items-center rounded-full border border-[rgba(255,255,255,0.14)] text-[#e2e8f0] transition-transform hover:bg-[rgba(255,255,255,0.08)] active:scale-95 motion-reduce:active:scale-100"
              style={{ background: "rgba(2,6,23,0.72)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
