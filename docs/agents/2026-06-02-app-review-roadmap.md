# LIT App Review — Roadmap

**Date:** 2026-06-02
**Author:** Claude (CEO + Design review lens applied against the recon I ran today)
**Status:** Draft — Phase A shipped; Phases B–C + follow-ups awaiting CEO review

---

## Context

LIT is a logistics intelligence + CRM SaaS. The codebase has enterprise breadth (44 routes, 76 edge functions, multi-tier RBAC, real Stripe billing, working AI, source-mapped Sentry observability across frontend + edge) but **prosumer polish on the app interior**. The gap between "what the backend can do" and "what a user can see/do" is the biggest unforced error. Tier-1 SaaS (ZoomInfo, Linear, Vercel) feels "unique" because every screen has a deliberate POV. We have ~7 surfaces with strong intent (Pulse Coach, Dashboard globe, Pulse Live) surrounded by 30+ utilitarian admin/list pages that read as scaffolding.

The single highest-leverage move: **consolidate around 5 hero surfaces** (Dashboard, Search, Company Profile, Campaigns, Pulse), make THOSE feel like a $40k/seat product, and let the rest stay utilitarian.

## What's working — preserve

| Surface | Why |
|---|---|
| Stripe billing | Enterprise-grade, real plans, signature-verified webhooks |
| Pulse Coach v2 | Differentiated POV — the "feels unique" surface to clone |
| Globe on Dashboard | D3 orthographic (canvas, not WebGL) is the right choice |
| Auth + RBAC | RequireAuth / RequirePlan / RequireAdmin / RequireSuperAdmin correctly modeled |
| Edge security | All 6 deployed functions on createLogger → Sentry; cron auth gates; signature-verified webhooks |
| Marketing site | Already ZoomInfo-tier with bracketed eyebrows, editorial blog, hero stacks |

## Phase A — DONE (`65761871`)

**Globe ⟷ Map view toggle** across Dashboard, Pulse Coach workspace lanes, and Company Profile → Supply Chain.

- New: `useLaneViewMode` hook (localStorage, cross-tab sync), `<LaneViewToggle>` segmented control, `<LaneMap>` Leaflet wrapper with great-circle polylines.
- Closes the Company-Profile-imports-globe-but-doesn't-fully-use-it gap.
- Library choice: Leaflet + free CartoDB Positron tiles. ~150 kB gz. No token cost. Tile server is swappable for a paid styled basemap later.
- One persisted preference across all 3 surfaces.
- Production build green; source maps emitting.

## Phase B — CEO/Eng plan review (this doc)

Validate the proposed Phase C scope + sequencing before committing engineering time.

## Phase C — Visual system port (proposed, ~1 day)

The marketing site already has the ZoomInfo-grade pattern library. Cherry-pick the patterns into the app interior:

| Marketing pattern | App surface |
|---|---|
| `<CategoryChip>` bracketed labels | Filter chips in Search + Pulse |
| `<FeaturedPostHero>` split hero | Dashboard hero section |
| `<TopicTile>` grid | Lists overview, Saved Companies grid view |
| `<ArticleHeader>` editorial header | Company Profile header (currently plain text + logo) |
| Eyebrow + tight-kern H2 | Every page section header |

Single PR. Touches ~6 pages. Highest perceived-quality lift per hour.

## Follow-ups (post-C)

### F1. Supplier tab enhancement on Company Profile (DSV ask)

A DSV colleague flagged supplier details as critical for receiver-side planning. Build:
- Full supplier details list on the Supply Chain tab (or new dedicated Suppliers sub-tab)
- Hover view OR sidebar card showing supplier details + total shipment count to this receiver
- Data already in BOL rows (Supplier name + receiver) — no new vendor needed

Estimated: ~6h. New tab + sidebar component + supplier aggregation utility.

### F2. Buying Intent signal tile (replaces my earlier "Hiring Signal" idea)

User correctly pushed back — they don't want job-postings data. Pivoting to **buying intent signals** sourced from ImportYeti data we already have:
- YoY import-volume growth (↑ vs prior 12 mo)
- New trade lanes opened in last 90 days
- Forwarder switching (carrier changed)
- HS-code category expansion (new commodity categories)

