import React from "react";
import { cn } from "@/lib/utils";
import LitCategoryChip from "./LitCategoryChip";

/**
 * App-side port of marketing/components/sections/ArticleHeader.
 *
 * Editorial header pattern — bracketed `[category]` chip, large
 * Space-Grotesk H1, optional lede paragraph, and a single byline row
 * for metadata. Used in the app for Company Profile headers and
 * Supplier Profile headers (the editorial "this company is the
 * subject of this article" framing the marketing blog already uses).
 *
 * Differences from the marketing original:
 *  - Replaces `next/image` author avatar with a slot-based `byline`
 *    so the app can pass any React node (logo / flag / initials).
 *  - Replaces the `Post` data shape with a flat prop API — caller
 *    composes title / lede / category / byline directly.
 *  - Adapts marketing's `text-ink-*` tokens to `text-slate-*`.
 */

export type LitArticleHeaderProps = {
  /** Bracketed category mark above the title (e.g. "Receiver", "Supplier"). */
  category?: { label: string; color?: string };
  /** The H1 itself. Pass a string; we apply the editorial styling. */
  title: string;
  /** Optional lede paragraph below the title. */
  lede?: string;
  /** Slot for the byline row — flags + company metadata + dates. */
  byline?: React.ReactNode;
  /** Optional action slot pinned to the top-right (e.g. Star + Add to List). */
  actions?: React.ReactNode;
  className?: string;
  /** Override max content width. Defaults to 880px (matches marketing). */
  maxWidth?: number;
};

export default function LitArticleHeader({
  category,
  title,
  lede,
  byline,
  actions,
  className,
  maxWidth = 880,
}: LitArticleHeaderProps) {
  return (
    <header className={cn("px-5 pt-4 pb-6 sm:px-8 sm:pt-6 sm:pb-8", className)}>
      <div className="mx-auto" style={{ maxWidth }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {category?.label && (
              <div>
                <LitCategoryChip
                  label={category.label}
                  color={category.color || "#3B82F6"}
                />
              </div>
            )}
            <h1
              className="font-display mt-4 font-semibold leading-[1.05] tracking-[-0.02em] text-slate-900"
              style={{ fontSize: "clamp(28px, 4vw, 44px)" }}
            >
              {title}
            </h1>
            {lede && (
              <p className="font-body mt-4 max-w-[680px] text-[15.5px] leading-relaxed text-slate-500">
                {lede}
              </p>
            )}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
        {byline && (
          <div className="font-body mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-slate-500">
            {byline}
          </div>
        )}
      </div>
    </header>
  );
}
