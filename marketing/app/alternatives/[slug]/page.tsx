import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ALTERNATIVE_PAGES, getAlternativeBySlug } from "../_data";
import { AlternativePageTemplate } from "@/components/sections/AlternativePageTemplate";
import {
  SanityAlternativeTemplate,
  type SanityAlternativeDoc,
} from "@/components/sections/SanityAlternativeTemplate";
import { sanityClient } from "@/sanity/lib/client";
import { groq } from "next-sanity";
import { buildMetadata, siteUrl } from "@/lib/seo";

export const revalidate = 600;
// Allow on-demand rendering for Sanity-backed alternative docs whose
// slugs aren't in the hand-coded ALTERNATIVE_PAGES list.
export const dynamicParams = true;

const SANITY_ALTERNATIVE_QUERY = groq`*[_type == "alternative" && slug.current == $slug][0]{
  slug, competitorName, headline, subhead, tldr,
  alternatives, cta, faq, lastReviewedAt, publishedAt, seo
}`;

const SANITY_ALTERNATIVE_SLUGS_QUERY = groq`*[_type == "alternative" && defined(slug.current)]{
  "slug": slug.current
}`;

export async function generateStaticParams() {
  const sanitySlugs = (await sanityClient
    .fetch<{ slug: string }[]>(SANITY_ALTERNATIVE_SLUGS_QUERY)
    .catch(() => [])) || [];
  return [
    ...ALTERNATIVE_PAGES.map((a) => ({ slug: a.slug })),
    ...sanitySlugs.filter((s) => s.slug).map((s) => ({ slug: s.slug })),
  ];
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const hard = getAlternativeBySlug(params.slug);
  if (hard) {
    return buildMetadata({
      title: `${hard.competitor} alternative — LIT vs ${hard.competitor} | Logistic Intel`,
      description: hard.metaDescription,
      path: `/alternatives/${params.slug}`,
      eyebrow: `${hard.competitor} alternative`,
    });
  }
  const doc = await sanityClient
    .fetch<(SanityAlternativeDoc & { seo?: any }) | null>(SANITY_ALTERNATIVE_QUERY, {
      slug: params.slug,
    })
    .catch(() => null);
  if (!doc) return {};
  return buildMetadata({
    title: doc.headline,
    description: doc.tldr || doc.subhead,
    path: `/alternatives/${params.slug}`,
    eyebrow: `${doc.competitorName} alternatives`,
    seo: doc.seo,
  });
}

export default async function AlternativeDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  // 1. Hand-coded slug wins (legacy compatibility for the existing
  //    importyeti-alternative / panjiva-alternative / etc. URLs).
  const hard = getAlternativeBySlug(params.slug);
  if (hard) {
    const schema = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `${hard.competitor} alternative — LIT`,
      description: hard.metaDescription,
      url: siteUrl(`/alternatives/${params.slug}`),
      isPartOf: { "@type": "WebSite", url: siteUrl("/") },
      about: [
        { "@type": "SoftwareApplication", name: "LIT — Logistic Intel" },
        { "@type": "SoftwareApplication", name: hard.competitor },
      ],
    };
    return (
      <>
        <AlternativePageTemplate data={hard} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      </>
    );
  }

  // 2. Fall back to Sanity-backed alternative doc (new content created
  //    by the Cowork session — initial doc: slug "importyeti").
  const doc = await sanityClient
    .fetch<SanityAlternativeDoc | null>(SANITY_ALTERNATIVE_QUERY, {
      slug: params.slug,
    })
    .catch(() => null);
  if (!doc) notFound();

  // ItemList + FAQPage schema. ItemList covers the ranked alternatives;
  // FAQPage emits when faq[] is present so the page is rich-result
  // eligible for both formats.
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: doc.headline,
    description: doc.tldr || doc.subhead,
    url: siteUrl(`/alternatives/${params.slug}`),
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: doc.alternatives?.length || 0,
    itemListElement: (doc.alternatives || [])
      .slice()
      .sort((a, b) => (a.rank || 99) - (b.rank || 99))
      .map((a) => ({
        "@type": "ListItem",
        position: a.rank,
        item: {
          "@type": "SoftwareApplication",
          name: a.name,
          applicationCategory: "BusinessApplication",
          description: a.oneLineSummary,
          ...(a.url ? { url: a.url } : {}),
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
      <SanityAlternativeTemplate doc={doc} />
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

/**
 * Flatten a portable-text answer to a plain string for JSON-LD FAQPage
 * payloads (Google requires plain text in acceptedAnswer.text, not HTML).
 */
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
