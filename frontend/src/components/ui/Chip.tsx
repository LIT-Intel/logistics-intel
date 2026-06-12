// Chip — semantic status pill primitive.
//
// Source of truth for hand-rolled chip styles that previously drifted across
// CampaignBuilder, the schedule strip, and the campaign meta strips. Per
// CLAUDE.md, dashboard visual language is the source of truth — every new
// surface-level status/badge in the app should use this primitive rather
// than spinning a new `rounded-full ...` className.
//
// The semantic palette intentionally maps to Tailwind tokens (slate / blue /
// emerald / amber / rose) so the rest of the design system stays coherent
// when we tune colors centrally. Channel-identity chips (email / linkedin /
// call / wait) remain in ChannelChip.tsx — those carry per-channel branding,
// not semantic status, and deliberately stay separate.
//
// Variants:
//   neutral  — generic info, no signal weight (slate)
//   info     — informational state, "linked", "scheduled" (blue)
//   success  — positive completion ("active", "sent") (emerald)
//   warning  — needs attention ("sender error", "reconnect") (amber)
//   danger   — error / blocked ("failed", "auth_expired") (rose)
//
// Tones:
//   brand    — filled background (default for emphasis strips)
//   outline  — white bg + colored border (default for inline status pills)
//
// Sizes:
//   xs — ~10-11px text, matches the previous hand-rolled compact chips
//   sm — ~12px text, slightly roomier for inline use

import React from "react";

type ChipVariant = "neutral" | "info" | "success" | "warning" | "danger";
type ChipSize = "xs" | "sm";
type ChipTone = "brand" | "outline";

interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
  size?: ChipSize;
  tone?: ChipTone;
  uppercase?: boolean;
  children: React.ReactNode;
}

// Map [variant][tone] -> Tailwind class string.
// Kept explicit (no template-string concatenation) so Tailwind's content
// scanner picks each class up in production builds.
const VARIANT_STYLES: Record<ChipVariant, Record<ChipTone, string>> = {
  neutral: {
    brand: "bg-slate-100 text-slate-700 border-slate-200",
    outline: "bg-white text-slate-700 border-slate-300",
  },
  info: {
    brand: "bg-blue-50 text-blue-700 border-blue-200",
    outline: "bg-white text-blue-700 border-blue-300",
  },
  success: {
    brand: "bg-emerald-50 text-emerald-700 border-emerald-200",
    outline: "bg-white text-emerald-700 border-emerald-300",
  },
  warning: {
    brand: "bg-amber-50 text-amber-800 border-amber-200",
    outline: "bg-white text-amber-800 border-amber-300",
  },
  danger: {
    brand: "bg-rose-50 text-rose-700 border-rose-200",
    outline: "bg-white text-rose-700 border-rose-300",
  },
};

const SIZE_STYLES: Record<ChipSize, string> = {
  // xs — matches the prior 10-11px hand-rolled chips (border px-1.5 py-0)
  xs: "px-1.5 py-0 text-[10px] leading-[16px]",
  // sm — matches the prior `px-2 py-0.5 text-[10px]` family but slightly wider
  sm: "px-2 py-0.5 text-[11px] leading-[18px]",
};

export function Chip({
  variant = "neutral",
  size = "xs",
  tone = "outline",
  uppercase = true,
  className = "",
  children,
  ...rest
}: ChipProps) {
  const base =
    "inline-flex items-center gap-1 rounded-full border font-bold tracking-[0.04em]";
  const uppercaseClass = uppercase ? "uppercase" : "";
  const variantClass = VARIANT_STYLES[variant][tone];
  const sizeClass = SIZE_STYLES[size];
  return (
    <span
      className={`${base} ${variantClass} ${sizeClass} ${uppercaseClass} ${className}`.trim()}
      {...rest}
    >
      {children}
    </span>
  );
}

export default Chip;
