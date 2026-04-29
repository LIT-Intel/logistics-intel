# Handoff: Dashboard & Company Profile (Trade Intelligence)

## Overview

This handoff covers two screens in the **Trade Intelligence** product:

1. **Dashboard** — the landing screen. A real-time overview of saved accounts, top trade lanes (visualized on an interactive 3D globe), opportunity signals, and recent activity.
2. **Company Profile** (Company Intelligence) — the detail page for a single company. Premium intelligence brief covering supply chain, contacts, AI research, and activity.

Both screens share a single visual system: a compact light header with a 6-cell KPI strip, soft-shadow card grid on `#F8FAFC`, dark "intelligence brief" gradient cards as accent surfaces, and a tight typographic system.

---

## Screenshots

Reference screenshots of every screen and key tab live in [`./screenshots/`](./screenshots/). Open each before implementing — the live `index.html` shows them interactively, but if you prefer flat images:

| # | File | What it shows |
|---|---|---|
| 01 | [`screenshots/01-dashboard.png`](./screenshots/01-dashboard.png) | **Dashboard** — header, KPI strip, Trade Lane Map (globe + ranked lanes), AI Trade Brief gradient card |
| 02 | [`screenshots/02-company-profile-supply-chain.png`](./screenshots/02-company-profile-supply-chain.png) | **Company Profile · Supply Chain** — compact header, KPI strip, primary tabs, "What Matters Now" brief, right details panel |
| 03 | [`screenshots/03-company-profile-contacts.png`](./screenshots/03-company-profile-contacts.png) | **Company Profile · Contacts** — list/card toggle, dept filters, verification badges, source labels |
| 04 | [`screenshots/04-company-profile-research.png`](./screenshots/04-company-profile-research.png) | **Company Profile · AI Research** — numbered intelligence brief, sticky outline, supporting data sidebar, confidence score |

**Implement to match the screenshots exactly.** Match spacing, type scale, color, and component anatomy. The interactive `index.html` is the source of truth for hover/active states and micro-interactions the static images cannot capture.

---

## About the Design Files

**The files in this bundle are design references created in HTML.** They are interactive prototypes showing the intended look, layout, micro-interactions, and behavior — they are **not** production code to copy directly into your codebase.

Your task is to **recreate these designs in the target codebase's existing environment** (React, Vue, SwiftUI, Next.js, etc.) using its established patterns:
- Wire components into your real router, layout shell, and auth.
- Replace mock data (the `MOCK_*` constants in each file) with real API calls.
- Map every value to your existing design tokens / Tailwind theme / CSS-in-JS system; do not hard-code hex values inline as the references do.
- Replace the `lucide` UMD dependency with your existing icon library (`lucide-react`, `@heroicons/react`, etc.).
- Replace inline `style={{...}}` objects with your styling solution (CSS Modules, Tailwind, styled-components, etc.).

If no frontend environment exists yet for this product, choose the framework already used by the rest of the org's stack — these designs assume **React 18 + a CSS-in-JS or utility CSS layer**.

---

## Fidelity

**High-fidelity (hifi).** Pixel-perfect mockups with final colors, spacing, typography, and interaction states. Recreate the UI to match these visuals using your codebase's existing libraries and patterns.

---

## ⚠️ Critical: Do NOT Break Existing APIs / KPIs

The mocks intentionally use **placeholder names and shapes** for data. When implementing, **map them to your existing API contract — do not rename fields in the backend or invent new metrics.**

### KPI naming — keep your existing labels

The dashboard mockup shows six top-line KPIs. They are stand-ins for whatever your `dashboard_summary` endpoint already returns. Do not change semantics:

| Mock label in design | Map to your existing field |
|---|---|
| `SAVED COMPANIES` | The CRM saved-accounts count (your existing "Saved Companies" KPI) |
| `SHIPMENTS 12M` | Trailing 12-month BOL count across saved accounts |
| `TEU 12M` | Trailing 12-month TEU sum |
| `EST. SPEND` | Estimated freight spend (whatever model your backend exposes today) |
| `ACTIVE CAMPAIGNS` | Outbound Engine active campaign count |
| `NEW SIGNALS` | New signals in last 7 days (your existing "Recent Signals" count) |

Same on the **Company Profile** KPI strip:

