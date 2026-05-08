import type { Metadata } from "next";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { GLOSSARY_INDEX_QUERY } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { Section } from "@/components/sections/Section";
import { HubCard, HubEmptyState } from "@/components/sections/HubCard";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";
import { buildCollectionPage } from "@/lib/jsonLd";
import { Search, Database, FileSearch, ArrowRight } from "lucide-react";

export const revalidate = 600;

export const metadata: Metadata = buildMetadata({
  title: "Glossary — logistics, trade, and GTM terms in plain English",
  description:
    "Plain-English definitions for the terms revenue and logistics teams hit every day — TEU, BOL, HS code, ICP, intent data, ABM, and more. Updated weekly by the Glossary Expander agent.",
  path: "/glossary",
  eyebrow: "Glossary",
});

type Term = {
  _id: string;
  term: string;
  abbreviation?: string;
  shortDefinition?: string;
  category?: string;
  slug: { current: string };
};

export default async function GlossaryIndexPage() {
  const terms = (await sanityClient.fetch<Term[]>(GLOSSARY_INDEX_QUERY).catch(() => [])) || [];

  const grouped = terms.reduce<Record<string, Term[]>>((acc, t) => {
    const letter = (t.term?.[0] || "#").toUpperCase();
    (acc[letter] = acc[letter] || []).push(t);
    return acc;
  }, {});
  const letters = Object.keys(grouped).sort();

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Glossary" },
        ]}
      />
      <PageHero
        eyebrow="Glossary"
        title="Logistics, trade, and GTM terms"
        titleHighlight="in plain English."
        subtitle="The vocabulary you'll hear on every customer call, in every CRM, and across every shipping doc — defined without jargon."
        align="center"
      />

      {/* Product tie-in band — turns the glossary from a directory into
          something with a sales thesis. Three product hooks tie the most
          looked-up term categories back into LIT capabilities. */}
      {letters.length > 0 && (
        <Section top="md" bottom="md" tone="soft-blue" width="container">
          <div className="mx-auto max-w-[640px] text-center">
            <div className="eyebrow">From definition to action</div>
            <h2 className="display-md space-eyebrow-h1">
              Every term here <span className="grad-text">does something</span> inside LIT.
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
            {[
              {
                icon: FileSearch,
                eyebrow: "BOL · Bill of Lading",
                title: "becomes a search.",
                body: "124M+ filings indexed. Filter by importer, exporter, HS, lane, carrier — and reach the buyer-side contact the same day.",
                href: "/features/bill-of-lading-search",
                cta: "See BOL search",
              },
              {
                icon: Database,
                eyebrow: "HS code · Tariff classification",
                title: "becomes a tariff calc.",
                body: "Plug an HS code + origin country into the calculator and get landed cost with MFN, FTA, Section 301, and AD/CVD math.",
                href: "/tools/tariff-calculator",
                cta: "See tariff calc",
              },
              {
                icon: Search,
                eyebrow: "TEU · Twenty-foot equivalent",
                title: "becomes a benchmark.",
                body: "TEU 12m × FBX12 lane rate gives a defensible market-rate spend number on every account profile — not a guess.",
                href: "/rate-benchmark",
                cta: "See Rate Benchmark",
              },
            ].map((tie) => {
              const Icon = tie.icon;
              return (
                <Link
                  key={tie.href}
                  href={tie.href}
                  className="group relative block rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md"
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{
                      background: "rgba(37,99,235,0.08)",
                      boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.15)",
                    }}
                  >
                    <Icon className="h-5 w-5 text-brand-blue" aria-hidden />
                  </div>
                  <div className="font-display mt-4 text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-blue">
                    {tie.eyebrow}
                  </div>
                  <h3 className="display-sm mt-1.5 leading-tight">{tie.title}</h3>
                  <p className="font-body mt-3 text-[13.5px] leading-relaxed text-ink-500">
                    {tie.body}
                  </p>
                  <div className="font-display mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                    {tie.cta} <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      {letters.length === 0 ? (
        <Section bottom="lg">
          <HubEmptyState title="The freight glossary — publishing">
            Plain-English definitions for the terms freight forwarders, brokers, and customs operators
            use every day — from{" "}
            <span className="font-mono text-ink-700">Bill of Lading</span> and{" "}
            <span className="font-mono text-ink-700">TEU</span> through{" "}
            <span className="font-mono text-ink-700">Incoterms</span> and HS classification.{" "}
            <Link href="/demo" className="text-brand-blue-700 underline">
              Book a demo
            </Link>
            {" "}to see how these concepts power live shipper intelligence.
          </HubEmptyState>
        </Section>
      ) : (
        <>
          <Section top="none" bottom="sm">
            <div className="flex flex-wrap gap-1.5 rounded-2xl border border-ink-100 bg-white px-3 py-2 shadow-sm">
              {letters.map((l) => (
                <a
                  key={l}
                  href={`#${l}`}
                  className="font-display flex h-8 w-8 items-center justify-center rounded-md text-[12px] font-semibold text-ink-700 transition hover:bg-ink-25 hover:text-brand-blue"
                >
                  {l}
                </a>
              ))}
            </div>
          </Section>

          <Section top="sm" bottom="lg">
            <div className="space-y-12 sm:space-y-16">
              {letters.map((l) => (
                <div key={l} id={l} className="scroll-mt-24">
                  <div className="font-display mb-5 flex items-center gap-3">
                    <span className="text-[36px] sm:text-[44px] font-semibold tracking-[-0.02em] text-brand-blue">{l}</span>
                    <span className="h-px flex-1 bg-ink-100" />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {grouped[l].map((t) => (
                      <HubCard key={t._id} href={`/glossary/${t.slug.current}`} variant="compact">
                        <div className="font-display text-[15px] font-semibold text-ink-900 group-hover:text-brand-blue-700">
                          {t.term}
                          {t.abbreviation && (
                            <span className="font-mono ml-1.5 text-[12px] font-medium text-ink-200">
                              ({t.abbreviation})
                            </span>
                          )}
                        </div>
                        {t.shortDefinition && (
                          <div className="font-body mt-1 text-[13px] leading-snug text-ink-500 line-clamp-2">
                            {t.shortDefinition}
                          </div>
                        )}
                      </HubCard>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      <CtaBanner
        eyebrow="Want this in your stack?"
        title="See the terms come alive."
        subtitle="LIT joins this vocabulary to your real accounts — so 'BOL' becomes a list of 8 importers shipping from Vietnam this week."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "Read the blog", href: "/blog" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildCollectionPage({
              name: "Freight & GTM glossary",
              description:
                "Plain-English definitions for the terms revenue and logistics teams hit every day — TEU, BOL, HS code, ICP, intent data, ABM, and more. Updated weekly by the Glossary Expander agent.",
              path: "/glossary",
              type: "DefinedTerm",
              items: terms
                .filter((t) => t?.slug?.current && t?.term)
                .map((t) => ({
                  name: t.term,
                  url: `/glossary/${t.slug.current}`,
                })),
            }),
          ),
        }}
      />
    </PageShell>
  );
}
