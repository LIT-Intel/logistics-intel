/**
 * Shared schema.org JSON-LD builders.
 *
 * Per-route schema lives inline in each page.tsx as <script type="application/ld+json">
 * tags. These helpers keep the payloads consistent across routes — same
 * publisher reference, same site-URL handling, same author shape — and
 * cut the cognitive cost of adding a new schema type to a new route.
 *
 * Validate any change to these payloads in the Google Rich Results Test
 * before shipping: https://search.google.com/test/rich-results
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://logisticintel.com";
const PUBLISHER_REF = { "@id": `${SITE_URL}/#organization` };

const abs = (path: string) =>
  path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export type Crumb = { label: string; href?: string };

/**
 * BreadcrumbList — emit on every non-home page. The visual breadcrumb
 * already comes from <BreadcrumbBar>, which calls this helper internally
 * so callers get the schema for free.
 */
export function buildBreadcrumbList(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: abs(c.href) } : {}),
    })),
  };
}

/**
 * CollectionPage — for hub/index routes (/blog, /glossary, /lanes, etc.).
 * `items` should already be projected to { name, url } shape; the helper
 * normalizes URLs but doesn't fetch or transform anything else.
 */
export function buildCollectionPage(opts: {
  name: string;
  description: string;
  path: string;
  items?: Array<{ name: string; url: string }>;
  type?: "Article" | "DefinedTerm" | "Product" | "WebPage";
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: opts.name,
    description: opts.description,
    url: abs(opts.path),
    publisher: PUBLISHER_REF,
    ...(opts.items && opts.items.length > 0
      ? {
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: opts.items.length,
            itemListElement: opts.items.map((it, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: it.name,
              url: abs(it.url),
            })),
          },
        }
      : {}),
  };
}

/**
 * FAQPage — assumes answers are already plain text (not portable text).
 * Pages that use Sanity portable text answers should flatten before
 * calling this (see /faq for an example with `blocksToPlainText`).
 */
export function buildFaqPage(faqs: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

/** Renders a single JSON-LD payload as a <script> tag. Convenience wrapper. */
export function jsonLdScript(payload: unknown) {
  return {
    type: "application/ld+json" as const,
    dangerouslySetInnerHTML: { __html: JSON.stringify(payload) },
  };
}
