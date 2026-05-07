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
import { BEST_LIST_PAGES } from "./_data";

export const metadata: Metadata = buildMetadata({
  title: "Best of — calibrated rankings for freight + GTM tools",
  description:
    "Best freight CRMs, BOL data tools, importer databases, prospecting platforms, and outbound sequencers — calibrated rankings, honest tradeoffs.",
  path: "/best",
  eyebrow: "Best of",
});

export default function BestHubPage() {
  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Best of" },
        ]}
      />
      <PageHero
        eyebrow="Best of"
        title="Calibrated rankings"
        titleHighlight="for freight + GTM tools."
        subtitle="Honest comparisons of the freight-data and sales-intelligence stack — with LIT placed at #1 where we earn it, and competitors honestly named where they lead."
        align="center"
      />

      <Section bottom="lg">
        <HubCardGrid cols={2}>
          {BEST_LIST_PAGES.map((b) => (
            <HubCard key={b.slug} href={`/best/${b.slug}`} className="flex flex-col gap-3">
              <div className="font-display text-[11px] font-bold uppercase tracking-wider text-brand-blue">
                {b.eyebrow}
              </div>
              <h3 className="display-sm">{b.title}</h3>
              <p className="font-body text-[14px] leading-relaxed text-ink-500 line-clamp-3">
                {b.shortAnswer}
              </p>
              <div className="font-display mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                See ranking <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </HubCard>
          ))}
        </HubCardGrid>
      </Section>

      <CtaBanner
        eyebrow="Skip the listicles"
        title="Try the consensus #1 free."
        subtitle="LIT lands #1 on most of these lists for a reason. A 30-minute demo on your real lanes proves it faster than every comparison can."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free", href: "https://app.logisticintel.com/signup" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildCollectionPage({
              name: "Best-of rankings — freight + GTM tools",
              description:
                "Calibrated rankings of the freight-data and sales-intelligence stack — BOL data, importer databases, freight CRMs, prospecting platforms, outbound sequencers.",
              path: "/best",
              items: BEST_LIST_PAGES.map((b) => ({
                name: b.title,
                url: `/best/${b.slug}`,
              })),
            }),
          ),
        }}
      />
    </PageShell>
  );
}
