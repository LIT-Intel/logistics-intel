import type { Metadata } from "next";
import Link from "next/link";
import { groq } from "next-sanity";
import { sanityClient } from "@/sanity/lib/client";
import { resolveLogoUrl } from "@/lib/sanityImage";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/sections/Section";
import { HubCard, HubEmptyState } from "@/components/sections/HubCard";
import { CustomerLogoTile } from "@/components/sections/CustomerLogoTile";
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

/**
 * Decision-center categories — buyers comparing tools think in terms
 * of "which category is this against," not alphabetical name. Mapping
 * lives here so we can keep Sanity comparison docs flat and still
 * render a categorized hub.
 */
const CATEGORIES: { label: string; description: string; slugs: string[] }[] = [
  {
    label: "Trade data",
    description: "Bill of Lading + customs intelligence — the data spine.",
    slugs: ["importyeti", "importgenius", "panjiva", "datamyne", "tradeatlas"],
  },
  {
    label: "Contact + sales intelligence",
    description: "Decision-maker contacts, firmographics, intent.",
    slugs: ["zoominfo", "apollo"],
  },
  {
    label: "CRM + sales engagement",
    description: "Pipeline, sequences, outreach — the action layer.",
    slugs: ["hubspot", "salesforce", "outreach", "salesloft"],
  },
  {
    label: "Freight lead services",
    description: "Companies that sell freight leads as a productized service — curated lists, qualified contacts, sometimes outbound.",
    slugs: ["freight-genie", "freightleads", "primax-freight-leads"],
  },
  {
    label: "Freight-specific platforms",
    description: "Tools built for the freight motion specifically.",
    slugs: ["revenue-vessel", "optimus", "magaya"],
  },
];

export default async function VsHubPage() {
  const items =
    (await sanityClient.fetch<Comparison[]>(VS_HUB_QUERY).catch(() => [])) || [];

  // Build a slug → comparison map for O(1) lookup, then bucket. Anything
  // unmapped falls into "Other" so we don't lose comparisons.
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const seenSlugs = new Set<string>();
  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    items: cat.slugs
      .map((s) => {
        const item = bySlug.get(s);
        if (item) seenSlugs.add(s);
        return item;
      })
      .filter((c): c is Comparison => Boolean(c)),
  })).filter((c) => c.items.length > 0);
  const unmapped = items.filter((c) => !seenSlugs.has(c.slug));
  if (unmapped.length > 0) {
    grouped.push({
      label: "Other",
      description: "Comparisons not yet categorized.",
      slugs: unmapped.map((u) => u.slug),
      items: unmapped,
    });
  }

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

      <Section bottom="lg" width="container">
        {items.length === 0 ? (
          <HubEmptyState title="Comparisons publishing soon">
            The Comparison Refresher agent runs weekly. Want to see LIT vs a tool not listed
            here?{" "}
            <Link href="/contact" className="text-brand-blue-700 underline">
              Tell us
            </Link>
            .
          </HubEmptyState>
        ) : (
          <div className="space-y-12 sm:space-y-20">
            {grouped.map((cat) => (
              <div key={cat.label}>
                <div className="mb-6 max-w-[640px]">
                  <div className="eyebrow">Category</div>
                  <h2 className="display-md space-eyebrow-h1">{cat.label}</h2>
                  <p className="font-body mt-3 text-[15px] leading-relaxed text-ink-500">
                    {cat.description}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2">
                  {cat.items.map((c) => {
                    const competitorDomain = c.competitorUrl
                      ?.replace(/^https?:\/\//, "")
                      .replace(/\/$/, "");
                    const logoSrc = resolveLogoUrl(
                      { logo: c.competitorLogo, domain: competitorDomain },
                      96,
                    );
                    const teaser = c.tldr || c.subhead;
                    return (
                      <HubCard key={c._id} href={`/vs/${c.slug}`} className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                          <div className="font-display text-[18px] sm:text-[20px] font-bold tracking-[-0.02em]">
                            <span className="grad-text">LIT</span>
                            <span className="px-2 text-ink-200" aria-hidden>
                              vs
                            </span>
                            <span className="text-ink-900">{c.competitorName}</span>
                          </div>
                          {/* Use CustomerLogoTile (resilient monogram + image
                              fade-in) so logo.dev failures never leave a
                              blank box on the hub. Same pattern as /vs/[slug]
                              detail. */}
                          <span className="ml-auto">
                            <CustomerLogoTile
                              name={c.competitorName}
                              src={logoSrc}
                              domain={competitorDomain}
                            />
                          </span>
                        </div>

                        {teaser && (
                          <p className="font-body text-[14px] leading-relaxed text-ink-500 line-clamp-3">
                            {teaser}
                          </p>
                        )}

                        <div className="font-display mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                          Read full comparison <ArrowRight className="h-3.5 w-3.5" />
                        </div>
                      </HubCard>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

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
