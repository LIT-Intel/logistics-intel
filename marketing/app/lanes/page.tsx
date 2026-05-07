import type { Metadata } from "next";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { Section } from "@/components/sections/Section";
import { HubCard, HubCardGrid, HubEmptyState } from "@/components/sections/HubCard";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { MarketingGlobe } from "@/components/sections/MarketingGlobe";
import { buildMetadata } from "@/lib/seo";
import { buildCollectionPage } from "@/lib/jsonLd";
import { groq } from "next-sanity";
import { ArrowRight } from "lucide-react";

export const revalidate = 1800;

export const metadata: Metadata = buildMetadata({
  title: "Trade lanes — live shipment intelligence by route",
  description:
    "Live KPIs, top shippers, carrier mix, and 12-month trends for every major ocean and air trade lane. Updated daily.",
  path: "/lanes",
  eyebrow: "Trade Lanes",
});

const LANES_INDEX = groq`*[_type == "tradeLane"] | order(title asc){
  _id, title, slug, kpis, originPort, destinationPort
}`;

export default async function LanesIndexPage() {
  const lanes = (await sanityClient.fetch<any[]>(LANES_INDEX).catch(() => [])) || [];

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Trade lanes" },
        ]}
      />
      <PageHero
        eyebrow="Trade lanes"
        title="Live trade-lane"
        titleHighlight="intelligence,"
        titleSuffix="every major route."
        subtitle="Top shippers, carrier mix, TEU trend, and YoY change for every major ocean and air lane. Refreshed daily."
        align="center"
      />

      <Section top="none" bottom="md" innerClassName="max-w-[520px]">
        <MarketingGlobe />
      </Section>

      <Section top="sm" bottom="lg">
        {lanes.length === 0 ? (
          <HubEmptyState title="500+ trade lanes — refreshing now">
            Trade-lane intelligence is aggregated from live customs filings across 60+ countries. New
            lane pages publish daily with top shippers, carrier mix, port pairs, and YoY volume change.{" "}
            <Link href="/demo" className="text-brand-blue-700 underline">
              Book a demo
            </Link>
            {" "}to see your specific lane right now.
          </HubEmptyState>
        ) : (
          <HubCardGrid>
            {lanes.map((l) => (
              <HubCard key={l._id} href={`/lanes/${l.slug?.current}`}>
                <div className="font-display flex items-center gap-2 text-[14px] font-semibold text-ink-900">
                  <span>{l.originPort?.name || "—"}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-brand-blue" />
                  <span>{l.destinationPort?.name || "—"}</span>
                </div>
                {l.kpis?.[0]?.value && (
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="font-mono text-[22px] font-semibold tracking-[-0.01em] text-brand-blue-700">
                      {l.kpis[0].value}
                    </span>
                    <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-500">
                      {l.kpis[0].label}
                    </span>
                  </div>
                )}
              </HubCard>
            ))}
          </HubCardGrid>
        )}
      </Section>

      <CtaBanner
        eyebrow="Watch your lanes"
        title="Track your specific lanes."
        subtitle="Save lanes to your watchlist and Pulse Coach pings you when volume, carriers, or shippers shift."
        primaryCta={{ label: "Try free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildCollectionPage({
              name: "Trade lane intelligence",
              description:
                "Live KPIs, top shippers, carrier mix, and 12-month trends for every major ocean and air trade lane. Updated daily.",
              path: "/lanes",
              items: lanes
                .filter((l: any) => l?.slug?.current && l?.title)
                .map((l: any) => ({
                  name: l.title,
                  url: `/lanes/${l.slug.current}`,
                })),
            }),
          ),
        }}
      />
    </PageShell>
  );
}
