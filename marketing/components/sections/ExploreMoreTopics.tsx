import { groq } from "next-sanity";
import { sanityClient } from "@/sanity/lib/client";
import { TopicTile } from "./TopicTile";

type Category = {
  _id?: string;
  title?: string;
  slug?: { current?: string };
};

const TOPICS_QUERY = groq`*[_type == "category" && defined(slug.current)] | order(title asc){
  _id, title, "slug": slug
}`;

/**
 * Hardcoded fallback for the topic tiles — used when Sanity has no
 * categories yet (fresh install / preview). Mirrors the 6 active blog
 * categories we ship with. Each label is editorial; the slug must match
 * a `category.slug.current` in Sanity for the `?category=` filter to
 * resolve correctly on the index page.
 */
const FALLBACK_TOPICS: Array<{ title: string; slug: string }> = [
  { title: "Freight", slug: "freight" },
  { title: "Sales", slug: "sales" },
  { title: "Trade data", slug: "trade-data" },
  { title: "Outbound", slug: "outbound" },
  { title: "Playbooks", slug: "playbooks" },
  { title: "Insights", slug: "insights" },
];

/**
 * `ExploreMoreTopics` — 3-col-at-lg / 2-col-at-md / 1-col-mobile grid
 * of `TopicTile`s. Each tile links to `/blog?category=<slug>` so the
 * existing client-side filter on `BlogGrid` picks the topic up without
 * needing a new route. Topics come from Sanity's category collection,
 * limited to the first six; falls back to a hardcoded set when none are
 * defined.
 */
export async function ExploreMoreTopics() {
  const cats = await sanityClient
    .fetch<Category[]>(TOPICS_QUERY)
    .catch(() => [] as Category[]);

  const fromSanity = (cats || [])
    .map((c) => ({
      title: c.title || "",
      slug: c.slug?.current || "",
    }))
    .filter((c) => c.title && c.slug)
    .slice(0, 6);

  const topics = fromSanity.length > 0 ? fromSanity : FALLBACK_TOPICS;

  return (
    <div>
      <div className="font-display mb-5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-500">
        Explore more topics
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {topics.map((t) => (
          <TopicTile
            key={t.slug}
            title={t.title}
            href={`/blog?category=${t.slug}`}
          />
        ))}
      </div>
    </div>
  );
}
