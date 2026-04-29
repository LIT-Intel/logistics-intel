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
import { flagFromCode } from "@/lib/laneGlobe";

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

// Phase B.6 — 4-tone earth palette used by the dark theme to break the
// flat sage-green of the B.5 landFill. Tones are intentionally close in
// luminance and saturation to avoid a comic-book look — only the hue
// shifts. Hashed by `feature.id % 4` so every render of the same
// country uses the same tone. Sand-grass-forest-tundra approximation,
// not biome-correct, but enough to register as varied terrain.
const LAND_TONE_PALETTE = ["#C9B98E", "#8FA371", "#6B8364", "#9DA388"];

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
// Phase B.6 — realism evaluation. After the B.5 sage-land + navy-ocean
// pass the user still reads the sphere as stylised. A second pass within
// the canvas budget tightens it: land stroke drops to alpha 0.25 (less
// cell-shaded outline), a softer land base, and the atmosphere ring is
// supplemented by a fainter outer halo. Anything beyond that (per-country
// topography sampling, painted height bands, real Earth imagery) requires
// either a static texture asset or a three.js dependency — both flagged in
// the parent agent report and intentionally not done here.
const DARK_PALETTE: GlobePalette = {
  oceanInner: "#4A7BB7",
  oceanOuter: "#1E3A6A",
  sphereStroke: "rgba(30,58,138,0.65)",
  graticule: "rgba(148,163,184,0.18)",
  landFill: "#A8B89A",
  // Phase B.6 — drop alpha from 0.45 to 0.25 so country outlines whisper
  // rather than chunk the sphere into cell-shaded patches.
  landStroke: "rgba(101, 122, 88, 0.25)",
  highlightFill: "#C5D5B5",
  arcGlow: "rgba(167,139,250,0.40)",
  arcStroke: "#818CF8",
  dotFill: "#22D3EE",
  dotStroke: "rgba(14,116,144,0.55)",
  pulseStroke: (alpha) => `rgba(34,211,238,${alpha})`,
  atmosphere: "rgba(180, 215, 255, 0.22)",
  dropShadow: "rgba(15, 23, 42, 0.18)",
};

// Phase 2 (Dashboard redesign) — design-bundle "trade" palette: deep navy
// ocean, sage land (shared with dark via LAND_TONE_PALETTE), amber arc +
// amber endpoint dots with white stroke. Used by the new dashboard
// GlobeCard against a light card background. Existing light/dark
// callers (Company Detail, legacy dashboard fallback) are unaffected.
const TRADE_PALETTE: GlobePalette = {
  oceanInner: "#3B72C7",
  oceanOuter: "#0E2F66",
  sphereStroke: "rgba(255,255,255,0.22)",
  graticule: "rgba(255,255,255,0.06)",
  landFill: "#A8B88A",
  landStroke: "rgba(60,80,40,0.35)",
  highlightFill: "#3B82F6",
  arcGlow: "rgba(96,165,250,0.35)",
  arcStroke: "#FBBF24",
  dotFill: "#FBBF24",
  dotStroke: "#FFFFFF",
  pulseStroke: (alpha) => `rgba(251,191,36,${alpha})`,
  atmosphere: "rgba(96, 165, 250, 0.35)",
  dropShadow: "rgba(15, 23, 42, 0.18)",
};

type Props = {
  lanes: GlobeLane[];
  selectedLane: string | null;
  size?: number;
  /**
   * "light" (legacy) renders the pale-blue ocean variant.
   * "dark" renders a higher-contrast navy ocean with brighter land/arcs so
   *  the globe reads clearly against a light premium background.
   * "trade" renders the design-bundle deep-navy + amber-arc variant used by
   *  the redesigned Dashboard GlobeCard.
   */
  theme?: "light" | "dark" | "trade";
  /**
   * When true, renders an HTML overlay with flag pins on the highlighted
   * lane endpoints. Visible-side endpoint shows a dark-glass pill; backside
   * endpoint is projected to the visible rim with a muted variant.
   * Defaults to false to preserve existing callers.
   */
  showFlagPins?: boolean;
};

