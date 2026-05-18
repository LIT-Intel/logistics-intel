import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { groq } from "next-sanity";
import { sanityClient } from "@/sanity/lib/client";
import {
  CASE_STUDY_QUERY,
  CUSTOMER_STORY_QUERY,
  CUSTOMER_STORIES_INDEX_QUERY,
} from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { StickyCTABar } from "@/components/lead-magnet/StickyCTABar";
import { ExitIntentModal } from "@/components/lead-magnet/ExitIntentModal";
import { OutcomesBand } from "@/components/lead-magnet/OutcomesBand";
import { MoneyPageFAQ } from "@/components/lead-magnet/MoneyPageFAQ";
import { ProseRenderer } from "@/lib/portableText";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { buildBreadcrumbList } from "@/lib/jsonLd";
import { resolveLogoUrl } from "@/lib/sanityImage";

export const revalidate = 86400;
export const dynamicParams = true;

const ALL_CASE_STUDY_SLUGS = groq`*[_type == "caseStudy" && defined(slug.current)]{ "slug": slug.current }`;

export async function generateStaticParams() {
  const [csSlugs, storySlugs] = await Promise.all([
    sanityClient
      .fetch<{ slug: string }[]>(ALL_CASE_STUDY_SLUGS)
      .catch(() => []),
    sanityClient
      .fetch<{ slug: string }[]>(
        groq`*[_type == "customerStory" && defined(slug.current)]{ "slug": slug.current }`,
      )
      .catch(() => []),
  ]);
  const seen = new Set<string>();
  const out: { slug: string }[] = [];
  for (const list of [csSlugs || [], storySlugs || []]) {
    for (const item of list) {
      if (item?.slug && !seen.has(item.slug)) {
        seen.add(item.slug);
        out.push({ slug: item.slug });
      }
    }
  }
  return out;
}

/**
 * Schema picker — prefer the new `customerStory` mirror, fall back to the
 * legacy `caseStudy` doc so existing slugs keep resolving while content
 * is migrated. Returns `{ kind, doc }` so the renderer can branch on the
 * schema fields available.
 */
async function loadStory(slug: string): Promise<
  | { kind: "customerStory"; doc: any }
  | { kind: "caseStudy"; doc: any }
  | null
> {
  const story = await sanityClient
    .fetch<any>(CUSTOMER_STORY_QUERY, { slug })
    .catch(() => null);
  if (story) return { kind: "customerStory", doc: story };

  const cs = await sanityClient
    .fetch<any>(CASE_STUDY_QUERY, { slug })
    .catch(() => null);
  if (cs) return { kind: "caseStudy", doc: cs };

  return null;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const found = await loadStory(params.slug);
  if (!found) {
    return buildMetadata({
      title: "Customer story not found",
      path: `/customers/${params.slug}`,
    });
  }
  const { kind, doc } = found;
  const title =
    kind === "customerStory"
      ? `${doc.customerName} — ${doc.headline}`
      : `${doc.customer} — ${doc.headline}`;
  const description =
    kind === "customerStory"
      ? doc.subhead || doc.tldr || doc.headline
      : doc.subhead || doc.headline;
  const eyebrow =
    kind === "customerStory"
      ? doc.industry || doc.eyebrow || "Customer story"
      : doc.industry?.name || "Customer story";

  return buildMetadata({
    title,
    description,
    path: `/customers/${params.slug}`,
    eyebrow,
    seo: doc.seo,
    type: "article",
    publishedAt: doc.publishedAt,
  });
}

export default async function CustomerStoryPage({
  params,
}: {
  params: { slug: string };
}) {
  const found = await loadStory(params.slug);
  if (!found) notFound();

  // Related stories — pull the newest 3 customerStory docs (excluding self),
  // backfilled with caseStudy docs if fewer than 3 stories exist. Used by
  // the bottom "more stories" rail.
  const [storyList, csList] = await Promise.all([
    sanityClient
      .fetch<any[]>(CUSTOMER_STORIES_INDEX_QUERY)
      .catch(() => []),
    sanityClient
      .fetch<any[]>(
        groq`*[_type == "caseStudy" && defined(slug.current) && defined(publishedAt)] | order(publishedAt desc)[0...6]{
          _id, customer, "slug": slug.current, headline, kpis
        }`,
      )
      .catch(() => []),
  ]);

  const related = buildRelated({
    slug: params.slug,
    storyList: storyList || [],
    csList: csList || [],
  });

  if (found.kind === "customerStory") {
    return (
      <CustomerStoryView
        slug={params.slug}
        doc={found.doc}
        related={related}
      />
    );
  }
  return (
    <CaseStudyView slug={params.slug} doc={found.doc} related={related} />
  );
}

