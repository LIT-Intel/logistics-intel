import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FEATURE_PAGES, getFeatureBySlug } from "../_data";
import { FeaturePageTemplate } from "@/components/sections/FeaturePageTemplate";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { buildFaqPage } from "@/lib/jsonLd";

export const dynamicParams = false;

export function generateStaticParams() {
  return FEATURE_PAGES.map((f) => ({ slug: f.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const data = getFeatureBySlug(params.slug);
  if (!data) return {};
  return buildMetadata({
    title: `${data.title.replace(/—\s*$/, "").trim()} | LIT`,
    description: data.metaDescription,
    path: `/features/${data.slug}`,
    eyebrow: data.eyebrow,
  });
}

export default function FeatureDetailPage({ params }: { params: { slug: string } }) {
  const data = getFeatureBySlug(params.slug);
  if (!data) notFound();

  // SoftwareApplication + FAQPage JSON-LD. Each feature page is part of
  // the LIT product offering, so we tag it as a feature of the canonical
  // SoftwareApplication entity rather than declaring a new product.
  const featureSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: data.title.replace(/—\s*$/, "").trim(),
    description: data.metaDescription,
    url: siteUrl(`/features/${data.slug}`),
    isPartOf: { "@type": "WebSite", url: siteUrl("/") },
    about: {
      "@type": "SoftwareApplication",
      name: "LIT — Logistic Intel",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
    },
  };

  return (
    <>
      <FeaturePageTemplate data={data} parent={{ label: "Features", href: "/features" }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(featureSchema) }}
      />
      {data.faqs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              buildFaqPage(data.faqs.map((f) => ({ question: f.q, answer: f.a }))),
            ),
          }}
        />
      )}
    </>
  );
}
