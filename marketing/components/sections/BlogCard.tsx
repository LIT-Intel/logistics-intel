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
  tags?: Array<{ title?: string; slug?: any } | null> | null;
  agentMetadata?: { draftedBy?: string } | null;
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

/**
 * Renders an author face — either the Sanity avatar (24px circle) or a
 * brand-blue initials fallback. Used in the card footer byline.
 */
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

/**
 * Blog card — image-top with square top corners + rounded bottom on the
 * surrounding card. Bracketed `[category]` chip overlays the image. The
 * `trending` variant compresses the card (smaller image, no excerpt) for
 * the rows below the first one on the index page.
 */
export function BlogCard({
  post,
  variant = "default",
  featured = false,
}: {
  post: Post;
  variant?: Variant;
  /** @deprecated kept for back-compat — `variant` should be used. */
  featured?: boolean;
}) {
  const slug = slugOf(post.slug);
  const trending = variant === "trending";
  const heroSrc =
    imgUrl(post.heroImage, { width: featured ? 1280 : 720 }) ||
    post.heroImageUrl ||
    null;
  const date = safeFormat(post.publishedAt);
  const cat = post.categories?.[0];
  const avatarUrl = imgUrl(post.author?.avatar, { width: 64 });

  return (
    <Link
      href={`/blog/${slug}`}
      className="group flex flex-col overflow-hidden rounded-b-2xl border border-ink-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-[0_5px_15px_rgba(22,35,184,0.12)]"
    >
      <div
        className={`relative w-full bg-ink-25 ${
          trending ? "aspect-[3/2]" : "aspect-[3/2]"
        }`}
        style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
      >
        {heroSrc ? (
          <Image
            src={heroSrc}
            alt={post.heroImageAlt || post.title}
            fill
            sizes={
              trending
                ? "(min-width: 1024px) 300px, 100vw"
                : "(min-width: 1024px) 380px, 100vw"
            }
            className="object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)" }}
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

        {/* Tag row — small ink-50 chips. Only the first 2 to avoid overflow. */}
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

        {/* Footer byline — author face + name + date · read-time */}
        <div className="font-body mt-auto flex items-center gap-2 pt-2 text-[12px] text-ink-500">
          <AuthorFace avatarUrl={avatarUrl} name={post.author?.name} size={24} />
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {post.author?.name && (
              <span className="font-display truncate text-[12.5px] font-semibold text-ink-700">
                {post.author.name}
              </span>
            )}
            {post.author?.isAiAgent && (
              <CategoryChip label="AI Drafted" color="#7C3AED" />
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

        {post.agentMetadata?.draftedBy && (
          <div className="font-mono -mt-1 text-[10px] uppercase tracking-[0.05em] text-ink-200">
            drafted by {post.agentMetadata.draftedBy}
          </div>
        )}
      </div>
    </Link>
  );
}
