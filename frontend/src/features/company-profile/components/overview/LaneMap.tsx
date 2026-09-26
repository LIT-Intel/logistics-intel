/**
 * LaneMap — §6.4 lane map, port of `createLaneMap()` in the handoff's
 * profile-data.js. Leaflet with Esri World Imagery tiles, quadratic-bezier
 * dashed arcs weighted by share, a glass overlay panel with the ranked
 * lane list, and a legend pill. Lanes with no resolvable coordinates are
 * skipped; when none resolve at all the panel renders full-width over a
 * static dark background (no broken empty map).
 */
import React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { originCoords, portCoords } from "../../data/geo";
import type { ProfileView } from "../../data/selectors";
import { EASE_OUT, FONT_DISPLAY, FONT_MONO, Overline, ShareBar, useReducedMotion } from "../ui";

type LaneVM = ProfileView["lanes"][number];

interface ResolvedLane {
  lane: LaneVM;
  o: [number, number];
  d: [number, number];
}

/** Quadratic bezier between two lat/lngs, 48 points (port of `arc()`). */
function arc(a: [number, number], b: [number, number], bend: number): [number, number][] {
  const pts: [number, number][] = [];
  const c0 = (a[0] + b[0]) / 2 - (b[1] - a[1]) * bend;
  const c1 = (a[1] + b[1]) / 2 + (b[0] - a[0]) * bend;
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const u = 1 - t;
    pts.push([
      u * u * a[0] + 2 * u * t * c0 + t * t * b[0],
      u * u * a[1] + 2 * u * t * c1 + t * t * b[1],
    ]);
  }
  return pts;
}

/** Deterministic bend per lane index: magnitude 0.10–0.24, alternating sign. */
function bendFor(i: number): number {
  const mag = 0.1 + ((i * 3) % 8) * 0.02;
  return i % 2 === 1 ? -mag : mag;
}

const DASH_STYLE_ID = "lit-lane-map-dash";

