import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { groq } from "next-sanity";
import { ArrowRight, Plug, RefreshCw, Workflow, Shield, Zap } from "lucide-react";
import { sanityClient } from "@/sanity/lib/client";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { PageHero } from "@/components/sections/PageHero";
import { FaqSection } from "@/components/sections/FaqSection";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { resolveLogoUrl } from "@/lib/sanityImage";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

export const revalidate = 600;
export const dynamicParams = true;

const INTEGRATION_QUERY = groq`*[_type == "integration" && slug.current == $slug][0]{
  _id, name, "slug": slug.current, category, logo, domain, tagline,
  twoWaySync, oauth, status, deepLink, seo
}`;

const ALL_INTEGRATION_SLUGS = groq`*[_type == "integration" && defined(slug.current)]{
  "slug": slug.current
}`;

type IntegrationDoc = {
  _id: string;
  name: string;
  slug: string;
  category?: string;
  logo?: any;
  domain?: string;
  tagline?: string;
  twoWaySync?: boolean;
  oauth?: boolean;
  status?: "live" | "beta" | "coming_soon";
  deepLink?: string;
  seo?: any;
};

export async function generateStaticParams() {
  const slugs =
    (await sanityClient
      .fetch<{ slug: string }[]>(ALL_INTEGRATION_SLUGS)
      .catch(() => [])) || [];
  return slugs.filter((s) => s.slug).map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const doc = await sanityClient
    .fetch<IntegrationDoc | null>(INTEGRATION_QUERY, { slug: params.slug })
    .catch(() => null);
  if (!doc) {
    return buildMetadata({
      title: "Integration not found",
      path: `/integrations/${params.slug}`,
    });
  }
  return buildMetadata({
    title: `Logistic Intel + ${doc.name} integration | LIT`,
    description:
      doc.tagline ||
      `Connect ${doc.name} to Logistic Intel and push freight-grade accounts, contacts, and shipment signals into your workflow.`,
    path: `/integrations/${doc.slug}`,
    eyebrow: `${doc.name} integration`,
    seo: doc.seo,
  });
}

/* ──────────────────────────────────────────────────────────────────────
 * Template content keyed off integration category. Keeps the route
 * generic — Sanity docs only need to define name/category/tagline and
 * the page renders the right "what this does / how it works / FAQ"
 * defaults for that category.
 * ──────────────────────────────────────────────────────────────────── */

type CategoryCopy = {
  whatItDoes: { title: string; body: string; icon: any }[];
  howItWorks: { title: string; body: string }[];
  useCases: string[];
  faqs: { question: string; answer: string }[];
};

const DEFAULT_COPY: CategoryCopy = {
  whatItDoes: [
    {
      title: "Sync direction",
      body: "Push verified freight accounts and contacts from Logistic Intel into your workflow.",
      icon: RefreshCw,
    },
    {
      title: "What flows",
      body: "Company records, contact details, shipment signals, and Coach-recommended next actions.",
      icon: Workflow,
    },
    {
      title: "Where it lives",
      body: "Drop into your existing workflow — no rip-and-replace, no parallel CRM to maintain.",
      icon: Plug,
    },
  ],
  howItWorks: [
    {
      title: "Connect",
      body: "Authenticate in two clicks. OAuth flow handles tokens, scopes, and refresh automatically.",
    },
    {
      title: "Map",
      body: "Pick the fields you want synced and confirm the default mappings. Adjust anytime.",
    },
    {
      title: "Run",
      body: "Freight signals flow into your stack on a schedule, or trigger downstream workflows in real time.",
    },
  ],
  useCases: [
    "Forwarders qualifying new shipper leads without re-keying data into the CRM",
    "Brokers pushing lane-match prospects into outbound cadences",
    "3PL sales teams enriching existing pipeline with verified shipment activity",
  ],
  faqs: [
    {
      question: "How long does setup take?",
      answer:
        "Most teams are connected and pushing their first records within 10 minutes. OAuth handles the auth flow; default field mappings cover the standard case.",
    },
    {
      question: "Do I need a paid Logistic Intel plan to use this?",
      answer:
        "Free-trial accounts can connect and test the integration. Production-scale syncing and team-wide access are included on Growth and Scale plans.",
    },
    {
      question: "Is the sync two-way?",
      answer:
        "Direction depends on the integration. Some run one-way (LIT → your tool), others run bidirectionally so updates flow back. Check the setup strip on this page for specifics.",
    },
    {
      question: "What happens if I disconnect?",
      answer:
        "Existing synced records stay in your destination tool. New activity stops flowing the moment you revoke access — no orphaned automations.",
    },
  ],
};

