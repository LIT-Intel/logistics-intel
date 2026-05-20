import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { groq } from "next-sanity";
import { StickyCTABar } from "@/components/lead-magnet/StickyCTABar";
import { ExitIntentModal } from "@/components/lead-magnet/ExitIntentModal";
import { MoneyPageShell } from "@/components/lead-magnet/MoneyPageShell";
import { LeadMagnetHero } from "@/components/lead-magnet/LeadMagnetHero";
import { LiveProductPreview } from "@/components/lead-magnet/LiveProductPreview";
import { ProofStrip } from "@/components/lead-magnet/ProofStrip";
import { OutcomesBand } from "@/components/lead-magnet/OutcomesBand";
import { ProductShowcase } from "@/components/sections/ProductShowcase";
import { StepsRow } from "@/components/sections/StepsRow";
import { QuoteGrid } from "@/components/sections/QuoteGrid";
import { fetchTeamAuthors } from "@/lib/team-authors";
import { sanityClient } from "@/sanity/lib/client";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { buildCollectionPage } from "@/lib/jsonLd";
import {
  SOLUTION_PAGES,
  SOLUTION_ROLE_SLUGS,
  SOLUTION_ROLE_CARDS,
  type SolutionRoleSlug,
} from "./_data";

export const revalidate = 86400;
export const dynamicParams = true;

export const metadata: Metadata = buildMetadata({
  title: "Solutions — LIT for every freight revenue role",
  description:
    "Freight forwarders, brokers, NVOCCs, 3PLs, sales leaders — LIT is configured differently for each role. Pick your motion and see the playbook.",
  path: "/solutions",
  eyebrow: "Solutions",
});

/**
 * Trimmed Sanity projection for the hub grid. We only need slug + the
 * card-safe fields; the per-role page does its own full fetch.
 */
type SanityRoleIndexItem = {
  slug: string;
  role?: string;
  eyebrow?: string;
  h1?: string;
  subhead?: string;
  targetKeyword?: string;
};

const SOLUTION_ROLES_INDEX_QUERY = groq`*[_type == "solutionRole" && defined(slug.current)] | order(role asc){
  "slug": slug.current, role, eyebrow, h1, subhead, targetKeyword
}`;

type RoleCardData = {
  slug: SolutionRoleSlug;
  title: string;
  body: string;
  source: "sanity" | "data";
};

/**
 * Merge Sanity-backed role docs with the hand-coded `_data.ts` roster.
 * Sanity wins when both exist; `_data.ts` is the safety net so all five
 * canonical slugs always render even before content is authored.
 */
function buildRoleCards(sanity: SanityRoleIndexItem[]): RoleCardData[] {
  const sanityBySlug = new Map<string, SanityRoleIndexItem>(
    sanity.filter((r) => r.slug).map((r) => [r.slug, r]),
  );
  return SOLUTION_ROLE_SLUGS.map((slug) => {
    const sanityDoc = sanityBySlug.get(slug);
    const fallback = SOLUTION_ROLE_CARDS[slug];
    if (sanityDoc) {
      return {
        slug,
        title: sanityDoc.h1 || fallback.title,
        body: sanityDoc.subhead || fallback.body,
        source: "sanity",
      };
    }
    return {
      slug,
      title: fallback.title,
      body: fallback.body,
      source: "data",
    };
  });
}

