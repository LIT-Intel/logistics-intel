import Link from "next/link";
import { ArrowRight, Award, CheckCircle2, ExternalLink, Filter, X } from "lucide-react";
import { PageShell } from "./PageShell";
import { Section } from "./Section";
import { BreadcrumbBar } from "./BreadcrumbBar";
import { CtaBanner } from "./CtaBanner";
import { ProseRenderer } from "@/lib/portableText";

/**
 * Renders a `bestList` Sanity document at /best/[slug]. Mirrors the
 * shape of the hand-coded BEST_LIST_PAGES template but reads from
 * Sanity so the partnerships / SEO team can edit live.
 */

export type SanityBestListDoc = {
  slug: { current: string };
  topic: string;
  headline: string;
  subhead?: string;
  tldr?: string;
  criteria?: string[];
  items: Array<{
    _key: string;
    rank: number;
    name: string;
    url?: string;
    category?: string;
    oneLineSummary?: string;
    idealFor?: string;
    priceBand?: string;
    strengths?: string[];
    weaknesses?: string[];
  }>;
  cta?: {
    headline?: string;
    primaryCtaLabel?: string;
    primaryCtaUrl?: string;
  };
  faq?: Array<{ _key: string; question: string; answer: any }>;
  lastReviewedAt?: string;
  publishedAt?: string;
};

