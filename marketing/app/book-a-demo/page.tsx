import type { Metadata } from "next";
import CalEmbed from "./CalEmbed.client";

/**
 * /book-a-demo — Cal.com booking page for new trial users.
 *
 * Linked from the post-signup-demo Resend template (sent 24h after a user
 * confirms their email) and from the trial-welcome Day-9 demo nudge. The
 * Cal.com link is configured via NEXT_PUBLIC_CAL_COM_LINK (e.g.
 * "logistic-intel/15min"). Falls back to a clear placeholder when unset
 * so we never render a broken iframe.
 */

const CAL_LINK = (
  process.env.NEXT_PUBLIC_CAL_COM_LINK ?? ""
).trim();

export const metadata: Metadata = {
  title: "Book a 15-min demo · Logistic Intel",
  description:
    "Walk through Logistic Intel with the team. We'll show you the lanes, the verified contacts, and the integrations on your real data — 15 minutes, no pitch.",
  alternates: { canonical: "https://logisticintel.com/book-a-demo" },
  robots: { index: false, follow: true },
};

export default function BookADemoPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live calendar
          </div>
          <h1 className="mt-4 text-[34px] font-semibold leading-[1.1] tracking-[-0.02em] text-slate-900 sm:text-[42px]">
            Book a 15-min walkthrough
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-600">
            We'll show you the lanes, the verified buyer-side contacts, and the
            integrations on your real data — no pitch, no slides.
          </p>
        </div>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_2px_8px_rgba(15,23,42,0.04)] sm:p-4">
          {CAL_LINK ? (
            <CalEmbed calLink={CAL_LINK} />
          ) : (
            <div className="flex h-[560px] flex-col items-center justify-center px-6 text-center">
              <div className="text-[13px] font-bold uppercase tracking-[0.14em] text-amber-600">
                Calendar not configured
              </div>
              <p className="mt-2 max-w-md text-[14px] text-slate-600">
                Set <span className="font-mono text-[13px]">NEXT_PUBLIC_CAL_COM_LINK</span> in
                Vercel (e.g. <span className="font-mono text-[13px]">logistic-intel/15min</span>)
                to enable the booking widget here.
              </p>
            </div>
          )}
        </div>

        <div className="mx-auto mt-6 max-w-xl text-center text-[12.5px] text-slate-500">
          Prefer email? Reply to your invite from{" "}
          <span className="font-semibold text-slate-700">
            pulse@logisticintel.com
          </span>{" "}
          and we'll find a time.
        </div>
      </div>
    </main>
  );
}
