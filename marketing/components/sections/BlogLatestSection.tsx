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
  author?: { name?: string; avatar?: any; role?: string } | null;
  categories?: Array<{ title?: string; color?: string } | null> | null;
};

function slugOf(s: Post["slug"]) {
  return typeof s === "string" ? s : s?.current;
}

/**
 * `BlogLatestSection` — "Latest" section: 2-up large cards on top
 * followed by a hairline divider and a 4-up dense grid below. Single
 * component handles both bands so the divider can render cleanly only
 * when both populations exist.
 */
export function BlogLatestSection({
  heading = "Latest",
  posts,
  viewAllHref = "/blog",
}: {
  heading?: string;
  posts: Post[];
  viewAllHref?: string;
}) {
  if (!posts.length) return null;
  const large = posts.slice(0, 2);
  const dense = posts.slice(2, 6);

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

        {large.length > 0 && (
          <div className="latest-2up">
            {large.map((p) => {
              const slug = slugOf(p.slug);
              const heroSrc =
                imgUrl(p.heroImage, { width: 1080 }) || p.heroImageUrl || null;
              const cat = p.categories?.[0];
              const avatarUrl = imgUrl(p.author?.avatar, { width: 64 });
              return (
                <Link key={p._id || slug} href={`/blog/${slug}`} className="post-large">
                  <div className="pl-image">
                    {heroSrc ? (
                      <Image
                        src={heroSrc}
                        alt={p.heroImageAlt || p.title}
                        fill
                        sizes="(min-width: 900px) 50vw, 100vw"
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
                    {cat?.title && <span className="pl-overlay-pill">{cat.title}</span>}
                  </div>
                  <div className="pl-body">
                    <h3>{p.title}</h3>
                    {p.excerpt && <p className="line-clamp-2">{p.excerpt}</p>}
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
        )}

        {dense.length > 0 && (
          <div className="latest-dense-grid">
            {dense.map((p) => {
              const slug = slugOf(p.slug);
              const heroSrc =
                imgUrl(p.heroImage, { width: 480 }) || p.heroImageUrl || null;
              const avatarUrl = imgUrl(p.author?.avatar, { width: 48 });
              return (
                <Link key={p._id || slug} href={`/blog/${slug}`} className="post-dense">
                  <div className="pd-image">
                    {heroSrc ? (
                      <Image
                        src={heroSrc}
                        alt={p.heroImageAlt || p.title}
                        fill
                        sizes="(min-width: 1024px) 25vw, (min-width: 540px) 50vw, 100vw"
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
                  </div>
                  <div className="pd-body">
                    <h4>{p.title}</h4>
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
        )}
      </div>
    </section>
  );
}