export default async function SolutionsHubPage() {
  const [sanityRoles, team] = await Promise.all([
    sanityClient
      .fetch<SanityRoleIndexItem[]>(SOLUTION_ROLES_INDEX_QUERY)
      .catch(() => []),
    fetchTeamAuthors(),
  ]);

  const cards = buildRoleCards(sanityRoles || []);

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
    ],
  };

  return (
    <>
      <StickyCTABar />
      <MoneyPageShell>

      <LeadMagnetHero
        eyebrow="Built for every freight revenue role"
        headline={
          <>
            One platform. <em>Five revenue motions.</em>
          </>
        }
        lede="Freight forwarders, brokers, 3PLs, NVOCCs, sales leaders — LIT is configured differently for each role. Pick yours and see the playbook."
        ctaLabel="See LIT for my role"
        formSource="solutions-hero"
        formNote="No credit card. Free tier includes 10 searches + 10 verified contacts."
      >
        <LiveProductPreview
          urlBarText="solutions / pick your motion"
          pulseLabel="5 ROLES"
        >
          <ul className="flex flex-col divide-y divide-white/5">
            {SOLUTION_ROLE_SLUGS.map((slug) => {
              const card = SOLUTION_ROLE_CARDS[slug];
              return (
                <li
                  key={slug}
                  className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span
                    aria-hidden
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-brand-cyan/30 bg-brand-cyan/10 font-mono text-[11px] font-bold text-brand-cyan"
                  >
                    {card.title
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-white">
                      {card.title}
                    </div>
                    <div className="truncate text-[11px] text-white/55">
                      {card.livePreviewMeta}
                    </div>
                  </div>
                  <span className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
                    {card.pillLabel}
                  </span>
                </li>
              );
            })}
          </ul>
        </LiveProductPreview>
      </LeadMagnetHero>

      <ProofStrip />

      {/* Glossy injection #1 — dark product showcase. Frame renders a
          CSS-only placeholder until screenshots clear PII review. */}
      <ProductShowcase
        eyebrow="Inside the workspace"
        heading="One screen. Every shipment, contact, and account in motion."
        lede="Search by buyer, lane, HS code, or signal. Pull verified decision-makers. Trigger a sequence — all inside LIT, no tab-switching."
        urlBarText="app.logisticintel.com / company / home depot"
        callouts={[
          { kpi: "524K", label: "Active US shippers" },
          { kpi: "120M+", label: "BOL records" },
          { kpi: "8 min", label: "To first booked meeting" },
        ]}
      />

      {/* Role router */}
      <section className="bg-white">
        <div className="mx-auto max-w-content px-4 py-20 sm:px-6 lg:py-24">
          <header className="mx-auto max-w-[720px] text-center">
            <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-brand-blue">
              Solutions by role
            </div>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              The playbook that ships your freight.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink-500">
              Each role gets a configured workspace — the right signals,
              searches, sequences, and dashboards — without manual setup.
            </p>
          </header>

          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {cards.map((card) => (
              <Link
                key={card.slug}
                href={`/solutions/${card.slug}`}
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
                data-source={card.source}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -top-12 -right-10 h-40 w-40 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(0,240,255,0.18), transparent 70%)",
                  }}
                />
                <div className="relative flex h-full flex-col">
                  <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-brand-blue">
                    Playbook
                  </div>
                  <h3 className="font-display mt-2 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink-900 group-hover:text-brand-blue-700">
                    {card.title}
                  </h3>
                  <p className="font-body mt-3 text-[14.5px] leading-relaxed text-ink-500">
                    {card.body}
                  </p>
                  <div className="mt-auto flex items-center justify-between border-t border-ink-100 pt-5">
                    <span className="font-display inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-blue-700">
                      See the playbook
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-200">
                      {card.source === "sanity" ? "Sanity" : "Playbook"}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Glossy injection #2 — 3-step "how it works." Bridges the role
          router and the outcomes band, so visitors who scroll past the
          grid still see a single canonical motion. */}
      <StepsRow
        eyebrow="How it works"
        heading="Pick your motion. LIT configures the rest."
        lede="Same platform, three muscle movements — find, qualify, engage. Configured around the way you sell freight."
        steps={[
          {
            eyebrow: "01 · Pick your motion",
            title: "Tell us how you sell freight",
            body: "Forwarder, broker, NVOCC, 3PL, or sales leader. The workspace adapts: signals, searches, sequences, and dashboards.",
            meta: "30 seconds · No credit card",
          },
          {
            eyebrow: "02 · Discover + understand",
            title: "Find shippers actively moving freight",
            body: "Search 524K active US shippers by lane, HS code, port, or buyer. Drill into shipment cadence + verified decision-makers.",
            meta: "Live data · Refreshed weekly",
          },
          {
            eyebrow: "03 · Engage + close",
            title: "Trigger a sequence — book the meeting",
            body: "Validated emails. Personalized hooks pulled from shipment history. Track replies, meetings, and pipeline in one place.",
            meta: "94% deliverability · 4.1× reply rate",
          },
        ]}
      />

      <OutcomesBand
        items={[
          {
            num: "5",
            label: "Configured workspaces",
            body: "Each role onboarding sets up the right signals, searches, sequences, and dashboards — without manual setup.",
          },
          {
            num: "8 min",
            label: "To first qualified meeting",
            body: "Average time from signup to first booked meeting across forwarder + broker customers.",
          },
          {
            num: "14 days",
            label: "To full team activation",
            body: "Most teams reach 80% rep activation within two weeks. Onboarding is included in every paid plan.",
          },
        ]}
      />

      {/* Glossy injection #3 — LIT-team voices. NOT customer
          testimonials (those live in the existing TestimonialTrio).
          Cards present how the LIT team thinks about onboarding,
          motion-fit, and the product loop. */}
      <QuoteGrid
        eyebrow="From the LIT team"
        heading="From the LIT team"
        ariaLabel="LIT team perspective on how each motion onboards"
        quotes={[
          {
            text: "We don't ship five products — we ship one platform that knows what motion you're in. Forwarders see lanes first. Brokers see shippers first. Sales leaders see pipeline first. Same data, different surface.",
            stats: [
              { num: "5", label: "Role workspaces" },
              { num: "8 min", label: "To first meeting" },
            ],
            name: team["gabriel-reyes"].name,
            role: team["gabriel-reyes"].role,
            avatarUrl: team["gabriel-reyes"].avatarUrl,
          },
          {
            text: "Onboarding is part of the product. Every plan ships with a workspace tour, lane templates, and sample sequences — so reps aren't staring at a blank dashboard on day one.",
            stats: [
              { num: "14 days", label: "Full team active" },
              { num: "80%", label: "Rep activation" },
            ],
            name: team["jennifer-okafor"].name,
            role: team["jennifer-okafor"].role,
            avatarUrl: team["jennifer-okafor"].avatarUrl,
          },
          {
            text: "We watch every search, every save, every reply. When a workflow earns its keep, it becomes a default. When it doesn't, it gets cut. The product gets better every week because the operators using it tell us what's working.",
            stats: [
              { num: "Weekly", label: "Ship cadence" },
              { num: "94%", label: "Email deliverability" },
            ],
            name: team["nikki-patel"].name,
            role: team["nikki-patel"].role,
            avatarUrl: team["nikki-patel"].avatarUrl,
          },
        ]}
      />

      {/* Final CTA */}
      <section className="bg-dark-0 text-white">
        <div className="mx-auto max-w-content px-4 py-20 sm:px-6 lg:py-24">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-10 text-center lg:p-14">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-brand-cyan">
              Pick your motion
            </div>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              See LIT configured for your role.
            </h2>
            <p className="mx-auto mt-4 max-w-prose text-base leading-relaxed text-white/70">
              Forwarder, broker, NVOCC, 3PL, sales leader — start free and the
              workspace builds itself around the way you sell freight.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup?source=solutions-final"
                className="inline-flex h-12 items-center justify-center rounded-lg bg-brand-cyan px-6 text-sm font-semibold text-dark-0 shadow-glow-cyan transition hover:bg-brand-cyan-dim"
              >
                Start free
              </Link>
              <Link
                href="/demo?source=solutions-final"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-white/20 bg-white/[0.04] px-6 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                Book a demo
              </Link>
            </div>
          </div>
        </div>
      </section>

      </MoneyPageShell>
      <ExitIntentModal />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildCollectionPage({
              name: "LIT solutions by freight revenue role",
              description:
                "Forwarders, brokers, NVOCCs, 3PLs, sales leaders — each on a configured LIT workspace.",
              path: "/solutions",
              items: cards.map((c) => ({
                name: c.title,
                url: `/solutions/${c.slug}`,
              })),
            }),
          ),
        }}
      />
    </>
  );
}

