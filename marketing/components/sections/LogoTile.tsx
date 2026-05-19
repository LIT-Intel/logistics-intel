import { LogoImage } from "./LogoImage.client";

/**
 * Brand logo tile — used on /companies, money pages (via ProofStrip),
 * and anywhere else we render a company mark. Two image sources, in
 * priority:
 *
 *   1. logo.dev — sharp brand logos; requires NEXT_PUBLIC_LOGO_DEV_KEY
 *      (or NEXT_PUBLIC_LOGO_DEV_TOKEN / VITE_LOGO_DEV_TOKEN).
 *   2. Google's favicon CDN — free fallback used when logo.dev fails
 *      (e.g. key revoked, referrer restriction, plan limits). The
 *      fallback swap happens client-side via the LogoImage client
 *      component's onError handler.
 *
 * Falls back to a two-letter initials monogram when no domain is known.
 *
 * Kept as a Server Component (the client subtree is just the <img>);
 * adding "use client" to LogoTile itself broke /companies/[slug]
 * prerendering with a minified TypeError during static generation.
 */

const LOGO_DEV_TOKEN =
  process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN ||
  process.env.NEXT_PUBLIC_LOGO_DEV_KEY ||
  process.env.VITE_LOGO_DEV_TOKEN;

function logoDevUrl(domain: string, size: number): string | null {
  if (!LOGO_DEV_TOKEN) return null;
  return `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=${size * 2}&format=png&retina=true`;
}

function faviconUrl(domain: string, size: number): string {
  // Direct gstatic URL skips the google.com/s2 redirect — saves a hop.
  return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=${size * 2}`;
}

function initialsFor(name: string): string {
  return name
    .replace(/[^A-Za-z\s]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function LogoTile({
  domain,
  name,
  size = "md",
}: {
  domain: string | null | undefined;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const px = size === "lg" ? 56 : size === "sm" ? 36 : 44;
  const cls =
    size === "lg"
      ? "h-14 w-14 rounded-2xl text-[15px]"
      : size === "sm"
      ? "h-9 w-9 rounded-lg text-[11px]"
      : "h-11 w-11 rounded-xl text-[13px]";

  if (!domain) {
    return (
      <div
        aria-hidden
        className={`font-display flex shrink-0 items-center justify-center border border-ink-100 bg-gradient-to-br from-ink-50 to-white font-bold text-ink-500 ${cls}`}
      >
        {initialsFor(name) || "·"}
      </div>
    );
  }

  const fallback = faviconUrl(domain, px);
  const primary = logoDevUrl(domain, px) ?? fallback;

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden border border-ink-100 bg-white ${cls}`}
    >
      <LogoImage
        primarySrc={primary}
        fallbackSrc={fallback}
        alt={`${name} logo`}
        px={px}
      />
    </div>
  );
}

/** Domain inference for non-curated rows. Pulls from `domain` or `website`. */
export function inferLogoDomain(opts: {
  domain?: string | null;
  website?: string | null;
}): string | null {
  const raw = opts.domain || opts.website;
  if (!raw) return null;
  return raw
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim() || null;
}
