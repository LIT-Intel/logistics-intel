import { useEffect, useMemo, useRef, useState } from "react";
import L, {
  type LatLngExpression,
  type LatLngTuple,
  type Map as LeafletMap,
  type Polyline as LeafletPolyline,
  type CircleMarker as LeafletCircleMarker,
  type TileLayer as LeafletTileLayer,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPinOff, Loader2 } from "lucide-react";
import LitFlag from "@/components/ui/LitFlag";
import type { GlobeLane, GlobeLaneEndpointMeta } from "@/components/GlobeCanvas";
import "./LaneMap.css";

/**
 * LIT trade-lane map (2-D companion to GlobeCanvas). Same `GlobeLane[]`
 * input contract, same `onSelectLane(id)` callback — drop-in compatible
 * with the globe but rendered on a CARTO Dark Matter basemap so the
 * brand colour story stays consistent.
 *
 * The 4 lane states (idle / hover / selected / faded) and the
 * endpoint pulse ring are styled to mirror `GlobeCanvas`'s DARK_PALETTE
 * — indigo idle lanes, violet hover glow, cyan selection, cyan pulse.
 *
 * Popovers are rendered as React nodes (not Leaflet `bindPopup`) so we
 * can use `LitFlag` and the rest of our component primitives. Position
 * is computed via `map.latLngToContainerPoint` and a small piece of
 * React state.
 */

export type LaneMapProps = {
  lanes: GlobeLane[];
  selectedLane?: string | null;
  onSelectLane?: (laneId: string) => void;
  /** Pixel height of the map container. Width is 100% of parent. */
  height?: number;
  className?: string;
};

// Brand palette — mirrors `GlobeCanvas` DARK_PALETTE so the 2-D map and
// 3-D globe read as siblings. Keep these in sync with the globe.
const LANE_IDLE = "#818CF8"; // indigo-400
const LANE_HOVER = "#A78BFA"; // violet-400
const LANE_SELECTED = "#22D3EE"; // cyan-400
const LANE_FADED = "#475569"; // slate-600
const HOVER_GLOW = "rgba(167,139,250,0.40)"; // violet, alpha 0.4
const SELECT_GLOW = "rgba(34,211,238,0.55)"; // cyan, alpha 0.55
const PULSE_STROKE = "rgba(34,211,238,0.6)";
const DOT_FILL = "#22D3EE";
const DOT_STROKE = "#FFFFFF";

// Esri World Imagery — actual satellite photography. Free, no token. Picked
// over CARTO Dark Matter after the latter shipped as a featureless dark void
// (continents nearly invisible) AND its labels overlay leaked Arabic /
// non-English place names. Satellite tiles are pure imagery — no labels at
// all, no localization to worry about — and the deep ocean blue + visible
// terrain reads as "real Earth" rather than a stylized map.
const TILES_DARK =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TILES_ATTR =
  "Tiles &copy; Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community";

const MOBILE_QUERY = "(max-width: 639px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type LaneSide = "from" | "to";

type LaneLayers = {
  baseLine: LeafletPolyline;
  casing: LeafletPolyline | null;
  fromDot: LeafletCircleMarker;
  toDot: LeafletCircleMarker;
  fromPulse: LeafletCircleMarker | null;
  toPulse: LeafletCircleMarker | null;
  fromCoord: LatLngTuple;
  toCoord: LatLngTuple;
};

type HoverState = {
  laneId: string;
  side: LaneSide;
  screenX: number;
  screenY: number;
};

/**
 * Great-circle interpolation. Inputs are [lon, lat]; output is [lat, lon]
 * pairs (Leaflet's order). Returns `steps + 1` points so we always
 * include both endpoints.
 */
function greatCirclePoints(
  from: [number, number],
  to: [number, number],
  steps = 48,
): LatLngExpression[] {
  const [lon1, lat1] = from.map((v) => (v * Math.PI) / 180) as [number, number];
  const [lon2, lat2] = to.map((v) => (v * Math.PI) / 180) as [number, number];

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );

  if (d === 0) {
    return [[from[1], from[0]]];
  }

  const out: LatLngExpression[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);
    const x =
      a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y =
      a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    out.push([(lat * 180) / Math.PI, (lon * 180) / Math.PI]);
  }
  return out;
}

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatch(e.matches);
    setMatch(mql.matches);
    // Safari <14 fallback
    if (mql.addEventListener) {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, [query]);
  return match;
}

