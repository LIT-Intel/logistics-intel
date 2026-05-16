import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sanityClient } from "@/sanity/lib/client";
import { groq } from "next-sanity";
import {
  LandingPageTemplate,
  type SanityLandingPageDoc,
} from "@/components/sections/LandingPageTemplate";
import { buildMetadata } from "@/lib/seo";

export const revalidate = 600;

/**
 * /freight-broker-leads — Sanity-driven landing page. Content lives in
 * the `landingPage` doc with slug "freight-broker-leads".
 */

const SLUG = "freight-broker-leads";

const LANDING_PAGE_QUERY = groq`*[_type == "landingPage" && slug.current == $slug][0]{
  slug, eyebrow, h1, subhead, tldr, targetKeyword, audience,
  proofPoints, painPoints, productProof, comparisonTable,
  customerQuote, cta, faq, seo
}`;

export async function generateMetadata(): Promise<Metadata> {
  const doc = await sanityClient
    .fetch<(SanityLandingPageDoc & { seo?: any }) | null>(LANDING_PAGE_QUERY, { slug: SLUG })
    .catch(() => null);
  if (!doc) {
    return buildMetadata({
      title: "Freight Broker Leads | LIT",
      description:
        "Find shippers actively moving freight on your lanes. Built for asset-light brokers, intermodal, and drayage teams.",
      path: `/${SLUG}`,
    });
  }
  return buildMetadata({
    title: doc.h1,
    description: doc.tldr || doc.subhead,
    path: `/${SLUG}`,
    eyebrow: doc.eyebrow,
    seo: doc.seo,
  });
}

export default async function FreightBrokerLeadsPage() {
  const doc = await sanityClient
    .fetch<SanityLandingPageDoc | null>(LANDING_PAGE_QUERY, { slug: SLUG })
    .catch(() => null);
  if (!doc) notFound();

  const faqSchema =
    doc.faq && doc.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: doc.faq.map((q) => ({
            "@type": "Question",
            name: q.question,
            acceptedAnswer: { "@type": "Answer", text: q.answer },
          })),
        }
      : null;

  return (
    <>
      <LandingPageTemplate doc={doc} />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}
    </>
  );
}
