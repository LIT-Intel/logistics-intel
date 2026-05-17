import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  XCircle,
  Filter,
  Layers,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Send,
  Building2,
  Globe2,
  Database,
  type LucideIcon,
} from "lucide-react";
import { PageShell } from "./PageShell";
import { Section } from "./Section";
import { BreadcrumbBar } from "./BreadcrumbBar";
import { CtaBanner } from "./CtaBanner";
import { SocialShare } from "./SocialShare";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import { siteUrl } from "@/lib/seo";

/**
 * Renders a Sanity `landingPage` document. Powers /freight-leads,
 * /shipper-leads, /freight-broker-leads — anything the partnerships +
 * SEO team wants editable from the inbox without a code redeploy.
 */

export type SanityLandingPageDoc = {
  slug: { current: string };
  eyebrow?: string;
  h1: string;
  subhead?: string;
  tldr?: string;
  targetKeyword?: string;
  audience?: string;
  proofPoints?: Array<{
    _key: string;
    value: string;
    label: string;
    detail?: string;
  }>;
  painPoints?: Array<{
    _key: string;
    icon?: string;
    title: string;
    body?: string;
  }>;
  productProof?: Array<{
    _key: string;
    title: string;
    body?: string;
  }>;
  comparisonTable?: Array<{
    _key: string;
    feature: string;
    litValue: string;
    alternativeLabel: string;
    alternativeValue: string;
  }>;
  customerQuote?: {
    text: string;
    name: string;
    role?: string;
    company?: string;
  };
  cta?: {
    headline?: string;
    body?: string;
    primaryCtaLabel?: string;
    primaryCtaUrl?: string;
    secondaryCtaLabel?: string;
    secondaryCtaUrl?: string;
  };
  faq?: Array<{
    _key: string;
    question: string;
    answer: string;
  }>;
};

// Sanity stores icon names as strings — resolve them to actual lucide icons.
const ICON_MAP: Record<string, LucideIcon> = {
  Search,
  Users,
  Layers,
  Target,
  TrendingUp,
  Sparkles,
  Send,
  Building2,
  Globe2,
  Database,
  Filter,
};

function resolveIcon(name: string | undefined): LucideIcon {
  if (!name) return Sparkles;
  return ICON_MAP[name] || Sparkles;
}

