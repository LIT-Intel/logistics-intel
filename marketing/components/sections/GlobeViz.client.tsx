"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

const Globe = dynamic(() => import("react-globe.gl").then((m) => m.default), {
  ssr: false,
  loading: () => null,
});

/**
 * Real WebGL globe via three.js + three-globe (lazy-loaded). Renders
 * 8 active trade lanes between major ports as flowing arcs with
 * pulsing endpoints. Replaces the SVG-hack globe.
 *
 * Bundle hit (~250KB gzipped including three.js) is mitigated by:
 *   1. dynamic import with ssr:false → no impact on first paint
 *   2. intersection observer → only mounts once visible
 *   3. mobile fallback (under 768px) renders nothing — paired with
 *      the static SVG fallback wrapping this in MarketingGlobe.tsx
 */

const PORTS = {
  CNSHA: { name: "Shanghai", lat: 31.23, lng: 121.47 },
  USLGB: { name: "Long Beach", lat: 33.77, lng: -118.2 },
  VNSGN: { name: "Ho Chi Minh", lat: 10.82, lng: 106.63 },
  USSEA: { name: "Seattle", lat: 47.61, lng: -122.33 },
  INNSA: { name: "Mumbai", lat: 19.07, lng: 72.87 },
  USHOU: { name: "Houston", lat: 29.76, lng: -95.37 },
  USNYC: { name: "New York", lat: 40.71, lng: -74.0 },
  NLRTM: { name: "Rotterdam", lat: 51.95, lng: 4.14 },
  BRSSZ: { name: "Santos", lat: -23.95, lng: -46.33 },
  SGSIN: { name: "Singapore", lat: 1.27, lng: 103.83 },
  DEHAM: { name: "Hamburg", lat: 53.55, lng: 9.99 },
  BEANR: { name: "Antwerp", lat: 51.22, lng: 4.4 },
  KRPUS: { name: "Busan", lat: 35.1, lng: 129.04 },
};

const LANES: Array<[keyof typeof PORTS, keyof typeof PORTS, string]> = [
  ["CNSHA", "USLGB", "Shanghai → Long Beach · 18.9K TEU"],
  ["VNSGN", "USSEA", "Ho Chi Minh → Seattle · 9.4K TEU"],
  ["INNSA", "USHOU", "Mumbai → Houston · 6.2K TEU"],
  ["USNYC", "NLRTM", "New York → Rotterdam · 4.1K TEU"],
  ["BRSSZ", "SGSIN", "Santos → Singapore · 3.8K TEU"],
  ["KRPUS", "USLGB", "Busan → Long Beach · 7.6K TEU"],
  ["DEHAM", "USNYC", "Hamburg → New York · 5.0K TEU"],
  ["SGSIN", "BEANR", "Singapore → Antwerp · 4.5K TEU"],
];

export function GlobeViz({ size = 480 }: { size?: number }) {
  const ref = useRef<any>(null);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Only mount once visible — keeps the three.js bundle off the
  // critical path for users who never scroll to it.
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setMounted(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const arcsData = useMemo(
    () =>
      LANES.map(([from, to, label]) => ({
        startLat: PORTS[from].lat,
        startLng: PORTS[from].lng,
        endLat: PORTS[to].lat,
        endLng: PORTS[to].lng,
        color: ["rgba(0,240,255,0.85)", "rgba(59,130,246,0.85)"],
        label,
      })),
    [],
  );

  const pointsData = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const [from, to] of LANES) {
      [from, to].forEach((k) => {
        if (seen.has(k)) return;
        seen.add(k);
        out.push({ ...PORTS[k], code: k });
      });
    }
    return out;
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    // Auto-rotate — slow, ZoomInfo-grade
    const controls = ref.current.controls?.();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.4;
      controls.enableZoom = false;
    }
    // Initial camera angle — Pacific-centered shows the most lanes
    ref.current.pointOfView?.({ lat: 22, lng: -160, altitude: 2.4 }, 0);
  }, [mounted]);

  return (
    <div
      ref={containerRef}
      style={{ width: size, height: size }}
      className="mx-auto"
    >
      {mounted && (
        <Globe
          ref={ref}
          width={size}
          height={size}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          atmosphereColor="#00F0FF"
          atmosphereAltitude={0.18}
          arcsData={arcsData}
          arcColor="color"
          arcStroke={0.45}
          arcDashLength={0.4}
          arcDashGap={1}
          arcDashInitialGap={() => Math.random()}
          arcDashAnimateTime={2400}
          arcAltitudeAutoScale={0.4}
          arcLabel="label"
          pointsData={pointsData}
          pointAltitude={0.01}
          pointRadius={0.35}
          pointColor={() => "#00F0FF"}
          pointLabel={(d: any) => `${d.name} (${d.code})`}
        />
      )}
    </div>
  );
}
