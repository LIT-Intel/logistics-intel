"use client";

import { useState } from "react";

/**
 * Client-side <img> with an onError fallback. Extracted from LogoTile so
 * that LogoTile can remain a server component (used in static prerender
 * paths like /companies/[slug] where adding "use client" to LogoTile
 * itself triggers a Next.js prerender bug — see issue from 2026-05-18).
 */

export function LogoImage({
  primarySrc,
  fallbackSrc,
  alt,
  px,
  name,
}: {
  primarySrc: string;
  fallbackSrc: string;
  alt: string;
  px: number;
  name: string;
}) {
  const [src, setSrc] = useState(primarySrc);
  const [usedFallback, setUsedFallback] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const initials = name
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "·";

  return (
    <span className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <span
        aria-hidden
        className="font-display absolute inset-[10%] flex items-center justify-center rounded-[inherit] bg-gradient-to-br from-blue-600 to-cyan-500 text-[0.72rem] font-bold text-white"
      >
        {initials}
      </span>
      {/* Do not suppress the referrer. Logo.dev publishable keys can be
          restricted to approved domains and need the browser's origin. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        className={`absolute h-[80%] w-[80%] bg-white object-contain transition-opacity duration-200 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false);
          if (!usedFallback && primarySrc !== fallbackSrc) {
            setUsedFallback(true);
            setSrc(fallbackSrc);
          }
        }}
      />
    </span>
  );
}
