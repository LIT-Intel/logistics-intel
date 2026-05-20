import { cn } from "@/lib/utils";

/**
 * `SectionGlow` — wraps content with a radial ambient pseudo-element
 * behind it. Use behind heroes and other "important" content blocks to
 * add depth without a hard background. The glow lives in the `::before`
 * pseudo so it never intercepts pointer events.
 */
export function SectionGlow({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section";
}) {
  return <Tag className={cn("section-glow", className)}>{children}</Tag>;
}
