import { cn } from "@/lib/utils";

type Variant = "default" | "on-dark";

/**
 * `CardGlossy` — the 4-layer card recipe shipped in foundations.css.
 * - Layer 1: solid base + 1px border
 * - Layer 2: `::before` sheen w/ `mix-blend-mode: soft-light`
 * - Layer 3: inset highlight + shade
 * - Layer 4: outer shadow stack (and intensified hover variant)
 *
 * Use everywhere a "premium light card" is needed. The `on-dark`
 * variant flips the surface for dark sections.
 */
export function CardGlossy({
  children,
  variant = "default",
  className,
  as: Tag = "div",
  ...rest
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
  as?: "div" | "section" | "article" | "li";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn("card-glossy", variant === "on-dark" && "on-dark", className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}
