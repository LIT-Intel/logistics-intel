import Link from "next/link";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/sections/Section";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { HubCard } from "@/components/sections/HubCard";
import type { FeaturePage } from "@/app/features/_data";

/**
 * Canonical feature-page renderer. Every `/features/[slug]` route plus the
 * sibling `/solutions/[slug]` template share this layout, so the site
 * reads as one product across 24+ programmatic pages instead of 24
 * one-off compositions. Sections render only when the data is present —
 * no empty rails.
 */
export function FeaturePageTemplate({
  data,
  parent,
}: {
  data: FeaturePage;
  /** Where this page sits in the site graph — drives breadcrumbs + cluster. */
  parent: { label: string; href: string };
}) {
  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: parent.label, href: parent.href },
          { label: data.eyebrow },
        ]}
      />
      <PageHero
        eyebrow={data.eyebrow}
        title={data.title}
        titleHighlight={data.titleHighlight}
        subtitle={data.lede}
        primaryCta={{ label: "Try free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />

      {/* AEO surface: a self-contained "short answer" paragraph LLMs and
          AI search overviews can quote verbatim. Kept above the fold. */}
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-ink-100 bg-white p-6 sm:p-8">
            <div className="eyebrow">The problem</div>
            <p className="font-body mt-3 text-[15.5px] leading-relaxed text-ink-700">
              {data.problem}
            </p>
          </div>
          <div
            className="rounded-2xl p-6 sm:p-8 text-white"
            style={{
              background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
              boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
            }}
          >
            <div className="font-display text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "#00F0FF" }}>
              How LIT solves it
            </div>
            <p className="font-body mt-3 text-[15.5px] leading-relaxed text-ink-150">
              {data.solution}
            </p>
          </div>
        </div>
      </Section>

      <Section top="md" bottom="md">
        <div className="mb-8 sm:mb-10">
          <div className="eyebrow">Capabilities</div>
          <h2 className="display-md mt-3">What's in the box.</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data.capabilities.map((c) => (
            <div
              key={c.title}
              className="rounded-2xl border border-ink-100 bg-white p-5 sm:p-6 shadow-sm transition hover:border-brand-blue/30 hover:shadow-md"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "rgba(37,99,235,0.08)", boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.15)" }}>
                <Check className="h-4 w-4 text-brand-blue" aria-hidden />
              </div>
              <div className="font-display mt-4 text-[15.5px] font-semibold text-ink-900">{c.title}</div>
              <p className="font-body mt-1.5 text-[13.5px] leading-relaxed text-ink-500">{c.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {data.workflow && data.workflow.length > 0 && (
        <Section top="md" bottom="md">
          <div className="mb-8 sm:mb-10 max-w-[640px]">
            <div className="eyebrow">Workflow</div>
            <h2 className="display-md mt-3">From signal to booked freight.</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
            {data.workflow.map((s, i) => (
              <div key={s.step} className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
                <div className="font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-brand-blue">
                  Step {String(i + 1).padStart(2, "0")}
                </div>
                <div className="font-display mt-2 text-[18px] font-semibold text-ink-900">{s.step}</div>
                <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">{s.body}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section top="md" bottom="md">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr,3fr]">
          <div>
            <div className="eyebrow">Who it's for</div>
            <h2 className="display-md mt-3">Built around the team using it.</h2>
          </div>
          <ul className="space-y-3">
            {data.whoItsFor.map((p) => (
              <li
                key={p}
                className="flex items-start gap-3 rounded-xl border border-ink-100 bg-white p-4 shadow-sm"
              >
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: "rgba(37,99,235,0.08)" }}>
                  <Check className="h-3.5 w-3.5 text-brand-blue" aria-hidden />
                </div>
                <span className="font-body text-[14.5px] leading-relaxed text-ink-700">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {data.faqs.length > 0 && (
        <Section top="md" bottom="md" width="narrow">
          <div className="eyebrow">FAQs</div>
          <h2 className="display-md mt-3">Common questions.</h2>
          <div className="mt-8 space-y-3">
            {data.faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-2xl border border-ink-100 bg-white px-5 py-4 sm:px-6 shadow-sm transition open:border-brand-blue/30 open:shadow-md"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <span className="font-display text-[15.5px] font-semibold leading-snug text-ink-900">
                    {f.q}
                  </span>
                  <ChevronDown className="h-5 w-5 shrink-0 text-ink-500 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="font-body mt-3 border-t border-ink-100 pt-3 text-[14.5px] leading-relaxed text-ink-700">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </Section>
      )}

      {data.related.length > 0 && (
        <Section top="md" bottom="lg">
          <div className="mb-6 sm:mb-8">
            <div className="eyebrow">Related</div>
            <h2 className="display-md mt-3">Keep digging.</h2>
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
        eyebrow="See it on your real data"
        title="Book a 30-minute demo."
        subtitle="We'll pull this exact view up against your top 5 target accounts so you can see the signal on lanes you actually sell into."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free", href: APP_SIGNUP_URL }}
      />

      <Link
        href={parent.href}
        className="block px-5 sm:px-8 pb-12"
      >
        <div className="mx-auto max-w-container">
          <span className="font-display inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-500 hover:text-brand-blue-700">
            <ArrowRight className="h-3.5 w-3.5 rotate-180" aria-hidden />
            Back to {parent.label.toLowerCase()}
          </span>
        </div>
      </Link>
    </PageShell>
  );
}
