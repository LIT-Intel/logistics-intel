import type { Metadata } from "next";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { HS_INDEX_QUERY } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/sections/Section";
import { HubCard, HubEmptyState } from "@/components/sections/HubCard";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";

export const revalidate = 3600;

export const metadata: Metadata = buildMetadata({
  title: "HS codes — global trade classification with live importer data",
  description:
    "Plain-English definitions, top importers, and active lanes for every HS chapter and heading we index. Updated weekly.",
  path: "/hs",
  eyebrow: "HS Codes",
});

type HsItem = {
  _id: string;
  code: string;
  slug: { current: string };
  title: string;
  level?: string;
  shortDefinition?: string;
};

export default async function HsCodeIndexPage() {
  const items = (await sanityClient.fetch<HsItem[]>(HS_INDEX_QUERY).catch(() => [])) || [];

  const grouped = items.reduce<Record<string, HsItem[]>>((acc, h) => {
    const ch = h.code?.slice(0, 2) || "??";
    (acc[ch] = acc[ch] || []).push(h);
    return acc;
  }, {});
  const chapters = Object.keys(grouped).sort();

  return (
    <PageShell>
      <PageHero
        eyebrow="HS codes"
        title="Global trade classification"
        titleHighlight="with live importer data."
        subtitle="Look up any HS chapter, heading, or subheading and see the top importers, active trade lanes, and current volume — all in plain English."
        align="center"
      />

      <Section bottom="lg">
        {items.length === 0 ? (
          <HubEmptyState title="HS code intelligence — publishing">
            Pages for 5,000+ Harmonized System tariff classifications are rolling out. Each surfaces
            top US importers of that HS code, dominant origin countries, and tariff treatment notes
            for customs and freight teams.{" "}
            <Link href="/glossary" className="text-brand-blue-700 underline">
              Browse the glossary →
            </Link>
          </HubEmptyState>
        ) : (
          <div className="space-y-12 sm:space-y-16">
            {chapters.map((ch) => (
              <div key={ch}>
                <div className="font-display mb-5 flex items-center gap-3">
                  <span className="font-mono text-[28px] sm:text-[36px] font-semibold tracking-[-0.01em] text-brand-blue">
                    {ch}
                  </span>
                  <span className="h-px flex-1 bg-ink-100" />
                  <span className="font-mono text-[12px] text-ink-200">{grouped[ch].length}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {grouped[ch].map((h) => (
                    <HubCard key={h._id} href={`/hs/${h.slug.current}`} variant="compact">
                      <div className="flex items-baseline gap-3">
                        <span className="font-mono text-[14px] font-semibold text-brand-blue-700">{h.code}</span>
                        <span className="font-display flex-1 truncate text-[13.5px] font-semibold text-ink-900 group-hover:text-brand-blue-700">
                          {h.title}
                        </span>
                      </div>
                      {h.shortDefinition && (
                        <div className="font-body mt-1 text-[12.5px] leading-snug text-ink-500 line-clamp-2">
                          {h.shortDefinition}
                        </div>
                      )}
                    </HubCard>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <CtaBanner
        eyebrow="Looking up an HS code?"
        title="See who's actually shipping it."
        subtitle="LIT joins HS classifications to live shipment data — so '8517' becomes a list of importers you can target this week."
        primaryCta={{ label: "Try free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />
    </PageShell>
  );
}