function injectDashKeyframes(): void {
  if (typeof document === "undefined" || document.getElementById(DASH_STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = DASH_STYLE_ID;
  s.textContent = "@keyframes litdash{to{stroke-dashoffset:-28}}";
  document.head.appendChild(s);
}

function laneTooltip(l: LaneVM): string {
  return (
    `<div style="font-family:'DM Sans',sans-serif;min-width:170px">` +
    `<div style="font:600 13px 'Space Grotesk',sans-serif;color:#0F172A">${l.label}</div>` +
    `<div style="font:11px 'JetBrains Mono',monospace;color:#64748b;margin:2px 0 6px">${l.sub}</div>` +
    `<div style="display:flex;justify-content:space-between;gap:10px;font:500 12px 'JetBrains Mono',monospace;color:#0F172A">` +
    `<span>${l.shipments} BOLs</span><span>${l.teu} TEU</span><span>${l.share}</span></div></div>`
  );
}

export function LaneMap({
  view,
  onOpenLanesTab,
}: {
  view: ProfileView;
  onOpenLanesTab?: () => void;
}) {
  const mapEl = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const layerRef = React.useRef<L.LayerGroup | null>(null);
  const fittedRef = React.useRef(false);
  const lastBoundsRef = React.useRef<L.LatLngBounds | null>(null);
  const reduced = useReducedMotion();

  const resolved: ResolvedLane[] = view.lanes
    .map((lane) => {
      const o = originCoords(lane.oPort, lane.oc);
      const d = portCoords(lane.dPort);
      return o && d ? { lane, o, d } : null;
    })
    .filter((x): x is ResolvedLane => x != null);
  const hasGeo = resolved.length > 0;

  // Latest resolved lanes for the keyed update effect (avoids stale closures).
  const resolvedRef = React.useRef(resolved);
  resolvedRef.current = resolved;

  // ---- init / destroy (only when there is something to draw)
  React.useEffect(() => {
    if (!hasGeo || !mapEl.current || mapRef.current) return;
    injectDashKeyframes();
    const el = mapEl.current;
    const map = L.map(el, {
      zoomControl: false,
      scrollWheelZoom: false,
      minZoom: 2,
      maxZoom: 7,
      worldCopyJump: false,
    }).setView([30, 10], 2);
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: "Tiles © Esri",
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    let t: number | undefined;
    const refit = () => {
      const m = mapRef.current;
      if (!m || !el.clientWidth) return;
      m.invalidateSize();
      if (lastBoundsRef.current) {
        m.fitBounds(lastBoundsRef.current, { paddingTopLeft: [400, 40], paddingBottomRight: [40, 40] });
      }
    };
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            window.clearTimeout(t);
            t = window.setTimeout(refit, 120);
          })
        : null;
    ro?.observe(el);

    return () => {
      ro?.disconnect();
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      fittedRef.current = false;
    };
  }, [hasGeo]);

  // ---- redraw arcs/markers when the lane set materially changes
  const lanesKey = JSON.stringify(view.lanes.map((l) => [l.key, l.shareN, l.dimmed]));
  React.useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const rs = resolvedRef.current;
    if (!rs.length) return;

    const bounds: [number, number][] = [];
    const maxShare = Math.max(0.01, ...rs.map((x) => x.lane.shareN));
    rs.forEach((x, i) => {
      const { lane: l, o: a, d: b } = x;
      bounds.push(a, b);
      const pts = arc(a, b, bendFor(i));
      const op = l.dimmed ? 0.18 : 1;
      const w = 2 + (l.shareN / maxShare) * 5;
      // halo
      L.polyline(pts, { color: l.color, weight: w + 4, opacity: 0.18 * op, lineCap: "round", interactive: false }).addTo(layer);
      // dashed animated stroke
      const pl = L.polyline(pts, { color: l.color, weight: w, opacity: 0.95 * op, lineCap: "round", dashArray: "2 12" }).addTo(layer);
      const pe = pl.getElement() as SVGElement | undefined;
      if (pe && !l.dimmed && !reduced) pe.style.animation = "litdash 1.4s linear infinite";
      const tip = laneTooltip(l);
      pl.bindTooltip(tip, { sticky: true, direction: "top", opacity: 1 });
      pl.on("click", () => l.onClick());
      // origin marker
      const m = L.circleMarker(a, {
        radius: 5 + (l.shareN / maxShare) * 9,
        color: "#FFFFFF",
        weight: 2,
        fillColor: l.color,
        fillOpacity: op,
        opacity: op,
      }).addTo(layer);
      m.bindTooltip(tip, { direction: "top", opacity: 1 });
      m.on("click", () => l.onClick());
    });

    // US entry-port markers (deduped by port name)
    const dests = new Map<string, [number, number]>();
    rs.forEach((x) => dests.set(x.lane.dPort || "US port", x.d));
    dests.forEach((coords, name) => {
      L.circleMarker(coords, { radius: 5, color: "#FFFFFF", weight: 2, fillColor: "#FFFFFF", fillOpacity: 1 })
        .bindTooltip(name, { direction: "right" })
        .addTo(layer);
    });

    lastBoundsRef.current = L.latLngBounds(bounds);
    if (!fittedRef.current) {
      fittedRef.current = true;
      map.invalidateSize();
      map.fitBounds(lastBoundsRef.current, { paddingTopLeft: [400, 40], paddingBottomRight: [40, 40] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanesKey, reduced, hasGeo]);

  return (
    <section
      className="relative h-[500px] overflow-hidden rounded-[14px] border border-[#1F2937] bg-[#0b1220]"
      style={{ boxShadow: "0 20px 40px rgba(15,23,42,0.14)" }}
    >
      {hasGeo && <div ref={mapEl} className="absolute inset-0 z-0" />}

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

      {/* Top-right legend pill */}
      {hasGeo && (
        <div
          className="absolute right-4 top-4 z-[500] flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.12)] px-3 py-1.5 text-[11px] font-medium text-[#e2e8f0]"
          style={{
            background: "rgba(2,6,23,0.72)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            fontFamily: FONT_MONO,
            transition: `opacity 200ms ${EASE_OUT}`,
          }}
        >
          <span
            className="h-2 w-2 rounded-full bg-[#00c8d4]"
            style={{ boxShadow: "0 0 8px rgba(0,240,255,0.6)" }}
          />
          line weight = share
        </div>
      )}
    </section>
  );
}