type FlagPin = {
  /** ISO-3166 alpha-2 code (lowercase ok). Resolved via flagFromCode. */
  code: string;
  /** Country display label, used for the pill text. */
  label: string;
  /** Pixel coords on the canvas surface. */
  x: number;
  y: number;
  /** True when the endpoint is on the visible hemisphere; false at the rim. */
  visible: boolean;
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
  showFlagPins = false,
}: Props) {
  const palette: GlobePalette =
    theme === "dark"
      ? DARK_PALETTE
      : theme === "trade"
      ? TRADE_PALETTE
      : LIGHT_PALETTE;
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
  // Flag-pin overlay state — populated by the rAF tick when showFlagPins is
  // true. Throttled to one update every 3 frames so React doesn't thrash.
  const [flagPins, setFlagPins] = useState<FlagPin[] | null>(null);
  const showFlagPinsRef = useRef(showFlagPins);

  useEffect(() => { lanesRef.current = lanes; }, [lanes]);
  useEffect(() => { selectedRef.current = selectedLane; }, [selectedLane]);
  useEffect(() => { showFlagPinsRef.current = showFlagPins; }, [showFlagPins]);
  useEffect(() => {
    if (!selectedLane || !showFlagPins) setFlagPins(null);
  }, [selectedLane, showFlagPins]);

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

      // Phase B.4 — leave room between sphere edge and canvas edge so the
      // atmosphere halo and drop shadow can render without being clipped.
      // Phase B.6 — bumped from 16 → 24 to fit the secondary outer halo
      // ring at sphereRadius + 22 without clipping at the canvas edge.
      const sphereRadius = size / 2 - 24;
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

      // Phase B.6 — secondary outer halo at sphereRadius+22 with very low
      // alpha. Reads as the bloom past the inner atmosphere, suggesting
      // depth rather than a hard sphere edge. Alpha 0.10 keeps it well
      // below the inner ring so it doesn't compete visually.
      if (theme === "dark") {
        const outerHaloGrad = ctx.createRadialGradient(
          cx, cy, sphereRadius + 14,
          cx, cy, sphereRadius + 22
        );
        outerHaloGrad.addColorStop(0, "rgba(180,215,255,0.10)");
        outerHaloGrad.addColorStop(1, "rgba(180,215,255,0)");
        ctx.beginPath();
        ctx.arc(cx, cy, sphereRadius + 22, 0, Math.PI * 2);
        ctx.fillStyle = outerHaloGrad;
        ctx.fill();
      }

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
          // Phase B.6 — light per-country tone variation. Without a real
          // Earth texture (would require a static image asset) or a
          // three.js globe (would require a new dependency), the canvas
          // approach can only suggest realism. Hashing each feature's
          // numeric ISO id into one of 4 muted earth tones breaks the
          // monotone-sage look of B.5 without introducing colour bombs.
          // Tones are kept perceptually close to the base #A8B89A so the
          // sphere still reads as a coherent landmass rather than a
          // patchwork of saturated hues. Highlight pass below still wins
          // because it paints in a second loop.
          if (theme === "dark" || theme === "trade") {
            const fid = Number(f?.id) || 0;
            const tone = LAND_TONE_PALETTE[fid % LAND_TONE_PALETTE.length];
            ctx.fillStyle = tone;
          } else {
            ctx.fillStyle = palette.landFill;
          }
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

          // Endpoint pulse dots — capture flag-pin positions when enabled.
          // Phase 2 (Dashboard redesign): when showFlagPins is true we always
          // emit a position for every endpoint (visible OR backside); for the
          // backside case we project onto the visible rim using the rotation
          // matrix so the pin stays attached to the limb.
          const wantPins = showFlagPinsRef.current;
          const pinsThisFrame: FlagPin[] = [];
          lane.coords.forEach((coord, idx) => {
            const rotRad: [number, number] = [
              (-s.rotation[0] * Math.PI) / 180,
              (-s.rotation[1] * Math.PI) / 180,
            ];
            const visible = geoDistance(coord, rotRad) < Math.PI / 2;
            let px: number | null = null;
            let py: number | null = null;
            if (visible) {
              const projected = proj(coord);
              if (projected) {
                [px, py] = projected;
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
              }
            } else if (wantPins) {
              // Project the backside endpoint onto the visible rim of the
              // sphere by rotating it into camera space and reading off the
              // limb direction (ry, rz). Mirrors the math in the design's
              // Globe.jsx — kept local here to avoid pulling a vector lib.
              const lon = (coord[0] * Math.PI) / 180;
              const lat = (coord[1] * Math.PI) / 180;
              const cx0 = rotRad[0];
              const cy0 = rotRad[1];
              const sx = Math.cos(lat) * Math.cos(lon);
              const sy = Math.cos(lat) * Math.sin(lon);
              const sz = Math.sin(lat);
              const c1 = Math.cos(-cx0);
              const s1 = Math.sin(-cx0);
              const rx = sx * c1 - sy * s1;
              const ry = sx * s1 + sy * c1;
              const rz = sz;
              const c2 = Math.cos(cy0);
              const s2 = Math.sin(cy0);
              const rz2 = -rx * s2 + rz * c2;
              const mag = Math.hypot(ry, rz2) || 1;
              const dy = ry / mag;
              const dz = rz2 / mag;
              px = cx + dy * sphereRadius;
              py = cy - dz * sphereRadius;
            }
            if (wantPins && px != null && py != null) {
              const meta = idx === 0 ? lane.fromMeta : lane.toMeta;
              const code = meta?.countryCode || meta?.canonicalKey || (idx === 0 ? lane.from : lane.to) || "";
              const labelText = meta?.countryName || meta?.label || (idx === 0 ? lane.from : lane.to) || "";
              pinsThisFrame.push({ code, label: labelText, x: px, y: py, visible });
            }
          });

          // Throttle flag-pin state updates to every 3 frames + only when the
          // rounded-position signature actually changes. This keeps the rAF
          // tick from flooding React with re-renders during smooth rotation.
          if (wantPins) {
            frameCount++;
            if (frameCount % 3 === 0) {
              const sig = pinsThisFrame
                .map((p) => `${p.code}:${Math.round(p.x)}:${Math.round(p.y)}:${p.visible ? 1 : 0}`)
                .join("|");
              if (sig !== lastFlagSig) {
                lastFlagSig = sig;
                setFlagPins(pinsThisFrame.length ? pinsThisFrame : null);
              }
            }
          }
        }
      }
    }

    let frameCount = 0;
    let lastFlagSig = "";
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
      {showFlagPins && flagPins && flagPins.map((pin, i) => {
        const glyph = flagFromCode(pin.code) || "🏳️";
        const muted = !pin.visible;
        return (
          <div
            key={`${pin.code}-${i}`}
            style={{
              position: "absolute",
              left: pin.x,
              top: pin.y - 30,
              transform: "translate(-50%, 0)",
              pointerEvents: "none",
              zIndex: 2,
              opacity: muted ? 0.78 : 1,
              transition: "opacity 200ms ease",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: muted ? "rgba(30,79,156,0.85)" : "rgba(15,23,42,0.92)",
                border: muted ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.18)",
                borderRadius: 9999,
                padding: "2px 7px 2px 4px",
                boxShadow: "0 4px 12px rgba(15,23,42,0.35)",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ fontSize: 13, lineHeight: 1, filter: muted ? "grayscale(0.2)" : "none" }} aria-hidden>
                {glyph}
              </span>
              <span
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: "#F8FAFC",
                }}
              >
                {(pin.code || pin.label || "").toUpperCase()}
              </span>
              {muted && (
                <span
                  title="Behind globe"
                  aria-label="Behind globe"
                  style={{
                    fontSize: 8,
                    color: "#CBD5E1",
                    fontFamily: "'JetBrains Mono', monospace",
                    marginLeft: 2,
                    opacity: 0.85,
                  }}
                >
                  ↻
                </span>
              )}
            </div>
            <div
              style={{
                width: 1,
                height: 14,
                margin: "0 auto",
                background: muted ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.4)",
              }}
            />
          </div>
        );
      })}
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
