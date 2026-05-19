"use client";

import { useLeadMagnetForm } from "./useLeadMagnetForm";

export type FinalCtaBandProps = {
  heading: string;
  body: string;
  ctaLabel: string;
  formSource: string;
  formNote?: string;
};

export function FinalCtaBand({
  heading,
  body,
  ctaLabel,
  formSource,
  formNote = "Cancel anytime. · No credit card · 14-day full access",
}: FinalCtaBandProps) {
  const { onSubmit, submitting, error } = useLeadMagnetForm({ source: formSource });

  return (
    <section className="relative overflow-hidden bg-white py-24 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_1000px_600px_at_center_top,rgba(0,240,255,0.08),transparent_60%)]"
      />
      <div className="relative mx-auto max-w-container px-4 sm:px-6">
        <h2 className="mx-auto max-w-2xl font-display text-[clamp(28px,3.8vw,48px)] font-bold leading-[1.06] tracking-[-0.025em] text-slate-900 [text-wrap:balance]">
          {heading}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[17px] leading-[1.55] text-slate-600">{body}</p>
        <form onSubmit={onSubmit} className="mx-auto mt-8 flex max-w-md flex-col gap-2 sm:flex-row">
          <input
            type="email"
            name="email"
            placeholder="Your work email"
            required
            aria-label="Work email"
            className="flex-1 rounded-xl border-[1.5px] border-slate-300 bg-white px-4 py-3.5 text-[15px] outline-none transition-all focus:border-blue-600 focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-gradient-to-b from-blue-600 to-blue-800 px-6 py-3.5 font-display text-[15px] font-bold text-white shadow-[0_4px_14px_rgba(37,99,235,0.32)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(37,99,235,0.42)] disabled:opacity-60"
          >
            {submitting ? "Sending…" : ctaLabel}
          </button>
        </form>
        {error && <p className="mx-auto mt-2 max-w-md text-sm text-red-600">{error}</p>}
        <p className="mx-auto mt-3 max-w-md text-[13px] text-slate-500">
          <strong className="text-slate-900">{formNote}</strong>
        </p>
      </div>
    </section>
  );
}
