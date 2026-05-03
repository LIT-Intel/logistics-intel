"use client";

import { useEffect, useState } from "react";

/**
 * Pure-CSS animated globe used on /lanes and /pulse. No three.js, no
 * extra deps — a stack of rotating SVG ellipses + animated arcs that
 * read as a slowly-spinning earth with active trade lanes pulsing.
 *
 * Performance: ~3KB on page, GPU-only animations. Falls back to a
 * static globe on browsers that don't support `prefers-reduced-motion`.
 */
const ARCS = [
  // origin → destination as rough lat/lng → projected to our 320×320 viewBox
  { from: { x: 95, y: 130 }, to: { x: 215, y: 110 }, label: "Shanghai → Long Beach" },
  { from: { x: 70, y: 145 }, to: { x: 170, y: 90 }, label: "Ho Chi Minh → Seattle" },
  { from: { x: 145, y: 165 }, to: { x: 230, y: 160 }, label: "Mumbai → Houston" },
  { from: { x: 195, y: 95 }, to: { x: 130, y: 130 }, label: "NY → Rotterdam" },
  { from: { x: 215, y: 175 }, to: { x: 90, y: 180 }, label: "Santos → Singapore" },
];

export function MarketingGlobe({ className = "" }: { className?: string }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
  }, []);
  return (
    <div className={`relative aspect-square w-full ${className}`}>
      <svg viewBox="0 0 320 320" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="globe-grad" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#1E293B" />
            <stop offset="100%" stopColor="#0F172A" />
          </radialGradient>
          <radialGradient id="atmosphere" cx="50%" cy="50%" r="55%">
            <stop offset="80%" stopColor="rgba(0,240,255,0)" />
            <stop offset="100%" stopColor="rgba(0,240,255,0.18)" />
          </radialGradient>
          <linearGradient id="arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(0,240,255,0)" />
            <stop offset="50%" stopColor="rgba(0,240,255,0.95)" />
            <stop offset="100%" stopColor="rgba(0,240,255,0)" />
          </linearGradient>
        </defs>

        {/* Atmosphere glow */}
        <circle cx="160" cy="160" r="155" fill="url(#atmosphere)" />

        {/* Globe body */}
        <circle cx="160" cy="160" r="120" fill="url(#globe-grad)" />

        {/* Lat/lng grid — rotating slowly */}
        <g
          style={
            reduced
              ? undefined
              : { transformOrigin: "160px 160px", animation: "globe-spin 60s linear infinite" }
          }
        >
          {/* Latitude lines (ellipses flattened by Y) */}
          {[20, 50, 80, 110, 140].map((r) => (
            <ellipse
              key={`lat-${r}`}
              cx="160"
              cy="160"
              rx="120"
              ry={r * 0.6}
              fill="none"
              stroke="rgba(0,240,255,0.08)"
              strokeWidth="0.6"
            />
          ))}
          {/* Longitude lines (rotated ellipses) */}
          {[0, 30, 60, 90, 120, 150].map((rot) => (
            <ellipse
              key={`lng-${rot}`}
              cx="160"
              cy="160"
              rx="40"
              ry="120"
              fill="none"
              stroke="rgba(0,240,255,0.08)"
              strokeWidth="0.6"
              transform={`rotate(${rot} 160 160)`}
            />
          ))}
        </g>

        {/* Trade lanes — animated arcs */}
        {ARCS.map((arc, i) => {
          const cx = (arc.from.x + arc.to.x) / 2;
          const cy = Math.min(arc.from.y, arc.to.y) - 40;
          const path = `M ${arc.from.x} ${arc.from.y} Q ${cx} ${cy} ${arc.to.x} ${arc.to.y}`;
          return (
            <g key={i}>
              <path d={path} stroke="rgba(0,240,255,0.3)" strokeWidth="1" fill="none" />
              <path
                d={path}
                stroke="url(#arc-grad)"
                strokeWidth="2"
                fill="none"
                style={
                  reduced
                    ? undefined
                    : {
                        strokeDasharray: "12 60",
                        animation: `arc-flow 3.${i}s ease-in-out infinite`,
                      }
                }
              />
              {/* Endpoints */}
              <circle cx={arc.from.x} cy={arc.from.y} r="2.5" fill="#00F0FF">
                {!reduced && (
                  <animate
                    attributeName="r"
                    values="2.5;5;2.5"
                    dur={`${2 + i * 0.3}s`}
                    repeatCount="indefinite"
                  />
                )}
              </circle>
              <circle cx={arc.to.x} cy={arc.to.y} r="2.5" fill="#00F0FF">
                {!reduced && (
                  <animate
                    attributeName="r"
                    values="2.5;5;2.5"
                    dur={`${2.4 + i * 0.3}s`}
                    repeatCount="indefinite"
                  />
                )}
              </circle>
            </g>
          );
        })}

        {/* Specular highlight */}
        <ellipse cx="125" cy="125" rx="40" ry="20" fill="rgba(255,255,255,0.05)" />
      </svg>

      <style jsx>{`
        @keyframes globe-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes arc-flow {
          from {
            stroke-dashoffset: 72;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}
