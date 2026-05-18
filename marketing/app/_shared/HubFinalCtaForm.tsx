"use client";

import { useLeadMagnetForm } from "@/components/lead-magnet/useLeadMagnetForm";

/**
 * Inline final-CTA email form for hub pages (/vs, /alternatives, /best,
 * /lanes). Reuses the shared `useLeadMagnetForm` hook so the POST +
 * redirect-to-/signup UX matches the rest of the lead-magnet surface
 * (sticky bar, hero, exit-intent). Keep visually minimal — the hubs
 * already have their own `CtaBanner`; this is the lightweight
 * email-capture echo at the very bottom of the page.
 */
export type HubFinalCtaFormProps = {
  source: string;
  /** Optional overrides — defaults fit the generic hub copy. */
  headline?: string;
  subhead?: string;
  ctaLabel?: string;
};

export function HubFinalCtaForm({
  source,
  headline = "See LIT on your own lanes.",
  subhead = "10 searches + 10 verified contacts. No credit card.",
  ctaLabel = "Start free →",
}: HubFinalCtaFormProps) {
  const { onSubmit, submitting, error } = useLeadMagnetForm({ source });

  return (
    <section className="text-center py-24">
      <h2 className="text-3xl font-bold">{headline}</h2>
      <p className="mt-3 text-slate-600">{subhead}</p>
      <form
        onSubmit={onSubmit}
        className="mt-6 max-w-md mx-auto flex gap-2"
        noValidate
      >
        <input
          type="email"
          name="email"
          placeholder="Your work email"
          required
          aria-label="Work email"
          className="flex-1 px-4 py-3 rounded-lg border border-slate-300"
        />
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-3 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-60"
        >
          {submitting ? "..." : ctaLabel}
        </button>
      </form>
      {error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
