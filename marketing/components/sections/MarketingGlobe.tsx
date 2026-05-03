"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const GlobeViz = dynamic(() => import("./GlobeViz.client").then((m) => m.GlobeViz), {
  ssr: false,
  loading: () => <GlobeStaticFallback />,
});

/**
 * MarketingGlobe — entry point used across marketing pages.
 *
 * On desktop (>=768px) lazy-loads a real WebGL globe (three.js +
 * three-globe via react-globe.gl) with 8 active trade lanes flowing
 * between major ports. Auto-rotates, dashes flow in cyan.
 *
 * On mobile (<768px) renders a clean static SVG fallback so we don't
 * ship the ~250KB three.js bundle to phones.
 */
export function MarketingGlobe({
  size = 480,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size, maxWidth: "100%" }}>
      {isDesktop ? <GlobeViz size={size} /> : <GlobeStaticFallback />}
    </div>
  );
}

/**
 * Static SVG fallback — clean enough that mobile users don't feel
 * shortchanged, light enough that no JS executes for it.
 */
function GlobeStaticFallback() {
  return (
    <div className="relative aspect-square w-full">
      <svg viewBox="0 0 320 320" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="mg-grad" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#1E293B" />
            <stop offset="100%" stopColor="#0F172A" />
          </radialGradient>
          <radialGradient id="mg-atm" cx="50%" cy="50%" r="55%">
            <stop offset="80%" stopColor="rgba(0,240,255,0)" />
            <stop offset="100%" stopColor="rgba(0,240,255,0.18)" />
          </radialGradient>
        </defs>
        <circle cx="160" cy="160" r="155" fill="url(#mg-atm)" />
        <circle cx="160" cy="160" r="120" fill="url(#mg-grad)" />
        {[20, 50, 80, 110, 140].map((r) => (
          <ellipse
            key={r}
            cx="160"
            cy="160"
            rx="120"
            ry={r * 0.6}
            fill="none"
            stroke="rgba(0,240,255,0.1)"
            strokeWidth="0.6"
          />
        ))}
        {[0, 30, 60, 90, 120, 150].map((rot) => (
          <ellipse
            key={rot}
            cx="160"
            cy="160"
            rx="40"
            ry="120"
            fill="none"
            stroke="rgba(0,240,255,0.1)"
            strokeWidth="0.6"
            transform={`rotate(${rot} 160 160)`}
          />
        ))}
      </svg>
    </div>
  );
}