| Mock label | Map to existing field |
|---|---|
| `SHIPMENTS 12M` | `company.shipments_12m` |
| `TEU 12M` | `company.teu_12m` |
| `EST. SPEND` | `company.est_spend` |
| `TRADE LANES` | `company.trade_lanes_count` |
| `CONTACTS` | `company.contacts_count` |
| `LAST SHIPMENT` | `company.last_shipment_date` (formatted as "N days ago") |

If your backend returns different field names, **adapt the props in the component layer**, not the API. Trends (`+12%`, `↑ 8`) are computed values — keep using your existing trend calculation if one exists.

### API contract — do NOT change endpoints

The designs assume the same endpoints you already have:
- `GET /api/dashboard/summary` → KPIs + activity rows + opportunity rows + timeline
- `GET /api/lanes/top` → trade lane data with origin/destination coordinates (used by the globe)
- `GET /api/companies/:id` → company profile data
- `GET /api/companies/:id/contacts`
- `GET /api/companies/:id/shipments`
- `GET /api/companies/:id/research`
- `GET /api/companies/:id/activity`

If any field needed by the design isn't in your current response, **add it** to the existing endpoint — don't fork into a new one.

---

## Screens

### 1. Dashboard (`src/Dashboard.jsx` + `src/Globe.jsx`)

**Purpose:** Operator's morning overview — what changed, what's hot, what to act on.

**Layout** (1440px reference width, scrolling main pane):

```
┌──────────────────────────────────────────────────────────┐
│ Header:  breadcrumb · sync indicator                      │
│          "Welcome back" eyebrow + H1 name                 │
│          contextual stats sentence                        │
│          [icon-btns] [Discover] [New Campaign]            │
│ ─────────────────────────────────────────────────────────│
│ KPI strip: 6 cells, monospaced numbers, trend deltas      │
└──────────────────────────────────────────────────────────┘
┌─────────────────────────────────┬───────────────────────┐
│ Trade Lane Map (globe + list)   │ AI Trade Brief        │
│ flex: 1                         │ width: 360px          │
└─────────────────────────────────┴───────────────────────┘
┌──────────────────────────────────────────────────────────┐
│ What Matters Now (full-width table)                      │
└──────────────────────────────────────────────────────────┘
┌─────────────────────────────────┬───────────────────────┐
│ High-Opportunity Companies      │ Recent Changes        │
│ flex: 1                         │ width: 360px timeline │
└─────────────────────────────────┴───────────────────────┘
```

**Components:**

- **`DashboardHeader`** — Background `#FFFFFF`, bottom border `#E5E7EB`. Three rows: breadcrumb (10px 24px), title (14px 24px), KPI strip (6-col grid on `#FAFBFC` with 1px column separators).
- **`GlobeCard`** — Wraps the 3D globe (`Globe.jsx`) on the left, ranked numbered lane list on the right (01, 02, …). Selected lane gets `#EFF6FF` background and a 2px left blue border; flag emojis (🇨🇳, 🇺🇸, etc) flank country names. Floating dark glass overlay on the globe shows the selected lane's flags + ships/TEU + trend.
- **`StrategicBriefCard`** (AI Trade Brief) — Dark gradient (`#0B1736 → #0F1D38 → #102240`), 1px border `#1E293B`, 12px radius. Cyan radial accent in the top-right corner. Sparkle icon badge with cyan glow, eyebrow `AI TRADE BRIEF`, headline H2, supporting paragraph with colored emphasis (`#86EFAC` for positive trends, `#FCA5A5` for negative), three bullet rows (icon + colored ring + text), and two ghost CTAs at the bottom (`Run Outreach`, `Read Brief`).
- **`ActivityCard`** — "What Matters Now" table. Header row on `#FAFBFC`, monospaced shipment counts, country-flag pairs for the top lane, change pill (green/red), `Enrich →` text-button.
- **`OpportunityCard`** — "High-Opportunity Companies" table. Adds a purple "Signal" pill (`#F5F3FF` bg, `#6D28D9` text, `#DDD6FE` border) and a `+ Campaign` primary button per row.
- **`TimelineCard`** — "Recent Changes". Vertical 1px thread (`#F1F5F9`) connects ringed icon dots. Each row: icon in colored ring (`color + '55'` border, `color + '10'` outer halo), text, timestamp.

