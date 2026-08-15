"use client";

import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { useLeadMagnetForm } from "./useLeadMagnetForm";

type Props = {
  eyebrow: string;
  headline: ReactNode;
  lede: string;
  ctaLabel: string;
  formSource: string;
  formNote?: string;
  /** Right column slot — typically a <LiveProductPreview>. */
  children?: ReactNode;
};

/**
 * Money-page hero. Two-column on lg+, single column below. Left rail is
 * eyebrow + outcome H1 + lede + inline email form + trust row. Right rail
 * is a children slot so the caller can drop in a LiveProductPreview or
 * other illustrative module.
 *
 * Pass the headline as a string OR a ReactNode with an <em> wrapping the
 * phrase you want gradient-treated (the gradientPhrase CSS class is
 * applied to <em> inside the headline container via descendant selector).
 */
export function LeadMagnetHero({
  eyebrow,
  headline,
  lede,
  ctaLabel,
  formSource,
  formNote,
  children,
}: Props) {
  const { onSubmit, submitting } = useLeadMagnetForm({ source: formSource });

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(820px_460px_at_82%_14%,rgba(34,211,238,0.14),transparent_68%),radial-gradient(640px_380px_at_26%_0%,rgba(59,130,246,0.09),transparent_72%)]" />

      <div className="relative mx-auto grid max-w-container grid-cols-1 gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[1.05fr_minmax(0,1fr)] lg:gap-16 lg:py-24">
        {/* Left: copy + form */}
        <div className="flex min-w-0 flex-col justify-center">
          <span className="lit-pill w-fit shadow-sm"><span className="dot" />{eyebrow}</span>

          {/* Any <em> OR <strong> inside the headline gets the cyan→blue
           *  gradient. Callers prefer <strong> on money pages (carries
           *  more SEO weight for the highlighted noun phrase) and <em> on
           *  the home hero (rhetorical emphasis). Both render identically
           *  via the parallel selectors below. */}
          <h1 className="display-xl mt-5 max-w-[660px] [&_em]:not-italic [&_em]:bg-[linear-gradient(90deg,#2563eb_0%,#0891b2_100%)] [&_em]:bg-clip-text [&_em]:text-transparent [&_strong]:font-bold [&_strong]:bg-[linear-gradient(90deg,#2563eb_0%,#0891b2_100%)] [&_strong]:bg-clip-text [&_strong]:text-transparent">
            {headline}
          </h1>

          <p className="lead mt-5 max-w-[600px]">
            {lede}
          </p>

          <form
            onSubmit={onSubmit}
            className="mt-7 flex w-full max-w-md flex-col gap-2 sm:flex-row"
          >
            <input type="hidden" name="source" value={formSource} />
            <label htmlFor="lit-hero-email" className="sr-only">
              Work email
            </label>
            <input
              id="lit-hero-email"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              className="h-12 w-full min-w-0 appearance-none rounded-xl border border-ink-100 bg-white px-4 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:flex-1 sm:text-[15px]"
            />
            <button
              type="submit"
              disabled={submitting}
              className="font-display inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-glow-blue transition hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
            >
              {submitting ? "Starting…" : ctaLabel}
            </button>
          </form>

          {formNote && (
            <p className="mt-3 text-xs text-ink-500">{formNote}</p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] uppercase tracking-[0.08em] text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" aria-hidden />
              SOC&nbsp;2 Type II audit in progress
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" aria-hidden />
              GDPR
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" aria-hidden />
              CCPA
            </span>
          </div>
        </div>

        {/* Right: product preview slot. min-w-0 + w-full lets the child
         *  respect the grid cell width on every breakpoint — without it,
         *  flex/grid children with intrinsic widths (typewriter text,
         *  result-card rows) can push past the viewport on mobile. */}
        <div className="relative flex min-w-0 items-center justify-center">
          <div className="absolute -inset-5 -z-10 rounded-[38px] bg-gradient-to-br from-cyan-200/35 via-blue-200/25 to-transparent blur-2xl" />
          <div className="w-full max-w-[560px] overflow-hidden rounded-3xl border border-blue-100/80 bg-white/75 p-2 shadow-[0_30px_90px_-45px_rgba(15,23,42,.55)] backdrop-blur sm:p-3">{children}</div>
        </div>
      </div>
    </section>
  );
}
