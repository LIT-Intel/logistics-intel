import type { Metadata } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://logisticintel.com";

export type SeoFields = {
  title?: string;
  description?: string;
  ogImage?: { asset?: { url?: string } } | null;
  canonicalUrl?: string;
  noIndex?: boolean;
  keywords?: string[];
};

/**
 * Builds Next.js Metadata from a Sanity seoFields object + page defaults.
 * Falls back to /api/og?title=... when no custom OG image is set so
 * every page has a branded social share even without manual upload.
 */
export function buildMetadata(opts: {
  title: string;
  description?: string;
  path: string;
  seo?: SeoFields | null;
  eyebrow?: string;
  type?: "website" | "article";
  publishedAt?: string;
  modifiedAt?: string;
  authors?: string[];
}): Metadata {
  const seo = opts.seo || {};
  const title = seo.title || opts.title;
  const description =
    seo.description ||
    opts.description ||
    "LIT — market intelligence + revenue execution for modern growth teams.";
  const url = `${SITE_URL}${opts.path}`;
  const canonical = seo.canonicalUrl || url;

  const ogImageUrl =
    seo.ogImage?.asset?.url ||
    `${SITE_URL}/api/og?title=${encodeURIComponent(title)}${
      opts.eyebrow ? `&eyebrow=${encodeURIComponent(opts.eyebrow)}` : ""
    }`;

  return {
    title,
    description,
    keywords: seo.keywords,
    alternates: { canonical },
    robots: seo.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true, googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large", "max-video-preview": -1 } },
    openGraph: {
      type: opts.type || "website",
      url,
      title,
      description,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
      ...(opts.type === "article" && opts.publishedAt
        ? { publishedTime: opts.publishedAt, modifiedTime: opts.modifiedAt, authors: opts.authors }
        : {}),
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImageUrl] },
  };
}

export function siteUrl(path = "/") {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
