import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { sanityClient } from "@/sanity/lib/client";
import { BLOG_POST_QUERY, BLOG_INDEX_QUERY } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { ProseShell } from "@/components/sections/ProseShell";
import { ArticleHeader } from "@/components/sections/ArticleHeader";
import { InArticleDemoCta } from "@/components/sections/InArticleDemoCta";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { SocialShare } from "@/components/sections/SocialShare";
import { ArticleSidenav } from "@/components/sections/ArticleSidenav.client";
import { AuthorBioCard } from "@/components/sections/AuthorBioCard";
import { howToFor } from "@/lib/blog/howToConfig";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { imgUrl } from "@/lib/sanityImage";
import { portableTextToc } from "@/lib/portableText";

export const revalidate = 600;

export async function generateStaticParams() {
  const posts =
    (await sanityClient
      .fetch<{ slug: { current: string } }[]>(BLOG_INDEX_QUERY)
      .catch(() => [])) || [];
  return posts
    .filter((p) => p.slug?.current)
    .map((p) => ({ slug: p.slug.current }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const post = await sanityClient
    .fetch<any>(BLOG_POST_QUERY, { slug: params.slug })
    .catch(() => null);
  if (!post) {
    return buildMetadata({
      title: "Post not found",
      path: `/blog/${params.slug}`,
    });
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

export default async function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = await sanityClient
    .fetch<any>(BLOG_POST_QUERY, { slug: params.slug })
    .catch(() => null);
  if (!post) notFound();

  // Hero image resolution: prefer Sanity-uploaded asset, then any
  // explicit heroImageUrl from the doc, then the dynamic OG image
  // generator as a guaranteed-render fallback. Posts without a Sanity
  // image now get a branded slate+cyan card with the title rendered —
  // never the broken-image gap users were seeing on some posts.
  const heroSrc =
    imgUrl(post.heroImage, { width: 1600 }) ||
    post.heroImageUrl ||
    `/api/og?title=${encodeURIComponent(post.title)}&eyebrow=${encodeURIComponent(
      post.categories?.[0]?.title || "Blog",
    )}`;
  const heroAlt = post.heroImage?.alt || post.heroImageAlt || post.title;
  const author = post.author;

  // Split the portable-text body into two segments so the in-article
  // demo CTA drops in roughly one screen into the read. We take the
  // first 2 normal/heading blocks as the "top" segment and render
  // everything else afterwards. Posts shorter than that just get the
  // CTA at the end.
  const body: any[] = Array.isArray(post.body) ? post.body : [];
  const splitIdx = Math.min(2, body.length);
  const bodyTop = body.slice(0, splitIdx);
  const bodyRest = body.slice(splitIdx);

  // Build the sidenav TOC from H2 headings in the body. Sub-H3s are
  // omitted to keep the rail clean; posts with no H2s collapse the
  // rail (the sidenav itself short-circuits when the list is empty).
  const toc = portableTextToc(body, ["h2"]);
  const articleUrl = siteUrl(`/blog/${params.slug}`);

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Blog", href: "/blog" },
          { label: post.title },
        ]}
      />

      <article className="relative">
        <ArticleHeader post={post} />

        {heroSrc && (
          <div className="px-5 pb-12 sm:px-8">
            <div className="mx-auto max-w-[1100px] overflow-hidden border border-ink-100 bg-ink-25 shadow-sm">
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

        {/* Two-column article layout — 240px sidenav (sticky) + 760px
            content. Collapses to one column ≤980px where the sidenav
            becomes a styled card above the body. */}
        <div className="article-layout">
          {toc.length > 0 ? (
            <ArticleSidenav
              items={toc}
              shareUrl={articleUrl}
              shareTitle={post.title}
            />
          ) : (
            <div aria-hidden />
          )}

          <div className="article-content min-w-0">
            {bodyTop.length > 0 && (
              <div className="prose-segment">
                <ProseShell value={bodyTop} />
              </div>
            )}

            <InArticleDemoCta />

            {bodyRest.length > 0 && (
              <div className="prose-segment">
                <ProseShell value={bodyRest} />
              </div>
            )}

            {/* Author bio card — keeps the E-E-A-T signal at the foot of
                every post. Avatar + name + role + bio + social links; all
                fields already exist on the Sanity `author` document. The
                cyan→blue→violet top stripe is the ONE permitted cyan
                touch on a light-bg surface (decorative stripe, not
                text). */}
            {author?.name && (
              <section className="py-10">
                <AuthorBioCard
                  author={{
                    name: author.name,
                    role: author.role,
                    bio: author.bio,
                    avatarUrl: imgUrl(author.avatar, { width: 320 }) || null,
                    socialLinks: author.socialLinks,
                  }}
                />
              </section>
            )}

            {/* Bottom-of-article share row — keep so readers can share
                without scrolling back up. */}
            <section className="py-6">
              <div className="border-t border-ink-100 pt-6">
                <SocialShare url={articleUrl} title={post.title} />
              </div>
            </section>
          </div>
        </div>
      </article>

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
              logo: {
                "@type": "ImageObject",
                url: siteUrl("/lit-icon-master.svg"),
              },
            },
          }),
        }}
      />

      {/* FAQPage JSON-LD — derived from the body when an H2 "FAQ" section
          is present. Each H3 inside that section becomes a Question; the
          paragraph(s) between H3s become the Answer. Returns null if no
          FAQ section is detected. */}
      {(() => {
        const faq = extractFaqFromBody(post.body);
        if (!faq || faq.length === 0) return null;
        return (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: faq.map((q) => ({
                  "@type": "Question",
                  name: q.question,
                  acceptedAnswer: { "@type": "Answer", text: q.answer },
                })),
              }),
            }}
          />
        );
      })()}

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
 * Pull a FAQ Q&A list out of a blog post body. Looks for an H2 whose
 * text is "FAQ" (case-insensitive). After that H2, every H3 starts a
 * new Question; the normal-style paragraphs between H3s are the Answer.
 * Stops at the next H2.
 *
 * Returns null if no FAQ section is found, or an empty array if the
 * section exists but has no questions yet. Callers use the empty-check
 * to decide whether to emit FAQPage JSON-LD.
 */
function extractFaqFromBody(
  body: unknown,
): Array<{ question: string; answer: string }> | null {
  if (!Array.isArray(body)) return null;

  function textOf(block: any): string {
    if (!block || block._type !== "block") return "";
    return (block.children || [])
      .map((c: any) => (typeof c?.text === "string" ? c.text : ""))
      .join("")
      .trim();
  }

  // Find the FAQ H2 anchor.
  let i = body.findIndex(
    (b: any) =>
      b?._type === "block" && b.style === "h2" && /^faq$/i.test(textOf(b)),
  );
  if (i < 0) return null;
  i += 1;

  const faq: Array<{ question: string; answer: string }> = [];
  let current: { question: string; answer: string } | null = null;

  while (i < body.length) {
    const block: any = body[i];
    if (block?._type === "block") {
      if (block.style === "h2") {
        // Next top-level section — stop collecting.
        break;
      }
      if (block.style === "h3") {
        if (current) faq.push(current);
        current = { question: textOf(block), answer: "" };
      } else if (current && (block.style === "normal" || !block.style)) {
        const t = textOf(block);
        if (t) current.answer = current.answer ? `${current.answer}\n\n${t}` : t;
      }
    }
    i += 1;
  }
  if (current) faq.push(current);

  return faq.filter((q) => q.question && q.answer);
}
