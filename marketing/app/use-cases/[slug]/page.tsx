import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import * as Icons from "lucide-react";
import { sanityClient } from "@/sanity/lib/client";
import { USE_CASE_QUERY, ALL_USE_CASE_SLUGS } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { PageHero } from "@/components/sections/PageHero";
import { KpiStrip } from "@/components/sections/KpiStrip";
import { LogoRail } from "@/components/sections/LogoRail";
import { FaqSection } from "@/components/sections/FaqSection";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { resolveLogoUrl } from "@/lib/sanityImage";

export const revalidate = 1800;

export async function generateStaticParams() {
  const items = (await sanityClient.fetch<{ slug: string }[]>(ALL_USE_CASE_SLUGS).catch(() => [])) || [];
  return items.filter((i) => i.slug).map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const u = await sanityClient.fetch<any>(USE_CASE_QUERY, { slug: params.slug }).catch(() => null);
  if (!u) return buildMetadata({ title: "Use case not found", path: `/use-cases/${params.slug}` });
  return buildMetadata({
    title: `Sales Intelligence for ${u.persona} | LIT`,
    description: u.subhead,
    path: `/use-cases/${params.slug}`,
    eyebrow: u.persona,
    seo: u.seo,
  });
}

export default async function UseCasePage({ params }: { params: { slug: string } }) {
  const u = await sanityClient.fetch<any>(USE_CASE_QUERY, { slug: params.slug }).catch(() => null);
  if (!u) notFound();

  const cs = u.featuredCaseStudy;
  const csLogo = cs ? resolveLogoUrl({ logo: cs.logo, domain: cs.domain }, 96) : null;

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Use cases", href: "/use-cases" },
          { label: u.persona },
        ]}
      />

      <PageHero
        eyebrow={`Use case · ${u.persona}`}
        title={u.headline}
        titleHighlight={u.headlineHighlight}
        subtitle={u.subhead}
        primaryCta={{ label: "Start Prospecting", href: "https://app.logisticintel.com/signup", icon: "arrow" }}
        secondaryCta={{ label: "Book a Demo", href: "/demo" }}
      />

      {u.kpis?.length > 0 && <KpiStrip kpis={u.kpis} />}

      {u.painPoints?.length > 0 && (
        <section className="px-8 py-16">
          <div className="mx-auto max-w-container">
            <div className="mx-auto max-w-[680px] text-center">
              <div className="eyebrow">The pain</div>
              <h2 className="display-lg mt-3">Where {u.persona.toLowerCase()} keep losing time.</h2>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
              {u.painPoints.map((p: any, i: number) => {
                const Icon = (p.icon ? (Icons as any)[p.icon] : null) as any;
                return (
                  <div
                    key={`${p.title}-${i}`}
                    className="rounded-2xl border border-ink-100 bg-white p-7 shadow-sm"
                  >
                    {Icon && (
                      <div
                        className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                        style={{
                          background: "rgba(244,114,114,0.08)",
                          boxShadow: "inset 0 0 0 1px rgba(244,114,114,0.2)",
                        }}
                      >
                        <Icon className="h-5 w-5 text-rose-500" />
                      </div>
                    )}
                    <h3 className="display-sm">{p.title}</h3>
                    <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">{p.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {u.plays?.length > 0 && (
        <section className="px-8 py-16">
          <div className="mx-auto max-w-container">
            <div className="mx-auto max-w-[680px] text-center">
              <div className="eyebrow">Plays we power</div>
              <h2 className="display-lg mt-3">How {u.persona.toLowerCase()} actually use LIT.</h2>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
              {u.plays.map((p: any, i: number) => {
                const Icon = (p.icon ? (Icons as any)[p.icon] : null) as any;
                return (
                  <div
                    key={`${p.title}-${i}`}
                    className="rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
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
                    <h3 className="display-sm">{p.title}</h3>
                    <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">{p.body}</p>
                    {p.tags?.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {p.tags.map((t: string) => (
                          <span
                            key={t}
                            className="font-mono inline-flex items-center rounded-full border border-ink-100 bg-ink-25 px-2 py-0.5 text-[10.5px] font-medium text-ink-500"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {cs && (
        <section className="px-8 py-16">
          <div className="mx-auto max-w-container">
            <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
              Featured customer
            </div>
            <Link
              href={`/customers/${cs.slug?.current}`}
              className="group flex flex-col gap-6 rounded-3xl border border-ink-100 bg-white p-8 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg md:flex-row md:items-center"
            >
              <div className="flex shrink-0 items-center gap-4">
                {csLogo && (
                  <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-ink-100 bg-white">
                    <Image
                      src={csLogo}
                      alt={cs.customer}
                      fill
                      sizes="48px"
                      className="object-contain p-1.5"
                      unoptimized={csLogo.includes("img.logo.dev")}
                    />
                  </div>
                )}
                <div>
                  <div className="font-display text-[18px] font-semibold text-ink-900">{cs.customer}</div>
                </div>
              </div>
              <div className="flex-1">
                <div className="font-display text-[20px] font-semibold leading-tight tracking-[-0.015em] text-ink-900 group-hover:text-brand-blue-700">
                  {cs.headline}
                </div>
                {cs.quote?.text && (
                  <div className="font-body mt-3 text-[14px] italic leading-relaxed text-ink-700">
                    "{cs.quote.text}"
                  </div>
                )}
              </div>
              {cs.kpis?.length > 0 && (
                <div className="grid grid-cols-3 gap-4 md:w-auto md:shrink-0">
                  {cs.kpis.slice(0, 3).map((k: any, i: number) => (
                    <div key={i} className="text-center">
                      <div className="font-mono text-[20px] font-semibold tracking-[-0.01em] text-brand-blue-700">
                        {k.value}
                      </div>
                      <div className="font-display mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-500">
                        {k.label}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Link>
          </div>
        </section>
      )}

      {u.logos?.length > 0 && <LogoRail eyebrow="Used by" logos={u.logos} />}

      {u.faq?.length > 0 && (
        <FaqSection
          faqs={u.faq.map((f: any) => ({ question: f.question, answer: f.answer }))}
        />
      )}

      <CtaBanner
        eyebrow="See it on your accounts"
        title={`A 30-min walk through LIT, tuned for ${u.persona.toLowerCase()}.`}
        subtitle="No deck. We load your accounts and walk through the workflow live."
        primaryCta={{ label: "Book a Demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free", href: "https://app.logisticintel.com/signup" }}
      />

      {u.faq?.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: u.faq.map((f: any) => ({
                "@type": "Question",
                name: f.question,
                acceptedAnswer: { "@type": "Answer", text: f.answer },
              })),
            }),
          }}
        />
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: `Sales Intelligence for ${u.persona} — LIT`,
            url: siteUrl(`/use-cases/${params.slug}`),
            about: u.persona,
          }),
        }}
      />
    </PageShell>
  );
}
