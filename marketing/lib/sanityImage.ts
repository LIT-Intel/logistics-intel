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
 * logo.dev fallback URL — when a Sanity image isn't provided we resolve
 * the logo via logo.dev using the company's domain.
 *
 * logo.dev requires a token for ALL requests. Without
 * NEXT_PUBLIC_LOGO_DEV_KEY this returns null so the caller can fall
 * back to a monogram tile. The publishable key is safe to expose.
 */
export function logoDevUrl(domain?: string | null, opts: { size?: number; format?: "svg" | "png" } = {}) {
  if (!domain) return null;
  const key = process.env.NEXT_PUBLIC_LOGO_DEV_KEY;
  if (!key) return null;
  const size = opts.size || 128;
  const format = opts.format || "png";
  // Strip protocol + trailing slash
  const clean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const params = new URLSearchParams({
    size: String(size),
    format,
    token: key,
  });
  return `https://img.logo.dev/${clean}?${params.toString()}`;
}

/** Resolve a logo from either a Sanity image OR a domain fallback. */
export function resolveLogoUrl(item: { logo?: any; domain?: string | null } | null | undefined, size = 128) {
  if (!item) return null;
  return imgUrl(item.logo, { width: size }) || logoDevUrl(item.domain, { size });
}