const CATEGORY_COPY: Record<string, Partial<CategoryCopy>> = {
  CRM: {
    whatItDoes: [
      {
        title: "Two-way sync",
        body: "Accounts, contacts, and pipeline stages stay in lockstep between Logistic Intel and your CRM.",
        icon: RefreshCw,
      },
      {
        title: "What flows",
        body: "Verified shipper accounts, decision-maker contacts, shipment activity timeline, and Coach recommendations.",
        icon: Workflow,
      },
      {
        title: "Where it lives",
        body: "Your reps work where they already work. LIT enriches the records they touch every day.",
        icon: Plug,
      },
    ],
    useCases: [
      "Freight forwarders keeping their CRM as single source of truth while LIT enriches it",
      "Brokers pushing newly qualified shippers straight into open deals",
      "3PL revenue teams matching shipment signals to the right account owner",
    ],
  },
  "Email + Sequencer": {
    whatItDoes: [
      {
        title: "Push to cadence",
        body: "Send LIT-verified contacts directly into your sequence or cadence with one click.",
        icon: ArrowRight,
      },
      {
        title: "What flows",
        body: "Contact emails, titles, company context, and the shipment signal that triggered the play.",
        icon: Workflow,
      },
      {
        title: "Where it lives",
        body: "Your reps stay in their outbound tool. LIT becomes the prospecting layer, not another inbox.",
        icon: Plug,
      },
    ],
    useCases: [
      "Outbound SDRs running freight-targeted cadences without manual list-building",
      "AEs nurturing tracked shippers with signal-triggered touches",
      "Freight brokers running cold-outreach plays at scale on verified decision-makers",
    ],
  },
  Messaging: {
    whatItDoes: [
      {
        title: "Signal delivery",
        body: "Shipper, lane, and reply alerts land in the channels your team already watches.",
        icon: Zap,
      },
      {
        title: "What flows",
        body: "New shipment activity, lane changes for tracked accounts, and replies to live campaigns.",
        icon: Workflow,
      },
      {
        title: "Where it lives",
        body: "Your team channel. No new inbox, no new app — just timely freight intelligence where you already live.",
        icon: Plug,
      },
    ],
    useCases: [
      "Sales teams getting paged when a tracked shipper starts moving freight on a new lane",
      "BD teams seeing live reply notifications without checking the LIT app",
      "Account managers staying ahead of churn risk by watching tracked-account signals",
    ],
  },
  Automation: {
    whatItDoes: [
      {
        title: "Trigger any workflow",
        body: "Any LIT event — saved company, new contact, signal fired — can trigger a downstream workflow.",
        icon: Zap,
      },
      {
        title: "What flows",
        body: "Webhook-style events with full record payloads. No code required to wire them up.",
        icon: Workflow,
      },
      {
        title: "Where it lives",
        body: "Bridge LIT to the long tail of tools your team uses but we don't natively integrate with.",
        icon: Plug,
      },
    ],
    useCases: [
      "Posting new tracked shipments to a custom internal dashboard",
      "Auto-creating tasks in a project tool when a target shipper hits a signal threshold",
      "Routing high-intent leads through a custom qualification workflow",
    ],
  },
  "Data warehouse": {
    whatItDoes: [
      {
        title: "Stream shipment data",
        body: "Pipe LIT shipment-intelligence into your warehouse for analyst-grade modeling and BI.",
        icon: RefreshCw,
      },
      {
        title: "What flows",
        body: "Shipments, accounts, contacts, signals, and engagement events — refreshed on a schedule.",
        icon: Workflow,
      },
      {
        title: "Where it lives",
        body: "Your warehouse. Your modeling layer. Your dashboards. We're just the source.",
        icon: Plug,
      },
    ],
    useCases: [
      "Analytics teams building freight-market dashboards on top of LIT shipment data",
      "Revenue ops blending LIT signals with first-party CRM data for territory modeling",
      "Data science teams training freight-propensity models on enriched shipment history",
    ],
  },
};

