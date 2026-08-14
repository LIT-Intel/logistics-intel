import { useEffect, useMemo, useRef, useState } from "react";
import L, {
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
 * with the globe.
 *
 * Two visual variants:
 *  - `dark` (default, legacy): Esri satellite imagery + the GlobeCanvas
 *    DARK_PALETTE (indigo idle / violet hover / cyan selected). Used by
 *    the Dashboard GlobeCard and Coach lanes card.
 *  - `light` (2026-08 Company-Profile hero): the SAME basemap style as
 *    the Explorer page (Stadia "Alidade Smooth" when VITE_STADIA_API_KEY
 *    is set — exactly what Explorer renders in production — falling back
 *    to CARTO Voyager, a free medium-tone raster that reads close to
 *    Alidade). Lane palette flips to indigo/violet/blue-600 tuned for a
 *    light ground so the map matches the Company Profile's light card
 *    language ("medium tone" per CEO — not the old navy).
 *
 * The 4 lane states (idle / hover / selected / faded), endpoint pulse
 * ring, endpoint popovers and fly-to-selection behave identically in
 * both variants.
 *
 * Popovers are rendered as React nodes (not Leaflet `bindPopup`) so we
 * can use `LitFlag` and the rest of our component primitives. Position
 * is computed via `map.latLngToContainerPoint` and a small piece of
 * React state.
 */

export type LaneMapVariant = "dark" | "light";

export type LaneMapFitPadding = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

/**
 * Per-lane color override (regional palette). `base` paints the idle
 * stroke, `selected` the brighter selected/hover stroke, `glow` the
 * rgba tint of the selected-endpoint pulse rings. (The old hover/selected
 * "casing" polyline is gone — one visible stroke per lane, period.)
 */
export type LaneMapLaneColor = {
  base: string;
  selected: string;
  glow: string;
};

export type LaneMapProps = {
  lanes: GlobeLane[];
  selectedLane?: string | null;
  onSelectLane?: (laneId: string) => void;
  /**
   * Pixel height of the map container, or `"fill"` to stretch to 100% of
   * the parent (parent must be sized). Width is always 100% of parent.
   */
  height?: number | "fill";
  className?: string;
  /** Visual variant — see file header. Defaults to legacy `dark`. */
  variant?: LaneMapVariant;
  /**
   * Scale lane line weight + endpoint marker radius by `lane.shipments`
   * (log-scaled against the max in the set). Off by default so legacy
   * consumers keep their uniform look.
   */
  volumeScale?: boolean;
  /** Leaflet zoom-control corner. Defaults to `topleft` (legacy). */
  zoomControlPosition?: "topleft" | "topright" | "bottomleft" | "bottomright";
  /**
   * Extra padding (px) applied to fitBounds/flyToBounds so lanes stay
   * clear of floating overlay panels (e.g. the Company Profile lane
   * cards docked top-right). Read live via a ref — safe to pass a fresh
   * object every render.
   */
  fitPadding?: LaneMapFitPadding;
  /**
   * Per-lane colors keyed by lane id (e.g. the origin-region palette from
   * `@/lib/laneRegions`). Lanes without an entry fall back to the variant
   * palette. Lane cards can reuse the same colors so card ↔ line mapping
   * is instant.
   */
  laneColors?: Record<string, LaneMapLaneColor>;
  /**
   * How non-selected lanes render while a lane IS selected:
   *  - `fade` (legacy): slate, 0.35 opacity, near-full weight.
   *  - `ghost` (2026-08 focused mode): faint 1px lines in their own lane
   *    color — context without noise. Ghost lines stay fully clickable.
   */
  unselectedStyle?: "fade" | "ghost";
  /**
   * Supply-chain motion on the selected lane: an animated directional
   * dash-flow overlay (origin → destination) drawn on the exact same
   * points as the lane's stroke. Animation is CSS-driven and disabled
   * under prefers-reduced-motion (static dotted overlay remains).
   */
  flow?: boolean;
};

// ── Palettes ──────────────────────────────────────────────────────────
// dark — mirrors GlobeCanvas DARK_PALETTE so the 2-D map and 3-D globe
// read as siblings. Keep in sync with the globe.
// light — same hue story re-weighted for a light basemap: indigo idle,
// violet hover, blue-600 selected (matches the profile card's selection
// accent), slate faded.
type LanePalette = {
  idle: string;
  hover: string;
  selected: string;
  faded: string;
  hoverGlow: string;
  selectGlow: string;
  pulse: string;
  dotFill: string;
  dotStroke: string;
  containerBg: string;
};

const DARK_PALETTE: LanePalette = {
  idle: "#818CF8", // indigo-400
  hover: "#A78BFA", // violet-400
  selected: "#22D3EE", // cyan-400
  faded: "#475569", // slate-600
  hoverGlow: "rgba(167,139,250,0.40)",
  selectGlow: "rgba(34,211,238,0.55)",
  pulse: "rgba(34,211,238,0.6)",
  dotFill: "#22D3EE",
  dotStroke: "#FFFFFF",
  containerBg: "#0f1419",
};

const LIGHT_PALETTE: LanePalette = {
  idle: "#6366F1", // indigo-500
  hover: "#8B5CF6", // violet-500
  selected: "#2563EB", // blue-600 — matches legend selection accent
  faded: "#94A3B8", // slate-400
  hoverGlow: "rgba(139,92,246,0.28)",
  selectGlow: "rgba(37,99,235,0.28)",
  pulse: "rgba(37,99,235,0.55)",
  dotFill: "#2563EB",
  dotStroke: "#FFFFFF",
  containerBg: "#E8EDF3", // matches Alidade Smooth / Voyager ground tone
};

// ── Basemaps ──────────────────────────────────────────────────────────
// dark: Esri World Imagery — actual satellite photography. Free, no
// token. Picked over CARTO Dark Matter after the latter shipped as a
// featureless dark void AND leaked non-English labels.
const TILES_DARK =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const TILES_DARK_ATTR =
  "Tiles &copy; Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community";

// light: SAME source chain as the Explorer map (ExploreMapMaplibre) for
// product unity — Stadia Alidade Smooth when a key is configured (what
// production Explorer renders), else CARTO Voyager as the free
// medium-tone fallback.
const STADIA_KEY = import.meta.env.VITE_STADIA_API_KEY ?? "";
const TILES_LIGHT_STADIA = `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png?api_key=${STADIA_KEY}`;
const TILES_LIGHT_STADIA_ATTR =
  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/about">OpenStreetMap</a>';
const TILES_LIGHT_FALLBACK =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";
const TILES_LIGHT_FALLBACK_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

function tilesFor(variant: LaneMapVariant): { url: string; attr: string } {
  if (variant === "light") {
    return STADIA_KEY
      ? { url: TILES_LIGHT_STADIA, attr: TILES_LIGHT_STADIA_ATTR }
      : { url: TILES_LIGHT_FALLBACK, attr: TILES_LIGHT_FALLBACK_ATTR };
  }
  return { url: TILES_DARK, attr: TILES_DARK_ATTR };
}

const MOBILE_QUERY = "(max-width: 639px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type LaneSide = "from" | "to";

type LaneLayers = {
  /** The ONE visible stroke per lane. Hover/selected restyle THIS line
   *  (brighten + widen) — no separate glow/casing layer, so a lane can
   *  never read as multiple parallel lines. */
  baseLine: LeafletPolyline;
  /** The ONE invisible fat polyline — ≥44px-friendly touch/click target.
   *  Shares the exact same latlngs array as baseLine. */
  hitLine: LeafletPolyline;
  fromDot: LeafletCircleMarker;
  toDot: LeafletCircleMarker;
  /** Invisible oversized endpoint hit targets (mobile taps). */
  fromHit: LeafletCircleMarker;
  toHit: LeafletCircleMarker;
  fromPulse: LeafletCircleMarker | null;
  toPulse: LeafletCircleMarker | null;
  /** Animated dash-flow overlay — SELECTED lane only (flow prop). Built
   *  from the same `points` array as baseLine so it overlays perfectly. */
  flowLine: LeafletPolyline | null;
  /** Lane arc points (quadratic bezier, antimeridian-unwrapped) — the
   *  single source of latlngs for baseLine, hitLine and flowLine. */
  points: LatLngTuple[];
  fromCoord: LatLngTuple;
  toCoord: LatLngTuple;
  /** Volume-scaled idle line weight (equals 2 when volumeScale off). */
  baseWeight: number;
  /** Volume-scaled endpoint dot radius (equals 7 when volumeScale off). */
  baseRadius: number;
};

type HoverState = {
  laneId: string;
  side: LaneSide;
  screenX: number;
  screenY: number;
};

/**
 * Lane arc geometry — quadratic bezier in unwrapped lon/lat space.
 * Inputs are [lon, lat]; output is [lat, lon] pairs (Leaflet's order).
 * Returns `steps + 1` points so we always include both endpoints.
 *
 * 2026-08-14 (CEO): the previous great-circle slerp is geodesically
 * correct on a sphere, but on the Mercator map it projected long east-
 * west lanes as huge loops over Alaska/Greenland — reads as wrong to
 * users. Lanes now render like flight-map infographics: straight or
 * SLIGHTLY curved connectors.
 *
 *  - CHORD: drawn in unwrapped lon/lat space between the endpoints.
 *  - CURVATURE: control point sits perpendicular to the chord midpoint
 *    at up to ~0.15 of chord length, always bowed TOWARD the equator
 *    (never poleward — poleward bows are exactly the old Alaska loops).
 *    Short lanes (< ~10° chord) stay effectively straight; curvature
 *    ramps in with chord length (full bow by ~60°).
 *
 * ANTIMERIDIAN (kept from the previous implementation): the destination
 * keeps its canonical longitude (US destinations shared by several
 * lanes stay in one place); the origin is unwrapped onto the nearest
 * world copy (±360°) so a Pacific lane (e.g. Vietnam → Atlanta) crosses
 * the Pacific the short way. Leaflet (worldCopyJump) renders adjacent
 * world copies seamlessly. The polyline never wraps the world edge-to-
 * edge.
 */
function laneArcPoints(
  from: [number, number],
  to: [number, number],
  steps = 48,
): LatLngTuple[] {
  const [lonRaw, lat1] = from;
  const [lon2, lat2] = to;

  // Unwrap the origin longitude onto the world copy nearest the
  // destination so the chord takes the short way around.
  let dLon = lonRaw - lon2;
  while (dLon > 180) dLon -= 360;
  while (dLon < -180) dLon += 360;
  const lon1 = lon2 + dLon;

  const dx = lon2 - lon1;
  const dy = lat2 - lat1;
  const len = Math.hypot(dx, dy);
  if (len === 0) {
    return [[lat1, lon2]];
  }

  // Curvature ramp: 0 below a 10° chord (Chicago→Denver stays straight),
  // scaling to 0.15 × chord length by ~60° (transpacific lanes get a
  // gentle, deliberate bow).
  const ramp = Math.min(1, Math.max(0, (len - 10) / 50));
  const bow = 0.15 * ramp * len;

  // Perpendicular unit vector at the chord midpoint, sign-flipped so the
  // control point always moves toward the equator.
  let px = -dy / len;
  let py = dx / len;
  const midLat = (lat1 + lat2) / 2;
  if ((midLat >= 0 && py > 0) || (midLat < 0 && py < 0)) {
    px = -px;
    py = -py;
  }
  const cx = (lon1 + lon2) / 2 + px * bow;
  // Clamp so the control point can never push samples past the poles.
  const cy = Math.max(-80, Math.min(80, midLat + py * bow));

  const out: LatLngTuple[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const g = 1 - f;
    const lon = g * g * lon1 + 2 * g * f * cx + f * f * lon2;
    const lat = g * g * lat1 + 2 * g * f * cy + f * f * lat2;
    out.push([lat, lon]);
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

/** log-scaled 0..1 volume ratio for a lane against the set max. */
function volumeRatio(shipments: number | undefined, max: number): number {
  const s = Math.max(0, Number(shipments) || 0);
  if (max <= 0) return 0;
  return Math.log(1 + s) / Math.log(1 + max);
}

export default function LaneMap({
  lanes,
  selectedLane,
  onSelectLane,
  height = 360,
  className = "",
  variant = "dark",
  volumeScale = false,
  zoomControlPosition = "topleft",
  fitPadding,
  laneColors,
  unselectedStyle = "fade",
  flow = false,
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

  const palette = variant === "light" ? LIGHT_PALETTE : DARK_PALETTE;

  // fitPadding is read through a ref so callers can pass a fresh object
  // every render without retriggering rebuild/fly effects.
  const fitPaddingRef = useRef<LaneMapFitPadding | undefined>(fitPadding);
  fitPaddingRef.current = fitPadding;
  const paddedFitOpts = () => {
    const p = fitPaddingRef.current;
    return {
      paddingTopLeft: [Math.max(24, p?.left ?? 0), Math.max(24, p?.top ?? 0)] as [
        number,
        number,
      ],
      paddingBottomRight: [
        Math.max(24, p?.right ?? 0),
        Math.max(24, p?.bottom ?? 0),
      ] as [number, number],
    };
  };

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
      zoomControl: false,
      attributionControl: true,
      preferCanvas: false, // SVG renderer needed for CSS-driven pulse
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 8,
    });
    L.control.zoom({ position: zoomControlPosition }).addTo(map);

    const { url, attr } = tilesFor(variant);
    const baseTiles: LeafletTileLayer = L.tileLayer(url, {
      attribution: attr,
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
      // Silent — lanes still render usefully against the flat ground color.
      // Console-warn once to aid debugging without burning user-facing UI.
      console.warn("[LaneMap] basemap tile failed to load; rendering lanes against flat ground.");
    });

    // Keep Leaflet's internal size in sync with the container — the hero
    // uses height="fill" inside responsive parents, and the fullscreen
    // dialog resizes with the viewport.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        map.invalidateSize({ animate: false });
      });
      ro.observe(el);
    }

    mapRef.current = map;

    return () => {
      window.clearTimeout(slowTimer);
      if (ro) ro.disconnect();
      map.remove();
      mapRef.current = null;
      laneLayersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild lane layers when the lane set changes. Selection-only changes
  // are handled by the cheaper restyle effect below.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Tear down existing lane layers.
    for (const layers of laneLayersRef.current.values()) {
      map.removeLayer(layers.baseLine);
      map.removeLayer(layers.hitLine);
      map.removeLayer(layers.fromDot);
      map.removeLayer(layers.toDot);
      map.removeLayer(layers.fromHit);
      map.removeLayer(layers.toHit);
      if (layers.fromPulse) map.removeLayer(layers.fromPulse);
      if (layers.toPulse) map.removeLayer(layers.toPulse);
      if (layers.flowLine) map.removeLayer(layers.flowLine);
    }
    laneLayersRef.current.clear();
    hoveredLaneRef.current = null;
    setHover(null);

    if (lanes.length === 0) return;

    const allLatLngs: LatLngTuple[] = [];
    const maxShipments = lanes.reduce(
      (m, l) => Math.max(m, Number(l.shipments) || 0),
      0,
    );

    // One visible stroke + one invisible hit line per lane. Endpoint
    // coords come from the unwrapped polyline ends (NOT the raw lane
    // coords) so dots/pulses/popovers sit exactly on the line even when
    // the origin was shifted across the antimeridian.
    for (const lane of lanes) {
      const points = laneArcPoints(lane.coords[0], lane.coords[1]);
      const fromCoord: LatLngTuple = points[0];
      const toCoord: LatLngTuple = points[points.length - 1];

      // Volume weighting — log-scaled so one mega-lane doesn't flatten
      // the rest. Lines 1.5→4px, dots 5→10px.
      const ratio = volumeScale ? volumeRatio(lane.shipments, maxShipments) : 0;
      const baseWeight = volumeScale ? 1.5 + ratio * 2.5 : 2;
      const baseRadius = volumeScale ? Math.round(5 + ratio * 5) : 7;

      const laneColor = laneColors?.[lane.id];
      const baseLine = L.polyline(points, {
        color: laneColor?.base ?? palette.idle,
        weight: baseWeight,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(map);

      // Invisible fat twin — the actual click/hover target. 26px stroke
      // ≈ 44px effective touch target with finger slop.
      const hitLine = L.polyline(points, {
        color: "#000",
        weight: 26,
        opacity: 0.001,
        lineCap: "round",
        lineJoin: "round",
        interactive: true,
        bubblingMouseEvents: false,
      }).addTo(map);

      const dotStyle = {
        radius: baseRadius,
        color: palette.dotStroke,
        weight: 2,
        fillColor: laneColor?.base ?? palette.dotFill,
        fillOpacity: 1,
        interactive: false,
      };
      const fromDot = L.circleMarker(fromCoord, dotStyle).addTo(map);
      const toDot = L.circleMarker(toCoord, dotStyle).addTo(map);

      const hitStyle = {
        radius: 18,
        stroke: false,
        fillColor: "#000",
        fillOpacity: 0.001,
        interactive: true,
        bubblingMouseEvents: false,
      };
      const fromHit = L.circleMarker(fromCoord, hitStyle).addTo(map);
      const toHit = L.circleMarker(toCoord, hitStyle).addTo(map);

      const layers: LaneLayers = {
        baseLine,
        hitLine,
        fromDot,
        toDot,
        fromHit,
        toHit,
        fromPulse: null,
        toPulse: null,
        flowLine: null,
        points,
        fromCoord,
        toCoord,
        baseWeight,
        baseRadius,
      };
      laneLayersRef.current.set(lane.id, layers);

      // Lane line click → select.
      hitLine.on("click", () => {
        onSelectLane?.(lane.id);
      });
      // Lane hover → set this lane as hovered (triggers restyle below).
      hitLine.on("mouseover", () => {
        if (hoveredLaneRef.current !== lane.id) {
          hoveredLaneRef.current = lane.id;
          applyStateStyles();
        }
      });
      hitLine.on("mouseout", () => {
        if (hoveredLaneRef.current === lane.id) {
          hoveredLaneRef.current = null;
          applyStateStyles();
        }
      });

      // Endpoint hover/click → set popover + lane selection.
      const attachEndpoint = (
        hit: LeafletCircleMarker,
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
        hit.on("mouseover", () => {
          if (isMobile) return;
          openPopover();
          if (hoveredLaneRef.current !== lane.id) {
            hoveredLaneRef.current = lane.id;
            applyStateStyles();
          }
        });
        hit.on("mouseout", () => {
          if (isMobile) return;
          scheduleClose();
          if (hoveredLaneRef.current === lane.id) {
            hoveredLaneRef.current = null;
            applyStateStyles();
          }
        });
        hit.on("click", () => {
          openPopover();
          onSelectLane?.(lane.id);
        });
      };
      attachEndpoint(fromHit, "from", fromCoord);
      attachEndpoint(toHit, "to", toCoord);

      allLatLngs.push(fromCoord, toCoord);
    }

    // Initial fit so all lanes are visible without animating. Padding
    // keeps lanes clear of floating overlay panels.
    if (allLatLngs.length > 0) {
      const bounds = L.latLngBounds(allLatLngs);
      map.fitBounds(bounds, {
        ...paddedFitOpts(),
        maxZoom: 5,
        animate: false,
      });
    }

    // Apply selection/hover styling now that layers exist.
    applyStateStyles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneKey, onSelectLane, isMobile, volumeScale]);

  /**
   * Restyle pass. Walks every lane's layers and reconciles them with
   * the current `selectedLane` and `hoveredLaneRef` — restyling the ONE
   * visible stroke in place and adding/removing pulse rings + the flow
   * overlay as needed. Pulled out so both effects (rebuild + selection
   * change) can call it.
   */
  const applyStateStyles = () => {
    const map = mapRef.current;
    if (!map) return;
    const hovered = hoveredLaneRef.current;
    const hasSelection = !!selectedLane;
    const selectedExists = !!selectedLane && laneLayersRef.current.has(selectedLane);

    const ghost = unselectedStyle === "ghost";

    for (const [laneId, layers] of laneLayersRef.current.entries()) {
      const isSelected = selectedExists && laneId === selectedLane;
      const isHovered = !isSelected && laneId === hovered;
      const isFaded = hasSelection && selectedExists && !isSelected;
      const lc = laneColors?.[laneId];

      // Single-stroke styling — hover/selected brighten + widen the SAME
      // polyline (no separate glow layer, so a lane never reads as
      // multiple parallel lines). Weights ride on the volume-scaled base;
      // per-lane regional colors (laneColors) override the variant palette.
      let color = lc?.base ?? palette.idle;
      let weight = layers.baseWeight;
      let opacity = 0.85;
      if (isSelected) {
        color = lc?.selected ?? palette.selected;
        weight = Math.max(4, layers.baseWeight + 2);
        opacity = 1;
      } else if (isHovered) {
        color = lc?.selected ?? palette.hover;
        weight = layers.baseWeight + 1;
        opacity = 1;
      } else if (isFaded) {
        if (ghost) {
          // Focused mode: non-selected lanes are faint 1px ghost lines in
          // their own lane color — context without noise, still clickable.
          color = lc?.base ?? palette.faded;
          weight = 1;
          opacity = 0.3;
        } else {
          color = palette.faded;
          weight = Math.max(1.25, layers.baseWeight - 0.5);
          opacity = 0.35;
        }
      }
      layers.baseLine.setStyle({ color, weight, opacity });
      // Emphasized lanes paint above their idle siblings.
      if (isSelected || isHovered) layers.baseLine.bringToFront();

      // Endpoint dots. Selected = +2px (with pulse). Faded shrink slightly;
      // ghost mode shrinks them to small 3px context dots.
      const dotRadius = isSelected
        ? layers.baseRadius + 2
        : isFaded
          ? ghost
            ? 3
            : Math.max(4, layers.baseRadius - 1)
          : layers.baseRadius;
      for (const dot of [layers.fromDot, layers.toDot]) {
        dot.setStyle({
          radius: dotRadius,
          color: palette.dotStroke,
          weight: ghost && isFaded ? 1 : 2,
          fillColor: isSelected
            ? (lc?.selected ?? palette.dotFill)
            : (lc?.base ?? palette.dotFill),
          fillOpacity: isFaded ? (ghost ? 0.45 : 0.55) : 1,
        });
        dot.bringToFront();
      }
      // Hit targets stay above their visual dots.
      layers.fromHit.bringToFront();
      layers.toHit.bringToFront();

      // Pulse rings — only on selected. Created/destroyed as selection moves.
      const ensurePulse = (
        existing: LeafletCircleMarker | null,
        coord: LatLngTuple,
      ): LeafletCircleMarker => {
        if (existing) return existing;
        const ring = L.circleMarker(coord, {
          radius: 12,
          color: lc?.glow ?? palette.pulse,
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

      // Supply-chain flow — animated directional dash overlay (origin →
      // destination), SELECTED lane only. Built from the exact same
      // `points` array as the base line so it overlays perfectly — it
      // reads as motion ON the line, never as a second line. The dash
      // pattern is round-capped 1×12 → dots marching along the supply
      // chain. CSS drives the motion (lit-lane-flow) and shuts it off
      // under prefers-reduced-motion (static dotted overlay remains).
      if (isSelected && flow) {
        const flowWeight = Math.max(1.5, weight - 2);
        if (!layers.flowLine) {
          layers.flowLine = L.polyline(layers.points, {
            color: "#FFFFFF",
            weight: flowWeight,
            opacity: 0.95,
            dashArray: "1 12",
            lineCap: "round",
            lineJoin: "round",
            interactive: false,
            className: "lit-lane-flow",
          }).addTo(map);
        } else {
          layers.flowLine.setStyle({ weight: flowWeight });
        }
      } else if (layers.flowLine) {
        map.removeLayer(layers.flowLine);
        layers.flowLine = null;
      }
    }

    // Selected lane elements should sit on top of everything else.
    if (selectedExists) {
      const sel = laneLayersRef.current.get(selectedLane!);
      if (sel) {
        sel.baseLine.bringToFront();
        if (sel.flowLine) sel.flowLine.bringToFront();
        sel.fromDot.bringToFront();
        sel.toDot.bringToFront();
        if (sel.fromPulse) sel.fromPulse.bringToFront();
        if (sel.toPulse) sel.toPulse.bringToFront();
        sel.fromHit.bringToFront();
        sel.toHit.bringToFront();
      }
    }
  };

  // Restyle when the visual-treatment props change (focus toggle flips
  // unselectedStyle between ghost/fade; laneColors swap with the lane set).
  useEffect(() => {
    applyStateStyles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unselectedStyle, laneColors, flow]);

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
        map.fitBounds(bounds, { ...paddedFitOpts(), maxZoom: 5, animate: false });
      } else {
        map.flyToBounds(bounds, { ...paddedFitOpts(), maxZoom: 5, duration: 0.8 });
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

  const shellClasses =
    variant === "light"
      ? "lit-lane-map lit-lane-map--light relative w-full overflow-hidden"
      : "lit-lane-map relative w-full overflow-hidden rounded-lg border border-slate-800/70";

  return (
    <div
      className={[shellClasses, className].join(" ")}
      style={{
        height: height === "fill" ? "100%" : height,
        background: palette.containerBg,
      }}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Empty state. */}
      {lanes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[600] flex flex-col items-center justify-center gap-2">
          <MapPinOff
            className={
              variant === "light"
                ? "h-8 w-8 text-slate-400"
                : "h-8 w-8 text-slate-500"
            }
          />
          <div
            className={
              variant === "light"
                ? "text-sm font-medium text-slate-600"
                : "text-sm font-medium text-slate-200"
            }
          >
            No lanes to map
          </div>
          <div
            className={
              variant === "light" ? "text-xs text-slate-400" : "text-xs text-slate-500"
            }
          >
            Lanes appear as shipment data lands
          </div>
        </div>
      )}

      {/* Slow-tile overlay — only after >800 ms with nothing painted. */}
      {showSlowOverlay && tilesPending && lanes.length > 0 && (
        <div
          className={[
            "pointer-events-none absolute inset-0 z-[650] flex items-center justify-center",
            variant === "light" ? "bg-white/40" : "bg-slate-900/50",
          ].join(" ")}
        >
          <Loader2
            className={
              variant === "light"
                ? "h-6 w-6 animate-spin text-blue-600"
                : "h-6 w-6 animate-spin text-cyan-400"
            }
          />
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
