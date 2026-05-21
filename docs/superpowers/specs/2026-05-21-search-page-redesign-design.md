# Search Page Redesign — Design

**Status:** Approved (2026-05-21)
**Page:** `/app/search` — the company-name search backed by our shipment intelligence database (NOT Pulse).
**File:** `frontend/src/pages/Search.tsx` (1,750 lines).

**Goal:** Upgrade the company-name search with (a) marketing-grade hero treatment using brand cyan + Space Grotesk display font, (b) typeahead autocomplete that lets users jump straight to a company's profile, and (c) a curated "popular shippers" grid below the search bar that doubles as a one-click demo experience.

---

## Background

Today's `/app/search`:
- **Input is company-name only.** Submit gated on `query.length >= 2`. Calls `searchShippers({ q: query })` which hits our shipment-intelligence backend and resolves to companies in `lit_company_index` / `lit_companies`.
- **No typeahead.** Users type, hit Enter, wait for results, click a row, finally land on the profile. Two extra round-trips and one extra screen for the common "I want to look up Tesla" case.
- **Placeholder reads "Search by company name…"** — functional but bland. The hero area is a small `<LitKpiStrip>` plus a thin form chrome. Doesn't read like the marketing site's confident brand language (cyan `#00F0FF`, Space Grotesk display).
- **No "browse" affordance.** First-time users staring at the page have no idea what to type. The page demands they already know a company name.

The marketing site uses a strong brand hero pattern — eyebrow pill, gradient-accented H1, glow-shadow CTA. That language doesn't appear on `/app/search`. This redesign closes that gap, adds typeahead, and adds a curated shipper grid that doubles as a demo affordance.

---

## What the page becomes

