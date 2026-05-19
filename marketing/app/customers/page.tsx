import type { Metadata } from "next";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import {
  CUSTOMERS_INDEX_QUERY,
  CUSTOMER_STORIES_INDEX_QUERY,
} from "@/sanity/lib/queries";
import { MoneyPageShell } from "@/components/lead-magnet/MoneyPageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { StickyCTABar } from "@/components/lead-magnet/StickyCTABar";
import { ExitIntentModal } from "@/components/lead-magnet/ExitIntentModal";
import { LeadMagnetHero } from "@/components/lead-magnet/LeadMagnetHero";
import { LiveProductPreview } from "@/components/lead-magnet/LiveProductPreview";
import { ProofStrip } from "@/components/lead-magnet/ProofStrip";
import { OutcomesBand } from "@/components/lead-magnet/OutcomesBand";
import { buildMetadata } from "@/lib/seo";
import { buildCollectionPage } from "@/lib/jsonLd";

export const revalidate = 600;

export const metadata: Metadata = buildMetadata({
  title: "Customer stories — real freight teams, real results | LIT",
  description:
    "Real revenue stories from freight forwarders, brokers, NVOCCs, and 3PLs that switched to LIT. No paid testimonials. Just outcomes.",
  path: "/customers",
  eyebrow: "Customers",
});

/**
 * Normalized story shape used by the hub card grid + featured-preview
 * slot. Two source schemas feed it:
 *   - `caseStudy` (legacy; the bulk of current content)
 *   - `customerStory` (new mirror schema with richer outcomes/quote)
 * The hub fetches BOTH and merges into a single sorted feed, tagging
 * `kind` so the card renderer can branch when a field is schema-specific.
 */
type Story = {
  _id: string;
  kind: "caseStudy" | "customerStory";
  slug: string;
  customer: string;
  industry?: string;
  headline: string;
  subhead?: string;
  publishedAt?: string;
  heroOutcome?: { metric?: string; label?: string; detail?: string };
  outcomes?: Array<{ num: string; label: string; body?: string; cite?: string }>;
  kpis?: Array<{ value: string; label: string }>;
  quote?: { text?: string; name?: string; author?: string; role?: string; roleTitle?: string };
};

function normalizeCaseStudy(c: any): Story {
  return {
    _id: c._id,
    kind: "caseStudy",
    slug: c.slug?.current ?? "",
    customer: c.customer,
    industry: c.industry?.name,
    headline: c.headline,
    subhead: c.subhead,
    publishedAt: c.publishedAt,
    kpis: c.kpis,
    quote: c.quote,
  };
}

function normalizeCustomerStory(s: any): Story {
  return {
    _id: s._id,
    kind: "customerStory",
    slug: typeof s.slug === "string" ? s.slug : s.slug?.current ?? "",
    customer: s.customerName,
    industry: s.industry,
    headline: s.headline,
    subhead: s.subhead,
    publishedAt: s.publishedAt,
    heroOutcome: s.heroOutcome,
    outcomes: s.outcomes,
    quote: s.quote,
  };
}