function endpointMeta(
  lane: GlobeLane,
  side: LaneSide,
): { label: string; countryCode: string; flag?: string; countryName?: string } {
  const meta: GlobeLaneEndpointMeta | undefined =
    side === "from" ? lane.fromMeta : lane.toMeta;
  if (meta) {
    return {
      label: meta.label,
      countryCode: meta.countryCode || "",
      flag: meta.flag,
      countryName: meta.countryName,
    };
  }
  return {
    label: side === "from" ? lane.from : lane.to,
    countryCode: "",
  };
}

export default function LaneMap({
  lanes,
  selectedLane,
  onSelectLane,
  height = 360,
  className = "",
}: LaneMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const laneLayersRef = useRef<Map<string, LaneLayers>>(new Map());
  const hoveredLaneRef = useRef<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const flyDebounceRef = useRef<number | null>(null);

  const [hover, setHover] = useState<HoverState | null>(null);
  const [tilesPending, setTilesPending] = useState<boolean>(true);
  const [showSlowOverlay, setShowSlowOverlay] = useState<boolean>(false);

  const isMobile = useMediaQuery(MOBILE_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);

  // Stable key — used to skip the rebuild when only selection changes.
  const laneKey = useMemo(
    () =>
      lanes
        .map(
          (l) =>
            `${l.id}|${l.coords[0].join(",")}>${l.coords[1].join(",")}|${
              l.shipments ?? ""
            }`,
        )
        .join(";"),
    [lanes],
  );

  // Mount + dispose. Runs once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      worldCopyJump: true,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: false, // SVG renderer needed for CSS-driven pulse
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 8,
    });

    const baseTiles: LeafletTileLayer = L.tileLayer(TILES_DARK, {
      attribution: TILES_ATTR,
      maxZoom: 8,
    });
    baseTiles.addTo(map);

    // Slow-tile telemetry — flag the loader if no tile arrives in 800 ms.
    let firstTileLanded = false;
    const slowTimer = window.setTimeout(() => {
      if (!firstTileLanded) setShowSlowOverlay(true);
    }, 800);
    baseTiles.on("load", () => {
      firstTileLanded = true;
      setTilesPending(false);
      setShowSlowOverlay(false);
    });
    baseTiles.on("tileload", () => {
      firstTileLanded = true;
      setTilesPending(false);
      setShowSlowOverlay(false);
    });
    baseTiles.on("tileerror", () => {
      // Silent — lanes still render usefully against the dark void.
      // Console-warn once to aid debugging without burning user-facing UI.
      console.warn("[LaneMap] CARTO tile failed to load; rendering lanes against dark void.");
    });

    mapRef.current = map;

    return () => {
      window.clearTimeout(slowTimer);
      map.remove();
      mapRef.current = null;
      laneLayersRef.current.clear();
    };
  }, []);

  // Rebuild lane layers when the lane set changes. Selection-only changes
  // are handled by the cheaper restyle effect below.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Tear down existing lane layers.
    for (const layers of laneLayersRef.current.values()) {
      if (layers.casing) map.removeLayer(layers.casing);
      map.removeLayer(layers.baseLine);
      map.removeLayer(layers.fromDot);
      map.removeLayer(layers.toDot);
      if (layers.fromPulse) map.removeLayer(layers.fromPulse);
      if (layers.toPulse) map.removeLayer(layers.toPulse);
    }
    laneLayersRef.current.clear();
    hoveredLaneRef.current = null;
    setHover(null);

    if (lanes.length === 0) return;

    const allLatLngs: LatLngTuple[] = [];

    // First pass: render base lines (idle/faded). Hover/selected casings
    // come in a second pass so their glow sits on top of all idle layers.
    for (const lane of lanes) {
      const points = greatCirclePoints(lane.coords[0], lane.coords[1]);
      const fromCoord: LatLngTuple = [lane.coords[0][1], lane.coords[0][0]];
      const toCoord: LatLngTuple = [lane.coords[1][1], lane.coords[1][0]];

      const baseLine = L.polyline(points, {
        color: LANE_IDLE,
        weight: 2,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
        interactive: true,
        bubblingMouseEvents: false,
      }).addTo(map);

      const fromDot = L.circleMarker(fromCoord, {
        radius: 7,
        color: DOT_STROKE,
        weight: 2,
        fillColor: DOT_FILL,
        fillOpacity: 1,
        interactive: true,
        bubblingMouseEvents: false,
      }).addTo(map);
      const toDot = L.circleMarker(toCoord, {
        radius: 7,
        color: DOT_STROKE,
        weight: 2,
        fillColor: DOT_FILL,
        fillOpacity: 1,
        interactive: true,
        bubblingMouseEvents: false,
      }).addTo(map);

      const layers: LaneLayers = {
        baseLine,
        casing: null,
        fromDot,
        toDot,
        fromPulse: null,
        toPulse: null,
        fromCoord,
        toCoord,
      };
      laneLayersRef.current.set(lane.id, layers);

      // Lane line click → select.
      baseLine.on("click", () => {
        onSelectLane?.(lane.id);
      });
      // Lane hover → set this lane as hovered (triggers restyle below).
      baseLine.on("mouseover", () => {
        if (hoveredLaneRef.current !== lane.id) {
          hoveredLaneRef.current = lane.id;
          applyStateStyles();
        }
      });
      baseLine.on("mouseout", () => {
        if (hoveredLaneRef.current === lane.id) {
          hoveredLaneRef.current = null;
          applyStateStyles();
        }
      });

      // Endpoint hover/click → set popover + lane selection.
      const attachEndpoint = (
        dot: LeafletCircleMarker,
        side: LaneSide,
        coord: LatLngTuple,
      ) => {
        const openPopover = () => {
          if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
          const pt = map.latLngToContainerPoint(coord);
          setHover({ laneId: lane.id, side, screenX: pt.x, screenY: pt.y });
        };
        const scheduleClose = () => {
          if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current);
          }
          closeTimerRef.current = window.setTimeout(() => {
            setHover(null);
            closeTimerRef.current = null;
          }, 200);
        };

        // Mobile: tap to open; desktop: hover.
        dot.on("mouseover", () => {
          if (isMobile) return;
          openPopover();
          if (hoveredLaneRef.current !== lane.id) {
            hoveredLaneRef.current = lane.id;
            applyStateStyles();
          }
        });
        dot.on("mouseout", () => {
          if (isMobile) return;
          scheduleClose();
          if (hoveredLaneRef.current === lane.id) {
            hoveredLaneRef.current = null;
            applyStateStyles();
          }
        });
        dot.on("click", () => {
          openPopover();
          onSelectLane?.(lane.id);
        });
      };
      attachEndpoint(fromDot, "from", fromCoord);
      attachEndpoint(toDot, "to", toCoord);

      allLatLngs.push(fromCoord, toCoord);
    }

    // Initial fit so all lanes are visible without animating.
    if (allLatLngs.length > 0) {
      const bounds = L.latLngBounds(allLatLngs);
      map.fitBounds(bounds, {
        padding: [32, 32],
        maxZoom: 5,
        animate: false,
      });
    }

    // Apply selection/hover styling now that layers exist.
    applyStateStyles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneKey, onSelectLane, isMobile]);

  /**
   * Restyle pass. Walks every lane's layers and reconciles them with
   * the current `selectedLane` and `hoveredLaneRef`. Adds/removes the
   * casing polyline and pulse rings as needed. Pulled out so both
   * effects (rebuild + selection change) can call it.
   */
  const applyStateStyles = () => {
    const map = mapRef.current;
    if (!map) return;
    const hovered = hoveredLaneRef.current;
    const hasSelection = !!selectedLane;
    const selectedExists = !!selectedLane && laneLayersRef.current.has(selectedLane);

    for (const [laneId, layers] of laneLayersRef.current.entries()) {
      const isSelected = selectedExists && laneId === selectedLane;
      const isHovered = !isSelected && laneId === hovered;
      const isFaded = hasSelection && selectedExists && !isSelected;

      // Base line styling.
      let color = LANE_IDLE;
      let weight = 2;
      let opacity = 0.85;
      if (isSelected) {
        color = LANE_SELECTED;
        weight = 3.5;
        opacity = 1;
      } else if (isHovered) {
        color = LANE_HOVER;
        weight = 2.5;
        opacity = 1;
      } else if (isFaded) {
        color = LANE_FADED;
        weight = 1.5;
        opacity = 0.35;
      }
      layers.baseLine.setStyle({ color, weight, opacity });

      // Casing — only for hover/selected. Drawn BEFORE the base line so it
      // sits behind. Leaflet doesn't expose a z-index per layer in the SVG
      // renderer, but removing and re-adding the base line after the
      // casing guarantees correct z-order.
      const needsCasing = isSelected || isHovered;
      if (needsCasing) {
        const casingColor = isSelected ? SELECT_GLOW : HOVER_GLOW;
        const casingWeight = isSelected ? weight + 5 : weight + 4;
        if (!layers.casing) {
          const points = (layers.baseLine.getLatLngs() as L.LatLng[]).map(
            (p) => [p.lat, p.lng] as LatLngTuple,
          );
          layers.casing = L.polyline(points, {
            color: casingColor,
            weight: casingWeight,
            opacity: 1,
            lineCap: "round",
            lineJoin: "round",
            interactive: false,
          }).addTo(map);
        } else {
          layers.casing.setStyle({
            color: casingColor,
            weight: casingWeight,
            opacity: 1,
          });
        }
        // Ensure base line paints above casing.
        layers.baseLine.bringToFront();
      } else if (layers.casing) {
        map.removeLayer(layers.casing);
        layers.casing = null;
      }

      // Endpoint dots. Selected = radius 9 (with pulse). Otherwise radius 7.
      const dotRadius = isSelected ? 9 : 7;
      for (const dot of [layers.fromDot, layers.toDot]) {
        dot.setStyle({
          radius: dotRadius,
          color: DOT_STROKE,
          weight: 2,
          fillColor: DOT_FILL,
          fillOpacity: 1,
        });
        dot.bringToFront();
      }

      // Pulse rings — only on selected. Created/destroyed as selection moves.
      const ensurePulse = (
        existing: LeafletCircleMarker | null,
        coord: LatLngTuple,
      ): LeafletCircleMarker => {
        if (existing) return existing;
        const ring = L.circleMarker(coord, {
          radius: 12,
          color: PULSE_STROKE,
          weight: 2,
          fillOpacity: 0,
          opacity: 0.6,
          interactive: false,
          className: "lit-pulse-ring",
        }).addTo(map);
        return ring;
      };
      if (isSelected) {
        layers.fromPulse = ensurePulse(layers.fromPulse, layers.fromCoord);
        layers.toPulse = ensurePulse(layers.toPulse, layers.toCoord);
      } else {
        if (layers.fromPulse) {
          map.removeLayer(layers.fromPulse);
          layers.fromPulse = null;
        }
        if (layers.toPulse) {
          map.removeLayer(layers.toPulse);
          layers.toPulse = null;
        }
      }
    }

    // Selected lane elements should sit on top of everything else.
    if (selectedExists) {
      const sel = laneLayersRef.current.get(selectedLane!);
      if (sel) {
        if (sel.casing) sel.casing.bringToBack(); // casing behind base
        sel.baseLine.bringToFront();
        sel.fromDot.bringToFront();
        sel.toDot.bringToFront();
        if (sel.fromPulse) sel.fromPulse.bringToFront();
        if (sel.toPulse) sel.toPulse.bringToFront();
      }
    }
  };

  // Selection-only restyle + flyTo. Cheaper than rebuilding the layer set.
  useEffect(() => {
    applyStateStyles();

    const map = mapRef.current;
    if (!map || !selectedLane) return;
    const layers = laneLayersRef.current.get(selectedLane);

    // Diagnostic for the original bug we kept hitting — when parent and
    // map disagree on the lane-id shape (canonical id vs displayLabel),
    // this branch silently does nothing and the map stays at the world
    // view. Surface it once per mismatch so the next regression is loud.
    if (!layers) {
      // eslint-disable-next-line no-console
      console.warn(
        "[LaneMap] selectedLane has no matching lane in the rendered set",
        { selectedLane, knownIds: Array.from(laneLayersRef.current.keys()) },
      );
      return;
    }

    // Debounce 100 ms — avoids twitchy zooms when the user rapid-clicks rows.
    if (flyDebounceRef.current !== null) {
      window.clearTimeout(flyDebounceRef.current);
    }
    flyDebounceRef.current = window.setTimeout(() => {
      const bounds = L.latLngBounds([layers.fromCoord, layers.toCoord]);
      if (reducedMotion) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 5, animate: false });
      } else {
        map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 5, duration: 0.8 });
      }
      flyDebounceRef.current = null;
    }, 100);

    return () => {
      if (flyDebounceRef.current !== null) {
        window.clearTimeout(flyDebounceRef.current);
        flyDebounceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLane, laneKey, reducedMotion]);

  // Reproject the popover on pan/zoom so it stays glued to its endpoint.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const reposition = () => {
      if (!hover) return;
      const layers = laneLayersRef.current.get(hover.laneId);
      if (!layers) return;
      const coord = hover.side === "from" ? layers.fromCoord : layers.toCoord;
      const pt = map.latLngToContainerPoint(coord);
      setHover((prev) =>
        prev ? { ...prev, screenX: pt.x, screenY: pt.y } : prev,
      );
    };
    map.on("move", reposition);
    map.on("zoom", reposition);
    return () => {
      map.off("move", reposition);
      map.off("zoom", reposition);
    };
  }, [hover]);

  // Dismiss mobile bottom-sheet on tap outside.
  useEffect(() => {
    if (!isMobile || !hover) return;
    const container = containerRef.current;
    if (!container) return;
    const dismiss = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target && target.closest(".lit-lane-popover")) return;
      // Clicks on Leaflet path/dot elements still come through — we accept
      // some tap-elsewhere noise rather than try to filter SVG paths.
      setHover(null);
    };
    container.addEventListener("click", dismiss);
    return () => container.removeEventListener("click", dismiss);
  }, [isMobile, hover]);

  // Resolve the lane + side for the active popover.
  const hoverLane =
    hover && lanes.find((l) => l.id === hover.laneId)
      ? lanes.find((l) => l.id === hover.laneId)!
      : null;
  const popoverMeta = hover && hoverLane ? endpointMeta(hoverLane, hover.side) : null;
  const destinationMeta =
    hover && hoverLane && hover.side === "from"
      ? endpointMeta(hoverLane, "to")
      : null;

  return (
    <div
      className={[
        "lit-lane-map relative w-full overflow-hidden rounded-lg border border-slate-800/70 bg-[#0f1419]",
        className,
      ].join(" ")}
      style={{ height }}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Empty state — show inside the dark void. */}
      {lanes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[600] flex flex-col items-center justify-center gap-2 text-slate-400">
          <MapPinOff className="h-8 w-8 text-slate-500" />
          <div className="text-sm font-medium text-slate-200">No lanes to map</div>
          <div className="text-xs text-slate-500">
            Lanes appear as shipment data lands
          </div>
        </div>
      )}

      {/* Slow-tile overlay — only after >800 ms with nothing painted. */}
      {showSlowOverlay && tilesPending && lanes.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[650] flex items-center justify-center bg-slate-900/50">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
        </div>
      )}

      {/* React-rendered popover. Two layouts: desktop floats above the
       * dot, mobile slides up as a bottom sheet. */}
      {hover && popoverMeta && (
        <PopoverNode
          isMobile={isMobile}
          screenX={hover.screenX}
          screenY={hover.screenY}
          meta={popoverMeta}
          shipments={hoverLane?.shipments}
          destination={destinationMeta}
          onMouseEnter={() => {
            if (closeTimerRef.current !== null) {
              window.clearTimeout(closeTimerRef.current);
              closeTimerRef.current = null;
            }
          }}
          onMouseLeave={() => {
            if (isMobile) return;
            if (closeTimerRef.current !== null) {
              window.clearTimeout(closeTimerRef.current);
            }
            closeTimerRef.current = window.setTimeout(() => {
              setHover(null);
              closeTimerRef.current = null;
            }, 200);
          }}
        />
      )}
    </div>
  );
}