```
┌─────────────────────────────────────────────────────────────────┐
│  (existing breadcrumb / page chrome)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                    ┌── SEARCH ──┐                               │
│                    └────────────┘                               │
│                                                                 │
│         Find any company. View their trade picture.             │
│              ("any company" = gradient cyan→blue)               │
│                                                                 │
│       Search 1.4M+ shippers by name. See who they import        │
│       from, ship to, and how often.                             │
│                                                                 │
│    ┌───────────────────────────────────────────────────────┐    │
│    │ 🔍  Search by company name…                          │    │
│    │                                          Search →    │    │
│    └───────────────────────────────────────────────────────┘    │
│         ▼ on input ≥ 2 chars                                    │
│    ┌───────────────────────────────────────────────────────┐    │
│    │ 🏢 Tesla Inc.                           ↗            │    │
│    │    Palo Alto, CA · 12,847 shipments · Automotive     │    │
│    │ ──────────────────────────────────────────────────── │    │
│    │ 🏢 Tesla Energy                         ↗            │    │
│    │    Sparks, NV · 3,210 shipments · Energy             │    │
│    │ ──────────────────────────────────────────────────── │    │
│    │ ↓  Press Enter to search all results for "tes"       │    │
│    └───────────────────────────────────────────────────────┘    │
│                                                                 │
│           Popular shippers                                      │
│                                                                 │
│   ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐               │
│   │  🚗    │  │  🛒    │  │  🏠    │  │  📦    │               │
│   │ Tesla  │  │ Costco │  │ Home   │  │Walmart │               │
│   │        │  │        │  │ Depot  │  │        │               │
│   └────────┘  └────────┘  └────────┘  └────────┘               │
│   ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐               │
│   │  🍎    │  │  🚙    │  │  🌍    │  │  🚙    │               │
│   │ Apple  │  │  Ford  │  │ Nestlé │  │  BMW   │               │
│   └────────┘  └────────┘  └────────┘  └────────┘               │
│      ↑ click any tile → navigate to that company's profile      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component A — Hero block (above search)

**Replaces** the current top section of `Search.tsx` (look for the `<LitKpiStrip>` area + the form's outer container; insert this block immediately above the `<form>` element starting at line 1080).

**Visual spec:**

| Element | Class string |
|---|---|
| Container | `mx-auto mt-2 mb-6 max-w-3xl px-4 text-center` |
| Eyebrow pill | `inline-flex items-center gap-2 rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-cyan` — content: `SEARCH` |
| H1 | `font-display mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl lg:text-6xl` — content: `Find <em>any company</em>. View their trade picture.` |
| `<em>` inside H1 | `bg-[linear-gradient(90deg,#00F0FF_0%,#3b82f6_60%,#2563eb_100%)] bg-clip-text text-transparent not-italic` |
| Subhead | `font-body mt-5 max-w-2xl mx-auto text-base leading-relaxed text-ink-500 sm:text-lg` — content: `Search 1.4M+ shippers by name. See who they import from, ship to, and how often.` |

**Hidden on results state.** Once `searchPerformed === true` (or whatever the existing state flag is — find the var that gates hero vs results), hero collapses out. Search bar stays. Popular shippers grid is also hidden on results state.

---

## Component B — Search bar restyle (mid)

**Modify** the existing `<form>` element at `Search.tsx` line 1080 onward.

**Container changes:**
- Widen to match hero: `max-w-3xl mx-auto`
- Cyan focus state on the input wrapper: `focus-within:ring-2 focus-within:ring-brand-cyan/40 focus-within:shadow-glow-cyan`

**Submit button restyle** (line 1106–1109 — currently `bg-gradient-to-b from-blue-500 to-blue-600`):
- New class string: `font-display inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-cyan px-5 text-[13px] font-semibold text-dark-0 shadow-glow-cyan transition hover:bg-brand-cyan-dim disabled:cursor-not-allowed disabled:opacity-60`
- Keep the existing `Loader2` / `SearchIcon` swap logic on submit state.
- Keep the existing disabled gate (`query.length < 2`).

**Placeholder** (line 1089) — keep as "Search by company name…" (already correct for the API constraint).

---

## Component C — Typeahead dropdown (new)

**Mounted directly below the search input**, absolutely positioned, appears when `searchQuery.length >= 2`.

**Foundation:** Refactor the existing `frontend/src/components/search/AutocompleteInput.tsx` (already wired to `lit_company_index` with 300ms debounce — confirmed via repo audit) into a portal-rendered dropdown that overlays the existing Search.tsx input. Do **not** replace the existing input — overlay only.

**Data flow:**
1. `searchQuery` state already exists in `Search.tsx` (line 1090).
2. New `useDebounce` (250ms) hook wraps `searchQuery` to drive the typeahead lookup.
3. Lookup query (run via Supabase client, not the existing `searchShippers` API since that's a heavier backend call):
   ```sql
   SELECT id, company_name, country, city, total_shipments, primary_industry
     FROM lit_company_index
    WHERE company_name ILIKE $1
    ORDER BY total_shipments DESC NULLS LAST
    LIMIT 6
   ```
   where `$1 = ${q}%`.
4. Render up to 6 rows + one "fallback" row at the bottom: `↓ Press Enter to search all results for "${q}"`.

**Each row layout:**

```
┌──────────────────────────────────────────────────────────────┐
│ 🏢  Tesla Inc.                                  ↗           │
│     Palo Alto, CA · 12,847 shipments · Automotive           │
└──────────────────────────────────────────────────────────────┘
```

Tailwind:
- Row container: `flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-brand-cyan/5 aria-selected:bg-brand-cyan/10`
- Icon: `flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500` (lucide `Building2` icon)
- Name: `font-display text-sm font-semibold text-ink-900`
- Meta (under name): `font-body text-xs text-ink-500` — joined with `·`. Fields in order: `{city || country}` · `{total_shipments.toLocaleString()} shipments` · `{primary_industry || naics_label}`. Skip fields that are null/empty.
- Trailing arrow: `lucide ArrowUpRight h-4 w-4 text-slate-400` aligned right via `ml-auto`

**Keyboard navigation** (via cmdk — already installed at `frontend/src/components/ui/command.jsx`):
- ↑/↓ arrows move selection
- Enter on a selected row → `navigate('/app/companies/' + row.id)`
- Enter with no row selected (or with selection on the fallback row) → existing form submission → `handleSearch` runs `searchShippers({ q: query })` exactly as today
- Esc closes dropdown but preserves input value

**Click behavior:**
- Row click → `navigate('/app/companies/' + row.id)` — bypasses the full `searchShippers` call
- Profile page loads independently of any prior search (CompanyProfileV2 reads `lit_companies.id` directly)
- **Safe re: data pipeline**: The profile page already fetches its own shipment context via `getIyCompanyProfile` (internal helper name) when needed; we're not skipping that, just skipping the company-list step on `/app/search`

**Fallback row** (always last in the dropdown):
- `↓ Press Enter to search all results for "${q}"` — content
- Visually distinct: italics, `border-t border-slate-100`, subdued text color
- Selecting this and pressing Enter triggers the form's existing `handleSearch` exactly as today

---

## Component D — Popular shippers grid (below search)

**Replaces** any existing "browse" / "examples" / empty-state content that sits below the search bar on `Search.tsx` (audit needed: find what's there today; if nothing, simply insert this block).

**Visual spec:**

| Element | Class string |
|---|---|
| Section heading | `font-display mt-12 mb-4 text-center text-[13px] font-semibold uppercase tracking-[0.18em] text-ink-500` — content: `Popular shippers` |
| Grid container | `mx-auto grid max-w-3xl grid-cols-2 gap-3 px-4 sm:grid-cols-4` |
| Tile | `group flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-5 transition hover:border-brand-cyan/40 hover:shadow-glow-cyan` |
| Tile icon | `mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-brand-cyan/10 group-hover:text-brand-cyan-dim` — content: emoji OR `<CompanyAvatar />` if a logo URL is available, else `Building2` lucide icon |
| Tile name | `font-display text-[13px] font-semibold tracking-tight text-ink-900` |
| Tile meta (sub) | `font-body mt-1 text-[10.5px] text-ink-500` — content: industry or shipment count |

**Tile content source:** Hardcoded curated list of 8 well-known shippers for v1 (rationale: avoid a query latency on initial page paint; the list is unlikely to change often; gives us full control over which logos are shown). Stored in a const at the top of the Search.tsx file:

```typescript
const POPULAR_SHIPPERS: Array<{ id: string; name: string; emoji: string; industry: string }> = [
  { id: "<tesla-id>", name: "Tesla", emoji: "🚗", industry: "Automotive" },
  { id: "<costco-id>", name: "Costco", emoji: "🛒", industry: "Retail" },
  { id: "<home-depot-id>", name: "Home Depot", emoji: "🏠", industry: "Home & Garden" },
  { id: "<walmart-id>", name: "Walmart", emoji: "📦", industry: "Retail" },
  { id: "<apple-id>", name: "Apple", emoji: "🍎", industry: "Electronics" },
  { id: "<ford-id>", name: "Ford", emoji: "🚙", industry: "Automotive" },
  { id: "<nestle-id>", name: "Nestlé", emoji: "🌍", industry: "Food & Beverage" },
  { id: "<bmw-id>", name: "BMW", emoji: "🚙", industry: "Automotive" },
];
```

**ID resolution task during implementation:** Run a SQL lookup against `lit_company_index` for each of the 8 names; copy the resolved `id` values into the const. If a name doesn't resolve (e.g., "Home Depot" might be stored as "The Home Depot, Inc."), pick the best match by `total_shipments` rank. Document the chosen rows in the implementation plan.

**Click behavior:** `navigate('/app/companies/' + tile.id)` — same as typeahead row click.

**Hidden on results state.**

---

## Data + schema

**No new tables or columns.** Typeahead uses existing `lit_company_index` indexes (confirmed via prior audit: GIN trigram on `company_name`, btree on `total_shipments DESC`). Popular-shippers tiles are hardcoded.

**No migration needed.**

---

## Tailwind brand tokens

Audit step required as part of implementation: confirm these tokens exist in `frontend/tailwind.config.*`:
- `brand-cyan` (#00F0FF), `brand-cyan-dim` (#00c8d4)
- `ink-900` (#0b1220), `ink-500` (#475569)
- `dark-0` (#020617)
- `shadow-glow-cyan: '0 0 24px rgba(0, 240, 255, 0.35)'`
- `font-display: ['Space Grotesk', 'Outfit', 'system-ui']`

If any are missing, add them in a single config patch task. Reference: `marketing/tailwind.config.ts` has all of them.

---

## Out of scope (Phase 2+)

- Long-tail typeahead from `lit_company_directory` (26k rows) — would need a new trigram index
- Logo display in typeahead rows / shipper tiles (most `lit_company_index` rows don't have logo URLs)
- Recently-viewed shortcut row in typeahead (would need a new query against user activity history)
- Dynamic popular-shippers list (e.g., A/B testing, regional personalization)
- Mobile redesign — keep current responsive behavior; the new hero stacks naturally on small screens

---

## Acceptance criteria

A user can:
1. Land on `/app/search` and see the new hero (`SEARCH` eyebrow + gradient headline + subhead).
2. Type "tes" and see ≤6 company suggestions appear in <300ms, sorted by shipment volume.
3. Click "Tesla Inc." in the dropdown and arrive at `/app/companies/{tesla_id}` with the profile rendered (no `searchShippers` call made — verify in DevTools network tab).
4. Type "tesla" and press Enter — fallback row selected — original `handleSearch` fires, results list appears as today.
5. See the 8-tile "Popular shippers" grid below the search on empty state.
6. Click "Costco" tile and arrive at `/app/companies/{costco_id}`.
7. After running a search (path 4), see hero + popular-shippers grid collapse out; results list renders as today.

---

## File touch list

**New:**
- `frontend/src/features/search/SearchHero.tsx` — extracted hero block (eyebrow + H1 + subhead)
- `frontend/src/features/search/SearchTypeahead.tsx` — dropdown component (built on cmdk + AutocompleteInput pattern)
- `frontend/src/features/search/PopularShippers.tsx` — the 8-tile grid

**Modified:**
- `frontend/src/pages/Search.tsx` — wire in SearchHero (above search), SearchTypeahead (overlay), PopularShippers (below); restyle submit button to brand cyan; widen form container
- `frontend/tailwind.config.*` — add brand tokens if missing

**No backend changes.** No edge-function deploys. No migrations.
