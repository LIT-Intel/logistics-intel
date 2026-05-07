import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BEST_LIST_PAGES, getBestListBySlug } from "../_data";
import { BestListPageTemplate } from "@/components/sections/BestListPageTemplate";
import { buildMetadata, siteUrl } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return BEST_LIST_PAGES.map((b) => ({ slug: b.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const data = getBestListBySlug(params.slug);
  if (!data) return {};
  return buildMetadata({
    title: `${data.title} | LIT`,
    description: data.metaDescription,
    path: `/best/${data.slug}`,
    eyebrow: data.eyebrow,
  });
}

export default function BestListDetailPage({ params }: { params: { slug: string } }) {
  const data = getBestListBySlug(params.slug);
  if (!data) notFound();

  // ItemList schema — Google's recommended structure for "best X" listicles.
  // Each entry shows up as a ranked ListItem.
  const listSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: data.title,
    description: data.metaDescription,
    url: siteUrl(`/best/${data.slug}`),
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: data.entries.length,
    itemListElement: data.entries.map((e) => ({
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
      <BestListPageTemplate data={data} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(listSchema) }}
      />
    </>
  );
}
