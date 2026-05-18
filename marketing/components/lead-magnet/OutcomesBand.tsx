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
 * Renders inside a dark surface; the caller is responsible for the section
 * background if a different treatment is needed.
 */
export function OutcomesBand({ items }: Props) {
  return (
    <section className="bg-dark-0 text-white">
      <div className="mx-auto max-w-container px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12">
          {items.map((item, i) => (
            <article key={i} className="flex flex-col">
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
              <p className="mt-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/85">
                {item.label}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-white/65">
                {item.body}
              </p>
              {item.cite && (
                <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-white/35">
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
