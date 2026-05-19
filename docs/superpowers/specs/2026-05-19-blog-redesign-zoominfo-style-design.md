# Blog redesign — ZoomInfo-style layout, LIT brand

**Date:** 2026-05-19
**Owner:** Valesco / Logistic Intel
**Surface:** `logisticintel.com/blog` (marketing site)
**Status:** Design approved, ready for implementation plan

---

## 1. Goal

Upgrade `/blog` and `/blog/[slug]` to feel like a modern editorial SaaS blog (pattern-matched on `pipeline.zoominfo.com`) while keeping LIT's existing brand colors, typography, and the rest of the marketing site untouched. Replace ad-hoc structure with a small set of reusable components, surface schema fields the current UI ignores, and add a recurring lead-magnet slot.

**Non-goals**
- No site-wide rebrand
- No new pillar pages (Phase 2)
- No inline newsletter capture (Phase 2)
- No URL changes — SEO surface preserved

---

## 2. Decisions locked during brainstorm

| Decision | Choice | Reason |
|---|---|---|
| Brand match depth | Match layout + components only, keep LIT brand | Cheapest brand risk; rest of site is consistent |
| List-page core blocks | FeaturedPostHero, CategoryChip row, redesigned PostCard | Highest-impact visual signatures |
| List-page growth blocks | ReportPromoBanner, ExploreMoreTopics tile grid | Lead-magnet + SEO surface |
| List-page skips | Inline newsletter, Customer Proof Strip | Newsletter opted out; keep existing ShipperInsightsRow |
| Article page | Mirror ZoomInfo bare style | Strip TOC, related grid, related glossary, in-article promos |
| Topic tile targets | `/blog?category=<slug>` (no pillar pages) | Ships without new SEO pages; pillar pages are a Phase 2 project |
| Ship strategy | Big bang, one merge | Marketing site, URL structure unchanged, Vercel preview as gate |

---

## 3. Page architecture

### 3.1 `/blog` (list page) — top to bottom

1. **Site header** — unchanged
2. **Breadcrumb** — unchanged
3. **`FeaturedPostHero`** — single split-layout card. Image right (~3:2 ratio, square top corners), content left: bracketed `[category]` chip, H1 (~48–56px Space Grotesk), 2-line excerpt, byline with author face + name + date · read-time. Selection driven by Sanity `featured` flag (currently ignored).
4. **`CategoryChipRow`** — square bracketed pills `[freight] [sales] [trade-data] [outbound]` in LIT blue. Replaces the rounded Lucide-icon pill row. Filters the grid below via existing client logic.
5. **`BlogGrid` (row 1)** — 3-col at lg / 2 at md / 1 mobile. PostCard anatomy: image-top (3:2, square top corners), bracketed category chip, headline, 1-line excerpt, author face + name + date · read-time at footer.
6. **`ReportPromoBanner`** — full-width light-surface band (`#F8F9FF`), headline + body + dark "Download report" button + asset cover image right. Inserted after the **first row of the grid** (the first 3 cards at desktop, 2 at md, 1 on mobile). Driven by a new `featuredReport` Sanity singleton. When `active=false`, the banner does not render.
7. **`BlogGrid` (remaining rows)** — rows 2+ use a compressed `trending` variant of PostCard (smaller image, no excerpt).
8. **`ShipperInsightsRow`** — unchanged.
9. **`ExploreMoreTopics`** — 3×2 text-only `TopicTile` grid. Each tile links `/blog?category=<slug>`.
10. **`CtaBanner`** — unchanged (current Subscribe / Book a demo).
11. **Footer** — unchanged.

### 3.2 `/blog/[slug]` (article page) — ZoomInfo bare style

1. **Breadcrumb** — unchanged
2. **`ArticleHeader`** (new component, extracted from inline JSX in `[slug]/page.tsx`) — bracketed `[category]` chip, H1, byline (author face + name + date · read-time)
3. **Hero image** — full-width `max-w-1100`, **square corners** (override current `rounded-3xl`)
4. **`ProseShell` body** — unchanged structurally, but `* * *` editorial dividers replace default H2 separators
5. **`InArticleDemoCta`** — single-button CTA card inserted ~1 screen into the body. Hardcoded copy ("See LIT on your real lanes → Book a demo"). Not CMS-driven (consistency over flexibility).
6. **Author bio card** — avatar + name + role + 2-line bio + social links (all in Sanity already)
7. **Bottom share row** — unchanged

**Removed from current article page:**
- Left-rail floating SocialShare
- Related Posts 3-col grid
- Related Glossary 2-col grid
- "Try this in LIT" 3-feature promo
- Post-CTA gradient (blue→cyan) card

