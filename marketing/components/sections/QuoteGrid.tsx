import { AuthorChip } from "./AuthorChip";

export type QuoteCard = {
  text: string;
  stats: Array<{ num: string; label: string }>;
  name: string;
  role: string;
  avatarUrl?: string | null;
};

/**
 * `QuoteGrid` — 3-up testimonial cards. The handoff originally framed
 * these as customer testimonials; per the show-stopper note these
 * cards explicitly present the LIT TEAM's perspective on how customers
 * onboard / why LIT exists / etc. Real customer testimonials live in
 * the existing `TestimonialTrio` component.
 *
 * Per show-stopper A: the decorative `"` glyph has been stripped, and
 * the parent supplies the section heading + `aria-label` clarifying
 * intent ("LIT team perspective").
 */
export function QuoteGrid({
  eyebrow,
  heading,
  ariaLabel = "LIT team perspective",
  quotes,
}: {
  eyebrow?: string;
  heading: string;
  ariaLabel?: string;
  quotes: QuoteCard[];
}) {
  return (
    <section
      aria-label={ariaLabel}
      className="px-5 sm:px-8 py-20 sm:py-24 bg-section-tint"
    >
      <div className="mx-auto max-w-container">
        <header className="mx-auto max-w-[760px] text-center">
          {eyebrow && (
            <div className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-brand-blue-700">
              {eyebrow}
            </div>
          )}
          <h2 className="font-display mt-3 text-balance text-[clamp(28px,3vw,42px)] font-bold leading-[1.1] tracking-[-0.024em] text-ink-900">
            {heading}
          </h2>
        </header>

        <div className="quote-grid">
          {quotes.slice(0, 3).map((q, i) => (
            <figure key={i} className="quote-card">
              <blockquote className="qtext">{q.text}</blockquote>
              {q.stats?.length > 0 && (
                <div className="qstats" aria-label="Outcome stats">
                  {q.stats.slice(0, 2).map((s, j) => (
                    <div key={j}>
                      <div className="qstat-num">{s.num}</div>
                      <div className="qstat-label">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}
              <figcaption className="mt-auto pt-2">
                <AuthorChip
                  name={q.name}
                  role={q.role}
                  avatarUrl={q.avatarUrl ?? undefined}
                />
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
