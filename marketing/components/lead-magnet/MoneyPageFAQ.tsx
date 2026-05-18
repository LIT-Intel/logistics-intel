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
    <section className="bg-dark-0 text-white">
      <div className="mx-auto max-w-container-narrow px-4 py-16 sm:px-6 lg:py-20">
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Frequently asked
        </h2>
        <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
          {items.map((item, i) => (
            <details key={i} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-white">
                <span>{item.question}</span>
                <span
                  aria-hidden
                  className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 text-brand-cyan transition group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-white/70">
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
