import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { sanityClient } from "@/sanity/lib/client";
import { CASE_STUDY_QUERY } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { ProseShell } from "@/components/sections/ProseShell";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { resolveLogoUrl } from "@/lib/sanityImage";

export const revalidate = 600;

export async function generateStaticParams() {
  const items = (await sanityClient.fetch<{ slug: { current: string } }[]>(
    `*[_type == "caseStudy" && defined(slug.current)]{ slug }`,
  ).catch(() => [])) || [];
  return items.filter((i) => i.slug?.current).map((i) => ({ slug: i.slug.current }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const cs = await sanityClient.fetch<any>(CASE_STUDY_QUERY, { slug: params.slug }).catch(() => null);
  if (!cs) return buildMetadata({ title: "Case study not found", path: `/customers/${params.slug}` });
  return buildMetadata({
    title: `${cs.customer} — ${cs.headline}`,
    description: cs.subhead || cs.headline,
    path: `/customers/${params.slug}`,
    eyebrow: cs.industry?.name || "Customer story",
    seo: cs.seo,
    type: "article",
    publishedAt: cs.publishedAt,
  });
}

export default async function CaseStudyPage({ params }: { params: { slug: string } }) {
  const cs = await sanityClient.fetch<any>(CASE_STUDY_QUERY, { slug: params.slug }).catch(() => null);
  if (!cs) notFound();
  const logoSrc = resolveLogoUrl({ logo: cs.logo, domain: cs.domain }, 144);

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Customers", href: "/customers" },
          { label: cs.customer },
        ]}
      />

      <header className="px-8 pt-6 pb-12">
        <div className="mx-auto max-w-[820px]">
          <div className="flex items-center gap-4">
            {logoSrc && (
              <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-ink-100 bg-white">
                <Image
                  src={logoSrc}
                  alt={cs.customer}
                  fill
                  sizes="48px"
                  className="object-contain p-1.5"
                  unoptimized={logoSrc.includes("img.logo.dev")}
                />
              </div>
            )}
            <div>
              <div className="font-display text-[18px] font-semibold text-ink-900">{cs.customer}</div>
              {cs.industry?.name && (
                <div className="font-body text-[13px] text-ink-500">{cs.industry.name}</div>
              )}
            </div>
          </div>
          <h1 className="display-xl mt-6">{cs.headline}</h1>
          {cs.subhead && <p className="lead mt-5">{cs.subhead}</p>}
        </div>
      </header>

      {cs.kpis?.length > 0 && (
        <section className="px-8 pb-12">
          <div className="mx-auto max-w-[820px]">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-3xl border border-ink-100 bg-white px-7 py-6 shadow-sm md:grid-cols-4">
              {cs.kpis.map((k: any, i: number) => (
                <div key={i}>
                  <div className="font-mono text-[28px] font-semibold tracking-[-0.01em] text-brand-blue-700">
                    {k.value}
                  </div>
                  <div className="font-display mt-1 text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-500">
                    {k.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {cs.quote?.text && (
        <section className="px-8 pb-12">
          <div className="mx-auto max-w-[820px]">
            <blockquote
              className="relative rounded-3xl px-8 py-7 text-white"
              style={{
                background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
                boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
              }}
            >
              <span aria-hidden className="absolute -top-2 left-7 text-5xl leading-none" style={{ color: "#00F0FF" }}>
                "
              </span>
              <p className="font-display text-[22px] font-medium leading-[1.35] tracking-[-0.01em]">
                {cs.quote.text}
              </p>
              {(cs.quote.author || cs.quote.role) && (
                <div className="font-body mt-5 text-[13.5px] text-ink-150">
                  {cs.quote.author}
                  {cs.quote.role ? ` · ${cs.quote.role}` : ""}
                </div>
              )}
            </blockquote>
          </div>
        </section>
      )}

      {cs.body && <ProseShell value={cs.body} />}

      <CtaBanner
        eyebrow="Want results like this?"
        title={`Build your version of ${cs.customer}'s playbook.`}
        subtitle="Every customer story starts with a 30-min demo. Bring your accounts and we'll show what's possible."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "More stories", href: "/customers" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: cs.headline,
            description: cs.subhead,
            mainEntityOfPage: siteUrl(`/customers/${params.slug}`),
            datePublished: cs.publishedAt,
            publisher: {
              "@type": "Organization",
              name: "Logistic Intel",
              logo: { "@type": "ImageObject", url: siteUrl("/lit-icon-master.svg") },
            },
            about: cs.customer,
          }),
        }}
      />
    </PageShell>
  );
}
