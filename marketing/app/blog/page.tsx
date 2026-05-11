import type { Metadata } from "next";
import { sanityClient } from "@/sanity/lib/client";
import { BLOG_INDEX_QUERY } from "@/sanity/lib/queries";
import { PageShell } from "@/components/sections/PageShell";
import { PageHero } from "@/components/sections/PageHero";
import { BlogHeroTrio } from "@/components/sections/BlogHeroTrio";
import { BlogGrid } from "@/components/sections/BlogGrid.client";
import { ShipperInsightsRow } from "@/components/sections/ShipperInsightsRow";
import { Section } from "@/components/sections/Section";
import { BreadcrumbBar } from "@/components/sections/BreadcrumbBar";
import { CtaBanner } from "@/components/sections/CtaBanner";
import { buildMetadata } from "@/lib/seo";
import { buildCollectionPage } from "@/lib/jsonLd";
import {
  getFeaturedBrandCompanies,
  type FeaturedBrand,
} from "@/lib/companies";

export const revalidate = 600;

/**
 * Shipper Insights brand set — same shape as the /companies hub but
 * tighter (8 marquee names is enough for a horizontal scroller). Each
 * entry gets ILIKE-matched against the customs filer name and pulled
 * with its highest-TEU row.
 */
const SHIPPER_INSIGHTS_BRANDS: FeaturedBrand[] = [
  { pattern: "HOME DEPOT", domain: "homedepot.com" },
  { pattern: "COSTCO", domain: "costco.com" },
  { pattern: "WALMART", domain: "walmart.com" },
  { pattern: "TARGET CORP", domain: "target.com" },
  { pattern: "LOWE", domain: "lowes.com" },
  { pattern: "BEST BUY", domain: "bestbuy.com" },
  { pattern: "NIKE", domain: "nike.com" },
  { pattern: "IKEA", domain: "ikea.com" },
  { pattern: "TESLA", domain: "tesla.com" },
  { pattern: "WAYFAIR", domain: "wayfair.com" },
];

export const metadata: Metadata = buildMetadata({
  title: "Blog — operator-grade GTM playbooks for logistics sales teams",
  description:
    "Long-form playbooks, trade-data analysis, shipper insights, and field notes from teams running outbound on signal — not lists.",
  path: "/blog",
  eyebrow: "Blog",
});

export default async function BlogIndexPage() {
  const [postsRaw, shippers] = await Promise.all([
    sanityClient.fetch<any[]>(BLOG_INDEX_QUERY).catch(() => [] as any[]),
    getFeaturedBrandCompanies(SHIPPER_INSIGHTS_BRANDS).catch(() => []),
  ]);
  const posts = postsRaw || [];

  const hasPosts = posts.length > 0;
  const heroPosts = posts.slice(0, 3);
  const gridPosts = posts.slice(3);

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

      {!hasPosts && (
        <Section top="md" bottom="lg">
          <div className="rounded-2xl border border-dashed border-ink-100 bg-white px-7 py-16 text-center">
            <div className="font-display text-[18px] font-semibold text-ink-900">No posts yet</div>
            <p className="font-body mx-auto mt-2 max-w-[440px] text-[14px] leading-relaxed text-ink-500">
              Posts will appear here as soon as the Blog Drafter agent runs (next: Monday 6am). You can also
              publish from Sanity Studio at <code className="font-mono">/studio</code>.
            </p>
          </div>
        </Section>
      )}

      {hasPosts && (
        <Section top="md" bottom="md">
          <BlogHeroTrio posts={heroPosts} />
        </Section>
      )}

      {shippers.length > 0 && (
        <Section top="md" bottom="md">
          <ShipperInsightsRow companies={shippers} />
        </Section>
      )}

      {hasPosts && (
        <Section top="md" bottom="lg">
          <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
            Browse all stories
          </div>
          <BlogGrid posts={gridPosts.length > 0 ? gridPosts : posts} />
        </Section>
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