Each signal computable from `lit_shipments` aggregations. Surface as a tile on Dashboard + Company Profile Overview. No new vendor cost.

Estimated: ~8h. New aggregator helpers + tile component.

### F3. API gap closures (capability surfacing)

30 edge functions wired backend-only with no frontend trigger. Concrete closures:

| Backend function | Proposed UI surface |
|---|---|
| `freight-rate-fetcher` | "Live Rate" pull on existing Rate Benchmark tab |
| `pulse-arrival-alerts` | "Arriving this week" feed tile on Dashboard |
| `pulse-coach-classify` | Auto-tag classification chip on search result rows |
| `pulse-web-discover` | Either delete or build a Lead Database surface |

Each closure is 2–4h of frontend work.

### F4. Mobile sweep — 1-day audit pass

Six surfaces are desktop-only (<5 Tailwind breakpoints):
1. Settings (2 → at least 8)
2. CampaignBuilder (3 → at least 8)
3. PreCallBriefing (4 → at least 7)
4. Notifications (full route → header popover)
5. Contacts (4 → at least 8)
6. Lists (4 → at least 7)

Estimated: ~12h.

### F5. Tab-count trim

Company Profile has 8 tabs (Supply Chain · Pulse LIVE · Rate Benchmark · Contacts · Pulse AI · Revenue Opportunity · Activity · Inbox). Tier-1 SaaS caps at 5–6 visible + "More" overflow.

Proposed visible: Overview · Shipments · Contacts · Activity · Inbox
Proposed in More: Pulse AI · Rate Benchmark · Revenue Opportunity

Estimated: ~3h.

### F6. Empty states + skeleton loaders

Most lists currently show "No data" or a spinner. ZoomInfo-grade pattern: intent-filled empty states ("No saved companies yet — try searching 'auto parts importers' or upload a CSV") + shimmer skeletons matching final layout.

Touches ~10 pages. Estimated: ~16h.

## Explicitly out of scope (already decided)

- **RFP Studio polish** — user has discontinued RFP Studio. Route stays for now; cleanup PR later.
- **Hiring Signal tile** — superseded by Buying Intent (F2).
- **Aggressive admin-page polish** — operator tools, intentionally utilitarian.

## Proposed 30-day sequence

| Week | Theme | Concrete shipments |
|---|---|---|
| Wk 1 (this week) | Hero polish | ✅ Phase A globe/map toggle. ➡️ Phase C visual system port. F5 tab trim. |
| Wk 2 | Capability surfacing | F2 Buying Intent. F3 API gap closures (freight rate + arrival alerts + classification chips). |
| Wk 3 | Mobile + supplier | F1 Supplier tab. F4 mobile sweep. |
| Wk 4 | Polish | F6 empty states + skeletons. |

## CEO review decisions (locked 2026-06-02)

| # | Question | Decision | Rationale |
|---|---|---|---|
| Approach | Roadmap shape (A/B/C) | **B — DSV-first re-sequencing** | Customer signal precedes speculative polish; F1 may surface tab-architecture questions Phase C should answer |
| Mode | Review posture | **HOLD SCOPE** | Plan is comprehensive; stress-test, don't expand |
| Q1 | Phase C vs F1 in Wk1 | **F1 first (Wk1), Phase C Wk2** | Settled by Approach B |
| Q2 | Tab trim (F5) | **Trim to 5 + More overflow** | Mobile + ZoomInfo-pattern alignment worth the discoverability tradeoff; Pulse AI/Revenue Opp reachable in 1 click |
| Q3 | Buying Intent starter set | **Ship the 4 as-written** | YoY growth + new lanes 90d + forwarder switch + HS expansion. Iterate based on which chips drive saves/clicks |
| Q4 | RFP route deletion | **Wk1, bundled with F1+F5** | ~30 min cleanup, no rationale to spread it across PRs |
| Q5 | Mobile sweep ordering | **Settings + Billing first** | Trial-to-paid conversion surfaces; Settings has only 2 Tailwind breakpoints today (worst offender) |
| 9.1 | Wk1 PR shape | **One PR — "Company Profile structure pass"** | F1 + F5 + RFP cleanup all touch CompanyProfileV2.tsx (33 commits/30d); split = rebase pain |

## Locked 30-day sequence (post-review)

