# Pulse Explorer — V6-style Sales Intel Surface

**Status:** Design approved 2026-06-16
**Owner:** LIT Pulse workstream
**Source brainstorm:** DSV "Sales Explorer V6" (Revenue Vessel) + existing LIT Pulse AI search
**Target spec for implementation plan:** writing-plans

---

## 1. Purpose

Upgrade the LIT Pulse page into a visual, map-first intel surface modeled on DSV's Sales Explorer V6 while preserving and fusing it with our existing Pulse AI natural-language search.

The current Pulse page is a search-results-list experience. Users type a query, get rows, save companies to lists. It works but it doesn't surface **patterns** (where is the concentration?), **opportunities** (who should I go after first?), or **workflow context** (which of these are mine vs. net-new?).

The Explorer adds a map-first surface where the same accounts are colored, sized, clustered, and scored — and where the user can filter, select, and act on accounts at the speed of a hand-wave.

### Differentiation: Pulse vs. Command Center

Two distinct surfaces, two distinct purposes — call this out everywhere in copy:

- **Pulse = "Discover & explore the shipper market."** Map, filter chips, KPI strip, account table. Optimized for asking questions about the market. Data here can be the broad CSV-merged-with-live snapshot.
- **Command Center = "Work your accounts."** Company profile, contacts, campaigns, activity, freight history, financials. Optimized for working an account once it's been picked. Data here MUST be fresh.

The bridge between them is the per-account **Open in Command Center** action on the right-rail PulseQuickCard, which (a) fires an ImportYeti refresh as a side effect of the navigation and (b) routes to the existing CC route.

---

## 2. Architectural decisions (locked)

| # | Decision | Locked answer |
|---|---|---|
| Q1 | Where does the new surface live? | Two sibling tabs inside `/app/pulse`: **Search** (existing, preserved) and **Explore** (new) |
| Q2a | Bubble size encoding | User-selectable toggle: **TEU · Shipments · Spend · Opportunity Score**. Default TEU. |
| Q2b | Data sourcing | V6 CSV merged into `lit_company_directory` (replacing prior Panjiva snapshot) UNION live `lit_companies`. Dedup on `canonical_domain` then `canonical_name + country + state`. **Zero duplicate listings.** |
| Q3 | NL search behavior | NL search drives filter chips (v1). NL search can override dataset (v1.5). AI trained on the full taxonomy (geo, industry, size, trade, opportunity, freshness, workflow, dataset, combinations). |
| Q4 | Bubble color encoding | Default **Industry** (categorical palette). Other dimensions (Opportunity, Workflow, Saved/Unsaved, State) available as both color modes AND filter chips. |
| Q5 | Selection model | **Hybrid.** Pulse Lists (persistent companies, Attio-syncable) + Map Selections (lightweight saved views — filters + selection IDs + map state). Both reachable from the same SelectionBar. Immediate actions also available without saving (Export CSV, Bulk-enrich, Add to campaign, Send to Search). |
| Q6 | Data freshness model | **Tiered freshness badges** (Live / Saved / Directory) on every account + auto-refresh on Save/Add-to-list/Open-in-CC + manual per-row Refresh + bulk "Refresh selection" capped at 25 with credit preview. Cache-hit gate before ImportYeti fetch (24h TTL). Per-user daily quota. |
| Q7 | Opportunities engine (v1) | **4 zero-config types:** Consolidation, Vulnerable incumbent, High-velocity, Defend & grow (auto-derived from Pulse Lists). v1.5 adds Lane fit, Share-of-wallet, Displacement with a config UI. |
| Consolidated | Top Insights panel | **Overview tab only** in v1 (totals + top-5 industries/origins/destinations/lanes for current view). Patterns + Compare tabs deferred to v1.5. |
| Consolidated | Map interaction tools | All v1: click bubble → QuickCard, **Select all in view** toolbar button, **Lasso select** (free-draw polygon), shift-click multi-select, clear-selection chip. |
| Consolidated | Export | CSV (current selection or filtered view) v1. PNG of map v1.5. |
| Consolidated | CSV ingest | **Admin-only seed**, never exposed in UI. V6 CSV ingested once via `scripts/ingest-v6-csv.ts`. No future user-facing import flow. |

---

## 3. Architecture

### 3.1 Page structure

`/app/pulse` becomes a shell with two sibling tabs:

