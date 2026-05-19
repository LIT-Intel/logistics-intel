export type Testimonial = {
  quote: string;
  initials: string;
  name: string;
  role: string;
  metric?: string;
};

export type TestimonialTrioProps = {
  eyebrow?: string;
  heading?: string;
  quotes: Testimonial[];
};

export function TestimonialTrio({
  eyebrow = "What freight teams say",
  heading = "Built for the way freight is sold.",
  quotes,
}: TestimonialTrioProps) {
  return (
    <section className="bg-gradient-to-b from-[#020617] to-[#0b1230] py-20 sm:py-24">
      <div className="mx-auto max-w-container px-4 sm:px-6">
        <header className="mb-12 text-center">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-400">
            {eyebrow}
          </p>
          <h2 className="mt-3.5 font-display text-[clamp(28px,3.4vw,40px)] font-bold leading-tight tracking-[-0.02em] text-white [text-wrap:balance]">
            {heading}
          </h2>
        </header>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {quotes.map((q, i) => (
            <figure key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-7">
              <div className="mb-3 text-[14px] tracking-[2px] text-amber-400">★★★★★</div>
              <blockquote className="font-display text-[17px] font-medium leading-[1.45] text-white">
                {q.quote}
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 font-display text-[13px] font-bold text-white">
                  {q.initials}
                </div>
                <div>
                  <div className="font-display text-[14px] font-semibold text-white">{q.name}</div>
                  <div className="font-mono text-[11px] text-white/55">{q.role}</div>
                </div>
              </figcaption>
              {q.metric && (
                <div className="mt-3.5 border-t border-white/10 pt-3.5 font-mono text-[11px] text-white/55">
                  {q.metric}
                </div>
              )}
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
