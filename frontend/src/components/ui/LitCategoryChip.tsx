import React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * App-side port of marketing/components/sections/CategoryChip.
 *
 * Bracketed `[label]` editorial chip — the marketing blog's most
 * distinctive visual primitive. Used in the app as filter chips on
 * Search + Pulse, and as the category mark on Company Profile +
 * Supplier Profile headers.
 *
 * Three variants:
 *  - `chip` (default) — solid filled tag for hero / card overlay use
 *  - `filter`         — interactive button shape for the filter row
 *  - `card-overlay`   — solid filled tag positioned over an image
 *
 * Differences from the marketing original:
 *  - Uses `react-router-dom` Link instead of `next/link`
 *  - Adapts marketing's `text-ink-*` tokens to the app's `slate-*`
 *  - Default color is the app's brand blue (#3B82F6 / blue-500)
 */

const LIT_BLUE = "#3B82F6";

type Variant = "chip" | "filter" | "card-overlay";

export type LitCategoryChipProps = {
  label: string;
  href?: string;
  variant?: Variant;
  color?: string;
  active?: boolean;
  onClick?: () => void;
  count?: number;
  ariaPressed?: boolean;
  className?: string;
};

export default function LitCategoryChip({
  label,
  href,
  variant = "chip",
  color = LIT_BLUE,
  active = false,
  onClick,
  count,
  ariaPressed,
  className,
}: LitCategoryChipProps) {
  const base =
    "font-mono inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase leading-none tracking-[0.06em] transition";
  const radius = "rounded-[4px]";

  if (variant === "chip" || variant === "card-overlay") {
    const overlayExtra =
      variant === "card-overlay" ? "shadow-[0_2px_6px_rgba(0,0,0,0.25)]" : "";
    const inner = (
      <span
        className={cn(base, radius, overlayExtra, className)}
        style={{ background: color, color: "#fff" }}
      >
        [{label}]
      </span>
    );
    if (href) {
      return (
        <Link to={href} className="inline-flex">
          {inner}
        </Link>
      );
    }
    return inner;
  }

  // Filter button variant — active fills with color, inactive is ghost.
  const filterActive =
    "border-transparent text-white shadow-[0_3px_10px_rgba(15,23,42,0.18)]";
  const filterInactive =
    "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";
  const cls = cn(
    base,
    radius,
    "h-8 border",
    active ? filterActive : filterInactive,
    className,
  );
  const style = active ? { background: color } : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ariaPressed ?? active}
      className={cls}
      style={style}
    >
      <span>[{label}]</span>
      {typeof count === "number" && (
        <span
          className={cn(
            "font-mono ml-1 rounded-[3px] px-1 text-[9.5px] font-bold leading-none",
            active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