| Week | Theme | Concrete shipments |
|---|---|---|
| Wk 1 | Company Profile structure pass | One PR: F1 Supplier tab (full list + sidebar detail card) + F5 tab trim to 5 + RFP route delete |
| Wk 2 | Visual system port | Phase C: CategoryChip + FeaturedPostHero + TopicTile + ArticleHeader + eyebrow/H2 across ~6 app pages |
| Wk 3 | Mobile + Buying Intent | F4 mobile sweep starting Settings + Billing; F2 Buying Intent tile (4 signals) |
| Wk 4 | Capability + polish | F3 API gap closures (freight rate live pull, arrival alerts, classification chips); F6 empty states + skeleton loaders |

## Implementation tasks (from review)

- [ ] **T1 (P1, human: ~3 days / CC: ~5h)** — Company Profile — Wk1 structure pass PR (eng-review expanded)
  - Surfaced by: Finding 9.1 (CEO) — coupling of F1 + F5 + RFP cleanup on CompanyProfileV2.tsx
  - Surfaced by: Finding 1.1 (Eng) — RFP cleanup blast radius is 11 surfaces, not 2
  - Surfaced by: Finding 3.2 (Eng) — 3 E2E tests added to lock structural changes
  - Surfaced by: Finding 4.1 (Eng) — supplier list pagination (top 50 + Show more) for large receivers
  - **F1 Supplier sub-tab:**
    - `frontend/src/pages/CompanyProfileV2.tsx` (TABS const + supplier sub-tab routing)
    - `frontend/src/components/company/CDPSupplyChain.tsx` (extend existing `deriveSuppliers`/`SupplierRowInteractive`/`TopSuppliersCard` from "top N" to "top 50 + Show more"; add new `<SupplierDrawerCard>` for row click)
    - **NOTE — much lighter than plan implied:** `getBolSupplier()`, `deriveSuppliers()`, `SupplierRow` type, `SupplierRowInteractive` and `TopSuppliersCard` ALL ALREADY EXIST. F1 is extension, not new build.
  - **F5 tab trim (8 → 5 + More):**
    - `frontend/src/pages/CompanyProfileV2.tsx` (TABS const → visible 5; new `<TabsMore>` dropdown for Pulse AI + Rate Benchmark + Revenue Opportunity)
  - **RFP cleanup (all 11 surfaces):**
    - `frontend/src/App.jsx` (remove route, add `/app/rfp → /app/dashboard` redirect)
    - `frontend/src/pages/RFPStudio.jsx` (delete file)
    - `frontend/src/components/layout/AppShell.jsx` (remove 2 SideLink entries)
    - `frontend/src/layout/lit/AppSidebar.jsx` (remove RFP entry)
    - `frontend/src/components/dashboard/DashboardHeader.tsx` (remove "Generate Quote" — also fixes broken `/app/rfp-studio` link)
    - `frontend/src/components/dashboard/QuickActionsButton.tsx` (remove RFP link — broken)
    - `frontend/src/components/dashboard/InsightsPanel.tsx` (remove RFP link — broken)
    - `frontend/src/components/dashboard/GettingStartedChecklist.tsx` (remove RFP onboarding step — broken)
    - `frontend/src/components/landing/ModuleInteractiveBanner.jsx` (remove rfp panel from marketing landing)
    - `frontend/src/lib/email/planEmailCopy.ts` (remove "RFP Studio" from upgrade-email feature list)
    - `frontend/src/pages/companies/index.tsx` (remove "Migrate RFP Studio payloads into Command Center" helper — obsolete)
  - **E2E (new — Finding 3.2):**
    - `tests/e2e/rfp-redirect.spec.ts` — visit `/app/rfp` → assert redirect to `/app/dashboard`
    - `tests/e2e/company-profile-tabs.spec.ts` — mobile viewport (393×852) → assert 5 tabs visible + "More" button; click More → Pulse AI link present
    - `tests/e2e/company-profile-suppliers.spec.ts` — open a fixture receiver → click Supply Chain → click Suppliers sub-tab → list renders + first row click opens drawer
  - Verify: production build green; demo path Dashboard → Search → Save → Company Profile → Supply Chain → Suppliers sub-tab → row click → drawer with shipment count to receiver; tab row shows 5 + More on mobile; `/app/rfp` → `/app/dashboard`; no `/app/rfp*` strings remain in `git grep -E "/app/rfp" -- frontend/src/`; no broken `/app/rfp-studio` links remain; upgrade-email copy doesn't say "RFP Studio"

