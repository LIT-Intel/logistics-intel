# Search Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/app/search` (`frontend/src/pages/Search.tsx`) with a marketing-grade hero, a typeahead dropdown that jumps users straight to a company profile, and an 8-tile "Popular shippers" grid below the search bar — all using the LIT marketing brand language (`brand-cyan #00F0FF`, Space Grotesk display font, `shadow-glow-cyan`).

**Architecture:** Three new presentational components composed into the existing `Search.tsx`. Typeahead queries the existing `lit_company_index` table directly via supabase-js (300ms debounce, cmdk for keyboard nav). Popular-shipper tiles are hardcoded with pre-resolved company IDs. No backend changes. One Tailwind config patch to add the brand tokens that exist in `marketing/tailwind.config.ts` but not in `frontend/tailwind.config.js`.

**Tech Stack:** React 18 + Vite + TypeScript, Tailwind CSS, lucide-react icons, cmdk (already installed via shadcn/ui at `frontend/src/components/ui/command.jsx`), `@supabase/supabase-js` (already wired at `@/lib/supabase`), `react-router-dom` (`useNavigate`).

**Spec:** [docs/superpowers/specs/2026-05-21-search-page-redesign-design.md](../specs/2026-05-21-search-page-redesign-design.md)

**Branch policy:** All work stays on `claude/review-dashboard-deploy-3AmMD` per the existing branch lock memory.

---

## File Structure

### New files
- `frontend/src/features/search/SearchHero.tsx` — eyebrow pill + gradient H1 + subhead block
- `frontend/src/features/search/SearchTypeahead.tsx` — cmdk-powered dropdown that overlays the existing input
- `frontend/src/features/search/PopularShippers.tsx` — 8-tile grid with hardcoded shipper roster

### Modified files
- `frontend/tailwind.config.js` — add brand tokens (`brand-cyan`, `ink-*`, `font-display`, `shadow-glow-cyan`)
- `frontend/src/pages/Search.tsx` — wire in the three new components, restyle submit button, widen form container

---

## Pre-resolved data

**8 popular shippers** (resolved against `lit_company_index` during plan-writing — `company_id` slug + actual stored name; tasks use these literally):

| Display name | `company_id` | Stored `company_name` | Shipments | Industry |
|---|---|---|---|---|
| Samsung | `samsung-electronics-america` | Samsung Electronics America | 623,237 | Electronics |
| Amazon | `amazon-logistics` | Amazon Logistics | 331,277 | E-commerce |
| Costco | `costco-wholesale-canada` | Costco Wholesale Canada | 228,094 | Retail |
| Adidas | `adidas-international-trade` | Adidas International Trade | 149,886 | Apparel |
| Nike | `nike-usa` | Nike Usa | 139,634 | Apparel |
| Walmart | `walmart-601-n-walton-blvd` | Walmart 601 N Walton Blvd | 125,341 | Retail |
| Ford | `ford-motor` | Ford Motor | 47,866 | Automotive |
| BMW | `bmw-of-north-america` | Bmw Of North America | 26,071 | Automotive |

Click navigation target for every tile: `/app/companies/{company_id}` (the existing CompanyProfileV2 route).

**Important schema note** — `lit_company_index` does NOT have an `industry` column. The typeahead row meta line uses what IS in the table: `{city || country} · {total_shipments.toLocaleString()} shipments`. Industry shown on the popular-shippers tiles comes from the hardcoded const, not the DB.

---

## Task 1: Add brand tokens to Tailwind config

**Files:**
- Modify: `frontend/tailwind.config.js` (currently 95 lines; the `theme.extend.colors` block ends around line 70)

- [ ] **Step 1: Read the existing file**

Run:
```bash
cat frontend/tailwind.config.js
```
Expected: file exports a module with `theme.extend.colors` containing `intel`, `background`, `foreground`, etc. NO `brand-*`, `ink-*`, `dark-0`, `font-display`, or `shadow-glow-cyan` entries exist (verified during plan-writing).

- [ ] **Step 2: Add the missing tokens inside `theme.extend`**

Open `frontend/tailwind.config.js`. Inside the `extend: { … }` object, add to `colors` (next to the existing `intel` entry) and add new `boxShadow` and `fontFamily` siblings at the same depth. Result fragment (paste into the right place — match indentation):

