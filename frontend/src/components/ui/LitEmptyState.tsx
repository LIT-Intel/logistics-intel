import React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Intent-filled empty state — replaces "No data" placeholders across the
 * app interior. Pattern lifted from ZoomInfo/Linear: every empty state
 * carries warmth + context + a primary action.
 *
 * Anatomy:
 *   - Optional icon in a soft circle (32-40px depending on size)
 *   - Title that names the absence in human language
 *   - Body sentence with context — what would change if there WAS data
 *   - Primary CTA (link or button) that points at the next action
 *   - Optional secondary CTA for the "I don't want to do that" path
 *
 * Three sizes:
 *   - `sm`  — inline within a card (96px tall)
 *   - `md`  — standalone empty (160px tall) [default]
 *   - `lg`  — full-page empty (240px tall)
 */

export type LitEmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  body?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Primary CTA — link or button. Pass either `to` or `onClick`. */
  primary?: {
    label: string;
    to?: string;
    href?: string;
    onClick?: () => void;
    icon?: React.ReactNode;
  };
  /** Secondary CTA — smaller, ghost styling. */
  secondary?: {
    label: string;
    to?: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
};

const SIZE_TOKENS = {
  sm: {
    container: "py-6",
    iconWrap: "h-8 w-8",
    title: "text-[13.5px]",
    body: "text-[12px]",
    cta: "px-3 py-1.5 text-[11.5px]",
  },
  md: {
    container: "py-10",
    iconWrap: "h-10 w-10",
    title: "text-[15px]",
    body: "text-[12.5px]",
    cta: "px-4 py-2 text-[12.5px]",
  },
  lg: {
    container: "py-16",
    iconWrap: "h-12 w-12",
    title: "text-[18px]",
    body: "text-[13.5px]",
    cta: "px-4 py-2.5 text-[13px]",
  },
} as const;

export default function LitEmptyState({
  icon,
  title,
  body,
  size = "md",
  primary,
  secondary,
  className,
}: LitEmptyStateProps) {
  const t = SIZE_TOKENS[size];
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 text-center",
        t.container,
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            "mb-3 flex shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400",
            t.iconWrap,
          )}
          aria-hidden
        >
          {icon}
        </div>
      )}
      <h3
        className={cn(
          "font-display font-semibold text-slate-900",
          t.title,
        )}
      >
        {title}
      </h3>
      {body && (
        <p
          className={cn(
            "font-body mt-1.5 max-w-md leading-relaxed text-slate-500",
            t.body,
          )}
        >
          {body}
        </p>
      )}
      {(primary || secondary) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {primary && <PrimaryCta {...primary} sizeToken={t.cta} />}
          {secondary && <SecondaryCta {...secondary} sizeToken={t.cta} />}
        </div>
      )}
    </div>
  );
}

function PrimaryCta({
  label,
  to,
  href,
  onClick,
  icon,
  sizeToken,
}: NonNullable<LitEmptyStateProps["primary"]> & { sizeToken: string }) {
  const cls = cn(
    "font-display inline-flex items-center gap-1.5 rounded-md bg-blue-600 font-semibold text-white shadow-sm transition-colors hover:bg-blue-700",
    sizeToken,
  );
  if (to) {
    return (
      <Link to={to} className={cls}>
        {icon}
        {label}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={cls}>
        {icon}
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      {label}
    </button>
  );
}

function SecondaryCta({
  label,
  to,
  href,
  onClick,
  sizeToken,
}: NonNullable<LitEmptyStateProps["secondary"]> & { sizeToken: string }) {
  const cls = cn(
    "font-display inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white font-semibold text-slate-600 transition-colors hover:bg-slate-50",
    sizeToken,
  );
  if (to) {
    return (
      <Link to={to} className={cls}>
        {label}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={cls}>
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {label}
    </button>
  );
}
