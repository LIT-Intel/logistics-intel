import React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import LitCategoryChip from "./LitCategoryChip";

/**
 * App-side port of marketing/components/sections/FeaturedPostHero.
 *
 * Split-layout hero — content on the left (bracketed `[category]` chip,
 * Space-Grotesk H1, two-line excerpt, byline row), media on the right
 * (3:2 image OR a custom React slot like the Globe / KPI strip).
 *
 * Used in the app as the Dashboard "What matters now" hero — instead
 * of repeating the marketing blog's image-on-right + text-on-left,
 * the Dashboard passes the GlobeCanvas / a key chart into the `media`
 * slot so the workspace's primary surface gets the same editorial
 * framing as the marketing blog's featured post.
 *
 * Differences from the marketing original:
 *  - `media` accepts any React node (not just a Sanity image)
 *  - Optional `to` makes the whole card a link; omitting it keeps the
 *    hero static (useful when the media slot is interactive itself).
 *  - Adapts marketing's `text-ink-*` tokens to `text-slate-*`.
 */

export type LitFeaturedHeroProps = {
  category?: { label: string; color?: string };
  title: string;
  excerpt?: string;
  byline?: React.ReactNode;
  /** Right column. Pass an <img>, a Globe, a KPI strip, anything. */
  media: React.ReactNode;
  /** Whole card becomes a link when provided. */
  to?: string;
  /** Reverse the column order on desktop (content right, media left). */
  reversed?: boolean;
  className?: string;
};

export default function LitFeaturedHero({
  category,
  title,
  excerpt,
  byline,
  media,
  to,
  reversed = false,
  className,
}: LitFeaturedHeroProps) {
  const wrapperClass = cn(
    "group block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all",
    to && "hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_5px_15px_rgba(37,99,235,0.12)]",
    className,
  );

  const inner = (
    <div
      className={cn(
        "grid grid-cols-1 lg:gap-0",
        reversed ? "lg:grid-cols-[0.9fr_1.1fr]" : "lg:grid-cols-[1.1fr_0.9fr]",
      )}
    >
      <div
        className={cn(
          "order-2 flex flex-col justify-center gap-5 p-7 sm:p-10 lg:p-12",
          reversed ? "lg:order-2" : "lg:order-1",
        )}
      >
        {category?.label && (
          <div>
            <LitCategoryChip
              label={category.label}
              color={category.color || "#3B82F6"}
            />
          </div>
        )}
        <h1
          className={cn(
            "font-display font-semibold leading-[1.05] tracking-[-0.02em] text-slate-900",
            to && "group-hover:text-blue-700",
          )}
          style={{ fontSize: "clamp(28px, 4vw, 44px)" }}
        >
          {title}
        </h1>
        {excerpt && (
          <p className="font-body max-w-[560px] text-[15.5px] leading-relaxed text-slate-500">
            {excerpt}
          </p>
        )}
        {byline && (
          <div className="font-body flex items-center gap-3 text-[13px] text-slate-500">
            {byline}
          </div>
        )}
      </div>

      <div className={cn("order-1", reversed ? "lg:order-1" : "lg:order-2")}>
        <div className="relative aspect-[3/2] w-full bg-slate-50">{media}</div>
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className={wrapperClass}>
        {inner}
      </Link>
    );
  }
  return <div className={wrapperClass}>{inner}</div>;
}
