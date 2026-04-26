import React, { useEffect, useRef, useState } from "react";
import {
  geoOrthographic,
  geoPath,
  geoGraticule,
  geoDistance,
  type GeoProjection,
} from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";

/**
 * Display metadata attached to a resolved lane endpoint. Mirrors the
 * `ResolvedEndpoint` shape from `@/lib/laneGlobe` without forcing an import
 * cycle (consumers populate it; this canvas just reads optional fields).
 */
export type GlobeLaneEndpointMeta = {
  label: string;
  canonicalKey: string;
  countryName: string;
  countryCode: string;
  flag: string;
  coords: [number, number];
};

export type GlobeLane = {
  id: string;
  from: string;
  to: string;
  coords: [[number, number], [number, number]];
  shipments?: number;
  teu?: string;
  trend?: string;
  up?: boolean;
  /** Optional resolved metadata for the origin endpoint. */
  fromMeta?: GlobeLaneEndpointMeta;
  /** Optional resolved metadata for the destination endpoint. */
  toMeta?: GlobeLaneEndpointMeta;
};

type GlobePalette = {
  oceanInner: string;
  oceanOuter: string;
  sphereStroke: string;
  graticule: string;
  landFill: string;
  landStroke: string;
  highlightFill: string;
  arcGlow: string;
  arcStroke: string;
  dotFill: string;
  dotStroke: string;
  pulseStroke: (alpha: number) => string;
};

const LIGHT_PALETTE: GlobePalette = {
  oceanInner: "#F0F7FF",
  oceanOuter: "#DBEAFE",
  sphereStroke: "#BFDBFE",
  graticule: "rgba(59,130,246,0.07)",
  landFill: "#E2E8F0",
  landStroke: "#FFFFFF",
  highlightFill: "rgba(59,130,246,0.48)",
  arcGlow: "rgba(59,130,246,0.2)",
  arcStroke: "#3B82F6",
  dotFill: "#3B82F6",
  dotStroke: "#FFFFFF",
  pulseStroke: (alpha) => `rgba(59,130,246,${alpha})`,
};

// Higher-contrast variant used by the Company Detail trade-lane card. The
// Dashboard trade-lanes consumer keeps the legacy "light" palette by default.
//
// Phase B.3 — palette retuned per the validated design source. Previous tones
// (#0F172A ocean / #3B82F6 land / #A5B4FC arc) read too dark over the panel's
// light surface and washed out the arcs. New tokens:
// - Ocean: #1E3A8A (soft navy, brighter than slate-900).
// - Land: #60A5FA (medium blue, friendlier on navy).
// - Graticule: #475569 at low opacity.
// - Arc stroke: #818CF8 (indigo-400, visible against medium-blue land).
// - Endpoint dots: #22D3EE (cyan-400) with #0E7490 outer ring at low opacity.
// - Selected lane glow: #A78BFA (violet-400) for clear contrast vs unselected.
const DARK_PALETTE: GlobePalette = {
  oceanInner: "#1E3A8A",
  oceanOuter: "#1E3A8A",
  sphereStroke: "#1E3A8A",
  graticule: "rgba(71,85,105,0.32)",
  landFill: "#60A5FA",
  landStroke: "#1E3A8A",
  highlightFill: "rgba(167,139,250,0.78)",
  arcGlow: "rgba(167,139,250,0.40)",
  arcStroke: "#818CF8",
  dotFill: "#22D3EE",
  dotStroke: "rgba(14,116,144,0.55)",
  pulseStroke: (alpha) => `rgba(34,211,238,${alpha})`,
};

type Props = {
  lanes: GlobeLane[];
  selectedLane: string | null;
  size?: number;
  /**
   * "light" (default, used by dashboard) renders the legacy pale-blue ocean.
   * "dark" renders a higher-contrast navy ocean with brighter land/arcs so
   *  the globe reads clearly against a light premium background.
   */
  theme?: "light" | "dark";
};

type GlobeState = {
  world: Topology | null;
  rotation: [number, number];
  targetRotation: [number, number] | null;
  spinning: boolean;
  animFrame: number | null;
  dashOffset: number;
  loaded: boolean;
};

