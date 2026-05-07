import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ALTERNATIVE_PAGES, getAlternativeBySlug } from "../_data";
import { AlternativePageTemplate } from "@/components/sections/AlternativePageTemplate";
import { buildMetadata, siteUrl } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return ALTERNATIVE_PAGES.map((a) => ({ slug: a.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const data = getAlternativeBySlug(params.slug);
  if (!data) return {};
  return buildMetadata({
    title: `${data.competitor} alternative — LIT vs ${data.competitor} | Logistic Intel`,
    description: data.metaDescription,
    path: `/alternatives/${data.slug}`,
    eyebrow: `${data.competitor} alternative`,
  });
}

export default function AlternativeDetailPage({ params }: { params: { slug: string } }) {
  const data = getAlternativeBySlug(params.slug);
  if (!data) notFound();

  // SoftwareApplication review-style schema. Each alternative page is a
  // structured comparison we want indexed as such.
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${data.competitor} alternative — LIT`,
    description: data.metaDescription,
    url: siteUrl(`/alternatives/${data.slug}`),
    isPartOf: { "@type": "WebSite", url: siteUrl("/") },
    about: [
      { "@type": "SoftwareApplication", name: "LIT — Logistic Intel" },
      { "@type": "SoftwareApplication", name: data.competitor },
    ],
  };

  return (
    <>
      <AlternativePageTemplate data={data} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
    </>
  );
}
