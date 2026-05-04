import { urlFor } from "@/sanity/lib/client";

/** Standard image URL with sensible defaults. */
export function imgUrl(
  source: any,
  opts: { width?: number; height?: number; quality?: number } = {},
) {
  if (!source) return null;
  let b = urlFor(source);
  if (opts.width) b = b.width(opts.width);
  if (opts.height) b = b.height(opts.height);
  if (opts.quality) b = b.quality(opts.quality);
  return b.fit("max").auto("format").url();
}

/**
 * logo.dev fallback URL — resolves a company logo by domain.
 *
 * Uses the canonical logo.dev URL format `https://img.logo.dev/{domain}?token={key}`
 * with no extra params (size + format defaults work on all logo.dev plans).
 *
 * Returns null when NEXT_PUBLIC_LOGO_DEV_KEY is unset — LogoImage falls
 * back to a monogram tile. Publishable keys are client-safe to expose.
 */
export function logoDevUrl(domain?: string | null, opts: { size?: number; format?: "svg" | "png" } = {}) {
  if (!domain) return null;
  const key = process.env.NEXT_PUBLIC_LOGO_DEV_KEY;
  if (!key) return null;
  // Strip protocol + trailing slash + path
  const clean = domain.replace(/^https?:\/\//, "").replace(/\/.*/, "").trim();
  if (!clean) return null;
  const params = new URLSearchParams({ token: key });
  if (opts.size) params.set("size", String(opts.size));
  if (opts.format) params.set("format", opts.format);
  return `https://img.logo.dev/${clean}?${params.toString()}`;
}

/** Resolve a logo from either a Sanity image OR a domain fallback. */
export function resolveLogoUrl(item: { logo?: any; domain?: string | null } | null | undefined, size = 128) {
  if (!item) return null;
  return imgUrl(item.logo, { width: size }) || logoDevUrl(item.domain, { size });
}
