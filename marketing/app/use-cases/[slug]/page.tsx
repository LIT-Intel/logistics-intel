import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { sanityClient } from "@/sanity/lib/client";
import { USE_CASE_QUERY, ALL_USE_CASE_SLUGS } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { PageHero } from "@/components/sections/PageHero";
import { KpiStrip } from "@/components/sections/KpiStrip";
import { ProseShell } from "@/components/sections/ProseShell";
import { LogoRail } from "@/components/sections/LogoRail";
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
    title: `${u.name} — how LIT works for ${u.persona || "revenue teams"}`,
    description: u.tagline,
    path: `/use-cases/${params.slug}`,
    eyebrow: "Use case",
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
          { label: u.name },
        ]}
      />

      <PageHero
        eyebrow={`Use case · ${u.persona || "Revenue teams"}`}
        title={u.name}
        subtitle={u.tagline}
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Try free", href: "https://app.logisticintel.com/signup" }}
      />

      {u.kpis?.length > 0 && <KpiStrip kpis={u.kpis} />}

      {u.body && <ProseShell value={u.body} />}

      {cs && (
        <section className="px-8 py-12">
          <div className="mx-auto max-w-container">
            <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
              Featured customer
            </div>
            <Link
              href={`/customers/${cs.slug?.current}`}
              className="group flex flex-col gap-6 rounded-3xl border border-ink-100 bg-white p-8 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg md:flex-row md:items-center"
            >
              <div className="flex shrink-0 items-center gap-4">
                {csLogo ? (
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
                ) : null}
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

      <CtaBanner />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: `${u.name} — Logistic Intel`,
            url: siteUrl(`/use-cases/${params.slug}`),
            about: u.name,
          }),
        }}
      />
    </PageShell>
  );
}