export default function GlobeCanvas({
  lanes,
  selectedLane,
  size = 268,
  theme = "light",
}: Props) {
  const palette: GlobePalette = theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GlobeState>({
    world: null,
    rotation: [0, -25],
    targetRotation: null,
    spinning: true,
    animFrame: null,
    dashOffset: 0,
    loaded: false,
  });
  const lanesRef = useRef(lanes);
  const selectedRef = useRef(selectedLane);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { lanesRef.current = lanes; }, [lanes]);
  useEffect(() => { selectedRef.current = selectedLane; }, [selectedLane]);

  // Load world topology once
  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
      .then((r) => r.json())
      .then((data) => {
        stateRef.current.world = data;
        stateRef.current.loaded = true;
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      if (stateRef.current.animFrame) cancelAnimationFrame(stateRef.current.animFrame);
    };
  }, []);

  // Rotate to selected lane midpoint
  useEffect(() => {
    const s = stateRef.current;
    if (selectedLane) {
      const lane = lanesRef.current.find((l) => l.id === selectedLane);
      if (lane) {
        const midLon = (lane.coords[0][0] + lane.coords[1][0]) / 2;
        const midLat = (lane.coords[0][1] + lane.coords[1][1]) / 2;
        s.targetRotation = [-midLon, -midLat];
        s.spinning = false;
      }
    } else {
      s.spinning = true;
      s.targetRotation = null;
    }
  }, [selectedLane]);

  // Animation loop
  useEffect(() => {
    if (!loaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const s = stateRef.current;

    function tick() {
      s.animFrame = requestAnimationFrame(tick);

      // Smooth rotation interpolation
      if (s.targetRotation) {
        const [tr0, tr1] = s.targetRotation;
        s.rotation[0] += (tr0 - s.rotation[0]) * 0.035;
        s.rotation[1] += (tr1 - s.rotation[1]) * 0.035;
        if (Math.abs(s.rotation[0] - tr0) < 0.05 && Math.abs(s.rotation[1] - tr1) < 0.05) {
          s.rotation = [tr0, tr1];
          s.targetRotation = null;
        }
      } else if (s.spinning) {
        s.rotation[0] += 0.1;
      }
      s.dashOffset = (s.dashOffset + 0.4) % 24;

      const proj: GeoProjection = geoOrthographic()
        .scale(size / 2 - 6)
        .translate([size / 2, size / 2])
        .rotate([s.rotation[0], s.rotation[1], 0])
        .clipAngle(90);

      const pathGen = geoPath(proj, ctx);
      ctx.clearRect(0, 0, size, size);

      // Sphere background gradient
      const grad = ctx.createRadialGradient(
        size * 0.42, size * 0.38, size * 0.05,
        size / 2, size / 2, size / 2 - 6
      );
      grad.addColorStop(0, palette.oceanInner);
      grad.addColorStop(1, palette.oceanOuter);
      ctx.beginPath();
      pathGen({ type: "Sphere" } as any);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = palette.sphereStroke;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Graticule
      ctx.beginPath();
      pathGen(geoGraticule().step([30, 30])() as any);
      ctx.strokeStyle = palette.graticule;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Countries
      if (s.world) {
        const sel = selectedRef.current;
        const activeLanes = lanesRef.current;
        const hlLane = sel ? activeLanes.find((l) => l.id === sel) : null;
        const features = (feature(s.world as any, (s.world as any).objects.countries) as any).features;
        features.forEach((f: any) => {
          ctx.beginPath();
          pathGen(f);
          ctx.fillStyle = palette.landFill;
          ctx.fill();
          ctx.strokeStyle = palette.landStroke;
          ctx.lineWidth = 0.4;
          ctx.stroke();
        });
        // Highlight origin/destination countries
        if (hlLane) {
          features.forEach((f: any) => {
            const name = (f.properties?.name || "").toLowerCase();
            const fromMatch = hlLane.from.toLowerCase();
            const toMatch = hlLane.to.toLowerCase();
            if (name.includes(fromMatch) || name.includes(toMatch) ||
                fromMatch.includes(name) || toMatch.includes(name)) {
              ctx.beginPath();
              pathGen(f);
              ctx.fillStyle = palette.highlightFill;
              ctx.fill();
            }
          });
        }
      }

      // Trade route arc
      const sel = selectedRef.current;
      if (sel) {
        const lane = lanesRef.current.find((l) => l.id === sel);
        if (lane) {
          const arc = { type: "LineString", coordinates: [lane.coords[0], lane.coords[1]] };
          // Glow
          ctx.beginPath();
          pathGen(arc as any);
          ctx.strokeStyle = palette.arcGlow;
          ctx.lineWidth = 7;
          ctx.setLineDash([]);
          ctx.stroke();
          // Animated dash
          ctx.beginPath();
          pathGen(arc as any);
          ctx.strokeStyle = palette.arcStroke;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([8, 4]);
          ctx.lineDashOffset = -s.dashOffset;
          ctx.stroke();
          ctx.setLineDash([]);

          // Endpoint pulse dots
          lane.coords.forEach((coord) => {
            const rotRad: [number, number] = [
              (-s.rotation[0] * Math.PI) / 180,
              (-s.rotation[1] * Math.PI) / 180,
            ];
            const visible = geoDistance(coord, rotRad) < Math.PI / 2;
            if (!visible) return;
            const projected = proj(coord);
            if (!projected) return;
            const [px, py] = projected;
            // Pulse ring
            const pr = 7 + (s.dashOffset % 12) * 0.9;
            const alpha = Math.max(0, 0.45 - (s.dashOffset % 12) / 26);
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.strokeStyle = palette.pulseStroke(alpha);
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // Dot
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fillStyle = palette.dotFill;
            ctx.fill();
            ctx.strokeStyle = palette.dotStroke;
            ctx.lineWidth = 2;
            ctx.stroke();
          });
        }
      }
    }

    s.animFrame = requestAnimationFrame(tick);
    return () => {
      if (s.animFrame) cancelAnimationFrame(s.animFrame);
    };
    // palette is read inside the rAF tick; including it in deps means a theme
    // change will rebuild the loop with the new colours rather than retain
    // the stale closure from mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, size, theme]);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <canvas ref={canvasRef} style={{ display: "block", borderRadius: "50%" }} />
      {!loaded && (
        <div
          style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            background: "#EFF6FF", borderRadius: "50%",
          }}
        >
          <div style={{ fontSize: 11, color: "#94A3B8", fontFamily: "'Space Grotesk', sans-serif" }}>
            Loading…
          </div>
        </div>
      )}
    </div>
  );
}
