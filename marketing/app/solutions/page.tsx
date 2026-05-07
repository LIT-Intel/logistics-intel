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
import { SOLUTION_PAGES } from "./_data";

export const metadata: Metadata = buildMetadata({
  title: "Solutions — LIT for forwarders, brokers, 3PLs, and customs teams",
  description:
    "How freight forwarders, brokers, 3PLs, customs brokers, and supply-chain BD teams run outbound + intelligence + CRM on one platform.",
  path: "/solutions",
  eyebrow: "Solutions",
});

/** Buyer cohorts. Maps each /solutions/[slug] into one of four
 *  audience buckets so the hub reads as "which team are you?" rather
 *  than an alphabetical list. */
const BUYER_GROUPS: { label: string; description: string; slugs: string[] }[] = [
  {
    label: "Freight providers",
    description: "Forwarders, brokers, 3PLs, agencies — the teams selling capacity.",
    slugs: ["freight-forwarders", "freight-brokers", "3pl-sales", "freight-agencies"],
  },
  {
    label: "Sales + BD teams",
    description: "AEs, SDRs, and BD leaders running freight outbound at scale.",
    slugs: ["logistics-sales-teams", "supply-chain-business-development"],
  },
  {
    label: "Trade + compliance",
    description: "Customs brokers and trade-finance teams targeting by HS and origin country.",
    slugs: ["customs-brokers", "import-export-sales"],
  },
];

export default function SolutionsHubPage() {
  const sections = BUYER_GROUPS.map((g) => ({
    ...g,
    items: g.slugs
      .map((s) => SOLUTION_PAGES.find((p) => p.slug === s))
      .filter((p): p is (typeof SOLUTION_PAGES)[number] => Boolean(p)),
  })).filter((g) => g.items.length > 0);

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Solutions" },
        ]}
      />
      <PageHero
        eyebrow="Solutions"
        title="LIT for"
        titleHighlight="every freight team."
        subtitle="Forwarders, brokers, 3PLs, customs brokers, agencies, and supply-chain BD teams all run on the same data graph — with the framing each role actually needs."
        align="center"
      />

      {/* Audience selector — gives the hub a buyer-first narrative
          before showing the grid. Each chip jumps to its group. */}
      <Section top="md" bottom="md" tone="soft-blue" width="container">
        <div className="mx-auto max-w-[640px] text-center">
          <div className="eyebrow">Which team are you?</div>
          <h2 className="display-md space-eyebrow-h1">
            Pick your motion. Same platform, <span className="grad-text">tuned to your workflow.</span>
          </h2>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {sections.map((g) => (
            <a
              key={g.label}
              href={`#${g.label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`}
              className="font-display inline-flex items-center gap-2 rounded-full border border-ink-100 bg-white px-4 py-2 text-[13px] font-semibold text-ink-700 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/40 hover:text-brand-blue-700 hover:shadow-md"
            >
              {g.label}
              <span className="font-mono text-[11px] text-ink-200">{g.items.length}</span>
            </a>
          ))}
        </div>
      </Section>

      <Section top="lg" bottom="lg" width="container">
        <div className="space-y-14 sm:space-y-20">
          {sections.map((g) => (
            <div
              key={g.label}
              id={g.label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}
              className="scroll-mt-24"
            >
              <div className="mb-8 max-w-[640px]">
                <div className="eyebrow">Audience</div>
                <h3 className="display-md space-eyebrow-h1">{g.label}</h3>
                <p className="lead space-h1-intro">{g.description}</p>
              </div>
              <HubCardGrid cols={2}>
                {g.items.map((s) => (
                  <HubCard key={s.slug} href={`/solutions/${s.slug}`} className="flex flex-col gap-3">
                    <div className="font-display text-[11px] font-bold uppercase tracking-wider text-brand-blue">
                      {s.eyebrow}
                    </div>
                    <h4 className="display-sm">{s.title.replace(/—\s*$/, "").trim()}</h4>
                    <p className="font-body text-[14px] leading-relaxed text-ink-500 line-clamp-3">
                      {s.shortAnswer}
                    </p>
                    <div className="font-display mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                      Read the playbook <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </HubCard>
                ))}
              </HubCardGrid>
            </div>
          ))}
        </div>
      </Section>

      <CtaBanner
        eyebrow="Pick your motion"
        title="See LIT on your real lanes."
        subtitle="Whatever your role looks like — forwarder, broker, 3PL, customs — we'll pull up the version of LIT that fits your day-to-day."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free", href: "https://app.logisticintel.com/signup" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildCollectionPage({
              name: "LIT solutions",
              description:
                "How forwarders, brokers, 3PLs, customs brokers, agencies, and supply-chain BD teams run on LIT.",
              path: "/solutions",
              items: SOLUTION_PAGES.map((s) => ({
                name: s.title.replace(/—\s*$/, "").trim(),
                url: `/solutions/${s.slug}`,
              })),
            }),
          ),
        }}
      />
    </PageShell>
  );
}