```js
colors: {
  intel: {
    DEFAULT: '#23135b',
    dark: '#1a0f45',
    light: '#EDE9FE'
  },
  // Brand tokens mirrored from marketing/tailwind.config.ts so the
  // in-app pages can use the marketing-site visual language.
  'brand-cyan': '#00F0FF',
  'brand-cyan-dim': '#00c8d4',
  'brand-blue': '#3b82f6',
  'brand-blue-600': '#2563eb',
  'brand-blue-700': '#1d4ed8',
  'brand-violet': '#8b5cf6',
  'brand-indigo': '#6366f1',
  'ink-900': '#0b1220',
  'ink-700': '#1e293b',
  'ink-500': '#475569',
  'ink-100': '#e5ebf5',
  'dark-0': '#020617',
  // ... existing background/foreground/card/etc entries continue
```

Add to the same `extend` block (as siblings of `colors`, `keyframes`, `animation`):

```js
fontFamily: {
  display: ['"Space Grotesk"', 'Outfit', 'system-ui', 'sans-serif'],
  body: ['"DM Sans"', 'system-ui', 'sans-serif'],
},
boxShadow: {
  'glow-cyan': '0 0 24px rgba(0, 240, 255, 0.35)',
  'glow-cyan-strong': '0 0 32px rgba(0, 240, 255, 0.55)',
},
```

The full edited file should still be valid JS — module.exports with one trailing `}` at the bottom.

- [ ] **Step 3: Verify the Vite dev server picks up the new tokens**

Vite reads tailwind.config.js at build time. To confirm the tokens compile, run a quick build:
```bash
cd frontend && npx tailwindcss -i src/index.css -o /tmp/tw-verify.css --content "<div class='bg-brand-cyan shadow-glow-cyan font-display text-ink-900'></div>" 2>&1 | tail -5
```
Expected: completes with no "class not found" warnings. Output file (we discard it) contains `.bg-brand-cyan { background-color: #00F0FF }` and similar rules.

If `tailwindcss` CLI isn't on PATH, skip step 3 and rely on the dev server validating via the next task.

- [ ] **Step 4: Confirm Space Grotesk + DM Sans fonts are loaded**

```bash
grep -nE "Space Grotesk|DM Sans|fonts.googleapis|@import.*fonts" frontend/index.html frontend/src/index.css 2>/dev/null | head -10
```

If NO results, add Google Fonts link to `frontend/index.html` `<head>` (find the existing `<link rel="icon">` and add near it):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
```

If results show fonts already loaded, skip this sub-step.

- [ ] **Step 5: Commit**

```bash
git add frontend/tailwind.config.js frontend/index.html
git commit -m "feat(search): add brand tokens to frontend tailwind config

Mirrors marketing/tailwind.config.ts so the in-app pages can use the
marketing-site visual language:
- brand-cyan / brand-cyan-dim / brand-blue / brand-violet / brand-indigo
- ink-900 / ink-700 / ink-500 / ink-100
- dark-0
- font-display (Space Grotesk), font-body (DM Sans)
- shadow-glow-cyan, shadow-glow-cyan-strong

Adds Google Fonts link if not already present so Space Grotesk and
DM Sans render correctly in dev + prod builds."
```

---

## Task 2: SearchHero component

**Files:**
- Create: `frontend/src/features/search/SearchHero.tsx`

- [ ] **Step 1: Create the directory if needed**

```bash
mkdir -p frontend/src/features/search
```

- [ ] **Step 2: Create SearchHero.tsx**

Paste this verbatim into `frontend/src/features/search/SearchHero.tsx`:

```tsx
// SearchHero — marketing-grade hero block for /app/search.
//
// Pattern mirrors marketing/components/LeadMagnetHero:
//   - SEARCH eyebrow pill in brand-cyan
//   - Space Grotesk display H1 with a gradient-highlighted phrase
//   - DM Sans subhead, max-w-2xl centered
//
// Render only when `showHero` is true. Search.tsx hides this once a
// search has been submitted so the results list has full vertical room.

type Props = {
  showHero: boolean;
};

