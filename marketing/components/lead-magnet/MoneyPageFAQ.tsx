type FAQ = { question: string; answer: string };

type Props = {
  items: FAQ[];
  /** Emit FAQPage JSON-LD inline. Defaults to true. */
  emitJsonLd?: boolean;
};

/**
 * Native `<details>` accordion FAQ. Server-renders FAQPage structured
 * data inline so it's crawlable without client JS. Pass emitJsonLd=false
 * if a parent page already controls the FAQPage schema (avoid duplicates).
 */
export function MoneyPageFAQ({ items, emitJsonLd = true }: Props) {
  const jsonLd = emitJsonLd
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      }
    : null;

  return (
    <section className="bg-section-soft-blue">
      <div className="mx-auto max-w-container-narrow px-4 py-16 sm:px-6 lg:py-20">
        <div className="eyebrow">Questions before you start</div>
        <h2 className="font-display mt-3 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
          Frequently asked
        </h2>
        <div className="mt-8 space-y-3">
          {items.map((item, i) => (
            <details key={i} className="group rounded-2xl border border-ink-100 bg-white/85 px-5 py-4 shadow-sm backdrop-blur open:border-blue-200">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-ink-900">
                <span>{item.question}</span>
                <span
                  aria-hidden
                  className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-blue-200 text-blue-600 transition group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-prose border-t border-ink-100 pt-3 text-sm leading-relaxed text-ink-500">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>

      {jsonLd && (
        <script
          type="application/ld+json"
          // FAQPage JSON-LD — server-rendered so it's crawlable.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
    </section>
  );
}
