import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { INDUSTRIES, getIndustry } from "../_industries";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";

/**
 * /freight-leads/[industry] — programmatic vertical detail pages backed by
 * marketing/app/freight-leads/_industries.ts. Targets "freight leads for
 * [vertical]" queries with real HS-code priors, lane highlights, signal
 * examples, pain points, and FAQ per industry.
 *
 * Visual language pulls from the /freight-leads money page (dark CTA bands,
 * cyan glow on dark only) and the /use-cases/[slug] detail template
 * (PageShell + BreadcrumbBar). Cyan (#00F0FF) is restricted to dark surfaces.
 *
 * Hardcoded as `dynamicParams = false` — only the 6 industries in the data
 * file render. Unknown slugs 404.
 */

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ industry: i.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { industry: string };
}): Promise<Metadata> {
  const i = getIndustry(params.industry);
  if (!i) return {};
  return buildMetadata({
    path: `/freight-leads/${i.slug}`,
    title: i.seo.title,
    description: i.seo.description,
    eyebrow: `Freight leads · ${i.industry}`,
  });
}

export default function FreightLeadsIndustryPage({
  params,
}: {
  params: { industry: string };
}) {
  const i = getIndustry(params.industry);
  if (!i) notFound();

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: i.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: i.seo.title,
    description: i.seo.description,
    url: siteUrl(`/freight-leads/${i.slug}`),
    about: i.industry,
  };

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Freight leads", href: "/freight-leads" },
          { label: i.industry },
        ]}
      />

      {/* 1. Hero — dark surface, cyan glow allowed */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#020617] to-[#0b1230] px-5 py-20 sm:px-8 sm:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(0,240,255,0.16), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-container">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-brand-cyan">
            Freight leads · {i.industry}
          </p>
          <h1 className="font-display max-w-3xl text-[clamp(32px,4.6vw,56px)] font-bold leading-[1.04] tracking-[-0.025em] text-white text-balance">
            {i.headline}
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-[1.55] text-white/75">
            {i.subhead}
          </p>
          <p className="mt-3 max-w-2xl text-[14px] font-medium text-white/55">
            {i.audienceLine}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={APP_SIGNUP_URL}
              className="inline-flex items-center justify-center rounded-full bg-brand-cyan px-6 py-3 font-display text-[14px] font-bold text-[#020617] shadow-[0_0_30px_rgba(0,240,255,0.35)] transition hover:bg-white"
            >
              Start free →
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/[0.04] px-6 py-3 font-display text-[14px] font-semibold text-white transition hover:border-white/40 hover:bg-white/[0.08]"
            >
              Book a demo
            </Link>
          </div>
        </div>
      </section>

      {/* 2. Top shipper profiles — light surface */}
      <section className="px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-container">
          <div className="mx-auto max-w-[680px] text-center">
            <div className="eyebrow">Who you can reach</div>
            <h2 className="display-lg mt-3">
              Top {i.industry.toLowerCase()} shipper profiles in the index.
            </h2>
            <p className="font-body mt-4 text-[15px] leading-relaxed text-ink-500">
              Live importer records pulled from customs manifests, joined to verified
              decision-maker contacts in supply chain, logistics, and procurement roles.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {i.topShipperProfiles.map((profile, idx) => (
              <div
                key={`${profile}-${idx}`}
                className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
              >
                <div className="font-mono mb-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-blue-700">
                  Profile · {String(idx + 1).padStart(2, "0")}
                </div>
                <p className="font-display text-[16px] font-semibold leading-snug text-ink-900">
                  {profile}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Lanes highlighted */}
      <section className="bg-ink-25 px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-container">
          <div className="mx-auto max-w-[680px] text-center">
            <div className="eyebrow">Lanes we see most</div>
            <h2 className="display-lg mt-3">
              {i.industry} freight lanes with the highest activity.
            </h2>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {i.lanesHighlighted.map((lane, idx) => (
              <div
                key={`${lane.from}-${lane.to}-${idx}`}
                className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm"
              >
                <div className="flex items-center gap-2 text-ink-900">
                  <span className="font-display text-[15px] font-semibold">
                    {lane.from}
                  </span>
                  <span className="text-brand-blue">→</span>
                  <span className="font-display text-[15px] font-semibold">
                    {lane.to}
                  </span>
                </div>
                <p className="font-body mt-3 text-[13.5px] leading-relaxed text-ink-500">
                  {lane.cargo}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Signal examples — dark surface, cyan accents */}
      <section className="bg-gradient-to-b from-[#0b1230] to-[#020617] px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-container">
          <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-brand-cyan">
                Pulse AI signals
              </p>
              <h2 className="font-display text-[clamp(28px,3.8vw,44px)] font-bold leading-[1.06] tracking-[-0.025em] text-white text-balance">
                What Pulse AI surfaces for {i.industry.toLowerCase()}.
              </h2>
              <p className="mt-4 max-w-lg text-[16px] leading-[1.55] text-white/70">
                Saved searches and watchlists generate weekly digests on every shift
                that matters — new origins, lane volume swings, carrier changes, port
                diversification, and first-time HS entries.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7">
              <ul className="space-y-4">
                {i.signalExamples.map((sig, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-cyan shadow-[0_0_8px_rgba(0,240,255,0.6)]" />
                    <span className="text-[14.5px] leading-relaxed text-white/85">
                      {sig}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Pain points — light surface */}
      <section className="px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-container">
          <div className="mx-auto max-w-[680px] text-center">
            <div className="eyebrow">Where this industry loses time</div>
            <h2 className="display-lg mt-3">
              The pain points your prospects actually feel.
            </h2>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
            {i.painPoints.map((p, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-ink-100 bg-white p-7 shadow-sm"
              >
                <div
                  className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl font-display text-[13px] font-bold text-rose-500"
                  style={{
                    background: "rgba(244,114,114,0.08)",
                    boxShadow: "inset 0 0 0 1px rgba(244,114,114,0.2)",
                  }}
                >
                  {String(idx + 1).padStart(2, "0")}
                </div>
                <p className="font-body text-[15px] leading-relaxed text-ink-700">
                  {p}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. HS-code hints — badge row, light surface */}
      <section className="bg-ink-25 px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-container">
          <div className="mx-auto max-w-[680px] text-center">
            <div className="eyebrow">HS-code priors</div>
            <h2 className="display-lg mt-3">
              The HS lines that anchor {i.industry.toLowerCase()} freight.
            </h2>
            <p className="font-body mt-4 text-[15px] leading-relaxed text-ink-500">
              Every importer search supports HS-code filters. These are the lines that
              drive the bulk of activity for this industry.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {i.hsHints.map((hs) => (
              <div
                key={hs.code}
                className="flex items-center gap-3 rounded-full border border-ink-100 bg-white px-4 py-2.5 shadow-sm"
              >
                <span className="font-mono rounded-md bg-brand-blue/10 px-2 py-1 text-[12px] font-bold tracking-[0.04em] text-brand-blue-700">
                  HS {hs.code}
                </span>
                <span className="font-body text-[13.5px] text-ink-700">
                  {hs.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. FAQ — light surface */}
      <section className="px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-container">
          <div className="mx-auto max-w-[680px] text-center">
            <div className="eyebrow">FAQ</div>
            <h2 className="display-lg mt-3">
              Common questions about freight leads for {i.industry.toLowerCase()}.
            </h2>
          </div>
          <div className="mx-auto mt-10 max-w-3xl space-y-4">
            {i.faq.map((f, idx) => (
              <details
                key={idx}
                className="group rounded-2xl border border-ink-100 bg-white p-6 shadow-sm transition-all open:shadow-md"
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                  <span className="font-display text-[16px] font-semibold leading-snug text-ink-900">
                    {f.q}
                  </span>
                  <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink-200 text-ink-500 transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="font-body mt-3 text-[14.5px] leading-relaxed text-ink-700">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 8. CTA banner — dark surface */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#020617] to-[#0b1230] px-5 py-20 sm:px-8 sm:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(0,240,255,0.14), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-container text-center">
          <h2 className="font-display mx-auto max-w-3xl text-[clamp(28px,3.8vw,44px)] font-bold leading-[1.06] tracking-[-0.025em] text-white text-balance">
            Start sourcing freight leads in {i.industry.toLowerCase()}.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[16px] leading-[1.55] text-white/70">
            10 searches and 10 verified contact enrichments on us. No credit card. Cancel anytime.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={APP_SIGNUP_URL}
              className="inline-flex items-center justify-center rounded-full bg-brand-cyan px-6 py-3 font-display text-[14px] font-bold text-[#020617] shadow-[0_0_30px_rgba(0,240,255,0.35)] transition hover:bg-white"
            >
              Start free →
            </Link>
            <Link
              href="/freight-leads"
              className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/[0.04] px-6 py-3 font-display text-[14px] font-semibold text-white transition hover:border-white/40 hover:bg-white/[0.08]"
            >
              Back to all freight leads
            </Link>
          </div>
        </div>
      </section>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </PageShell>
  );
}
