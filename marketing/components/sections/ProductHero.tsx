import Link from "next/link";
import { ArrowRight, Calendar } from "lucide-react";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

/**
 * Shared product-page hero — used by /pulse, /company-intelligence,
 * /contact-intelligence, /trade-intelligence, /command-center,
 * /outbound-engine, /rate-benchmark, /revenue-opportunity, /products.
 *
 * Replaces the per-page inline hero pattern that drifted on every
 * product launch. Locks in:
 *   - px-5 sm:px-8 horizontal padding (mobile-safe)
 *   - max-w-content (1120px) inner column
 *   - 2-column layout on lg+ with visual on the right
 *   - eyebrow → H1 → intro → CTA spacing rhythm via design tokens
 *   - "Start Prospecting" + "Book a demo" canonical CTA pair
 *
 * Pass `visual` for the right-side mock; omit it to render a
 * single-column hero that still keeps the spacing rhythm.
 */
export function ProductHero({
  eyebrow,
  title,
  titleHighlight,
  titleSuffix,
  subtitle,
  primaryCta,
  secondaryCta,
  visual,
}: {
  eyebrow: string;
  title: React.ReactNode;
  titleHighlight?: React.ReactNode;
  titleSuffix?: React.ReactNode;
  subtitle: React.ReactNode;
  primaryCta?: { label: string; href: string; icon?: "calendar" | "arrow" };
  secondaryCta?: { label: string; href: string; icon?: "calendar" | "arrow" };
  visual?: React.ReactNode;
}) {
  const primary = primaryCta ?? {
    label: "Start Prospecting",
    href: APP_SIGNUP_URL,
    icon: "arrow" as const,
  };
  const secondary = secondaryCta ?? {
    label: "Book a demo",
    href: "/demo",
    icon: "calendar" as const,
  };
  const PrimaryIcon = primary.icon === "calendar" ? Calendar : ArrowRight;
  const SecondaryIcon = secondary.icon === "calendar" ? Calendar : ArrowRight;

  return (
    <section className="relative px-5 sm:px-8 pt-14 sm:pt-24 pb-12 sm:pb-16">
      <div
        className={
          visual
            ? "mx-auto grid max-w-content gap-10 lg:gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center"
            : "mx-auto max-w-content"
        }
      >
        <div className="min-w-0">
          <div className="lit-pill">
            <span className="dot" />
            {eyebrow}
          </div>
          <h1 className="display-xl space-eyebrow-h1 max-w-[640px]">
            {title}
            {titleHighlight && (
              <>
                {" "}
                <span className="grad-text">{titleHighlight}</span>
              </>
            )}
            {titleSuffix && <> {titleSuffix}</>}
          </h1>
          <p className="lead space-h1-intro max-w-[560px]">{subtitle}</p>
          <div className="space-intro-cta flex flex-wrap gap-3">
            <Link
              href={primary.href}
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.45)]"
              style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
            >
              <PrimaryIcon className="h-4 w-4" />
              {primary.label}
            </Link>
            <Link
              href={secondary.href}
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white/80 px-6 text-[15px] font-semibold text-ink-900 backdrop-blur transition hover:bg-white"
            >
              <SecondaryIcon className="h-4 w-4" />
              {secondary.label}
            </Link>
          </div>
        </div>

        {visual && (
          <div className="relative" style={{ contain: "layout paint", maxWidth: "100%" }}>
            {visual}
          </div>
        )}
      </div>
    </section>
  );
}
