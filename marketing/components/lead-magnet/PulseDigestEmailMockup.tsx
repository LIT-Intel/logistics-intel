import { TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import styles from "./lead-magnet.module.css";

/**
 * Static visual mockup of the LIT Pulse weekly brief email. Ported from
 * the freight-leads.html "killer feature" panel. Rotated -1deg with a
 * cyan-tinged glow; intended to sit on a dark section background so the
 * white card pops. Sample data is baked in for now but can be lifted to
 * props later (rows, trendingTerms, headline copy).
 */
export function PulseDigestEmailMockup() {
  const volumeRows: Array<{
    company: string;
    domain: string;
    delta: number;
    note: string;
  }> = [
    { company: "Acme Auto Parts", domain: "acmeauto.com", delta: 42, note: "Shanghai → LAX, 22 shipments" },
    { company: "Northwind Apparel", domain: "northwind.com", delta: -18, note: "Ningbo → NYC slowdown" },
    { company: "Globex Industrial", domain: "globex.com", delta: 67, note: "New Vietnam origin lanes" },
  ];

  const trending = [
    "EV battery components",
    "Furniture · Vietnam",
    "Apparel · Bangladesh",
    "Cold-chain · Chile",
  ];

  return (
    <div className={`${styles.digestCard} mx-auto w-full max-w-md overflow-hidden rounded-2xl bg-white text-ink-900`}>
      {/* Email header */}
      <header className="flex items-center gap-2.5 border-b border-ink-100 bg-gradient-to-r from-dark-0 to-dark-2 px-5 py-3.5 text-white">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand-cyan/15 text-brand-cyan">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="leading-tight">
          <p className="text-[13px] font-semibold tracking-tight">LIT Pulse</p>
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/55">Weekly Brief</p>
        </div>
        <span className="ml-auto text-[10px] uppercase tracking-[0.16em] text-brand-cyan">
          Mon · 7:00am
        </span>
      </header>

      {/* Section 1: volume changes */}
      <section className="px-5 pt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          Volume changes · Saved companies
        </p>
        <ul className="mt-3 space-y-2.5">
          {volumeRows.map((row) => {
            const up = row.delta >= 0;
            return (
              <li
                key={row.domain}
                className="flex items-center gap-3 rounded-lg border border-ink-100 bg-ink-25 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink-900">
                    {row.company}
                  </p>
                  <p className="truncate text-[11px] text-ink-500">{row.note}</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                    up ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                  }`}
                >
                  {up ? (
                    <TrendingUp className="h-3 w-3" aria-hidden />
                  ) : (
                    <TrendingDown className="h-3 w-3" aria-hidden />
                  )}
                  {up ? "+" : ""}
                  {row.delta}%
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Section 2: revenue opportunity */}
      <section className="mx-5 mt-5 rounded-xl border border-brand-cyan/30 bg-gradient-to-br from-brand-cyan/10 to-brand-blue/10 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-blue-600">
          Revenue opportunity
        </p>
        <p className="mt-1.5 text-[13px] font-semibold leading-snug text-ink-900">
          Globex Industrial just opened 3 new Vietnam → LAX lanes. Est. $480K
          freight spend in Q3.
        </p>
        <p className="mt-1.5 text-[11px] text-ink-500">
          2 verified contacts in supply chain. Tap to draft outreach.
        </p>
      </section>

      {/* Section 3: trending pills */}
      <section className="px-5 pb-5 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500">
          Trending in your lanes
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {trending.map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded-full border border-ink-100 bg-white px-2.5 py-1 text-[11px] font-medium text-ink-700"
            >
              {t}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
