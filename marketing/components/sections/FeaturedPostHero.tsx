import Link from "next/link";
import Image from "next/image";
import { imgUrl } from "@/lib/sanityImage";
import { formatDate } from "@/lib/format";
import { CategoryChip } from "./CategoryChip";

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
  author?: { name?: string; avatar?: any; isAiAgent?: boolean } | null;
  categories?: Array<{ title?: string; color?: string; slug?: any } | null> | null;
  agentMetadata?: { draftedBy?: string } | null;
};

function slugOf(s: Post["slug"]) {
  return typeof s === "string" ? s : s?.current;
}

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

/**
 * Single split-layout featured post card. Editorial anchor of the new
 * `/blog` page — replaces the old `BlogHeroTrio` 1+2 layout. Image on
 * the right (~45%) at 3:2 ratio with square corners, content on the
 * left (~55%) with a bracketed `[category]` chip, large Space Grotesk
 * H1, two-line excerpt, and a byline row (author face + name + date ·
 * read-time).
 */
export function FeaturedPostHero({ post }: { post: Post }) {
  if (!post) return null;
  const slug = slugOf(post.slug);
  const heroSrc =
    imgUrl(post.heroImage, { width: 1400 }) || post.heroImageUrl || null;
  const cat = post.categories?.[0];
  const date = post.publishedAt ? formatDate(post.publishedAt) : null;
  const avatarUrl = imgUrl(post.author?.avatar, { width: 96 });
  const authorName = post.author?.name;

  return (
    <Link
      href={`/blog/${slug}`}
      className="group block overflow-hidden rounded-b-2xl border border-ink-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-[0_5px_15px_rgba(22,35,184,0.12)]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] lg:gap-0">
        {/* Left — content column */}
        <div className="order-2 flex flex-col justify-center gap-5 p-7 sm:p-10 lg:order-1 lg:p-12">
          {cat?.title && (
            <div>
              <CategoryChip
                label={cat.title}
                color={cat.color || "#3B82F6"}
              />
            </div>
          )}
          <h1 className="font-display font-semibold leading-[1.05] tracking-[-0.02em] text-ink-900 group-hover:text-brand-blue-700"
              style={{ fontSize: "clamp(32px, 4.5vw, 52px)" }}>
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="font-body max-w-[560px] text-[15.5px] leading-relaxed text-ink-500 line-clamp-2">
              {post.excerpt}
            </p>
          )}
          {(authorName || date || post.readingTime) && (
            <div className="font-body flex items-center gap-3 text-[13px] text-ink-500">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={authorName || ""}
                  width={40}
                  height={40}
                  className="rounded-full border border-ink-100 object-cover"
                  style={{ width: 40, height: 40 }}
                />
              ) : (
                <div
                  className="font-display flex items-center justify-center rounded-full font-semibold text-white"
                  style={{
                    width: 40,
                    height: 40,
                    background: "#3B82F6",
                    fontSize: 14,
                  }}
                  aria-hidden
                >
                  {initials(authorName)}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {authorName && (
                  <span className="font-display text-[13.5px] font-semibold text-ink-900">
                    {authorName}
                  </span>
                )}
                {post.author?.isAiAgent && (
                  <CategoryChip label="AI Drafted" color="#7C3AED" />
                )}
                {date && (
                  <>
                    <span aria-hidden className="text-ink-200">·</span>
                    <span>{date}</span>
                  </>
                )}
                {post.readingTime && (
                  <>
                    <span aria-hidden className="text-ink-200">·</span>
                    <span>{post.readingTime} min read</span>
                  </>
                )}
                {post.agentMetadata?.draftedBy && (
                  <>
                    <span aria-hidden className="text-ink-200">·</span>
                    <span className="font-mono text-[11.5px] uppercase tracking-[0.04em] text-ink-500">
                      drafted by {post.agentMetadata.draftedBy}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right — image column (3:2). Square top corners on mobile and
            desktop alike. */}
        <div className="order-1 lg:order-2">
          <div className="relative aspect-[3/2] w-full bg-ink-25">
            {heroSrc ? (
              <Image
                src={heroSrc}
                alt={post.heroImageAlt || post.title}
                fill
                sizes="(min-width: 1024px) 560px, 100vw"
                className="object-cover"
                priority
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
        </div>
      </div>
    </Link>
  );
}
