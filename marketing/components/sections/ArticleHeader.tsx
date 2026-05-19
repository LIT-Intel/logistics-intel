import Image from "next/image";
import { imgUrl } from "@/lib/sanityImage";
import { formatDate } from "@/lib/format";
import { CategoryChip } from "./CategoryChip";

type Post = {
  title: string;
  excerpt?: string;
  publishedAt?: string;
  readingTime?: number | string;
  author?: {
    name?: string;
    avatar?: any;
    isAiAgent?: boolean;
  } | null;
  categories?: Array<{ title?: string; color?: string } | null> | null;
  agentMetadata?: { draftedBy?: string } | null;
};

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

/**
 * Editorial article header — bracketed `[category]` chip, H1, optional
 * lede paragraph, and a single byline row (author face + name + date ·
 * read-time). Extracted from the inline header block on the old
 * `/blog/[slug]/page.tsx` so the slimmed article page can compose it
 * without the surrounding share-rail framing.
 */
export function ArticleHeader({ post }: { post: Post }) {
  const cat = post.categories?.[0];
  const avatarUrl = imgUrl(post.author?.avatar, { width: 96 });
  const authorName = post.author?.name;
  const date = post.publishedAt ? formatDate(post.publishedAt) : null;

  return (
    <header className="px-5 pt-4 pb-8 sm:px-8 sm:pt-8 sm:pb-10">
      <div className="mx-auto max-w-[880px]">
        {cat?.title && (
          <div>
            <CategoryChip
              label={cat.title}
              color={cat.color || "#3B82F6"}
            />
          </div>
        )}
        <h1
          className="font-display mt-5 font-semibold leading-[1.05] tracking-[-0.02em] text-ink-900"
          style={{ fontSize: "clamp(32px, 4.5vw, 52px)" }}
        >
          {post.title}
        </h1>
        {post.excerpt && (
          <p className="font-body mt-5 max-w-[720px] text-[16.5px] leading-relaxed text-ink-500">
            {post.excerpt}
          </p>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2">
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
          <div className="flex flex-wrap items-center gap-1.5 font-body text-[13px] text-ink-500">
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
      </div>
    </header>
  );
}
