import React from "react";
import { cn } from "@/lib/utils";

export type LitKpiCell = {
  label: string;
  /** Headline value. Render `"—"` (em dash) when no real number is available — never fabricate. */
  value: React.ReactNode;
  /** Optional trend or context tail (e.g. "+12%", "1 launching"). */
  trend?: React.ReactNode;
  /**
   * Trend direction:
   *   - true  → green w/ up arrow
   *   - false → red w/ down arrow
   *   - null/undefined → neutral grey, no arrow
   */
  up?: boolean | null;
  /** Optional href; when set, the cell becomes a clickable anchor. */
  href?: string;
};

type LitKpiStripProps = {
  cells: LitKpiCell[];
  /** When true, strip uses #FAFBFC subtle surface; when false, transparent. Defaults to true. */
  surface?: boolean;
  /** When true, top border is rendered (for use under a header row). Defaults to true. */
  topBorder?: boolean;
  className?: string;
};

const TREND_COLOR: Record<"up" | "down" | "flat", string> = {
  up: "text-green-700",
  down: "text-red-700",
  flat: "text-slate-400",
};

const TREND_ARROW: Record<"up" | "down" | "flat", string> = {
  up: "↑ ",
  down: "↓ ",
  flat: "",
};

export default function LitKpiStrip({
  cells,
  surface = true,
  topBorder = true,
  className,
}: LitKpiStripProps) {
  return (
    <div
      className={cn(
        "grid",
        surface && "bg-[#FAFBFC]",
        topBorder && "border-t border-slate-100",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
    >
      {cells.map((cell, i) => {
        const dir: "up" | "down" | "flat" =
          cell.up === true ? "up" : cell.up === false ? "down" : "flat";
        const arrow = TREND_ARROW[dir];
        const trendColor = TREND_COLOR[dir];
        const isLast = i === cells.length - 1;
        const wrapperClass = cn(
          "px-4 py-2.5",
          !isLast && "border-r border-slate-100",
        );
        const inner = (
          <>
            <div className="font-display truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              {cell.label}
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-mono whitespace-nowrap text-base font-bold tracking-tight text-slate-900">
                {cell.value}
              </span>
              {cell.trend != null && cell.trend !== "" && (
                <span
                  className={cn(
                    "font-display whitespace-nowrap text-[10px] font-semibold",
                    trendColor,
                  )}
                >
                  {arrow}
                  {cell.trend}
                </span>
              )}
            </div>
          </>
        );
        if (cell.href) {
          return (
            <a
              key={`${cell.label}-${i}`}
              href={cell.href}
              className={cn(wrapperClass, "block hover:bg-white/60")}
            >
              {inner}
            </a>
          );
        }
        return (
          <div key={`${cell.label}-${i}`} className={wrapperClass}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}