import React from "react";
import { ArrowRight } from "lucide-react";
import LitFlag from "./LitFlag";
import { cn } from "@/lib/utils";

type LitLaneProps = {
  fromCode?: string | null;
  fromLabel: string;
  toCode?: string | null;
  toLabel: string;
  fromEmoji?: string | null;
  toEmoji?: string | null;
  /** When true, country labels render in JetBrains Mono. Defaults to true. */
  mono?: boolean;
  flagSize?: number;
  className?: string;
  highlight?: boolean;
};

export default function LitLane({
  fromCode,
  fromLabel,
  toCode,
  toLabel,
  fromEmoji,
  toEmoji,
  mono = true,
  flagSize = 13,
  className,
  highlight,
}: LitLaneProps) {
  const labelClass = cn(
    "text-[11.5px] font-semibold",
    mono && "font-mono",
    highlight ? "text-blue-700" : "text-slate-700",
  );
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap",
        className,
      )}
    >
      <LitFlag code={fromCode} emoji={fromEmoji} size={flagSize} label={fromLabel} />
      <span className={labelClass}>{fromLabel}</span>
      <ArrowRight aria-hidden className="h-2.5 w-2.5 text-slate-300" />
      <LitFlag code={toCode} emoji={toEmoji} size={flagSize} label={toLabel} />
      <span className={labelClass}>{toLabel}</span>
    </span>
  );
}