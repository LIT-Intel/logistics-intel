import Link from "next/link";
import { ArrowRight, Calendar } from "lucide-react";

/**
 * Standard page hero — used by Pulse, Pricing, Security, Use Case,
 * Comparison, Industry, Trade Lane, About, Glossary, Customers etc.
 * Pill + display headline + lead subhead + 1-2 CTAs.
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
  children?: React.ReactNode;
}) {
  const PrimaryIcon = primaryCta?.icon === "calendar" ? Calendar : ArrowRight;
  const isCenter = align === "center";
  return (
    <section className="relative px-5 sm:px-8 pt-[72px] pb-12">
      <div className={`mx-auto max-w-container ${isCenter ? "text-center" : ""}`}>
        <div className={isCenter ? "mx-auto inline-flex" : ""}>
          {eyebrow && (
            <div className="lit-pill">
              <span className="dot" />
              {eyebrow}
            </div>
          )}
        </div>
        <h1 className={`display-xl mt-5 ${isCenter ? "mx-auto max-w-[860px]" : "max-w-[880px]"}`}>
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
          <p className={`lead mt-5 ${isCenter ? "mx-auto max-w-[680px]" : "max-w-[680px]"}`}>{subtitle}</p>
        )}
        {(primaryCta || secondaryCta) && (
          <div className={`mt-7 flex flex-wrap gap-3 ${isCenter ? "justify-center" : ""}`}>
            {primaryCta && (
              <Link
                href={primaryCta.href}
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.45)]"
                style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
              >
                <PrimaryIcon className="h-4 w-4" />
                {primaryCta.label}
              </Link>
            )}
            {secondaryCta && (
              <Link
                href={secondaryCta.href}
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white/80 px-6 text-[15px] font-semibold text-ink-900 backdrop-blur transition hover:bg-white"
              >
                {secondaryCta.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        )}
        {children && <div className="mt-12">{children}</div>}
      </div>
    </section>
  );
}
