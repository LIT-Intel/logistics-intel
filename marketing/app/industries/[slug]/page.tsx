import type { Metadata } from "next";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sanityClient } from "@/sanity/lib/client";
import { INDUSTRY_QUERY, ALL_INDUSTRY_SLUGS } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { PageHero } from "@/components/sections/PageHero";
import { KpiStrip } from "@/components/sections/KpiStrip";
import { ProseShell } from "@/components/sections/ProseShell";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata, siteUrl } from "@/lib/seo";

export const revalidate = 1800;

export async function generateStaticParams() {
  const items = (await sanityClient.fetch<{ slug: string }[]>(ALL_INDUSTRY_SLUGS).catch(() => [])) || [];
  return items.filter((i) => i.slug).map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const item = await sanityClient.fetch<any>(INDUSTRY_QUERY, { slug: params.slug }).catch(() => null);
  if (!item) return buildMetadata({ title: "Industry not found", path: `/industries/${params.slug}` });
  return buildMetadata({
    title: `${item.name} — outbound playbook for revenue teams`,
    description: item.tagline || `How LIT works for ${item.name.toLowerCase()} revenue teams.`,
    path: `/industries/${params.slug}`,
    eyebrow: "Industry",
    seo: item.seo,
  });
}

export default async function IndustryPage({ params }: { params: { slug: string } }) {
  const item = await sanityClient.fetch<any>(INDUSTRY_QUERY, { slug: params.slug }).catch(() => null);
  if (!item) notFound();

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Industries", href: "/industries" },
          { label: item.name },
        ]}
      />

      <PageHero
        eyebrow={`Industry · ${item.name}`}
        title={`Outbound playbook for`}
        titleHighlight={item.name.toLowerCase()}
        titleSuffix="revenue teams."
        subtitle={item.tagline}
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Try free", href: APP_SIGNUP_URL }}
      />

      {item.kpis?.length > 0 && <KpiStrip kpis={item.kpis} />}

      {item.body && <ProseShell value={item.body} />}

      {item.topLanes?.length > 0 && (
        <section className="px-5 sm:px-8 py-10">
          <div className="mx-auto max-w-container">
            <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
              Top lanes for {item.name}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {item.topLanes.map((l: any) => (
                <Link
                  key={l.slug?.current || l.title}
                  href={`/lanes/${l.slug?.current}`}
                  className="group rounded-xl border border-ink-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md"
                >
                  <div className="font-display text-[14px] font-semibold text-ink-900 group-hover:text-brand-blue-700">
                    {l.title}
                  </div>
                  {l.kpis?.[0]?.value && (
                    <div className="font-mono mt-2 text-[16px] font-semibold text-brand-blue-700">
                      {l.kpis[0].value}{" "}
                      <span className="font-display text-[10.5px] font-bold uppercase tracking-wider text-ink-500">
                        {l.kpis[0].label}
                      </span>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {item.relatedCaseStudies?.length > 0 && (
        <section className="px-5 sm:px-8 py-10">
          <div className="mx-auto max-w-container">
            <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
              Customer stories
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {item.relatedCaseStudies.map((c: any) => (
                <Link
                  key={c.slug?.current || c.customer}
                  href={`/customers/${c.slug?.current}`}
                  className="group rounded-2xl border border-ink-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md"
                >
                  <div className="font-display text-[15px] font-semibold text-ink-900">{c.customer}</div>
                  <div className="font-display mt-2 text-[18px] font-semibold leading-tight tracking-[-0.015em] text-ink-900 group-hover:text-brand-blue-700">
                    {c.headline}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBanner />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: `${item.name} outbound playbook — Logistic Intel`,
            url: siteUrl(`/industries/${params.slug}`),
            about: item.name,
          }),
        }}
      />
    </PageShell>
  );
}
