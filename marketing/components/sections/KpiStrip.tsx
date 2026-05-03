/**
 * Three- to five-cell KPI strip used after the hero on programmatic pages
 * (lanes, industries, use cases). Mono numbers + uppercase labels — same
 * styling vocabulary as the in-app Pulse KPI rail.
 */
export function KpiStrip({ kpis }: { kpis: Array<{ value: string; label: string; sublabel?: string }> }) {
  if (!kpis?.length) return null;
  return (
    <section className="px-8 py-10">
      <div className="mx-auto max-w-container">
        <div
          className="grid grid-cols-2 gap-x-8 gap-y-6 rounded-2xl border border-ink-100 bg-white px-7 py-6 shadow-sm md:grid-cols-3 lg:grid-cols-5"
        >
          {kpis.map((k) => (
            <div key={k.label}>
              <div className="font-mono text-[26px] font-semibold tracking-[-0.01em] text-brand-blue-700">
                {k.value}
              </div>
              <div className="font-display mt-1 text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-500">
                {k.label}
              </div>
              {k.sublabel && (
                <div className="font-body mt-0.5 text-[12px] text-ink-200">{k.sublabel}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
