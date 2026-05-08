import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Ship,
  Handshake,
  Warehouse,
  Network,
  Headphones,
  Briefcase,
  FileSearch,
  Globe2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { Section } from "@/components/sections/Section";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";
import { buildCollectionPage } from "@/lib/jsonLd";
import { SOLUTION_PAGES } from "./_data";

/** Per-solution icon. Maps a slug to a lucide icon so each card carries
 *  a visual identity beyond text. Renders inside a tinted square at
 *  card top. */
const SOLUTION_ICONS: Record<string, LucideIcon> = {
  "freight-forwarders": Ship,
  "freight-brokers": Handshake,
  "3pl-sales": Warehouse,
  "freight-agencies": Network,
  "logistics-sales-teams": Headphones,
  "supply-chain-business-development": TrendingUp,
  "customs-brokers": FileSearch,
  "import-export-sales": Globe2,
};

/** Per-cohort icon for the section header. */
const COHORT_ICONS: Record<string, LucideIcon> = {
  "Freight providers": Ship,
  "Sales + BD teams": Briefcase,
  "Trade + compliance": FileSearch,
};

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
      {/* Single hero — was previously two stacked headers. Now one
          centered "Which team are you?" frame with the audience-selector
          chips directly below. Replaces both the old PageHero and the
          old soft-blue band. */}
      <section className="relative px-5 sm:px-8 pt-14 sm:pt-24 pb-10 sm:pb-12">
        <div className="mx-auto max-w-content text-center">
          <div className="mx-auto inline-flex">
            <div className="lit-pill">
              <span className="dot" />
              Solutions · Which team are you?
            </div>
          </div>
          <h1 className="display-xl space-eyebrow-h1 mx-auto max-w-[860px]">
            Pick your motion. Same platform,{" "}
            <span className="grad-text">tuned to your workflow.</span>
          </h1>
          <p className="lead space-h1-intro mx-auto max-w-[640px]">
            Forwarders, brokers, 3PLs, customs teams, agencies, and supply-chain BD all run on the
            same data graph — each with the framing their role actually needs.
          </p>
          <div className="space-intro-cta flex flex-wrap justify-center gap-3">
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
        </div>
      </section>

      <Section top="lg" bottom="lg" width="container">
        <div className="space-y-16 sm:space-y-24">
          {sections.map((g) => {
            const CohortIcon = COHORT_ICONS[g.label] ?? Briefcase;
            const sectionId = g.label
              .toLowerCase()
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9-]/g, "");
            return (
              <div key={g.label} id={sectionId} className="scroll-mt-24">
                {/* Cohort header — split into [icon + label] | [description]
                    so a wide screen reads as two columns; mobile stacks. */}
                <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-[auto,1fr] lg:items-end lg:gap-12">
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                      style={{
                        background: "rgba(37,99,235,0.08)",
                        boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.18)",
                      }}
                    >
                      <CohortIcon className="h-6 w-6 text-brand-blue-700" aria-hidden />
                    </div>
                    <div>
                      <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-200">
                        Audience · {String(sections.indexOf(g) + 1).padStart(2, "0")}
                      </div>
                      <h3 className="font-display mt-1 text-[26px] sm:text-[32px] font-semibold tracking-[-0.02em] text-ink-900">
                        {g.label}
                      </h3>
                    </div>
                  </div>
                  <p className="font-body text-[15.5px] leading-relaxed text-ink-500 lg:text-right">
                    {g.description}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2">
                  {g.items.map((s) => {
                    const Icon = SOLUTION_ICONS[s.slug] ?? Briefcase;
                    return (
                      <Link
                        key={s.slug}
                        href={`/solutions/${s.slug}`}
                        className="group relative flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white p-7 sm:p-8 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
                      >
                        {/* Decorative corner glow — subtle brand accent that
                            wakes up only on hover. */}
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -top-12 -right-10 h-40 w-40 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                          style={{
                            background:
                              "radial-gradient(circle, rgba(0,240,255,0.18), transparent 70%)",
                          }}
                        />

                        <div className="relative">
                          <div
                            className="flex h-12 w-12 items-center justify-center rounded-xl transition group-hover:scale-105"
                            style={{
                              background: "linear-gradient(180deg, #eff6ff, #dbeafe)",
                              boxShadow: "inset 0 0 0 1px rgba(59,130,246,0.18)",
                            }}
                          >
                            <Icon className="h-5 w-5 text-brand-blue-700" aria-hidden />
                          </div>

                          <div className="font-display mt-5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-brand-blue">
                            {s.eyebrow}
                          </div>
                          <h4 className="font-display mt-2 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink-900 group-hover:text-brand-blue-700">
                            {s.title.replace(/—\s*$/, "").replace(/^LIT for /, "").trim()}
                          </h4>
                          <p className="font-body mt-3 text-[14.5px] leading-relaxed text-ink-500 line-clamp-3">
                            {s.lede}
                          </p>

                          <div className="mt-6 flex items-center justify-between border-t border-ink-100 pt-4">
                            <span className="font-display inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-blue-700">
                              Read the playbook
                              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                            </span>
                            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-200">
                              {s.faqs?.length ?? 0} FAQs
                            </span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
