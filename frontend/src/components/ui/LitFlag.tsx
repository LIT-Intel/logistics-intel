import React, { useState } from "react";
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

const FALLBACK_GLYPH = "🏳️";

/**
 * Renders a country flag as an SVG image (via flagcdn.com) so the
 * glyph displays consistently on Windows browsers, where regional-
 * indicator emoji fall back to plain text like "CN" / "US". An
 * emoji <span> stays as the rendering surface only when no ISO code
 * is available — at that point we have nothing better to draw.
 *
 * The img cascade:
 *   1. flagcdn.com SVG sized to ~2x dpi
 *   2. on error → emoji fallback
 *   3. on emoji-text fallback → an empty pill so layout stays clean
 */
export default function LitFlag({
  code,
  emoji,
  size = 14,
  label,
  className,
}: LitFlagProps) {
  const iso = (code || "").trim().toLowerCase();
  const aria = label ?? (code ? code.toUpperCase() : "flag");
  const [imgFailed, setImgFailed] = useState(false);

  // Image render path — preferred. flagcdn returns 4:3 SVG. Width
  // controls visual size; height auto-derives. We pin to a fixed
  // height so flags align horizontally with sibling text.
  if (iso.length === 2 && !imgFailed) {
    // 2x retina: request a slightly larger asset and downscale.
    const widthPx = Math.round(size * 1.4); // ~4:3 ratio for retina-ish look
    const src = `https://flagcdn.com/${iso}.svg`;
    return (
      <img
        src={src}
        alt={aria}
        loading="lazy"
        decoding="async"
        onError={() => setImgFailed(true)}
        className={cn(
          "inline-block shrink-0 rounded-[2px] object-cover align-middle",
          className,
        )}
        style={{
          width: widthPx,
          height: size,
          // hairline border so light flags (Japan, Argentina) don't
          // visually merge into a white surface
          boxShadow: "inset 0 0 0 0.5px rgba(15,23,42,0.12)",
        }}
      />
    );
  }

  // Emoji fallback for codes we don't have, or when the SVG fails.
  // On Windows this still renders as letters, but the box-shadow
  // pill keeps the row alignment intact.
  const resolved = emoji && emoji.length > 0 ? emoji : flagFromCode(code);
  const glyph =
    resolved && resolved.length > 0 && resolved !== ""
      ? resolved
      : FALLBACK_GLYPH;

  return (
    <span
      role="img"
      aria-label={aria}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[2px] align-middle",
        className,
      )}
      style={{
        width: Math.round(size * 1.4),
        height: size,
        fontSize: size - 2,
        background: "rgba(15,23,42,0.04)",
        boxShadow: "inset 0 0 0 0.5px rgba(15,23,42,0.12)",
        lineHeight: 1,
      }}
    >
      {glyph}
    </span>
  );
}
