import React from "react";
import { cn } from "@/lib/utils";

// `violet` is an alias for `purple` so the SBadge / Settings tones map
// cleanly onto the shared pill without consumers needing to translate.
export type LitPillTone =
  | "slate"
  | "blue"
  | "green"
  | "purple"
  | "violet"
  | "amber"
  | "red"
  | "cyan";

const TONE_CLASSES: Record<LitPillTone, string> = {
  slate: "bg-slate-100 text-slate-600 border-slate-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  green: "bg-green-50 text-green-700 border-green-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  cyan: "bg-cyan-50 text-cyan-700 border-cyan-200",
};

const DOT_CLASSES: Record<LitPillTone, string> = {
  slate: "bg-slate-400",
  blue: "bg-blue-500",
  green: "bg-green-500",
  purple: "bg-purple-500",
  violet: "bg-violet-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  cyan: "bg-cyan-500",
};

type LitPillProps = {
  tone?: LitPillTone;
  icon?: React.ReactNode;
  /** Render a small colored dot before the label. Useful for status pills
   *  (Active / Pending / Past due) where the dot signals state at a glance. */
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
};

export default function LitPill({
  tone = "slate",
  icon,
  dot,
  className,
  children,
}: LitPillProps) {
  return (
    <span
      className={cn(
        "font-display inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
            DOT_CLASSES[tone],
          )}
        />
      )}
      {icon != null && (
        <span className="flex h-2.5 w-2.5 items-center justify-center">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}