function getCopy(category?: string): CategoryCopy {
  const overrides = (category && CATEGORY_COPY[category]) || {};
  return {
    whatItDoes: overrides.whatItDoes || DEFAULT_COPY.whatItDoes,
    howItWorks: overrides.howItWorks || DEFAULT_COPY.howItWorks,
    useCases: overrides.useCases || DEFAULT_COPY.useCases,
    faqs: overrides.faqs || DEFAULT_COPY.faqs,
  };
}

function statusLabel(status?: string) {
  if (status === "live") return "Available";
  if (status === "beta") return "Beta";
  if (status === "coming_soon") return "Coming soon";
  return "Available";
}

function statusTone(status?: string) {
  if (status === "live") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "beta") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "coming_soon") return "border-ink-100 bg-ink-25 text-ink-500";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default async function IntegrationDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const doc = await sanityClient
    .fetch<IntegrationDoc | null>(INTEGRATION_QUERY, { slug: params.slug })
    .catch(() => null);
  if (!doc) notFound();

  const copy = getCopy(doc.category);
  const logoSrc = resolveLogoUrl({ logo: doc.logo, domain: doc.domain }, 128);
  const subhead =
    doc.tagline ||
    `Push verified freight accounts, contacts, and shipment signals from Logistic Intel into ${doc.name} — no manual exports, no re-keying.`;

  const softwareApplicationLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `Logistic Intel + ${doc.name} integration`,
    applicationCategory: "BusinessApplication",
    description: subhead,
    url: siteUrl(`/integrations/${doc.slug}`),
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    isPartOf: { "@type": "WebSite", name: "Logistic Intel", url: siteUrl("/") },
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: copy.faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Integrations", href: "/integrations" },
          { label: doc.name },
        ]}
      />

      <PageHero
        eyebrow={`Integration · ${doc.category || "Connector"}`}
        title={`Logistic Intel + ${doc.name}`}
        titleHighlight="integration"
        subtitle={subhead}
        primaryCta={{ label: "Start free trial", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "See it in action", href: "/demo" }}
      >
        <div className="flex items-center justify-start gap-5">
          <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
            <span className="font-display text-[20px] font-bold text-brand-blue-700">L</span>
          </div>
          <div className="font-display text-[18px] font-semibold text-ink-300">+</div>
          <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
            {logoSrc ? (
              <Image
                src={logoSrc}
                alt={doc.name}
                fill
                sizes="64px"
                className="object-contain p-2.5"
                unoptimized={logoSrc.includes("img.logo.dev")}
              />
            ) : (
              <span className="font-display text-[22px] font-bold text-ink-700">
                {doc.name[0]}
              </span>
            )}
          </div>
        </div>
      </PageHero>

      {/* What this integration does */}
      <section className="px-5 sm:px-8 py-16">
        <div className="mx-auto max-w-container">
          <div className="mx-auto max-w-[680px] text-center">
            <div className="eyebrow">What this does</div>
            <h2 className="display-lg mt-3">
              What the {doc.name} integration unlocks.
            </h2>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {copy.whatItDoes.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={`${item.title}-${i}`}
                  className="rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
                >
                  <div
                    className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{
                      background: "rgba(37,99,235,0.08)",
                      boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.15)",
                    }}
                  >
                    <Icon className="h-5 w-5 text-brand-blue" />
                  </div>
                  <h3 className="display-sm">{item.title}</h3>
                  <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">
                    {item.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-5 sm:px-8 py-16">
        <div className="mx-auto max-w-container">
          <div className="mx-auto max-w-[680px] text-center">
            <div className="eyebrow">How it works</div>
            <h2 className="display-lg mt-3">From zero to syncing in three steps.</h2>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {copy.howItWorks.map((step, i) => (
              <div
                key={`${step.title}-${i}`}
                className="relative rounded-2xl border border-ink-100 bg-white p-7 shadow-sm"
              >
                <div className="font-mono mb-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-brand-blue/30 bg-brand-blue/5 text-[13px] font-bold text-brand-blue-700">
                  {i + 1}
                </div>
                <h3 className="display-sm">{step.title}</h3>
                <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-500">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="px-5 sm:px-8 py-16">
        <div className="mx-auto max-w-container">
          <div className="mx-auto max-w-[680px] text-center">
            <div className="eyebrow">Use cases</div>
            <h2 className="display-lg mt-3">
              Why freight teams reach for {doc.name}.
            </h2>
          </div>
          <ul className="mx-auto mt-10 max-w-[760px] divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white shadow-sm">
            {copy.useCases.map((useCase, i) => (
              <li
                key={i}
                className="flex items-start gap-3 px-6 py-5"
              >
                <div
                  className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: "rgba(37,99,235,0.08)",
                    boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.15)",
                  }}
                >
                  <ArrowRight className="h-3.5 w-3.5 text-brand-blue" />
                </div>
                <p className="font-body text-[15px] leading-relaxed text-ink-700">
                  {useCase}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Setup details strip */}
      <section className="px-5 sm:px-8 py-16">
        <div className="mx-auto max-w-container">
          <div className="mx-auto max-w-[680px] text-center">
            <div className="eyebrow">Setup details</div>
            <h2 className="display-lg mt-3">The technical picture.</h2>
          </div>
          <div className="mx-auto mt-10 grid max-w-[860px] grid-cols-1 gap-px overflow-hidden rounded-2xl border border-ink-100 bg-ink-100 shadow-sm md:grid-cols-4">
            <SetupCell
              label="Auth"
              value={doc.oauth === false ? "API key" : "OAuth 2.0"}
              icon={Shield}
            />
            <SetupCell
              label="Sync direction"
              value={doc.twoWaySync ? "Two-way" : "One-way"}
              icon={RefreshCw}
            />
            <SetupCell
              label="Data freshness"
              value="Near real-time"
              icon={Zap}
            />
            <SetupCell
              label="Status"
              value={statusLabel(doc.status)}
              icon={Plug}
              statusClass={statusTone(doc.status)}
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <FaqSection
        eyebrow="FAQ"
        title={`${doc.name} integration questions, answered.`}
        faqs={copy.faqs}
      />

      <CtaBanner
        eyebrow="Connect it in minutes"
        title={`Connect ${doc.name} to Logistic Intel.`}
        subtitle="Spin up a free trial, authenticate in two clicks, and watch verified freight intelligence land in your stack."
        primaryCta={{ label: "Start free trial", href: APP_SIGNUP_URL, icon: "arrow" }}
        secondaryCta={{ label: "Book a Demo", href: "/demo" }}
      />

      <section className="px-5 sm:px-8 pb-12">
        <div className="mx-auto max-w-container text-center">
          <Link
            href="/integrations"
            className="font-display inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-blue-700 hover:text-brand-blue"
          >
            Browse all integrations
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
    </PageShell>
  );
}

function SetupCell({
  label,
  value,
  icon: Icon,
  statusClass,
}: {
  label: string;
  value: string;
  icon: any;
  statusClass?: string;
}) {
  return (
    <div className="bg-white px-6 py-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-ink-500" />
        <div className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink-500">
          {label}
        </div>
      </div>
      {statusClass ? (
        <span
          className={`font-display mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${statusClass}`}
        >
          {value}
        </span>
      ) : (
        <div className="font-display mt-2 text-[15px] font-semibold text-ink-900">
          {value}
        </div>
      )}
    </div>
  );
}
