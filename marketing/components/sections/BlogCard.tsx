import Link from "next/link";
import Image from "next/image";
import { blogCoverUrl, imgUrl } from "@/lib/sanityImage";
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
  author?: { name?: string; avatar?: any } | null;
  categories?: Array<{ title?: string; color?: string; slug?: any } | null> | null;
  tags?: Array<{ title?: string; slug?: any } | null> | null;
};

type Variant = "default" | "trending";

function slugOf(s: Post["slug"]) {
  return typeof s === "string" ? s : s?.current;
}

function safeFormat(iso?: string) {
  return iso ? formatDate(iso) : null;
}

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

function AuthorFace({
  avatarUrl,
  name,
  size = 24,
}: {
  avatarUrl: string | null;
  name?: string | null;
  size?: number;
}) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name || ""}
        width={size}
        height={size}
        className="rounded-full border border-ink-100 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="font-display flex items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: "#3B82F6",
        fontSize: Math.max(9, Math.round(size * 0.42)),
      }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

export function BlogCard({
  post,
  variant = "default",
  featured = false,
}: {
  post: Post;
  variant?: Variant;
  featured?: boolean;
}) {
  const slug = slugOf(post.slug);
  const trending = variant === "trending";
  const heroSrc = blogCoverUrl(post, featured ? 1280 : 900);
  const date = safeFormat(post.publishedAt);
  const cat = post.categories?.[0];
  const avatarUrl = imgUrl(post.author?.avatar, { width: 64 });

  return (
    <Link
      href={`/blog/${slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-[0_5px_15px_rgba(22,35,184,0.12)]"
    >
      <div className="relative aspect-[40/21] w-full overflow-hidden bg-[#0b1426]">
        {heroSrc && (
          <Image
            src={heroSrc}
            alt={post.heroImageAlt || post.title}
            fill
            sizes={
              trending
                ? "(min-width: 1024px) 360px, 100vw"
                : "(min-width: 1024px) 420px, 100vw"
            }
            className="object-cover"
          />
        )}
        {cat?.title && (
          <div className="absolute left-3 top-3">
            <CategoryChip
              label={cat.title}
              variant="card-overlay"
              color={cat.color || "#3B82F6"}
            />
          </div>
        )}
      </div>

      <div
        className={`flex flex-1 flex-col gap-2.5 ${
          trending ? "p-5" : "p-6"
        }`}
      >
        <h3
          className={`font-display ${
            trending ? "text-[16.5px]" : "text-[19px]"
          } font-semibold leading-snug tracking-[-0.012em] text-ink-900 group-hover:text-brand-blue-700 line-clamp-3`}
        >
          {post.title}
        </h3>

        {!trending && post.excerpt && (
          <p className="font-body text-[13.5px] leading-relaxed text-ink-500 line-clamp-2">
            {post.excerpt}
          </p>
        )}

        {!trending && Array.isArray(post.tags) && post.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {post.tags.slice(0, 2).map((t, i) => {
              if (!t?.title) return null;
              const tslug =
                (t.slug as any)?.current ||
                (typeof t.slug === "string" ? (t.slug as string) : null);
              return (
                <span
                  key={tslug || i}
                  className="font-mono inline-flex items-center rounded-[3px] bg-ink-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-ink-500"
                >
                  #{t.title}
                </span>
              );
            })}
          </div>
        )}

        <div className="font-body mt-auto flex items-center gap-2 pt-2 text-[12px] text-ink-500">
          <AuthorFace avatarUrl={avatarUrl} name={post.author?.name} size={24} />
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {post.author?.name && (
              <span className="font-display truncate text-[12.5px] font-semibold text-ink-700">
                {post.author.name}
              </span>
            )}
            {(date || post.readingTime) && (
              <span aria-hidden className="text-ink-200">·</span>
            )}
            {date && <span className="truncate">{date}</span>}
            {post.readingTime && (
              <>
                <span aria-hidden className="text-ink-200">·</span>
                <span className="whitespace-nowrap">
                  {post.readingTime} min read
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
