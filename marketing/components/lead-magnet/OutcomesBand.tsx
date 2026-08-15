type Outcome = {
  num: string;
  label: string;
  body: string;
  cite?: string;
};

type Props = {
  items: Outcome[];
};

/**
 * 3-up outcome band — large gradient numerals + supporting label + body.
 * Uses the same quiet proof surface as the homepage capability band.
 */
export function OutcomesBand({ items }: Props) {
  return (
    <section className="bg-section-soft-blue">
      <div className="mx-auto max-w-container px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12">
          {items.map((item, i) => (
            <article key={i} className="relative flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white/80 p-6 shadow-sm backdrop-blur">
              <span
                className="font-display text-5xl font-bold leading-none tracking-tight sm:text-6xl"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #00F0FF 0%, #3b82f6 60%, #2563eb 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {item.num}
              </span>
              <p className="mt-3 text-sm font-semibold uppercase tracking-[0.14em] text-ink-900">
                {item.label}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {item.body}
              </p>
              {item.cite && (
                <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-ink-200">
                  {item.cite}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
