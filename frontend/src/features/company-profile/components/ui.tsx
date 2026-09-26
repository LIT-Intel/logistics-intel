/**
 * Shared primitives for the Company Profile v2 surfaces.
 * Tokens per handoff README §12 — exact hexes, Space Grotesk / DM Sans /
 * JetBrains Mono, card radius 14, shadow 0 8px 30px rgba(15,23,42,0.06).
 */
import React from "react";

export const FONT_DISPLAY = "'Space Grotesk', sans-serif";
export const FONT_BODY = "'DM Sans', system-ui, sans-serif";
export const FONT_MONO = "'JetBrains Mono', monospace";

export const CARD_SHADOW = "0 8px 30px rgba(15,23,42,0.06)";
export const CARD_SHADOW_HOVER = "0 12px 32px rgba(15,23,42,0.10)";
export const EASE_OUT = "cubic-bezier(0.16,1,0.3,1)";

export function Card({
  children,
  className = "",
  style,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  return (
    <section
      onClick={onClick}
      className={"rounded-[14px] border border-[#E5E7EB] bg-white " + className}
      style={{ boxShadow: CARD_SHADOW, ...style }}
    >
      {children}
    </section>
  );
}

/** 11px uppercase Space Grotesk section overline. */
export function Overline({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={"text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b] " + className}
      style={{ fontFamily: FONT_DISPLAY }}
    >
      {children}
    </div>
  );
}

/** Amber "Modeled" provenance pill (README rule: modeled values are labeled). */
export function ModeledPill({ label = "Modeled" }: { label?: string }) {
  return (
    <span
      className="rounded-full px-2 py-[2px] text-[10px] font-semibold text-[#b45309]"
      style={{ background: "rgba(245,158,11,0.12)", fontFamily: FONT_BODY }}
      title="Derived from a documented model, not a source value"
    >
      {label}
    </span>
  );
}

/** Delta pill — colors precomputed by the selectors (deltaFg/deltaBg). */
export function DeltaPill({
  delta,
  fg,
  bg,
  className = "",
}: {
  delta: string;
  fg: string;
  bg: string;
  className?: string;
}) {
  if (!delta) return null;
  return (
    <span
      className={"inline-flex items-center gap-[3px] rounded-full px-[7px] py-[2px] text-[11px] font-semibold " + className}
      style={{ color: fg, background: bg, fontFamily: FONT_MONO }}
    >
      {delta}
    </span>
  );
}

/** 28px sparkline path (viewBox 0 0 100 28), stroke given by caller. */
export function Spark({
  d,
  stroke = "#3b82f6",
  height = 28,
  width = "100%",
  strokeWidth = 1.6,
}: {
  d: string;
  stroke?: string;
  height?: number;
  width?: string;
  strokeWidth?: number;
}) {
  if (!d) return null;
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" style={{ width, height, display: "block", overflow: "visible" }}>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 4px horizontal share bar with scaleX grow-in. */
export function ShareBar({ color, s, className = "" }: { color: string; s: number; className?: string }) {
  return (
    <div className={"h-1 overflow-hidden rounded-full bg-[#EEF2F6] " + className}>
      <div
        className="h-full rounded-full motion-reduce:!transition-none"
        style={{
          background: color,
          transform: `scaleX(${s})`,
          transformOrigin: "left",
          transition: `transform 500ms ${EASE_OUT}`,
        }}
      />
    </div>
  );
}

export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = React.useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  React.useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const fn = () => setReduced(mq.matches);
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);
  return reduced;
};
