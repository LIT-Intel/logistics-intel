import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { groq } from "next-sanity";
import { ArrowRight, Check } from "lucide-react";
import { StickyCTABar } from "@/components/lead-magnet/StickyCTABar";
import { ExitIntentModal } from "@/components/lead-magnet/ExitIntentModal";
import { LeadMagnetHero } from "@/components/lead-magnet/LeadMagnetHero";
import { LiveProductPreview } from "@/components/lead-magnet/LiveProductPreview";
import { ProofStrip } from "@/components/lead-magnet/ProofStrip";
import { OutcomesBand } from "@/components/lead-magnet/OutcomesBand";
import { MoneyPageFAQ } from "@/components/lead-magnet/MoneyPageFAQ";
import { sanityClient } from "@/sanity/lib/client";
import { buildMetadata, siteUrl } from "@/lib/seo";
import {
  SOLUTION_PAGES,
  SOLUTION_ROLE_CARDS,
  SOLUTION_ROLE_SLUGS,
  getSolutionBySlug,
  type SolutionRoleSlug,
} from "../_data";

export const revalidate = 86400;
export const dynamicParams = true;

/* ------------------------------------------------------------------ *
 * Sanity types + query                                                *
 * ------------------------------------------------------------------ */

type SanityLivePreviewItem = {
  initial?: string;
  name?: string;
  meta?: string;
  pillLabel?: string;
};

type SanityPlaybookStep = {
  stepNumber?: number;
  check?: string;
  title?: string;
  body?: string;
};

type SanityOutcome = { num?: string; label?: string; body?: string };

type SanityFaq = { question?: string; answer?: string };

type SanityCta = {
  headline?: string;
  body?: string;
  primaryCtaLabel?: string;
  primaryCtaUrl?: string;
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string;
};

type SanitySolutionRoleDoc = {
  _id: string;
  slug: { current: string } | string;
  role?: string;
  eyebrow?: string;
  h1?: string;
  subhead?: string;
  tldr?: string;
  targetKeyword?: string;
  audience?: string;
  livePreviewLabel?: string;
  livePreviewPulseLabel?: string;
  livePreviewUrlBar?: string;
  livePreviewItems?: SanityLivePreviewItem[];
  playbookSteps?: SanityPlaybookStep[];
  proofPoints?: Array<{ value?: string; label?: string; detail?: string }>;
  outcomes?: SanityOutcome[];
  cta?: SanityCta;
  faq?: SanityFaq[];
  publishedAt?: string;
  lastReviewedAt?: string;
  seo?: any;
};

const SOLUTION_ROLE_QUERY = groq`*[_type == "solutionRole" && slug.current == $slug][0]{
  _id, _updatedAt, slug, role, eyebrow, h1, subhead, tldr,
  targetKeyword, audience,
  livePreviewLabel, livePreviewPulseLabel, livePreviewUrlBar, livePreviewItems,
  playbookSteps,
  proofPoints,
  outcomes,
  cta,
  faq,
  aliases, publishedAt, lastReviewedAt, seo
}`;

const SOLUTION_ROLES_SLUGS_QUERY = groq`*[_type == "solutionRole" && defined(slug.current)]{
  "slug": slug.current
}`;

/* ------------------------------------------------------------------ *
 * Helpers                                                             *
 * ------------------------------------------------------------------ */

const ROLE_LABELS: Record<string, string> = {
  "freight-forwarders": "freight forwarders",
  "freight-brokers": "freight brokers",
  nvoccs: "NVOCCs",
  "3pls": "3PLs",
  "sales-leaders": "sales leaders",
};

function roleLabelFor(slug: string): string {
  return ROLE_LABELS[slug] || slug.replace(/-/g, " ");
}

