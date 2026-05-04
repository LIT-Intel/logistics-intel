"use client";

import { useState } from "react";

/**
 * LogoImage — guaranteed-render logo cell.
 *
 * Strategy: render the monogram tile + company name AT ALL TIMES as
 * the visible base layer. Optionally fetch a logo image (logo.dev or
 * Google favicon). If the image loads successfully, fade it in over
 * the monogram. If it fails or never loads, the monogram stays
 * visible and nothing else needs to happen.
 *
 * This means the rail ALWAYS shows something readable, even if:
 *   - logo.dev key is unset / wrong
 *   - logo.dev returns 401/404 for the domain
 *   - Network blocks the request
 *   - Hydration is mid-flight
 *
 * Native <img> over next/image because we need the onLoad/onError
 * lifecycle and the file size is small enough that optimization is
 * not worth the strict-mode constraints.
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

function googleFaviconUrl(domain?: string | null, size = 128) {
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
  /** Primary logo URL (typically logo.dev). Optional. */
  src?: string | null;
  /** Domain for the Google favicon fallback if src fails or is null. */
  domain?: string | null;
  name: string;
  className?: string;
}) {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const { tint, initials } = monogramFor(name);

  // Prefer logo.dev URL if supplied, fall back to favicon if it errors
  const imageUrl = !primaryFailed && src ? src : googleFaviconUrl(domain);

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
        {/* Monogram base — always rendered */}
        <span
          className="font-display flex h-9 w-9 items-center justify-center rounded-md text-[12px] font-bold text-white"
          style={{ background: tint }}
          aria-hidden
        >
          {initials}
        </span>
        {/* Optional logo overlay — fades in only after successful load */}
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              if (!primaryFailed && src) {
                setPrimaryFailed(true);
                setImageLoaded(false);
              }
            }}
            className={`absolute inset-0 h-9 w-9 rounded-md bg-white object-contain p-0.5 transition-opacity duration-200 ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            style={{
              boxShadow: imageLoaded ? "inset 0 0 0 1px rgba(15,23,42,0.06)" : undefined,
            }}
          />
        )}
      </span>
      <span className="font-display whitespace-nowrap text-[12.5px] font-semibold tracking-[-0.01em] text-ink-700">
        {name}
      </span>
    </span>
  );
}
