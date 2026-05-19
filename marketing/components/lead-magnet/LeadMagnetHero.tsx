"use client";

import type { ReactNode } from "react";
import { Star, ShieldCheck } from "lucide-react";
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
    <section className="relative overflow-hidden bg-dark-0 text-white">
      {/* Ambient gradient wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(900px 480px at 15% 10%, rgba(0,240,255,0.16), transparent 60%), radial-gradient(700px 420px at 85% 30%, rgba(59,130,246,0.18), transparent 65%)",
        }}
      />

      <div className="relative mx-auto grid max-w-container grid-cols-1 gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[1.05fr_minmax(0,1fr)] lg:gap-16 lg:py-24">
        {/* Left: copy + form */}
        <div className="flex min-w-0 flex-col justify-center">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-cyan">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan" aria-hidden />
            {eyebrow}
          </span>

          {/* Any <em> inside the headline gets the cyan→blue gradient.
           *  Callers can pass plain strings or ReactNodes with <em>…</em>
           *  around the phrase they want highlighted. */}
          <h1 className="font-display mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl [&_em]:not-italic [&_em]:bg-[linear-gradient(90deg,#00F0FF_0%,#3b82f6_60%,#2563eb_100%)] [&_em]:bg-clip-text [&_em]:text-transparent">
            {headline}
          </h1>

          <p className="mt-5 max-w-prose text-base leading-relaxed text-white/70 sm:text-lg">
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
              className="h-12 w-full min-w-0 flex-1 appearance-none rounded-lg border-0 bg-white px-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-cyan sm:text-sm"
            />
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-brand-cyan px-6 text-sm font-semibold text-dark-0 shadow-glow-cyan transition hover:bg-brand-cyan-dim disabled:opacity-60 sm:w-auto"
            >
              {submitting ? "Starting…" : ctaLabel}
            </button>
          </form>

          {formNote && (
            <p className="mt-3 text-xs text-white/50">{formNote}</p>
          )}

          {/* Trust row */}
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-white/65">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex items-center gap-0.5 text-amber-300" aria-hidden>
                <Star className="h-3.5 w-3.5 fill-current" />
                <Star className="h-3.5 w-3.5 fill-current" />
                <Star className="h-3.5 w-3.5 fill-current" />
                <Star className="h-3.5 w-3.5 fill-current" />
                <Star className="h-3.5 w-3.5 fill-current" />
              </span>
              <span className="font-semibold text-white">4.8</span>
              <span className="text-white/55">on G2</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-brand-cyan" aria-hidden />
              SOC&nbsp;2
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-brand-cyan" aria-hidden />
              GDPR
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-brand-cyan" aria-hidden />
              CCPA
            </span>
          </div>
        </div>

        {/* Right: product preview slot. min-w-0 + w-full lets the child
         *  respect the grid cell width on every breakpoint — without it,
         *  flex/grid children with intrinsic widths (typewriter text,
         *  result-card rows) can push past the viewport on mobile. */}
        <div className="relative flex min-w-0 items-center justify-center">
          <div className="w-full max-w-[560px]">{children}</div>
        </div>
      </div>
    </section>
  );
}
