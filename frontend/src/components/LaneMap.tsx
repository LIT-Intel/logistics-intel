import { useEffect, useMemo, useRef } from "react";
import L, {
  type LatLngExpression,
  type Map as LeafletMap,
  type Polyline as LeafletPolyline,
  type CircleMarker as LeafletCircleMarker,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GlobeLane } from "@/components/GlobeCanvas";

/**
 * 2-D trade-lane map. Companion to GlobeCanvas — same input shape
 * (`GlobeLane[]`), different visualization. Whichever surface uses
 * GlobeCanvas can drop LaneMap in without prop shape changes.
 *
 * Why Leaflet (not Mapbox / r3f / d3-only):
 *   - Zero token cost (CartoDB Positron tiles are free for prod use).
 *   - 150 kB gz on top of an already-Leaflet-free bundle — same order as
 *     the three.js + three-globe we'd otherwise reach for. Better mobile
 *     pan/pinch UX than a WebGL globe.
 *   - Pure DOM, plays nicely with the rest of the React tree (no canvas
 *     stacking-context battles like the dashboard had pre-B.6).
 *
 * Lane rendering:
 *   - Each lane becomes a great-circle polyline (interpolated; Leaflet
 *     itself draws straight on the projected plane). 24 intermediate
 *     points is enough for visual smoothness at every zoom level we ship.
 *   - Endpoint dots are CircleMarkers (radius scales with selection state).
 *   - The currently-selected lane gets a heavier stroke + cyan accent.
 *   - Clicking either the polyline or an endpoint dot fires onSelectLane.
 *
 * The map autofits the bounds of all lanes on first render and whenever
 * the lane set changes. Manual pan/zoom by the user is preserved within
 * a render, but a new lane set re-fits.
 */

export type LaneMapProps = {
  lanes: GlobeLane[];
  selectedLane?: string | null;
  onSelectLane?: (laneId: string) => void;
  /** Pixel height of the map container. Width is 100% of parent. */
  height?: number;
  className?: string;
};

// Brand-aligned lane palette. Idle lanes are bold-enough to read on a
// light basemap (the old slate-400 dashed line at weight 1.5 disappeared
// against CARTO Positron). Active lane gets the canonical LIT blue.
const LANE_ACTIVE = "#2563EB";   // blue-600
const LANE_IDLE = "#60A5FA";     // blue-400
const ENDPOINT_ACTIVE_FILL = "#2563EB";
const ENDPOINT_IDLE_FILL = "#FFFFFF";
const ENDPOINT_RING_ACTIVE = "#FFFFFF";
const ENDPOINT_RING_IDLE = "#3B82F6";  // blue-500
// CARTO `light_nolabels` instead of `light_all` — kills the Arabic /
// localized place-name layer that was making the dashboard map look
// like a stock screenshot.
const TILES_LIGHT =
  "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
const TILES_ATTR =
  "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> &copy; <a href=\"https://carto.com/attributions\">CARTO</a>";

/**
 * Great-circle interpolation. Treats inputs as [lon, lat] (matching the
 * coords shape we use everywhere else in the app) and returns [lat, lon]
 * pairs (Leaflet's order). Returns `steps + 1` points so we always
 * include both endpoints.
 */
