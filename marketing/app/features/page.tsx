import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
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

      <Section bottom="lg">
        <div className="space-y-12 sm:space-y-16">
          {sections.map((s) => (
            <div key={s.label}>
              <div className="font-display mb-5 flex items-center gap-3">
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
