import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Feature = {
  icon?: string;
  tag?: string;
  title: string;
  body: string;
};

/**
 * Reusable 2- or 3-column feature grid. `icon` is the kebab/pascal name of
 * any lucide-react icon (e.g. "Sparkles", "Globe", "BarChart3"). Falls back
 * to a hover-only treatment when no icon is supplied.
 */
export function FeatureGrid({
  eyebrow,
  title,
  subtitle,
  features,
  cols = 3,
}: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  features: Feature[];
  cols?: 2 | 3;
}) {
  if (!features?.length) return null;
  const gridClass = cols === 2 ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3";
  return (
    <section className="px-5 sm:px-8 py-12 sm:py-20">
      <div className="mx-auto max-w-container">
        {(eyebrow || title || subtitle) && (
          <div className="mx-auto max-w-[780px] text-center">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2 className="display-lg mt-3">{title}</h2>}
            {subtitle && <p className="lead mx-auto mt-3 max-w-[640px]">{subtitle}</p>}
          </div>
        )}
        <div className={`mt-12 grid grid-cols-1 gap-5 ${gridClass}`}>
          {features.map((f, i) => {
            const Icon = (f.icon ? (Icons as any)[f.icon] : null) as LucideIcon | null;
            return (
              <div
                key={`${f.title}-${i}`}
                className="group rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
              >
                {Icon && (
                  <div
                    className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{
                      background: "rgba(37,99,235,0.08)",
                      boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.15)",
                    }}
                  >
                    <Icon className="h-5 w-5 text-brand-blue" />
                  </div>
                )}
                {f.tag && (
                  <div className="font-display text-[11px] font-bold uppercase tracking-wider text-brand-blue">
                    {f.tag}
                  </div>
                )}
                <h3 className="display-sm mt-2">{f.title}</h3>
                <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">{f.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
