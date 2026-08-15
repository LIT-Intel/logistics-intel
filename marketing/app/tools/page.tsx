import type { Metadata } from "next";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { groq } from "next-sanity";
import { Calculator, ArrowRight } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/sections/Section";
import { HubCard, HubCardGrid } from "@/components/sections/HubCard";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { LEAD_MAGNETS } from "@/lib/leadMagnets";

export const revalidate = 1800;

/**
 * Internal cross-links (§25) — funnel hub visitors from a low-friction free
 * tool into the core product surfaces. Kept lightweight; the tools are the
 * hero of this page, these are the "what next" rail.
 */
const CROSS_LINKS = [
  { label: "Search & Discovery", href: "/company-intelligence" },
  { label: "Pulse AI", href: "/pulse" },
  { label: "Command Center CRM", href: "/command-center" },
  { label: "Solutions", href: "/solutions" },
  { label: "Pricing", href: "/pricing" },
];

export const metadata: Metadata = buildMetadata({
  title: "Free tools — calculators and lookups for logistics + GTM teams",
  description:
    "Free, no-signup tools: live US tariff calculator (USITC HTSUS data + Section 232/301/122 overlays), HS code lookup, lane volume estimator, and more. Built by the LIT team.",
  path: "/tools",
  eyebrow: "Free Tools",
});

const INDEX = groq`*[_type == "freeTool"] | order(displayOrder asc, name asc){
  _id, name, slug, tagline, category, requiresAuth
}`;

/**
 * Static "always live" tools that ship as native Next.js routes rather
 * than through Sanity. Surfaced first on the hub so the page never reads
 * as empty even before the freeTool corpus is seeded. The tariff
 * calculator pulls live USITC data, so it counts as production today.
 */
const STATIC_TOOLS = [
  {
    href: "/tools/tariff-calculator",
    category: "Customs",
    name: "US tariff calculator",
    tagline:
      "Live HTSUS rates from the USITC public API + Section 232 (steel/aluminum/copper), Section 301 China, and Section 122 reciprocal overlays. Sources cited per line.",
    icon: Calculator,
    badge: "Live",
  },
];