function titleCaseRole(slug: string): string {
  if (slug === "nvoccs") return "NVOCCs";
  if (slug === "3pls") return "3PLs";
  return roleLabelFor(slug).replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Default playbook step copy keyed by role slug — used when neither
 * Sanity nor `_data.ts` carries an explicit playbook block. Mirrors the
 * Claude-Design `solutions/freight-forwarders.html` 5-step shape.
 */
const DEFAULT_PLAYBOOK: Record<
  SolutionRoleSlug,
  Array<{ step: string; title: string; body: string }>
> = {
  "freight-forwarders": [
    { step: "Step 1", title: "Score every BCO on your lanes", body: "Lane × HS × volume ICP scoring runs on every US importer in the BOL graph. Saved searches feed your queue daily." },
    { step: "Step 2", title: "Pull verified ocean + air contacts", body: "5–30 procurement, ocean, air, and customs contacts per importer. Validated weekly." },
    { step: "Step 3", title: "Sequence on shipment signal", body: "Pulse AI drafts outreach from real BOL — lane, carrier, volume, and recency. Multi-touch sequences ship in minutes." },
    { step: "Step 4", title: "Run pipeline in freight CRM", body: "Accounts auto-display TTM TEU, top lanes, and carrier mix. No re-keying from a generic CRM." },
    { step: "Step 5", title: "Watch the win signal", body: "Carrier-mix shifts, new lanes, and volume jumps flag accounts that are actively shopping." },
  ],
  "freight-brokers": [
    { step: "Step 1", title: "Filter BCOs by mode + equipment", body: "FCL/LCL, equipment type, and lane volume separately filterable across the 525K-importer graph." },
    { step: "Step 2", title: "Catch carrier displacement", body: "Pulse Coach flags shifts in an importer's carrier mix — often a sign they're shopping." },
    { step: "Step 3", title: "Reach decision-makers", body: "Procurement + transportation contacts, not generic CXO lists." },
    { step: "Step 4", title: "Sequence + dial in one tool", body: "Email, LinkedIn, and click-to-call inside LIT — no four-tool handoff." },
    { step: "Step 5", title: "Track to closed-won", body: "BCO acquisition pipeline with rep activity rolled up in the freight-native CRM." },
  ],
  nvoccs: [
    { step: "Step 1", title: "Filter LCL + FCL importers", body: "Every importer carries an LCL vs FCL split by lane and 12-month rolling volume." },
    { step: "Step 2", title: "Spot carrier displacement", body: "Carrier-mix shifts surface as Pulse signals — the booking is in motion." },
    { step: "Step 3", title: "Route to the booking contact", body: "Ocean transportation, logistics, and procurement contacts verified weekly." },
    { step: "Step 4", title: "Pitch on real shipments", body: "Pulse AI drafts outreach grounded in lane, carrier, container count, and recency." },
    { step: "Step 5", title: "Close in freight CRM", body: "Accounts auto-display TTM TEU and lane mix — no re-keying from a generic CRM." },
  ],
  "3pls": [
    { step: "Step 1", title: "Match BCOs to your network", body: "Lane × HS × volume × port-of-entry filters surface importers your warehouse + drayage actually serve." },
    { step: "Step 2", title: "Score seasonality fit", body: "12-month volume curve per importer makes peak periods visible at a glance." },
    { step: "Step 3", title: "Score drayage fit", body: "Port-of-entry × warehouse-DMA match scoring on every importer." },
    { step: "Step 4", title: "Reach supply chain decision-makers", body: "Supply chain, logistics, and procurement contacts verified weekly." },
    { step: "Step 5", title: "Bundle outreach", body: "Pitch warehouse + drayage + fulfillment from a single shipment-grounded sequence." },
  ],
  "sales-leaders": [
    { step: "Step 1", title: "Consolidate the stack", body: "Replace ZoomInfo + Outreach + HubSpot with one freight-native platform." },
    { step: "Step 2", title: "See pipeline by lane × mode", body: "Pipeline rolled up by what you actually sell, not generic stages." },
    { step: "Step 3", title: "Track rep ramp", body: "Time-to-first-meeting + time-to-pipeline per rep cohort, on one dashboard." },
    { step: "Step 4", title: "Measure ICP coverage", body: "Which accounts in your ICP have been touched, sequenced, or won." },
    { step: "Step 5", title: "Provision at scale", body: "SAML SSO + SCIM provisioning. Google Workspace, Okta, and Microsoft Entra supported." },
  ],
};

/* ------------------------------------------------------------------ *
 * Static params                                                       *
 * ------------------------------------------------------------------ */

export async function generateStaticParams() {
  const sanitySlugs = (await sanityClient
    .fetch<{ slug: string }[]>(SOLUTION_ROLES_SLUGS_QUERY)
    .catch(() => [])) || [];
  const slugSet = new Set<string>();
  for (const s of SOLUTION_ROLE_SLUGS) slugSet.add(s);
  for (const s of SOLUTION_PAGES) slugSet.add(s.slug);
  for (const s of sanitySlugs) if (s.slug) slugSet.add(s.slug);
  return Array.from(slugSet).map((slug) => ({ slug }));
}

/* ------------------------------------------------------------------ *
 * Metadata                                                            *
 * ------------------------------------------------------------------ */

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const sanityDoc = await sanityClient
    .fetch<SanitySolutionRoleDoc | null>(SOLUTION_ROLE_QUERY, {
      slug: params.slug,
    })
    .catch(() => null);

  if (sanityDoc) {
    return buildMetadata({
      title: sanityDoc.h1 || `LIT for ${roleLabelFor(params.slug)}`,
      description: sanityDoc.tldr || sanityDoc.subhead,
      path: `/solutions/${params.slug}`,
      eyebrow: sanityDoc.eyebrow,
      seo: sanityDoc.seo,
    });
  }

  const hard = getSolutionBySlug(params.slug);
  if (hard) {
    return buildMetadata({
      title: `${hard.title.replace(/—\s*$/, "").trim()} | LIT`,
      description: hard.metaDescription,
      path: `/solutions/${params.slug}`,
      eyebrow: hard.eyebrow,
    });
  }

  return {};
}

