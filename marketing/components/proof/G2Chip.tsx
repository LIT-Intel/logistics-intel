import type { ReactNode } from "react";

type G2ChipProps = {
  /** Numeric rating, e.g. 4.8. Rendered as `rating.toFixed(1)`. */
  rating: number;
  /** Optional review count. Omit when we don't have a verified number —
   *  honesty beats specificity. */
  reviewCount?: number;
  /** Secondary line beneath the rating row. Defaults to "G2 Verified". */
  category?: string;
  /** Surface tint. `dark` is the chip used on dark hero backgrounds;
   *  `light` is the chip used on white/off-white surfaces. */
  variant?: "light" | "dark";
  className?: string;
};

/**
 * G2-style proof chip. Inline pill with a small G2 wordmark, a single
 * star icon, the rating, and an optional review count + category line.
 *
 * Design intent: this is the HERO trust signal. Replaces the looser
 * "4.8★ · G2 · SOC2 · GDPR · CCPA" trust row by lifting the G2 rating
 * to a discrete enterprise-trust artifact. Compliance badges render
 * separately as secondary trust.
 *
 * Honesty constraint: never default a fabricated reviewCount. If the
 * caller doesn't pass `reviewCount`, the chip renders rating-only.
 */
export function G2Chip({
  rating,
  reviewCount,
  category = "G2 Verified",
  variant = "light",
  className,
}: G2ChipProps) {
  const isDark = variant === "dark";

  return (
    <div
      className={[
        "inline-flex items-center gap-2.5 h-10 px-3.5 rounded-full backdrop-blur",
        isDark
          ? "bg-white/95 border border-white/15 shadow-[0_4px_12px_rgba(2,6,23,0.35)]"
          : "bg-white border border-ink-100 shadow-sm",
        className || "",
      ].join(" ")}
      aria-label={`Rated ${rating.toFixed(1)} out of 5 on G2`}
      role="img"
    >
      {/* G2 wordmark — text-based stylized brand block. We don't load
       *  the actual G2 logo image here; brand approval for image use
       *  is a separate workstream. */}
      <span
        aria-hidden
        className="inline-flex items-center justify-center rounded bg-[#FF492C] px-1.5 py-0.5 font-bold text-[11px] leading-none text-white tracking-tight"
      >
        G2
      </span>

      {/* Single filled star — represents the rating visually without
       *  faking a 5-of-5 readout. */}
      <StarIcon />

      {/* Rating + optional review count + category line. The category
       *  line is intentionally small and uppercase so it reads as
       *  metadata, not as a claim. */}
      <div className="flex min-w-0 flex-col leading-tight">
        <div className="flex items-baseline gap-1.5">
          <span className="text-ink-900 font-semibold text-[14px] leading-none">
            {rating.toFixed(1)}
          </span>
          {typeof reviewCount === "number" && reviewCount > 0 ? (
            <span className="text-ink-500 text-[12.5px] leading-none">
              ({reviewCount.toLocaleString()} reviews)
            </span>
          ) : null}
        </div>
        {category ? (
          <span className="text-ink-500 text-[11px] uppercase tracking-[0.06em] mt-0.5 leading-none">
            {category}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StarIcon(): ReactNode {
  return (
    <svg
      aria-hidden
      viewBox="0 0 14 14"
      width={14}
      height={14}
      className="flex-shrink-0"
    >
      <path
        d="M7 .8l1.91 3.87 4.27.62-3.09 3.01.73 4.25L7 10.54l-3.82 2.01.73-4.25L.82 5.29l4.27-.62L7 .8z"
        fill="#FFB400"
      />
    </svg>
  );
}