**Globe** (`src/Globe.jsx`):
- Canvas-based, D3 v7 orthographic projection + TopoJSON world atlas (loaded from `cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json`).
- **Visuals:** deep ocean radial gradient (`#3B72C7 → #1E4F9C → #0E2F66`), warm sage land (`#A8B88A`), 20° graticule, atmospheric halo (rgba blue), 1px white edge ring. Highlighted countries fill solid `#3B82F6`.
- **Interaction:** auto-spins (0.1°/frame) when no lane is selected; on selection, smoothly tweens (0.035 lerp) to center the lane's midpoint and stops spinning.
- **Route arc:** 8px blue glow base + 2.5px amber dashed line (`#FBBF24`, dash `[8,4]`, animated dashOffset).
- **Endpoints:** amber pulse ring + 5px filled dot with white stroke.
- **Flag pins:** HTML overlay div, both endpoints **always shown**. Visible-side endpoint = full dark-glass pill with flag emoji + country code + connector down to the dot. Backside endpoint = projected to the visible rim with muted blue background, slight emoji desaturation, and a `↻` indicator.

### 2. Company Profile (`src/CompanyDetailPage.jsx` + `src/cdp/*`)

**Purpose:** Deep-dive on one saved company — trade intelligence, contacts, AI research, and activity history.

**Layout:**

```
┌──────────────────────────────────────────────────────────┐
│ CDPHeader:  breadcrumb · ID · updated-time               │
│             logo · H1 name · status pills · meta line    │
│             chip row · action cluster                    │
│             KPI strip (6 cells, same DNA as Dashboard)   │
├──────────────────────────────────────────────────────────┤
│ Tab bar: Supply Chain · Contacts · AI Research · Activity│
├──────────────────────────────┬───────────────────────────┤
│ Tab content (flex: 1, scroll)│ CDPDetailsPanel           │
│                              │ width: 300px              │
│                              │ collapsible, toggleable   │
└──────────────────────────────┴───────────────────────────┘
```

**Tabs:**

- **Supply Chain** (`CDPSupplyChain.jsx`) — Sub-tabs (Summary / Trade Lanes / Service Providers / Shipments / Products) in a segmented pill control. Premium dark "What matters now" strategic brief card. Lane bars, forwarder mix table, modal split, recent shipments, supplier list.
- **Contacts** (`CDPContacts.jsx`) — List ⇄ card view toggle. Search input, department filter chips. Each contact: avatar, name, title, verification badge (verified/unverified), source label (LinkedIn, ZoomInfo, manual), inline outreach + enrich actions.
- **AI Research** (`CDPResearch.jsx`) — Numbered intelligence brief sections (Exec Summary, Trade Snapshot, Lanes, Opportunity Signals, Risk Lanes, Outreach Hook). Sticky outline on the left, supporting data sidebar on the right, confidence score badge.
- **Activity** (`CDPActivity.jsx`) — Connected vertical timeline of CRM events + 30-day stats card + inline note composer.

**`CDPDetailsPanel`** (right rail) — Four collapsible sections:
- **Account Details** — owner avatar, last activity, CRM stage, imports-to country, coverage pills (BOL / AMS / Customs).
- **Lists & Campaigns** — list pills + campaign pills.
- **Firmographics** — website, phone, HQ, industry, headcount, revenue, founded.
- **Trade Intelligence** — top lane (accent), top carrier, top mode, last shipment, volume signal pill.
- Footer: dashed "Refresh enrichment" button.

---

## Interactions & Behavior

- **Globe lane selection** — Click a lane in the list → globe rotates to center the lane (smooth lerp, ~600ms feel) and stops spinning. Click the same lane again to deselect → globe resumes spinning.
- **Tab switches** (Company Profile) — instant; lucide icons re-rendered via `lucide.createIcons()` on tab change.
- **Right panel toggle** (Company Profile) — header icon button collapses/restores the 300px detail rail.
- **Star toggle** — header star icon toggles starred state (color: `#F59E0B` filled vs `#CBD5E1` outline).
- **Hover states** — table rows fade to `#FAFBFC`; icon buttons darken border to `#CBD5E1` and bg to `#F8FAFC`.
- **Tweens** — globe rotation is 0.035 linear-interpolation lerp per frame (not CSS — Canvas tick).
- **Live indicators** — green pulsing dot, "Live" / "Synced N min ago" labels are visual only in the mock; wire to your real freshness signal.

---

## State Management

