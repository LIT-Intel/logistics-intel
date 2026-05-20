import Link from "next/link";
import Image from "next/image";
import { imgUrl } from "@/lib/sanityImage";
import { AuthorChip } from "./AuthorChip";

type Post = {
  _id?: string;
  title: string;
  slug: { current: string } | string;
  excerpt?: string;
  heroImage?: any;
  heroImageUrl?: string;
  heroImageAlt?: string;
  publishedAt?: string;
  readingTime?: number | string;
  author?: { name?: string; avatar?: any; role?: string } | null;
  categories?: Array<{ title?: string; color?: string } | null> | null;
};

function slugOf(s: Post["slug"]) {
  return typeof s === "string" ? s : s?.current;
}

/**
 * `BlogTrendingGrid` — 3-up "Trending" cards under the featured post on
 * the blog index. Each card carries a 16:10 image with a glassy
 * category overlay pill top-left, the headline, and a compact author
 * chip. Below the chevron section header pattern.
 */
export function BlogTrendingGrid({
  heading = "Trending",
  posts,
  viewAllHref = "/blog",
}: {
  heading?: string;
  posts: Post[];
  viewAllHref?: string;
}) {
  if (!posts.length) return null;
  return (
    <section className="px-5 sm:px-8 py-12 sm:py-16">
      <div className="mx-auto max-w-container">
        <div className="mb-6 flex items-center justify-between">
          <div className="font-display flex items-center gap-2 text-[20px] font-bold tracking-[-0.018em] text-ink-900">
            <span>{heading}</span>
            <span aria-hidden className="text-ink-200">›</span>
          </div>
          <Link
            href={viewAllHref}
            className="font-display text-[13px] font-semibold text-brand-blue-700 hover:text-brand-blue"
          >
            View all →
          </Link>
        </div>

        <div className="trending-grid">
          {posts.slice(0, 3).map((p) => {
            const slug = slugOf(p.slug);
            const heroSrc =
              imgUrl(p.heroImage, { width: 720 }) || p.heroImageUrl || null;
            const cat = p.categories?.[0];
            const avatarUrl = imgUrl(p.author?.avatar, { width: 64 });
            return (
              <Link key={p._id || slug} href={`/blog/${slug}`} className="trend-card">
                <div className="tc-image">
                  {heroSrc ? (
                    <Image
                      src={heroSrc}
                      alt={p.heroImageAlt || p.title}
                      fill
                      sizes="(min-width: 1024px) 360px, 100vw"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)",
                      }}
                    />
                  )}
                  {cat?.title && (
                    <span className="tc-overlay-pill">{cat.title}</span>
                  )}
                </div>
                <div className="tc-body">
                  <h3>{p.title}</h3>
                  {p.author?.name && (
                    <AuthorChip
                      name={p.author.name}
                      avatarUrl={avatarUrl}
                      variant="compact"
                    />
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
