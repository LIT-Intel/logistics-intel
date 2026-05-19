"use client";

import { useEffect, useMemo, useState } from "react";
import { BlogCard } from "./BlogCard";
import { CategoryChip } from "./CategoryChip";

type Post = {
  _id?: string;
  title: string;
  slug: { current: string } | string;
  excerpt?: string;
  heroImage?: any;
  heroImageUrl?: string;
  publishedAt?: string;
  readingTime?: number | string;
  author?: { name?: string; avatar?: any; isAiAgent?: boolean } | null;
  categories?: Array<{ title?: string; slug?: any; color?: string } | null> | null;
  tags?: Array<{ title?: string; slug?: any } | null> | null;
  agentMetadata?: { draftedBy?: string } | null;
};

/**
 * Brand-aligned per-category color. Keeps card chrome consistent across
 * the entire blog regardless of what editors type into Sanity. Unknown
 * categories fall through to the default LIT brand-blue.
 */
const CATEGORY_COLOR: Record<string, string> = {
  insights: "#2563EB",
  playbook: "#0891B2",
  playbooks: "#0891B2",
  product: "#7C3AED",
  "product-updates": "#7C3AED",
  news: "#DC2626",
  press: "#DC2626",
  "shipper-insights": "#0F766E",
  "trade-data": "#0F766E",
  education: "#CA8A04",
  freight: "#3B82F6",
  sales: "#3B82F6",
  outbound: "#3B82F6",
};

const DEFAULT_COLOR = "#3B82F6";

function catSlug(c: NonNullable<Post["categories"]>[number]): string | null {
  if (!c) return null;
  const slug = c.slug?.current ?? c.slug;
  return typeof slug === "string" ? slug : null;
}

function colorFor(slug: string | null) {
  if (!slug) return DEFAULT_COLOR;
  return CATEGORY_COLOR[slug] || DEFAULT_COLOR;
}

const PAGE_SIZE = 12;

type Variant = "default" | "trending";

/**
 * Filterable blog grid with bracketed-chip category filters + Load More
 * pagination. Pure client state — no server round-trips. Filter is by
 * category slug across the union of categories on each post. The grid
 * also reads `?category=<slug>` from `window.location` on mount so the
 * `/blog?category=<slug>` deep-links from `ExploreMoreTopics` resolve
 * automatically.
 */
export function BlogGrid({
  posts,
  variant = "default",
  showFilter = true,
  emptyState,
}: {
  posts: Post[];
  variant?: Variant;
  showFilter?: boolean;
  emptyState?: React.ReactNode;
}) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Pick up `?category=<slug>` on first mount so deep-links from
  // ExploreMoreTopics resolve. Only the first BlogGrid instance on the
  // page should read this — but reading it from every instance is
  // harmless because both share the same filter behavior.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const cat = params.get("category");
    if (cat) setActiveSlug(cat);
  }, []);

  const categories = useMemo(() => {
    const map = new Map<string, { slug: string; title: string }>();
    for (const p of posts) {
      for (const c of p.categories || []) {
        const s = catSlug(c);
        if (s && c?.title && !map.has(s)) map.set(s, { slug: s, title: c.title });
      }
    }
    return Array.from(map.values());
  }, [posts]);

  const filtered = useMemo(() => {
    if (!activeSlug) return posts;
    return posts.filter((p) =>
      (p.categories || []).some((c) => catSlug(c) === activeSlug),
    );
  }, [posts, activeSlug]);

  const visible = filtered.slice(0, visibleCount);
  const canLoadMore = visibleCount < filtered.length;

  function selectCategory(slug: string | null) {
    setActiveSlug(slug);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <>
      {showFilter && (
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip
            label="All"
            variant="filter"
            color="#0F172A"
            active={activeSlug === null}
            onClick={() => selectCategory(null)}
            count={posts.length}
          />
          {categories.map((c) => {
            const color = colorFor(c.slug);
            const count = posts.filter((p) =>
              (p.categories || []).some((cat) => catSlug(cat) === c.slug),
            ).length;
            return (
              <CategoryChip
                key={c.slug}
                label={c.title}
                variant="filter"
                color={color}
                active={activeSlug === c.slug}
                onClick={() => selectCategory(c.slug)}
                count={count}
              />
            );
          })}
        </div>
      )}

      <div
        className={
          showFilter
            ? "mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8"
            : "grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8"
        }
      >
        {visible.map((p) => (
          <BlogCard
            key={p._id || (typeof p.slug === "string" ? p.slug : p.slug.current)}
            post={p}
            variant={variant}
          />
        ))}
      </div>

      {filtered.length === 0 &&
        (emptyState || (
          <div className="mt-10 rounded-2xl border border-dashed border-ink-100 bg-white px-7 py-12 text-center">
            <div className="font-display text-[16px] font-semibold text-ink-900">
              No stories in this topic yet
            </div>
            <p className="font-body mx-auto mt-1.5 max-w-[440px] text-[13.5px] leading-relaxed text-ink-500">
              Nothing in this category yet. Try another, or browse all stories.
            </p>
          </div>
        ))}

      {canLoadMore && (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            className="font-display inline-flex h-11 items-center gap-2 rounded-xl border border-ink-100 bg-white px-6 text-[14px] font-semibold text-ink-900 shadow-sm transition hover:border-brand-blue/30 hover:bg-ink-25 hover:shadow-md"
          >
            Load more stories
            <span className="font-mono text-[11px] text-ink-500">
              {filtered.length - visible.length}
            </span>
          </button>
        </div>
      )}
    </>
  );
}