- **Search** (existing surface, preserved unchanged) — search hero + 3-col results grid + PulseLibrary. Renamed internally `PulseSearchTab.jsx`.
- **Explore** (new) — the V6-style intel surface.

URL state: `/app/pulse?tab=explore&filters=...&color=industry&size=teu&selection=...` so views are deep-linkable.

### 3.2 Three-pane layout (Explore tab)

```
┌──────────────────────────────────────────────────────────────────┐
│  Toolbar: NL search · Filter chips · Color · Size · Selection    │
├──────────┬───────────────────────────────────────┬───────────────┤
│          │                                       │               │
│  Top     │            US Map                     │  Quick Card   │
│  Insights│         (Leaflet bubbles)             │  (right rail, │
│  (left,  │                                       │   only when   │
│  collap- │                                       │   bubble      │
│  sible)  │                                       │   selected)   │
│          │                                       │               │
├──────────┴───────────────────────────────────────┴───────────────┤
│  Account table (filtered/selected accounts, virtualized)         │
└──────────────────────────────────────────────────────────────────┘
```

Map + table share state: filtering the map filters the table; selecting on the table highlights bubbles on the map. The same `useExploreState()` hook drives both.

### 3.3 Component tree

```
PulsePage (shell)
├── PulseTabs (Search | Explore)
├── PulseSearchTab (existing, ~unchanged)
└── PulseExploreTab
    ├── ExploreToolbar
    │   ├── NLSearchBar (shares searchPulseV2; sets filters not results)
    │   ├── FilterChipRow (industry, geo, size, opportunity, freshness, workflow, dataset)
    │   ├── ColorModeToggle (Industry | Opportunity | Workflow | Saved | State)
    │   ├── SizeModeToggle (TEU | Shipments | Spend | Opportunity Score)
    │   └── SelectionBar (count · Save to List · Save as View · Export · Bulk Refresh · Add to Campaign)
    ├── TopInsightsRail (collapsible left, Overview tab only v1)
    ├── ExploreMap (Leaflet, bubble + cluster + optional heat)
    ├── PulseQuickCard (right rail; existing component, re-skinned)
    └── ExploreAccountTable (virtualized, sortable, mirrors map filters)
```

### 3.4 Data layer

- **`useExploreState()`** — central hook: filters, color/size modes, selection, derived bubble data. URL-synced.
- **`useExploreAccounts(filters)`** — calls a new edge fn `pulse-explore` that runs the merged CSV-directory + live-companies query with opportunity scoring + freshness join. Returns rows with unified shape.
- **`useExploreInsights(filters)`** — aggregates for the Top Insights rail. Computed server-side, cached by filter hash.
- **`useImportYetiRefresh()`** — wraps `importyeti-proxy` with cache gate + quota check + optimistic UI update.

### 3.5 Backend changes

**New edge function: `pulse-explore`**
- Input: filter object (industry, geo, size, opportunity types, freshness, workflow, dataset), color mode, size mode, viewport bbox
- Output: `{ rows, sources, opportunity_scores, freshness_summary, totals, truncated }`
- Reads from: `lit_company_directory` (CSV) UNION `lit_companies` (live), LEFT JOIN `lit_importyeti_company_snapshot` for freshness, LEFT JOIN aggregated opportunity scores. Dedup on `canonical_domain` then normalized name+geo.
- If result >10k rows, caps to top 10k by `opportunity_composite_score` and sets `truncated: true`.

**New edge function: `pulse-map-selection-save`**
- Input: `{ name, filters, selection_ids, map_state }`
- Writes to `lit_pulse_map_selections` scoped to user + org.

**Schema additions to `lit_company_directory`:**
- `vertical text` (V6 column)
- `top_dimensions jsonb` (V6 lanes column)
- `gp_potential numeric` (V6 column)
- `opportunity_consolidation_score numeric`
- `opportunity_vulnerable_score numeric`
- `opportunity_velocity_score numeric`
- `opportunity_composite_score numeric` (weighted blend, indexed)
- `last_opportunity_recompute_at timestamptz`

Defend & grow score is **derived on read** from Pulse List membership (no stored column, no recompute).

**New table: `lit_pulse_map_selections`**

```sql
create table lit_pulse_map_selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  org_id uuid references organizations(id),
  name text not null,
  filters jsonb not null,
  selection_ids text[] not null default '{}',
  map_state jsonb not null, -- { center: [lat,lng], zoom, color_mode, size_mode }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: user_id = auth.uid() OR (org_id IS NOT NULL AND user is member of org)
```