/* ------------------------------------------------------------------ */
/* customerStory renderer (rich path — heroOutcome, outcomes,        */
/* beforeAfter, faq, structured quote)                                */
/* ------------------------------------------------------------------ */

function CustomerStoryView({
  slug,
  doc,
  related,
}: {
  slug: string;
  doc: any;
  related: RelatedItem[];
}) {
  const breadcrumbCrumbs = [
    { label: "Home", href: "/" },
    { label: "Customers", href: "/customers" },
    { label: doc.customerName as string },
  ];

  const faqItems: { question: string; answer: string }[] = Array.isArray(
    doc.faq,
  )
    ? doc.faq
        .filter((f: any) => f?.question && f?.answer)
        .map((f: any) => ({ question: f.question, answer: f.answer }))
    : [];

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: doc.headline,
    description: doc.subhead || doc.tldr,
    mainEntityOfPage: siteUrl(`/customers/${slug}`),
    datePublished: doc.publishedAt,
    dateModified: doc.lastReviewedAt || doc._updatedAt,
    publisher: {
      "@type": "Organization",
      name: "Logistic Intel",
      logo: {
        "@type": "ImageObject",
        url: siteUrl("/lit-icon-master.svg"),
      },
    },
    about: doc.customerName,
  };

  return (
    <PageShell>
      <StickyCTABar />

      <BreadcrumbBar crumbs={breadcrumbCrumbs} />

      <article>
        <header className="px-5 sm:px-8 pt-6 pb-10">
          <div className="mx-auto max-w-[820px]">
            {(doc.eyebrow || doc.industry) && (
              <div className="font-display text-[11.5px] font-bold uppercase tracking-[0.16em] text-brand-blue-700">
                {doc.eyebrow || doc.industry}
              </div>
            )}
            <h1 className="display-xl mt-3">{doc.headline}</h1>
            {(doc.subhead || doc.tldr) && (
              <p className="lead mt-5">{doc.subhead || doc.tldr}</p>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-500">
              <span className="font-display font-semibold text-ink-900">
                {doc.customerName}
              </span>
              {doc.roleAtCustomer && <span>· {doc.roleAtCustomer}</span>}
              {doc.industry && <span>· {doc.industry}</span>}
            </div>
          </div>
        </header>

        {doc.heroOutcome?.metric && (
          <section className="px-5 sm:px-8 pb-10">
            <div className="mx-auto max-w-[820px]">
              <div
                className="relative overflow-hidden rounded-3xl px-8 py-7 text-white"
                style={{
                  background:
                    "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
                  boxShadow: "inset 0 -1px 0 rgba(0,240,255,0.18)",
                }}
              >
                <div
                  className="font-display text-[56px] font-bold leading-none tracking-tight"
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg,#00F0FF 0%,#3b82f6 60%,#2563eb 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  {doc.heroOutcome.metric}
                </div>
                {doc.heroOutcome.label && (
                  <div className="mt-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/85">
                    {doc.heroOutcome.label}
                  </div>
                )}
                {doc.heroOutcome.detail && (
                  <p className="mt-2 max-w-prose text-sm leading-relaxed text-white/65">
                    {doc.heroOutcome.detail}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {Array.isArray(doc.outcomes) && doc.outcomes.length > 0 && (
          <OutcomesBand
            items={doc.outcomes
              .filter((o: any) => o?.num)
              .map((o: any) => ({
                num: o.num,
                label: o.label || "",
                body: o.body || "",
                cite: o.cite,
              }))}
          />
        )}

        {doc.body && (
          <section className="px-5 sm:px-8 py-12">
            <div className="prose-shell mx-auto max-w-[720px]">
              <ProseRenderer value={doc.body} />
            </div>
          </section>
        )}

        {doc.quote?.text && (
          <section className="px-5 sm:px-8 pb-12">
            <div className="mx-auto max-w-[820px]">
              <blockquote
                className="relative rounded-3xl px-8 py-7 text-white"
                style={{
                  background:
                    "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
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
                <p className="font-display text-[22px] font-medium leading-[1.35] tracking-[-0.01em]">
                  {doc.quote.text}
                </p>
                {(doc.quote.name ||
                  doc.quote.roleTitle ||
                  doc.quote.company) && (
                  <div className="font-body mt-5 text-[13.5px] text-ink-150">
                    {[doc.quote.name, doc.quote.roleTitle, doc.quote.company]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </blockquote>
            </div>
          </section>
        )}

        {doc.beforeAfter &&
          (Array.isArray(doc.beforeAfter.challengeBullets) ||
            Array.isArray(doc.beforeAfter.solutionBullets)) && (
            <BeforeAfterGrid
              challenge={doc.beforeAfter.challengeBullets || []}
              solution={doc.beforeAfter.solutionBullets || []}
            />
          )}

        {faqItems.length > 0 && <MoneyPageFAQ items={faqItems} />}

        {related.length > 0 && <RelatedStoriesRail items={related} />}

        <CtaBanner
          eyebrow="Want results like this?"
          title={`Build your version of ${doc.customerName}'s playbook.`}
          subtitle="Every customer story starts with a 30-min demo. Bring your accounts and we'll show what's possible."
          primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
          secondaryCta={{ label: "More stories", href: "/customers" }}
        />
      </article>

      <ExitIntentModal />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildBreadcrumbList(breadcrumbCrumbs)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* caseStudy renderer (legacy fallback — keeps existing routes alive). */
/* No heroOutcome/outcomes/beforeAfter fields exist on this schema, so */
/* we substitute the kpis array (visualized as a strip) and skip the   */
/* OutcomesBand + before/after blocks gracefully.                      */
/* ------------------------------------------------------------------ */

function CaseStudyView({
  slug,
  doc,
  related,
}: {
  slug: string;
  doc: any;
  related: RelatedItem[];
}) {
  const breadcrumbCrumbs = [
    { label: "Home", href: "/" },
    { label: "Customers", href: "/customers" },
    { label: doc.customer as string },
  ];
  const logoSrc = resolveLogoUrl({ logo: doc.logo, domain: doc.domain }, 144);

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: doc.headline,
    description: doc.subhead,
    mainEntityOfPage: siteUrl(`/customers/${slug}`),
    datePublished: doc.publishedAt,
    publisher: {
      "@type": "Organization",
      name: "Logistic Intel",
      logo: {
        "@type": "ImageObject",
        url: siteUrl("/lit-icon-master.svg"),
      },
    },
    about: doc.customer,
  };

  return (
    <PageShell>
      <StickyCTABar />

      <BreadcrumbBar crumbs={breadcrumbCrumbs} />

      <article>
        <header className="px-5 sm:px-8 pt-6 pb-10">
          <div className="mx-auto max-w-[820px]">
            <div className="flex items-center gap-4">
              {logoSrc && (
                <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-ink-100 bg-white">
                  <Image
                    src={logoSrc}
                    alt={doc.customer}
                    fill
                    sizes="48px"
                    className="object-contain p-1.5"
                    unoptimized={logoSrc.includes("img.logo.dev")}
                  />
                </div>
              )}
              <div>
                <div className="font-display text-[18px] font-semibold text-ink-900">
                  {doc.customer}
                </div>
                {doc.industry?.name && (
                  <div className="font-body text-[13px] text-ink-500">
                    {doc.industry.name}
                  </div>
                )}
              </div>
            </div>
            <h1 className="display-xl mt-6">{doc.headline}</h1>
            {doc.subhead && <p className="lead mt-5">{doc.subhead}</p>}
          </div>
        </header>

        {doc.kpis?.length > 0 && (
          <section className="px-5 sm:px-8 pb-12">
            <div className="mx-auto max-w-[820px]">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-3xl border border-ink-100 bg-white px-7 py-6 shadow-sm md:grid-cols-4">
                {doc.kpis.map((k: any, i: number) => (
                  <div key={i}>
                    <div className="font-mono text-[28px] font-semibold tracking-[-0.01em] text-brand-blue-700">
                      {k.value}
                    </div>
                    <div className="font-display mt-1 text-[11.5px] font-bold uppercase tracking-[0.08em] text-ink-500">
                      {k.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {doc.quote?.text && (
          <section className="px-5 sm:px-8 pb-12">
            <div className="mx-auto max-w-[820px]">
              <blockquote
                className="relative rounded-3xl px-8 py-7 text-white"
                style={{
                  background:
                    "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
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
                <p className="font-display text-[22px] font-medium leading-[1.35] tracking-[-0.01em]">
                  {doc.quote.text}
                </p>
                {(doc.quote.name || doc.quote.role) && (
                  <div className="font-body mt-5 text-[13.5px] text-ink-150">
                    {[doc.quote.name, doc.quote.role]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </blockquote>
            </div>
          </section>
        )}

        {doc.body && (
          <section className="px-5 sm:px-8 py-8">
            <div className="prose-shell mx-auto max-w-[720px]">
              <ProseRenderer value={doc.body} />
            </div>
          </section>
        )}

        {related.length > 0 && <RelatedStoriesRail items={related} />}

        <CtaBanner
          eyebrow="Want results like this?"
          title={`Build your version of ${doc.customer}'s playbook.`}
          subtitle="Every customer story starts with a 30-min demo. Bring your accounts and we'll show what's possible."
          primaryCta={{ label: "Book a demo", href: "/demo", icon: "calendar" }}
          secondaryCta={{ label: "More stories", href: "/customers" }}
        />
      </article>

      <ExitIntentModal />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildBreadcrumbList(breadcrumbCrumbs)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Before / After grid (customerStory only)                           */
/* ------------------------------------------------------------------ */

function BeforeAfterGrid({
  challenge,
  solution,
}: {
  challenge: string[];
  solution: string[];
}) {
  return (
    <section className="px-5 sm:px-8 py-14">
      <div className="mx-auto grid max-w-[920px] gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-ink-100 bg-white p-7 shadow-sm">
          <div className="font-display text-[11.5px] font-bold uppercase tracking-[0.16em] text-rose-600">
            Before · the challenge
          </div>
          <ul className="mt-4 space-y-3">
            {challenge.map((b, i) => (
              <li
                key={i}
                className="font-body flex gap-3 text-[15px] leading-relaxed text-ink-700"
              >
                <span aria-hidden className="mt-2 inline-block h-1.5 w-1.5 flex-none rounded-full bg-rose-500" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl border border-brand-blue/20 bg-brand-blue/[0.04] p-7 shadow-sm">
          <div className="font-display text-[11.5px] font-bold uppercase tracking-[0.16em] text-brand-blue-700">
            After · the solution
          </div>
          <ul className="mt-4 space-y-3">
            {solution.map((b, i) => (
              <li
                key={i}
                className="font-body flex gap-3 text-[15px] leading-relaxed text-ink-700"
              >
                <span aria-hidden className="mt-2 inline-block h-1.5 w-1.5 flex-none rounded-full bg-brand-cyan" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Related stories rail                                                */
/* ------------------------------------------------------------------ */

type RelatedItem = {
  slug: string;
  title: string;
  industry?: string;
  metric?: string;
  metricLabel?: string;
};

function buildRelated({
  slug,
  storyList,
  csList,
}: {
  slug: string;
  storyList: any[];
  csList: any[];
}): RelatedItem[] {
  const out: RelatedItem[] = [];
  const seen = new Set<string>([slug]);

  for (const s of storyList) {
    const itemSlug = typeof s.slug === "string" ? s.slug : s.slug?.current;
    if (!itemSlug || seen.has(itemSlug)) continue;
    seen.add(itemSlug);
    out.push({
      slug: itemSlug,
      title: s.headline || s.customerName,
      industry: s.industry,
      metric: s.heroOutcome?.metric,
      metricLabel: s.heroOutcome?.label,
    });
    if (out.length >= 3) return out;
  }
  for (const c of csList) {
    const itemSlug = typeof c.slug === "string" ? c.slug : c.slug?.current;
    if (!itemSlug || seen.has(itemSlug)) continue;
    seen.add(itemSlug);
    out.push({
      slug: itemSlug,
      title: c.headline || c.customer,
      metric: c.kpis?.[0]?.value,
      metricLabel: c.kpis?.[0]?.label,
    });
    if (out.length >= 3) return out;
  }
  return out;
}

function RelatedStoriesRail({ items }: { items: RelatedItem[] }) {
  return (
    <section className="px-5 sm:px-8 py-14">
      <div className="mx-auto max-w-container">
        <header className="mb-8">
          <div className="font-display text-[11.5px] font-bold uppercase tracking-[0.16em] text-brand-blue-700">
            More customer stories
          </div>
          <h2 className="font-display mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink-900">
            See how other teams built their playbook.
          </h2>
        </header>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {items.map((r) => (
            <Link
              key={r.slug}
              href={`/customers/${r.slug}`}
              className="group flex flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
            >
              <div className="px-6 pt-6 pb-5">
                {r.industry && (
                  <span className="inline-flex items-center rounded-full border border-ink-100 bg-ink-25 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-700">
                    {r.industry}
                  </span>
                )}
                <h3 className="font-display mt-3 text-[18px] font-semibold leading-tight tracking-[-0.015em] text-ink-900 group-hover:text-brand-blue-700">
                  {r.title}
                </h3>
              </div>
              {r.metric && (
                <div className="border-t border-ink-100 bg-ink-25 px-6 py-3">
                  <div className="font-mono text-[20px] font-semibold tracking-[-0.01em] text-brand-blue-700">
                    {r.metric}
                  </div>
                  {r.metricLabel && (
                    <div className="font-display mt-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-500">
                      {r.metricLabel}
                    </div>
                  )}
                </div>
              )}
              <div className="border-t border-ink-100 px-6 py-3 text-[12.5px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                Read story →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