function greatCirclePoints(
  from: [number, number],
  to: [number, number],
  steps = 24,
): LatLngExpression[] {
  const [lon1, lat1] = from.map((v) => (v * Math.PI) / 180) as [number, number];
  const [lon2, lat2] = to.map((v) => (v * Math.PI) / 180) as [number, number];

  // Spherical distance for slerp.
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
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    out.push([(lat * 180) / Math.PI, (lon * 180) / Math.PI]);
  }
  return out;
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
  const layersRef = useRef<Array<LeafletPolyline | LeafletCircleMarker>>([]);
  // Track which lane is currently rendered as selected so we can re-style
  // without rebuilding the whole layer set when only the selection changes.
  const selectedLayersRef = useRef<{ polyline: LeafletPolyline | null; from: LeafletCircleMarker | null; to: LeafletCircleMarker | null }>({
    polyline: null,
    from: null,
    to: null,
  });

  // Stable lane key — used to skip a full rebuild when only the selection
  // changes (most common interaction).
  const laneKey = useMemo(
    () => lanes.map((l) => `${l.id}|${l.coords[0].join(",")}>${l.coords[1].join(",")}`).join(";"),
    [lanes],
  );

  // Mount + dispose the Leaflet map. Runs once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, {
      worldCopyJump: true,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true, // smoother for many polylines
      // sensible defaults; bounds fit overrides on first lane render
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      maxZoom: 8,
    });
    L.tileLayer(TILES_LIGHT, {
      attribution: TILES_ATTR,
      subdomains: "abcd",
      maxZoom: 8,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = [];
      selectedLayersRef.current = { polyline: null, from: null, to: null };
    };
  }, []);

  // Rebuild lane layers when the lane set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Tear down previous layers.
    for (const layer of layersRef.current) {
      map.removeLayer(layer);
    }
    layersRef.current = [];
    selectedLayersRef.current = { polyline: null, from: null, to: null };

    if (lanes.length === 0) return;

    const endpoints: LatLngExpression[] = [];

    for (const lane of lanes) {
      const points = greatCirclePoints(lane.coords[0], lane.coords[1]);
      const isActive = selectedLane === lane.id;
      const polyline = L.polyline(points, {
        color: isActive ? LANE_ACTIVE : LANE_IDLE,
        weight: isActive ? 3.5 : 2,
        opacity: isActive ? 1 : 0.7,
        lineCap: "round",
        lineJoin: "round",
        interactive: !!onSelectLane,
      }).addTo(map);
      if (onSelectLane) {
        polyline.on("click", () => onSelectLane(lane.id));
      }
      layersRef.current.push(polyline);

      const [fromLat, fromLon] = [lane.coords[0][1], lane.coords[0][0]];
      const [toLat, toLon] = [lane.coords[1][1], lane.coords[1][0]];
      const fromDot = L.circleMarker([fromLat, fromLon], {
        radius: isActive ? 7 : 5,
        color: isActive ? ENDPOINT_RING_ACTIVE : ENDPOINT_RING_IDLE,
        weight: isActive ? 2.5 : 2,
        fillColor: isActive ? ENDPOINT_ACTIVE_FILL : ENDPOINT_IDLE_FILL,
        fillOpacity: 1,
        interactive: !!onSelectLane,
      }).addTo(map);
      const toDot = L.circleMarker([toLat, toLon], {
        radius: isActive ? 7 : 5,
        color: isActive ? ENDPOINT_RING_ACTIVE : ENDPOINT_RING_IDLE,
        weight: isActive ? 2.5 : 2,
        fillColor: isActive ? ENDPOINT_ACTIVE_FILL : ENDPOINT_IDLE_FILL,
        fillOpacity: 1,
        interactive: !!onSelectLane,
      }).addTo(map);
      if (onSelectLane) {
        fromDot.on("click", () => onSelectLane(lane.id));
        toDot.on("click", () => onSelectLane(lane.id));
      }
      layersRef.current.push(fromDot, toDot);

      if (isActive) {
        selectedLayersRef.current = { polyline, from: fromDot, to: toDot };
      }

      endpoints.push([fromLat, fromLon], [toLat, toLon]);
    }

    if (endpoints.length > 0) {
      const bounds = L.latLngBounds(endpoints);
      map.fitBounds(bounds, {
        padding: [24, 24],
        maxZoom: 4, // don't zoom way in on single-lane sets
        animate: false,
      });
    }
    // intentional: rebuild when laneKey changes; selection handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laneKey, onSelectLane]);

  // Selection-only restyle. Cheaper than rebuilding the layer set —
  // pulses the active lane forward without re-rendering everything.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || lanes.length === 0) return;

    // Walk the layer set in the same order we added them (polyline,
    // fromDot, toDot per lane). Restyle each based on whether the lane
    // matches the new selection.
    let layerIdx = 0;
    for (const lane of lanes) {
      const polyline = layersRef.current[layerIdx] as LeafletPolyline | undefined;
      const fromDot = layersRef.current[layerIdx + 1] as LeafletCircleMarker | undefined;
      const toDot = layersRef.current[layerIdx + 2] as LeafletCircleMarker | undefined;
      const isActive = selectedLane === lane.id;
      if (polyline) {
        polyline.setStyle({
          color: isActive ? LANE_ACTIVE : LANE_IDLE,
          weight: isActive ? 3.5 : 2,
          opacity: isActive ? 1 : 0.7,
        });
      }
      for (const dot of [fromDot, toDot]) {
        if (dot) {
          dot.setStyle({
            fillColor: isActive ? ENDPOINT_ACTIVE_FILL : ENDPOINT_IDLE_FILL,
            color: isActive ? ENDPOINT_RING_ACTIVE : ENDPOINT_RING_IDLE,
            weight: isActive ? 2.5 : 2,
            radius: isActive ? 7 : 5,
          });
        }
      }
      layerIdx += 3;
    }
  }, [selectedLane, lanes]);

  return (
    <div
      ref={containerRef}
      className={[
        "lit-lane-map w-full overflow-hidden rounded-lg border border-slate-200/70 bg-slate-50/40",
        className,
      ].join(" ")}
      style={{ height }}
      // Keep Leaflet's default cursor instead of inheriting the parent's
      // pointer cursor — the basemap is draggable, the lanes are clickable.
    />
  );
}