**New table: `lit_user_importyeti_quota`**

```sql
create table lit_user_importyeti_quota (
  user_id uuid not null references auth.users(id),
  day date not null,
  calls_count int not null default 0,
  primary key (user_id, day)
);

-- Enforced server-side in importyeti-proxy. RLS: user can read own row.
```

**Opportunity recompute job**
pg_cron nightly → recomputes Consolidation, Vulnerable, and Velocity scores for all `lit_company_directory` rows. Composite is computed at the same time. Defend & grow excluded (derived on read).

### 3.6 Search AI taxonomy extension

Extend `searchPulseV2` parsed schema with new fields:

```ts
parsed: {
  intent, audience_type, industry_terms,
  geo: { states, metros, cities, countries, ports, region }, // + region: "southeast" | "west_coast" | ...
  size, shipment_filters, trade_filters,
  opportunity_types: ('consolidation' | 'vulnerable' | 'velocity' | 'defend')[],
  freshness_state: ('live' | 'saved' | 'directory' | 'stale')[],
  workflow_state: ('saved' | 'in_campaign' | 'meeting_booked' | 'unsaved' | `in_list:${string}`)[],
  dataset_filter: 'directory_only' | 'live_only' | 'all'
}
```

LLM prompt gets a new EXAMPLES block covering each taxonomy. Server-side validator drops unknown enum values before applying (parser hallucinations logged to Sentry to grow the training set). The same parsed object drives BOTH the existing search results AND the new Explore filter chips — a single NL query syncs both surfaces.

---

## 4. Components & data flow

### 4.1 ExploreMap

Built on existing Leaflet + react-leaflet. Three rendering modes layered based on zoom:

- **Zoom < 5 (national):** Cluster mode. SuperCluster aggregates bubbles into circles labeled with account count. Click cluster → zoom in.
- **Zoom 5–8 (regional):** Bubble mode. One bubble per account, positioned at `(city, state)` centroid (fallback: state centroid, then metro centroid, then country centroid).
- **Zoom > 8 (metro):** Bubble mode with offset jitter so co-located bubbles don't stack.

**Bubble visual encoding:**

- **Size** = current size mode value, log-scaled. Min radius 6px, max radius 28px. Scaled per-viewport so the biggest in-view bubble is always 28px.
- **Color** = current color mode lookup. Industry palette (Tailwind-derived: red-500 Manufacturing, blue-500 Retail, emerald-500 Transportation, amber-500 Energy, purple-500 Tech, etc.). Opportunity mode = sequential blue → red. Workflow mode = cyan/purple/emerald/slate. All palettes tested for colorblind contrast.
- **Border** = freshness indicator. Solid white = Live (≤24h). Dashed white = Saved (≤30d). No border = Directory only.
- **Selection state** = 2px cyan ring + raise z-index.

**Heat overlay (toolbar toggle, off by default):**
Leaflet.heat layer using current size-mode value as weight. Toggling on overlays the heat behind the bubbles.

**Performance:** Viewport culling — only renders bubbles in viewport + 20% buffer. SuperCluster handles 25k+ points. Canvas renderer (not SVG) when visible bubble count >500.

### 4.2 PulseQuickCard (right rail)

Existing component, re-skinned with:

- **Header:** Company name + canonical domain + **freshness chip** (`Live · 2h ago` / `Saved · 14d ago` / `Directory · never refreshed`)
- **Action row:** `[Open in Command Center →]` `[Save to list]` `[Add to campaign]` `[Refresh ↻]`. Refresh disabled if cache hit <24h, tooltip: "Cached, fresh — try again in N hours".
- **KPI strip:** TEU 12m · Shipments 12m · Spend 12m · Last shipment date. Each with delta arrow vs. prior period when available.
- **Opportunity chips:** Top 1–2 opportunity types with scores. `[Vulnerable incumbent · 87]` `[Consolidation · 72]`
- **Location strip:** city, state, country, primary origin port, top 3 lanes
- **Industry + employee count + V6 vertical (when present)**
- **Contacts preview** (if Live): 3 enriched contacts with title (collapsed list, click to expand)

Auto-closes on map click-outside. Sticky on table-row click. Toast on action success.

### 4.3 Filter chips + NL search wiring

