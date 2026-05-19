import { ReactNode } from "react";

export type OfferGridCard = {
  check: string;
  title: string;
  body: ReactNode;
  preview?: ReactNode;
  href?: string;
  cta?: string;
  span?: 2 | 3 | 4 | 6;
  tone?: "light" | "dark";
};

export type MoneyPageOfferGridProps = {
  eyebrow?: string;
  heading: string;
  body?: string;
  cards: OfferGridCard[];
};

const SPAN_CLASS: Record<NonNullable<OfferGridCard["span"]>, string> = {
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
  6: "md:col-span-6",
};

export function MoneyPageOfferGrid({ eyebrow, heading, body, cards }: MoneyPageOfferGridProps) {
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-container px-4 sm:px-6">
        <header className="mx-auto mb-12 max-w-3xl text-center">
          {eyebrow && (
            <p className="mb-4 inline-block rounded-full bg-blue-50 px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">
              {"✓ " + eyebrow}
            </p>
          )}
          <h2 className="font-display text-[clamp(28px,3.4vw,40px)] font-bold leading-[1.08] tracking-[-0.02em] text-slate-900 [text-wrap:balance]">
            {heading}
          </h2>
          {body && <p className="mt-3.5 text-[17px] leading-[1.55] text-slate-600">{body}</p>}
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-6 md:gap-5">
          {cards.map((card, i) => {
            const span = card.span ?? 2;
            const dark = card.tone === "dark";
            return (
              <article
                key={i}
                className={[
                  "group flex flex-col rounded-2xl border p-6 transition-all duration-200 hover:-translate-y-0.5",
                  SPAN_CLASS[span],
                  dark
                    ? "border-cyan-400/25 bg-gradient-to-b from-[#020617] to-[#0b1230] text-white hover:border-cyan-400/50"
                    : "border-slate-200 bg-white text-slate-900 hover:border-cyan-400/40 hover:shadow-lg",
                ].join(" ")}
              >
                <div className="mb-3.5 flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-400">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
                      <path d="M3 8l3 3 7-7" />
                    </svg>
                  </span>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-500">
                    {card.check}
                  </span>
                </div>
                <h3 className={["font-display text-[19px] font-semibold leading-tight tracking-[-0.01em]", dark ? "text-white" : "text-slate-900"].join(" ")}>
                  {card.title}
                </h3>
                <div className={["mt-2 text-[14px] leading-[1.55]", dark ? "text-white/75" : "text-slate-600"].join(" ")}>
                  {card.body}
                </div>
                {card.preview && (
                  <div className={["mt-4 rounded-xl p-3.5", dark ? "bg-white/[0.04]" : "bg-slate-50"].join(" ")}>
                    {card.preview}
                  </div>
                )}
                {card.href && card.cta && (
                  <a href={card.href} className={["mt-4 font-display text-[13.5px] font-semibold", dark ? "text-cyan-400 hover:text-white" : "text-blue-600 hover:text-blue-700"].join(" ")}>
                    {card.cta} →
                  </a>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