- **Dashboard** — `selectedLane: string | null` (the selected lane id like `'cn-us'`).
- **Company Profile** — `tab: 'supply'|'contacts'|'research'|'activity'`, `starred: boolean`, `panelOpen: boolean`. Sub-tabs inside Supply Chain hold their own `sub` state.
- **Globe** — heavy use of refs (`stateRef`, `lanesRef`, `selectedRef`) so the animation tick can read latest props without restarting the loop. World data is fetched once, cached in `stateRef.world`.

Replace all of these with your codebase's preferred state management (Zustand, Redux, React Query for server state, etc.). The local UI state is fine to keep as `useState`.

---

## Design Tokens

### Colors

```
Surface:
  bg-app           #F8FAFC
  surface-card     #FFFFFF
  surface-subtle   #FAFBFC
  border           #E5E7EB
  border-subtle    #F1F5F9

Text:
  ink              #0F172A
  body             #475569
  muted            #64748B
  faint            #94A3B8
  ghost            #CBD5E1

Brand / accent:
  blue-500         #3B82F6   primary actions, highlights
  blue-600         #2563EB   gradient bottom
  blue-700         #1d4ed8   text on light blue surfaces
  blue-50          #EFF6FF   accent bg
  blue-100         #DBEAFE   accent border
  blue-200         #BFDBFE   accent border (stronger)

Status:
  green-700  #15803D / bg rgba(34,197,94,0.1) / dot #22C55E
  red-700    #B91C1C / bg rgba(239,68,68,0.1)
  amber-700  #B45309 / accent #F59E0B
  purple-700 #6D28D9 / bg #F5F3FF / border #DDD6FE

Dark accent surface (Strategic Brief):
  gradient: linear-gradient(135deg,#0B1736 0%,#0F1D38 60%,#102240 100%)
  border:   #1E293B
  cyan glow:#00F0FF (radial accent, 18% opacity)
  text-on-dark primary:   #F8FAFC
  text-on-dark body:      #CBD5E1 / #E2E8F0
  positive trend on dark: #86EFAC
  negative trend on dark: #FCA5A5

Globe:
  ocean gradient: #3B72C7 → #1E4F9C → #0E2F66
  land:           #A8B88A  (border rgba(60,80,40,0.35) @ 0.4px)
  highlight fill: #3B82F6
  graticule:      rgba(255,255,255,0.06)
  edge ring:      rgba(255,255,255,0.22)
  halo:           rgba(96,165,250, 0.35→0.10→0)
  arc glow:       rgba(96,165,250,0.35), 8px
  arc dash:       #FBBF24, 2.5px, [8,4]
  endpoint dot:   #FBBF24 fill, #fff stroke 2px
  pulse ring:     rgba(251,191,36,α)
```

### Typography

```
Display / titles:   Space Grotesk, 600/700, -0.01em to -0.025em letter-spacing
Body / UI:          DM Sans, 400/500/600
Numbers / IDs:      JetBrains Mono, 500/600/700, -0.01em
Eyebrows / labels:  Space Grotesk, 700, 0.06–0.14em letter-spacing, uppercase

Sizes used:
  H1                  22–24px
  Card title          13–14px
  Body                12–13px
  Helper / sub        11–12px
  Eyebrow / KPI label 9–10px
  KPI value           16–22px (mono)
```

### Spacing & Geometry

```
Page padding         18–24px
Card padding         12–18px
Card radius          12–14px
Button radius        7–8px
Pill radius          9999
Card border          1px solid #E5E7EB
Card shadow (light)  0 1px 2px rgba(15,23,42,0.03)
Card shadow (lifted) 0 8px 30px rgba(15,23,42,0.06)
Primary btn shadow   0 1px 3px rgba(59,130,246,0.35), inset 0 1px 0 rgba(255,255,255,0.18)
Grid gap (cards)     16px
Grid gap (within)    6–10px
```

### Whitespace / wrap rules (important)

To prevent the layout breaks we hit during design, **apply `white-space: nowrap` to**:
- All tab labels (top-level + sub-tab pills)
- KPI strip labels and values
- Right-panel section headers
- Section card titles
- Lane chips and country names
- Trend pills, change pills, signal pills

Header H1 should ellipsis-truncate (`overflow:hidden; text-overflow:ellipsis; white-space:nowrap`) with `title` attribute for full text.

---

## Assets