Filter chips bind directly to fields in the `parsed` object returned by `searchPulseV2`. When user types "vulnerable incumbents in the southeast":

```js
parsed: {
  opportunity_types: ['vulnerable'],
  geo: { region: 'southeast', states: ['FL','GA','NC','SC','TN','AL','MS'] }
}
```

→ Opportunity chip lights up "Vulnerable incumbent", Geo chip lights up "Southeast (7 states)". User can refine by clicking chips. Same parsed schema, two surfaces.

Chip categories:

- **Industry** — checkboxes from vertical-sorted list
- **Geo** — region presets + state multi-select + metro multi-select + country multi-select
- **Size** — TEU range slider, shipments range slider, spend range slider, employee count range
- **Opportunity** — multi-select of the 4 v1 types
- **Freshness** — Live / Saved / Directory toggle
- **Workflow** — Saved / In campaign / Meeting booked / Unsaved / In list:X
- **Dataset** — All / Directory only / Live only
- **Clear all** button always visible when ≥1 chip active

### 4.4 Opportunity scoring formulas (v1)

All scores 0–100, normalized.

**Consolidation Score**
```
forwarder_count = count(distinct forwarder for this shipper, last 12m)
total_teu = sum(teu, last 12m)
score = clamp(((forwarder_count - 1) * 25) + log10(total_teu + 1) * 8, 0, 100)
```
Single-forwarder shipper scores 0. Multi-forwarder + meaningful volume scores high.

**Vulnerable Incumbent Score**
```
forwarder_concentration = max forwarder share (0–1) over last 12m
teu_trend = (recent_6m - prior_6m) / max(prior_6m, 1)
score = clamp(forwarder_concentration * 60 + max(0, -teu_trend) * 100, 0, 100)
```
Single dominant forwarder + shrinking volume = high score.

**High-velocity Score**
```
percentile_teu = percentile_rank(this_shipper.teu_12m, all_shippers.teu_12m)
shipment_recency_bonus = max(0, 1 - days_since_last_shipment / 90)
score = clamp(percentile_teu * 80 + shipment_recency_bonus * 20, 0, 100)
```
Top-quintile TEU with recent shipments = high score.

**Defend & Grow Score (derived on read)**
```
score = is_in_user_pulse_list ? 80 + lane_growth_bonus : 0
lane_growth_bonus = clamp(lane_count_growth_12m * 4, 0, 20)
```
Pure derivation from `lit_pulse_lists_membership`; no stored column, no recompute.

**Composite Score**
```
composite = max(consolidation, vulnerable, velocity, defend) * 0.7
          + avg(top_2_of_those) * 0.3
```
Drives the "Opportunity" color mode. Individual scores feed the chip filter and QuickCard chips.

### 4.5 Dedup strategy (CSV + live union, no duplicates)

When `pulse-explore` builds the result set:

1. Pull from `lit_company_directory` filtered by current filters
2. Pull from `lit_companies` filtered by current filters
3. **Dedup priority:** match on `canonical_domain` first; if missing/null, match on normalized `canonical_name + country + state`
4. When both sources match: KEEP the live row (`lit_companies`) as the base, MERGE in directory-only fields that the live row lacks (`vertical`, `top_dimensions`, `gp_potential`), TAG `data_sources: ['directory', 'live']`. **For fields present in both (industry, city, state, etc.), the live row wins** — never overwrite live data with stale CSV values.
5. Live-only row → `data_sources: ['live']`, freshness chip = `Live`
6. Directory-only row → `data_sources: ['directory']`, freshness chip = `Directory`
7. Result rows have unified shape — table/map/QuickCard don't know which path they came from

Canonical_name normalization: lowercase, strip Inc/LLC/Ltd/Corp/Co./Limited/SAS/GmbH suffixes, collapse whitespace, strip punctuation. Already partially implemented in `normalize-company` edge fn — extend.

### 4.6 Map Selection persistence

"Save as Map Selection" in the SelectionBar:

1. Modal asks for a name
2. POST to `pulse-map-selection-save` → writes `lit_pulse_map_selections` row with `filters`, `selection_ids`, `map_state: { center, zoom, color_mode, size_mode }`
3. Saved selections appear in toolbar dropdown `[My saved views ▾]` → click loads filters + reapplies. **No companies are owned by the selection — it just points at them.**

vs. "Save to Pulse List":

1. Existing `AddToListPicker` flow (unchanged)
2. Companies become persistent members of the list
3. Auto-refresh + Attio sync + campaign targeting all kick in

