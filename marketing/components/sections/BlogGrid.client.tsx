"use client";

import { useMemo, useState } from "react";
import {
  Sparkles,
  TrendingUp,
  Building2,
  Compass,
  Megaphone,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import { BlogCard } from "./BlogCard";

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
  categories?: Array<{ title?: string; slug?: any; color?: string } | null> | null;
};

/**
 * Brand-aligned category palette + iconography. Keeps card chrome
 * consistent across the entire blog regardless of what Sanity editors
 * type in. Unknown categories fall through to the default styling.
 */
const CATEGORY_STYLE: Record<string, { color: string; icon: LucideIcon }> = {
  insights: { color: "#2563EB", icon: TrendingUp },
  playbook: { color: "#0891B2", icon: Compass },
  playbooks: { color: "#0891B2", icon: Compass },
  product: { color: "#7C3AED", icon: Sparkles },
  "product-updates": { color: "#7C3AED", icon: Sparkles },
  news: { color: "#DC2626", icon: Megaphone },
  press: { color: "#DC2626", icon: Megaphone },
  "shipper-insights": { color: "#0F766E", icon: Building2 },
  "trade-data": { color: "#0F766E", icon: Building2 },
  education: { color: "#CA8A04", icon: GraduationCap },
};

const DEFAULT_STYLE = { color: "#2563EB", icon: Sparkles };

function catSlug(c: NonNullable<Post["categories"]>[number]): string | null {
  if (!c) return null;
  const slug = c.slug?.current ?? c.slug;
  return typeof slug === "string" ? slug : null;
}

function styleFor(slug: string | null) {
  if (!slug) return DEFAULT_STYLE;
  return CATEGORY_STYLE[slug] || DEFAULT_STYLE;
}

const PAGE_SIZE = 12;

/**
 * Filterable blog grid with category pills + Load More pagination.
 * Pure client state — no server round-trips. Filter is by category slug
 * across the union of categories on each post.
 */
export function BlogGrid({ posts }: { posts: Post[] }) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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
    return posts.filter((p) => (p.categories || []).some((c) => catSlug(c) === activeSlug));
  }, [posts, activeSlug]);

  const visible = filtered.slice(0, visibleCount);
  const canLoadMore = visibleCount < filtered.length;

  function selectCategory(slug: string | null) {
    setActiveSlug(slug);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <CategoryPill
          label="All stories"
          icon={Sparkles}
          color="#0F172A"
          active={activeSlug === null}
          onClick={() => selectCategory(null)}
          count={posts.length}
        />
        {categories.map((c) => {
          const s = styleFor(c.slug);
          const count = posts.filter((p) => (p.categories || []).some((cat) => catSlug(cat) === c.slug)).length;
          return (
            <CategoryPill
              key={c.slug}
              label={c.title}
              icon={s.icon}
              color={s.color}
              active={activeSlug === c.slug}
              onClick={() => selectCategory(c.slug)}
              count={count}
            />
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
        {visible.map((p) => (
          <BlogCard key={p._id || (typeof p.slug === "string" ? p.slug : p.slug.current)} post={p} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-ink-100 bg-white px-7 py-12 text-center">
          <div className="font-display text-[16px] font-semibold text-ink-900">No stories yet</div>
          <p className="font-body mx-auto mt-1.5 max-w-[440px] text-[13.5px] leading-relaxed text-ink-500">
            Nothing in this category yet. Try another, or browse all stories.
          </p>
        </div>
      )}

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

function CategoryPill({
  label,
  icon: Icon,
  color,
  active,
  onClick,
  count,
}: {
  label: string;
  icon: LucideIcon;
  color: string;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "font-display group inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-semibold transition-all " +
        (active
          ? "border-transparent text-white shadow-[0_4px_14px_rgba(15,23,42,0.18)]"
          : "border-ink-100 bg-white text-ink-700 hover:-translate-y-0.5 hover:shadow-md")
      }
      style={active ? { background: color } : undefined}
    >
      <Icon
        className="h-3.5 w-3.5 transition-transform group-hover:scale-110"
        aria-hidden
        style={active ? undefined : { color }}
      />
      <span>{label}</span>
      <span
        className={
          "font-mono rounded-full px-1.5 py-0.5 text-[10px] font-bold " +
          (active ? "bg-white/20 text-white" : "bg-ink-50 text-ink-500")
        }
      >
        {count}
      </span>
    </button>
  );
}