export function SanityBestListTemplate({ doc }: { doc: SanityBestListDoc }) {
  const sorted = [...(doc.items || [])].sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const ctaUrl = doc.cta?.primaryCtaUrl || "/demo";
  const ctaLabel = doc.cta?.primaryCtaLabel || "Book a demo";

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Best of", href: "/best" },
          { label: doc.topic || doc.headline },
        ]}
      />

      <section className="relative px-5 sm:px-8 pt-14 pb-12 sm:pt-24 sm:pb-16">
        <div className="mx-auto max-w-content">
          <div className="lit-pill">
            <span className="dot" />
            Best {doc.topic} · 2026
          </div>
          <h1 className="display-xl space-eyebrow-h1 max-w-[820px]">{doc.headline}</h1>
          {doc.subhead && <p className="lead space-h1-intro max-w-[680px]">{doc.subhead}</p>}
          <div className="space-intro-cta flex flex-wrap gap-3">
            <Link
              href={ctaUrl}
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.45)]"
              style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
            >
              <ArrowRight className="h-4 w-4" />
              {ctaLabel}
            </Link>
            <Link
              href="/best"
              className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white/80 px-6 text-[15px] font-semibold text-ink-900 backdrop-blur transition hover:bg-white"
            >
              Browse all rankings
            </Link>
          </div>
        </div>
      </section>

      {doc.tldr && (
        <Section top="md" bottom="md">
          <div className="rounded-3xl border border-ink-100 bg-gradient-to-br from-brand-blue/[0.06] via-white to-cyan-50 p-6 shadow-sm sm:p-8">
            <div className="font-display mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-blue-700">
              TL;DR
            </div>
            <p className="font-body text-[16px] leading-relaxed text-ink-900">{doc.tldr}</p>
          </div>
        </Section>
      )}

      {doc.criteria && doc.criteria.length > 0 && (
        <Section top="md" bottom="md">
          <div className="mb-6 max-w-[680px]">
            <div className="eyebrow">How we ranked them</div>
            <h2 className="display-md space-eyebrow-h1">
              {doc.criteria.length} criteria, applied evenly across every entry.
            </h2>
          </div>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {doc.criteria.map((c) => (
              <li
                key={c}
                className="flex items-start gap-3 rounded-2xl border border-ink-100 bg-white px-5 py-4 shadow-sm"
              >
                <Filter className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue-700" />
                <span className="font-body text-[14px] leading-snug text-ink-900">{c}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section top="md" bottom="md">
        <div className="mb-10 max-w-[680px]">
          <div className="eyebrow">Ranked list</div>
          <h2 className="display-md space-eyebrow-h1">
            {sorted.length} {doc.topic} ranked.
          </h2>
        </div>
        <ol className="space-y-5">
          {sorted.map((item) => (
            <li
              key={item._key}
              className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm sm:p-7"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div
                    className="font-mono flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[18px] font-bold text-brand-blue-700"
                    style={{
                      background: "rgba(37,99,235,0.08)",
                      boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.18)",
                    }}
                  >
                    {String(item.rank).padStart(2, "0")}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-[20px] font-semibold leading-tight tracking-[-0.015em] text-ink-900">
                      {item.name}
                      {item.rank === 1 && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 align-middle text-[10.5px] font-bold uppercase tracking-wider text-emerald-700">
                          <Award className="h-3 w-3" /> Top pick
                        </span>
                      )}
                    </h3>
                    {item.category && (
                      <div className="font-display mt-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
                        {item.category}
                      </div>
                    )}
                    {item.oneLineSummary && (
                      <p className="font-body mt-2 text-[14px] leading-relaxed text-ink-700">
                        {item.oneLineSummary}
                      </p>
                    )}
                  </div>
                </div>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-display inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-ink-100 px-3 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-25"
                  >
                    Visit <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>

              {(item.strengths?.length || item.weaknesses?.length) && (
                <div className="mt-4 grid grid-cols-1 gap-4 border-t border-ink-100 pt-4 md:grid-cols-2">
                  {item.strengths && item.strengths.length > 0 && (
                    <div>
                      <div className="font-display mb-2 inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Strengths
                      </div>
                      <ul className="space-y-1.5">
                        {item.strengths.map((s) => (
                          <li
                            key={s}
                            className="flex items-start gap-2 font-body text-[13px] leading-snug text-ink-900"
                          >
                            <span className="mt-1.5 inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {item.weaknesses && item.weaknesses.length > 0 && (
                    <div>
                      <div className="font-display mb-2 inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-rose-700">
                        <X className="h-3.5 w-3.5" /> Limitations
                      </div>
                      <ul className="space-y-1.5">
                        {item.weaknesses.map((w) => (
                          <li
                            key={w}
                            className="flex items-start gap-2 font-body text-[13px] leading-snug text-ink-900"
                          >
                            <span className="mt-1.5 inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {(item.idealFor || item.priceBand) && (
                <dl className="mt-4 grid grid-cols-1 gap-4 border-t border-ink-100 pt-4 sm:grid-cols-2">
                  {item.idealFor && (
                    <div>
                      <dt className="font-display text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
                        Ideal for
                      </dt>
                      <dd className="font-body mt-1 text-[13px] leading-snug text-ink-900">
                        {item.idealFor}
                      </dd>
                    </div>
                  )}
                  {item.priceBand && (
                    <div>
                      <dt className="font-display text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-500">
                        Price band
                      </dt>
                      <dd className="font-body mt-1 text-[13px] leading-snug text-ink-900">
                        {item.priceBand}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </li>
          ))}
        </ol>
      </Section>

      {doc.faq && doc.faq.length > 0 && (
        <Section top="md" bottom="md" tone="soft-blue">
          <div className="mx-auto max-w-[760px]">
            <div className="text-center">
              <div className="eyebrow">{doc.topic} — FAQ</div>
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
                  <div className="prose prose-sm mt-3 max-w-none text-[14px] leading-relaxed text-ink-700">
                    <ProseRenderer value={q.answer} />
                  </div>
                </details>
              ))}
            </dl>
          </div>
        </Section>
      )}

      <CtaBanner
        eyebrow={doc.cta?.headline ? "Ready to compare?" : "Considering LIT?"}
        title={doc.cta?.headline || "See LIT on your real lanes."}
        subtitle="A 30-minute live demo on your top five target accounts. We pull the BOL data, the carrier mix, and the verified contacts before the call."
        primaryCta={{ label: ctaLabel, href: ctaUrl, icon: "calendar" }}
        secondaryCta={{ label: "Browse freight leads", href: "/freight-leads" }}
      />
    </PageShell>
  );
}
