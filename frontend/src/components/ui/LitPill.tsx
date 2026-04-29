import React from "react";
import { cn } from "@/lib/utils";

export type LitPillTone = "slate" | "blue" | "green" | "purple" | "amber" | "red";

const TONE_CLASSES: Record<LitPillTone, string> = {
  slate: "bg-slate-100 text-slate-600 border-slate-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  green: "bg-green-50 text-green-700 border-green-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
};

type LitPillProps = {
  tone?: LitPillTone;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export default function LitPill({
  tone = "slate",
  icon,
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
      {icon != null && (
        <span className="flex h-2.5 w-2.5 items-center justify-center">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}