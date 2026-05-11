import type { Metadata } from "next";
import { ArrowRight, Building2, Lock, MapPin } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/sections/Section";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { HubCard, HubCardGrid } from "@/components/sections/HubCard";
import { CtaBanner } from "@/components/sections/CtaBanner";
import {
  countActiveCompanies,
  getFeaturedBrandCompanies,
  getTopCompanies,
  formatHeadquarters,
  formatNumber,
  formatUsdShort,
  type FeaturedBrand,
  type PublicCompany,
} from "@/lib/companies";
import { buildMetadata } from "@/lib/seo";
import { buildCollectionPage } from "@/lib/jsonLd";

export const revalidate = 21600; // 6h

/**
 * Curated household-name importers we want visible on the hub. The ILIKE
 * pattern matches the raw customs filer name (e.g. "HOME DEPOT USA INC");
 * the domain is hard-coded so logo.dev resolves a real brand logo even
 * when the BOL feed doesn't carry a domain on the company row.
 */
const FEATURED_BRANDS: FeaturedBrand[] = [
  { pattern: "HOME DEPOT", domain: "homedepot.com" },
  { pattern: "COSTCO", domain: "costco.com" },
  { pattern: "APPLE INC", domain: "apple.com" },
  { pattern: "WALMART", domain: "walmart.com" },
  { pattern: "TARGET CORP", domain: "target.com" },
  { pattern: "LOWE", domain: "lowes.com" },
  { pattern: "BEST BUY", domain: "bestbuy.com" },
  { pattern: "NIKE", domain: "nike.com" },
  { pattern: "IKEA", domain: "ikea.com" },
  { pattern: "DOLLAR TREE", domain: "dollartree.com" },
  { pattern: "DOLLAR GENERAL", domain: "dollargeneral.com" },
  { pattern: "TESLA", domain: "tesla.com" },
  { pattern: "GENERAL MOTORS", domain: "gm.com" },
  { pattern: "FORD MOTOR", domain: "ford.com" },
  { pattern: "WAYFAIR", domain: "wayfair.com" },
  { pattern: "WILLIAMS-SONOMA", domain: "williams-sonoma.com" },
  { pattern: "TJX", domain: "tjx.com" },
  { pattern: "ROSS STORES", domain: "rossstores.com" },
  { pattern: "MACY", domain: "macys.com" },
  { pattern: "TRACTOR SUPPLY", domain: "tractorsupply.com" },
];

const HUB_CARD_COUNT = 25;
const LOGO_DEV_TOKEN = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN || "pk_X-1ZO13ESEOoMaJjlPzIaA";

export const metadata: Metadata = buildMetadata({
  title: "US importer directory — live BOL data for 26,000+ active companies",
  description:
    "Browse active US importers tracked across 124M+ Bill of Lading filings. Each preview surfaces TTM TEU, shipment cadence, container mix, and unit value per TEU — sourced from US Customs filings.",
  path: "/companies",
  eyebrow: "Importers",
});

