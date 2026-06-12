// ToolbarButton — semantic primitive for the compact button row at the top
// of the CampaignBuilder (and other admin/builder toolbars).
//
// Replaces the four button shapes the DR audit flagged (Preview, Activity,
// Test send, Save) that drifted on subtle border/text-color variations of
// the same `inline-flex items-center gap-1 rounded-md border ... px-2.5 py-1
// text-[11px]` template.
//
// Per CLAUDE.md, dashboard visual language is the source of truth — keep new
// toolbar actions on this primitive instead of hand-rolling.
//
// Variants:
//   default — slate border, white bg, slate-700 text (neutral action)
//   primary — blue-600 bg, white text (primary CTA)
//   warning — amber border, amber-50 bg, amber-700 text (needs-attention)
//   danger  — rose border, rose-50 bg, rose-700 text (destructive)

import React from "react";

type ToolbarButtonVariant = "default" | "primary" | "warning" | "danger";
type ToolbarButtonSize = "sm" | "md";

interface ToolbarButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ToolbarButtonVariant;
  size?: ToolbarButtonSize;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  children: React.ReactNode;
}

const VARIANT_STYLES: Record<ToolbarButtonVariant, string> = {
  default:
    "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:hover:bg-white",
  primary:
    "border-blue-600 bg-blue-600 text-white hover:bg-blue-700 disabled:hover:bg-blue-600",
  warning:
    "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:hover:bg-amber-50",
  danger:
    "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:hover:bg-rose-50",
};

const SIZE_STYLES: Record<ToolbarButtonSize, string> = {
  // sm — matches the prior 11px/px-2.5 py-1 toolbar buttons (Save, Preview,
  // Test send, Activity).
  sm: "px-2.5 py-1 text-[11px]",
  // md — slightly roomier for primary CTAs (e.g. inline launch toggles).
  md: "px-3 py-1.5 text-[12px]",
};

export const ToolbarButton = React.forwardRef<
  HTMLButtonElement,
  ToolbarButtonProps
>(function ToolbarButton(
  {
    variant = "default",
    size = "sm",
    iconLeft,
    iconRight,
    disabled,
    className = "",
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  const base =
    "inline-flex items-center gap-1 rounded-md border font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
  const variantClass = VARIANT_STYLES[variant];
  const sizeClass = SIZE_STYLES[size];
  return (
    <button
      ref={ref}
      // eslint-disable-next-line react/button-has-type
      type={type}
      disabled={disabled}
      className={`${base} ${variantClass} ${sizeClass} ${className}`.trim()}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
});

export default ToolbarButton;
