import Link from "next/link";
import { forwardRef } from "react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Canonical <Button> for the marketing site. Single source of truth for
 * CTAs — Nav, PageHero, CtaBanner, MobileMenu all funnel through here.
 *
 * Per the design review, ALL variants share `rounded-xl` (18px). The
 * `size` prop only controls h / px / font-size; corner radius never
 * changes. This eliminates the rounded-md (10px) vs rounded-xl (18px)
 * drift that previously existed between nav-scale and hero-scale CTAs.
 *
 * Polymorphic: passes `href` -> renders Next <Link>; omits `href` ->
 * renders <button>. Forwards refs to the underlying element.
 */

export type ButtonVariant = "primary" | "secondary" | "cyan" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

type AsButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

type AsLinkProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href"> & {
    href: string;
  };

export type ButtonProps = AsButtonProps | AsLinkProps;

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 px-4 rounded-xl text-[13px]",
  md: "h-11 px-5 rounded-xl text-[14px]",
  lg: "h-12 px-6 rounded-xl text-[15px]",
};

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "text-white bg-gradient-to-b from-brand-blue to-brand-blue-600 shadow-[0_6px_18px_rgba(37,99,235,0.35)] hover:shadow-[0_10px_24px_rgba(37,99,235,0.45)] hover:-translate-y-[1px]",
  secondary:
    "text-ink-900 bg-white/80 backdrop-blur border border-ink-100 hover:bg-white hover:border-ink-200",
  cyan: "text-dark-0 bg-brand-cyan shadow-glow-cyan hover:bg-brand-cyan-dim",
  ghost: "text-ink-700 hover:text-ink-900 hover:bg-ink-50",
};

const baseStyles =
  "font-display inline-flex items-center justify-center gap-2 font-semibold transition " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button({ variant = "primary", size = "md", className, children, ...props }, ref) {
    const classes = cn(baseStyles, sizeStyles[size], variantStyles[variant], className);

    if (typeof (props as AsLinkProps).href === "string") {
      const { href, ...rest } = props as AsLinkProps;
      return (
        <Link
          href={href}
          ref={ref as React.Ref<HTMLAnchorElement>}
          className={classes}
          {...rest}
        >
          {children}
        </Link>
      );
    }

    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        className={classes}
        {...(props as AsButtonProps)}
      >
        {children}
      </button>
    );
  },
);