- **Country flags** — Unicode emoji (🇨🇳, 🇺🇸, 🇮🇳, etc). Mapping in `Globe.jsx#GLOBE_FLAGS` and `Dashboard.jsx#FLAGS`. If your codebase prefers SVG flags, swap for `flag-icons`, `country-flag-icons`, or similar — keep the same country names as keys.
- **Company logos** — fetched via `https://logo.clearbit.com/{domain}` with a colored-initial fallback. Replace with your existing logo-resolution service if you have one.
- **World atlas** — `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json` (TopoJSON). Cache or self-host in production.
- **Icons** — `lucide` UMD in the reference. Use `lucide-react` (`npm i lucide-react`) in production; icon names match exactly (`workflow`, `users`, `sparkles`, `activity`, `trending-up`, `ship`, `package`, `dollar-sign`, `bell`, `filter`, `download`, `search`, `send`, `arrow-left`, `arrow-right`, `external-link`, `map-pin`, `globe`, `building-2`, `folder-plus`, `more-horizontal`, `panel-right-close`, `panel-right-open`, `chevron-up`, `chevron-down`, `clock`, `briefcase`, `target`, `layers`, `phone`, `calendar`, `truck`, `bar-chart-2`, `refresh-cw`, `play`, `file-text`, `zap`, `alert-circle`, `plus-circle`, `sliders-horizontal`).
- **Fonts** — Google Fonts: Space Grotesk, DM Sans, JetBrains Mono.

---

## External Dependencies

```
react              ^18.3.1
react-dom          ^18.3.1
d3                 ^7        (used by the Globe — orthographic projection, geoPath, geoDistance, geoGraticule)
topojson-client    ^3        (decodes the world-atlas TopoJSON)
lucide-react       latest    (icons; replace `<i data-lucide=...>` with `<IconName />`)
```

You can run the prototype as-is (UMDs are loaded from CDN in `index.html`). For production, install via npm and import normally.

---

## Files in this bundle

```
design_handoff_dashboard_and_company_profile/
├── README.md                       ← this file
├── index.html                      ← live preview (Dashboard + Profile toggle)
└── src/
    ├── Dashboard.jsx               ← Dashboard screen (header, globe card, brief, tables, timeline)
    ├── Globe.jsx                   ← interactive 3D globe + flag pin overlay
    ├── CompanyDetailPage.jsx       ← Company Profile shell (tabs + right panel toggle)
    └── cdp/
        ├── CDPHeader.jsx           ← compact identity header + 6-cell KPI strip
        ├── CDPDetailsPanel.jsx     ← right-rail collapsible sections
        ├── CDPSupplyChain.jsx      ← Supply Chain tab (sub-tabs + brief + lane bars)
        ├── CDPContacts.jsx         ← Contacts tab (list / card / filters)
        ├── CDPResearch.jsx         ← AI Research intelligence brief
        └── CDPActivity.jsx         ← Activity timeline + note composer
```

To preview locally: open `index.html` in a browser (or serve with `python3 -m http.server` from the bundle root). Toggle between Dashboard and Company Profile with the buttons at the top.

---

## Implementation checklist

- [ ] Choose a styling layer (Tailwind / CSS Modules / styled-components / vanilla-extract). Replace all `style={{...}}` inlines.
- [ ] Move all hex values into your theme tokens.
- [ ] Extract `SectionCard`, `HeaderIconBtn`, `Pill`, `LaneInline`, `CompanyAvatar`, `Flag` into shared primitives.
- [ ] Replace lucide UMD with `lucide-react`.
- [ ] Wire `Dashboard` to your `dashboard_summary` endpoint — keep KPI labels and field semantics aligned with current API.
- [ ] Wire `CompanyDetailPage` to your `companies/:id` endpoint and per-tab data loaders.
- [ ] Replace `MOCK_*` constants with real data hooks.
- [ ] Confirm globe lane data shape matches existing `top_lanes` API: `{id, from, to, coords:[[lon,lat],[lon,lat]], shipments, teu, trend, up}`.
- [ ] Add SSR/hydration guard around the Globe (it touches `window.devicePixelRatio` and uses `requestAnimationFrame`).
- [ ] Self-host the TopoJSON world atlas.
- [ ] Add accessibility passes: keyboard nav for tabs, aria-selected on active tab, aria-expanded on collapsible sections, focus rings on icon buttons, alt text on logos.
- [ ] QA wrap behavior at 1280–1440px widths (the most common laptop viewports).
