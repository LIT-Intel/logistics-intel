import { groq } from "next-sanity";
import { sanityClient } from "@/sanity/lib/client";
import { imgUrl } from "@/lib/sanityImage";

/**
 * Canonical LIT team authors used by /solutions, /customers, /vs as
 * the voices in the `QuoteGrid` "from the LIT team" cards. Slugs are
 * the source of truth — the Sanity `author` document with the matching
 * `slug.current` supplies avatar + role + bio. When a doc is missing
 * (fresh install / not yet published) the `AuthorChip` falls back to
 * brand-blue initials, so the page still renders gracefully.
 */
export const LIT_TEAM_SLUGS = [
  "gabriel-reyes",
  "jennifer-okafor",
  "nikki-patel",
] as const;
export type LitTeamSlug = (typeof LIT_TEAM_SLUGS)[number];

const TEAM_AUTHORS_QUERY = groq`*[_type == "author" && slug.current in $slugs]{
  "slug": slug.current, name, role, avatar
}`;

export type TeamAuthor = {
  slug: LitTeamSlug;
  name: string;
  role: string;
  avatarUrl: string | null;
};

const FALLBACKS: Record<LitTeamSlug, { name: string; role: string }> = {
  "gabriel-reyes": { name: "Gabriel Reyes", role: "Head of Freight Intelligence" },
  "jennifer-okafor": { name: "Jennifer Okafor", role: "VP Revenue Operations" },
  "nikki-patel": { name: "Nikki Patel", role: "Product Marketing Lead" },
};

/**
 * Fetch the three canonical LIT team authors as a slug-keyed map.
 * Never throws — failures fall through to the hardcoded fallback so
 * the marketing pages always render even when Sanity is unreachable.
 */
export async function fetchTeamAuthors(): Promise<Record<LitTeamSlug, TeamAuthor>> {
  let raw: any[] = [];
  try {
    raw = (await sanityClient.fetch(TEAM_AUTHORS_QUERY, {
      slugs: LIT_TEAM_SLUGS as unknown as string[],
    })) || [];
  } catch {
    raw = [];
  }

  const out = {} as Record<LitTeamSlug, TeamAuthor>;
  for (const slug of LIT_TEAM_SLUGS) {
    const fallback = FALLBACKS[slug];
    const sanityDoc = raw.find((r) => r.slug === slug);
    out[slug] = {
      slug,
      name: sanityDoc?.name || fallback.name,
      role: sanityDoc?.role || fallback.role,
      avatarUrl: imgUrl(sanityDoc?.avatar, { width: 96 }) || null,
    };
  }
  return out;
}
