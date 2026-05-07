import { cn } from "@/lib/utils";

type Pad = "none" | "sm" | "md" | "lg" | "xl";

/**
 * Vertical spacing scale (matches the design-system spec):
 *   - xl  hero band         → 96px desktop / 56px mobile
 *   - lg  standard section  → 80px desktop / 56px mobile
 *   - md  dense SEO section → 64px desktop / 48px mobile
 *   - sm  internal grouping → 32px desktop / 24px mobile
 *   - none                  → 0
 *
 * Avoids per-page py-[NN] one-offs. If a value isn't in this scale,
 * extend the scale rather than reaching for raw classes.
 */
const TOP: Record<Pad, string> = {
  none: "pt-0",
  sm: "pt-6 sm:pt-8",
  md: "pt-12 sm:pt-16",
  lg: "pt-14 sm:pt-20",
  xl: "pt-14 sm:pt-24",
};
const BOTTOM: Record<Pad, string> = {
  none: "pb-0",
  sm: "pb-6 sm:pb-8",
  md: "pb-12 sm:pb-16",
  lg: "pb-14 sm:pb-20",
  xl: "pb-14 sm:pb-24",
};

type Tone = "default" | "tint" | "soft-blue" | "dark";
const TONE: Record<Tone, string> = {
  default: "bg-section",
  tint: "bg-section-tint",
  "soft-blue": "bg-section-soft-blue",
  dark: "bg-section-dark",
};

type Width = "content" | "container" | "narrow" | "prose";
const WIDTH: Record<Width, string> = {
  content: "max-w-content",
  container: "max-w-container",
  narrow: "max-w-container-narrow",
  prose: "max-w-prose",
};

/**
 * Canonical page section — locks in horizontal padding (px-5 mobile,
 * px-8 desktop), one of four canonical inner widths, and a toned
 * background fill. Use `tone="dark"` for full-bleed product modules
 * (we wrap the dark fill across the viewport, not the inner column).
 */
export function Section({
  children,
  className,
  innerClassName,
  top = "lg",
  bottom = "lg",
  width = "content",
  tone = "default",
  as: Tag = "section",
  id,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  top?: Pad;
  bottom?: Pad;
  width?: Width;
  tone?: Tone;
  as?: "section" | "div" | "aside" | "article";
  id?: string;
  "aria-label"?: string;
}) {
  return (
    <Tag
      id={id}
      aria-label={ariaLabel}
      className={cn(TONE[tone], "px-5 sm:px-8", TOP[top], BOTTOM[bottom], className)}
    >
      <div className={cn("mx-auto", WIDTH[width], innerClassName)}>{children}</div>
    </Tag>
  );
}
