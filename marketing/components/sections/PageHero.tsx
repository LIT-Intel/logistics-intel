import { ArrowRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Standard inner-page hero — used on every public template (feature,
 * solution, comparison, glossary, lanes, ports, blog, etc).
 *
 * Locks the eyebrow → H1 → intro → CTA spacing rhythm at the values in
 * the design-system spec (16/20/32px) so every page lands the same way:
 *
 *   eyebrow                 ─┐
 *      ↕ 16px                │
 *   H1                        │── hero block
 *      ↕ 20px                │
 *   intro paragraph           │
 *      ↕ 32px               ─┘
 *   primary CTA  secondary CTA
 *
 * Use `wide` to make the H1 column run to 880px (default 760px). Use
 * `align="center"` for hub pages that center their eyebrow + H1.
 */
export function PageHero({
  eyebrow,
  title,
  titleHighlight,
  titleSuffix,
  subtitle,
  primaryCta,
  secondaryCta,
  align = "left",
  wide = false,
  children,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  titleHighlight?: React.ReactNode;
  titleSuffix?: React.ReactNode;
  subtitle?: React.ReactNode;
  primaryCta?: { label: string; href: string; icon?: "calendar" | "arrow" };
  secondaryCta?: { label: string; href: string };
  align?: "left" | "center";
  wide?: boolean;
  children?: React.ReactNode;
}) {
  const PrimaryIcon = primaryCta?.icon === "calendar" ? Calendar : ArrowRight;
  const isCenter = align === "center";
  const titleMax = wide ? "max-w-[880px]" : "max-w-[760px]";
  const introMax = wide ? "max-w-[680px]" : "max-w-[640px]";

  return (
    <section className="relative px-5 sm:px-8 pt-14 sm:pt-24 pb-10 sm:pb-16">
      <div className={`mx-auto max-w-content ${isCenter ? "text-center" : ""}`}>
        <div className={isCenter ? "mx-auto inline-flex" : ""}>
          {eyebrow && (
            <div className="lit-pill">
              <span className="dot" />
              {eyebrow}
            </div>
          )}
        </div>
        <h1
          className={`display-xl space-eyebrow-h1 ${isCenter ? `mx-auto ${titleMax}` : titleMax}`}
        >
          {title}
          {titleHighlight && (
            <>
              {" "}
              <span className="grad-text">{titleHighlight}</span>
            </>
          )}
          {titleSuffix && <> {titleSuffix}</>}
        </h1>
        {subtitle && (
          <p className={`lead space-h1-intro ${isCenter ? `mx-auto ${introMax}` : introMax}`}>
            {subtitle}
          </p>
        )}
        {(primaryCta || secondaryCta) && (
          <div className={`space-intro-cta flex flex-wrap gap-3 ${isCenter ? "justify-center" : ""}`}>
            {primaryCta && (
              <Button variant="primary" size="lg" href={primaryCta.href}>
                <PrimaryIcon className="h-4 w-4" />
                {primaryCta.label}
              </Button>
            )}
            {secondaryCta && (
              <Button variant="secondary" size="lg" href={secondaryCta.href}>
                {secondaryCta.label}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
        {children && <div className="mt-12 sm:mt-14">{children}</div>}
      </div>
    </section>
  );
}