export default async function ToolsPage() {
  const tools = (await sanityClient.fetch<any[]>(INDEX).catch(() => [])) || [];

  // ItemList JSON-LD covering every free tool on the hub (§25) — the five
  // interactive lead magnets first, then the static tariff calculator.
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Free logistics + GTM tools by Logistics Intel",
    itemListElement: [...LEAD_MAGNETS, ...STATIC_TOOLS.map((t) => ({ name: t.name, href: t.href }))].map(
      (t, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: t.name,
        url: siteUrl(t.href),
      }),
    ),
  };

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />
      <PageHero
        eyebrow="Free tools"
        title="Free, no-signup"
        titleHighlight="logistics + GTM tools."
        subtitle="Built by the LIT team — for teams that just need a quick answer. No signup, no dark patterns, no email gates."
        align="center"
      />

      {/* Interactive lead-magnet tools — the highest-value free tools. Driven
          by the shared LEAD_MAGNETS config so this list never drifts from the
          homepage strip or the routes themselves (§5, §25). */}
      <Section top="none" bottom="md">
        <div className="mb-6 max-w-[640px]">
          <div className="eyebrow">Instant intelligence</div>
          <h2 className="display-md space-eyebrow-h1">Run real freight data in your browser.</h2>
          <p className="font-body mt-3 text-[14.5px] leading-relaxed text-ink-500">
            Five interactive tools built on cached U.S. customs data — search a company, build a
            prospect list, or size an account without a login.
          </p>
        </div>
        <HubCardGrid>
          {LEAD_MAGNETS.map((t) => {
            const Icon = t.icon;
            return (
              <HubCard key={t.href} href={t.href} className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{
                      background: "rgba(37,99,235,0.08)",
                      boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.18)",
                    }}
                  >
                    <Icon className="h-5 w-5 text-brand-blue-700" aria-hidden />
                  </div>
                </div>
                <div className="font-display text-[11px] font-bold uppercase tracking-wider text-brand-blue">
                  {t.category}
                </div>
                <h3 className="display-sm">{t.name}</h3>
                <p className="font-body text-[14px] leading-relaxed text-ink-500">{t.blurb}</p>
                <div className="font-display mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                  Open tool <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </HubCard>
            );
          })}
        </HubCardGrid>
      </Section>

      {/* Static tools — always render. The tariff calculator runs against
          the live USITC HTSUS REST API, so it ships as a real working
          tool independent of the Sanity content pipeline. */}
      <Section top="md" bottom="md">
        <div className="mb-6 max-w-[640px]">
          <div className="eyebrow">Calculators &amp; lookups</div>
          <h2 className="display-md space-eyebrow-h1">More free utilities.</h2>
        </div>
        <HubCardGrid>
          {STATIC_TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <HubCard key={t.href} href={t.href} className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{
                      background: "rgba(37,99,235,0.08)",
                      boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.18)",
                    }}
                  >
                    <Icon className="h-5 w-5 text-brand-blue-700" aria-hidden />
                  </div>
                  {t.badge && (
                    <span
                      className="font-display inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-emerald-700"
                    >
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                        style={{ boxShadow: "0 0 0 2px rgba(16,185,129,0.18)" }}
                      />
                      {t.badge}
                    </span>
                  )}
                </div>
                <div className="font-display text-[11px] font-bold uppercase tracking-wider text-brand-blue">
                  {t.category}
                </div>
                <h3 className="display-sm">{t.name}</h3>
                <p className="font-body text-[14px] leading-relaxed text-ink-500">
                  {t.tagline}
                </p>
                <div className="font-display mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                  Open the tool <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </HubCard>
            );
          })}
        </HubCardGrid>
      </Section>

      {/* Sanity-driven tools surface below the static ones. They render
          as a separate group with a "More tools" header so the static
          tools above don't get visually mixed with seed content. */}
      {tools.length > 0 && (
        <Section top="md" bottom="lg">
          <div className="mb-6 max-w-[640px]">
            <div className="eyebrow">More tools</div>
            <h2 className="display-md space-eyebrow-h1">From the LIT toolbox.</h2>
          </div>
          <HubCardGrid>
            {tools.map((t) => (
              <HubCard key={t._id} href={`/tools/${t.slug?.current}`}>
                {t.category && (
                  <div className="font-display text-[11px] font-bold uppercase tracking-wider text-brand-blue">
                    {t.category}
                  </div>
                )}
                <h3 className="display-sm mt-2">{t.name}</h3>
                {t.tagline && (
                  <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">{t.tagline}</p>
                )}
              </HubCard>
            ))}
          </HubCardGrid>
        </Section>
      )}

      {/* If only the static tool exists, surface a "more on the way" line
          rather than the old empty-state card so the page doesn't read
          as nothing-yet when there's already a working tool above. */}
      {tools.length === 0 && (
        <Section top="md" bottom="lg">
          <div className="rounded-2xl border border-dashed border-ink-100 bg-white px-6 py-10 text-center sm:px-8 sm:py-12">
            <div className="font-display text-[16px] font-semibold text-ink-900">
              More free tools, rolling out
            </div>
            <p className="font-body mx-auto mt-2 max-w-[480px] text-[13.5px] leading-relaxed text-ink-500">
              Lane volume estimator, HS code lookup, TEU calculator, and shipper search are next. To
              use the full versions today,{" "}
              <Link href="/demo" className="text-brand-blue-700 underline">
                book a demo
              </Link>{" "}
              or{" "}
              <Link href={APP_SIGNUP_URL} className="text-brand-blue-700 underline">
                start free
              </Link>
              .
            </p>
          </div>
        </Section>
      )}

      {/* Internal cross-links (§25) — route free-tool visitors into the
          core product + commercial surfaces. */}
      <Section top="none" bottom="md">
        <div className="rounded-2xl border border-ink-100 bg-white/70 px-6 py-6 sm:px-8">
          <div className="font-display text-[13px] font-semibold uppercase tracking-wider text-ink-500">
            Explore the platform
          </div>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {CROSS_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="font-display inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-white px-4 py-2 text-[13px] font-semibold text-ink-900 transition-colors hover:border-blue-200 hover:text-brand-blue-700"
              >
                {l.label}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ))}
          </div>
        </div>
      </Section>

      <CtaBanner
        eyebrow="Need more"
        title="The full platform is two clicks away."
        subtitle="LIT runs all of these calculations against your real accounts and lanes — and tells you what to do about it."
        primaryCta={{ label: "Try free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />
    </PageShell>
  );
}
