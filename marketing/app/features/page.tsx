import type { Metadata } from "next";
import { ArrowRight, Search, Database, Activity, Send, Layers } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/sections/Section";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { HubCard, HubCardGrid } from "@/components/sections/HubCard";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";
import { buildCollectionPage } from "@/lib/jsonLd";
import { FEATURE_PAGES } from "./_data";

export const metadata: Metadata = buildMetadata({
  title: "Features — every capability inside the LIT platform",
  description:
    "Bill of Lading search, importer + exporter databases, contact enrichment, freight CRM, outbound campaigns, market rate benchmarking, and more — all built for freight teams.",
  path: "/features",
  eyebrow: "Features",
});

/** Top-of-hub flow — gives the features page a product-map narrative
 *  instead of opening on a flat directory grid. */
const PLATFORM_FLOW: { title: string; body: string; icon: typeof Search }[] = [
  {
    icon: Search,
    title: "Search the trade graph",
    body: "Query 124M+ Bills of Lading by importer, exporter, lane, HS, and carrier — live customs data, refreshed weekly.",
  },
  {
    icon: Database,
    title: "Profile + score the account",
    body: "Every importer is enriched with shipment cadence, lanes, carriers, HS mix, and 5-30 verified buyer-side contacts.",
  },
  {
    icon: Activity,
    title: "Watch the signal",
    body: "Pulse Coach pings you when lanes shift, carriers change, or revenue opportunity grows on a saved account.",
  },
  {
    icon: Send,
    title: "Sequence + book freight",
    body: "Outbound steps drafted by Pulse AI from the prospect's actual shipment data — sent from your domain, tracked in CRM.",
  },
];

export default function FeaturesHubPage() {
  // Group by category eyebrow so the hub reads as a product map, not an
  // alphabetical dump.
  const groupOrder = [
    "Search",
    "Database",
    "Intelligence",
    "Lead generation",
    "CRM",
    "Outbound",
    "Builder",
    "Command center",
    "Enrichment",
    "Benchmarking",
    "Prospecting",
    "Tools",
  ];
  const grouped = new Map<string, typeof FEATURE_PAGES>();
  for (const f of FEATURE_PAGES) {
    if (!grouped.has(f.eyebrow)) grouped.set(f.eyebrow, []);
    grouped.get(f.eyebrow)!.push(f);
  }
  const sections = groupOrder
    .filter((g) => grouped.has(g))
    .map((g) => ({ label: g, items: grouped.get(g)! }));

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Features" },
        ]}
      />
      <PageHero
        eyebrow="Features"
        title="Every capability"
        titleHighlight="inside the LIT platform."
        subtitle="LIT replaces 4 tools with one freight-native platform — search, intelligence, CRM, and outbound, all sharing the same data graph."
        align="center"
      />

      {/* "How the platform works" — gives the hub a narrative spine
          before dumping into the alphabet of feature cards. */}
      <Section top="md" bottom="md" tone="soft-blue" width="container">
        <div className="mx-auto max-w-[680px] text-center">
          <div className="eyebrow">How the platform works</div>
          <h2 className="display-md space-eyebrow-h1">
            <span className="grad-text">From signal</span> to booked freight, in one tool.
          </h2>
          <p className="lead space-h1-intro mx-auto max-w-[560px]">
            Every feature below maps to one of four steps. They share the same data graph — search
            results carry contacts, contacts carry shipment context, sequences carry CRM state.
          </p>
        </div>
        <div className="mt-10 sm:mt-14 grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-4">
          {PLATFORM_FLOW.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                className="relative rounded-2xl border border-ink-100 bg-white p-6 shadow-sm"
              >
                <div className="font-mono absolute -top-3 left-6 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-blue text-[11px] font-bold text-white">
                  {i + 1}
                </div>
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{
                    background: "rgba(37,99,235,0.08)",
                    boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.15)",
                  }}
                >
                  <Icon className="h-5 w-5 text-brand-blue" aria-hidden />
                </div>
                <h3 className="display-sm mt-4">{step.title}</h3>
                <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">
                  {step.body}
                </p>
              </div>
            );
          })}
        </div>
      </Section>

      <Section top="lg" bottom="lg" width="container">
        <div className="mb-10 sm:mb-14 max-w-[680px]">
          <div className="flex items-center gap-2 text-ink-500">
            <Layers className="h-4 w-4" aria-hidden />
            <span className="eyebrow">The full feature set</span>
          </div>
          <h2 className="display-md space-eyebrow-h1">
            {FEATURE_PAGES.length} capabilities, grouped by what they do.
          </h2>
        </div>
        <div className="space-y-12 sm:space-y-20">
          {sections.map((s) => (
            <div key={s.label}>
              <div className="font-display mb-6 flex items-center gap-3">
                <span className="text-[18px] sm:text-[20px] font-semibold tracking-[-0.01em] text-ink-900">
                  {s.label}
                </span>
                <span className="h-px flex-1 bg-ink-100" />
                <span className="font-mono text-[12px] text-ink-200">{s.items.length}</span>
              </div>
              <HubCardGrid>
                {s.items.map((f) => (
                  <HubCard key={f.slug} href={`/features/${f.slug}`} className="flex flex-col gap-3">
                    <div className="font-display text-[11px] font-bold uppercase tracking-wider text-brand-blue">
                      {f.eyebrow}
                    </div>
                    <h3 className="display-sm">
                      {f.title.replace(/—\s*$/, "").trim()}
                    </h3>
                    <p className="font-body text-[13.5px] leading-relaxed text-ink-500 line-clamp-3">
                      {f.shortAnswer}
                    </p>
                    <div className="font-display mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                      Read more <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </HubCard>
                ))}
              </HubCardGrid>
            </div>
          ))}
        </div>
      </Section>

      <CtaBanner
        eyebrow="One platform"
        title="Replace 4 tools with LIT."
        subtitle="Most teams cut at least 3 tools when they migrate to LIT — list source, enrichment, sequencer, and freight-specific search all in one platform."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free", href: "https://app.logisticintel.com/signup" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildCollectionPage({
              name: "LIT features",
              description:
                "Every capability inside the LIT freight revenue intelligence platform — search, intelligence, CRM, outbound, and tools.",
              path: "/features",
              items: FEATURE_PAGES.map((f) => ({
                name: f.title.replace(/—\s*$/, "").trim(),
                url: `/features/${f.slug}`,
              })),
            }),
          ),
        }}
      />
    </PageShell>
  );
}
