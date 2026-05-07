import { cn } from "@/lib/utils";

type Pad = "none" | "sm" | "md" | "lg";

const TOP: Record<Pad, string> = {
  none: "pt-0",
  sm: "pt-6 sm:pt-10",
  md: "pt-10 sm:pt-16",
  lg: "pt-14 sm:pt-24",
};
const BOTTOM: Record<Pad, string> = {
  none: "pb-0",
  sm: "pb-6 sm:pb-10",
  md: "pb-10 sm:pb-16",
  lg: "pb-14 sm:pb-24",
};

/**
 * Canonical page section. Locks in the marketing site's horizontal padding
 * (px-5 on mobile, px-8 on desktop) and 1240px container so every hub +
 * detail + CTA banner aligns on the same vertical line. Pass `width="narrow"`
 * for prose-heavy pages that want the 960px column.
 */
export function Section({
  children,
  className,
  innerClassName,
  top = "md",
  bottom = "lg",
  width = "default",
  as: Tag = "section",
  id,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  top?: Pad;
  bottom?: Pad;
  width?: "default" | "narrow";
  as?: "section" | "div" | "aside" | "article";
  id?: string;
  "aria-label"?: string;
}) {
  return (
    <Tag id={id} aria-label={ariaLabel} className={cn("px-5 sm:px-8", TOP[top], BOTTOM[bottom], className)}>
      <div
        className={cn(
          "mx-auto",
          width === "narrow" ? "max-w-container-narrow" : "max-w-container",
          innerClassName,
        )}
      >
        {children}
      </div>
    </Tag>
  );
}