**Risk tracked:** stripping Related Posts removes a re-entry surface. If pageviews-per-session drops materially in the 2 weeks after launch, the related-posts grid is a Phase 2 add-back.

---

## 4. Component spec

| Component | New / Restyle | Key props | Notes |
|---|---|---|---|
| `FeaturedPostHero` | Restyle (replaces `BlogHeroTrio`) | `post: BlogPostPreview` | Single card. Image right, content left. Bracketed chip, H1, byline. |
| `CategoryChip` | New | `label: string`, `href?: string`, `variant?: 'chip' \| 'filter' \| 'card-overlay'`, `category: { slug, color? }` | Reusable square bracketed pill. LIT-blue bg `#3B82F6`, white text, 4–6px radius, monospace-feel letter-spacing. |
| `BlogCard` | Restyle | `post: BlogPostPreview`, `variant?: 'default' \| 'trending'` | Image-top (3:2, square top corners), bracketed chip, headline, excerpt (1-line in `trending`), author face + name + date · read-time footer. |
| `ReportPromoBanner` | New | `report: FeaturedReport` (Sanity singleton) | Light surface `#F8F9FF`, headline + body + dark CTA button + cover image right. Returns `null` when `report.active === false`. |
| `TopicTile` | New | `title: string`, `href: string` | Text-only large tile, title + right-arrow icon, ghost border, hover lifts. |
| `ExploreMoreTopics` | New | `topics: Array<{ title, href }>` | 3×2 grid of `TopicTile`. Topics hardcoded to the 6 active blog categories. |
| `ArticleHeader` | New (extract) | `post: BlogPostFull` | Lifts the inline header JSX from `[slug]/page.tsx` into its own component. Uses bracketed chip, simplified byline. |
| `InArticleDemoCta` | New | (none — hardcoded copy) | Single-button card. Inserted between paragraphs ~1 screen into the body. |

`BlogHeroTrio.tsx` is **deleted** after `FeaturedPostHero` lands.

---

## 5. Visual style — minimal additions to existing brand

Inherits from `marketing/tailwind.config.ts`. No font changes, no color changes to existing surfaces. New additions:

| Token | Value | Where used |
|---|---|---|
| Bracketed chip radius | `4px` | `CategoryChip` |
| Bracketed chip bg | `#3B82F6` (LIT brand-blue) | `CategoryChip` default variant |
| Card image corners | square top, rounded bottom (override `rounded-2xl` on the image only) | `BlogCard`, `FeaturedPostHero` |
| `surface-tint` | `#F8F9FF` | `ReportPromoBanner` only |
| Card hover shadow | `0 5px 15px rgba(22, 35, 184, 0.12)` | `BlogCard` hover state |
| Editorial divider | `* * *` rendered as centered muted glyph | Article body between H2 sections |

Fonts unchanged: Space Grotesk (headlines, `--font-display`) + DM Sans (body, `--font-body`).
Colors unchanged: LIT blue `#3B82F6`, cyan `#00F0FF`, ink scale, card surfaces.
Border radii on non-overridden surfaces unchanged.

---

## 6. Data model — Sanity adds

Two additions, both non-breaking.

### 6.1 `featuredReport` (new singleton)

```ts
{
  name: 'featuredReport',
  type: 'document',
  fields: [
    { name: 'headline',   type: 'string',  validation: required, max 80 },
    { name: 'body',       type: 'text',    rows: 3, max 200 },
    { name: 'ctaLabel',   type: 'string',  default: 'Download report' },
    { name: 'ctaUrl',     type: 'url',     validation: required },
    { name: 'coverImage', type: 'image',   options: { hotspot: true } },
    { name: 'active',     type: 'boolean', default: false },
  ],
}
```

Singleton — exactly one row. When `active === false`, `ReportPromoBanner` returns `null`.

### 6.2 `category.iconSlug` (optional addition to existing `category` schema)

Single string field, optional. Reserved for Phase 2 if we want named icons on topic tiles. **Added now but unused in MVP** — adding it during this migration avoids a second schema PR when Phase 2 lands. The field is left empty on every category until then.

### 6.3 Schema fields surfaced (no schema change, just UI)

Already in the schema but currently ignored on `/blog`:
- `featured` (bool) → drives `FeaturedPostHero` selection (replacing current date-slice)
- `tags[]` → small chip row under post excerpts on cards
- `author.avatar` → shown on all grid cards (currently only on `BlogHeroTrio`)
- `readingTime` → shown on all grid cards (currently only on `BlogHeroTrio`)
- `author.isAiAgent` → "AI Drafted" chip on cards (currently only on article page)
- `agentMetadata.draftedBy` → byline annotation when present

