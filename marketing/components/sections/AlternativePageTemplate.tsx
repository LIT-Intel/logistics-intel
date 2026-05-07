import { ArrowRight, Check, Minus } from "lucide-react";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/sections/Section";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { HubCard } from "@/components/sections/HubCard";
import type { AlternativePage } from "@/app/alternatives/_data";

export function AlternativePageTemplate({ data }: { data: AlternativePage }) {
  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Alternatives", href: "/alternatives" },
          { label: `${data.competitor} alternative` },
        ]}
      />
      <PageHero
        eyebrow={`${data.competitor} alternative`}
        title={`The ${data.competitor} alternative for`}
        titleHighlight="freight revenue teams."
        subtitle={data.lede}
        primaryCta={{ label: "Try free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "See full comparison", href: `/vs/${data.fullComparisonSlug}` }}
      />

      <Section top="none" bottom="md">
        <div className="rounded-2xl border border-ink-100 bg-white p-6 sm:p-8 shadow-sm">
          <div className="font-display text-[11px] font-bold uppercase tracking-[0.12em] text-brand-blue">
            Short answer
          </div>
          <p className="font-body mt-3 text-[16px] leading-relaxed text-ink-700">
            {data.shortAnswer}
          </p>
        </div>
      </Section>

      <Section top="md" bottom="md">
        <div className="mb-8 sm:mb-10 max-w-[640px]">
          <div className="eyebrow">Why teams switch</div>
          <h2 className="display-md mt-3">
            What LIT does that {data.competitor} <span className="grad-text">doesn't.</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
          {data.switchReasons.map((r) => (
            <div
              key={r.title}
              className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm transition hover:border-brand-blue/30 hover:shadow-md"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "rgba(37,99,235,0.08)", boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.15)" }}>
                <Check className="h-4 w-4 text-brand-blue" aria-hidden />
              </div>
              <div className="font-display mt-4 text-[16px] font-semibold text-ink-900">{r.title}</div>
              <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">{r.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section top="md" bottom="md">
        <div className="mb-6 sm:mb-8 max-w-[640px]">
          <div className="eyebrow">Side by side</div>
          <h2 className="display-md mt-3">
            LIT vs {data.competitor}, <span className="grad-text">in five rows.</span>
          </h2>
        </div>
        <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-25">
                <th className="font-display px-4 sm:px-6 py-4 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-500">
                  Dimension
                </th>
                <th className="font-display px-4 sm:px-6 py-4 text-[12px] font-bold uppercase tracking-[0.08em] text-brand-blue-700">
                  LIT
                </th>
                <th className="font-display px-4 sm:px-6 py-4 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-500">
                  {data.competitor}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.miniCompare.map((row, i) => (
                <tr key={row.dimension} className={i % 2 === 1 ? "bg-ink-25/40" : ""}>
                  <td className="font-display px-4 sm:px-6 py-4 text-[13.5px] font-semibold text-ink-900">
                    {row.dimension}
                  </td>
                  <td className="font-body px-4 sm:px-6 py-4 text-[13.5px] text-ink-700">
                    <span className="inline-flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                      {row.lit}
                    </span>
                  </td>
                  <td className="font-body px-4 sm:px-6 py-4 text-[13.5px] text-ink-500">
                    <span className="inline-flex items-center gap-2">
                      <Minus className="h-3.5 w-3.5 text-ink-200" aria-hidden />
                      {row.competitor}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {data.related.length > 0 && (
        <Section top="md" bottom="lg">
          <div className="mb-6 sm:mb-8">
            <div className="eyebrow">Related</div>
            <h2 className="display-md mt-3">Keep exploring.</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.related.map((r) => (
              <HubCard key={r.href} href={r.href} variant="compact" className="flex items-center justify-between">
                <span className="font-display text-[14.5px] font-semibold text-ink-900 group-hover:text-brand-blue-700">
                  {r.label}
                </span>
                <ArrowRight className="h-4 w-4 text-ink-200 group-hover:text-brand-blue" aria-hidden />
              </HubCard>
            ))}
          </div>
        </Section>
      )}

      <CtaBanner
        eyebrow="See it on your real lanes"
        title={`Why teams pick LIT over ${data.competitor}.`}
        subtitle="A 30-minute demo on your real lanes is faster than reading the full comparison. We'll pull up your top 5 target accounts and show which are actively shipping right now."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free", href: APP_SIGNUP_URL }}
      />
    </PageShell>
  );
}
