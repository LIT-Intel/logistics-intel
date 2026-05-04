"use client";

import { useState } from "react";

/**
 * LogoImage — robust logo renderer for the customer rail.
 *
 * Tries the supplied src (typically a logo.dev URL). If the image fails
 * to load OR no src is supplied, renders a deterministic colored
 * monogram tile built from the company name. Either path looks
 * intentional and on-brand.
 *
 * Native <img> over next/image because:
 *   1. We want the onError fallback path for failed logo.dev hits.
 *   2. The rail size is fixed and small — no optimizer benefit.
 *   3. Avoids Next/Image's strict remotePatterns enforcement during
 *      flux when keys/configs are mid-rotation.
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

function monogramFor(name: string) {
  const hash = Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0);
  const tint = TINTS[hash % TINTS.length];
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return { tint, initials };
}

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
    const { tint, initials } = monogramFor(name);
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <span
          className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[12px] font-bold text-white"
          style={{ background: tint }}
          aria-hidden
        >
          {initials}
        </span>
        <span className="font-display whitespace-nowrap text-[12.5px] font-semibold tracking-[-0.01em] text-ink-700">
          {name}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      onError={() => setErrored(true)}
      className={`block h-9 w-auto max-w-[160px] object-contain ${className}`}
      loading="lazy"
    />
  );
}
