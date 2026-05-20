import { cn } from "@/lib/utils";

type Variant =
  | "default"
  | "violet"
  | "emerald"
  | "amber"
  | "on-dark"
  | "cyan-on-dark";

/**
 * `OverlinePill` — small uppercase chip with optional pulsing dot.
 * Defaults to brand-blue text on `blue-tint` (light surface). The
 * `cyan-on-dark` variant is the ONLY cyan-text usage permitted, and is
 * gated to dark surfaces only. Never render `cyan-on-dark` over a light
 * background — `eslint/grep` will flag it during code review.
 */
export function OverlinePill({
  children,
  variant = "default",
  dot = false,
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "overline-pill",
        variant !== "default" && variant,
        className,
      )}
    >
      {dot && <span className="dot" aria-hidden />}
      {children}
    </span>
  );
}
