export type Step = {
  eyebrow?: string;
  title: string;
  body: string;
  meta?: string;
};

/**
 * `StepsRow` — 3-step "how it works" grid. Each `.step-card` carries
 * a huge translucent blue gradient `01 / 02 / 03` numeral bleeding off
 * the top, a blue eyebrow with a pulsing dot, an H3, body copy, and a
 * monospace meta footer. The numeral gradient is BLUE — never cyan —
 * to keep the section visually consistent with the page chrome.
 */
export function StepsRow({
  eyebrow,
  heading,
  lede,
  steps,
}: {
  eyebrow: string;
  heading: string;
  lede?: string;
  steps: Step[];
}) {
  return (
    <section className="px-5 sm:px-8 py-20 sm:py-24">
      <div className="mx-auto max-w-container">
        <header className="mx-auto max-w-[720px] text-center">
          <div className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-brand-blue-700">
            {eyebrow}
          </div>
          <h2 className="font-display mt-3 text-balance text-[clamp(28px,3vw,42px)] font-bold leading-[1.1] tracking-[-0.024em] text-ink-900">
            {heading}
          </h2>
          {lede && (
            <p className="mx-auto mt-4 max-w-[600px] text-[16px] leading-relaxed text-ink-500">
              {lede}
            </p>
          )}
        </header>

        <div className="steps-row">
          {steps.slice(0, 3).map((s, i) => (
            <article key={i} className="step-card">
              <div className="step-num" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="step-eyebrow">
                <span className="dot" aria-hidden />
                {s.eyebrow || `Step ${i + 1}`}
              </div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              {s.meta && <div className="step-meta">{s.meta}</div>}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