export default function SearchHero({ showHero }: Props) {
  if (!showHero) return null;
  return (
    <div className="mx-auto mt-2 mb-6 max-w-3xl px-4 text-center">
      <span
        className="inline-flex items-center gap-2 rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-cyan"
      >
        Search
      </span>
      <h1 className="font-display mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
        Find{" "}
        <em className="not-italic bg-[linear-gradient(90deg,#00F0FF_0%,#3b82f6_60%,#2563eb_100%)] bg-clip-text text-transparent">
          any company
        </em>
        . View their trade picture.
      </h1>
      <p className="font-body mt-5 max-w-2xl mx-auto text-base leading-relaxed text-ink-500 sm:text-lg">
        Search 1.4M+ shippers by name. See who they import from, ship
        to, and how often.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Verify type checks**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "SearchHero|features/search" | head -5
```
Expected: zero output (no type errors related to the new file). Pre-existing errors in `src/pages/Resources.jsx` are unrelated; ignore.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/search/SearchHero.tsx
git commit -m "feat(search): SearchHero component

Eyebrow pill + Space Grotesk gradient H1 + DM Sans subhead.
Pure presentational; renders only when showHero=true so the
parent can collapse it after a search has been submitted."
```

---

## Task 3: SearchTypeahead component

**Files:**
- Create: `frontend/src/features/search/SearchTypeahead.tsx`

This is the heaviest task in the plan. It builds the cmdk dropdown that overlays the existing input.

- [ ] **Step 1: Read the existing cmdk wrapper conventions**

```bash
grep -n "from \"cmdk\"\|export" frontend/src/components/ui/command.jsx 2>/dev/null | head -10
```
Expected: confirms `frontend/src/components/ui/command.jsx` exports `Command`, `CommandInput`, `CommandList`, `CommandItem`, `CommandEmpty`, etc. wrapping the `cmdk` package.

If `cmdk` import path differs from `cmdk` directly, adjust the import in step 2 accordingly.

- [ ] **Step 2: Create SearchTypeahead.tsx**

Paste this verbatim into `frontend/src/features/search/SearchTypeahead.tsx`:

```tsx
// SearchTypeahead — cmdk-powered dropdown overlay for /app/search.
//
// Renders absolutely beneath the search input. Fires a debounced
// (250ms) lookup against lit_company_index for company_name prefix
// matches. Click any row OR Enter on a selected row navigates to
// /app/companies/{id} — bypasses the full searchShippers call.
//
// Fallback row at the bottom: "Press Enter to search all results for
// 'q'" routes to the parent's existing form submission.

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ArrowUpRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

type CompanyIndexRow = {
  company_id: string;
  company_name: string;
  city: string | null;
  country: string | null;
  total_shipments: number | null;
};

type Props = {
  /** Current value of the search input (controlled by parent). */
  query: string;
  /** True when input is focused — controls whether the dropdown is shown. */
  isOpen: boolean;
  /** Fires when the user selects the fallback row (or presses Enter on no selection).
   *  Parent should run its existing handleSearch. */
  onFallbackSubmit: () => void;
  /** Fires when the dropdown should close (Esc key, blur). */
  onClose: () => void;
};

export default function SearchTypeahead({
  query,
  isOpen,
  onFallbackSubmit,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const [rows, setRows] = React.useState<CompanyIndexRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const trimmed = query.trim();
  const showDropdown = isOpen && trimmed.length >= 2;

  // Debounced lookup. 250ms feels snappy without flooding the DB on
  // every keystroke. lit_company_index has a GIN trigram index on
  // company_name so ILIKE 'prefix%' returns in <50ms.
  React.useEffect(() => {
    if (trimmed.length < 2) {
      setRows([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const { data, error } = await supabase
        .from("lit_company_index")
        .select("company_id, company_name, city, country, total_shipments")
        .ilike("company_name", `${trimmed}%`)
        .order("total_shipments", { ascending: false, nullsFirst: false })
        .limit(6);
      if (!error && data) setRows(data as CompanyIndexRow[]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [trimmed]);

  // Reset selection when results change.
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [rows.length]);

  // Keyboard nav: ↑/↓ to move, Enter to select, Esc to close.
  // Bound at the window level since the parent's <input> already owns focus.
  React.useEffect(() => {
    if (!showDropdown) return;
    const totalItems = rows.length + 1; // +1 for the fallback row
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % totalItems);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + totalItems) % totalItems);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex < rows.length) {
          navigate(`/app/companies/${rows[selectedIndex].company_id}`);
        } else {
          onFallbackSubmit();
        }
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showDropdown, rows, selectedIndex, navigate, onFallbackSubmit, onClose]);

  if (!showDropdown) return null;

  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
      {loading && rows.length === 0 && (
        <div className="px-4 py-3 text-xs text-ink-500">Searching…</div>
      )}
      {!loading && rows.length === 0 && (
        <div className="px-4 py-3 text-xs text-ink-500">
          No matches yet. Keep typing or press Enter to search markets.
        </div>
      )}
      <ul role="listbox" className="max-h-[400px] overflow-y-auto">
        {rows.map((r, i) => {
          const meta = [
            r.city || r.country,
            r.total_shipments
              ? `${r.total_shipments.toLocaleString()} shipments`
              : null,
          ]
            .filter(Boolean)
            .join(" · ");
          const selected = i === selectedIndex;
          return (
            <li
              key={r.company_id}
              role="option"
              aria-selected={selected}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => navigate(`/app/companies/${r.company_id}`)}
              className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition ${
                selected ? "bg-brand-cyan/10" : "hover:bg-brand-cyan/5"
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                <Building2 size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm font-semibold text-ink-900 truncate">
                  {r.company_name}
                </div>
                {meta && (
                  <div className="font-body text-xs text-ink-500 truncate">
                    {meta}
                  </div>
                )}
              </div>
              <ArrowUpRight size={16} className="ml-auto mt-1 text-slate-400" />
            </li>
          );
        })}
        {rows.length > 0 && (
          <li
            role="option"
            aria-selected={selectedIndex === rows.length}
            onMouseEnter={() => setSelectedIndex(rows.length)}
            onClick={onFallbackSubmit}
            className={`flex cursor-pointer items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-xs italic transition ${
              selectedIndex === rows.length
                ? "bg-brand-cyan/10 text-ink-900"
                : "text-ink-500 hover:bg-brand-cyan/5"
            }`}
          >
            <span className="text-slate-400">↓</span>
            Press Enter to search all results for "{trimmed}"
          </li>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "SearchTypeahead|features/search" | head -10
```
Expected: zero errors. If you see "Cannot find module 'cmdk'" — ignore, we're not importing cmdk directly in this file (we built keyboard nav manually since the parent already owns the input focus).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/search/SearchTypeahead.tsx
git commit -m "feat(search): SearchTypeahead component

Absolute-positioned dropdown overlay. Debounced (250ms) prefix-match
lookup against lit_company_index, top 6 rows by total_shipments.
Each row shows name + city/country + shipment count, clicks navigate
to /app/companies/{id} bypassing the full search call. Fallback row
at the bottom preserves the original handleSearch path."
```

---

## Task 4: PopularShippers component

**Files:**
- Create: `frontend/src/features/search/PopularShippers.tsx`

- [ ] **Step 1: Create PopularShippers.tsx**

Paste this verbatim into `frontend/src/features/search/PopularShippers.tsx`:

```tsx
// PopularShippers — 8-tile grid below the search bar on /app/search.
//
// Hardcoded list of well-known shippers in lit_company_index.
// company_ids were resolved at plan-writing time against the actual
// table (see plan doc for the resolution). Click any tile → navigate
// to that company's profile.
//
// Hidden on results state — parent passes showGrid=false once a
// search has been submitted.

import { useNavigate } from "react-router-dom";
import {
  Car,
  ShoppingCart,
  ShoppingBag,
  Package,
  Smartphone,
  Truck,
  type LucideIcon,
} from "lucide-react";

type Shipper = {
  id: string;            // lit_company_index.company_id
  displayName: string;   // clean brand name for the tile
  industry: string;
  Icon: LucideIcon;
};

// Eight shippers resolved against lit_company_index (volume rank desc
// within each name match). Industries are hardcoded since
// lit_company_index doesn't carry an industry column.
const POPULAR_SHIPPERS: Shipper[] = [
  { id: "samsung-electronics-america", displayName: "Samsung",  industry: "Electronics", Icon: Smartphone },
  { id: "amazon-logistics",            displayName: "Amazon",   industry: "E-commerce",  Icon: Package },
  { id: "costco-wholesale-canada",     displayName: "Costco",   industry: "Retail",      Icon: ShoppingCart },
  { id: "adidas-international-trade",  displayName: "Adidas",   industry: "Apparel",     Icon: ShoppingBag },
  { id: "nike-usa",                    displayName: "Nike",     industry: "Apparel",     Icon: ShoppingBag },
  { id: "walmart-601-n-walton-blvd",   displayName: "Walmart",  industry: "Retail",      Icon: ShoppingCart },
  { id: "ford-motor",                  displayName: "Ford",     industry: "Automotive",  Icon: Car },
  { id: "bmw-of-north-america",        displayName: "BMW",      industry: "Automotive",  Icon: Car },
];

type Props = {
  showGrid: boolean;
};

export default function PopularShippers({ showGrid }: Props) {
  const navigate = useNavigate();
  if (!showGrid) return null;
  return (
    <div className="mx-auto mt-12 max-w-3xl px-4">
      <div className="font-display mb-4 text-center text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-500">
        Popular shippers
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {POPULAR_SHIPPERS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => navigate(`/app/companies/${s.id}`)}
            className="group flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-5 transition hover:border-brand-cyan/40 hover:shadow-glow-cyan"
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-brand-cyan/10 group-hover:text-brand-cyan-dim">
              <s.Icon size={22} />
            </div>
            <div className="font-display text-[13px] font-semibold tracking-tight text-ink-900">
              {s.displayName}
            </div>
            <div className="font-body mt-1 text-[10.5px] text-ink-500">
              {s.industry}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "PopularShippers|features/search" | head -5
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/search/PopularShippers.tsx
git commit -m "feat(search): PopularShippers component

8-tile grid (2x4 on desktop, 2x4 stacked on mobile). Hardcoded
roster of well-known shippers resolved at plan time against
lit_company_index. Click → navigate to /app/companies/{id}.
Hidden when parent passes showGrid=false."
```

---

## Task 5: Wire components into Search.tsx + restyle submit button

**Files:**
- Modify: `frontend/src/pages/Search.tsx`

This is where the three new components compose into the existing page. Smallest possible touch — keep existing state, handleSearch, results-list rendering all intact.

- [ ] **Step 1: Add imports + a focus-state ref**

Find the existing imports block at the top of `frontend/src/pages/Search.tsx` (line 1–~40). Add these three imports:

```tsx
import SearchHero from "@/features/search/SearchHero";
import SearchTypeahead from "@/features/search/SearchTypeahead";
import PopularShippers from "@/features/search/PopularShippers";
```

Inside the `Search()` component body (find where `searchQuery` is defined around line 1090), add new state right next to it:

```tsx
const [inputFocused, setInputFocused] = React.useState(false);
```

- [ ] **Step 2: Determine the page-state flag**

`SearchHero` and `PopularShippers` need to hide when a search has been submitted. Find the existing flag in `Search.tsx` that flips after `handleSearch` fires — likely `searched`, `hasSearched`, `searchPerformed`, or derived from `results.length > 0`. Grep:
```bash
grep -nE "searched|hasSearched|searchPerformed|companies.length\s*>" frontend/src/pages/Search.tsx | head -10
```
Use whatever flag the file already has. If multiple candidates exist, prefer the one set inside `handleSearch` itself.

For the rest of this task we'll refer to that flag as `<HERO_HIDDEN>` — substitute the real var name when writing the JSX. If no flag exists, derive one inline: `const heroVisible = !searching && companies.length === 0 && !searchInitiated;` (use whatever locals the file has).

- [ ] **Step 3: Render SearchHero above the existing form**

Find the existing form at `Search.tsx` line ~1080: `<form onSubmit={handleSearch} className="…">`. Immediately BEFORE that form, insert:

```tsx
<SearchHero showHero={!<HERO_HIDDEN>} />
```

(Substitute the real flag.) The form's existing container styling stays as-is.

- [ ] **Step 4: Widen the form to match hero width + add focus-within glow**

The form opens at line 1080-1083:
```tsx
<form
  onSubmit={handleSearch}
  className="overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-3.5"
>
```

Wrap it in a `<div className="relative mx-auto max-w-3xl">` so the hero, form, and typeahead all align to the same 3xl width — and so the absolutely-positioned typeahead has the right reference point. Add `focus-within:ring-2 focus-within:ring-brand-cyan/40 focus-within:shadow-glow-cyan transition` to the form's own className. Result:

```tsx
<div className="relative mx-auto max-w-3xl">
  <form
    onSubmit={handleSearch}
    className="overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] focus-within:ring-2 focus-within:ring-brand-cyan/40 focus-within:shadow-glow-cyan transition sm:p-3.5"
  >
    {/* … existing form contents UNCHANGED … */}
  </form>
  <SearchTypeahead
    query={searchQuery}
    isOpen={inputFocused}
    onFallbackSubmit={() => {
      setInputFocused(false);
      handleSearch(new Event("submit") as unknown as React.FormEvent);
    }}
    onClose={() => setInputFocused(false)}
  />
</div>
```

Note: `handleSearch` signature today is `(e: React.FormEvent) => …`. Calling it with a synthetic Event works because the inner code only calls `e.preventDefault?.()`. If you find handleSearch crashes on the synthetic event, fall back to extracting the search-firing logic into a helper `runSearch(q: string)` and call THAT from both the form's onSubmit and the typeahead fallback.

- [ ] **Step 5: Wire focus tracking on the input**

Find the existing input at line 1087-1093:
```tsx
<input
  type="text"
  placeholder="Search by company name…"
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  className="font-body h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-10 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
/>
```

Add `onFocus` + `onBlur` handlers and update the focus-ring color to brand-cyan:

```tsx
<input
  type="text"
  placeholder="Search by company name…"
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  onFocus={() => setInputFocused(true)}
  onBlur={() => {
    // Delay so click handlers inside SearchTypeahead can fire before
    // the dropdown unmounts.
    setTimeout(() => setInputFocused(false), 150);
  }}
  className="font-body h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-10 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-brand-cyan focus:outline-none focus:ring-2 focus:ring-brand-cyan/20"
/>
```

- [ ] **Step 6: Restyle the submit button**

Find the existing submit button at line 1106-1109:
```tsx
<button
  type="submit"
  disabled={!authReady || searchQuery.length < 2 || searching}
  className="font-display inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-blue-500 to-blue-600 px-5 text-[13px] font-semibold text-white shadow-sm transition hover:from-blue-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
>
```

Replace the className with the brand-cyan version (keep everything else — disabled state, icon-swap children, etc.):

```tsx
<button
  type="submit"
  disabled={!authReady || searchQuery.length < 2 || searching}
  className="font-display inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-brand-cyan px-5 text-[13px] font-semibold text-dark-0 shadow-glow-cyan transition hover:bg-brand-cyan-dim disabled:cursor-not-allowed disabled:opacity-60"
>
```

- [ ] **Step 7: Render PopularShippers below the form**

Immediately AFTER the closing `</div>` of the form wrapper (the `<div className="relative mx-auto max-w-3xl">` from step 4), insert:

```tsx
<PopularShippers showGrid={!<HERO_HIDDEN>} />
```

(Substitute the same hero-state flag.) If there's existing "examples"/"recent searches" content currently below the form, leave it intact for now — PopularShippers complements, doesn't replace. The spec marks hiding/removing that content as Phase 2.

- [ ] **Step 8: Type-check the whole file**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "Search\.tsx|features/search" | head -20
```
Expected: zero errors related to Search.tsx or the new feature files. Pre-existing errors elsewhere in the repo are unrelated.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/Search.tsx
git commit -m "feat(search): wire SearchHero + SearchTypeahead + PopularShippers into /app/search

- Hero block renders above the form on empty state, hides after search
- Form widened to max-w-3xl, gains brand-cyan focus-within ring + glow
- Submit button restyled from blue gradient to brand-cyan with shadow-glow-cyan
- Input gets onFocus/onBlur tracking + brand-cyan focus ring
- Typeahead dropdown overlays beneath the input (250ms debounce, ≤6 rows)
- Clicking a typeahead row navigates straight to /app/companies/{id}
  — bypasses the full searchShippers call
- Press Enter on the fallback row runs the original handleSearch path
- 8-tile PopularShippers grid renders below the form on empty state,
  hides after search

No backend changes, no migrations, no removed features."
```

---

## Task 6: Manual UI verification

**Files:** none modified — pure manual validation in the running app.

This task is the smoke + acceptance check. The user runs this themselves; the engineer just provides the dev-server bootstrap commands.

- [ ] **Step 1: Boot the dev server**

```bash
cd frontend && npm run dev
```
Expected: Vite reports `Local: http://localhost:5173`. No console errors related to brand-cyan, font-display, or the new component imports.

- [ ] **Step 2: Visual acceptance — empty state**

Navigate to `http://localhost:5173/app/search` (after logging in). Verify in order:

1. **Eyebrow pill** — small cyan "SEARCH" capsule, top of the page, centered.
2. **H1** — large Space Grotesk: `Find any company. View their trade picture.` "any company" reads with a cyan→blue gradient (not flat blue).
3. **Subhead** — DM Sans, slate-ink-500, max ~640px wide, centered.
4. **Search input** — single line, ~3xl wide, focus state shows cyan ring + a soft cyan glow shadow (not the previous blue).
5. **Submit button** — solid cyan `#00F0FF`, dark text `#020617`, glow shadow. Reads "Search →".
6. **Popular shippers** — 8 tiles in a 2×4 grid on desktop (2×4 stacked on mobile). Names: Samsung, Amazon, Costco, Adidas, Nike, Walmart, Ford, BMW. Hover any tile = cyan border + glow.

If any element looks wrong, file a follow-up issue and pause.

- [ ] **Step 3: Typeahead acceptance**

1. Click the search input. Type `te`.
2. Within ~300ms a dropdown appears below the input with up to 6 rows. Each row shows: name (Space Grotesk, bold), and below it `{city or country} · {N} shipments`.
3. Press the ↓ arrow key. The first row highlights (cyan tint).
4. Press Enter. Browser navigates to `/app/companies/{first-row-id}`.
5. Open DevTools Network tab BEFORE pressing Enter. Confirm the click did NOT trigger a `searchShippers` / `/functions/v1/searchLeads` request — only the company-profile data fetch fires.
6. Hit back button. Type `xyzlskjdf` (no matches). Dropdown shows "No matches yet" empty state. Press Enter. Original `handleSearch` fires — results list renders as today (likely "0 results" or similar).

- [ ] **Step 4: Popular shippers acceptance**

1. On the empty state, click the "Samsung" tile.
2. Browser navigates to `/app/companies/samsung-electronics-america`.
3. The CompanyProfileV2 page renders with Samsung's data (shipment timeline, top routes, etc. — whatever the existing profile shows for that ID).
4. Hit back. Confirm popular-shippers grid is still visible.

- [ ] **Step 5: Results-state collapse acceptance**

1. Type "tesla" in the search box.
2. Either press Enter (the fallback row in the typeahead, OR the form's submit button since typeahead doesn't auto-suggest Tesla in the first 6 hits with the messy stored names).
3. Page transitions to results state.
4. Verify: Hero (eyebrow + H1 + subhead) is HIDDEN. Popular shippers grid is HIDDEN. Search input + results list are visible. Existing results behavior unchanged.

- [ ] **Step 6: Cleanup commit (only if any tweaks needed)**

If any visual tweak surfaced during manual testing (spacing, color, sizing), fix it and commit:
```bash
git add <fixed-files>
git commit -m "fix(search): polish from manual UI test"
```

If everything passed cleanly, skip this step — no empty commit.

---

## Out of scope (intentionally not in Phase 1)

- Logos on typeahead rows or popular-shipper tiles (most `lit_company_index` rows don't have logo URLs)
- "Recently viewed" personalized strip above the popular shippers
- Mobile-specific redesign — current changes are responsive but desktop-first
- A/B testing different popular-shipper rosters
- Long-tail typeahead from `lit_company_directory` (would need new trigram index)
- Cleaning up the messy stored `company_name` values (e.g., "Walmart 601 N Walton Blvd") — that's a data-quality task separate from this redesign
- Removing the existing prompt-categories or example-prompts content that may sit below the form today (PopularShippers complements; full replacement is a separate scope-tightening pass)
