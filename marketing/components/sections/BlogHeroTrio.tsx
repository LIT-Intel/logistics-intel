import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { imgUrl } from "@/lib/sanityImage";
import { formatDate } from "@/lib/format";

type Post = {
  _id?: string;
  title: string;
  slug: { current: string } | string;
  excerpt?: string;
  heroImage?: any;
  heroImageUrl?: string;
  publishedAt?: string;
  readingTime?: number | string;
  author?: { name?: string; avatar?: any } | null;
  categories?: Array<{ title?: string; color?: string } | null> | null;
};

function slugOf(s: Post["slug"]) {
  return typeof s === "string" ? s : s?.current;
}

/**
 * Blog hero trio — 1 large featured (left, ~2/3) + 2 stacked secondaries
 * (right, ~1/3). Matches the Revenue Vessel pattern. Server component;
 * no state needed.
 */
export function BlogHeroTrio({ posts }: { posts: Post[] }) {
  if (posts.length === 0) return null;
  const [main, ...rest] = posts;
  const secondaries = rest.slice(0, 2);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr] lg:gap-8">
      <FeaturedLargeCard post={main} />
      <div className="flex flex-col gap-6">
        {secondaries.map((p) => (
          <FeaturedStackedCard key={p._id || slugOf(p.slug)} post={p} />
        ))}
      </div>
    </div>
  );
}

function FeaturedLargeCard({ post }: { post: Post }) {
  const slug = slugOf(post.slug);
  const heroSrc = imgUrl(post.heroImage, { width: 1280 }) || post.heroImageUrl || null;
  const date = post.publishedAt ? formatDate(post.publishedAt) : null;
  const cat = post.categories?.[0];
  return (
    <Link
      href={`/blog/${slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
    >
      <div className="relative aspect-[16/9] w-full bg-ink-25 lg:aspect-[16/10]">
        {heroSrc ? (
          <Image
            src={heroSrc}
            alt={post.title}
            fill
            sizes="(min-width: 1024px) 760px, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            priority
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)" }}
          />
        )}
        {cat?.title && (
          <CategoryPill title={cat.title} color={cat.color} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-7 lg:p-8">
        <h2 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.018em] text-ink-900 group-hover:text-brand-blue-700 lg:text-[28px]">
          {post.title}
        </h2>
        {post.excerpt && (
          <p className="font-body text-[15px] leading-relaxed text-ink-500 line-clamp-3">
            {post.excerpt}
          </p>
        )}
        <MetaRow post={post} date={date} showReadMore />
      </div>
    </Link>
  );
}

function FeaturedStackedCard({ post }: { post: Post }) {
  const slug = slugOf(post.slug);
  const heroSrc = imgUrl(post.heroImage, { width: 640 }) || post.heroImageUrl || null;
  const date = post.publishedAt ? formatDate(post.publishedAt) : null;
  const cat = post.categories?.[0];
  return (
    <Link
      href={`/blog/${slug}`}
      className="group flex flex-1 flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
    >
      <div className="relative aspect-[16/9] w-full shrink-0 bg-ink-25">
        {heroSrc ? (
          <Image
            src={heroSrc}
            alt={post.title}
            fill
            sizes="(min-width: 1024px) 380px, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(160deg,#1E293B 0%,#0F172A 100%)" }}
          />
        )}
        {cat?.title && <CategoryPill title={cat.title} color={cat.color} />}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="font-display text-[17px] font-semibold leading-tight tracking-[-0.012em] text-ink-900 group-hover:text-brand-blue-700">
          {post.title}
        </h3>
        <MetaRow post={post} date={date} />
      </div>
    </Link>
  );
}

function CategoryPill({ title, color }: { title: string; color?: string }) {
  return (
    <div
      className="font-display absolute left-4 top-4 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white backdrop-blur"
      style={{ background: color ? `${color}D9` : "rgba(15,23,42,0.7)" }}
    >
      {title}
    </div>
  );
}

function MetaRow({
  post,
  date,
  showReadMore = false,
}: {
  post: Post;
  date: string | null;
  showReadMore?: boolean;
}) {
  return (
    <div className="font-body mt-auto flex items-center gap-2 pt-2 text-[12.5px] text-ink-500">
      {post.author?.name && <span>{post.author.name}</span>}
      {post.author?.name && date && <span aria-hidden>·</span>}
      {date && <span>{date}</span>}
      {post.readingTime && (
        <>
          <span aria-hidden>·</span>
          <span>{post.readingTime} min read</span>
        </>
      )}
      {showReadMore && (
        <span className="font-display ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-blue-700">
          Read story <ArrowRight className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );
}
