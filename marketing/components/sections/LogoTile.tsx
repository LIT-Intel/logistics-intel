/**
 * Brand logo tile — used on the /companies hub and the /companies/[slug]
 * profile page. Two image sources:
 *
 *   1. logo.dev — sharp brand logos (256x256 PNGs); requires a free token.
 *      Set NEXT_PUBLIC_LOGO_DEV_TOKEN in Vercel and we'll prefer this.
 *   2. Google's favicon CDN — fallback that works without a token. Lower
 *      quality but free + no signup.
 *
 * Falls back to a two-letter initials monogram when no domain is known.
 */

const LOGO_DEV_TOKEN = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;

function logoUrl(domain: string, size: number): string {
  if (LOGO_DEV_TOKEN) {
    return `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=${size * 2}&format=png&retina=true`;
  }
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

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden border border-ink-100 bg-white ${cls}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl(domain, px)}
        alt={`${name} logo`}
        width={px}
        height={px}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-[80%] w-[80%] object-contain"
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