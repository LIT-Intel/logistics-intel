import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BEST_LIST_PAGES, getBestListBySlug } from "../_data";
import { BestListPageTemplate } from "@/components/sections/BestListPageTemplate";
import {
  SanityBestListTemplate,
  type SanityBestListDoc,
} from "@/components/sections/SanityBestListTemplate";
import { sanityClient } from "@/sanity/lib/client";
import { groq } from "next-sanity";
import { buildMetadata, siteUrl } from "@/lib/seo";

export const revalidate = 600;
// Allow on-demand rendering for Sanity-backed bestList docs whose
// slugs aren't in the hand-coded BEST_LIST_PAGES list.
export const dynamicParams = true;

const SANITY_BEST_LIST_QUERY = groq`*[_type == "bestList" && slug.current == $slug][0]{
  slug, topic, headline, subhead, tldr, criteria,
  items, cta, faq, lastReviewedAt, publishedAt, seo
}`;

const SANITY_BEST_LIST_SLUGS_QUERY = groq`*[_type == "bestList" && defined(slug.current)]{
  "slug": slug.current
}`;

export async function generateStaticParams() {
  const sanitySlugs = (await sanityClient
    .fetch<{ slug: string }[]>(SANITY_BEST_LIST_SLUGS_QUERY)
    .catch(() => [])) || [];
  return [
    ...BEST_LIST_PAGES.map((b) => ({ slug: b.slug })),
    ...sanitySlugs.filter((s) => s.slug).map((s) => ({ slug: s.slug })),
  ];
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const hard = getBestListBySlug(params.slug);
  if (hard) {
    return buildMetadata({
      title: `${hard.title} | LIT`,
      description: hard.metaDescription,
      path: `/best/${params.slug}`,
      eyebrow: hard.eyebrow,
    });
  }
  const doc = await sanityClient
    .fetch<(SanityBestListDoc & { seo?: any }) | null>(SANITY_BEST_LIST_QUERY, {
      slug: params.slug,
    })
    .catch(() => null);
  if (!doc) return {};
  return buildMetadata({
    title: doc.headline,
    description: doc.tldr || doc.subhead,
    path: `/best/${params.slug}`,
    eyebrow: `Best ${doc.topic}`,
    seo: doc.seo,
  });
}

export default async function BestListDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  // 1. Hand-coded slug wins.
  const hard = getBestListBySlug(params.slug);
  if (hard) {
    const listSchema = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: hard.title,
      description: hard.metaDescription,
      url: siteUrl(`/best/${params.slug}`),
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      numberOfItems: hard.entries.length,
      itemListElement: hard.entries.map((e) => ({
        "@type": "ListItem",
        position: e.rank,
        item: {
          "@type": "SoftwareApplication",
          name: e.name,
          applicationCategory: "BusinessApplication",
          description: e.pitch,
        },
      })),
    };
    return (
      <>
        <BestListPageTemplate data={hard} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(listSchema) }}
        />
      </>
    );
  }

  // 2. Fall back to Sanity-backed bestList doc.
  const doc = await sanityClient
    .fetch<SanityBestListDoc | null>(SANITY_BEST_LIST_QUERY, {
      slug: params.slug,
    })
    .catch(() => null);
  if (!doc) notFound();

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: doc.headline,
    description: doc.tldr || doc.subhead,
    url: siteUrl(`/best/${params.slug}`),
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: doc.items?.length || 0,
    itemListElement: (doc.items || [])
      .slice()
      .sort((a, b) => (a.rank || 99) - (b.rank || 99))
      .map((i) => ({
        "@type": "ListItem",
        position: i.rank,
        item: {
          "@type": "SoftwareApplication",
          name: i.name,
          applicationCategory: "BusinessApplication",
          description: i.oneLineSummary,
          ...(i.url ? { url: i.url } : {}),
        },
      })),
  };

  const faqSchema =
    doc.faq && doc.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: doc.faq.map((q) => ({
            "@type": "Question",
            name: q.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: portableTextToPlain(q.answer),
            },
          })),
        }
      : null;

  return (
    <>
      <SanityBestListTemplate doc={doc} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}
    </>
  );
}

function portableTextToPlain(value: any): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((block: any) =>
      block?._type === "block" && Array.isArray(block.children)
        ? block.children.map((c: any) => c?.text || "").join("")
        : "",
    )
    .filter(Boolean)
    .join("\n\n");
}