type PopoverNodeProps = {
  isMobile: boolean;
  screenX: number;
  screenY: number;
  meta: { label: string; countryCode: string; flag?: string; countryName?: string };
  shipments?: number;
  destination: { label: string; countryCode: string } | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

function PopoverNode({
  isMobile,
  screenX,
  screenY,
  meta,
  shipments,
  destination,
  onMouseEnter,
  onMouseLeave,
}: PopoverNodeProps) {
  const subLine = [meta.countryName, meta.countryCode.toUpperCase()]
    .filter(Boolean)
    .join(", ");

  if (isMobile) {
    return (
      <div
        className="lit-lane-popover lit-lane-popover--sheet"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <PopoverBody
          meta={meta}
          subLine={subLine}
          shipments={shipments}
          destination={destination}
        />
      </div>
    );
  }

  return (
    <div
      className="lit-lane-popover"
      style={{ left: screenX, top: screenY }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <PopoverBody
        meta={meta}
        subLine={subLine}
        shipments={shipments}
        destination={destination}
      />
    </div>
  );
}

function PopoverBody({
  meta,
  subLine,
  shipments,
  destination,
}: {
  meta: { label: string; countryCode: string; flag?: string };
  subLine: string;
  shipments?: number;
  destination: { label: string; countryCode: string } | null;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <LitFlag code={meta.countryCode} emoji={meta.flag} size={20} />
        <div className="flex flex-col">
          <span className="lit-lane-popover__title">{meta.label}</span>
          {subLine && <span className="lit-lane-popover__sub">{subLine}</span>}
        </div>
      </div>
      <hr className="lit-lane-popover__rule" />
      <div className="flex items-center justify-between gap-3">
        <span className="lit-lane-popover__count-label">Shipments</span>
        <span className="lit-lane-popover__count">
          {typeof shipments === "number" ? shipments.toLocaleString() : "—"}
        </span>
      </div>
      <div className="lit-lane-popover__count-label">(last 12m)</div>
      {destination && (
        <div className="lit-lane-popover__dest">
          → To: {destination.label}
          {destination.countryCode ? `, ${destination.countryCode.toUpperCase()}` : ""}
        </div>
      )}
    </>
  );
}