- [ ] **T1c (P1, human: ~1.5 days / CC: ~6h)** — Supplier Profile page (NEW from design review)
  - Surfaced by: Design review Pass 3 — user push-back that BOL data already supports a real supplier profile, not just a drawer teaser
  - **Route:** `/app/suppliers/:slug` — slug = supplier name slugified (URL-safe, dedup-stable)
  - **Files:**
    - `frontend/src/App.jsx` (add route, gated by RequireAuth)
    - `frontend/src/pages/SupplierProfile.tsx` (new page, mirrors CompanyProfileV2 layout)
    - `frontend/src/components/supplier/SupplierHeader.tsx` (new — flag + name + KPI strip)
    - `frontend/src/components/supplier/SupplierReceiversTab.tsx` (new — all receivers this supplier ships to)
    - `frontend/src/lib/suppliers/profile.ts` (new — cross-receiver aggregator: `aggregateSupplierProfile(supplierName, allBols)` returns `{ totalShipments, receivers: ReceiverRow[], topLanes, topHsCodes, monthlyCadence }`)
    - `frontend/src/lib/suppliers/__tests__/profile.test.ts` (new — cover empty / single-receiver / 100+ receivers / sparse field cases)
    - `frontend/src/components/company/CDPSupplyChain.tsx` (drawer "View full supplier profile" button now links to `/app/suppliers/${slug}`)
  - **Tabs on Supplier Profile page:** Overview · Receivers (default) · Activity (matches CompanyProfileV2 structure, deliberately simpler)
  - **Verify:** demo path Company Profile → Suppliers sub-tab → row click → drawer → "View full supplier profile" → SupplierProfile page renders aggregated cross-receiver intel; URL is bookmarkable; Receivers tab links each receiver back to `/app/companies/:id`
  - **NOT in scope for v1:** Supplier-to-supplier comparison, supplier alerts, custom supplier tags. Deferred.

- [ ] **T2 (P1 — REGRESSION rule, human: ~1 day / CC: ~1.5h)** — Suppliers aggregator — extract + unit tests + snapshot
  - Surfaced by: Finding 6.1 (CEO) — F1 needs unit tests for the aggregator
  - Surfaced by: Finding 3.1 (Eng) — REGRESSION RULE: `deriveSuppliers()` is 200+ LOC deployed in production with zero tests
  - **Step 1** — extract pure aggregator out of `CDPSupplyChain.tsx` (line 2786) into `frontend/src/lib/suppliers/aggregate.ts` so it's testable in isolation
  - **Step 2** — snapshot test against current production behavior: feed real BOL fixture, snapshot the SupplierRow[] output (locks current behavior before any refactor)
  - **Step 3** — 5+ behavior tests: zero suppliers; single supplier; 200+ suppliers (pagination boundary); sparse `getBolSupplier` field (null/undefined/empty); mixed-case supplier names should dedupe; shipment count + share math correctness
  - Files: `frontend/src/lib/suppliers/aggregate.ts` (new), `frontend/src/lib/suppliers/__tests__/aggregate.test.ts` (new), `frontend/src/lib/suppliers/__tests__/fixtures/bols.json` (new), `frontend/src/components/company/CDPSupplyChain.tsx` (import from new module instead of inline)
  - Verify: `npm test --workspace frontend src/lib/suppliers` green; snapshot matches Walmart-fixture output

- [ ] **T3 (P1, human: ~3 days / CC: ~4h)** — Phase C visual port
  - Surfaced by: Plan Wk2 + Finding 11.2
  - Files: ~6 app pages adopt marketing-vocab components; pattern source = `marketing/components/sections/` (CategoryChip, FeaturedPostHero, TopicTile, ArticleHeader)
  - Verify: visual diff acceptable on 3 hero surfaces (Dashboard, Search, Company Profile header)

