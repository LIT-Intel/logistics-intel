import type { Metadata } from "next";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { GLOSSARY_INDEX_QUERY } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";
import { buildCollectionPage } from "@/lib/jsonLd";

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

  // Group alphabetically
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

      {letters.length === 0 ? (
        <section className="px-8 pb-20">
          <div className="mx-auto max-w-container">
            <div className="rounded-2xl border border-dashed border-ink-100 bg-white px-7 py-16 text-center">
              <div className="font-display text-[18px] font-semibold text-ink-900">The freight glossary — publishing</div>
              <p className="font-body mx-auto mt-2 max-w-[520px] text-[14px] leading-relaxed text-ink-500">
                Plain-English definitions for the terms freight forwarders, brokers, and customs operators
                use every day — from{" "}
                <span className="font-mono text-ink-700">Bill of Lading</span> and{" "}
                <span className="font-mono text-ink-700">TEU</span> through{" "}
                <span className="font-mono text-ink-700">Incoterms</span> and HS classification.{" "}
                <a href="/demo" className="text-brand-blue-700 underline">
                  Book a demo
                </a>
                {" "}to see how these concepts power live shipper intelligence.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="px-8 pb-6">
            <div className="mx-auto max-w-container">
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
            </div>
          </section>

          <section className="px-8 pb-20">
            <div className="mx-auto max-w-container space-y-12">
              {letters.map((l) => (
                <div key={l} id={l} className="scroll-mt-24">
                  <div className="font-display mb-4 flex items-center gap-3">
                    <span className="text-[44px] font-semibold tracking-[-0.02em] text-brand-blue">{l}</span>
                    <span className="h-px flex-1 bg-ink-100" />
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {grouped[l].map((t) => (
                      <Link
                        key={t._id}
                        href={`/glossary/${t.slug.current}`}
                        className="group rounded-xl border border-ink-100 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-sm"
                      >
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
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
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
