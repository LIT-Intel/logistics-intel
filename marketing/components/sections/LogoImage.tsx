"use client";

import { useState } from "react";

/**
 * LogoImage — robust image renderer for the customer logos rail.
 *
 * Tries `src` (typically a logo.dev URL). If the image fails to load
 * OR no src is supplied, renders a deterministic colored monogram tile
 * built from the company name. Looks intentional either way.
 *
 * Uses native <img> rather than next/image because the rail looks fine
 * unoptimized at 28px height and we want the onError event for fallback.
 */
const TINTS = [
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#8b5cf6",
  "#f59e0b",
  "#ec4899",
  "#0ea5e9",
  "#a855f7",
];

export function LogoImage({
  src,
  name,
  className = "",
}: {
  src?: string | null;
  name: string;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    const hash = Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0);
    const tint = TINTS[hash % TINTS.length];
    const initials = name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
    return (
      <div className={`flex items-center gap-2.5 ${className}`}>
        <div
          className="font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
          style={{ background: tint }}
        >
          {initials}
        </div>
        <div className="font-display whitespace-nowrap text-[12.5px] font-semibold tracking-[-0.01em] text-ink-700">
          {name}
        </div>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      onError={() => setErrored(true)}
      className={`h-7 w-auto max-w-[128px] object-contain ${className}`}
    />
  );
}
