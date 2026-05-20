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
import { StickyCTABar } from "@/components/lead-magnet/StickyCTABar";
import { ExitIntentModal } from "@/components/lead-magnet/ExitIntentModal";
import { HubFinalCtaForm } from "@/app/_shared/HubFinalCtaForm";
import { ProductShowcase } from "@/components/sections/ProductShowcase";
import { StepsRow } from "@/components/sections/StepsRow";
import { QuoteGrid } from "@/components/sections/QuoteGrid";
import { fetchTeamAuthors } from "@/lib/team-authors";

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
  const [rawItems, team] = await Promise.all([
    sanityClient.fetch<Comparison[]>(VS_HUB_QUERY).catch(() => [] as Comparison[]),
    fetchTeamAuthors(),
  ]);
  const items = rawItems || [];

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
      <StickyCTABar />
      <PageHero
        eyebrow="Comparisons"
        title="LIT vs"
        titleHighlight="every alternative."
        subtitle="Horizontal sales tools miss freight. Trade-data tools stop at the export. See exactly where LIT fits — and where it leaves the alternatives behind. Every page is honest, kept current, and lists when each tool wins."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free", href: "https://app.logisticintel.com/signup" }}
      />

      {/* Glossy injection #1 — dark product showcase. Anchors the
          comparison narrative on what's actually inside the workspace. */}
      <ProductShowcase
        eyebrow="What you get inside LIT"
        heading="Shipment data + verified contacts — joined in one screen."
        lede="Other tools give you one half: trade data OR contacts. LIT joins them so the workflow goes from search → meeting without leaving the platform."
        urlBarText="app.logisticintel.com / pulse / briefing"
        callouts={[
          { kpi: "120M+", label: "BOL records" },
          { kpi: "Joined", label: "Shipments + contacts" },
          { kpi: "1 stack", label: "Replaces 3 tools" },
        ]}
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

      {/* Glossy injection #2 — "How switching works." Trial → pilot →
          consolidate. The three-step pattern customers actually walk
          through when they swap an existing tool for LIT. */}
      <StepsRow
        eyebrow="How switching works"
        heading="Trial → pilot → consolidate."
        lede="No rip-and-replace. Run LIT alongside your current stack for two weeks, then keep what works."
        steps={[
          {
            eyebrow: "01 · Trial",
            title: "10 free searches + 10 contacts",
            body: "No credit card. Run real account searches and pull verified contacts. See if the data lines up with your lanes.",
            meta: "Day 0 · Free forever tier",
          },
          {
            eyebrow: "02 · Pilot",
            title: "Run alongside your current stack",
            body: "Two-week paid pilot on your top 10 target accounts. Compare LIT's results to your existing list vendor head-to-head.",
            meta: "Week 1–2 · Side-by-side",
          },
          {
            eyebrow: "03 · Consolidate",
            title: "Cut the tools that lost",
            body: "When LIT covers the workflow, customers cancel their old list vendor + BOL viewer + contact tool. One platform, one budget line.",
            meta: "Day 30 · Stack reduced",
          },
        ]}
      />

      {/* Glossy injection #3 — LIT team perspective on why the product
          exists vs each category of competitor. NOT customer testimonials. */}
      <QuoteGrid
        eyebrow="From the LIT team"
        heading="Why we built LIT — from the team"
        ariaLabel="LIT team perspective on building against existing alternatives"
        quotes={[
          {
            text: "Horizontal sales tools — ZoomInfo, Apollo — stop at the export. They don't know who's actively shipping. We built LIT because freight teams kept reverse-engineering BOL filings to fill the gap, and they shouldn't have to.",
            stats: [
              { num: "524K", label: "Active shippers" },
              { num: "Joined", label: "BOL + contacts" },
            ],
            name: team["gabriel-reyes"].name,
            role: team["gabriel-reyes"].role,
            avatarUrl: team["gabriel-reyes"].avatarUrl,
          },
          {
            text: "Trade-data tools — ImportGenius, Panjiva — show you what shipped, but stop there. No contacts, no sequences, no pipeline. Reps end up exporting CSVs and rebuilding the workflow in another tool. LIT collapses that into one platform.",
            stats: [
              { num: "1 stack", label: "Not three" },
              { num: "70%", label: "Less data prep" },
            ],
            name: team["jennifer-okafor"].name,
            role: team["jennifer-okafor"].role,
            avatarUrl: team["jennifer-okafor"].avatarUrl,
          },
          {
            text: "Freight CRMs handle pipeline but not prospecting. We don't want to be everyone's CRM — we want to be the layer that feeds qualified, in-context opportunities INTO whatever CRM you already use. That's the integration story, not the replacement story.",
            stats: [
              { num: "API", label: "First-class" },
              { num: "8 min", label: "To first meeting" },
            ],
            name: team["nikki-patel"].name,
            role: team["nikki-patel"].role,
            avatarUrl: team["nikki-patel"].avatarUrl,
          },
        ]}
      />

      <CtaBanner
        eyebrow="Stop comparing — start booking freight"
        title="See LIT on your real lanes."
        subtitle="A 30-minute demo on your real lanes is faster than reading every comparison page. We'll pull up your top 5 target accounts and show which are actively shipping right now."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free trial", href: "https://app.logisticintel.com/signup" }}
      />

      <HubFinalCtaForm
        source="vs-hub-final"
        headline="See LIT on your own lanes."
        subhead="10 searches + 10 verified contacts. No credit card."
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

      <ExitIntentModal />
    </PageShell>
  );
}
