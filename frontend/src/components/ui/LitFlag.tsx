import React from "react";
import { flagFromCode } from "@/lib/laneGlobe";
import { cn } from "@/lib/utils";

type LitFlagProps = {
  /** ISO-3166 alpha-2 code (preferred). Case-insensitive. */
  code?: string | null;
  /** Optional emoji glyph already resolved upstream. Wins over `code`. */
  emoji?: string | null;
  /** Pixel size of the flag glyph. Defaults to 14. */
  size?: number;
  /** Accessible label override. Falls back to the code. */
  label?: string;
  className?: string;
};

const FALLBACK_GLYPH = "🏳️"; // White flag fallback

export default function LitFlag({
  code,
  emoji,
  size = 14,
  label,
  className,
}: LitFlagProps) {
  const resolved = emoji && emoji.length > 0 ? emoji : flagFromCode(code);
  const glyph =
    resolved && resolved.length > 0 && resolved !== "" ? resolved : FALLBACK_GLYPH;
  const aria = label ?? (code ? code.toUpperCase() : "flag");
  return (
    <span
      role="img"
      aria-label={aria}
      className={cn("inline-block leading-none", className)}
      style={{ fontSize: size }}
    >
      {glyph}
    </span>
  );
}