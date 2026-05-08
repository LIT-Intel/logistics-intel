import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, X, Minus, ArrowRight, Calendar } from "lucide-react";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { COMPARISON_QUERY, ALL_COMPARISON_SLUGS } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { Section } from "@/components/sections/Section";
import { FaqSection } from "@/components/sections/FaqSection";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { BrandTile } from "@/components/sections/BrandTile";
import { APP_SIGNUP_URL } from "@/lib/app-urls";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { resolveLogoUrl } from "@/lib/sanityImage";

export const revalidate = 3600;

export async function generateStaticParams() {
  const items = (await sanityClient.fetch<{ slug: string }[]>(ALL_COMPARISON_SLUGS).catch(() => [])) || [];
  return items.filter((i) => i.slug).map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await sanityClient.fetch<any>(COMPARISON_QUERY, { slug: params.slug }).catch(() => null);
  if (!c) return buildMetadata({ title: "Comparison not found", path: `/vs/${params.slug}` });
  return buildMetadata({
    title: `LIT vs ${c.competitorName} — honest comparison`,
    description: c.subhead || c.tldr?.slice(0, 200),
    path: `/vs/${params.slug}`,
    eyebrow: "Comparison",
    seo: c.seo,
  });
}

export default async function ComparisonPage({ params }: { params: { slug: string } }) {
  const c = await sanityClient.fetch<any>(COMPARISON_QUERY, { slug: params.slug }).catch(() => null);
  if (!c) notFound();

  const competitorDomain = c.competitorUrl?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const competitorLogo = resolveLogoUrl(
    { logo: c.competitorLogo, domain: competitorDomain },
    96,
  );

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Comparisons", href: "/vs" },
          { label: `LIT vs ${c.competitorName}` },
        ]}
      />

      {/* Hero — branded "LIT vs Competitor" duel. LIT brand mark renders
          via LitLogoMark; the competitor logo renders via LogoImage which
          guarantees a visible monogram fallback when logo.dev is null,
          fails to authenticate, or 404s. Both tiles are the same size so
          neither side dominates visually. */}
      <Section top="md" bottom="md">
        <div className="lit-pill">
          <span className="dot" />
          Honest comparison · {c.lastReviewedAt ? "kept current" : "Updated regularly"}
        </div>

        <div className="space-eyebrow-h1 flex flex-wrap items-center gap-4 sm:gap-6">
          <BrandTile name="LIT" tone="brand" />
          <span className="font-display text-[28px] sm:text-[36px] font-light text-ink-200" aria-hidden>
            vs
          </span>
          <BrandTile
            name={c.competitorName}
            domain={competitorDomain}
            logoSrc={competitorLogo}
            tone="neutral"
          />
        </div>

        <h1 className="display-xl space-h1-intro max-w-[760px]">
          LIT <span className="text-ink-200">vs</span>{" "}
          <span className="grad-text">{c.competitorName}</span>
        </h1>
        {c.subhead && <p className="lead space-h1-intro max-w-[680px]">{c.subhead}</p>}

        <div className="space-intro-cta flex flex-wrap gap-3">
          <Link
            href={APP_SIGNUP_URL}
            className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.45)]"
            style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
          >
            Start Prospecting <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/demo"
            className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white/80 px-6 text-[15px] font-semibold text-ink-900 backdrop-blur transition hover:bg-white"
          >
            <Calendar className="h-4 w-4" /> Book a demo
          </Link>
        </div>
      </Section>

      {c.tldr && (
        <Section top="none" bottom="md">
          <div className="rounded-3xl border border-ink-100 bg-white p-7 sm:p-8 shadow-sm">
            <div className="font-display text-[11px] font-bold uppercase tracking-[0.12em] text-brand-blue">
              TL;DR
            </div>
            <p className="font-body mt-3 max-w-[760px] text-[16.5px] leading-relaxed text-ink-900">
              {c.tldr}
            </p>
          </div>
        </Section>
      )}

      {c.comparisonTable?.length > 0 && (
        <Section top="md" bottom="md" width="container">
          <div className="mb-6 max-w-[640px]">
            <div className="eyebrow">Side-by-side</div>
            <h2 className="display-md space-eyebrow-h1">
              Where LIT and {c.competitorName} differ.
            </h2>
          </div>
          <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              {c.comparisonTable.map((section: any, si: number) => (
                <div key={si} className="min-w-[640px]">
                  {section.section && (
                    <div className="font-display border-b border-ink-100 bg-ink-25 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
                      {section.section}
                    </div>
                  )}
                  <table className="w-full">
                    <thead className="hidden md:table-header-group">
                      <tr className="border-b border-ink-100 bg-white">
                        <th className="font-display px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-ink-200">
                          Feature
                        </th>
                        <th className="font-display px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-brand-blue">
                          LIT
                        </th>
                        <th className="font-display px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-ink-500">
                          {c.competitorName}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows?.map((r: any, ri: number) => (
                        <tr
                          key={`${si}-${ri}`}
                          className="border-b border-ink-100 last:border-0 align-top transition hover:bg-ink-25"
                        >
                          <td className="font-display px-5 py-4 text-[14px] font-semibold text-ink-900 md:w-[34%]">
                            {r.feature}
                          </td>
                          <td className="px-5 py-4 md:w-[33%]">
                            <div className="flex items-start gap-2">
                              {r.winner === "lit" ? (
                                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
                              ) : r.winner === "tie" ? (
                                <Minus className="mt-0.5 h-4 w-4 shrink-0 text-ink-200" />
                              ) : null}
                              <span className="font-body text-[13.5px] leading-snug text-ink-700">
                                {r.litValue}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 md:w-[33%]">
                            <div className="flex items-start gap-2">
                              {r.winner === "competitor" ? (
                                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                              ) : r.winner === "lit" ? (
                                <X className="mt-0.5 h-4 w-4 shrink-0 text-ink-200" />
                              ) : null}
                              <span className="font-body text-[13.5px] leading-snug text-ink-500">
                                {r.competitorValue}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {(c.whenToChooseLit?.length > 0 || c.whenToChooseCompetitor?.length > 0) && (
        <Section top="md" bottom="md">
          <div className="mb-6 max-w-[640px]">
            <div className="eyebrow">Decision guide</div>
            <h2 className="display-md space-eyebrow-h1">
              When each tool wins.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {c.whenToChooseLit?.length > 0 && (
              <div className="rounded-2xl border border-brand-blue/30 bg-white p-7 shadow-sm">
                <div className="font-display text-[11px] font-bold uppercase tracking-[0.12em] text-brand-blue">
                  When to choose LIT
                </div>
                <ul className="mt-4 space-y-3">
                  {c.whenToChooseLit.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
                      <span className="font-body text-[14px] leading-snug text-ink-700">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {c.whenToChooseCompetitor?.length > 0 && (
              <div className="rounded-2xl border border-ink-100 bg-white p-7 shadow-sm">
                <div className="font-display text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
                  When to choose {c.competitorName}
                </div>
                <ul className="mt-4 space-y-3">
                  {c.whenToChooseCompetitor.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="font-body text-[14px] leading-snug text-ink-700">{s}</span>
                    </li>
                  ))}
                </ul>
                <div className="font-body mt-5 rounded-lg bg-ink-25 px-3 py-2 text-[12.5px] text-ink-500">
                  We&apos;re honest because every team&apos;s stack is different. If{" "}
                  {c.competitorName} fits better, use it.
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {c.customerQuote?.text && (
        <Section top="md" bottom="md" width="narrow">
          <blockquote
            className="relative overflow-hidden rounded-3xl px-8 py-7 sm:px-10 sm:py-9 text-white"
            style={{
              background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
              boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
            }}
          >
            <span
              aria-hidden
              className="absolute -top-2 left-7 text-5xl leading-none"
              style={{ color: "#00F0FF" }}
            >
              &ldquo;
            </span>
            <p className="font-display text-[19px] sm:text-[22px] font-medium leading-[1.4] tracking-[-0.01em]">
              {c.customerQuote.text}
            </p>
            <div className="font-body mt-5 text-[13px] text-ink-150">
              {c.customerQuote.name}
              {c.customerQuote.role ? ` · ${c.customerQuote.role}` : ""}
            </div>
          </blockquote>
        </Section>
      )}

      {c.faq?.length > 0 && (
        <FaqSection
          eyebrow="FAQ"
          title={`Common questions about LIT vs ${c.competitorName}`}
          faqs={c.faq.map((f: any) => ({ question: f.question, answer: f.answer }))}
        />
      )}

      <Section top="md" bottom="lg" width="container">
        <div
          className="relative overflow-hidden rounded-3xl border border-white/10 px-8 py-12 sm:px-12 sm:py-14 text-white"
          style={{
            background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
            boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 rounded-full opacity-50"
            style={{ background: "radial-gradient(circle, rgba(0,240,255,0.28), transparent 70%)" }}
          />
          <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div className="max-w-[680px]">
              <div
                className="font-display text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "#00F0FF" }}
              >
                Switching from {c.competitorName}?
              </div>
              <div className="font-display mt-2 text-[26px] sm:text-[32px] font-semibold tracking-[-0.015em] text-white">
                Free migration. Full data import.
              </div>
              <p className="font-body mt-3 text-[15.5px] leading-relaxed text-ink-150">
                Our team handles the import — accounts, contacts, lists, sequences. You keep your
                existing contract until renewal.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/demo"
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.45)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.55)]"
                style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
              >
                <Calendar className="h-4 w-4" /> Book switch call
              </Link>
              <Link
                href="/features"
                className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 text-[15px] font-semibold text-white hover:bg-white/10"
              >
                See features <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </Section>

      <CtaBanner />

      {c.faq?.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: c.faq.map((f: any) => ({
                "@type": "Question",
                name: f.question,
                acceptedAnswer: { "@type": "Answer", text: f.answer },
              })),
            }),
          }}
        />
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: `LIT vs ${c.competitorName}`,
            url: siteUrl(`/vs/${params.slug}`),
            about: c.competitorName,
            dateModified: c.lastReviewedAt,
          }),
        }}
      />
    </PageShell>
  );
}

