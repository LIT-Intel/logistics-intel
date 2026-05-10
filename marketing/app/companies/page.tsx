import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/sections/Section";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { HubCard, HubCardGrid } from "@/components/sections/HubCard";
import { CtaBanner } from "@/components/sections/CtaBanner";
import {
  countActiveCompanies,
  getTopCompanies,
  formatHeadquarters,
  formatNumber,
  formatUsdShort,
} from "@/lib/companies";
import { buildMetadata } from "@/lib/seo";
import { buildCollectionPage } from "@/lib/jsonLd";

export const revalidate = 21600; // 6h

export const metadata: Metadata = buildMetadata({
  title: "US importer directory — live BOL data for 26,000+ active companies",
  description:
    "Browse active US importers tracked across 124M+ Bill of Lading filings. Each profile surfaces TTM TEU, shipment count, top trade lanes, and contact discovery inside LIT.",
  path: "/companies",
  eyebrow: "Importers",
});

export default async function CompaniesHubPage() {
  const [top, total] = await Promise.all([
    getTopCompanies(48),
    countActiveCompanies(),
  ]);

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Companies" },
        ]}
      />
      <PageHero
        eyebrow="Importer directory"
        title="Active US importers,"
        titleHighlight="ranked by trade volume."
        subtitle={`Browse ${formatNumber(total)} active US importers tracked across live US Customs Bill of Lading filings. Each profile surfaces trailing-12-month TEU, shipment cadence, and the path to verified buyer contacts inside LIT.`}
        align="center"
      />

      <Section top="md" bottom="md">
        <div className="mb-8 flex items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Top by TEU · 12 months</div>
            <h2 className="display-md space-eyebrow-h1">The biggest importers we&apos;re tracking.</h2>
          </div>
          <div className="font-mono hidden text-[12px] text-ink-200 sm:block">
            Showing top 48 of {formatNumber(total)}
          </div>
        </div>

        <HubCardGrid cols={3}>
          {top.map((c) => {
            const hq = formatHeadquarters(c);
            const teu = Number(c.teu) || 0;
            const ships = Number(c.shipments) || 0;
            return (
              <HubCard
                key={c.seo_slug}
                href={`/companies/${c.seo_slug}`}
                className="flex flex-col gap-3"
              >
                <div className="min-w-0">
                  <h3 className="font-display text-[16px] font-semibold leading-tight tracking-[-0.015em] text-ink-900 group-hover:text-brand-blue-700">
                    {c.company_name}
                  </h3>
                  {hq && (
                    <div className="font-body mt-1 truncate text-[12.5px] text-ink-500">{hq}</div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-ink-100 pt-3">
                  <KpiCell label="TEU 12m" value={formatNumber(teu)} accent />
                  <KpiCell label="Ships" value={formatNumber(ships)} />
                  <KpiCell label="Value" value={formatUsdShort(Number(c.value_usd))} />
                </div>
                <div className="font-display mt-auto inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                  Open profile <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </HubCard>
            );
          })}
        </HubCardGrid>
      </Section>

      <Section top="md" bottom="md" tone="soft-blue">
        <div className="mx-auto max-w-[760px] text-center">
          <div className="eyebrow">Data source</div>
          <h2 className="display-md space-eyebrow-h1">
            Sourced from <span className="grad-text">live US Customs filings.</span>
          </h2>
          <p className="lead space-h1-intro mx-auto max-w-[640px]">
            Every importer here filed at least one US Bill of Lading in the past 24 months. The
            corpus refreshes weekly as new customs data lands. For full lane, carrier, HS, and
            contact intelligence on any importer, open the profile inside LIT.
          </p>
        </div>
      </Section>

      <CtaBanner
        eyebrow="Targeting an importer?"
        title="Open the full profile in LIT."
        subtitle="Lane mix, carrier share, monthly volume, top suppliers, HS mix, and 5-30 verified buyer-side contacts — pre-built on every importer in the database."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Start free", href: "https://app.logisticintel.com/signup" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildCollectionPage({
              name: "US importer directory",
              description:
                "Browse active US importers tracked across 124M+ Bill of Lading filings, ranked by trailing-12-month TEU.",
              path: "/companies",
              items: top.slice(0, 25).map((c) => ({
                name: c.company_name,
                url: `/companies/${c.seo_slug}`,
              })),
            }),
          ),
        }}
      />
    </PageShell>
  );
}

function KpiCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="font-display text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
        {label}
      </div>
      <div
        className={
          "font-mono mt-0.5 text-[13px] font-bold tracking-[-0.01em] " +
          (accent ? "text-brand-blue-700" : "text-ink-900")
        }
      >
        {value}
      </div>
    </div>
  );
}
