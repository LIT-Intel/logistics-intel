import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Building2, Globe2, Linkedin, MapPin, Ship } from "lucide-react";
import { PageShell } from "@/components/sections/PageShell";
import { Section } from "@/components/sections/Section";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import {
  getCompanyBySlug,
  getTopCompanies,
  formatHeadquarters,
  formatNumber,
  formatUsdShort,
} from "@/lib/companies";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

/**
 * /companies/[slug] — programmatic importer profile pages.
 *
 * Data source: `public.lit_company_directory` (26,787 active rows
 * sourced from US Customs Bill of Lading filings). Each row gets one
 * URL slug derived from `company_key`. RLS allows anon SELECT so the
 * marketing site reads via the public anon key.
 *
 * Indexation strategy:
 *   - Top 100 companies by TEU are statically generated at build time
 *     (via generateStaticParams) for instant first paint.
 *   - The remaining ~26,700 generate on-demand with ISR (revalidate:
 *     daily). `dynamicParams: true` allows Next.js to render unknown
 *     slugs against the DB on first request, then cache.
 *
 * Each page is unique content from proprietary data — exactly the pSEO
 * playbook ImportYeti / ImportGenius / Panjiva run, applied to LIT's
 * BOL graph. The corpus grows as the import pipeline lands new rows.
 */

export const revalidate = 86400; // 24h ISR refresh
export const dynamicParams = true;

