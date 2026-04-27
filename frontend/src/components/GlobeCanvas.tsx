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
  /** Soft atmosphere ring drawn behind the sphere. */
  atmosphere: string;
  /** Floating-globe drop shadow ellipse below the sphere. */
  dropShadow: string;
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
  atmosphere: "rgba(96, 165, 250, 0.18)",
  dropShadow: "rgba(15, 23, 42, 0.18)",
};

// Higher-contrast variant used by the Company Detail trade-lane card. The
// Dashboard trade-lanes consumer keeps the legacy "light" palette by default.
//
// Phase B.5 — globe realism upgrade. The B.4 palette painted both land
// and ocean in shades of blue, so the sphere read as a stylised blue
// ball rather than an Earth. Land now uses a muted sage-green base
// (#A8B89A) with deeper olive borders, the ocean retunes to a more
// saturated medium → deep navy gradient, and the atmosphere halo drops
// alpha so it reads as a soft cloud haze instead of a neon ring. The
// "selected country" highlight is intentionally a slightly lighter
// shade of the land fill (rather than a saturated violet) so picking a
// lane produces a subtle land-tint rather than a colour bomb.
const DARK_PALETTE: GlobePalette = {
  oceanInner: "#4A7BB7",
  oceanOuter: "#1E3A6A",
  sphereStroke: "rgba(30,58,138,0.65)",
  graticule: "rgba(148,163,184,0.18)",
  landFill: "#A8B89A",
  landStroke: "rgba(101, 122, 88, 0.45)",
  highlightFill: "#C5D5B5",
  arcGlow: "rgba(167,139,250,0.40)",
  arcStroke: "#818CF8",
  dotFill: "#22D3EE",
  dotStroke: "rgba(14,116,144,0.55)",
  pulseStroke: (alpha) => `rgba(34,211,238,${alpha})`,
  atmosphere: "rgba(180, 215, 255, 0.22)",
  dropShadow: "rgba(15, 23, 42, 0.18)",
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

      // Phase B.4 — leave 16px between sphere edge and canvas edge so the
      // atmosphere halo and drop shadow can render without being clipped.
      const sphereRadius = size / 2 - 16;
      const cx = size / 2;
      const cy = size / 2;

      const proj: GeoProjection = geoOrthographic()
        .scale(sphereRadius)
        .translate([cx, cy])
        .rotate([s.rotation[0], s.rotation[1], 0])
        .clipAngle(90);

      const pathGen = geoPath(proj, ctx);
      ctx.clearRect(0, 0, size, size);

      // Phase B.4 — drop shadow ellipse beneath the sphere. Drawn first so
      // every later layer paints over it. Soft blur via shadowBlur on a
      // transparent fill stroke approximates SVG feGaussianBlur.
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy + sphereRadius - 4, sphereRadius * 0.78, sphereRadius * 0.16, 0, 0, Math.PI * 2);
      ctx.fillStyle = palette.dropShadow;
      ctx.filter = "blur(6px)";
      ctx.fill();
      ctx.restore();

      // Phase B.4 — atmosphere halo ring. A radial gradient from soft blue
      // at the sphere edge fading to transparent ~16px outside the sphere.
      const atmosGrad = ctx.createRadialGradient(
        cx, cy, sphereRadius * 0.92,
        cx, cy, sphereRadius + 14
      );
      atmosGrad.addColorStop(0, palette.atmosphere);
      atmosGrad.addColorStop(1, "rgba(96,165,250,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, sphereRadius + 14, 0, Math.PI * 2);
      ctx.fillStyle = atmosGrad;
      ctx.fill();

      // Sphere background gradient — center light, edge dark for a true
      // 3D-globe highlight. The bright spot sits up-and-left of center,
      // matching the conventional sun-from-upper-left lighting.
      const grad = ctx.createRadialGradient(
        cx - sphereRadius * 0.18, cy - sphereRadius * 0.22, sphereRadius * 0.05,
        cx, cy, sphereRadius
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

      // Graticule — softer opacity so it whispers behind the land masses.
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
          // Phase B.4 — soft glow on the arc, then animated dashed stroke.
          // shadowBlur gives the indigo arc a subtle aura without needing
          // SVG filters.
          ctx.save();
          ctx.beginPath();
          pathGen(arc as any);
          ctx.strokeStyle = palette.arcGlow;
          ctx.lineWidth = 7;
          ctx.setLineDash([]);
          ctx.stroke();
          ctx.restore();
          // Animated dash with subtle shadow halo for depth.
          ctx.save();
          ctx.beginPath();
          pathGen(arc as any);
          ctx.strokeStyle = palette.arcStroke;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([8, 4]);
          ctx.lineDashOffset = -s.dashOffset;
          ctx.shadowColor = palette.arcGlow;
          ctx.shadowBlur = 6;
          ctx.stroke();
          ctx.restore();
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
      {/* Phase B.4 — no `borderRadius: 50%` clip on the canvas: the
          atmosphere halo and drop shadow paint outside the sphere edge
          and need the full canvas square to render. The sphere itself
          stays a perfect circle via `pathGen({type:"Sphere"})`. */}
      <canvas ref={canvasRef} style={{ display: "block" }} />
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
