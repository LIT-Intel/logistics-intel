import Link from "next/link";
import { groq } from "next-sanity";
import { sanityClient } from "@/sanity/lib/client";
import { Hash } from "lucide-react";

type Category = {
  _id?: string;
  title?: string;
  slug?: { current?: string };
  postCount?: number;
};

const TOPICS_QUERY = groq`*[_type == "category" && defined(slug.current)]{
  _id, title, "slug": slug,
  "postCount": count(*[_type == "blogPost" && references(^._id) && defined(publishedAt)])
} | order(title asc)`;

const FALLBACK_TOPICS: Array<{ title: string; slug: string; postCount?: number }> = [
  { title: "Freight", slug: "freight" },
  { title: "Sales", slug: "sales" },
  { title: "Trade data", slug: "trade-data" },
  { title: "Outbound", slug: "outbound" },
  { title: "Playbooks", slug: "playbooks" },
  { title: "Insights", slug: "insights" },
];

/**
 * `TopicExplorer` — 6 glossy topic tiles in a 3-col grid. Each tile is
 * a `.topic-tile-glossy` with a dark 52×52 icon square (cyan glow OK
 * here because the icon square IS a dark surface) and label + post
 * count. Replaces the lighter `ExploreMoreTopics` rail on /blog while
 * keeping the same data source. Pulls live post counts from Sanity.
 */
export async function TopicExplorer({
  heading = "Explore by topic",
}: {
  heading?: string;
}) {
  const cats = await sanityClient
    .fetch<Category[]>(TOPICS_QUERY)
    .catch(() => [] as Category[]);

  const fromSanity = (cats || [])
    .map((c) => ({
      title: c.title || "",
      slug: c.slug?.current || "",
      postCount: c.postCount,
    }))
    .filter((c) => c.title && c.slug)
    .slice(0, 6);

  const topics = fromSanity.length > 0 ? fromSanity : FALLBACK_TOPICS;

  return (
    <section className="px-5 sm:px-8 py-16 sm:py-20">
      <div className="mx-auto max-w-container">
        <div className="font-display mb-6 text-[12px] font-bold uppercase tracking-[0.12em] text-ink-500">
          {heading}
        </div>
        <div className="topic-grid">
          {topics.map((t) => (
            <Link
              key={t.slug}
              href={`/blog?category=${t.slug}`}
              className="topic-tile-glossy"
            >
              <div className="tt-icon">
                <Hash className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <div className="tt-label">{t.title}</div>
                <div className="tt-count">
                  {typeof t.postCount === "number"
                    ? `${t.postCount} ${t.postCount === 1 ? "post" : "posts"}`
                    : "Browse"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
