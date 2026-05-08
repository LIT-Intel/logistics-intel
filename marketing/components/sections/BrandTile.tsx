"use client";

import { useState } from "react";
import { LitLogoMark } from "@/components/seo/LitLogoMark";

/**
 * Side-by-side brand tile for the "LIT vs Competitor" hero on
 * /vs/[slug]. Renders a 36×36 monogram tile + the brand name in one
 * pill-bordered card. For LIT we render the canonical `<LitLogoMark>`;
 * for competitors we render a colored monogram tile underneath an
 * optional logo image — if the image fails (logo.dev 401/404, network
 * block, etc.) the monogram stays visible so we never show a broken
 * box. Both tiles are sized identically so the duel reads as even.
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

export function BrandTile({
  name,
  domain,
  logoSrc,
  tone,
  display,
}: {
  name: string;
  domain?: string | null;
  /** Primary logo URL (typically logo.dev). Optional. */
  logoSrc?: string | null;
  tone: "brand" | "neutral";
  /**
   * Optional override for the visible name. Defaults to the `name`
   * passed in. For LIT we render "Logistic Intel" with the brand mark.
   */
  display?: React.ReactNode;
}) {
  if (tone === "brand") {
    return (
      <span className="inline-flex items-center gap-3 rounded-xl border border-ink-100 bg-white px-3 py-2 shadow-sm">
        <LitLogoMark size={36} alive />
        <span className="font-display text-[17px] sm:text-[19px] font-bold tracking-[-0.02em] text-ink-900">
          {display ?? (
            <>
              Logistic <span className="text-brand-blue-700">Intel</span>
            </>
          )}
        </span>
      </span>
    );
  }
  return <CompetitorTile name={name} domain={domain} logoSrc={logoSrc} display={display} />;
}

function CompetitorTile({
  name,
  domain,
  logoSrc,
  display,
}: {
  name: string;
  domain?: string | null;
  logoSrc?: string | null;
  display?: React.ReactNode;
}) {
  const [primaryFailed, setPrimaryFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const { tint, initials } = monogramFor(name);

  // Prefer logo.dev, fall back to Google favicon, monogram beneath both.
  const imageUrl = !primaryFailed && logoSrc ? logoSrc : googleFaviconUrl(domain);

  return (
    <span className="inline-flex items-center gap-3 rounded-xl border border-ink-100 bg-white px-3 py-2 shadow-sm">
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
        {/* Monogram base — always rendered, never disappears */}
        <span
          className="font-display flex h-9 w-9 items-center justify-center rounded-md text-[13px] font-bold text-white"
          style={{ background: tint }}
          aria-hidden
        >
          {initials || "?"}
        </span>
        {/* Optional logo overlay — fades in only on successful load */}
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              if (!primaryFailed && logoSrc) {
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
      <span className="font-display text-[17px] sm:text-[19px] font-bold tracking-[-0.02em] text-ink-900">
        {display ?? name}
      </span>
    </span>
  );
}
