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
    <section className="relative overflow-hidden px-5 pb-12 pt-14 sm:px-8 sm:pb-16 sm:pt-20 lg:pt-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(760px_360px_at_78%_0%,rgba(34,211,238,0.12),transparent_68%),radial-gradient(620px_360px_at_28%_0%,rgba(59,130,246,0.09),transparent_72%)]" />
      <div className="pointer-events-none absolute right-[-7%] top-0 -z-10 h-[420px] w-[620px] opacity-30 [background-image:linear-gradient(rgba(59,130,246,.09)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,.09)_1px,transparent_1px)] [background-size:42px_42px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_74%)]" />
      <div className={`mx-auto max-w-content ${isCenter ? "text-center" : ""}`}>
        <div className={isCenter ? "mx-auto inline-flex" : ""}>
          {eyebrow && (
            <div className="lit-pill shadow-sm">
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
        {children && (
          <div className="mt-10 overflow-hidden rounded-3xl border border-blue-100/80 bg-white/80 p-2 shadow-[0_28px_80px_-42px_rgba(15,23,42,.45)] backdrop-blur sm:mt-12 sm:p-3">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