export default async function CustomersPage() {
  const [legacy, fresh] = await Promise.all([
    sanityClient
      .fetch<any>(CUSTOMERS_INDEX_QUERY)
      .catch(() => ({ caseStudies: [], logos: [] })),
    sanityClient
      .fetch<any[]>(CUSTOMER_STORIES_INDEX_QUERY)
      .catch(() => []),
  ]);

  const caseStudies: any[] = legacy?.caseStudies || [];
  const customerStories: any[] = Array.isArray(fresh) ? fresh : [];

  const stories: Story[] = [
    ...caseStudies.map(normalizeCaseStudy),
    ...customerStories.map(normalizeCustomerStory),
  ]
    .filter((s) => s.slug && s.customer && s.headline)
    .sort((a, b) => {
      const ad = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const bd = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return bd - ad;
    });

  const featured = stories[0];

  return (
    <MoneyPageShell>
      <StickyCTABar />

      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Customers" },
        ]}
      />

      <LeadMagnetHero
        eyebrow="Customer stories · Real freight teams, real results"
        headline={
          <>
            How forwarders &amp; brokers <em>book 4× more</em> first meetings with LIT.
          </>
        }
        lede="Real revenue stories from freight forwarders, brokers, NVOCCs, and 3PLs that switched their prospecting stack to LIT. No paid testimonials. No vendor-spun puff pieces. Just outcomes."
        ctaLabel="Try it free →"
        formSource="customers-hero"
        formNote="Free forever for the first 10 searches. SOC 2 · GDPR · CCPA."
      >
        <LiveProductPreview
          urlBarText={
            featured?.industry
              ? `Featured customer · ${featured.industry}`
              : "Featured customer"
          }
          pulseLabel="RESULTS"
        >
          {featured ? <FeaturedPreview story={featured} /> : <EmptyPreview />}
        </LiveProductPreview>
      </LeadMagnetHero>

      <ProofStrip />

      {stories.length > 0 && (
        <section className="px-5 sm:px-8 py-20">
          <div className="mx-auto max-w-container">
            <header className="mb-12 max-w-2xl">
              <div className="font-display text-[11.5px] font-bold uppercase tracking-[0.16em] text-brand-blue-700">
                Customer stories
              </div>
              <h2 className="font-display mt-2 text-[34px] font-semibold leading-tight tracking-[-0.02em] text-ink-900 sm:text-[40px]">
                From cold list to booked meeting.
              </h2>
            </header>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {stories.map((story) => (
                <StoryCard key={`${story.kind}:${story._id}`} story={story} />
              ))}
            </div>
          </div>
        </section>
      )}

      <OutcomesBand
        items={[
          {
            num: "4.1×",
            label: "More first meetings",
            body: "Replacing cold lists with shipment-triggered prospecting lifts reply rate across every customer benchmark we have measured.",
          },
          {
            num: "70%",
            label: "Less time on list-building",
            body: "From 12-hour weekly list builds to 8-minute searches. Reps spend the saved time on conversation, not data prep.",
          },
          {
            num: "94%",
            label: "Email deliverability",
            body: "Validated across 4,200 outbound sends at a top-50 NVOCC. Hard bounce rate under 6%.",
          },
        ]}
      />

      <section className="relative overflow-hidden bg-dark-0 px-5 py-20 text-white sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(700px 360px at 50% 0%, rgba(0,240,255,0.18), transparent 65%)",
          }}
        />
        <div className="relative mx-auto max-w-2xl text-center">
          <h2 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
            See if LIT works on your lanes — in 30 seconds.
          </h2>
          <p className="mt-4 text-white/70">
            Free forever for the first 10 searches. No credit card.
          </p>
          <FinalEmailForm />
        </div>
      </section>

      <CtaBanner
        eyebrow="Be next"
        title="Want results like these?"
        subtitle="A 30-min walkthrough with the team. We'll load your accounts, your lanes, and your industry."
        primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
        secondaryCta={{ label: "See features", href: "/features" }}
      />

      <ExitIntentModal />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildCollectionPage({
              name: "LIT customer stories",
              description:
                "How real revenue teams use LIT to outpace competitors. Case studies, results, and the playbooks behind them.",
              path: "/customers",
              items: stories.map((s) => ({
                name: s.customer,
                url: `/customers/${s.slug}`,
              })),
            }),
          ),
        }}
      />
    </MoneyPageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Featured-preview slot (lives in the hero's LiveProductPreview)     */
/* ------------------------------------------------------------------ */

function FeaturedPreview({ story }: { story: Story }) {
  // For customerStory: use heroOutcome + outcomes (richer set).
  // For caseStudy:    fall back to kpis (existing field shape).
  const stats: Array<{ num: string; label: string }> = (() => {
    if (story.kind === "customerStory") {
      const items: Array<{ num: string; label: string }> = [];
      if (story.heroOutcome?.metric) {
        items.push({
          num: story.heroOutcome.metric,
          label: story.heroOutcome.label || "Headline outcome",
        });
      }
      (story.outcomes || []).slice(0, 3 - items.length).forEach((o) => {
        if (o.num) items.push({ num: o.num, label: o.label || "" });
      });
      return items.slice(0, 3);
    }
    return (story.kpis || []).slice(0, 3).map((k) => ({
      num: k.value,
      label: k.label,
    }));
  })();

  const quoteText =
    story.quote?.text ||
    (story.kind === "customerStory" ? story.subhead : story.subhead);
  const quoteAttribution =
    story.kind === "customerStory"
      ? [story.quote?.name, story.quote?.roleTitle].filter(Boolean).join(" · ")
      : [story.quote?.name || story.quote?.author, story.quote?.role]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="p-6 text-white">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-cyan">
        {story.industry || "Customer"}
      </div>
      <h3 className="font-display mt-2 text-[20px] font-semibold leading-snug tracking-[-0.01em]">
        {story.headline}
      </h3>
      {quoteText && (
        <p className="mt-3 text-sm italic leading-relaxed text-white/75">
          “{quoteText}”
        </p>
      )}
      {quoteAttribution && (
        <p className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-white/45">
          {quoteAttribution}
        </p>
      )}
      {stats.length > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4">
          {stats.map((s, i) => (
            <div key={i}>
              <div
                className="font-display text-[22px] font-bold leading-none tracking-tight"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg,#00F0FF 0%,#3b82f6 60%,#2563eb 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {s.num}
              </div>
              <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/65">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}
      <Link
        href={`/customers/${story.slug}`}
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-cyan hover:text-white"
      >
        Read the full story →
      </Link>
    </div>
  );
}

function EmptyPreview() {
  return (
    <div className="p-8 text-center text-white/70">
      <div className="font-display text-[14px] font-semibold text-white">
        Customer stories coming soon
      </div>
      <p className="mt-2 text-sm">
        New stories ship from Studio every week.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

function StoryCard({ story }: { story: Story }) {
  const heroNum =
    story.kind === "customerStory"
      ? story.heroOutcome?.metric || story.outcomes?.[0]?.num
      : story.kpis?.[0]?.value;
  const heroLabel =
    story.kind === "customerStory"
      ? story.heroOutcome?.label || story.outcomes?.[0]?.label
      : story.kpis?.[0]?.label;

  return (
    <Link
      href={`/customers/${story.slug}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
    >
      <div className="px-7 pt-7 pb-6">
        {story.industry && (
          <span className="inline-flex items-center rounded-full border border-ink-100 bg-ink-25 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-700">
            {story.industry}
          </span>
        )}
        <h3 className="font-display mt-4 text-[22px] font-semibold leading-tight tracking-[-0.015em] text-ink-900 group-hover:text-brand-blue-700">
          {story.headline}
        </h3>
        {story.subhead && (
          <p className="font-body mt-2 line-clamp-2 text-[14px] leading-relaxed text-ink-500">
            {story.subhead}
          </p>
        )}
      </div>
      {heroNum && (
        <div className="border-t border-ink-100 bg-ink-25 px-7 py-4">
          <div className="font-mono text-[24px] font-semibold tracking-[-0.01em] text-brand-blue-700">
            {heroNum}
          </div>
          {heroLabel && (
            <div className="font-display mt-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-500">
              {heroLabel}
            </div>
          )}
        </div>
      )}
      <div className="border-t border-ink-100 px-7 py-4 text-[13px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
        Read the case study →
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Final CTA email form (server-rendered <form> POSTing to the lead   */
/* endpoint; client behavior shared with the hero would require a     */
/* client component — keep this lightweight + progressive)            */
/* ------------------------------------------------------------------ */

function FinalEmailForm() {
  return (
    <form
      action="/api/leads/resend"
      method="post"
      className="mx-auto mt-7 flex w-full max-w-md flex-col gap-2 sm:flex-row"
    >
      <input type="hidden" name="source" value="customers-final" />
      <label htmlFor="lit-customers-final-email" className="sr-only">
        Work email
      </label>
      <input
        id="lit-customers-final-email"
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="you@company.com"
        className="h-12 min-w-0 flex-1 rounded-lg border border-white/15 bg-white/[0.06] px-4 text-sm text-white placeholder:text-white/40 focus:border-brand-cyan focus:outline-none focus:ring-1 focus:ring-brand-cyan"
      />
      <button
        type="submit"
        className="inline-flex h-12 items-center justify-center rounded-lg bg-brand-cyan px-6 text-sm font-semibold text-dark-0 shadow-glow-cyan transition hover:bg-brand-cyan-dim"
      >
        Try it free →
      </button>
    </form>
  );
}