- [ ] **T4 (P2, human: ~2 days / CC: ~2h)** — Mobile sweep, Settings + Billing first
  - Surfaced by: Q5 decision
  - Files: `frontend/src/pages/SettingsPage.tsx`, `frontend/src/pages/BillingNew.tsx`
  - Verify: viewport ≤640px (iPhone SE) keeps every action reachable; no horizontal scroll; touch targets ≥44px

- [ ] **T5 (P2, human: ~2 days / CC: ~3h)** — Buying Intent aggregator + Dashboard/Company Profile tile
  - Surfaced by: Q3 decision
  - Files: `frontend/src/lib/buyingIntent/compute.ts` (new), `frontend/src/lib/buyingIntent/__tests__/` (new), `frontend/src/components/intent/BuyingIntentTile.tsx` (new)
  - Verify: tile hides when all 4 signals are zero (Finding 4.1); ≥6 Vitest cases including sparse-history / new-account edge cases
  - Performance: consider server-side precompute via cron + cache on `lit_companies` if first-paint latency >300ms with 500 saved companies (Finding 7.1)

- [ ] **T6 (P2, human: ~3 days / CC: ~4h)** — F3 API gap closures
  - Surfaced by: Wk4 + plan F3 table
  - Files: Rate Benchmark tab (live `freight-rate-fetcher` pull), Dashboard tile (`pulse-arrival-alerts` "Arriving this week"), search result rows (`pulse-coach-classify` auto-tag chip)
  - Verify: each function actually invoked from the frontend at least once

- [ ] **T7 (P2, human: ~2 days / CC: ~2h)** — Empty states + skeleton loaders
  - Surfaced by: Wk4 + plan F6
  - Files: ~10 pages with current "No data" placeholders; introduce shared `<EmptyState intent="..." />` + `<SkeletonRow />`
  - Verify: every empty state has a CTA pointing at next action

## Wk1 design specs (locked by /plan-design-review)

### F1 — Suppliers sub-tab + drawer + Supplier Profile page

**Information architecture:**
- Sub-tab order: Summary · Trade Lanes · **Suppliers (new)** · Products
- Suppliers list header: "247 unique suppliers shipping to {receiver name} in last 12 months"
- Row layout: `[flag 16px] [supplier name semibold 14px slate-900] [country muted 12px slate-500] → [count mono 14px right] [share bar 68px slate-100 → blue-500]`
- Pagination: top 50 visible + "Show more (38 of 50 visible)" — no virtualization in v1
- Drawer click anywhere on row → opens detail drawer
- "View full supplier profile" button in drawer → navigates to `/app/suppliers/:slug` (T1c)

**Interaction states (Suppliers sub-tab):**
| State | Spec |
|---|---|
| Loading | 8 skeleton rows (same height as real row, slate-100 shimmer on name + count) |
| Empty (0 suppliers) | Centered intent card + "No supplier shipments on file" + "Refresh Intel" CTA |
| Error (aggregator threw) | Red-tinted notice "Couldn't load suppliers" + retry; Sentry captures `aggregator_failed` |
| Success | List renders with count header at top |
| Partial | Top 50 visible + Show more button |

**Interaction states (supplier drawer):**
| State | Spec |
|---|---|
| Loading | Drawer opens immediately with skeleton (name, location, big-number, sparkline) |
| Sparse data | Missing fields render as "—", not "undefined" |
| Error | Inline "Couldn't load supplier detail. [Try again]" |
| Success | Flag + name (24px), country, total ships (mono 32px), date range, top 3 HS codes, monthly sparkline (recharts), "View full supplier profile" link |

### F5 — Mobile tab overflow

**Pattern:** Dropdown sheet anchored to "More" button
- Visible tabs (5): Supply Chain · Pulse LIVE · Contacts · Activity · Inbox
- Overflow (3 in More): Pulse AI · Rate Benchmark · Revenue Opportunity
- "More" button styling: ghost outline + chevron-down (12px)
- Dropdown: 240px wide, 3 list items with chevron-right, tap-outside or Esc closes
- **Active-in-overflow:** if user is currently on Pulse AI (which lives in More), the More button gets active-tab styling

### Responsive layout per viewport

