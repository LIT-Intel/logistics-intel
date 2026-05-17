import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sanityClient } from "@/sanity/lib/client";
import { groq } from "next-sanity";
import {
  LandingPageTemplate,
  type SanityLandingPageDoc,
} from "@/components/sections/LandingPageTemplate";
import { buildMetadata, siteUrl } from "@/lib/seo";

export const revalidate = 600;

/**
 * /freight-leads — Sanity-driven landing page. The hand-coded version
 * was retired on 2026-05-16; the Cowork team now owns the content via
 * a `landingPage` doc with slug "freight-leads". Render is identical
 * shape across /freight-leads, /shipper-leads, /freight-broker-leads.
 */

const SLUG = "freight-leads";

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
      title: "Freight Leads | LIT",
      description: "Find freight leads using shipment intelligence and verified buyer-side contacts.",
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

export default async function FreightLeadsPage() {
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
