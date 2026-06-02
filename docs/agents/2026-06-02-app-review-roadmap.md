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

- [ ] **T1 (P1, human: ~2 days / CC: ~3h)** — Company Profile — Wk1 structure pass PR
  - Surfaced by: Finding 9.1 — coupling of F1 + F5 + RFP cleanup on CompanyProfileV2.tsx
  - Files: `frontend/src/pages/CompanyProfileV2.tsx` (TABS const + supplier sub-tab routing), `frontend/src/components/company/CDPSupplyChain.tsx` (extend `deriveSuppliers`, add hover/drawer card), `frontend/src/App.jsx` + sidebar nav (RFP route removal), `frontend/src/layout/lit/AppSidebar.jsx` + `frontend/src/components/layout/AppShell.jsx` (RFP nav item removal)
  - Verify: production build green; demo path Dashboard → Search → Save → Company Profile → Suppliers sub-tab → hover row → drawer; tab row shows 5 + More on mobile; /app/rfp redirects to /app/dashboard

- [ ] **T2 (P2, human: ~1 day / CC: ~1h)** — Suppliers aggregator — pure-function module + Vitest
  - Surfaced by: Finding 6.1 — F1 needs unit tests for the aggregator
  - Files: `frontend/src/lib/suppliers/aggregate.ts` (new), `frontend/src/lib/suppliers/__tests__/aggregate.test.ts` (new)
  - Verify: 4+ Vitest cases (zero suppliers, single supplier, 200+ suppliers w/ pagination, sparse `getBolSupplier` field)

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
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | not yet run |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not yet run |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not applicable to this plan |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | skipped (codex unavailable) |

**UNRESOLVED:** 0
**VERDICT:** CEO CLEARED — Approach B + HOLD SCOPE locked. Eng Review required before Wk1 PR lands. Design Review recommended before Phase C (Wk2) lands.
