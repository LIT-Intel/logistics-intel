"use client";

import { useState } from "react";

/**
 * Compact 36×36 brand tile for customer-story cards. Always renders a
 * tinted monogram with the customer's initial as the base layer, then
 * fades in the logo image (logo.dev or Google favicon) only on
 * successful load. If the image fails — auth-blocked logo.dev key, 404
 * favicon, network error — the monogram stays visible. No broken
 * image, no empty box. Same pattern as BrandTile / LogoImage but
 * focused for the small inline cards.
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

function tintFor(name: string) {
  const hash = Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0);
  return TINTS[hash % TINTS.length];
}

function googleFavicon(domain?: string | null, size = 64) {
  if (!domain) return null;
  const clean = domain.replace(/^https?:\/\//, "").replace(/\/.*/, "").trim();
  if (!clean) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(clean)}&sz=${size}`;
}

export function CustomerLogoTile({
  name,
  src,
  domain,
}: {
  name: string;
  src?: string | null;
  domain?: string | null;
}) {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const tint = tintFor(name);
  const initial = (name?.[0] || "?").toUpperCase();
  const imageUrl = !primaryFailed && src ? src : googleFavicon(domain);

  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-100 bg-white">
      {/* Always-visible monogram base */}
      <span
        className="font-display absolute inset-0 flex h-full w-full items-center justify-center text-[13px] font-bold text-white"
        style={{ background: tint }}
        aria-hidden
      >
        {initial}
      </span>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (!primaryFailed && src) {
              setPrimaryFailed(true);
              setLoaded(false);
            }
          }}
          className={`absolute inset-0 h-9 w-9 rounded-md bg-white object-contain p-0.5 transition-opacity duration-200 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          style={{ boxShadow: loaded ? "inset 0 0 0 1px rgba(15,23,42,0.06)" : undefined }}
        />
      )}
    </span>
  );
}
