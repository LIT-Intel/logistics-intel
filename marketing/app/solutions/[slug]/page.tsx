import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SOLUTION_PAGES, getSolutionBySlug } from "../_data";
import { FeaturePageTemplate } from "@/components/sections/FeaturePageTemplate";
import { buildMetadata, siteUrl } from "@/lib/seo";
import { buildFaqPage } from "@/lib/jsonLd";

export const dynamicParams = false;

export function generateStaticParams() {
  return SOLUTION_PAGES.map((s) => ({ slug: s.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const data = getSolutionBySlug(params.slug);
  if (!data) return {};
  return buildMetadata({
    title: `${data.title.replace(/—\s*$/, "").trim()} | LIT`,
    description: data.metaDescription,
    path: `/solutions/${data.slug}`,
    eyebrow: data.eyebrow,
  });
}

export default function SolutionDetailPage({ params }: { params: { slug: string } }) {
  const data = getSolutionBySlug(params.slug);
  if (!data) notFound();

  const solutionSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: data.title.replace(/—\s*$/, "").trim(),
    description: data.metaDescription,
    url: siteUrl(`/solutions/${data.slug}`),
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
      <FeaturePageTemplate data={data} parent={{ label: "Solutions", href: "/solutions" }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(solutionSchema) }}
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