export async function generateStaticParams() {
  const top = await getTopCompanies(100);
  return top
    .filter((c) => c.seo_slug)
    .map((c) => ({ slug: c.seo_slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const company = await getCompanyBySlug(params.slug);
  if (!company) {
    return buildMetadata({
      title: "Company profile not found",
      path: `/companies/${params.slug}`,
    });
  }
  const hq = formatHeadquarters(company);
  return buildMetadata({
    title: `${company.company_name} — US import profile, BOL data, top trade lanes`,
    description:
      `Shipment intelligence on ${company.company_name}${hq ? ` (${hq})` : ""}: trailing 12-month ` +
      `Bill of Lading volume, TEU, lanes, and contact discovery. Source: US Customs filings.`,
    path: `/companies/${params.slug}`,
    eyebrow: "Importer profile",
  });
}

export default async function CompanyProfilePage({
  params,
}: {
  params: { slug: string };
}) {
  const c = await getCompanyBySlug(params.slug);
  if (!c) notFound();

  const hq = formatHeadquarters(c);
  const teu = Number(c.teu) || 0;
  const shipments = Number(c.shipments) || 0;
  const valueUsd = Number(c.value_usd) || 0;

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Companies", href: "/companies" },
          { label: c.company_name },
        ]}
      />

      <Section top="md" bottom="md">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[2fr,1fr] lg:gap-14">
          {/* Lede */}
          <div>
            <div className="lit-pill">
              <span className="dot" />
              US Customs · Importer profile · Refreshed weekly
            </div>
            <h1 className="display-xl space-eyebrow-h1 max-w-[640px]">
              {c.company_name}
            </h1>
            <p className="lead space-h1-intro max-w-[640px]">
              {c.company_name} is a US-based importer tracked across {formatNumber(shipments)} Bill
              of Lading filings totaling {formatNumber(teu)} TEU
              {valueUsd > 0 ? ` and ${formatUsdShort(valueUsd)} declared customs value` : ""}.
              Lane mix, top suppliers, and verified buyer-side contacts are available inside the
              LIT platform.
            </p>

            <div className="space-intro-cta flex flex-wrap gap-3">
              <Link
                href={APP_SIGNUP_URL}
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.45)]"
                style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
              >
                Open full profile in LIT <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/demo"
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white/80 px-6 text-[15px] font-semibold text-ink-900 backdrop-blur transition hover:bg-white"
              >
                Book a demo
              </Link>
            </div>
          </div>

          {/* Sidebar — identity card */}
          <aside className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
            <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-blue">
              Company at a glance
            </div>
            <dl className="mt-4 space-y-3 text-[13.5px]">
              {hq && (
                <Row icon={MapPin} label="Headquarters" value={hq} />
              )}
              {c.industry && <Row icon={Building2} label="Industry" value={c.industry} />}
              {c.domain && (
                <Row
                  icon={Globe2}
                  label="Domain"
                  value={
                    <a
                      href={`https://${c.domain.replace(/^https?:\/\//, "")}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-brand-blue-700 hover:underline"
                    >
                      {c.domain}
                    </a>
                  }
                />
              )}
              {c.linkedin_url && (
                <Row
                  icon={Linkedin}
                  label="LinkedIn"
                  value={
                    <a
                      href={c.linkedin_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-brand-blue-700 hover:underline"
                    >
                      Company page
                    </a>
                  }
                />
              )}
              {c.ultimate_parent_name && (
                <Row icon={Building2} label="Ultimate parent" value={c.ultimate_parent_name} />
              )}
            </dl>
          </aside>
        </div>
      </Section>

      {/* KPI strip */}
      <Section top="none" bottom="md">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Trailing 12m TEU" value={formatNumber(teu)} accent />
          <Kpi label="Shipments" value={formatNumber(shipments)} />
          <Kpi label="Declared value" value={formatUsdShort(valueUsd)} />
          <Kpi label="LCL share" value={c.lcl != null ? `${formatNumber(Number(c.lcl), 1)}%` : "—"} />
        </div>
      </Section>

      {/* In-LIT preview pitch */}
      <Section top="md" bottom="md" tone="soft-blue">
        <div className="mx-auto max-w-[760px]">
          <div className="eyebrow">Inside LIT</div>
          <h2 className="display-md space-eyebrow-h1">
            The full profile lives inside the platform.
          </h2>
          <p className="lead space-h1-intro">
            This public page surfaces the headline shipment numbers. Inside the LIT app every
            {" "}importer gets a full account view: top lanes by TEU, dominant carriers, monthly
            volume curve, HS code mix, top suppliers, and 5–30 verified buyer-side contacts in
            procurement, supply chain, and customs roles.
          </p>
          <ul className="mt-6 space-y-3 text-[15px] text-ink-700">
            {[
              "12-month shipment timeline with peak / trough flagging",
              "Top trade lanes by TEU with YoY trend",
              "Carrier mix and SCAC-level share by lane",
              "Verified contacts with role tags, email deliverability >95%, and Pulse-AI sequence drafts grounded in actual shipments",
              "Save to a watchlist; Pulse Coach pings on meaningful shipment changes",
            ].map((s) => (
              <li key={s} className="flex items-start gap-2.5">
                <span aria-hidden className="mt-2 inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Disclaimer / source */}
      <Section top="md" bottom="md">
        <div className="mx-auto max-w-[760px]">
          <div
            className="rounded-2xl border border-ink-100 bg-white px-6 py-5 text-[12.5px] text-ink-500"
            role="note"
          >
            Data sourced from US Customs Bill of Lading filings (publicly available records).
            Profile may include affiliated entities or doing-business-as names. For binding
            commercial intelligence, request the full profile inside the LIT platform.
          </div>
        </div>
      </Section>

      <CtaBanner
        eyebrow={`Outreach to ${c.company_name}`}
        title="See the verified contacts."
        subtitle="LIT joins this shipment profile with verified procurement, supply chain, and customs contacts — and drafts a Pulse-AI sequence grounded in the actual lanes above."
        primaryCta={{ label: "Try free", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />

      {/* JSON-LD: Organization (the company itself) + WebPage describing
          our profile of them. Marketing site identity stays in Organization
          schema on layout.tsx; this page describes the importer. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                name: c.company_name,
                ...(c.website ? { url: c.website } : c.domain ? { url: `https://${c.domain}` } : {}),
                ...(c.linkedin_url ? { sameAs: [c.linkedin_url] } : {}),
                ...(c.industry ? { industry: c.industry } : {}),
                ...(hq
                  ? {
                      address: {
                        "@type": "PostalAddress",
                        ...(c.city ? { addressLocality: c.city } : {}),
                        ...(c.state ? { addressRegion: c.state } : {}),
                        ...(c.country ? { addressCountry: c.country } : {}),
                        ...(c.postal_code ? { postalCode: c.postal_code } : {}),
                      },
                    }
                  : {}),
                ...(c.ultimate_parent_name
                  ? { parentOrganization: { "@type": "Organization", name: c.ultimate_parent_name } }
                  : {}),
              },
              {
                "@type": "WebPage",
                name: `${c.company_name} importer profile`,
                url: siteUrl(`/companies/${c.seo_slug}`),
                description: `Shipment activity, trade lanes, and BOL filing data for ${c.company_name}.`,
                isPartOf: { "@type": "WebSite", url: siteUrl("/") },
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: siteUrl("/") },
                  {
                    "@type": "ListItem",
                    position: 2,
                    name: "Companies",
                    item: siteUrl("/companies"),
                  },
                  { "@type": "ListItem", position: 3, name: c.company_name },
                ],
              },
            ],
          }),
        }}
      />
    </PageShell>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Ship;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-200" aria-hidden />
      <div className="min-w-0">
        <dt className="font-display text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
          {label}
        </dt>
        <dd className="font-body mt-0.5 text-[13.5px] leading-snug text-ink-900">{value}</dd>
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
    <div
      className={
        "rounded-2xl border bg-white px-5 py-4 shadow-sm " +
        (accent ? "border-brand-blue/30" : "border-ink-100")
      }
    >
      <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-500">
        {label}
      </div>
      <div
        className={
          "font-mono mt-1 text-[22px] font-bold tracking-[-0.02em] " +
          (accent ? "text-brand-blue-700" : "text-ink-900")
        }
      >
        {value}
      </div>
    </div>
  );
}
