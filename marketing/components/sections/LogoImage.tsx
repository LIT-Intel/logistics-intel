"use client";

import { useState } from "react";

/**
 * LogoImage — bulletproof logo renderer with 3-tier fallback.
 *
 *   1. logo.dev URL (best quality, requires NEXT_PUBLIC_LOGO_DEV_KEY)
 *   2. Google favicon API (no key, lower quality, always works)
 *   3. Colored monogram tile (always renders)
 *
 * Each tier upgrades on the previous tier's onError. The rail will
 * always show *something* for every domain, even if logo.dev is
 * unreachable or the key is missing.
 *
 * Native <img> over next/image because:
 *   - We need onError fallback chains
 *   - Logo size is fixed and small (no optimizer benefit)
 *   - Avoids Next/Image strict remotePatterns when keys are mid-rotation
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

function googleFaviconUrl(domain?: string | null, size = 64) {
  if (!domain) return null;
  const clean = domain.replace(/^https?:\/\//, "").replace(/\/.*/, "").trim();
  if (!clean) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(clean)}&sz=${size}`;
}

export function LogoImage({
  src,
  domain,
  name,
  className = "",
}: {
  /** Primary URL (typically logo.dev). Falls through to Google favicon → monogram on error. */
  src?: string | null;
  /** Domain for the Google favicon fallback. Falls through to monogram if missing. */
  domain?: string | null;
  name: string;
  className?: string;
}) {
  // Tier counter: 0 = primary, 1 = google favicon, 2 = monogram
  const [tier, setTier] = useState<0 | 1 | 2>(src ? 0 : domain ? 1 : 2);

  // If primary fails, advance to favicon. If favicon fails, advance to monogram.
  const handleError = () => {
    if (tier === 0) setTier(domain ? 1 : 2);
    else if (tier === 1) setTier(2);
  };

  if (tier === 2) {
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

  const url = tier === 0 ? src : googleFaviconUrl(domain, 128);
  if (!url) {
    // Defensive: if URL ended up null, jump to monogram on the next tick.
    setTimeout(() => setTier(2), 0);
    return null;
  }

  // Tier 1 (Google favicon) renders as monogram-style — small icon + name —
  // because favicons are typically tiny and look weird stretched.
  if (tier === 1) {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          onError={handleError}
          className="h-7 w-7 shrink-0 rounded-md border border-ink-100 bg-white object-contain p-1"
          loading="lazy"
        />
        <span className="font-display whitespace-nowrap text-[12.5px] font-semibold tracking-[-0.01em] text-ink-700">
          {name}
        </span>
      </div>
    );
  }

  // Tier 0 (logo.dev) — full logo image, no name (just the brand mark)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      onError={handleError}
      className={`block h-9 w-auto max-w-[160px] object-contain ${className}`}
      loading="lazy"
    />
  );
}