---

## 7. File structure

```
marketing/
├── app/blog/
│   ├── page.tsx                         (rewritten — orchestrates new components)
│   └── [slug]/page.tsx                  (slimmed — extracts ArticleHeader, removes stripped sections)
├── components/sections/
│   ├── FeaturedPostHero.tsx             (NEW — replaces BlogHeroTrio.tsx, which is DELETED)
│   ├── CategoryChip.tsx                 (NEW)
│   ├── BlogCard.tsx                     (RESTYLED — adds variant prop, author face, read-time)
│   ├── BlogGrid.client.tsx              (lightly touched — uses new CategoryChip in filter row, passes variant to BlogCard)
│   ├── ReportPromoBanner.tsx            (NEW)
│   ├── TopicTile.tsx                    (NEW)
│   ├── ExploreMoreTopics.tsx            (NEW — composes TopicTile)
│   ├── ArticleHeader.tsx                (NEW — extracted)
│   └── InArticleDemoCta.tsx             (NEW)
├── sanity/schemas/
│   ├── featuredReport.ts                (NEW singleton)
│   └── category.ts                      (one optional `iconSlug` field added, no migration needed)
└── lib/blog/
    └── queries.ts                       (touched — GROQ adds `tags`, `agentMetadata`, ensures `author.avatar` + `readingTime` on the index query)
```

---

## 8. Ship strategy

Single merge to `main` of the `marketing/` directory. Process:

1. Implement on a branch (`marketing/blog-redesign-zoominfo`)
2. Vercel preview deploy auto-built on push
3. Eyeball preview URL — desktop + mobile, both `/blog` and one inner post
4. Publish the `featuredReport` singleton in Sanity with `active=true` (or leave `active=false` to ship without the banner first)
5. Merge → marketing site rebuilds and deploys

URL structure unchanged. No redirects, no SEO migration.

---

## 9. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Stripping Related Posts hurts pageviews-per-session | Track GA for 2 weeks; Phase 2 add-back is a small lift |
| `featuredReport` singleton empty on launch | `active=false` default + `null` return makes the banner safely invisible |
| `featured` flag not yet set on any post → FeaturedPostHero has no input | GROQ fallback: if no `featured=true` post exists, use the most recent post (matches current behavior) |
| Topic tile links to `/blog?category=<slug>` with no posts → empty grid | Implementation plan verifies `BlogGrid` has an empty state; if not, adds one ("No posts in this topic yet — browse all stories →") |
| Visual regression on mobile (3:2 image ratio + square corners change card height) | Vercel preview eyeball on 375px width before merge |
| Author face missing on older posts | GROQ returns null when avatar absent; `BlogCard` renders a 2-letter initials circle as fallback (LIT-blue bg, white text — implementation builds the fallback if no existing utility exists on the marketing site) |

---

## 10. Out of scope (Phase 2)

- Inline newsletter capture on `/blog`
- Customer Proof Strip (forwarder testimonials with quoted metrics)
- 6 pillar pages (`/freight/ocean`, `/freight/air`, `/freight/fcl`, `/freight/lcl`, `/freight/bco`, `/freight/nvocc`)
- Related Posts add-back on article page (conditional on pageviews-per-session drop)
- Reading-progress bar + sticky right-rail demo CTA on article page
- Named icons on `TopicTile` (via the optional `category.iconSlug` field)

---

## 11. Acceptance criteria

The redesign ships when, on Vercel preview:

- `/blog` renders top-to-bottom in the order listed in §3.1
- A featured post (or fallback to most recent) renders in `FeaturedPostHero` with the bracketed `[category]` chip
- Category filter row uses bracketed chips, not rounded pills
- Every grid card shows: image, bracketed chip, headline, excerpt, author face + name, date · read-time
- `ReportPromoBanner` renders when `featuredReport.active=true` and is invisible otherwise
- `ExploreMoreTopics` shows 6 tiles linking to `/blog?category=<slug>`
- `ShipperInsightsRow` and `CtaBanner` still render
- `/blog/[slug]` renders without TOC, related posts, related glossary, or "Try this in LIT" promo
- Hero image on article page has square corners
- `InArticleDemoCta` renders inline ~1 screen into the body
- No URL changes; existing post URLs resolve unchanged
- Lighthouse Performance score for `/blog` ≥ 70 on the Vercel preview (no specific regression budget — current baseline measured during implementation and recorded in the plan)
