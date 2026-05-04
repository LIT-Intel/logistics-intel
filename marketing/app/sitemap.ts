import type { MetadataRoute } from "next";
import { sanityClient } from "@/sanity/lib/client";
import { SITEMAP_QUERY } from "@/sanity/lib/queries";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://logisticintel.com";

type SitemapItem = { slug: string; updatedAt: string };

/**
 * Sitemap.xml generated at build time + revalidated by ISR. Combines
 * hand-coded static routes with every Sanity document that has a slug.
 * Priorities reflect SEO weighting — homepage > programmatic > editorial > legal.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dynamic = (await sanityClient.fetch(SITEMAP_QUERY).catch(() => null)) as {
    blogPosts: SitemapItem[];
    glossary: SitemapItem[];
    caseStudies: SitemapItem[];
    tradeLanes: SitemapItem[];
    industries: SitemapItem[];
    useCases: SitemapItem[];
    comparisons: SitemapItem[];
    ports: SitemapItem[];
    hsCodes: SitemapItem[];
    freeTools: SitemapItem[];
    pages: SitemapItem[];
  } | null;

  const now = new Date();

  const STATIC: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE_URL}/products`, lastModified: now, changeFrequency: "weekly", priority: 0.95 },
    { url: `${SITE_URL}/pulse`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/trade-intelligence`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/customers`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${SITE_URL}/integrations`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/security`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${SITE_URL}/glossary`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/use-cases`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/lanes`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/ports`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/hs`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/industries`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/tools`, lastModified: now, changeFrequency: "monthly", priority: 0.65 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/demo`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/dpa`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const dynamicItems: MetadataRoute.Sitemap = dynamic
    ? [
        ...dynamic.blogPosts.map((p) => ({
          url: `${SITE_URL}/blog/${p.slug}`,
          lastModified: new Date(p.updatedAt),
          changeFrequency: "weekly" as const,
          priority: 0.7,
        })),
        ...dynamic.glossary.map((p) => ({
          url: `${SITE_URL}/glossary/${p.slug}`,
          lastModified: new Date(p.updatedAt),
          changeFrequency: "monthly" as const,
          priority: 0.6,
        })),
        ...dynamic.caseStudies.map((p) => ({
          url: `${SITE_URL}/customers/${p.slug}`,
          lastModified: new Date(p.updatedAt),
          changeFrequency: "monthly" as const,
          priority: 0.75,
        })),
        ...dynamic.tradeLanes.map((p) => ({
          url: `${SITE_URL}/lanes/${p.slug}`,
          lastModified: new Date(p.updatedAt),
          changeFrequency: "daily" as const,
          priority: 0.65,
        })),
        ...dynamic.industries.map((p) => ({
          url: `${SITE_URL}/industries/${p.slug}`,
          lastModified: new Date(p.updatedAt),
          changeFrequency: "weekly" as const,
          priority: 0.7,
        })),
        ...dynamic.useCases.map((p) => ({
          url: `${SITE_URL}/use-cases/${p.slug}`,
          lastModified: new Date(p.updatedAt),
          changeFrequency: "monthly" as const,
          priority: 0.75,
        })),
        ...dynamic.comparisons.map((p) => ({
          url: `${SITE_URL}/vs/${p.slug}`,
          lastModified: new Date(p.updatedAt),
          changeFrequency: "monthly" as const,
          priority: 0.85,
        })),
        ...(dynamic.ports || []).map((p) => ({
          url: `${SITE_URL}/ports/${p.slug}`,
          lastModified: new Date(p.updatedAt),
          changeFrequency: "daily" as const,
          priority: 0.65,
        })),
        ...(dynamic.hsCodes || []).map((p) => ({
          url: `${SITE_URL}/hs/${p.slug}`,
          lastModified: new Date(p.updatedAt),
          changeFrequency: "weekly" as const,
          priority: 0.65,
        })),
        ...dynamic.freeTools.map((p) => ({
          url: `${SITE_URL}/tools/${p.slug}`,
          lastModified: new Date(p.updatedAt),
          changeFrequency: "monthly" as const,
          priority: 0.7,
        })),
        ...dynamic.pages.map((p) => ({
          url: `${SITE_URL}/${p.slug}`,
          lastModified: new Date(p.updatedAt),
          changeFrequency: "monthly" as const,
          priority: 0.5,
        })),
      ]
    : [];

  return [...STATIC, ...dynamicItems];
}