/* ------------------------------------------------------------------ *
 * Page                                                                *
 * ------------------------------------------------------------------ */

export default async function SolutionDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = params.slug;
  const sanityDoc = await sanityClient
    .fetch<SanitySolutionRoleDoc | null>(SOLUTION_ROLE_QUERY, { slug })
    .catch(() => null);
  const fallback = getSolutionBySlug(slug);

  if (!sanityDoc && !fallback) notFound();

  const roleLabel = titleCaseRole(slug);
  const roleLower = roleLabelFor(slug);
  const isCanonical = (SOLUTION_ROLE_SLUGS as readonly string[]).includes(slug);

  /* ---------- Resolve hero copy (Sanity > _data > defaults) ------- */
  const eyebrow =
    sanityDoc?.eyebrow ||
    fallback?.eyebrow ||
    `For ${roleLower}`;
  const h1 =
    sanityDoc?.h1 ||
    (fallback
      ? `${fallback.title.replace(/—\s*$/, "").trim()} ${fallback.titleHighlight ?? ""}`.trim()
      : `LIT for ${roleLabel}`);
  const subhead =
    sanityDoc?.subhead ||
    fallback?.lede ||
    `LIT configures a workspace for ${roleLower} — the right signals, searches, sequences, and dashboards out of the box.`;
  const tldr = sanityDoc?.tldr || fallback?.shortAnswer;

  /* ---------- Live preview rows ----------------------------------- */
  const livePreviewItems: SanityLivePreviewItem[] =
    sanityDoc?.livePreviewItems && sanityDoc.livePreviewItems.length > 0
      ? sanityDoc.livePreviewItems
      : defaultLivePreviewItems(slug);

  const livePreviewUrlBar =
    sanityDoc?.livePreviewUrlBar ||
    (isCanonical
      ? `solutions / ${slug}`
      : `${roleLower} workspace`);
  const livePreviewPulseLabel =
    sanityDoc?.livePreviewPulseLabel || "LIVE";

  /* ---------- Playbook steps -------------------------------------- */
  const playbookSteps: Array<{ step: string; title: string; body: string }> =
    sanityDoc?.playbookSteps && sanityDoc.playbookSteps.length > 0
      ? sanityDoc.playbookSteps.map((s, i) => ({
          step: s.check || `Step ${s.stepNumber ?? i + 1}`,
          title: s.title || `Step ${s.stepNumber ?? i + 1}`,
          body: s.body || "",
        }))
      : isCanonical
        ? DEFAULT_PLAYBOOK[slug as SolutionRoleSlug]
        : (fallback?.workflow || []).map((w) => ({
            step: "Step",
            title: w.step,
            body: w.body,
          }));

  /* ---------- Outcomes (optional) --------------------------------- */
  const outcomes: SanityOutcome[] | undefined =
    sanityDoc?.outcomes && sanityDoc.outcomes.length > 0
      ? sanityDoc.outcomes
      : isCanonical
        ? [
            {
              num: "8 min",
              label: "To first qualified meeting",
              body: `${roleLabel} on LIT average eight minutes from signup to booked meeting.`,
            },
            {
              num: "3-4 tools",
              label: "Stack consolidation",
              body: "Typical replacement: ImportYeti + ZoomInfo + Outreach + HubSpot collapsed into one contract.",
            },
            {
              num: "14 days",
              label: "To 80% activation",
              body: "Most teams reach 80% rep activation in two weeks. Onboarding is included in every paid plan.",
            },
          ]
        : undefined;

  /* ---------- FAQ ------------------------------------------------- */
  const faq: SanityFaq[] | undefined =
    sanityDoc?.faq && sanityDoc.faq.length > 0
      ? sanityDoc.faq
      : fallback?.faqs?.map((f) => ({ question: f.q, answer: f.a }));

  /* ---------- CTA copy ------------------------------------------- */
  const cta = sanityDoc?.cta;
  const primaryCtaLabel = cta?.primaryCtaLabel || "Try the playbook";
  const primaryCtaUrl =
    cta?.primaryCtaUrl ||
    `https://app.logisticintel.com/signup?source=solutions-${slug}`;
  const secondaryCtaLabel = cta?.secondaryCtaLabel || "Book a demo";
  const secondaryCtaUrl =
    cta?.secondaryCtaUrl || `/demo?source=solutions-${slug}`;
  const ctaHeadline =
    cta?.headline || `See LIT configured for ${roleLabel.toLowerCase()}.`;
  const ctaBody =
    cta?.body ||
    `Start free and the workspace builds itself around the way ${roleLower} sell freight.`;

  /* ---------- JSON-LD -------------------------------------------- */
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl("/") },
      {
        "@type": "ListItem",
        position: 2,
        name: "Solutions",
        item: siteUrl("/solutions"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: roleLabel,
        item: siteUrl(`/solutions/${slug}`),
      },
    ],
  };

  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: h1,
    description: tldr || subhead,
    url: siteUrl(`/solutions/${slug}`),
    isPartOf: { "@type": "WebSite", url: siteUrl("/") },
    about: {
      "@type": "SoftwareApplication",
      name: "LIT — Logistic Intel",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        category: "SaaS · freight revenue platform",
        url: siteUrl("/pricing"),
      },
    },
    audience: {
      "@type": "BusinessAudience",
      audienceType: roleLabel,
    },
  };

  return (
    <>
      <StickyCTABar />

      <LeadMagnetHero
        eyebrow={eyebrow}
        headline={h1}
        lede={subhead}
        ctaLabel={primaryCtaLabel}
        formSource={`solutions-${slug}-hero`}
      >
        <LiveProductPreview
          urlBarText={livePreviewUrlBar}
          pulseLabel={livePreviewPulseLabel}
        >
          <ul className="flex flex-col divide-y divide-white/5">
            {livePreviewItems.map((item, i) => (
              <li
                key={i}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span
                  aria-hidden
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-brand-cyan/30 bg-brand-cyan/10 font-mono text-[11px] font-bold text-brand-cyan"
                >
                  {(item.initial || (item.name?.[0] ?? "?")).slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-white">
                    {item.name || "—"}
                  </div>
                  {item.meta && (
                    <div className="truncate text-[11px] text-white/55">
                      {item.meta}
                    </div>
                  )}
                </div>
                {item.pillLabel && (
                  <span className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
                    {item.pillLabel}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </LiveProductPreview>
      </LeadMagnetHero>

      <ProofStrip />

      {/* Playbook */}
      {playbookSteps.length > 0 && (
        <section className="bg-white">
          <div className="mx-auto max-w-content px-4 py-20 sm:px-6 lg:py-24">
            <header className="mx-auto max-w-[760px] text-center">
              <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-brand-blue">
                The {roleLabel} playbook
              </div>
              <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
                The workflow that wins {playbookHeadlineTail(slug)}.
              </h2>
            </header>

            <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {playbookSteps.map((step, i) => (
                <article
                  key={i}
                  className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white p-7 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue/8 text-brand-blue-700"
                      style={{
                        boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.18)",
                      }}
                    >
                      <Check className="h-4 w-4" />
                    </span>
                    <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-brand-blue">
                      {step.step}
                    </span>
                  </div>
                  <h3 className="font-display mt-4 text-[18px] font-semibold leading-snug tracking-[-0.01em] text-ink-900">
                    {step.title}
                  </h3>
                  <p className="font-body mt-2 text-[14.5px] leading-relaxed text-ink-500">
                    {step.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {outcomes && outcomes.length > 0 && (
        <OutcomesBand
          items={outcomes.map((o) => ({
            num: o.num || "—",
            label: o.label || "",
            body: o.body || "",
          }))}
        />
      )}

      {faq && faq.length > 0 && (
        <MoneyPageFAQ
          items={faq
            .filter((f) => f.question && f.answer)
            .map((f) => ({ question: f.question!, answer: f.answer! }))}
        />
      )}

      {/* Final CTA */}
      <section className="bg-dark-0 text-white">
        <div className="mx-auto max-w-content px-4 py-20 sm:px-6 lg:py-24">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-10 text-center lg:p-14">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-brand-cyan">
              {roleLabel}
            </div>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              {ctaHeadline}
            </h2>
            <p className="mx-auto mt-4 max-w-prose text-base leading-relaxed text-white/70">
              {ctaBody}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={primaryCtaUrl}
                className="inline-flex h-12 items-center justify-center rounded-lg bg-brand-cyan px-6 text-sm font-semibold text-dark-0 shadow-glow-cyan transition hover:bg-brand-cyan-dim"
              >
                {primaryCtaLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href={secondaryCtaUrl}
                className="inline-flex h-12 items-center justify-center rounded-lg border border-white/20 bg-white/[0.04] px-6 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                {secondaryCtaLabel}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <ExitIntentModal />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPage) }}
      />
    </>
  );
}

/**
 * Default live-preview rows when neither Sanity nor `_data.ts` provides
 * them. Keeps the hero visual on-brand for the 5 canonical roles.
 */
function defaultLivePreviewItems(slug: string): SanityLivePreviewItem[] {
  if (slug === "freight-forwarders") {
    return [
      { initial: "AC", name: "Acme Imports", meta: "TR → LAX · 42 TEU TTM · COSCO", pillLabel: "ICP MATCH" },
      { initial: "BV", name: "BrightView Outdoor", meta: "VN → SAV · 28 TEU TTM · ZIM", pillLabel: "NEW BOL" },
      { initial: "MN", name: "Monarch Goods Co.", meta: "CN → SEA · 64 TEU TTM · MAERSK", pillLabel: "DISPLACEMENT" },
      { initial: "RV", name: "Rivermark Apparel", meta: "BD → NYC · 19 TEU TTM · CMA", pillLabel: "QUEUED" },
    ];
  }
  if (slug === "freight-brokers") {
    return [
      { initial: "GP", name: "Grand Pacific Foods", meta: "LAX → ATL · TL · reefer", pillLabel: "ICP MATCH" },
      { initial: "NM", name: "Northstar Materials", meta: "HOU → ORD · TL · flatbed", pillLabel: "SHOPPING" },
      { initial: "BR", name: "Brookline Retail", meta: "SAV → DFW · LTL · dry", pillLabel: "NEW LANE" },
      { initial: "SI", name: "Sierra Industrial", meta: "OAK → DEN · TL · dry", pillLabel: "QUEUED" },
    ];
  }
  if (slug === "nvoccs") {
    return [
      { initial: "OL", name: "Oakline Apparel", meta: "CN → LAX · 60% FCL · 40% LCL", pillLabel: "MIXED FLOW" },
      { initial: "VT", name: "Vantage Tools", meta: "VN → NYC · LCL · weekly", pillLabel: "NEW BOL" },
      { initial: "HV", name: "Harvest Beverages", meta: "CL → MIA · FCL · reefer", pillLabel: "DISPLACEMENT" },
      { initial: "PD", name: "Pinedale Furniture", meta: "MY → SAV · LCL · monthly", pillLabel: "QUEUED" },
    ];
  }
  if (slug === "3pls") {
    return [
      { initial: "MK", name: "Marketsquare DTC", meta: "LAX BCO · CA + TX warehouse fit", pillLabel: "DRAYAGE FIT" },
      { initial: "AR", name: "Arbor Home Goods", meta: "SAV BCO · GA + FL fulfillment", pillLabel: "PEAK Q3" },
      { initial: "TB", name: "Trailblaze Outdoors", meta: "NYC BCO · NJ + PA fulfillment", pillLabel: "NEW BOL" },
      { initial: "OC", name: "Oceanline Pet Foods", meta: "OAK BCO · reefer fit", pillLabel: "QUEUED" },
    ];
  }
  if (slug === "sales-leaders") {
    return [
      { initial: "P1", name: "Pipeline by lane × mode", meta: "$2.4M open · 38 accts · ocean + air", pillLabel: "DASHBOARD" },
      { initial: "R1", name: "Rep ramp · cohort Q1", meta: "Avg time-to-first-meeting: 8 min", pillLabel: "ON TRACK" },
      { initial: "IC", name: "ICP coverage", meta: "412 / 525 target accts touched (78%)", pillLabel: "COVERAGE" },
      { initial: "S1", name: "Signal coverage", meta: "92% of pipeline tied to BOL signal", pillLabel: "HEALTHY" },
    ];
  }
  return [
    { initial: "L1", name: "Live shipment signal", meta: "BCO importers in your ICP", pillLabel: "QUEUED" },
    { initial: "C1", name: "Verified contacts", meta: "Procurement + ops + supply chain", pillLabel: "READY" },
    { initial: "S1", name: "Sequence drafts", meta: "Grounded in real lanes + carriers", pillLabel: "AI DRAFT" },
  ];
}

function playbookHeadlineTail(slug: string): string {
  switch (slug) {
    case "freight-forwarders":
      return "ocean + air RFPs";
    case "freight-brokers":
      return "BCO acquisitions";
    case "nvoccs":
      return "LCL + FCL bookings";
    case "3pls":
      return "warehouse + drayage bids";
    case "sales-leaders":
      return "the freight sales motion";
    default:
      return "the freight motion";
  }
}
