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

  const heroSrc = imgUrl(post.heroImage, { width: 1600 });
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
        <header className="px-8 pt-6 pb-10">
          <div className="mx-auto max-w-[760px]">
            {post.categories?.[0]?.title && (
              <div className="lit-pill">
                <span className="dot" />
                {post.categories[0].title}
              </div>
            )}
            <h1 className="display-xl mt-5">{post.title}</h1>
            {post.excerpt && <p className="lead mt-5">{post.excerpt}</p>}
            <div className="mt-7 flex flex-wrap items-center gap-4">
              {author && (
                <div className="flex items-center gap-3">
                  {authorAvatar ? (
                    <Image
                      src={authorAvatar}
                      alt={author.name}
                      width={36}
                      height={36}
                      className="rounded-full border border-ink-100"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-100 bg-ink-25 text-[13px] font-semibold text-ink-700">
                      {author.name?.[0] || "?"}
                    </div>
                  )}
                  <div>
                    <div className="font-display text-[14px] font-semibold text-ink-900">
                      {author.name}
                      {author.isAiAgent && (
                        <span
                          className="font-mono ml-2 inline-flex items-center rounded border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider"
                          style={{
                            color: "#00F0FF",
                            borderColor: "rgba(0,240,255,0.35)",
                            background: "rgba(0,240,255,0.08)",
                          }}
                        >
                          AI Agent
                        </span>
                      )}
                    </div>
                    {author.role && (
                      <div className="font-body text-[12px] text-ink-500">{author.role}</div>
                    )}
                  </div>
                </div>
              )}
              {post.publishedAt && (
                <>
                  <span className="font-body text-[12px] text-ink-200" aria-hidden>·</span>
                  <span className="font-body text-[13px] text-ink-500">{formatDate(post.publishedAt)}</span>
                </>
              )}
              {post.readingTime && (
                <>
                  <span className="font-body text-[12px] text-ink-200" aria-hidden>·</span>
                  <span className="font-body text-[13px] text-ink-500">{post.readingTime} min read</span>
                </>
              )}
            </div>
          </div>
        </header>

        {heroSrc && (
          <div className="px-8 pb-12">
            <div className="mx-auto max-w-[1100px] overflow-hidden rounded-3xl border border-ink-100 bg-ink-25 shadow-sm">
              <Image
                src={heroSrc}
                alt={post.title}
                width={1600}
                height={900}
                className="h-auto w-full object-cover"
                priority
              />
            </div>
          </div>
        )}

        <ProseShell value={post.body} />

        {post.relatedGlossary?.length > 0 && (
          <section className="px-8 py-10">
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

      {post.relatedPosts?.length > 0 && (
        <section className="px-8 py-16">
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
    </PageShell>
  );
}