export function LandingPageTemplate({ doc }: { doc: SanityLandingPageDoc }) {
  const ctaPrimaryUrl = doc.cta?.primaryCtaUrl || "/demo";
  const ctaPrimaryLabel = doc.cta?.primaryCtaLabel || "Book a demo";
  const ctaSecondaryUrl = doc.cta?.secondaryCtaUrl || APP_SIGNUP_URL;
  const ctaSecondaryLabel = doc.cta?.secondaryCtaLabel || "Start free trial";

  const shareUrl = siteUrl(`/${doc.slug.current}`);
  const shareTitle = doc.h1;

  return (
    <PageShell>
      {/* Sticky left-rail share — xl+ only. Mirrors the blog article
          rail so the freight-leads / shipper-leads / freight-broker-leads
          pages can be shared one-click from any scroll position. Hidden
          on smaller viewports where the rail crowds the content column. */}
      <aside
        aria-label="Share this page"
        className="pointer-events-none fixed left-4 top-1/2 z-30 hidden -translate-y-1/2 xl:block 2xl:left-8"
      >
        <div className="pointer-events-auto rounded-2xl border border-ink-100 bg-white/90 p-2 shadow-[0_8px_24px_-6px_rgba(15,23,42,0.18)] backdrop-blur">
          <div className="font-display mb-1.5 px-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-200">
            Share
          </div>
          <SocialShare variant="rail" url={shareUrl} title={shareTitle} />
        </div>
      </aside>

      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: doc.eyebrow || doc.h1 },
        ]}
      />

      {/* HERO */}
      <section className="relative px-5 sm:px-8 pt-14 pb-12 sm:pt-24 sm:pb-16">
        <div className="mx-auto max-w-content">
          {doc.eyebrow && (
            <div className="lit-pill">
              <span className="dot" />
              {doc.eyebrow}
            </div>
          )}
          <h1 className="display-xl space-eyebrow-h1 max-w-[860px]">{doc.h1}</h1>
          {doc.subhead && <p className="lead space-h1-intro max-w-[680px]">{doc.subhead}</p>}
          <div className="space-intro-cta flex flex-wrap gap-3">
            <Link
              href={ctaPrimaryUrl}
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.45)]"
              style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
            >
              <Calendar className="h-4 w-4" />
              {ctaPrimaryLabel}
            </Link>
            <Link
              href={ctaSecondaryUrl}
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white/80 px-6 text-[15px] font-semibold text-ink-900 backdrop-blur transition hover:bg-white"
            >
              {ctaSecondaryLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Proof-point stat strip — 4 cards */}
          {doc.proofPoints && doc.proofPoints.length > 0 && (
            <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {doc.proofPoints.map((p) => (
                <div
                  key={p._key}
                  className="rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-sm"
                >
                  <div className="font-mono text-[22px] font-bold tracking-[-0.02em] text-brand-blue-700">
                    {p.value}
                  </div>
                  <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
                    {p.label}
                  </div>
                  {p.detail && (
                    <div className="font-body mt-1 text-[12px] leading-snug text-ink-500">
                      {p.detail}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* TL;DR — single bold paragraph */}
      {doc.tldr && (
        <Section top="md" bottom="md">
          <div className="rounded-3xl border border-ink-100 bg-gradient-to-br from-brand-blue/[0.05] via-white to-cyan-50 p-7 shadow-sm sm:p-9">
            <div className="font-display mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-blue-700">
              TL;DR
            </div>
            <p className="font-body text-[16px] leading-relaxed text-ink-900">{doc.tldr}</p>
          </div>
        </Section>
      )}

      {/* PAIN POINTS */}
      {doc.painPoints && doc.painPoints.length > 0 && (
        <Section top="md" bottom="md" tone="soft-blue">
          <div className="mb-10 max-w-[680px]">
            <div className="eyebrow">The pain</div>
            <h2 className="display-md space-eyebrow-h1">
              Why freight teams stop using generic lead tools.
            </h2>
          </div>
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {doc.painPoints.map((p) => {
              const Icon = resolveIcon(p.icon);
              return (
                <li
                  key={p._key}
                  className="flex gap-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-sm"
                >
                  <div
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background: "rgba(244,63,94,0.08)",
                      boxShadow: "inset 0 0 0 1px rgba(244,63,94,0.18)",
                    }}
                  >
                    <Icon className="h-5 w-5 text-rose-600" />
                  </div>
                  <div>
                    <div className="font-display text-[14.5px] font-semibold text-ink-900">
                      {p.title}
                    </div>
                    {p.body && (
                      <p className="font-body mt-2 text-[13.5px] leading-relaxed text-ink-500">
                        {p.body}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* PRODUCT PROOF — what makes LIT different */}
      {doc.productProof && doc.productProof.length > 0 && (
        <Section top="md" bottom="md">
          <div className="mb-10 max-w-[680px]">
            <div className="eyebrow">What makes LIT different</div>
            <h2 className="display-md space-eyebrow-h1">
              The data, the contacts, and the workflow — in one place.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {doc.productProof.map((p) => (
              <div
                key={p._key}
                className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm"
              >
                <div
                  className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{
                    background: "rgba(37,99,235,0.08)",
                    boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.18)",
                  }}
                >
                  <CheckCircle2 className="h-5 w-5 text-brand-blue-700" />
                </div>
                <div className="font-display text-[15.5px] font-semibold text-ink-900">
                  {p.title}
                </div>
                {p.body && (
                  <p className="font-body mt-2 text-[13.5px] leading-relaxed text-ink-500">
                    {p.body}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* COMPARISON TABLE */}
      {doc.comparisonTable && doc.comparisonTable.length > 0 && (
        <Section top="md" bottom="md" tone="soft-blue">
          <div className="mb-10 max-w-[680px]">
            <div className="eyebrow">Side by side</div>
            <h2 className="display-md space-eyebrow-h1">LIT vs the alternatives.</h2>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-25 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
                  <th className="px-5 py-4">Feature</th>
                  <th className="px-5 py-4 bg-brand-blue/[0.06] text-brand-blue-700">LIT</th>
                  <th className="px-5 py-4">Alternative</th>
                </tr>
              </thead>
              <tbody className="font-body divide-y divide-ink-100 text-[13.5px] text-ink-900">
                {doc.comparisonTable.map((row) => (
                  <tr key={row._key}>
                    <td className="font-display px-5 py-4 font-semibold">{row.feature}</td>
                    <td className="px-5 py-4 bg-brand-blue/[0.03]">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <span className="text-ink-900">{row.litValue}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-ink-500">
                      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-200">
                        {row.alternativeLabel}
                      </div>
                      <div className="mt-1 flex items-start gap-2">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                        <span>{row.alternativeValue}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* CUSTOMER QUOTE */}
      {doc.customerQuote?.text && (
        <Section top="md" bottom="md">
          <div className="mx-auto max-w-[840px]">
            <figure className="rounded-3xl border border-ink-100 bg-white p-7 shadow-sm sm:p-9">
              <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.14em] text-brand-blue-700">
                What customers say
              </div>
              <blockquote className="font-display mt-3 text-[22px] font-medium leading-snug tracking-[-0.012em] text-ink-900 sm:text-[26px]">
                &ldquo;{doc.customerQuote.text}&rdquo;
              </blockquote>
              <figcaption className="font-body mt-5 flex items-center gap-3 text-[13.5px] text-ink-500">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-brand-blue-700"
                  style={{
                    background: "rgba(37,99,235,0.10)",
                    boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.22)",
                  }}
                >
                  {doc.customerQuote.name?.[0] || "?"}
                </div>
                <div>
                  <div className="font-display text-[14px] font-semibold text-ink-900">
                    {doc.customerQuote.name}
                  </div>
                  <div className="font-body text-[12.5px] text-ink-500">
                    {[doc.customerQuote.role, doc.customerQuote.company].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </figcaption>
            </figure>
          </div>
        </Section>
      )}

      {/* FAQ */}
      {doc.faq && doc.faq.length > 0 && (
        <Section top="md" bottom="md" tone="soft-blue">
          <div className="mx-auto max-w-[760px]">
            <div className="text-center">
              <div className="eyebrow">Frequently asked</div>
              <h2 className="display-md space-eyebrow-h1">Common questions.</h2>
            </div>
            <dl className="mt-10 space-y-3">
              {doc.faq.map((q) => (
                <details
                  key={q._key}
                  className="group rounded-2xl border border-ink-100 bg-white p-5 shadow-sm"
                >
                  <summary className="font-display flex cursor-pointer list-none items-start justify-between gap-4 text-[15.5px] font-semibold text-ink-900">
                    {q.question}
                    <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90 text-ink-500" />
                  </summary>
                  <p className="font-body mt-3 text-[14px] leading-relaxed text-ink-700">
                    {q.answer}
                  </p>
                </details>
              ))}
            </dl>
          </div>
        </Section>
      )}

      {/* CLOSING CTA */}
      <CtaBanner
        eyebrow={doc.cta?.headline ? "Ready when you are" : "Get started"}
        title={doc.cta?.headline || "See LIT on your real lanes."}
        subtitle={
          doc.cta?.body ||
          "A 30-minute live demo on your top five target accounts. We pull the BOL data, the carrier mix, and the verified contacts before the call."
        }
        primaryCta={{ label: ctaPrimaryLabel, href: ctaPrimaryUrl, icon: "calendar" }}
        secondaryCta={{ label: ctaSecondaryLabel, href: ctaSecondaryUrl }}
      />
    </PageShell>
  );
}
