import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { sanityClient } from "@/sanity/lib/client";
import { BLOG_POST_QUERY, BLOG_INDEX_QUERY } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { ProseShell } from "@/components/sections/ProseShell";
import { BlogCard } from "@/components/sections/BlogCard";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { SocialShare } from "@/components/sections/SocialShare";
import { howToFor } from "@/lib/blog/howToConfig";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { imgUrl } from "@/lib/sanityImage";
import { formatDate } from "@/lib/format";

export const revalidate = 600;

export async function generateStaticParams() {
  const posts = (await sanityClient.fetch<{ slug: { current: string } }[]>(
    BLOG_INDEX_QUERY,
  ).catch(() => [])) || [];
  return posts.filter((p) => p.slug?.current).map((p) => ({ slug: p.slug.current }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const post = await sanityClient.fetch<any>(BLOG_POST_QUERY, { slug: params.slug }).catch(() => null);
  if (!post) {
    return buildMetadata({ title: "Post not found", path: `/blog/${params.slug}` });
  }
  return buildMetadata({
    title: post.title,
    description: post.excerpt,
    path: `/blog/${params.slug}`,
    eyebrow: post.categories?.[0]?.title || "Blog",
    seo: post.seo,
    type: "article",
    publishedAt: post.publishedAt,
    modifiedAt: post._updatedAt,
    authors: post.author?.name ? [post.author.name] : undefined,
  });
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await sanityClient.fetch<any>(BLOG_POST_QUERY, { slug: params.slug }).catch(() => null);
  if (!post) notFound();

  // Hero image resolution: prefer Sanity-uploaded asset, then any
  // explicit heroImageUrl from the doc, then the dynamic OG image
  // generator as a guaranteed-render fallback. Posts without a Sanity
  // image now get a branded slate+cyan card with the title rendered —
  // never the broken-image gap users were seeing on some posts.
  const heroSrc =
    imgUrl(post.heroImage, { width: 1600 }) ||
    post.heroImageUrl ||
    `/api/og?title=${encodeURIComponent(post.title)}&eyebrow=${encodeURIComponent(post.categories?.[0]?.title || "Blog")}`;
  const heroAlt = post.heroImage?.alt || post.heroImageAlt || post.title;
  const author = post.author;
  const authorAvatar = imgUrl(author?.avatar, { width: 96 });

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Blog", href: "/blog" },
          { label: post.title },
        ]}
      />

      <article>
        {/* Header — loosened from the previous "boxed-in" 760px column.
            Now uses max-w-[880px], drops the heavy border-on-share-row
            framing, and reduces the vertical pt/pb so the breadcrumb
            above + the hero image below provide most of the spacing
            rhythm. Reads more like an editorial article, less like a
            CMS page card. */}
        <header className="px-5 sm:px-8 pt-4 pb-8 sm:pt-8 sm:pb-10">
          <div className="mx-auto max-w-[880px]">
            {post.categories?.[0]?.title && (
              <div className="lit-pill">
                <span className="dot" />
                {post.categories[0].title}
              </div>
            )}
            <h1 className="display-xl space-eyebrow-h1">{post.title}</h1>
            {post.excerpt && (
              <p className="lead space-h1-intro max-w-[720px]">{post.excerpt}</p>
            )}

            {/* Byline + meta + share, on one line at desktop, stacked
                on mobile. No top border — the heavy framing was making
                the header feel boxed in. */}
            <div className="mt-7 flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {author && (
                  <div className="flex items-center gap-2.5">
                    {authorAvatar ? (
                      <Image
                        src={authorAvatar}
                        alt={author.name}
                        width={32}
                        height={32}
                        className="rounded-full border border-ink-100"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-100 bg-ink-25 text-[12px] font-semibold text-ink-700">
                        {author.name?.[0] || "?"}
                      </div>
                    )}
                    <div className="font-display text-[13.5px] font-semibold text-ink-900">
                      {author.name}
                      {author.isAiAgent && (
                        <span
                          className="font-mono ml-2 inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          style={{
                            color: "#00F0FF",
                            borderColor: "rgba(0,240,255,0.35)",
                            background: "rgba(0,240,255,0.08)",
                          }}
                        >
                          AI
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {post.publishedAt && (
                  <>
                    <span className="font-body text-[12px] text-ink-200" aria-hidden>·</span>
                    <span className="font-body text-[12.5px] text-ink-500">
                      {formatDate(post.publishedAt)}
                    </span>
                  </>
                )}
                {post.readingTime && (
                  <>
                    <span className="font-body text-[12px] text-ink-200" aria-hidden>·</span>
                    <span className="font-body text-[12.5px] text-ink-500">
                      {post.readingTime} min read
                    </span>
                  </>
                )}
              </div>
              <SocialShare
                url={siteUrl(`/blog/${params.slug}`)}
                title={post.title}
              />
            </div>
          </div>
        </header>

        {heroSrc && (
          <div className="px-5 pb-12 sm:px-8">
            <div className="mx-auto max-w-[1100px] overflow-hidden rounded-2xl border border-ink-100 bg-ink-25 shadow-sm sm:rounded-3xl">
              <Image
                src={heroSrc}
                alt={heroAlt}
                width={1600}
                height={900}
                className="h-auto w-full object-cover"
                priority
              />
            </div>
          </div>
        )}

        <ProseShell value={post.body} />

        {/* Post-specific CTA — only renders if the post defines a
            top-level cta object (Cowork-era schema addition; older posts
            don't have this and fall through to the default CtaBanner
            farther down). */}
        {post.cta?.primaryCtaUrl && (post.cta?.headline || post.cta?.body) && (
          <section className="px-5 sm:px-8 py-8">
            <div className="mx-auto max-w-[760px]">
              <div className="rounded-3xl border border-ink-100 bg-gradient-to-br from-brand-blue/[0.05] via-white to-cyan-50 p-7 shadow-sm sm:p-9">
                {post.cta.headline && (
                  <h2 className="font-display text-[22px] font-semibold tracking-[-0.015em] text-ink-900 sm:text-[26px]">
                    {post.cta.headline}
                  </h2>
                )}
                {post.cta.body && (
                  <p className="font-body mt-3 text-[15px] leading-relaxed text-ink-700">
                    {post.cta.body}
                  </p>
                )}
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={post.cta.primaryCtaUrl}
                    className="font-display inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[14.5px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.35)] transition hover:shadow-[0_10px_24px_rgba(37,99,235,0.45)]"
                    style={{ background: "linear-gradient(180deg,#3b82f6 0%,#2563eb 100%)" }}
                  >
                    {post.cta.primaryCtaLabel || "Book a demo"}
                  </Link>
                  {post.cta.secondaryCtaUrl && (
                    <Link
                      href={post.cta.secondaryCtaUrl}
                      className="font-display inline-flex h-12 items-center gap-2 rounded-xl border border-ink-100 bg-white px-6 text-[14.5px] font-semibold text-ink-900 hover:bg-ink-25"
                    >
                      {post.cta.secondaryCtaLabel || "Learn more"}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Bottom-of-article share row — same component as the top-
            of-article placement so readers can share without scrolling
            back up. */}
        <section className="px-5 sm:px-8 py-8">
          <div className="mx-auto max-w-[760px] border-t border-ink-100 pt-6">
            <SocialShare
              url={siteUrl(`/blog/${params.slug}`)}
              title={post.title}
            />
          </div>
        </section>

        {/* internalLinks — pillar posts reference adjacent pages in their
            cluster (alternatives, best-of, landing pages, /vs). Renders
            as a "Read across the cluster" block right after the social
            share row. Skipped silently when post.internalLinks is empty. */}
        {Array.isArray(post.internalLinks) && post.internalLinks.length > 0 && (
          <section className="px-5 sm:px-8 py-10">
            <div className="mx-auto max-w-[1000px]">
              <div className="font-display mb-5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
                Read across the cluster
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {post.internalLinks.map((link: any, idx: number) => {
                  const href = blogInternalLinkHref(link);
                  if (!href) return null;
                  const label = blogInternalLinkLabel(link);
                  const summary = link.tldr || link.subhead;
                  const kind = blogInternalLinkKind(link._type);
                  return (
                    <Link
                      key={link._id || idx}
                      href={href}
                      className="group block rounded-2xl border border-ink-100 bg-white p-5 transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md"
                    >
                      <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.1em] text-brand-blue-700">
                        {kind}
                      </div>
                      <div className="font-display mt-2 text-[15px] font-semibold leading-snug text-ink-900 group-hover:text-brand-blue-700">
                        {label}
                      </div>
                      {summary && (
                        <p className="font-body mt-2 text-[12.5px] leading-relaxed text-ink-500 line-clamp-3">
                          {summary}
                        </p>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {post.relatedGlossary?.length > 0 && (
          <section className="px-5 sm:px-8 py-10">
            <div className="mx-auto max-w-[760px]">
              <div className="font-display mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">
                Related glossary
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {post.relatedGlossary.map((t: any) => (
                  <Link
                    key={t.slug?.current || t.term}
                    href={`/glossary/${t.slug?.current}`}
                    className="rounded-xl border border-ink-100 bg-white p-4 transition hover:border-brand-blue/30 hover:shadow-sm"
                  >
                    <div className="font-display text-[14px] font-semibold text-ink-900">{t.term}</div>
                    {t.shortDefinition && (
                      <div className="font-body mt-1 text-[12.5px] leading-snug text-ink-500 line-clamp-2">
                        {t.shortDefinition}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </article>

      {/* Try this in LIT — every blog post pulls visitors back into the
          product narrative. Curated to the three features readers most
          often jump to from a content read. */}
      <section className="px-5 sm:px-8 py-12 sm:py-20" style={{ background: "rgba(15,23,42,0.025)" }}>
        <div className="mx-auto max-w-container">
          <div className="mb-8 max-w-[640px]">
            <div className="eyebrow">Try this in LIT</div>
            <h2 className="display-md space-eyebrow-h1">From the read to the workflow.</h2>
            <p className="font-body mt-3 text-[15px] leading-relaxed text-ink-500">
              The patterns above are how operators run. Here&apos;s how they wire up inside the
              platform.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                eyebrow: "Search",
                title: "Bill of Lading search",
                body: "124M+ filings, filterable by importer, exporter, HS, lane, carrier.",
                href: "/features/bill-of-lading-search",
              },
              {
                eyebrow: "Intelligence",
                title: "Company intelligence",
                body: "One-screen account profiles with shipment cadence, lanes, and verified buyer contacts.",
                href: "/features/company-intelligence",
              },
              {
                eyebrow: "Product",
                title: "Revenue Opportunity",
                body: "Quantify the freight wallet on every account across six service lines.",
                href: "/revenue-opportunity",
              },
            ].map((f) => (
              <Link
                key={f.href}
                href={f.href}
                className="group block rounded-2xl border border-ink-100 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
              >
                <div className="font-display text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-blue">
                  {f.eyebrow}
                </div>
                <div className="display-sm mt-2">{f.title}</div>
                <p className="font-body mt-3 text-[14px] leading-relaxed text-ink-500">
                  {f.body}
                </p>
                <div className="font-display mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-blue group-hover:text-brand-blue-700">
                  Open feature →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {post.relatedPosts?.length > 0 && (
        <section className="px-5 sm:px-8 py-12 sm:py-20">
          <div className="mx-auto max-w-container">
            <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
              Keep reading
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {post.relatedPosts.slice(0, 3).map((p: any) => (
                <BlogCard key={p.slug?.current || p.title} post={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBanner />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.excerpt,
            image: heroSrc,
            datePublished: post.publishedAt,
            dateModified: post._updatedAt || post.publishedAt,
            mainEntityOfPage: siteUrl(`/blog/${params.slug}`),
            author: author?.name
              ? {
                  "@type": author.isAiAgent ? "Organization" : "Person",
                  name: author.name,
                  ...(author.role ? { jobTitle: author.role } : {}),
                }
              : undefined,
            publisher: {
              "@type": "Organization",
              name: "Logistic Intel",
              logo: { "@type": "ImageObject", url: siteUrl("/lit-icon-master.svg") },
            },
          }),
        }}
      />

      {/* HowTo JSON-LD for procedural articles. Slug-keyed config keeps
          the corpus narrow + auditable. Google deprecated HowTo rich
          results in Sept 2023 for most categories, but ChatGPT Search,
          Perplexity, and Gemini all consume HowTo when present —
          this is AI-search surface area, not Google snippets. */}
      {(() => {
        const howTo = howToFor(params.slug);
        if (!howTo) return null;
        return (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "HowTo",
                name: howTo.name,
                description: howTo.description,
                ...(howTo.totalTime ? { totalTime: howTo.totalTime } : {}),
                ...(howTo.estimatedCost
                  ? {
                      estimatedCost: {
                        "@type": "MonetaryAmount",
                        currency: howTo.estimatedCost.currency,
                        value: howTo.estimatedCost.value,
                      },
                    }
                  : {}),
                step: howTo.steps.map((s, i) => ({
                  "@type": "HowToStep",
                  position: i + 1,
                  name: s.name,
                  text: s.text,
                  ...(s.url ? { url: s.url } : {}),
                })),
              }),
            }}
          />
        );
      })()}
    </PageShell>
  );
}

/**
 * Map a blogPost.internalLinks reference (resolved to its target doc)
 * to a public URL. Returns null when the doc type isn't routable —
 * caller filters these out silently.
 */
function blogInternalLinkHref(link: any): string | null {
  if (!link?.slug) return null;
  switch (link._type) {
    case "alternative":
      return `/alternatives/${link.slug}`;
    case "bestList":
      return `/best/${link.slug}`;
    case "landingPage":
      return `/${link.slug}`;
    case "blogPost":
      return `/blog/${link.slug}`;
    case "comparison":
      return `/vs/${link.slug}`;
    case "tradeLane":
      return `/lanes/${link.slug}`;
    case "industry":
      return `/industries/${link.slug}`;
    case "glossaryTerm":
      return `/glossary/${link.slug}`;
    case "useCase":
      return `/use-cases/${link.slug}`;
    case "caseStudy":
      return `/customers/${link.slug}`;
    default:
      return null;
  }
}

function blogInternalLinkLabel(link: any): string {
  switch (link._type) {
    case "alternative":
      return link.headline || `${link.competitorName} alternatives`;
    case "bestList":
      return link.headline || `Best ${link.topic || ""}`;
    case "landingPage":
      return link.h1 || link.title || link.slug;
    case "comparison":
      return link.competitorName ? `LIT vs ${link.competitorName}` : link.title || link.slug;
    default:
      return link.title || link.h1 || link.headline || link.slug;
  }
}

function blogInternalLinkKind(type: string): string {
  switch (type) {
    case "alternative":
      return "Alternatives";
    case "bestList":
      return "Best of";
    case "landingPage":
      return "Solutions";
    case "blogPost":
      return "Blog";
    case "comparison":
      return "Compare";
    case "tradeLane":
      return "Lane";
    case "industry":
      return "Industry";
    case "glossaryTerm":
      return "Glossary";
    case "useCase":
      return "Use case";
    case "caseStudy":
      return "Case study";
    default:
      return "Read";
  }
}
