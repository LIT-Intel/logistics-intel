import type { Metadata } from "next";
import { sanityClient } from "@/sanity/lib/client";
import { BLOG_INDEX_QUERY } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { BlogCard } from "@/components/sections/BlogCard";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";
import { buildCollectionPage } from "@/lib/jsonLd";

export const revalidate = 600;

export const metadata: Metadata = buildMetadata({
  title: "Blog — operator-grade GTM playbooks",
  description:
    "Long-form playbooks, trade-data analysis, and field notes from teams running outbound on signal — not lists.",
  path: "/blog",
  eyebrow: "Blog",
});

export default async function BlogIndexPage() {
  const posts = (await sanityClient.fetch<any[]>(BLOG_INDEX_QUERY).catch(() => [])) || [];
  const [featured, ...rest] = posts;

  return (
    <PageShell>
      <BreadcrumbBar
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Blog" },
        ]}
      />
      <PageHero
        eyebrow="Field notes"
        title="Operator-grade"
        titleHighlight="GTM playbooks."
        subtitle="Long-form analysis, trade-data deep dives, and tactical playbooks from teams running outbound on signal — not lists."
      />

      {posts.length === 0 && (
        <section className="px-8 pb-20">
          <div className="mx-auto max-w-container">
            <div className="rounded-2xl border border-dashed border-ink-100 bg-white px-7 py-16 text-center">
              <div className="font-display text-[18px] font-semibold text-ink-900">No posts yet</div>
              <p className="font-body mx-auto mt-2 max-w-[440px] text-[14px] leading-relaxed text-ink-500">
                Posts will appear here as soon as the Blog Drafter agent runs (next: Monday 6am). You can also
                publish from Sanity Studio at <code className="font-mono">/studio</code>.
              </p>
            </div>
          </div>
        </section>
      )}

      {featured && (
        <section className="px-8 pb-10">
          <div className="mx-auto max-w-container">
            <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
              Featured
            </div>
            <BlogCard post={featured} featured />
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="px-8 pb-20">
          <div className="mx-auto max-w-container">
            <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
              Latest
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {rest.map((p) => (
                <BlogCard key={p._id} post={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBanner
        eyebrow="Stay in the loop"
        title="Get the LIT brief."
        subtitle="A weekly five-minute read on what's moving in trade, GTM tooling, and what we're shipping next."
        primaryCta={{ label: "Subscribe", href: "/contact", icon: "arrow" }}
        secondaryCta={{ label: "Book a demo", href: "/demo" }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            buildCollectionPage({
              name: "LIT Blog — operator-grade GTM playbooks",
              description:
                "Long-form playbooks, trade-data analysis, and field notes from teams running outbound on signal — not lists.",
              path: "/blog",
              items: posts
                .filter((p: any) => p?.slug?.current && p?.title)
                .map((p: any) => ({
                  name: p.title,
                  url: `/blog/${p.slug.current}`,
                })),
            }),
          ),
        }}
      />
    </PageShell>
  );
}