| Surface | Mobile ≤640px | Tablet 640-1024px | Desktop ≥1024px |
|---|---|---|---|
| Suppliers list | Single-col, share bar hidden (count only) | 2-row layout per supplier | Single-row dense layout |
| Supplier drawer | Bottom-sheet, 70% height, swipe-down dismiss | Right-slide 380px | Right-slide 420px |
| Supplier Profile page tabs | 5 + More overflow (same as Company Profile) | Inline | Inline |
| More menu dropdown | Anchored, max-width 80vw | Anchored | Anchored |

### Accessibility checklist

- ✅ Tab row keyboard nav (←/→ cycles, Home/End jump, Tab focuses next group)
- ✅ Drawer = `role="dialog"` + `aria-labelledby` + focus trap, Esc to close
- ✅ Touch targets ≥44px (More button 44×44, supplier rows 56px mobile)
- ✅ Contrast WCAG AA: supplier name 16.1:1, count 9.8:1, share bar 4.7:1
- ✅ Empty-state illustration has `role="img"` + `aria-label`

### Design system reuse (no new tokens introduced)

| New surface | Reuses |
|---|---|
| Supplier Profile page | `CDPHeader` pattern, `LitSectionCard`, same TABS structure |
| Suppliers list | `TopSuppliersCard` extended, `LitFlag`, `LitPill` |
| Supplier drawer | `MobileCompaniesDrawer.tsx` pattern (right-slide desktop, bottom-sheet mobile) |
| Mobile More menu | New micro-component `<TabsMore>` |

### AI slop patterns explicitly avoided

- ❌ No 3-column "Supplier metric cards" header — use editorial KPI strip
- ❌ No card grid for supplier list — dense rows
- ❌ No centered hero on Supplier Profile — left-aligned header
- ❌ No purple gradient — solid white, navy text, blue-500 accent only
- ❌ No icon-in-colored-circle anywhere — flags do the visual work
- ❌ No bouncy animations — spring slide-in 220ms ease-out
- ❌ No "Welcome to your supplier dashboard" copy — "247 suppliers shipping to {receiver}"

## NOT in scope (explicitly deferred)

- F2 5th-signal external funding/hiring proxy — Q3 selected "ship 4 as-written"; revisit after metrics show whether the 4 are sufficient
- Server-side cron precompute for Buying Intent — Finding 7.1 — only build if first-paint cost demands it after T5 ships
- RFP route rebuild — discontinued; no path back without explicit user decision
- Admin page polish — operator tools, intentionally utilitarian

## Reviewer Concerns

None unresolved. All findings closed via decisions above.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAN | 0 critical gaps, 8 decisions locked, 0 unresolved |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAN | 4 findings, 0 critical gaps, 4 decisions locked, 1 regression test enforced |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAN | score: 6/10 → 9/10, 4 decisions locked, 1 scope expansion (T1c Supplier Profile page) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not applicable to this plan |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | skipped (codex unavailable) |

**Design review summary (Pass 1-7, scope = F1 + F5):**
- Pass 1 IA: F1 4/10 → 10/10 (hierarchy locked: list row anatomy + drawer content order). F5 5/10 → 10/10 (dropdown sheet pattern).
- Pass 2 States: Both surfaces 2/10 → 10/10 (loading skeletons, empty intent CTA, error with retry, partial pagination, sparse-data fallbacks all specified).
- Pass 3 Journey: 6/10 → 9/10. **Scope expansion accepted: user push-back drove T1c — build real Supplier Profile page at `/app/suppliers/:slug` reusing CompanyProfileV2 structure.**
- Pass 4 AI slop: 7 anti-patterns explicitly listed in plan.
- Pass 5 Design system: All reuses mapped (`CDPHeader`, `LitSectionCard`, `MobileCompaniesDrawer` pattern). No new tokens.
- Pass 6 Responsive + A11y: Per-viewport layouts + WCAG AA contrast + 44px touch targets specified.
- Pass 7 Unresolved: Mobile drawer = bottom-sheet 70% height. All decisions locked.
- Mockup generation: **SKIPPED** — designer binary unavailable (no OpenAI API key). Logged as TODO for next session.

**Wk1 effort revised:** ~5.5 days human / ~12-15h CC (was ~3 days / ~5h before design review).

**UNRESOLVED:** 0
**CRITICAL GAPS:** 0
**VERDICT:** CEO + ENG + DESIGN ALL CLEAR — Wk1 ready to implement. T1 + T1c + T2 ship together as one PR.
