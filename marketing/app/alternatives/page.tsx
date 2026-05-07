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
import { ALTERNATIVE_PAGES } from "./_data";

export const metadata: Metadata = buildMetadata({
  title: "Alternatives — LIT vs the freight-data + sales-intel stack",
  description:
    "Looking for an ImportYeti, ZoomInfo, Apollo, or Panjiva alternative? See how LIT replaces the typical 4-tool freight-revenue stack with one platform.",
  path: "/alternatives",
  eyebrow: "Alternatives",
});

export default function AlternativesHubPage() {
  const grouped = new Map<string, typeof ALTERNATIVE_PAGES>();
  for (const a of ALTERNATIVE_PAGES) {
    if (!grouped.has(a.category)) grouped.set(a.category, []);
    grouped.get(a.category)!.push(a);
  }
  const sections = Array.from(grouped.entries()).map(([label, items]) => ({ label, items }));

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Alternatives" },
        ]}
      />
      <PageHero
        eyebrow="Alternatives"
        title="The"
        titleHighlight="LIT alternative"
        titleSuffix="for every freight-data tool."
        subtitle="Looking to replace ImportYeti, ZoomInfo, Apollo, Panjiva, or Optimus? Each page has the short version: who switches, why, and how LIT compares row-by-row."
        align="center"
      />

      <Section bottom="lg" width="container">
        <div className="space-y-12 sm:space-y-16">
          {sections.map((s) => (
            <div key={s.label}>
              <div className="font-display mb-5 flex items-center gap-3">
                <span className="text-[18px] sm:text-[20px] font-semibold tracking-[-0.01em] text-ink-900">{s.label}</span>
                <span className="h-px flex-1 bg-ink-100" />
                <span className="font-mono text-[12px] text-ink-200">{s.items.length}</span>
              </div>
              <HubCardGrid>
                {s.items.map((a) => (
                  <HubCard key={a.slug} href={`/alternatives/${a.slug}`} className="flex flex-col gap-3">
                    <div className="font-display text-[18px] font-bold tracking-[-0.02em]">
                      <span className="grad-text">LIT</span>
                      <span className="px-2 text-ink-200" aria-hidden>vs</span>
                      <span className="text-ink-900">{a.competitor}</span>
                    </div>
                    <p className="font-body text-[13.5px] leading-relaxed text-ink-500 line-clamp-3">
                      {a.shortAnswer}
                    </p>
                    <div className="font-display mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                      Read the alternative <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </HubCard>
                ))}
              </HubCardGrid>
            </div>
          ))}
        </div>
      </Section>

      <CtaBanner
        eyebrow="Still comparing?"
        title="See LIT on your real lanes."
        subtitle="A 30-minute demo on your real lanes is faster than reading every comparison. We'll pull up your top 5 target accounts and show which are actively shipping right now."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free", href: "https://app.logisticintel.com/signup" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildCollectionPage({
              name: "LIT alternatives",
              description: "How LIT compares to ImportYeti, ImportGenius, Panjiva, ZoomInfo, Apollo, and other freight-data + sales-intel tools.",
              path: "/alternatives",
              items: ALTERNATIVE_PAGES.map((a) => ({
                name: `${a.competitor} alternative`,
                url: `/alternatives/${a.slug}`,
              })),
            }),
          ),
        }}
      />
    </PageShell>
  );
}
