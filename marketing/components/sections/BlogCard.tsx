import Link from "next/link";
import Image from "next/image";
import { imgUrl } from "@/lib/sanityImage";
import { formatDate } from "@/lib/format";

type Post = {
  _id?: string;
  title: string;
  slug: { current: string } | string;
  excerpt?: string;
  heroImage?: any;
  heroImageUrl?: string;
  heroImageAlt?: string;
  publishedAt?: string;
  author?: { name?: string; avatar?: any } | null;
  categories?: Array<{ title?: string; color?: string } | null> | null;
};

function slugOf(s: Post["slug"]) {
  return typeof s === "string" ? s : s?.current;
}

function safeFormat(iso?: string) {
  return iso ? formatDate(iso) : null;
}

export function BlogCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  const slug = slugOf(post.slug);
  const heroSrc = imgUrl(post.heroImage, { width: featured ? 1280 : 720 }) || post.heroImageUrl || null;
  const date = safeFormat(post.publishedAt);
  const cat = post.categories?.[0];
  return (
    <Link
      href={`/blog/${slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-lg"
    >
      <div className={`relative w-full ${featured ? "aspect-[16/8]" : "aspect-[16/9]"} bg-ink-25`}>
        {heroSrc ? (
          <Image
            src={heroSrc}
            alt={post.title}
            fill
            sizes={featured ? "(min-width: 1024px) 720px, 100vw" : "(min-width: 1024px) 380px, 100vw"}
            className="object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(160deg,#0F172A 0%,#1E293B 100%)" }}
          />
        )}
        {cat?.title && (
          <div
            className="font-display absolute left-4 top-4 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white backdrop-blur"
            style={{ background: cat.color ? `${cat.color}D9` : "rgba(15,23,42,0.7)" }}
          >
            {cat.title}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-6">
        <h3 className={`font-display ${featured ? "text-[22px]" : "text-[18px]"} font-semibold leading-tight tracking-[-0.015em] text-ink-900 group-hover:text-brand-blue-700`}>
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="font-body text-[14px] leading-relaxed text-ink-500 line-clamp-3">
            {post.excerpt}
          </p>
        )}
        <div className="font-body mt-auto flex items-center gap-2 text-[12px] text-ink-200">
          {post.author?.name && <span>{post.author.name}</span>}
          {post.author?.name && date && <span aria-hidden>·</span>}
          {date && <span>{date}</span>}
        </div>
      </div>
    </Link>
  );
}