Both available from the same SelectionBar. UI labels: "Save view (just filters)" vs. "Save to list (companies)".

### 4.7 CSV ingest (admin-only, one-shot)

- V6 CSV is **seed data**, ingested by an admin script (`scripts/ingest-v6-csv.ts`) run once by a developer. **Not exposed in the app at any layer.**
- Script reads the CSV from the provided path, normalizes columns per the mapping below, dedups against existing `lit_company_directory` rows (prior Panjiva snapshot overwritten or merged where domains match), upserts.
- After ingest, the nightly opportunity recompute job picks up the new/changed rows automatically.
- No admin UI, no "import" button. If we ever ingest another provider, it's the same admin-side script with a different parser.

V6 column mapping:

| V6 CSV column | `lit_company_directory` field |
|---|---|
| Account | `company_name` |
| Location | `city` / `state` / `country` (parsed) |
| Industry | `industry` |
| TEU Vol. | `teu` |
| Annual Sales | `revenue` (text → numeric) |
| Vertical | `vertical` (new column) |
| Top Dimensions | `top_dimensions` (new jsonb column) |
| GP Potential | `gp_potential` (new numeric column) |

---

## 5. Error handling

### ImportYeti refresh failures

- **Quota exceeded** (per-user daily cap): toast "Daily refresh limit reached (N of N). Upgrade or try again tomorrow." Refresh button disabled with tooltip.
- **API 5xx / timeout:** row keeps stale data, freshness chip unchanged, toast "Refresh failed — using cached data". Sentry breadcrumb with `fn: importyeti-proxy`, `company_id`, `user_id`.
- **Empty/null response:** row flagged `no_live_data: true`, freshness chip becomes `Directory · no live match`. Future refresh attempts skip the API.
- **Cache hit (<24h):** no API call, no error path, instant return with `from_cache: true`.

### Map render failures

- **Leaflet tile load failure** (offline / blocked): fallback to static US SVG outline with bubbles overlaid. No "broken map" state.
- **SuperCluster degenerate data** (zero accounts, NaN coords): renders empty map with "No accounts match these filters. [Clear filters]".
- **Coord lookup miss:** fall back to country centroid, log to Sentry as `coord_lookup_miss` warn — not fatal.

### Search / parse failures

- **NL parser empty result:** chips unchanged, search runs literal-string against `company_name`, table shows results. Soft fail.
- **Parser hallucinated taxonomy values:** server-side validator drops unknown enum values before applying. Dropped values logged to Sentry.

### Selection / save failures

- **Save-to-list duplicate:** show "Already in list X" inline, not an error toast.
- **Save-as-view name collision:** append "(2)" automatically, no prompt.
- **Bulk refresh partial failure:** per-row freshness update for successes, error toast naming the N that failed.

---

## 6. Performance budgets

| Surface | Target | Mechanism |
|---|---|---|
| Initial Explore tab paint | < 1.5s on cable | Map shell renders first, bubbles stream in async |
| `pulse-explore` edge fn | p95 < 800ms for ≤5k rows in viewport | Aggregate scores precomputed nightly, viewport bbox filter in SQL |
| NL search round-trip | p95 < 1.2s | Existing `searchPulseV2` budget |
| Map pan/zoom | 60fps to 5k visible bubbles | SuperCluster + viewport culling + canvas renderer >500 bubbles |
| Account table scroll | 60fps to 25k rows | `react-virtualized` + memoized row component |
| ImportYeti single refresh | < 2s p95 | Cache check + direct API call |
| ImportYeti bulk refresh (25) | < 30s | Parallel 5-at-a-time with rate-limit-aware backoff |

If `pulse-explore` returns >10k rows, server caps to top 10k by composite opportunity score and sets `truncated: true` → UI shows "Showing top 10,000 of N matching accounts. Refine filters to see more."

---

## 7. Testing strategy

### Unit tests
- Opportunity score formulas (4 functions): table-driven across edge cases (zero TEU, single forwarder, declining vs. growing, percentile boundaries)
- Dedup logic: domain match wins, name+geo match for missing domains, merge preserves correct fields
- NL parser taxonomy expansion: snapshot tests per new field
- Coord lookup fallback chain: city → metro → state → country

