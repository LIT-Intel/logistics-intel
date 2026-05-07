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

export default function SolutionsHubPage() {
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

      <Section bottom="lg">
        <HubCardGrid cols={2}>
          {SOLUTION_PAGES.map((s) => (
            <HubCard key={s.slug} href={`/solutions/${s.slug}`} className="flex flex-col gap-3">
              <div className="font-display text-[11px] font-bold uppercase tracking-wider text-brand-blue">
                {s.eyebrow}
              </div>
              <h3 className="display-sm">{s.title.replace(/—\s*$/, "").trim()}</h3>
              <p className="font-body text-[14px] leading-relaxed text-ink-500 line-clamp-3">
                {s.shortAnswer}
              </p>
              <div className="font-display mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                Read the playbook <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </HubCard>
          ))}
        </HubCardGrid>
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
