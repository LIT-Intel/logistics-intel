import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { groq } from "next-sanity";
import { sanityClient } from "@/sanity/lib/client";
import { resolveLogoUrl } from "@/lib/sanityImage";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { ArrowRight } from "lucide-react";
import { buildMetadata, siteUrl } from "@/lib/seo";

export const revalidate = 3600; // ISR — comparisons change at most weekly

const VS_HUB_QUERY = groq`*[_type == "comparison" && defined(slug.current)] | order(competitorName asc){
  _id,
  competitorName,
  "slug": slug.current,
  competitorLogo,
  competitorUrl,
  subhead,
  tldr,
  lastReviewedAt
}`;

export const metadata: Metadata = buildMetadata({
  title: "LIT vs every alternative — honest, kept-current comparisons",
  description:
    "Side-by-side comparisons of LIT against ZoomInfo, ImportGenius, ImportYeti, Apollo, Panjiva, Revenue Vessel, and the rest of the freight-data stack. Coverage, contacts, CRM, AI, outbound — compared.",
  path: "/vs",
  eyebrow: "Comparisons",
});

type Comparison = {
  _id: string;
  competitorName: string;
  slug: string;
  competitorLogo?: any;
  competitorUrl?: string;
  subhead?: string;
  tldr?: string;
  lastReviewedAt?: string;
};

export default async function VsHubPage() {
  const items =
    (await sanityClient.fetch<Comparison[]>(VS_HUB_QUERY).catch(() => [])) || [];

  return (
    <PageShell>
      <PageHero
        eyebrow="Comparisons"
        title="LIT vs"
        titleHighlight="every alternative."
        subtitle="Horizontal sales tools miss freight. Trade-data tools stop at the export. See exactly where LIT fits — and where it leaves the alternatives behind. Every page is honest, kept current, and lists when each tool wins."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free", href: "https://app.logisticintel.com/signup" }}
      />

      <section className="px-5 sm:px-8 pb-20">
        <div className="mx-auto max-w-container">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink-100 bg-white px-7 py-16 text-center">
              <div className="font-display text-[18px] font-semibold text-ink-900">
                Comparisons publishing soon
              </div>
              <p className="font-body mx-auto mt-2 max-w-[440px] text-[14px] leading-relaxed text-ink-500">
                The Comparison Refresher agent runs weekly. Want to see LIT vs a tool not listed
                here?{" "}
                <Link href="/contact" className="text-brand-blue-700 underline">
                  Tell us
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {items.map((c) => {
                const logoSrc = resolveLogoUrl(
                  {
                    logo: c.competitorLogo,
                    domain: c.competitorUrl?.replace(/^https?:\/\//, "").replace(/\/$/, ""),
                  },
                  96,
                );
                const teaser = c.tldr || c.subhead;
                return (
                  <Link
                    key={c._id}
                    href={`/vs/${c.slug}`}
                    className="group flex flex-col gap-4 rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="font-display text-[20px] font-bold tracking-[-0.02em]">
                        <span className="grad-text">LIT</span>
                        <span className="px-2 text-ink-200" aria-hidden>
                          vs
                        </span>
                        <span className="text-ink-900">{c.competitorName}</span>
                      </div>
                      {logoSrc && (
                        <div className="relative ml-auto h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-ink-100 bg-white">
                          <Image
                            src={logoSrc}
                            alt={c.competitorName}
                            fill
                            sizes="36px"
                            className="object-contain p-1"
                            unoptimized={logoSrc.includes("img.logo.dev")}
                          />
                        </div>
                      )}
                    </div>

                    {teaser && (
                      <p className="font-body text-[14px] leading-relaxed text-ink-500 line-clamp-3">
                        {teaser}
                      </p>
                    )}

                    <div className="font-display mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                      Read full comparison <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <CtaBanner
        eyebrow="Stop comparing — start booking freight"
        title="See LIT on your real lanes."
        subtitle="A 30-minute demo on your real lanes is faster than reading every comparison page. We'll pull up your top 5 target accounts and show which are actively shipping right now."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free trial", href: "https://app.logisticintel.com/signup" }}
      />

      {/* CollectionPage JSON-LD — links the hub into the broader site graph
          and lets Google understand /vs is the parent of /vs/[slug] pages. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "LIT vs every alternative",
            description:
              "Honest comparisons of LIT against the major freight-data and sales-intelligence tools.",
            url: siteUrl("/vs"),
            hasPart: items.map((c) => ({
              "@type": "WebPage",
              name: `LIT vs ${c.competitorName}`,
              url: siteUrl(`/vs/${c.slug}`),
            })),
          }),
        }}
      />
    </PageShell>
  );
}