### Integration tests (Vitest + Supabase test branch)
- `pulse-explore` edge fn: seeded `lit_company_directory` + `lit_companies`, asserts dedup, scoring, freshness join, viewport filter
- `importyeti-proxy` quota enforcement: spoof user calls, assert hard cap at daily limit
- `pulse-map-selection-save` + reload round-trip: filters/zoom/IDs restored
- V6 ingest script idempotency: re-run produces identical row count, no duplicates

### Component tests (Vitest + Testing Library)
- ExploreMap: renders correct bubble count, color mode switches palette, size mode rescales radii, selection ring appears
- FilterChipRow: NL parse → chips light up, manual chip toggle → filters update, clear-all resets
- PulseQuickCard: freshness chip correct for each `data_sources` combo, refresh disabled when cached, action buttons fire correct mutations

### E2E (Playwright, one happy-path)
Open `/app/pulse?tab=explore` → type "vulnerable incumbents in the southeast" → verify chips light up + map filters + table updates → click bubble → quick card opens → click "Save to list" → row appears in Pulse List.

### Visual regression
Skip v1; add when the page has stabilized.

---

## 8. Rollout

**Phase 0 (½ day, admin):** Run V6 CSV ingest against Supabase preview branch. Verify dedup against existing 26,787 directory rows. Spot-check 20 randomly-sampled merged accounts.

**Phase 1 (~3 days, backend):**
- Schema migration: V6 columns + opportunity score columns on `lit_company_directory`
- Create `lit_pulse_map_selections` + `lit_user_importyeti_quota` with RLS
- Deploy `pulse-explore` edge fn
- Deploy `pulse-map-selection-save` edge fn
- Deploy nightly opportunity-recompute pg_cron job
- Run V6 ingest in production

**Phase 2 (~5 days, frontend):**
- `PulseTabs` shell + Explore tab skeleton
- `ExploreMap` with bubble + cluster layers (no heat yet)
- `ExploreToolbar` with color/size toggles + Filter chips
- `PulseQuickCard` re-skin with freshness + opportunity chips
- `ExploreAccountTable` virtualized
- `SelectionBar` + Save-to-list / Save-as-view actions

**Phase 3 (~2 days, NL + polish):**
- Extend `searchPulseV2` parser taxonomy
- Filter-chip ↔ NL bidirectional sync
- Heat overlay toggle
- Bulk refresh with credit preview modal
- CSV export
- Empty states, loading skeletons, error toasts

**Phase 4 (gated rollout):**
- Feature flag `pulse_explorer_v1` on entitlements. Default OFF.
- Enable for internal accounts + 3 design-partner customers
- Monitor: ImportYeti spend per user, p95 latencies, Sentry error rate, daily active Explore users vs. Search users
- Open to all paid tiers once internal + design partners stable for 7 days

**Phase 5 (v1.5, separate spec):**
- Top Insights Patterns + Compare tabs
- Lane fit / SoW / Displacement opportunity types + config UI
- PNG map export
- NL search "override dataset" mode

---

## 9. Cost / risk callouts

- **ImportYeti spend** is the biggest unknown. The 24h cache + per-user daily quota are the controls. Phase 4 telemetry tells us whether 50/day default for paid tiers is too generous or too tight.
- **Opportunity score quality** depends on BOL coverage. Accounts with sparse BOL data score low across all four types and fade to slate on the map. Correct behavior, but means data-sparse accounts look uninteresting even when they're real prospects. **Mitigation:** add "Low data" badge on QuickCard when BOL row count < 5.
- **Map can lie at low zoom.** A cluster of 800 accounts in California is one circle — user can't tell from the map alone whether they're huge or tiny. The Top Insights rail compensates with per-view aggregates.

---

## 10. Out of scope (v1)

- Top Insights Patterns + Compare tabs
- Lane fit / Share-of-wallet / Displacement opportunity types
- Config UI for user service lanes / competitor list / own-spend data
- PNG map export
- NL search "override dataset" mode (the v1.5 escape hatch)
- User-facing CSV upload (admin-only, ever)
- Visual regression testing

---

## 11. Open items for implementation plan

- Per-tier ImportYeti daily refresh quotas (default 50/day paid, 10/day trial — confirm with Stripe entitlements team)
- Pulse Lists ↔ Defend & grow signal — verify `lit_pulse_lists_membership` schema matches what the read-time formula needs
- `parsed.region` taxonomy values — finalize the region → states mapping (Southeast, West Coast, Pacific Rim, etc.) before implementation
