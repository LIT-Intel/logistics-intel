import { cn } from "@/lib/utils";

type Variant = "tint" | "ink" | "cyan" | "edge";

/**
 * `SectionBleed` — escapes the constrained container with a full-bleed
 * background. Composes around a `<div class="container">` (or any
 * inner-width wrapper) so the inside of the section still respects the
 * normal column rules. Variants:
 *
 *   - `tint` — soft light blue-grey
 *   - `ink`  — slate-950 → slate-800 gradient (dark)
 *   - `cyan` — slate-950 + cyan radial halo (dark)
 *   - `edge` — adds top/bottom hairline borders (composable; not a
 *              standalone background)
 */
export function SectionBleed({
  children,
  variant = "tint",
  edge = false,
  className,
  innerClassName,
  id,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  variant?: Variant;
  edge?: boolean;
  className?: string;
  innerClassName?: string;
  id?: string;
  "aria-label"?: string;
}) {
  return (
    <section
      id={id}
      aria-label={ariaLabel}
      className={cn(
        "section-bleed",
        `bleed-${variant}`,
        edge && "bleed-edge",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-container px-5 sm:px-8",
          innerClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