export default async function CompaniesHubPage() {
  const [featuredRaw, top, total, indexable] = await Promise.all([
    getFeaturedBrandCompanies(FEATURED_BRANDS),
    getTopCompanies(60),
    countActiveCompanies(),
    countActiveCompanies({ substantiveOnly: true }),
  ]);

  // Featured first, then fill to HUB_CARD_COUNT with top-by-TEU, dedup by slug.
  const seen = new Set(featuredRaw.map((r) => r.seo_slug));
  const filler = top.filter((c) => c.seo_slug && !seen.has(c.seo_slug));
  type CardRow = PublicCompany & { _featured_domain?: string };
  const cards: CardRow[] = [
    ...(featuredRaw as CardRow[]),
    ...(filler as CardRow[]),
  ].slice(0, HUB_CARD_COUNT);

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
        subtitle={`Browse ${formatNumber(indexable)} substantive US importer profiles (10+ Bill of Lading filings) from a tracked universe of ${formatNumber(total)}+ active companies. Each preview mirrors the full profile inside LIT — headline volume, shipment cadence, container mix, and unit value per TEU.`}
        align="center"
      />

      <Section top="md" bottom="md">
        <div className="mb-8 flex items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Top by TEU · trailing 12 months</div>
            <h2 className="display-md space-eyebrow-h1">The biggest importers we&apos;re tracking.</h2>
          </div>
          <div className="font-mono hidden text-[12px] text-ink-200 sm:block">
            Showing {HUB_CARD_COUNT} of {formatNumber(total)}
          </div>
        </div>

        <HubCardGrid cols={2}>
          {cards.map((c) => (
            <CompanyPreviewCard key={c.seo_slug} c={c} />
          ))}
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
              items: cards.map((c) => ({
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

/**
 * Teaser preview card — visually echoes the profile page chrome (pill,
 * identity row, KPI strip) but holds the deep supply-chain sections
 * behind a locked teaser. The full lanes / carriers / contacts /
 * timeline live inside the LIT app; this card sells the visit.
 */
function CompanyPreviewCard({ c }: { c: PublicCompany & { _featured_domain?: string } }) {
  const hq = formatHeadquarters(c);
  const teu = Number(c.teu) || 0;
  const ships = Number(c.shipments) || 0;
  const valueUsd = Number(c.value_usd) || 0;
  const lclPct = c.lcl != null ? Number(c.lcl) : null;
  const logoDomain =
    c._featured_domain || (c.domain ? c.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : null);

  return (
    <HubCard href={`/companies/${c.seo_slug}`} className="flex flex-col gap-4" variant="compact">
      <div className="lit-pill self-start">
        <span className="dot" />
        US Customs · Importer profile
      </div>

      <div className="flex items-start gap-3">
        <LogoTile domain={logoDomain} name={c.company_name} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[18px] font-semibold leading-tight tracking-[-0.015em] text-ink-900 group-hover:text-brand-blue-700">
            {c.company_name}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-500">
            {hq && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden /> {hq}
              </span>
            )}
            {c.industry && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" aria-hidden /> {c.industry}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-ink-100 pt-4">
        <Kpi label="TTM TEU" value={formatNumber(teu)} accent />
        <Kpi label="Shipments" value={formatNumber(ships)} />
        <Kpi label="Value" value={formatUsdShort(valueUsd)} />
        <Kpi
          label="LCL %"
          value={lclPct != null ? `${formatNumber(lclPct, 1)}%` : "—"}
        />
      </div>

      <div className="relative overflow-hidden rounded-xl border border-ink-100 bg-gradient-to-b from-white to-ink-50/60 px-4 py-3">
        <div className="space-y-1.5" aria-hidden>
          <LockedRow label="Top lanes" />
          <LockedRow label="Top carriers" />
          <LockedRow label="Verified contacts" />
        </div>
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-white via-white/80 to-transparent">
          <div className="font-display mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-700">
            <Lock className="h-3 w-3 text-brand-blue" aria-hidden />
            Sign in to see lanes, carriers &amp; contacts
          </div>
        </div>
      </div>

      <div className="font-display mt-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
        Preview profile <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </HubCard>
  );
}

/**
 * Brand logo tile. Uses logo.dev's hosted lookup when we have a domain;
 * falls back to a two-letter monogram. The `referrerpolicy=no-referrer`
 * + `loading=lazy` combo keeps logo.dev's free-tier quota in check.
 */
function LogoTile({ domain, name }: { domain: string | null; name: string }) {
  const initials = name
    .replace(/[^A-Za-z\s]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (!domain) {
    return (
      <div
        aria-hidden
        className="font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ink-100 bg-ink-50 text-[13px] font-bold text-ink-500"
      >
        {initials || "·"}
      </div>
    );
  }

  const src = `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=80&format=png&retina=true`;
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ink-100 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${name} logo`}
        width={44}
        height={44}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-full w-full object-contain"
      />
    </div>
  );
}

function LockedRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="font-display w-[110px] shrink-0 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
        {label}
      </div>
      <div className="flex flex-1 gap-1.5">
        <div className="h-2 flex-1 rounded-full bg-ink-100" />
        <div className="h-2 w-1/3 rounded-full bg-ink-100/60" />
      </div>
    </div>
  );
}

function Kpi({
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
          "font-mono mt-1 text-[15px] font-bold tracking-[-0.015em] " +
          (accent ? "text-brand-blue-700" : "text-ink-900")
        }
      >
        {value}
      </div>
    </div>
  );
}
