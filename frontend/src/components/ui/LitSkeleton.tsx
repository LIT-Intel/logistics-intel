import React from "react";
import { cn } from "@/lib/utils";

/**
 * Skeleton primitives — shimmer placeholders matching the final layout so
 * the user sees the SHAPE of what's loading, not a generic spinner that
 * triggers a layout shift when data arrives.
 *
 * Three pieces:
 *  - LitSkeletonBlock — base shimmering rectangle (used by every other piece)
 *  - LitSkeletonRow   — row-shaped placeholder for table/list loading states
 *  - LitSkeletonCard  — card-shaped placeholder for grid loading states
 *
 * Animation is a CSS keyframe shimmer driven by a moving gradient, gated by
 * `prefers-reduced-motion: reduce` (the animation disables to a static
 * slate-100 fill — still legible as a placeholder, no vestibular load).
 *
 * The shimmer keyframe lives in this file via a single <style> tag because
 * we don't have a global CSS file for app components (Tailwind handles the
 * rest). One inline style, one keyframe — zero new files to wire up.
 */

const SHIMMER_STYLE_ID = "lit-skeleton-shimmer-keyframes";

function ensureShimmerStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(SHIMMER_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SHIMMER_STYLE_ID;
  style.textContent = `
@keyframes lit-skeleton-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.lit-skeleton-shimmer {
  background: linear-gradient(
    90deg,
    rgb(241, 245, 249) 0%,
    rgb(248, 250, 252) 50%,
    rgb(241, 245, 249) 100%
  );
  background-size: 200% 100%;
  animation: lit-skeleton-shimmer 1.6s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .lit-skeleton-shimmer {
    animation: none;
    background: rgb(241, 245, 249);
  }
}
`;
  document.head.appendChild(style);
}

export type LitSkeletonBlockProps = {
  width?: number | string;
  height?: number | string;
  rounded?: "sm" | "md" | "lg" | "full";
  className?: string;
};

export function LitSkeletonBlock({
  width = "100%",
  height = 12,
  rounded = "md",
  className,
}: LitSkeletonBlockProps) {
  ensureShimmerStyle();
  const radius =
    rounded === "full"
      ? "rounded-full"
      : rounded === "lg"
        ? "rounded-lg"
        : rounded === "md"
          ? "rounded-md"
          : "rounded-sm";
  return (
    <span
      aria-hidden
      className={cn("lit-skeleton-shimmer inline-block", radius, className)}
      style={{ width, height }}
    />
  );
}

/**
 * Row shape for tables / lists. Renders:
 *   [avatar circle] [title 60%] [subtitle 35%]    [meta block 80px]
 *
 * Width tokens are tuned to match the real Contacts/Lists/Inbox rows
 * so the layout doesn't jump when real data arrives.
 */
export type LitSkeletonRowProps = {
  /** Render N rows back to back. Defaults to 1. */
  count?: number;
  /** Hide the leading avatar circle when the real row has no avatar. */
  noAvatar?: boolean;
  /** Hide the trailing meta block when the real row has no right-rail value. */
  noMeta?: boolean;
  className?: string;
};

export function LitSkeletonRow({
  count = 1,
  noAvatar,
  noMeta,
  className,
}: LitSkeletonRowProps) {
  ensureShimmerStyle();
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0",
            className,
          )}
        >
          {!noAvatar && (
            <LitSkeletonBlock width={32} height={32} rounded="full" />
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <LitSkeletonBlock width="60%" height={11} />
            <LitSkeletonBlock width="35%" height={9} />
          </div>
          {!noMeta && <LitSkeletonBlock width={80} height={12} />}
        </div>
      ))}
    </>
  );
}

/**
 * Card shape for grids. Renders a header chip + title + 2-line body +
 * footer meta. Width tokens tuned for the Lists / Saved Companies
 * grid card sizes (~280-340px wide).
 */
export type LitSkeletonCardProps = {
  /** Render N cards. Defaults to 1. */
  count?: number;
  className?: string;
};

export function LitSkeletonCard({ count = 1, className }: LitSkeletonCardProps) {
  ensureShimmerStyle();
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-xl border border-slate-200 bg-white p-4",
            className,
          )}
        >
          <div className="mb-3 flex items-center gap-2">
            <LitSkeletonBlock width={32} height={32} rounded="md" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <LitSkeletonBlock width="70%" height={11} />
              <LitSkeletonBlock width="40%" height={9} />
            </div>
          </div>
          <div className="space-y-1.5">
            <LitSkeletonBlock width="100%" height={9} />
            <LitSkeletonBlock width="85%" height={9} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <LitSkeletonBlock width={60} height={9} />
            <LitSkeletonBlock width={40} height={9} />
          </div>
        </div>
      ))}
    </>
  );
}
